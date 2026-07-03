import { useEffect, useRef, useState } from 'react';
import type { PullRequestView } from '@industry-theme/file-city-panel';
import {
  pullRequestViewFromGitHubPullRequest,
  pullRequestFilesFromGitHub,
} from '@industry-theme/file-city-panel/github';
import type { components } from '@octokit/openapi-types';

type GitHubPullRequest = components['schemas']['pull-request'];
type GitHubDiffEntry = components['schemas']['diff-entry'];

interface Result {
  pullRequest: PullRequestView | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetches a GitHub pull request and maps it to the `PullRequestView` shape
 * consumed by FileCityGuidePanel's PR mode, via the panel package's official
 * `pullRequestViewFromGitHubPullRequest` adapter. Also fetches the PR's changed
 * files (`/pulls/{n}/files`, a separate endpoint) and merges them in with
 * `pullRequestFilesFromGitHub` so PR mode lights the changed buildings. The
 * file fetch is best-effort — if it fails, the PR still renders framing-only.
 *
 * Mirrors `useIssueView`: returns `null` while idle (no number), and holds the
 * previously-loaded PR visible while the next one fetches so switching PRs
 * doesn't fire the panel's exit animation.
 */
export function usePullRequestView(
  owner: string,
  repo: string,
  number: number | null,
): Result {
  const [state, setState] = useState<Result>({
    pullRequest: null,
    loading: false,
    error: null,
  });
  const reqId = useRef(0);

  useEffect(() => {
    if (number == null) {
      setState({ pullRequest: null, loading: false, error: null });
      return;
    }
    const id = ++reqId.current;
    // Keep the previously-loaded PR visible while the next one fetches —
    // blanking to null would read to the panel as a dismissal (pullRequest
    // slice → null) and fire the PR-mode exit animation.
    setState((prev) => ({
      pullRequest: prev.pullRequest,
      loading: true,
      error: null,
    }));

    (async () => {
      try {
        const base = `/api/github/repo/${owner}/${repo}/pull-requests/${number}`;
        // Fetch the PR (required) and its changed files (best-effort) together.
        const [prRes, filesRes] = await Promise.all([
          fetch(base),
          fetch(`${base}/files`).catch(() => null),
        ]);
        if (!prRes.ok) {
          const data = await prRes.json().catch(() => ({}));
          throw new Error(
            data.error || `Failed to load pull request (${prRes.status})`,
          );
        }
        const prData: GitHubPullRequest = await prRes.json();
        if (id !== reqId.current) return; // superseded

        const view = pullRequestViewFromGitHubPullRequest(prData);

        if (filesRes && filesRes.ok) {
          const filesData = await filesRes.json().catch(() => null);
          const files: GitHubDiffEntry[] | undefined = filesData?.files;
          if (id !== reqId.current) return;
          if (Array.isArray(files) && files.length > 0) {
            view.files = pullRequestFilesFromGitHub(files);
          }
        }

        setState({ pullRequest: view, loading: false, error: null });
      } catch (err) {
        if (id !== reqId.current) return;
        setState({
          pullRequest: null,
          loading: false,
          error:
            err instanceof Error ? err.message : 'Failed to load pull request',
        });
      }
    })();
  }, [owner, repo, number]);

  return state;
}
