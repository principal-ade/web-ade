import { useEffect, useRef, useState } from 'react';
import type { ReadmeView } from '@industry-theme/file-city-panel';

interface Result {
  readme: ReadmeView | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetches a repo file's markdown and maps it to the `ReadmeView` shape consumed
 * by FileCityGuidePanel's native readme mode (markdown left + city + file-type
 * legend). Mirrors {@link useCommitView}: pass the README path to load it, or
 * `null` to idle. Reads HEAD via the same GitHub file API the source drawer
 * uses, base64-decoding the response.
 */
export function useReadme(
  owner: string,
  repo: string,
  path: string | null,
  sha?: string | null,
): Result {
  const [state, setState] = useState<Result>({
    readme: null,
    loading: false,
    error: null,
  });
  const reqId = useRef(0);

  useEffect(() => {
    if (!path) {
      setState({ readme: null, loading: false, error: null });
      return;
    }
    const id = ++reqId.current;
    // Hold the previously-loaded readme visible while the next one fetches —
    // blanking to null reads to the panel as a dismissal and fires the exit
    // animation (same reasoning as useCommitView).
    setState((prev) => ({ readme: prev.readme, loading: true, error: null }));

    (async () => {
      try {
        const res = await fetch(
          `/api/github/repo/${owner}/${repo}?action=file&path=${encodeURIComponent(
            path,
          )}${sha ? `&ref=${encodeURIComponent(sha)}` : ''}`,
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Failed to load README (${res.status})`);
        }
        const data = await res.json();
        if (id !== reqId.current) return; // superseded

        let content = '';
        if (data.content && data.encoding === 'base64') {
          const binary = atob(String(data.content).replace(/\n/g, ''));
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          content = new TextDecoder('utf-8').decode(bytes);
        } else if (typeof data.content === 'string') {
          content = data.content;
        }

        // Repo context so the panel's markdown renderer rewrites relative
        // image/link URLs (e.g. `./docs/logo.png`) to GitHub raw URLs.
        // `basePath` is the README's own directory so relative paths resolve
        // against its location.
        //
        // Pin the renderer's relative image/link rewriting to the same ref the
        // content was read from. With a `sha`, raw URLs resolve against that
        // immutable commit so images match the pinned README. Without one, fall
        // back to `HEAD`: the renderer defaults a missing branch to `main`, which
        // 404s on repos whose default branch isn't `main` (e.g. opencode →
        // `master`), whereas GitHub's raw host resolves `HEAD` to the default
        // branch for ANY repo — matching the unpinned content fetched above.
        const basePath = path.includes('/')
          ? path.slice(0, path.lastIndexOf('/'))
          : '';
        setState({
          readme: {
            content,
            path,
            repositoryInfo: { owner, repo, branch: sha ?? 'HEAD', basePath },
          },
          loading: false,
          error: null,
        });
      } catch (err) {
        if (id !== reqId.current) return;
        setState({
          readme: null,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load README',
        });
      }
    })();
  }, [owner, repo, path, sha]);

  return state;
}
