'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '@principal-ade/industry-theme';
import {
  Github,
  History,
  Search,
  FileText,
  Settings,
  Check,
} from 'lucide-react';
import { FileTree as PierreFileTree, useFileTree } from '@pierre/trees/react';
import { themeToTreeStyles } from '@pierre/trees';
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
import type {
  FileCityTrailExplorerPanelActions,
  FileCityTrailExplorerPanelContext,
  FileCityTrailExplorerRepository,
  HighlightLayer,
} from '@industry-theme/file-city-panel';
import { trpc } from '@/lib/trpc/client';
import { useAuth } from '@/contexts/AuthContext';
import { LOCAL_AUTHOR } from '@/lib/trails/local-mutations';
import { UserAvatarMenu } from '@/components/UserAvatarMenu';
import { TrailLoadingScreen } from '@/components/trail/TrailLoadingScreen';
import { TrailErrorView } from '@/components/trail/TrailErrorView';
import { TrailShareModal } from '@/components/trail/TrailShareModal';
import {
  type ShareErrorCode,
  type SharedTrailIndexEntry,
  type TrailPayload,
} from '@/lib/trails/types';

const FileCityTrailExplorerPanel = dynamic(
  () =>
    import('@industry-theme/file-city-panel').then(
      (m) => m.FileCityTrailExplorerPanel,
    ),
  { ssr: false },
);

// FileCity3D loaded directly so we can warm WebGL / shader caches with a
// minimal sample scene during the loading screen, mirroring the trail
// page. See docs/nextjs-3d-rendering-issue.md.
const FileCity3D = dynamic(
  () => import('@principal-ai/file-city-react').then((m) => m.FileCity3D),
  { ssr: false },
);

if (typeof window !== 'undefined') {
  void (
    FileCityTrailExplorerPanel as { preload?: () => Promise<unknown> }
  ).preload?.();
  void (FileCity3D as { preload?: () => Promise<unknown> }).preload?.();
}

// Sample CityData used to warm FC3D's WebGL / shader caches during the
// loading screen — same fixture the trail page uses.
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
    { path: 'README.md', position: { x: 14, y: 0, z: 38 }, dimensions: [5, 5, 5], type: 'file', fileExtension: 'md', size: 1500 },
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

interface RepoTrailExplorerPageProps {
  owner: string;
  repo: string;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; entries: SharedTrailIndexEntry[] }
  | { kind: 'error'; message: string; code: ShareErrorCode | null };

