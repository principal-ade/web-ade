/**
 * Server-side session management for authentication
 *
 * Uses iron-session for encrypted, signed cookies.
 * Stores temporary PKCE verifiers during OAuth flow (5 min TTL).
 */

import { getIronSession, IronSession, SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';

/**
 * Session data structure for PKCE flow
 */
export interface AuthSessionData {
  codeVerifier?: string;
  state?: string;
  createdAt?: number;
  redirectTo?: string;
}

/**
 * Iron-session configuration
 */
const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET || '',
  cookieName: 'web-ade-session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 5, // 5 minutes
    path: '/',
  },
};

/**
 * Validates that required environment variables are present
 */
function validateSessionConfig(): void {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    throw new Error(
      'SESSION_SECRET environment variable is required and must be at least 32 characters long'
    );
  }
}

/**
 * Gets the current auth session
 * @returns Iron session instance
 */
export async function getAuthSession(): Promise<
  IronSession<AuthSessionData>
> {
  validateSessionConfig();
  const cookieStore = await cookies();
  return getIronSession<AuthSessionData>(cookieStore, sessionOptions);
}

/**
 * Stores PKCE verifier and state in session
 * @param verifier - PKCE code verifier
 * @param state - OAuth state parameter
 * @param redirectTo - URL to redirect to after login
 */
export async function setAuthSession(
  verifier: string,
  state: string,
  redirectTo?: string
): Promise<void> {
  const session = await getAuthSession();
  session.codeVerifier = verifier;
  session.state = state;
  session.createdAt = Date.now();
  session.redirectTo = redirectTo;
  await session.save();
}

/**
 * Retrieves and validates session data
 * @param expectedState - Expected state parameter
 * @returns Session data or null if invalid/expired
 */
export async function getAndValidateSession(
  expectedState: string
): Promise<{ codeVerifier: string; redirectTo?: string } | null> {
  const session = await getAuthSession();

  // Check if session exists
  if (!session.codeVerifier || !session.state || !session.createdAt) {
    return null;
  }

  // Validate state parameter
  if (session.state !== expectedState) {
    console.error('State mismatch in session validation');
    return null;
  }

  // Check if session expired (5 minutes)
  const fiveMinutes = 5 * 60 * 1000;
  if (Date.now() - session.createdAt > fiveMinutes) {
    console.error('Session expired');
    return null;
  }

  return { codeVerifier: session.codeVerifier, redirectTo: session.redirectTo };
}

/**
 * Clears the auth session
 */
export async function clearAuthSession(): Promise<void> {
  const session = await getAuthSession();
  session.destroy();
}
