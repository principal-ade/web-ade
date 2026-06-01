import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext';

// Deterministic device id so we can assert the bootstrap body.
vi.mock('@/lib/device-id', () => ({ getDeviceId: () => 'browser-test' }));

const ALICE = { login: 'alice', email: 'alice@example.com', name: 'Alice', id: 100 };

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 401, json: async () => body } as Response;
}

function Probe() {
  const { isAuthenticated, isLoading, user } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="auth">{String(isAuthenticated)}</span>
      <span data-testid="user">{user?.login ?? ''}</span>
    </div>
  );
}

describe('AuthContext — cold-start bootstrap', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('rehydrates the session via /api/auth/bootstrap when access cookies expired but refresh_token survives', async () => {
    // /me: first call cold (github_token evicted), second call after bootstrap.
    const meResponses = [
      jsonResponse({ isAuthenticated: false, user: null }),
      jsonResponse({ isAuthenticated: true, user: ALICE }),
    ];
    const bootstrapCalls: Array<Record<string, unknown>> = [];

    const fetchMock = vi.fn(async (url: string, opts?: RequestInit) => {
      if (url === '/api/auth/me') return meResponses.shift()!;
      if (url === '/api/auth/bootstrap') {
        bootstrapCalls.push(JSON.parse(opts!.body as string));
        return jsonResponse({ success: true });
      }
      if (url === '/api/auth/token-status') {
        return jsonResponse({ authenticated: true, expiresAt: 9e15, expiresIn: 9e15, shouldRefresh: false });
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('auth').textContent).toBe('true'));
    expect(screen.getByTestId('user').textContent).toBe('alice');
    expect(bootstrapCalls).toHaveLength(1);
    expect(bootstrapCalls[0]).toEqual({ device_id: 'browser-test' });
  });

  it('stays logged out and does not loop when bootstrap cannot recover (no refresh_token)', async () => {
    let bootstrapCount = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/auth/me') return jsonResponse({ isAuthenticated: false, user: null });
      if (url === '/api/auth/bootstrap') {
        bootstrapCount++;
        return jsonResponse({ error: 'No refresh token available' }, false);
      }
      return jsonResponse({});
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('auth').textContent).toBe('false');
    expect(bootstrapCount).toBe(1); // guarded — only one attempt, no loop
  });
});
