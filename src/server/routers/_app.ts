/**
 * Root tRPC Router
 *
 * This file combines all sub-routers into the main app router.
 * Add new routers here as you migrate more API routes.
 */

import { router } from '../trpc';
import { ttsRouter } from './tts';

/**
 * Main application router
 * Contains all sub-routers for different domains
 */
export const appRouter = router({
  tts: ttsRouter,
  // Add more routers as you migrate:
  // github: githubRouter,
  // auth: authRouter,
  // etc.
});

// Export type definition for client
export type AppRouter = typeof appRouter;
