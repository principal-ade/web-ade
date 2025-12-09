import type { IAuthAdapter } from '@principal-ai/control-tower-core/abstractions';
import type { TokenPayload } from '@principal-ai/control-tower-core/types';

/**
 * Simple JWT Auth Adapter for browser environments
 *
 * This adapter handles JWT token-based authentication for Control Tower Core.
 * The token is provided in the constructor and used for authentication.
 */
export class JWTAuthAdapter implements IAuthAdapter {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  getCurrentToken(): string {
    return this.token;
  }

  async validateToken(token: string): Promise<TokenPayload> {
    // Decode JWT without verification (server will verify)
    // Browser-safe base64 decode
    try {
      const base64Url = token.split('.')[1];
      if (!base64Url) {
        throw new Error('Invalid token format');
      }

      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );

      const payload = JSON.parse(jsonPayload) as TokenPayload;
      if (!payload) {
        throw new Error('Invalid token payload');
      }
      return payload;
    } catch (error) {
      throw new Error(`Failed to decode token: ${error}`);
    }
  }

  isAuthRequired(): boolean {
    return true;
  }
}
