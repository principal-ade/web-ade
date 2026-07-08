'use client';

import dynamic from 'next/dynamic';
import { useMemo, useRef } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import {
  PanelEventBus,
  type PanelContextValue,
} from '@principal-ade/panel-framework-core';
import type { FileTree } from '@principal-ai/repository-abstraction';
import type {
  FileCityGuidePanelActions,
  FileCityGuidePanelContext,
  FileCityGuideRepository,
} from '@industry-theme/file-city-panel';
import { repoBlameTotals } from '@/lib/repo-analysis/contributionLayers';
import type { ContributionAnalysis } from '@/lib/repo-analysis/contributionLayers';
import type { CarouselRepo } from './CommunityCarousel';
import { GitCommit, Star, Users } from 'lucide-react';

const FileCityGuidePanel = dynamic(
  () => import('@industry-theme/file-city-panel').then((m) => m.FileCityGuidePanel),
  { ssr: false },
);

function linesByEmail(byEmail: Record<string, Record<string, number>>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [email, files] of Object.entries(byEmail)) {
    result[email.toLowerCase()] = Object.values(files).reduce((s, v) => s + v, 0);
  }
  return result;
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function contributorAvatar(
  email: string,
  identityByEmail: Record<string, { login: string; avatarUrl: string } | null> | undefined,
): string | null {
  if (!identityByEmail) return null;
  const resolved = identityByEmail[email.toLowerCase()];
  return resolved?.avatarUrl ?? null;
}

export interface FileCityHeroProps {
  repo: CarouselRepo;
  fileTree: FileTree | null;
  analysis: ContributionAnalysis | null;
  loading: boolean;
  error: string | null;
  onAdvance?: () => void;
  /** Lowercased-email → GitHub account (login + avatarUrl). */
  identityByEmail?: Record<string, { login: string; avatarUrl: string } | null>;
  /** Auto-cycle progress 0–1, or 0 when paused. */
  cycleProgress?: number;
}

function AvatarImg({
  src,
  fallbackLetter,
  size,
}: {
  src: string;
  fallbackLetter: string;
  size: number;
}) {
  const imgRef = useRef<HTMLImageElement>(null);

  return (
    <div
      style={{
        width: size, height: size, borderRadius: size <= 32 ? '50%' : 20,
        background: `linear-gradient(135deg, #6b7280, #6b728066)`,
        overflow: 'hidden', position: 'relative', flexShrink: 0,
      }}
    >
      <img
        ref={imgRef}
        src={src}
        alt=""
        width={size}
        height={size}
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
      <span
        style={{
          position: 'relative', width: '100%', height: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 700, fontSize: size * 0.35,
        }}
      >
        {fallbackLetter}
      </span>
    </div>
  );
}

