/**
 * GitHub Router
 *
 * Handles GitHub API operations with proper typing and error handling.
 * Migrated from /api/github/* routes for type safety.
 */

import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { cookies } from 'next/headers';

const GITHUB_API_BASE = 'https://api.github.com';

// ============================================================================
// Input Schemas
// ============================================================================

const readFileInputSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  path: z.string().min(1),
  ref: z.string().optional(),
});

// ============================================================================
// Output Schemas
// ============================================================================

const readFileOutputSchema = z.object({
  content: z.string(),
  sha: z.string(),
  size: z.number(),
  encoding: z.string(),
});

// ============================================================================
// Helpers
// ============================================================================

async function getGitHubToken(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get('github_token')?.value || null;
  } catch {
    return null;
  }
}

async function makeGitHubRequest<T>(
  endpoint: string,
  userToken?: string | null
): Promise<T> {
  const token = userToken || process.env.GITHUB_TOKEN || null;

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'CodeCity-App/1.0',
  };

  if (token) {
    headers['Authorization'] = `token ${token}`;
  }

  const response = await fetch(`${GITHUB_API_BASE}${endpoint}`, { headers });

  if (!response.ok) {
    if (response.status === 404) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `GitHub resource not found: ${endpoint}`,
      });
    }
    if (response.status === 401) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'GitHub authentication failed',
      });
    }
    if (response.status === 403) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'GitHub rate limit exceeded or access denied',
      });
    }
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `GitHub API error: ${response.status} ${response.statusText}`,
    });
  }

  return response.json() as Promise<T>;
}

// ============================================================================
// Router Definition
// ============================================================================

export const githubRouter = router({
  /**
   * Read a file from a GitHub repository
   * Returns decoded content (handles base64 decoding automatically)
   */
  readFile: publicProcedure
    .input(readFileInputSchema)
    .output(readFileOutputSchema)
    .query(async ({ input }) => {
      const { owner, repo, path, ref } = input;

      const userToken = await getGitHubToken();

      // Build endpoint with optional ref
      let endpoint = `/repos/${owner}/${repo}/contents/${path}`;
      if (ref) {
        endpoint += `?ref=${encodeURIComponent(ref)}`;
      }

      interface GitHubFileResponse {
        content: string;
        encoding: string;
        sha: string;
        size: number;
      }

      const data = await makeGitHubRequest<GitHubFileResponse>(
        endpoint,
        userToken
      );

      // Decode base64 content
      let content = data.content;
      if (data.encoding === 'base64') {
        // Remove newlines that GitHub adds and decode
        content = Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf-8');
      }

      return {
        content,
        sha: data.sha,
        size: data.size,
        encoding: 'utf-8', // Always return decoded content
      };
    }),
});

export type GitHubRouter = typeof githubRouter;
