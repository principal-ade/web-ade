/**
 * Feed Collections Router
 *
 * tRPC router for managing personalized feed collections.
 * Users can create collections of repositories and subscribe
 * to other users' public collections.
 *
 * @otel canvas: .principal-views/feed-collections/feed-collections.otel.canvas
 */

import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { cookies, headers } from 'next/headers';
import {
  getCollection,
  storeCollection,
  deleteCollection,
  listUserCollections,
  getUserFeedProfile,
  storeUserFeedProfile,
  getCollections,
  getOrCreateCommitFeedState,
  storeCommitFeedState,
} from '@/lib/feed-collections/s3-storage';
import type {
  FeedCollection,
  FeedRepo,
  CommitActivityCard,
  SavedActivityCard,
  ActivityCommit,
} from '@/lib/feed-collections/types';
import {
  MAX_WATCHED_USERS,
  MAX_WATCHED_REPOS,
} from '@/lib/feed-collections/types';
import { FEATURED_REPOS } from '@/lib/featured-repos';

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
// Input Schemas
// ============================================================================

const createCollectionInputSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  visibility: z.enum(['public', 'private']),
});

const updateCollectionInputSchema = z.object({
  collectionId: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  visibility: z.enum(['public', 'private']).optional(),
});

const collectionIdInputSchema = z.object({
  collectionId: z.string().uuid(),
});

const addRepoInputSchema = z.object({
  collectionId: z.string().uuid(),
  owner: z.string().min(1),
  repo: z.string().min(1),
  description: z.string().max(500).optional(),
});

const removeRepoInputSchema = z.object({
  collectionId: z.string().uuid(),
  owner: z.string().min(1),
  repo: z.string().min(1),
});

// Watch input schemas
const watchUserInputSchema = z.object({
  login: z.string().min(1).max(39), // GitHub username limit
});

const unwatchUserInputSchema = z.object({
  login: z.string().min(1),
});

const watchRepoInputSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
});

const unwatchRepoInputSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
});

// ============================================================================
// Output Schemas
// ============================================================================

const collectionRepoSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  description: z.string().optional(),
  addedAt: z.string(),
});

const collectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  ownerGithubId: z.string(),
  ownerGithubLogin: z.string(),
  visibility: z.enum(['public', 'private']),
  repos: z.array(collectionRepoSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const feedRepoSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  description: z.string().optional(),
});

// Watch output schemas
const watchedUserSchema = z.object({
  login: z.string(),
  watchedAt: z.string(),
});

const watchedRepoSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  watchedAt: z.string(),
});

// ============================================================================
// Router
// ============================================================================

