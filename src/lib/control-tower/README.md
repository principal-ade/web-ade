# Control Tower Browser Client

Browser-compatible implementation of the `@principal-ai/control-tower-core` client for web-ade.

## Overview

This library provides a browser-compatible WebSocket transport adapter and React hooks for using Control Tower Core in Next.js/React applications. It enables real-time communication with the repository-traffic-controller server and supports WebRTC signaling for peer-to-peer connections.

## Components

### BrowserWebSocketTransportAdapter

Browser-native WebSocket transport adapter that implements the `ITransportAdapter` interface.

**Key Features:**
- Native browser `WebSocket` API (no Node.js 'ws' package dependency)
- Automatic heartbeat/ping-pong
- Connection timeout handling
- JWT token authentication via query parameter

**Usage:**
```typescript
import { BrowserWebSocketTransportAdapter } from '@/lib/control-tower';

const transport = new BrowserWebSocketTransportAdapter({
  authToken: 'your-jwt-token',
  connectionTimeout: 30000,
  enableHeartbeat: true,
  heartbeatInterval: 30000,
});
```

### JWTAuthAdapter

Simple JWT authentication adapter for browser environments.

**Usage:**
```typescript
import { JWTAuthAdapter } from '@/lib/control-tower';

const authAdapter = new JWTAuthAdapter('your-jwt-token');
```

### useControlTowerClient Hook

React hook for managing Control Tower client lifecycle and state.

**Features:**
- Automatic connection/reconnection management
- Room joining/leaving
- Event broadcasting
- Presence tracking
- TypeScript type safety

**Usage:**
```typescript
import { useControlTowerClient } from '@/lib/control-tower';

function MyComponent() {
  const {
    client,
    connected,
    roomId,
    roomState,
    error,
    broadcast,
    joinRoom,
    leaveRoom,
    on,
  } = useControlTowerClient({
    serverUrl: 'wss://traffic-controller.example.com/ws',
    accessToken: 'your-jwt-token',
    roomId: 'my-room',
    autoConnect: true,
    enableReconnection: true,
  });

  // Listen for events
  useEffect(() => {
    const unsubscribe = on('event_received', ({ event }) => {
      console.log('Received event:', event);
    });

    return unsubscribe;
  }, [on]);

  // Broadcast events
  const handleBroadcast = async () => {
    await broadcast({
      type: 'cursor_position',
      data: { x: 100, y: 200 },
      timestamp: Date.now(),
    });
  };

  return (
    <div>
      <p>Status: {connected ? 'Connected' : 'Disconnected'}</p>
      <button onClick={handleBroadcast}>Send Event</button>
    </div>
  );
}
```

## Installation

1. Ensure `@principal-ai/control-tower-core` is installed:
```bash
npm install @principal-ai/control-tower-core
```

2. The browser adapters are already included in the web-ade codebase at `src/lib/control-tower/`.

## Environment Variables

Create a `.env.local` file with:

```bash
NEXT_PUBLIC_TRAFFIC_CONTROLLER_URL=wss://your-traffic-controller.com/ws
NEXT_PUBLIC_JWT_TOKEN=your-jwt-token-here
```

## Architecture

```
┌─────────────────────────────────────────┐
│         React Component                 │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  useControlTowerClient()          │  │
│  │  - Connection state               │  │
│  │  - Event handling                 │  │
│  │  - Room management                │  │
│  └───────────────────────────────────┘  │
│                  │                      │
└──────────────────┼──────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│  BaseClient (Control Tower Core)        │
│  - Event broadcasting                   │
│  - Reconnection logic                   │
│  - State management                     │
└─────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────┐
│  BrowserWebSocketTransportAdapter       │
│  - Native WebSocket API                 │
│  - Message serialization                │
│  - Heartbeat handling                   │
└─────────────────────────────────────────┘
                   │
                   ▼ (wss://)
┌─────────────────────────────────────────┐
│  Repository Traffic Controller          │
│  - Message routing                      │
│  - Room/presence management             │
└─────────────────────────────────────────┘
```

## Key Differences from Node.js Implementation

| Aspect | Node.js (desktop-app) | Browser (web-ade) |
|--------|----------------------|-------------------|
| WebSocket Library | `ws` npm package | Native `WebSocket` API |
| Import | `import { WebSocket } from 'ws'` | Browser global `WebSocket` |
| Timer Types | `NodeJS.Timeout` | `number` |
| Auth Headers | Custom headers via ws config | Query params or first message |
| Transport Adapter | `WebSocketClientTransportAdapter` | `BrowserWebSocketTransportAdapter` |

## Common Patterns

### Listening to Events

```typescript
const { on } = useControlTowerClient({ ... });

useEffect(() => {
  const unsubscribe = on('presence_updated', ({ users }) => {
    console.log('Users online:', users.length);
  });

  return unsubscribe; // Cleanup
}, [on]);
```

### Broadcasting Custom Events

```typescript
const { broadcast } = useControlTowerClient({ ... });

// Send custom event (requires type casting)
await broadcast({
  type: 'custom:event',
  data: { message: 'Hello' },
  timestamp: Date.now(),
} as any);
```

### Handling Connection State

```typescript
const { connected, error } = useControlTowerClient({ ... });

return (
  <div>
    {error && <div>Error: {error.message}</div>}
    {!connected && <div>Connecting...</div>}
    {connected && <div>Connected!</div>}
  </div>
);
```

## Testing

A test page is available at `/test/webrtc-signaling` that demonstrates:
- WebSocket connection to traffic controller
- Room joining
- WebRTC signaling message exchange
- Peer-to-peer connection establishment

## Troubleshooting

### "Already connected or connecting" error

Check connection state before calling `connect()`:
```typescript
if (client.getConnectionState() === 'disconnected') {
  await client.connect(url);
}
```

### WebSocket connection fails with CORS error

Ensure the traffic controller server allows your origin in WebSocket upgrade handling.

### Messages not reaching target peer

Verify both clients are in the same room:
```typescript
const { roomState } = useControlTowerClient({ ... });
console.log('Users in room:', roomState?.users.size);
```

### Connection timeout

Increase the timeout in adapter config:
```typescript
const transport = new BrowserWebSocketTransportAdapter({
  connectionTimeout: 60000, // 60 seconds
});
```

## References

- [Control Tower Core Documentation](../../../messaging-server/control-tower-core/README.md)
- [WebRTC Browser Client Guide](../../../messaging-server/control-tower-core/WEBRTC_BROWSER_CLIENT_GUIDE.md)
- [Desktop App Implementation](../../../desktop-app/electron-app/src/main/services/GitSyncWebSocketManager.ts)

## License

Same as web-ade project.
