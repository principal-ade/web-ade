/**
 * `RepoCardOG` — the social-preview card for an owner/repo page, rendered at
 * 1200×628 for Open Graph / Twitter unfurls.
 *
 * Styled after the trail cards (`TrailMarketingCardOG` / `TrailBriefCardOG`): a
 * left-aligned identity column — owner avatar, repo name, description, and repo
 * stats — beside a File City map on the right. Unlike the trail cards, the map
 * shows the *whole* repo: every building colored by file type
 * (`projectFullCity`), no trail overlay — a fully-colored top-down portrait of
 * the codebase.
 *
 * Pure presentational + plain inline styles, so the same component renders in
 * the OG route (Satori) and in Storybook (DOM). Every container sets
 * `display: flex` because Satori requires it on any multi-child element. The
 * map geometry is computed upstream (`projectFullCity`) and passed in via
 * `fileMap`, keeping this component presentational.
 */

import React from 'react';
import { OG_COLORS, OG_FONT, ogTruncate } from '../../trail/og/ogTheme';
import type { FileMapData } from '../../trail/og/fileCityProjection';
import { FileMapPanel } from '../../trail/og/TrailFileMapPanel';

export interface RepoCardOGProps {
  /** Owner/organization login (e.g. "facebook"). */
  owner: string;
  /** Repository name (e.g. "react"). */
  repo: string;
  /** Owner avatar URL (GitHub avatar, a URL or data URI). */
  ownerAvatarUrl?: string;
  /** Repository description. */
  description?: string;
  /** Star count. */
  stars?: number;
  /** Primary programming language. */
  language?: string;
  /** File count. */
  files?: number;
  /** Projected full-city File City map (right panel). */
  fileMap?: FileMapData | null;
}

/** Primary-language → dot color, mirroring the file-type palette accents. */
const LANGUAGE_DOT: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572a5',
  Rust: '#dea584',
  Go: '#00add8',
  Java: '#b07219',
  'C++': '#f34b7d',
  C: '#888888',
  'C#': '#178600',
  Ruby: '#701516',
  PHP: '#4f5d95',
  Swift: '#f05138',
  Kotlin: '#a97bff',
  Shell: '#89e051',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Vue: '#41b883',
  Svelte: '#ff3e00',
};

/** Compact count: 1234 → "1.2k", 45000 → "45k". */
function formatCount(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k >= 10 ? Math.round(k) : k.toFixed(1)}k`;
}

/** Inline star glyph (filled), sized + colored inline for Satori. */
function StarIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2l2.95 5.98 6.6.96-4.78 4.66 1.13 6.57L12 17.02 6.1 20.17l1.13-6.57L2.45 8.94l6.6-.96L12 2z" />
    </svg>
  );
}

/** One metadata chip — leading glyph + label. */
function MetaItem({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{children}</div>
  );
}

export function RepoCardOG({
  owner,
  repo,
  ownerAvatarUrl,
  description,
  stars,
  language,
  files,
  fileMap,
}: RepoCardOGProps) {
  const clampedDescription = description ? ogTruncate(description, 120) : null;
  const langDot = language ? (LANGUAGE_DOT[language] ?? OG_COLORS.textMuted) : null;

  // Hero repo name. Shrink the font to keep a moderately-long name on one line
  // before it wraps: Satori can't measure text, so approximate the rendered
  // width as `len × 0.55em` and pick the largest size (≤72) that fits the
  // column's content width (472px when the map is present). Names that still
  // overflow at the 44px floor wrap inside the column via `maxWidth` below.
  const heroName = ogTruncate(repo, 24);
  const heroMaxWidth = fileMap ? 472 : 1072;
  const heroFontSize = Math.max(
    44,
    Math.min(72, Math.floor(heroMaxWidth / (heroName.length * 0.55))),
  );

  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        width: 1200,
        height: 628,
        background: OG_COLORS.background,
        fontFamily: OG_FONT,
        color: OG_COLORS.text,
        overflow: 'hidden',
      }}
    >
      {/* File City map — whole repo, colored, right side. */}
      {fileMap ? <FileMapPanel map={fileMap} /> : null}

      {/* Left column — owner avatar → repo name → description → stats. */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          width: fileMap ? 600 : 1200,
          height: 628,
          padding: '0 64px',
        }}
      >
        {/* Owner identity — avatar + login eyebrow. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          {ownerAvatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={ownerAvatarUrl}
              width={56}
              height={56}
              alt=""
              style={{ width: 56, height: 56, borderRadius: 12 }}
            />
          ) : null}
          <span
            style={{
              display: 'flex',
              color: OG_COLORS.textSecondary,
              fontSize: 28,
              fontWeight: 600,
            }}
          >
            {owner}
          </span>
        </div>

        {/* Repo name — the hero. Auto-shrinks to fit the column on one line,
            then wraps (constrained by `maxWidth`) once it hits the font floor;
            `overflow: hidden` clips the rare unbreakable token. */}
        <div
          style={{
            display: 'flex',
            maxWidth: heroMaxWidth,
            fontSize: heroFontSize,
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: -2,
            color: OG_COLORS.primary,
            overflow: 'hidden',
          }}
        >
          {heroName}
        </div>

        {/* Description. */}
        {clampedDescription ? (
          <div
            style={{
              display: 'flex',
              marginTop: 22,
              fontSize: 26,
              fontWeight: 400,
              lineHeight: 1.35,
              color: OG_COLORS.textSecondary,
            }}
          >
            {clampedDescription}
          </div>
        ) : null}

        {/* Stats row — stars · language · files. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 28,
            marginTop: 36,
            fontSize: 24,
            fontWeight: 500,
            color: OG_COLORS.textTertiary,
          }}
        >
          {typeof stars === 'number' ? (
            <MetaItem>
              <StarIcon size={24} color={OG_COLORS.secondary} />
              <span style={{ display: 'flex' }}>{formatCount(stars)}</span>
            </MetaItem>
          ) : null}
          {language && langDot ? (
            <MetaItem>
              <div
                style={{ width: 16, height: 16, borderRadius: 9999, background: langDot, display: 'flex' }}
              />
              <span style={{ display: 'flex' }}>{language}</span>
            </MetaItem>
          ) : null}
          {typeof files === 'number' ? (
            <MetaItem>
              <span style={{ display: 'flex' }}>{formatCount(files)} files</span>
            </MetaItem>
          ) : null}
        </div>
      </div>
    </div>
  );
}
