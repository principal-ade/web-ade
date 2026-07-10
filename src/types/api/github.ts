/**
 * GitHub API Response Types
 * These types match the GitHub REST API v3 responses.
 */

// Tree entry from GitHub's git/trees endpoint.
//
// `mode`, `sha`, and `url` come back from GitHub but are stripped before the
// tree is cached / sent to the client (see `slimTreeResponse` in the github
// router): on huge repos like elastic/kibana they tripled the payload past the
// SSR response cap, and no consumer reads them — everything works off
// `path`/`type`/`size`. Kept optional so the raw GitHub shape still type-checks.
export interface GitHubTreeEntry {
  path: string;
  mode?: string;
  type: 'blob' | 'tree';
  sha?: string;
  size?: number;
  url?: string;
}

// Response from /repos/{owner}/{repo}/git/trees/{sha}?recursive=1
export interface GitHubTreeResponse {
  sha: string;
  url: string;
  tree: GitHubTreeEntry[];
  truncated: boolean;
  // Set when the requested ref (e.g. a trail's authored commit) couldn't be
  // found on GitHub and we served the repo's default branch instead. Signals
  // the client that line markers may have drifted from the authored code.
  fellBackToDefaultBranch?: boolean;
}

// Response from /repos/{owner}/{repo}
export interface GitHubRepoInfoResponse {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  owner: {
    login: string;
    id: number;
    avatar_url: string;
    type: string;
  };
  html_url: string;
  description: string | null;
  fork: boolean;
  parent?: {
    full_name: string;
    owner: {
      login: string;
      avatar_url: string;
    };
    name: string;
  };
  url: string;
  clone_url: string;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  homepage: string | null;
  size: number;
  stargazers_count: number;
  watchers_count: number;
  language: string | null;
  forks_count: number;
  open_issues_count: number;
  default_branch: string;
  topics: string[];
  visibility: string;
  license?: {
    key: string;
    name: string;
    spdx_id: string;
  } | null;
  // ... other fields as needed
}

// Response from /repos/{owner}/{repo}/readme
export interface GitHubReadmeResponse {
  name: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  html_url: string;
  git_url: string;
  download_url: string;
  type: string;
  content: string;
  encoding: string;
}

// Response from /repos/{owner}/{repo}/contents/{path}
export interface GitHubFileResponse {
  name: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  html_url: string;
  git_url: string;
  download_url: string | null;
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  content?: string;
  encoding?: string;
}

// Response from /repos/{owner}/{repo}/contributors
export interface GitHubContributor {
  login: string;
  id: number;
  avatar_url: string;
  html_url: string;
  contributions: number;
  type: string;
}

export type GitHubContributorsResponse = GitHubContributor[];

// Custom response for counts action (GraphQL-derived)
export interface GitHubCountsResponse {
  openIssues: number;
  openPullRequests: number;
}

// Commit types
export interface GitHubCommitAuthor {
  name: string;
  email: string;
  date: string;
}

export interface GitHubCommit {
  sha: string;
  commit: {
    author: GitHubCommitAuthor;
    committer: GitHubCommitAuthor;
    message: string;
    tree: {
      sha: string;
      url: string;
    };
    url: string;
  };
  url: string;
  html_url: string;
  author: {
    login: string;
    id: number;
    avatar_url: string;
  } | null;
  committer: {
    login: string;
    id: number;
    avatar_url: string;
  } | null;
  parents: Array<{
    sha: string;
    url: string;
  }>;
}

// Commit detail with files
export interface GitHubCommitFile {
  filename: string;
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  previous_filename?: string;
}

export interface GitHubCommitDetailResponse extends GitHubCommit {
  stats: {
    total: number;
    additions: number;
    deletions: number;
  };
  files: GitHubCommitFile[];
}

// Pull request payloads are typed off `@octokit/openapi-types`
// (`components['schemas']['pull-request'|'pull-request-simple']`) at their use
// sites — the PR routes/hooks — so the hand-rolled interface that used to live
// here was retired.

// Repository (simplified for lists)
export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
    avatar_url: string;
    type: string;
  };
  private: boolean;
  html_url: string;
  description: string | null;
  fork: boolean;
  clone_url: string;
  language: string | null;
  default_branch: string;
  stargazers_count: number;
  forks_count: number;
  updated_at: string;
  topics?: string[];
  license?: {
    key: string;
    name: string;
    spdx_id: string;
  } | null;
}

// Organization
export interface GitHubOrg {
  login: string;
  id: number;
  avatar_url: string;
  description: string | null;
}

// User profile (extended)
export interface GitHubUserProfile {
  login: string;
  id: number;
  avatar_url: string;
  html_url: string;
  name: string | null;
  bio: string | null;
  type: string;
}

// Search results
export interface GitHubSearchReposResponse {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubRepo[];
}

// Raw response from GitHub's /search/code endpoint
export interface GitHubRawCodeSearchItem {
  name: string;
  path: string;
  sha: string;
  html_url: string;
  repository: {
    full_name: string;
  };
}

export interface GitHubRawCodeSearchResponse {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubRawCodeSearchItem[];
}

// Transformed response from our /api/github/code-search route
export interface GitHubCodeSearchItem {
  path: string;
  html_url: string;
  matched_terms: string[];
}

export interface GitHubCodeSearchResponse {
  total_files: number;
  total_occurrences: number;
  incomplete_results: boolean;
  terms: string[];
  items: GitHubCodeSearchItem[];
}
