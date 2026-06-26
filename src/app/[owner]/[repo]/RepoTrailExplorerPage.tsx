'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
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
  Palette,
  ChevronRight,
  ChevronDown,
  Boxes,
  Footprints,
  MapPin,
  Globe,
  Users,
  Building2,
  Twitter,
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
import {
  PackageCompositionPanelContent,
  type PackageLayer,
} from '@industry-theme/repository-composition-panels';
import { addRecentRepository } from '@industry-theme/github-panels';
import type { IntroductionTour } from '@principal-ai/file-city-builder';
import type { TourAudioStatus, TourListItem } from '@/lib/tours/types';
import { trpc } from '@/lib/trpc/client';
import { useAuth } from '@/contexts/AuthContext';
import { UserAvatarMenu } from '@/components/UserAvatarMenu';
import { AgentViewButton } from '@/components/AgentViewButton';
import { TrailLoadingScreen } from '@/components/trail/TrailLoadingScreen';
import { TrailErrorView } from '@/components/trail/TrailErrorView';
import { TrailShareModal } from '@/components/trail/TrailShareModal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ActivityHeatmap } from '@/components/ActivityHeatmap';
import type { UserActivityResponse } from '@/app/api/github/user/[username]/activity/route';
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
  // Which edge the file source drawer docks to. Files open on the right; the
  // README opens on the left.
  const [fileSide, setFileSide] = useState<'left' | 'right'>('right');
  // Tour selection. Mutually exclusive with trail/file selection — the right
  // pane swaps to the tour panel while a tour is active.
  const [selectedTourId, setSelectedTourId] = useState<string | null>(null);

  // Measured page-header height, so the right-docked file panel can start just
  // below the header instead of overlapping it at the top of the screen. A
  // callback ref (not a ref + mount effect) is required: this component returns
  // a loading screen first, so the header mounts *after* the initial commit —
  // the callback fires when the node actually attaches.
  const [headerHeight, setHeaderHeight] = useState(0);
  const headerObserver = useRef<ResizeObserver | null>(null);
  const headerRef = useCallback((el: HTMLElement | null) => {
    headerObserver.current?.disconnect();
    if (!el) return;
    const measure = () => setHeaderHeight(el.getBoundingClientRect().height);
    measure();
    headerObserver.current = new ResizeObserver(measure);
    headerObserver.current.observe(el);
  }, []);

  // Architecture-panel → file-city wiring. Hovering / selecting a package in
  // the left-rail composition panel lights up that package's directory subtree
  // on the idle Tour city. Repo-relative dir, normalized (no leading/trailing
  // slash); null for the monorepo root (we don't paint the whole repo).
  const [hoveredPackagePath, setHoveredPackagePath] = useState<string | null>(
    null,
  );
  const [selectedPackagePath, setSelectedPackagePath] = useState<string | null>(
    null,
  );
  const packageDirFromLayer = useCallback((pkg: PackageLayer | null) => {
    if (!pkg || pkg.packageData.isMonorepoRoot) return null;
    const dir = pkg.packageData.path.replace(/^\/+|\/+$/g, '');
    return dir.length > 0 ? dir : null;
  }, []);

  // File-type color legend on the tour panel. On by default; a header button
  // (shown whenever the tour panel is the right pane — i.e. trails collapsed)
  // toggles it.
  const [showColorLegend, setShowColorLegend] = useState(true);

  // Trails live in a collapsed left-rail section beneath the tours list.
  // Collapsed (default) → the right pane shows the Tour panel (idle city +
  // legend, or an open tour). Expanded → the right pane switches to the Trail
  // explorer and the rail reveals the trail list.
  const [trailsExpanded, setTrailsExpanded] = useState(false);
  const handleToggleTrails = useCallback(() => {
    setTrailsExpanded((open) => {
      const next = !open;
      // Preserve the one-thing-at-a-time invariant: entering trails clears any
      // open tour/file; leaving it clears the selected trail.
      if (next) {
        setSelectedTourId(null);
        setSelectedFilePath(null);
      } else {
        setSelectedTrailId(null);
      }
      return next;
    });
  }, []);

  // Package composition ("Architecture" view). Reuses the warmed package cache,
  // so this adds no extra fetch. When packages exist, the left rail's "Trails"
  // collapsible becomes an Architecture / Trails switch.
  const { packages, loading: packagesLoading } = useRepoPackagesData(
    owner,
    repo,
  );
  // Read file contents for the composition panel's manifest drill-down. Wired
  // to the existing readFile procedure — no new endpoint needed.
  const handleReadFile = useCallback(
    (filePath: string) =>
      trpc.github.readFile
        .query({ owner, repo, path: filePath })
        .then((r) => r.content),
    [owner, repo],
  );

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

  // Warm the About-card metadata the moment the page mounts — behind the
  // loading screen — so RepoOverview has it ready the instant it renders,
  // instead of the two GitHub calls only starting once the card appears.
  useEffect(() => {
    void warmRepoOverview(owner, repo);
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
        // Always land on the idle Tour panel (colored city + file-type legend)
        // and let the visitor open a tour from the list — no auto-open, so the
        // default view is the map rather than a guided tour.
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
    // Invert the index order (slice first so we don't mutate state.entries).
    const ordered = state.entries.slice().reverse();
    if (!q) return ordered;
    return ordered.filter(
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

  // Commit a selected trail was authored against, so the source drawer reads
  // marker files at that point instead of HEAD. Null when no trail is selected
  // (plain file browsing) ⇒ the drawer reads HEAD.
  const selectedAuthoredSha =
    selectedPayload?.repos?.[0]?.authoredAtSha ??
    selectedPayload?.authoredAt?.sha;

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

  // Architecture-panel highlight layers, kept independent of the trail-derived
  // `idleHighlightLayers`. Only the hover *preview* paints now — a transient
  // border around the hovered package's directory subtree. Selection no longer
  // paints a fill: it drives the panel's `idleFocusDirectory` instead (see
  // below), which collapses the idle city onto the subtree with no color over
  // the buildings' normal file-type colors. A single `type: 'directory'` item
  // covers the whole subtree — the renderer honors directory items in the idle
  // path, so there's no need to enumerate `fileTree.allFiles`.
  const packageHighlightLayers = useMemo<HighlightLayer[] | null>(() => {
    if (!hoveredPackagePath || hoveredPackagePath === selectedPackagePath) {
      return null;
    }
    return [
      {
        id: `pkg-hover-${hoveredPackagePath}`,
        name: 'Hovered package',
        enabled: true,
        color: theme.colors.primary,
        borderWidth: 2,
        priority: 100,
        items: [
          {
            path: hoveredPackagePath,
            type: 'directory' as const,
            renderStrategy: 'border' as const,
          },
        ],
        dynamic: true,
      },
    ];
  }, [hoveredPackagePath, selectedPackagePath, theme.colors.primary]);

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
        rootRef={headerRef}
        owner={owner}
        repo={repo}
        exploredStats={exploredStats}
        selectedTour={selectedTour}
        tourProgress={
          selectedTour ? tourGenProgress.get(selectedTour.tour.id) : undefined
        }
        onGenerateTourAudio={handleGenerateTourAudio}
        showColorLegend={showColorLegend}
        onToggleColorLegend={() => setShowColorLegend((s) => !s)}
        trailsExpanded={trailsExpanded}
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
          trailsExpanded={trailsExpanded}
          onToggleTrails={handleToggleTrails}
          packages={packages}
          packagesLoading={packagesLoading}
          onReadFile={handleReadFile}
          onPackageHover={(pkg) =>
            setHoveredPackagePath(packageDirFromLayer(pkg))
          }
          onPackageSelect={(pkg) =>
            setSelectedPackagePath(packageDirFromLayer(pkg))
          }
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
            setFileSide('right');
            setSelectedTrailId(null);
            setSelectedTourId(null);
          }}
          // The README opens the same drawer, but docked on the left.
          onOpenReadmeFile={(path) => {
            setSelectedFilePath(path);
            setFileSide('left');
            setSelectedTrailId(null);
            setSelectedTourId(null);
          }}
          tours={tours}
          toursLoading={toursLoading}
          selectedTourId={selectedTourId}
          onSelectTour={(id) => {
            setSelectedTourId(id);
            if (id) {
              // Opening a tour returns to the tour view — collapse the trails
              // section so the right pane shows the tour, not the explorer.
              setTrailsExpanded(false);
              setSelectedTrailId(null);
              setSelectedFilePath(null);
            }
          }}
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
          packageHighlightLayers={packageHighlightLayers}
          idleFocusDirectory={selectedPackagePath}
          highlightLayersLoading={highlightLayersLoading}
          excludedFolders={excludedDirs.map((d) =>
            d.endsWith('/') ? d.slice(0, -1) : d,
          )}
          showSpatialContext={configMode}
          showColorLegend={showColorLegend}
          trailsExpanded={trailsExpanded}
          currentAuthor={user?.login}
          overlayFilePath={leftViewMode === 'files' ? selectedFilePath : null}
          overlayTrails={selectedFileTrails}
          overlaySelectedTrailId={selectedTrailId}
          onSelectOverlayTrail={(id) => {
            setSelectedTrailId(id);
            setSelectedFilePath(null);
          }}
          onCloseOverlay={() => setSelectedFilePath(null)}
          onOpenFile={(path) => {
            setSelectedFilePath(path);
            setFileSide('right');
          }}
        />
      </div>
      {/* Right-docked source viewer for the picked file. Independent of the
          trail overlay — it just renders whatever file is selected. */}
      <FileSourcePanel
        key={fileSide}
        owner={owner}
        repo={repo}
        filePath={selectedFilePath}
        gitRef={selectedAuthoredSha}
        topOffset={headerHeight}
        side={fileSide}
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

// Pull `owner/repo` out of whatever the user pastes into the header opener — a
// full GitHub URL, a `github.com/owner/repo` fragment, or just `owner/repo`.
function parseGithubRepoPath(
  input: string,
): { owner: string; repo: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const stripped = trimmed
    .replace(/^https?:\/\//i, '')
    .replace(/^github\.com\//i, '')
    .replace(/^\/+/, '');
  const [owner, repoRaw] = stripped.split('/');
  if (!owner || !repoRaw) return null;
  const repo = repoRaw.replace(/\.git$/i, '');
  if (!repo) return null;
  return { owner, repo };
}

// Minimal shape of a repo for the header opener's typeahead — satisfied by both
// `/api/github/search` results and the persisted `recent-repositories` entries.
interface HeaderRepoSearchItem {
  full_name: string;
  name: string;
  owner: { login: string; avatar_url: string };
  description?: string | null;
  stargazers_count?: number;
}

// localStorage key shared with the legacy repo page / RecentRepositoriesPanel
// (written via `addRecentRepository`). Each entry is a full GitHub repo object.
const RECENT_REPOS_KEY = 'recent-repositories';

// Read the persisted recently-visited repos, narrowed to the fields the opener
// needs and tolerant of older/partial entries.
function readRecentRepos(): HeaderRepoSearchItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(RECENT_REPOS_KEY) ?? '[]',
    );
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((it): HeaderRepoSearchItem[] => {
      if (it == null || typeof it !== 'object') return [];
      const o = it as Record<string, unknown>;
      const owner = o.owner as Record<string, unknown> | undefined;
      if (
        typeof o.full_name !== 'string' ||
        !owner ||
        typeof owner.login !== 'string' ||
        typeof owner.avatar_url !== 'string'
      ) {
        return [];
      }
      return [
        {
          full_name: o.full_name,
          name:
            typeof o.name === 'string'
              ? o.name
              : o.full_name.split('/')[1] ?? o.full_name,
          owner: { login: owner.login, avatar_url: owner.avatar_url },
          description: typeof o.description === 'string' ? o.description : null,
          stargazers_count:
            typeof o.stargazers_count === 'number'
              ? o.stargazers_count
              : undefined,
        },
      ];
    });
  } catch {
    return [];
  }
}

