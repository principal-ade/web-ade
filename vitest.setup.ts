import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { clearSpans } from './src/__tests__/otel-setup';

// Cleanup after each test case (React Testing Library)
afterEach(() => {
  cleanup();
  // Clear OTEL spans between tests to prevent cross-contamination
  clearSpans();
});

// Wrap the timer functions in spies that return numbers instead of
// NodeJS.Timeout. Capture the REAL implementations first: the previous version
// called the bare `setTimeout`/`setInterval` inside the override, which — after
// the global was reassigned to the spy — resolved back to the spy and recursed
// until the stack overflowed for any code that scheduled a timer.
const realSetTimeout = globalThis.setTimeout.bind(globalThis);
const realSetInterval = globalThis.setInterval.bind(globalThis);

global.setTimeout = vi.fn(((cb: () => void, ms?: number, ...args: unknown[]) => {
  return realSetTimeout(cb, ms, ...args) as unknown as number;
}) as typeof global.setTimeout);

global.setInterval = vi.fn(((cb: () => void, ms?: number, ...args: unknown[]) => {
  return realSetInterval(cb, ms, ...args) as unknown as number;
}) as typeof global.setInterval);

// Extend expect with custom matchers if needed
// expect.extend({ ... });
