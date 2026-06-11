/**
 * `TrailBriefCardOG` — a Satori-safe static twin of the live `TrailBriefCard`
 * (`@industry-theme/file-city-panel`), rendered at 1200×628 for social link
 * previews (Open Graph / Twitter cards).
 *
 * Styled after the marketing card (`TrailMarketingCardOG`): a left-aligned
 * repo identity header → heading → author byline, beside a File City map on the
 * right. The map shows only the trail's *touched* files (the buildings its
 * markers' `sourcePath`s point at), top-down projected and colored by file
 * type, with a dashed trail threading them in order — mirroring the trail
 * explorer's filtered view. The map geometry is computed upstream
 * (`projectTouchedCity`) and passed in, so this component stays presentational.
 *
 * Pure presentational + plain inline styles, so the same component renders in
 * the OG route (Satori) and in Storybook (DOM). Every container sets
 * `display: flex` because Satori requires it on any multi-child element.
 */

import React from 'react';
import { OG_COLORS, OG_FONT, ogTruncate } from './ogTheme';
import type { FileMapData } from './fileCityProjection';
import { FileMapPanel } from './TrailFileMapPanel';

/** A person/repo identity — display name + optional avatar (a data URI or URL). */
export interface OgIdentity {
  name: string;
  avatarUrl?: string;
}

export interface TrailBriefCardOGProps {
  /** Card heading — the trail's `request` phrase (shared) or `title`. */
  heading: string;
  /** Trail author — shown as "by [avatar] name" in the byline. */
  author?: OgIdentity;
  /** Repo — owner avatar + repo name, shown in the top header slot. */
  repo?: OgIdentity;
  /** Projected File City map of the trail's touched files (right panel). */
  fileMap?: FileMapData | null;
}

/** Avatar (if present) + name. `avatarRadius` toggles circle (default) vs a
 *  rounded square (e.g. for a repo owner). */
function AvatarLabel({
  identity,
  size,
  fontSize,
  avatarRadius = 9999,
}: {
  identity: OgIdentity;
  size: number;
  fontSize: number;
  avatarRadius?: number;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {identity.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={identity.avatarUrl}
          width={size}
          height={size}
          alt=""
          style={{ width: size, height: size, borderRadius: avatarRadius }}
        />
      ) : null}
      <span style={{ color: OG_COLORS.textSecondary, fontSize, fontWeight: 500 }}>
        {identity.name}
      </span>
    </div>
  );
}

export function TrailBriefCardOG({
  heading,
  author,
  repo,
  fileMap,
}: TrailBriefCardOGProps) {
  const clampedHeading = ogTruncate(heading, 84);

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
      {/* File City map — right side. */}
      {fileMap ? <FileMapPanel map={fileMap} /> : null}

      {/* Left column — repo header → heading, byline pinned bottom. */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-start',
          width: fileMap ? 620 : 1200,
          height: 628,
          padding: 50,
        }}
      >
        {/* Repo identity header — owner avatar above the repo name, the name
            sitting where (and styled like) the old "Code Trail" eyebrow was. */}
        {repo ? (
          <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 28 }}>
            {repo.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={repo.avatarUrl}
                width={64}
                height={64}
                alt=""
                style={{ width: 64, height: 64, borderRadius: 14, marginBottom: 20 }}
              />
            ) : null}
            <span
              style={{
                color: OG_COLORS.primary,
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: 3,
                textTransform: 'uppercase',
              }}
            >
              {repo.name}
            </span>
          </div>
        ) : (
          // Fallback for cards with no repo identity: the original eyebrow.
          <div style={{ display: 'flex', marginBottom: 28 }}>
            <span
              style={{
                color: OG_COLORS.primary,
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: 3,
                textTransform: 'uppercase',
              }}
            >
              Code Trail
            </span>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            fontSize: 52,
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: -1,
            color: OG_COLORS.text,
          }}
        >
          {clampedHeading}
        </div>

        {/* "by [avatar] author" byline — directly under the heading. */}
        {author ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 24 }}>
            <span style={{ color: OG_COLORS.textTertiary, fontSize: 26 }}>by</span>
            <AvatarLabel identity={author} size={44} fontSize={26} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
