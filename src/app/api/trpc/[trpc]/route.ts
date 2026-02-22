/**
 * tRPC HTTP Handler for Next.js App Router
 *
 * All tRPC requests are handled through this single endpoint.
 * The [trpc] dynamic segment captures the procedure path.
 */

import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from '@/server/routers/_app';
import { createTRPCContext } from '@/server/trpc';

/**
 * Configure CORS headers for tRPC requests
 */
function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

/**
 * Handle OPTIONS requests for CORS preflight
 */
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: getCorsHeaders(),
  });
}

/**
 * Handle GET requests (for queries)
 */
export async function GET(req: Request) {
  const response = await fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: createTRPCContext,
    onError({ error, path }) {
      console.error(`[tRPC] Error in ${path}:`, error);
    },
  });

  // Add CORS headers
  const headers = new Headers(response.headers);
  Object.entries(getCorsHeaders()).forEach(([key, value]) => {
    headers.set(key, value);
  });

  return new Response(response.body, {
    status: response.status,
    headers,
  });
}

/**
 * Handle POST requests (for mutations)
 */
export async function POST(req: Request) {
  const response = await fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: createTRPCContext,
    onError({ error, path }) {
      console.error(`[tRPC] Error in ${path}:`, error);
    },
  });

  // Add CORS headers
  const headers = new Headers(response.headers);
  Object.entries(getCorsHeaders()).forEach(([key, value]) => {
    headers.set(key, value);
  });

  return new Response(response.body, {
    status: response.status,
    headers,
  });
}
