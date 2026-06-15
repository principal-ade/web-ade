/**
 * Feed Router
 *
 * tRPC router for the commit-activity saved-card system (swipe feed) and
 * per-repo activity. The legacy feed-collections + watch surfaces it once
 * carried have been removed.
 */

import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { cookies, headers } from 'next/headers';
import {
  getOrCreateCommitFeedState,
  storeCommitFeedState,
} from '@/lib/commit-feed/s3-storage';
import type {
  SavedActivityCard,
} from '@/lib/commit-feed/types';

// ============================================================================
// Auth Helpers
// ============================================================================

/**
 * Get GitHub token from Authorization header (Bearer) or cookie
 * Supports both mobile (Bearer token) and web (cookie) authentication
 */
async function getGitHubToken(): Promise<string | null> {
  try {
    // Check Authorization header first (for mobile/API clients)
    const headerStore = await headers();
    const authHeader = headerStore.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    // Fall back to cookie (for web clients)
    const cookieStore = await cookies();
    return cookieStore.get('github_token')?.value || null;
  } catch {
    return null;
  }
}

/**
 * Get GitHub user ID from cookie (web clients only)
 * For Bearer token auth, we fetch from GitHub API instead
 */
async function getGitHubUserIdFromCookie(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get('github_user_id')?.value || null;
  } catch {
    return null;
  }
}

/**
 * Get GitHub login from cookie (web clients only)
 * For Bearer token auth, we fetch from GitHub API instead
 */
async function getGitHubLoginFromCookie(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get('github_login')?.value || null;
  } catch {
    return null;
  }
}

/**
 * Fetch GitHub user info using token
 */
