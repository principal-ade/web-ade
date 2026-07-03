'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '@principal-ade/industry-theme';
import {
  Search,
  FileText,
  CalendarDays,
  AlignLeft,
  Settings,
  Check,
  X,
  Compass,
  Volume2,
  AlertTriangle,
  Mic,
  Trash2,
  Star,
  GitFork,
  Play,
  Activity,
  CircleDot,
  GitPullRequest,
  ChevronRight,
  Boxes,
  Footprints,
  MapPin,
  Globe,
  Users,
  Building2,
  Twitter,
  Mail,
  Bookmark,
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
  FileCityGuidePanelActions,
  FileCityGuidePanelContext,
  FileCityGuideRepository,
  HighlightLayer,
  CommitView,
  ReadmeView,
  IssueView,
  PullRequestView,
  LineCountsSliceData,
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
import { RepoSearchBar } from '@/components/RepoSearchBar';
import { readRecentRepos } from '@/lib/recentRepos';
import { BookmarksDrawer } from '@/components/bookmarks/BookmarksDrawer';
import type { BookmarkRepo } from '@/components/bookmarks/types';
import { BlockDropLoadingScreen } from '@/components/trail/BlockDropLoadingScreen';
import { InlineTrailLoader } from '@/components/trail/InlineTrailLoader';
import { TrailErrorView } from '@/components/trail/TrailErrorView';
import { TrailShareModal } from '@/components/trail/TrailShareModal';
import { CreateTrailModal } from '@/components/home/CreateTrailModal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SlidePane } from '@/components/rail/SlidePane';
import { RailPaneHeader } from '@/components/rail/RailPaneHeader';
import { ActivityHeatmap } from '@/components/ActivityHeatmap';
import type { UserActivityResponse } from '@/app/api/github/user/[username]/activity/route';
import { FileSourcePanel } from './FileSourcePanel';
import { RepoActivityPane } from './RepoActivityPane';
import { RepoIssuesPane } from './RepoIssuesPane';
import { RepoPullRequestsPane } from './RepoPullRequestsPane';
import { RepoAnalysisStatus } from './RepoAnalysisStatus';
import {
  RepoAnalysisProvider,
  useRepoAnalysis,
  type RepoAnalysisPayload,
} from './RepoAnalysisContext';
import {
  analysisContributors,
  mergeContributors,
  type ContributionStats,
  type EmailIdentity,
} from '@/lib/repo-analysis/contributionLayers';
import { useCommitsChangedFiles } from '@/hooks/useCommitsChangedFiles';
import { useCommitView } from '@/hooks/useCommitView';
import { useIssueView } from '@/hooks/useIssueView';
import { usePullRequestView } from '@/hooks/usePullRequestView';
import { useReadme } from '@/hooks/useReadme';
import {
  buildAggregateChurnLayers,
  buildCommitFilesLayer,
  type ChangedFile,
} from '@/lib/activity/commitLayers';
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

const FileCityGuidePanel = dynamic(
  () =>
    import('@industry-theme/file-city-panel').then(
      (m) => m.FileCityGuidePanel,
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

// Which surface the left rail is showing. 'tours' is the default landing view
// (About card + nav cards + tours list); the rest are full-rail panes the nav
// cards swap in, each with a close button that returns to 'tours'.
type LeftViewMode =
  | 'trails'
  | 'files'
  | 'tours'
  | 'activity'
  | 'issues'
  | 'pull-requests'
  | 'structure'
  | 'contributors';

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

// Building heights come from the Freestyle VM repo analysis, which already
// returns per-file line counts (path → count). When an analysis exists, wrap it
// as the panel's lineCounts slice; otherwise null (flat city until the user
// runs the analysis). The VM is the sole source — no fallback to the old
// /api/line-counts route; a failed VM run is handled separately.
function lineCountsSlice(
  analysis: RepoAnalysisPayload | null,
): DataSlice<LineCountsSliceData | null> {
  return {
    scope: 'repository',
    name: 'lineCounts',
    data: analysis
      ? { lineCounts: analysis.lineCounts, status: 'available' }
      : null,
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

  const router = useRouter();

  // Bookmarks passport side panel.
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  // The repo currently being viewed, as a BookmarkRepo. Only owner/repo are
  // known here, so synthesize the rest and enrich stars/description from the
  // persisted recent-repos entry when one exists.
  const currentBookmarkRepo = useMemo<BookmarkRepo>(() => {
    const fullName = `${owner}/${repo}`;
    const base: BookmarkRepo = {
      full_name: fullName,
      name: repo,
      owner: {
        login: owner,
        avatar_url: `https://github.com/${owner}.png?size=64`,
      },
    };
    const match = readRecentRepos().find(
      (r) => r.full_name.toLowerCase() === fullName.toLowerCase(),
    );
    return match ? { ...base, ...match } : base;
  }, [owner, repo]);
  const handleNavigateBookmark = useCallback(
    (fullName: string) => {
      setBookmarksOpen(false);
      router.push(`/${fullName}`);
    },
    [router],
  );

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
  const [leftViewMode, setLeftViewMode] = useState<LeftViewMode>(
    // Lead with tours so a guided tour — or, failing that, the "author a tour"
    // empty state — is the first thing a visitor lands on.
    'tours',
  );
  // Commit picked from the Activity list — when set, the right pane shows the
  // commit as a synthesized changelog trail in the File City panel. Mutually
  // exclusive with trail/tour/file selection.
  const [selectedCommitSha, setSelectedCommitSha] = useState<string | null>(
    null,
  );
  // Issue picked from the Issues list — when set, the right pane shows it in the
  // File City panel's native issue mode. Mutually exclusive with
  // commit/tour/readme/file selection.
  const [selectedIssueNumber, setSelectedIssueNumber] = useState<number | null>(
    null,
  );
  // PR picked from the Pull requests list — when set, the right pane shows it in
  // the File City panel's native PR mode. Mutually exclusive with
  // commit/issue/tour/readme/file selection.
  const [selectedPrNumber, setSelectedPrNumber] = useState<number | null>(null);
  // Commit row currently hovered in the Activity list — paints that commit's
  // files on the idle city in a distinct color over the aggregate heatmap.
  const [hoveredCommitSha, setHoveredCommitSha] = useState<string | null>(null);
  // SHAs of the commits currently loaded in the Activity list, reported up from
  // RepoActivityPane so we can build the aggregate churn heatmap.
  const [activityShas, setActivityShas] = useState<string[]>([]);
  // SHAs to focus the churn heatmap on — the selected contributor's commits, or
  // null when browsing the contributor list (then we paint everyone's churn).
  const [activityFocusShas, setActivityFocusShas] = useState<string[] | null>(
    null,
  );
  // SHAs of the contributor currently hovered in the Activity list (or null) —
  // previews their footprint on the city in a distinct color.
  const [activityHoverShas, setActivityHoverShas] = useState<string[] | null>(
    null,
  );
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  // Which edge the file source drawer docks to. Files open on the right. (The
  // README no longer uses this drawer — it opens in the File City panel's
  // native readme mode; see `activeReadmePath`.)
  const [fileSide, setFileSide] = useState<'left' | 'right' | 'bottom'>('right');
  // Tour selection. Mutually exclusive with trail/file selection — the right
  // pane swaps to the tour panel while a tour is active.
  const [selectedTourId, setSelectedTourId] = useState<string | null>(null);
  // README open in the File City panel's native readme mode (markdown left +
  // city + file-type legend). Holds the repo-relative README path; null when
  // closed. Mutually exclusive with trail/tour/commit/file selection — like
  // those, opening it clears the others so a single thing drives the right pane.
  const [activeReadmePath, setActiveReadmePath] = useState<string | null>(null);

  // Small-screen flag (matches the 768px breakpoint used elsewhere). On mobile
  // the legend and README don't auto-open — they'd crowd the city — so we seed
  // the panel's `defaultLegendOpen` and skip the README auto-open below.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

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

  // The Trails nav card swaps the rail to the full-rail trail list; while it's
  // open this flag drives the right pane to the Trail explorer (set from
  // onSetViewMode based on `leftViewMode === 'trails'`). Collapsed → the right
  // pane shows the Tour panel (idle city + legend, or an open tour).
  const [trailsExpanded, setTrailsExpanded] = useState(false);

  // Toggle the left rail between the commit-activity view and the default tours
  // view. Either direction clears the other surfaces' selections so a single
  // thing shows in the right pane. Driven from the About card (to enter) and the
  // activity pane's close button (to leave).
  const handleToggleActivity = useCallback(() => {
    setLeftViewMode((m) => (m === 'activity' ? 'tours' : 'activity'));
    setSelectedTrailId(null);
    setSelectedTourId(null);
    setSelectedFilePath(null);
    setSelectedCommitSha(null);
    setSelectedIssueNumber(null);
    setActiveReadmePath(null);
    setTrailsExpanded(false);
    // Plain toggle lands on the contributor cards, not a stale drill-down.
    setActivityFocusContributor(null);
  }, []);

  // Clicking a contributor in the About card opens the Contributors view
  // straight into that person's profile. The counter bumps each click so
  // re-selecting the same contributor re-triggers the drill-in downstream.
  const contributorFocusCounter = useRef(0);
  const [activityFocusContributor, setActivityFocusContributor] = useState<{
    token: number;
    login: string;
    name: string;
    avatarUrl?: string;
  } | null>(null);
  const [contributorsFocus, setContributorsFocus] = useState<{
    token: number;
    login: string;
  } | null>(null);
  const handleSelectContributor = useCallback(
    (c: { login: string; avatar_url: string }) => {
      contributorFocusCounter.current += 1;
      setContributorsFocus({
        token: contributorFocusCounter.current,
        login: c.login,
      });
      setLeftViewMode('contributors');
      setSelectedTrailId(null);
      setSelectedTourId(null);
      setSelectedFilePath(null);
      setSelectedCommitSha(null);
      setSelectedIssueNumber(null);
      setActiveReadmePath(null);
      setTrailsExpanded(false);
    },
    [],
  );

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
        // Read the body as text first: a 200 with an empty/blank body isn't a
        // real "no trails" result — it's an upstream truncation (CloudFront /
        // SSR gateway timeout, seen on very large repos under load like
        // elastic/kibana). Surface a retryable message instead of letting
        // `res.json()` throw a raw "Unexpected end of JSON input" DOMException
        // that then renders verbatim in the main panel.
        const text = await res.text();
        if (cancelled) return;
        if (!text.trim()) {
          setState({
            kind: 'error',
            message:
              'Couldn’t load trails for this repository — the request timed out. Refresh to try again.',
            code: null,
          });
          return;
        }
        const data = JSON.parse(text) as {
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
        // Network failure or a malformed (non-JSON) body land here. Neither
        // carries a user-useful message, so keep it generic and retryable
        // rather than exposing the raw parse/`fetch` error text.
        console.error('[Trails] Failed to load trail index:', err);
        setState({
          kind: 'error',
          message: 'Failed to load trails. Refresh to try again.',
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
        // Fetch the tree via a presigned S3 URL rather than inline through
        // tRPC: a monorepo's tree (elastic/kibana ~5.7MB slimmed) can exceed
        // the ~6MB SSR response cap and truncate. S3 has no such cap, so the
        // direct fetch below reliably delivers the whole tree.
        const { url, sha } = await trpc.github.getTreeUrl.query({
          owner,
          repo,
        });
        if (cancelled) return;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`tree fetch failed (${res.status})`);
        const treeData = (await res.json()) as {
          sha?: string;
          tree: Array<{ path: string; type: string; size?: number }>;
        };
        if (cancelled) return;
        const files = treeData.tree
          .filter((entry) => entry.type === 'blob')
          .map((entry) => ({ path: entry.path, size: entry.size || 0 }));
        const tree = new GitFileTreeBuilder().build({
          files,
          rootPath: `/${owner}/${repo}`,
          commitSha: treeData.sha ?? sha,
          branch: 'main',
        });
        if (cancelled) return;
        setFileTree(tree);
      } catch (err) {
        if (cancelled) return;
        // Retained as a safety net: a truncated/garbled tree body makes
        // `res.json()` throw a raw "Unexpected end of JSON input" DOMException.
        // Don't surface that verbatim — show a clean, retryable message instead.
        console.error('[RepoTree] Failed to load repository tree:', err);
        const raw = err instanceof Error ? err.message : '';
        const isParseError = /JSON|Unexpected end of|Unexpected token/i.test(
          raw,
        );
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

  // Repo-root README path (if any) — also computed in the left rail, but we
  // need it here to auto-open the readme view and to toggle it from the button.
  const readmePath = useMemo(() => findReadmePath(filePaths), [filePaths]);

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

  // --- Commit activity → File City ----------------------------------------
  // Changed-file lists for the commits loaded in the Activity list, used to
  // paint an aggregate churn heatmap on the idle city (only while browsing).
  const isActivityView = leftViewMode === 'activity';
  const commitFiles = useCommitsChangedFiles(owner, repo, activityShas, {
    enabled: isActivityView,
  });
  // Aggregate churn heatmap + a distinct-colored layer for the hovered commit.
  const activityHeatmapLayers = useMemo<HighlightLayer[] | null>(() => {
    if (!isActivityView) return null;
    // Scope the churn to the focused contributor's commits when one is open,
    // otherwise paint the aggregate across every loaded commit.
    const churnSource = activityFocusShas
      ? new Map(
          activityFocusShas
            .filter((sha) => commitFiles.has(sha))
            .map((sha) => [sha, commitFiles.get(sha)!] as const),
        )
      : commitFiles;
    const layers = buildAggregateChurnLayers(churnSource, theme.colors.primary);
    if (hoveredCommitSha) {
      const hoverFiles = commitFiles.get(hoveredCommitSha);
      if (hoverFiles) {
        const hoverLayer = buildCommitFilesLayer(hoverFiles, {
          id: 'commit-hover',
          color: theme.colors.accent,
          priority: 90,
        });
        if (hoverLayer) layers.push(hoverLayer);
      }
    }
    // Hovering a contributor in the list previews their footprint: an accent
    // layer over the union of files their commits touched.
    if (activityHoverShas && activityHoverShas.length > 0) {
      const seen = new Set<string>();
      const hoverFiles = activityHoverShas
        .flatMap((sha) => commitFiles.get(sha) ?? [])
        .filter((f) =>
          seen.has(f.filename) ? false : (seen.add(f.filename), true),
        );
      const hoverLayer = buildCommitFilesLayer(hoverFiles, {
        id: 'contributor-hover',
        color: theme.colors.accent,
        priority: 90,
      });
      if (hoverLayer) layers.push(hoverLayer);
    }
    return layers.length > 0 ? layers : null;
  }, [isActivityView, commitFiles, activityFocusShas, hoveredCommitSha, activityHoverShas, theme.colors.primary, theme.colors.accent]);
  // Selected commit rendered natively by FileCityGuidePanel's commit mode
  // (header + message + changed-file list + city highlights). Only while the
  // Activity view is active.
  const { commit: selectedCommitView, loading: commitViewLoading } =
    useCommitView(owner, repo, isActivityView ? selectedCommitSha : null);

  // Selected issue rendered natively by FileCityGuidePanel's issue mode (header
  // + body + reporter card). Only while the Issues view is active.
  const isIssuesView = leftViewMode === 'issues';
  const { issue: selectedIssueView, loading: issueViewLoading } = useIssueView(
    owner,
    repo,
    isIssuesView ? selectedIssueNumber : null,
  );

  // Selected PR rendered natively by FileCityGuidePanel's PR mode (header +
  // description + Files/Details tabs, changed buildings lit). Only while the
  // Pull requests view is active.
  const isPullRequestsView = leftViewMode === 'pull-requests';
  const { pullRequest: selectedPrView, loading: prViewLoading } =
    usePullRequestView(
      owner,
      repo,
      isPullRequestsView ? selectedPrNumber : null,
    );

  // README rendered natively by FileCityGuidePanel's readme mode (markdown left
  // + city + file-type legend). Driven by `activeReadmePath`; idle when null.
  const { readme: selectedReadmeView, loading: readmeViewLoading } = useReadme(
    owner,
    repo,
    activeReadmePath,
    // Pin the README read to the same commit the file tree resolved, so it's a
    // coherent snapshot and hits the immutable SHA-keyed cache.
    fileTree?.sha ?? null,
  );

  // Open the readme by default on first visit, unless the user previously
  // closed it (persisted per-repo). Runs once, after the file list (hence the
  // README path) is known, and only when no other surface is already selected
  // so a deep-linked tour/commit/trail still wins.
  const didAutoOpenReadme = useRef(false);
  useEffect(() => {
    if (didAutoOpenReadme.current) return;
    if (!readmePath) return; // wait for the file list to load
    didAutoOpenReadme.current = true;
    const readmePref = readReadmeOpenPref(owner, repo);
    if (readmePref === false) return; // user dismissed it
    // On mobile the README shouldn't open by default (it would take the whole
    // screen), but still honor an explicit prior "open" preference.
    if (isMobile && readmePref !== true) return;
    if (selectedTourId || selectedCommitSha || selectedTrailId || selectedFilePath) {
      return; // something else is already showing
    }
    setActiveReadmePath(readmePath);
  }, [
    readmePath,
    owner,
    repo,
    isMobile,
    selectedTourId,
    selectedCommitSha,
    selectedTrailId,
    selectedFilePath,
  ]);

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
        rateLimitedTitle="Hang tight — GitHub is busy"
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
          <BlockDropLoadingScreen message={`Loading ${repo}`} />
        </div>
      </>
    );
  }

  return (
    <RepoAnalysisProvider owner={owner} repo={repo}>
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
        trailsExpanded={trailsExpanded}
        onToggleBookmarks={() => setBookmarksOpen((v) => !v)}
        bookmarksOpen={bookmarksOpen}
        repoActive={leftViewMode !== 'tours'}
        onShowOverview={() => setLeftViewMode('tours')}
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
          packages={packages}
          packagesLoading={packagesLoading}
          onReadFile={handleReadFile}
          onPackageHover={(pkg) =>
            setHoveredPackagePath(packageDirFromLayer(pkg))
          }
          onPackageSelect={(pkg) => {
            const dir = packageDirFromLayer(pkg);
            setSelectedPackagePath(dir);
            // Pair the package focus with its own README: when the selected
            // package has one, show it beside the city — `idleFocusDirectory`
            // (below) collapses the city onto the same subtree, so the reader
            // gets "focus the package + read its README" in one gesture. No
            // package README → clear, leaving just the focused city.
            setActiveReadmePath(dir ? findReadmePath(filePaths, dir) : null);
          }}
          configMode={configMode}
          onToggleConfigMode={() => {
            setConfigMode((m) => !m);
            setSelectedTrailId(null);
          }}
          leftViewMode={leftViewMode}
          onSetViewMode={(mode) => {
            setLeftViewMode(mode);
            // Picking any other view dismisses the readme (it's the tours-view
            // default overlay). Doesn't touch the persisted preference, so the
            // README button can reopen it.
            setActiveReadmePath(null);
            // Switching views clears the other views' selections so the map
            // returns to the idle coverage layer between them. Leaving the
            // activity view also clears any open commit.
            if (mode !== 'activity') setSelectedCommitSha(null);
            if (mode !== 'issues') setSelectedIssueNumber(null);
            if (mode !== 'pull-requests') setSelectedPrNumber(null);
            // The package focus (idleFocusDirectory) only belongs to the
            // Structure view; leaving it must release the city back to idle so
            // About doesn't stay zoomed on the last-clicked package.
            if (mode !== 'structure') {
              setSelectedPackagePath(null);
              setHoveredPackagePath(null);
            }
            // The Trails view drives the right pane to the Trail explorer (via
            // trailsExpanded); every other view collapses it back.
            setTrailsExpanded(mode === 'trails');
            if (mode === 'files') {
              setSelectedTrailId(null);
              setSelectedTourId(null);
            } else if (mode === 'tours') {
              setSelectedTrailId(null);
              setSelectedFilePath(null);
            } else if (mode === 'activity') {
              setSelectedTrailId(null);
              setSelectedTourId(null);
              setSelectedFilePath(null);
              // Opening Activity from a nav card lands on the contributor
              // list, not a stale drill-down.
              setActivityFocusContributor(null);
            } else if (mode === 'issues') {
              setSelectedTrailId(null);
              setSelectedTourId(null);
              setSelectedFilePath(null);
            } else if (mode === 'pull-requests') {
              setSelectedTrailId(null);
              setSelectedTourId(null);
              setSelectedFilePath(null);
            } else if (mode === 'trails') {
              // Keep any selected trail so it stays open in the explorer.
              setSelectedFilePath(null);
              setSelectedTourId(null);
            } else {
              // Structure / Contributors: a clean idle right pane.
              setSelectedTrailId(null);
              setSelectedFilePath(null);
              setSelectedTourId(null);
              // Opening Contributors from a nav card lands on the list, not a
              // stale contributor drill-down.
              setContributorsFocus(null);
            }
          }}
          onToggleActivity={handleToggleActivity}
          onSelectContributor={handleSelectContributor}
          activityFocusContributor={activityFocusContributor}
          contributorsFocus={contributorsFocus}
          selectedCommitSha={selectedCommitSha}
          onSelectCommit={(sha) => {
            setSelectedCommitSha(sha);
            if (sha) setActiveReadmePath(null);
          }}
          selectedIssueNumber={selectedIssueNumber}
          onSelectIssue={(issueNumber) => {
            setSelectedIssueNumber(issueNumber);
            if (issueNumber != null) setActiveReadmePath(null);
          }}
          selectedPrNumber={selectedPrNumber}
          onSelectPr={(prNumber) => {
            setSelectedPrNumber(prNumber);
            if (prNumber != null) setActiveReadmePath(null);
          }}
          commitFiles={commitFiles}
          onCommitShasChange={setActivityShas}
          onFocusShasChange={setActivityFocusShas}
          onHoverCommit={setHoveredCommitSha}
          onActivityHoverShasChange={setActivityHoverShas}
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
            setActiveReadmePath(null);
          }}
          // The README button toggles the File City panel's native readme mode
          // (markdown left + city + file-type legend), persisting the choice
          // per-repo so it survives reloads. Opening collapses the trails
          // section and clears competing selections so readme is the single
          // active mode; closing returns to the idle city.
          onOpenReadmeFile={(path) => {
            if (activeReadmePath) {
              setActiveReadmePath(null);
              writeReadmeOpenPref(owner, repo, false);
              return;
            }
            setActiveReadmePath(path);
            writeReadmeOpenPref(owner, repo, true);
            setTrailsExpanded(false);
            setSelectedFilePath(null);
            setSelectedTrailId(null);
            setSelectedTourId(null);
            setSelectedCommitSha(null);
            setSelectedIssueNumber(null);
          }}
          readmeActive={activeReadmePath != null}
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
              setActiveReadmePath(null);
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
          isMobile={isMobile}
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
          showColorLegend
          showColorLegendToggle
          // Mobile starts with the legend collapsed (reopenable via the toggle).
          defaultLegendOpen={!isMobile}
          trailsExpanded={trailsExpanded}
          onCloseCommit={() => setSelectedCommitSha(null)}
          onCloseIssue={() => setSelectedIssueNumber(null)}
          onClosePullRequest={() => setSelectedPrNumber(null)}
          activityHeatmapLayers={activityHeatmapLayers}
          commitView={selectedCommitView}
          commitViewLoading={commitViewLoading}
          issueView={selectedIssueView}
          issueViewLoading={issueViewLoading}
          pullRequestView={selectedPrView}
          pullRequestViewLoading={prViewLoading}
          readmeView={selectedReadmeView}
          readmeViewLoading={readmeViewLoading}
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
      <BookmarksDrawer
        open={bookmarksOpen}
        onClose={() => setBookmarksOpen(false)}
        currentRepo={currentBookmarkRepo}
        onNavigate={handleNavigateBookmark}
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
    </RepoAnalysisProvider>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

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
  /** Trails section expanded → the Trail explorer (no legend) is showing. */
  trailsExpanded: boolean;
  /** Toggle the bookmarks passport side panel. */
  onToggleBookmarks: () => void;
  bookmarksOpen: boolean;
  /** Extend the breadcrumb to "owner / repo" — set while a nav-card view (not
   *  the overview) is open, so the header names the repo you've drilled into. */
  repoActive: boolean;
  /** Click the repo crumb → return to the repo overview (the About view). */
  onShowOverview: () => void;
}> = ({
  rootRef,
  owner,
  repo,
  exploredStats,
  selectedTour,
  tourProgress,
  onGenerateTourAudio,
  trailsExpanded,
  onToggleBookmarks,
  bookmarksOpen,
  repoActive,
  onShowOverview,
}) => {
  const { theme } = useTheme();
  // Mobile: the repo opener collapses into a "Search GitHub" button that opens
  // a full-screen search sheet (the header is too cramped for the input).
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  return (
    <header
      ref={rootRef}
      className="border-b px-5 flex items-center gap-2 flex-shrink-0 relative"
      style={{
        background: theme.colors.surface,
        borderColor: theme.colors.border,
        paddingTop: 'calc(var(--safe-top) + 0.875rem)',
        paddingBottom: '0.875rem',
      }}
    >
      {/* Mount animation for the repo breadcrumb crumb — it unmounts on the
          overview and remounts when a view is selected, so this fires on
          appear. */}
      <style>{`
        @keyframes rpCrumbIn {
          from { opacity: 0; transform: translateX(-4px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
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
        {repoActive && (
          <span
            className="flex items-center min-w-0"
            style={{ animation: 'rpCrumbIn 240ms ease-out both' }}
          >
            <span
              className="-ml-0.5 mr-1 flex-shrink-0"
              style={{ color: theme.colors.textMuted }}
              aria-hidden="true"
            >
              /
            </span>
            <button
              type="button"
              onClick={onShowOverview}
              className="transition-opacity hover:opacity-80 truncate"
              title={`${repo} overview`}
              style={{
                fontFamily: theme.fonts.body,
                fontSize: theme.fontSizes[2],
                fontWeight: theme.fontWeights.semibold,
                color: theme.colors.primary,
                cursor: 'pointer',
              }}
            >
              {repo}
            </button>
          </span>
        )}
      </div>

      <div className="flex md:hidden items-center gap-2 min-w-0 flex-1">
        <Link
          href={`/${owner}`}
          className="flex items-center gap-2 min-w-0 transition-opacity hover:opacity-80"
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
          {/* Once drilled into a view the repo name leads; drop the owner name
              on mobile so it doesn't crowd the crumb (avatar still links out). */}
          {!repoActive && (
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
          )}
        </Link>
        {repoActive && (
          <span
            className="flex items-center min-w-0"
            style={{ animation: 'rpCrumbIn 240ms ease-out both' }}
          >
            <span
              className="-ml-0.5 mr-1 flex-shrink-0"
              style={{ color: theme.colors.textMuted }}
              aria-hidden="true"
            >
              /
            </span>
            <button
              type="button"
              onClick={onShowOverview}
              className="truncate transition-opacity hover:opacity-80"
              title={`${repo} overview`}
              style={{
                fontFamily: theme.fonts.body,
                fontSize: theme.fontSizes[2],
                fontWeight: theme.fontWeights.semibold,
                color: theme.colors.primary,
                cursor: 'pointer',
              }}
            >
              {repo}
            </button>
          </span>
        )}
      </div>

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
        {selectedTour && (
          <TourAudioControl
            status={selectedTour.audioStatus}
            progress={tourProgress}
            onGenerate={() => onGenerateTourAudio(selectedTour)}
          />
        )}

        {/* Always-visible repo opener. Navigates to the chosen repo's page. */}
        <div className="hidden md:block">
          <RepoSearchBar excludeFullName={`${owner}/${repo}`} />
        </div>

        {/* Mobile: a compact button that opens the full-screen search sheet in
            place of the inline opener (which is hidden below md). */}
        <button
          type="button"
          onClick={() => setMobileSearchOpen(true)}
          className="md:hidden flex items-center gap-1.5 h-8 px-2.5 rounded-md transition-opacity hover:opacity-80"
          style={{
            color: theme.colors.text,
            background: theme.colors.background,
            border: `1px solid ${theme.colors.border}`,
            fontSize: theme.fontSizes[1],
          }}
          aria-label="Search GitHub"
        >
          <Search className="w-4 h-4" />
          Search GitHub
        </button>

        {/* Agent view — sits to the right of the opener input. */}
        <div className="hidden md:flex">
          <AgentViewButton path={`/${owner}/${repo}`} iconOnly />
        </div>

        {/* Bookmarks passport — slides in the side panel. Hidden on mobile. */}
        <button
          type="button"
          onClick={onToggleBookmarks}
          aria-pressed={bookmarksOpen}
          className="hidden md:flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80"
          style={{
            color: bookmarksOpen ? theme.colors.primary : theme.colors.text,
            background: bookmarksOpen
              ? `color-mix(in srgb, ${theme.colors.primary} 15%, transparent)`
              : 'transparent',
          }}
          title="Bookmarks"
          aria-label="Bookmarks"
        >
          <Bookmark className="w-5 h-5" />
        </button>

        <div className="hidden md:block">
          <UserAvatarMenu />
        </div>
      </div>

      {/* Mobile GitHub search sheet — full-screen so the search input + results
          have room; reuses the shared RepoSearchBar (navigates on select). */}
      {mobileSearchOpen && (
        <div
          className="md:hidden fixed inset-0 z-[2000] flex flex-col"
          style={{ background: theme.colors.background, color: theme.colors.text }}
        >
          <div
            className="flex items-center justify-between gap-3 px-4 h-14 border-b shrink-0"
            style={{
              borderColor: `color-mix(in srgb, ${theme.colors.border} 70%, transparent)`,
            }}
          >
            <span
              className="font-semibold"
              style={{ fontSize: theme.fontSizes[3], fontFamily: theme.fonts.body }}
            >
              Search GitHub
            </span>
            <button
              type="button"
              onClick={() => setMobileSearchOpen(false)}
              className="inline-flex items-center justify-center rounded-md p-2 transition-opacity hover:opacity-80"
              style={{ color: theme.colors.textMuted }}
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
          <div className="p-4">
            <RepoSearchBar
              excludeFullName={`${owner}/${repo}`}
              inputWidthClass="w-full"
              autoFocus
            />
          </div>
        </div>
      )}
    </header>
  );
};

// ---------------------------------------------------------------------------
// Sliding pane switcher
// ---------------------------------------------------------------------------

// Left-to-right ordering of the rail's surfaces. A transition to a later
// surface slides the new pane in from the right (and the old one out to the
// left); going back reverses it — the carousel feel for the About nav cards.
const SLIDE_ORDER = [
  'config',
  'tours',
  'activity',
  'issues',
  'pull-requests',
  'contributors',
  'structure',
  'trails',
  'files',
] as const;

function slideDirection(from: string, to: string): 1 | -1 {
  const a = SLIDE_ORDER.indexOf(from as (typeof SLIDE_ORDER)[number]);
  const b = SLIDE_ORDER.indexOf(to as (typeof SLIDE_ORDER)[number]);
  return b >= a ? 1 : -1;
}

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
  /** Detected packages — surfaced as the "Structure" nav card / full-rail
   *  composition pane. */
  packages: PackageLayer[];
  packagesLoading: boolean;
  onReadFile: (filePath: string) => Promise<string>;
  /** Composition-panel hover/select → file-city directory highlight. */
  onPackageHover: (pkg: PackageLayer | null) => void;
  onPackageSelect: (pkg: PackageLayer | null) => void;
  configMode: boolean;
  onToggleConfigMode: () => void;
  leftViewMode: LeftViewMode;
  onSetViewMode: (mode: LeftViewMode) => void;
  /** Close handler for the full-rail Activity pane (returns to the tours view). */
  onToggleActivity: () => void;
  /** Click a contributor in the About card → open their Contributors profile. */
  onSelectContributor: (c: { login: string; avatar_url: string }) => void;
  activityFocusContributor: {
    token: number;
    login: string;
    name: string;
    avatarUrl?: string;
  } | null;
  /** Contributor to pre-select in the Contributors pane (from the About card). */
  contributorsFocus: { token: number; login: string } | null;
  /** Commit picked from the Activity list (highlights the row). */
  selectedCommitSha: string | null;
  onSelectCommit: (sha: string | null) => void;
  /** Issue picked from the Issues list (highlights the row). */
  selectedIssueNumber: number | null;
  onSelectIssue: (issueNumber: number | null) => void;
  /** PR picked from the Pull requests list (highlights the row). */
  selectedPrNumber: number | null;
  onSelectPr: (prNumber: number | null) => void;
  /** Changed-file lists for the loaded commits — per-contributor file counts. */
  commitFiles: Map<string, ChangedFile[]>;
  /** Activity list reports its loaded SHAs + hovered commit up for the heatmap. */
  onCommitShasChange: (shas: string[]) => void;
  /** Activity reports the focused contributor's SHAs (or null) for the heatmap. */
  onFocusShasChange: (shas: string[] | null) => void;
  onHoverCommit: (sha: string | null) => void;
  /** Activity reports the hovered contributor's SHAs (or null) for the city. */
  onActivityHoverShasChange: (shas: string[] | null) => void;
  trailFileRows: { path: string; trailCount: number }[];
  selectedFilePath: string | null;
  onSelectFile: (path: string | null) => void;
  // Opens the repo-root README in the source drawer (docked on the left).
  onOpenReadmeFile: (path: string) => void;
  // Whether the native readme mode is currently open (drives the README
  // button's on/off look).
  readmeActive: boolean;
  tours: TourListItem[];
  toursLoading: boolean;
  selectedTourId: string | null;
  onSelectTour: (id: string | null) => void;
  onRequestDeleteTour: (item: TourListItem) => void;
  dirPaths: string[];
  filePaths: string[];
  excludedDirs: string[];
  onExcludedDirsChange: (dirs: string[]) => void;
  /** Small-screen bottom rail — the tours view collapses to just the About
   *  card with a Contributors button in place of the tour CTA. */
  isMobile: boolean;
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
  packages,
  packagesLoading,
  onReadFile,
  onPackageHover,
  onPackageSelect,
  configMode,
  onToggleConfigMode,
  leftViewMode,
  onSetViewMode,
  onToggleActivity,
  onSelectContributor,
  activityFocusContributor,
  contributorsFocus,
  selectedCommitSha,
  onSelectCommit,
  selectedIssueNumber,
  onSelectIssue,
  selectedPrNumber,
  onSelectPr,
  commitFiles,
  onCommitShasChange,
  onFocusShasChange,
  onHoverCommit,
  onActivityHoverShasChange,
  trailFileRows,
  selectedFilePath,
  onSelectFile,
  onOpenReadmeFile,
  readmeActive,
  tours,
  toursLoading,
  selectedTourId,
  onSelectTour,
  onRequestDeleteTour,
  dirPaths,
  filePaths,
  excludedDirs,
  onExcludedDirsChange,
  isMobile,
}) => {
  const { theme } = useTheme();
  // Repo-root README (if any), surfaced as a button in the About overview.
  const readmePath = useMemo(() => findReadmePath(filePaths), [filePaths]);

  // Mobile: the About view sizes the rail to its content (to push the map),
  // while the other views render through the fixed-height SlidePane. Measuring
  // the About rail's height and reusing it for those views keeps the rail from
  // jumping when you drill into Contributors/etc. Tracked while the tours view
  // is mounted; the last value persists for the other views.
  const toursAsideRef = useRef<HTMLElement>(null);
  const [mobileRailHeight, setMobileRailHeight] = useState<number | null>(null);
  useEffect(() => {
    if (!isMobile) return;
    const el = toursAsideRef.current;
    if (!el) return;
    const update = () => setMobileRailHeight(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isMobile, leftViewMode, configMode]);

  const toursPane = (
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
      onSelectContributor={onSelectContributor}
      readmePath={readmePath}
      readmeActive={readmeActive}
      onOpenReadme={() => {
        if (readmePath) onOpenReadmeFile(readmePath);
      }}
      trailCount={entries.length}
      packageCount={packages.length}
      onOpenView={onSetViewMode}
      isMobile={isMobile}
    />
  );

  // Mobile tours/About view: render the About card in normal flow so the rail
  // sizes to its content and *pushes the map* (RightPane is flex-1 and yields
  // the space), capping at 70% of the viewport and scrolling past that. The
  // SlidePane positions its panes `absolute inset-0`, so it can't take height
  // from content — this view bypasses it; the other mobile views keep the
  // fixed-height (h-[45%]) scroller below.
  if (isMobile && !configMode && leftViewMode === 'tours') {
    return (
      <aside
        ref={toursAsideRef}
        className="flex flex-col shrink-0 w-full max-h-[70%] overflow-y-auto overscroll-none border-t"
        style={{
          background: theme.colors.background,
          borderColor: theme.colors.border,
        }}
      >
        {toursPane}
      </aside>
    );
  }

  return (
    <aside
      className="flex flex-col shrink-0 w-full md:w-[25%] h-[45%] md:h-auto border-t md:border-t-0 md:border-r"
      style={{
        background: theme.colors.background,
        borderColor: theme.colors.border,
        // Match the height the About rail had so switching views doesn't jump
        // the rail (mobile only; desktop keeps md:h-auto). Falls back to the
        // h-[45%] class until the About view has been measured.
        ...(isMobile && mobileRailHeight != null
          ? { height: mobileRailHeight }
          : {}),
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

      <SlidePane
        viewKey={configMode ? 'config' : leftViewMode}
        resolveDirection={slideDirection}
      >
        {configMode ? (
        <FolderConfigPane
          dirPaths={dirPaths}
          filePaths={filePaths}
          excludedDirs={excludedDirs}
          onExcludedDirsChange={onExcludedDirsChange}
        />
      ) : leftViewMode === 'activity' ? (
        <RepoActivityPane
          owner={owner}
          repo={repo}
          selectedCommitSha={selectedCommitSha}
          onSelectCommit={onSelectCommit}
          commitFiles={commitFiles}
          onCommitShasChange={onCommitShasChange}
          onFocusShasChange={onFocusShasChange}
          onHoverCommit={onHoverCommit}
          onHoverShasChange={onActivityHoverShasChange}
          onClose={onToggleActivity}
          focusContributor={activityFocusContributor}
        />
      ) : leftViewMode === 'issues' ? (
        <RepoIssuesPane
          owner={owner}
          repo={repo}
          selectedIssueNumber={selectedIssueNumber}
          onSelectIssue={onSelectIssue}
          onClose={() => onSetViewMode('tours')}
        />
      ) : leftViewMode === 'pull-requests' ? (
        <RepoPullRequestsPane
          owner={owner}
          repo={repo}
          selectedPrNumber={selectedPrNumber}
          onSelectPr={onSelectPr}
          onClose={() => onSetViewMode('tours')}
        />
      ) : leftViewMode === 'structure' ? (
        <StructurePane
          packages={packages}
          packagesLoading={packagesLoading}
          onReadFile={onReadFile}
          onPackageHover={onPackageHover}
          onPackageSelect={onPackageSelect}
          onClose={() => onSetViewMode('tours')}
        />
      ) : leftViewMode === 'contributors' ? (
        <ContributorsPane
          owner={owner}
          repo={repo}
          focusContributor={contributorsFocus}
          onClose={() => onSetViewMode('tours')}
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
        toursPane
      ) : (
        <>
          <RailPaneHeader
            icon={<Footprints size={14} />}
            label="Trails"
            count={entries.length || undefined}
            onClose={() => onSetViewMode('tours')}
            closeAsBack
          />
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
              <TrailsEmptyState />
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
      </SlidePane>
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
  leftViewMode: LeftViewMode;
  onSetViewMode: (mode: LeftViewMode) => void;
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

// Shown in the trails list when a repo has no shared trails yet. Mirrors
// ToursEmptyState — a short explanation plus a single CTA that opens the shared
// "Create your own trail" modal (the same one the landing page uses).
const TrailsEmptyState: React.FC = () => {
  const { theme } = useTheme();
  const [showCreateModal, setShowCreateModal] = useState(false);
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <div
        className="flex items-center justify-center rounded-full"
        style={{
          width: 48,
          height: 48,
          background: `color-mix(in srgb, ${theme.colors.primary} 12%, transparent)`,
          color: theme.colors.primary,
        }}
      >
        <Footprints size={24} />
      </div>
      <div>
        <div
          style={{
            fontSize: theme.fontSizes[2],
            fontWeight: theme.fontWeights.semibold,
            color: theme.colors.text,
          }}
        >
          No trails yet
        </div>
        <p
          style={{
            margin: '4px 0 0',
            fontSize: theme.fontSizes[1],
            color: theme.colors.textMuted,
            lineHeight: 1.5,
          }}
        >
          Code trails are guided walkthroughs of this repository. Be the first to
          share one.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setShowCreateModal(true)}
        className="inline-flex items-center justify-center gap-2 rounded-md transition-opacity hover:opacity-90"
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
        <Footprints size={16} />
        Create a trail
      </button>
      <CreateTrailModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />
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
// Secondary, full-width "open the repo README" button. Shares the tour CTA's
// shape (rounded-md, same padding/typography) so it can sit beside a tour
// button and split the row evenly, or stand alone full-width.
const ReadmeButton: React.FC<{
  readmePath: string;
  onOpenReadme?: () => void;
  className?: string;
  // When the README view is open the button shows a filled "on" state;
  // otherwise it's the outlined "off" state.
  active?: boolean;
}> = ({ readmePath, onOpenReadme, className, active = false }) => {
  const { theme } = useTheme();
  return (
    <button
      type="button"
      onClick={onOpenReadme}
      aria-pressed={active}
      className={`inline-flex items-center justify-center gap-2 rounded-md transition-opacity hover:opacity-90 ${
        className ?? 'w-full'
      }`}
      style={{
        padding: '10px 14px',
        fontFamily: theme.fonts.body,
        fontSize: theme.fontSizes[1],
        fontWeight: theme.fontWeights.semibold,
        cursor: 'pointer',
        ...(active
          ? {
              background: theme.colors.primary,
              color: '#ffffff',
              border: `1px solid ${theme.colors.primary}`,
            }
          : {
              background: 'transparent',
              color: theme.colors.text,
              border: `1px solid ${theme.colors.border}`,
            }),
      }}
      title={active ? `Close ${readmePath} and show the city` : `Open ${readmePath}`}
    >
      {active ? <Building2 size={16} /> : <FileText size={16} />}
      {active ? 'City' : 'README'}
    </button>
  );
};

const ToursEmptyState: React.FC<{
  readmePath?: string | null;
  onOpenReadme?: () => void;
  readmeActive?: boolean;
}> = ({ readmePath = null, onOpenReadme, readmeActive = false }) => {
  const { theme } = useTheme();
  const [showAuthorModal, setShowAuthorModal] = useState(false);
  return (
    <>
      {/* When a README exists, the two buttons split the row evenly — README
          sits after the tour CTA. */}
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          onClick={() => setShowAuthorModal(true)}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-md transition-opacity hover:opacity-90"
          style={{
            padding: '10px 14px',
            fontFamily: theme.fonts.body,
            fontSize: theme.fontSizes[1],
            fontWeight: theme.fontWeights.semibold,
            cursor: 'pointer',
            background: 'transparent',
            color: theme.colors.primary,
            border: `1px solid ${theme.colors.primary}`,
          }}
        >
          <Compass size={16} />
          Create a tour
        </button>
        {readmePath && (
          <ReadmeButton
            readmePath={readmePath}
            onOpenReadme={onOpenReadme}
            className="flex-1"
            active={readmeActive}
          />
        )}
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
      // Record the visit in the global community feed too (public repos only;
      // the server gates on the GitHub `private` flag). Fire-and-forget — this
      // is telemetry for the home "Visited by others" rail, never load-bearing.
      void fetch('/api/repos/community-visits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, repo }),
      }).catch(() => {
        // ignore
      });
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

// A blame email → the GitHub account that authored it (avatar/login overlay for
// the contributor list). Read from GitHub's own email↔account links. Module-
// cached per email — including negatives — since the link changes rarely.
interface CommitAuthorIdentity {
  login: string;
  id: number;
  avatarUrl: string;
  htmlUrl: string;
}
const emailAuthorCache = new Map<string, CommitAuthorIdentity | null>();
const emailAuthorInflight = new Map<string, Promise<void>>();

function emailAuthorKey(owner: string, repo: string, email: string): string {
  return `${owner}/${repo}/${email.toLowerCase()}`;
}

/**
 * Overlay GitHub identity onto a set of blame emails, via the server (GitHub's
 * commits API). Only fetches emails not already cached; returns a lowercased-
 * email → identity|null map for those resolved so far, re-rendering as batches
 * land. Pass only emails that aren't already decodable as noreply, so the call
 * set stays small.
 */
function useCommitAuthorsByEmail(
  owner: string,
  repo: string,
  emails: string[],
  seed?: Record<string, CommitAuthorIdentity | null>,
): Record<string, CommitAuthorIdentity | null> {
  const [tick, setTick] = useState(0);

  // Deduped, lowercased request set — KEEPS the caller's order (highest
  // contribution first) so the most important identities resolve in the first
  // batches. Set preserves first-insertion order.
  const wanted = useMemo(
    () => Array.from(new Set(emails.map((e) => e.toLowerCase()))),
    [emails],
  );
  // Order-independent key so a pure reorder of the same set doesn't refire.
  const wantedKey = useMemo(() => [...wanted].sort().join(','), [wanted]);

  // Prime the module cache from the server-embedded map (GET payload) BEFORE the
  // resolve effect runs, so already-known emails never trigger a GitHub fan-out.
  // Effects fire in source order, so this lands first on mount.
  useEffect(() => {
    if (!seed) return;
    let changed = false;
    for (const [email, identity] of Object.entries(seed)) {
      const key = emailAuthorKey(owner, repo, email);
      if (!emailAuthorCache.has(key)) {
        emailAuthorCache.set(key, identity);
        changed = true;
      }
    }
    // Re-read so seeded identities show immediately, without waiting on a batch.
    if (changed) setTick((t) => t + 1);
  }, [owner, repo, seed]);

  useEffect(() => {
    if (wanted.length === 0) return;
    let cancelled = false;
    // The route caps `emails` at 80 (z.array().max(80)); a big repo's blame map
    // easily has more non-noreply emails than that, and a single over-cap query
    // is rejected wholesale — silently dropping every overlay. So chunk under
    // the cap, and walk the chunks SEQUENTIALLY in contribution order: the top
    // contributors resolve (and their rows light up) first, and we never fan a
    // dozen batches out at once into GitHub's secondary rate limit.
    const BATCH = 50;
    void (async () => {
      for (let i = 0; i < wanted.length && !cancelled; i += BATCH) {
        const chunk = wanted
          .slice(i, i + BATCH)
          .filter((e) => !emailAuthorCache.has(emailAuthorKey(owner, repo, e)));
        if (chunk.length === 0) continue;
        const batchKey = `${owner}/${repo}/${chunk.join(',')}`;
        const inflight = emailAuthorInflight.get(batchKey);
        if (inflight) {
          await inflight;
          continue;
        }
        const run = trpc.github.getCommitAuthorsByEmail
          .query({ owner, repo, emails: chunk })
          .then((res) => {
            for (const [email, identity] of Object.entries(res)) {
              emailAuthorCache.set(emailAuthorKey(owner, repo, email), identity);
            }
          })
          .catch(() => {
            /* rate-limited / private — leave these a miss, retried next mount */
          })
          .finally(() => {
            emailAuthorInflight.delete(batchKey);
          });
        emailAuthorInflight.set(batchKey, run);
        await run;
        // Re-render after each batch so resolved avatars appear top-down.
        if (!cancelled) setTick((t) => t + 1);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [owner, repo, wanted, wantedKey]);

  return useMemo(() => {
    const out: Record<string, CommitAuthorIdentity | null> = {};
    for (const e of wanted) {
      const key = emailAuthorKey(owner, repo, e);
      if (emailAuthorCache.has(key)) out[e] = emailAuthorCache.get(key) ?? null;
    }
    return out;
    // `tick` forces re-read after a batch resolves into the module cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, repo, wantedKey, tick]);
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
): { info: RepoOverviewInfo | null; loading: boolean } {
  const key = `${owner}/${repo}`;
  const [info, setInfo] = useState<RepoOverviewInfo | null>(
    () => repoInfoCache.get(key) ?? null,
  );
  // True only while the first fetch is genuinely in flight. Settles to false
  // once the request resolves — success OR failure — so a failed fetch (which
  // leaves info null) falls through to the empty render instead of pulsing a
  // skeleton forever.
  const [loading, setLoading] = useState<boolean>(() => !repoInfoCache.get(key));
  useEffect(() => {
    let cancelled = false;
    const cached = repoInfoCache.get(key) ?? null;
    setInfo(cached);
    setLoading(!cached);
    void fetchRepoInfo(owner, repo).then((d) => {
      if (cancelled) return;
      if (d) setInfo(d);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [owner, repo, key]);
  return { info, loading };
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

// Pick a directory's canonical README so a surface can offer to open it.
// With no `dir` (the default) this resolves the repo-root README: GitHub treats
// the root README as canonical, so we only look at top-level files (no slash).
// Pass a repo-relative `dir` to scope the search to that directory's own README
// — its immediate children only, not nested sub-packages — which is how a
// selected package surfaces its package-level README. Either way, prefer
// markdown variants.
function findReadmePath(
  filePaths: string[],
  dir: string | null = null,
): string | null {
  const prefix = dir ? `${dir.replace(/\/+$/, '')}/` : '';
  const matches = filePaths.filter((p) => {
    if (!p.startsWith(prefix)) return false;
    const rest = p.slice(prefix.length);
    return !rest.includes('/') && /^readme(\.|$)/i.test(rest);
  });
  if (matches.length === 0) return null;
  return (
    matches.find((p) => /\.md$/i.test(p)) ??
    matches.find((p) => /\.markdown$/i.test(p)) ??
    matches[0] ??
    null
  );
}

// Per-repo persistence of whether the readme view auto-opens. The readme is
// shown by default; closing it writes `false` so it stays closed on return,
// and re-opening writes `true`. `null` (unset) means "never decided" → default
// open. Wrapped in try/catch so SSR / disabled storage degrades gracefully.
function readmeOpenStorageKey(owner: string, repo: string): string {
  return `webade:readmeOpen:${owner}/${repo}`;
}
function readReadmeOpenPref(owner: string, repo: string): boolean | null {
  try {
    const v = window.localStorage.getItem(readmeOpenStorageKey(owner, repo));
    return v === null ? null : v === 'true';
  } catch {
    return null;
  }
}
function writeReadmeOpenPref(owner: string, repo: string, open: boolean): void {
  try {
    window.localStorage.setItem(
      readmeOpenStorageKey(owner, repo),
      open ? 'true' : 'false',
    );
  } catch {
    // ignore (storage unavailable / quota)
  }
}

// Placeholder shown while the overview metadata is still loading on a cold
// cache. Mirrors the real card's container + rough block layout (title row,
// description lines, contributor faces) so the swap to real content doesn't
// shift the pane. Pulses via the shared `pulse` keyframe.
const RepoOverviewSkeleton: React.FC<{ showBorder?: boolean }> = ({
  showBorder = true,
}) => {
  const { theme } = useTheme();
  const bar = (w: string | number, h: number, radius = 4): React.CSSProperties => ({
    width: w,
    height: h,
    borderRadius: radius,
    backgroundColor: theme.colors.border,
    animation: 'pulse 1.5s ease-in-out infinite',
  });
  return (
    <div
      className={`px-5 pt-5 pb-4 flex flex-col gap-3${showBorder ? ' border-b' : ''}`}
      style={{ borderColor: theme.colors.border }}
      aria-busy="true"
    >
      {/* Title row: repo name (left) + star/license (right). */}
      <div className="flex items-center justify-between gap-2">
        <div style={bar('45%', 22, 6)} />
        <div style={bar(56, 18, 6)} />
      </div>
      {/* Description: two lines. */}
      <div style={bar('100%', 14)} />
      <div style={bar('70%', 14)} />
      {/* Contributor faces row. */}
      <div className="flex flex-col gap-1.5 mt-1">
        <div style={bar(96, 10)} />
        <div className="flex items-stretch gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '9999px',
                  backgroundColor: theme.colors.border,
                  animation: 'pulse 1.5s ease-in-out infinite',
                }}
              />
              <div style={bar(40, 8)} />
            </div>
          ))}
        </div>
      </div>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
};

// One contributor card in the About card's avatar row, normalized across the two
// sources: GitHub's contributor graph (commits) and the cached blame analysis
// (line ownership). `hasLogin` marks a real GitHub identity (clickable); an
// unresolved blame author renders name-only with no avatar link.
type ContribCard = {
  key: string;
  login: string;
  name: string;
  hasLogin: boolean;
  avatarUrl?: string;
  htmlUrl?: string;
  commits: number;
  lines?: number;
  lineShare?: number;
};

const RepoOverview: React.FC<{
  owner: string;
  repo: string;
  // When false, drop the bottom divider so a caller can group the overview with
  // a control rendered directly beneath it (e.g. the single-tour "Start tour"
  // CTA) inside one card, with the dividing line carried below that control.
  showBorder?: boolean;
  // Click a contributor face → open their profile in the Contributors view.
  // When omitted, the faces fall back to linking out to GitHub.
  onSelectContributor?: (c: { login: string; avatar_url: string }) => void;
  // Action buttons (README + tour CTA) rendered inside the card, right after the
  // description.
  ctaSlot?: React.ReactNode;
}> = ({
  owner,
  repo,
  showBorder = true,
  onSelectContributor,
  ctaSlot,
}) => {
  const { theme } = useTheme();
  // Read from the shared cache, warmed at page mount (see warmRepoOverview), so
  // the metadata is typically ready the instant this card first renders.
  const { info, loading } = useRepoOverviewData(owner, repo);
  const contributors = useRepoContributorsData(owner, repo);

  // Which metric the contributor cards show: GitHub commit count vs the share
  // of repo lines blamed to them. The % option (and its toggle) is only
  // surfaced when a cached blame analysis exists for this repo.
  const [metricMode, setMetricMode] = useState<'commits' | 'percent'>('commits');

  const AVATAR_LIMIT = 4;

  // Cached, server-published blame analysis. useRepoAnalysis only sets this once
  // the S3 artifact exists (`cached: true`), so a non-null value IS our "does
  // coverage exist" signal — we never run the sweep here.
  const { analysis } = useRepoAnalysis();

  // Total blamed lines across the repo — only known once the cached analysis has
  // loaded, so the "N lines" fact stays hidden until then. Falsy (null before
  // load, or 0 when the repo has no blamed lines) means we fall back to file count.
  const totalLines = useMemo(
    () =>
      analysis
        ? Object.values(analysis.totalLines).reduce((sum, n) => sum + n, 0)
        : null,
    [analysis],
  );

  // File count from the same analysis — shown in the About fact row when a line
  // count isn't available (e.g. blame line totals came back empty).
  const fileCount = analysis?.fileCount ?? null;

  // Eagerly resolve GitHub identity for the head of the blame map so the "Lines"
  // avatar row has faces the moment the Commits/Lines switch is visible — instead
  // of waiting for the Contributors pane to mount. Bounded to a small head (the
  // row only shows AVATAR_LIMIT people; the ×3 headroom covers humans split
  // across several emails), so this is one tiny batch, not the pane's full-map
  // fan-out. Seeded with the baked overlay, so a warmed repo resolves these from
  // cache and never hits GitHub. analysisContributors is lines-desc, so the first
  // emails are the biggest owners.
  const lineEmailsToResolve = useMemo<string[]>(
    () =>
      analysis
        ? analysisContributors(analysis)
            .filter((p) => !p.noreplyLogin)
            .slice(0, AVATAR_LIMIT * 3)
            .map((p) => p.email)
        : [],
    [analysis],
  );
  const lineIdentities = useCommitAuthorsByEmail(
    owner,
    repo,
    lineEmailsToResolve,
    analysis?.identityByEmail,
  );

  // "Lines" people: top line-owners from the cached analysis. Emails are merged
  // into people using the live overlay above, falling back to the server-baked
  // identityByEmail map; a person GitHub can't attribute keeps a name/email key
  // and just renders without an avatar link.
  const linePeople = useMemo<ContribCard[]>(() => {
    if (!analysis) return [];
    const identityOf = (email: string): EmailIdentity | undefined => {
      const key = email.toLowerCase();
      const live = lineIdentities[key];
      if (live) {
        return {
          login: live.login,
          id: live.id,
          avatarUrl: live.avatarUrl,
          htmlUrl: live.htmlUrl,
        };
      }
      const o = analysis.identityByEmail?.[key];
      return o
        ? { login: o.login, id: o.id, avatarUrl: o.avatarUrl, htmlUrl: o.htmlUrl }
        : undefined;
    };
    return mergeContributors(analysis, analysisContributors(analysis), identityOf)
      .slice()
      .sort((a, b) => b.stats.lineShare - a.stats.lineShare)
      .slice(0, AVATAR_LIMIT)
      .map((p) => ({
        // Share the GitHub-id key with the commits list so a person who leads in
        // both views reuses the same card DOM node and FLIP-slides between slots.
        key: p.githubId != null ? `gh:${p.githubId}` : p.key,
        login: p.login ?? p.name,
        name: p.name,
        hasLogin: Boolean(p.login),
        avatarUrl: p.avatarUrl,
        htmlUrl: p.htmlUrl,
        commits: p.commits,
        lines: p.stats.lines,
        lineShare: p.stats.lineShare,
      }));
  }, [analysis, lineIdentities]);

  // "Commits" people: the top of GitHub's contributor graph (default avatar row).
  const commitPeople = useMemo<ContribCard[]>(
    () =>
      (contributors?.contributors ?? []).slice(0, AVATAR_LIMIT).map((c) => ({
        key: `gh:${c.id}`,
        login: c.login,
        name: c.login,
        hasLogin: true,
        avatarUrl: c.avatar_url,
        htmlUrl: c.html_url,
        commits: c.contributions,
      })),
    [contributors],
  );

  // The switch only appears when the cached analysis actually yielded owners.
  const hasCoverage = linePeople.length > 0;
  const cards =
    metricMode === 'percent' && hasCoverage ? linePeople : commitPeople;
  const orderKey = cards.map((c) => c.key).join(',');

  // FLIP: snapshot each card's box, then slide any card that shares a key across
  // a mode switch from its old slot to the new one for a smooth rearrange.
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const prevRects = useRef(new Map<string, DOMRect>());
  useLayoutEffect(() => {
    const refs = cardRefs.current;
    const snapshot = new Map<string, DOMRect>();
    refs.forEach((el, key) => {
      const next = el.getBoundingClientRect();
      snapshot.set(key, next); // record the true new layout box before transforming
      const prev = prevRects.current.get(key);
      const dx = prev ? prev.left - next.left : 0;
      if (dx) {
        el.style.transition = 'none';
        el.style.transform = `translateX(${dx}px)`;
        void el.offsetWidth; // force reflow so the start offset sticks
        requestAnimationFrame(() => {
          el.style.transition = 'transform 280ms cubic-bezier(0.2, 0, 0, 1)';
          el.style.transform = '';
        });
      }
    });
    prevRects.current = snapshot;
  }, [orderKey]);

  // While the first fetch is in flight (cold cache), show a skeleton sized to
  // the real card so the pane doesn't flash blank-then-pop. Once the fetch
  // settles with no info (e.g. a failed request), fall through to null rather
  // than pulsing forever. The tours list renders regardless (below this).
  if (!info)
    return loading ? (
      <RepoOverviewSkeleton showBorder={showBorder} />
    ) : null;

  const license =
    info.license?.spdx_id && info.license.spdx_id !== 'NOASSERTION'
      ? info.license.spdx_id
      : null;

  return (
    <div
      className={`px-5 pt-5 pb-4 flex flex-col gap-3${showBorder ? ' border-b' : ''}`}
      style={{ borderColor: theme.colors.border }}
    >
      {/* Repo name (links out to GitHub) leads the card, with the star count and
          license badge right-aligned. The last-push line lives in the Activity
          nav card's subtitle. */}
      <div className="flex items-center justify-between gap-2">
        <a
          href={`https://github.com/${owner}/${repo}`}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 transition-opacity hover:opacity-80"
          style={{ textDecoration: 'none' }}
          title={`Open ${owner}/${repo} on GitHub`}
        >
          <h1
            className="min-w-0"
            style={{
              margin: 0,
              fontFamily: theme.fonts.body,
              fontSize: theme.fontSizes[4],
              fontWeight: theme.fontWeights.bold,
              color: theme.colors.primary,
              lineHeight: 1.2,
              wordBreak: 'break-word',
            }}
          >
            {repo}
          </h1>
        </a>
        <div
          className="flex items-center gap-2 shrink-0"
          style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[1] }}
        >
          {license &&
            (() => {
              // MIT gets a green treatment; everything else stays neutral.
              const isMit = license === 'MIT';
              const accent = isMit
                ? theme.colors.success
                : theme.colors.textSecondary;
              return (
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: licenseBadgeRadius(license),
                    fontSize: theme.fontSizes[0],
                    fontWeight: theme.fontWeights.medium,
                    color: accent,
                    background: isMit
                      ? `color-mix(in srgb, ${theme.colors.success} 14%, transparent)`
                      : `color-mix(in srgb, ${theme.colors.text} 8%, transparent)`,
                    border: `1px solid ${
                      isMit
                        ? `color-mix(in srgb, ${theme.colors.success} 40%, transparent)`
                        : theme.colors.border
                    }`,
                  }}
                >
                  {license}
                </span>
              );
            })()}
          {info.stargazers_count > 0 && (
            <span
              className="inline-flex items-center gap-1"
              style={{ fontSize: theme.fontSizes[2] }}
            >
              <Star
                size={16}
                style={{ color: theme.colors.warning }}
                fill={theme.colors.warning}
              />
              {info.stargazers_count.toLocaleString()}
            </span>
          )}
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

      {/* Repo facts: age (left) + total blamed lines — or file count when line
          totals aren't available — on the right, once analysis loads. */}
      <div
        className="flex items-center justify-between gap-2"
        style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[1] }}
      >
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays size={14} />
          Created {relativeTime(info.created_at)}
        </span>
        {totalLines ? (
          <span className="inline-flex items-center gap-1.5">
            <AlignLeft size={14} />
            {totalLines.toLocaleString()} lines
          </span>
        ) : fileCount != null ? (
          <span className="inline-flex items-center gap-1.5">
            <FileText size={14} />
            {fileCount.toLocaleString()} files
          </span>
        ) : null}
      </div>

      {/* Contributor faces: the top contributors, each opening their profile in
          the Contributors view. Everyone else lives behind the "Contributors"
          nav card. */}
      {cards.length > 0 && (
        <div className="flex flex-col gap-1.5 mt-3">
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
              Top contributors
            </span>
            {/* Commits/% switch — only when blame coverage is available for
                these contributors; otherwise the cards just show commits. */}
            {hasCoverage && (
              <div
                className="inline-flex items-center rounded-md p-0.5 shrink-0"
                style={{
                  border: `1px solid ${theme.colors.border}`,
                  background: theme.colors.background,
                }}
              >
                {(['commits', 'percent'] as const).map((m) => {
                  const active = metricMode === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setMetricMode(m)}
                      className="rounded transition-opacity hover:opacity-90"
                      style={{
                        padding: '1px 7px',
                        minWidth: 54,
                        textAlign: 'center',
                        fontSize: theme.fontSizes[0],
                        fontWeight: theme.fontWeights.medium,
                        lineHeight: 1.5,
                        border: 'none',
                        cursor: 'pointer',
                        ...(active
                          ? { background: theme.colors.primary, color: '#ffffff' }
                          : {
                              background: 'transparent',
                              color: theme.colors.textSecondary,
                            }),
                      }}
                    >
                      {m === 'commits' ? 'Commits' : 'Lines'}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex items-stretch gap-2">
              {cards.map((c) => {
                // Each contributor is a little card: avatar on top, name, and a
                // metric below — commits by default, line-share % in "Lines" mode.
                const metricText =
                  metricMode === 'percent'
                    ? `${((c.lineShare ?? 0) * 100).toFixed(1)}%`
                    : c.commits.toLocaleString();
                const cardInner = (
                  <>
                    {c.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`${c.avatarUrl}${c.avatarUrl.includes('?') ? '&' : '?'}s=80`}
                        alt={c.login}
                        width={40}
                        height={40}
                        className="rounded-full block"
                        style={{ background: theme.colors.backgroundSecondary }}
                      />
                    ) : (
                      // Unresolved blame author (no GitHub identity) → initial.
                      <div
                        className="rounded-full flex items-center justify-center"
                        style={{
                          width: 40,
                          height: 40,
                          background: theme.colors.backgroundSecondary,
                          color: theme.colors.textSecondary,
                          fontSize: theme.fontSizes[1],
                          fontWeight: theme.fontWeights.semibold,
                        }}
                      >
                        {c.login.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span
                      className="block truncate w-full text-center"
                      style={{
                        fontSize: theme.fontSizes[0],
                        color: theme.colors.textSecondary,
                      }}
                    >
                      {c.login}
                    </span>
                    <span
                      className="block truncate w-full text-center"
                      style={{
                        fontSize: theme.fontSizes[0],
                        color: theme.colors.textMuted,
                      }}
                    >
                      {metricText}
                    </span>
                  </>
                );
                const tip =
                  c.lineShare != null
                    ? `${c.login} · ${((c.lineShare ?? 0) * 100).toFixed(1)}% of repo (${(c.lines ?? 0).toLocaleString()} lines) · ${c.commits.toLocaleString()} commits`
                    : `${c.login} · ${c.commits.toLocaleString()} commits`;
                const cardBase =
                  'flex flex-1 min-w-0 flex-col items-center gap-1.5 rounded-lg px-2 py-2';
                const cardStyle: React.CSSProperties = {
                  border: `1px solid ${theme.colors.border}`,
                  background: theme.colors.backgroundSecondary,
                };
                // Track the card element so the FLIP effect can slide it to its
                // new slot when the metric (and thus the order) changes.
                const setRef = (el: HTMLElement | null) => {
                  if (el) cardRefs.current.set(c.key, el);
                  else cardRefs.current.delete(c.key);
                };
                // Resolved contributor with a handler → opens their Contributors
                // profile; resolved without a handler → links to GitHub; an
                // unresolved blame author has no link target, so render it static.
                return onSelectContributor && c.hasLogin ? (
                  <button
                    key={c.key}
                    ref={setRef}
                    type="button"
                    onClick={() =>
                      onSelectContributor({
                        login: c.login,
                        avatar_url: c.avatarUrl ?? '',
                      })
                    }
                    title={`${tip} — view recent activity`}
                    className={`${cardBase} transition-transform hover:scale-105`}
                    style={{ ...cardStyle, cursor: 'pointer' }}
                  >
                    {cardInner}
                  </button>
                ) : c.htmlUrl ? (
                  <a
                    key={c.key}
                    ref={setRef}
                    href={c.htmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={tip}
                    className={`${cardBase} transition-transform hover:scale-105`}
                    style={cardStyle}
                  >
                    {cardInner}
                  </a>
                ) : (
                  <div
                    key={c.key}
                    ref={setRef}
                    title={tip}
                    className={cardBase}
                    style={cardStyle}
                  >
                    {cardInner}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {ctaSlot && <div className="mt-3">{ctaSlot}</div>}

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
    </div>
  );
};

// Full-rail Structure pane (opened from the "Structure" nav card): the package
// composition panel under a header with a close button that returns to the
// tours view. Mirrors the Activity pane's full-rail shape.
const StructurePane: React.FC<{
  packages: PackageLayer[];
  packagesLoading: boolean;
  onReadFile: (filePath: string) => Promise<string>;
  onPackageHover: (pkg: PackageLayer | null) => void;
  onPackageSelect: (pkg: PackageLayer | null) => void;
  onClose: () => void;
}> = ({
  packages,
  packagesLoading,
  onReadFile,
  onPackageHover,
  onPackageSelect,
  onClose,
}) => {
  const { theme } = useTheme();
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <RailPaneHeader
        icon={<Boxes size={14} />}
        label="Structure"
        count={packages.length || undefined}
        onClose={onClose}
        closeAsBack
      />
      {packages.length === 0 && !packagesLoading ? (
        <div
          className="flex-1 min-h-0 flex items-center justify-center px-6 text-center"
          style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[1] }}
        >
          No package structure detected for this repository.
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-hidden">
          <PackageCompositionPanelContent
            packages={packages}
            isLoading={packagesLoading}
            readFile={onReadFile}
            onPackageHover={onPackageHover}
            onPackageSelect={onPackageSelect}
          />
        </div>
      )}
    </div>
  );
};

// A unified contributor row, whatever the source. When analysis exists rows
// come from the blame map (every row has `stats` + `email`); otherwise from the
// GitHub contributor graph (commit counts, no coverage).
interface ContributorRow {
  /** Stable key: blame email (analysis) or GitHub login (fallback). */
  key: string;
  name: string;
  /** Small subtitle under the name (the email, or @login when overlaid). */
  secondary?: string;
  avatarUrl?: string;
  login?: string;
  htmlUrl?: string;
  /** Representative blame email (analysis mode) — shown in the profile detail. */
  email?: string;
  /** Every blame email folded into this person; the highlight unions them. */
  emails?: string[];
  stats?: ContributionStats;
  /** Commits (shortlog in analysis mode, GitHub contributions in fallback). */
  commits?: number;
}

// Round avatar with a letter fallback when no GitHub image is known (a blame
// email that didn't resolve to an account).
const ContributorAvatar: React.FC<{
  avatarUrl?: string;
  name: string;
  size: number;
}> = ({ avatarUrl, name, size }) => {
  const { theme } = useTheme();
  if (avatarUrl) {
    const sep = avatarUrl.includes('?') ? '&' : '?';
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`${avatarUrl}${sep}s=${size * 2}`}
        alt={name}
        width={size}
        height={size}
        className="rounded-full shrink-0"
        style={{ background: theme.colors.backgroundSecondary }}
      />
    );
  }
  return (
    <div
      className="rounded-full shrink-0 flex items-center justify-center"
      style={{
        width: size,
        height: size,
        background: theme.colors.backgroundSecondary,
        color: theme.colors.textMuted,
        fontSize: size * 0.45,
        fontWeight: 600,
      }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
};

// Full-rail Contributors pane (opened from the "Contributors" nav card / the
// "+N" chip): a scrolling list that drills into one contributor's profile, with
// a back button.
//
// Source of truth: once a repo analysis has been pulled, the list is built from
// the BLAME MAP (every email that owns code at HEAD), so each row always has
// coverage and clicking it always highlights — GitHub avatar/login is overlaid
// best-effort on top. Before any analysis, it falls back to GitHub's contributor
// graph (commit counts, no coverage).
const ContributorsPane: React.FC<{
  owner: string;
  repo: string;
  // When set (from the About card), pre-select this contributor's profile once
  // their row resolves. The token bumps per click so re-selecting re-drills.
  focusContributor?: { token: number; login: string } | null;
  onClose: () => void;
}> = ({ owner, repo, focusContributor, onClose }) => {
  const { theme } = useTheme();
  const { analysis, setSelectedEmails } = useRepoAnalysis();

  // Fallback source: GitHub contributor graph (used only before analysis).
  const githubData = useRepoContributorsData(owner, repo);
  const githubPeople = useMemo(
    () => githubData?.contributors ?? [],
    [githubData],
  );

  // Primary source: contributors derived straight from the blame map.
  const blamePeople = useMemo(
    () => (analysis ? analysisContributors(analysis) : []),
    [analysis],
  );

  // Overlay GitHub identity onto the non-noreply blame emails (noreply emails
  // already embed the login/id, so they need no lookup).
  const unresolvedEmails = useMemo(
    () => blamePeople.filter((p) => !p.noreplyLogin).map((p) => p.email),
    [blamePeople],
  );
  const emailAuthors = useCommitAuthorsByEmail(
    owner,
    repo,
    unresolvedEmails,
    analysis?.identityByEmail,
  );

  const rows = useMemo<ContributorRow[]>(() => {
    if (analysis) {
      // Collapse one human's several blame emails into a single person, keyed on
      // resolved GitHub id (with a name fallback for emails GitHub can't
      // attribute). The API overlay is the resolver; noreply emails carry their
      // own id and are resolved inside mergeContributors.
      const identityOf = (email: string): EmailIdentity | undefined => {
        const o = emailAuthors[email.toLowerCase()];
        return o ? { login: o.login, id: o.id, avatarUrl: o.avatarUrl, htmlUrl: o.htmlUrl } : undefined;
      };
      return mergeContributors(analysis, blamePeople, identityOf).map((p) => {
        const extra = p.emails.length - 1;
        return {
          key: p.key,
          email: p.emails[0],
          emails: p.emails,
          name: p.name,
          // When resolved, subtitle is the primary email (+N when merged);
          // otherwise the name already headlines, so no subtitle.
          secondary: p.login
            ? extra > 0
              ? `${p.emails[0]} +${extra}`
              : p.emails[0]
            : extra > 0
              ? `${p.emails[0]} +${extra}`
              : undefined,
          avatarUrl: p.avatarUrl,
          login: p.login,
          htmlUrl: p.htmlUrl,
          stats: p.stats,
          commits: p.commits,
        };
      });
    }
    return githubPeople.map((c) => ({
      key: c.login,
      login: c.login,
      name: c.login,
      avatarUrl: c.avatar_url,
      htmlUrl: c.html_url,
      commits: c.contributions,
    }));
  }, [analysis, blamePeople, emailAuthors, githubPeople]);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = selectedKey
    ? rows.find((r) => r.key === selectedKey) ?? null
    : null;

  const clearSelection = useCallback(() => {
    setSelectedKey(null);
    setSelectedEmails(null);
  }, [setSelectedEmails]);

  // Drop the contribution highlight layer when this pane unmounts — leaving the
  // Contributors view (back to About, or any other rail view) must clear it, not
  // just the explicit back/toggle inside the pane.
  useEffect(() => () => setSelectedEmails(null), [setSelectedEmails]);

  const handleRowClick = useCallback(
    (row: ContributorRow) => {
      // Toggle: clicking the active row clears; otherwise highlight the union
      // of every blame email this person owns.
      const active = row.key === selectedKey;
      setSelectedKey(active ? null : row.key);
      setSelectedEmails(active ? null : row.emails ?? (row.email ? [row.email] : null));
    },
    [selectedKey, setSelectedEmails],
  );

  // Pre-select the contributor requested from the About card. Rows resolve
  // async (GitHub identity overlays onto blame emails), so this runs whenever
  // rows change until the login matches; the applied-token ref makes it fire
  // once per click while still re-drilling when the token bumps.
  const appliedFocusToken = useRef<number | null>(null);
  useEffect(() => {
    if (!focusContributor) return;
    if (appliedFocusToken.current === focusContributor.token) return;
    const target = focusContributor.login.toLowerCase();
    const match = rows.find((r) => r.login?.toLowerCase() === target);
    if (!match) return; // login not resolved onto a row yet — wait for rows
    appliedFocusToken.current = focusContributor.token;
    setSelectedKey(match.key);
    setSelectedEmails(match.emails ?? (match.email ? [match.email] : null));
  }, [focusContributor, rows, setSelectedEmails]);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <RailPaneHeader
        icon={<Users size={14} />}
        label="Contributors"
        count={selected ? undefined : rows.length || undefined}
        onClose={onClose}
        onBack={selected ? clearSelection : undefined}
        closeAsBack
        crumb={
          selected
            ? selected.login
              ? `@${selected.login}`
              : selected.name
            : undefined
        }
      />

      <SlidePane
        viewKey={selected ? selected.key : 'list'}
        resolveDirection={(_from, to) => (to === 'list' ? -1 : 1)}
      >
      {selected ? (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <ContributorProfile
            key={selected.key}
            identity={{
              login: selected.login,
              name: selected.name,
              avatarUrl: selected.avatarUrl,
              htmlUrl: selected.htmlUrl,
              emails: selected.emails,
              commits: selected.commits,
            }}
            repo={repo}
            coverage={selected.stats ?? null}
          />
        </div>
      ) : (
        <>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {rows.length === 0 ? (
              <ListMessage>
                {analysis ? 'No attributed contributors.' : 'Loading contributors…'}
              </ListMessage>
            ) : (
              rows.map((row) => {
                const active = row.key === selectedKey;
                const share = row.stats?.lineShare ?? 0;
                return (
                  <button
                    key={row.key}
                    type="button"
                    onClick={() => handleRowClick(row)}
                    className="flex w-full flex-col gap-1.5 px-4 py-3 text-left border-b transition-colors"
                    style={{
                      borderColor: theme.colors.border,
                      color: theme.colors.text,
                      background: active
                        ? theme.colors.backgroundSecondary
                        : 'transparent',
                      boxShadow: active
                        ? `inset 3px 0 0 ${theme.colors.primary}`
                        : undefined,
                    }}
                    onMouseEnter={(e) => {
                      if (!active)
                        e.currentTarget.style.background =
                          theme.colors.backgroundSecondary;
                      // Preview this contributor's highlight on hover — no
                      // click needed. Rows in analysis mode carry `emails`;
                      // fallback (GitHub-graph) rows have none and nothing to
                      // highlight anyway. Hover only previews while nothing is
                      // pinned; once a row is selected it owns the highlight and
                      // stray enter/leave events during the slide-to-profile
                      // handoff must not disturb it.
                      if (!selected) setSelectedEmails(row.emails ?? null);
                    }}
                    onMouseLeave={(e) => {
                      if (!active)
                        e.currentTarget.style.background = 'transparent';
                      // Clearing the preview only makes sense while nothing is
                      // pinned. Clicking a row sets `selectedKey` and slides the
                      // pane to the profile; the trailing mouseleave that fires
                      // as this button slides out from under the cursor must NOT
                      // null the highlight, or the just-pinned selection would
                      // blink off. The selection now owns it (handleRowClick set
                      // selectedEmails); leave it alone.
                      if (!selected) setSelectedEmails(null);
                    }}
                  >
                    <div className="flex w-full items-center gap-3">
                      <ContributorAvatar
                        avatarUrl={row.avatarUrl}
                        name={row.name}
                        size={36}
                      />
                      <div className="min-w-0 flex flex-col">
                        <span
                          className="truncate"
                          style={{
                            fontSize: theme.fontSizes[2],
                            fontWeight: theme.fontWeights.semibold,
                          }}
                        >
                          {row.name}
                        </span>
                      </div>
                      <span
                        className="ml-auto shrink-0 text-right tabular-nums"
                        style={{
                          color: theme.colors.textMuted,
                          fontSize: theme.fontSizes[1],
                        }}
                        title={
                          row.stats
                            ? `${row.stats.lines.toLocaleString()} lines · ${row.stats.files.toLocaleString()} files`
                            : undefined
                        }
                      >
                        {row.stats
                          ? `${(share * 100).toFixed(1)}%`
                          : (row.commits ?? 0).toLocaleString()}
                      </span>
                    </div>
                    {/* Line-share bar — present whenever the row has coverage. */}
                    {row.stats && (
                      <div
                        className="h-1 w-full rounded-full overflow-hidden"
                        style={{ background: theme.colors.border }}
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(2, share * 100)}%`,
                            background: theme.colors.primary,
                          }}
                        />
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
          {!analysis && (
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
          )}
        </>
      )}
      </SlidePane>
    </div>
  );
};

// A labeled progress bar for one coverage metric in the contributor overview
// (lines attributed / files covered). `fraction` is in [0,1].
const CoverageMetric: React.FC<{
  label: string;
  fraction: number;
  detail: string;
  color: string;
}> = ({ label, fraction, detail, color }) => {
  const { theme } = useTheme();
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <div className="flex flex-col gap-1">
      <div
        className="flex items-baseline justify-between"
        style={{ color: theme.colors.text, fontSize: theme.fontSizes[1] }}
      >
        <span>{label}</span>
        <span
          className="tabular-nums"
          style={{ fontWeight: theme.fontWeights.semibold }}
        >
          {pct.toFixed(1)}%
        </span>
      </div>
      <div
        className="h-1.5 w-full rounded-full overflow-hidden"
        style={{ background: theme.colors.border }}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(2, pct)}%`, background: color }}
        />
      </div>
      <div
        className="tabular-nums"
        style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[0] }}
      >
        {detail}
      </div>
    </div>
  );
};

// Detail pane: the selected contributor's extended profile (contact info) plus
// a year's contribution heatmap, lazy-loaded from the /activity route.
const ContributorProfile: React.FC<{
  /** Resolved identity for the selected row. `login` is present only when the
   *  blame email mapped to a GitHub account (drives the activity heatmap). */
  identity: {
    login?: string;
    name: string;
    avatarUrl?: string;
    htmlUrl?: string;
    /** Every blame email folded into this person — listed in the profile body. */
    emails?: string[];
    commits?: number;
  };
  repo: string;
  /** Blame coverage for this contributor; null when no analysis ran. */
  coverage: ContributionStats | null;
}> = ({ identity, repo, coverage }) => {
  const { theme } = useTheme();
  const { data, loading } = useUserActivity(identity.login ?? null);

  const activityData = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of data?.contributions ?? []) m.set(d.date, d.count);
    return m;
  }, [data]);

  const profile = data?.user;
  const displayName = profile?.name || identity.name;
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
        <ContributorAvatar
          avatarUrl={identity.avatarUrl}
          name={identity.name}
          size={56}
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
          {identity.login && (
            <a
              href={identity.htmlUrl ?? `https://github.com/${identity.login}`}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate block transition-opacity hover:opacity-80"
              style={{ color: theme.colors.primary, fontSize: theme.fontSizes[1] }}
            >
              @{identity.login}
            </a>
          )}
        </div>
      </div>

      {/* Blame emails folded into this person — the addresses that own code
          here. Hidden from the list; surfaced once you drill into the profile. */}
      {identity.emails && identity.emails.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {identity.emails.map((email) => (
            <Fragment key={email}>
              {metaRow(<Mail size={14} />, email, `mailto:${email}`)}
            </Fragment>
          ))}
        </div>
      )}

      {/* Their commit count to THIS repo (shortlog / GitHub graph). */}
      {identity.commits != null && identity.commits > 0 && (
        <div
          style={{
            color: theme.colors.text,
            fontSize: theme.fontSizes[1],
          }}
        >
          <span style={{ fontWeight: theme.fontWeights.semibold }}>
            {identity.commits.toLocaleString()}
          </span>{' '}
          {identity.commits === 1 ? 'commit' : 'commits'} to {repo}
        </div>
      )}

      {/* Blame-derived coverage of the current HEAD — only when analysis ran. */}
      {coverage && (
        <div className="flex flex-col gap-2.5">
          <CoverageMetric
            label="Lines attributed"
            fraction={coverage.lineShare}
            detail={`${coverage.lines.toLocaleString()} / ${coverage.totalLines.toLocaleString()} lines`}
            color={theme.colors.primary}
          />
          <CoverageMetric
            label="Files covered"
            fraction={coverage.fileCoverage}
            detail={`${coverage.files.toLocaleString()} / ${coverage.totalFiles.toLocaleString()} files`}
            color={theme.colors.accent}
          />
        </div>
      )}

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

      {/* A year of contributions — GitHub-account-scoped, so only when the
          blame email resolved to a login. */}
      {identity.login && (
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
            <InlineTrailLoader size={18} />
          </div>
        ) : data ? (
          <div className="rounded-md overflow-hidden">
            <ActivityHeatmap activityData={activityData} bannerHeight={132} />
          </div>
        ) : (
          <div style={{ color: muted, fontSize: theme.fontSizes[1] }}>
            Activity unavailable.
          </div>
        )}
      </div>
      )}
    </div>
  );
};

// Nav cards rendered under the About card in the tours view: a compact grid of
// icon + label + count tiles, each swapping the rail to a full-rail view
// (Trails / Structure / Contributors / Activity) the same way Recent Activity
// does. Structure is hidden when no packages were detected.
const RepoNavCards: React.FC<{
  owner: string;
  repo: string;
  trailCount: number;
  packageCount: number;
  onOpenView: (mode: LeftViewMode) => void;
}> = ({ owner, repo, trailCount, packageCount, onOpenView }) => {
  const { theme } = useTheme();
  const contributors = useRepoContributorsData(owner, repo);
  const contributorCount = contributors?.contributors.length ?? 0;
  // The Activity card's subtitle carries the repo's last-push time.
  const { info } = useRepoOverviewData(owner, repo);

  const cards: {
    mode: LeftViewMode;
    icon: React.ReactNode;
    label: string;
    description: string;
    count?: number;
  }[] = [
    {
      mode: 'activity',
      icon: <Activity size={18} />,
      label: 'Activity',
      description: info?.pushed_at
        ? `Updated ${relativeTime(info.pushed_at)}`
        : 'Recent commits, by contributor',
    },
    {
      mode: 'issues',
      icon: <CircleDot size={18} />,
      label: 'Issues',
      description: 'Open issues and recent reports',
    },
    {
      mode: 'pull-requests',
      icon: <GitPullRequest size={18} />,
      label: 'Pull requests',
      description: 'Open PRs and what they change',
    },
    {
      mode: 'contributors',
      icon: <Users size={18} />,
      label: 'Contributors',
      description: 'The people who build this repo',
      count: contributorCount || undefined,
    },
    ...(packageCount > 0
      ? [
          {
            mode: 'structure' as const,
            icon: <Boxes size={18} />,
            label: 'Structure',
            description: 'Packages and how the repo is laid out',
            count: packageCount,
          },
        ]
      : []),
    {
      mode: 'trails',
      icon: <Footprints size={18} />,
      label: 'Trails',
      description: 'Guided walkthroughs of how the code works',
      count: trailCount || undefined,
    },
  ];

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      {cards.map((card) => (
        <button
          key={card.mode}
          type="button"
          onClick={() => onOpenView(card.mode)}
          className="flex items-center gap-3 rounded-md px-3 py-2.5 border text-left transition-colors border-[var(--card-border)] hover:border-[var(--card-border-hover)]"
          style={
            {
              background: theme.colors.backgroundSecondary,
              color: theme.colors.text,
              '--card-border': theme.colors.border,
              '--card-border-hover': theme.colors.primary,
            } as React.CSSProperties
          }
          title={`Open ${card.label.toLowerCase()}`}
        >
          <span
            className="shrink-0"
            style={{ color: theme.colors.textSecondary }}
          >
            {card.icon}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                style={{
                  fontSize: theme.fontSizes[2],
                  fontWeight: theme.fontWeights.semibold,
                }}
              >
                {card.label}
              </span>
              {card.count !== undefined && (
                <span
                  style={{
                    fontSize: theme.fontSizes[1],
                    color: theme.colors.textMuted,
                  }}
                >
                  {card.count}
                </span>
              )}
            </div>
            <div
              className="truncate"
              style={{
                fontSize: theme.fontSizes[1],
                color: theme.colors.textMuted,
                lineHeight: 1.3,
              }}
            >
              {card.description}
            </div>
          </div>
          <ChevronRight
            size={16}
            className="shrink-0"
            style={{ color: theme.colors.textMuted }}
          />
        </button>
      ))}
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
  // Click a contributor face in the About card → open their Contributors profile.
  onSelectContributor: (c: { login: string; avatar_url: string }) => void;
  // Repo-root README path (or null) + handler, forwarded to RepoOverview so the
  // About card can offer a "README" button.
  readmePath: string | null;
  onOpenReadme: () => void;
  // Whether the native readme mode is open — drives the README button on/off look.
  readmeActive: boolean;
  // Counts shown on the nav cards (Trails / Structure); Contributors fetches its
  // own count.
  trailCount: number;
  packageCount: number;
  // Open one of the full-rail nav-card views.
  onOpenView: (mode: LeftViewMode) => void;
  // Small-screen bottom rail: show only the About card, with a Contributors
  // button standing in for the tour CTA (nav cards + tours list hidden).
  isMobile: boolean;
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
  onSelectContributor,
  readmePath,
  onOpenReadme,
  readmeActive,
  trailCount,
  packageCount,
  onOpenView,
  isMobile,
}) => {
  const { theme } = useTheme();
  // With exactly one tour we collapse the list into a single "Start tour" CTA
  // (SingleTourCta) rather than a one-row list.
  const single = tours.length === 1 ? tours[0] : null;
  const singleCanDelete =
    single != null &&
    single.store != null &&
    viewerUserId !== null &&
    (viewerIsRepoAdmin ||
      String(single.store.createdBy.githubId) === String(viewerUserId));
  // Action buttons rendered inside the overview card, right after the
  // description: the single-tour "Start tour" CTA (or the empty-state "Create a
  // tour" CTA) split with the README button, or just README for multi-tour.
  const cta = single ? (
    <SingleTourCta
      active={single.tour.id === selectedTourId}
      onToggle={() =>
        onSelectTour(single.tour.id === selectedTourId ? null : single.tour.id)
      }
      canDelete={singleCanDelete}
      onDelete={() => onRequestDelete(single)}
      readmePath={readmePath}
      onOpenReadme={onOpenReadme}
      readmeActive={readmeActive}
    />
  ) : !loading && tours.length === 0 ? (
    <ToursEmptyState
      readmePath={readmePath}
      onOpenReadme={onOpenReadme}
      readmeActive={readmeActive}
    />
  ) : readmePath ? (
    <ReadmeButton
      readmePath={readmePath}
      onOpenReadme={onOpenReadme}
      active={readmeActive}
    />
  ) : null;

  // Mobile bottom rail: just the About card, with a Contributors button in
  // place of the tour CTA. The nav cards, tours list, and analysis footer are
  // dropped to keep the small-screen rail focused. Rendered in normal flow (no
  // flex-1 / internal scroller) so the enclosing rail sizes to this card's
  // content and pushes the map; the rail itself caps the height and scrolls.
  if (isMobile) {
    return (
      <RepoOverview
        owner={owner}
        repo={repo}
        showBorder={false}
        onSelectContributor={onSelectContributor}
        ctaSlot={
            <button
              type="button"
              onClick={() => onOpenView('contributors')}
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
              <Users size={16} />
              Contributors
            </button>
        }
      />
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Pinned header: the About card + the nav cards that swap the rail to
          the full-rail Trails / Structure / Contributors / Activity views. */}
      <div className="shrink-0">
        <RepoOverview
          owner={owner}
          repo={repo}
          onSelectContributor={onSelectContributor}
          ctaSlot={cta}
        />
        <RepoNavCards
          owner={owner}
          repo={repo}
          trailCount={trailCount}
          packageCount={packageCount}
          onOpenView={onOpenView}
        />
      </div>

      {/* Scrollable body: the multi-tour list (or a loading line).
          overscroll-none kills the elastic rubber-band at the scroll ends. */}
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
      </div>

      {/* Pinned footer: the Freestyle line-count panel, collapsed by default,
          held at the bottom of the rail below the scrollable tour list. */}
      <div className="shrink-0 border-t" style={{ borderColor: theme.colors.border }}>
        <RepoAnalysisStatus />
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
        <InlineTrailLoader size={12} />
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
  readmePath?: string | null;
  onOpenReadme?: () => void;
  readmeActive?: boolean;
}> = ({
  active,
  onToggle,
  canDelete,
  onDelete,
  readmePath = null,
  onOpenReadme,
  readmeActive = false,
}) => {
  const { theme } = useTheme();

  return (
    <div className="flex flex-col gap-2">
      {/* README (when present) splits the row evenly with the tour button,
          sitting after it. */}
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-md transition-opacity hover:opacity-90"
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
        {readmePath && (
          <ReadmeButton
            readmePath={readmePath}
            onOpenReadme={onOpenReadme}
            className="flex-1"
            active={readmeActive}
          />
        )}
      </div>

      {canDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="self-start inline-flex items-center gap-1 transition-opacity opacity-70 hover:opacity-100"
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
  /** Always on — the panel auto-builds the file-type legend; the reader toggles
   *  its visibility in-panel via `showColorLegendToggle`. */
  showColorLegend: boolean;
  /** Pin the in-panel top-right button that collapses/reopens the legend. */
  showColorLegendToggle: boolean;
  /** Initial open state of the legend — false on mobile so it starts collapsed. */
  defaultLegendOpen: boolean;
  /** Trails section expanded → render the Trail explorer; else the Tour panel. */
  trailsExpanded: boolean;
  /** Commit picked from the Activity list → fed to FileCityGuidePanel's commit
   *  mode via the `commit` slice; the panel reframes the city and draws the
   *  header / message / changed-file chrome over it. */
  onCloseCommit: () => void;
  /** Issue mode's ✕ → clears the selection, returning to the idle city. */
  onCloseIssue: () => void;
  /** PR mode's ✕ → clears the selection, returning to the idle city. */
  onClosePullRequest: () => void;
  /** Aggregate churn + hovered-commit heatmap, painted on the idle tour city
   *  while browsing the Activity list. */
  activityHeatmapLayers: HighlightLayer[] | null;
  /** Selected commit mapped to the panel's native CommitView (null while
   *  loading or when no commit is picked). */
  commitView: CommitView | null;
  commitViewLoading: boolean;
  /** Selected issue mapped to the panel's native IssueView (null while loading
   *  or when no issue is picked). */
  issueView: IssueView | null;
  issueViewLoading: boolean;
  /** Selected PR mapped to the panel's native PullRequestView (null while
   *  loading or when no PR is picked). */
  pullRequestView: PullRequestView | null;
  pullRequestViewLoading: boolean;
  /** README mapped to the panel's native ReadmeView → fed to FileCityGuidePanel's
   *  readme mode via the `readme` slice (markdown left + city + file-type
   *  legend). Null while loading or when the README isn't open. */
  readmeView: ReadmeView | null;
  readmeViewLoading: boolean;
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
  showColorLegendToggle,
  defaultLegendOpen,
  trailsExpanded,
  onCloseCommit,
  onCloseIssue,
  onClosePullRequest,
  activityHeatmapLayers,
  commitView,
  commitViewLoading,
  issueView,
  issueViewLoading,
  pullRequestView,
  pullRequestViewLoading,
  readmeView,
  readmeViewLoading,
  currentAuthor,
  overlayFilePath,
  overlayTrails,
  overlaySelectedTrailId,
  onSelectOverlayTrail,
  onCloseOverlay,
  onOpenFile,
}) => {
  const { theme } = useTheme();
  // Contribution-coverage highlight for the contributor picked in the
  // RepoAnalysisButton — blended into whichever panel is showing below.
  const { analysis, contributionLayers } = useRepoAnalysis();
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
  // shorthand; undefined when neither is present (reads HEAD). For the commit
  // view this is the commit sha, so post-change file contents resolve there.
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
  // The synthesized commit trail isn't a stored trail, so it can't be shared.
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
      data: contributionLayers
        ? [...(idleHighlightLayers ?? []), ...contributionLayers]
        : idleHighlightLayers,
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
      lineCounts: lineCountsSlice(analysis),
      trail: trailSlice,
      highlightLayers: highlightSlice,
      repository,
    };
  }, [
    fileTree,
    selectedPayload,
    idleHighlightLayers,
    contributionLayers,
    highlightLayersLoading,
    repository,
    analysis,
  ]);

  // Tour panel wiring. The tour panel takes one IntroductionTour at a time
  // and draws its own step UI.
  const tourRepository = useMemo<FileCityGuideRepository>(
    () => ({ id: `${owner}/${repo}`, owner, name: repo }),
    [owner, repo],
  );
  // Audio narration: fetch all step URLs upfront via the TTS backend, keyed by
  // step id (the panel looks up `audioUrls.get(step.id)`). The panel passes the
  // `tourAudioContext` we supply below straight back into this action.
  const tourActions = useMemo<FileCityGuidePanelActions>(
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
      // The commit mode's ✕ returns to the idle city by clearing the selection.
      closeCommit: () => onCloseCommit(),
      // The issue mode's ✕ does the same for a selected issue.
      closeIssue: () => onCloseIssue(),
      // And the PR mode's ✕ for a selected pull request.
      closePullRequest: () => onClosePullRequest(),
    }),
    [onOpenFile, onCloseCommit, onCloseIssue, onClosePullRequest],
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
    PanelContextValue<FileCityGuidePanelContext>
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
      lineCounts: lineCountsSlice(analysis),
      tour: tourSlice,
      // Picking a commit in the Activity list flips the panel into its native
      // commit mode (city framed top-right + header/message/file-list chrome).
      commit: {
        scope: 'repository' as const,
        name: 'commit',
        data: commitView,
        loading: commitViewLoading,
        error: null,
        refresh: async () => {},
      },
      // Picking an issue flips the panel into its native issue mode (header +
      // body + reporter card, city framed top-right).
      issue: {
        scope: 'repository' as const,
        name: 'issue',
        data: issueView,
        loading: issueViewLoading,
        error: null,
        refresh: async () => {},
      },
      // Picking a PR flips the panel into its native PR mode (header +
      // description + Files/Details tabs, changed buildings lit top-right).
      pullRequest: {
        scope: 'repository' as const,
        name: 'pullRequest',
        data: pullRequestView,
        loading: pullRequestViewLoading,
        error: null,
        refresh: async () => {},
      },
      // Opening the repo README flips the panel into its native readme mode
      // (markdown left + city framed top-right + file-type legend bottom-right).
      // Gated on no tour being open: the panel ranks readme above tour, so the
      // tour slice winning requires this to be null while a tour is active.
      readme: {
        scope: 'repository' as const,
        name: 'readme',
        data: selectedTour?.tour ? null : readmeView,
        loading: readmeViewLoading,
        error: null,
        refresh: async () => {},
      },
      // While a tour is open the panel sources highlights from the active
      // step and ignores this slice. In the idle/no-tour state (the default
      // right pane) it honors host layers — that's where the Architecture
      // panel's package directory highlight and the Activity churn heatmap land.
      highlightLayers: {
        scope: 'repository' as const,
        name: 'highlightLayers',
        data:
          packageHighlightLayers || activityHeatmapLayers || contributionLayers
            ? [
                ...(packageHighlightLayers ?? []),
                ...(activityHeatmapLayers ?? []),
                ...(contributionLayers ?? []),
              ]
            : null,
        loading: false,
        error: null,
        refresh: async () => {},
      },
      repository: tourRepository,
    };
  }, [
    fileTree,
    selectedTour,
    tourRepository,
    packageHighlightLayers,
    activityHeatmapLayers,
    contributionLayers,
    commitView,
    commitViewLoading,
    issueView,
    issueViewLoading,
    pullRequestView,
    pullRequestViewLoading,
    readmeView,
    readmeViewLoading,
    analysis,
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

  // The tour panel is the default right pane: idle colored city + file-type
  // legend when nothing is picked, tour chrome once a tour is open, and the
  // native commit view once a commit is selected (driven by the `commit`
  // slice). The Trail explorer (with its file overlay + share modal) takes
  // over only when the left-rail Trails section is expanded.
  if (!trailsExpanded) {
    return (
      <main
        className="flex-1 min-w-0 min-h-0 relative"
        style={{ background: theme.colors.background }}
      >
        <FileCityGuidePanel
          context={tourContext}
          actions={tourActions}
          events={events}
          tourAudioContext={tourAudioContext}
          autoAdvanceOnAudioEnd
          defaultIsolationMode="hide"
          excludedFolders={excludedFolders}
          showColorLegend={showColorLegend}
          // Top-right "Legend" button to collapse/reopen the file-type legend
          // (replaces the old header button).
          showColorLegendToggle={showColorLegendToggle}
          // Start collapsed on mobile; the toggle above still reopens it.
          defaultLegendOpen={defaultLegendOpen}
          // Top-left "Files" button to browse the idle city as a normal file
          // tree; tracks the focused package subtree.
          showFileTreeToggle
          // Selecting a package collapses the idle city onto its subtree and
          // frames the camera on it — no color over the buildings. Null when
          // nothing is selected (full city).
          idleFocusDirectory={idleFocusDirectory}
          // Readme mode: markdown column takes 66% of the canvas; the city +
          // file-type legend share the right 34%.
          readmeMarkdownWidth={0.66}
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

