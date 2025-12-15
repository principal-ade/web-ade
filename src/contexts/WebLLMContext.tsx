'use client';

/**
 * WebLLM Context Provider
 *
 * Manages the web-llm engine lifecycle and provides chat functionality
 * that can interact with the panel system via events.
 *
 * Layout tools are imported from @principal-ade/panel-layouts and converted
 * to OpenAI function calling format. App-specific tools are defined inline.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  ReactNode,
} from 'react';
import type { PanelEventEmitter, PanelActions } from '@principal-ade/panel-framework-core';
import {
  layoutTools,
  toolsToOpenAIFormat,
  generateToolsSystemPrompt,
} from '@principal-ade/utcp-panel-event';

// Types for web-llm
interface InitProgressReport {
  progress: number;
  timeElapsed: number;
  text: string;
}

// Tool/Function calling types
interface ChatCompletionTool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

interface ChatCompletionMessageToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface ChatCompletionToolMessageParam {
  role: 'tool';
  content: string;
  tool_call_id: string;
}

type ChatCompletionMessageParam =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content?: string; tool_calls?: ChatCompletionMessageToolCall[] }
  | ChatCompletionToolMessageParam;

interface MLCEngineInterface {
  chat: {
    completions: {
      create: (params: {
        messages: ChatCompletionMessageParam[];
        stream?: boolean;
        temperature?: number;
        max_tokens?: number;
        tools?: ChatCompletionTool[];
        tool_choice?: 'none' | 'auto';
      }) => Promise<AsyncIterable<ChatCompletionChunk> | ChatCompletion>;
    };
  };
  getMessage: () => Promise<string>;
  resetChat: () => void;
}

interface ChatCompletionChunk {
  choices: Array<{
    delta: {
      content?: string;
      tool_calls?: ChatCompletionMessageToolCall[];
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

interface ChatCompletion {
  choices: Array<{
    message: {
      content?: string | null;
      role: string;
      tool_calls?: ChatCompletionMessageToolCall[];
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

// Message type for our chat interface
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

// Engine status
export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error' | 'generating';

// Model info with function calling support flag
interface ModelInfo {
  id: string;
  name: string;
  size: string;
  supportsFunctionCalling: boolean;
}

// Available models (subset of web-llm prebuilt models)
// NOTE: Native function calling in web-llm is experimental and may not work reliably.
// Setting supportsFunctionCalling to false for all models to use text-based actions.
// When web-llm function calling stabilizes, we can re-enable for Hermes models.
export const AVAILABLE_MODELS: ModelInfo[] = [
  // Larger models (Hermes - designed for function calling, but using text-based for now)
  { id: 'Hermes-3-Llama-3.1-8B-q4f16_1-MLC', name: 'Hermes 3 (Llama 3.1 8B)', size: '8B', supportsFunctionCalling: false },
  { id: 'Hermes-2-Pro-Llama-3-8B-q4f16_1-MLC', name: 'Hermes 2 Pro (Llama 3 8B)', size: '8B', supportsFunctionCalling: false },
  // Smaller models (text-based tool calling)
  { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', name: 'Llama 3.2 3B', size: '3B', supportsFunctionCalling: false },
  { id: 'Phi-3.5-mini-instruct-q4f16_1-MLC', name: 'Phi 3.5 Mini', size: '3.8B', supportsFunctionCalling: false },
  { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', name: 'Qwen 2.5 1.5B', size: '1.5B', supportsFunctionCalling: false },
  { id: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC', name: 'SmolLM2 1.7B', size: '1.7B', supportsFunctionCalling: false },
];

export type ModelId = string;

// App-specific tool definitions (not layout-related)
const APP_SPECIFIC_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file from the repository. Use this to analyze file contents and answer questions about them.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The path to the file to read (e.g., "README.md" or "docs/getting-started.md")',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_file',
      description: 'Open a file in the documentation viewer panel for the user to see.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The path to the file to open in the viewer',
          },
        },
        required: ['path'],
      },
    },
  },
];

// Convert layout tools from panel-layouts to OpenAI format and merge with app-specific tools
const openAILayoutTools = toolsToOpenAIFormat(layoutTools);
const TOOL_DEFINITIONS: ChatCompletionTool[] = [
  ...APP_SPECIFIC_TOOLS,
  ...openAILayoutTools.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters as Record<string, unknown>,
    },
  })),
];

// Generate layout tools system prompt from panel-layouts
const layoutToolsPrompt = generateToolsSystemPrompt(layoutTools, {
  header: '', // No header - we provide our own section header
});

// System prompt for function-calling models (simpler, no action syntax)
const FUNCTION_CALLING_SYSTEM_PROMPT = `You are a helpful AI assistant integrated into a code documentation viewer.

You have access to tools that let you interact with the application:

## App-Specific Tools
- read_file: Read file contents to analyze and answer questions
- open_file: Open a file in the viewer for the user to see

## Layout Tools
${layoutToolsPrompt}

Available panels you can switch to: docs, ai-chat, markdown-viewer, file-city, kanban, sessions, visual-validation, github-projects.

When a user asks about file contents, use read_file to get the content and then answer based on it.
When a user wants to view a file, use open_file to display it.
When a user wants more space or to hide/show panels, use the panel tools.

Be helpful and concise. Use your tools proactively when needed.`;

/** Build the system prompt for function-calling models with file context */
function buildFunctionCallingSystemPrompt(markdownFiles?: MarkdownFileInfo[]): string {
  let prompt = FUNCTION_CALLING_SYSTEM_PROMPT;

  if (markdownFiles && markdownFiles.length > 0) {
    const fileList = markdownFiles
      .map((f) => `- ${f.path}${f.title ? ` (${f.title})` : ''}`)
      .join('\n');

    prompt += `

## Available Documentation Files

The following markdown files are available in this repository:
${fileList}

You can use read_file and open_file on any of these files.`;
  }

  return prompt;
}

