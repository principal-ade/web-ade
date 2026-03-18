/**
 * HTTP-only cookie management for authentication tokens
 *
 * Stores GitHub, WorkOS, and refresh tokens securely.
 * Tokens are NEVER exposed to browser JavaScript.
 */

import { cookies } from 'next/headers';

/**
 * Token data returned from landing-page on initial auth
 */
export interface TokenData {
  github_access_token: string;
  workos_access_token: string;
  refresh_token: string;
  expires_in?: number;
  user?: UserData;
}

/**
 * Token data returned from landing-page on refresh
 * Note: github_access_token is NOT returned on refresh - the client
 * already has the GitHub token stored locally
 */
export interface RefreshTokenData {
  workos_access_token: string;
  refresh_token: string;
  expires_in?: number;
}

/**
 * User data from authentication
 */
export interface UserData {
  login: string;
  email: string;
  name: string;
  id: number;
  avatar_url?: string;
}

/**
 * Cookie configuration
 */
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  // Domain can be set for subdomain sharing if needed
  // domain: '.principal-ai.com',
};

/**
 * Sets authentication tokens in HTTP-only cookies
 * @param tokens - Token data from landing-page
 */
export async function setAuthCookies(tokens: TokenData): Promise<void> {
  const cookieStore = await cookies();
  const maxAge = tokens.expires_in || 60 * 60; // Default 1 hour

  cookieStore.set('github_token', tokens.github_access_token, {
    ...COOKIE_OPTIONS,
    maxAge,
  });

  cookieStore.set('workos_token', tokens.workos_access_token, {
    ...COOKIE_OPTIONS,
    maxAge,
  });

  cookieStore.set('refresh_token', tokens.refresh_token, {
    ...COOKIE_OPTIONS,
    maxAge: 60 * 60 * 24 * 30, // 30 days for refresh token
  });

  // Store token expiry time for client-side refresh logic
  cookieStore.set('token_expires_at', String(Date.now() + maxAge * 1000), {
    ...COOKIE_OPTIONS,
    maxAge,
  });

  // Store GitHub user ID for token sync (used when local token becomes invalid)
  if (tokens.user?.id) {
    cookieStore.set('github_user_id', String(tokens.user.id), {
      ...COOKIE_OPTIONS,
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
  }
}

/**
 * Gets GitHub token from HTTP-only cookie (user's authenticated token only)
 * @returns GitHub token or null if user is not authenticated
 */
export async function getGitHubToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get('github_token')?.value ?? null;
}

/**
 * Gets GitHub token for API calls, with fallback to GITHUB_TOKEN env var
 * Use this for GitHub API calls that don't require user authentication.
 * WARNING: Do NOT use this for determining user identity - use getGitHubToken() instead.
 * @returns GitHub token (user's or fallback) or null
 */
export async function getGitHubApiToken(): Promise<string | null> {
  const userToken = await getGitHubToken();
  if (userToken) {
    return userToken;
  }
  // Fallback to environment variable for unauthenticated API access
  return process.env.GITHUB_TOKEN ?? null;
}

/**
 * Gets WorkOS token from HTTP-only cookie
 * @returns WorkOS token or null
 */
export async function getWorkOSToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get('workos_token')?.value ?? null;
}

/**
 * Gets refresh token from HTTP-only cookie
 * @returns Refresh token or null
 */
export async function getRefreshToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get('refresh_token')?.value ?? null;
}

/**
 * Checks if user is authenticated (has valid tokens)
 * @returns true if authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const githubToken = await getGitHubToken();
  return !!githubToken;
}

/**
 * Gets GitHub user ID from HTTP-only cookie
 * @returns GitHub user ID or null
 */
export async function getGitHubUserId(): Promise<number | null> {
  const cookieStore = await cookies();
  const id = cookieStore.get('github_user_id')?.value;
  return id ? parseInt(id, 10) : null;
}

/**
 * Clears all authentication cookies
 */
export async function clearAuthCookies(): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set('github_token', '', { ...COOKIE_OPTIONS, maxAge: 0 });
  cookieStore.set('workos_token', '', { ...COOKIE_OPTIONS, maxAge: 0 });
  cookieStore.set('refresh_token', '', { ...COOKIE_OPTIONS, maxAge: 0 });
  cookieStore.set('token_expires_at', '', { ...COOKIE_OPTIONS, maxAge: 0 });
  cookieStore.set('github_user_id', '', { ...COOKIE_OPTIONS, maxAge: 0 });
}

/**
 * Gets token expiry timestamp
 * @returns Timestamp or null
 */
export async function getTokenExpiry(): Promise<number | null> {
  const cookieStore = await cookies();
  const expiresAt = cookieStore.get('token_expires_at')?.value;
  return expiresAt ? parseInt(expiresAt, 10) : null;
}

/**
 * Updates only WorkOS and refresh tokens (used during token refresh)
 * GitHub token is preserved as it doesn't change on refresh
 * @param tokens - Refresh token data from landing-page
 */
export async function refreshAuthCookies(tokens: RefreshTokenData): Promise<void> {
  const cookieStore = await cookies();
  const maxAge = tokens.expires_in || 60 * 60; // Default 1 hour

  // Update WorkOS token
  cookieStore.set('workos_token', tokens.workos_access_token, {
    ...COOKIE_OPTIONS,
    maxAge,
  });

  // Update refresh token
  cookieStore.set('refresh_token', tokens.refresh_token, {
    ...COOKIE_OPTIONS,
    maxAge: 60 * 60 * 24 * 30, // 30 days for refresh token
  });

  // Update token expiry time
  cookieStore.set('token_expires_at', String(Date.now() + maxAge * 1000), {
    ...COOKIE_OPTIONS,
    maxAge,
  });

  // Also refresh the github_token cookie maxAge to keep it in sync
  // (the value stays the same, but we extend the expiry)
  const existingGithubToken = cookieStore.get('github_token')?.value;
  if (existingGithubToken) {
    cookieStore.set('github_token', existingGithubToken, {
      ...COOKIE_OPTIONS,
      maxAge,
    });
  }
}
