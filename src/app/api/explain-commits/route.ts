/**
 * Explain Commits API Endpoint
 *
 * Generates AI-powered explanations of commits for different audience levels.
 * Uses streaming for responsive UI.
 */

import { NextRequest } from 'next/server';

interface CommitData {
  sha: string;
  message: string;
  author: string;
  additions?: number;
  deletions?: number;
  filesChanged?: number;
}

interface ExplainRequest {
  commits: CommitData[];
  audienceLevel: 'maintainer' | 'non-technical';
  repoName: string;
}

function buildPrompt(commits: CommitData[], audienceLevel: string, repoName: string): string {
  const commitsSummary = commits.map((c, i) => {
    let summary = `${i + 1}. "${c.message}" by ${c.author}`;
    if (c.additions !== undefined || c.deletions !== undefined) {
      const parts = [];
      if (c.additions) parts.push(`+${c.additions}`);
      if (c.deletions) parts.push(`-${c.deletions}`);
      if (c.filesChanged) parts.push(`${c.filesChanged} files`);
      if (parts.length > 0) summary += ` (${parts.join(', ')})`;
    }
    return summary;
  }).join('\n');

  if (audienceLevel === 'maintainer') {
    return `Summarize these commits from ${repoName} for a technical maintainer.

COMMITS:
${commitsSummary}

Write a brief technical summary (under 200 words) covering:
- What changed (features, fixes, refactors)
- Architectural implications
- Things to watch out for

Start directly with the summary. No greetings.`;
  } else {
    return `Summarize these commits from ${repoName} for a non-technical person.

COMMITS:
${commitsSummary}

Write a simple, friendly summary (under 150 words) explaining:
- What improved or changed for users
- Any new features or bug fixes in plain language

Start directly with the summary. No greetings or preamble.`;
  }
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
    const { commits, audienceLevel, repoName } = await req.json() as ExplainRequest;

    if (!commits || commits.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No commits provided' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const prompt = buildPrompt(commits, audienceLevel, repoName);
    console.log('[explain-commits] Prompt:', prompt);

    // Use gemini-2.5-flash for fast responses
    const model = 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 512,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to generate explanation', details: errorText }),
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
            buffer = lines.pop() || '';

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
                        controller.enqueue(
                          encoder.encode(`data: ${JSON.stringify({ type: 'text', content: part.text })}\n\n`)
                        );
                      }
                    }
                  }

                  if (candidate?.finishReason) {
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
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
    console.error('Explain commits error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to process request' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
