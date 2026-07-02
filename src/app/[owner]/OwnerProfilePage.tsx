'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useTheme } from '@principal-ade/industry-theme';
import { UserAvatarMenu } from '@/components/UserAvatarMenu';
import { Globe, MapPin, Star, GitFork, Lock, Github } from 'lucide-react';
import { TrailList, TopicList } from '@/components/home/SignedInDashboard';
import { ActivityHeatmap } from '@/components/ActivityHeatmap';
import type { TrailByUserEntry } from '@/lib/trails/types';
import type { TopicByUserEntry } from '@/lib/topics/types';

// ---- Types ---------------------------------------------------------------

interface OwnerProfile {
  login: string;
  /** GitHub numeric user id — used to look up Principal trails/topics manifests. */
  id: number;
  avatar_url: string;
  name: string | null;
  bio: string | null;
  type: 'User' | 'Organization';
  public_repos: number;
  followers: number;
  following: number;
  blog: string | null;
  location: string | null;
  twitter_username: string | null;
  html_url: string;
}

interface Repo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  updated_at: string;
  private: boolean;
}

interface DailyContribution { date: string; count: number }

interface ActivityEvent {
  id: string;
  type: 'commit' | 'pr_merged' | 'pr_opened' | 'issue_opened';
  timestamp: string;
  repository: string;
  metadata?: { commitCount?: number; additions?: number; deletions?: number };
}

interface ContributedRepo {
  nameWithOwner: string;
  owner: string;
  name: string;
  commitCount: number;
  lastContributedAt: string;
  ownerType: 'User' | 'Organization';
}

interface CommitGroup {
  repository: string;
  commitCount: number;
  additions: number;
  deletions: number;
  timestamp: string;
}

// ---- Helpers ---------------------------------------------------------------

const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178c6', JavaScript: '#f1e05a', Python: '#3572A5',
  Go: '#00ADD8', Rust: '#dea584', Java: '#b07219', 'C++': '#f34b7d',
  C: '#555555', Ruby: '#701516', PHP: '#4F5D95', Swift: '#F05138',
  Kotlin: '#A97BFF', Dart: '#00B4AB', Shell: '#89e051', CSS: '#563d7c',
  HTML: '#e34c26', Vue: '#41b883', Svelte: '#ff3e00',
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

// ---- RepoCard ---------------------------------------------------------------

const RepoCard: React.FC<{ repo: Repo }> = ({ repo }) => {
  const { theme } = useTheme();
  const langColor = repo.language ? (LANGUAGE_COLORS[repo.language] ?? theme.colors.textMuted) : null;

  return (
    <Link
      href={`/${repo.full_name}`}
      style={{
        display: 'flex', flexDirection: 'column', padding: 16, minHeight: 110,
        backgroundColor: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: 8, textDecoration: 'none',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.borderColor = `${theme.colors.primary}60`;
        (e.currentTarget as HTMLElement).style.boxShadow = `0 2px 8px ${theme.colors.primary}15`;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = theme.colors.border;
        (e.currentTarget as HTMLElement).style.boxShadow = 'none';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: theme.colors.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {repo.name}
        </span>
        {repo.private && <Lock size={12} color={theme.colors.textMuted} />}
      </div>

      <p style={{
        margin: '0 0 auto', paddingBottom: 12, fontSize: 12, color: theme.colors.textSecondary ?? theme.colors.textMuted,
        lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box',
        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
      }}>
        {repo.description ?? ''}
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: theme.colors.textMuted, flexWrap: 'wrap' }}>
        {langColor && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: langColor, flexShrink: 0 }} />
            {repo.language}
          </span>
        )}
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <Star size={12} />{formatCount(repo.stargazers_count)}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <GitFork size={12} />{formatCount(repo.forks_count)}
        </span>
        <span style={{ marginLeft: 'auto' }}>{relativeTime(repo.updated_at)}</span>
      </div>
    </Link>
  );
};

// ---- CommitRow (Activity tab) -----------------------------------------------

