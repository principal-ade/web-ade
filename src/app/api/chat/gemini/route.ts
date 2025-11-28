/**
 * Gemini API Chat Endpoint
 *
 * Proxies chat requests to Google's Gemini API with function calling support.
 * Uses streaming for responsive UI.
 */

import { NextRequest } from 'next/server';

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
      properties: Record<string, { type: string; description: string }>;
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

// Tool definitions for Gemini
const GEMINI_TOOLS: GeminiTool = {
  functionDeclarations: [
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
      name: 'toggle_panel',
      description: 'Collapse or expand a side panel to give more space to the main content area.',
      parameters: {
        type: 'object',
        properties: {
          panel: {
            type: 'string',
            description: 'Which panel to toggle: "left" or "right"',
          },
        },
        required: ['panel'],
      },
    },
    {
      name: 'collapse_all_panels',
      description: 'Collapse both left and right panels to maximize the main content area.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    {
      name: 'expand_all_panels',
      description: 'Expand both left and right panels to show all content.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    {
      name: 'switch_panel',
      description: 'Change which content is displayed in a panel slot. Available panels: docs, ai-chat, markdown-viewer, code-city, kanban, sessions, visual-validation, github-projects.',
      parameters: {
        type: 'object',
        properties: {
          slot: {
            type: 'string',
            description: 'Which slot to change: "left", "middle", or "right"',
          },
          panel: {
            type: 'string',
            description: 'Which panel to show: docs, ai-chat, markdown-viewer, code-city, kanban, sessions, visual-validation, or github-projects',
          },
        },
        required: ['slot', 'panel'],
      },
    },
  ],
};

// Build system instruction with file context
function buildSystemInstruction(markdownFiles?: Array<{ path: string; title?: string }>): string {
  let instruction = `You are a helpful AI assistant integrated into a code documentation viewer.

You have access to tools that let you interact with the application:
- read_file: Read file contents to analyze and answer questions
- open_file: Open a file in the viewer for the user to see
- toggle_panel: Collapse or expand the left or right panel
- collapse_all_panels: Collapse both panels to maximize the main content
- expand_all_panels: Expand both panels to show all content
- switch_panel: Change what's displayed in a panel slot (left/middle/right)

Available panels you can switch to: docs, ai-chat, markdown-viewer, code-city, kanban, sessions, visual-validation, github-projects.

When a user asks about file contents, use read_file to get the content and then answer based on it.
When a user wants to view a file, use open_file to display it.
When a user wants more space or to hide/show panels, use the panel tools.
When a user wants to see different content in a panel slot, use switch_panel.

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

    // Use gemini-2.0-flash - fast and cheap with good function calling
    const model = 'gemini-2.0-flash';
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
