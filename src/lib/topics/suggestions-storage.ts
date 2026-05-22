/**
 * S3 storage for topic trail suggestions.
 *
 * Layout:
 *   topics/_suggestions/{topicId}.json   - container object holding the full
 *                                          suggestion list (pending + resolved)
 *
 * One object per topic; the realistic write-contention case is concurrent
 * suggestion posts from different users, so the ETag-locked read-modify-write
 * pattern from `comments-storage.ts` applies directly. Resolved suggestions
 * (accepted / rejected / withdrawn) stay in the container as an audit trail
 * and only `pending` counts against MAX_PENDING_SUGGESTIONS_PER_TOPIC.
 *
 * Authorization split: the route checks topic ownership (for accept/reject)
 * and authentication (for all mutators). This module re-checks suggester
 * identity for `withdraw` under the lock — the only authorization that
 * depends on the canonical suggestion record. Accept/reject trust the route
 * to have verified ownership; they only enforce "still pending" here.
 *
 * Accept is a two-write operation across two different S3 objects (the
 * topic record + this suggestions container). The route's responsibility is
 * to update the topic record FIRST (idempotently appending the trailId)
 * and THEN call `acceptSuggestion` to flip status. If the second write
 * fails, the suggestion stays `pending` and the owner can retry — the
 * topic update is a no-op the second time because the trailId is already
 * present. This trades atomicity for a self-healing recovery story; see
 * docs/topic-trail-suggestions.md for the full reasoning.
 */

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import {
  BUCKET_NAME,
  BUCKET_REGION,
  MAX_ETAG_RETRIES,
  MAX_PENDING_SUGGESTIONS_PER_TOPIC,
  PAYLOAD_CACHE_CONTROL,
  S3_PREFIX,
} from './constants';
import {
  TopicErrorCodes,
  TopicShareError,
  isProjectSuggestion,
  type ProjectSuggestion,
  type TopicSuggestion,
  type TopicSuggestionsContainer,
  type TrailSuggestion,
} from './types';

const s3Client = new S3Client({ region: BUCKET_REGION });

export function buildSuggestionsKey(topicId: string): string {
  return `${S3_PREFIX}/_suggestions/${topicId}.json`;
}

function emptyContainer(topicId: string): TopicSuggestionsContainer {
  return {
    version: 1,
    topicId,
    updatedAt: new Date().toISOString(),
    suggestions: [],
  };
}

function isNoSuchKey(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'name' in error &&
    (error as { name: string }).name === 'NoSuchKey'
  );
}

function isEtagConflict(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'name' in error &&
    ((error as { name: string }).name === 'PreconditionFailed' ||
      (error as { name: string }).name === '412')
  );
}

