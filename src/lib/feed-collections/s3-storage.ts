/**
 * S3 Storage for the Commit Feed State (Swipe Feed)
 *
 * Handles storing and retrieving each user's commit-feed state — passed
 * commits and saved activity cards.
 *
 * S3 Structure:
 *   commit-feed/{github-user-id}.json  - Per-user passed/saved card state
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import type { CommitFeedState } from './types';

// Initialize S3 client with IAM role credentials
const s3Client = new S3Client({
  region: process.env.FEED_COLLECTIONS_AWS_REGION || 'us-east-1',
  // Credentials auto-detected from Amplify IAM role - no keys needed
});

const BUCKET_NAME =
  process.env.FEED_COLLECTIONS_S3_BUCKET || 'feed-collections';

// ============================================================================
// Commit Feed State Operations
// ============================================================================

/**
 * Builds S3 key for a user's commit feed state
 * Pattern: commit-feed/{github-user-id}.json
 */
export function buildCommitFeedStateS3Key(githubId: string): string {
  return `commit-feed/${githubId}.json`;
}

/**
 * Retrieves a user's commit feed state from S3
 *
 * @param githubId - User's GitHub ID
 * @returns Commit feed state or null if not found
 */
export async function getCommitFeedState(
  githubId: string
): Promise<CommitFeedState | null> {
  try {
    const s3Key = buildCommitFeedStateS3Key(githubId);
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
      })
    );

    const data = await response.Body?.transformToString();
    if (!data) {
      return null;
    }

    const state = JSON.parse(data) as CommitFeedState;

    console.log('[Commit Feed] Retrieved feed state:', {
      githubId,
      passedCommitCount: Object.keys(state.passedCommits || {}).length,
      savedCount: state.savedCards.length,
    });

    return state;
  } catch (error: unknown) {
    if (
      error &&
      typeof error === 'object' &&
      'name' in error &&
      error.name === 'NoSuchKey'
    ) {
      console.log('[Commit Feed] Feed state not found:', { githubId });
      return null;
    }

    console.error('[Commit Feed] Get feed state failed:', {
      githubId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error('S3_ERROR');
  }
}

/**
 * Stores a user's commit feed state to S3
 *
 * @param state - Commit feed state data
 * @returns S3 key where state was stored
 */
export async function storeCommitFeedState(
  state: CommitFeedState
): Promise<string> {
  try {
    const s3Key = buildCommitFeedStateS3Key(state.githubId);

    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: JSON.stringify(state, null, 2),
        ContentType: 'application/json',
        CacheControl: 'max-age=60',
        Metadata: {
          'github-id': state.githubId,
          'passed-commit-count': String(Object.keys(state.passedCommits).length),
          'saved-count': String(state.savedCards.length),
          'updated-at': state.updatedAt,
        },
      })
    );

    console.log('[Commit Feed] Stored feed state:', {
      githubId: state.githubId,
      passedCommitCount: Object.keys(state.passedCommits).length,
      savedCount: state.savedCards.length,
    });

    return s3Key;
  } catch (error) {
    console.error('[Commit Feed] Store feed state failed:', {
      githubId: state.githubId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error('S3_ERROR');
  }
}

/**
 * Gets or creates a commit feed state for a user
 *
 * @param githubId - User's GitHub ID
 * @returns Existing or new commit feed state
 */
export async function getOrCreateCommitFeedState(
  githubId: string
): Promise<CommitFeedState> {
  const existing = await getCommitFeedState(githubId);
  if (existing) {
    // Migrate old format if needed (passed: string[] -> passedCommits: Record<string, string[]>)
    if (!existing.passedCommits) {
      existing.passedCommits = {};
      // Old passed itemIds can't be migrated to SHAs, just clear them
      delete (existing as unknown as Record<string, unknown>).passed;
    }
    return existing;
  }

  const newState: CommitFeedState = {
    githubId,
    passedCommits: {},
    savedCards: [],
    updatedAt: new Date().toISOString(),
  };

  return newState;
}
