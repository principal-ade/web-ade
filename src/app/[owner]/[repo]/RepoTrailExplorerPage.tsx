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
  X,
  Compass,
  Volume2,
  AlertTriangle,
  Loader2,
  Mic,
  Trash2,
  Star,
  GitFork,
  ExternalLink,
  Play,
} from 'lucide-react';
import { FileTree as PierreFileTree, useFileTree } from '@pierre/trees/react';
import { themeToTreeStyles } from '@pierre/trees';
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
  FileCityTrailExplorerPanelActions,
  FileCityTrailExplorerPanelContext,
  FileCityTrailExplorerRepository,
  FileCityTourExplorerPanelActions,
  FileCityTourExplorerPanelContext,
  FileCityTourExplorerRepository,
  HighlightLayer,
} from '@industry-theme/file-city-panel';
import type { IntroductionTour } from '@principal-ai/file-city-builder';
import type { TourAudioStatus, TourListItem } from '@/lib/tours/types';
import { trpc } from '@/lib/trpc/client';
import { useAuth } from '@/contexts/AuthContext';
import { UserAvatarMenu } from '@/components/UserAvatarMenu';
import { TrailLoadingScreen } from '@/components/trail/TrailLoadingScreen';
import { TrailErrorView } from '@/components/trail/TrailErrorView';
import { TrailShareModal } from '@/components/trail/TrailShareModal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FileSourcePanel } from './FileSourcePanel';
import {
  type ShareErrorCode,
  type SharedTrailIndexEntry,
  type TrailPayload,
} from '@/lib/trails/types';

/**
 * Live state of a tour's audio-generation run, keyed by tour id. Present only
 * while a run is active (or just errored); cleared on success.
 */
interface TourGenProgress {
  phase: 'running' | 'error';
  /** Steps with audio so far (includes those already cached at start). */
  done: number;
  /** Text-bearing steps total. */
  total: number;
  /** Short message shown on the row when `phase === 'error'`. */
  error?: string;
}

const FileCityTrailExplorerPanel = dynamic(
  () =>
    import('@industry-theme/file-city-panel').then(
      (m) => m.FileCityTrailExplorerPanel,
    ),
  { ssr: false },
);

