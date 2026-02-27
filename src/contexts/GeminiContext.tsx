'use client';

/**
 * Gemini Context Provider
 *
 * Manages chat state for Gemini API with function calling support.
 * Functions are executed client-side, with results sent back to continue the conversation.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import type { PanelEventEmitter, PanelActions } from '@principal-ade/panel-framework-core';

// Message type for our chat interface
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

// Status type
export type GeminiStatus = 'idle' | 'ready' | 'generating' | 'error';

/** Markdown file info that can be provided to the AI */
export interface MarkdownFileInfo {
  path: string;
  title?: string;
}

/** Function to fetch file content */
export type FetchFileContent = (filePath: string) => Promise<string | null>;

/** GitHub repository info */
export interface GitHubRepoInfo {
  full_name: string;
  description?: string | null;
  language?: string | null;
  private?: boolean;
}

/** GitHub repositories data */
export interface GitHubReposData {
  owned: GitHubRepoInfo[];
  starred: GitHubRepoInfo[];
  organizations: Array<{
    login: string;
    repositories: GitHubRepoInfo[];
  }>;
}

/** Function to get repositories */
export type GetRepositories = () => GitHubReposData | null;

/** Current layout state for panel visibility queries */
export interface LayoutState {
  layout: {
    left: string;
    middle: string;
    right: string;
  };
  collapsed: {
    left: boolean;
    right: boolean;
  };
}

interface GeminiContextValue {
  // Status
  status: GeminiStatus;
  error: Error | null;

  // Chat state
  messages: ChatMessage[];
  isGenerating: boolean;

  // Actions
  sendMessage: (content: string) => Promise<void>;
  clearMessages: () => void;
  stopGeneration: () => void;
}

const GeminiContext = createContext<GeminiContextValue | null>(null);

interface GeminiProviderProps {
  children: ReactNode;
  events?: PanelEventEmitter;
  actions?: PanelActions;
  /** Markdown files available in the repository */
  markdownFiles?: MarkdownFileInfo[];
  /** Function to fetch file content for read_file function */
  fetchFileContent?: FetchFileContent;
  /** Function to get available repositories */
  getRepositories?: GetRepositories;
  /** Current layout state for panel visibility queries */
  layoutState?: LayoutState;
}

