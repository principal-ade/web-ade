/**
 * Test script for Gemini commit explanation API
 *
 * Usage: npx tsx scripts/test-gemini-commits.ts
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.local manually
function loadEnvFile(path: string): Record<string, string> {
  const env: Record<string, string> = {};
  try {
    const content = readFileSync(path, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match?.[1] && match[2] !== undefined) {
        const key = match[1].trim();
        let value = match[2].trim();
        // Remove quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        env[key] = value;
      }
    }
  } catch {
    // File doesn't exist
  }
  return env;
}

const envLocal = loadEnvFile(resolve(process.cwd(), '.env.local'));
const API_KEY = envLocal.GOOGLE_AI_API_KEY || process.env.GOOGLE_AI_API_KEY;

if (!API_KEY) {
  console.error('Error: GOOGLE_AI_API_KEY not found in .env.local');
  process.exit(1);
}

interface CommitData {
  sha: string;
  message: string;
  author: string;
  additions?: number;
  deletions?: number;
}

// Sample commits for testing
const sampleCommits: CommitData[] = [
  {
    sha: 'abc123',
    message: 'Add fork tour availability caching and loading',
    author: 'griever',
    additions: 150,
    deletions: 20,
  },
  {
    sha: 'def456',
    message: 'Update loading overlay to show Welcome To Principal AI',
    author: 'griever',
    additions: 45,
    deletions: 12,
  },
  {
    sha: 'ghi789',
    message: 'Add shareable URL query params for activity feed search',
    author: 'griever',
    additions: 89,
    deletions: 5,
  },
];

function buildPrompt(commits: CommitData[], audienceLevel: string, repoName: string): string {
  const commitsSummary = commits.map((c, i) => {
    let summary = `${i + 1}. "${c.message}" by ${c.author}`;
    if (c.additions !== undefined || c.deletions !== undefined) {
      const parts = [];
      if (c.additions) parts.push(`+${c.additions}`);
      if (c.deletions) parts.push(`-${c.deletions}`);
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

async function testGeminiAPI(audienceLevel: 'maintainer' | 'non-technical') {
  const repoName = 'principal-ai/web-ade';
  const prompt = buildPrompt(sampleCommits, audienceLevel, repoName);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${audienceLevel.toUpperCase()} audience`);
  console.log('='.repeat(60));
  console.log('\nPrompt:\n', prompt);
  console.log('\n--- Response (streaming) ---\n');

  const model = 'gemini-2.5-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${API_KEY}&alt=sse`;

  try {
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
      console.error('API Error:', response.status, errorText);
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      console.error('No response body');
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let fullResponse = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
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
                  process.stdout.write(part.text);
                  fullResponse += part.text;
                }
              }
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    }

    console.log('\n\n--- End of response ---');
    console.log(`Total characters: ${fullResponse.length}`);

  } catch (error) {
    console.error('Request failed:', error);
  }
}

async function main() {
  console.log('Gemini Commit Explanation Test');
  console.log('Model: gemini-2.5-flash-lite');
  console.log(`Commits: ${sampleCommits.length}`);

  // Test both audience levels
  await testGeminiAPI('maintainer');
  await testGeminiAPI('non-technical');

  console.log('\n\nAll tests complete!');
}

main();
