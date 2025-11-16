/**
 * Control Tower Client Configuration
 *
 * Centralized configuration for WebSocket connections
 */

/**
 * Get the traffic controller WebSocket URL
 * Hardcoded to production server for testing
 */
export function getTrafficControllerUrl(): string {
  // Hardcoded production URL
  return 'wss://repository-traffic-controller-production.rj36caac972nm.us-east-1.cs.amazonlightsail.com/ws';
}

/**
 * Fetch JWT token for WebSocket authentication
 * Exchanges GitHub token (in HTTP-only cookie) for a room token
 *
 * @param repository - Repository ID (e.g., "owner/repo")
 * @param branch - Branch name (default: "main")
 */
export async function getWebSocketToken(
  repository: string,
  branch: string = 'main'
): Promise<string | null> {
  try {
    const response = await fetch('/api/auth/room-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ repository, branch }),
    });

    if (response.ok) {
      const data = await response.json();
      return data.access_token;
    }

    console.error('Failed to fetch WebSocket token:', response.status);
    return null;
  } catch (error) {
    console.error('Failed to fetch WebSocket token:', error);
    return null;
  }
}