const FileCityTourExplorerPanel = dynamic(
  () =>
    import('@industry-theme/file-city-panel').then(
      (m) => m.FileCityTourExplorerPanel,
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
  | {
      kind: 'ready';
      entries: SharedTrailIndexEntry[];
      // Repo-admin capability, from the list response — an admin can delete any
      // trail. (Author-match is computed client-side against the validated
      // `useAuth()` session, not this response.) Mirrors the DELETE route gate.
      viewerIsRepoAdmin: boolean;
    }
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

  // The "Trails" header doubles as a switch between the trail list and a
  // file tree of every file the trails touch (mirrors the desktop app's
  // Files tab). `selectedFilePath` lights up the picked file on the map.
  const [leftViewMode, setLeftViewMode] = useState<'trails' | 'files' | 'tours'>(
    // Lead with tours so a guided tour — or, failing that, the "author a tour"
    // empty state — is the first thing a visitor lands on.
    'tours',
  );
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  // Tour selection. Mutually exclusive with trail/file selection — the right
  // pane swaps to the tour panel while a tour is active.
  const [selectedTourId, setSelectedTourId] = useState<string | null>(null);

  // Trail pending deletion (drives the confirm modal) + in-flight guard. The
  // delete itself is gated server-side; this is the author/admin-only UI path.
  const [trailToDelete, setTrailToDelete] =
    useState<SharedTrailIndexEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const confirmDeleteTrail = useCallback(async () => {
    if (!trailToDelete) return;
    const id = trailToDelete.id;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(
        `/api/trails/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo,
        )}/${encodeURIComponent(id)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setDeleteError(body?.error ?? `Failed to delete trail (${res.status}).`);
        return;
      }
      // Drop it from the list, and clear the selection if it was open.
      setState((prev) =>
        prev.kind === 'ready'
          ? { ...prev, entries: prev.entries.filter((e) => e.id !== id) }
          : prev,
      );
      setSelectedTrailId((cur) => (cur === id ? null : cur));
      setTrailToDelete(null);
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : 'Failed to delete trail.',
      );
    } finally {
      setDeleting(false);
    }
  }, [trailToDelete, owner, repo]);

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
        const data = (await res.json()) as {
          entries: SharedTrailIndexEntry[];
          viewerIsRepoAdmin?: boolean;
        };
        if (cancelled) return;
        setState({
          kind: 'ready',
          entries: data.entries,
          viewerIsRepoAdmin: data.viewerIsRepoAdmin ?? false,
        });
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

  // Tours available for this repo. The endpoint globs the git tree for
  // `*.tour.json` and returns each fully-parsed tour, so — unlike trails —
  // there's no lazy by-id payload fetch; the list carries everything.
  const [tours, setTours] = useState<TourListItem[]>([]);
  const [toursLoading, setToursLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setTours([]);
    setToursLoading(true);
    setSelectedTourId(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/tours/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
        );
        if (!res.ok) {
          if (!cancelled) setTours([]);
          return;
        }
        const data = (await res.json()) as { tours: TourListItem[] };
        if (cancelled) return;
        const list = Array.isArray(data.tours) ? data.tours : [];
        setTours(list);
        // With several tours, lead by opening the first one in the right pane on
        // load. With exactly one tour we render a "Start tour" button instead
        // (see ToursPane), so leave it unselected until the visitor clicks. With
        // none, the Tours list shows an empty state pointing at the skill.
        const firstTour = list[0];
        if (firstTour && list.length > 1) setSelectedTourId(firstTour.tour.id);
      } catch {
        // Tours are an optional enhancement — a fetch failure just means the
        // Tours tab shows an empty state, never blocks the trail explorer.
        if (!cancelled) setTours([]);
      } finally {
        if (!cancelled) setToursLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [owner, repo]);

  // Tour pending deletion (drives the confirm modal). Mirrors the trail delete
  // path: gated client-side to author/admin, re-checked server-side. Carries the
  // store id (the DELETE key) and the tour id (to clear an open selection).
  const [tourToDelete, setTourToDelete] = useState<{
    storeId: string;
    tourId: string;
    title: string;
  } | null>(null);

  const confirmDeleteTour = useCallback(async () => {
    if (!tourToDelete) return;
    const { storeId, tourId } = tourToDelete;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(
        `/api/tours/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo,
        )}/${encodeURIComponent(storeId)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setDeleteError(body?.error ?? `Failed to delete tour (${res.status}).`);
        return;
      }
      setTours((prev) => prev.filter((t) => t.store?.id !== storeId));
      setSelectedTourId((cur) => (cur === tourId ? null : cur));
      setTourToDelete(null);
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : 'Failed to delete tour.',
      );
    } finally {
      setDeleting(false);
    }
  }, [tourToDelete, owner, repo]);

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

  const selectedTour = selectedTourId
    ? (tours.find((t) => t.tour.id === selectedTourId) ?? null)
    : null;

  // Deliberate, rate-limited audio generation. Driven from the tours list so
  // the user sees per-step progress; selecting a tour never generates.
  const [tourGenProgress, setTourGenProgress] = useState<
    Map<string, TourGenProgress>
  >(() => new Map());

  const setProgress = useCallback(
    (tourId: string, value: TourGenProgress | null) => {
      setTourGenProgress((prev) => {
        const next = new Map(prev);
        if (value) next.set(tourId, value);
        else next.delete(tourId);
        return next;
      });
    },
    [],
  );

  const handleGenerateTourAudio = useCallback(
    async (item: TourListItem) => {
      const tourId = item.tour.id;
      const base = {
        owner: item.audio.owner,
        repo: item.audio.repo,
        path: item.audio.path,
        commitSha: item.audio.commitSha ?? undefined,
      };
      const stepGuess = Array.isArray(item.tour.steps)
        ? item.tour.steps.length
        : 0;
      setProgress(tourId, { phase: 'running', done: 0, total: stepGuess });

      // Claim the hourly slot + fetch the work list. A rejection here is
      // terminal (cooldown or fetch failure) — nothing to finalize.
      let begin: { stepIds: string[]; totalSteps: number; cachedSteps: number };
      try {
        begin = await trpc.tts.beginTourGeneration.mutate(base);
      } catch (err) {
        const message = err instanceof Error ? err.message : '';
        const cooldown =
          /TOO_MANY_REQUESTS/i.test(message) || /generated recently/i.test(message);
        setProgress(tourId, {
          phase: 'error',
          done: 0,
          total: 0,
          error: cooldown ? 'Recently generated — try again later' : 'Generation failed',
        });
        return;
      }

      let done = begin.cachedSteps;
      const total = begin.totalSteps;
      setProgress(tourId, { phase: 'running', done, total });

      let stepFailed = false;
      for (const stepId of begin.stepIds) {
        try {
          await trpc.tts.generateTourStep.mutate({ ...base, stepId });
          done += 1;
          setProgress(tourId, { phase: 'running', done, total });
        } catch {
          stepFailed = true;
          break;
        }
      }

      // Always finalize to persist whatever landed and refresh the badge.
      try {
        const status = await trpc.tts.finishTourGeneration.mutate(base);
        setTours((prev) =>
          prev.map((t) =>
            t.tour.id === tourId ? { ...t, audioStatus: status } : t,
          ),
        );
      } catch {
        // Status refresh failed; the row keeps its prior badge.
      }

      if (stepFailed) {
        setProgress(tourId, {
          phase: 'error',
          done,
          total,
          error: 'Some steps failed — try again',
        });
      } else {
        setProgress(tourId, null);
      }
    },
    [setProgress],
  );

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

  // Files-view rows — every file touched by at least one trail, with a
  // count of how many distinct trails reference it. Selection-independent;
  // rebuilt as payloads stream in. A file is counted once per trail even
  // if several markers point at it. Excluded folders drop out so the tree
  // matches the coverage stats.
  const trailFileRows = useMemo<{ path: string; trailCount: number }[]>(() => {
    if (payloads.size === 0) return [];
    const counts = new Map<string, number>();
    for (const payload of payloads.values()) {
      const seenInTrail = new Set<string>();
      for (const marker of payload.markers) {
        const p = marker.sourcePath;
        if (typeof p !== 'string' || p.length === 0) continue;
        if (seenInTrail.has(p) || excludedFilePaths.has(p)) continue;
        seenInTrail.add(p);
        counts.set(p, (counts.get(p) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries()).map(([path, trailCount]) => ({
      path,
      trailCount,
    }));
  }, [payloads, excludedFilePaths]);

  // Trails that touch the file picked in the Explored Files tree — feeds
  // the overlay shown over the panel. Index order (newest first). Empty
  // unless we're in files view with a file selected and its payload(s) in.
  const selectedFileTrails = useMemo<SharedTrailIndexEntry[]>(() => {
    if (leftViewMode !== 'files' || !selectedFilePath) return [];
    if (state.kind !== 'ready') return [];
    const out: SharedTrailIndexEntry[] = [];
    for (const entry of state.entries) {
      const payload = payloads.get(entry.id);
      if (!payload) continue;
      if (payload.markers.some((m) => m.sourcePath === selectedFilePath)) {
        out.push(entry);
      }
    }
    return out;
  }, [leftViewMode, selectedFilePath, state, payloads]);

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

  // Files-view selection overlay — when a file is picked in the file
  // tree, light up its building on top of the documented base so it's
  // easy to spot. Only meaningful while no trail is selected (idle map).
  const selectedFileLayer = useMemo<HighlightLayer | null>(() => {
    if (leftViewMode !== 'files' || !selectedFilePath) return null;
    return {
      id: `trail-file-selection-${selectedFilePath}`,
      name: selectedFilePath,
      enabled: true,
      color: theme.colors.accent,
      opacity: 0.85,
      priority: 120,
      items: [
        {
          path: selectedFilePath,
          type: 'file' as const,
          renderStrategy: 'fill' as const,
        },
      ],
      dynamic: true,
    };
  }, [leftViewMode, selectedFilePath, theme.colors.accent]);

  // Stack base + hover. Higher priority renders on top. In debt mode
  // we swap the base layer to the undocumented set and skip the hover
  // overlay (which only makes sense over the coverage layer).
  const idleHighlightLayers = useMemo<HighlightLayer[] | null>(() => {
    const layers: HighlightLayer[] = [];
    const baseLayer = debtMode ? undocumentedFilesLayer : documentedFilesLayer;
    if (baseLayer) layers.push(baseLayer);
    if (!debtMode && hoveredHighlightLayer) layers.push(hoveredHighlightLayer);
    if (selectedFileLayer) layers.push(selectedFileLayer);
    return layers.length > 0 ? layers : null;
  }, [
    debtMode,
    documentedFilesLayer,
    undocumentedFilesLayer,
    hoveredHighlightLayer,
    selectedFileLayer,
  ]);

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
          <TrailLoadingScreen message={`Loading ${repo}`} />
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
        {/* The delete control is driven by the app's own validated session:
            the author-match compares against `useAuth().user.id`, and
            viewerIsRepoAdmin (server-resolved, needs a real token) only matters
            once someone is logged in. `viewerUserId` is null when logged out, so
            no trash can renders even if a stale `github_user_id` cookie lingers.
            The DELETE route re-checks auth server-side regardless. */}
        <TrailListPane
          owner={owner}
          repo={repo}
          loading={false}
          entries={state.entries}
          filteredEntries={filteredEntries}
          payloads={payloads}
          filterQuery={filterQuery}
          onFilterChange={setFilterQuery}
          selectedTrailId={selectedTrailId}
          onSelect={(id) => {
            setSelectedTrailId(id);
            // A trail and a tour can't be active at once — picking one
            // clears the other so the right pane shows a single thing.
            if (id) setSelectedTourId(null);
          }}
          onHover={setHoveredTrailId}
          viewerUserId={user?.id ?? null}
          viewerIsRepoAdmin={state.viewerIsRepoAdmin}
          onRequestDeleteTrail={setTrailToDelete}
          configMode={configMode}
          onToggleConfigMode={() => {
            setConfigMode((m) => !m);
            setSelectedTrailId(null);
          }}
          leftViewMode={leftViewMode}
          onSetViewMode={(mode) => {
            setLeftViewMode(mode);
            // Switching views clears the other views' selections so the map
            // returns to the idle coverage layer between them.
            if (mode === 'files') {
              setSelectedTrailId(null);
              setSelectedTourId(null);
            } else if (mode === 'tours') {
              setSelectedTrailId(null);
              setSelectedFilePath(null);
            } else {
              setSelectedFilePath(null);
              setSelectedTourId(null);
            }
          }}
          trailFileRows={trailFileRows}
          selectedFilePath={selectedFilePath}
          onSelectFile={(path) => {
            // Picking a file spotlights it on the idle map and opens the
            // associated-trails overlay — clear any open trail/tour so it's
            // the file (not a stale selection) showing behind the overlay.
            setSelectedFilePath(path);
            setSelectedTrailId(null);
            setSelectedTourId(null);
          }}
          tours={tours}
          toursLoading={toursLoading}
          selectedTourId={selectedTourId}
          onSelectTour={(id) => {
            setSelectedTourId(id);
            if (id) {
              setSelectedTrailId(null);
              setSelectedFilePath(null);
            }
          }}
          tourGenProgress={tourGenProgress}
          onGenerateTourAudio={handleGenerateTourAudio}
          onRequestDeleteTour={(item) => {
            if (!item.store) return;
            setTourToDelete({
              storeId: item.store.id,
              tourId: item.tour.id,
              title: item.tour.title,
            });
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
          selectedTour={selectedTour}
          idleHighlightLayers={idleHighlightLayers}
          highlightLayersLoading={highlightLayersLoading}
          excludedFolders={excludedDirs.map((d) =>
            d.endsWith('/') ? d.slice(0, -1) : d,
          )}
          showSpatialContext={configMode}
          currentAuthor={user?.login}
          overlayFilePath={leftViewMode === 'files' ? selectedFilePath : null}
          overlayTrails={selectedFileTrails}
          overlaySelectedTrailId={selectedTrailId}
          onSelectOverlayTrail={(id) => {
            setSelectedTrailId(id);
            setSelectedFilePath(null);
          }}
          onCloseOverlay={() => setSelectedFilePath(null)}
          onOpenFile={setSelectedFilePath}
        />
      </div>
      {/* Right-docked source viewer for the picked file. Independent of the
          trail overlay — it just renders whatever file is selected. */}
      <FileSourcePanel
        owner={owner}
        repo={repo}
        filePath={selectedFilePath}
        onClose={() => setSelectedFilePath(null)}
      />
      {trailToDelete && (
        <ConfirmDialog
          title="Delete trail"
          message={
            <>
              Delete{' '}
              <strong style={{ color: 'inherit' }}>
                “{trailToDelete.title}”
              </strong>
              ? This permanently removes the shared trail for everyone. This
              cannot be undone.
              {deleteError && (
                <span className="block mt-3" style={{ color: '#dc2626' }}>
                  {deleteError}
                </span>
              )}
            </>
          }
          confirmLabel="Delete trail"
          destructive
          busy={deleting}
          onConfirm={confirmDeleteTrail}
          onCancel={() => {
            if (deleting) return;
            setTrailToDelete(null);
            setDeleteError(null);
          }}
        />
      )}
      {tourToDelete && (
        <ConfirmDialog
          title="Delete tour"
          message={
            <>
              Delete{' '}
              <strong style={{ color: 'inherit' }}>
                “{tourToDelete.title}”
              </strong>
              ? This permanently removes the published tour for everyone. This
              cannot be undone.
              {deleteError && (
                <span className="block mt-3" style={{ color: '#dc2626' }}>
                  {deleteError}
                </span>
              )}
            </>
          }
          confirmLabel="Delete tour"
          destructive
          busy={deleting}
          onConfirm={confirmDeleteTour}
          onCancel={() => {
            if (deleting) return;
            setTourToDelete(null);
            setDeleteError(null);
          }}
        />
      )}
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
  owner: string;
  repo: string;
  loading: boolean;
  entries: SharedTrailIndexEntry[];
  filteredEntries: SharedTrailIndexEntry[];
  payloads: Map<string, TrailPayload>;
  filterQuery: string;
  onFilterChange: (q: string) => void;
  selectedTrailId: string | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  viewerUserId: number | null;
  viewerIsRepoAdmin: boolean;
  onRequestDeleteTrail: (entry: SharedTrailIndexEntry) => void;
  configMode: boolean;
  onToggleConfigMode: () => void;
  leftViewMode: 'trails' | 'files' | 'tours';
  onSetViewMode: (mode: 'trails' | 'files' | 'tours') => void;
  trailFileRows: { path: string; trailCount: number }[];
  selectedFilePath: string | null;
  onSelectFile: (path: string | null) => void;
  tours: TourListItem[];
  toursLoading: boolean;
  selectedTourId: string | null;
  onSelectTour: (id: string | null) => void;
  tourGenProgress: Map<string, TourGenProgress>;
  onGenerateTourAudio: (item: TourListItem) => void;
  onRequestDeleteTour: (item: TourListItem) => void;
  dirPaths: string[];
  filePaths: string[];
  excludedDirs: string[];
  onExcludedDirsChange: (dirs: string[]) => void;
}> = ({
  owner,
  repo,
  loading,
  entries,
  filteredEntries,
  payloads,
  filterQuery,
  onFilterChange,
  selectedTrailId,
  onSelect,
  onHover,
  viewerUserId,
  viewerIsRepoAdmin,
  onRequestDeleteTrail,
  configMode,
  onToggleConfigMode,
  leftViewMode,
  onSetViewMode,
  trailFileRows,
  selectedFilePath,
  onSelectFile,
  tours,
  toursLoading,
  selectedTourId,
  onSelectTour,
  tourGenProgress,
  onGenerateTourAudio,
  onRequestDeleteTour,
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
        background: theme.colors.background,
        borderColor: theme.colors.border,
      }}
    >
      {/* Trails/Files views are hidden for now (SHOW_ALL_VIEW_TABS); with only
          Tours active the segmented switcher is redundant, so the pane leads
          straight with the repo overview + tours list. */}
      {SHOW_ALL_VIEW_TABS && (
        <TrailSummarySection
          configMode={configMode}
          onToggleConfigMode={onToggleConfigMode}
          leftViewMode={leftViewMode}
          onSetViewMode={onSetViewMode}
        />
      )}

      {configMode ? (
        <FolderConfigPane
          dirPaths={dirPaths}
          filePaths={filePaths}
          excludedDirs={excludedDirs}
          onExcludedDirsChange={onExcludedDirsChange}
        />
      ) : leftViewMode === 'files' ? (
        <TrailFilesPane
          fileRows={trailFileRows}
          allFilePaths={filePaths}
          hasTrails={entries.length > 0}
          selectedPath={selectedFilePath}
          onSelectFile={onSelectFile}
        />
      ) : leftViewMode === 'tours' ? (
        <ToursPane
          owner={owner}
          repo={repo}
          tours={tours}
          loading={toursLoading}
          selectedTourId={selectedTourId}
          onSelectTour={onSelectTour}
          genProgress={tourGenProgress}
          onGenerateAudio={onGenerateTourAudio}
          viewerUserId={viewerUserId}
          viewerIsRepoAdmin={viewerIsRepoAdmin}
          onRequestDelete={onRequestDeleteTour}
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
                  canDelete={
                    viewerUserId !== null &&
                    (viewerIsRepoAdmin ||
                      String(entry.createdBy?.githubId) === String(viewerUserId))
                  }
                  onDelete={() => onRequestDeleteTrail(entry)}
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

// ---------------------------------------------------------------------------
// Files pane — Pierre tree of the repo's files. With trails present it lists
// just the files they touch, each row badged "×N" for how many distinct trails
// reference it (built from the union of loaded payloads' marker sourcePaths).
// With no trails to derive a subset from, it falls back to the whole file tree.
// Selecting a file lights up its building on the map; folder rows don't select.
// ---------------------------------------------------------------------------

const TrailFilesPane: React.FC<{
  fileRows: { path: string; trailCount: number }[];
  allFilePaths: string[];
  hasTrails: boolean;
  selectedPath: string | null;
  onSelectFile: (path: string | null) => void;
}> = ({ fileRows, allFilePaths, hasTrails, selectedPath, onSelectFile }) => {
  const { theme } = useTheme();

  // Deduped, sorted path list fed to Pierre. With trails, this is the touched
  // subset, which grows as payloads stream in (kept in sync via `resetPaths`
  // below); with none, it's the repo's full file tree.
  const paths = useMemo<string[]>(
    () =>
      Array.from(
        new Set(hasTrails ? fileRows.map((f) => f.path) : allFilePaths),
      ).sort(),
    [hasTrails, fileRows, allFilePaths],
  );

  // `useFileTree` snapshots its options once, so the decoration renderer
  // captured at construction would read a stale count map. Mirror the
  // latest counts through a ref the renderer reads on every paint.
  const countByPathRef = useRef(new Map<string, number>());
  countByPathRef.current = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of fileRows) m.set(f.path, f.trailCount);
    return m;
  }, [fileRows]);

  const modelRef = useRef<ReturnType<typeof useFileTree>['model'] | null>(null);
  const isFirstSync = useRef(true);

  const { model } = useFileTree({
    paths,
    search: true,
    flattenEmptyDirectories: true,
    initialExpansion: 'closed',
    initialSelectedPaths: selectedPath ? [selectedPath] : [],
    onSelectionChange: (selected) => {
      const next = selected[0] ?? null;
      // Folder rows aren't a file selection — ignore them so the map
      // overlay only ever tracks an actual file.
      if (next) {
        const item = modelRef.current?.getItem(next);
        if (item && item.isDirectory()) return;
      }
      onSelectFile(next);
    },
    renderRowDecoration: ({ row }) => {
      if (row.kind !== 'file') return null;
      const count = countByPathRef.current.get(row.path);
      if (!count) return null;
      return {
        text: `×${count}`,
        title: `In ${count} ${count === 1 ? 'trail' : 'trails'}`,
      };
    },
  });
  modelRef.current = model;

  // Keep the tree in sync as payloads (and therefore paths) stream in.
  // Skip the very first run — the model already built from `paths`.
  useEffect(() => {
    if (isFirstSync.current) {
      isFirstSync.current = false;
      return;
    }
    model.resetPaths(paths, {});
  }, [model, paths]);

  // Match the trail list: it has no background of its own and shows the
  // aside's `background` through transparent rows. Build the tree on the same
  // token and override Pierre's own bg to transparent so the two views read as
  // one surface.
  const treeStyles = useMemo(
    () =>
      themeToTreeStyles({
        type: 'dark',
        bg: theme.colors.background,
        fg: theme.colors.text,
      }),
    [theme.colors.background, theme.colors.text],
  );

  if (paths.length === 0) {
    return (
      <div className="flex-1 min-h-0">
        <ListMessage>
          {hasTrails
            ? 'No files have been touched by trails yet.'
            : 'No files found in this repository.'}
        </ListMessage>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 pt-2">
      <PierreFileTree
        model={model}
        style={{
          ...(treeStyles as React.CSSProperties),
          '--trees-bg-override': 'transparent',
          height: '100%',
          display: 'block',
        } as React.CSSProperties}
      />
    </div>
  );
};

// Folder-coverage configuration is hidden for now. All the plumbing
// (config mode, folder include/exclude) is kept intact — flip this to
// true to re-enable the settings button, which we may do in the future.
const SHOW_FOLDER_CONFIG = false;

// Trails and Files views are hidden while we rebuild the repo learning
// experience around Tours + the repo overview. All the plumbing (the view
// switcher, trail list, files tree, folder config) is kept intact — flip this
// back to true to restore the Tours / Trails / Files segmented control.
const SHOW_ALL_VIEW_TABS = false;

const VIEW_TABS = [
  { value: 'tours', label: 'Tours', title: 'Guided tours of this repository' },
  { value: 'trails', label: 'Trails', title: 'List of shared trails' },
  {
    value: 'files',
    label: 'Files',
    title: 'File tree of the repository',
  },
] as const;

const TrailSummarySection: React.FC<{
  configMode: boolean;
  onToggleConfigMode: () => void;
  leftViewMode: 'trails' | 'files' | 'tours';
  onSetViewMode: (mode: 'trails' | 'files' | 'tours') => void;
}> = ({ configMode, onToggleConfigMode, leftViewMode, onSetViewMode }) => {
  const { theme } = useTheme();
  const activeIndex = Math.max(
    0,
    VIEW_TABS.findIndex((t) => t.value === leftViewMode),
  );
  return (
    <div
      className="px-4 py-3 border-b"
      style={{ borderColor: theme.colors.border }}
    >
      <div className="flex items-center justify-between">
        {configMode ? (
          <div
            style={{
              color: theme.colors.primary,
              fontFamily: theme.fonts.body,
              fontSize: theme.fontSizes[2],
              fontWeight: theme.fontWeights.semibold,
            }}
          >
            Configure folders
          </div>
        ) : (
          <div
            role="tablist"
            aria-label="Switch between trails, explored files, and tours"
            className="relative flex flex-1 rounded-md p-0.5"
            style={{
              background: theme.colors.background,
              border: `1px solid ${theme.colors.border}`,
            }}
          >
            {/* Sliding thumb sits behind the labels and animates to the
                active tab. Width is one tab-width of the inner track; the
                thumb translates by whole multiples of its own width, so
                translateX(activeIndex * 100%) lands it on the active tab. */}
            <div
              aria-hidden="true"
              className="absolute rounded"
              style={{
                top: 2,
                bottom: 2,
                left: 2,
                width: `calc(${100 / VIEW_TABS.length}% - 2px)`,
                background: theme.colors.backgroundSecondary,
                transform: `translateX(${activeIndex * 100}%)`,
                transition: 'transform 0.2s ease',
              }}
            />
            {VIEW_TABS.map((option) => {
              const active = leftViewMode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onSetViewMode(option.value)}
                  title={option.title}
                  className="relative flex-1 px-3 py-1 rounded text-center transition-colors truncate"
                  style={{
                    zIndex: 1,
                    background: 'transparent',
                    color: active
                      ? theme.colors.primary
                      : theme.colors.textSecondary,
                    fontFamily: theme.fonts.body,
                    fontSize: theme.fontSizes[1],
                    fontWeight: theme.fontWeights.semibold,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        )}
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
  canDelete: boolean;
  onDelete: () => void;
}> = ({ entry, payload, selected, onSelect, onHover, canDelete, onDelete }) => {
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
    <div
      className="relative border-b"
      style={{ borderColor: theme.colors.border }}
      onMouseEnter={onHover}
    >
      <button
        type="button"
        onClick={onSelect}
        onFocus={onHover}
        className="w-full text-left px-4 py-3 transition-colors"
        style={{
          background: selected
            ? `color-mix(in srgb, ${theme.colors.surface} 50%, ${theme.colors.background})`
            : 'transparent',
          color: theme.colors.text,
        }}
      >
      <div className="min-w-0">
        <div
          className="break-words"
          // Pad the title so a long one doesn't slide under the delete button.
          style={{
            fontSize: theme.fontSizes[2],
            fontWeight: theme.fontWeights.semibold,
            paddingRight: canDelete ? 28 : 0,
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
      {canDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label={`Delete trail “${entry.title}”`}
          title="Delete trail"
          className="absolute top-2.5 right-2.5 w-7 h-7 rounded-md flex items-center justify-center transition-opacity opacity-60 hover:opacity-100"
          style={{
            background: 'transparent',
            color: theme.colors.error ?? theme.colors.textMuted,
          }}
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
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
// Tours pane — selectable list of the repo's guided tours. Selecting a tour
// swaps the right pane to the tour panel (mutually exclusive with trails).
// Tours arrive fully-parsed from /api/tours, so there's no lazy payload fetch.
// ---------------------------------------------------------------------------

const TOUR_SKILL_URL =
  'https://github.com/principal-ai/file-city/blob/main/skills/file-city-tours/SKILL.md';

// Shown in the Tours list when a repo has no `*.tour.json` yet — points authors
// at the file-city-tours skill that scaffolds one.
const TOUR_INIT_COMMAND =
  'npx @principal-ai/file-city-cli@latest init --template onboarding';

const ToursEmptyState: React.FC = () => {
  const { theme } = useTheme();
  const [copied, setCopied] = useState(false);
  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(TOUR_INIT_COMMAND);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be unavailable (insecure context / denied) — no-op.
    }
  };
  return (
    <div
      className="px-4 py-6 flex flex-col items-center gap-3 text-center"
      style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[1] }}
    >
      <p>
        No tour has been authored for this repository yet. A tour is a guided
        walkthrough that lives as a <code>.tour.json</code> file in the repo.
      </p>
      <a
        href={TOUR_SKILL_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md font-medium transition-opacity hover:opacity-80"
        style={{
          background: `color-mix(in srgb, ${theme.colors.primary} 18%, transparent)`,
          border: `1px solid color-mix(in srgb, ${theme.colors.primary} 50%, transparent)`,
          color: theme.colors.primary,
        }}
      >
        Create one with the file-city-tours skill →
      </a>
      <button
        type="button"
        onClick={copyCommand}
        title="Click to copy"
        className="font-mono px-2 py-1 rounded transition-opacity hover:opacity-80"
        style={{
          background: `color-mix(in srgb, ${theme.colors.text} 8%, transparent)`,
          color: theme.colors.textMuted,
          fontSize: theme.fontSizes[0],
          wordBreak: 'break-all',
        }}
        aria-label={copied ? 'Command copied' : 'Copy command to clipboard'}
      >
        {copied ? 'Copied!' : TOUR_INIT_COMMAND}
      </button>
    </div>
  );
};

// Compact "x ago" for the repo's last-push timestamp. App code (Date.now is
// fine here — the workflow-script restriction doesn't apply).
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.max(0, (Date.now() - then) / 1000);
  const DAY = 86400;
  if (secs < DAY) return 'today';
  const days = Math.floor(secs / DAY);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

// The license badge's corner radius encodes how restrictive the license is: the
// stricter the license, the sharper the corners. Permissive licenses (MIT,
// Apache, BSD…) get a full pill; copyleft squares off progressively, with AGPL
// — the strongest copyleft — fully square.
function licenseBadgeRadius(spdxId: string): number {
  const id = spdxId.toUpperCase();
  if (id.startsWith('AGPL')) return 0; // strongest (network) copyleft → square
  if (id.startsWith('GPL')) return 3; // strong copyleft
  if (
    id.startsWith('LGPL') ||
    id.startsWith('MPL') ||
    id.startsWith('EPL') ||
    id.startsWith('CDDL') ||
    id.startsWith('OSL')
  ) {
    return 7; // weak copyleft
  }
  return 9999; // permissive → full pill
}

// ---------------------------------------------------------------------------
// Repo overview — a compact, no-AI dossier shown atop the Tours pane. Composes
// the repo's own GitHub metadata (description, language, license, stars,
// topics, fork-of, last push) with a package-derived project-shape line
// (monorepo / deps / scripts). Everything here is best-effort: each fetch is
// independent, and a failure just drops its row rather than blocking the tours
// list. Both procedures are heavily cached server-side.
// ---------------------------------------------------------------------------

const RepoOverview: React.FC<{ owner: string; repo: string }> = ({
  owner,
  repo,
}) => {
  const { theme } = useTheme();
  const [info, setInfo] = useState<Awaited<
    ReturnType<typeof trpc.github.getRepoInfo.query>
  > | null>(null);
  const [pkg, setPkg] = useState<
    Awaited<ReturnType<typeof trpc.github.getRepoPackages.query>>['summary'] | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    setInfo(null);
    setPkg(null);
    // Core dossier — the repo's own metadata.
    trpc.github.getRepoInfo
      .query({ owner, repo })
      .then((data) => {
        if (!cancelled) setInfo(data);
      })
      .catch(() => {
        // Overview is optional — a failure just leaves it unrendered.
      });
    // Project shape — secondary; renders its own line once it lands.
    trpc.github.getRepoPackages
      .query({ owner, repo })
      .then((data) => {
        if (!cancelled) setPkg(data.summary);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [owner, repo]);

  // Nothing until the core metadata lands — keeps the pane from flashing a
  // half-built header. The tours list renders regardless (below this).
  if (!info) return null;

  // "Monorepo · N packages · M deps · K scripts" — assembled from whatever the
  // package scan found; empty when the repo has no package.json.
  const projectShape: string[] = [];
  if (pkg) {
    // `rootPackageName` is absent on the truncated-tree branch of the summary
    // union, so read it through a presence check rather than directly.
    const rootName =
      'rootPackageName' in pkg ? pkg.rootPackageName : undefined;
    if (pkg.isMonorepo) {
      projectShape.push(`Monorepo · ${pkg.totalPackages} packages`);
    } else if (rootName) {
      projectShape.push(rootName);
    }
  }

  const license =
    info.license?.spdx_id && info.license.spdx_id !== 'NOASSERTION'
      ? info.license.spdx_id
      : null;

  return (
    <div
      className="px-4 py-3 border-b flex flex-col gap-2"
      style={{ borderColor: theme.colors.border }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          style={{
            fontSize: theme.fontSizes[0],
            fontWeight: theme.fontWeights.semibold,
            color: theme.colors.textSecondary,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          About
        </span>
        {license && (
          <span
            className="shrink-0"
            style={{
              padding: '2px 8px',
              borderRadius: licenseBadgeRadius(license),
              fontSize: theme.fontSizes[0],
              fontWeight: theme.fontWeights.medium,
              color: theme.colors.textSecondary,
              background: `color-mix(in srgb, ${theme.colors.text} 8%, transparent)`,
              border: `1px solid ${theme.colors.border}`,
            }}
          >
            {license}
          </span>
        )}
      </div>
      {info.description && (
        <p
          style={{
            margin: 0,
            color: theme.colors.text,
            fontSize: theme.fontSizes[2],
            lineHeight: 1.4,
          }}
        >
          {info.description}
        </p>
      )}

      {/* Vital signs: stars · last push. */}
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1"
        style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[1] }}
      >
        {info.pushed_at && (
          <span title={new Date(info.pushed_at).toLocaleString()}>
            Updated {relativeTime(info.pushed_at)}
          </span>
        )}
        {info.stargazers_count > 0 && (
          <span className="inline-flex items-center gap-1">
            <Star size={14} />
            {info.stargazers_count.toLocaleString()}
          </span>
        )}
      </div>

      {info.fork && info.parent && (
        <div
          className="inline-flex items-center gap-1 min-w-0"
          style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[1] }}
        >
          <GitFork size={14} className="shrink-0" />
          <span className="shrink-0">forked from</span>
          <a
            href={`https://github.com/${info.parent.full_name}`}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate"
            style={{ color: theme.colors.primary }}
          >
            {info.parent.full_name}
          </a>
        </div>
      )}

      {projectShape.length > 0 && (
        <div
          style={{
            color: theme.colors.textSecondary,
            fontSize: theme.fontSizes[1],
          }}
        >
          {projectShape.join(' · ')}
        </div>
      )}

      {info.homepage && (
        <a
          href={info.homepage}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 truncate"
          style={{ color: theme.colors.primary, fontSize: theme.fontSizes[1] }}
        >
          <ExternalLink size={14} className="shrink-0" />
          {info.homepage.replace(/^https?:\/\//, '')}
        </a>
      )}
    </div>
  );
};

const ToursPane: React.FC<{
  owner: string;
  repo: string;
  tours: TourListItem[];
  loading: boolean;
  selectedTourId: string | null;
  onSelectTour: (id: string | null) => void;
  genProgress: Map<string, TourGenProgress>;
  onGenerateAudio: (item: TourListItem) => void;
  viewerUserId: number | null;
  viewerIsRepoAdmin: boolean;
  onRequestDelete: (item: TourListItem) => void;
}> = ({
  owner,
  repo,
  tours,
  loading,
  selectedTourId,
  onSelectTour,
  genProgress,
  onGenerateAudio,
  viewerUserId,
  viewerIsRepoAdmin,
  onRequestDelete,
}) => {
  // With exactly one tour we collapse the list into a single "Start tour" CTA
  // (SingleTourCta) rather than a one-row list.
  const single = tours.length === 1 ? tours[0] : null;
  const singleCanDelete =
    single != null &&
    single.store != null &&
    viewerUserId !== null &&
    (viewerIsRepoAdmin ||
      String(single.store.createdBy.githubId) === String(viewerUserId));
  // The whole pane scrolls as one column: a repo-overview dossier on top, then
  // the tours list. (The file-types legend that used to sit here moved into the
  // tour explorer.)
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <RepoOverview owner={owner} repo={repo} />

      {loading ? (
        <ListMessage>Loading tours…</ListMessage>
      ) : tours.length === 0 ? (
        <ToursEmptyState />
      ) : single ? (
        <SingleTourCta
          item={single}
          active={single.tour.id === selectedTourId}
          onToggle={() =>
            onSelectTour(
              single.tour.id === selectedTourId ? null : single.tour.id,
            )
          }
          progress={genProgress.get(single.tour.id)}
          onGenerate={() => onGenerateAudio(single)}
          canDelete={singleCanDelete}
          onDelete={() => onRequestDelete(single)}
        />
      ) : (
        tours.map((item) => (
          <TourRow
            key={item.tour.id}
            tour={item.tour}
            audioStatus={item.audioStatus}
            progress={genProgress.get(item.tour.id)}
            selected={item.tour.id === selectedTourId}
            onSelect={() =>
              onSelectTour(
                item.tour.id === selectedTourId ? null : item.tour.id,
              )
            }
            onGenerate={() => onGenerateAudio(item)}
            // Only store-backed tours are deletable; gate on the validated
            // session, mirroring trails (author-or-repo-admin).
            canDelete={
              item.store != null &&
              viewerUserId !== null &&
              (viewerIsRepoAdmin ||
                String(item.store.createdBy.githubId) ===
                  String(viewerUserId))
            }
            onDelete={() => onRequestDelete(item)}
          />
        ))
      )}
    </div>
  );
};

const TourRow: React.FC<{
  tour: IntroductionTour;
  audioStatus: TourAudioStatus;
  progress: TourGenProgress | undefined;
  selected: boolean;
  onSelect: () => void;
  onGenerate: () => void;
  canDelete: boolean;
  onDelete: () => void;
}> = ({
  tour,
  audioStatus,
  progress,
  selected,
  onSelect,
  onGenerate,
  canDelete,
  onDelete,
}) => {
  const { theme } = useTheme();
  const stepCount = Array.isArray(tour.steps) ? tour.steps.length : 0;
  // `audience` is an optional, loosely-typed field on the tour schema — read
  // defensively so a missing/non-string value just drops the eyebrow.
  const audienceRaw = (tour as { audience?: unknown }).audience;
  const audience = typeof audienceRaw === 'string' ? audienceRaw : null;

  return (
    <div
      className="relative border-b transition-colors"
      style={{
        background: selected
          ? `color-mix(in srgb, ${theme.colors.surface} 50%, ${theme.colors.background})`
          : 'transparent',
        borderColor: theme.colors.border,
        color: theme.colors.text,
      }}
    >
      <button
        type="button"
        onClick={onSelect}
        className="w-full text-left px-4 pt-3"
        style={{ background: 'transparent', color: 'inherit' }}
      >
        <div className="min-w-0">
          <div
            className="break-words"
            style={{
              fontSize: theme.fontSizes[2],
              fontWeight: theme.fontWeights.semibold,
              paddingRight: canDelete ? 28 : 0,
            }}
          >
            {tour.title}
          </div>
          <div
            className="mt-1.5 flex items-center gap-3"
            style={{
              color: theme.colors.textMuted,
              fontSize: theme.fontSizes[0],
            }}
          >
            <span className="inline-flex items-center gap-1">
              <Compass size={12} />
              {stepCount} {stepCount === 1 ? 'step' : 'steps'}
            </span>
            {audience && <span className="truncate">{audience}</span>}
          </div>
          {tour.description && (
            <div
              className="mt-1 break-words"
              style={{
                color: theme.colors.textMuted,
                fontSize: theme.fontSizes[0],
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {tour.description}
            </div>
          )}
        </div>
      </button>
      {canDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label={`Delete tour “${tour.title}”`}
          title="Delete tour"
          className="absolute top-2.5 right-2.5 w-7 h-7 rounded-md flex items-center justify-center transition-opacity opacity-60 hover:opacity-100"
          style={{
            background: 'transparent',
            color: theme.colors.error ?? theme.colors.textMuted,
          }}
        >
          <Trash2 size={14} />
        </button>
      )}
      <TourAudioControl
        status={audioStatus}
        progress={progress}
        onGenerate={onGenerate}
      />
    </div>
  );
};

/**
 * Audio status badge + Generate/Regenerate button for one tour row. Shows live
 * per-step progress while generating, and disables the button while the tour is
 * inside its once-per-hour cooldown.
 */
const TourAudioControl: React.FC<{
  status: TourAudioStatus;
  progress: TourGenProgress | undefined;
  onGenerate: () => void;
}> = ({ status, progress, onGenerate }) => {
  const { theme } = useTheme();
  const muted = theme.colors.textMuted;
  const accent = theme.colors.primary ?? '#3b82f6';

  const cooldownMinutes = useMemo(() => {
    if (!status.canGenerateAt) return 0;
    const ms = new Date(status.canGenerateAt).getTime() - Date.now();
    return ms > 0 ? Math.ceil(ms / 60000) : 0;
  }, [status.canGenerateAt]);

  const rowStyle = 'px-4 pb-3 pt-2 flex items-center gap-2';
  const labelStyle = { fontSize: theme.fontSizes[0] };

  // Active generation — show per-step progress, no button.
  if (progress?.phase === 'running') {
    return (
      <div className={rowStyle} style={{ color: muted, ...labelStyle }}>
        <Loader2 size={12} className="animate-spin" />
        <span>
          Generating audio… {progress.done}/{progress.total}
        </span>
      </div>
    );
  }

  const generateButton = (label: string) => {
    const disabled = cooldownMinutes > 0;
    return (
      <button
        type="button"
        disabled={disabled}
        title={
          disabled
            ? `Audio was generated recently — available again in ~${cooldownMinutes}m`
            : undefined
        }
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) onGenerate();
        }}
        className="inline-flex items-center gap-1 rounded px-2 py-1 border transition-colors"
        style={{
          fontSize: theme.fontSizes[0],
          borderColor: theme.colors.border,
          color: disabled ? muted : accent,
          opacity: disabled ? 0.6 : 1,
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        <Mic size={12} />
        {disabled ? `Available in ${cooldownMinutes}m` : label}
      </button>
    );
  };

  if (progress?.phase === 'error') {
    return (
      <div className={rowStyle}>
        <span
          className="inline-flex items-center gap-1"
          style={{ color: '#dc2626', ...labelStyle }}
        >
          <AlertTriangle size={12} />
          {progress.error ?? 'Generation failed'}
        </span>
        {generateButton('Retry')}
      </div>
    );
  }

  if (status.state === 'ready') {
    return (
      <div className={rowStyle} style={{ color: muted, ...labelStyle }}>
        <Volume2 size={12} style={{ color: accent }} />
        <span>Audio ready</span>
      </div>
    );
  }

  if (status.state === 'outdated') {
    return (
      <div className={rowStyle}>
        <span
          className="inline-flex items-center gap-1"
          style={{ color: muted, ...labelStyle }}
        >
          <AlertTriangle size={12} />
          Audio outdated
        </span>
        {generateButton('Regenerate')}
      </div>
    );
  }

  // 'none' or 'partial' — no complete audio yet.
  return (
    <div className={rowStyle}>
      <span style={{ color: muted, ...labelStyle }}>
        {status.state === 'partial'
          ? `Partial audio (${status.readySteps}/${status.totalSteps})`
          : 'No audio'}
      </span>
      {generateButton('Generate')}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Single-tour CTA. When a repo has exactly one tour, the Tours pane shows this
// in place of a one-row list: the tour's title/description + a prominent
// Start/Stop button that toggles the tour in the right pane, with the audio
// control (and the author delete) kept beneath it.
// ---------------------------------------------------------------------------

const SingleTourCta: React.FC<{
  item: TourListItem;
  active: boolean;
  onToggle: () => void;
  progress: TourGenProgress | undefined;
  onGenerate: () => void;
  canDelete: boolean;
  onDelete: () => void;
}> = ({ item, active, onToggle, progress, onGenerate, canDelete, onDelete }) => {
  const { theme } = useTheme();

  return (
    <div className="flex flex-col">
      <div className="px-4 py-3">
        <button
          type="button"
          onClick={onToggle}
          className="w-full inline-flex items-center justify-center gap-2 rounded-md transition-opacity hover:opacity-90"
          style={{
            padding: '10px 14px',
            fontFamily: theme.fonts.body,
            fontSize: theme.fontSizes[1],
            fontWeight: theme.fontWeights.semibold,
            cursor: 'pointer',
            ...(active
              ? {
                  background: 'transparent',
                  color: theme.colors.text,
                  border: `1px solid ${theme.colors.border}`,
                }
              : {
                  background: theme.colors.primary,
                  color: '#ffffff',
                  border: `1px solid ${theme.colors.primary}`,
                }),
          }}
        >
          {active ? (
            <>
              <X size={16} />
              Stop tour
            </>
          ) : (
            <>
              <Play size={16} />
              Start tour
            </>
          )}
        </button>
      </div>

      <TourAudioControl
        status={item.audioStatus}
        progress={progress}
        onGenerate={onGenerate}
      />

      {canDelete && (
        <div className="px-4 pb-3">
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-1 transition-opacity opacity-70 hover:opacity-100"
            style={{
              background: 'transparent',
              color: theme.colors.error ?? theme.colors.textMuted,
              fontSize: theme.fontSizes[0],
              cursor: 'pointer',
            }}
          >
            <Trash2 size={12} />
            Delete tour
          </button>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Explored-file → trails overlay. Floats over the panel listing every trail
// that touches the file picked in the Explored Files tree. Clicking a row
// opens that trail in the panel behind it; the backdrop or × dismisses.
// Mirrors the desktop app's TrailFileTrailsOverlay.
// ---------------------------------------------------------------------------

const TrailFileTrailsOverlay: React.FC<{
  filePath: string;
  trails: SharedTrailIndexEntry[];
  selectedTrailId: string | null;
  onSelectTrail: (id: string) => void;
  onClose: () => void;
}> = ({ filePath, trails, selectedTrailId, onSelectTrail, onClose }) => {
  const { theme } = useTheme();
  const accent = theme.colors.primary ?? '#3b82f6';
  const basename = filePath.split('/').pop() || filePath;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        padding: 12,
        backgroundColor: 'rgba(0,0,0,0.35)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          maxHeight: '100%',
          maxWidth: 460,
          width: '100%',
          margin: '0 auto',
          borderRadius: 10,
          border: `1px solid ${theme.colors.border}`,
          backgroundColor: theme.colors.backgroundSecondary,
          boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
          overflow: 'hidden',
        }}
      >
        {/* Header — file identity + close. */}
        <div
          style={{
            flex: '0 0 auto',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            padding: '12px 12px 10px',
            borderBottom: `1px solid ${theme.colors.border}`,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              title={filePath}
              style={{
                fontFamily: theme.fonts.monospace ?? theme.fonts.body,
                fontSize: theme.fontSizes[2],
                fontWeight: theme.fontWeights.semibold,
                color: theme.colors.text,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {basename}
            </div>
            <div
              style={{
                marginTop: 2,
                fontFamily: theme.fonts.body,
                fontSize: theme.fontSizes[0],
                color: theme.colors.textSecondary,
              }}
            >
              {trails.length} {trails.length === 1 ? 'trail' : 'trails'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            title="Close"
            style={{
              all: 'unset',
              flex: '0 0 auto',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 24,
              height: 24,
              borderRadius: 6,
              cursor: 'pointer',
              color: theme.colors.textSecondary,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Trail list. */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {trails.map((trail) => {
            const isSelected = selectedTrailId === trail.id;
            const selectedBg = `color-mix(in srgb, ${accent} 22%, ${theme.colors.background})`;
            const author = trail.createdBy;
            const avatarUrl = author
              ? `https://avatars.githubusercontent.com/u/${author.githubId}?v=4&s=40`
              : null;
            return (
              <button
                key={trail.id}
                type="button"
                onClick={() => onSelectTrail(trail.id)}
                title={trail.title || 'Untitled trail'}
                style={{
                  all: 'unset',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: `1px solid ${accent}`,
                  backgroundColor: isSelected ? selectedBg : 'transparent',
                  cursor: 'pointer',
                  transition:
                    'background-color 120ms ease, border-color 120ms ease',
                }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: accent,
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: isSelected ? '#ffffff' : accent,
                      fontFamily: theme.fonts.body,
                      fontSize: theme.fontSizes[1],
                      fontWeight: theme.fontWeights.semibold,
                    }}
                  >
                    {trail.title || 'Untitled trail'}
                  </span>
                </div>
                {author?.githubLogin && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      paddingLeft: 16,
                      fontFamily: theme.fonts.body,
                      fontSize: theme.fontSizes[0],
                      color: theme.colors.textSecondary,
                    }}
                  >
                    {avatarUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatarUrl}
                        alt=""
                        className="rounded-full shrink-0"
                        width={14}
                        height={14}
                        style={{ background: theme.colors.background }}
                      />
                    )}
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {author.githubLogin}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
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
  selectedTour: TourListItem | null;
  idleHighlightLayers: HighlightLayer[] | null;
  highlightLayersLoading: boolean;
  excludedFolders: string[];
  showSpatialContext: boolean;
  /** Undefined for anonymous viewers — gates the panel's note Edit/Delete. */
  currentAuthor?: string;
  overlayFilePath: string | null;
  overlayTrails: SharedTrailIndexEntry[];
  overlaySelectedTrailId: string | null;
  onSelectOverlayTrail: (id: string) => void;
  onCloseOverlay: () => void;
  /** Clicking a building / file on the map opens it in the source drawer. */
  onOpenFile: (filePath: string) => void;
}> = ({
  owner,
  repo,
  fileTree,
  treeError,
  selectedPayload,
  selectedTour,
  idleHighlightLayers,
  highlightLayersLoading,
  excludedFolders,
  showSpatialContext,
  currentAuthor,
  overlayFilePath,
  overlayTrails,
  overlaySelectedTrailId,
  onSelectOverlayTrail,
  onCloseOverlay,
  onOpenFile,
}) => {
  const { theme } = useTheme();
  const events = useMemo<PanelEventBus>(() => new PanelEventBus(), []);

  // The file-city map reports a building/file click by emitting a `file:open`
  // event on this bus (see @industry-theme/file-city-panel). Route the clicked
  // path into the source drawer.
  useEffect(() => {
    const unsub = events.onAll((e) => {
      if (e.type === 'file:open' || e.type === 'file:opened') {
        const path = (e.payload as { path?: string } | null)?.path;
        if (typeof path === 'string' && path) onOpenFile(path);
      }
    });
    return unsub;
  }, [events, onOpenFile]);

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
      openFile: (filePath) => onOpenFile(filePath),
      readFile,
      createTrailNote: async () => null,
      updateTrailNote: async () => null,
      deleteTrailNote: async () => {},
      createTrailSignOff: async () => null,
      deleteTrailSignOff: async () => {},
      shareTrail,
    }),
    [readFile, shareTrail, onOpenFile],
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

  // Tour panel wiring. The tour panel takes one IntroductionTour at a time
  // and draws its own step UI.
  const tourRepository = useMemo<FileCityTourExplorerRepository>(
    () => ({ id: `${owner}/${repo}`, owner, name: repo }),
    [owner, repo],
  );
  // Audio narration: fetch all step URLs upfront via the TTS backend, keyed by
  // step id (the panel looks up `audioUrls.get(step.id)`). The panel passes the
  // `tourAudioContext` we supply below straight back into this action.
  const tourActions = useMemo<FileCityTourExplorerPanelActions>(
    () => ({
      openFile: (filePath) => onOpenFile(filePath),
      fetchAudioUrls: async (ctx) => {
        const data = await trpc.tts.batchGenerate.mutate({
          owner: ctx.owner,
          repo: ctx.repo,
          path: ctx.path,
          commitSha: ctx.commitSha,
          cacheOnly: ctx.cacheOnly,
        });
        const urls = new Map<string, string>();
        for (const step of data.steps) {
          if (step.status === 'ready') urls.set(step.stepId, step.audioUrl);
        }
        return urls;
      },
    }),
    [onOpenFile],
  );
  // Coordinates the TTS backend needs to look up this tour's cached audio.
  // Points at the source the tour was discovered in (repo or fork).
  const tourAudioContext = useMemo(
    () =>
      selectedTour
        ? {
            owner: selectedTour.audio.owner,
            repo: selectedTour.audio.repo,
            path: selectedTour.audio.path,
            commitSha: selectedTour.audio.commitSha ?? undefined,
            // Always cache-only: selecting a tour plays whatever audio already
            // exists and never triggers generation. Generation is a deliberate,
            // rate-limited action from the tours list (the Generate button).
            cacheOnly: true,
          }
        : undefined,
    [selectedTour],
  );
  const tourContext = useMemo<
    PanelContextValue<FileCityTourExplorerPanelContext>
  >(() => {
    const fileTreeSlice: DataSlice<FileTree> = {
      scope: 'repository',
      name: 'fileTree',
      data: fileTree ?? (null as unknown as FileTree),
      loading: fileTree === null,
      error: null,
      refresh: async () => {},
    };
    const tourSlice: DataSlice<IntroductionTour | null> = {
      scope: 'repository',
      name: 'tour',
      data: selectedTour?.tour ?? null,
      loading: false,
      error: null,
      refresh: async () => {},
    };
    return {
      currentScope: { type: 'repository' },
      refresh: async () => {},
      fileTree: fileTreeSlice,
      lineCounts: nullSlice('lineCounts'),
      tour: tourSlice,
      // The panel sources highlights from the active tour's steps; the
      // host highlightLayers slice only matters in the idle/no-tour state,
      // which this branch never renders.
      highlightLayers: nullSlice('highlightLayers'),
      repository: tourRepository,
    };
  }, [fileTree, selectedTour, tourRepository]);

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

  // A selected tour swaps the right pane to the tour panel. Trail-only
  // chrome (file overlay, share modal) belongs to the trail branch.
  if (selectedTour) {
    return (
      <main
        className="flex-1 min-w-0 min-h-0 relative"
        style={{ background: theme.colors.background }}
      >
        <FileCityTourExplorerPanel
          context={tourContext}
          actions={tourActions}
          events={events}
          tourAudioContext={tourAudioContext}
          autoAdvanceOnAudioEnd
          defaultIsolationMode="hide"
          excludedFolders={excludedFolders}
        />
      </main>
    );
  }

  // colorScheme 'dark' makes Pierre's snippet renderer resolve its dark palette
  // via CSS light-dark(); otherwise the browser leaves color-scheme unset and the
  // snippet renders white on the panel's black surface.
  return (
    <main
      className="flex-1 min-w-0 min-h-0 relative"
      style={{ background: theme.colors.background, colorScheme: 'dark' }}
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
      {overlayFilePath && overlayTrails.length > 0 && (
        <TrailFileTrailsOverlay
          filePath={overlayFilePath}
          trails={overlayTrails}
          selectedTrailId={overlaySelectedTrailId}
          onSelectTrail={onSelectOverlayTrail}
          onClose={onCloseOverlay}
        />
      )}
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