async function getContainerWithETag(
  topicId: string,
): Promise<{ data: TopicSuggestionsContainer; etag: string } | null> {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: buildSuggestionsKey(topicId),
      }),
    );
    const body = await response.Body?.transformToString();
    if (!body) return null;
    return {
      data: JSON.parse(body) as TopicSuggestionsContainer,
      etag: response.ETag || '',
    };
  } catch (error: unknown) {
    if (isNoSuchKey(error)) return null;
    console.error('[TopicSuggestions] Get container failed:', {
      topicId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TopicShareError(
      'Failed to retrieve suggestions',
      500,
      TopicErrorCodes.S3_ERROR,
    );
  }
}

async function putContainerWithETag(
  data: TopicSuggestionsContainer,
  etag: string | null,
): Promise<void> {
  try {
    const params: {
      Bucket: string;
      Key: string;
      Body: string;
      ContentType: string;
      CacheControl: string;
      IfMatch?: string;
      IfNoneMatch?: string;
    } = {
      Bucket: BUCKET_NAME,
      Key: buildSuggestionsKey(data.topicId),
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json',
      CacheControl: PAYLOAD_CACHE_CONTROL,
    };
    if (etag) {
      params.IfMatch = etag;
    } else {
      params.IfNoneMatch = '*';
    }
    await s3Client.send(new PutObjectCommand(params));
  } catch (error: unknown) {
    if (isEtagConflict(error)) {
      throw new TopicShareError(
        'Concurrent modification detected',
        409,
        TopicErrorCodes.ETAG_CONFLICT,
      );
    }
    console.error('[TopicSuggestions] Put container failed:', {
      topicId: data.topicId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TopicShareError(
      'Failed to save suggestions',
      500,
      TopicErrorCodes.S3_ERROR,
    );
  }
}

/**
 * Public read. Returns an empty container when no suggestions exist yet so
 * callers can render an empty queue without a special "never written" branch.
 */
export async function listSuggestions(
  topicId: string,
): Promise<TopicSuggestionsContainer> {
  const result = await getContainerWithETag(topicId);
  return result ? result.data : emptyContainer(topicId);
}

/**
 * Look up a single suggestion without locking. Callers that need the
 * suggestion's trailId before performing a cross-object update (e.g.
 * `acceptSuggestion` workflow) use this; mutators re-fetch under the lock.
 */
export async function getSuggestion(
  topicId: string,
  suggestionId: string,
): Promise<TopicSuggestion | null> {
  const result = await getContainerWithETag(topicId);
  if (!result) return null;
  return result.data.suggestions.find((s) => s.id === suggestionId) ?? null;
}

async function modifyContainer(
  topicId: string,
  modifier: (current: TopicSuggestionsContainer) => TopicSuggestionsContainer,
  options: { createIfMissing: boolean },
): Promise<TopicSuggestionsContainer> {
  let attempts = 0;
  while (attempts < MAX_ETAG_RETRIES) {
    const current = await getContainerWithETag(topicId);
    if (!current && !options.createIfMissing) {
      throw new TopicShareError(
        'Suggestion not found',
        404,
        TopicErrorCodes.SUGGESTION_NOT_FOUND,
      );
    }
    const base = current ? current.data : emptyContainer(topicId);
    const etag = current ? current.etag : null;
    const updated = modifier(base);
    updated.updatedAt = new Date().toISOString();
    try {
      await putContainerWithETag(updated, etag);
      return updated;
    } catch (error) {
      if (
        error instanceof TopicShareError &&
        error.code === TopicErrorCodes.ETAG_CONFLICT
      ) {
        attempts++;
        if (attempts >= MAX_ETAG_RETRIES) {
          throw new TopicShareError(
            'Concurrent modification conflict — please retry',
            409,
            TopicErrorCodes.MAX_RETRIES,
          );
        }
        await new Promise((r) => setTimeout(r, 100 * attempts));
        continue;
      }
      throw error;
    }
  }
  throw new TopicShareError(
    'Update failed after retries',
    500,
    TopicErrorCodes.S3_ERROR,
  );
}

function checkPendingCap(container: TopicSuggestionsContainer): void {
  const pendingCount = container.suggestions.filter(
    (s) => s.status === 'pending',
  ).length;
  if (pendingCount >= MAX_PENDING_SUGGESTIONS_PER_TOPIC) {
    throw new TopicShareError(
      `Pending suggestion limit reached (${MAX_PENDING_SUGGESTIONS_PER_TOPIC}) for this topic`,
      409,
      TopicErrorCodes.SUGGESTION_LIMIT_REACHED,
    );
  }
}

export async function appendSuggestion(
  topicId: string,
  input: {
    trailId: string;
    reason?: string;
    suggestedBy: { githubId: number; githubLogin: string };
  },
): Promise<TrailSuggestion> {
  const now = new Date().toISOString();
  const suggestion: TrailSuggestion = {
    id: randomUUID(),
    topicId,
    kind: 'trail',
    trailId: input.trailId,
    ...(input.reason ? { reason: input.reason } : {}),
    suggestedBy: input.suggestedBy,
    status: 'pending',
    createdAt: now,
  };
  await modifyContainer(
    topicId,
    (container) => {
      checkPendingCap(container);
      const duplicate = container.suggestions.find(
        (s) =>
          s.status === 'pending' &&
          !isProjectSuggestion(s) &&
          s.trailId === input.trailId &&
          s.suggestedBy.githubId === input.suggestedBy.githubId,
      );
      if (duplicate) {
        throw new TopicShareError(
          'You already have a pending suggestion for this trail',
          409,
          TopicErrorCodes.SUGGESTION_DUPLICATE,
        );
      }
      return {
        ...container,
        suggestions: [...container.suggestions, suggestion],
      };
    },
    { createIfMissing: true },
  );
  return suggestion;
}

/**
 * Append a project suggestion (a repo flagged as worth trails). Dedup keys
 * on (owner, repo) per-suggester so the same person can't queue the same
 * repo twice while it's pending — case-insensitive because GitHub
 * owner/repo segments are case-folded on the platform side.
 */
export async function appendProjectSuggestion(
  topicId: string,
  input: {
    owner: string;
    repo: string;
    githubRepoId?: number;
    reason?: string;
    suggestedBy: { githubId: number; githubLogin: string };
  },
): Promise<ProjectSuggestion> {
  const now = new Date().toISOString();
  const suggestion: ProjectSuggestion = {
    id: randomUUID(),
    topicId,
    kind: 'project',
    owner: input.owner,
    repo: input.repo,
    // 0 sentinel keeps the field present but flags it as unverified — the
    // route can backfill via the GitHub API in a follow-up. Until then the
    // owner/repo string match handles the join.
    githubRepoId: input.githubRepoId ?? 0,
    ...(input.reason ? { reason: input.reason } : {}),
    suggestedBy: input.suggestedBy,
    status: 'pending',
    createdAt: now,
  };
  const ownerLc = input.owner.toLowerCase();
  const repoLc = input.repo.toLowerCase();
  await modifyContainer(
    topicId,
    (container) => {
      checkPendingCap(container);
      const duplicate = container.suggestions.find(
        (s) =>
          s.status === 'pending' &&
          isProjectSuggestion(s) &&
          s.owner.toLowerCase() === ownerLc &&
          s.repo.toLowerCase() === repoLc &&
          s.suggestedBy.githubId === input.suggestedBy.githubId,
      );
      if (duplicate) {
        throw new TopicShareError(
          'You already have a pending suggestion for this project',
          409,
          TopicErrorCodes.SUGGESTION_DUPLICATE,
        );
      }
      return {
        ...container,
        suggestions: [...container.suggestions, suggestion],
      };
    },
    { createIfMissing: true },
  );
  return suggestion;
}

/**
 * Auto-flip any pending or accepted project suggestion whose repo matches
 * `match` to `resolved`. Match is by `githubRepoId` when available (rename-
 * stable) and falls back to a case-insensitive owner/repo string match for
 * legacy or unverified records. Called by the trail-add and accept-trail-
 * suggestion routes after a trail is appended to a topic. Returns the
 * resolved suggestions so the caller can surface them in the response.
 *
 * Best-effort: storage errors propagate but the topic-side write has
 * already happened, so a failure here just means the suggestion stays in
 * its pre-resolve state — the next match attempt will fix it.
 */
export async function resolveProjectSuggestionsForRepo(
  topicId: string,
  match: { owner: string; repo: string; githubRepoId?: number },
): Promise<ProjectSuggestion[]> {
  const matchRepoId = match.githubRepoId ?? 0;
  const ownerLc = match.owner.toLowerCase();
  const repoLc = match.repo.toLowerCase();
  let resolved: ProjectSuggestion[] = [];
  const current = await getContainerWithETag(topicId);
  if (!current) return [];
  const matches = current.data.suggestions.filter((s): s is ProjectSuggestion => {
    if (!isProjectSuggestion(s)) return false;
    if (s.status !== 'pending' && s.status !== 'accepted') return false;
    if (s.githubRepoId > 0 && matchRepoId > 0)
      return s.githubRepoId === matchRepoId;
    return s.owner.toLowerCase() === ownerLc && s.repo.toLowerCase() === repoLc;
  });
  if (matches.length === 0) return [];
  const matchIds = new Set(matches.map((s) => s.id));
  const now = new Date().toISOString();
  await modifyContainer(
    topicId,
    (container) => {
      const next: TopicSuggestion[] = [];
      const flipped: ProjectSuggestion[] = [];
      for (const s of container.suggestions) {
        if (
          isProjectSuggestion(s) &&
          matchIds.has(s.id) &&
          (s.status === 'pending' || s.status === 'accepted')
        ) {
          const after: ProjectSuggestion = {
            ...s,
            status: 'resolved',
            resolvedAt: now,
          };
          next.push(after);
          flipped.push(after);
        } else {
          next.push(s);
        }
      }
      resolved = flipped;
      return { ...container, suggestions: next };
    },
    { createIfMissing: false },
  );
  return resolved;
}

function resolvePending(
  container: TopicSuggestionsContainer,
  suggestionId: string,
  patch: {
    status: 'accepted' | 'rejected' | 'withdrawn';
    actor: { githubId: number; githubLogin: string };
    requireSuggester?: boolean;
    reason?: string;
  },
): { container: TopicSuggestionsContainer; suggestion: TopicSuggestion } {
  const existing = container.suggestions.find((s) => s.id === suggestionId);
  if (!existing) {
    throw new TopicShareError(
      'Suggestion not found',
      404,
      TopicErrorCodes.SUGGESTION_NOT_FOUND,
    );
  }
  if (existing.status !== 'pending') {
    throw new TopicShareError(
      `Suggestion already ${existing.status}`,
      409,
      TopicErrorCodes.SUGGESTION_ALREADY_RESOLVED,
    );
  }
  if (
    patch.requireSuggester &&
    existing.suggestedBy.githubId !== patch.actor.githubId
  ) {
    throw new TopicShareError(
      'Only the suggester can withdraw this suggestion',
      403,
      TopicErrorCodes.SUGGESTION_FORBIDDEN,
    );
  }
  const next: TopicSuggestion = {
    ...existing,
    status: patch.status,
    resolvedAt: new Date().toISOString(),
    resolvedBy: patch.actor,
    ...(patch.reason ? { resolveReason: patch.reason } : {}),
  };
  return {
    container: {
      ...container,
      suggestions: container.suggestions.map((s) =>
        s.id === suggestionId ? next : s,
      ),
    },
    suggestion: next,
  };
}

/**
 * Flip a pending suggestion to `accepted`. The route must have already
 * verified that the actor owns the topic AND appended the trail to the
 * topic record. Order matters: see file header.
 */
export async function acceptSuggestion(
  topicId: string,
  suggestionId: string,
  actor: { githubId: number; githubLogin: string },
): Promise<TopicSuggestion> {
  let resolved: TopicSuggestion | null = null;
  await modifyContainer(
    topicId,
    (container) => {
      const result = resolvePending(container, suggestionId, {
        status: 'accepted',
        actor,
      });
      resolved = result.suggestion;
      return result.container;
    },
    { createIfMissing: false },
  );
  if (!resolved) {
    throw new TopicShareError(
      'Suggestion not found',
      404,
      TopicErrorCodes.SUGGESTION_NOT_FOUND,
    );
  }
  return resolved;
}

export async function rejectSuggestion(
  topicId: string,
  suggestionId: string,
  actor: { githubId: number; githubLogin: string },
  reason?: string,
): Promise<TopicSuggestion> {
  let resolved: TopicSuggestion | null = null;
  await modifyContainer(
    topicId,
    (container) => {
      const result = resolvePending(container, suggestionId, {
        status: 'rejected',
        actor,
        reason,
      });
      resolved = result.suggestion;
      return result.container;
    },
    { createIfMissing: false },
  );
  if (!resolved) {
    throw new TopicShareError(
      'Suggestion not found',
      404,
      TopicErrorCodes.SUGGESTION_NOT_FOUND,
    );
  }
  return resolved;
}

/**
 * Withdraw a pending suggestion. Storage re-verifies `actor` matches the
 * original `suggestedBy` under the lock so the route doesn't have to load
 * the suggestion separately to authorize.
 */
export async function withdrawSuggestion(
  topicId: string,
  suggestionId: string,
  actor: { githubId: number; githubLogin: string },
): Promise<TopicSuggestion> {
  let resolved: TopicSuggestion | null = null;
  await modifyContainer(
    topicId,
    (container) => {
      const result = resolvePending(container, suggestionId, {
        status: 'withdrawn',
        actor,
        requireSuggester: true,
      });
      resolved = result.suggestion;
      return result.container;
    },
    { createIfMissing: false },
  );
  if (!resolved) {
    throw new TopicShareError(
      'Suggestion not found',
      404,
      TopicErrorCodes.SUGGESTION_NOT_FOUND,
    );
  }
  return resolved;
}

/**
 * Tear down the suggestions container for a topic. Intended for the topic
 * DELETE path so removing a topic also removes its suggestion queue.
 * Best-effort: a missing container is a no-op.
 */
export async function deleteSuggestionsContainer(
  topicId: string,
): Promise<void> {
  try {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: buildSuggestionsKey(topicId),
      }),
    );
  } catch (error) {
    console.error('[TopicSuggestions] Delete container failed:', {
      topicId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TopicShareError(
      'Failed to delete suggestions',
      500,
      TopicErrorCodes.S3_ERROR,
    );
  }
}