export function RepoTrailExplorerPage({ owner, repo }: RepoTrailExplorerPageProps) {
  const { theme } = useTheme();

  const { user } = useAuth();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  // Minimum loading window so the warming FileCity3D (rendered behind
  // the loading screen) has time to mount, init WebGL, and compile its
  // shader programs before the real panel takes over. Mirrors the trail
  // page's MIN_LOADING_MS. See docs/nextjs-3d-rendering-issue.md.
  const [minDelayElapsed, setMinDelayElapsed] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setMinDelayElapsed(true), 2000);
    return () => window.clearTimeout(t);
  }, []);
  const [filterQuery, setFilterQuery] = useState('');
  const [selectedTrailId, setSelectedTrailId] = useState<string | null>(null);
  // hoveredTrailId will drive highlight layers on the file map once the
  // explorer is wired up. Kept here so the list rows can broadcast it.
  const [hoveredTrailId, setHoveredTrailId] = useState<string | null>(null);
  // Debt-view toggle — when on, the idle highlight layer flips to the
  // *undocumented* files (inverse of coverage) so the user can see what
  // the trails haven't reached yet. Toggled from the header counter.
  const [debtMode] = useState(false);

  // Folder include/exclude config — directory paths the user has gated
  // out of the coverage / debt calculation. Persisted to localStorage
  // per (owner, repo). Paths are stored *with* a trailing slash so they
  // can be matched against file paths via prefix.
  const excludedDirsStorageKey = `principal:trail-excluded-dirs:${owner}/${repo}`;
  const [excludedDirs, setExcludedDirs] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(excludedDirsStorageKey);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((p): p is string => typeof p === 'string')
        : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(
        excludedDirsStorageKey,
        JSON.stringify(excludedDirs),
      );
    } catch {
      // localStorage may be unavailable (private mode, quota) — best-effort.
    }
  }, [excludedDirsStorageKey, excludedDirs]);

  // When true, the left rail swaps the trail list for a directory tree
  // the user can use to gate folders in / out of the coverage calc.
  const [configMode, setConfigMode] = useState(false);

  useEffect(() => {
    document.title = `${owner}/${repo}`;
  }, [owner, repo]);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });

    async function load() {
      try {
        const res = await fetch(
          `/api/trails/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (cancelled) return;
          setState({
            kind: 'error',
            message:
              body?.error ??
              (res.status === 404
                ? 'No trails found for this repository.'
                : `Failed to load trails (${res.status}).`),
            code: (body?.code as ShareErrorCode) ?? null,
          });
          return;
        }
        const data = (await res.json()) as { entries: SharedTrailIndexEntry[] };
        if (cancelled) return;
        setState({ kind: 'ready', entries: data.entries });
      } catch (err) {
        if (cancelled) return;
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Failed to load trails.',
          code: null,
        });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [owner, repo]);

  const filteredEntries = useMemo(() => {
    if (state.kind !== 'ready') return [];
    const q = filterQuery.trim().toLowerCase();
    if (!q) return state.entries;
    return state.entries.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        e.createdBy?.githubLogin?.toLowerCase().includes(q),
    );
  }, [state, filterQuery]);

  // Per-trail payload cache. Both hover (for highlight-layer preview)
  // and select (for full panel rendering) trigger a lazy fetch; once
  // cached, subsequent lookups are instant. The list endpoint only
  // carries marker counts, not paths, so payloads are required either
  // way.
  const [payloads, setPayloads] = useState<Map<string, TrailPayload>>(
    () => new Map(),
  );
  const inflightRef = useRef<Set<string>>(new Set());
  const ensurePayload = useCallback((id: string) => {
    if (inflightRef.current.has(id)) return;
    inflightRef.current.add(id);
    void (async () => {
      try {
        const res = await fetch(`/api/trails/by-id/${encodeURIComponent(id)}`);
        if (!res.ok) return;
        const data = (await res.json()) as { payload: TrailPayload };
        setPayloads((prev) => {
          if (prev.has(id)) return prev;
          const next = new Map(prev);
          next.set(id, data.payload);
          return next;
        });
      } catch {
        // best-effort fetch; silently skip
      } finally {
        inflightRef.current.delete(id);
      }
    })();
  }, []);
  useEffect(() => {
    if (hoveredTrailId && !payloads.has(hoveredTrailId)) {
      ensurePayload(hoveredTrailId);
    }
  }, [hoveredTrailId, payloads, ensurePayload]);
  useEffect(() => {
    if (selectedTrailId && !payloads.has(selectedTrailId)) {
      ensurePayload(selectedTrailId);
    }
  }, [selectedTrailId, payloads, ensurePayload]);

  // Batch-prefetch every trail's payload once the index lands. We need
  // the full set of marker paths to build the base "documented files"
  // highlight layer; without it the idle map can't visually emphasize
  // trail-touched files. Fires once per entry — `ensurePayload` is a
  // no-op for in-flight or cached ids, so this is safe to call broadly.
  useEffect(() => {
    if (state.kind !== 'ready') return;
    for (const entry of state.entries) {
      if (!payloads.has(entry.id)) ensurePayload(entry.id);
    }
  }, [state, payloads, ensurePayload]);

  // Repo file tree — required by the panel. One fetch per owner/repo;
  // cached for the lifetime of the page.
  const [fileTree, setFileTree] = useState<FileTree | null>(null);
  const [treeError, setTreeError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setFileTree(null);
    setTreeError(null);
    (async () => {
      try {
        const treeData = await trpc.github.getTree.query({ owner, repo });
        if (cancelled) return;
        const files = treeData.tree
          .filter((entry) => entry.type === 'blob')
          .map((entry) => ({ path: entry.path, size: entry.size || 0 }));
        const tree = new GitFileTreeBuilder().build({
          files,
          rootPath: `/${owner}/${repo}`,
          commitSha: treeData.sha,
          branch: 'main',
        });
        if (cancelled) return;
        setFileTree(tree);
      } catch (err) {
        if (cancelled) return;
        setTreeError(
          err instanceof Error ? err.message : 'Failed to load repository tree.',
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [owner, repo]);

  const selectedPayload = selectedTrailId
    ? (payloads.get(selectedTrailId) ?? null)
    : null;

  // Sorted, deduped list of every directory in the repo, with trailing
  // slashes so Pierre's tree treats them as folders. Combined with the
  // file paths below, this is what we feed Pierre — files show in the
  // tree for context but the kebab is only enabled on folders.
  const dirPaths = useMemo<string[]>(() => {
    if (!fileTree) return [];
    const dirs = new Set<string>();
    for (const f of fileTree.allFiles) {
      const segments = f.path.split('/');
      let current = '';
      // Each segment except the last (the filename) contributes a dir.
      for (let i = 0; i < segments.length - 1; i++) {
        const segment = segments[i];
        if (!segment) continue;
        current = current ? `${current}/${segment}` : segment;
        dirs.add(`${current}/`);
      }
    }
    return Array.from(dirs).sort();
  }, [fileTree]);

  // All file paths in the repo — feeds Pierre alongside `dirPaths`.
  const filePaths = useMemo<string[]>(
    () => (fileTree ? fileTree.allFiles.map((f) => f.path) : []),
    [fileTree],
  );

  // Effective excluded file set — every file that lives under any
  // user-excluded directory. Computed once and reused everywhere the
  // exclusion cascade matters (coverage stats, highlight layers).
  const excludedFilePaths = useMemo<Set<string>>(() => {
    const out = new Set<string>();
    if (excludedDirs.length === 0 || !fileTree) return out;
    // Normalize: every prefix ends with '/' so startsWith won't match
    // "src/foo" against an excluded dir named "src/f".
    const prefixes = excludedDirs.map((d) =>
      d.endsWith('/') ? d : `${d}/`,
    );
    for (const f of fileTree.allFiles) {
      if (prefixes.some((p) => f.path.startsWith(p))) out.add(f.path);
    }
    return out;
  }, [excludedDirs, fileTree]);

  // Rebuilt FileTree with excluded subtrees stripped — this is what the
  // panel sees, so excluded folders disappear from the panel's internal
  // tree views (drawer, navigation) on top of the `excludedFolders`
  // prop which strips them from `cityData`. Returns the original tree
  // when nothing is excluded so we don't re-build on every render.
  const filteredFileTree = useMemo<FileTree | null>(() => {
    if (!fileTree) return null;
    if (excludedFilePaths.size === 0) return fileTree;
    const sourceInfo = (fileTree.metadata.sourceInfo ?? {}) as {
      commitSha?: string;
      branch?: string;
      rootPath?: string;
    };
    const files = fileTree.allFiles
      .filter((f) => !excludedFilePaths.has(f.path))
      .map((f) => ({ path: f.path, size: f.size }));
    return new GitFileTreeBuilder().build({
      files,
      commitSha: sourceInfo.commitSha ?? fileTree.sha,
      branch: sourceInfo.branch ?? 'main',
      rootPath: sourceInfo.rootPath ?? `/${owner}/${repo}`,
    }) as FileTree;
  }, [fileTree, excludedFilePaths, owner, repo]);

  // Repo "explored" metric: how many unique files are touched by at
  // least one trail, vs the total file count. Selection-independent —
  // we want it visible whether or not a trail is open. Returns null
  // until enough data has streamed in to report a meaningful number.
  // Files under any excluded directory drop out of *both* the numerator
  // and the denominator so the percentage stays honest as users gate
  // folders in / out.
  const exploredStats = useMemo<{
    documented: number;
    total: number;
  } | null>(() => {
    if (!fileTree) return null;
    if (payloads.size === 0) return null;
    const documented = new Set<string>();
    for (const payload of payloads.values()) {
      for (const m of payload.markers) {
        if (
          typeof m.sourcePath === 'string' &&
          m.sourcePath.length > 0 &&
          !excludedFilePaths.has(m.sourcePath)
        ) {
          documented.add(m.sourcePath);
        }
      }
    }
    const total = fileTree.allFiles.filter(
      (f) => !excludedFilePaths.has(f.path),
    ).length;
    if (total === 0) return null;
    return {
      documented: documented.size,
      total,
    };
  }, [fileTree, payloads, excludedFilePaths]);

  // Layer item paths must match `building.path` verbatim. Buildings
  // are constructed from `FileTree.allFiles[i].path`, which is the raw
  // input path from the GitHub tree API (repo-relative — no rootPath
  // prefix). Marker `sourcePath` is also repo-relative, so we use it
  // as-is.

  // Base highlight layer — union of every trail-documented file across
  // all known payloads. Idle-only (the panel ignores `highlightLayers`
  // once a trail is selected). Rebuilt as payloads stream in.
  const documentedFilesLayer = useMemo<HighlightLayer | null>(() => {
    if (selectedTrailId) return null;
    if (payloads.size === 0) return null;
    const paths = new Set<string>();
    for (const payload of payloads.values()) {
      for (const marker of payload.markers) {
        if (
          typeof marker.sourcePath === 'string' &&
          marker.sourcePath.length > 0 &&
          !excludedFilePaths.has(marker.sourcePath)
        ) {
          paths.add(marker.sourcePath);
        }
      }
    }
    if (paths.size === 0) return null;
    return {
      id: 'trail-documented-files',
      name: 'Documented by trails',
      enabled: true,
      color: theme.colors.primary,
      opacity: 0.3,
      priority: 50,
      items: Array.from(paths).map((path) => ({
        path,
        type: 'file' as const,
        renderStrategy: 'fill' as const,
      })),
    };
  }, [selectedTrailId, payloads, excludedFilePaths, theme.colors.primary]);

  // Inverse layer — every file NOT touched by a trail. Used when the
  // user toggles the debt counter in the header. Requires the file tree
  // so we can subtract the documented set from the universe of paths.
  const undocumentedFilesLayer = useMemo<HighlightLayer | null>(() => {
    if (selectedTrailId) return null;
    if (!fileTree) return null;
    if (payloads.size === 0) return null;
    const documented = new Set<string>();
    for (const payload of payloads.values()) {
      for (const marker of payload.markers) {
        if (typeof marker.sourcePath === 'string' && marker.sourcePath.length > 0) {
          documented.add(marker.sourcePath);
        }
      }
    }
    const undocPaths = fileTree.allFiles
      .map((f) => f.path)
      .filter((p) => !documented.has(p) && !excludedFilePaths.has(p));
    if (undocPaths.length === 0) return null;
    return {
      id: 'trail-undocumented-files',
      name: 'Comprehension debt',
      enabled: true,
      color: theme.colors.warning ?? theme.colors.accent,
      opacity: 0.3,
      priority: 50,
      items: undocPaths.map((path) => ({
        path,
        type: 'file' as const,
        renderStrategy: 'fill' as const,
      })),
    };
  }, [
    selectedTrailId,
    payloads,
    fileTree,
    excludedFilePaths,
    theme.colors.warning,
    theme.colors.accent,
  ]);

  // Hover layer — overlays the focused trail on top of the base layer.
  const hoveredHighlightLayer = useMemo<HighlightLayer | null>(() => {
    if (!hoveredTrailId || selectedTrailId) return null;
    const payload = payloads.get(hoveredTrailId);
    if (!payload) return null;
    const paths = Array.from(
      new Set(
        payload.markers
          .map((m) => m.sourcePath)
          .filter((p): p is string => typeof p === 'string' && p.length > 0),
      ),
    );
    if (paths.length === 0) return null;
    return {
      id: `trail-hover-${payload.id}`,
      name: payload.title ?? 'Hovered trail',
      enabled: true,
      color: theme.colors.accent,
      opacity: 0.8,
      priority: 100,
      items: paths.map((path) => ({
        path,
        type: 'file' as const,
        renderStrategy: 'fill' as const,
      })),
      dynamic: true,
    };
  }, [hoveredTrailId, selectedTrailId, payloads, theme.colors.accent]);

  // Stack base + hover. Higher priority renders on top. In debt mode
  // we swap the base layer to the undocumented set and skip the hover
  // overlay (which only makes sense over the coverage layer).
  const idleHighlightLayers = useMemo<HighlightLayer[] | null>(() => {
    const layers: HighlightLayer[] = [];
    const baseLayer = debtMode ? undocumentedFilesLayer : documentedFilesLayer;
    if (baseLayer) layers.push(baseLayer);
    if (!debtMode && hoveredHighlightLayer) layers.push(hoveredHighlightLayer);
    return layers.length > 0 ? layers : null;
  }, [debtMode, documentedFilesLayer, undocumentedFilesLayer, hoveredHighlightLayer]);

  // The highlight-layers slice is "loading" until we have enough data
  // to compute a final value. Without this the panel can't tell
  // "no host layers" from "layers haven't streamed in yet" and paints
  // a one-frame flash of the unfiltered city before hide-mode kicks in.
  const highlightLayersLoading =
    state.kind !== 'ready' ||
    (state.entries.length > 0 && payloads.size === 0);

  // Debug: log layers + a few real file-tree paths so we can confirm
  // the LayerItem path format matches the building paths.
  useEffect(() => {
    if (!idleHighlightLayers) {
      console.log('[RepoTrailExplorer] idleHighlightLayers: null');
      return;
    }
    const samplePaths = (fileTree?.allFiles ?? []).slice(0, 5).map((f) => f.path);
    console.log('[RepoTrailExplorer] idleHighlightLayers:', {
      sampleBuildingPaths: samplePaths,
      layers: idleHighlightLayers.map((l) => ({
        id: l.id,
        name: l.name,
        color: l.color,
        opacity: l.opacity,
        priority: l.priority,
        itemCount: l.items.length,
        sampleItems: l.items.slice(0, 5),
      })),
    });
  }, [idleHighlightLayers, fileTree]);

  if (state.kind === 'error') {
    return (
      <TrailErrorView
        message={state.message}
        code={state.code}
        noAccessTitle="This repository is private"
        notFoundTitle="Trails unavailable"
        fallbackTitle="Trails unavailable"
      />
    );
  }

  // Hold the loading screen until: the trail index has landed, the
  // file tree has landed, and the warming window has elapsed. Behind
  // the overlay we mount a hidden FileCity3D with sample data so its
  // chunk loads, WebGL context inits, and shaders compile before the
  // real panel mounts — no flash on first paint of the real city.
  // Errors on the tree fetch take a separate path (inline in RightPane)
  // so we don't strand the user on a never-resolving overlay.
  if (state.kind === 'loading' || (fileTree === null && treeError === null) || !minDelayElapsed) {
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
          <TrailLoadingScreen />
        </div>
      </>
    );
  }

  return (
    <div
      className="w-screen flex flex-col overflow-hidden"
      style={{ background: theme.colors.background, height: '100vh' }}
    >
      <Header
        owner={owner}
        repo={repo}
        exploredStats={exploredStats}
      />
      <div className="flex-1 min-h-0 flex flex-col-reverse md:flex-row">
        <TrailListPane
          loading={false}
          entries={state.entries}
          filteredEntries={filteredEntries}
          payloads={payloads}
          filterQuery={filterQuery}
          onFilterChange={setFilterQuery}
          selectedTrailId={selectedTrailId}
          onSelect={setSelectedTrailId}
          onHover={setHoveredTrailId}
          configMode={configMode}
          onToggleConfigMode={() => {
            setConfigMode((m) => !m);
            setSelectedTrailId(null);
          }}
          dirPaths={dirPaths}
          filePaths={filePaths}
          excludedDirs={excludedDirs}
          onExcludedDirsChange={setExcludedDirs}
        />
        <RightPane
          owner={owner}
          repo={repo}
          fileTree={configMode ? fileTree : filteredFileTree}
          treeError={treeError}
          selectedPayload={selectedPayload}
          idleHighlightLayers={idleHighlightLayers}
          highlightLayersLoading={highlightLayersLoading}
          excludedFolders={excludedDirs.map((d) =>
            d.endsWith('/') ? d.slice(0, -1) : d,
          )}
          showSpatialContext={configMode}
          currentAuthor={user?.login ?? LOCAL_AUTHOR}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

const Header: React.FC<{
  owner: string;
  repo: string;
  exploredStats: { documented: number; total: number } | null;
}> = ({
  owner,
  repo,
  exploredStats,
}) => {
  const { theme } = useTheme();
  return (
    <header
      className="border-b px-4 flex items-center gap-2 flex-shrink-0 relative"
      style={{
        background: theme.colors.surface,
        borderColor: theme.colors.border,
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)',
        paddingBottom: '0.5rem',
      }}
    >
      <div className="hidden md:flex items-center gap-2 min-w-0 flex-1">
        <Link
          href="/"
          className="transition-opacity hover:opacity-80"
          style={{
            fontFamily: theme.fonts.body,
            fontSize: theme.fontSizes[4],
            fontWeight: theme.fontWeights.bold,
            textDecoration: 'none',
          }}
        >
          <span style={{ color: theme.colors.text }}>Principal</span>{' '}
          <span style={{ color: theme.colors.primary }}>AI</span>
        </Link>

        <span
          className="mx-2"
          style={{ color: theme.colors.textMuted }}
          aria-hidden="true"
        >
          /
        </span>

        <Link
          href={`/${owner}`}
          className="flex-shrink-0 transition-opacity hover:opacity-80"
          title={owner}
          aria-label={owner}
          style={{ textDecoration: 'none' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://github.com/${owner}.png?size=64`}
            alt=""
            width={28}
            height={28}
            className="rounded-full"
            style={{ border: `1px solid ${theme.colors.border}` }}
          />
        </Link>
        <Link
          href={`/${owner}/${repo}`}
          className="transition-opacity hover:opacity-80 truncate"
          style={{
            fontFamily: theme.fonts.body,
            fontSize: theme.fontSizes[2],
            fontWeight: theme.fontWeights.semibold,
            color: theme.colors.text,
            textDecoration: 'none',
          }}
        >
          {repo}
        </Link>
      </div>

      <Link
        href={`/${owner}/${repo}`}
        className="flex md:hidden items-center gap-2 min-w-0 flex-1 transition-opacity hover:opacity-80"
        style={{ textDecoration: 'none' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://github.com/${owner}.png?size=64`}
          alt=""
          width={32}
          height={32}
          className="rounded-full flex-shrink-0"
          style={{ border: `1px solid ${theme.colors.border}` }}
        />
        <span
          className="truncate"
          style={{
            fontFamily: theme.fonts.body,
            fontSize: theme.fontSizes[2],
            fontWeight: theme.fontWeights.semibold,
            color: theme.colors.text,
          }}
        >
          {repo}
        </span>
      </Link>

      {exploredStats && (
        <div
          className="hidden md:flex items-center gap-2 absolute left-1/2 -translate-x-1/2 pointer-events-none"
          aria-label={`${exploredStats.documented} of ${exploredStats.total} files explored`}
        >
          <span
            className="leading-none"
            style={{
              color: theme.colors.text,
              fontFamily: theme.fonts.body,
              fontSize: theme.fontSizes[2],
              fontWeight: theme.fontWeights.semibold,
            }}
          >
            {exploredStats.documented.toLocaleString()} of{' '}
            {exploredStats.total.toLocaleString()}
          </span>
          <span
            style={{
              fontFamily: theme.fonts.body,
              color: theme.colors.textSecondary,
              fontSize: theme.fontSizes[1],
            }}
          >
            files explored
          </span>
        </div>
      )}

      <div className="flex items-center gap-2 flex-shrink-0">
        <Link
          href={`/legacy/${owner}/${repo}`}
          className="hidden md:flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80"
          style={{ color: theme.colors.text }}
          title="Open legacy view"
          aria-label="Open legacy view"
        >
          <History className="w-5 h-5" />
        </Link>
        <a
          href={`https://github.com/${owner}/${repo}`}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden md:flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80"
          style={{ color: theme.colors.text }}
          title={`Open ${owner}/${repo} on GitHub`}
          aria-label={`Open ${owner}/${repo} on GitHub`}
        >
          <Github className="w-5 h-5" />
        </a>

        <UserAvatarMenu />
      </div>
    </header>
  );
};

// ---------------------------------------------------------------------------
// Trail list pane (left)
// ---------------------------------------------------------------------------

const TrailListPane: React.FC<{
  loading: boolean;
  entries: SharedTrailIndexEntry[];
  filteredEntries: SharedTrailIndexEntry[];
  payloads: Map<string, TrailPayload>;
  filterQuery: string;
  onFilterChange: (q: string) => void;
  selectedTrailId: string | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  configMode: boolean;
  onToggleConfigMode: () => void;
  dirPaths: string[];
  filePaths: string[];
  excludedDirs: string[];
  onExcludedDirsChange: (dirs: string[]) => void;
}> = ({
  loading,
  entries,
  filteredEntries,
  payloads,
  filterQuery,
  onFilterChange,
  selectedTrailId,
  onSelect,
  onHover,
  configMode,
  onToggleConfigMode,
  dirPaths,
  filePaths,
  excludedDirs,
  onExcludedDirsChange,
}) => {
  const { theme } = useTheme();

  return (
    <aside
      className="flex flex-col shrink-0 w-full md:w-[400px] h-[45%] md:h-auto border-t md:border-t-0 md:border-r"
      style={{
        background: theme.colors.backgroundSecondary,
        borderColor: theme.colors.border,
      }}
    >
      <TrailSummarySection
        configMode={configMode}
        onToggleConfigMode={onToggleConfigMode}
      />

      {configMode ? (
        <FolderConfigPane
          dirPaths={dirPaths}
          filePaths={filePaths}
          excludedDirs={excludedDirs}
          onExcludedDirsChange={onExcludedDirsChange}
        />
      ) : (
        <>
          {entries.length >= 10 && (
            <div
              className="px-3 py-2 border-b flex items-center gap-2"
              style={{ borderColor: theme.colors.border }}
            >
              <Search size={14} style={{ color: theme.colors.textMuted }} />
              <input
                type="text"
                value={filterQuery}
                onChange={(e) => onFilterChange(e.target.value)}
                placeholder="Filter trails"
                className="flex-1 bg-transparent outline-none"
                style={{
                  color: theme.colors.text,
                  fontFamily: theme.fonts.body,
                  fontSize: theme.fontSizes[1],
                }}
              />
              {filterQuery && (
                <button
                  onClick={() => onFilterChange('')}
                  style={{
                    color: theme.colors.textMuted,
                    fontSize: theme.fontSizes[0],
                  }}
                >
                  Clear
                </button>
              )}
            </div>
          )}

          <div
            className="flex-1 min-h-0 overflow-y-auto"
            onMouseLeave={() => onHover(null)}
          >
            {loading ? (
              <ListMessage>Loading trails…</ListMessage>
            ) : entries.length === 0 ? (
              <ListMessage>
                No trails have been shared for this repository yet.
              </ListMessage>
            ) : filteredEntries.length === 0 ? (
              <ListMessage>No trails match “{filterQuery}”.</ListMessage>
            ) : (
              filteredEntries.map((entry) => (
                <TrailRow
                  key={entry.id}
                  entry={entry}
                  payload={payloads.get(entry.id) ?? null}
                  selected={entry.id === selectedTrailId}
                  onSelect={() =>
                    onSelect(entry.id === selectedTrailId ? null : entry.id)
                  }
                  onHover={() => onHover(entry.id)}
                />
              ))
            )}
          </div>
        </>
      )}
    </aside>
  );
};

// ---------------------------------------------------------------------------
// Folder configuration pane — Pierre tree of directories the user can
// gate in / out of the coverage calc. Selection in the Pierre tree is
// purely a "focus" indicator — picking a row doesn't change the gate.
// A footer shows the focused folder + an Include / Exclude toggle that
// adds or removes it from `excludedDirs`. Excluded folders are
// surfaced as a chip strip at the top with × to remove individually.
// ---------------------------------------------------------------------------

const FolderConfigPane: React.FC<{
  dirPaths: string[];
  filePaths: string[];
  excludedDirs: string[];
  onExcludedDirsChange: (dirs: string[]) => void;
}> = ({ dirPaths, filePaths, excludedDirs, onExcludedDirsChange }) => {
  const { theme } = useTheme();

  // Pierre is fed every directory and every file path so the tree
  // shows the full repo. Per-row kebabs are suppressed on file rows
  // (via `unsafeCSS` below) — only folders are toggleable, since the
  // gate semantically is "exclude this subtree."
  //
  // Pierre's `gitStatus` API surfaces exclusion state on each row:
  // excluded dirs *and* every descendant file are marked `'ignored'`,
  // which Pierre styles as a dimmed row natively. The model's
  // `setGitStatus` lets us update reactively after the initial mount
  // (the options object is otherwise snapshot-once).
  const treePaths = useMemo(
    () => [...dirPaths, ...filePaths],
    [dirPaths, filePaths],
  );
  const gitStatusEntries = useMemo(() => {
    const prefixes = excludedDirs.map((d) =>
      d.endsWith('/') ? d : `${d}/`,
    );
    const excludedFilesInTree = filePaths.filter((p) =>
      prefixes.some((prefix) => p.startsWith(prefix)),
    );
    return [
      ...excludedDirs.map((path) => ({ path, status: 'ignored' as const })),
      ...excludedFilesInTree.map((path) => ({
        path,
        status: 'ignored' as const,
      })),
    ];
  }, [excludedDirs, filePaths]);

  // Suppress the kebab button on file rows. Pierre tags each row with
  // `data-item-type="file"` or `"folder"`, and the trigger button has
  // `data-type="context-menu-trigger"`.
  const unsafeCSS = `
    [data-item-type="file"] [data-type="context-menu-trigger"] {
      display: none !important;
    }
  `;

  const { model } = useFileTree({
    paths: treePaths,
    initialExpansion: 'closed',
    initialSelectedPaths: [],
    search: false,
    gitStatus: gitStatusEntries,
    unsafeCSS,
    composition: {
      contextMenu: {
        enabled: true,
        triggerMode: 'both',
        buttonVisibility: 'always',
      },
    },
  });
  useEffect(() => {
    model.setGitStatus(gitStatusEntries);
  }, [model, gitStatusEntries]);

  const treeStyles = useMemo(
    () =>
      themeToTreeStyles({
        type: 'dark',
        bg: theme.colors.background,
        fg: theme.colors.text,
      }),
    [theme.colors.background, theme.colors.text],
  );

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* One-line helper: hint when empty, count + Clear all otherwise */}
      <div
        className="px-4 py-2 border-b flex items-center justify-between gap-2"
        style={{
          borderColor: theme.colors.border,
          color: theme.colors.textSecondary,
          fontSize: theme.fontSizes[0],
        }}
      >
        {excludedDirs.length === 0 ? (
          <span>
            Click the ⋯ on any folder to exclude it. Exclusions cascade.
          </span>
        ) : (
          <>
            <span>
              {excludedDirs.length} folder{excludedDirs.length === 1 ? '' : 's'}{' '}
              excluded
            </span>
            <button
              type="button"
              onClick={() => onExcludedDirsChange([])}
              className="underline-offset-2 hover:underline"
              style={{ color: theme.colors.primary, cursor: 'pointer' }}
            >
              Clear all
            </button>
          </>
        )}
      </div>

      {/* Pierre directory tree with per-row context menu */}
      <div
        className="flex-1 min-h-0 pt-4"
        style={{ background: theme.colors.background }}
      >
        <PierreFileTree
          model={model}
          renderContextMenu={(item, context) => {
            // Only directories are toggleable. Files reach this only
            // via right-click since the kebab is hidden on file rows.
            if (item.kind !== 'directory') return null;
            const path = item.path;
            const isExcluded = excludedDirs.includes(path);
            const toggle = () => {
              if (isExcluded) {
                onExcludedDirsChange(
                  excludedDirs.filter((d) => d !== path),
                );
              } else {
                onExcludedDirsChange([...excludedDirs, path]);
              }
              context.close();
            };
            // Pierre's default placement anchors the menu to the right
            // of the kebab. We portal to body and position it ourselves
            // so the menu opens *left* of the anchor — closer to the
            // tree row content and away from the panel edge. The
            // data-* attribute tells Pierre's outside-click handler
            // that clicks inside the portal are still "inside".
            const MENU_WIDTH = 200;
            const GAP = 8;
            const left = Math.max(
              8,
              context.anchorRect.left - MENU_WIDTH - GAP,
            );
            const top = context.anchorRect.top;
            return createPortal(
              <div
                data-file-tree-context-menu-root="true"
                className="rounded-md shadow-lg"
                style={{
                  position: 'fixed',
                  top,
                  left,
                  width: MENU_WIDTH,
                  background: theme.colors.surface,
                  border: `1px solid ${theme.colors.border}`,
                  padding: 4,
                  zIndex: 1000,
                }}
              >
                <button
                  type="button"
                  onClick={toggle}
                  className="w-full text-left px-3 py-2 rounded transition-colors hover:opacity-90"
                  style={{
                    background: 'transparent',
                    color: isExcluded
                      ? theme.colors.primary
                      : theme.colors.warning ?? theme.colors.accent,
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: theme.fonts.body,
                    fontSize: theme.fontSizes[1],
                  }}
                >
                  {isExcluded ? 'Include in coverage' : 'Exclude from coverage'}
                </button>
              </div>,
              document.body,
            );
          }}
          style={{
            ...(treeStyles as React.CSSProperties),
            height: '100%',
            display: 'block',
          }}
        />
      </div>
    </div>
  );
};

