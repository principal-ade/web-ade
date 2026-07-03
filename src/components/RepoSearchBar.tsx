'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from '@principal-ade/industry-theme';
import { Github, Star, ChevronRight } from 'lucide-react';
import { InlineTrailLoader } from '@/components/trail/InlineTrailLoader';
import {
  parseGithubRepoPath,
  readRecentRepos,
  type HeaderRepoSearchItem,
} from '@/lib/recentRepos';

// ---------------------------------------------------------------------------
// RepoSearchBar — the header "open a repo" control, shared by the owner/repo
// explorer header and the signed-in home header. It's an always-visible input
// that doubles as a repo search bar: pasting a GitHub link opens it directly,
// typing a term shows a GitHub repo-search typeahead, and before you type it
// lists your recent repos. Choosing a repo calls `onOpenRepo` if provided, else
// it navigates to `/owner/repo`.
// ---------------------------------------------------------------------------

export interface RepoSearchBarProps {
  /** Called when a repo is chosen. When omitted, navigates to `/owner/repo`. */
  onOpenRepo?: (owner: string, repo: string) => void;
  /** full_name to omit from the recent list (e.g. the repo you're already on). */
  excludeFullName?: string;
  /** Width class for the input (default `w-56`). */
  inputWidthClass?: string;
  /** Start focused with the dropdown active — used by the mobile search sheet. */
  autoFocus?: boolean;
}

export function RepoSearchBar({
  onOpenRepo,
  excludeFullName,
  inputWidthClass = 'w-56',
  autoFocus = false,
}: RepoSearchBarProps) {
  const { theme } = useTheme();
  const router = useRouter();

  const [openRepoActive, setOpenRepoActive] = useState(autoFocus);
  const [openRepoUrl, setOpenRepoUrl] = useState('');
  const [openRepoError, setOpenRepoError] = useState(false);
  const [openRepoResults, setOpenRepoResults] = useState<HeaderRepoSearchItem[]>(
    [],
  );
  const [openRepoSearching, setOpenRepoSearching] = useState(false);
  const [recentRepos, setRecentRepos] = useState<HeaderRepoSearchItem[]>([]);
  const [shortcutHint, setShortcutHint] = useState('');
  const openRepoInputRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K focuses the input from anywhere on the page. The hint label is
  // resolved after mount to avoid an SSR platform mismatch.
  useEffect(() => {
    setShortcutHint(
      /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K',
    );
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        openRepoInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
    (fullName: string) => {
      closeOpenRepo();
      const parsed = parseGithubRepoPath(fullName);
      if (onOpenRepo && parsed) {
        onOpenRepo(parsed.owner, parsed.repo);
        return;
      }
      router.push(`/${fullName}`);
    },
    [router, closeOpenRepo, onOpenRepo],
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

  // Load recent repos (minus the excluded one) to show before the user types.
  useEffect(() => {
    if (!openRepoActive) return;
    openRepoInputRef.current?.focus();
    const exclude = excludeFullName?.toLowerCase();
    setRecentRepos(
      readRecentRepos()
        .filter((r) => r.full_name.toLowerCase() !== exclude)
        .slice(0, 6),
    );
  }, [openRepoActive, excludeFullName]);

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

  const showOpener = openRepoUrl.trim().length > 0;
  const showRecents = !showOpener && recentRepos.length > 0;

  return (
    <div className="relative">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitOpenRepo();
        }}
        className="flex items-center gap-2 h-8 px-2.5 rounded-md"
        style={{
          background: theme.colors.background,
          border: `1px solid ${
            openRepoError
              ? theme.colors.error ?? theme.colors.border
              : theme.colors.border
          }`,
        }}
      >
        <Github
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
          onFocus={() => setOpenRepoActive(true)}
          onBlur={() => setOpenRepoActive(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              closeOpenRepo();
              e.currentTarget.blur();
            }
          }}
          placeholder="Search repos or paste a link…"
          aria-label="Search repositories or paste a GitHub link"
          className={`bg-transparent outline-none ${inputWidthClass}`}
          style={{
            color: theme.colors.text,
            fontSize: theme.fontSizes[1],
          }}
        />
        {/* Keyboard-shortcut hint, hidden once the user starts typing. */}
        {shortcutHint && !openRepoUrl && (
          <kbd
            aria-hidden
            className="shrink-0 rounded px-1.5 py-0.5 leading-none pointer-events-none"
            style={{
              fontFamily: theme.fonts.body,
              fontSize: theme.fontSizes[0],
              color: theme.colors.textMuted,
              background: theme.colors.backgroundSecondary,
              border: `1px solid ${theme.colors.border}`,
            }}
          >
            {shortcutHint}
          </kbd>
        )}
      </form>

      {/* Dropdown: recent repos before the user types, then a direct-open hint
          for links / GitHub repo-search results. */}
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
                goToRepo(`${openRepoDirect.owner}/${openRepoDirect.repo}`)
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
              <span className="truncate" style={{ fontSize: theme.fontSizes[2] }}>
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
  );
}
