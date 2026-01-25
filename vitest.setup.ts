import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { clearSpans } from './src/__tests__/otel-setup';

// Cleanup after each test case (React Testing Library)
afterEach(() => {
  cleanup();
  // Clear OTEL spans between tests to prevent cross-contamination
  clearSpans();
});

// Mock window.setTimeout and window.setInterval to use numbers instead of NodeJS.Timeout
global.setTimeout = vi.fn(((cb: () => void, ms: number) => {
  return setTimeout(cb, ms) as unknown as number;
}) as typeof global.setTimeout);

global.setInterval = vi.fn(((cb: () => void, ms: number) => {
  return setInterval(cb, ms) as unknown as number;
}) as typeof global.setInterval);

// Extend expect with custom matchers if needed
// expect.extend({ ... });
