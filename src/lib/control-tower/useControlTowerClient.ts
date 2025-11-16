'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { BaseClient, ClientBuilder, type ClientEvents } from '@principal-ai/control-tower-core/client';
import type { Event, RoomState } from '@principal-ai/control-tower-core/types';
import { BrowserWebSocketTransportAdapter } from './BrowserWebSocketTransportAdapter';
import { JWTAuthAdapter } from './JWTAuthAdapter';

export interface UseControlTowerClientOptions {
  /**
   * WebSocket server URL (e.g., 'wss://traffic-controller.example.com/ws')
   */
  serverUrl: string;

  /**
   * JWT access token for authentication
   */
  accessToken: string;

  /**
   * Room ID to join automatically on connection
   */
  roomId?: string;

  /**
   * Auto-connect on mount
   * @default true
   */
  autoConnect?: boolean;

  /**
   * Enable automatic reconnection
   * @default true
   */
  enableReconnection?: boolean;
}

export interface ControlTowerClientState {
  client: BaseClient | null;
  connected: boolean;
  roomId: string | null;
  roomState: RoomState | null;
  error: Error | null;
}

export function useControlTowerClient(options: UseControlTowerClientOptions) {
  const [state, setState] = useState<ControlTowerClientState>({
    client: null,
    connected: false,
    roomId: null,
    roomState: null,
    error: null,
  });

  const clientRef = useRef<BaseClient | null>(null);
  const eventHandlersRef = useRef<Map<keyof ClientEvents, Set<(data: ClientEvents[keyof ClientEvents]) => void>>>(
    new Map()
  );

  // Initialize client
  useEffect(() => {
    const authAdapter = new JWTAuthAdapter(options.accessToken);
    const transport = new BrowserWebSocketTransportAdapter({
      authToken: options.accessToken,
    });

    const client = new ClientBuilder()
      .withTransport(transport)
      .withAuth(authAdapter)
      .withReconnection({
        enabled: options.enableReconnection ?? true,
        maxAttempts: Infinity,
        initialDelay: 5000,
        maxDelay: 30000,
        backoffFactor: 1.5,
      })
      .build();

    clientRef.current = client;

    // Set up event listeners
    client.on('connected', ({ url }) => {
      console.log('[ControlTower] Connected to', url);
      setState(prev => ({ ...prev, connected: true, error: null }));
    });

    client.on('disconnected', ({ code, reason }) => {
      console.log('[ControlTower] Disconnected:', code, reason);
      setState(prev => ({ ...prev, connected: false }));
    });

    client.on('error', ({ error }) => {
      console.error('[ControlTower] Error:', error);
      setState(prev => ({ ...prev, error }));
    });

    client.on('room_joined', ({ roomId, state: roomState }) => {
      console.log('[ControlTower] Joined room:', roomId);
      setState(prev => ({ ...prev, roomId, roomState }));
    });

    client.on('room_left', ({ roomId }) => {
      console.log('[ControlTower] Left room:', roomId);
      setState(prev => ({ ...prev, roomId: null, roomState: null }));
    });

    client.on('presence_updated', ({ users }) => {
      console.log('[ControlTower] Presence updated:', users.length, 'users');
      setState(prev => {
        if (!prev.roomState) return prev;
        return {
          ...prev,
          roomState: {
            ...prev.roomState,
            users: new Map(users.map(u => [u.id, u])),
          },
        };
      });
    });

    setState(prev => ({ ...prev, client }));

    // Auto-connect if enabled
    if (options.autoConnect !== false) {
      client.connect(options.serverUrl).then(() => {
        // Auto-join room if specified
        if (options.roomId) {
          client.joinRoom(options.roomId);
        }
      }).catch(error => {
        console.error('[ControlTower] Connection failed:', error);
        setState(prev => ({ ...prev, error }));
      });
    }

    // Cleanup on unmount
    return () => {
      client.disconnect();
      clientRef.current = null;
    };
  }, [options.serverUrl, options.accessToken, options.roomId, options.autoConnect, options.enableReconnection]);

  // Event handler registration
  const on = useCallback(<K extends keyof ClientEvents>(
    event: K,
    handler: (data: ClientEvents[K]) => void
  ) => {
    const client = clientRef.current;
    if (!client) return () => {};

    if (!eventHandlersRef.current.has(event)) {
      eventHandlersRef.current.set(event, new Set());
    }
    eventHandlersRef.current.get(event)!.add(handler);

    const unsubscribe = client.on(event, handler);

    return () => {
      unsubscribe();
      eventHandlersRef.current.get(event)?.delete(handler);
    };
  }, []);

  // Convenience methods
  const broadcast = useCallback(async (event: Event) => {
    if (!clientRef.current) {
      throw new Error('Client not initialized');
    }
    await clientRef.current.broadcast(event);
  }, []);

  const joinRoom = useCallback(async (roomId: string) => {
    if (!clientRef.current) {
      throw new Error('Client not initialized');
    }
    await clientRef.current.joinRoom(roomId);
  }, []);

  const leaveRoom = useCallback(async () => {
    if (!clientRef.current) {
      throw new Error('Client not initialized');
    }
    await clientRef.current.leaveRoom();
  }, []);

  return {
    ...state,
    on,
    broadcast,
    joinRoom,
    leaveRoom,
  };
}
