// @vitest-environment node

/**
 * Unit tests for the unsupported-repos store: empty default, first-failure
 * insert, idempotent upsert (failCount bumps, firstFailedAt preserved), and
 * case-insensitive repo identity. S3 is the in-memory harness with real ETag
 * compare-and-set so the RMW path is exercised.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createS3Harness, type S3Harness } from '@/lib/bookmarks/__tests__/test-harness';
import {
  getUnsupportedRepos,
  recordUnsupportedRepo,
  removeUnsupportedRepo,
} from '@/lib/authoring/unsupported-store';

const ERR = { code: 'UNAVAILABLE' as const, message: 'freestyle import failed' };

describe('unsupported-store', () => {
  let h: S3Harness;

  beforeEach(() => {
    h = createS3Harness();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-14T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    h.mock.restore();
  });

  it('returns [] when nothing has failed', async () => {
    expect(await getUnsupportedRepos()).toEqual([]);
  });

  it('records a first failure with failCount 1', async () => {
    await recordUnsupportedRepo('anomalyco', 'opencode', ERR);
    const repos = await getUnsupportedRepos();
    expect(repos).toHaveLength(1);
    expect(repos[0]).toMatchObject({
      owner: 'anomalyco',
      repo: 'opencode',
      failCount: 1,
      firstFailedAt: '2026-06-14T00:00:00.000Z',
      lastFailedAt: '2026-06-14T00:00:00.000Z',
      lastError: ERR,
    });
  });

  it('upserts idempotently — bumps failCount, preserves firstFailedAt', async () => {
    await recordUnsupportedRepo('anomalyco', 'opencode', ERR);
    vi.setSystemTime(new Date('2026-06-14T01:00:00.000Z'));
    await recordUnsupportedRepo('anomalyco', 'opencode', {
      code: 'UNAVAILABLE',
      message: 'second failure',
    });

    const repos = await getUnsupportedRepos();
    expect(repos).toHaveLength(1);
    expect(repos[0]).toMatchObject({
      failCount: 2,
      firstFailedAt: '2026-06-14T00:00:00.000Z',
      lastFailedAt: '2026-06-14T01:00:00.000Z',
      lastError: { message: 'second failure' },
    });
  });

  it('treats owner/repo case-insensitively as the same repo', async () => {
    await recordUnsupportedRepo('Facebook', 'React', ERR);
    await recordUnsupportedRepo('facebook', 'react', ERR);
    const repos = await getUnsupportedRepos();
    expect(repos).toHaveLength(1);
    expect(repos[0]?.failCount).toBe(2);
  });

  it('removes a repo (undo a false positive); no-op when absent', async () => {
    await recordUnsupportedRepo('anomalyco', 'opencode', ERR);
    await recordUnsupportedRepo('pingdotgg', 't3code', ERR);
    await removeUnsupportedRepo('anomalyco', 'opencode');
    expect((await getUnsupportedRepos()).map((r) => r.repo)).toEqual(['t3code']);
    // Absent / case-insensitive no-op.
    await removeUnsupportedRepo('nope', 'missing');
    await removeUnsupportedRepo('PingDotGG', 'T3Code');
    expect(await getUnsupportedRepos()).toEqual([]);
  });

  it('tracks multiple distinct repos', async () => {
    await recordUnsupportedRepo('anomalyco', 'opencode', ERR);
    await recordUnsupportedRepo('pingdotgg', 't3code', ERR);
    const repos = await getUnsupportedRepos();
    expect(repos.map((r) => `${r.owner}/${r.repo}`).sort()).toEqual([
      'anomalyco/opencode',
      'pingdotgg/t3code',
    ]);
  });
});
