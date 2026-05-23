// @vitest-environment node

/**
 * Route-level integration tests for the per-user starred indirection.
 *
 * Covers the four cases the build spec calls out:
 *   1. Idempotency on POST .../star.
 *   2. Repo-access gate on POST trail/star (and that DELETE bypasses it).
 *   3. 404-on-deleted-target — POST against missing record, and `gone: true`
 *      on GET when a starred target gets deleted afterwards.
 *   4. `starred` field correctness on GET by-id for authed-with,
 *      authed-without, and anonymous callers.
 *
 * Auth + GitHub helpers are mocked at the seam (`fetchGitHubUser`,
 * `getGitHubToken`, `checkRepoAccess`). S3 is mocked via
 * `aws-sdk-client-mock` with an in-memory store so writes round-trip to
 * reads and ETag locks behave realistically.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createS3Harness, type S3Harness } from './test-harness';
import { fetchGitHubUser, getGitHubToken } from '@/lib/auth/request';
import { checkRepoAccess } from '@/lib/trails/github-access';
import {
  buildTopicKey,
  buildByUserKey as buildTopicByUserKey,
} from '@/lib/topics/s3-storage';
import { buildIdPointerKey, buildIndexKey } from '@/lib/trails/s3-storage';
import {
  buildStarredTopicsKey,
  buildStarredTrailsKey,
} from '@/lib/stars/s3-storage';
import type { TopicPayload } from '@/lib/topics/types';
import type {
  SharedTrailIndex,
  SharedTrailIndexEntry,
} from '@/lib/trails/types';
import type {
  StarredTopicsIndex,
  StarredTrailsIndex,
} from '@/lib/stars/types';
import { POST as postTopicStar } from '@/app/api/topics/by-id/[id]/star/route';
import { GET as getStarredTopics } from '@/app/api/topics/starred/route';
import {
  POST as postTrailStar,
  DELETE as deleteTrailStar,
} from '@/app/api/trails/by-id/[id]/star/route';
import { GET as getTopicById } from '@/app/api/topics/by-id/[id]/route';

// `vi.mock` is hoisted by vitest above all imports regardless of source
// position, so these stay near the imports they apply to for readability.
vi.mock('@/lib/auth/request', () => ({
  getGitHubToken: vi.fn(),
  fetchGitHubUser: vi.fn(),
  getGitHubUserIdFromCookie: vi.fn(),
  getGitHubUserId: vi.fn(),
}));

vi.mock('@/lib/trails/github-access', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/trails/github-access')>(
      '@/lib/trails/github-access',
    );
  return {
    ...actual,
    checkRepoAccess: vi.fn(),
  };
});

const mockedGetToken = vi.mocked(getGitHubToken);
const mockedFetchUser = vi.mocked(fetchGitHubUser);
const mockedCheckRepo = vi.mocked(checkRepoAccess);

// ============================================================================
// Fixtures
// ============================================================================

const ALICE = { id: 100, login: 'alice' };
const BOB = { id: 200, login: 'bob' };
const TOPIC_ID = 'topic-abc';
const TRAIL_ID = 'trail-xyz';
const OWNER = 'acme';
const REPO = 'widgets';

function fakeTopic(overrides: Partial<TopicPayload> = {}): TopicPayload {
  return {
    id: TOPIC_ID,
    title: 'Bundling strategies across our monorepos',
    description: 'How we approach esbuild vs rollup in each repo.',
    trailIds: ['t1', 't2'],
    createdBy: { githubId: BOB.id, githubLogin: BOB.login },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

function fakeIndexEntry(
  overrides: Partial<SharedTrailIndexEntry> = {},
): SharedTrailIndexEntry {
  return {
    id: TRAIL_ID,
    title: 'Login flow',
    summaryPreview: 'Walks the JWT handshake.',
    markerCount: 5,
    repoNames: [REPO],
    hasDiffSnippets: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    sizeBytes: 1234,
    createdBy: { githubId: BOB.id, githubLogin: BOB.login },
    githubRepoId: 42,
    ...overrides,
  };
}

function makeRequest(
  method: string,
  path: string,
  init: RequestInit = {},
): NextRequest {
  return new NextRequest(new Request(`https://test.local${path}`, { method, ...init }));
}

async function asJson<T = unknown>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

// ============================================================================
// Per-test setup
// ============================================================================

let s3: S3Harness;

beforeEach(() => {
  // `clearAllMocks` resets call history on `vi.mock`'d module fns without
  // wiping their implementations — `restoreAllMocks` is for `vi.spyOn`
  // spies, which we don't use here.
  vi.clearAllMocks();
  s3 = createS3Harness();
  // Default: Alice is authed via her token. Tests override as needed.
  mockedGetToken.mockResolvedValue('alice-token');
  mockedFetchUser.mockResolvedValue(ALICE);
  // Default: repo access granted. Trail-specific tests override to 403.
  mockedCheckRepo.mockResolvedValue({ githubRepoId: 42, fullName: `${OWNER}/${REPO}` });
});

function seedTopic(topic: TopicPayload = fakeTopic()): void {
  s3.store.put(buildTopicKey(topic.id), topic);
}

function seedTrail(): SharedTrailIndexEntry {
  const entry = fakeIndexEntry();
  s3.store.put(buildIdPointerKey(TRAIL_ID), { owner: OWNER, repo: REPO });
  const index: SharedTrailIndex = {
    version: 1,
    updatedAt: '2026-01-02T00:00:00.000Z',
    entries: [entry],
  };
  s3.store.put(buildIndexKey(OWNER, REPO), index);
  return entry;
}

// ============================================================================
// 1. Idempotency
// ============================================================================

describe('POST /api/topics/by-id/:id/star — idempotency', () => {
  it('starring twice keeps a single entry and refreshes starredAt', async () => {
    seedTopic();

    const first = await postTopicStar(
      makeRequest('POST', `/api/topics/by-id/${TOPIC_ID}/star`),
      { params: Promise.resolve({ id: TOPIC_ID }) },
    );
    expect(first.status).toBe(200);
    const firstBody = await asJson<{ entry: { starredAt: string } }>(first);

    // Force a measurable timestamp gap between calls.
    await new Promise((r) => setTimeout(r, 5));

    const second = await postTopicStar(
      makeRequest('POST', `/api/topics/by-id/${TOPIC_ID}/star`),
      { params: Promise.resolve({ id: TOPIC_ID }) },
    );
    expect(second.status).toBe(200);
    const secondBody = await asJson<{ entry: { starredAt: string } }>(second);

    const stored = s3.store.read<StarredTopicsIndex>(buildStarredTopicsKey(ALICE.id));
    expect(stored).not.toBeNull();
    expect(stored!.entries).toHaveLength(1);
    expect(stored!.entries[0]!.topicId).toBe(TOPIC_ID);
    expect(
      Date.parse(secondBody.entry.starredAt),
    ).toBeGreaterThan(Date.parse(firstBody.entry.starredAt));
  });
});

// ============================================================================
// 2. Repo-access gate (trails only)
// ============================================================================

describe('POST /api/trails/by-id/:id/star — repo-access gate', () => {
  it('returns 403 NO_REPO_ACCESS when the caller cannot read the repo', async () => {
    seedTrail();
    mockedCheckRepo.mockResolvedValue(null);

    const res = await postTrailStar(
      makeRequest('POST', `/api/trails/by-id/${TRAIL_ID}/star`),
      { params: Promise.resolve({ id: TRAIL_ID }) },
    );
    expect(res.status).toBe(403);
    const body = await asJson<{ code: string }>(res);
    expect(body.code).toBe('NO_REPO_ACCESS');

    expect(s3.store.read(buildStarredTrailsKey(ALICE.id))).toBeNull();
  });

  it('DELETE unstar succeeds even after the caller loses repo access', async () => {
    seedTrail();
    // Pre-seed an existing star so we have something to unstar.
    const starred: StarredTrailsIndex = {
      version: 1,
      updatedAt: new Date().toISOString(),
      entries: [
        {
          trailId: TRAIL_ID,
          starredAt: '2026-01-03T00:00:00.000Z',
          owner: OWNER,
          repo: REPO,
          snapshot: fakeIndexEntry(),
        },
      ],
    };
    s3.store.put(buildStarredTrailsKey(ALICE.id), starred);

    // Repo access lost between starring and unstarring.
    mockedCheckRepo.mockResolvedValue(null);

    const res = await deleteTrailStar(
      makeRequest('DELETE', `/api/trails/by-id/${TRAIL_ID}/star`),
      { params: Promise.resolve({ id: TRAIL_ID }) },
    );
    expect(res.status).toBe(204);

    const stored = s3.store.read<StarredTrailsIndex>(buildStarredTrailsKey(ALICE.id));
    expect(stored!.entries).toHaveLength(0);
  });
});

// ============================================================================
// 3. 404 on deleted target
// ============================================================================

describe('starred — 404-on-deleted-target', () => {
  it('POST star against a missing topic returns 404 NOT_FOUND', async () => {
    // No seedTopic — the by-id key doesn't exist.

    const res = await postTopicStar(
      makeRequest('POST', `/api/topics/by-id/${TOPIC_ID}/star`),
      { params: Promise.resolve({ id: TOPIC_ID }) },
    );
    expect(res.status).toBe(404);
    const body = await asJson<{ code: string }>(res);
    expect(body.code).toBe('NOT_FOUND');

    expect(s3.store.read(buildStarredTopicsKey(ALICE.id))).toBeNull();
  });

  it('GET /api/topics/starred flags gone: true when the underlying topic is deleted', async () => {
    seedTopic();

    // Star it.
    const post = await postTopicStar(
      makeRequest('POST', `/api/topics/by-id/${TOPIC_ID}/star`),
      { params: Promise.resolve({ id: TOPIC_ID }) },
    );
    expect(post.status).toBe(200);

    // Delete the underlying topic out from under the starred index.
    s3.store.remove(buildTopicKey(TOPIC_ID));
    // Also clear the owner's by-user index (would be cleaned up by the real
    // DELETE topic route — but for `gone` detection only the by-id key
    // matters).
    s3.store.remove(buildTopicByUserKey(BOB.id));

    const list = await getStarredTopics();
    expect(list.status).toBe(200);
    const body = await asJson<{
      entries: Array<{ topicId: string; gone?: true }>;
    }>(list);
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]!.topicId).toBe(TOPIC_ID);
    expect(body.entries[0]!.gone).toBe(true);
  });
});

// ============================================================================
// 4. `starred` field correctness on GET by-id
// ============================================================================

describe('GET /api/topics/by-id/:id — starred field', () => {
  it('is true for an authed caller who has the topic starred', async () => {
    seedTopic();

    // Star first so the index contains this topic.
    await postTopicStar(
      makeRequest('POST', `/api/topics/by-id/${TOPIC_ID}/star`),
      { params: Promise.resolve({ id: TOPIC_ID }) },
    );

    const res = await getTopicById(
      makeRequest('GET', `/api/topics/by-id/${TOPIC_ID}`),
      { params: Promise.resolve({ id: TOPIC_ID }) },
    );
    expect(res.status).toBe(200);
    const body = await asJson<{ starred: boolean }>(res);
    expect(body.starred).toBe(true);
  });

  it('is false for an authed caller without the topic starred', async () => {
    seedTopic();

    const res = await getTopicById(
      makeRequest('GET', `/api/topics/by-id/${TOPIC_ID}`),
      { params: Promise.resolve({ id: TOPIC_ID }) },
    );
    expect(res.status).toBe(200);
    const body = await asJson<{ starred: boolean }>(res);
    expect(body.starred).toBe(false);
  });

  it('is false for an anonymous caller — no per-user S3 read attempted', async () => {
    seedTopic();
    mockedGetToken.mockResolvedValue(null);

    const res = await getTopicById(
      makeRequest('GET', `/api/topics/by-id/${TOPIC_ID}`),
      { params: Promise.resolve({ id: TOPIC_ID }) },
    );
    expect(res.status).toBe(200);
    const body = await asJson<{ starred: boolean }>(res);
    expect(body.starred).toBe(false);

    // fetchGitHubUser should not have been called — the token short-circuited.
    expect(mockedFetchUser).not.toHaveBeenCalled();
  });
});
