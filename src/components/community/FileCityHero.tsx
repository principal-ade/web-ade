'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import type { CarouselRepo } from './CommunityCarousel';
import { GitCommit, Star } from 'lucide-react';

/** Matches the mobile home card; S3-cached base city map. */
const IMAGE_WIDTH = 800;
const IMAGE_HEIGHT = 800;

export function fileCityImageUrl(owner: string, repo: string): string {
  return `/api/file-city/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}?width=${IMAGE_WIDTH}&height=${IMAGE_HEIGHT}`;
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export interface FileCityHeroProps {
  repo: CarouselRepo;
  /** Auto-cycle progress 0–1, or 0 when paused. */
  cycleProgress?: number;
  /**
   * horizontal — side-by-side info + map (desktop).
   * vertical — stacked full-width card (mobile).
   */
  layout?: 'horizontal' | 'vertical';
}

function AvatarImg({
  src,
  fallbackLetter,
  size,
}: {
  src?: string;
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
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
  login,
  repoHref,
  statLabel,
  index = 0,
  compact = false,
}: {
  label: string;
  name: string;
  login?: string;
  repoHref: string;
  statLabel: string;
  index?: number;
  compact?: boolean;
}) {
  const { theme } = useTheme();
  const profileUrl = login ? `https://github.com/${encodeURIComponent(login)}` : repoHref;

  const baseStyle: React.CSSProperties = {
    background: `color-mix(in srgb, ${theme.colors.primary} 8%, transparent)`,
    borderRadius: 12,
    padding: compact ? '10px 12px' : '12px 14px',
    border: `1px solid ${theme.colors.primary}22`,
    opacity: 0,
    transform: 'translateY(8px)',
    animation: `heroCardIn 2s ease-out ${index * 2}s forwards`,
    textDecoration: 'none',
    display: 'block',
    cursor: 'pointer',
    flex: compact ? 1 : undefined,
    minWidth: compact ? 0 : undefined,
  };

  const content = (
    <>
      <div style={{ fontSize: theme.fontSizes[0], fontWeight: theme.fontWeights.semibold, color: theme.colors.primary, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: compact ? 6 : 8 }}>
        {label}
      </div>
      <div className="flex items-center" style={{ gap: compact ? 8 : 10 }}>
        <AvatarImg
          src={login ? `https://github.com/${encodeURIComponent(login)}.png?size=32` : undefined}
          fallbackLetter={name.charAt(0).toUpperCase()}
          size={compact ? 28 : 32}
        />
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: compact ? theme.fontSizes[1] : theme.fontSizes[2],
            fontWeight: theme.fontWeights.semibold,
            color: theme.colors.text,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {name}
          </div>
          <div style={{ fontSize: theme.fontSizes[0], color: theme.colors.textMuted, display: 'flex', alignItems: 'center', gap: 4 }}>
            <GitCommit size={compact ? 12 : 14} />
            {statLabel}
          </div>
        </div>
      </div>
    </>
  );

  return (
    <a href={profileUrl} target="_blank" rel="noopener noreferrer" style={baseStyle}>
      {content}
    </a>
  );
}

export function FileCityHero({
  repo,
  cycleProgress,
  layout = 'horizontal',
}: FileCityHeroProps) {
  const { theme } = useTheme();
  const isVertical = layout === 'vertical';
  const imageUrl = useMemo(
    () => fileCityImageUrl(repo.owner, repo.repo),
    [repo.owner, repo.repo],
  );

  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Reset load state when the selected repo (and thus image URL) changes.
  useEffect(() => {
    setImageLoaded(false);
    setImageError(false);
  }, [imageUrl]);

  const topByCommits = useMemo(() => {
    if (repo.topContributors.length === 0) return null;
    return repo.topContributors.reduce((best, c) =>
      c.commits > best.commits ? c : best
    );
  }, [repo.topContributors]);

  const topByLines = useMemo(() => {
    const withLines = repo.topContributors.filter(
      (c): c is typeof c & { lines: number } => typeof c.lines === 'number' && c.lines > 0,
    );
    if (withLines.length === 0) return null;
    return withLines.reduce((best, c) => (c.lines > best.lines ? c : best));
  }, [repo.topContributors]);

  const infoPanel = (
    <div
      style={{
        width: isVertical ? '100%' : 450,
        minWidth: isVertical ? 0 : 450,
        flexShrink: 0,
        flexGrow: 0,
        background: theme.colors.surface,
        display: 'flex',
        flexDirection: 'column',
        gap: isVertical ? 12 : 20,
        padding: isVertical ? 16 : 24,
        overflowY: isVertical ? 'hidden' : 'auto',
      }}
    >
      <div style={{ display: 'flex', gap: isVertical ? 12 : 16, alignItems: 'center' }}>
        <AvatarImg
          src={`https://github.com/${encodeURIComponent(repo.owner)}.png?size=80`}
          fallbackLetter={repo.owner.charAt(0).toUpperCase()}
          size={isVertical ? 56 : 80}
        />

        <div style={{ minWidth: 0, flex: 1 }}>
          <a
            href={`/${repo.owner}/${repo.repo}`}
            target="_blank" rel="noopener noreferrer"
            style={{
              fontSize: isVertical ? theme.fontSizes[4] : theme.fontSizes[6],
              fontWeight: theme.fontWeights.bold,
              color: theme.colors.text,
              lineHeight: 1.2,
              marginBottom: 4,
              textDecoration: 'none',
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
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

      <div style={{ display: 'flex', gap: isVertical ? 14 : 20, flexWrap: 'wrap' }}>
        {typeof repo.totalLines === 'number' && repo.totalLines > 0 && (
          <div className="flex items-center gap-1.5">
            <span style={{ fontSize: isVertical ? theme.fontSizes[1] : theme.fontSizes[2], color: theme.colors.textMuted }}>
              {formatNumber(repo.totalLines)} lines
            </span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <Star size={isVertical ? 14 : 16} style={{ color: theme.colors.textMuted }} />
          <span style={{ fontSize: isVertical ? theme.fontSizes[1] : theme.fontSizes[2], color: theme.colors.textMuted }}>
            {formatNumber(repo.stargazersCount)} stars
          </span>
        </div>
      </div>

      {repo.description && (
        <div
          style={{
            fontSize: theme.fontSizes[1],
            color: theme.colors.textMuted,
            lineHeight: 1.45,
            display: '-webkit-box',
            WebkitLineClamp: isVertical ? 2 : 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {repo.description}
        </div>
      )}

      {(topByCommits || topByLines) && (
        <div
          style={{
            display: 'flex',
            flexDirection: isVertical ? 'row' : 'column',
            gap: isVertical ? 8 : 12,
          }}
        >
          {topByCommits && (
            <ContributorCard
              index={0}
              compact={isVertical}
              label="Most commits"
              name={topByCommits.name}
              login={topByCommits.login}
              repoHref={`/${repo.owner}/${repo.repo}`}
              statLabel={`${formatNumber(topByCommits.commits)} commits`}
            />
          )}

          {topByLines && (
            <ContributorCard
              index={1}
              compact={isVertical}
              label="Most lines"
              name={topByLines.name}
              login={topByLines.login}
              repoHref={`/${repo.owner}/${repo.repo}`}
              statLabel={`${formatNumber(topByLines.lines)} lines`}
            />
          )}
        </div>
      )}
    </div>
  );

  const mapPanel = (
    <div
      style={{
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        background: theme.colors.background,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // On vertical/mobile: map claims remaining height so the card fills the slide
        ...(isVertical
          ? {
              width: '100%',
              minHeight: 180,
              flex: '1 1 auto',
            }
          : {}),
      }}
    >
      {!imageLoaded && !imageError && (
        <div
          style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: theme.colors.textMuted, fontSize: theme.fontSizes[1],
            zIndex: 2,
          }}
        >
          Loading map...
        </div>
      )}

      {imageError ? (
        <div
          style={{
            color: theme.colors.textMuted,
            fontSize: theme.fontSizes[1],
            textAlign: 'center',
            padding: 24,
          }}
        >
          Could not load city map
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={imageUrl}
          src={imageUrl}
          alt={`${repo.fullName} file city map`}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            opacity: imageLoaded ? 1 : 0,
            transition: 'opacity 0.25s ease',
          }}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageError(true)}
          draggable={false}
        />
      )}
    </div>
  );

  return (
    <div
      style={{
        width: '100%',
        height: isVertical ? 'auto' : 480,
        borderRadius: isVertical ? 12 : 16,
        overflow: 'hidden',
        border: `1px solid ${theme.colors.border}`,
        display: 'flex',
        flexDirection: isVertical ? 'column' : 'row',
        position: 'relative',
        background: theme.colors.surface,
        // Fill the swipe slide on mobile
        ...(isVertical
          ? {
              height: '100%',
              minHeight: '100%',
            }
          : {}),
      }}
    >
      <style>{`
        @keyframes heroCardIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {!!cycleProgress && (
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

      {infoPanel}
      {mapPanel}
    </div>
  );
}
