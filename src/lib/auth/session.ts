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
  csrf?: string; // CSRF token extracted from state parameter
  createdAt?: number;
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
 * Stores PKCE verifier and CSRF token in session
 * @param verifier - PKCE code verifier
 * @param csrf - CSRF token (extracted from state parameter)
 */
export async function setAuthSession(
  verifier: string,
  csrf: string
): Promise<void> {
  const session = await getAuthSession();
  session.codeVerifier = verifier;
  session.csrf = csrf;
  session.createdAt = Date.now();
  await session.save();
}

/**
 * Retrieves and validates session data
 * @param csrf - CSRF token from state parameter to validate
 * @returns Session data or null if invalid/expired
 */
export async function getAndValidateSession(
  csrf: string
): Promise<{ codeVerifier: string } | null> {
  const session = await getAuthSession();

  // Check if session exists
  if (!session.codeVerifier || !session.csrf || !session.createdAt) {
    return null;
  }

  // Validate CSRF token
  if (session.csrf !== csrf) {
    console.error('CSRF mismatch in session validation');
    return null;
  }

  // Check if session expired (5 minutes)
  const fiveMinutes = 5 * 60 * 1000;
  if (Date.now() - session.createdAt > fiveMinutes) {
    console.error('Session expired');
    return null;
  }

  return { codeVerifier: session.codeVerifier };
}

/**
 * Clears the auth session
 */
export async function clearAuthSession(): Promise<void> {
  const session = await getAuthSession();
  session.destroy();
}
