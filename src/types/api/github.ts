/**
 * GitHub API Response Types
 * These types match the GitHub REST API v3 responses.
 */

// Tree entry from GitHub's git/trees endpoint
export interface GitHubTreeEntry {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  url: string;
}

// Response from /repos/{owner}/{repo}/git/trees/{sha}?recursive=1
export interface GitHubTreeResponse {
  sha: string;
  url: string;
  tree: GitHubTreeEntry[];
  truncated: boolean;
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
  url: string;
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

export type GitHubCommitsResponse = GitHubCommit[];

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

// Issue types
export interface GitHubLabel {
  id: number;
  name: string;
  color: string;
  description?: string;
}

export interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  html_url: string;
  type: string;
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  state: 'open' | 'closed';
  locked: boolean;
  user: GitHubUser;
  labels: GitHubLabel[];
  assignees: GitHubUser[];
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  body: string | null;
  html_url: string;
  comments: number;
  pull_request?: {
    url: string;
    html_url: string;
  };
}

export type GitHubIssuesResponse = GitHubIssue[];

// Pull request types
export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  state: 'open' | 'closed';
  locked: boolean;
  user: GitHubUser;
  labels: GitHubLabel[];
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  merged_at: string | null;
  body: string | null;
  html_url: string;
  head: {
    ref: string;
    sha: string;
    repo: {
      full_name: string;
    } | null;
  };
  base: {
    ref: string;
    sha: string;
    repo: {
      full_name: string;
    };
  };
  draft: boolean;
  mergeable?: boolean;
  mergeable_state?: string;
  comments?: number;
  review_comments?: number;
}

export type GitHubPullRequestsResponse = GitHubPullRequest[];

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

// Error response
export interface GitHubErrorResponse {
  error: string;
}
