'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import {
  PanelEventBus,
  type DataSlice,
  type PanelContextValue,
} from '@principal-ade/panel-framework-core';
import {
  GitFileTreeBuilder,
  type FileTree,
} from '@principal-ai/repository-abstraction';
import type {
  FileCityGuidePanelActions,
  FileCityGuidePanelContext,
  FileCityGuideRepository,
} from '@industry-theme/file-city-panel';
import { trpc } from '@/lib/trpc/client';
import { useReadme } from '@/hooks/useReadme';

// ---------------------------------------------------------------------------
// RepoFileCityPane — a scoped, self-contained File City right pane: it loads a
// repo's file tree + root README and renders the FileCityGuidePanel showing the
// idle colored city with the README beside it. It's the minimal slice of the
// owner/repo explorer's right pane (no tours / trails / commits / issues), so it
// can be dropped into the signed-in home's two-pane surface for whatever repo
// the user picks.
// ---------------------------------------------------------------------------

// Client-only: the panel pulls in the 3D city (touches WebGL/window on load).
const FileCityGuidePanel = dynamic(
  () =>
    import('@industry-theme/file-city-panel').then((m) => m.FileCityGuidePanel),
  { ssr: false },
);

// Root README lookup (mirrors the explorer's findReadmePath, root scope only).
function findRootReadme(filePaths: string[]): string | null {
  const matches = filePaths.filter(
    (p) => !p.includes('/') && /^readme(\.|$)/i.test(p),
  );
  if (matches.length === 0) return null;
  return (
    matches.find((p) => /^readme\.md$/i.test(p)) ??
    matches.find((p) => /\.md$/i.test(p)) ??
    matches.find((p) => /\.markdown$/i.test(p)) ??
    matches[0] ??
    null
  );
}

export function RepoFileCityPane({
  owner,
  repo,
  readmePath: readmePathOverride,
}: {
  owner: string;
  repo: string;
  /**
   * Explicit README path to render, bypassing the root-README lookup. Used for
   * an org's `.github` profile repo, whose README lives at `profile/README.md`
   * rather than the root. Falls back to the root README when omitted.
   */
  readmePath?: string | null;
}) {
  const { theme } = useTheme();
  const [fileTree, setFileTree] = useState<FileTree | null>(null);
  const [filePaths, setFilePaths] = useState<string[]>([]);
  const [treeError, setTreeError] = useState<string | null>(null);

  // Repo file tree — required by the panel. One fetch per owner/repo.
  useEffect(() => {
    let cancelled = false;
    setTreeError(null);
    (async () => {
      try {
        const treeData = await trpc.github.getTree.query({ owner, repo });
        if (cancelled) return;
        const blobs = treeData.tree.filter((e) => e.type === 'blob');
        const tree = new GitFileTreeBuilder().build({
          files: blobs.map((e) => ({ path: e.path, size: e.size || 0 })),
          rootPath: `/${owner}/${repo}`,
          commitSha: treeData.sha,
          branch: 'main',
        });
        if (cancelled) return;
        setFileTree(tree);
        setFilePaths(blobs.map((e) => e.path));
      } catch (err) {
        if (cancelled) return;
        const raw = err instanceof Error ? err.message : '';
        const isParseError = /JSON|Unexpected end of|Unexpected token/i.test(raw);
        setTreeError(
          isParseError || !raw
            ? 'This repository is too large to load right now. Refresh to try again.'
            : raw,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [owner, repo]);

  const readmePath = useMemo(
    () => readmePathOverride ?? findRootReadme(filePaths),
    [readmePathOverride, filePaths],
  );
  const { readme: readmeView, loading: readmeLoading } = useReadme(
    owner,
    repo,
    readmePath,
  );

  const events = useMemo(() => new PanelEventBus(), []);
  const repository = useMemo<FileCityGuideRepository>(
    () => ({ id: `${owner}/${repo}`, owner, name: repo }),
    [owner, repo],
  );

  const actions = useMemo<FileCityGuidePanelActions>(
    () => ({
      // Clicking a building opens the file on GitHub (the home pane has no source
      // drawer of its own — that's an owner/repo-page affordance).
      openFile: (filePath: string) => {
        window.open(
          `https://github.com/${owner}/${repo}/blob/HEAD/${filePath}`,
          '_blank',
          'noopener,noreferrer',
        );
      },
      fetchAudioUrls: async () => new Map<string, string>(),
      closeCommit: () => {},
      closeIssue: () => {},
    }),
    [owner, repo],
  );

  const context = useMemo<PanelContextValue<FileCityGuidePanelContext>>(() => {
    const fileTreeSlice: DataSlice<FileTree> = {
      scope: 'repository',
      name: 'fileTree',
      data: fileTree ?? (null as unknown as FileTree),
      loading: fileTree === null,
      error: null,
      refresh: async () => {},
    };
    return {
      currentScope: { type: 'repository' },
      refresh: async () => {},
      fileTree: fileTreeSlice,
      lineCounts: {
        scope: 'repository',
        name: 'lineCounts',
        data: null,
        loading: false,
        error: null,
        refresh: async () => {},
      },
      tour: {
        scope: 'repository',
        name: 'tour',
        data: null,
        loading: false,
        error: null,
        refresh: async () => {},
      },
      commit: {
        scope: 'repository',
        name: 'commit',
        data: null,
        loading: false,
        error: null,
        refresh: async () => {},
      },
      issue: {
        scope: 'repository',
        name: 'issue',
        data: null,
        loading: false,
        error: null,
        refresh: async () => {},
      },
      // The root README, shown in the panel's native readme mode (markdown +
      // city + file-type legend). Null when the repo has no README → idle city.
      readme: {
        scope: 'repository',
        name: 'readme',
        data: readmeView,
        loading: readmeLoading,
        error: null,
        refresh: async () => {},
      },
      highlightLayers: {
        scope: 'repository',
        name: 'highlightLayers',
        data: null,
        loading: false,
        error: null,
        refresh: async () => {},
      },
      repository,
    };
  }, [fileTree, readmeView, readmeLoading, repository]);

  if (treeError) {
    return (
      <div
        className="flex-1 min-w-0 min-h-0 flex items-center justify-center px-6"
        style={{ background: theme.colors.background, color: theme.colors.textMuted }}
      >
        <div className="text-center max-w-md" style={{ fontSize: theme.fontSizes[1] }}>
          {treeError}
        </div>
      </div>
    );
  }

  if (!fileTree) {
    return (
      <div
        className="flex-1 min-w-0 min-h-0 flex items-center justify-center"
        style={{ background: theme.colors.background, color: theme.colors.textMuted }}
      >
        <div style={{ fontSize: theme.fontSizes[1] }}>Loading repository…</div>
      </div>
    );
  }

  return (
    <div
      className="flex-1 min-w-0 min-h-0 relative"
      style={{ background: theme.colors.background }}
    >
      <FileCityGuidePanel
        context={context}
        actions={actions}
        events={events}
        defaultIsolationMode="hide"
        excludedFolders={[]}
        showColorLegend
        showColorLegendToggle
        showFileTreeToggle
        readmeMarkdownWidth={0.66}
        defaultSkipWelcome
      />
    </div>
  );
}
