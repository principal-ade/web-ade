'use client';

import {
  AlignLeft,
  BookOpen,
  CalendarDays,
  FileText,
  GitFork,
  Star,
} from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';

// ---------------------------------------------------------------------------
// Home "About" card — a standalone, presentational version of the owner/repo
// page's RepoOverview, tailored for the signed-in home's left panel. It takes
// its data as props (no data fetching, no RepoAnalysisProvider) so it renders
// in isolation and is trivial to drive from Storybook. A connected wrapper can
// feed it from the tRPC github hooks in real pages.
// ---------------------------------------------------------------------------

/** Minimal shape of the GitHub repo metadata the card reads. */
export interface RepoAboutInfo {
  description?: string | null;
  stargazers_count: number;
  created_at: string;
  license?: { spdx_id?: string | null } | null;
  fork?: boolean;
  parent?: { full_name: string } | null;
}

/** One contributor from GitHub's contributor graph. */
export interface RepoAboutContributor {
  id: number;
  login: string;
  avatar_url: string;
  html_url: string;
  contributions: number;
}

export interface RepoAboutCardProps {
  owner: string;
  repo: string;
  /** GitHub metadata. `null` while loading (renders a skeleton when `loading`). */
  info: RepoAboutInfo | null;
  /** In-flight flag: with `info === null` and `loading`, show the skeleton. */
  loading?: boolean;
  /** Top contributors. `null` = not loaded yet (faces row is simply omitted). */
  contributors?: RepoAboutContributor[] | null;
  /** Optional repo-size facts shown on the right of the facts row. */
  fileCount?: number | null;
  totalLines?: number | null;
  /** Click a contributor face → e.g. open their profile. Falls back to GitHub. */
  onSelectContributor?: (c: { login: string; avatar_url: string }) => void;
  /** When provided, the star becomes a toggle button. The caller manages auth
   *  and the API call — this component only renders the button. */
  starred?: boolean;
  onToggleStar?: () => void;
  starLoading?: boolean;
  /** Drop the bottom divider so a caller can group a control directly beneath. */
  showBorder?: boolean;
  /** When set, render a README button that calls `onOpenReadme`. */
  readmePath?: string | null;
  onOpenReadme?: () => void;
  readmeActive?: boolean;
}

const AVATAR_LIMIT = 4;

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diffMs = Date.now() - then;
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.round(mo / 12);
  return `${yr}y ago`;
}

// Copyleft SPDX ids get a squared badge; permissive licenses read as a full pill.
function licenseBadgeRadius(spdxId: string): number {
  const id = spdxId.toUpperCase();
  if (id.startsWith('GPL') || id.startsWith('AGPL')) return 4; // strong copyleft
  if (
    id.startsWith('LGPL') ||
    id.startsWith('MPL') ||
    id.startsWith('EPL') ||
    id.startsWith('CDDL') ||
    id.startsWith('OSL')
  ) {
    return 7; // weak copyleft
  }
  return 9999; // permissive → full pill
}

