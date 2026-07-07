'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { buildMergedContributionLayers } from '@/lib/repo-analysis/contributionLayers';
import type { ContributionAnalysis } from '@/lib/repo-analysis/contributionLayers';
import type { CarouselRepo } from './CommunityCarousel';

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
  onAdvance: () => void;
  /** Lowercased-email → GitHub account (login + avatarUrl). */
  identityByEmail?: Record<string, { login: string; avatarUrl: string } | null>;
}

type ViewIndex = 0 | 1 | 2;

const VIEW_LABELS: Record<ViewIndex, string | null> = {
  0: null,
  1: 'Most commits',
  2: 'Most lines',
};

const VIEW_DURATION_MS = 5000;

export function FileCityHero({
  repo,
  fileTree,
  analysis,
  loading,
  error: treeError,
  onAdvance,
  identityByEmail,
}: FileCityHeroProps) {
  const { theme } = useTheme();

  const [viewIndex, setViewIndex] = useState<ViewIndex>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      if (viewIndex < 2) {
        setViewIndex((viewIndex + 1) as ViewIndex);
      } else {
        onAdvance();
      }
    }, VIEW_DURATION_MS);
    return () => clearTimeout(timerRef.current);
  }, [viewIndex, onAdvance]);

  const topCommitter = useMemo(() => {
    if (!analysis || analysis.contributors.length === 0) return null;
    return analysis.contributors.reduce((best, c) =>
      c.commits > best.commits ? c : best
    );
  }, [analysis]);

  const topLineContributor = useMemo<{ name: string; email: string } | null>(() => {
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
    return { name: contributor?.name ?? best, email: best };
  }, [analysis]);

  const activeContributor = useMemo(() => {
    if (viewIndex === 1) return topCommitter;
    if (viewIndex === 2) return topLineContributor;
    return null;
  }, [viewIndex, topCommitter, topLineContributor]);

  const layers = useMemo(() => {
    if (viewIndex === 0 || !analysis || !activeContributor) return null;
    return buildMergedContributionLayers(analysis, [activeContributor.email], {
      color: theme.colors.primary,
      buckets: 3,
      intensity: 'share',
    });
  }, [viewIndex, analysis, activeContributor, theme.colors.primary]);

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
      data: layers,
      loading: false, error: null, refresh: async () => {},
    },
    repository,
  }), [fileTree, layers, repository]);

  const showLoading = loading && !fileTree && !treeError;

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: 480,
        borderRadius: 16,
        overflow: 'hidden',
        background: theme.colors.background,
        border: `1px solid ${theme.colors.border}`,
      }}
    >
      <div
        style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          padding: '16px 20px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          zIndex: 20, pointerEvents: 'none',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.4), transparent)',
        }}
      >
        <div>
          <div style={{ color: '#fff', fontSize: 20, fontWeight: 700, textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>
            {repo.repo}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 2, textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>
            {repo.owner} &middot; {formatNumber(repo.stargazersCount)} stars
          </div>
        </div>
        {VIEW_LABELS[viewIndex] && activeContributor && (
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: `color-mix(in srgb, ${theme.colors.primary} 85%, transparent)`,
              color: '#fff', padding: '4px 10px', borderRadius: 6,
              fontSize: 12, fontWeight: 600,
            }}
          >
            <div
              style={{
                width: 20, height: 20, borderRadius: '50%',
                background: 'rgba(255,255,255,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, flexShrink: 0,
                overflow: 'hidden', position: 'relative',
              }}
            >
              <img
                src={contributorAvatar(activeContributor.email, identityByEmail) ?? ''}
                alt=""
                width={20}
                height={20}
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
              <span style={{ position: 'relative' }}>
                {activeContributor.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <span>{VIEW_LABELS[viewIndex]}: {activeContributor.name}</span>
          </div>
        )}
      </div>

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
          key={`${repo.fullName}-${viewIndex}`}
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

      <div
        style={{
          position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: 8, zIndex: 20,
        }}
      >
        {([0, 1, 2] as ViewIndex[]).map((i) => (
          <button
            key={i}
            onClick={() => setViewIndex(i)}
            style={{
              width: 8, height: 8, borderRadius: '50%', border: 'none',
              background: i === viewIndex ? theme.colors.primary : 'rgba(255,255,255,0.4)',
              cursor: 'pointer', padding: 0, transition: 'all 0.3s ease',
            }}
          />
        ))}
      </div>
    </div>
  );
}
