import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReadmeView } from '@industry-theme/file-city-panel';

interface Result {
  readme: ReadmeView | null;
  loading: boolean;
  error: string | null;
}

async function fetchReadmeContent(
  owner: string,
  repo: string,
  path: string,
  sha?: string | null,
): Promise<string> {
  const res = await fetch(
    `/api/github/repo/${owner}/${repo}?action=file&path=${encodeURIComponent(
      path,
    )}${sha ? `&ref=${encodeURIComponent(sha)}` : ''}`,
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Failed to load file (${res.status})`);
  }
  const data = await res.json();
  if (data.content && data.encoding === 'base64') {
    const binary = atob(String(data.content).replace(/\n/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  }
  if (typeof data.content === 'string') return data.content;
  return '';
}

function isMarkdown(path: string): boolean {
  return /\.mdx?$/i.test(path);
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

  const onNavigate = useCallback(
    async (href: string) => {
      const clean = href.startsWith('/') ? href.slice(1) : href;
      if (!isMarkdown(clean)) return null;
      try {
        const content = await fetchReadmeContent(owner, repo, clean, sha);
        return { path: clean, content };
      } catch {
        return null;
      }
    },
    [owner, repo, sha],
  );

  useEffect(() => {
    if (!path) {
      setState({ readme: null, loading: false, error: null });
      return;
    }
    const id = ++reqId.current;
    setState((prev) => ({ readme: prev.readme, loading: true, error: null }));

    (async () => {
      try {
        const content = await fetchReadmeContent(owner, repo, path, sha);
        if (id !== reqId.current) return;

        const basePath = path.includes('/')
          ? path.slice(0, path.lastIndexOf('/'))
          : '';
        setState({
          readme: {
            content,
            path,
            repositoryInfo: { owner, repo, branch: sha ?? 'HEAD', basePath },
            onNavigate,
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
  }, [owner, repo, path, sha, onNavigate]);

  return state;
}
