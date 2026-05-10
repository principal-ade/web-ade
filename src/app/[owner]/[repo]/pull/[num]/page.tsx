'use client';

/**
 * Experimental PR-walkthrough page — /[owner]/[repo]/pull/[num]
 *
 * Mirrors the GitHub PR URL shape. On mount, fetches /api/pr-trail which
 * either returns a cached trail (keyed by PR head SHA) or generates a fresh
 * one via OpenRouter. Renders with the same FileCityTrailExplorerPanel used
 * by /trail/[id].
 *
 * Sister production page: /trail/[id] (saved + S3-shared trails).
 * This page is experimental — generated payloads are never persisted to S3.
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
import { AlertTriangle } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { TrailLoadingAnimation } from '@/components/trail/TrailLoadingAnimation';
import { TrailHeader } from '@/components/trail/TrailHeader';
import type {
  FileCityTrailExplorerPanelActions,
  FileCityTrailExplorerPanelContext,
  FileCityTrailExplorerRepository,
} from '@industry-theme/file-city-panel';
import type { TrailPayload } from '@/lib/trails/types';

const FileCityTrailExplorerPanel = dynamic(
  () =>
    import('@industry-theme/file-city-panel').then(
      (m) => m.FileCityTrailExplorerPanel,
    ),
  { ssr: false },
);

// Same WebGL/shader warming dance as /trail/[id]/page.tsx — see
// docs/nextjs-3d-rendering-issue.md for context.
const FileCity3D = dynamic(
  () => import('@principal-ai/file-city-react').then((m) => m.FileCity3D),
  { ssr: false },
);

if (typeof window !== 'undefined') {
  void (FileCityTrailExplorerPanel as { preload?: () => Promise<unknown> }).preload?.();
  void (FileCity3D as { preload?: () => Promise<unknown> }).preload?.();
}

interface PrTrailResponse {
  owner: string;
  repo: string;
  num: number;
  cached: boolean;
  model: string;
  headSha: string;
  generatedAt: number;
  payload: TrailPayload;
}

interface ViewerState {
  owner: string;
  repo: string;
  payload: TrailPayload;
  fileTree: FileTree;
  model: string;
  cached: boolean;
}

const WARMING_CITY_DATA: import('@principal-ai/file-city-react').CityData = {
  buildings: [
    { path: 'src/index.ts', position: { x: 5, y: 0, z: 5 }, dimensions: [8, 12, 8], type: 'file', fileExtension: 'ts', size: 4096, lineCount: 240 },
    { path: 'src/app.tsx', position: { x: 18, y: 0, z: 5 }, dimensions: [8, 18, 8], type: 'file', fileExtension: 'tsx', size: 8192, lineCount: 480 },
    { path: 'src/api/client.js', position: { x: 31, y: 0, z: 5 }, dimensions: [6, 9, 6], type: 'file', fileExtension: 'js', size: 3000, lineCount: 180 },
    { path: 'src/components/Button.tsx', position: { x: 5, y: 0, z: 22 }, dimensions: [6, 6, 6], type: 'file', fileExtension: 'tsx', size: 1024, lineCount: 80 },
    { path: 'src/components/Modal.tsx', position: { x: 14, y: 0, z: 22 }, dimensions: [6, 14, 6], type: 'file', fileExtension: 'tsx', size: 6000, lineCount: 320 },
    { path: 'src/utils/helpers.ts', position: { x: 23, y: 0, z: 22 }, dimensions: [6, 9, 6], type: 'file', fileExtension: 'ts', size: 2400, lineCount: 160 },
    { path: 'src/styles/main.css', position: { x: 31, y: 0, z: 22 }, dimensions: [6, 5, 6], type: 'file', fileExtension: 'css', size: 1500 },
    { path: 'package.json', position: { x: 5, y: 0, z: 38 }, dimensions: [5, 4, 5], type: 'file', fileExtension: 'json', size: 800 },
    { path: 'README.md', position: { x: 14, y: 0, z: 38 }, dimensions: [5, 5, 5], type: 'file', fileExtension: 'json', size: 1500 },
    { path: 'tsconfig.json', position: { x: 23, y: 0, z: 38 }, dimensions: [5, 4, 5], type: 'file', fileExtension: 'json', size: 600 },
  ],
  districts: [
    {
      path: 'src',
      worldBounds: { minX: 0, maxX: 38, minZ: 0, maxZ: 30 },
      fileCount: 7,
      type: 'directory',
      label: { text: 'src', bounds: { minX: 0, maxX: 38, minZ: 30, maxZ: 33 }, position: 'bottom' },
    },
  ],
  bounds: { minX: -2, maxX: 40, minZ: -2, maxZ: 42 },
  metadata: { totalFiles: 10, totalDirectories: 1, rootPath: '/warming', analyzedAt: new Date() },
};

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

function PrTrailLoadingScreen({ owner, repo, num }: { owner: string; repo: string; num: string }) {
  const { theme } = useTheme();
  return (
    <div
      className="w-screen flex flex-col items-center justify-center overflow-hidden gap-6"
      style={{ background: theme.colors.background, height: '100vh' }}
    >
      <TrailLoadingAnimation />
      <div className="text-center" style={{ color: theme.colors.textMuted }}>
        <div className="text-sm">Generating trail for</div>
        <div className="text-base font-medium" style={{ color: theme.colors.text }}>
          {owner}/{repo} #{num}
        </div>
        <div className="text-xs mt-2 opacity-70">
          asking OpenRouter to walk the diff…
        </div>
      </div>
    </div>
  );
}

function PrTrailErrorView({ message }: { message: string }) {
  const { theme } = useTheme();
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
        <div
          className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full"
          style={{
            background: `${theme.colors.accent}1a`,
            color: theme.colors.accent,
          }}
        >
          <AlertTriangle size={30} strokeWidth={1.75} />
        </div>
        <h1 className="text-2xl font-semibold mb-3">Trail generation failed</h1>
        <p className="text-base leading-relaxed" style={{ color: theme.colors.textMuted }}>
          {message}
        </p>
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

function PrTrailViewer({ owner, repo, payload, fileTree, model, cached }: ViewerState) {
  const { theme } = useTheme();

  const events = useMemo<PanelEventEmitter>(() => new PanelEventBus(), []);

  const repository = useMemo<FileCityTrailExplorerRepository>(() => {
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
      if (cleanPath.startsWith('GitHub/')) cleanPath = cleanPath.slice('GitHub/'.length);
      const repoPrefix = `${owner}/${repo}/`;
      if (cleanPath.startsWith(repoPrefix)) cleanPath = cleanPath.slice(repoPrefix.length);

      const response = await fetch(
        `/api/github/repo/${owner}/${repo}?action=file&path=${encodeURIComponent(cleanPath)}`,
      );
      if (!response.ok) throw new Error(`Failed to read file: ${response.statusText}`);
      const data = await response.json();
      if (data.content && data.encoding === 'base64') {
        const binaryString = atob(String(data.content).replace(/\n/g, ''));
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
        return new TextDecoder('utf-8').decode(bytes);
      }
      return typeof data.content === 'string' ? data.content : '';
    },
    [owner, repo],
  );

  const actions = useMemo<FileCityTrailExplorerPanelActions>(
    () => ({
      openFile: () => {
        // Experimental viewer has no editor surface to open into; intentional no-op.
      },
      readFile,
      // Experimental trails are ephemeral — no note or sign-off persistence.
      createTrailNote: async () => null,
      updateTrailNote: async () => null,
      deleteTrailNote: async () => {},
      createTrailSignOff: async () => null,
      deleteTrailSignOff: async () => {},
    }),
    [readFile],
  );

  return (
    <div
      className="w-screen flex flex-col overflow-hidden"
      style={{ background: theme.colors.background, height: '100vh' }}
    >
      <TrailHeader owner={owner} repo={repo} trailId={payload.id} />
      <div
        className="px-4 py-1.5 text-xs flex items-center gap-3 border-b"
        style={{
          color: theme.colors.textMuted,
          background: theme.colors.surface,
          borderColor: theme.colors.border,
        }}
      >
        <span>experimental</span>
        <span>·</span>
        <span>model: {model}</span>
        <span>·</span>
        <span>{cached ? 'cached by SHA' : 'freshly generated'}</span>
      </div>
      <div className="flex-1 min-h-0">
        <FileCityTrailExplorerPanel context={context} actions={actions} events={events} />
      </div>
    </div>
  );
}

export default function PrTrailPage() {
  const params = useParams();
  const owner = params?.owner as string | undefined;
  const repo = params?.repo as string | undefined;
  const num = params?.num as string | undefined;

  const [data, setData] = useState<ViewerState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!owner || !repo || !num) return;

    let cancelled = false;

    // Same minimum-loading window as /trail/[id] so the warming FileCity3D has
    // time to compile its shader programs before the real panel takes over.
    const MIN_LOADING_MS = 2000;
    const minDelay = new Promise<void>((resolve) => setTimeout(resolve, MIN_LOADING_MS));

    async function load() {
      try {
        const res = await fetch(
          `/api/pr-trail?owner=${encodeURIComponent(owner!)}&repo=${encodeURIComponent(repo!)}&num=${encodeURIComponent(num!)}`,
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (cancelled) return;
          setError(body?.error ?? `Failed to generate trail (${res.status}).`);
          return;
        }
        const trail = (await res.json()) as PrTrailResponse;

        const treeData = await trpc.github.getTree.query({
          owner: trail.owner,
          repo: trail.repo,
        });
        const files = treeData.tree
          .filter((entry) => entry.type === 'blob')
          .map((entry) => ({ path: entry.path, size: entry.size || 0 }));
        const tree = new GitFileTreeBuilder().build({
          files,
          rootPath: `/${trail.owner}/${trail.repo}`,
          commitSha: treeData.sha,
          branch: 'main',
        });

        if (cancelled) return;
        await minDelay;
        if (cancelled) return;

        setData({
          owner: trail.owner,
          repo: trail.repo,
          payload: trail.payload,
          fileTree: tree,
          model: trail.model,
          cached: trail.cached,
        });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load trail.');
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [owner, repo, num]);

  useEffect(() => {
    if (data?.payload?.title) {
      document.title = `${data.payload.title} · PR Trail`;
    } else if (owner && repo && num) {
      document.title = `${owner}/${repo} #${num} · PR Trail`;
    }
  }, [data, owner, repo, num]);

  if (error) return <PrTrailErrorView message={error} />;

  if (!owner || !repo || !num) return null;

  if (!data) {
    return (
      <>
        <div style={{ position: 'fixed', inset: 0, zIndex: 0 }}>
          <FileCity3D
            cityData={WARMING_CITY_DATA}
            width="100%"
            height="100%"
            showControls={false}
          />
        </div>
        <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
          <PrTrailLoadingScreen owner={owner} repo={repo} num={num} />
        </div>
      </>
    );
  }

  return (
    <PrTrailViewer
      owner={data.owner}
      repo={data.repo}
      payload={data.payload}
      fileTree={data.fileTree}
      model={data.model}
      cached={data.cached}
    />
  );
}
