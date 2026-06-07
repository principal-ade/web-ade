/**
 * `TrailBriefCardOG` — a Satori-safe static twin of the live `TrailBriefCard`
 * (`@industry-theme/file-city-panel`), rendered at 1200×628 for social link
 * previews (Open Graph / Twitter cards).
 *
 * Styled after the marketing card (`TrailMarketingCardOG`): a left-aligned
 * eyebrow → heading → author byline, beside a File City map on the
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
import { FILE_CITY_LOGO_DATA_URI } from './fileCityLogo';

/** A person/repo identity — display name + optional avatar (a data URI or URL). */
export interface OgIdentity {
  name: string;
  avatarUrl?: string;
}

export interface TrailBriefCardOGProps {
  /** Card heading — the trail's `request` phrase (shared) or `title`. */
  heading: string;
  /** Trail author — shown as "Code Trail by [avatar] name" in the kicker. */
  author?: OgIdentity;
  /** Repo — owner avatar + repo name, shown in the top slot. */
  repo?: OgIdentity;
  /** Repo owner login — shown under the repo name in the top slot. */
  owner?: string;
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

/** The File City map panel — touched-file squares + dashed trail. */
function FileMapPanel({ map }: { map: FileMapData }) {
  const trailPath =
    map.centers.length > 1
      ? `M ${map.centers[0]!.x} ${map.centers[0]!.y} ` +
        map.centers
          .slice(1)
          .map((c) => `L ${c.x} ${c.y}`)
          .join(' ')
      : '';

  return (
    <div
      style={{
        position: 'absolute',
        top: (628 - map.h) / 2,
        right: 50,
        width: map.w,
        height: map.h,
        display: 'flex',
        background: OG_COLORS.backgroundSecondary,
        border: `1px solid ${OG_COLORS.border}`,
        borderRadius: 16,
        overflow: 'hidden',
      }}
    >
      {/* Directory platforms — back layer, the whole repo's folder structure. */}
      {map.districts.map((d, i) => (
        <div
          key={`d${i}`}
          style={{
            position: 'absolute',
            left: d.x,
            top: d.y,
            width: d.w,
            height: d.h,
            background: 'rgba(255, 255, 255, 0.03)',
            border: `1px solid ${OG_COLORS.border}`,
            borderRadius: 4,
            display: 'flex',
          }}
        />
      ))}

      {/* Touched file squares, colored by file type. */}
      {map.rects.map((r, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: r.x,
            top: r.y,
            width: r.w,
            height: r.h,
            background: r.color,
            borderRadius: 3,
            display: 'flex',
          }}
        />
      ))}

      {/* Dashed trail above the file squares. */}
      {trailPath ? (
        <svg
          width={map.w}
          height={map.h}
          viewBox={`0 0 ${map.w} ${map.h}`}
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
          <path
            d={trailPath}
            fill="none"
            stroke={OG_COLORS.primary}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="6 5"
            opacity={0.85}
          />
        </svg>
      ) : null}

      {/* Stop dots — one per touched building center, on top of the trail. */}
      {map.centers.map((c, i) => {
        const d = 11;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: c.x - d / 2,
              top: c.y - d / 2,
              width: d,
              height: d,
              borderRadius: 9999,
              background: OG_COLORS.primary,
              border: `2px solid ${OG_COLORS.background}`,
              display: 'flex',
            }}
          />
        );
      })}

    </div>
  );
}

export function TrailBriefCardOG({
  heading,
  author,
  repo,
  owner,
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

      {/* Left column — eyebrow → heading → byline at top, repo pinned bottom. */}
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
        {/* File City logo — brand mark above the eyebrow. */}
        <div style={{ display: 'flex', marginBottom: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={FILE_CITY_LOGO_DATA_URI} width={44} height={44} alt="" />
        </div>

        <div style={{ display: 'flex', marginBottom: 22 }}>
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

        {/* "by [avatar] author" byline, under the title. */}
        {author ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 24 }}>
            <span style={{ color: OG_COLORS.textTertiary, fontSize: 26 }}>by</span>
            <AvatarLabel identity={author} size={44} fontSize={26} />
          </div>
        ) : null}

        {/* Repo — owner avatar + repo name, with the owner login stacked
            underneath. Pinned to the bottom of the column. */}
        {repo ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 'auto' }}>
            {repo.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={repo.avatarUrl}
                width={84}
                height={84}
                alt=""
                style={{ width: 84, height: 84, borderRadius: 18 }}
              />
            ) : null}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: OG_COLORS.text, fontSize: 30, fontWeight: 600, lineHeight: 1.1 }}>
                {repo.name}
              </span>
              {owner ? (
                <span style={{ color: OG_COLORS.textTertiary, fontSize: 22, lineHeight: 1.1, marginTop: 2 }}>
                  {owner}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
