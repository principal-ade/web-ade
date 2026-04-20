/**
 * Request-based authentication helpers
 *
 * Supports both:
 * - Bearer token authentication (mobile apps, API clients)
 * - HTTP-only cookie authentication (web browsers)
 */

import { cookies, headers } from 'next/headers';

/**
 * Get GitHub token from Authorization header (Bearer) or cookie
 * Supports both mobile (Bearer token) and web (cookie) authentication
 */
export async function getGitHubToken(): Promise<string | null> {
  try {
    // Check Authorization header first (for mobile/API clients)
    const headerStore = await headers();
    const authHeader = headerStore.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    // Fall back to cookie (for web clients)
    const cookieStore = await cookies();
    return cookieStore.get('github_token')?.value || null;
  } catch {
    return null;
  }
}

/**
 * Get GitHub user ID from cookie (web clients only)
 * For Bearer token auth, we fetch from GitHub API instead
 */
export async function getGitHubUserIdFromCookie(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get('github_user_id')?.value || null;
  } catch {
    return null;
  }
}

/**
 * Fetch GitHub user info using token
 */
export async function fetchGitHubUser(
  token: string
): Promise<{ id: number; login: string } | null> {
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { id: number; login: string };
    return data;
  } catch {
    return null;
  }
}

/**
 * Get GitHub user ID - checks cookie first, then fetches from API if needed
 * Returns as string to match cookie storage format
 */
export async function getGitHubUserId(token?: string): Promise<string | null> {
  // Try cookie first (web clients)
  const cookieId = await getGitHubUserIdFromCookie();
  if (cookieId) {
    return cookieId;
  }

  // If no cookie, fetch from GitHub API (mobile/API clients)
  const authToken = token || (await getGitHubToken());
  if (!authToken) {
    return null;
  }

  const user = await fetchGitHubUser(authToken);
  return user ? String(user.id) : null;
}
