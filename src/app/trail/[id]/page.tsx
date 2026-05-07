'use client';

/**
 * Trail page — standalone viewer for a shared trail.
 *
 * Resolves the trail by id (no owner/repo in the URL) via
 * /api/trails/by-id/{id}, then renders FileCityTrailExplorerPanel with
 * the minimum context the panel requires. Intentionally avoids
 * RepositoryPageProvider so a shared trail link doesn't drag in the
 * editor's full data graph.
 *
 * The trail medium ships parallel to sequence diagrams — this page only
 * handles trails. Sequence diagrams are still served from
 * /d/{owner}/{repo}/{id} via the existing sequence-diagram surface.
 */

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { MapPinOff, AlertTriangle, Github } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { useAuth } from '@/contexts/AuthContext';
import { PrivatePropertySign } from './PrivatePropertySign';
import { TrailLoadingAnimation } from '@/components/trail/TrailLoadingAnimation';
import { TrailHeader } from '@/components/trail/TrailHeader';
import type {
  FileCityTrailExplorerPanelActions,
  FileCityTrailExplorerPanelContext,
  FileCityTrailExplorerRepository,
} from '@industry-theme/file-city-panel';
import {
  ShareErrorCodes,
  type ShareErrorCode,
  type TrailPayload,
  type SharedTrailIndexEntry,
} from '@/lib/trails/types';

const FileCityTrailExplorerPanel = dynamic(
  () =>
    import('@industry-theme/file-city-panel').then(
      (m) => m.FileCityTrailExplorerPanel,
    ),
  { ssr: false },
);

interface TrailResponse {
  owner: string;
  repo: string;
  entry: SharedTrailIndexEntry;
  payload: TrailPayload;
}

