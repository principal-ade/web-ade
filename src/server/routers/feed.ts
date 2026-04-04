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
import { cookies } from 'next/headers';
import {
  getCollection,
  storeCollection,
  deleteCollection,
  listUserCollections,
  getUserFeedProfile,
  storeUserFeedProfile,
  getCollections,
} from '@/lib/feed-collections/s3-storage';
import type { FeedCollection, FeedRepo } from '@/lib/feed-collections/types';
import {
  MAX_FOLLOWED_USERS,
  MAX_FOLLOWED_REPOS,
} from '@/lib/feed-collections/types';
import { FEATURED_REPOS } from '@/lib/featured-repos';

// ============================================================================
// Auth Helpers
// ============================================================================

async function getGitHubToken(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get('github_token')?.value || null;
  } catch {
    return null;
  }
}

async function getGitHubUserId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get('github_user_id')?.value || null;
  } catch {
    return null;
  }
}

async function getGitHubLogin(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get('github_login')?.value || null;
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
  const githubId = await getGitHubUserId();
  const githubLogin = await getGitHubLogin();

  if (!token || !githubId) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Please sign in with GitHub to access this feature',
    });
  }

  return { token, githubId, githubLogin: githubLogin || 'unknown' };
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
      const githubId = await getGitHubUserId();

      // Not authenticated - return featured repos
      if (!token || !githubId) {
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
});

export type FeedRouter = typeof feedRouter;
