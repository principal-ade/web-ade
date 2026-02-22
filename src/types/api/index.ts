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

export type {
  CollectionsUser,
  CollectionsGetResponse,
  CollectionsPutRequest,
  CollectionsPutResponse,
  CollectionsPermissionsResponse,
} from './collections';

// TTS (Tour audio) types - re-exported from lib/tts
export type {
  TTSGenerateRequest,
  TTSGenerateResponse,
  TTSBatchGenerateRequest,
  TTSBatchResponse,
  TTSOptions,
  TTSError,
  IntroductionTour,
  IntroductionTourStep,
} from '@/lib/tts/types';

export { TTSErrorCode } from '@/lib/tts/types';
