'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTheme } from '@principal-ade/industry-theme';
import {
  X,
  MoveRight,
  ExternalLink,
  Search,
  Star,
  ChevronRight,
  Github,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { TrailCityDiagram } from '@/components/trail/TrailCityDiagram';
import { InlineTrailLoader } from '@/components/trail/InlineTrailLoader';
import { LgtmStamp, SignOffStampAnimation } from '@/components/trail/LgtmStamp';
import { UserAvatarMenu } from '@/components/UserAvatarMenu';
import { AgentViewButton } from '@/components/AgentViewButton';
import { HomeThemeToggle } from '@/components/HomeThemeToggle';
import { RecentProjectsStrip } from '@/components/home/RecentProjectsStrip';
import { TrailBackdrop } from '@/components/home/TrailBackdrop';
import { TrailsFeed } from '@/components/home/TrailsFeed';
import { TopicsFeed } from '@/components/home/TopicsFeed';
import { CreateTrailModal } from '@/components/home/CreateTrailModal';
import { NewTopicButton } from '@/components/NewTopicButton';
import { useAuth } from '@/contexts/AuthContext';

export const dynamic = 'force-dynamic';

type StampKind = 'LGTM' | 'ACK';

function parseGithubRepoPath(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Strip protocol / host / leading slash so we end up with `owner/repo[/...]`.
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

// Minimal shape of a repo for the opener's typeahead — satisfied by both
// `/api/github/search` results and the persisted `recent-repositories` entries.
interface HeaderRepoSearchItem {
  full_name: string;
  name: string;
  owner: { login: string; avatar_url: string };
  description?: string | null;
  stargazers_count?: number;
}

// localStorage key shared with the repo page / RecentRepositoriesPanel
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

export default function HomePage() {
  const { theme } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const signedIn = !!user;
  const [repoUrl, setRepoUrl] = useState('');
  const [repoFocused, setRepoFocused] = useState(false);
  const [flashLabel, setFlashLabel] = useState<string | null>(null);
  const [flashTyped, setFlashTyped] = useState('');

  // The header input doubles as a repo search bar — pasting a GitHub link opens
  // it directly, while typing a term shows a GitHub repo-search typeahead. The
  // dropdown also surfaces recently-visited repos before the user types.
  const [openRepoResults, setOpenRepoResults] = useState<HeaderRepoSearchItem[]>(
    [],
  );
  const [openRepoSearching, setOpenRepoSearching] = useState(false);
  const [recentRepos, setRecentRepos] = useState<HeaderRepoSearchItem[]>([]);
  // Recently-opened repos for the "pick up where you left off" strip at the
  // bottom of the page. Loaded once on mount (unlike `recentRepos`, which only
  // populates the search dropdown on focus) and refreshed when a repo is
  // visited elsewhere via the shared `recent-items-updated` event.
  const [recentProjects, setRecentProjects] = useState<HeaderRepoSearchItem[]>(
    [],
  );

  // A pasted link / `owner/repo` path is opened directly; anything else is a
  // free-text search. Computed each render so the input and dropdown agree.
  const openRepoDirect = parseGithubRepoPath(repoUrl);

  // Type out the flash label one character at a time, then navigate when done.
  useEffect(() => {
    if (flashLabel === null) {
      setFlashTyped('');
      return;
    }
    setFlashTyped('');
    let i = 0;
    const id = setInterval(() => {
      i++;
      setFlashTyped(flashLabel.slice(0, i));
      if (i >= flashLabel.length) clearInterval(id);
    }, 30);
    return () => clearInterval(id);
  }, [flashLabel]);

  const navigateToRepo = (owner: string, repo: string) => {
    const message = `Opening ${owner}/${repo}`;
    const duration = message.length * 30 + 350;
    setFlashLabel(message);
    setTimeout(() => router.push(`/${owner}/${repo}`), duration);
  };

  const handleRepoUrlPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    const parsed = parseGithubRepoPath(pasted);
    if (!parsed) return;
    e.preventDefault();
    setRepoUrl(pasted);
    navigateToRepo(parsed.owner, parsed.repo);
  };

  const handleRepoUrlKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const parsed = parseGithubRepoPath(repoUrl);
    if (parsed) {
      navigateToRepo(parsed.owner, parsed.repo);
      return;
    }
    // No direct path — fall back to the top search result, if any.
    const top = openRepoResults[0];
    if (top) {
      const [tOwner, tRepo] = top.full_name.split('/');
      if (tOwner && tRepo) navigateToRepo(tOwner, tRepo);
    }
  };

  // Load recently-visited repos when the input gains focus, so the dropdown has
  // something to show before the user types.
  useEffect(() => {
    if (!repoFocused) return;
    setRecentRepos(readRecentRepos().slice(0, 6));
  }, [repoFocused]);

  // Load the bottom recent-projects strip on mount, and keep it in sync when a
  // repo is opened from elsewhere on the page.
  useEffect(() => {
    const load = () => setRecentProjects(readRecentRepos().slice(0, 10));
    load();
    window.addEventListener('recent-items-updated', load);
    return () => window.removeEventListener('recent-items-updated', load);
  }, []);

  // Debounced GitHub repo search, skipped when the text is already a direct
  // link/path. Aborts in-flight requests so stale responses can't land.
  useEffect(() => {
    const q = repoUrl.trim();
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
  }, [repoUrl]);
  type View =
    | 'title'
    | 'fileCity'
    | 'codeTrail'
    | 'whyTrails'
    | 'stamped'
    | 'trails'
    | 'topics';
  const [view, setView] = useState<View>('title');
  const [fading, setFading] = useState(false);

  // Signed-in users belong on the app home (`/home`), not the marketing landing.
  // Middleware redirects fresh document navigations; this covers the in-page
  // case (logging in while already on `/`). The `?view=` feeds stay on `/`.
  useEffect(() => {
    if (signedIn && view === 'title') router.replace('/home');
  }, [signedIn, view, router]);
  const VIEW_FADE_MS = 700;
  const viewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const goToView = (next: View) => {
    if (viewTimerRef.current) clearTimeout(viewTimerRef.current);
    if (next === view) return;
    setFading(true);
    viewTimerRef.current = setTimeout(() => {
      setView(next);
      setFading(false);
    }, VIEW_FADE_MS);
  };
  useEffect(() => () => {
    if (viewTimerRef.current) clearTimeout(viewTimerRef.current);
  }, []);

  // Persist the trails/topics body views in the `?view=` query param so
  // navigating away and back lands on the same one, and so the browser Back
  // button steps out of a view. Genuine view switches push a history entry;
  // Back/Forward fire `popstate`, which syncs `view` from the URL (the
  // skip-flag stops that sync from pushing a redundant entry back).
  const viewHydratedRef = useRef(false);
  const skipHistoryRef = useRef(false);

  useEffect(() => {
    const onPopState = () => {
      const param = new URLSearchParams(window.location.search).get('view');
      const next: View = param === 'trails' || param === 'topics' ? param : 'title';
      skipHistoryRef.current = true;
      setView(next);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const writeUrl = (push: boolean) => {
      const url = new URL(window.location.href);
      if (view === 'trails' || view === 'topics') url.searchParams.set('view', view);
      else url.searchParams.delete('view');
      const fn = push ? 'pushState' : 'replaceState';
      window.history[fn](window.history.state, '', url);
    };

    if (!viewHydratedRef.current) {
      viewHydratedRef.current = true;
      const param = new URLSearchParams(window.location.search).get('view');
      if ((param === 'trails' || param === 'topics') && param !== view) {
        skipHistoryRef.current = true;
        setView(param);
        return; // wait for the re-render before writing the URL back
      }
      writeUrl(false); // normalize the initial entry without adding history
      return;
    }

    if (skipHistoryRef.current) {
      skipHistoryRef.current = false;
      return; // change came from hydrate/popstate — URL is already correct
    }

    writeUrl(true); // user-driven view switch → a Back-able history entry
  }, [view]);
  const [revealStep, setRevealStep] = useState(0);
  const [stepsRevealed, setStepsRevealed] = useState(0);
  const [diagramRevealed, setDiagramRevealed] = useState(false);
  const [diagramHovered, setDiagramHovered] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [stamp, setStamp] = useState<StampKind | null>(null);
  const [stampAnimating, setStampAnimating] = useState(false);
  const showExplanation = view !== 'title';
  const showTitle = revealStep >= 1;
  const showSubtitle = revealStep >= 2;
  const showHint = view === 'title' && revealStep >= 3;
  const showSecondaryCta = view === 'title' && revealStep >= 4;
  const diagramBorderActive = diagramHovered;

  const STEP_COUNT = 13;
  const STEP_INTERVAL = 110;
  const STEP_START = 200;

  // Each explanation blurb appears as a whole when its step opens — the
  // section container fades it in. The `...Shown` flags gate that step's
  // follow-up affordances (next-step button, snippet/trail reveal).
  const FILE_CITY_BLURB_LINE_1 = 'A 2D view of a file tree where each square is a file.';
  const FILE_CITY_BLURB_LINE_2 = 'This is the heart of code trails.';
  const fileCityShown = view === 'fileCity';

  // The snippet drops in a beat after the file-city blurb, rather than all at
  // once — same reveal cadence the codeTrail step uses for its trail.
  const [fileCityRevealed, setFileCityRevealed] = useState(false);
  useEffect(() => {
    if (!fileCityShown) {
      setFileCityRevealed(false);
      return;
    }
    const t = setTimeout(() => setFileCityRevealed(true), 700);
    return () => clearTimeout(t);
  }, [fileCityShown]);

  const CODE_TRAIL_BLURB =
    'It’s a guided walk through a codebase that focuses on what you need to know in that moment.';
  const codeTrailShown = view === 'codeTrail';

  // Holds the trail off-screen on the codeTrail step until 700ms after the
  // blurb appears — same beat the snippet uses on the fileCity step.
  const [codeTrailRevealed, setCodeTrailRevealed] = useState(false);
  useEffect(() => {
    if (!codeTrailShown) {
      setCodeTrailRevealed(false);
      return;
    }
    const t = setTimeout(() => setCodeTrailRevealed(true), 700);
    return () => clearTimeout(t);
  }, [codeTrailShown]);

  const WHY_LINE_1 =
    'They’re the quickest way for multiple parties to align on intent.';
  const WHY_LINE_2 =
    'Whether it’s you and your agent, or you and your team.';
  const WHY_LINE_3 =
    'Code trails help visualize comprehension debt. You don’t have to write the code to maintain a mental model, but you do have to ensure the implementation aligns with your intent.';
  const whyShown = view === 'whyTrails';

  const handleStamp = (kind: StampKind) => {
    if (stampAnimating || stamp) return;
    setStamp(kind);
    setStampAnimating(true);
    // Match the SignOffStampAnimation keyframe duration; advance to the
    // backlog / create-your-own step the moment the stamp settles.
    setTimeout(() => {
      setStampAnimating(false);
      goToView('stamped');
    }, 1100);
  };

  const resetToTitle = () => {
    setStampAnimating(false);
    if (viewTimerRef.current) clearTimeout(viewTimerRef.current);
    if (view === 'title') {
      setStamp(null);
      return;
    }
    setFading(true);
    viewTimerRef.current = setTimeout(() => {
      setView('title');
      setFading(false);
      setStamp(null);
    }, VIEW_FADE_MS);
  };

  useEffect(() => {
    const stepTimers = Array.from({ length: STEP_COUNT }, (_, i) =>
      setTimeout(() => setStepsRevealed(i + 1), STEP_START + i * STEP_INTERVAL),
    );
    const stepsDoneAt = STEP_START + STEP_COUNT * STEP_INTERVAL;
    const titleTimer = setTimeout(() => setRevealStep(1), stepsDoneAt + 500);
    const subtitleTimer = setTimeout(() => setRevealStep(2), stepsDoneAt + 1200);
    const diagramTimer = setTimeout(() => setDiagramRevealed(true), stepsDoneAt + 500);
    const exploreTimer = setTimeout(() => setRevealStep(3), stepsDoneAt + 2200);
    const secondaryTimer = setTimeout(() => setRevealStep(4), stepsDoneAt + 3000);
    return () => {
      stepTimers.forEach(clearTimeout);
      clearTimeout(diagramTimer);
      clearTimeout(titleTimer);
      clearTimeout(subtitleTimer);
      clearTimeout(exploreTimer);
      clearTimeout(secondaryTimer);
    };
  }, []);

  // Open a repo from its `owner/repo` full name (search result or recent).
  const goToRepoFullName = (fullName: string) => {
    const [o, r] = fullName.split('/');
    if (o && r) navigateToRepo(o, r);
  };

  // One result row, shared by the search results and the recent-repos list.
  const renderRepoRow = (r: HeaderRepoSearchItem) => (
    <button
      key={r.full_name}
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => goToRepoFullName(r.full_name)}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = `color-mix(in srgb, ${theme.colors.primary} 12%, transparent)`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
      className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors"
      style={{ color: theme.colors.text, background: 'transparent' }}
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

  // Dropdown only while focused and not mid-flash; before typing it shows
  // recent repos, after typing a direct-open hint or the search results.
  const showOpener = repoUrl.trim().length > 0;
  const showRecents = !showOpener && recentRepos.length > 0;
  const showDropdown =
    repoFocused && flashLabel === null && (showOpener || showRecents);

  return (
    <div
      className="h-viewport-fixed flex flex-col overflow-auto relative"
      style={{ background: theme.colors.background, color: theme.colors.text }}
    >
      {/* Ambient backdrop — out-of-focus city + trail fragments. */}
      <TrailBackdrop theme={theme} />

      <header
        className="sticky top-0 z-30 border-b backdrop-blur-xl"
        style={{
          borderColor: `color-mix(in srgb, ${theme.colors.border} 60%, transparent)`,
          background: `color-mix(in srgb, ${theme.colors.backgroundSecondary ?? theme.colors.background} 55%, transparent)`,
        }}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center min-w-0 gap-2">
            <Link
              href="/"
              className="flex items-center transition-opacity hover:opacity-80"
              onClick={(e) => {
                // Already on `/`; turn the logo into "back to the landing
                // view" whenever a body other than the hero is showing.
                if (view !== 'title') {
                  e.preventDefault();
                  resetToTitle();
                }
              }}
            >
              <h1
                className="text-2xl font-bold m-0"
                style={{ fontFamily: theme.fonts.body }}
              >
                <span style={{ color: theme.colors.text }}>Principal</span>
                {' '}
                <span style={{ color: theme.colors.primary }}>AI</span>
              </h1>
            </Link>
            {(view === 'trails' || view === 'topics') && (
              <>
                <span
                  className="text-2xl"
                  style={{ color: theme.colors.textMuted }}
                  aria-hidden="true"
                >
                  /
                </span>
                <span
                  className="text-base font-semibold truncate"
                  style={{ fontFamily: theme.fonts.body, color: theme.colors.text }}
                >
                  {view === 'trails' ? 'Trails' : 'Topics'}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
          {view === 'topics' && <NewTopicButton />}
          {view !== 'title' && view !== 'topics' && view !== 'trails' && (
            <button
              type="button"
              onClick={resetToTitle}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors hover:opacity-80"
              style={{
                border: `1px solid color-mix(in srgb, ${theme.colors.border} 70%, transparent)`,
                color: theme.colors.textMuted,
                background: `color-mix(in srgb, ${theme.colors.surface} 60%, transparent)`,
              }}
              aria-label="Exit"
            >
              <X size={14} />
              <span className="hidden sm:inline">Exit</span>
            </button>
          )}
          {view !== 'topics' && (
          <div className="relative hidden sm:block">
          <div
            role="search"
            aria-label="Open a GitHub repository"
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 transition-colors ${
              flashLabel ? 'repo-url-flash' : ''
            }`}
            style={{
              background: `color-mix(in srgb, ${theme.colors.surface} 60%, transparent)`,
              border: `1px solid ${
                flashLabel
                  ? '#22c55e'
                  : repoFocused
                    ? `color-mix(in srgb, ${theme.colors.primary} 70%, transparent)`
                    : `color-mix(in srgb, ${theme.colors.border} 70%, transparent)`
              }`,
              transition: 'border-color 0.2s, box-shadow 0.2s, background-color 0.15s',
            }}
          >
            <style>{`
              @keyframes repoUrlFlashGlow {
                0%   { box-shadow: 0 0 0 0px rgba(34,197,94,0.5); }
                30%  { box-shadow: 0 0 0 4px rgba(34,197,94,0.25); }
                100% { box-shadow: 0 0 0 3px rgba(34,197,94,0.0); }
              }
              .repo-url-flash { animation: repoUrlFlashGlow 0.6s ease-out forwards; }
            `}</style>
            {flashLabel ? (
              <ExternalLink size={14} color="#22c55e" style={{ flexShrink: 0 }} />
            ) : (
              <Search
                size={14}
                color={repoFocused ? theme.colors.primary : theme.colors.textMuted}
                style={{ flexShrink: 0, transition: 'color 0.15s' }}
              />
            )}
            <input
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={flashLabel !== null ? flashTyped : repoUrl}
              readOnly={flashLabel !== null}
              onChange={(e) => setRepoUrl(e.target.value)}
              onPaste={handleRepoUrlPaste}
              onKeyDown={handleRepoUrlKeyDown}
              onFocus={() => setRepoFocused(true)}
              onBlur={() => setRepoFocused(false)}
              placeholder="Search repos or paste a link…"
              aria-label="Search repositories or paste a GitHub link"
              className="w-56 sm:w-72 bg-transparent border-0 outline-none text-sm"
              style={{
                color: flashLabel ? '#22c55e' : theme.colors.text,
                transition: 'color 0.2s',
              }}
            />
          </div>

          {/* Dropdown: recent repos before the user types, then a direct-open
              hint for links / GitHub repo-search results. */}
          {showDropdown && (
            <div
              className="absolute top-full right-0 mt-1.5 w-96 max-w-[80vw] rounded-lg overflow-hidden z-[1000]"
              style={{
                background: theme.colors.surface,
                border: `1px solid ${theme.colors.border}`,
                boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
              }}
            >
              {!showOpener ? (
                <>
                  {dropdownLabel('Recent')}
                  <div className="max-h-96 overflow-y-auto pb-1">
                    {recentRepos.map(renderRepoRow)}
                  </div>
                </>
              ) : openRepoDirect ? (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() =>
                    navigateToRepo(openRepoDirect.owner, openRepoDirect.repo)
                  }
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = `color-mix(in srgb, ${theme.colors.primary} 12%, transparent)`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left transition-colors"
                  style={{ color: theme.colors.text, background: 'transparent' }}
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
                  <InlineTrailLoader size={16} />
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
          )}
            <HomeThemeToggle />
            <div className="hidden sm:flex">
              <AgentViewButton path="/" />
            </div>
            <UserAvatarMenu
              hideLoginButton={
                view !== 'title' && view !== 'trails' && view !== 'topics'
              }
            />
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col relative">
        {view === 'trails' || view === 'topics' ? (
          <section
            className={`flex-1 w-full px-6 py-10 transition-opacity duration-700 ${
              fading ? 'opacity-0' : 'opacity-100'
            }`}
          >
            {view === 'trails' ? <TrailsFeed /> : <TopicsFeed />}
          </section>
        ) : signedIn ? (
          // Signed-in users belong on the app home (`/home`). Middleware
          // redirects fresh navigations there; this covers the in-page case
          // (e.g. logging in while on `/`).
          <section className="flex-1 flex items-center justify-center">
            <span style={{ color: theme.colors.textMuted }}>Loading…</span>
          </section>
        ) : (
        <section className="flex-1 w-full max-w-7xl mx-auto px-6 py-8 flex items-center">
          <div className="w-full grid lg:grid-cols-2 gap-12 lg:gap-10 items-center">
            <div className="relative text-center lg:text-left min-h-[260px]">
              {/* Title — fades out when the user opens the file-city explanation. */}
              <div
                className={`transition-opacity duration-700 ${view === 'title' && !fading ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                aria-hidden={view !== 'title' || fading}
              >
                <div
                  className="flex items-center justify-center lg:justify-start gap-3 sm:gap-5 lg:gap-7 mb-6 h-10 sm:h-12 [&_svg]:!w-3 [&_svg]:!h-6 sm:[&_svg]:!w-[14px] sm:[&_svg]:!h-7 lg:[&_svg]:!w-[18px] lg:[&_svg]:!h-9"
                  aria-hidden
                >
                  {Array.from({ length: STEP_COUNT }).map((_, i) => {
                    const side = i % 2 === 0 ? 'left' : 'right';
                    return (
                      <span
                        key={i}
                        className="inline-block transition-opacity duration-500 ease-out"
                        style={{
                          opacity: i < stepsRevealed ? 1 : 0,
                          transform: `translateY(${side === 'left' ? '-7px' : '7px'}) rotate(90deg)`,
                          transformOrigin: 'center',
                        }}
                      >
                        <Footprint side={side} size={18} color={theme.colors.primary} />
                      </span>
                    );
                  })}
                </div>

                <h1
                  className={`text-6xl md:text-7xl xl:text-8xl font-semibold tracking-tight leading-[0.95] mb-6 transition-opacity duration-700 ease-out ${
                    showTitle ? 'opacity-100' : 'opacity-0'
                  }`}
                  style={{ color: theme.colors.text }}
                >
                  Code trails
                </h1>

                <p
                  className={`text-xl md:text-2xl max-w-xl mx-auto lg:mx-0 lg:pl-5 leading-relaxed mb-6 transition-opacity duration-700 ease-out ${
                    showSubtitle ? 'opacity-100' : 'opacity-0'
                  }`}
                  style={{ color: theme.colors.text }}
                >
                  A new way to understand software
                </p>

                <div
                  className={`lg:pl-5 flex flex-col items-center lg:items-start gap-2 transition-opacity duration-700 ease-out ${
                    showHint ? 'opacity-100' : 'opacity-0 pointer-events-none'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(true)}
                    className="inline-flex items-center justify-center gap-1.5 w-64 px-5 py-2.5 rounded-md text-base font-medium transition-opacity hover:opacity-80"
                    style={{
                      background: theme.colors.primary,
                      color: theme.colors.background,
                    }}
                    tabIndex={showHint ? 0 : -1}
                  >
                    Create a Trail
                  </button>
                  <button
                    type="button"
                    onClick={() => goToView('trails')}
                    className="inline-flex items-center justify-center gap-1.5 w-64 px-5 py-2.5 rounded-md text-base font-medium transition-opacity hover:opacity-80"
                    style={{
                      background: `color-mix(in srgb, ${theme.colors.primary} 18%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${theme.colors.primary} 50%, transparent)`,
                      color: theme.colors.primary,
                    }}
                    tabIndex={showHint ? 0 : -1}
                  >
                    View Trails
                  </button>
                  {/* Topics CTA temporarily hidden. */}
                  {false && (
                  <button
                    type="button"
                    onClick={() => goToView('topics')}
                    className="inline-flex items-center justify-center gap-1.5 w-64 px-5 py-2.5 rounded-md text-base font-medium transition-opacity hover:opacity-80"
                    style={{
                      background: `color-mix(in srgb, ${theme.colors.primary} 18%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${theme.colors.primary} 50%, transparent)`,
                      color: theme.colors.primary,
                    }}
                    tabIndex={showHint ? 0 : -1}
                  >
                    View Topics
                  </button>
                  )}
                  <span
                    className={`text-sm w-64 text-center transition-opacity duration-700 ease-out ${
                      showSecondaryCta ? 'opacity-100' : 'opacity-0'
                    }`}
                    style={{ color: theme.colors.textMuted }}
                    aria-hidden
                  >
                    or
                  </span>
                  <button
                    type="button"
                    onClick={() => goToView('fileCity')}
                    className={`inline-flex items-center justify-center gap-2 w-64 px-5 py-2.5 rounded-md text-base font-medium transition-opacity duration-700 ease-out hover:opacity-80 ${
                      showSecondaryCta ? 'opacity-100' : 'opacity-0 pointer-events-none'
                    }`}
                    style={{
                      background: `color-mix(in srgb, ${theme.colors.primary} 18%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${theme.colors.primary} 50%, transparent)`,
                      color: theme.colors.primary,
                    }}
                    tabIndex={showSecondaryCta ? 0 : -1}
                    aria-hidden={!showSecondaryCta}
                  >
                    Click to Learn More
                    <MoveRight
                      size={18}
                      strokeWidth={2.25}
                      className="hint-arrow-bounce"
                    />
                  </button>
                </div>
                <style>{`
                  @keyframes hintArrow {
                    0%, 100% { transform: translateX(0); }
                    50% { transform: translateX(6px); }
                  }
                  .hint-arrow-bounce { animation: hintArrow 1.1s ease-in-out infinite; }
                `}</style>
              </div>

              {/* File-city explanation. */}
              <div
                className={`absolute inset-x-0 bottom-0 top-4 lg:top-32 transition-opacity duration-700 ${view === 'fileCity' && !fading ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                aria-hidden={view !== 'fileCity' || fading}
              >
                <h2
                  className="text-3xl md:text-4xl font-semibold tracking-tight mb-4"
                  style={{ color: theme.colors.primary }}
                >
                  What&rsquo;s a File City?
                </h2>
                <div
                  className="text-base md:text-lg leading-relaxed mb-6"
                  style={{ color: theme.colors.text }}
                >
                  <p>{FILE_CITY_BLURB_LINE_1}</p>
                  <p className="mt-2">{FILE_CITY_BLURB_LINE_2}</p>
                </div>
                <div
                  className="transition-opacity duration-500 delay-[1800ms]"
                  style={{
                    opacity: fileCityShown ? 1 : 0,
                    pointerEvents: fileCityShown ? 'auto' : 'none',
                  }}
                  aria-hidden={!fileCityShown}
                >
                  <button
                    type="button"
                    onClick={() => goToView('codeTrail')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-opacity hover:opacity-80"
                    style={{
                      background: `color-mix(in srgb, ${theme.colors.primary} 18%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${theme.colors.primary} 50%, transparent)`,
                      color: theme.colors.primary,
                    }}
                    tabIndex={fileCityShown ? 0 : -1}
                  >
                    What is a Code Trail?
                  </button>
                </div>
              </div>

              {/* Code-trail explanation. */}
              <div
                className={`absolute inset-x-0 bottom-0 top-4 lg:top-32 transition-opacity duration-700 ${view === 'codeTrail' && !fading ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                aria-hidden={view !== 'codeTrail' || fading}
              >
                <h2
                  className="text-3xl md:text-4xl font-semibold tracking-tight mb-4"
                  style={{ color: theme.colors.primary }}
                >
                  What is a Code Trail?
                </h2>
                <div
                  className="text-base md:text-lg leading-relaxed mb-6"
                  style={{ color: theme.colors.text }}
                >
                  <p>{CODE_TRAIL_BLURB}</p>
                </div>
                <div
                  className="transition-opacity duration-500 delay-[1800ms]"
                  style={{
                    opacity: codeTrailShown ? 1 : 0,
                    pointerEvents: codeTrailShown ? 'auto' : 'none',
                  }}
                  aria-hidden={!codeTrailShown}
                >
                  <button
                    type="button"
                    onClick={() => goToView(stamp ? 'stamped' : 'whyTrails')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-opacity hover:opacity-80"
                    style={{
                      background: `color-mix(in srgb, ${theme.colors.primary} 18%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${theme.colors.primary} 50%, transparent)`,
                      color: theme.colors.primary,
                    }}
                    tabIndex={codeTrailShown ? 0 : -1}
                  >
                    Why do I need Code Trails?
                  </button>
                </div>
              </div>

              {/* Why-trails / Mark Twain quote — sign-off step. */}
              <div
                className={`absolute inset-x-0 bottom-0 top-4 lg:top-32 transition-opacity duration-700 ${view === 'whyTrails' && !fading ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                aria-hidden={view !== 'whyTrails' || fading}
              >
                <h2
                  className="text-3xl md:text-4xl font-semibold tracking-tight mb-4"
                  style={{ color: theme.colors.primary }}
                >
                  Why do I need Code Trails?
                </h2>
                <div
                  className="text-base md:text-lg leading-relaxed mb-6"
                  style={{ color: theme.colors.text }}
                >
                  <p className="mb-3">{WHY_LINE_1}</p>
                  <p style={{ color: theme.colors.primary }}>{WHY_LINE_2}</p>
                  <p className="mt-3">{WHY_LINE_3}</p>
                </div>
              </div>

              {/* Stamped — backlog / create-your-own follow-ups. */}
              <div
                className={`absolute inset-x-0 bottom-0 top-4 lg:top-32 transition-opacity duration-700 ${view === 'stamped' && !fading ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                aria-hidden={view !== 'stamped' || fading}
              >
                <h2
                  className="text-3xl md:text-4xl font-semibold tracking-tight mb-6"
                  style={{ color: theme.colors.primary }}
                >
                  Trail Stamped.
                </h2>
                <div className="flex flex-col items-center lg:items-start sm:flex-row sm:justify-center lg:justify-start sm:items-center sm:flex-wrap gap-x-3 gap-y-2 text-base">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md font-medium transition-colors hover:opacity-80"
                    style={{
                      background: `color-mix(in srgb, ${theme.colors.primary} 18%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${theme.colors.primary} 50%, transparent)`,
                      color: theme.colors.primary,
                    }}
                  >
                    Create your own trail
                  </button>
                  <span className="self-center" style={{ color: theme.colors.textMuted }}>or</span>
                  <button
                    type="button"
                    onClick={() => goToView('title')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md font-medium transition-opacity hover:opacity-80"
                    style={{
                      background: theme.colors.primary,
                      color: theme.colors.background,
                    }}
                  >
                    Finish
                  </button>
                </div>
              </div>
            </div>

            <div className="relative w-full max-w-xs sm:max-w-sm mx-auto lg:max-w-none">
              <button
                type="button"
                onClick={() => {
                  if (stampAnimating) return;
                  goToView(view === 'fileCity' ? 'title' : 'fileCity');
                }}
                className={`group rounded-2xl overflow-hidden backdrop-blur-xl p-2 cursor-pointer text-left transition-opacity duration-700 ease-out w-full ${
                  diagramRevealed ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
                style={{
                  background: `color-mix(in srgb, ${theme.colors.surface} 35%, transparent)`,
                }}
                onMouseEnter={() => setDiagramHovered(true)}
                onMouseLeave={() => setDiagramHovered(false)}
                aria-label={showExplanation ? 'Hide file-city explanation' : 'Show file-city explanation'}
                aria-pressed={showExplanation}
                aria-hidden={!diagramRevealed}
              >
                <div
                  className="rounded-xl overflow-hidden transition-colors duration-200"
                  style={{
                    border: `1px solid ${
                      diagramBorderActive
                        ? `color-mix(in srgb, ${theme.colors.primary} 70%, transparent)`
                        : `color-mix(in srgb, ${theme.colors.border} 50%, transparent)`
                    }`,
                  }}
                >
                  <TrailCityDiagram
                    highlightTrail={codeTrailRevealed}
                    hideTrail={view === 'fileCity'}
                    trailVisible={view !== 'codeTrail' || codeTrailRevealed}
                    hideSnippet={false}
                    snippetVisible={view !== 'fileCity' || fileCityRevealed}
                    stampRowVisible={
                      view === 'title' ||
                      (view === 'whyTrails' && whyShown) ||
                      view === 'stamped'
                    }
                    userStamped={stamp !== null}
                  />
                </div>
              </button>

              {view === 'whyTrails' && (
                <div className="mt-4">
                  <p
                    className="text-sm md:text-base mb-3 text-center transition-opacity duration-500"
                    style={{
                      color: theme.colors.textMuted,
                      opacity: whyShown ? 1 : 0,
                    }}
                    aria-hidden={!whyShown}
                  >
                    Sign off on this trail to continue.
                  </p>
                  <div
                    className="flex flex-col items-center sm:flex-row sm:justify-center sm:items-center gap-3 text-base transition-opacity duration-500"
                    style={{
                      opacity: whyShown ? 1 : 0,
                      pointerEvents: whyShown ? 'auto' : 'none',
                    }}
                    aria-hidden={!whyShown}
                  >
                    <button
                      type="button"
                      onClick={() => handleStamp('LGTM')}
                      disabled={stampAnimating || stamp !== null || !whyShown}
                      tabIndex={whyShown ? 0 : -1}
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-md font-mono font-semibold tracking-wider transition-opacity hover:opacity-80 disabled:opacity-60 disabled:cursor-not-allowed"
                      style={{
                        background: theme.colors.success,
                        color: theme.colors.background,
                        letterSpacing: '0.12em',
                      }}
                      aria-label="Sign off with LGTM"
                    >
                      LGTM
                    </button>
                  </div>
                </div>
              )}

              {/* Sign-off stamp lands on the empty placeholder slot in
                  the stamp row, so the visitor's signature visibly joins
                  the team's prior approvals. */}
              {stampAnimating && stamp && (
                <SignOffStampAnimation
                  theme={theme}
                  text="ME"
                  subtitle={stamp}
                  ink={
                    stamp === 'ACK' ? '#d1d8e0' : theme.colors.success
                  }
                  size={72}
                  left="84%"
                  top="45%"
                />
              )}

              {!stampAnimating && stamp && (
                <div
                  aria-hidden
                  className={`absolute pointer-events-none transition-opacity duration-700 ease-out ${
                    diagramRevealed ? 'opacity-100' : 'opacity-0'
                  }`}
                  style={{
                    left: '84%',
                    top: '45%',
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <style>{`
                    @keyframes stamp-settle {
                      0%   { transform: rotate(-8deg) scale(1.6); opacity: 0; }
                      100% { transform: rotate(-8deg) scale(1); opacity: 1; }
                    }
                  `}</style>
                  <div
                    style={{
                      transform: 'rotate(-8deg)',
                      animation: 'stamp-settle 320ms ease-out both',
                    }}
                  >
                    <LgtmStamp
                      theme={theme}
                      size={72}
                      rotated={false}
                      text="ME"
                      subtitle={stamp ?? 'LGTM'}
                      ink={
                        stamp === 'ACK' ? '#d1d8e0' : theme.colors.success
                      }
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
        )}

        {view !== 'trails' && view !== 'topics' && (
          <RecentProjectsStrip
            projects={recentProjects}
            onOpen={goToRepoFullName}
          />
        )}
      </main>

      <footer
        className="border-t text-xs backdrop-blur-xl relative z-10"
        style={{
          borderColor: `color-mix(in srgb, ${theme.colors.border} 60%, transparent)`,
          background: `color-mix(in srgb, ${theme.colors.background} 55%, transparent)`,
          color: theme.colors.textMuted,
        }}
      >
        <div className="max-w-7xl mx-auto px-6 py-6">
          <span>© {new Date().getFullYear()} Principal AI</span>
        </div>
      </footer>

      <CreateTrailModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />
    </div>
  );
}

function Footprint({
  side,
  size = 24,
  color,
  strokeWidth = 2,
}: {
  side: 'left' | 'right';
  size?: number;
  color: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="2 1 9 18"
      width={size}
      height={size * (18 / 9)}
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: side === 'right' ? 'scaleX(-1)' : undefined }}
      aria-hidden
    >
      <path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z" />
      <path d="M4 13h4" />
    </svg>
  );
}

