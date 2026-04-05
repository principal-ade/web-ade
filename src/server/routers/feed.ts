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
  MAX_FOLLOWED_USERS,
  MAX_FOLLOWED_REPOS,
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

// Follow input schemas
const followUserInputSchema = z.object({
  login: z.string().min(1).max(39), // GitHub username limit
});

const unfollowUserInputSchema = z.object({
  login: z.string().min(1),
});

const followRepoInputSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
});

const unfollowRepoInputSchema = z.object({
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

// Follow output schemas
const followedUserSchema = z.object({
  login: z.string(),
  followedAt: z.string(),
});

const followedRepoSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  followedAt: z.string(),
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
          followedUsers: [],
          followedRepos: [],
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
          followedUsers: [],
          followedRepos: [],
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
  // Follow Endpoints
  // ==========================================================================

  /**
   * Follow a GitHub user
   * Requires authentication. Max 5 users.
   */
  followUser: publicProcedure
    .input(followUserInputSchema)
    .output(
      z.object({
        success: z.boolean(),
        followedUsers: z.array(followedUserSchema),
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
          followedUsers: [],
          followedRepos: [],
          createdAt: now,
          updatedAt: now,
        };
      }

      const followedUsers = profile.followedUsers ?? [];

      // Check limit
      if (followedUsers.length >= MAX_FOLLOWED_USERS) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `You can only follow up to ${MAX_FOLLOWED_USERS} users`,
        });
      }

      // Check if already following
      if (
        followedUsers.some(
          (u) => u.login.toLowerCase() === input.login.toLowerCase()
        )
      ) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Already following this user',
        });
      }

      // Prevent following self
      if (input.login.toLowerCase() === auth.githubLogin.toLowerCase()) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot follow yourself',
        });
      }

      followedUsers.push({ login: input.login, followedAt: now });
      profile.followedUsers = followedUsers;
      profile.updatedAt = now;

      await storeUserFeedProfile(profile);
      return { success: true, followedUsers };
    }),

  /**
   * Unfollow a GitHub user
   * Requires authentication
   */
  unfollowUser: publicProcedure
    .input(unfollowUserInputSchema)
    .output(
      z.object({
        success: z.boolean(),
        followedUsers: z.array(followedUserSchema),
      })
    )
    .mutation(async ({ input }) => {
      const auth = await requireAuth();

      const profile = await getUserFeedProfile(auth.githubId);
      if (!profile) {
        return { success: true, followedUsers: [] };
      }

      const followedUsers = (profile.followedUsers ?? []).filter(
        (u) => u.login.toLowerCase() !== input.login.toLowerCase()
      );

      profile.followedUsers = followedUsers;
      profile.updatedAt = new Date().toISOString();

      await storeUserFeedProfile(profile);
      return { success: true, followedUsers };
    }),

  /**
   * Follow a repository
   * Requires authentication. Max 5 repos.
   */
  followRepo: publicProcedure
    .input(followRepoInputSchema)
    .output(
      z.object({
        success: z.boolean(),
        followedRepos: z.array(followedRepoSchema),
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
          followedUsers: [],
          followedRepos: [],
          createdAt: now,
          updatedAt: now,
        };
      }

      const followedRepos = profile.followedRepos ?? [];

      // Check limit
      if (followedRepos.length >= MAX_FOLLOWED_REPOS) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `You can only follow up to ${MAX_FOLLOWED_REPOS} repositories`,
        });
      }

      // Check if already following
      const repoKey = `${input.owner}/${input.repo}`.toLowerCase();
      if (
        followedRepos.some(
          (r) => `${r.owner}/${r.repo}`.toLowerCase() === repoKey
        )
      ) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Already following this repository',
        });
      }

      followedRepos.push({
        owner: input.owner,
        repo: input.repo,
        followedAt: now,
      });
      profile.followedRepos = followedRepos;
      profile.updatedAt = now;

      await storeUserFeedProfile(profile);
      return { success: true, followedRepos };
    }),

  /**
   * Unfollow a repository
   * Requires authentication
   */
  unfollowRepo: publicProcedure
    .input(unfollowRepoInputSchema)
    .output(
      z.object({
        success: z.boolean(),
        followedRepos: z.array(followedRepoSchema),
      })
    )
    .mutation(async ({ input }) => {
      const auth = await requireAuth();

      const profile = await getUserFeedProfile(auth.githubId);
      if (!profile) {
        return { success: true, followedRepos: [] };
      }

      const repoKey = `${input.owner}/${input.repo}`.toLowerCase();
      const followedRepos = (profile.followedRepos ?? []).filter(
        (r) => `${r.owner}/${r.repo}`.toLowerCase() !== repoKey
      );

      profile.followedRepos = followedRepos;
      profile.updatedAt = new Date().toISOString();

      await storeUserFeedProfile(profile);
      return { success: true, followedRepos };
    }),

  /**
   * Get current follows (users and repos)
   * Requires authentication
   */
  getFollows: publicProcedure
    .output(
      z.object({
        followedUsers: z.array(followedUserSchema),
        followedRepos: z.array(followedRepoSchema),
      })
    )
    .query(async () => {
      const auth = await requireAuth();

      const profile = await getUserFeedProfile(auth.githubId);
      return {
        followedUsers: profile?.followedUsers ?? [],
        followedRepos: profile?.followedRepos ?? [],
      };
    }),

  // ==========================================================================
  // Commit Activity Feed Endpoints (Swipe Feed)
  // ==========================================================================

  /**
   * Get commit queue - activity cards from last 24h from followed users/repos
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

      // Get user's follows
      const profile = await getUserFeedProfile(auth.githubId);
      const followedRepos = profile?.followedRepos ?? [];
      const followedUsers = profile?.followedUsers ?? [];

      if (followedRepos.length === 0 && followedUsers.length === 0) {
        return { cards: [], hasMore: false };
      }

      // Get user's feed state (passed/saved)
      const feedState = await getOrCreateCommitFeedState(auth.githubId);
      const passedSet = new Set(feedState.passed);
      const savedSet = new Set(feedState.savedCards.map((c) => c.itemId));

      // Calculate 24h ago
      const twentyFourHoursAgo = new Date(
        Date.now() - 24 * 60 * 60 * 1000
      ).toISOString();

      // Fetch commits from GitHub for each followed repo
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

        // Skip if this card was already passed or saved
        if (passedSet.has(itemId) || savedSet.has(itemId)) {
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

      // Fetch commits from followed repos
      for (const repo of followedRepos) {
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

      // Fetch commits from followed users (their recent activity)
      for (const user of followedUsers) {
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
   * Pass a card (swipe left) - mark as seen, don't show again
   * Requires authentication
   */
  passCard: publicProcedure
    .input(z.object({ itemId: z.string() }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ input }) => {
      const auth = await requireAuth();

      const feedState = await getOrCreateCommitFeedState(auth.githubId);

      // Add to passed if not already there
      if (!feedState.passed.includes(input.itemId)) {
        feedState.passed.push(input.itemId);
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
});

export type FeedRouter = typeof feedRouter;
