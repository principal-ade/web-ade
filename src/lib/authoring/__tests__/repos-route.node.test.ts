// @vitest-environment node

/**
 * Route tests for `GET /api/authoring/repos`: auth gate (401 when
 * unauthenticated) and payload shape (curated set + unsupported list + notice).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createS3Harness, type S3Harness } from '@/lib/bookmarks/__tests__/test-harness';
import { fetchGitHubUser, getGitHubToken } from '@/lib/auth/request';
import { GET as getRepos } from '@/app/api/authoring/repos/route';
import { UNSUPPORTED_NOTICE } from '@/lib/authoring/curated-repos';

vi.mock('@/lib/auth/request', () => ({
  getGitHubToken: vi.fn(),
  fetchGitHubUser: vi.fn(),
}));

const mockedGetToken = vi.mocked(getGitHubToken);
const mockedFetchUser = vi.mocked(fetchGitHubUser);

const UNSUPPORTED_KEY = 'authoring-meta/unsupported-repos.json';

describe('GET /api/authoring/repos', () => {
  let h: S3Harness;

  beforeEach(() => {
    h = createS3Harness();
    vi.clearAllMocks();
  });

  afterEach(() => {
    h.mock.restore();
  });

  it('401s when unauthenticated', async () => {
    mockedGetToken.mockResolvedValue(null);
    const res = await getRepos();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('NOT_AUTHENTICATED');
  });

  it('returns curated set, unsupported list, and notice when authed', async () => {
    mockedGetToken.mockResolvedValue('tok');
    mockedFetchUser.mockResolvedValue({ id: 1, login: 'alice' } as never);
    h.store.put(UNSUPPORTED_KEY, {
      version: 1,
      updatedAt: '2026-06-14T00:00:00.000Z',
      repos: [
        {
          owner: 'anomalyco',
          repo: 'opencode',
          firstFailedAt: '2026-06-14T00:00:00.000Z',
          lastFailedAt: '2026-06-14T00:00:00.000Z',
          failCount: 1,
          lastError: { code: 'UNAVAILABLE', message: 'x' },
        },
      ],
    });

    const res = await getRepos();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.notice).toBe(UNSUPPORTED_NOTICE);
    expect(body.curated.length).toBeGreaterThanOrEqual(4);
    expect(body.curated.map((r: { repo: string }) => r.repo)).toContain('express');
    expect(body.unsupported).toHaveLength(1);
    expect(body.unsupported[0]).toMatchObject({ owner: 'anomalyco', repo: 'opencode' });
  });

  it('returns an empty unsupported list when none recorded', async () => {
    mockedGetToken.mockResolvedValue('tok');
    mockedFetchUser.mockResolvedValue({ id: 1, login: 'alice' } as never);
    const res = await getRepos();
    const body = await res.json();
    expect(body.unsupported).toEqual([]);
  });
});
