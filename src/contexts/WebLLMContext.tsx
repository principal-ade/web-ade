'use client';

/**
 * WebLLM Context Provider
 *
 * Manages the web-llm engine lifecycle and provides chat functionality
 * that can interact with the panel system via events.
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

// Types for web-llm (we'll import these properly once web-llm is installed)
interface InitProgressReport {
  progress: number;
  timeElapsed: number;
  text: string;
}

interface ChatCompletionMessageParam {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface MLCEngineInterface {
  chat: {
    completions: {
      create: (params: {
        messages: ChatCompletionMessageParam[];
        stream?: boolean;
        temperature?: number;
        max_tokens?: number;
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
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

interface ChatCompletion {
  choices: Array<{
    message: {
      content: string;
      role: string;
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

// Available models (subset of web-llm prebuilt models)
export const AVAILABLE_MODELS = [
  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', name: 'Llama 3.2 1B', size: '1B' },
  { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', name: 'Llama 3.2 3B', size: '3B' },
  { id: 'Phi-3.5-mini-instruct-q4f16_1-MLC', name: 'Phi 3.5 Mini', size: '3.8B' },
  { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', name: 'Qwen 2.5 1.5B', size: '1.5B' },
  { id: 'SmolLM2-1.7B-Instruct-q4f16_1-MLC', name: 'SmolLM2 1.7B', size: '1.7B' },
] as const;

export type ModelId = typeof AVAILABLE_MODELS[number]['id'];

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

interface WebLLMProviderProps {
  children: ReactNode;
  events?: PanelEventEmitter;
  actions?: PanelActions;
  defaultModelId?: ModelId;
  systemPrompt?: string;
}

export function WebLLMProvider({
  children,
  events,
  actions,
  defaultModelId,
  systemPrompt = `You are a helpful AI assistant integrated into a code documentation viewer. You can help users understand code, answer questions about their repository, and assist with development tasks.

When you want to perform actions, you can include special commands in your response:
- To open a file: [ACTION:OPEN_FILE:/path/to/file.md]
- To navigate to a panel: [ACTION:NAVIGATE_PANEL:panel-id]
- To emit a custom event: [ACTION:EMIT_EVENT:event-type:payload-json]

Always be helpful, concise, and accurate.`,
}: WebLLMProviderProps) {
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

  // Parse and execute actions from model response
  const parseAndExecuteActions = useCallback((content: string) => {
    const actionRegex = /\[ACTION:(\w+):([^\]]+)\]/g;
    let match;

    while ((match = actionRegex.exec(content)) !== null) {
      const [, actionType, actionPayload] = match;

      if (!actionType || !actionPayload) continue;

      console.log('[WebLLM] Executing action:', actionType, actionPayload);

      switch (actionType) {
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

    // Return content with actions stripped for display
    return content.replace(actionRegex, '').trim();
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

  // Send message
  const sendMessage = useCallback(async (content: string) => {
    if (!engine || status !== 'ready') {
      console.warn('[WebLLM] Cannot send message - engine not ready');
      return;
    }

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
      // Build messages array with system prompt
      const chatMessages: ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content },
      ];

      // Create assistant message placeholder
      const assistantMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Stream the response
      const chunks = await engine.chat.completions.create({
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
            m.id === assistantMessage.id
              ? { ...m, content: fullResponse }
              : m
          )
        );
      }

      // Parse and execute any actions in the response
      const cleanedContent = parseAndExecuteActions(fullResponse);

      // Update with cleaned content (actions stripped)
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantMessage.id
            ? { ...m, content: cleanedContent }
            : m
        )
      );

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
  }, [engine, status, messages, systemPrompt, parseAndExecuteActions, events]);

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
