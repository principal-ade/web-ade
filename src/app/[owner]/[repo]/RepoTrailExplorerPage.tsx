'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '@principal-ade/industry-theme';
import {
  AlertTriangle,
  Github,
  History,
  LogIn,
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
import {
  ShareErrorCodes,
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

  const { user, login } = useAuth();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [filterQuery, setFilterQuery] = useState('');
  const [selectedTrailId, setSelectedTrailId] = useState<string | null>(null);
  const handleSignIn = useCallback(() => {
    login(window.location.pathname);
  }, [login]);
  // hoveredTrailId will drive highlight layers on the file map once the
  // explorer is wired up. Kept here so the list rows can broadcast it.
  const [hoveredTrailId, setHoveredTrailId] = useState<string | null>(null);
  // Debt-view toggle — when on, the idle highlight layer flips to the
  // *undocumented* files (inverse of coverage) so the user can see what
  // the trails haven't reached yet. Toggled from the header counter.
  const [debtMode, setDebtMode] = useState(false);

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
    pct: number;
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
      // Raw float; formatted at display site so the bar width and the
      // label can pick their own precision.
      pct: (documented.size / total) * 100,
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
    return <TrailListErrorView message={state.message} code={state.code} />;
  }

  return (
    <div
      className="w-screen flex flex-col overflow-hidden"
      style={{ background: theme.colors.background, height: '100vh' }}
    >
      <Header
        owner={owner}
        repo={repo}
        showSignIn={!user}
        onSignIn={handleSignIn}
        debtPct={exploredStats ? 100 - exploredStats.pct : null}
        debtMode={debtMode}
        onToggleDebt={() => {
          setDebtMode((m) => !m);
          setSelectedTrailId(null);
        }}
      />
      <div className="flex-1 min-h-0 flex">
        <TrailListPane
          loading={state.kind === 'loading'}
          entries={state.kind === 'ready' ? state.entries : []}
          filteredEntries={filteredEntries}
          payloads={payloads}
          exploredStats={exploredStats}
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
  showSignIn?: boolean;
  onSignIn?: () => void;
  debtPct: number | null;
  debtMode: boolean;
  onToggleDebt: () => void;
}> = ({
  owner,
  repo,
  showSignIn,
  onSignIn,
  debtPct,
  debtMode,
  onToggleDebt,
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
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Link
          href="/"
          className="text-xl font-bold transition-opacity hover:opacity-80"
          style={{ fontFamily: theme.fonts.body, textDecoration: 'none' }}
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
          className="text-base font-semibold transition-opacity hover:opacity-80 truncate"
          style={{
            fontFamily: theme.fonts.body,
            color: theme.colors.text,
            textDecoration: 'none',
          }}
        >
          {owner}
        </Link>
        <span style={{ color: theme.colors.textMuted }} aria-hidden="true">
          /
        </span>
        <Link
          href={`/${owner}/${repo}`}
          className="text-base font-semibold transition-opacity hover:opacity-80 truncate"
          style={{
            fontFamily: theme.fonts.body,
            color: theme.colors.text,
            textDecoration: 'none',
          }}
        >
          {repo}
        </Link>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {debtPct !== null && (
          <button
            type="button"
            onClick={onToggleDebt}
            className="flex items-center gap-1.5 px-2.5 h-8 rounded-md text-sm font-semibold leading-none transition-all hover:opacity-90"
            style={{
              fontFamily: theme.fonts.body,
              background: debtMode
                ? (theme.colors.warning ?? theme.colors.accent)
                : `color-mix(in srgb, ${theme.colors.warning ?? theme.colors.accent} 14%, transparent)`,
              color: debtMode
                ? theme.colors.background
                : (theme.colors.warning ?? theme.colors.accent),
              border: `1px solid ${theme.colors.warning ?? theme.colors.accent}`,
              cursor: 'pointer',
            }}
            title={
              debtMode
                ? 'Showing comprehension debt — click to return to coverage view'
                : 'View comprehension debt — files no trail has reached'
            }
            aria-pressed={debtMode}
            aria-label="Toggle comprehension debt view"
          >
            <span>{debtPct.toFixed(2)}%</span>
            <span
              className="text-xs font-medium"
              style={{ opacity: 0.85 }}
            >
              debt
            </span>
          </button>
        )}
        <Link
          href={`/legacy/${owner}/${repo}`}
          className="flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80"
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
          className="flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80"
          style={{ color: theme.colors.text }}
          title={`Open ${owner}/${repo} on GitHub`}
          aria-label={`Open ${owner}/${repo} on GitHub`}
        >
          <Github className="w-5 h-5" />
        </a>

        {showSignIn && (
          <button
            type="button"
            onClick={onSignIn}
            className="flex items-center gap-1.5 px-3 h-8 rounded-md text-sm font-medium transition-all hover:opacity-90"
            style={{
              background: theme.colors.primary,
              color: theme.colors.background,
              border: `1px solid ${theme.colors.primary}`,
              fontFamily: theme.fonts.body,
              cursor: 'pointer',
            }}
            aria-label="Sign in"
          >
            <LogIn className="w-4 h-4" />
            <span>Sign in</span>
          </button>
        )}
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
  exploredStats: { documented: number; total: number; pct: number } | null;
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
  exploredStats,
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
      className="flex flex-col shrink-0 border-r"
      style={{
        width: 400,
        background: theme.colors.backgroundSecondary,
        borderColor: theme.colors.border,
      }}
    >
      <TrailSummarySection
        trailCount={entries.length}
        exploredStats={exploredStats}
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
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: theme.colors.text }}
            />
            {filterQuery && (
              <button
                onClick={() => onFilterChange('')}
                className="text-xs"
                style={{ color: theme.colors.textMuted }}
              >
                Clear
              </button>
            )}
          </div>

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
        className="px-4 py-2 border-b text-xs flex items-center justify-between gap-2"
        style={{
          borderColor: theme.colors.border,
          color: theme.colors.textSecondary,
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
                  className="w-full text-left px-3 py-2 rounded text-sm transition-colors hover:opacity-90"
                  style={{
                    background: 'transparent',
                    color: isExcluded
                      ? theme.colors.primary
                      : theme.colors.warning ?? theme.colors.accent,
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: theme.fonts.body,
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

const TrailSummarySection: React.FC<{
  trailCount: number;
  exploredStats: { documented: number; total: number; pct: number } | null;
  configMode: boolean;
  onToggleConfigMode: () => void;
}> = ({ trailCount, exploredStats, configMode, onToggleConfigMode }) => {
  const { theme } = useTheme();
  return (
    <div
      className="px-4 py-3 border-b"
      style={{ borderColor: theme.colors.border }}
    >
      <div className="flex items-center justify-between mb-2">
        <div
          className="text-[10px] uppercase tracking-wide"
          style={{ color: theme.colors.textSecondary, letterSpacing: 0.6 }}
        >
          {configMode ? 'Configure folders' : 'Trails'}
        </div>
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
      </div>
      <div className="flex items-baseline gap-3">
        <div
          className="text-2xl font-semibold leading-none"
          style={{ color: theme.colors.text }}
        >
          {exploredStats ? `${exploredStats.pct.toFixed(2)}%` : '—'}
        </div>
        <div
          className="text-xs"
          style={{ color: theme.colors.textSecondary }}
        >
          explored
        </div>
      </div>
      <div
        className="mt-2 h-1.5 rounded-full overflow-hidden"
        style={{ background: theme.colors.border }}
      >
        <div
          className="h-full transition-[width] duration-300"
          style={{
            width: `${exploredStats?.pct ?? 0}%`,
            background: theme.colors.primary,
          }}
        />
      </div>
      <div
        className="text-xs mt-2 flex items-center gap-3"
        style={{ color: theme.colors.textSecondary }}
      >
        <span>
          {exploredStats
            ? `${exploredStats.documented} / ${exploredStats.total} files`
            : 'Computing coverage…'}
        </span>
        <span>·</span>
        <span>
          {trailCount} {trailCount === 1 ? 'trail' : 'trails'}
        </span>
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
      className="w-full text-left px-4 py-3 border-b transition-colors flex items-start gap-3"
      style={{
        background: selected ? theme.colors.background : 'transparent',
        borderColor: theme.colors.border,
        color: theme.colors.text,
        borderLeft: `3px solid ${selected ? theme.colors.accent : 'transparent'}`,
      }}
    >
      {avatarUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarUrl}
          alt={author?.githubLogin ?? ''}
          className="rounded-full shrink-0"
          width={32}
          height={32}
          style={{ background: theme.colors.backgroundSecondary }}
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-base font-semibold truncate">{entry.title}</div>
        <div
          className="text-xs mt-1.5 flex items-center gap-3"
          style={{ color: theme.colors.textMuted }}
        >
          <span className="inline-flex items-center gap-1">
            <FileText size={12} />
            {fileCount ?? '—'} {fileCount === 1 ? 'file' : 'files'}
          </span>
          {author?.githubLogin && (
            <span className="truncate">{author.githubLogin}</span>
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
      className="px-4 py-6 text-sm text-center"
      style={{ color: theme.colors.textMuted }}
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
  const actions = useMemo<FileCityTrailExplorerPanelActions>(
    () => ({
      openFile: () => {},
      readFile,
      createTrailNote: async () => null,
      updateTrailNote: async () => null,
      deleteTrailNote: async () => {},
      createTrailSignOff: async () => null,
      deleteTrailSignOff: async () => {},
    }),
    [readFile],
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
        <div className="text-sm text-center max-w-md">{treeError}</div>
      </main>
    );
  }

  if (!fileTree) {
    return (
      <main
        className="flex-1 min-w-0 flex items-center justify-center"
        style={{ background: theme.colors.background, color: theme.colors.textMuted }}
      >
        <div className="text-sm">Loading repository…</div>
      </main>
    );
  }

  return (
    <main
      className="flex-1 min-w-0"
      style={{ background: theme.colors.background }}
    >
      <FileCityTrailExplorerPanel
        context={context}
        actions={actions}
        events={events}
        currentAuthor={currentAuthor}
        defaultIsolationMode="hide"
        hideNonHighlightedBuildings={!showSpatialContext}
        excludedFolders={excludedFolders}
      />
    </main>
  );
};

// ---------------------------------------------------------------------------
// Error view (no access, etc.)
// ---------------------------------------------------------------------------

const TrailListErrorView: React.FC<{
  message: string;
  code: ShareErrorCode | null;
}> = ({ message, code }) => {
  const { theme } = useTheme();
  const { isAuthenticated, login } = useAuth();

  const isNoAccess = code === ShareErrorCodes.NO_REPO_ACCESS;
  const showLogin = isNoAccess && !isAuthenticated;

  return (
    <div
      className="w-screen flex items-center justify-center px-4"
      style={{ background: theme.colors.background, height: '100vh' }}
    >
      <div
        className="w-full max-w-lg rounded-lg border px-10 py-12 text-center"
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
        <h1 className="text-2xl font-semibold mb-3">
          {isNoAccess ? 'This repository is private' : 'Trails unavailable'}
        </h1>
        <p
          className="text-base leading-relaxed"
          style={{ color: theme.colors.textMuted }}
        >
          {message}
        </p>
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
};
