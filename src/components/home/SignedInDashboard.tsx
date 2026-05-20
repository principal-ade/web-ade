'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { ArrowRight, Folder, Footprints, Plus, Sparkles } from 'lucide-react';
import type { User } from '@/contexts/AuthContext';
import type { TopicByUserEntry } from '@/lib/topics/types';
import type { TrailByUserEntry } from '@/lib/trails/types';
import { AgentSkillsModal } from './AgentSkillsModal';

type ThemeShape = ReturnType<typeof useTheme>['theme'];

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

export interface SignedInDashboardViewProps {
  user: User;
  /** `null` = loading, `[]` = empty, populated = render. */
  trails: TrailByUserEntry[] | null;
  /** `null` = loading, `[]` = empty, populated = render. */
  topics: TopicByUserEntry[] | null;
  trailsError?: string | null;
  topicsError?: string | null;
}

/**
 * Pure presentational signed-in dashboard. Takes its data as props so it
 * can be rendered from stories / tests without a live fetch.
 */
export function SignedInDashboardView({
  user,
  trails,
  topics,
  trailsError = null,
  topicsError = null,
}: SignedInDashboardViewProps) {
  const { theme } = useTheme();
  const [skillsOpen, setSkillsOpen] = useState(false);
  const displayName = user.name || user.login;

  return (
    <section className="flex-1 w-full max-w-7xl mx-auto px-6 py-12">
      <div className="flex items-center gap-4 mb-10">
        {user.avatar_url && (
          // Plain <img> intentionally — GitHub avatar URLs are external and the
          // dashboard runs on the client; bypassing next/image avoids the
          // remote-pattern config dance for a 56px image.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatar_url}
            alt={displayName}
            className="w-14 h-14 rounded-full"
            style={{
              border: `1px solid color-mix(in srgb, ${theme.colors.border} 70%, transparent)`,
            }}
          />
        )}
        <div className="min-w-0">
          <div
            className="tracking-tight"
            style={{
              color: theme.colors.text,
              fontSize: `${theme.fontSizes[6]}px`,
              fontWeight: theme.fontWeights.semibold,
            }}
          >
            Welcome back, {displayName}.
          </div>
          <div
            style={{
              color: theme.colors.textMuted,
              fontSize: `${theme.fontSizes[2]}px`,
            }}
          >
            @{user.login}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <DashCard
          theme={theme}
          icon={<Footprints size={18} color={theme.colors.primary} />}
          title="Recent trails"
          subtitle="Trails you've published"
        >
          <TrailList trails={trails} error={trailsError} theme={theme} />
        </DashCard>

        <DashCard
          theme={theme}
          icon={<Folder size={18} color={theme.colors.primary} />}
          title="Your topics"
          subtitle="Curated collections of trails"
          action={
            <Link
              href="/topic/new"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-opacity hover:opacity-80"
              style={{
                background: theme.colors.primary,
                color: theme.colors.background,
                fontSize: `${theme.fontSizes[1]}px`,
                fontWeight: theme.fontWeights.medium,
              }}
            >
              <Plus size={14} />
              New topic
            </Link>
          }
        >
          <TopicList topics={topics} error={topicsError} theme={theme} />
        </DashCard>

        <DashCard
          theme={theme}
          icon={<Sparkles size={18} color={theme.colors.primary} />}
          title="Agent skills"
          subtitle="Get a tailored prompt for your editor agent"
          className="lg:col-span-2"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p
              style={{
                color: theme.colors.text,
                fontSize: `${theme.fontSizes[2]}px`,
              }}
            >
              Tell us what you want to do — author a trail, curate a topic, or
              browse what&rsquo;s on web-ade — and we&rsquo;ll hand you the
              skill name and the exact prompt to paste into your agent.
            </p>
            <button
              type="button"
              onClick={() => setSkillsOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md transition-opacity hover:opacity-80 flex-shrink-0"
              style={{
                background: theme.colors.primary,
                color: theme.colors.background,
                fontSize: `${theme.fontSizes[1]}px`,
                fontWeight: theme.fontWeights.medium,
              }}
            >
              <Sparkles size={14} />
              Pick a skill
              <ArrowRight size={14} />
            </button>
          </div>
        </DashCard>
      </div>

      <AgentSkillsModal open={skillsOpen} onClose={() => setSkillsOpen(false)} />
    </section>
  );
}

/**
 * Default export: fetches the signed-in user's trails + topics and renders
 * the view. Use this in real pages; use `SignedInDashboardView` from stories.
 */
export function SignedInDashboard({ user }: { user: User }) {
  const [trails, setTrails] = useState<TrailByUserEntry[] | null>(null);
  const [topics, setTopics] = useState<TopicByUserEntry[] | null>(null);
  const [trailsError, setTrailsError] = useState<string | null>(null);
  const [topicsError, setTopicsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTrails(null);
    setTrailsError(null);
    fetch(`/api/trails/by-user/${user.id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { entries: TrailByUserEntry[] }) => {
        if (!cancelled) setTrails(data.entries);
      })
      .catch((e) => {
        if (!cancelled) setTrailsError(String(e?.message ?? e));
      });
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  useEffect(() => {
    let cancelled = false;
    setTopics(null);
    setTopicsError(null);
    fetch(`/api/topics/by-user/${user.id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { entries: TopicByUserEntry[] }) => {
        if (!cancelled) setTopics(data.entries);
      })
      .catch((e) => {
        if (!cancelled) setTopicsError(String(e?.message ?? e));
      });
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  return (
    <SignedInDashboardView
      user={user}
      trails={trails}
      topics={topics}
      trailsError={trailsError}
      topicsError={topicsError}
    />
  );
}

function DashCard({
  theme,
  icon,
  title,
  subtitle,
  action,
  className,
  children,
}: {
  theme: ThemeShape;
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl p-5 backdrop-blur-xl ${className ?? ''}`}
      style={{
        background: `color-mix(in srgb, ${theme.colors.surface} 60%, transparent)`,
        border: `1px solid color-mix(in srgb, ${theme.colors.border} 50%, transparent)`,
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-2 min-w-0">
          {icon && <span className="mt-0.5">{icon}</span>}
          <div className="min-w-0">
            <h2
              className="tracking-tight"
              style={{
                color: theme.colors.text,
                fontSize: `${theme.fontSizes[4]}px`,
                fontWeight: theme.fontWeights.semibold,
              }}
            >
              {title}
            </h2>
            {subtitle && (
              <p
                style={{
                  color: theme.colors.textMuted,
                  fontSize: `${theme.fontSizes[1]}px`,
                }}
              >
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function TrailList({
  trails,
  error,
  theme,
}: {
  trails: TrailByUserEntry[] | null;
  error: string | null;
  theme: ThemeShape;
}) {
  if (error) {
    return (
      <div
        style={{
          color: theme.colors.textMuted,
          fontSize: `${theme.fontSizes[2]}px`,
        }}
      >
        Couldn&rsquo;t load trails: {error}
      </div>
    );
  }
  if (trails === null) {
    return (
      <div
        style={{
          color: theme.colors.textMuted,
          fontSize: `${theme.fontSizes[2]}px`,
        }}
      >
        Loading…
      </div>
    );
  }
  if (trails.length === 0) {
    return (
      <div
        style={{
          color: theme.colors.textMuted,
          fontSize: `${theme.fontSizes[2]}px`,
        }}
      >
        You haven&rsquo;t published any trails yet. Publish one from the File
        City panel to see it here.
      </div>
    );
  }
  const visible = trails.slice(0, 5);
  return (
    <ul className="flex flex-col gap-2">
      {visible.map((t) => (
        <li key={t.id}>
          <Link
            href={`/trail/${t.id}`}
            className="block rounded-md px-3 py-2 transition-colors hover:opacity-80"
            style={{
              background: `color-mix(in srgb, ${theme.colors.background} 50%, transparent)`,
              border: `1px solid color-mix(in srgb, ${theme.colors.border} 40%, transparent)`,
            }}
          >
            <div
              className="truncate"
              style={{
                color: theme.colors.text,
                fontSize: `${theme.fontSizes[2]}px`,
                fontWeight: theme.fontWeights.medium,
              }}
            >
              {t.title}
            </div>
            <div
              className="flex items-center gap-2 mt-0.5"
              style={{
                color: theme.colors.textMuted,
                fontSize: `${theme.fontSizes[1]}px`,
              }}
            >
              <span className="truncate">
                {t.owner}/{t.repo}
              </span>
              <span aria-hidden>·</span>
              <span>{t.markerCount} markers</span>
              <span aria-hidden>·</span>
              <span>{relativeTime(t.updatedAt)}</span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function TopicList({
  topics,
  error,
  theme,
}: {
  topics: TopicByUserEntry[] | null;
  error: string | null;
  theme: ThemeShape;
}) {
  if (error) {
    return (
      <div
        style={{
          color: theme.colors.textMuted,
          fontSize: `${theme.fontSizes[2]}px`,
        }}
      >
        Couldn&rsquo;t load topics: {error}
      </div>
    );
  }
  if (topics === null) {
    return (
      <div
        style={{
          color: theme.colors.textMuted,
          fontSize: `${theme.fontSizes[2]}px`,
        }}
      >
        Loading…
      </div>
    );
  }
  if (topics.length === 0) {
    return (
      <div
        style={{
          color: theme.colors.textMuted,
          fontSize: `${theme.fontSizes[2]}px`,
        }}
      >
        No topics yet. Create one to curate a set of trails on a shared
        subject.
      </div>
    );
  }
  const visible = topics.slice(0, 5);
  return (
    <ul className="flex flex-col gap-2">
      {visible.map((t) => (
        <li key={t.id}>
          <Link
            href={`/topic/${t.id}`}
            className="block rounded-md px-3 py-2 transition-colors hover:opacity-80"
            style={{
              background: `color-mix(in srgb, ${theme.colors.background} 50%, transparent)`,
              border: `1px solid color-mix(in srgb, ${theme.colors.border} 40%, transparent)`,
            }}
          >
            <div
              className="truncate"
              style={{
                color: theme.colors.text,
                fontSize: `${theme.fontSizes[2]}px`,
                fontWeight: theme.fontWeights.medium,
              }}
            >
              {t.title}
            </div>
            <div
              className="flex items-center gap-2 mt-0.5"
              style={{
                color: theme.colors.textMuted,
                fontSize: `${theme.fontSizes[1]}px`,
              }}
            >
              <span>{t.trailCount} trails</span>
              <span aria-hidden>·</span>
              <span>{relativeTime(t.updatedAt)}</span>
            </div>
            {t.descriptionPreview && (
              <div
                className="mt-1 line-clamp-2"
                style={{
                  color: theme.colors.textMuted,
                  fontSize: `${theme.fontSizes[1]}px`,
                }}
              >
                {t.descriptionPreview}
              </div>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
