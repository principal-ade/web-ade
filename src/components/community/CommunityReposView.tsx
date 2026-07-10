'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { ChevronLeft, ChevronRight, Star, Users, GitCommit, LayoutGrid, Play, Pause, X } from 'lucide-react';
import type { CarouselCache, CarouselRepo } from './CommunityCarousel';
import { FileCityHero, fileCityImageUrl } from './FileCityHero';

const MOBILE_BREAKPOINT = 768;

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function repoInitials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

function languageColor(language: string | null): string | undefined {
  if (!language) return undefined;
  const COLORS: Record<string, string> = {
    TypeScript: '#3178c6', JavaScript: '#f7df1e', Python: '#3572A5',
    Go: '#00ADD8', Rust: '#dea584', Ruby: '#701516',
    Java: '#b07219', 'C++': '#f34b7d', C: '#555555',
    'C#': '#178600', Shell: '#89e051', HTML: '#e34c26',
    CSS: '#563d7c',
  };
  return COLORS[language] ?? '#6b7280';
}

function useIsMobile(breakpoint = MOBILE_BREAKPOINT): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpoint);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [breakpoint]);

  return isMobile;
}

const ChevronButton: React.FC<{ onClick: () => void; title: string; children: React.ReactNode }> = ({ onClick, title, children }) => {
  const { theme } = useTheme();
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex items-center justify-center"
      style={{
        width: 40, height: 40,
        borderRadius: '50%',
        border: `1px solid ${theme.colors.border}`,
        background: theme.colors.surface,
        color: theme.colors.text,
        cursor: 'pointer',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = theme.colors.primary;
        e.currentTarget.style.color = theme.colors.primary;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = theme.colors.border;
        e.currentTarget.style.color = theme.colors.text;
      }}
    >
      {children}
    </button>
  );
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CommunityReposViewProps {
  data?: CarouselCache | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

// ---------------------------------------------------------------------------
// Image prefetch (warm browser cache for auto-cycle)
// ---------------------------------------------------------------------------

const PREFETCH_AHEAD = 2;
const prefetchedUrls = new Set<string>();

function prefetchFileCityImage(owner: string, repo: string): void {
  const url = fileCityImageUrl(owner, repo);
  if (prefetchedUrls.has(url) || typeof window === 'undefined') return;
  prefetchedUrls.add(url);
  const img = new Image();
  img.src = url;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommunityReposView({
  data,
  loading = false,
  error = null,
  onRetry,
}: CommunityReposViewProps) {
  const { theme } = useTheme();
  const isMobile = useIsMobile();
  const repos = data?.repos ?? [];
  const reposRef = useRef(repos);
  reposRef.current = repos;
  const [selectedFullName, setSelectedFullName] = useState<string | null>(null);
  const [allReposSheetOpen, setAllReposSheetOpen] = useState(false);
  const [autoCycle, setAutoCycle] = useState(true);
  const [cycleProgress, setCycleProgress] = useState(0);
  const heroSwipeRef = useRef<HTMLDivElement>(null);
  /** Skip scroll→selection sync while we programmatically scroll the mobile hero. */
  const scrollingProgrammatically = useRef(false);

  const selected = repos.find((r) => r.fullName === selectedFullName) ?? repos[0] ?? null;
  const selectedIndex = selected
    ? Math.max(0, repos.findIndex((r) => r.fullName === selected.fullName))
    : 0;

  const scrollHeroToIndex = useCallback((index: number, behavior: ScrollBehavior = 'smooth') => {
    const el = heroSwipeRef.current;
    if (!el || index < 0) return;
    scrollingProgrammatically.current = true;
    el.scrollTo({ left: index * el.clientWidth, behavior });
    // Clear flag after scroll settles (smooth ~300–500ms; instant is sync-ish)
    window.setTimeout(() => {
      scrollingProgrammatically.current = false;
    }, behavior === 'smooth' ? 450 : 50);
  }, []);

  const handleSelect = useCallback((fullName: string) => {
    setSelectedFullName(fullName);
    setAutoCycle(false);
    setAllReposSheetOpen(false);
  }, []);

  const handleOpenAllRepos = useCallback(() => {
    setAllReposSheetOpen(true);
  }, []);

  const handleCloseAllRepos = useCallback(() => {
    setAllReposSheetOpen(false);
  }, []);

  const navigateTo = useCallback(
    (direction: -1 | 1) => {
      setAutoCycle(false);
      setSelectedFullName((curr) => {
        const list = reposRef.current;
        const current = curr ?? list[0]?.fullName ?? null;
        const idx = list.findIndex((r) => r.fullName === current);
        const next = list[(idx + direction + list.length) % list.length];
        return next?.fullName ?? current;
      });
    },
    [], // reposRef is stable across renders
  );

  const handlePrev = useCallback(() => navigateTo(-1), [navigateTo]);
  const handleNext = useCallback(() => navigateTo(1), [navigateTo]);

  const handleTogglePlay = useCallback(() => {
    setAutoCycle((prev) => !prev);
  }, []);

  // Keep mobile swipe track in sync when selection changes (auto-cycle, dots, strip).
  useEffect(() => {
    if (!isMobile || repos.length === 0) return;
    const idx = repos.findIndex((r) => r.fullName === (selectedFullName ?? repos[0]?.fullName));
    if (idx < 0) return;
    const el = heroSwipeRef.current;
    if (!el || el.clientWidth <= 0) return;
    const target = idx * el.clientWidth;
    // Already snapped to this slide (e.g. user just swiped there) — skip.
    if (Math.abs(el.scrollLeft - target) < 12) return;
    scrollHeroToIndex(idx, 'smooth');
  }, [selectedFullName, isMobile, repos, scrollHeroToIndex]);

  // Mobile: update selection when user swipes the hero track.
  const handleHeroSwipeScroll = useCallback(() => {
    if (scrollingProgrammatically.current || !heroSwipeRef.current) return;
    const el = heroSwipeRef.current;
    const width = el.clientWidth;
    if (width <= 0) return;
    const index = Math.round(el.scrollLeft / width);
    const repo = reposRef.current[index];
    if (!repo) return;
    setSelectedFullName((curr) => {
      if (curr === repo.fullName) return curr;
      setAutoCycle(false);
      return repo.fullName;
    });
  }, []);

  useEffect(() => {
    if (!autoCycle || repos.length <= 1) { setCycleProgress(0); return; }
    const CYCLE_MS = 6000;
    const start = Date.now();
    let rafId: number;

    const tick = () => {
      const elapsed = Date.now() - start;
      if (elapsed >= CYCLE_MS) {
        setCycleProgress(1);
        setSelectedFullName((curr) => {
          const current = curr ?? repos[0]?.fullName ?? null;
          const idx = repos.findIndex((r) => r.fullName === current);
          const next = repos[(idx + 1) % repos.length];
          return next?.fullName ?? current;
        });
        return;
      }
      setCycleProgress(elapsed / CYCLE_MS);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [autoCycle, selectedFullName, repos]);

  // Prefetch File City PNGs for the active repo and the next few (auto-cycle).
  useEffect(() => {
    if (repos.length === 0) return;
    const activeKey = selectedFullName ?? repos[0]?.fullName ?? null;
    const startIdx = repos.findIndex((r) => r.fullName === activeKey);
    if (startIdx < 0) return;
    for (let i = 0; i <= PREFETCH_AHEAD; i++) {
      const repo = repos[(startIdx + i) % repos.length];
      if (repo) prefetchFileCityImage(repo.owner, repo.repo);
    }
  }, [selectedFullName, repos]);

  if (loading) {
    return <div className="flex items-center justify-center py-24" style={{ color: theme.colors.textMuted }}>Loading community repos...</div>;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24" style={{ color: theme.colors.textMuted }}>
        <div style={{ marginBottom: 12, fontSize: theme.fontSizes[2] }}>Failed to load</div>
        <div style={{ marginBottom: 16, fontSize: theme.fontSizes[1] }}>{error}</div>
        {onRetry && (
          <button onClick={onRetry} style={{
            padding: '8px 20px', borderRadius: 8, border: `1px solid ${theme.colors.border}`,
            background: theme.colors.surface, color: theme.colors.text, cursor: 'pointer',
            fontSize: theme.fontSizes[1],
          }}>Retry</button>
        )}
      </div>
    );
  }

  if (repos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24" style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[1] }}>
        <Users size={32} style={{ marginBottom: 8 }} />
        No repos visited yet
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ gap: isMobile ? 16 : 24 }}>
      {/* Hero */}
      {isMobile ? (
        <div style={{ position: 'relative', width: '100%' }}>
          <div
            ref={heroSwipeRef}
            onScroll={handleHeroSwipeScroll}
            className="community-hero-swipe"
            style={{
              display: 'flex',
              overflowX: 'auto',
              overflowY: 'hidden',
              scrollSnapType: 'x mandatory',
              scrollBehavior: 'smooth',
              WebkitOverflowScrolling: 'touch',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
              width: '100%',
              // Fill most of the viewport under the header
              height: 'min(calc(100dvh - 140px), 720px)',
              touchAction: 'pan-x',
            }}
          >
            {repos.map((repo) => (
              <div
                key={repo.fullName}
                style={{
                  flex: '0 0 100%',
                  width: '100%',
                  height: '100%',
                  scrollSnapAlign: 'start',
                  scrollSnapStop: 'always',
                  minWidth: 0,
                }}
              >
                <FileCityHero
                  repo={repo}
                  layout="vertical"
                  cycleProgress={
                    repo.fullName === (selectedFullName ?? repos[0]?.fullName)
                      ? cycleProgress
                      : 0
                  }
                />
              </div>
            ))}
          </div>
          <style>{`
            .community-hero-swipe::-webkit-scrollbar { display: none; }
          `}</style>

          {/* Page dots */}
          {repos.length > 1 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: 6,
                paddingTop: 12,
              }}
            >
              {repos.map((repo, i) => (
                <button
                  key={repo.fullName}
                  type="button"
                  aria-label={`Go to ${repo.fullName}`}
                  onClick={() => handleSelect(repo.fullName)}
                  style={{
                    width: i === selectedIndex ? 16 : 6,
                    height: 6,
                    borderRadius: 3,
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    background:
                      i === selectedIndex
                        ? theme.colors.primary
                        : theme.colors.border,
                    transition: 'width 0.2s ease, background 0.2s ease',
                  }}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        selected && (
          <FileCityHero
            key={selected.fullName}
            repo={selected}
            cycleProgress={cycleProgress}
          />
        )
      )}

      {/* Controls: desktop = prev / play / next; mobile = play + Show all inline */}
      <div className="flex items-center justify-center" style={{ gap: 12 }}>
        {!isMobile && repos.length > 1 && (
          <ChevronButton onClick={handlePrev} title="Previous repo">
            <ChevronLeft size={18} />
          </ChevronButton>
        )}
        {repos.length > 1 && (
          <ChevronButton onClick={handleTogglePlay} title={autoCycle ? 'Pause auto-cycle' : 'Resume auto-cycle'}>
            {autoCycle ? <Pause size={14} /> : <Play size={14} style={{ marginLeft: 2 }} />}
          </ChevronButton>
        )}
        {!isMobile && repos.length > 1 && (
          <ChevronButton onClick={handleNext} title="Next repo">
            <ChevronRight size={18} />
          </ChevronButton>
        )}
        {isMobile && (
          <button
            type="button"
            onClick={handleOpenAllRepos}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              height: 40,
              padding: '0 14px',
              borderRadius: 20,
              border: `1px solid ${theme.colors.border}`,
              background: theme.colors.surface,
              color: theme.colors.text,
              cursor: 'pointer',
              fontSize: theme.fontSizes[0],
              fontWeight: theme.fontWeights.semibold,
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = theme.colors.primary;
              e.currentTarget.style.color = theme.colors.primary;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = theme.colors.border;
              e.currentTarget.style.color = theme.colors.text;
            }}
          >
            <LayoutGrid size={14} /> Show all
          </button>
        )}
      </div>

      {/* Desktop browse strip */}
      {!isMobile && (
        <>
          <div className="flex items-center justify-between" style={{ padding: '0 4px' }}>
            <div style={{ fontSize: theme.fontSizes[2], fontWeight: theme.fontWeights.semibold, color: theme.colors.text }}>
              Browse repos
            </div>
            <button
              type="button"
              onClick={handleOpenAllRepos}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 14px',
                borderRadius: 8,
                border: `1px solid ${theme.colors.border}`,
                background: theme.colors.surface,
                color: theme.colors.text,
                cursor: 'pointer',
                fontSize: theme.fontSizes[0],
                fontWeight: theme.fontWeights.semibold,
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = theme.colors.primary; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = theme.colors.border; }}
            >
              <LayoutGrid size={14} /> Show all
            </button>
          </div>
          <CarouselStrip
            repos={repos}
            theme={theme}
            selectedFullName={selectedFullName}
            onSelect={handleSelect}
            isMobile={false}
          />
        </>
      )}

      <AllReposSheet
        open={allReposSheetOpen}
        onClose={handleCloseAllRepos}
        repos={repos}
        theme={theme}
        selectedFullName={selectedFullName}
        onSelect={handleSelect}
        isMobile={isMobile}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// CarouselStrip
// ---------------------------------------------------------------------------

const CarouselStrip: React.FC<{
  repos: CarouselRepo[];
  theme: ReturnType<typeof useTheme>['theme'];
  selectedFullName: string | null;
  onSelect: (fullName: string) => void;
  isMobile?: boolean;
}> = ({ repos, theme, selectedFullName, onSelect, isMobile = false }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);
  const cardWidth = isMobile ? 260 : 320;

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setShowLeftArrow(scrollLeft > 10);
    setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10);
  }, []);

  const scroll = useCallback((direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const gap = 16;
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -(cardWidth + gap) : cardWidth + gap,
      behavior: 'smooth',
    });
  }, [cardWidth]);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {!isMobile && showLeftArrow && (
        <button onClick={() => scroll('left')} aria-label="Scroll left" style={{
          position: 'absolute', left: -18, top: '50%', transform: 'translateY(-50%)',
          width: 40, height: 40, borderRadius: '50%', border: `1px solid ${theme.colors.border}`,
          background: theme.colors.surface, color: theme.colors.text, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)', zIndex: 10,
        }}>
          <ChevronLeft size={20} />
        </button>
      )}
      {!isMobile && showRightArrow && (
        <button onClick={() => scroll('right')} aria-label="Scroll right" style={{
          position: 'absolute', right: -18, top: '50%', transform: 'translateY(-50%)',
          width: 40, height: 40, borderRadius: '50%', border: `1px solid ${theme.colors.border}`,
          background: theme.colors.surface, color: theme.colors.text, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)', zIndex: 10,
        }}>
          <ChevronRight size={20} />
        </button>
      )}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="carousel-track"
        style={{
          display: 'flex', gap: 16, overflowX: 'auto', scrollSnapType: 'x mandatory',
          padding: '8px 4px', scrollbarWidth: 'none', msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {repos.map((repo) => (
          <MiniRepoCard
            key={repo.fullName}
            repo={repo}
            theme={theme}
            selected={repo.fullName === selectedFullName}
            onClick={() => onSelect(repo.fullName)}
            cardWidth={cardWidth}
          />
        ))}
      </div>
      <style>{`.carousel-track::-webkit-scrollbar { display: none; }`}</style>
    </div>
  );
};