const CommitRow: React.FC<{ group: CommitGroup }> = ({ group }) => {
  const { theme } = useTheme();
  const slash = group.repository.indexOf('/');
  const repoOwner = slash !== -1 ? group.repository.slice(0, slash) : '';
  const repoName = slash !== -1 ? group.repository.slice(slash + 1) : group.repository;

  return (
    <Link
      href={`/${group.repository}`}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', gap: 12,
        backgroundColor: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: 8, textDecoration: 'none',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: theme.colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {repoName}
        </span>
        <span style={{ fontSize: 11, color: theme.colors.textMuted }}>{repoOwner}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, fontSize: 12, color: theme.colors.textMuted }}>
        <span>
          {group.commitCount} commit{group.commitCount !== 1 ? 's' : ''}
          {group.additions > 0 && <span style={{ color: theme.colors.success }}> +{group.additions}</span>}
          {group.deletions > 0 && <span style={{ color: theme.colors.error }}> -{group.deletions}</span>}
        </span>
        <span style={{ fontSize: 11 }}>{relativeTime(group.timestamp)}</span>
      </div>
    </Link>
  );
};

// ---- ContributedRepoRow ----------------------------------------------------

const ContributedRepoRow: React.FC<{ repo: ContributedRepo }> = ({ repo }) => {
  const { theme } = useTheme();

  return (
    <Link
      href={`/${repo.nameWithOwner}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px',
        backgroundColor: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: 8, textDecoration: 'none',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://github.com/${repo.owner}.png?size=32`}
        alt={repo.owner}
        style={{ width: 28, height: 28, borderRadius: repo.ownerType === 'Organization' ? 6 : '50%', flexShrink: 0 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: theme.colors.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {repo.name}
        </div>
        <div style={{ fontSize: 11, color: theme.colors.textMuted }}>{repo.owner}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: theme.colors.textMuted }}>
          {repo.commitCount} commit{repo.commitCount !== 1 ? 's' : ''}
        </span>
        <span style={{ fontSize: 11, color: theme.colors.textMuted }}>{relativeTime(repo.lastContributedAt)}</span>
      </div>
    </Link>
  );
};

// ---- Stat Block ------------------------------------------------------------

const StatBlock: React.FC<{ value: string | number; label: string }> = ({ value, label }) => {
  const { theme } = useTheme();
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: theme.colors.text, lineHeight: 1.2 }}>{value}</div>
      <div style={{ fontSize: 11, color: theme.colors.textMuted, marginTop: 2 }}>{label}</div>
    </div>
  );
};

// ---- Section Header --------------------------------------------------------

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme } = useTheme();
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, color: theme.colors.textMuted,
      textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10,
    }}>
      {children}
    </div>
  );
};

// ---- Main Component --------------------------------------------------------

