'use client';

/**
 * Trail page — standalone viewer for a shared sequence diagram.
 *
 * Resolves the trail by id (no owner/repo in the URL) via /api/trails/by-id/{id},
 * then renders only FileCitySequenceExplorerPanel with the minimum slices
 * the panel requires. Intentionally avoids RepositoryPageProvider so a
 * shared trail link doesn't drag in the editor's full data graph.
 */

import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import {
  PanelEventBus,
  type DataSlice,
  type PanelContextValue,
  type PanelEventEmitter,
} from '@principal-ade/panel-framework-core';
import {
  GitFileTreeBuilder,
  type FileTree,
} from '@principal-ai/repository-abstraction';
import { Logo } from '@principal-ai/logo-component';
import { trpc } from '@/lib/trpc/client';
import type {
  FileCitySequenceExplorerPanelActions,
  FileCitySequenceExplorerPanelContext,
} from '@industry-theme/file-city-panel';
import type {
  SequenceDiagramPayload,
  SharedSequenceDiagramIndexEntry,
} from '@/lib/sequence-diagrams/types';
import type { GitHubCommitDetailResponse } from '@/types/api';

const FileCitySequenceExplorerPanel = dynamic(
  () =>
    import('@industry-theme/file-city-panel').then(
      (m) => m.FileCitySequenceExplorerPanel,
    ),
  { ssr: false },
);

interface TrailResponse {
  owner: string;
  repo: string;
  entry: SharedSequenceDiagramIndexEntry;
  payload: SequenceDiagramPayload;
}

interface TrailContext {
  owner: string;
  repo: string;
  payload: SequenceDiagramPayload;
  fileTree: FileTree;
}

function nullSlice<T>(name: string): DataSlice<T | null> {
  return {
    scope: 'repository',
    name,
    data: null,
    loading: false,
    error: null,
    refresh: async () => {},
  };
}

function CenteredLogo() {
  const { theme } = useTheme();
  return (
    <div
      className="w-screen flex items-center justify-center overflow-hidden"
      style={{ background: theme.colors.background, height: '100vh' }}
    >
      <Logo
        width={64}
        height={64}
        color={theme.colors.accent}
        particleColor={theme.colors.primary}
        letterColor={theme.colors.text}
        opacity={0.9}
      />
    </div>
  );
}

function TrailErrorView({ message }: { message: string }) {
  const { theme } = useTheme();
  return (
    <div
      className="w-screen flex items-center justify-center"
      style={{ background: theme.colors.background, height: '100vh' }}
    >
      <div
        className="max-w-md px-6 py-4 rounded text-center"
        style={{ color: theme.colors.text }}
      >
        <div className="text-lg mb-2">Trail unavailable</div>
        <div style={{ color: theme.colors.textMuted }}>{message}</div>
      </div>
    </div>
  );
}

let __trailViewerInstanceCounter = 0;
let __trailPageInstanceCounter = 0;

function TrailViewer({ owner, repo, payload, fileTree }: TrailContext) {
  const { theme } = useTheme();
  const instanceIdRef = useRef<number | null>(null);
  if (instanceIdRef.current === null) {
    instanceIdRef.current = ++__trailViewerInstanceCounter;
  }
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;
  console.log(
    `[trail] TrailViewer render #${renderCountRef.current} (instance ${instanceIdRef.current})`,
    {
      ownerRepo: `${owner}/${repo}`,
      payloadId: payload.id,
      fileTreeRef: fileTree,
    },
  );
  useEffect(() => {
    console.log(
      `[trail] TrailViewer MOUNTED (instance ${instanceIdRef.current})`,
    );
    return () => {
      console.log(
        `[trail] TrailViewer UNMOUNTED (instance ${instanceIdRef.current})`,
      );
    };
  }, []);

  const events = useMemo<PanelEventEmitter>(() => {
    console.log(
      `[trail] TrailViewer events useMemo() — new PanelEventBus (instance ${instanceIdRef.current})`,
    );
    return new PanelEventBus();
  }, []);

  const context = useMemo<
    PanelContextValue<FileCitySequenceExplorerPanelContext>
  >(() => {
    console.log(
      `[trail] TrailViewer context useMemo() recomputed (instance ${instanceIdRef.current}) — fileTree/owner/repo/payload identity changed`,
    );
    const fileTreeSlice: DataSlice<FileTree> = {
      scope: 'repository',
      name: 'fileTree',
      data: fileTree,
      loading: false,
      error: null,
      refresh: async () => {},
    };

    return {
      currentScope: { type: 'repository' },
      refresh: async () => {},
      fileTree: fileTreeSlice,
      gitStatusWithFiles: nullSlice('gitStatusWithFiles'),
      lineCounts: nullSlice('lineCounts'),
      latestCommit: nullSlice('latestCommit'),
      scopeWorkspace: nullSlice('scopeWorkspace'),
      areaWorkspace: nullSlice('areaWorkspace'),
      sequenceDiagram: {
        scope: 'repository',
        name: 'sequenceDiagram',
        data: payload,
        loading: false,
        error: null,
        refresh: async () => {},
      },
      repository: { owner, name: repo },
    };
  }, [fileTree, owner, repo, payload]);

  const readFile = useCallback(
    async (path: string): Promise<string> => {
      let cleanPath = path;
      if (cleanPath.startsWith('/')) cleanPath = cleanPath.slice(1);
      if (cleanPath.startsWith('GitHub/')) {
        cleanPath = cleanPath.slice('GitHub/'.length);
      }
      const repoPrefix = `${owner}/${repo}/`;
      if (cleanPath.startsWith(repoPrefix)) {
        cleanPath = cleanPath.slice(repoPrefix.length);
      }

      const response = await fetch(
        `/api/github/repo/${owner}/${repo}?action=file&path=${encodeURIComponent(cleanPath)}`,
      );
      if (!response.ok) {
        throw new Error(`Failed to read file: ${response.statusText}`);
      }
      const data = await response.json();
      if (data.content && data.encoding === 'base64') {
        const binaryString = atob(String(data.content).replace(/\n/g, ''));
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return new TextDecoder('utf-8').decode(bytes);
      }
      return typeof data.content === 'string' ? data.content : '';
    },
    [owner, repo],
  );

  const getCommitDiff = useCallback(
    async (commitHash: string): Promise<string> => {
      const res = await fetch(
        `/api/github/repo/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(commitHash)}`,
      );
      if (!res.ok) {
        throw new Error(`Failed to fetch commit ${commitHash}: ${res.statusText}`);
      }
      const data: GitHubCommitDetailResponse = await res.json();
      return (data.files ?? [])
        .filter((f) => typeof f.patch === 'string')
        .map((f) => {
          const oldPath = f.previous_filename ?? f.filename;
          const newPath = f.filename;
          return [
            `diff --git a/${oldPath} b/${newPath}`,
            `--- a/${oldPath}`,
            `+++ b/${newPath}`,
            f.patch,
          ].join('\n');
        })
        .join('\n');
    },
    [owner, repo],
  );

  const actions = useMemo<FileCitySequenceExplorerPanelActions>(
    () => ({
      openFile: () => {
        // Trail viewer has no editor surface to open into; opening a file
        // would have nowhere to render. Intentional no-op.
      },
      readFile,
      getCommitDiff,
      getWorkingTreeDiff: async () => '',
      addToScope: async () => {
        throw new Error('Scopes are not available in the trail viewer.');
      },
      addArea: async () => {
        throw new Error('Areas are not available in the trail viewer.');
      },
      addPathToArea: async () => {
        throw new Error('Areas are not available in the trail viewer.');
      },
      createSequenceNote: async () => null,
      updateSequenceNote: async () => null,
      deleteSequenceNote: async () => {},
    }),
    [readFile, getCommitDiff],
  );

  return (
    <div
      className="w-screen overflow-hidden"
      style={{ background: theme.colors.background, height: '100vh' }}
    >
      <FileCitySequenceExplorerPanel
        context={context}
        actions={actions}
        events={events}
      />
    </div>
  );
}