interface TrailContext {
  owner: string;
  repo: string;
  payload: TrailPayload;
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

function TrailLoadingScreen() {
  const { theme } = useTheme();
  return (
    <div
      className="w-screen flex items-center justify-center overflow-hidden"
      style={{ background: theme.colors.background, height: '100vh' }}
    >
      <TrailLoadingAnimation />
    </div>
  );
}

function TrailErrorView({
  message,
  code,
}: {
  message: string;
  code: ShareErrorCode | null;
}) {
  const { theme } = useTheme();
  const { isAuthenticated, login } = useAuth();

  const isNoAccess = code === ShareErrorCodes.NO_REPO_ACCESS;
  const isNotFound = code === ShareErrorCodes.NOT_FOUND;
  const showLogin = isNoAccess && !isAuthenticated;

  const Icon = isNotFound ? MapPinOff : AlertTriangle;
  const title = isNoAccess
    ? 'This trail is in a private repository'
    : isNotFound
      ? 'Trail not found'
      : 'Trail unavailable';
  const helper =
    isNoAccess && !showLogin
      ? 'Your current GitHub account does not have read access to this repository.'
      : null;

  return (
    <div
      className="w-screen flex items-center justify-center px-4"
      style={{ background: theme.colors.background, height: '100vh' }}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-lg border px-10 py-12 text-center shadow-sm"
        style={{
          color: theme.colors.text,
          background: theme.colors.backgroundSecondary ?? theme.colors.background,
          borderColor: theme.colors.border ?? 'rgba(255,255,255,0.08)',
        }}
      >
        {isNoAccess ? (
          <div className="-mx-10 -mt-12 mb-6 flex items-center justify-center">
            <PrivatePropertySign />
          </div>
        ) : (
          <div
            className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full"
            style={{
              background: `${theme.colors.accent}1a`,
              color: theme.colors.accent,
            }}
          >
            <Icon size={30} strokeWidth={1.75} />
          </div>
        )}
        <h1
          className="text-2xl font-semibold mb-3"
          style={isNoAccess ? { color: theme.colors.primary } : undefined}
        >
          {title}
        </h1>
        {(helper || !isNoAccess) && (
          <p
            className="text-base leading-relaxed"
            style={{ color: theme.colors.textMuted }}
          >
            {helper ?? message}
          </p>
        )}
        {showLogin && (
          <button
            type="button"
            onClick={() => login()}
            className="mt-8 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md text-base font-medium transition-opacity hover:opacity-90"
            style={{
              background: theme.colors.accent,
              color: theme.colors.background,
            }}
          >
            <Github size={18} strokeWidth={2} />
            Sign in with GitHub
          </button>
        )}
        <div className="mt-8">
          <Link
            href="/"
            className="text-sm underline-offset-2 hover:underline"
            style={{ color: theme.colors.textMuted }}
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}

function TrailViewer({ owner, repo, payload, fileTree }: TrailContext) {
  const { theme } = useTheme();

  const events = useMemo<PanelEventEmitter>(() => new PanelEventBus(), []);

  const repository = useMemo<FileCityTrailExplorerRepository>(() => {
    // For multi-repo trails the panel filters markers by `id`. Single-repo
    // trails carry no `marker.repo`, so any id passes the filter — we
    // mirror the payload's first registered repo when present and fall
    // back to "owner/repo" as a stable synthetic id otherwise.
    const id = payload.repos?.[0]?.id ?? `${owner}/${repo}`;
    return { id, owner, name: repo };
  }, [owner, repo, payload]);

  const context = useMemo<
    PanelContextValue<FileCityTrailExplorerPanelContext>
  >(() => {
    const fileTreeSlice: DataSlice<FileTree> = {
      scope: 'repository',
      name: 'fileTree',
      data: fileTree,
      loading: false,
      error: null,
      refresh: async () => {},
    };

    const trailSlice: DataSlice<TrailPayload | null> = {
      scope: 'repository',
      name: 'trail',
      data: payload,
      loading: false,
      error: null,
      refresh: async () => {},
    };

    return {
      currentScope: { type: 'repository' },
      refresh: async () => {},
      fileTree: fileTreeSlice,
      lineCounts: nullSlice('lineCounts'),
      trail: trailSlice,
      repository,
    };
  }, [fileTree, payload, repository]);

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

  const actions = useMemo<FileCityTrailExplorerPanelActions>(
    () => ({
      openFile: () => {
        // Trail viewer has no editor surface to open into; opening a file
        // would have nowhere to render. Intentional no-op.
      },
      readFile,
      // Trail-side note persistence has no host endpoint yet (notes are
      // host-private per the trail design). The shared viewer can't
      // write notes back into the read-only S3 payload, so all three
      // resolve as no-ops — the panel renders existing notes (if any
      // were authored before publish) but new notes can't be saved.
      createTrailNote: async () => null,
      updateTrailNote: async () => null,
      deleteTrailNote: async () => {},
    }),
    [readFile],
  );

  return (
    <div
      className="w-screen flex flex-col overflow-hidden"
      style={{ background: theme.colors.background, height: '100vh' }}
    >
      <TrailHeader owner={owner} repo={repo} />
      <div className="flex-1 min-h-0">
        <FileCityTrailExplorerPanel
          context={context}
          actions={actions}
          events={events}
        />
      </div>
    </div>
  );
}

export default function TrailPage() {
  const params = useParams();
  const id = params?.id as string | undefined;

  const [data, setData] = useState<TrailContext | null>(null);
  const [error, setError] = useState<{
    message: string;
    code: ShareErrorCode | null;
  } | null>(null);

  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/trails/by-id/${encodeURIComponent(id!)}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const message: string =
            body?.error ??
            (res.status === 404
              ? 'This trail does not exist or has been removed.'
              : `Failed to load trail (${res.status}).`);
          if (cancelled) return;
          setError({ message, code: (body?.code as ShareErrorCode) ?? null });
          return;
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

        if (cancelled) return;
        setData({
          owner: trail.owner,
          repo: trail.repo,
          payload: trail.payload,
          fileTree: tree,
        });
      } catch (err) {
        if (cancelled) return;
        setError({
          message: err instanceof Error ? err.message : 'Failed to load trail.',
          code: null,
        });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (data?.payload?.title) {
      document.title = `${data.payload.title} · Trail`;
    } else {
      document.title = 'Trail';
    }
  }, [data]);

  if (error)
    return <TrailErrorView message={error.message} code={error.code} />;
  if (!data) return <TrailLoadingScreen />;
  return (
    <TrailViewer
      owner={data.owner}
      repo={data.repo}
      payload={data.payload}
      fileTree={data.fileTree}
    />
  );
}
