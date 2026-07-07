'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { ChevronLeft, ChevronRight, Star, Users, GitCommit, LayoutGrid, LayoutList } from 'lucide-react';
import { GitFileTreeBuilder, type FileTree } from '@principal-ai/repository-abstraction';
import type { ContributionAnalysis } from '@/lib/repo-analysis/contributionLayers';
import { trpc } from '@/lib/trpc/client';
import type { CarouselCache, CarouselRepo } from './CommunityCarousel';
import { FileCityHero } from './FileCityHero';

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

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CommunityReposViewProps {
  data?: CarouselCache | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  /** Pre-fetched file tree (for override / Storybook). When omitted, fetched internally. */
  heroFileTree?: FileTree | null;
  /** Pre-fetched analysis (for override / Storybook). When omitted, fetched internally. */
  heroAnalysis?: ContributionAnalysis | null;
  heroLoading?: boolean;
  heroError?: string | null;
  /** Pre-fetched email→GitHub-account map (for override / Storybook). */
  heroIdentityByEmail?: Record<string, { login: string; avatarUrl: string } | null>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommunityReposView({
  data,
  loading = false,
  error = null,
  onRetry,
  heroFileTree: heroFileTreeProp,
  heroAnalysis: heroAnalysisProp,
  heroLoading: heroLoadingProp = false,
  heroError: heroErrorProp = null,
  heroIdentityByEmail: heroIdentityByEmailProp,
}: CommunityReposViewProps) {
  const { theme } = useTheme();
  const repos = data?.repos ?? [];
  const [selectedFullName, setSelectedFullName] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const selected = repos.find((r) => r.fullName === selectedFullName) ?? repos[0] ?? null;

  // --- Hero data: use props when provided, otherwise fetch for the selected repo ---
  const hasExternalHeroData = heroFileTreeProp !== undefined;

  const [internalFileTree, setInternalFileTree] = useState<FileTree | null>(null);
  const [internalAnalysis, setInternalAnalysis] = useState<ContributionAnalysis | null>(null);
  const [internalIdentityByEmail, setInternalIdentityByEmail] = useState<Record<string, { login: string; avatarUrl: string } | null> | null>(null);
  const [internalLoading, setInternalLoading] = useState(false);
  const [internalError, setInternalError] = useState<string | null>(null);

  useEffect(() => {
    if (hasExternalHeroData || !selected) return;
    let cancelled = false;
    setInternalFileTree(null);
    setInternalAnalysis(null);
    setInternalError(null);
    setInternalLoading(true);

    (async () => {
      try {
        const [treeData, analysisRes] = await Promise.all([
          trpc.github.getTree.query({ owner: selected.owner, repo: selected.repo }),
          fetch(`/api/repo-analysis/${selected.owner}/${selected.repo}`).then(async (r) => {
            if (!r.ok) return null;
            const text = await r.text();
            try { return text ? JSON.parse(text) : null; }
            catch { return null; }
          }),
        ]);
        if (cancelled) return;

        const blobs = treeData.tree.filter((e: Record<string, unknown>) => e.type === 'blob');
        const tree = new GitFileTreeBuilder().build({
          files: blobs.map((e: Record<string, unknown>) => ({ path: e.path as string, size: (e.size as number) || 0 })),
          rootPath: `/${selected.owner}/${selected.repo}`,
          commitSha: treeData.sha as string,
          branch: 'HEAD',
        });
        if (cancelled) return;

        setInternalFileTree(tree);
        if (analysisRes?.byEmail && analysisRes?.totalLines) {
          setInternalAnalysis(analysisRes as ContributionAnalysis);
        }
        if (analysisRes?.identityByEmail) {
          setInternalIdentityByEmail(analysisRes.identityByEmail);
        }
      } catch (err) {
        if (cancelled) return;
        setInternalError(err instanceof Error ? err.message : 'Failed to load repository');
      } finally {
        if (!cancelled) setInternalLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [hasExternalHeroData, selected?.owner, selected?.repo, selected?.fullName]);

  const heroFileTree = hasExternalHeroData ? (heroFileTreeProp ?? null) : internalFileTree;
  const heroAnalysis = hasExternalHeroData ? (heroAnalysisProp ?? null) : internalAnalysis;
  const heroIdentityByEmail = hasExternalHeroData ? (heroIdentityByEmailProp ?? null) : internalIdentityByEmail;
  const heroLoading = hasExternalHeroData ? heroLoadingProp : internalLoading;
  const heroError = hasExternalHeroData ? (heroErrorProp ?? null) : internalError;

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
    <div className="flex flex-col" style={{ gap: 24 }}>
      {/* File City hero — cycles through coverage views */}
      {selected && (
        <FileCityHero
          key={selected.fullName}
          repo={selected}
          fileTree={heroFileTree}
          analysis={heroAnalysis}
          identityByEmail={heroIdentityByEmail ?? undefined}
          loading={heroLoading}
          error={heroError}
          onAdvance={() => {
            const idx = repos.findIndex((r) => r.fullName === selected.fullName);
            const next = repos[idx + 1] ?? repos[0];
            if (next) setSelectedFullName(next.fullName);
          }}
        />
      )}

      {/* Toggle bar */}
      <div className="flex items-center justify-between" style={{ padding: '0 4px' }}>
        <div style={{ fontSize: theme.fontSizes[2], fontWeight: theme.fontWeights.semibold, color: theme.colors.text }}>
          {showAll ? 'All repos' : 'Browse repos'}
        </div>
        <button
          onClick={() => setShowAll((s) => !s)}
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
          {showAll ? <><LayoutList size={14} /> Show less</> : <><LayoutGrid size={14} /> Show all</>}
        </button>
      </div>

      {/* Carousel or grid */}
      {showAll ? (
        <GridView repos={repos} theme={theme} selectedFullName={selectedFullName} onSelect={setSelectedFullName} />
      ) : (
        <CarouselStrip repos={repos} theme={theme} selectedFullName={selectedFullName} onSelect={setSelectedFullName} />
      )}
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
}> = ({ repos, theme, selectedFullName, onSelect }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setShowLeftArrow(scrollLeft > 10);
    setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10);
  }, []);

  const scroll = useCallback((direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const cardWidth = 320;
    const gap = 16;
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -(cardWidth + gap) : cardWidth + gap,
      behavior: 'smooth',
    });
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {showLeftArrow && (
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
      {showRightArrow && (
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
}> = ({ repo, theme, selected, onClick }) => {
  const color = languageColor(repo.language);

  return (
    <button
      onClick={onClick}
      style={{
        minWidth: 320,
        maxWidth: 320,
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
        <div className="flex items-center gap-1">
          <Users size={12} style={{ color: theme.colors.textMuted }} />
          <span style={{ fontSize: theme.fontSizes[0], color: theme.colors.textMuted }}>{repo.visitorCount}</span>
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
// GridView
// ---------------------------------------------------------------------------

const GridView: React.FC<{
  repos: CarouselRepo[];
  theme: ReturnType<typeof useTheme>['theme'];
  selectedFullName: string | null;
  onSelect: (fullName: string) => void;
}> = ({ repos, theme, selectedFullName, onSelect }) => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
      gap: 16,
      padding: '4px 0',
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
);
