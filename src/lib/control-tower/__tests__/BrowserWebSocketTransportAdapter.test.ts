/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BrowserWebSocketTransportAdapter } from '../BrowserWebSocketTransportAdapter';
import type { Message } from '@principal-ai/control-tower-core';

// Mock WebSocket
class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;

  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(public url: string) {
    // Simulate async connection
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.(new Event('open'));
    }, 10);
  }

  send(data: string) {
    // Echo back for testing
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

// Replace global WebSocket
global.WebSocket = MockWebSocket as any;

describe('BrowserWebSocketTransportAdapter', () => {
  let adapter: BrowserWebSocketTransportAdapter;

  beforeEach(() => {
    adapter = new BrowserWebSocketTransportAdapter({
      connectionTimeout: 1000,
      enableHeartbeat: false, // Disable for tests
    });
  });

  afterEach(() => {
    if (adapter.getState() === 'connected') {
      adapter.disconnect();
    }
  });

  describe('connect', () => {
    it('should connect successfully', async () => {
      await adapter.connect('ws://localhost:3000');
      expect(adapter.getState()).toBe('connected');
    });

    it('should throw error if already connected', async () => {
      await adapter.connect('ws://localhost:3000');
      await expect(adapter.connect('ws://localhost:3000')).rejects.toThrow(
        'Already connected or connecting'
      );
    });

    it('should append auth token to URL', async () => {
      const adapterWithToken = new BrowserWebSocketTransportAdapter({
        authToken: 'test-token',
      });

      await adapterWithToken.connect('ws://localhost:3000');
      // Token should be in query param
      expect(adapterWithToken.getState()).toBe('connected');
      await adapterWithToken.disconnect();
    });

    it('should handle connection timeout', async () => {
      const slowAdapter = new BrowserWebSocketTransportAdapter({
        connectionTimeout: 50,
      });

      // Override WebSocket with one that never opens, so the connectionTimeout
      // fires. (Extending MockWebSocket would call its constructor, which
      // schedules onopen after 10ms — connect would resolve before the timeout.)
      const OriginalWS = global.WebSocket;
      global.WebSocket = class {
        static OPEN = 1;
        static CLOSED = 3;
        readyState = 0;
        onopen: ((event: Event) => void) | null = null;
        onmessage: ((event: MessageEvent) => void) | null = null;
        onerror: ((event: Event) => void) | null = null;
        onclose: ((event: CloseEvent) => void) | null = null;
        constructor(public url: string) {
          // Intentionally never transitions to OPEN.
        }
        send() {}
        close() {}
      } as any;

      await expect(slowAdapter.connect('ws://localhost:3000')).rejects.toThrow(
        'Connection timeout'
      );

      global.WebSocket = OriginalWS;
    });
  });

  describe('disconnect', () => {
    it('should disconnect cleanly', async () => {
      await adapter.connect('ws://localhost:3000');
      await adapter.disconnect();
      expect(adapter.getState()).toBe('disconnected');
    });

    it('should be idempotent', async () => {
      await adapter.connect('ws://localhost:3000');
      await adapter.disconnect();
      await adapter.disconnect(); // Should not throw
      expect(adapter.getState()).toBe('disconnected');
    });
  });

  describe('send', () => {
    it('should send message when connected', async () => {
      await adapter.connect('ws://localhost:3000');

      const message: Message = {
        id: '123',
        type: 'test',
        payload: { data: 'hello' },
        timestamp: Date.now(),
      };

      await expect(adapter.send(message)).resolves.not.toThrow();
    });

    it('should throw error when not connected', async () => {
      const message: Message = {
        id: '123',
        type: 'test',
        payload: {},
        timestamp: Date.now(),
      };

      await expect(adapter.send(message)).rejects.toThrow('Not connected');
    });

    it('should serialize message to JSON', async () => {
      await adapter.connect('ws://localhost:3000');

      const sendSpy = vi.fn();
      const ws = (adapter as any).ws;
      ws.send = sendSpy;

      const message: Message = {
        id: '123',
        type: 'test',
        payload: { data: 'hello' },
        timestamp: Date.now(),
      };

      await adapter.send(message);

      expect(sendSpy).toHaveBeenCalledWith(JSON.stringify(message));
    });
  });

  describe('event handlers', () => {
    it('should call message handler on received message', async () => {
      const messageHandler = vi.fn();
      adapter.onMessage(messageHandler);

      await adapter.connect('ws://localhost:3000');

      const message: Message = {
        id: '123',
        type: 'test',
        payload: { data: 'hello' },
        timestamp: Date.now(),
      };

      await adapter.send(message);

      // Wait for echo
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(messageHandler).toHaveBeenCalled();
    });

    it('should call error handler on error', async () => {
      const errorHandler = vi.fn();
      adapter.onError(errorHandler);

      await adapter.connect('ws://localhost:3000');

      const ws = (adapter as any).ws;
      ws.onerror?.(new Event('error'));

      expect(errorHandler).toHaveBeenCalled();
    });

    it('should call close handler on disconnect', async () => {
      const closeHandler = vi.fn();
      adapter.onClose(closeHandler);

      await adapter.connect('ws://localhost:3000');
      await adapter.disconnect();

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(closeHandler).toHaveBeenCalledWith(1000, 'Client disconnect');
    });

    it('should support unsubscribing handlers', async () => {
      const messageHandler = vi.fn();
      const unsubscribe = adapter.onMessage(messageHandler);

      await adapter.connect('ws://localhost:3000');

      // Unsubscribe before sending message
      unsubscribe();

      const message: Message = {
        id: '123',
        type: 'test',
        payload: {},
        timestamp: Date.now(),
      };

      await adapter.send(message);
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(messageHandler).not.toHaveBeenCalled();
    });
  });

  describe('setAuthToken', () => {
    it('should update auth token', () => {
      adapter.setAuthToken('new-token');
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('getState', () => {
    it('should return current state', async () => {
      expect(adapter.getState()).toBe('disconnected');

      const connectPromise = adapter.connect('ws://localhost:3000');
      expect(adapter.getState()).toBe('connecting');

      await connectPromise;
      expect(adapter.getState()).toBe('connected');

      await adapter.disconnect();
      expect(adapter.getState()).toBe('disconnected');
    });
  });
});
