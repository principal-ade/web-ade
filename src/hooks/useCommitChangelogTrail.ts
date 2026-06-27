import { useEffect, useRef, useState } from 'react';
import type { GitHubCommitDetailResponse } from '@/types/api';
import type { TrailPayload, TrailMarker } from '@/lib/trails/types';
import {
  parsePatchNewRange,
  languageFromFilename,
} from '@/lib/activity/commitLayers';

// Cap how many files become diff markers, so a giant commit doesn't fire
// hundreds of parent-content reads. Extra files are noted in the summary.
const MAX_FILE_MARKERS = 40;

interface Result {
  payload: TrailPayload | null;
  loading: boolean;
  error: string | null;
}

async function readFileAtRef(
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<string> {
  const res = await fetch(
    `/api/github/repo/${owner}/${repo}?action=file&path=${encodeURIComponent(
      path,
    )}&ref=${encodeURIComponent(ref)}`,
  );
  if (!res.ok) return '';
  const data = await res.json();
  if (data.content && data.encoding === 'base64') {
    const binary = atob(String(data.content).replace(/\n/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }
  return typeof data.content === 'string' ? data.content : '';
}

/**
 * Synthesizes a `purpose: 'changelog'` TrailPayload from a commit so the commit
 * can be rendered natively by FileCityTrailExplorerPanel: one marker per changed
 * file with a before/after diff snippet, and the changed files highlighted on
 * the city. Pre-change (`oldContents`) is read at the parent commit; post-change
 * resolves via the panel's `readFile` against the trail's `authoredAt.sha`
 * (the commit), so the host must pin reads to this sha.
 */
export function useCommitChangelogTrail(
  owner: string,
  repo: string,
  sha: string | null,
): Result {
  const [state, setState] = useState<Result>({
    payload: null,
    loading: false,
    error: null,
  });
  const reqId = useRef(0);

  useEffect(() => {
    if (!sha) {
      setState({ payload: null, loading: false, error: null });
      return;
    }
    const id = ++reqId.current;
    setState({ payload: null, loading: true, error: null });

    (async () => {
      try {
        const res = await fetch(`/api/github/repo/${owner}/${repo}/commits/${sha}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Failed to load commit (${res.status})`);
        }
        const detail: GitHubCommitDetailResponse = await res.json();
        const parentSha = detail.parents?.[0]?.sha ?? null;

        const allFiles = detail.files ?? [];
        const fileSlice = allFiles.slice(0, MAX_FILE_MARKERS);

        const markers: TrailMarker[] = await Promise.all(
          fileSlice.map(async (f, i): Promise<TrailMarker> => {
            const range = parsePatchNewRange(f.patch);
            const oldPath = f.previous_filename ?? f.filename;

            // No textual diff (binary / unparseable) → a plain reference marker.
            if (!range) {
              return {
                id: `m${i}`,
                label: f.filename,
                sourcePath: f.filename,
                description: `\`${f.filename}\` — ${f.status} (no textual diff)`,
              };
            }

            // Pre-change contents from the parent commit. Added files have none.
            const oldContents =
              f.status === 'added' || !parentSha
                ? ''
                : await readFileAtRef(owner, repo, oldPath, parentSha);

            // Removed files have no post-change content; pin it to '' so the
            // panel doesn't try to read a deleted path. Others resolve at the
            // commit sha via the host readFile.
            const newContents = f.status === 'removed' ? '' : undefined;

            return {
              id: `m${i}`,
              label: f.filename,
              sourcePath: f.filename,
              snippet: {
                kind: 'diff',
                oldContents,
                ...(newContents !== undefined ? { newContents } : {}),
                startLine: range.startLine,
                endLine: range.endLine,
                language: languageFromFilename(f.filename),
                diffStyle: 'split',
              },
            };
          }),
        );

        if (id !== reqId.current) return; // superseded

        // The panel only renders a `kind: 'sequence'` view (others, and an
        // empty `views`, show "Trail has no views"). Project each file marker
        // into a sequence node; lane derives from the path's first segment.
        const viewMarkers = markers.map((m) => ({
          markerId: m.id,
          name: (m.sourcePath ?? m.label ?? m.id).replace(/\//g, '.'),
        }));

        const subject = detail.commit.message.split('\n')[0] ?? 'Commit';
        const body = detail.commit.message.split('\n').slice(1).join('\n').trim();
        const authorName = detail.author?.login ?? detail.commit.author.name;
        const dateIso = detail.commit.author.date;
        const truncated = allFiles.length - fileSlice.length;
        const summary = [
          `**${authorName}** committed \`${sha.slice(0, 7)}\``,
          '',
          `${allFiles.length} file${allFiles.length === 1 ? '' : 's'} changed · ` +
            `+${detail.stats?.additions ?? 0} −${detail.stats?.deletions ?? 0}`,
          truncated > 0 ? `\n_Showing first ${fileSlice.length}; ${truncated} more not shown._` : '',
          body ? `\n\n${body}` : '',
        ]
          .filter(Boolean)
          .join('\n');

        const payload: TrailPayload = {
          id: `commit:${owner}/${repo}@${sha}`,
          title: subject,
          purpose: 'changelog',
          summary,
          author: authorName,
          // Single-repo provenance shorthand — pins the panel's readFile to the
          // commit so post-change contents resolve at the right snapshot.
          authoredAt: { sha },
          markers,
          views: [{ kind: 'sequence', markers: viewMarkers, edges: [] }],
          createdAt: dateIso,
          updatedAt: dateIso,
        };

        setState({ payload, loading: false, error: null });
      } catch (err) {
        if (id !== reqId.current) return;
        setState({
          payload: null,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load commit',
        });
      }
    })();
  }, [owner, repo, sha]);

  return state;
}
