import type { IAuthAdapter } from '@principal-ai/control-tower-core/abstractions';
import type {
  AuthResult,
  TokenPayload,
  Credentials,
} from '@principal-ai/control-tower-core/types';

/**
 * Simple JWT Auth Adapter for browser environments
 *
 * This adapter handles JWT token-based authentication for Control Tower Core.
 * The token is provided in the constructor and returned during authentication.
 */
export class JWTAuthAdapter implements IAuthAdapter {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async authenticate(_credentials: Credentials): Promise<AuthResult> {
    // For JWT auth, we don't use credentials parameter
    // The token is already provided in the constructor
    return {
      success: true,
      token: this.token,
    };
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

  getSupportedCredentialTypes() {
    return ['jwt' as const];
  }
}
