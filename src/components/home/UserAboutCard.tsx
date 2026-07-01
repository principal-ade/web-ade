'use client';

import {
  Building2,
  CalendarDays,
  FolderGit2,
  MapPin,
  Users,
} from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';

// ---------------------------------------------------------------------------
// Home "About you" card — the user-based sibling of RepoAboutCard. Same visual
// treatment as the owner/repo About block, but about the signed-in person: their
// avatar/name/@login, GitHub bio, and profile stats. Presentational (takes its
// data as props, no fetching) so it renders in isolation and drives cleanly from
// Storybook. A connected wrapper merges the auth session with a GitHub user
// fetch and feeds this in real pages.
// ---------------------------------------------------------------------------

/**
 * The fields the card reads. Identity (login/name/avatar) is known from the auth
 * session; the richer fields (bio, stats, dates) come from the GitHub user API.
 */
export interface UserAboutInfo {
  login: string;
  name?: string | null;
  avatar_url?: string;
  /** GitHub profile URL. Defaults to `https://github.com/<login>` when omitted. */
  html_url?: string;
  bio?: string | null;
  company?: string | null;
  location?: string | null;
  followers?: number | null;
  following?: number | null;
  public_repos?: number | null;
  /** ISO timestamp of when the account was created ("Joined …"). */
  created_at?: string | null;
}

export interface UserAboutCardProps {
  /** The user. `null` while loading (renders a skeleton when `loading`). */
  info: UserAboutInfo | null;
  /** In-flight flag: with `info === null` and `loading`, show the skeleton. */
  loading?: boolean;
  /** Drop the bottom divider so a caller can group a control directly beneath. */
  showBorder?: boolean;
}

// GitHub-style "Joined Mar 2013" from an ISO timestamp.
function joinedLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

export function UserAboutCard({
  info,
  loading = false,
  showBorder = true,
}: UserAboutCardProps) {
  const { theme } = useTheme();

  if (!info)
    return loading ? <UserAboutCardSkeleton showBorder={showBorder} /> : null;

  const profileUrl = info.html_url ?? `https://github.com/${info.login}`;
  const displayName = info.name || info.login;
  const joined = info.created_at ? joinedLabel(info.created_at) : null;

  return (
    <div
      className={`px-5 pt-5 pb-4 flex flex-col gap-3${showBorder ? ' border-b' : ''}`}
      style={{ borderColor: theme.colors.border }}
    >
      {/* Identity: avatar + name + @login, linking out to the GitHub profile. */}
      <div className="flex items-center gap-3 min-w-0">
        <a
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 transition-opacity hover:opacity-80"
          title={`Open @${info.login} on GitHub`}
        >
          {info.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`${info.avatar_url}${info.avatar_url.includes('?') ? '&' : '?'}s=96`}
              alt={displayName}
              width={48}
              height={48}
              className="rounded-full block"
              style={{
                background: theme.colors.backgroundSecondary,
                border: `1px solid ${theme.colors.border}`,
              }}
            />
          ) : (
            <div
              className="rounded-full flex items-center justify-center"
              style={{
                width: 48,
                height: 48,
                background: theme.colors.backgroundSecondary,
                color: theme.colors.textSecondary,
                fontSize: theme.fontSizes[3],
                fontWeight: theme.fontWeights.semibold,
                border: `1px solid ${theme.colors.border}`,
              }}
            >
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
        </a>
        <a
          href={profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 transition-opacity hover:opacity-80"
          style={{ textDecoration: 'none' }}
        >
          <h1
            className="min-w-0 truncate"
            style={{
              margin: 0,
              fontFamily: theme.fonts.body,
              fontSize: theme.fontSizes[4],
              fontWeight: theme.fontWeights.bold,
              color: theme.colors.primary,
              lineHeight: 1.2,
            }}
          >
            {displayName}
          </h1>
          <div
            className="truncate"
            style={{
              color: theme.colors.textMuted,
              fontSize: theme.fontSizes[1],
            }}
          >
            @{info.login}
          </div>
        </a>
      </div>

      {info.bio ? (
        <p
          style={{
            margin: 0,
            color: theme.colors.text,
            fontSize: theme.fontSizes[2],
            lineHeight: 1.4,
          }}
        >
          {info.bio}
        </p>
      ) : (
        <p
          style={{
            margin: 0,
            color: theme.colors.textMuted,
            fontSize: theme.fontSizes[1],
            lineHeight: 1.4,
            fontStyle: 'italic',
          }}
        >
          No bio yet.
        </p>
      )}

      {/* Facts row: public repo count (left) + joined date (right). */}
      {(joined || info.public_repos != null) && (
        <div
          className="flex items-center justify-between gap-2"
          style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[1] }}
        >
          {info.public_repos != null ? (
            <span className="inline-flex items-center gap-1.5">
              <FolderGit2 size={14} />
              {info.public_repos.toLocaleString()} repos
            </span>
          ) : (
            <span />
          )}
          {joined && (
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays size={14} />
              Joined {joined}
            </span>
          )}
        </div>
      )}

      {/* Company / location, when present. */}
      {(info.company || info.location) && (
        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-1"
          style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[1] }}
        >
          {info.company && (
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <Building2 size={14} className="shrink-0" />
              <span className="truncate">{info.company}</span>
            </span>
          )}
          {info.location && (
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <MapPin size={14} className="shrink-0" />
              <span className="truncate">{info.location}</span>
            </span>
          )}
        </div>
      )}

      {/* Followers / following. */}
      {(info.followers != null || info.following != null) && (
        <div
          className="inline-flex items-center gap-1.5"
          style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[1] }}
        >
          <Users size={14} className="shrink-0" />
          <span>
            {info.followers != null && (
              <>
                <span
                  style={{
                    color: theme.colors.text,
                    fontWeight: theme.fontWeights.semibold,
                  }}
                >
                  {info.followers.toLocaleString()}
                </span>{' '}
                followers
              </>
            )}
            {info.followers != null && info.following != null && ' · '}
            {info.following != null && (
              <>
                <span
                  style={{
                    color: theme.colors.text,
                    fontWeight: theme.fontWeights.semibold,
                  }}
                >
                  {info.following.toLocaleString()}
                </span>{' '}
                following
              </>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

export function UserAboutCardSkeleton({
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
    animation: 'userAboutPulse 1.5s ease-in-out infinite',
  });
  return (
    <div
      className={`px-5 pt-5 pb-4 flex flex-col gap-3${showBorder ? ' border-b' : ''}`}
      style={{ borderColor: theme.colors.border }}
      aria-busy="true"
    >
      <div className="flex items-center gap-3">
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: '9999px',
            backgroundColor: theme.colors.border,
            animation: 'userAboutPulse 1.5s ease-in-out infinite',
          }}
        />
        <div className="flex flex-col gap-1.5">
          <div style={bar(140, 18, 6)} />
          <div style={bar(90, 12)} />
        </div>
      </div>
      <div style={bar('100%', 14)} />
      <div style={bar('60%', 14)} />
      <div className="flex items-center justify-between">
        <div style={bar(96, 12)} />
        <div style={bar(64, 12)} />
      </div>
      <style>{`
        @keyframes userAboutPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