async function fetchGitHubUser(
  token: string
): Promise<{ id: string; login: string } | null> {
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `token ${token}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { id: number; login: string };
    return { id: String(data.id), login: data.login };
  } catch {
    return null;
  }
}

interface AuthContext {
  token: string;
  githubId: string;
  githubLogin: string;
}

async function requireAuth(): Promise<AuthContext> {
  const token = await getGitHubToken();

  if (!token) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Please sign in with GitHub to access this feature',
    });
  }

  // Try cookies first (web clients)
  let githubId = await getGitHubUserIdFromCookie();
  let githubLogin = await getGitHubLoginFromCookie();

  // If no cookies, fetch from GitHub API (mobile/API clients)
  if (!githubId || !githubLogin) {
    const user = await fetchGitHubUser(token);
    if (!user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Invalid GitHub token',
      });
    }
    githubId = user.id;
    githubLogin = user.login;
  }

  return { token, githubId, githubLogin };
}


// ============================================================================
// Router
// ============================================================================

export const feedRouter = router({
  // ==========================================================================
  // Commit Activity Feed Endpoints (Swipe Feed)
  // ==========================================================================

  /**
   * Pass a card (swipe left) - mark commits as seen, don't show again
   * Tracks individual commit SHAs so new commits for the same repo/hour still appear
   * Requires authentication
   */
  passCard: publicProcedure
    .input(
      z.object({
        itemId: z.string(),
        seenCommitShas: z.array(z.string()),
      })
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ input }) => {
      const auth = await requireAuth();

      const feedState = await getOrCreateCommitFeedState(auth.githubId);

      // Merge new SHAs with existing ones for this itemId
      const existingShas = feedState.passedCommits[input.itemId] || [];
      const newShas = input.seenCommitShas.filter(
        (sha) => !existingShas.includes(sha)
      );

      if (newShas.length > 0) {
        feedState.passedCommits[input.itemId] = [...existingShas, ...newShas];
        feedState.updatedAt = new Date().toISOString();
        await storeCommitFeedState(feedState);
      }

      return { success: true };
    }),

  /**
   * Save an activity card (swipe right) - store snapshot for later reference
   * Requires authentication
   */
  saveCard: publicProcedure
    .input(
      z.object({
        itemId: z.string(),
        repo: z.object({
          owner: z.string(),
          name: z.string(),
        }),
        hour: z.number(),
        hourBucket: z.string(),
        commits: z.array(
          z.object({
            sha: z.string(),
            message: z.string(),
            author: z.object({
              login: z.string(),
              avatarUrl: z.string().optional(),
            }),
            committedAt: z.string(),
            url: z.string(),
          })
        ),
        commitCount: z.number(),
        latestCommitAt: z.string(),
      })
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ input }) => {
      const auth = await requireAuth();

      const feedState = await getOrCreateCommitFeedState(auth.githubId);

      // Check if already saved
      if (feedState.savedCards.some((c) => c.itemId === input.itemId)) {
        return { success: true };
      }

      // Add to saved with timestamp
      const savedCard: SavedActivityCard = {
        ...input,
        savedAt: new Date().toISOString(),
      };

      feedState.savedCards.push(savedCard);
      feedState.updatedAt = new Date().toISOString();
      await storeCommitFeedState(feedState);

      return { success: true };
    }),

  /**
   * Get saved activity cards
   * Requires authentication
   */
  getSavedCards: publicProcedure
    .output(
      z.object({
        savedCards: z.array(
          z.object({
            itemId: z.string(),
            repo: z.object({
              owner: z.string(),
              name: z.string(),
            }),
            hour: z.number(),
            hourBucket: z.string(),
            commits: z.array(
              z.object({
                sha: z.string(),
                message: z.string(),
                author: z.object({
                  login: z.string(),
                  avatarUrl: z.string().optional(),
                }),
                committedAt: z.string(),
                url: z.string(),
              })
            ),
            commitCount: z.number(),
            latestCommitAt: z.string(),
            savedAt: z.string(),
          })
        ),
      })
    )
    .query(async () => {
      const auth = await requireAuth();

      const feedState = await getOrCreateCommitFeedState(auth.githubId);

      // Return saved cards sorted by savedAt (newest first)
      const savedCards = [...feedState.savedCards].sort(
        (a, b) =>
          new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
      );

      return { savedCards };
    }),

  /**
   * Unsave a card - remove from saved list
   * Requires authentication
   */
  unsaveCard: publicProcedure
    .input(z.object({ itemId: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ input }) => {
      const auth = await requireAuth();

      const feedState = await getOrCreateCommitFeedState(auth.githubId);

      feedState.savedCards = feedState.savedCards.filter(
        (c) => c.itemId !== input.itemId
      );
      feedState.updatedAt = new Date().toISOString();
      await storeCommitFeedState(feedState);

      return { success: true };
    }),

  /**
   * Get commit activity for a specific repository
   * Fetches commits directly from GitHub for the given repo
   */
  getRepoActivity: publicProcedure
    .input(
      z.object({
        owner: z.string(),
        repo: z.string(),
        hoursBack: z.number().min(1).max(168).optional().default(168),
      })
    )
    .output(
      z.object({
        commits: z.array(
          z.object({
            timestamp: z.string(),
            repoId: z.string(),
            authorLogin: z.string(),
            authorAvatarUrl: z.string().optional(),
          })
        ),
        timeRange: z.object({
          start: z.string(),
          end: z.string(),
        }),
      })
    )
    .query(async ({ input }) => {
      const { owner, repo, hoursBack } = input;
      const token = await getGitHubToken();

      const now = new Date();
      const startTime = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);
      const sinceISO = startTime.toISOString();

      console.log(`[RepoActivity] Fetching commits for ${owner}/${repo} from ${sinceISO} to ${now.toISOString()} (${hoursBack} hours back)`);

      const commits: Array<{
        timestamp: string;
        repoId: string;
        authorLogin: string;
        authorAvatarUrl?: string;
      }> = [];

      try {
        const response = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/commits?since=${sinceISO}&per_page=100`,
          {
            headers: {
              Accept: 'application/vnd.github.v3+json',
              ...(token ? { Authorization: `token ${token}` } : {}),
            },
          }
        );

        if (response.ok) {
          const data = (await response.json()) as Array<{
            sha: string;
            commit: { author: { date: string } };
            author: { login: string; avatar_url: string } | null;
          }>;

          for (const commit of data) {
            commits.push({
              timestamp: commit.commit.author.date,
              repoId: `${owner}/${repo}`,
              authorLogin: commit.author?.login ?? 'unknown',
              authorAvatarUrl: commit.author?.avatar_url,
            });
          }
        }
        console.log(`[RepoActivity] Got ${commits.length} commits for ${owner}/${repo}`);
      } catch (error) {
        console.error(
          `[RepoActivity] Failed to fetch commits for ${owner}/${repo}:`,
          error
        );
      }

      // Sort by timestamp (newest first)
      commits.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      return {
        commits,
        timeRange: {
          start: startTime.toISOString(),
          end: now.toISOString(),
        },
      };
    }),
});

export type FeedRouter = typeof feedRouter;
