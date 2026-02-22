/**
 * Collections API Response Types
 */

import type { Collection } from '@principal-ai/alexandria-collections';

// User info returned with collections
export interface CollectionsUser {
  login: string;
  name: string | null;
  avatar_url: string;
  bio: string | null;
  html_url: string;
}

// GET /api/github/collections/[username] response
export interface CollectionsGetResponse {
  user: CollectionsUser;
  exists: boolean;
  collections: Collection[];
  repoUrl: string | null;
}

// PUT /api/github/collections/[username] request body
export interface CollectionsPutRequest {
  collections: Collection[];
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