// ---------------------------------------------------------------------------
// MiniRepoCard — compact card for the carousel strip
// ---------------------------------------------------------------------------

const MiniRepoCard: React.FC<{
  repo: CarouselRepo;
  theme: ReturnType<typeof useTheme>['theme'];
  selected: boolean;
  onClick: () => void;
  /** Fixed width for carousel; omit for fluid grid cells. */
  cardWidth?: number;
}> = ({ repo, theme, selected, onClick, cardWidth }) => {
  const color = languageColor(repo.language);
  const fixedWidth = cardWidth ?? 320;
  const isFluid = cardWidth === undefined;

  return (
    <button
      onClick={onClick}
      style={{
        ...(isFluid
          ? { width: '100%', minWidth: 0 }
          : { minWidth: fixedWidth, maxWidth: fixedWidth }),
        borderRadius: 12,
        backgroundColor: selected
          ? `color-mix(in srgb, ${theme.colors.primary} 10%, ${theme.colors.surface})`
          : theme.colors.surface,
        border: `1px solid ${selected ? theme.colors.primary : theme.colors.border}`,
        display: 'flex',
        flexDirection: 'column',
        scrollSnapAlign: 'start',
        flexShrink: 0,
        textAlign: 'left',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        overflow: 'hidden',
      }}
      onMouseEnter={(e) => {
        if (!selected) {
          e.currentTarget.style.borderColor = theme.colors.primary;
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.1)';
        }
      }}
      onMouseLeave={(e) => {
        if (!selected) {
          e.currentTarget.style.borderColor = theme.colors.border;
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = 'none';
        }
      }}
    >
      <div style={{ padding: '14px 14px 0', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            width: 36, height: 36, borderRadius: 10,
            background: `linear-gradient(135deg, ${color ?? '#6b7280'}, ${color ?? '#6b7280'}88)`,
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 13, flexShrink: 0, overflow: 'hidden',
            position: 'relative',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://github.com/${encodeURIComponent(repo.owner)}.png?size=36`}
            alt=""
            width={36}
            height={36}
            style={{ position: 'absolute', inset: 0, zIndex: 1 }}
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
            onLoad={(e) => {
              const parent = e.currentTarget.parentElement;
              if (parent) {
                const letter = parent.querySelector('span');
                if (letter) letter.style.display = 'none';
              }
            }}
          />
          <span style={{ position: 'relative' }}>{repoInitials(repo.repo)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div style={{ fontSize: theme.fontSizes[1], fontWeight: theme.fontWeights.semibold, color: theme.colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {repo.repo}
          </div>
          <div style={{ fontSize: theme.fontSizes[0], color: theme.colors.textMuted, marginTop: 1 }}>
            {repo.owner}
          </div>
        </div>
      </div>

      <div style={{ padding: '10px 14px 0', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div className="flex items-center gap-1">
          <Star size={12} style={{ color: theme.colors.textMuted }} />
          <span style={{ fontSize: theme.fontSizes[0], color: theme.colors.textMuted }}>{formatNumber(repo.stargazersCount)}</span>
        </div>
      </div>

      {repo.topContributors.length > 0 && (() => {
        const topCommits = repo.topContributors.reduce((best, c) => c.commits > best.commits ? c : best);
        return (
          <div style={{ padding: '10px 14px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 24, height: 24, borderRadius: '50%',
                background: theme.colors.border, color: theme.colors.textMuted,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 600, fontSize: 10, flexShrink: 0, overflow: 'hidden',
                position: 'relative',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://github.com/${encodeURIComponent(topCommits.name)}.png?size=24`}
                alt=""
                width={24}
                height={24}
                style={{ position: 'absolute', inset: 0, borderRadius: '50%', zIndex: 1 }}
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                onLoad={(e) => {
                  const parent = e.currentTarget.parentElement;
                  if (parent) {
                    const letter = parent.querySelector('span');
                    if (letter) letter.style.display = 'none';
                  }
                }}
              />
              <span style={{ position: 'relative' }}>{topCommits.name.charAt(0).toUpperCase()}</span>
            </div>
            <span style={{ fontSize: theme.fontSizes[0], color: theme.colors.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
              {topCommits.name}
            </span>
            <span style={{ fontSize: theme.fontSizes[0], color: theme.colors.textMuted, flexShrink: 0 }}>
              <GitCommit size={11} style={{ display: 'inline', marginRight: 2, verticalAlign: -1 }} />
              {topCommits.commits}
            </span>
          </div>
        );
      })()}
    </button>
  );
};

// ---------------------------------------------------------------------------
// AllReposSheet — bottom sheet with the full repo grid
// ---------------------------------------------------------------------------

const SHEET_ANIM_MS = 360;

const AllReposSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  repos: CarouselRepo[];
  theme: ReturnType<typeof useTheme>['theme'];
  selectedFullName: string | null;
  onSelect: (fullName: string) => void;
  isMobile?: boolean;
}> = ({ open, onClose, repos, theme, selectedFullName, onSelect, isMobile = false }) => {
  // Keep mounted through the close animation so the slide-down can finish.
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    setClosing(true);
    const t = window.setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, SHEET_ANIM_MS);
    return () => window.clearTimeout(t);
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Lock body scroll while the sheet is up.
  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mounted]);

  if (!mounted) return null;

  const animName = closing ? 'communitySheetDown' : 'communitySheetUp';
  const backdropAnim = closing ? 'communityBackdropOut' : 'communityBackdropIn';

  return (
    <>
      <style>{`
        @keyframes communitySheetUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes communitySheetDown {
          from { transform: translateY(0); }
          to { transform: translateY(100%); }
        }
        @keyframes communityBackdropIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes communityBackdropOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
      `}</style>

      <div
        aria-hidden
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 100,
          background: 'rgba(0,0,0,0.45)',
          animation: `${backdropAnim} ${SHEET_ANIM_MS}ms cubic-bezier(0.22, 1, 0.36, 1) forwards`,
          pointerEvents: open && !closing ? 'auto' : 'none',
        }}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="All community repos"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 101,
          maxHeight: isMobile ? '92dvh' : '85vh',
          display: 'flex',
          flexDirection: 'column',
          background: theme.colors.background,
          borderTop: `1px solid ${theme.colors.border}`,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          boxShadow: '0 -12px 40px rgba(0,0,0,0.4)',
          animation: `${animName} ${SHEET_ANIM_MS}ms cubic-bezier(0.22, 1, 0.36, 1) forwards`,
          willChange: 'transform',
          pointerEvents: open && !closing ? 'auto' : 'none',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* Drag affordance + header */}
        <div
          style={{
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            borderBottom: `1px solid ${theme.colors.border}`,
          }}
        >
          <div
            aria-hidden
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              background: theme.colors.border,
              marginTop: 10,
              marginBottom: 6,
            }}
          />
          <div
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 16px 14px',
              gap: 12,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: theme.fontSizes[3],
                  fontWeight: theme.fontWeights.semibold,
                  color: theme.colors.text,
                }}
              >
                All repos
              </div>
              <div
                style={{
                  fontSize: theme.fontSizes[0],
                  color: theme.colors.textMuted,
                  marginTop: 2,
                }}
              >
                {repos.length} {repos.length === 1 ? 'repo' : 'repos'} visited
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                border: `1px solid ${theme.colors.border}`,
                background: theme.colors.surface,
                color: theme.colors.text,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            padding: isMobile ? '16px 12px 24px' : '20px 24px 32px',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile
                ? '1fr'
                : 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 12,
              maxWidth: 1200,
              margin: '0 auto',
            }}
          >
            {repos.map((repo) => (
              <MiniRepoCard
                key={repo.fullName}
                repo={repo}
                theme={theme}
                selected={repo.fullName === selectedFullName}
                onClick={() => onSelect(repo.fullName)}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
};