function ContributorCard({
  label,
  name,
  email,
  statLabel,
  identityByEmail,
  index = 0,
}: {
  label: string;
  name: string;
  email: string;
  statLabel: string;
  identityByEmail: Record<string, { login: string; avatarUrl: string } | null> | undefined;
  index?: number;
}) {
  const { theme } = useTheme();
  const avatarUrl = contributorAvatar(email, identityByEmail);
  const resolved = identityByEmail?.[email.toLowerCase()];
  const githubLogin = resolved?.login ?? null;
  const profileUrl = githubLogin ? `/${githubLogin}` : null;

  const baseStyle: React.CSSProperties = {
    background: `color-mix(in srgb, ${theme.colors.primary} 8%, transparent)`,
    borderRadius: 12,
    padding: '12px 14px',
    border: `1px solid ${theme.colors.primary}22`,
    opacity: 0,
    transform: 'translateY(8px)',
    animation: `heroCardIn 2s ease-out ${index * 2}s forwards`,
    textDecoration: 'none',
    display: 'block',
    cursor: profileUrl ? 'pointer' : 'default',
  };

  const content = (
    <>
      <div style={{ fontSize: theme.fontSizes[0], fontWeight: theme.fontWeights.semibold, color: theme.colors.primary, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
        {label}
      </div>
      <div className="flex items-center" style={{ gap: 10 }}>
        <AvatarImg
          src={avatarUrl ?? `https://github.com/${encodeURIComponent(name)}.png?size=32`}
          fallbackLetter={name.charAt(0).toUpperCase()}
          size={32}
        />
        <div>
          <div style={{ fontSize: theme.fontSizes[2], fontWeight: theme.fontWeights.semibold, color: theme.colors.text }}>
            {name}
          </div>
          <div style={{ fontSize: theme.fontSizes[1], color: theme.colors.textMuted, display: 'flex', alignItems: 'center', gap: 4 }}>
            <GitCommit size={14} />
            {statLabel}
          </div>
        </div>
      </div>
    </>
  );

  if (profileUrl) {
    return (
      <a href={profileUrl} target="_blank" rel="noopener noreferrer" style={baseStyle}>
        {content}
      </a>
    );
  }

  return <div style={baseStyle}>{content}</div>;
}

export function FileCityHero({
  repo,
  fileTree,
  analysis,
  loading,
  error: treeError,
  identityByEmail,
  cycleProgress,
}: FileCityHeroProps) {
  const { theme } = useTheme();

  const topCommitter = useMemo(() => {
    if (!analysis || analysis.contributors.length === 0) return null;
    return analysis.contributors.reduce((best, c) =>
      c.commits > best.commits ? c : best
    );
  }, [analysis]);

  const topLineContributor = useMemo<{ name: string; email: string; lines: number } | null>(() => {
    if (!analysis) return null;
    const lines = linesByEmail(analysis.byEmail);
    let best: string | null = null;
    let bestLines = 0;
    for (const [email, count] of Object.entries(lines)) {
      if (count > bestLines) { best = email; bestLines = count; }
    }
    if (!best) return null;
    const contributor = analysis.contributors.find(
      (c) => c.email.toLowerCase() === best!.toLowerCase()
    );
    return { name: contributor?.name ?? best, email: best, lines: bestLines };
  }, [analysis]);

  const events = useMemo(() => new PanelEventBus(), [repo.owner, repo.repo]);
  const repository = useMemo<FileCityGuideRepository>(
    () => ({ id: repo.fullName, owner: repo.owner, name: repo.repo }),
    [repo.fullName, repo.owner, repo.repo],
  );

  const actions = useMemo<FileCityGuidePanelActions>(
    () => ({
      openFile: (filePath: string) => {
        window.open(
          `https://github.com/${repo.owner}/${repo.repo}/blob/HEAD/${filePath}`,
          '_blank', 'noopener,noreferrer',
        );
      },
      fetchAudioUrls: async () => new Map(),
      closeCommit: () => {},
      closeIssue: () => {},
    }),
    [repo.owner, repo.repo],
  );

  const context = useMemo<PanelContextValue<FileCityGuidePanelContext>>(() => ({
    currentScope: { type: 'repository' },
    refresh: async () => {},
    fileTree: {
      scope: 'repository', name: 'fileTree',
      data: fileTree ?? (null as unknown as FileTree),
      loading: fileTree === null,
      error: null,
      refresh: async () => {},
    },
    lineCounts: {
      scope: 'repository', name: 'lineCounts',
      data: null,
      loading: false, error: null, refresh: async () => {},
    },
    tour: {
      scope: 'repository', name: 'tour', data: null,
      loading: false, error: null, refresh: async () => {},
    },
    commit: {
      scope: 'repository', name: 'commit', data: null,
      loading: false, error: null, refresh: async () => {},
    },
    issue: {
      scope: 'repository', name: 'issue', data: null,
      loading: false, error: null, refresh: async () => {},
    },
    readme: {
      scope: 'repository', name: 'readme', data: null,
      loading: false, error: null, refresh: async () => {},
    },
    highlightLayers: {
      scope: 'repository', name: 'highlightLayers',
      data: null,
      loading: false, error: null, refresh: async () => {},
    },
    repository,
  }), [fileTree, repository]);

  const showLoading = loading && !fileTree && !treeError;

  const totalLines = analysis ? repoBlameTotals(analysis).totalLines : 0;
  const totalContributors = analysis?.contributors.length ?? 0;
  const totalFiles = fileTree?.stats.totalFiles ?? 0;

  return (
    <div
      style={{
        width: '100%',
        height: 480,
        borderRadius: 16,
        overflow: 'hidden',
        border: `1px solid ${theme.colors.border}`,
        display: 'flex',
        position: 'relative',
      }}
    >
      <style>{`
        @keyframes heroCardIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {!!cycleProgress && !showLoading && (
        <div style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0, height: 3,
          background: `${theme.colors.border}44`,
          zIndex: 20,
        }}>
          <div style={{
            height: '100%',
            width: `${cycleProgress * 100}%`,
            background: theme.colors.primary,
            borderRadius: '0 2px 2px 0',
          }} />
        </div>
      )}
      {/* ---------- Left panel: info ---------- */}
      <div
        style={{
          width: 450,
          minWidth: 450,
          flexShrink: 0,
          background: theme.colors.surface,
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
          padding: 24,
          overflowY: 'auto',
        }}
      >
        {/* Owner avatar + repo name & owner */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <AvatarImg
            src={`https://github.com/${encodeURIComponent(repo.owner)}.png?size=80`}
            fallbackLetter={repo.owner.charAt(0).toUpperCase()}
            size={80}
          />

          <div style={{ minWidth: 0, flex: 1 }}>
            <a
              href={`/${repo.owner}/${repo.repo}`}
              target="_blank" rel="noopener noreferrer"
              style={{ fontSize: theme.fontSizes[6], fontWeight: theme.fontWeights.bold, color: theme.colors.text, lineHeight: 1.2, marginBottom: 4, textDecoration: 'none', display: 'block' }}
            >
              {repo.repo}
            </a>
            <a
              href={`/${repo.owner}`}
              target="_blank" rel="noopener noreferrer"
              style={{ fontSize: theme.fontSizes[2], color: theme.colors.textMuted, textDecoration: 'none', display: 'inline-block' }}
            >
              {repo.owner}
            </a>
          </div>
        </div>

            {/* Key stats */}
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <div className="flex items-center gap-1.5">
                <span style={{ fontSize: theme.fontSizes[2], color: theme.colors.textMuted }}>{formatNumber(totalFiles)} files</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span style={{ fontSize: theme.fontSizes[2], color: theme.colors.textMuted }}>{formatNumber(totalLines)} lines</span>
              </div>
          <div className="flex items-center gap-1.5">
            <Users size={16} style={{ color: theme.colors.textMuted }} />
            <span style={{ fontSize: theme.fontSizes[2], color: theme.colors.textMuted }}>{totalContributors} contributors</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Star size={16} style={{ color: theme.colors.textMuted }} />
            <span style={{ fontSize: theme.fontSizes[2], color: theme.colors.textMuted }}>{formatNumber(repo.stargazersCount)} stars</span>
          </div>
        </div>

        {/* Most commits card */}
        {topCommitter && (
          <ContributorCard
            index={0}
            label="Most commits"
            name={topCommitter.name}
            email={topCommitter.email}
            statLabel={`${topCommitter.commits} commits`}
            identityByEmail={identityByEmail}
          />
        )}

        {/* Most lines card */}
        {topLineContributor && (
          <ContributorCard
            index={1}
            label="Most lines"
            name={topLineContributor.name}
            email={topLineContributor.email}
            statLabel={`${formatNumber(topLineContributor.lines)} lines`}
            identityByEmail={identityByEmail}
          />
        )}
      </div>

      {/* ---------- Right panel: 3D city ---------- */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {showLoading && (
          <div
            style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: theme.colors.textMuted, fontSize: theme.fontSizes[1],
              zIndex: 15, background: theme.colors.background,
            }}
          >
            Loading {repo.repo}...
          </div>
        )}

        {treeError && (
          <div
            style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: theme.colors.textMuted, fontSize: theme.fontSizes[1],
              zIndex: 15, background: theme.colors.background,
            }}
          >
            {treeError}
          </div>
        )}

        {!treeError && (
          <FileCityGuidePanel
            key={repo.fullName}
            context={context}
            actions={actions}
            events={events}
            defaultIsolationMode="transparent"
            excludedFolders={[]}
            defaultSkipWelcome
            showColorLegend={false}
            showFileTreeToggle={false}
            readmeMarkdownWidth={0}
            showColorLegendToggle={false}
          />
        )}
      </div>
    </div>
  );
}
