import type { ITransportAdapter } from '@principal-ai/control-tower-core/abstractions';
import type {
  ConnectionState,
  ConnectionOptions,
  Message,
  MessageHandler,
  ErrorHandler,
  CloseHandler,
} from '@principal-ai/control-tower-core/types';

export interface BrowserWebSocketConfig {
  /**
   * Connection timeout in milliseconds
   * @default 30000
   */
  connectionTimeout?: number;

  /**
   * Enable automatic ping/pong for connection health checks
   * @default true
   */
  enableHeartbeat?: boolean;

  /**
   * Heartbeat interval in milliseconds
   * @default 30000
   */
  heartbeatInterval?: number;

  /**
   * Authorization token for WebSocket connection
   */
  authToken?: string;
}

/**
 * Browser-compatible WebSocket transport adapter using native WebSocket API
 *
 * This adapter is designed for use in browser environments (Next.js, React, etc.)
 * and uses the native browser WebSocket API instead of the 'ws' npm package.
 */
export class BrowserWebSocketTransportAdapter implements ITransportAdapter {
  private ws?: WebSocket; // Native browser WebSocket
  private state: ConnectionState = 'disconnected';
  private messageHandlers: Set<MessageHandler> = new Set();
  private errorHandlers: Set<ErrorHandler> = new Set();
  private closeHandlers: Set<CloseHandler> = new Set();
  private config: Omit<Required<BrowserWebSocketConfig>, 'authToken'> & { authToken?: string };
  private heartbeatTimer?: number; // Browser uses number for setTimeout
  private connectionTimer?: number;
  private authToken?: string;

  constructor(config?: BrowserWebSocketConfig) {
    this.config = {
      connectionTimeout: config?.connectionTimeout ?? 30000,
      enableHeartbeat: config?.enableHeartbeat ?? true,
      heartbeatInterval: config?.heartbeatInterval ?? 30000,
      authToken: config?.authToken,
    };
    this.authToken = config?.authToken;
  }

  /**
   * Set authentication token for WebSocket connection
   * Note: Browser WebSocket doesn't support custom headers directly,
   * so we'll send auth token in first message after connection
   */
  setAuthToken(token: string): void {
    this.authToken = token;
  }

   
  async connect(url: string, _options?: ConnectionOptions): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') {
      throw new Error('Already connected or connecting');
    }

    this.state = 'connecting';

    return new Promise<void>((resolve, reject) => {
      try {
        // For browser WebSocket, we append auth token as query param if needed
        // This is a workaround since browser WebSocket doesn't support custom headers
        const wsUrl = this.authToken
          ? `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(this.authToken)}`
          : url;

        // Create native browser WebSocket
        this.ws = new WebSocket(wsUrl);

        // Set up connection timeout
        this.connectionTimer = window.setTimeout(() => {
          if (this.state === 'connecting') {
            this.ws?.close();
            this.state = 'disconnected';
            const error = new Error('Connection timeout');
            this.errorHandlers.forEach(handler => handler(error));
            reject(error);
          }
        }, this.config.connectionTimeout);

        // Handle connection open
        this.ws.onopen = () => {
          if (this.connectionTimer) {
            clearTimeout(this.connectionTimer);
            this.connectionTimer = undefined;
          }

          this.state = 'connected';

          // Start heartbeat if enabled
          if (this.config.enableHeartbeat) {
            this.startHeartbeat();
          }

          resolve();
        };

        // Handle incoming messages
        this.ws.onmessage = (event: MessageEvent) => {
          try {
            const message = JSON.parse(event.data) as Message;
            this.messageHandlers.forEach(handler => handler(message));
          } catch (error) {
            const err = new Error(`Failed to parse message: ${error}`);
            this.errorHandlers.forEach(handler => handler(err));
          }
        };

        // Handle errors
         
        this.ws.onerror = (_event: Event) => {
          const error = new Error('WebSocket error occurred');
          this.errorHandlers.forEach(handler => handler(error));

          if (this.state === 'connecting') {
            reject(error);
          }
        };

        // Handle connection close
        this.ws.onclose = (event: CloseEvent) => {
          this.stopHeartbeat();

          const wasConnecting = this.state === 'connecting';
          this.state = 'disconnected';

          this.closeHandlers.forEach(handler =>
            handler(event.code, event.reason || 'Connection closed')
          );

          if (wasConnecting) {
            reject(new Error(`Connection closed: ${event.reason}`));
          }
        };
      } catch (error) {
        this.state = 'disconnected';
        reject(error);
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.state === 'disconnected') {
      return;
    }

    this.state = 'disconnecting';
    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = undefined;
    }

    this.state = 'disconnected';
  }

  async send(message: Message): Promise<void> {
    if (this.state !== 'connected' || !this.ws) {
      throw new Error('Not connected');
    }

    if (this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }

    try {
      const payload = JSON.stringify(message);
      this.ws.send(payload);
    } catch (error) {
      throw new Error(`Failed to send message: ${error}`);
    }
  }

  getState(): ConnectionState {
    return this.state;
  }

  isConnected(): boolean {
    return this.state === 'connected';
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onError(handler: ErrorHandler): () => void {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  onClose(handler: CloseHandler): () => void {
    this.closeHandlers.add(handler);
    return () => this.closeHandlers.delete(handler);
  }

  // Private methods

  private startHeartbeat(): void {
    this.stopHeartbeat(); // Clear any existing timer

    this.heartbeatTimer = window.setInterval(() => {
      if (this.state === 'connected' && this.ws?.readyState === WebSocket.OPEN) {
        // Send heartbeat message to keep presence activity updated
        const heartbeatMessage: Message = {
          id: this.generateId(),
          type: 'heartbeat',
          payload: { timestamp: Date.now() },
          timestamp: Date.now(),
        };

        this.send(heartbeatMessage).catch(error => {
          console.error('Failed to send heartbeat:', error);
        });
      }
    }, this.config.heartbeatInterval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
}
