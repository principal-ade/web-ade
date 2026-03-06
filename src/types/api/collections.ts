/**
 * Collections API Response Types
 */

import type { Collection } from '@principal-ai/alexandria-collections';

// Re-export visibility type for convenience
export type { CollectionVisibility } from '@/lib/collections/github-repo-manager';

// User info returned with collections
export interface CollectionsUser {
  login: string;
  name: string | null;
  avatar_url: string;
  bio: string | null;
  html_url: string;
}

// Storage location for GitHub-backed collections
export interface GitHubStorageLocation {
  type: 'github';
  owner: string;
  visibility: 'public' | 'private';
  repoName: string;
  repoUrl: string;
  exists: boolean;
  canWrite: boolean;
}

// GET /api/github/collections/[username] response
export interface CollectionsGetResponse {
  user: CollectionsUser;
  exists: boolean;
  collections: Collection[];
  repoUrl: string | null;
  // New: storage locations for both public and private repos
  storage?: {
    public: GitHubStorageLocation | null;
    private: GitHubStorageLocation | null;
  };
}

// PUT /api/github/collections/[username] request body
export interface CollectionsPutRequest {
  collections: Collection[];
  visibility?: 'public' | 'private';
}

// PUT /api/github/collections/[username] response
export interface CollectionsPutResponse {
  success: boolean;
  updated: number;
}

// GET /api/github/collections/[username]/permissions response
export interface CollectionsPermissionsResponse {
  canEdit: boolean;
  permission?: 'admin' | 'write' | 'read' | 'none';
  reason?: 'not_authenticated' | 'repo_not_found' | 'no_access' | 'error';
}