/** Get model info by ID */
function getModelInfo(modelId: string): ModelInfo | undefined {
  return AVAILABLE_MODELS.find(m => m.id === modelId);
}

interface WebLLMContextValue {
  // Engine state
  status: EngineStatus;
  loadProgress: number;
  loadProgressText: string;
  currentModelId: ModelId | null;
  error: Error | null;

  // Chat state
  messages: ChatMessage[];
  isGenerating: boolean;

  // Actions
  loadModel: (modelId: ModelId) => Promise<void>;
  unloadModel: () => void;
  sendMessage: (content: string) => Promise<void>;
  clearMessages: () => void;
  stopGeneration: () => void;

  // For direct access if needed
  engine: MLCEngineInterface | null;
}

const WebLLMContext = createContext<WebLLMContextValue | null>(null);

/** Markdown file info that can be provided to the AI */
export interface MarkdownFileInfo {
  path: string;
  title?: string;
}

/** Function to fetch file content */
export type FetchFileContent = (filePath: string) => Promise<string | null>;

interface WebLLMProviderProps {
  children: ReactNode;
  events?: PanelEventEmitter;
  actions?: PanelActions;
  defaultModelId?: ModelId;
  /** Markdown files available in the repository */
  markdownFiles?: MarkdownFileInfo[];
  /** Function to fetch file content for READ_FILE action */
  fetchFileContent?: FetchFileContent;
  /** Base system prompt (markdown files will be appended) */
  baseSystemPrompt?: string;
}

/** Build the full system prompt with markdown file context */
function buildSystemPrompt(basePrompt: string, markdownFiles?: MarkdownFileInfo[]): string {
  let prompt = basePrompt;

  if (markdownFiles && markdownFiles.length > 0) {
    const fileList = markdownFiles
      .map((f) => `- ${f.path}${f.title ? ` (${f.title})` : ''}`)
      .join('\n');

    prompt += `

## Available Documentation Files

The following markdown files are available in this repository:
${fileList}

You can use your READ_FILE and OPEN_FILE actions on any of these files.`;
  }

  return prompt;
}

