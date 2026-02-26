/**
 * tRPC Client
 *
 * Provides type-safe API calls to tRPC procedures.
 * Use this client for imperative calls (in callbacks, event handlers, etc.)
 *
 * For React components, consider using @trpc/react-query hooks instead.
 */

import { createTRPCClient, httpLink } from '@trpc/client';
import type { AppRouter } from '@/server/routers/_app';

/**
 * Get the base URL for tRPC requests
 * Handles both server-side and client-side environments
 */
function getBaseUrl(): string {
  if (typeof window !== 'undefined') {
    // Browser: use relative URL
    return '';
  }

  // Server-side: use absolute URL
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }

  // Fallback for local development
  return 'http://localhost:3000';
}

/**
 * Vanilla tRPC client for imperative usage
 *
 * @example
 * ```typescript
 * // Instead of:
 * const response = await fetch('/api/tts/batch-generate', {
 *   method: 'POST',
 *   body: JSON.stringify({ owner, repo, path, commitSha }),
 * });
 * const data = await response.json();
 *
 * // Use:
 * const data = await trpc.tts.batchGenerate.mutate({ owner, repo, path, commitSha });
 * ```
 */
export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpLink({
      url: `${getBaseUrl()}/api/trpc`,
    }),
  ],
});

// Re-export types for convenience
export type { AppRouter };
