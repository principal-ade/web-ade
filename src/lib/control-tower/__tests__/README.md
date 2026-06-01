# Control Tower Browser Client Tests

## Overview

Comprehensive test suite for the browser-compatible Control Tower Core client implementation.

## Test Coverage

### BrowserWebSocketTransportAdapter (89% coverage)

**File**: `BrowserWebSocketTransportAdapter.test.ts`

Tests cover:
- ✅ Connection establishment
- ✅ Connection timeout handling
- ✅ Auth token appending to URL
- ✅ Message sending/receiving
- ✅ Disconnection handling
- ✅ Event handler registration/unregistration
- ✅ State management
- ✅ Error handling

**Key Test Cases**:
- Should connect successfully
- Should throw error if already connected
- Should append auth token to URL
- Should handle connection timeout
- Should disconnect cleanly
- Should send message when connected
- Should serialize message to JSON
- Should call message handler on received message
- Should support unsubscribing handlers

### JWTAuthAdapter (100% coverage)

**File**: `JWTAuthAdapter.test.ts`

Tests cover:
- ✅ Token storage and retrieval
- ✅ Authentication flow
- ✅ JWT token decoding
- ✅ Token validation
- ✅ Error handling for invalid tokens
- ✅ URL-safe base64 decoding

**Key Test Cases**:
- Should create adapter with token
- Should return success with token
- Should ignore credentials parameter
- Should decode valid JWT token
- Should throw error for invalid token format
- Should decode token with special characters
- Should return supported credential types

## Running Tests

### Run all unit tests
```bash
npm test
```

### Run tests in watch mode
```bash
npm run test:watch
```

### Run tests with UI
```bash
npm run test:ui
```

### Run tests with coverage
```bash
npm run test:coverage
```

### Run specific test file
```bash
npx vitest run src/lib/control-tower/__tests__/BrowserWebSocketTransportAdapter.test.ts
```

## Test Structure

```
src/lib/
├── control-tower/
│   ├── __tests__/
│   │   ├── BrowserWebSocketTransportAdapter.test.ts
│   │   ├── JWTAuthAdapter.test.ts
│   │   └── README.md (this file)
│   ├── BrowserWebSocketTransportAdapter.ts
│   ├── JWTAuthAdapter.ts
│   └── useControlTowerClient.ts
```

## Mocking Strategy

### WebSocket Mock

The tests use a custom `MockWebSocket` class that simulates browser WebSocket behavior:

```typescript
class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;

  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(public url: string) {
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.(new Event('open'));
    }, 10);
  }

  send(data: string) {
    setTimeout(() => {
      this.onmessage?.(new MessageEvent('message', { data }));
    }, 10);
  }

  close(code?: number, reason?: string) {
    this.readyState = MockWebSocket.CLOSED;
    setTimeout(() => {
      this.onclose?.(new CloseEvent('close', { code: code || 1000, reason: reason || '' }));
    }, 10);
  }
}
```

## Code Coverage Goals

| Module | Target | Current | Status |
|--------|--------|---------|--------|
| BrowserWebSocketTransportAdapter | 90% | 89% | ✅ |
| JWTAuthAdapter | 95% | 100% | ✅ |
| useControlTowerClient | 80% | N/A* | 🔄 |

*React hooks require integration tests with React Testing Library

## Adding New Tests

### 1. Create test file

```typescript
// __tests__/MyComponent.test.ts
import { describe, it, expect } from 'vitest';
import { MyComponent } from '../MyComponent';

describe('MyComponent', () => {
  it('should do something', () => {
    const result = MyComponent.doSomething();
    expect(result).toBe('expected');
  });
});
```

### 2. Run the test

```bash
npm run test:watch
```

### 3. Check coverage

```bash
npm run test:coverage
```

## Best Practices

1. **Use descriptive test names**: Test names should clearly describe what is being tested
2. **Follow AAA pattern**: Arrange, Act, Assert
3. **Mock external dependencies**: Use mocks for WebSocket, timers, etc.
4. **Test edge cases**: Include tests for error conditions, timeouts, etc.
5. **Keep tests isolated**: Each test should be independent
6. **Clean up after tests**: Use `beforeEach`/`afterEach` for setup/teardown
7. **Use type safety**: Import types from the actual modules

## Continuous Integration

Tests are automatically run on:
- Every pull request
- Every commit to main branch
- Before deployment

Minimum coverage threshold: 80%

## Troubleshooting

### Tests timing out

Increase the timeout in vitest.config.ts:

```typescript
test: {
  testTimeout: 10000, // 10 seconds
}
```

### Mock not working

Ensure mocks are defined before imports:

```typescript
vi.mock('@principal-ai/control-tower-core');
import { BaseClient } from '@principal-ai/control-tower-core';
```

### Async tests failing

Use `await` or return promises:

```typescript
it('should connect', async () => {
  await adapter.connect('ws://localhost:3000');
  expect(adapter.getState()).toBe('connected');
});
```

## References

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library](https://testing-library.com/)
- [Control Tower Core Tests](../../../../messaging-server/control-tower-core/src/__tests__/)
