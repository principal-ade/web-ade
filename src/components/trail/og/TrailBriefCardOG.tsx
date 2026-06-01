/**
 * `TrailBriefCardOG` — a Satori-safe static twin of the live `TrailBriefCard`
 * (`@industry-theme/file-city-panel`), rendered at 1200×628 for social link
 * previews (Open Graph / Twitter cards).
 *
 * It is NOT the real card: Satori (next/og) can't run the interactive
 * component (theme hooks, markdown, tabs, note composers, `color-mix`). This
 * reproduces the card's *look* — published-chrome frame, eyebrow → heading →
 * CREATED/BY metadata row, summary body, and the REVIEWED BY / VISITORS
 * cohort strip — from a flat view-model with hand-ported styles (see
 * `ogTheme.ts`). Type scale is enlarged from the 640px modal to read on a
 * 1200px canvas.
 *
 * Pure presentational + plain inline styles, so the same component renders in
 * the OG route (Satori) and in Storybook (DOM). Every container sets
 * `display: flex` because Satori requires it on any multi-child element.
 */

import React from 'react';
import {
  OG_COLORS,
  OG_MIX,
  OG_FONT,
  ogInitials,
  ogTruncate,
} from './ogTheme';

export interface TrailBriefCardOGProps {
  /** Card heading — the trail's `request` phrase (shared) or `title`. */
  heading: string;
  /** Eyebrow kicker above the heading, e.g. `INVESTIGATION TRAIL`. */
  eyebrow?: string;
  /** `BY <author>` byline. */
  author?: string;
  /** Preformatted CREATED stamp (e.g. `3d ago`). Caller owns "now". */
  createdLabel?: string;
  /** Plain-text summary (markdown stripped/truncated upstream). */
  summary?: string;
  /** Marker count, surfaced as `· N STOPS`. */
  stopCount?: number;
  /** Reviewer display names — REVIEWED BY avatar strip (ringed). */
  reviewers?: string[];
  /** Count of distinct note authors — NOTES BY metric. */
  noteAuthorCount?: number;
  /** Total visitors (verified + anonymous) — VISITORS metric. */
  visitorCount?: number;
  /** Optional `owner/repo` tag shown top-right. */
  repoLabel?: string;
}

const MAX_AVATARS = 5;

/** Initials circle, ported from the live card's `Avatar`. */
function OgAvatar({ name, ringed }: { name: string; ringed?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 44,
        height: 44,
        borderRadius: 9999,
        border: ringed ? `3px solid ${OG_COLORS.success}` : 'none',
        background: OG_MIX.avatarBg,
        color: OG_COLORS.text,
        fontSize: 18,
        fontWeight: 700,
        letterSpacing: 0.4,
      }}
    >
      {ogInitials(name)}
    </div>
  );
}

/** A single uppercase metadata item: `LABEL value`. */
function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span style={{ color: OG_COLORS.textTertiary }}>{label}</span>
      <span style={{ color: OG_COLORS.textSecondary }}>{value}</span>
    </div>
  );
}

export function TrailBriefCardOG({
  heading,
  eyebrow,
  author,
  createdLabel,
  summary,
  stopCount,
  reviewers = [],
  noteAuthorCount = 0,
  visitorCount = 0,
  repoLabel,
}: TrailBriefCardOGProps) {
  const shownReviewers = reviewers.slice(0, MAX_AVATARS);
  const overflowReviewers = reviewers.length - shownReviewers.length;

  // The live Satori build ignores `lineClamp`, so we clamp by character
  // budget to keep both fields inside their fixed regions: ~2 lines of
  // heading (≈42 chars/line at 48px) and ~2 lines of summary. Sizing the
  // text to whole lines avoids the ugly mid-line clip overflow:hidden gives.
  const clampedHeading = ogTruncate(heading, 84);
  const clampedSummary = summary ? ogTruncate(summary, 168) : undefined;

  // Compact metrics that ride the footer strip's right edge.
  const metrics: string[] = [];
  if (typeof stopCount === 'number') metrics.push(`${stopCount} STOPS`);
  if (noteAuthorCount > 0) metrics.push(`NOTED BY ${noteAuthorCount}`);
  if (visitorCount > 0) metrics.push(`VISITORS ${visitorCount}`);

  return (
    <div
      style={{
        display: 'flex',
        width: 1200,
        height: 628,
        padding: 40,
        background: '#141517',
        fontFamily: OG_FONT,
        color: OG_COLORS.text,
      }}
    >
      {/* Published-chrome card: square corners + accent-tinted border. */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          background: OG_COLORS.backgroundSecondary,
          border: `2px solid ${OG_MIX.accentBorder}`,
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            padding: '40px 48px 32px',
            borderBottom: `1px solid ${OG_COLORS.border}`,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span
              style={{
                color: OG_COLORS.accent,
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: 3,
              }}
            >
              {eyebrow ?? 'CODE TRAIL'}
            </span>
            {repoLabel ? (
              <span style={{ color: OG_COLORS.textTertiary, fontSize: 20, letterSpacing: 1 }}>
                {repoLabel}
              </span>
            ) : null}
          </div>

          <div
            style={{
              display: 'flex',
              fontSize: 48,
              fontWeight: 700,
              lineHeight: 1.15,
              color: OG_COLORS.text,
            }}
          >
            {clampedHeading}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 28,
              fontSize: 22,
              letterSpacing: 1,
              textTransform: 'uppercase',
            }}
          >
            {createdLabel ? <MetaItem label="CREATED" value={createdLabel} /> : null}
            {author ? <MetaItem label="BY" value={author} /> : null}
          </div>
        </div>

        {/* Body — summary. Pre-truncated by the caller (the live Satori build
            ignores `lineClamp`, so length is bounded upstream); overflow:hidden
            is a belt-and-braces guard against an over-long line. */}
        <div
          style={{
            display: 'flex',
            flex: 1,
            padding: '32px 48px',
            fontSize: 26,
            lineHeight: 1.5,
            color: summary ? OG_COLORS.text : OG_COLORS.textMuted,
            overflow: 'hidden',
          }}
        >
          {clampedSummary || 'A guided trail through the codebase.'}
        </div>

        {/* Footer cohort strip */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            margin: '0 48px 40px',
            padding: '16px 24px',
            background: OG_COLORS.background,
            border: `1px solid ${OG_COLORS.border}`,
          }}
        >
          {shownReviewers.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span
                style={{
                  color: OG_COLORS.textTertiary,
                  fontSize: 20,
                  letterSpacing: 1,
                }}
              >
                REVIEWED BY
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {shownReviewers.map((name) => (
                  <OgAvatar key={name} name={name} ringed />
                ))}
                {overflowReviewers > 0 ? (
                  <span style={{ color: OG_COLORS.textSecondary, fontSize: 20 }}>
                    +{overflowReviewers}
                  </span>
                ) : null}
              </div>
            </div>
          ) : (
            <span style={{ color: OG_COLORS.textTertiary, fontSize: 20, letterSpacing: 1 }}>
              UNREVIEWED
            </span>
          )}

          {metrics.length > 0 ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 20,
                marginLeft: 'auto',
                color: OG_COLORS.textTertiary,
                fontSize: 20,
                letterSpacing: 1,
              }}
            >
              {metrics.map((m) => (
                <span key={m}>{m}</span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