// Folder-coverage configuration is hidden for now. All the plumbing
// (config mode, folder include/exclude) is kept intact — flip this to
// true to re-enable the settings button, which we may do in the future.
const SHOW_FOLDER_CONFIG = false;

const TrailSummarySection: React.FC<{
  configMode: boolean;
  onToggleConfigMode: () => void;
}> = ({ configMode, onToggleConfigMode }) => {
  const { theme } = useTheme();
  return (
    <div
      className="px-4 py-3 border-b"
      style={{ borderColor: theme.colors.border }}
    >
      <div className="flex items-center justify-between">
        <div
          style={{
            color: theme.colors.primary,
            fontFamily: theme.fonts.body,
            fontSize: theme.fontSizes[2],
            fontWeight: theme.fontWeights.semibold,
          }}
        >
          {configMode ? 'Configure folders' : 'Trails'}
        </div>
        {SHOW_FOLDER_CONFIG && (
          <button
            type="button"
            onClick={onToggleConfigMode}
            className="flex items-center justify-center w-6 h-6 rounded transition-opacity hover:opacity-80"
            style={{
              color: configMode
                ? theme.colors.primary
                : theme.colors.textSecondary,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
            title={
              configMode
                ? 'Done configuring — return to trails'
                : 'Configure which folders count toward coverage'
            }
            aria-pressed={configMode}
            aria-label={
              configMode
                ? 'Exit folder configuration mode'
                : 'Configure folder inclusion'
            }
          >
            {configMode ? <Check size={14} /> : <Settings size={14} />}
          </button>
        )}
      </div>
    </div>
  );
};

const TrailRow: React.FC<{
  entry: SharedTrailIndexEntry;
  payload: TrailPayload | null;
  selected: boolean;
  onSelect: () => void;
  onHover: () => void;
}> = ({ entry, payload, selected, onSelect, onHover }) => {
  const { theme } = useTheme();

  // Unique-file count, derived from the loaded payload's marker
  // sourcePaths. Falls back to em-dash while the payload streams in.
  const fileCount = useMemo<number | null>(() => {
    if (!payload) return null;
    const paths = new Set<string>();
    for (const m of payload.markers) {
      if (typeof m.sourcePath === 'string' && m.sourcePath.length > 0) {
        paths.add(m.sourcePath);
      }
    }
    return paths.size;
  }, [payload]);

  const author = entry.createdBy;
  const avatarUrl = author
    ? `https://avatars.githubusercontent.com/u/${author.githubId}?v=4&s=40`
    : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={onHover}
      onFocus={onHover}
      className="w-full text-left px-4 py-3 border-b transition-colors"
      style={{
        background: selected ? theme.colors.background : 'transparent',
        borderColor: theme.colors.border,
        color: theme.colors.text,
      }}
    >
      <div className="min-w-0">
        <div
          className="break-words"
          style={{
            fontSize: theme.fontSizes[2],
            fontWeight: theme.fontWeights.semibold,
          }}
        >
          {entry.title}
        </div>
        <div
          className="mt-1.5 flex items-center gap-3"
          style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[0] }}
        >
          <span className="inline-flex items-center gap-1">
            <FileText size={12} />
            {fileCount ?? '—'} {fileCount === 1 ? 'file' : 'files'}
          </span>
          {author?.githubLogin && (
            <span className="inline-flex items-center gap-1.5 min-w-0">
              {avatarUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt=""
                  className="rounded-full shrink-0"
                  width={16}
                  height={16}
                  style={{ background: theme.colors.backgroundSecondary }}
                />
              )}
              <span className="truncate">{author.githubLogin}</span>
            </span>
          )}
        </div>
      </div>
    </button>
  );
};

