/**
 * S3 storage for topic comments.
 *
 * Layout:
 *   topics/_comments/{topicId}.json   - container object holding the full
 *                                       ordered comment list for a topic
 *
 * One object per topic — reads are list-oriented (the thread renders the
 * whole conversation) and the upper bound is small (MAX_COMMENTS_PER_TOPIC).
 * Concurrent comment posts are the realistic write-contention case, so the
 * ETag-locked read-modify-write pattern from `s3-storage.ts` matters here.
 *
 * Authorization for mutate operations is partly the route's job (it loads
 * the topic record to learn who the owner is) and partly this module's
 * (it matches the comment author under the ETag lock). Edits are
 * author-only — the topic owner has no edit power, only delete (the
 * `allowAsTopicOwner` flag on `deleteComment` reflects this asymmetry).
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
  MAX_COMMENTS_PER_TOPIC,
  MAX_ETAG_RETRIES,
  PAYLOAD_CACHE_CONTROL,
  S3_PREFIX,
} from './constants';
import {
  TopicErrorCodes,
  TopicShareError,
  type TopicComment,
  type TopicCommentsContainer,
} from './types';

const s3Client = new S3Client({ region: BUCKET_REGION });

export function buildCommentsKey(topicId: string): string {
  return `${S3_PREFIX}/_comments/${topicId}.json`;
}

function emptyContainer(topicId: string): TopicCommentsContainer {
  return {
    version: 1,
    topicId,
    updatedAt: new Date().toISOString(),
    comments: [],
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
): Promise<{ data: TopicCommentsContainer; etag: string } | null> {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: buildCommentsKey(topicId),
      }),
    );
    const body = await response.Body?.transformToString();
    if (!body) return null;
    return {
      data: JSON.parse(body) as TopicCommentsContainer,
      etag: response.ETag || '',
    };
  } catch (error: unknown) {
    if (isNoSuchKey(error)) return null;
    console.error('[TopicComments] Get container failed:', {
      topicId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TopicShareError(
      'Failed to retrieve comments',
      500,
      TopicErrorCodes.S3_ERROR,
    );
  }
}

async function putContainerWithETag(
  data: TopicCommentsContainer,
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
      Key: buildCommentsKey(data.topicId),
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json',
      CacheControl: PAYLOAD_CACHE_CONTROL,
    };
    if (etag) {
      params.IfMatch = etag;
    } else {
      // No existing container — refuse to clobber a concurrent first-write.
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
    console.error('[TopicComments] Put container failed:', {
      topicId: data.topicId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TopicShareError(
      'Failed to save comments',
      500,
      TopicErrorCodes.S3_ERROR,
    );
  }
}

/**
 * Public read. Returns an empty container when no comments exist yet so
 * callers can render the thread without a special "never written" branch.
 */
export async function listComments(
  topicId: string,
): Promise<TopicCommentsContainer> {
  const result = await getContainerWithETag(topicId);
  return result ? result.data : emptyContainer(topicId);
}

/**
 * ETag-locked read-modify-write against the comments container. The
 * modifier may throw `TopicShareError` to surface domain errors (limit
 * reached, comment-not-found, forbidden); those propagate unchanged so the
 * route can map them to HTTP codes.
 *
 * Pass `createIfMissing: true` to allow the first write to mint the
 * container (used by `appendComment`); update/delete demand it exist.
 */