export const feedRouter = router({
  /**
   * Create a new collection
   * Requires authentication
   */
  createCollection: publicProcedure
    .input(createCollectionInputSchema)
    .output(collectionSchema)
    .mutation(async ({ input }) => {
      const auth = await requireAuth();

      const now = new Date().toISOString();
      const collection: FeedCollection = {
        id: crypto.randomUUID(),
        name: input.name,
        description: input.description,
        ownerGithubId: auth.githubId,
        ownerGithubLogin: auth.githubLogin,
        visibility: input.visibility,
        repos: [],
        createdAt: now,
        updatedAt: now,
      };

      await storeCollection(collection);

      // Auto-subscribe owner to their own collection
      let profile = await getUserFeedProfile(auth.githubId);
      if (!profile) {
        profile = {
          githubId: auth.githubId,
          githubLogin: auth.githubLogin,
          subscribedCollections: [],
          watchedUsers: [],
          watchedRepos: [],
          createdAt: now,
          updatedAt: now,
        };
      }

      if (!profile.subscribedCollections.includes(collection.id)) {
        profile.subscribedCollections.push(collection.id);
        profile.updatedAt = now;
        await storeUserFeedProfile(profile);
      }

      return collection;
    }),

  /**
   * List collections owned by the current user
   * Requires authentication
   */
  listMyCollections: publicProcedure
    .output(z.array(collectionSchema))
    .query(async () => {
      const auth = await requireAuth();
      const collections = await listUserCollections(auth.githubId);
      return collections;
    }),

  /**
   * Get a specific collection
   * Public collections can be viewed by anyone
   * Private collections require authentication and ownership
   */
  getCollection: publicProcedure
    .input(collectionIdInputSchema)
    .output(collectionSchema.nullable())
    .query(async ({ input }) => {
      const collection = await getCollection(input.collectionId);

      if (!collection) {
        return null;
      }

      // Public collections can be viewed by anyone
      if (collection.visibility === 'public') {
        return collection;
      }

      // Private collections require ownership
      const auth = await requireAuth();
      if (collection.ownerGithubId !== auth.githubId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this private collection',
        });
      }

      return collection;
    }),

  /**
   * Update a collection
   * Requires authentication and ownership
   */
  updateCollection: publicProcedure
    .input(updateCollectionInputSchema)
    .output(collectionSchema)
    .mutation(async ({ input }) => {
      const auth = await requireAuth();

      const collection = await getCollection(input.collectionId);
      if (!collection) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Collection not found',
        });
      }

      if (collection.ownerGithubId !== auth.githubId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You can only update your own collections',
        });
      }

      // Apply updates
      if (input.name !== undefined) {
        collection.name = input.name;
      }
      if (input.description !== undefined) {
        collection.description = input.description;
      }
      if (input.visibility !== undefined) {
        collection.visibility = input.visibility;
      }
      collection.updatedAt = new Date().toISOString();

      await storeCollection(collection);
      return collection;
    }),

  /**
   * Delete a collection
   * Requires authentication and ownership
   */
  deleteCollection: publicProcedure
    .input(collectionIdInputSchema)
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ input }) => {
      const auth = await requireAuth();

      const collection = await getCollection(input.collectionId);
      if (!collection) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Collection not found',
        });
      }

      if (collection.ownerGithubId !== auth.githubId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You can only delete your own collections',
        });
      }

      await deleteCollection(input.collectionId);
      return { success: true };
    }),

  /**
   * Add a repository to a collection
   * Requires authentication and ownership
   */
  addRepo: publicProcedure
    .input(addRepoInputSchema)
    .output(collectionSchema)
    .mutation(async ({ input }) => {
      const auth = await requireAuth();

      const collection = await getCollection(input.collectionId);
      if (!collection) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Collection not found',
        });
      }

      if (collection.ownerGithubId !== auth.githubId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You can only modify your own collections',
        });
      }

      // Check if repo already exists
      const exists = collection.repos.some(
        (r) => r.owner === input.owner && r.repo === input.repo
      );
      if (exists) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Repository already exists in this collection',
        });
      }

      collection.repos.push({
        owner: input.owner,
        repo: input.repo,
        description: input.description,
        addedAt: new Date().toISOString(),
      });
      collection.updatedAt = new Date().toISOString();

      await storeCollection(collection);
      return collection;
    }),

  /**
   * Remove a repository from a collection
   * Requires authentication and ownership
   */
  removeRepo: publicProcedure
    .input(removeRepoInputSchema)
    .output(collectionSchema)
    .mutation(async ({ input }) => {
      const auth = await requireAuth();

      const collection = await getCollection(input.collectionId);
      if (!collection) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Collection not found',
        });
      }

      if (collection.ownerGithubId !== auth.githubId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You can only modify your own collections',
        });
      }

      const initialLength = collection.repos.length;
      collection.repos = collection.repos.filter(
        (r) => !(r.owner === input.owner && r.repo === input.repo)
      );

      if (collection.repos.length === initialLength) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Repository not found in this collection',
        });
      }

      collection.updatedAt = new Date().toISOString();
      await storeCollection(collection);
      return collection;
    }),

  /**
   * Subscribe to a collection
   * Requires authentication
   * Can only subscribe to public collections (unless owner)
   */
  subscribe: publicProcedure
    .input(collectionIdInputSchema)
    .output(z.object({ success: z.boolean(), subscriptionCount: z.number() }))
    .mutation(async ({ input }) => {
      const auth = await requireAuth();

      const collection = await getCollection(input.collectionId);
      if (!collection) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Collection not found',
        });
      }

      // Check access
      if (
        collection.visibility === 'private' &&
        collection.ownerGithubId !== auth.githubId
      ) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Cannot subscribe to a private collection',
        });
      }

      // Get or create profile
      const now = new Date().toISOString();
      let profile = await getUserFeedProfile(auth.githubId);
      if (!profile) {
        profile = {
          githubId: auth.githubId,
          githubLogin: auth.githubLogin,
          subscribedCollections: [],
          watchedUsers: [],
          watchedRepos: [],
          createdAt: now,
          updatedAt: now,
        };
      }

      // Add subscription if not already subscribed
      if (!profile.subscribedCollections.includes(input.collectionId)) {
        profile.subscribedCollections.push(input.collectionId);
        profile.updatedAt = now;
        await storeUserFeedProfile(profile);
      }

      return {
        success: true,
        subscriptionCount: profile.subscribedCollections.length,
      };
    }),

  /**
   * Unsubscribe from a collection
   * Requires authentication
   */
  unsubscribe: publicProcedure
    .input(collectionIdInputSchema)
    .output(z.object({ success: z.boolean(), subscriptionCount: z.number() }))
    .mutation(async ({ input }) => {
      const auth = await requireAuth();

      const profile = await getUserFeedProfile(auth.githubId);
      if (!profile) {
        return { success: true, subscriptionCount: 0 };
      }

      const initialLength = profile.subscribedCollections.length;
      profile.subscribedCollections = profile.subscribedCollections.filter(
        (id) => id !== input.collectionId
      );

      if (profile.subscribedCollections.length !== initialLength) {
        profile.updatedAt = new Date().toISOString();
        await storeUserFeedProfile(profile);
      }

      return {
        success: true,
        subscriptionCount: profile.subscribedCollections.length,
      };
    }),

  /**
   * Get user's subscribed collections
   * Requires authentication
   */
  getSubscriptions: publicProcedure
    .output(z.array(collectionSchema))
    .query(async () => {
      const auth = await requireAuth();

      const profile = await getUserFeedProfile(auth.githubId);
      if (!profile || profile.subscribedCollections.length === 0) {
        return [];
      }

      const collections = await getCollections(profile.subscribedCollections);

      // Filter out any private collections we no longer have access to
      return collections.filter(
        (c) =>
          c.visibility === 'public' || c.ownerGithubId === auth.githubId
      );
    }),

  /**
   * Get personalized feed repos
   * Returns merged repos from all subscribed collections
   * Falls back to featured repos if not authenticated or no subscriptions
   */
  getPersonalizedRepos: publicProcedure
    .output(
      z.object({
        repos: z.array(feedRepoSchema),
        isPersonalized: z.boolean(),
        collectionCount: z.number(),
      })
    )
    .query(async () => {
      // Try to get auth context, but don't require it
      const token = await getGitHubToken();

      // Not authenticated - return featured repos
      if (!token) {
        return {
          repos: FEATURED_REPOS.map((r) => ({
            owner: r.owner,
            repo: r.repo,
            description: r.description,
          })),
          isPersonalized: false,
          collectionCount: 0,
        };
      }

      // Try cookies first, then fetch from GitHub API
      let githubId = await getGitHubUserIdFromCookie();
      if (!githubId) {
        const user = await fetchGitHubUser(token);
        if (!user) {
          return {
            repos: FEATURED_REPOS.map((r) => ({
              owner: r.owner,
              repo: r.repo,
              description: r.description,
            })),
            isPersonalized: false,
            collectionCount: 0,
          };
        }
        githubId = user.id;
      }

      // Get user profile
      const profile = await getUserFeedProfile(githubId);
      if (!profile || profile.subscribedCollections.length === 0) {
        return {
          repos: FEATURED_REPOS.map((r) => ({
            owner: r.owner,
            repo: r.repo,
            description: r.description,
          })),
          isPersonalized: false,
          collectionCount: 0,
        };
      }

      // Fetch all subscribed collections
      const collections = await getCollections(profile.subscribedCollections);

      // Filter accessible collections and merge repos
      const accessibleCollections = collections.filter(
        (c) => c.visibility === 'public' || c.ownerGithubId === githubId
      );

      if (accessibleCollections.length === 0) {
        return {
          repos: FEATURED_REPOS.map((r) => ({
            owner: r.owner,
            repo: r.repo,
            description: r.description,
          })),
          isPersonalized: false,
          collectionCount: 0,
        };
      }

      // Merge and deduplicate repos
      const repoMap = new Map<string, FeedRepo>();
      for (const collection of accessibleCollections) {
        for (const repo of collection.repos) {
          const key = `${repo.owner}/${repo.repo}`;
          if (!repoMap.has(key)) {
            repoMap.set(key, {
              owner: repo.owner,
              repo: repo.repo,
              description: repo.description,
            });
          }
        }
      }

      const repos = Array.from(repoMap.values());

      // If no repos in collections, fall back to featured
      if (repos.length === 0) {
        return {
          repos: FEATURED_REPOS.map((r) => ({
            owner: r.owner,
            repo: r.repo,
            description: r.description,
          })),
          isPersonalized: false,
          collectionCount: accessibleCollections.length,
        };
      }

      return {
        repos,
        isPersonalized: true,
        collectionCount: accessibleCollections.length,
      };
    }),

  // ==========================================================================
  // Watch Endpoints
  // ==========================================================================

  /**
   * Watch a GitHub user
   * Requires authentication. Max 10 users.
   */
  watchUser: publicProcedure
    .input(watchUserInputSchema)
    .output(
      z.object({
        success: z.boolean(),
        watchedUsers: z.array(watchedUserSchema),
      })
    )
    .mutation(async ({ input }) => {
      const auth = await requireAuth();
      const now = new Date().toISOString();

      let profile = await getUserFeedProfile(auth.githubId);
      if (!profile) {
        profile = {
          githubId: auth.githubId,
          githubLogin: auth.githubLogin,
          subscribedCollections: [],
          watchedUsers: [],
          watchedRepos: [],
          createdAt: now,
          updatedAt: now,
        };
      }

      const watchedUsers = profile.watchedUsers ?? [];

      // Check limit
      if (watchedUsers.length >= MAX_WATCHED_USERS) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `You can only watch up to ${MAX_WATCHED_USERS} users`,
        });
      }

      // Check if already watching
      if (
        watchedUsers.some(
          (u) => u.login.toLowerCase() === input.login.toLowerCase()
        )
      ) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Already watching this user',
        });
      }

      // Prevent watching self
      if (input.login.toLowerCase() === auth.githubLogin.toLowerCase()) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot watch yourself',
        });
      }

      watchedUsers.push({ login: input.login, watchedAt: now });
      profile.watchedUsers = watchedUsers;
      profile.updatedAt = now;

      await storeUserFeedProfile(profile);
      return { success: true, watchedUsers };
    }),

  /**
   * Unwatch a GitHub user
   * Requires authentication
   */
  unwatchUser: publicProcedure
    .input(unwatchUserInputSchema)
    .output(
      z.object({
        success: z.boolean(),
        watchedUsers: z.array(watchedUserSchema),
      })
    )
    .mutation(async ({ input }) => {
      const auth = await requireAuth();

      const profile = await getUserFeedProfile(auth.githubId);
      if (!profile) {
        return { success: true, watchedUsers: [] };
      }

      const watchedUsers = (profile.watchedUsers ?? []).filter(
        (u) => u.login.toLowerCase() !== input.login.toLowerCase()
      );

      profile.watchedUsers = watchedUsers;
      profile.updatedAt = new Date().toISOString();

      await storeUserFeedProfile(profile);
      return { success: true, watchedUsers };
    }),

  /**
   * Watch a repository
   * Requires authentication. Max 10 repos.
   */
  watchRepo: publicProcedure
    .input(watchRepoInputSchema)
    .output(
      z.object({
        success: z.boolean(),
        watchedRepos: z.array(watchedRepoSchema),
      })
    )
    .mutation(async ({ input }) => {
      const auth = await requireAuth();
      const now = new Date().toISOString();

      let profile = await getUserFeedProfile(auth.githubId);
      if (!profile) {
        profile = {
          githubId: auth.githubId,
          githubLogin: auth.githubLogin,
          subscribedCollections: [],
          watchedUsers: [],
          watchedRepos: [],
          createdAt: now,
          updatedAt: now,
        };
      }

      const watchedRepos = profile.watchedRepos ?? [];

      // Check limit
      if (watchedRepos.length >= MAX_WATCHED_REPOS) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `You can only watch up to ${MAX_WATCHED_REPOS} repositories`,
        });
      }

      // Check if already watching
      const repoKey = `${input.owner}/${input.repo}`.toLowerCase();
      if (
        watchedRepos.some(
          (r) => `${r.owner}/${r.repo}`.toLowerCase() === repoKey
        )
      ) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Already watching this repository',
        });
      }

      watchedRepos.push({
        owner: input.owner,
        repo: input.repo,
        watchedAt: now,
      });
      profile.watchedRepos = watchedRepos;
      profile.updatedAt = now;

      await storeUserFeedProfile(profile);
      return { success: true, watchedRepos };
    }),

  /**
   * Unwatch a repository
   * Requires authentication
   */
  unwatchRepo: publicProcedure
    .input(unwatchRepoInputSchema)
    .output(
      z.object({
        success: z.boolean(),
        watchedRepos: z.array(watchedRepoSchema),
      })
    )
    .mutation(async ({ input }) => {
      const auth = await requireAuth();

      const profile = await getUserFeedProfile(auth.githubId);
      if (!profile) {
        return { success: true, watchedRepos: [] };
      }

      const repoKey = `${input.owner}/${input.repo}`.toLowerCase();
      const watchedRepos = (profile.watchedRepos ?? []).filter(
        (r) => `${r.owner}/${r.repo}`.toLowerCase() !== repoKey
      );

      profile.watchedRepos = watchedRepos;
      profile.updatedAt = new Date().toISOString();

      await storeUserFeedProfile(profile);
      return { success: true, watchedRepos };
    }),

  /**
   * Get current watches (users and repos)
   * Requires authentication
   */
  getWatches: publicProcedure
    .output(
      z.object({
        watchedUsers: z.array(watchedUserSchema),
        watchedRepos: z.array(watchedRepoSchema),
      })
    )
    .query(async () => {
      const auth = await requireAuth();

      const profile = await getUserFeedProfile(auth.githubId);
      return {
        watchedUsers: profile?.watchedUsers ?? [],
        watchedRepos: profile?.watchedRepos ?? [],
      };
    }),

  // ==========================================================================
  // Commit Activity Feed Endpoints (Swipe Feed)
  // ==========================================================================

  /**
   * Get commit queue - activity cards from last 24h from watched users/repos
   * Groups commits by repo + hour bucket (matching ActivityFeedPanel pattern)
   * Filters out passed and saved cards
   * Requires authentication
   */
  getCommitQueue: publicProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(50).optional().default(20),
        })
        .optional()
    )
    .output(
      z.object({
        cards: z.array(
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
        ),
        hasMore: z.boolean(),
      })
    )
    .query(async ({ input }) => {
      const auth = await requireAuth();
      const limit = input?.limit ?? 20;

      // Get user's watches
      const profile = await getUserFeedProfile(auth.githubId);
      const watchedRepos = profile?.watchedRepos ?? [];
      const watchedUsers = profile?.watchedUsers ?? [];

      if (watchedRepos.length === 0 && watchedUsers.length === 0) {
        return { cards: [], hasMore: false };
      }

      // Get user's feed state (passed/saved)
      const feedState = await getOrCreateCommitFeedState(auth.githubId);
      const passedCommits = feedState.passedCommits;
      const savedSet = new Set(feedState.savedCards.map((c) => c.itemId));

      // Calculate 24h ago
      const twentyFourHoursAgo = new Date(
        Date.now() - 24 * 60 * 60 * 1000
      ).toISOString();

      // Fetch commits from GitHub for each watched repo
      const token = await getGitHubToken();

      // Map to group commits by repo + hour: "YYYY-MM-DD:HH:owner/repo" -> ActivityCommit[]
      const cardMap = new Map<
        string,
        {
          repo: { owner: string; name: string };
          hour: number;
          hourBucket: string;
          commits: ActivityCommit[];
        }
      >();

      // Helper to add a commit to the appropriate card
      const addCommitToCard = (
        owner: string,
        repoName: string,
        commit: ActivityCommit
      ) => {
        const commitDate = new Date(commit.committedAt);
        const dateStr = commitDate.toISOString().split('T')[0];
        const hour = commitDate.getUTCHours();
        const hourPadded = hour.toString().padStart(2, '0');
        const itemId = `${dateStr}:${hourPadded}:${owner}/${repoName}`;

        // Skip if this card was already saved (entire card is excluded)
        if (savedSet.has(itemId)) {
          return;
        }

        // Skip if this specific commit was already seen
        const seenShas = passedCommits[itemId] || [];
        if (seenShas.includes(commit.sha)) {
          return;
        }

        if (!cardMap.has(itemId)) {
          // Create hour bucket timestamp (start of the hour)
          const hourBucketDate = new Date(commitDate);
          hourBucketDate.setUTCMinutes(0, 0, 0);

          cardMap.set(itemId, {
            repo: { owner, name: repoName },
            hour,
            hourBucket: hourBucketDate.toISOString(),
            commits: [],
          });
        }

        const card = cardMap.get(itemId)!;
        // Avoid duplicate commits by sha
        if (!card.commits.some((c) => c.sha === commit.sha)) {
          card.commits.push(commit);
        }
      };

      // Fetch commits from watched repos
      for (const repo of watchedRepos) {
        try {
          const response = await fetch(
            `https://api.github.com/repos/${repo.owner}/${repo.repo}/commits?since=${twentyFourHoursAgo}&per_page=30`,
            {
              headers: {
                Accept: 'application/vnd.github.v3+json',
                ...(token ? { Authorization: `token ${token}` } : {}),
              },
            }
          );

          if (response.ok) {
            const commits = (await response.json()) as Array<{
              sha: string;
              commit: {
                message: string;
                author: {
                  date: string;
                };
              };
              author: {
                login: string;
                avatar_url: string;
              } | null;
              html_url: string;
            }>;

            for (const commit of commits) {
              addCommitToCard(repo.owner, repo.repo, {
                sha: commit.sha,
                message: commit.commit.message,
                author: {
                  login: commit.author?.login ?? 'unknown',
                  avatarUrl: commit.author?.avatar_url,
                },
                committedAt: commit.commit.author.date,
                url: commit.html_url,
              });
            }
          }
        } catch (error) {
          console.error(
            `[Commit Feed] Failed to fetch commits for ${repo.owner}/${repo.repo}:`,
            error
          );
        }
      }

      // Fetch commits from watched users (their recent activity)
      for (const user of watchedUsers) {
        try {
          const response = await fetch(
            `https://api.github.com/users/${user.login}/events?per_page=30`,
            {
              headers: {
                Accept: 'application/vnd.github.v3+json',
                ...(token ? { Authorization: `token ${token}` } : {}),
              },
            }
          );

          if (response.ok) {
            const events = (await response.json()) as Array<{
              type: string;
              repo: { name: string };
              payload: {
                commits?: Array<{
                  sha: string;
                  message: string;
                  author: { name: string };
                }>;
              };
              actor: {
                login: string;
                avatar_url: string;
              };
              created_at: string;
            }>;

            for (const event of events) {
              // Only process PushEvents
              if (event.type !== 'PushEvent') continue;

              // Check if within 24h
              if (new Date(event.created_at) < new Date(twentyFourHoursAgo)) {
                continue;
              }

              const repoParts = event.repo.name.split('/');
              const owner = repoParts[0] ?? '';
              const repoName = repoParts[1] ?? '';

              if (!owner || !repoName) continue;

              for (const commit of event.payload.commits ?? []) {
                addCommitToCard(owner, repoName, {
                  sha: commit.sha,
                  message: commit.message,
                  author: {
                    login: event.actor.login,
                    avatarUrl: event.actor.avatar_url,
                  },
                  committedAt: event.created_at,
                  url: `https://github.com/${owner}/${repoName}/commit/${commit.sha}`,
                });
              }
            }
          }
        } catch (error) {
          console.error(
            `[Commit Feed] Failed to fetch events for ${user.login}:`,
            error
          );
        }
      }

      // Convert map to array of CommitActivityCard
      const allCards: CommitActivityCard[] = Array.from(cardMap.entries()).map(
        ([itemId, data]) => {
          // Sort commits within each card by time (newest first)
          const sortedCommits = [...data.commits].sort(
            (a, b) =>
              new Date(b.committedAt).getTime() -
              new Date(a.committedAt).getTime()
          );

          return {
            itemId,
            repo: data.repo,
            hour: data.hour,
            hourBucket: data.hourBucket,
            commits: sortedCommits,
            commitCount: sortedCommits.length,
            latestCommitAt: sortedCommits[0]?.committedAt ?? data.hourBucket,
          };
        }
      );

      // Sort cards by latestCommitAt descending (newest first)
      allCards.sort(
        (a, b) =>
          new Date(b.latestCommitAt).getTime() -
          new Date(a.latestCommitAt).getTime()
      );

      // Return limited results
      const cards = allCards.slice(0, limit);
      const hasMore = allCards.length > limit;

      return { cards, hasMore };
    }),

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

  // ==========================================================================
  // Activity Heatmap Endpoint
  // ==========================================================================

  /**
   * Get commit activity for heatmap visualization
   * Returns flat list of commits with timestamps from watched users/repos
   * Does NOT filter out passed/saved (shows all activity)
   * Requires authentication
   */
  getActivityHeatmap: publicProcedure
    .input(
      z
        .object({
          hoursBack: z.number().min(1).max(168).optional().default(24),
          authorLogins: z.array(z.string()).optional(),
          repoIds: z.array(z.string()).optional(), // "owner/repo" format
        })
        .optional()
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
        authors: z.array(
          z.object({
            login: z.string(),
            avatarUrl: z.string().optional(),
            commitCount: z.number(),
          })
        ),
        repos: z.array(
          z.object({
            id: z.string(), // "owner/repo"
            owner: z.string(),
            name: z.string(),
            commitCount: z.number(),
          })
        ),
        timeRange: z.object({
          start: z.string(),
          end: z.string(),
        }),
      })
    )
    .query(async ({ input }) => {
      const auth = await requireAuth();
      const hoursBack = input?.hoursBack ?? 24;
      const authorFilter = input?.authorLogins
        ? new Set(input.authorLogins.map((l) => l.toLowerCase()))
        : null;
      const repoFilter = input?.repoIds
        ? new Set(input.repoIds.map((r) => r.toLowerCase()))
        : null;

      // Get user's watches
      const profile = await getUserFeedProfile(auth.githubId);
      const watchedRepos = profile?.watchedRepos ?? [];
      const watchedUsers = profile?.watchedUsers ?? [];

      if (watchedRepos.length === 0 && watchedUsers.length === 0) {
        const now = new Date();
        const start = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);
        return {
          commits: [],
          authors: [],
          repos: [],
          timeRange: {
            start: start.toISOString(),
            end: now.toISOString(),
          },
        };
      }

      const now = new Date();
      const startTime = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);
      const sinceISO = startTime.toISOString();

      const token = await getGitHubToken();

      // Collect all commits
      const allCommits: Array<{
        timestamp: string;
        repoId: string;
        authorLogin: string;
        authorAvatarUrl?: string;
      }> = [];

      // Track authors for aggregation
      const authorMap = new Map<
        string,
        { login: string; avatarUrl?: string; commitCount: number }
      >();

      // Track repos for aggregation
      const repoMap = new Map<
        string,
        { id: string; owner: string; name: string; commitCount: number }
      >();

      const addCommit = (
        timestamp: string,
        repoId: string,
        authorLogin: string,
        authorAvatarUrl?: string
      ) => {
        // Apply author filter if specified
        if (authorFilter && !authorFilter.has(authorLogin.toLowerCase())) {
          return;
        }

        // Apply repo filter if specified
        if (repoFilter && !repoFilter.has(repoId.toLowerCase())) {
          return;
        }

        allCommits.push({
          timestamp,
          repoId,
          authorLogin,
          authorAvatarUrl,
        });

        // Update author stats
        const existingAuthor = authorMap.get(authorLogin.toLowerCase());
        if (existingAuthor) {
          existingAuthor.commitCount++;
        } else {
          authorMap.set(authorLogin.toLowerCase(), {
            login: authorLogin,
            avatarUrl: authorAvatarUrl,
            commitCount: 1,
          });
        }

        // Update repo stats
        const existingRepo = repoMap.get(repoId.toLowerCase());
        if (existingRepo) {
          existingRepo.commitCount++;
        } else {
          const [owner, name] = repoId.split('/');
          repoMap.set(repoId.toLowerCase(), {
            id: repoId,
            owner: owner ?? '',
            name: name ?? '',
            commitCount: 1,
          });
        }
      };

      // Fetch commits from watched repos
      for (const repo of watchedRepos) {
        try {
          const response = await fetch(
            `https://api.github.com/repos/${repo.owner}/${repo.repo}/commits?since=${sinceISO}&per_page=100`,
            {
              headers: {
                Accept: 'application/vnd.github.v3+json',
                ...(token ? { Authorization: `token ${token}` } : {}),
              },
            }
          );

          if (response.ok) {
            const commits = (await response.json()) as Array<{
              sha: string;
              commit: { author: { date: string } };
              author: { login: string; avatar_url: string } | null;
            }>;

            for (const commit of commits) {
              addCommit(
                commit.commit.author.date,
                `${repo.owner}/${repo.repo}`,
                commit.author?.login ?? 'unknown',
                commit.author?.avatar_url
              );
            }
          }
        } catch (error) {
          console.error(
            `[Heatmap] Failed to fetch commits for ${repo.owner}/${repo.repo}:`,
            error
          );
        }
      }

      // Fetch commits from watched users (their recent activity)
      for (const user of watchedUsers) {
        try {
          const response = await fetch(
            `https://api.github.com/users/${user.login}/events?per_page=100`,
            {
              headers: {
                Accept: 'application/vnd.github.v3+json',
                ...(token ? { Authorization: `token ${token}` } : {}),
              },
            }
          );

          if (response.ok) {
            const events = (await response.json()) as Array<{
              type: string;
              repo: { name: string };
              payload: {
                commits?: Array<{ sha: string; message: string }>;
              };
              actor: { login: string; avatar_url: string };
              created_at: string;
            }>;

            for (const event of events) {
              if (event.type !== 'PushEvent') continue;
              if (new Date(event.created_at) < startTime) continue;

              const repoId = event.repo.name;
              const commitCount = event.payload.commits?.length ?? 1;

              // Each push event can have multiple commits
              // Use created_at as approximate timestamp for all
              for (let i = 0; i < commitCount; i++) {
                addCommit(
                  event.created_at,
                  repoId,
                  event.actor.login,
                  event.actor.avatar_url
                );
              }
            }
          }
        } catch (error) {
          console.error(
            `[Heatmap] Failed to fetch events for ${user.login}:`,
            error
          );
        }
      }

      // Sort commits by timestamp (newest first)
      allCommits.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      // Sort authors by commit count (most active first)
      const authors = Array.from(authorMap.values()).sort(
        (a, b) => b.commitCount - a.commitCount
      );

      // Sort repos by commit count (most active first)
      const repos = Array.from(repoMap.values()).sort(
        (a, b) => b.commitCount - a.commitCount
      );

      return {
        commits: allCommits,
        authors,
        repos,
        timeRange: {
          start: startTime.toISOString(),
          end: now.toISOString(),
        },
      };
    }),

  /**
   * Get detailed commits for a specific time block
   * Returns full commit information for display in UI
   */
  getBlockCommits: publicProcedure
    .input(
      z.object({
        startTime: z.string(), // ISO date string
        endTime: z.string(), // ISO date string
        authorLogins: z.array(z.string()).optional(),
        repoIds: z.array(z.string()).optional(), // "owner/repo" format
      })
    )
    .output(
      z.object({
        commits: z.array(
          z.object({
            repoOwner: z.string(),
            repoName: z.string(),
            sha: z.string(),
            message: z.string(),
            author: z.string(),
            authorLogin: z.string().nullable(),
            authorEmail: z.string(),
            authorAvatarUrl: z.string().nullable(),
            date: z.string(),
            additions: z.number().optional(),
            deletions: z.number().optional(),
            filesChanged: z.number().optional(),
          })
        ),
      })
    )
    .query(async ({ input }) => {
      const auth = await requireAuth();
      const startTime = new Date(input.startTime);
      const endTime = new Date(input.endTime);
      const authorFilter = input.authorLogins
        ? new Set(input.authorLogins.map((l) => l.toLowerCase()))
        : null;
      const repoFilter = input.repoIds
        ? new Set(input.repoIds.map((r) => r.toLowerCase()))
        : null;

      // Get user's watches
      const profile = await getUserFeedProfile(auth.githubId);
      const watchedRepos = profile?.watchedRepos ?? [];
      const watchedUsers = profile?.watchedUsers ?? [];

      if (watchedRepos.length === 0 && watchedUsers.length === 0) {
        return { commits: [] };
      }

      const token = await getGitHubToken();
      const sinceISO = startTime.toISOString();
      const untilISO = endTime.toISOString();

      // Collect all commits with full details
      const allCommits: Array<{
        repoOwner: string;
        repoName: string;
        sha: string;
        message: string;
        author: string;
        authorLogin: string | null;
        authorEmail: string;
        authorAvatarUrl: string | null;
        date: string;
        additions?: number;
        deletions?: number;
        filesChanged?: number;
      }> = [];

      // Fetch commits from watched repos
      for (const repo of watchedRepos) {
        const repoId = `${repo.owner}/${repo.repo}`;

        // Apply repo filter if specified
        if (repoFilter && !repoFilter.has(repoId.toLowerCase())) {
          continue;
        }

        try {
          const response = await fetch(
            `https://api.github.com/repos/${repo.owner}/${repo.repo}/commits?since=${sinceISO}&until=${untilISO}&per_page=100`,
            {
              headers: {
                Accept: 'application/vnd.github.v3+json',
                ...(token ? { Authorization: `token ${token}` } : {}),
              },
            }
          );

          if (response.ok) {
            const commits = (await response.json()) as Array<{
              sha: string;
              commit: {
                message: string;
                author: { name: string; email: string; date: string };
              };
              author: { login: string; avatar_url: string } | null;
              stats?: { additions: number; deletions: number; total: number };
              files?: Array<unknown>;
            }>;

            for (const commit of commits) {
              const authorLogin = commit.author?.login ?? null;

              // Apply author filter if specified
              if (
                authorFilter &&
                authorLogin &&
                !authorFilter.has(authorLogin.toLowerCase())
              ) {
                continue;
              }

              allCommits.push({
                repoOwner: repo.owner,
                repoName: repo.repo,
                sha: commit.sha,
                message: commit.commit.message,
                author: commit.commit.author.name,
                authorLogin,
                authorEmail: commit.commit.author.email,
                authorAvatarUrl: commit.author?.avatar_url ?? null,
                date: commit.commit.author.date,
                additions: commit.stats?.additions,
                deletions: commit.stats?.deletions,
                filesChanged: commit.files?.length,
              });
            }
          }
        } catch (error) {
          console.error(
            `[BlockCommits] Failed to fetch commits for ${repo.owner}/${repo.repo}:`,
            error
          );
        }
      }

      // Fetch commits from followed users via events API
      for (const user of watchedUsers) {
        // Apply author filter if specified
        if (authorFilter && !authorFilter.has(user.login.toLowerCase())) {
          continue;
        }

        try {
          const response = await fetch(
            `https://api.github.com/users/${user.login}/events?per_page=100`,
            {
              headers: {
                Accept: 'application/vnd.github.v3+json',
                ...(token ? { Authorization: `token ${token}` } : {}),
              },
            }
          );

          if (response.ok) {
            const events = (await response.json()) as Array<{
              type: string;
              repo: { name: string };
              payload: {
                commits?: Array<{
                  sha: string;
                  message: string;
                  author: { name: string; email: string };
                }>;
              };
              actor: { login: string; avatar_url: string };
              created_at: string;
            }>;

            for (const event of events) {
              if (event.type !== 'PushEvent') continue;

              const eventTime = new Date(event.created_at);
              if (eventTime < startTime || eventTime >= endTime) continue;

              const [repoOwner, repoName] = event.repo.name.split('/');

              // Apply repo filter if specified
              if (
                repoFilter &&
                !repoFilter.has(event.repo.name.toLowerCase())
              ) {
                continue;
              }

              // Add each commit from the push event
              for (const commit of event.payload.commits ?? []) {
                allCommits.push({
                  repoOwner: repoOwner ?? '',
                  repoName: repoName ?? '',
                  sha: commit.sha,
                  message: commit.message,
                  author: commit.author.name,
                  authorLogin: event.actor.login,
                  authorEmail: commit.author.email,
                  authorAvatarUrl: event.actor.avatar_url,
                  date: event.created_at,
                });
              }
            }
          }
        } catch (error) {
          console.error(
            `[BlockCommits] Failed to fetch events for ${user.login}:`,
            error
          );
        }
      }

      // Sort commits by date (newest first)
      allCommits.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      // Deduplicate by SHA (same commit could appear from both repo and user follows)
      const seenShas = new Set<string>();
      const dedupedCommits = allCommits.filter((commit) => {
        if (seenShas.has(commit.sha)) return false;
        seenShas.add(commit.sha);
        return true;
      });

      return { commits: dedupedCommits };
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
