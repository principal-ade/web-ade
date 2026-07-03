/**
 * tRPC Server Configuration
 *
 * This file sets up the core tRPC infrastructure including:
 * - Context creation (request context available to all procedures)
 * - tRPC instance initialization
 * - Base procedures (public, protected)
 */

import { initTRPC } from '@trpc/server';
import { ZodError } from 'zod';

/**
 * Context available to all tRPC procedures
 * Add auth, db connections, etc. here
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface TRPCContext {
  // Add context properties as needed
  // e.g., session, db, etc.
}

/**
 * Creates the context for each tRPC request
 * Called for every request - keep it lightweight
 */
export const createTRPCContext = async (): Promise<TRPCContext> => {
  return {
    // Add context values here
  };
};

/**
 * Initialize tRPC
 * Should only be done once per application
 */
const t = initTRPC.context<TRPCContext>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

/**
 * Export reusable router and procedure helpers
 */
export const router = t.router;
export const publicProcedure = t.procedure;
