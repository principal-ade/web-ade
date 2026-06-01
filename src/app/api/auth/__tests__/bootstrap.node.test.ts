// @vitest-environment node

/**
 * Secure-orchestration coverage for the cold-start bootstrap.
 *
 * Asserts the route rebuilds the session from the SECRET (refresh_token) and
 * exchanges the resulting verified WorkOS token for the GitHub token — never
 * trusting github_user_id on its own. See
 * docs/auth-session-expiry-investigation.md (§5).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/auth/bootstrap/route';
import { getRefreshToken, getGitHubUserId, refreshAuthCookies } from '@/lib/auth/cookies';

// `cookies().set` is captured via vi.hoisted so the next/headers mock factory
// (hoisted above imports by vitest) can reference it safely.
const { cookieSet } = vi.hoisted(() => ({ cookieSet: vi.fn() }));

vi.mock('@/lib/auth/cookies', () => ({
  getRefreshToken: vi.fn(),
  getGitHubUserId: vi.fn(),
  refreshAuthCookies: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ set: cookieSet, get: vi.fn() }),
}));

const mockGetRefresh = vi.mocked(getRefreshToken);
const mockGetUserId = vi.mocked(getGitHubUserId);

function makeRequest(body: unknown): NextRequest {
  return new NextRequest(
    new Request('https://app.local/api/auth/bootstrap', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.AUTH_SERVER_URL = 'https://auth.local';
  mockGetRefresh.mockResolvedValue('refresh-abc');
  mockGetUserId.mockResolvedValue(100);
});

afterEach(() => vi.unstubAllGlobals());

describe('POST /api/auth/bootstrap', () => {
  it('returns 401 when there is no refresh_token cookie', async () => {
    mockGetRefresh.mockResolvedValue(null);
    const res = await POST(makeRequest({ device_id: 'browser-1' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when device_id is missing', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('redeems refresh_token, then exchanges the WorkOS token for the GitHub token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ workos_access_token: 'eyJ.real.jwt', refresh_token: 'refresh-new', expires_in: 3600 }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ github_token: 'gho_restored' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await POST(makeRequest({ device_id: 'browser-1' }));
    expect(res.status).toBe(200);

    // 1st hop: /workos/refresh with the secret + addressing params.
    const [refreshUrl, refreshInit] = fetchMock.mock.calls[0];
    expect(String(refreshUrl)).toContain('/api/auth/workos/refresh');
    expect(JSON.parse(refreshInit.body)).toMatchObject({
      refresh_token: 'refresh-abc',
      device_id: 'browser-1',
      github_user_id: '100',
    });

    // 2nd hop: hardened /token/current authorized by the verified WorkOS token.
    const [tokenUrl, tokenInit] = fetchMock.mock.calls[1];
    expect(String(tokenUrl)).toContain('/api/auth/token/current');
    expect(String(tokenUrl)).toContain('github_user_id=100');
    expect(String(tokenUrl)).toContain('device_id=browser-1');
    expect(tokenInit.headers.Authorization).toBe('Bearer eyJ.real.jwt');

    // Session restored: new WorkOS cookies + the recovered github_token cookie.
    expect(refreshAuthCookies).toHaveBeenCalled();
    expect(cookieSet).toHaveBeenCalledWith(
      'github_token',
      'gho_restored',
      expect.objectContaining({ httpOnly: true }),
    );
  });

  it('returns 401 when the refresh token is rejected (no token/current call)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('invalid_grant', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await POST(makeRequest({ device_id: 'browser-1' }));
    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1); // never reached /token/current
  });
});
