'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTheme } from '@principal-ade/industry-theme';
import { ExternalLink, Search, Star, ChevronRight, Github } from 'lucide-react';
import { useEffect, useState } from 'react';
import { InlineTrailLoader } from '@/components/trail/InlineTrailLoader';
import { UserAvatarMenu } from '@/components/UserAvatarMenu';
import { AgentViewButton } from '@/components/AgentViewButton';
import { HomeThemeToggle } from '@/components/HomeThemeToggle';

export const dynamic = 'force-dynamic';

function parseGithubRepoPath(input: string): { owner: string; repo: string } | null {
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

interface RepoSearchItem {
  full_name: string;
  name: string;
  owner: { login: string; avatar_url: string };
  description?: string | null;
  stargazers_count?: number;
}

const RECENT_REPOS_KEY = 'recent-repositories';

function readRecentRepos(): RepoSearchItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(RECENT_REPOS_KEY) ?? '[]',
    );
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((it): RepoSearchItem[] => {
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
  const [repoUrl, setRepoUrl] = useState('');
  const [repoFocused, setRepoFocused] = useState(false);
  const [flashLabel, setFlashLabel] = useState<string | null>(null);
  const [flashTyped, setFlashTyped] = useState('');
  const [openRepoResults, setOpenRepoResults] = useState<RepoSearchItem[]>([]);
  const [openRepoSearching, setOpenRepoSearching] = useState(false);
  const [recentRepos, setRecentRepos] = useState<RepoSearchItem[]>([]);

  const openRepoDirect = parseGithubRepoPath(repoUrl);

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
    const top = openRepoResults[0];
    if (top) {
      const [tOwner, tRepo] = top.full_name.split('/');
      if (tOwner && tRepo) navigateToRepo(tOwner, tRepo);
    }
  };

  useEffect(() => {
    if (!repoFocused) return;
    setRecentRepos(readRecentRepos().slice(0, 6));
  }, [repoFocused]);

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
            ? (data.items as RepoSearchItem[]).slice(0, 8)
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

  const goToRepoFullName = (fullName: string) => {
    const [o, r] = fullName.split('/');
    if (o && r) navigateToRepo(o, r);
  };

  const renderRepoRow = (r: RepoSearchItem) => (
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

  const renderOpenerResults = () =>
    openRepoDirect ? (
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
    );

  const showOpener = repoUrl.trim().length > 0;
  const showRecents = !showOpener && recentRepos.length > 0;
  const showDropdown =
    repoFocused && flashLabel === null && (showOpener || showRecents);

  return (
    <div
      className="h-viewport-fixed flex flex-col"
      style={{ background: theme.colors.background, color: theme.colors.text }}
    >
      <header className="sticky top-0 z-30">
        <a
          href="https://www.principal-ade.com/download"
          className="absolute top-4 left-6 hidden sm:inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors hover:opacity-80"
          style={{
            border: `1px solid color-mix(in srgb, ${theme.colors.border} 70%, transparent)`,
            color: theme.colors.textMuted,
            background: `color-mix(in srgb, ${theme.colors.surface} 60%, transparent)`,
          }}
        >
          Download
        </a>
        <div className="absolute top-0 right-0 flex items-center gap-3 px-6 py-4 z-10">
          <HomeThemeToggle />
          <div className="hidden sm:flex">
            <AgentViewButton path="/" />
          </div>
          <UserAvatarMenu />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-2xl mx-auto px-6 -mt-16">
          <h1
            className="text-5xl md:text-6xl font-semibold tracking-tight mb-8 text-center"
            style={{ fontFamily: theme.fonts.body }}
          >
            <span style={{ color: theme.colors.text }}>Principal</span>{' '}
            <span style={{ color: theme.colors.primary }}>AI</span>
          </h1>

          <div className="relative">
            <div
              role="search"
              aria-label="Open a GitHub repository"
              className={`flex items-center gap-3 rounded-xl px-5 py-3.5 transition-colors ${
                flashLabel ? 'repo-url-flash' : ''
              }`}
              style={{
                background: theme.colors.surface,
                border: `1px solid ${
                  flashLabel
                    ? '#22c55e'
                    : repoFocused
                      ? `color-mix(in srgb, ${theme.colors.primary} 70%, transparent)`
                      : `color-mix(in srgb, ${theme.colors.border} 70%, transparent)`
                }`,
                boxShadow: repoFocused
                  ? `0 8px 32px rgba(0,0,0,0.12)`
                  : `0 4px 16px rgba(0,0,0,0.06)`,
                transition: 'border-color 0.2s, box-shadow 0.3s, background-color 0.15s',
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
                <ExternalLink size={18} color="#22c55e" style={{ flexShrink: 0 }} />
              ) : (
                <Search
                  size={18}
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
                placeholder="Search repos or paste a GitHub link…"
                aria-label="Search repositories or paste a GitHub link"
                className="flex-1 bg-transparent border-0 outline-none text-base"
                style={{
                  color: flashLabel ? '#22c55e' : theme.colors.text,
                  transition: 'color 0.2s',
                }}
              />
            </div>

            {showDropdown && (
              <div
                className="absolute top-full left-0 right-0 mt-2 w-full rounded-xl overflow-hidden z-[1000]"
                style={{
                  background: theme.colors.surface,
                  border: `1px solid ${theme.colors.border}`,
                  boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
                }}
              >
                {!showOpener ? (
                  <>
                    {dropdownLabel('Recent')}
                    <div className="max-h-80 overflow-y-auto pb-1">
                      {recentRepos.map(renderRepoRow)}
                    </div>
                  </>
                ) : (
                  renderOpenerResults()
                )}
              </div>
            )}
          </div>

          <div className="flex justify-center mt-14">
            <Link
              href="/community-repos"
              className="inline-flex items-center gap-2 rounded-lg px-6 py-3 text-base font-medium transition-colors hover:opacity-80"
              style={{
                border: `1px solid color-mix(in srgb, ${theme.colors.border} 70%, transparent)`,
                color: theme.colors.text,
                background: `color-mix(in srgb, ${theme.colors.surface} 60%, transparent)`,
              }}
            >
              Explore Community Projects
            </Link>
          </div>


        </div>
      </main>
    </div>
  );
}
