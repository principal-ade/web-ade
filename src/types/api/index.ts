/**
 * API Response Types
 *
 * This module exports typed interfaces for all API responses.
 * Use these types with fetch to catch type mismatches at compile time.
 */

export type {
  GitHubTreeEntry,
  GitHubTreeResponse,
  GitHubRepoInfoResponse,
  GitHubReadmeResponse,
  GitHubFileResponse,
  GitHubContributor,
  GitHubContributorsResponse,
  GitHubCountsResponse,
  GitHubCommitAuthor,
  GitHubCommit,
  GitHubCommitsResponse,
  GitHubCommitFile,
  GitHubCommitDetailResponse,
  GitHubLabel,
  GitHubUser,
  GitHubIssue,
  GitHubIssuesResponse,
  GitHubPullRequest,
  GitHubPullRequestsResponse,
  GitHubRepo,
  GitHubOrg,
  GitHubUserProfile,
  GitHubSearchReposResponse,
  GitHubErrorResponse,
} from './github';