async function modifyContainer(
  topicId: string,
  modifier: (current: TopicCommentsContainer) => TopicCommentsContainer,
  options: { createIfMissing: boolean },
): Promise<TopicCommentsContainer> {
  let attempts = 0;
  while (attempts < MAX_ETAG_RETRIES) {
    const current = await getContainerWithETag(topicId);
    if (!current && !options.createIfMissing) {
      throw new TopicShareError(
        'Comment not found',
        404,
        TopicErrorCodes.COMMENT_NOT_FOUND,
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

export async function appendComment(
  topicId: string,
  input: {
    body: string;
    author: { githubId: number; githubLogin: string };
  },
): Promise<TopicComment> {
  const now = new Date().toISOString();
  const comment: TopicComment = {
    id: randomUUID(),
    topicId,
    body: input.body,
    author: input.author,
    createdAt: now,
    updatedAt: now,
  };
  await modifyContainer(
    topicId,
    (container) => {
      if (container.comments.length >= MAX_COMMENTS_PER_TOPIC) {
        throw new TopicShareError(
          `Comment limit reached (${MAX_COMMENTS_PER_TOPIC}) for this topic`,
          409,
          TopicErrorCodes.COMMENT_LIMIT_REACHED,
        );
      }
      return { ...container, comments: [...container.comments, comment] };
    },
    { createIfMissing: true },
  );
  return comment;
}

function authorizeAuthorOnly(
  comment: TopicComment,
  actorGithubId: number,
): void {
  if (comment.author.githubId === actorGithubId) return;
  throw new TopicShareError(
    'Not allowed to modify this comment',
    403,
    TopicErrorCodes.COMMENT_FORBIDDEN,
  );
}

function authorizeAuthorOrOwner(
  comment: TopicComment,
  actorGithubId: number,
  allowAsTopicOwner: boolean,
): void {
  if (comment.author.githubId === actorGithubId) return;
  if (allowAsTopicOwner) return;
  throw new TopicShareError(
    'Not allowed to modify this comment',
    403,
    TopicErrorCodes.COMMENT_FORBIDDEN,
  );
}

export async function updateComment(
  topicId: string,
  commentId: string,
  input: {
    body: string;
    actorGithubId: number;
  },
): Promise<TopicComment> {
  let updated: TopicComment | null = null;
  await modifyContainer(
    topicId,
    (container) => {
      const existing = container.comments.find((c) => c.id === commentId);
      if (!existing) {
        throw new TopicShareError(
          'Comment not found',
          404,
          TopicErrorCodes.COMMENT_NOT_FOUND,
        );
      }
      authorizeAuthorOnly(existing, input.actorGithubId);
      const next: TopicComment = {
        ...existing,
        body: input.body,
        updatedAt: new Date().toISOString(),
      };
      updated = next;
      return {
        ...container,
        comments: container.comments.map((c) =>
          c.id === commentId ? next : c,
        ),
      };
    },
    { createIfMissing: false },
  );
  // modifyContainer either returns or throws; if it returned, `updated` is set.
  if (!updated) {
    throw new TopicShareError(
      'Comment not found',
      404,
      TopicErrorCodes.COMMENT_NOT_FOUND,
    );
  }
  return updated;
}

export async function deleteComment(
  topicId: string,
  commentId: string,
  input: {
    actorGithubId: number;
    allowAsTopicOwner: boolean;
  },
): Promise<void> {
  await modifyContainer(
    topicId,
    (container) => {
      const existing = container.comments.find((c) => c.id === commentId);
      if (!existing) {
        throw new TopicShareError(
          'Comment not found',
          404,
          TopicErrorCodes.COMMENT_NOT_FOUND,
        );
      }
      authorizeAuthorOrOwner(
        existing,
        input.actorGithubId,
        input.allowAsTopicOwner,
      );
      return {
        ...container,
        comments: container.comments.filter((c) => c.id !== commentId),
      };
    },
    { createIfMissing: false },
  );
}

/**
 * Remove the entire comments container for a topic. Intended for the topic
 * DELETE path so an owner removing a topic also tears down its discussion.
 * Best-effort: a missing container is a no-op.
 */
export async function deleteCommentsContainer(topicId: string): Promise<void> {
  try {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: buildCommentsKey(topicId),
      }),
    );
  } catch (error) {
    console.error('[TopicComments] Delete container failed:', {
      topicId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TopicShareError(
      'Failed to delete comments',
      500,
      TopicErrorCodes.S3_ERROR,
    );
  }
}
