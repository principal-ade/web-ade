/**
 * PKCE (Proof Key for Code Exchange) Utilities
 *
 * Implements RFC 7636 for securing OAuth 2.0 authorization code flow.
 * PKCE prevents authorization code interception attacks.
 */

/**
 * Generates a cryptographically random string for PKCE
 * @param length - Number of bytes to generate (default 32)
 * @returns Base64URL encoded random string
 */
function generateRandomString(length: number = 32): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(length));
  return base64UrlEncode(randomBytes);
}

/**
 * Base64URL encodes a buffer (URL-safe, no padding)
 * @param buffer - Uint8Array to encode
 * @returns Base64URL encoded string
 */
function base64UrlEncode(buffer: Uint8Array): string {
  const base64 = Buffer.from(buffer).toString('base64');
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generates SHA-256 hash of a string
 * @param value - String to hash
 * @returns Base64URL encoded hash
 */
async function sha256(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(hashBuffer));
}

/**
 * Generates PKCE code verifier and challenge
 * @returns Object containing verifier and challenge
 */
export async function generatePKCE(): Promise<{
  codeVerifier: string;
  codeChallenge: string;
}> {
  const codeVerifier = generateRandomString(32);
  const codeChallenge = await sha256(codeVerifier);

  return {
    codeVerifier,
    codeChallenge,
  };
}

/**
 * Generates a state parameter with CSRF token and optional redirect
 * Following OAuth 2.0 best practices: encode application state in the state parameter
 * State is a base64url-encoded JSON object: {csrf: string, redirect?: string}
 *
 * @param redirectTo - Optional URL to redirect to after auth
 * @returns Base64URL encoded state string
 */
export function generateState(redirectTo?: string): string {
  const csrfToken = generateRandomString(16);
  const stateObj = redirectTo ? { csrf: csrfToken, redirect: redirectTo } : { csrf: csrfToken };
  const stateJson = JSON.stringify(stateObj);
  const stateBytes = new TextEncoder().encode(stateJson);
  return base64UrlEncode(stateBytes);
}

/**
 * Decodes the state parameter
 * @param state - Base64URL encoded state string
 * @returns Decoded state object with csrf token and optional redirect
 */
export function decodeState(state: string): { csrf: string; redirect?: string } {
  try {
    // Add back padding if needed
    let base64 = state.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    const decoded = Buffer.from(base64, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch {
    throw new Error('Invalid state parameter');
  }
}
