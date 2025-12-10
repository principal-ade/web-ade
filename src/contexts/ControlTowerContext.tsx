'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { BaseClient, ClientBuilder } from '@principal-ai/control-tower-core/client';
import type { RoomState } from '@principal-ai/control-tower-core/types';
import { BrowserWebSocketTransportAdapter } from '@/lib/control-tower/BrowserWebSocketTransportAdapter';
import { JWTAuthAdapter } from '@/lib/control-tower/JWTAuthAdapter';
import { useAuth } from '@/contexts/AuthContext';
import { getTrafficControllerUrl, getWebSocketToken } from '@/lib/control-tower/config';

interface ControlTowerContextValue {
  /** The shared client instance */
  client: BaseClient | null;
  /** Whether connected to the server */
  connected: boolean;
  /** Current room ID */
  roomId: string | null;
  /** Current room state */
  roomState: RoomState | null;
  /** Any connection error */
  error: Error | null;
  /** Whether loading/connecting */
  loading: boolean;
  /** Join a specific room */
  joinRoom: (roomId: string) => Promise<void>;
  /** Leave current room */
  leaveRoom: () => Promise<void>;
}

const ControlTowerContext = createContext<ControlTowerContextValue | null>(null);

interface ControlTowerProviderProps {
  children: React.ReactNode;
  /** Repository to get token for (optional, defaults to global) */
  repository?: string;
}

/**
 * Provider that creates and manages a single shared Control Tower connection
 */
export function ControlTowerProvider({ children, repository }: ControlTowerProviderProps) {
  const { isAuthenticated, user } = useAuth();
  const [client, setClient] = useState<BaseClient | null>(null);
  const [connected, setConnected] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const clientRef = useRef<BaseClient | null>(null);
  const connectingRef = useRef(false);

  // Initialize client when authenticated
  useEffect(() => {
    if (!isAuthenticated || !user) {
      setLoading(false);
      return;
    }

    // Prevent multiple simultaneous connection attempts
    if (connectingRef.current) {
      return;
    }

    let cancelled = false;
    connectingRef.current = true;

    async function initializeClient() {
      try {
        setLoading(true);

        // Get token for the repository (or global)
        const repoForToken = repository || 'principal-ai/repository-traffic-controller';
        const token = await getWebSocketToken(repoForToken);

        if (cancelled) return;

        if (!token) {
          throw new Error('Failed to get room token');
        }

        // Create client
        const authAdapter = new JWTAuthAdapter(token);
        const transport = new BrowserWebSocketTransportAdapter({
          authToken: token,
        });

        const newClient = new ClientBuilder()
          .withTransport(transport)
          .withAuth(authAdapter)
          .withReconnection({
            enabled: true,
            maxAttempts: Infinity,
            initialDelay: 5000,
            maxDelay: 30000,
            backoffFactor: 1.5,
          })
          .build();

        // Set up event listeners
        newClient.on('connected', () => {
          console.log('[ControlTower] Connected');
          if (!cancelled) {
            setConnected(true);
            setError(null);
          }
        });

        newClient.on('disconnected', () => {
          console.log('[ControlTower] Disconnected');
          if (!cancelled) {
            setConnected(false);
          }
        });

        newClient.on('error', ({ error: err }) => {
          console.error('[ControlTower] Error:', err);
          if (!cancelled) {
            setError(err);
          }
        });

        newClient.on('room_joined', ({ roomId: joinedRoomId, state }) => {
          console.log('[ControlTower] Joined room:', joinedRoomId);
          if (!cancelled) {
            setRoomId(joinedRoomId);
            setRoomState(state);
          }
        });

        newClient.on('room_left', () => {
          console.log('[ControlTower] Left room');
          if (!cancelled) {
            setRoomId(null);
            setRoomState(null);
          }
        });

        // Connect
        const serverUrl = getTrafficControllerUrl();
        await newClient.connect(serverUrl);

        if (cancelled) {
          newClient.disconnect();
          return;
        }

        // Authenticate
        try {
          await newClient.authenticate();
          console.log('[ControlTower] Authenticated successfully');
        } catch (authError) {
          console.error('[ControlTower] Authentication failed:', authError);
        }

        clientRef.current = newClient;
        setClient(newClient);
        setLoading(false);
      } catch (err) {
        console.error('[ControlTower] Failed to initialize:', err);
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Failed to initialize'));
          setLoading(false);
        }
      } finally {
        connectingRef.current = false;
      }
    }

    void initializeClient();

    return () => {
      cancelled = true;
      if (clientRef.current) {
        clientRef.current.disconnect();
        clientRef.current = null;
      }
    };
  }, [isAuthenticated, user, repository]);

  // Join room method
  const joinRoom = useCallback(async (newRoomId: string) => {
    if (!clientRef.current) {
      throw new Error('Client not initialized');
    }
    // Don't rejoin if already in the room
    if (roomId === newRoomId) {
      return;
    }
    await clientRef.current.joinRoom(newRoomId);
  }, [roomId]);

  // Leave room method
  const leaveRoom = useCallback(async () => {
    if (!clientRef.current) {
      throw new Error('Client not initialized');
    }
    await clientRef.current.leaveRoom();
  }, []);

  const value: ControlTowerContextValue = {
    client,
    connected,
    roomId,
    roomState,
    error,
    loading,
    joinRoom,
    leaveRoom,
  };

  return (
    <ControlTowerContext.Provider value={value}>
      {children}
    </ControlTowerContext.Provider>
  );
}

/**
 * Hook to access the shared Control Tower connection
 */
export function useControlTower(): ControlTowerContextValue {
  const context = useContext(ControlTowerContext);
  if (!context) {
    throw new Error('useControlTower must be used within a ControlTowerProvider');
  }
  return context;
}