const ListMessage: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme } = useTheme();
  return (
    <div
      className="px-4 py-6 text-center"
      style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[1] }}
    >
      {children}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Right pane (file map / trail explorer)
// ---------------------------------------------------------------------------

const RightPane: React.FC<{
  owner: string;
  repo: string;
  fileTree: FileTree | null;
  treeError: string | null;
  selectedPayload: TrailPayload | null;
  idleHighlightLayers: HighlightLayer[] | null;
  highlightLayersLoading: boolean;
  excludedFolders: string[];
  showSpatialContext: boolean;
  currentAuthor: string;
}> = ({
  owner,
  repo,
  fileTree,
  treeError,
  selectedPayload,
  idleHighlightLayers,
  highlightLayersLoading,
  excludedFolders,
  showSpatialContext,
  currentAuthor,
}) => {
  const { theme } = useTheme();
  const events = useMemo<PanelEventEmitter>(() => new PanelEventBus(), []);

  const repository = useMemo<FileCityTrailExplorerRepository>(() => {
    // Multi-repo trails filter markers by repo id. Mirror the payload's
    // first registered repo when present and fall back to "owner/repo".
    const id = selectedPayload?.repos?.[0]?.id ?? `${owner}/${repo}`;
    return { id, owner, name: repo };
  }, [owner, repo, selectedPayload]);

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

  // Notes / sign-offs editing is owned by /trail/[id]. Stub the
  // mutators here so the panel still mounts when a trail is selected;
  // clicking through to the full trail page is the path for editing.
  const trailIdForShare = selectedPayload?.id ?? null;
  const [shareTrailId, setShareTrailId] = useState<string | null>(null);
  const shareTrail = useCallback(() => {
    if (!trailIdForShare) return;
    setShareTrailId(trailIdForShare);
  }, [trailIdForShare]);
  const actions = useMemo<FileCityTrailExplorerPanelActions>(
    () => ({
      openFile: () => {},
      readFile,
      createTrailNote: async () => null,
      updateTrailNote: async () => null,
      deleteTrailNote: async () => {},
      createTrailSignOff: async () => null,
      deleteTrailSignOff: async () => {},
      shareTrail,
    }),
    [readFile, shareTrail],
  );

  const context = useMemo<
    PanelContextValue<FileCityTrailExplorerPanelContext>
  >(() => {
    const fileTreeSlice: DataSlice<FileTree> = {
      scope: 'repository',
      name: 'fileTree',
      // Cast: the panel's typing requires a non-null FileTree here, but
      // we may not have one yet. The outer guard prevents render until
      // it loads, so this cast is safe at runtime.
      data: (fileTree ?? (null as unknown as FileTree)),
      loading: fileTree === null,
      error: null,
      refresh: async () => {},
    };

    const trailSlice: DataSlice<TrailPayload | null> = {
      scope: 'repository',
      name: 'trail',
      data: selectedPayload,
      loading: false,
      error: null,
      refresh: async () => {},
    };

    const highlightSlice: DataSlice<HighlightLayer[] | null> = {
      scope: 'repository',
      name: 'highlightLayers',
      data: idleHighlightLayers,
      // `idleHighlightLayers` is derived asynchronously from payloads
      // that stream in after the trails index lands. Reporting
      // `loading: false` while the data is still null-because-of-pending-fetch
      // is indistinguishable from "host has no layers" — the panel paints
      // the unfiltered city for one frame, then re-renders with hide-mode
      // applied, producing a visible flash. The parent computes the real
      // loading state and forwards it here.
      loading: highlightLayersLoading,
      error: null,
      refresh: async () => {},
    };

    return {
      currentScope: { type: 'repository' },
      refresh: async () => {},
      fileTree: fileTreeSlice,
      lineCounts: nullSlice('lineCounts'),
      trail: trailSlice,
      highlightLayers: highlightSlice,
      repository,
    };
  }, [
    fileTree,
    selectedPayload,
    idleHighlightLayers,
    highlightLayersLoading,
    repository,
  ]);

  if (treeError) {
    return (
      <main
        className="flex-1 min-w-0 flex items-center justify-center px-6"
        style={{ background: theme.colors.background, color: theme.colors.textMuted }}
      >
        <div
          className="text-center max-w-md"
          style={{ fontSize: theme.fontSizes[1] }}
        >
          {treeError}
        </div>
      </main>
    );
  }

  if (!fileTree) {
    return (
      <main
        className="flex-1 min-w-0 flex items-center justify-center"
        style={{ background: theme.colors.background, color: theme.colors.textMuted }}
      >
        <div style={{ fontSize: theme.fontSizes[1] }}>Loading repository…</div>
      </main>
    );
  }

  return (
    <main
      className="flex-1 min-w-0 min-h-0"
      style={{ background: theme.colors.background }}
    >
      <FileCityTrailExplorerPanel
        context={context}
        actions={actions}
        events={events}
        currentAuthor={currentAuthor}
        defaultIsolationMode="hide"
        briefSide="leading"
        hideNonHighlightedBuildings={!showSpatialContext}
        excludedFolders={excludedFolders}
      />
      {shareTrailId && (
        <TrailShareModal
          trailId={shareTrailId}
          trailTitle={
            selectedPayload?.id === shareTrailId ? selectedPayload?.title : null
          }
          onClose={() => setShareTrailId(null)}
        />
      )}
    </main>
  );
};