export function RepoAboutCard({
  owner,
  repo,
  info,
  loading = false,
  contributors,
  fileCount,
  totalLines,
  onSelectContributor,
  showBorder = true,
  readmePath,
  onOpenReadme,
  readmeActive = false,
  starred = false,
  onToggleStar,
  starLoading = false,
}: RepoAboutCardProps) {
  const { theme } = useTheme();

  // While the first fetch is in flight (cold cache), show a skeleton sized to
  // the real card so the pane doesn't flash blank-then-pop. Once the fetch
  // settles with no info, fall through to null rather than pulsing forever.
  if (!info) return loading ? <RepoAboutCardSkeleton showBorder={showBorder} /> : null;

  const license =
    info.license?.spdx_id && info.license.spdx_id !== 'NOASSERTION'
      ? info.license.spdx_id
      : null;

  const faces = (contributors ?? []).slice(0, AVATAR_LIMIT);

  return (
    <div
      className={`px-5 pt-5 pb-4 flex flex-col gap-3${showBorder ? ' border-b' : ''}`}
      style={{ borderColor: theme.colors.border }}
    >
      {/* Repo name (links out to GitHub) leads the card, with the star count and
          license badge right-aligned. */}
      <div className="flex items-center justify-between gap-2">
        <a
          href={`https://github.com/${owner}/${repo}`}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 transition-opacity hover:opacity-80"
          style={{ textDecoration: 'none' }}
          title={`Open ${owner}/${repo} on GitHub`}
        >
          <h1
            className="min-w-0"
            style={{
              margin: 0,
              fontFamily: theme.fonts.body,
              fontSize: theme.fontSizes[4],
              fontWeight: theme.fontWeights.bold,
              color: theme.colors.primary,
              lineHeight: 1.2,
              wordBreak: 'break-word',
            }}
          >
            {repo}
          </h1>
        </a>
        <div
          className="flex items-center gap-2 shrink-0"
          style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[1] }}
        >
          {license &&
            (() => {
              // MIT gets a green treatment; everything else stays neutral.
              const isMit = license === 'MIT';
              const accent = isMit
                ? theme.colors.success
                : theme.colors.textSecondary;
              return (
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: licenseBadgeRadius(license),
                    fontSize: theme.fontSizes[0],
                    fontWeight: theme.fontWeights.medium,
                    color: accent,
                    background: isMit
                      ? `color-mix(in srgb, ${theme.colors.success} 14%, transparent)`
                      : `color-mix(in srgb, ${theme.colors.text} 8%, transparent)`,
                    border: `1px solid ${
                      isMit
                        ? `color-mix(in srgb, ${theme.colors.success} 40%, transparent)`
                        : theme.colors.border
                    }`,
                  }}
                >
                  {license}
                </span>
              );
            })()}
          {info.stargazers_count > 0 && (
            onToggleStar ? (
              <button
                type="button"
                onClick={onToggleStar}
                disabled={starLoading}
                className="inline-flex items-center gap-1 transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{
                  fontSize: theme.fontSizes[2],
                  color: theme.colors.textMuted,
                  background: 'none',
                  border: 'none',
                  cursor: starLoading ? 'default' : 'pointer',
                  padding: 0,
                }}
                title={starred ? 'Unstar repository' : 'Star repository'}
              >
                <Star
                  size={16}
                  style={{ color: starred ? theme.colors.warning : theme.colors.textMuted }}
                  fill={starred ? theme.colors.warning : 'none'}
                />
                {info.stargazers_count.toLocaleString()}
              </button>
            ) : (
              <span
                className="inline-flex items-center gap-1"
                style={{ fontSize: theme.fontSizes[2] }}
              >
                <Star
                  size={16}
                  style={{ color: theme.colors.warning }}
                  fill={theme.colors.warning}
                />
                {info.stargazers_count.toLocaleString()}
              </span>
            )
          )}
        </div>
      </div>

      {info.description ? (
        <p
          style={{
            margin: 0,
            color: theme.colors.text,
            fontSize: theme.fontSizes[2],
            lineHeight: 1.4,
          }}
        >
          {info.description}
        </p>
      ) : (
        <>
          <p
            style={{
              margin: 0,
              color: theme.colors.textMuted,
              fontSize: theme.fontSizes[1],
              lineHeight: 1.4,
              fontStyle: 'italic',
            }}
          >
            No description for {owner}/{repo}.
          </p>
          <a
            href={`https://github.com/${owner}/${repo}`}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-opacity hover:opacity-80"
            style={{ color: theme.colors.primary, fontSize: theme.fontSizes[1] }}
          >
            Update on GitHub
          </a>
        </>
      )}

      {/* Repo facts: age (left) + total lines, or file count, on the right. */}
      <div
        className="flex items-center justify-between gap-2"
        style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[1] }}
      >
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays size={14} />
          Created {relativeTime(info.created_at)}
        </span>
        {totalLines ? (
          <span className="inline-flex items-center gap-1.5">
            <AlignLeft size={14} />
            {totalLines.toLocaleString()} lines
          </span>
        ) : fileCount != null ? (
          <span className="inline-flex items-center gap-1.5">
            <FileText size={14} />
            {fileCount.toLocaleString()} files
          </span>
        ) : null}
      </div>

      {/* Contributor faces: the top contributors. A handler opens a profile;
          otherwise each face links out to the contributor's GitHub page. */}
      {faces.length > 0 && (
        <div className="flex flex-col gap-1.5 mt-3">
          <span
            style={{
              fontSize: theme.fontSizes[0],
              fontWeight: theme.fontWeights.semibold,
              color: theme.colors.textSecondary,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Top contributors
          </span>
          <div className="flex items-stretch gap-2">
            {faces.map((c) => {
              const tip = `${c.login} · ${c.contributions.toLocaleString()} commits`;
              const cardBase =
                'flex flex-1 min-w-0 flex-col items-center gap-1.5 rounded-lg px-2 py-2';
              const cardStyle: React.CSSProperties = {
                border: `1px solid ${theme.colors.border}`,
                background: theme.colors.backgroundSecondary,
              };
              const inner = (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${c.avatar_url}${c.avatar_url.includes('?') ? '&' : '?'}s=80`}
                    alt={c.login}
                    width={40}
                    height={40}
                    className="rounded-full block"
                    style={{ background: theme.colors.backgroundSecondary }}
                  />
                  <span
                    className="block truncate w-full text-center"
                    style={{
                      fontSize: theme.fontSizes[0],
                      color: theme.colors.textSecondary,
                    }}
                  >
                    {c.login}
                  </span>
                  <span
                    className="block truncate w-full text-center"
                    style={{
                      fontSize: theme.fontSizes[0],
                      color: theme.colors.textMuted,
                    }}
                  >
                    {c.contributions.toLocaleString()}
                  </span>
                </>
              );
              return onSelectContributor ? (
                <button
                  key={c.id}
                  type="button"
                  onClick={() =>
                    onSelectContributor({
                      login: c.login,
                      avatar_url: c.avatar_url,
                    })
                  }
                  title={`${tip} — view recent activity`}
                  className={`${cardBase} transition-transform hover:scale-105`}
                  style={{ ...cardStyle, cursor: 'pointer' }}
                >
                  {inner}
                </button>
              ) : (
                <a
                  key={c.id}
                  href={c.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={tip}
                  className={`${cardBase} transition-transform hover:scale-105`}
                  style={cardStyle}
                >
                  {inner}
                </a>
              );
            })}
          </div>
        </div>
      )}

      {readmePath && onOpenReadme && (
        <button
          type="button"
          onClick={onOpenReadme}
          aria-pressed={readmeActive}
          className="mt-3 inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 transition-opacity hover:opacity-90"
          style={{
            fontSize: theme.fontSizes[1],
            fontWeight: theme.fontWeights.medium,
            border: `1px solid ${
              readmeActive ? theme.colors.primary : theme.colors.border
            }`,
            background: readmeActive
              ? `color-mix(in srgb, ${theme.colors.primary} 14%, transparent)`
              : theme.colors.backgroundSecondary,
            color: readmeActive ? theme.colors.primary : theme.colors.text,
            cursor: 'pointer',
          }}
        >
          <BookOpen size={15} />
          README
        </button>
      )}

      {info.fork && info.parent && (
        <div
          className="inline-flex items-center gap-1 min-w-0"
          style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[1] }}
        >
          <GitFork size={14} className="shrink-0" />
          <span className="shrink-0">forked from</span>
          <a
            href={`https://github.com/${info.parent.full_name}`}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate"
            style={{ color: theme.colors.primary }}
          >
            {info.parent.full_name}
          </a>
        </div>
      )}
    </div>
  );
}

export function RepoAboutCardSkeleton({
  showBorder = true,
}: {
  showBorder?: boolean;
}) {
  const { theme } = useTheme();
  const bar = (
    w: string | number,
    h: number,
    radius = 4,
  ): React.CSSProperties => ({
    width: w,
    height: h,
    borderRadius: radius,
    backgroundColor: theme.colors.border,
    animation: 'repoAboutPulse 1.5s ease-in-out infinite',
  });
  return (
    <div
      className={`px-5 pt-5 pb-4 flex flex-col gap-3${showBorder ? ' border-b' : ''}`}
      style={{ borderColor: theme.colors.border }}
      aria-busy="true"
    >
      <div className="flex items-center justify-between gap-2">
        <div style={bar('45%', 22, 6)} />
        <div style={bar(56, 18, 6)} />
      </div>
      <div style={bar('100%', 14)} />
      <div style={bar('70%', 14)} />
      <div className="flex flex-col gap-1.5 mt-1">
        <div style={bar(96, 10)} />
        <div className="flex items-stretch gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '9999px',
                  backgroundColor: theme.colors.border,
                  animation: 'repoAboutPulse 1.5s ease-in-out infinite',
                }}
              />
              <div style={bar(40, 8)} />
            </div>
          ))}
        </div>
      </div>
      <style>{`
        @keyframes repoAboutPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
