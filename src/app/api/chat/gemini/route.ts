/**
 * Gemini API Chat Endpoint
 *
 * Proxies chat requests to Google's Gemini API with function calling support.
 * Uses streaming for responsive UI.
 *
 * Tools are imported from panel packages and converted to Gemini format.
 * - Layout tools from @principal-ade/utcp-panel-event (server-safe)
 * - GitHub tools from @industry-theme/github-panels
 * - App-specific tools defined inline (including state query tools)
 */

import { NextRequest } from 'next/server';
import {
  layoutTools,
  toolsToGeminiFormat,
  generateToolsSystemPrompt,
} from '@principal-ade/utcp-panel-event';
// Import from /tools subpath to avoid pulling in React components
import { githubTools } from '@industry-theme/github-panels/tools';

// Types for Gemini API
interface GeminiMessage {
  role: 'user' | 'model';
  parts: Array<{ text: string } | { functionCall: FunctionCall } | { functionResponse: FunctionResponse }>;
}

interface FunctionCall {
  name: string;
  args: Record<string, unknown>;
}

interface FunctionResponse {
  name: string;
  response: Record<string, unknown>;
}

interface GeminiTool {
  functionDeclarations: Array<{
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, unknown>;
      required: string[];
    };
  }>;
}

interface ChatRequest {
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  tools?: GeminiTool[];
  markdownFiles?: Array<{ path: string; title?: string }>;
}

// App-specific tools (host-provided, not from panel packages)
const APP_SPECIFIC_TOOLS: GeminiTool['functionDeclarations'] = [
  {
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
  {
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
  {
    name: 'get_visible_panels',
    description: 'Get the current visibility state of all panel slots (left, middle, right). Returns which panels are active in each slot and whether side panels are collapsed. Use this to understand the current layout before making changes.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

// Convert tools from panel packages to Gemini format
const geminiLayoutTools = toolsToGeminiFormat(layoutTools);
const geminiGitHubTools = toolsToGeminiFormat(githubTools);

// Merge all tools into a single declaration
const GEMINI_TOOLS: GeminiTool = {
  functionDeclarations: [
    ...APP_SPECIFIC_TOOLS,
    ...geminiLayoutTools.functionDeclarations,
    ...geminiGitHubTools.functionDeclarations,
  ],
};

// Generate system prompts for tool documentation
const layoutToolsPrompt = generateToolsSystemPrompt(layoutTools, {
  header: '', // No header - we provide our own section header
});
const githubToolsPrompt = generateToolsSystemPrompt(githubTools, {
  header: '', // No header - we provide our own section header
});

// Build system instruction with file context
function buildSystemInstruction(markdownFiles?: Array<{ path: string; title?: string }>): string {
  let instruction = `You are a helpful AI assistant integrated into a code documentation viewer.

You have access to tools that let you interact with the application:

## App-Specific Tools
- read_file: Read file contents to analyze and answer questions
- open_file: Open a file in the viewer for the user to see
- get_visible_panels: Query current panel layout to see which panels are visible and their collapsed state

## Layout Tools
${layoutToolsPrompt}

## GitHub Tools
${githubToolsPrompt}

Available panels you can switch to: docs, ai-chat, markdown-viewer, code-city, kanban, terminal, sessions, visual-validation, github-projects, github-search.

When a user asks about file contents, use read_file to get the content and then answer based on it.
When a user wants to view a file, use open_file to display it.
When a user wants more space or to hide/show panels, use the layout tools.
When a user wants to see different content in a panel slot, use switch_panel.
When a user asks about their repositories or wants to switch repos, use the GitHub tools.
When a user asks which panels are visible or what the current layout is, use get_visible_panels.

Be helpful and concise. Use your tools proactively when needed.`;

  if (markdownFiles && markdownFiles.length > 0) {
    const fileList = markdownFiles
      .map((f) => `- ${f.path}${f.title ? ` (${f.title})` : ''}`)
      .join('\n');

    instruction += `

## Available Documentation Files

The following markdown files are available in this repository:
${fileList}

You can use read_file and open_file on any of these files.`;
  }

  return instruction;
}

// Convert our message format to Gemini format
function convertToGeminiMessages(messages: ChatRequest['messages']): GeminiMessage[] {
  return messages
    .filter(m => m.role !== 'system') // System messages handled separately
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GOOGLE_AI_API_KEY;

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'GOOGLE_AI_API_KEY not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { messages, markdownFiles } = await req.json() as ChatRequest;

    const systemInstruction = buildSystemInstruction(markdownFiles);
    const geminiMessages = convertToGeminiMessages(messages);

    // Use gemini-2.5-flash - fast with thinking capabilities and good function calling
    const model = 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: systemInstruction }],
        },
        contents: geminiMessages,
        tools: [GEMINI_TOOLS],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Gemini API request failed', details: errorText }),
        { status: response.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Stream the response back
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        const reader = response.body?.getReader();
        if (!reader) {
          controller.close();
          return;
        }

        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Process SSE events
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // Keep incomplete line in buffer

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const jsonStr = line.slice(6);
                if (jsonStr === '[DONE]') continue;

                try {
                  const data = JSON.parse(jsonStr);
                  const candidate = data.candidates?.[0];

                  if (candidate?.content?.parts) {
                    for (const part of candidate.content.parts) {
                      if (part.text) {
                        // Send text chunk
                        controller.enqueue(
                          encoder.encode(`data: ${JSON.stringify({ type: 'text', content: part.text })}\n\n`)
                        );
                      } else if (part.functionCall) {
                        // Send function call
                        controller.enqueue(
                          encoder.encode(`data: ${JSON.stringify({
                            type: 'function_call',
                            name: part.functionCall.name,
                            args: part.functionCall.args,
                          })}\n\n`)
                        );
                      }
                    }
                  }

                  if (candidate?.finishReason) {
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ type: 'done', finishReason: candidate.finishReason })}\n\n`)
                    );
                  }
                } catch (e) {
                  console.error('Failed to parse Gemini SSE:', e, jsonStr);
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Gemini chat error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to process chat request' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