const DEFAULT_BASE_PROMPT = `You are a helpful AI assistant integrated into a code documentation viewer. You have direct access to tools that let you interact with the application.

## Your Capabilities

You have REAL tools that execute immediately when you include them in your response. These are NOT hypothetical - they actually work:

### READ_FILE - Read file contents
Use this to read and analyze file contents. The content will be returned to you so you can answer questions about it.
Format: [ACTION:READ_FILE:/path/to/file.md]
Example: [ACTION:READ_FILE:README.md]

### OPEN_FILE - Open file in the viewer panel
Use this to open a file in the documentation viewer for the user to see.
Format: [ACTION:OPEN_FILE:/path/to/file.md]
Example: [ACTION:OPEN_FILE:docs/getting-started.md]

### NAVIGATE_PANEL - Switch to a different panel
Use this to change which panel is displayed.
Format: [ACTION:NAVIGATE_PANEL:panel-id]

## Important Notes

- When a user asks about file contents (e.g., "what's in the README?"), use READ_FILE to get the content, then summarize or quote from it.
- When a user wants to view a file themselves, use OPEN_FILE to display it in the viewer.
- You can use multiple actions in one response.
- Actions are executed automatically - do not tell users to run commands manually.
- Do not say "I cannot access files" - you CAN access files using READ_FILE.

Be helpful, concise, and use your tools proactively.`;

