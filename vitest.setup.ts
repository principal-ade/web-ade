import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Cleanup after each test case (React Testing Library)
afterEach(() => {
  cleanup();
});

// Mock window.setTimeout and window.setInterval to use numbers instead of NodeJS.Timeout
global.setTimeout = vi.fn(((cb: Function, ms: number) => {
  return setTimeout(cb as any, ms) as unknown as number;
}) as any);

global.setInterval = vi.fn(((cb: Function, ms: number) => {
  return setInterval(cb as any, ms) as unknown as number;
}) as any);

// Extend expect with custom matchers if needed
// expect.extend({ ... });