export default function TrailPage() {
  const params = useParams();
  const id = params?.id as string | undefined;

  const pageInstanceIdRef = useRef<number | null>(null);
  if (pageInstanceIdRef.current === null) {
    pageInstanceIdRef.current = ++__trailPageInstanceCounter;
  }
  const pageRenderCountRef = useRef(0);
  pageRenderCountRef.current += 1;
  console.log(
    `[trail] TrailPage render #${pageRenderCountRef.current} (instance ${pageInstanceIdRef.current})`,
    { id },
  );
  useEffect(() => {
    console.log(
      `[trail] TrailPage MOUNTED (instance ${pageInstanceIdRef.current})`,
    );
    return () => {
      console.log(
        `[trail] TrailPage UNMOUNTED (instance ${pageInstanceIdRef.current})`,
      );
    };
  }, []);

  const [data, setData] = useState<TrailContext | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const effectRunId = Math.random().toString(36).slice(2, 8);
    console.log(
      `[trail] load-effect START (instance ${pageInstanceIdRef.current}, run ${effectRunId})`,
      { id },
    );

    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/trails/by-id/${encodeURIComponent(id!)}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            body?.error ??
              (res.status === 404
                ? 'This trail does not exist or has been removed.'
                : `Failed to load trail (${res.status}).`),
          );
        }
        const trail = (await res.json()) as TrailResponse;

        const treeData = await trpc.github.getTree.query({
          owner: trail.owner,
          repo: trail.repo,
        });
        const files = treeData.tree
          .filter((entry) => entry.type === 'blob')
          .map((entry) => ({
            path: entry.path,
            size: entry.size || 0,
          }));
        const tree = new GitFileTreeBuilder().build({
          files,
          rootPath: `/${trail.owner}/${trail.repo}`,
          commitSha: treeData.sha,
          branch: 'main',
        });

        if (cancelled) {
          console.log(
            `[trail] load-effect CANCELLED before setData (run ${effectRunId})`,
          );
          return;
        }
        console.log(
          `[trail] load-effect setData (run ${effectRunId})`,
          { ownerRepo: `${trail.owner}/${trail.repo}`, payloadId: trail.payload.id },
        );
        setData({
          owner: trail.owner,
          repo: trail.repo,
          payload: trail.payload,
          fileTree: tree,
        });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load trail.');
      }
    }

    load();
    return () => {
      cancelled = true;
      console.log(
        `[trail] load-effect CLEANUP (instance ${pageInstanceIdRef.current}, run ${effectRunId})`,
      );
    };
  }, [id]);

  useEffect(() => {
    if (data?.payload?.title) {
      document.title = `${data.payload.title} · Trail`;
    } else {
      document.title = 'Trail';
    }
  }, [data]);

  if (error) return <TrailErrorView message={error} />;
  if (!data) return <CenteredLogo />;
  return (
    <TrailViewer
      owner={data.owner}
      repo={data.repo}
      payload={data.payload}
      fileTree={data.fileTree}
    />
  );
}
