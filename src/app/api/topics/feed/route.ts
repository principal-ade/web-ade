/**
 * GET /api/topics/feed
 *
 * Global, HN-style feed of every topic across all creators. Backs the
 * `/topics` page. Enumerates the per-user manifests under
 * `topics/_by-user/`, reads each in parallel, lifts every row out with its
 * author stamped on, and returns a flat list sorted by recency.
 *
 * Lazy backfill: manifests written before `githubLogin` was stored on the
 * index get it filled in here by reading one topic record (which always
 * carries `createdBy`). The login is written back via the existing
 * ETag-locked path, so subsequent requests skip the extra GET. Mirrors the
 * `repoVisibility` backfill in `/api/trails/repos`.
 *
 * Repo-owner avatars: a topic stores only `trailIds`, so for each topic we
 * read its record to get the trail list, then resolve each trail's repo
 * owner through the lightweight `trails/_by-id/{id}.json` pointer store.
 * Pointer reads are deduped across the whole feed and the response is
 * 60s-cached, so the fan-out runs at most once a minute.
 */

import { NextResponse } from 'next/server';
import {
  getTopic,
  getTopicsByUser,
  listTopicOwnerIds,
  updateTopicsByUser,
} from '@/lib/topics/s3-storage';
import { getGitHubDisplayName } from '@/lib/trails/github-access';
import { getIdPointer } from '@/lib/trails/s3-storage';
import type {
  ListTopicsFeedResponse,
  TopicByUserIndex,
  TopicFeedEntry,
} from '@/lib/topics/types';

// Match the manifest cache budget (PAYLOAD_CACHE_CONTROL = max-age=60).
export const revalidate = 60;

const MANIFEST_FETCH_CONCURRENCY = 20;
const TOPIC_FETCH_CONCURRENCY = 20;
const POINTER_FETCH_CONCURRENCY = 20;

/** Feed entry before its trails' repos have been resolved. */
type PartialFeedEntry = Omit<TopicFeedEntry, 'repos'>;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (true) {
        const i = cursor++;
        const item = items[i];
        if (i >= items.length || item === undefined) return;
        results[i] = await fn(item);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

/**
 * Resolve an owner's login, backfilling the manifest stamp if missing.
 * Returns `null` only when the login can't be determined (empty manifest
 * or unreadable topic) — that owner is then skipped this round.
 */
async function resolveOwnerLogin(
  githubId: number,
  index: TopicByUserIndex,
): Promise<string | null> {
  if (index.githubLogin) return index.githubLogin;

  const first = index.entries[0];
  if (!first) return null;

  let login: string;
  try {
    const topic = await getTopic(first.id);
    if (!topic) return null;
    login = topic.createdBy.githubLogin;
  } catch (error) {
    console.warn('[Topics] Login backfill probe failed:', {
      githubId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }

  // Best-effort write-back; a lost race just means we re-resolve next time.
  try {
    await updateTopicsByUser(githubId, (data) => ({ ...data, githubLogin: login }));
  } catch (error) {
    console.warn('[Topics] Login stamp failed:', {
      githubId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return login;
}

type RepoRef = { owner: string; repo: string };

/**
 * Resolve the distinct repos across a set of topics' trails. Reads each
 * topic record once for its `trailIds`, then resolves every unique trail id
 * to its `{owner, repo}` through the pointer store — each pointer read
 * happens at most once even when a trail recurs across topics. Returns a map
 * from topic id to its sorted, deduped repo refs.
 */
async function resolveReposByTopic(
  entries: PartialFeedEntry[],
): Promise<Map<string, RepoRef[]>> {
  // topic id → its trail ids
  const trailIdsByTopic = new Map<string, string[]>();
  await mapWithConcurrency(entries, TOPIC_FETCH_CONCURRENCY, async (entry) => {
    try {
      const topic = await getTopic(entry.id);
      trailIdsByTopic.set(entry.id, topic ? topic.trailIds : []);
    } catch (error) {
      console.warn('[Topics] Feed topic read failed:', {
        topicId: entry.id,
        error: error instanceof Error ? error.message : String(error),
      });
      trailIdsByTopic.set(entry.id, []);
    }
  });

  // Resolve each distinct trail id to its repo exactly once.
  const uniqueTrailIds = [
    ...new Set([...trailIdsByTopic.values()].flat()),
  ];
  const repoByTrailId = new Map<string, RepoRef | null>();
  await mapWithConcurrency(
    uniqueTrailIds,
    POINTER_FETCH_CONCURRENCY,
    async (trailId) => {
      try {
        const pointer = await getIdPointer(trailId);
        repoByTrailId.set(
          trailId,
          pointer ? { owner: pointer.owner, repo: pointer.repo } : null,
        );
      } catch (error) {
        console.warn('[Topics] Feed pointer read failed:', {
          trailId,
          error: error instanceof Error ? error.message : String(error),
        });
        repoByTrailId.set(trailId, null);
      }
    },
  );

  const reposByTopic = new Map<string, RepoRef[]>();
  for (const [topicId, trailIds] of trailIdsByTopic) {
    const seen = new Map<string, RepoRef>();
    for (const trailId of trailIds) {
      const ref = repoByTrailId.get(trailId);
      if (ref) seen.set(`${ref.owner}/${ref.repo}`, ref);
    }
    reposByTopic.set(
      topicId,
      [...seen.values()].sort((a, b) => {
        const byOwner = a.owner.localeCompare(b.owner, undefined, {
          sensitivity: 'base',
        });
        if (byOwner !== 0) return byOwner;
        return a.repo.localeCompare(b.repo, undefined, { sensitivity: 'base' });
      }),
    );
  }
  return reposByTopic;
}

export async function GET() {
  try {
    const ownerIds = await listTopicOwnerIds();

    const perOwner = await mapWithConcurrency(
      ownerIds,
      MANIFEST_FETCH_CONCURRENCY,
      async (githubId): Promise<PartialFeedEntry[]> => {
        const index = await getTopicsByUser(githubId);
        if (index.entries.length === 0) return [];

        const githubLogin = await resolveOwnerLogin(githubId, index);
        if (!githubLogin) return [];

        // Anonymous, 24h-cached; null when the user has no name set, so we
        // fall back to the login.
        const displayName =
          (await getGitHubDisplayName(githubLogin)) ?? githubLogin;

        return index.entries.map((entry) => ({
          id: entry.id,
          title: entry.title,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
          author: { githubId, githubLogin, displayName },
        }));
      },
    );

    const partials = perOwner.flat();
    const reposByTopic = await resolveReposByTopic(partials);

    const topics: TopicFeedEntry[] = partials
      .map((entry) => ({
        ...entry,
        repos: reposByTopic.get(entry.id) ?? [],
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    const response: ListTopicsFeedResponse = { topics };
    return NextResponse.json(response);
  } catch (error) {
    console.error('[Topics] List feed error:', error);
    return NextResponse.json(
      { error: 'Failed to list topics feed' },
      { status: 500 },
    );
  }
}