const Header: React.FC<{
  rootRef?: React.Ref<HTMLElement>;
  owner: string;
  repo: string;
  exploredStats: { documented: number; total: number } | null;
  // Audio controls for the active tour, surfaced here (not in the tours pane)
  // and only while a tour is selected. Null when no tour is open.
  selectedTour: TourListItem | null;
  tourProgress: TourGenProgress | undefined;
  onGenerateTourAudio: (item: TourListItem) => void;
  // File-type legend toggle for the tour panel; the button renders whenever
  // the tour panel is the right pane (i.e. the trails section is collapsed),
  // since the legend lives on that panel.
  showColorLegend: boolean;
  onToggleColorLegend: () => void;
  /** Trails section expanded → the Trail explorer (no legend) is showing. */
  trailsExpanded: boolean;
}> = ({
  rootRef,
  owner,
  repo,
  exploredStats,
  selectedTour,
  tourProgress,
  onGenerateTourAudio,
  showColorLegend,
  onToggleColorLegend,
  trailsExpanded,
}) => {
  const { theme } = useTheme();
  const router = useRouter();

  // The header "open a repo" control: hitting it collapses the left-hand
  // controls and reveals an inline opener. The opener doubles as a repo search
  // bar — pasting a GitHub link opens it directly, while typing a term shows a
  // GitHub repo-search typeahead. Either way, choosing a repo opens it in-app.
  const [openRepoActive, setOpenRepoActive] = useState(false);
  const [openRepoUrl, setOpenRepoUrl] = useState('');
  const [openRepoError, setOpenRepoError] = useState(false);
  const [openRepoResults, setOpenRepoResults] = useState<HeaderRepoSearchItem[]>(
    [],
  );
  const [openRepoSearching, setOpenRepoSearching] = useState(false);
  const [recentRepos, setRecentRepos] = useState<HeaderRepoSearchItem[]>([]);
  const openRepoInputRef = useRef<HTMLInputElement>(null);

  // A pasted link / `owner/repo` path is opened directly; anything else is a
  // free-text search. Computed each render so the input and submit agree.
  const openRepoDirect = parseGithubRepoPath(openRepoUrl);

  const closeOpenRepo = useCallback(() => {
    setOpenRepoActive(false);
    setOpenRepoUrl('');
    setOpenRepoError(false);
    setOpenRepoResults([]);
    setOpenRepoSearching(false);
  }, []);

  const goToRepo = useCallback(
    (path: string) => {
      closeOpenRepo();
      router.push(`/${path}`);
    },
    [router, closeOpenRepo],
  );

  const submitOpenRepo = useCallback(() => {
    const parsed = parseGithubRepoPath(openRepoUrl);
    if (parsed) {
      goToRepo(`${parsed.owner}/${parsed.repo}`);
      return;
    }
    // No direct path — fall back to the top search result, if any.
    if (openRepoResults[0]) {
      goToRepo(openRepoResults[0].full_name);
      return;
    }
    setOpenRepoError(true);
  }, [openRepoUrl, openRepoResults, goToRepo]);

  // Focus the input as it reveals, and load recent repos (minus the one we're
  // already on) to show before the user types.
  useEffect(() => {
    if (!openRepoActive) return;
    openRepoInputRef.current?.focus();
    const current = `${owner}/${repo}`.toLowerCase();
    setRecentRepos(
      readRecentRepos()
        .filter((r) => r.full_name.toLowerCase() !== current)
        .slice(0, 6),
    );
  }, [openRepoActive, owner, repo]);

  // Debounced GitHub repo search, skipped when the text is already a direct
  // link/path. Aborts in-flight requests so stale responses can't land.
  useEffect(() => {
    if (!openRepoActive) return;
    const q = openRepoUrl.trim();
    if (!q || parseGithubRepoPath(q)) {
      setOpenRepoResults([]);
      setOpenRepoSearching(false);
      return;
    }
    setOpenRepoSearching(true);
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/github/search?q=${encodeURIComponent(q)}&per_page=8`,
          { signal: ctrl.signal },
        );
        if (!res.ok) throw new Error('search failed');
        const data = await res.json();
        setOpenRepoResults(
          Array.isArray(data.items)
            ? (data.items as HeaderRepoSearchItem[]).slice(0, 8)
            : [],
        );
      } catch {
        if (!ctrl.signal.aborted) setOpenRepoResults([]);
      } finally {
        if (!ctrl.signal.aborted) setOpenRepoSearching(false);
      }
    }, 300);
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [openRepoUrl, openRepoActive]);

  // One result row, shared by the search results and the recent-repos list.
  const renderRepoRow = (r: HeaderRepoSearchItem) => (
    <button
      key={r.full_name}
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => goToRepo(r.full_name)}
      className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:opacity-90"
      style={{ color: theme.colors.text }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`${r.owner.avatar_url}${
          r.owner.avatar_url.includes('?') ? '&' : '?'
        }s=56`}
        alt=""
        width={28}
        height={28}
        className="rounded-md shrink-0"
        style={{ background: theme.colors.backgroundSecondary }}
      />
      <div className="min-w-0 flex-1">
        <div
          className="truncate"
          style={{
            fontSize: theme.fontSizes[2],
            fontWeight: theme.fontWeights.semibold,
          }}
        >
          {r.name}
        </div>
        <div
          className="truncate"
          style={{
            fontSize: theme.fontSizes[1],
            color: theme.colors.textMuted,
          }}
        >
          {r.owner.login}
        </div>
      </div>
      {typeof r.stargazers_count === 'number' && (
        <span
          className="flex items-center gap-1 shrink-0"
          style={{
            color: theme.colors.textMuted,
            fontSize: theme.fontSizes[1],
          }}
        >
          <Star className="w-3.5 h-3.5" />
          {r.stargazers_count.toLocaleString()}
        </span>
      )}
    </button>
  );

  // Small uppercase section label inside the dropdown.
  const dropdownLabel = (text: string) => (
    <div
      className="px-3.5 pt-2.5 pb-1"
      style={{
        fontSize: theme.fontSizes[0],
        fontWeight: theme.fontWeights.semibold,
        color: theme.colors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
      }}
    >
      {text}
    </div>
  );

  const showOpener = openRepoUrl.trim().length > 0;
  const showRecents = !showOpener && recentRepos.length > 0;

  return (
    <header
      ref={rootRef}
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
          href={`/${owner}`}
          className="transition-opacity hover:opacity-80 truncate"
          style={{
            fontFamily: theme.fonts.body,
            fontSize: theme.fontSizes[2],
            fontWeight: theme.fontWeights.semibold,
            color: theme.colors.text,
            textDecoration: 'none',
          }}
        >
          {owner}
        </Link>
      </div>

      <Link
        href={`/${owner}`}
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
          {owner}
        </span>
      </Link>

      {trailsExpanded && exploredStats && (
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
        {/* Swap region: the left-hand controls collapse out and the GitHub-link
            opener input fades in over their space when the opener is active. The
            GitHub button itself (below) stays put and shows as selected. */}
        <div className="relative flex items-center gap-2">
          <div
            className={`flex items-center gap-2 transition-opacity duration-200 ${
              openRepoActive ? 'opacity-0 pointer-events-none' : 'opacity-100'
            }`}
          >
            {selectedTour && (
              <TourAudioControl
                status={selectedTour.audioStatus}
                progress={tourProgress}
                onGenerate={() => onGenerateTourAudio(selectedTour)}
              />
            )}
            {!trailsExpanded && (
              <button
                type="button"
                onClick={onToggleColorLegend}
                aria-pressed={showColorLegend}
                className="hidden md:flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80"
                style={{
                  color: showColorLegend
                    ? theme.colors.primary
                    : theme.colors.textMuted,
                }}
                title={
                  showColorLegend
                    ? 'Hide file-type legend'
                    : 'Show file-type legend'
                }
                aria-label={
                  showColorLegend
                    ? 'Hide file-type legend'
                    : 'Show file-type legend'
                }
              >
                <Palette className="w-5 h-5" />
              </button>
            )}
            <Link
              href={`/legacy/${owner}/${repo}`}
              className="hidden md:flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80"
              style={{ color: theme.colors.text }}
              title="Open legacy view"
              aria-label="Open legacy view"
            >
              <History className="w-5 h-5" />
            </Link>
            <div className="hidden md:flex">
              <AgentViewButton path={`/${owner}/${repo}`} iconOnly />
            </div>
          </div>

          {/* Opener input — anchored to the right of the swap region (just left
              of the GitHub button) and fading in over the collapsed controls. */}
          <div
            className={`absolute inset-y-0 right-0 hidden md:flex items-center justify-end transition-opacity duration-200 ${
              openRepoActive ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            <div className="relative">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submitOpenRepo();
                }}
                className="flex items-center gap-2 h-8 pl-2.5 pr-1 rounded-md"
                style={{
                  background: theme.colors.background,
                  border: `1px solid ${
                    openRepoError
                      ? theme.colors.error ?? theme.colors.border
                      : theme.colors.border
                  }`,
                }}
              >
                <Search
                  className="w-4 h-4 shrink-0"
                  style={{ color: theme.colors.textMuted }}
                />
                <input
                  ref={openRepoInputRef}
                  value={openRepoUrl}
                  onChange={(e) => {
                    setOpenRepoUrl(e.target.value);
                    if (openRepoError) setOpenRepoError(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') closeOpenRepo();
                  }}
                  placeholder="Search repos or paste a link…"
                  aria-label="Search repositories or paste a GitHub link"
                  className="bg-transparent outline-none w-56"
                  style={{
                    color: theme.colors.text,
                    fontSize: theme.fontSizes[1],
                  }}
                />
                <button
                  type="submit"
                  className="flex items-center justify-center w-6 h-6 rounded transition-all hover:opacity-80"
                  style={{ color: theme.colors.primary }}
                  title="Open repo"
                  aria-label="Open repo"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </form>

              {/* Dropdown: recent repos before the user types, then a
                  direct-open hint for links / GitHub repo-search results. */}
              {openRepoActive && (showOpener || showRecents) && (
                <div
                  className="absolute top-full right-0 mt-1.5 w-96 max-w-[80vw] rounded-lg overflow-hidden z-[1000]"
                  style={{
                    background: theme.colors.surface,
                    border: `1px solid ${theme.colors.border}`,
                    boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
                  }}
                >
                  {!showOpener ? (
                    <div className="max-h-96 overflow-y-auto pb-1">
                      {dropdownLabel('Recent')}
                      {recentRepos.map(renderRepoRow)}
                    </div>
                  ) : openRepoDirect ? (
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() =>
                        goToRepo(
                          `${openRepoDirect.owner}/${openRepoDirect.repo}`,
                        )
                      }
                      className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left transition-colors hover:opacity-80"
                      style={{ color: theme.colors.text }}
                    >
                      <Github
                        className="w-5 h-5 shrink-0"
                        style={{ color: theme.colors.textMuted }}
                      />
                      <span
                        className="truncate"
                        style={{ fontSize: theme.fontSizes[2] }}
                      >
                        Open {openRepoDirect.owner}/{openRepoDirect.repo}
                      </span>
                      <ChevronRight
                        className="w-5 h-5 ml-auto shrink-0"
                        style={{ color: theme.colors.textMuted }}
                      />
                    </button>
                  ) : openRepoSearching ? (
                    <div
                      className="flex items-center gap-2.5 px-3.5 py-3.5"
                      style={{
                        color: theme.colors.textMuted,
                        fontSize: theme.fontSizes[2],
                      }}
                    >
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Searching…
                    </div>
                  ) : openRepoResults.length > 0 ? (
                    <div className="max-h-96 overflow-y-auto">
                      {openRepoResults.map(renderRepoRow)}
                    </div>
                  ) : (
                    <div
                      className="px-3.5 py-3.5"
                      style={{
                        color: theme.colors.textMuted,
                        fontSize: theme.fontSizes[2],
                      }}
                    >
                      No repositories found
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* GitHub opener trigger — stays in place and toggles the opener,
            showing as selected while it is open. */}
        <button
          type="button"
          onClick={() =>
            openRepoActive ? closeOpenRepo() : setOpenRepoActive(true)
          }
          aria-pressed={openRepoActive}
          className="hidden md:flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80"
          style={{
            color: openRepoActive ? theme.colors.primary : theme.colors.text,
            background: openRepoActive
              ? `color-mix(in srgb, ${theme.colors.primary} 15%, transparent)`
              : 'transparent',
          }}
          title="Open a repo from a GitHub link"
          aria-label="Open a repo from a GitHub link"
        >
          <Github className="w-5 h-5" />
        </button>

        <UserAvatarMenu />
      </div>
    </header>
  );
};

// ---------------------------------------------------------------------------
// Trail list pane (left)
// ---------------------------------------------------------------------------

// One tab of the Architecture / Trails segmented switch that replaces the plain
// "Trails" collapsible when a repo has package composition data.
const CompositionSwitchTab: React.FC<{
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}> = ({ active, onClick, label, icon, count }) => {
  const { theme } = useTheme();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="flex-1 px-4 py-2 flex items-center justify-center gap-1.5 transition-opacity hover:opacity-80"
      style={{
        background: 'transparent',
        color: active ? theme.colors.primary : theme.colors.textSecondary,
        fontSize: theme.fontSizes[0],
        fontWeight: theme.fontWeights.semibold,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        borderBottom: `2px solid ${active ? theme.colors.primary : 'transparent'}`,
      }}
    >
      {icon}
      <span>{label}</span>
      {typeof count === 'number' && (
        <span
          style={{
            color: theme.colors.textMuted,
            fontWeight: theme.fontWeights.medium,
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
};

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
  /** Collapsed trails section: expanded reveals the trail list and switches
   *  the right pane to the Trail explorer. */
  trailsExpanded: boolean;
  onToggleTrails: () => void;
  /** Detected packages — when non-empty, the Trails section header becomes an
   *  Architecture / Trails switch and the composition panel is available. */
  packages: PackageLayer[];
  packagesLoading: boolean;
  onReadFile: (filePath: string) => Promise<string>;
  /** Composition-panel hover/select → file-city directory highlight. */
  onPackageHover: (pkg: PackageLayer | null) => void;
  onPackageSelect: (pkg: PackageLayer | null) => void;
  configMode: boolean;
  onToggleConfigMode: () => void;
  leftViewMode: 'trails' | 'files' | 'tours';
  onSetViewMode: (mode: 'trails' | 'files' | 'tours') => void;
  trailFileRows: { path: string; trailCount: number }[];
  selectedFilePath: string | null;
  onSelectFile: (path: string | null) => void;
  // Opens the repo-root README in the source drawer (docked on the left).
  onOpenReadmeFile: (path: string) => void;
  tours: TourListItem[];
  toursLoading: boolean;
  selectedTourId: string | null;
  onSelectTour: (id: string | null) => void;
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
  trailsExpanded,
  onToggleTrails,
  packages,
  packagesLoading,
  onReadFile,
  onPackageHover,
  onPackageSelect,
  configMode,
  onToggleConfigMode,
  leftViewMode,
  onSetViewMode,
  trailFileRows,
  selectedFilePath,
  onSelectFile,
  onOpenReadmeFile,
  tours,
  toursLoading,
  selectedTourId,
  onSelectTour,
  onRequestDeleteTour,
  dirPaths,
  filePaths,
  excludedDirs,
  onExcludedDirsChange,
}) => {
  const { theme } = useTheme();
  const hasPackages = packages.length > 0;
  // Repo-root README (if any), surfaced as a button in the About overview.
  const readmePath = useMemo(() => findReadmePath(filePaths), [filePaths]);
  // Architecture tab open-state. Kept mutually exclusive with `trailsExpanded`
  // (which is parent-owned and also drives the right pane) so only one of the
  // two sections is open at a time.
  const [archExpanded, setArchExpanded] = useState(false);
  // Open Architecture by default the first time packages land (so the rail
  // isn't sitting on nothing). One-shot: once applied we never re-open it, so
  // closing it or switching to Trails sticks.
  const archDefaultApplied = useRef(false);
  useEffect(() => {
    if (hasPackages && !archDefaultApplied.current && !trailsExpanded) {
      archDefaultApplied.current = true;
      setArchExpanded(true);
    }
  }, [hasPackages, trailsExpanded]);
  const handleSelectArchitecture = useCallback(() => {
    setArchExpanded((open) => {
      // Opening Architecture collapses the Trails list (parent state).
      if (!open && trailsExpanded) onToggleTrails();
      return !open;
    });
  }, [trailsExpanded, onToggleTrails]);
  const handleSelectTrails = useCallback(() => {
    // Opening Trails collapses Architecture.
    if (!trailsExpanded) setArchExpanded(false);
    onToggleTrails();
  }, [trailsExpanded, onToggleTrails]);

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
          viewerUserId={viewerUserId}
          viewerIsRepoAdmin={viewerIsRepoAdmin}
          onRequestDelete={onRequestDeleteTour}
          readmePath={readmePath}
          onOpenReadme={() => {
            if (readmePath) onOpenReadmeFile(readmePath);
          }}
          trailsSection={
            entries.length > 0 || hasPackages ? (
              <div
                className="flex-1 min-h-0 flex flex-col"
                onMouseLeave={() => onHover(null)}
              >
                {hasPackages ? (
                  /* With package data, the single "Trails" collapsible becomes a
                     two-tab Architecture / Trails switch. Opening one collapses
                     the other (Trails still drives the right-pane explorer via
                     the parent's onToggleTrails). Sticky so it stays pinned. */
                  <div
                    className="flex items-stretch border-b sticky top-0 z-10 shrink-0"
                    style={{
                      borderColor: theme.colors.border,
                      background: theme.colors.background,
                    }}
                  >
                    <CompositionSwitchTab
                      active={archExpanded}
                      onClick={handleSelectArchitecture}
                      icon={<Boxes size={14} />}
                      label="Structure"
                    />
                    <CompositionSwitchTab
                      active={trailsExpanded}
                      onClick={handleSelectTrails}
                      icon={<Footprints size={14} />}
                      label="Trails"
                      count={entries.length}
                    />
                  </div>
                ) : (
                  /* Collapsible header: click to expand the trail list, which
                     also switches the right pane to the Trail explorer (the
                     parent's onToggleTrails drives `trailsExpanded`). Sticky so
                     it stays pinned while the rows scroll under it. */
                  <button
                    type="button"
                    onClick={onToggleTrails}
                    aria-expanded={trailsExpanded}
                    className="w-full px-4 py-2 border-b sticky top-0 z-10 shrink-0 flex items-center gap-2 transition-opacity hover:opacity-80"
                    style={{
                      borderColor: theme.colors.border,
                      background: theme.colors.background,
                    }}
                  >
                    {trailsExpanded ? (
                      <ChevronDown
                        size={14}
                        style={{ color: theme.colors.textSecondary }}
                      />
                    ) : (
                      <ChevronRight
                        size={14}
                        style={{ color: theme.colors.textSecondary }}
                      />
                    )}
                    <Footprints
                      size={14}
                      style={{ color: theme.colors.textSecondary }}
                    />
                    <span
                      style={{
                        fontSize: theme.fontSizes[0],
                        fontWeight: theme.fontWeights.semibold,
                        color: theme.colors.textSecondary,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}
                    >
                      Trails
                    </span>
                    <span
                      style={{
                        fontSize: theme.fontSizes[0],
                        color: theme.colors.textMuted,
                      }}
                    >
                      {entries.length}
                    </span>
                  </button>
                )}
                {archExpanded && hasPackages && (
                  <div
                    className="border-b flex-1 min-h-0 overflow-hidden"
                    style={{ borderColor: theme.colors.border }}
                  >
                    <PackageCompositionPanelContent
                      packages={packages}
                      isLoading={packagesLoading}
                      readFile={onReadFile}
                      onPackageHover={onPackageHover}
                      onPackageSelect={onPackageSelect}
                    />
                  </div>
                )}
                {trailsExpanded && (
                  <div className="flex-1 min-h-0 overflow-y-auto">
                    {filteredEntries.map((entry) => (
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
                          String(entry.createdBy?.githubId) ===
                            String(viewerUserId))
                      }
                      onDelete={() => onRequestDeleteTrail(entry)}
                    />
                    ))}
                  </div>
                )}
              </div>
            ) : null
          }
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

// Resolve a GitHub login to its display name on demand. Trail index entries
// only carry the login (the handle); the display name comes from the public
// user-profile endpoint. Results are cached at module scope (and in-flight
// requests deduped) so a list of trails by the same author makes one request.
const displayNameCache = new Map<string, string | null>();
const displayNameInflight = new Map<string, Promise<string | null>>();

function useGithubDisplayName(login: string | null | undefined): string | null {
  const [name, setName] = useState<string | null>(() =>
    login ? displayNameCache.get(login) ?? null : null,
  );

  useEffect(() => {
    if (!login) {
      setName(null);
      return;
    }
    if (displayNameCache.has(login)) {
      setName(displayNameCache.get(login) ?? null);
      return;
    }

    let cancelled = false;
    let request = displayNameInflight.get(login);
    if (!request) {
      request = fetch(`/api/github/user-profile/${encodeURIComponent(login)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { name?: string | null } | null) => {
          const resolved = data?.name?.trim() || null;
          displayNameCache.set(login, resolved);
          displayNameInflight.delete(login);
          return resolved;
        })
        .catch(() => {
          displayNameCache.set(login, null);
          displayNameInflight.delete(login);
          return null;
        });
      displayNameInflight.set(login, request);
    }
    request.then((resolved) => {
      if (!cancelled) setName(resolved);
    });

    return () => {
      cancelled = true;
    };
  }, [login]);

  return name;
}

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
  const displayName = useGithubDisplayName(author?.githubLogin);

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
              <span className="truncate">{displayName || author.githubLogin}</span>
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

// No tours yet: instead of inline instructions, lead with a single CTA that
// mirrors the "Start tour" button and opens a modal explaining how to author
// and publish one. Keeps the empty pane clean while the how-to is a click away.
const ToursEmptyState: React.FC = () => {
  const { theme } = useTheme();
  const [showAuthorModal, setShowAuthorModal] = useState(false);
  return (
    <>
      {/* border-b mirrors SingleTourCta: the overview above renders borderless,
          so the CTA carries the card's dividing line at its bottom edge. */}
      <div
        className="px-4 py-3 border-b"
        style={{ borderColor: theme.colors.border }}
      >
        <button
          type="button"
          onClick={() => setShowAuthorModal(true)}
          className="w-full inline-flex items-center justify-center gap-2 rounded-md transition-opacity hover:opacity-90"
          style={{
            padding: '10px 14px',
            fontFamily: theme.fonts.body,
            fontSize: theme.fontSizes[1],
            fontWeight: theme.fontWeights.semibold,
            cursor: 'pointer',
            background: theme.colors.primary,
            color: '#ffffff',
            border: `1px solid ${theme.colors.primary}`,
          }}
        >
          <Compass size={16} />
          Create a tour
        </button>
      </div>
      {showAuthorModal && (
        <TourAuthorModal onClose={() => setShowAuthorModal(false)} />
      )}
    </>
  );
};

// Modal walking an author through creating + publishing a tour. Rendered to a
// portal so it floats above the panel. Dismissed by the backdrop, the ×, or Esc.
const TourAuthorModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  const eyebrow: React.CSSProperties = {
    fontSize: theme.fontSizes[0],
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  };
  const bodyText: React.CSSProperties = {
    margin: 0,
    color: theme.colors.text,
    fontSize: theme.fontSizes[1],
    lineHeight: 1.5,
  };

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'rgba(0,0,0,0.45)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 460,
          borderRadius: 12,
          border: `1px solid ${theme.colors.border}`,
          background: theme.colors.surface ?? theme.colors.background,
          boxShadow: '0 16px 48px rgba(0,0,0,0.45)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: '14px 16px',
            borderBottom: `1px solid ${theme.colors.border}`,
          }}
        >
          <span
            style={{
              fontFamily: theme.fonts.body,
              fontSize: theme.fontSizes[2],
              fontWeight: theme.fontWeights.bold,
              color: theme.colors.text,
            }}
          >
            Author a tour
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="transition-opacity hover:opacity-80"
            style={{
              background: 'transparent',
              color: theme.colors.textMuted,
              cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-4" style={{ padding: 16 }}>
          <p style={bodyText}>
            No tour has been authored for this repository yet. A tour is a guided
            walkthrough that lives as a <code>.tour.json</code> file in the repo
            — a sequence of steps pinned to files and lines that visitors can
            play through.
          </p>

          <div className="flex flex-col gap-2">
            <span style={eyebrow}>1 · Scaffold</span>
            <p style={bodyText}>
              Use the file-city-tours skill, or scaffold a starter from the CLI:
            </p>
            <button
              type="button"
              onClick={copyCommand}
              title="Click to copy"
              className="font-mono px-2 py-1.5 rounded text-left transition-opacity hover:opacity-80"
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

          <div className="flex flex-col gap-2">
            <span style={eyebrow}>2 · Publish</span>
            <p style={bodyText}>
              Once it&apos;s authored and validated, publish it with the same
              skill — published tours show up here on the repo page for everyone.
            </p>
          </div>

          <a
            href={TOUR_SKILL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md font-medium transition-opacity hover:opacity-80"
            style={{
              background: `color-mix(in srgb, ${theme.colors.primary} 18%, transparent)`,
              border: `1px solid color-mix(in srgb, ${theme.colors.primary} 50%, transparent)`,
              color: theme.colors.primary,
            }}
          >
            Open the file-city-tours skill →
          </a>
        </div>
      </div>
    </div>,
    document.body,
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
// Repo overview data — the GitHub metadata behind the About card. The two
// calls are cached and warmed separately (warmRepoOverview, fired the moment
// the page mounts, behind the loading screen) so the data is ready by the time
// RepoOverview renders — instead of only starting once the card appears.
//
// Crucially the two are kept INDEPENDENT: getRepoInfo is a single fast call,
// while getRepoPackages walks the git tree and reads every manifest, so it can
// be much slower. They resolve into separate caches and update the card on
// their own, so the description shows the instant it lands rather than waiting
// on the package scan. Both best-effort; a failure is left uncached so a later
// visit retries. Keyed by `${owner}/${repo}`.
// ---------------------------------------------------------------------------

type RepoOverviewInfo = Awaited<
  ReturnType<typeof trpc.github.getRepoInfo.query>
>;
type RepoOverviewPkgFull = Awaited<
  ReturnType<typeof trpc.github.getRepoPackages.query>
>;
type RepoContributors = Awaited<
  ReturnType<typeof trpc.github.getRepoContributors.query>
>;
type RepoContributor = RepoContributors['contributors'][number];

const repoInfoCache = new Map<string, RepoOverviewInfo>();
const repoInfoInflight = new Map<string, Promise<RepoOverviewInfo | null>>();
// Cache the FULL package result (packages + summary), not just the summary —
// the overview only reads `.summary`, but the Architecture view needs the full
// `packages` array. Sharing one cache means the slow git-tree walk runs once.
const repoPkgCache = new Map<string, RepoOverviewPkgFull>();
const repoPkgInflight = new Map<string, Promise<RepoOverviewPkgFull | null>>();
const repoContributorsCache = new Map<string, RepoContributors>();
const repoContributorsInflight = new Map<
  string,
  Promise<RepoContributors | null>
>();

function fetchRepoInfo(
  owner: string,
  repo: string,
): Promise<RepoOverviewInfo | null> {
  const key = `${owner}/${repo}`;
  const cached = repoInfoCache.get(key);
  if (cached) return Promise.resolve(cached);
  const inflight = repoInfoInflight.get(key);
  if (inflight) return inflight;
  const run = trpc.github.getRepoInfo
    .query({ owner, repo })
    .then((d) => {
      repoInfoCache.set(key, d);
      repoInfoInflight.delete(key);
      // Record the visit so the header opener (and the recent-repos panel) can
      // surface it later. Best-effort: never let a storage error break the page.
      try {
        addRecentRepository(d as unknown as Parameters<typeof addRecentRepository>[0]);
      } catch {
        // ignore
      }
      return d;
    })
    .catch(() => {
      // Best-effort — leave uncached so a later visit retries.
      repoInfoInflight.delete(key);
      return null;
    });
  repoInfoInflight.set(key, run);
  return run;
}

function fetchRepoPkg(
  owner: string,
  repo: string,
): Promise<RepoOverviewPkgFull | null> {
  const key = `${owner}/${repo}`;
  const cached = repoPkgCache.get(key);
  if (cached) return Promise.resolve(cached);
  const inflight = repoPkgInflight.get(key);
  if (inflight) return inflight;
  const run = trpc.github.getRepoPackages
    .query({ owner, repo })
    .then((d) => {
      repoPkgCache.set(key, d);
      repoPkgInflight.delete(key);
      return d;
    })
    .catch(() => {
      // Best-effort — leave uncached so a later visit retries.
      repoPkgInflight.delete(key);
      return null;
    });
  repoPkgInflight.set(key, run);
  return run;
}

function fetchRepoContributors(
  owner: string,
  repo: string,
): Promise<RepoContributors | null> {
  const key = `${owner}/${repo}`;
  const cached = repoContributorsCache.get(key);
  if (cached) return Promise.resolve(cached);
  const inflight = repoContributorsInflight.get(key);
  if (inflight) return inflight;
  const run = trpc.github.getRepoContributors
    .query({ owner, repo })
    .then((d) => {
      repoContributorsCache.set(key, d);
      repoContributorsInflight.delete(key);
      return d;
    })
    .catch(() => {
      // Best-effort — leave uncached so a later visit retries.
      repoContributorsInflight.delete(key);
      return null;
    });
  repoContributorsInflight.set(key, run);
  return run;
}

function warmRepoOverview(owner: string, repo: string): void {
  void fetchRepoInfo(owner, repo);
  void fetchRepoPkg(owner, repo);
  void fetchRepoContributors(owner, repo);
}

// Per-user activity + extended profile for the contributor modal's detail pane,
// served by the existing GraphQL-backed /activity route. Keyed by login and
// lazy — only fetched when a contributor is actually selected, then cached for
// the rest of the session.
const userActivityCache = new Map<string, UserActivityResponse>();
const userActivityInflight = new Map<
  string,
  Promise<UserActivityResponse | null>
>();

function fetchUserActivity(login: string): Promise<UserActivityResponse | null> {
  const cached = userActivityCache.get(login);
  if (cached) return Promise.resolve(cached);
  const inflight = userActivityInflight.get(login);
  if (inflight) return inflight;
  const run = fetch(
    // 365 days of calendar for the heatmap; activityDays=1 keeps the recent-
    // events half of the query cheap since the detail pane doesn't use it.
    `/api/github/user/${encodeURIComponent(login)}/activity?contributionDays=365&activityDays=1`,
  )
    .then((r) => (r.ok ? (r.json() as Promise<UserActivityResponse>) : null))
    .then((d) => {
      if (d) userActivityCache.set(login, d);
      userActivityInflight.delete(login);
      return d;
    })
    .catch(() => {
      userActivityInflight.delete(login);
      return null;
    });
  userActivityInflight.set(login, run);
  return run;
}

function useUserActivity(login: string | null): {
  data: UserActivityResponse | null;
  loading: boolean;
} {
  const [data, setData] = useState<UserActivityResponse | null>(() =>
    login ? userActivityCache.get(login) ?? null : null,
  );
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!login) {
      setData(null);
      setLoading(false);
      return;
    }
    const cached = userActivityCache.get(login) ?? null;
    setData(cached);
    setLoading(!cached);
    let cancelled = false;
    void fetchUserActivity(login).then((d) => {
      if (cancelled) return;
      setData(d);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [login]);
  return { data, loading };
}

function useRepoOverviewData(
  owner: string,
  repo: string,
): { info: RepoOverviewInfo | null } {
  const key = `${owner}/${repo}`;
  const [info, setInfo] = useState<RepoOverviewInfo | null>(
    () => repoInfoCache.get(key) ?? null,
  );
  useEffect(() => {
    let cancelled = false;
    setInfo(repoInfoCache.get(key) ?? null);
    void fetchRepoInfo(owner, repo).then((d) => {
      if (!cancelled && d) setInfo(d);
    });
    return () => {
      cancelled = true;
    };
  }, [owner, repo, key]);
  return { info };
}

// Contributors for the overview's avatar row + "all contributors" modal. Reads
// the same cache warmed at page mount; resolves independently of the core
// metadata so a slow contributors call never holds back the rest of the card.
function useRepoContributorsData(
  owner: string,
  repo: string,
): RepoContributors | null {
  const key = `${owner}/${repo}`;
  const [data, setData] = useState<RepoContributors | null>(
    () => repoContributorsCache.get(key) ?? null,
  );
  useEffect(() => {
    let cancelled = false;
    setData(repoContributorsCache.get(key) ?? null);
    void fetchRepoContributors(owner, repo).then((d) => {
      if (!cancelled && d) setData(d);
    });
    return () => {
      cancelled = true;
    };
  }, [owner, repo, key]);
  return data;
}

// Full package layers for the Architecture (composition) view. Reuses the same
// warmed cache as the overview above, so reading the full `packages` here does
// not trigger a second git-tree walk. `loading` is true only until the first
// result lands (or is already cached).
function useRepoPackagesData(
  owner: string,
  repo: string,
): { packages: PackageLayer[]; loading: boolean } {
  const key = `${owner}/${repo}`;
  const [full, setFull] = useState<RepoOverviewPkgFull | null>(
    () => repoPkgCache.get(key) ?? null,
  );
  const [loading, setLoading] = useState<boolean>(() => !repoPkgCache.get(key));
  useEffect(() => {
    let cancelled = false;
    const cached = repoPkgCache.get(key) ?? null;
    setFull(cached);
    setLoading(!cached);
    void fetchRepoPkg(owner, repo).then((d) => {
      if (cancelled) return;
      if (d) setFull(d);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [owner, repo, key]);
  return { packages: full?.packages ?? [], loading };
}

// ---------------------------------------------------------------------------
// Repo overview — a compact, no-AI dossier shown atop the Tours pane. Composes
// the repo's own GitHub metadata (description, language, license, stars,
// topics, fork-of, last push). Everything here is best-effort: each fetch is
// independent, and a failure just drops its row rather than blocking the tours
// list. The procedure is heavily cached server-side.
// ---------------------------------------------------------------------------

// Pick the repo-root README so the About card can offer to open it. GitHub
// treats the root README as the canonical one, so we only look at top-level
// files (no slash in the path) and prefer markdown variants.
function findReadmePath(filePaths: string[]): string | null {
  const roots = filePaths.filter((p) => !p.includes('/') && /^readme(\.|$)/i.test(p));
  if (roots.length === 0) return null;
  return (
    roots.find((p) => /\.md$/i.test(p)) ??
    roots.find((p) => /\.markdown$/i.test(p)) ??
    roots[0] ??
    null
  );
}

const RepoOverview: React.FC<{
  owner: string;
  repo: string;
  // When false, drop the bottom divider so a caller can group the overview with
  // a control rendered directly beneath it (e.g. the single-tour "Start tour"
  // CTA) inside one card, with the dividing line carried below that control.
  showBorder?: boolean;
  // Repo-root README path (e.g. "README.md"), or null when the repo has none.
  // When set (with onOpenReadme), the card shows a button that opens it as a
  // file in the right-docked source panel.
  readmePath?: string | null;
  onOpenReadme?: () => void;
}> = ({ owner, repo, showBorder = true, readmePath = null, onOpenReadme }) => {
  const { theme } = useTheme();
  // Read from the shared cache, warmed at page mount (see warmRepoOverview), so
  // the metadata is typically ready the instant this card first renders.
  const { info } = useRepoOverviewData(owner, repo);
  const contributors = useRepoContributorsData(owner, repo);
  // Whether the "all contributors" modal (opened from the +N overflow chip) is
  // showing.
  const [showAllContributors, setShowAllContributors] = useState(false);

  // Nothing until the core metadata lands — keeps the pane from flashing a
  // half-built header. The tours list renders regardless (below this).
  if (!info) return null;

  // Avatar row: the 4 top contributors get a face; everyone else collapses into
  // a "+N" chip that opens the modal.
  const people = contributors?.contributors ?? [];
  const AVATAR_LIMIT = 4;
  const shownPeople = people.slice(0, AVATAR_LIMIT);
  const overflowPeople = people.slice(AVATAR_LIMIT);
  const overflowLabel = `+${overflowPeople.length}${
    contributors?.truncated ? '+' : ''
  }`;

  const license =
    info.license?.spdx_id && info.license.spdx_id !== 'NOASSERTION'
      ? info.license.spdx_id
      : null;

  return (
    <div
      className={`px-4 py-3 flex flex-col gap-2${showBorder ? ' border-b' : ''}`}
      style={{ borderColor: theme.colors.border }}
    >
      {/* Repo name leads the card (with the license badge); the header carries
          the owner. */}
      <div className="flex items-center justify-between gap-2">
        <h1
          className="min-w-0"
          style={{
            margin: 0,
            fontFamily: theme.fonts.body,
            fontSize: theme.fontSizes[4],
            fontWeight: theme.fontWeights.bold,
            color: theme.colors.text,
            lineHeight: 1.2,
            wordBreak: 'break-word',
          }}
        >
          {repo}
        </h1>
        <div className="flex items-center gap-2 shrink-0">
          {license && (
            <span
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
          <a
            href={`https://github.com/${owner}/${repo}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center w-7 h-7 rounded-md transition-all hover:opacity-80"
            style={{ color: theme.colors.textSecondary }}
            title={`Open ${owner}/${repo} on GitHub`}
            aria-label={`Open ${owner}/${repo} on GitHub`}
          >
            <Github className="w-4 h-4" />
          </a>
        </div>
      </div>
      {info.description ? (
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
      ) : (
        <>
          <p
            style={{
              margin: 0,
              color: theme.colors.textMuted,
              fontSize: theme.fontSizes[1],
              lineHeight: 1.4,
              fontStyle: 'italic',
            }}
          >
            No description for {owner}/{repo}.
          </p>
          <a
            href={`https://github.com/${owner}/${repo}`}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-opacity hover:opacity-80"
            style={{ color: theme.colors.primary, fontSize: theme.fontSizes[1] }}
          >
            Update on GitHub
          </a>
        </>
      )}

      {/* README shortcut: opens the repo-root README as a file in the source
          panel. Only shown when the repo actually has one. */}
      {readmePath && onOpenReadme && (
        <button
          type="button"
          onClick={onOpenReadme}
          className="inline-flex items-center gap-1.5 self-start rounded transition-colors hover:opacity-80"
          style={{
            padding: '4px 10px',
            fontSize: theme.fontSizes[1],
            fontWeight: theme.fontWeights.medium,
            color: theme.colors.textSecondary,
            background: `color-mix(in srgb, ${theme.colors.text} 8%, transparent)`,
            border: `1px solid ${theme.colors.border}`,
          }}
          title={`Open ${readmePath}`}
        >
          <FileText size={14} className="shrink-0" />
          README
        </button>
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

      {/* Contributor faces: top few link straight to GitHub, the rest collapse
          into a chip that opens the full list. */}
      {shownPeople.length > 0 && (
        <div className="flex items-center gap-1.5 mt-0.5">
          {shownPeople.map((c) => (
            <a
              key={c.id}
              href={c.html_url}
              target="_blank"
              rel="noopener noreferrer"
              title={`${c.login} · ${c.contributions.toLocaleString()} commits`}
              className="rounded-full transition-transform hover:scale-110"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${c.avatar_url}${c.avatar_url.includes('?') ? '&' : '?'}s=64`}
                alt={c.login}
                width={32}
                height={32}
                className="rounded-full block"
                style={{ background: theme.colors.backgroundSecondary }}
              />
            </a>
          ))}
          {overflowPeople.length > 0 && (
            <button
              type="button"
              onClick={() => setShowAllContributors(true)}
              className="rounded-full transition-colors"
              style={{
                height: 32,
                padding: '0 10px',
                fontSize: theme.fontSizes[0],
                fontWeight: theme.fontWeights.medium,
                color: theme.colors.textSecondary,
                background: `color-mix(in srgb, ${theme.colors.text} 8%, transparent)`,
                border: `1px solid ${theme.colors.border}`,
              }}
              title="See all contributors"
            >
              {overflowLabel}
            </button>
          )}
        </div>
      )}

      {showAllContributors && (
        <ContributorsModal
          owner={owner}
          repo={repo}
          contributors={people}
          truncated={contributors?.truncated ?? false}
          onClose={() => setShowAllContributors(false)}
        />
      )}
    </div>
  );
};

// Master/detail modal opened from the overview's "+N" chip: the full
// contributor list on the left, and a mini profile (contact + a year's activity
// heatmap) for the selected contributor on the right.
const ContributorsModal: React.FC<{
  owner: string;
  repo: string;
  contributors: RepoContributor[];
  truncated: boolean;
  onClose: () => void;
}> = ({ owner, repo, contributors, truncated, onClose }) => {
  const { theme } = useTheme();
  const [selectedLogin, setSelectedLogin] = useState<string | null>(
    () => contributors[0]?.login ?? null,
  );
  const selected =
    contributors.find((c) => c.login === selectedLogin) ?? contributors[0] ?? null;

  // Close on Escape, mirroring the page's other portal dialogs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="flex flex-col w-full max-w-3xl rounded-lg overflow-hidden"
        style={{
          maxHeight: '80vh',
          background: theme.colors.surface,
          border: `1px solid ${theme.colors.border}`,
          boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-4 py-3 border-b shrink-0"
          style={{ borderColor: theme.colors.border }}
        >
          <div
            style={{
              fontSize: theme.fontSizes[2],
              fontWeight: theme.fontWeights.semibold,
              color: theme.colors.text,
            }}
          >
            Contributors{truncated ? ' (top 100)' : ` (${contributors.length})`}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 transition-colors hover:opacity-80"
            style={{ color: theme.colors.textMuted }}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Left: selectable contributor list. */}
          <div
            className="w-56 shrink-0 overflow-y-auto border-r"
            style={{ borderColor: theme.colors.border }}
          >
            {contributors.map((c) => {
              const active = c.login === selected?.login;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedLogin(c.login)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors"
                  style={{
                    background: active
                      ? `color-mix(in srgb, ${theme.colors.primary} 12%, transparent)`
                      : 'transparent',
                    color: theme.colors.text,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${c.avatar_url}${c.avatar_url.includes('?') ? '&' : '?'}s=56`}
                    alt={c.login}
                    width={28}
                    height={28}
                    className="rounded-full shrink-0"
                    style={{ background: theme.colors.backgroundSecondary }}
                  />
                  <span
                    className="truncate"
                    style={{ fontSize: theme.fontSizes[1] }}
                  >
                    {c.login}
                  </span>
                  <span
                    className="ml-auto shrink-0"
                    style={{
                      color: theme.colors.textMuted,
                      fontSize: theme.fontSizes[0],
                    }}
                  >
                    {c.contributions.toLocaleString()}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Right: mini profile for the selected contributor. */}
          <div className="min-w-0 flex-1 overflow-y-auto">
            {selected && (
              <ContributorProfile
                key={selected.login}
                contributor={selected}
                repo={repo}
              />
            )}
          </div>
        </div>

        <a
          href={`https://github.com/${owner}/${repo}/graphs/contributors`}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2.5 border-t text-center transition-colors hover:opacity-80 shrink-0"
          style={{
            borderColor: theme.colors.border,
            color: theme.colors.primary,
            fontSize: theme.fontSizes[1],
          }}
        >
          View all on GitHub
        </a>
      </div>
    </div>,
    document.body,
  );
};

// Detail pane: the selected contributor's extended profile (contact info) plus
// a year's contribution heatmap, lazy-loaded from the /activity route.
const ContributorProfile: React.FC<{
  contributor: RepoContributor;
  repo: string;
}> = ({ contributor, repo }) => {
  const { theme } = useTheme();
  const { data, loading } = useUserActivity(contributor.login);

  const activityData = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of data?.contributions ?? []) m.set(d.date, d.count);
    return m;
  }, [data]);

  const profile = data?.user;
  const displayName = profile?.name || contributor.login;
  const muted = theme.colors.textMuted;

  // One contact row — icon + value (optionally a link) — rendered only when the
  // field is present, so the pane stays tight on sparse profiles.
  const metaRow = (
    icon: React.ReactNode,
    value: React.ReactNode,
    href?: string,
  ) => (
    <div
      className="flex items-center gap-2 min-w-0"
      style={{ color: muted, fontSize: theme.fontSizes[1] }}
    >
      <span className="shrink-0">{icon}</span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate transition-opacity hover:opacity-80"
          style={{ color: theme.colors.primary }}
        >
          {value}
        </a>
      ) : (
        <span className="truncate">{value}</span>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Identity header. */}
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${contributor.avatar_url}${contributor.avatar_url.includes('?') ? '&' : '?'}s=128`}
          alt={contributor.login}
          width={56}
          height={56}
          className="rounded-full shrink-0"
          style={{ background: theme.colors.backgroundSecondary }}
        />
        <div className="min-w-0">
          <div
            className="truncate"
            style={{
              fontSize: theme.fontSizes[3],
              fontWeight: theme.fontWeights.bold,
              color: theme.colors.text,
            }}
          >
            {displayName}
          </div>
          <a
            href={contributor.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate block transition-opacity hover:opacity-80"
            style={{ color: theme.colors.primary, fontSize: theme.fontSizes[1] }}
          >
            @{contributor.login}
          </a>
        </div>
      </div>

      {/* Their contribution to THIS repo — the one stat unique to this view. */}
      <div
        style={{
          color: theme.colors.text,
          fontSize: theme.fontSizes[1],
        }}
      >
        <span style={{ fontWeight: theme.fontWeights.semibold }}>
          {contributor.contributions.toLocaleString()}
        </span>{' '}
        {contributor.contributions === 1 ? 'commit' : 'commits'} to {repo}
      </div>

      {profile?.bio && (
        <p
          style={{
            margin: 0,
            color: theme.colors.text,
            fontSize: theme.fontSizes[1],
            lineHeight: 1.4,
          }}
        >
          {profile.bio}
        </p>
      )}

      {/* Contact / social. */}
      {profile && (
        <div className="flex flex-col gap-1.5">
          {profile.company &&
            metaRow(<Building2 size={14} />, profile.company)}
          {profile.location &&
            metaRow(<MapPin size={14} />, profile.location)}
          {profile.websiteUrl &&
            metaRow(
              <Globe size={14} />,
              profile.websiteUrl.replace(/^https?:\/\//, ''),
              profile.websiteUrl.startsWith('http')
                ? profile.websiteUrl
                : `https://${profile.websiteUrl}`,
            )}
          {profile.twitterUsername &&
            metaRow(
              <Twitter size={14} />,
              `@${profile.twitterUsername}`,
              `https://x.com/${profile.twitterUsername}`,
            )}
          {metaRow(
            <Users size={14} />,
            `${profile.followersCount.toLocaleString()} followers · ${profile.followingCount.toLocaleString()} following`,
          )}
        </div>
      )}

      {/* A year of contributions. */}
      <div className="mt-1">
        <div
          className="mb-1.5"
          style={{ color: muted, fontSize: theme.fontSizes[0] }}
        >
          Contributions in the last year
        </div>
        {loading && !data ? (
          <div
            className="flex items-center justify-center"
            style={{ height: 120, color: muted }}
          >
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : data ? (
          <div
            className="rounded-md overflow-hidden"
            style={{ border: `1px solid ${theme.colors.border}` }}
          >
            <ActivityHeatmap activityData={activityData} bannerHeight={132} />
          </div>
        ) : (
          <div style={{ color: muted, fontSize: theme.fontSizes[1] }}>
            Activity unavailable.
          </div>
        )}
      </div>
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
  viewerUserId: number | null;
  viewerIsRepoAdmin: boolean;
  onRequestDelete: (item: TourListItem) => void;
  // Repo-root README path (or null) + handler, forwarded to RepoOverview so the
  // About card can offer a "README" button.
  readmePath: string | null;
  onOpenReadme: () => void;
  // Trails list rendered beneath the tours in the same scroll column, so a
  // visitor landing on the default view sees the repo's trails under About.
  // Null when the repo has no trails. Built by the caller (which holds the
  // trail data + handlers).
  trailsSection: React.ReactNode;
}> = ({
  owner,
  repo,
  tours,
  loading,
  selectedTourId,
  onSelectTour,
  viewerUserId,
  viewerIsRepoAdmin,
  onRequestDelete,
  readmePath,
  onOpenReadme,
  trailsSection,
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
  // The overview (and the single/empty "tour" CTA folded into it) is a pinned
  // header; only the list below — the multi-tour rows plus the trails — scrolls.
  // When the CTA is folded in, the overview drops its own divider and the CTA
  // carries it, so the button reads as part of the overview card.
  const showFoldedCta = single != null || (!loading && tours.length === 0);
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Pinned header. */}
      <div className="shrink-0">
        <RepoOverview
          owner={owner}
          repo={repo}
          showBorder={!showFoldedCta}
          readmePath={readmePath}
          onOpenReadme={onOpenReadme}
        />
        {single ? (
          <SingleTourCta
            active={single.tour.id === selectedTourId}
            onToggle={() =>
              onSelectTour(
                single.tour.id === selectedTourId ? null : single.tour.id,
              )
            }
            canDelete={singleCanDelete}
            onDelete={() => onRequestDelete(single)}
          />
        ) : !loading && tours.length === 0 ? (
          <ToursEmptyState />
        ) : null}
      </div>

      {/* Scrollable body: the multi-tour list (or a loading line) + the trails.
          overscroll-none kills the elastic rubber-band at the scroll ends, which
          otherwise bounces the sticky "Trails" header. */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-none flex flex-col">
        <div className="shrink-0">
        {!single &&
          (loading ? (
            <ListMessage>Loading tours…</ListMessage>
          ) : (
            tours.map((item) => (
              <TourRow
                key={item.tour.id}
                tour={item.tour}
                selected={item.tour.id === selectedTourId}
                onSelect={() =>
                  onSelectTour(
                    item.tour.id === selectedTourId ? null : item.tour.id,
                  )
                }
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
          ))}
        </div>
        {trailsSection}
      </div>
    </div>
  );
};

const TourRow: React.FC<{
  tour: IntroductionTour;
  selected: boolean;
  onSelect: () => void;
  canDelete: boolean;
  onDelete: () => void;
}> = ({
  tour,
  selected,
  onSelect,
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
    </div>
  );
};

/**
 * Audio status badge + Generate/Regenerate button for the active tour, rendered
 * inline in the header while a tour is selected. Shows live per-step progress
 * while generating, and disables the button while the tour is inside its
 * once-per-hour cooldown.
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

  const rowStyle = 'flex items-center gap-2';
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
// in place of a one-row list: a prominent Start/Stop button that toggles the
// tour in the right pane, with the author delete kept beneath it. Audio
// controls live in the header (TourAudioControl), shown only while a tour is
// selected.
// ---------------------------------------------------------------------------

const SingleTourCta: React.FC<{
  active: boolean;
  onToggle: () => void;
  canDelete: boolean;
  onDelete: () => void;
}> = ({ active, onToggle, canDelete, onDelete }) => {
  const { theme } = useTheme();

  return (
    // The CTA carries the overview card's dividing line at its bottom edge — the
    // overview itself renders borderless above it, so the two read as one card.
    <div
      className="flex flex-col border-b"
      style={{ borderColor: theme.colors.border }}
    >
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

// Author chip for the file-trails overlay rows. Split out so it can resolve
// the GitHub display name via the useGithubDisplayName hook (rows are rendered
// in an inline .map, where a hook can't be called directly).
const TrailFileTrailsAuthor: React.FC<{
  author: SharedTrailIndexEntry['createdBy'];
  avatarUrl: string | null;
}> = ({ author, avatarUrl }) => {
  const { theme } = useTheme();
  const displayName = useGithubDisplayName(author?.githubLogin);
  if (!author?.githubLogin) return null;
  return (
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
        {displayName || author.githubLogin}
      </span>
    </div>
  );
};

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
                <TrailFileTrailsAuthor author={author} avatarUrl={avatarUrl} />
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
  /** Architecture-panel directory highlights — fed to the idle Tour city. */
  packageHighlightLayers: HighlightLayer[] | null;
  /** Selected package's dir — focuses/collapses the idle Tour city onto it. */
  idleFocusDirectory: string | null;
  highlightLayersLoading: boolean;
  excludedFolders: string[];
  showSpatialContext: boolean;
  /** File-type color legend on the tour panel (header-toggled, default on). */
  showColorLegend: boolean;
  /** Trails section expanded → render the Trail explorer; else the Tour panel. */
  trailsExpanded: boolean;
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
  packageHighlightLayers,
  idleFocusDirectory,
  highlightLayersLoading,
  excludedFolders,
  showSpatialContext,
  showColorLegend,
  trailsExpanded,
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

  // Pin marker reads to the commit the trail was authored against, so line
  // ranges line up with the file as it existed then instead of drifting with
  // HEAD. Falls back to the multi-repo registry sha, then the single-repo
  // shorthand; undefined when neither is present (reads HEAD).
  const authoredSha =
    selectedPayload?.repos?.[0]?.authoredAtSha ??
    selectedPayload?.authoredAt?.sha;

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
        `/api/github/repo/${owner}/${repo}?action=file&path=${encodeURIComponent(cleanPath)}${
          authoredSha ? `&ref=${encodeURIComponent(authoredSha)}` : ''
        }`,
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
    [owner, repo, authoredSha],
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
      // While a tour is open the panel sources highlights from the active
      // step and ignores this slice. In the idle/no-tour state (the default
      // right pane) it honors host layers — that's where the Architecture
      // panel's package directory highlight lands.
      highlightLayers: {
        scope: 'repository' as const,
        name: 'highlightLayers',
        data: packageHighlightLayers,
        loading: false,
        error: null,
        refresh: async () => {},
      },
      repository: tourRepository,
    };
  }, [fileTree, selectedTour, tourRepository, packageHighlightLayers]);

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

  // The tour panel is the default right pane: idle colored city + file-type
  // legend when no tour is open, tour chrome once one is picked. The Trail
  // explorer (with its file overlay + share modal) only takes over when the
  // left-rail Trails section is expanded.
  if (!trailsExpanded) {
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
          showColorLegend={showColorLegend}
          // Top-left "Files" button to browse the idle city as a normal file
          // tree; tracks the focused package subtree.
          showFileTreeToggle
          // Selecting a package collapses the idle city onto its subtree and
          // frames the camera on it — no color over the buildings. Null when
          // nothing is selected (full city).
          idleFocusDirectory={idleFocusDirectory}
          // Skip the tour brief — picking a tour drops straight into step 1
          // rather than the description + Start gate.
          defaultSkipWelcome
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

