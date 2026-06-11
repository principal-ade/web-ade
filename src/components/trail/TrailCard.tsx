'use client';

/**
 * TrailCard — a live, themed, interactive twin of the trail OG card
 * (`TrailBriefCardOG`), for the home/explore trail feed.
 *
 * Mirrors the OG card's content (repo identity header → heading → author
 * byline) beside the trail's File City map, but uses live theme tokens
 * (`useTheme`) instead of the OG card's baked hexes and links to `/trail/{id}`.
 * The repo avatar + name sit up top in place of the OG card's File City logo.
 *
 * The map lives behind one boundary — `TrailCardMap`. Phase 1 renders it as a
 * lazy `<img>` of the map-only image route (`/api/og/trail/{id}/map`), which
 * reuses the OG card's exact `FileMapPanel` renderer (dashed trail + stop dots)
 * so the feed is pixel-faithful and cheap. A later phase can swap that `<img>`
 * for a live highlight map without touching the rest of the card.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useTheme } from '@principal-ade/industry-theme';

export interface TrailCardProps {
  id: string;
  /** Trail heading — the index entry's `title`. */
  heading: string;
  owner: string;
  repo: string;
  /** Author GitHub login (`createdBy.githubLogin`), shown in the byline. */
  authorLogin?: string;
  /** ISO 8601 — shown as a relative "Nd ago" stamp. */
  updatedAt?: string;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diffSec = Math.max(0, (Date.now() - then) / 1000);
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 86400 * 30) return `${Math.floor(diffSec / 86400)}d ago`;
  if (diffSec < 86400 * 365) return `${Math.floor(diffSec / (86400 * 30))}mo ago`;
  return `${Math.floor(diffSec / (86400 * 365))}y ago`;
}

/**
 * The map slot — a lazy image of the map-only OG route. Shows a subtle skeleton
 * until the image loads and hides itself if the map errors or is empty.
 */
function TrailCardMap({ id }: { id: string }) {
  const { theme } = useTheme();
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  return (
    <div
      className="relative order-2 w-full sm:order-none sm:w-[300px] aspect-square flex-shrink-0"
      style={{ background: theme.colors.background }}
    >
      {/* Skeleton shimmer until the map image resolves. */}
      {!loaded && !errored && (
        <div
          className="absolute inset-0 animate-pulse"
          style={{
            background: `color-mix(in srgb, ${theme.colors.textMuted} 12%, transparent)`,
          }}
        />
      )}
      {!errored && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/og/trail/${encodeURIComponent(id)}/map`}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300"
          style={{ opacity: loaded ? 1 : 0 }}
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
        />
      )}
    </div>
  );
}

export function TrailCard({
  id,
  heading,
  owner,
  repo,
  authorLogin,
  updatedAt,
}: TrailCardProps) {
  const { theme } = useTheme();
  const [hovered, setHovered] = useState(false);

  const meta = updatedAt ? relativeTime(updatedAt) : '';

  return (
    <Link
      href={`/trail/${encodeURIComponent(id)}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex flex-col sm:flex-row overflow-hidden no-underline transition-colors"
      style={{
        background: theme.colors.surface,
        border: `1px solid ${
          hovered
            ? `color-mix(in srgb, ${theme.colors.primary} 60%, transparent)`
            : theme.colors.border
        }`,
        color: theme.colors.text,
      }}
    >
      {/* On desktop this is the left text column. On mobile it's
          `display:contents`, so the repo header and trail details join the
          card's column flow directly — letting the map (order-2) sit between
          them, i.e. repo identity above the map, trail details below it. */}
      <div className="contents sm:flex sm:flex-1 sm:flex-col sm:min-w-0 sm:p-6">
        {/* Repo header — owner avatar + repo name / owner + time. */}
        <div className="order-1 flex min-w-0 items-center gap-3 p-6 pb-3 sm:order-none sm:mb-4 sm:p-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://github.com/${encodeURIComponent(owner)}.png?size=96`}
            alt=""
            className="h-11 w-11 flex-shrink-0 rounded-xl"
          />
          <div className="flex min-w-0 flex-col">
            <span
              className="truncate text-base font-semibold leading-tight"
              style={{ color: theme.colors.text }}
            >
              {repo}
            </span>
            <span
              className="truncate text-sm leading-tight"
              style={{ color: theme.colors.textTertiary }}
            >
              {owner}
            </span>
          </div>
          {meta && (
            <span
              className="ml-auto whitespace-nowrap text-xs"
              style={{ color: theme.colors.textMuted }}
            >
              {meta}
            </span>
          )}
        </div>

        {/* Trail details — heading, byline at bottom. */}
        <div className="order-3 flex min-w-0 flex-1 flex-col p-6 pt-3 sm:order-none sm:p-0">
          <h3
            className="m-0 text-2xl font-bold leading-tight"
            style={{
              color: theme.colors.text,
              letterSpacing: -0.5,
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {heading}
          </h3>

          {authorLogin && (
            <div className="flex items-center gap-2 pt-5">
              <span className="text-sm" style={{ color: theme.colors.textTertiary }}>
                by
              </span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://github.com/${encodeURIComponent(authorLogin)}.png?size=64`}
                alt=""
                className="h-6 w-6 rounded-full"
              />
              <span
                className="text-sm font-medium"
                style={{ color: theme.colors.textSecondary }}
              >
                {authorLogin}
              </span>
            </div>
          )}
        </div>
      </div>

      <TrailCardMap id={id} />
    </Link>
  );
}