export function GeminiProvider({
  children,
  events,
  actions,
  markdownFiles,
  fetchFileContent,
  getRepositories,
  layoutState,
}: GeminiProviderProps) {
  const [status, setStatus] = useState<GeminiStatus>('ready');
  const [error, setError] = useState<Error | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  // Refs for cancellation
  const abortControllerRef = useRef<AbortController | null>(null);

  // Generate unique message ID
  const generateId = () => `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Execute a function call from Gemini
  const executeFunctionCall = useCallback(async (
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ result: string; displayText: string }> => {
    console.log('[Gemini] Executing function:', name, args);

    switch (name) {
      case 'read_file': {
        const path = (args.path as string)?.startsWith('/')
          ? (args.path as string).slice(1)
          : args.path as string;

        if (!path) {
          return {
            result: JSON.stringify({ error: 'No path provided' }),
            displayText: `> **Read file error:** No path provided\n\n`,
          };
        }

        if (!fetchFileContent) {
          return {
            result: JSON.stringify({ error: 'File reading not available' }),
            displayText: `> **Read file error:** File reading not configured\n\n`,
          };
        }

        try {
          const content = await fetchFileContent(path);
          if (content) {
            return {
              result: JSON.stringify({ success: true, content }),
              displayText: `> **Reading file:** \`${path}\`\n\n`,
            };
          } else {
            return {
              result: JSON.stringify({ error: 'File not found' }),
              displayText: `> **File not found:** \`${path}\`\n\n`,
            };
          }
        } catch (err) {
          return {
            result: JSON.stringify({ error: err instanceof Error ? err.message : 'Failed to read' }),
            displayText: `> **Read error:** \`${path}\`\n\n`,
          };
        }
      }

      case 'open_file': {
        const path = args.path as string;
        if (!path) {
          return {
            result: JSON.stringify({ error: 'No path provided' }),
            displayText: `> **Open file error:** No path provided\n\n`,
          };
        }

        if (actions?.openFile) {
          actions.openFile(path);
        }

        return {
          result: JSON.stringify({ success: true, opened: path }),
          displayText: `> **Opened file:** \`${path}\`\n\n`,
        };
      }

      case 'toggle_panel': {
        const panel = args.panel as string;
        if (!panel || (panel !== 'left' && panel !== 'right')) {
          return {
            result: JSON.stringify({ error: 'Invalid panel. Use "left" or "right"' }),
            displayText: `> **Toggle panel error:** Invalid panel\n\n`,
          };
        }

        // Use 'panel' in payload to match UTCP layout tool schema
        events?.emit({
          type: 'panel:toggle',
          source: 'gemini-assistant',
          timestamp: Date.now(),
          payload: { panel },
        });

        return {
          result: JSON.stringify({ success: true, toggled: panel }),
          displayText: `> **Toggled ${panel} panel**\n\n`,
        };
      }

      case 'collapse_all_panels': {
        events?.emit({
          type: 'panel:collapse-all',
          source: 'gemini-assistant',
          timestamp: Date.now(),
          payload: {},
        });

        return {
          result: JSON.stringify({ success: true, action: 'collapsed all panels' }),
          displayText: `> **Collapsed all panels**\n\n`,
        };
      }

      case 'expand_all_panels': {
        events?.emit({
          type: 'panel:expand-all',
          source: 'gemini-assistant',
          timestamp: Date.now(),
          payload: {},
        });

        return {
          result: JSON.stringify({ success: true, action: 'expanded all panels' }),
          displayText: `> **Expanded all panels**\n\n`,
        };
      }

      case 'switch_panel': {
        const slot = args.slot as string;
        const panel = args.panel as string;

        const validSlots = ['left', 'middle', 'right'];
        const validPanels = ['docs', 'ai-chat', 'markdown-viewer', 'file-city', 'kanban', 'terminal', 'sessions', 'visual-validation', 'canvas-editor', 'packages'];

        if (!slot || !validSlots.includes(slot)) {
          return {
            result: JSON.stringify({ error: 'Invalid slot. Use "left", "middle", or "right"' }),
            displayText: `> **Switch panel error:** Invalid slot\n\n`,
          };
        }

        if (!panel || !validPanels.includes(panel)) {
          return {
            result: JSON.stringify({ error: `Invalid panel. Available: ${validPanels.join(', ')}` }),
            displayText: `> **Switch panel error:** Invalid panel\n\n`,
          };
        }

        events?.emit({
          type: 'panel:switch',
          source: 'gemini-assistant',
          timestamp: Date.now(),
          payload: { slot, panel },
        });

        return {
          result: JSON.stringify({ success: true, slot, panel }),
          displayText: `> **Switched ${slot} panel to ${panel}**\n\n`,
        };
      }

      // GitHub tools - these emit events that panels/host handle
      case 'list_repositories': {
        if (!getRepositories) {
          return {
            result: JSON.stringify({ error: 'Repository listing not available' }),
            displayText: `> **List repositories error:** Not available\n\n`,
          };
        }

        const repos = getRepositories();
        if (!repos) {
          return {
            result: JSON.stringify({ error: 'No repositories data available. User may need to log in.' }),
            displayText: `> **List repositories:** No data available\n\n`,
          };
        }

        // Format repos for the AI
        const formatRepo = (r: GitHubRepoInfo) => ({
          name: r.full_name,
          description: r.description,
          language: r.language,
          private: r.private,
        });

        const result = {
          owned: repos.owned.map(formatRepo),
          starred: repos.starred.slice(0, 10).map(formatRepo), // Limit starred to 10
          organizations: repos.organizations.map(org => ({
            name: org.login,
            repositories: org.repositories.map(formatRepo),
          })),
        };

        const totalCount = repos.owned.length + repos.starred.length +
          repos.organizations.reduce((sum, org) => sum + org.repositories.length, 0);

        return {
          result: JSON.stringify(result),
          displayText: `> **Found ${totalCount} repositories**\n\n`,
        };
      }

      case 'select_repository': {
        const repository = args.repository as string;

        if (!repository || !repository.includes('/')) {
          return {
            result: JSON.stringify({ error: 'Invalid repository format. Use "owner/repo"' }),
            displayText: `> **Select repository error:** Invalid format\n\n`,
          };
        }

        // Navigate to the repository
        events?.emit({
          type: 'repository:selected',
          source: 'gemini-assistant',
          timestamp: Date.now(),
          payload: { repository: { full_name: repository } },
        });

        return {
          result: JSON.stringify({ success: true, repository }),
          displayText: `> **Selecting repository:** \`${repository}\`\n\n`,
        };
      }

      case 'preview_repository': {
        const repository = args.repository as string;

        if (!repository || !repository.includes('/')) {
          return {
            result: JSON.stringify({ error: 'Invalid repository format. Use "owner/repo"' }),
            displayText: `> **Preview repository error:** Invalid format\n\n`,
          };
        }

        const [owner, repo] = repository.split('/');
        events?.emit({
          type: 'repository:preview',
          source: 'gemini-assistant',
          timestamp: Date.now(),
          payload: { owner, repo },
        });

        return {
          result: JSON.stringify({ success: true, repository }),
          displayText: `> **Previewing repository:** \`${repository}\`\n\n`,
        };
      }

      case 'search_repositories': {
        const query = args.query as string;

        if (!query) {
          return {
            result: JSON.stringify({ error: 'No search query provided' }),
            displayText: `> **Search repositories error:** No query\n\n`,
          };
        }

        events?.emit({
          type: 'github:search-repositories',
          source: 'gemini-assistant',
          timestamp: Date.now(),
          payload: { query },
        });

        return {
          result: JSON.stringify({ success: true, query }),
          displayText: `> **Searching repositories for:** \`${query}\`\n\n`,
        };
      }

      case 'open_repository_switcher': {
        events?.emit({
          type: 'repository:open-switcher',
          source: 'gemini-assistant',
          timestamp: Date.now(),
          payload: {},
        });

        return {
          result: JSON.stringify({ success: true }),
          displayText: `> **Opening repository switcher**\n\n`,
        };
      }

      case 'request_github_login': {
        events?.emit({
          type: 'github:login-requested',
          source: 'gemini-assistant',
          timestamp: Date.now(),
          payload: {},
        });

        return {
          result: JSON.stringify({ success: true }),
          displayText: `> **Requesting GitHub login**\n\n`,
        };
      }

      // Layout state query tools
      case 'get_visible_panels': {
        if (!layoutState) {
          return {
            result: JSON.stringify({ error: 'Layout state not available' }),
            displayText: `> **Get visible panels error:** Layout state not available\n\n`,
          };
        }

        const visibilityState = {
          left: {
            panelId: layoutState.layout.left,
            collapsed: layoutState.collapsed.left,
          },
          middle: {
            panelId: layoutState.layout.middle,
          },
          right: {
            panelId: layoutState.layout.right,
            collapsed: layoutState.collapsed.right,
          },
        };

        return {
          result: JSON.stringify(visibilityState),
          displayText: `> **Current panel layout:**\n> - Left: ${layoutState.layout.left}${layoutState.collapsed.left ? ' (collapsed)' : ''}\n> - Middle: ${layoutState.layout.middle}\n> - Right: ${layoutState.layout.right}${layoutState.collapsed.right ? ' (collapsed)' : ''}\n\n`,
        };
      }

      default:
        return {
          result: JSON.stringify({ error: `Unknown function: ${name}` }),
          displayText: `> **Unknown function:** ${name}\n\n`,
        };
    }
  }, [actions, fetchFileContent, layoutState, events, getRepositories]);

  // Send a message to Gemini with function calling loop
  const sendMessage = useCallback(async (content: string) => {
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
    setError(null);

    // Create abort controller
    abortControllerRef.current = new AbortController();

    // Create assistant message placeholder
    const assistantMessage: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, assistantMessage]);

    let displayContent = '';
    let conversationMessages = [
      ...messages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content },
    ];

    const MAX_FUNCTION_ITERATIONS = 5;
    let iterations = 0;

    try {
      while (iterations < MAX_FUNCTION_ITERATIONS) {
        iterations++;

        const response = await fetch('/api/chat/gemini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: conversationMessages,
            markdownFiles,
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'API request failed');
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';
        let pendingFunctionCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
        let gotDone = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process SSE events
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.type === 'text') {
                  displayContent += data.content;
                  setMessages(prev =>
                    prev.map(m =>
                      m.id === assistantMessage.id
                        ? { ...m, content: displayContent }
                        : m
                    )
                  );
                } else if (data.type === 'function_call') {
                  pendingFunctionCalls.push({
                    name: data.name,
                    args: data.args,
                  });
                } else if (data.type === 'done') {
                  gotDone = true;
                }
              } catch {
                // Skip malformed JSON
              }
            }
          }
        }

        reader.releaseLock();

        // If there are function calls, execute them and continue
        if (pendingFunctionCalls.length > 0) {
          // Add assistant's response to conversation
          conversationMessages = [
            ...conversationMessages,
            { role: 'assistant' as const, content: displayContent || '(calling functions...)' },
          ];

          // Execute each function call
          for (const fc of pendingFunctionCalls) {
            const { result, displayText } = await executeFunctionCall(fc.name, fc.args);

            displayContent += displayText;
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantMessage.id
                  ? { ...m, content: displayContent }
                  : m
              )
            );

            // Add function result to conversation as a user message (Gemini format)
            conversationMessages = [
              ...conversationMessages,
              { role: 'user' as const, content: `Function ${fc.name} returned: ${result}` },
            ];
          }

          // Clear pending calls and continue loop
          pendingFunctionCalls = [];
          continue;
        }

        // No function calls and got done - we're finished
        if (gotDone) {
          break;
        }
      }

      events?.emit({
        type: 'gemini:message-complete',
        source: 'gemini-provider',
        timestamp: Date.now(),
        payload: { messageId: assistantMessage.id },
      });

    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('[Gemini] Request aborted');
      } else {
        console.error('[Gemini] Error:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));

        // Update message with error
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMessage.id
              ? { ...m, content: displayContent || `Error: ${err instanceof Error ? err.message : 'Request failed'}` }
              : m
          )
        );

        events?.emit({
          type: 'gemini:error',
          source: 'gemini-provider',
          timestamp: Date.now(),
          payload: { error: err instanceof Error ? err.message : 'Unknown error' },
        });
      }
    } finally {
      setIsGenerating(false);
      setStatus('ready');
      abortControllerRef.current = null;
    }
  }, [messages, markdownFiles, executeFunctionCall, events]);

  // Clear messages
  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);

    events?.emit({
      type: 'gemini:chat-cleared',
      source: 'gemini-provider',
      timestamp: Date.now(),
      payload: {},
    });
  }, [events]);

  // Stop generation
  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const value: GeminiContextValue = {
    status,
    error,
    messages,
    isGenerating,
    sendMessage,
    clearMessages,
    stopGeneration,
  };

  return (
    <GeminiContext.Provider value={value}>
      {children}
    </GeminiContext.Provider>
  );
}

export function useGemini() {
  const context = useContext(GeminiContext);
  if (!context) {
    throw new Error('useGemini must be used within GeminiProvider');
  }
  return context;
}
