/**
 * API Response Types
 *
 * This module exports typed interfaces for all API responses.
 * Use these types with fetch to catch type mismatches at compile time.
 */

export type {
  GitHubTreeResponse,
  GitHubRepoInfoResponse,
  GitHubReadmeResponse,
  GitHubFileResponse,
  GitHubContributorsResponse,
  GitHubCountsResponse,
  GitHubCommit,
  GitHubCommitDetailResponse,
  GitHubRepo,
  GitHubOrg,
  GitHubUserProfile,
  GitHubSearchReposResponse,
  GitHubRawCodeSearchResponse,
  GitHubCodeSearchResponse,
} from './github';