export function WebLLMProvider({
  children,
  events,
  actions,
  defaultModelId,
  markdownFiles,
  fetchFileContent,
  baseSystemPrompt = DEFAULT_BASE_PROMPT,
}: WebLLMProviderProps) {
  // Build the full system prompt with markdown context
  const systemPrompt = buildSystemPrompt(baseSystemPrompt, markdownFiles);
  // Engine state
  const [status, setStatus] = useState<EngineStatus>('idle');
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadProgressText, setLoadProgressText] = useState('');
  const [currentModelId, setCurrentModelId] = useState<ModelId | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [engine, setEngine] = useState<MLCEngineInterface | null>(null);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  // Refs for cancellation
  const abortControllerRef = useRef<AbortController | null>(null);
  const webllmModuleRef = useRef<typeof import('@mlc-ai/web-llm') | null>(null);

  // Generate unique message ID
  const generateId = () => `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Progress callback for model loading
  const handleInitProgress = useCallback((report: InitProgressReport) => {
    setLoadProgress(report.progress);
    setLoadProgressText(report.text);
  }, []);

  /** Result of parsing actions - includes files that need to be read */
  interface ActionParseResult {
    /** Content with actions converted to inline display format */
    displayContent: string;
    /** Files that need to be read */
    filesToRead: string[];
  }

  // Convert action tag to inline display format
  const formatActionForDisplay = (actionType: string, actionPayload: string): string => {
    switch (actionType) {
      case 'READ_FILE':
        return `\n\n> 📄 **Reading file:** \`${actionPayload}\`\n\n`;
      case 'OPEN_FILE':
        return `\n\n> 📂 **Opened file:** \`${actionPayload}\`\n\n`;
      case 'NAVIGATE_PANEL':
        return `\n\n> 🔀 **Navigated to:** \`${actionPayload}\`\n\n`;
      case 'EMIT_EVENT':
        return `\n\n> ⚡ **Event emitted:** \`${actionPayload}\`\n\n`;
      default:
        return `\n\n> 🔧 **Action:** \`${actionType}: ${actionPayload}\`\n\n`;
    }
  };

  // Execute a single tool call and return the result
  const executeToolCall = useCallback(async (
    toolCall: ChatCompletionMessageToolCall
  ): Promise<{ result: string; displayText: string }> => {
    const { name, arguments: argsStr } = toolCall.function;
    let args: Record<string, string>;

    try {
      args = JSON.parse(argsStr);
    } catch {
      return {
        result: 'Error: Invalid arguments',
        displayText: `> ❌ **Tool error:** Invalid arguments for ${name}\n\n`,
      };
    }

    console.log('[WebLLM] Executing tool:', name, args);

    switch (name) {
      case 'read_file': {
        const path = args.path?.startsWith('/') ? args.path.slice(1) : args.path;
        if (!path) {
          return {
            result: 'Error: No path provided',
            displayText: `> ❌ **Read file error:** No path provided\n\n`,
          };
        }

        if (!fetchFileContent) {
          return {
            result: 'Error: File reading not available',
            displayText: `> ❌ **Read file error:** File reading not configured\n\n`,
          };
        }

        try {
          const content = await fetchFileContent(path);
          if (content) {
            return {
              result: `File contents of ${path}:\n\n${content}`,
              displayText: `> 📄 **Reading file:** \`${path}\`\n\n`,
            };
          } else {
            return {
              result: `Error: File not found: ${path}`,
              displayText: `> ❌ **File not found:** \`${path}\`\n\n`,
            };
          }
        } catch (err) {
          return {
            result: `Error reading file: ${err instanceof Error ? err.message : 'Unknown error'}`,
            displayText: `> ❌ **Read error:** \`${path}\` - ${err instanceof Error ? err.message : 'Unknown error'}\n\n`,
          };
        }
      }

      case 'open_file': {
        const path = args.path;
        if (!path) {
          return {
            result: 'Error: No path provided',
            displayText: `> ❌ **Open file error:** No path provided\n\n`,
          };
        }

        if (actions?.openFile) {
          actions.openFile(path);
        }

        return {
          result: `Opened file: ${path}`,
          displayText: `> 📂 **Opened file:** \`${path}\`\n\n`,
        };
      }

      // Layout tools from panel-layouts (emit events)
      case 'toggle_panel': {
        const panel = args.panel;
        if (!panel || (panel !== 'left' && panel !== 'right')) {
          return {
            result: 'Error: Invalid panel. Use "left" or "right"',
            displayText: `> ❌ **Toggle panel error:** Invalid panel\n\n`,
          };
        }

        events?.emit({
          type: 'panel:toggle',
          source: 'webllm-assistant',
          timestamp: Date.now(),
          payload: { panel },
        });

        return {
          result: `Toggled ${panel} panel`,
          displayText: `> 🔀 **Toggled ${panel} panel**\n\n`,
        };
      }

      case 'collapse_all_panels': {
        events?.emit({
          type: 'panel:collapse-all',
          source: 'webllm-assistant',
          timestamp: Date.now(),
          payload: {},
        });

        return {
          result: 'Collapsed all panels',
          displayText: `> 🔀 **Collapsed all panels**\n\n`,
        };
      }

      case 'expand_all_panels': {
        events?.emit({
          type: 'panel:expand-all',
          source: 'webllm-assistant',
          timestamp: Date.now(),
          payload: {},
        });

        return {
          result: 'Expanded all panels',
          displayText: `> 🔀 **Expanded all panels**\n\n`,
        };
      }

      case 'switch_panel': {
        const { slot, panel } = args;
        if (!slot || !['left', 'middle', 'right'].includes(slot)) {
          return {
            result: 'Error: Invalid slot. Use "left", "middle", or "right"',
            displayText: `> ❌ **Switch panel error:** Invalid slot\n\n`,
          };
        }

        events?.emit({
          type: 'panel:switch',
          source: 'webllm-assistant',
          timestamp: Date.now(),
          payload: { slot, panel },
        });

        return {
          result: `Switched ${slot} panel to ${panel}`,
          displayText: `> 🔀 **Switched ${slot} panel to ${panel}**\n\n`,
        };
      }

      case 'focus_panel': {
        const { slot } = args;
        if (!slot || !['left', 'middle', 'right'].includes(slot)) {
          return {
            result: 'Error: Invalid slot. Use "left", "middle", or "right"',
            displayText: `> ❌ **Focus panel error:** Invalid slot\n\n`,
          };
        }

        events?.emit({
          type: 'panel:focus',
          source: 'webllm-assistant',
          timestamp: Date.now(),
          payload: { slot },
        });

        return {
          result: `Focused ${slot} panel`,
          displayText: `> 🎯 **Focused ${slot} panel**\n\n`,
        };
      }

      case 'reset_layout': {
        events?.emit({
          type: 'panel:reset-layout',
          source: 'webllm-assistant',
          timestamp: Date.now(),
          payload: {},
        });

        return {
          result: 'Reset layout to default',
          displayText: `> 🔄 **Reset layout to default**\n\n`,
        };
      }

      default:
        return {
          result: `Unknown tool: ${name}`,
          displayText: `> ❓ **Unknown tool:** ${name}\n\n`,
        };
    }
  }, [actions, events, fetchFileContent]);

  // Parse and execute actions from model response
  // Returns files that need to be read for follow-up
  const parseAndExecuteActions = useCallback((content: string): ActionParseResult => {
    const actionRegex = /\[ACTION:(\w+):([^\]]+)\]/g;
    let match;
    const filesToRead: string[] = [];
    let displayContent = content;

    // First pass: collect files to read and execute other actions
    while ((match = actionRegex.exec(content)) !== null) {
      const [, actionType, actionPayload] = match;

      if (!actionType || !actionPayload) continue;

      console.log('[WebLLM] Executing action:', actionType, actionPayload);

      switch (actionType) {
        case 'READ_FILE':
          // Collect files to read - we'll fetch them and continue the conversation
          filesToRead.push(actionPayload.startsWith('/') ? actionPayload.slice(1) : actionPayload);
          break;

        case 'OPEN_FILE':
          if (actions?.openFile) {
            actions.openFile(actionPayload);
          }
          break;

        case 'NAVIGATE_PANEL':
          if (actions?.navigateToPanel) {
            actions.navigateToPanel(actionPayload);
          }
          break;

        case 'EMIT_EVENT':
          if (events) {
            const parts = actionPayload.split(':');
            const eventType = parts[0];
            const payloadParts = parts.slice(1);
            if (!eventType) break;
            try {
              const payload = payloadParts.length > 0
                ? JSON.parse(payloadParts.join(':'))
                : {};
              events.emit({
                type: eventType,
                source: 'webllm-assistant',
                timestamp: Date.now(),
                payload,
              });
            } catch (e) {
              console.error('[WebLLM] Failed to parse event payload:', e);
            }
          }
          break;

        default:
          console.warn('[WebLLM] Unknown action type:', actionType);
      }
    }

    // Second pass: replace action tags with inline display format
    displayContent = content.replace(actionRegex, (_, actionType, actionPayload) => {
      return formatActionForDisplay(actionType, actionPayload);
    });

    // Clean up extra whitespace
    displayContent = displayContent.replace(/\n{3,}/g, '\n\n').trim();

    return {
      displayContent,
      filesToRead,
    };
  }, [actions, events]);

  // Load model
  const loadModel = useCallback(async (modelId: ModelId) => {
    try {
      setStatus('loading');
      setError(null);
      setLoadProgress(0);
      setLoadProgressText('Initializing...');

      // Dynamically import web-llm
      if (!webllmModuleRef.current) {
        webllmModuleRef.current = await import('@mlc-ai/web-llm');
      }
      const webllm = webllmModuleRef.current;

      console.log('[WebLLM] Loading model:', modelId);

      const newEngine = await webllm.CreateMLCEngine(modelId, {
        initProgressCallback: handleInitProgress,
      });

      setEngine(newEngine as unknown as MLCEngineInterface);
      setCurrentModelId(modelId);
      setStatus('ready');
      setLoadProgress(1);
      setLoadProgressText('Ready');

      console.log('[WebLLM] Model loaded successfully');

      // Emit event that model is ready
      events?.emit({
        type: 'webllm:model-loaded',
        source: 'webllm-provider',
        timestamp: Date.now(),
        payload: { modelId },
      });

    } catch (err) {
      console.error('[WebLLM] Failed to load model:', err);
      setError(err instanceof Error ? err : new Error('Failed to load model'));
      setStatus('error');

      events?.emit({
        type: 'webllm:model-error',
        source: 'webllm-provider',
        timestamp: Date.now(),
        payload: { error: err instanceof Error ? err.message : 'Unknown error' },
      });
    }
  }, [handleInitProgress, events]);

  // Unload model
  const unloadModel = useCallback(() => {
    if (engine) {
      // web-llm doesn't have explicit unload, but we can clear our reference
      setEngine(null);
      setCurrentModelId(null);
      setStatus('idle');
      setMessages([]);

      events?.emit({
        type: 'webllm:model-unloaded',
        source: 'webllm-provider',
        timestamp: Date.now(),
        payload: {},
      });
    }
  }, [engine, events]);

  // Helper to generate a streaming text response (for text-based tool calling)
  const generateTextResponse = useCallback(async (
    chatMessages: ChatCompletionMessageParam[],
    assistantMessageId: string,
  ): Promise<{ fullResponse: string; parseResult: ActionParseResult }> => {
    const chunks = await engine!.chat.completions.create({
      messages: chatMessages,
      stream: true,
      temperature: 0.7,
    });

    let fullResponse = '';

    // Handle streaming response
    for await (const chunk of chunks as AsyncIterable<ChatCompletionChunk>) {
      // Check for abort
      if (abortControllerRef.current?.signal.aborted) {
        console.log('[WebLLM] Generation aborted');
        break;
      }

      const delta = chunk.choices[0]?.delta?.content || '';
      fullResponse += delta;

      // Update message with accumulated content
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantMessageId
            ? { ...m, content: fullResponse }
            : m
        )
      );
    }

    // Parse and execute any actions in the response
    const parseResult = parseAndExecuteActions(fullResponse);

    return { fullResponse, parseResult };
  }, [engine, parseAndExecuteActions]);

  // Helper to generate a response with native function calling
  // Returns { success: true, content } on success, or { success: false } to indicate fallback needed
  const generateWithFunctionCalling = useCallback(async (
    chatMessages: ChatCompletionMessageParam[],
    assistantMessageId: string,
  ): Promise<{ success: boolean; content: string }> => {
    let displayContent = '';
    let iterations = 0;
    const MAX_TOOL_ITERATIONS = 5;

    try {
      while (iterations < MAX_TOOL_ITERATIONS) {
        iterations++;

        // Make non-streaming request to get tool calls
        const response = await engine!.chat.completions.create({
          messages: chatMessages,
          stream: false,
          temperature: 0.7,
          tools: TOOL_DEFINITIONS,
          tool_choice: 'auto',
        }) as ChatCompletion;

        const choice = response.choices[0];
        if (!choice) break;

        const assistantMessage = choice.message;
        const textContent = assistantMessage.content || '';
        const toolCalls = assistantMessage.tool_calls;

        // Add any text content to display
        if (textContent) {
          displayContent += textContent;
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantMessageId
                ? { ...m, content: displayContent }
                : m
            )
          );
        }

        // If no tool calls, we're done
        if (!toolCalls || toolCalls.length === 0) {
          break;
        }

        // Add assistant message with tool calls to conversation
        chatMessages = [
          ...chatMessages,
          { role: 'assistant', content: textContent || undefined, tool_calls: toolCalls },
        ];

        // Execute each tool call and collect results
        for (const toolCall of toolCalls) {
          console.log('[WebLLM] Tool call:', toolCall.function.name, toolCall.function.arguments);

          const { result, displayText } = await executeToolCall(toolCall);

          // Add display text to output
          displayContent += displayText;
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantMessageId
                ? { ...m, content: displayContent }
                : m
            )
          );

          // Add tool result to conversation
          chatMessages = [
            ...chatMessages,
            { role: 'tool', content: result, tool_call_id: toolCall.id },
          ];
        }

        // Check for abort
        if (abortControllerRef.current?.signal.aborted) {
          console.log('[WebLLM] Generation aborted');
          break;
        }
      }

      return { success: true, content: displayContent };
    } catch (err) {
      // Function calling failed - log error and signal fallback
      console.warn('[WebLLM] Function calling failed, will fall back to text-based:', err);
      return { success: false, content: displayContent };
    }
  }, [engine, executeToolCall]);

  // Send message
  const sendMessage = useCallback(async (content: string) => {
    if (!engine || status !== 'ready' || !currentModelId) {
      console.warn('[WebLLM] Cannot send message - engine not ready');
      return;
    }

    // Check if current model supports function calling
    const modelInfo = getModelInfo(currentModelId);
    const useNativeFunctionCalling = modelInfo?.supportsFunctionCalling ?? false;

    console.log('[WebLLM] Sending message with', useNativeFunctionCalling ? 'native function calling' : 'text-based actions');

    // Add user message
    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsGenerating(true);
    setStatus('generating');

    // Create abort controller for this generation
    abortControllerRef.current = new AbortController();

    try {
      // Create assistant message placeholder
      const assistantMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      };

      setMessages(prev => [...prev, assistantMessage]);

      let usedFunctionCalling = false;

      if (useNativeFunctionCalling) {
        // Try native function calling (Hermes models)
        const functionCallingSystemPrompt = buildFunctionCallingSystemPrompt(markdownFiles);

        const chatMessages: ChatCompletionMessageParam[] = [
          { role: 'system', content: functionCallingSystemPrompt },
          ...messages.map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content },
        ];

        const result = await generateWithFunctionCalling(chatMessages, assistantMessage.id);

        if (result.success) {
          usedFunctionCalling = true;
        } else {
          // Function calling failed, clear the partial content and fall back
          console.log('[WebLLM] Falling back to text-based actions');
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantMessage.id
                ? { ...m, content: '' }
                : m
            )
          );
        }
      }

      if (!usedFunctionCalling) {
        // Use text-based action parsing (smaller models)
        let chatMessages: ChatCompletionMessageParam[] = [
          { role: 'system', content: systemPrompt },
          ...messages.map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content },
        ];

        // Generate initial response
        let { fullResponse, parseResult } = await generateTextResponse(chatMessages, assistantMessage.id);

        // Handle READ_FILE actions - fetch files and continue conversation
        // Limit iterations to prevent infinite loops
        let iterations = 0;
        const MAX_READ_ITERATIONS = 3;

        while (parseResult.filesToRead.length > 0 && iterations < MAX_READ_ITERATIONS && fetchFileContent) {
          iterations++;
          console.log('[WebLLM] READ_FILE requested for:', parseResult.filesToRead);

          // Fetch all requested files
          const fileContents: string[] = [];
          for (const filePath of parseResult.filesToRead) {
            try {
              const fileContent = await fetchFileContent(filePath);
              if (fileContent) {
                fileContents.push(`## File: ${filePath}\n\n${fileContent}`);
              } else {
                fileContents.push(`## File: ${filePath}\n\n[Error: File not found or could not be read]`);
              }
            } catch (err) {
              console.error('[WebLLM] Failed to fetch file:', filePath, err);
              fileContents.push(`## File: ${filePath}\n\n[Error: ${err instanceof Error ? err.message : 'Failed to read file'}]`);
            }
          }

          // Add the file contents as a user message to the conversation
          // Note: WebLLM requires system messages to be first, so we use 'user' role here
          const fileContentMessage = `Here are the contents of the requested file(s):\n\n${fileContents.join('\n\n---\n\n')}\n\nNow please continue your response based on this content.`;

          // Update chat messages with the assistant's response and file content
          chatMessages = [
            ...chatMessages,
            { role: 'assistant', content: fullResponse },
            { role: 'user', content: fileContentMessage },
          ];

          // Append to the existing assistant message (add a newline to separate)
          const continuationResponse = await generateTextResponse(chatMessages, assistantMessage.id);

          // Combine responses
          fullResponse = fullResponse + '\n\n' + continuationResponse.fullResponse;
          parseResult = continuationResponse.parseResult;

          // Update the message with combined content
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantMessage.id
                ? { ...m, content: fullResponse }
                : m
            )
          );
        }

        // Update with display content (actions converted to inline format)
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMessage.id
              ? { ...m, content: parseResult.displayContent }
              : m
          )
        );
      }

      events?.emit({
        type: 'webllm:message-complete',
        source: 'webllm-provider',
        timestamp: Date.now(),
        payload: { messageId: assistantMessage.id },
      });

    } catch (err) {
      console.error('[WebLLM] Generation error:', err);

      // Add error message
      setMessages(prev => [
        ...prev,
        {
          id: generateId(),
          role: 'assistant',
          content: `Error: ${err instanceof Error ? err.message : 'Generation failed'}`,
          timestamp: Date.now(),
        },
      ]);

      events?.emit({
        type: 'webllm:generation-error',
        source: 'webllm-provider',
        timestamp: Date.now(),
        payload: { error: err instanceof Error ? err.message : 'Unknown error' },
      });

    } finally {
      setIsGenerating(false);
      setStatus('ready');
      abortControllerRef.current = null;
    }
  }, [engine, status, currentModelId, messages, markdownFiles, systemPrompt, generateTextResponse, generateWithFunctionCalling, fetchFileContent, events]);

  // Clear messages
  const clearMessages = useCallback(() => {
    setMessages([]);
    engine?.resetChat?.();

    events?.emit({
      type: 'webllm:chat-cleared',
      source: 'webllm-provider',
      timestamp: Date.now(),
      payload: {},
    });
  }, [engine, events]);

  // Stop generation
  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  // Auto-load default model if specified
  useEffect(() => {
    if (defaultModelId && status === 'idle') {
      loadModel(defaultModelId);
    }
  }, [defaultModelId, status, loadModel]);

  const value: WebLLMContextValue = {
    status,
    loadProgress,
    loadProgressText,
    currentModelId,
    error,
    messages,
    isGenerating,
    loadModel,
    unloadModel,
    sendMessage,
    clearMessages,
    stopGeneration,
    engine,
  };

  return (
    <WebLLMContext.Provider value={value}>
      {children}
    </WebLLMContext.Provider>
  );
}

export function useWebLLM() {
  const context = useContext(WebLLMContext);
  if (!context) {
    throw new Error('useWebLLM must be used within WebLLMProvider');
  }
  return context;
}