export function OwnerProfilePage({ owner }: { owner: string }) {
  const { theme } = useTheme();
  const [tab, setTab] = useState<'overview' | 'activity' | 'trails' | 'topics'>('overview');

  const [profile, setProfile] = useState<OwnerProfile | null>(null);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [profileLoading, setProfileLoading] = useState(true);

  const [contributions, setContributions] = useState(new Map<string, number>());
  const [recentActivity, setRecentActivity] = useState<ActivityEvent[]>([]);
  const [contributedRepos, setContributedRepos] = useState<ContributedRepo[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);

  // Principal artifacts — loaded lazily once we have the owner's numeric id.
  const [trails, setTrails] = useState<TrailByUserEntry[] | null>(null);
  const [topics, setTopics] = useState<TopicByUserEntry[] | null>(null);
  const [trailsError, setTrailsError] = useState<string | null>(null);
  const [topicsError, setTopicsError] = useState<string | null>(null);

  useEffect(() => {
    setProfileLoading(true);
    fetch(`/api/github/owner/${owner}/repos`)
      .then(r => r.json())
      .then(data => {
        if (data.success && data.owner) {
          setProfile(data.owner as OwnerProfile);
          setRepos(((data.repositories ?? []) as Repo[]).slice(0, 9));
        }
      })
      .catch(console.error)
      .finally(() => setProfileLoading(false));
  }, [owner]);

  useEffect(() => {
    setActivityLoading(true);
    fetch(`/api/github/user/${owner}/activity?contributionDays=365&activityDays=1`)
      .then(r => r.json())
      .then(data => {
        const map = new Map<string, number>();
        (data.contributions as DailyContribution[] ?? []).forEach(c => map.set(c.date, c.count));
        setContributions(map);
        setRecentActivity(data.activity as ActivityEvent[] ?? []);
        setContributedRepos(data.contributedRepos as ContributedRepo[] ?? []);
      })
      .catch(console.error)
      .finally(() => setActivityLoading(false));
  }, [owner]);

  // Fetch Principal trails/topics once the owner's numeric id resolves. The
  // by-user manifests are keyed by GitHub id, not login.
  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    setTrails(null);
    setTrailsError(null);
    fetch(`/api/trails/by-user/${profile.id}`)
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
    return () => { cancelled = true; };
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    setTopics(null);
    setTopicsError(null);
    fetch(`/api/topics/by-user/${profile.id}`)
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
    return () => { cancelled = true; };
  }, [profile?.id]);

  const totalCommits = useMemo(() => {
    let s = 0; contributions.forEach(v => { s += v; }); return s;
  }, [contributions]);

  const commitGroups = useMemo((): CommitGroup[] => {
    const map = new Map<string, CommitGroup>();
    recentActivity.filter(e => e.type === 'commit').forEach(e => {
      const g = map.get(e.repository) ?? {
        repository: e.repository, commitCount: 0,
        additions: 0, deletions: 0, timestamp: e.timestamp,
      };
      g.commitCount += e.metadata?.commitCount ?? 1;
      g.additions += e.metadata?.additions ?? 0;
      g.deletions += e.metadata?.deletions ?? 0;
      if (e.timestamp > g.timestamp) g.timestamp = e.timestamp;
      map.set(e.repository, g);
    });
    return [...map.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [recentActivity]);

  const isOrg = profile?.type === 'Organization';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden', backgroundColor: theme.colors.background }}>
      <style>{`
        .owner-heatmap::-webkit-scrollbar { display: none; }
        @keyframes owner-spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* Header */}
      <header
        className="border-b px-5 flex items-center gap-2 flex-shrink-0 relative"
        style={{
          background: theme.colors.surface,
          borderColor: theme.colors.border,
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.875rem)',
          paddingBottom: '0.875rem',
          zIndex: 10,
        }}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Link
            href="/"
            className="text-xl font-bold transition-opacity hover:opacity-80"
            style={{ fontFamily: theme.fonts.body, textDecoration: 'none' }}
          >
            <span style={{ color: theme.colors.text }}>Principal</span>{' '}
            <span style={{ color: theme.colors.primary }}>AI</span>
          </Link>

          <span
            className="mx-2"
            style={{ color: theme.colors.textMuted }}
            aria-hidden="true"
          >
            /
          </span>

          <Link
            href={`/${owner}`}
            className="text-base font-semibold transition-opacity hover:opacity-80 truncate"
            style={{
              fontFamily: theme.fonts.body,
              color: theme.colors.text,
              textDecoration: 'none',
            }}
          >
            {owner}
          </Link>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <a
            href={`https://github.com/${owner}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80"
            style={{ color: theme.colors.text }}
            title={`Open ${owner} on GitHub`}
            aria-label={`Open ${owner} on GitHub`}
          >
            <Github className="w-5 h-5" />
          </a>
          <UserAvatarMenu />
        </div>
      </header>

      {/* Scrollable page body */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: 64 }}>

          {/* Heatmap banner */}
          <div style={{ height: 170, overflow: 'hidden' }}>
            <ActivityHeatmap activityData={contributions} bannerHeight={170} />
          </div>

          {/* Profile area — overlaps banner by 60px */}
          <div style={{ padding: '0 24px', marginTop: -60, position: 'relative' }}>

            {/* Avatar + stats row */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, marginBottom: 16 }}>
              {/* Avatar */}
              <div style={{
                width: 120, height: 120, flexShrink: 0,
                borderRadius: isOrg ? 16 : '50%',
                overflow: 'hidden',
                border: `4px solid ${theme.colors.background}`,
                backgroundColor: theme.colors.surface,
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}>
                {profile?.avatar_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatar_url} alt={profile.login} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                )}
              </div>

              {/* Stats */}
              {profile && (
                <div style={{ display: 'flex', gap: 24, paddingBottom: 6, flexWrap: 'wrap' }}>
                  <StatBlock value={activityLoading ? '…' : formatCount(totalCommits)} label="commits this year" />
                  <StatBlock value={formatCount(profile.public_repos)} label="repositories" />
                  {!isOrg && (
                    <>
                      <StatBlock value={formatCount(profile.followers)} label="followers" />
                      <StatBlock value={formatCount(profile.following)} label="following" />
                    </>
                  )}
                </div>
              )}

              {/* Spinner while profile loads */}
              {profileLoading && !profile && (
                <div style={{
                  width: 24, height: 24, marginBottom: 8,
                  border: `2px solid ${theme.colors.border}`,
                  borderTopColor: theme.colors.primary,
                  borderRadius: '50%',
                  animation: 'owner-spin 0.8s linear infinite',
                }} />
              )}
            </div>

            {/* Identity */}
            {profile && (
              <div style={{ marginBottom: 20 }}>
                {profile.name && (
                  <div style={{ fontSize: 22, fontWeight: 700, color: theme.colors.text, marginBottom: 2 }}>
                    {profile.name}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <a
                    href={profile.html_url} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 15, color: theme.colors.textMuted, textDecoration: 'none' }}
                  >
                    @{profile.login}
                  </a>
                  {profile.twitter_username && (
                    <>
                      <span style={{ color: theme.colors.border }}>·</span>
                      <a
                        href={`https://twitter.com/${profile.twitter_username}`}
                        target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 15, color: theme.colors.textMuted, textDecoration: 'none' }}
                      >
                        @{profile.twitter_username}
                      </a>
                    </>
                  )}
                </div>
                {profile.bio && (
                  <p style={{ margin: '0 0 10px', fontSize: 14, color: theme.colors.text, lineHeight: 1.5, maxWidth: 600 }}>
                    {profile.bio}
                  </p>
                )}
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {profile.location && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: theme.colors.textMuted }}>
                      <MapPin size={13} />{profile.location}
                    </span>
                  )}
                  {profile.blog && (
                    <a
                      href={profile.blog.startsWith('http') ? profile.blog : `https://${profile.blog}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: theme.colors.textMuted, textDecoration: 'none' }}
                    >
                      <Globe size={13} />{profile.blog.replace(/^https?:\/\//, '')}
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Tabs (users only) */}
            {!isOrg && !profileLoading && (
              <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: `1px solid ${theme.colors.border}` }}>
                {(['overview', 'activity', 'trails', 'topics'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    style={{
                      padding: '8px 16px', background: 'transparent', border: 'none',
                      borderBottom: tab === t ? `2px solid ${theme.colors.primary}` : '2px solid transparent',
                      marginBottom: -1,
                      color: tab === t ? theme.colors.text : theme.colors.textMuted,
                      fontSize: 14, fontWeight: tab === t ? 600 : 400,
                      cursor: 'pointer', textTransform: 'capitalize',
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}

            {/* Repos grid (overview / org) */}
            {(isOrg || tab === 'overview') && !profileLoading && (
              <div>
                {isOrg && <div style={{ marginBottom: 24 }} />}
                <SectionLabel>Repositories</SectionLabel>
                {repos.length === 0 ? (
                  <div style={{ color: theme.colors.textMuted, fontSize: 14, padding: '24px 0' }}>No repositories</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
                    {repos.map(repo => <RepoCard key={repo.id} repo={repo} />)}
                  </div>
                )}
              </div>
            )}

            {/* Activity tab */}
            {!isOrg && tab === 'activity' && !profileLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
                <div>
                  <SectionLabel>Recent Commits</SectionLabel>
                  {activityLoading ? (
                    <div style={{ color: theme.colors.textMuted, fontSize: 14 }}>Loading…</div>
                  ) : commitGroups.length === 0 ? (
                    <div style={{ color: theme.colors.textMuted, fontSize: 14 }}>No recent commits</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {commitGroups.map(g => <CommitRow key={g.repository} group={g} />)}
                    </div>
                  )}
                </div>

                <div>
                  <SectionLabel>Contributed Repositories</SectionLabel>
                  {activityLoading ? (
                    <div style={{ color: theme.colors.textMuted, fontSize: 14 }}>Loading…</div>
                  ) : contributedRepos.length === 0 ? (
                    <div style={{ color: theme.colors.textMuted, fontSize: 14 }}>No contributed repositories</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {contributedRepos.map(r => <ContributedRepoRow key={r.nameWithOwner} repo={r} />)}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Trails tab */}
            {!isOrg && tab === 'trails' && !profileLoading && (
              <div>
                <SectionLabel>Published Trails</SectionLabel>
                <TrailList trails={trails} error={trailsError} theme={theme} />
              </div>
            )}

            {/* Topics tab */}
            {!isOrg && tab === 'topics' && !profileLoading && (
              <div>
                <SectionLabel>Curated Topics</SectionLabel>
                <TopicList topics={topics} error={topicsError} theme={theme} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
