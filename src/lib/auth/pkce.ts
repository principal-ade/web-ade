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
 * Generates a random state parameter for CSRF protection
 * @returns Random state string
 */
export function generateState(): string {
  return generateRandomString(16);
}
