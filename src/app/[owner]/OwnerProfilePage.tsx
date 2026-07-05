'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Boxes, Github } from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';
import { UserAvatarMenu } from '@/components/UserAvatarMenu';
import { AgentViewButton } from '@/components/AgentViewButton';
import { RepoSearchBar } from '@/components/RepoSearchBar';
import { RepoFileCityPane } from '@/components/home/RepoFileCityPane';
import type { UserAboutInfo } from '@/components/home/UserAboutCard';
import type { ProjectRepo } from '@/components/home/HomeProjectsView';
import type {
  TrailListItem,
  TopicListItem,
} from '@/components/home/HomeTrailsTopicsView';
import type { TrailByUserEntry } from '@/lib/trails/types';
import type { TopicByUserEntry } from '@/lib/topics/types';
import { OwnerLeftPanel } from './OwnerLeftPanel';
import type { CommitGroup, ContributedRepo } from './OwnerActivityView';

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
  created_at?: string | null;
}

interface Repo {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string; avatar_url?: string };
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  updated_at: string;
  private: boolean;
}

interface DailyContribution {
  date: string;
  count: number;
}

interface ActivityEvent {
  id: string;
  type: 'commit' | 'pr_merged' | 'pr_opened' | 'issue_opened';
  timestamp: string;
  repository: string;
  metadata?: { commitCount?: number; additions?: number; deletions?: number };
}

// Path of an org's profile README inside its `.github` repo.
const ORG_PROFILE_README = 'profile/README.md';

// ---- Main Component --------------------------------------------------------

export function OwnerProfilePage({ owner }: { owner: string }) {
  const { theme } = useTheme();

  const [profile, setProfile] = useState<OwnerProfile | null>(null);
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [reposError, setReposError] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  // Pinned repo full names ("owner/repo") from the GraphQL pinned-items API.
  const [pinnedNames, setPinnedNames] = useState<string[] | null>(null);

  const [contributions, setContributions] = useState(new Map<string, number>());
  const [recentActivity, setRecentActivity] = useState<ActivityEvent[]>([]);
  const [contributedRepos, setContributedRepos] = useState<ContributedRepo[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);

  // Principal artifacts — loaded lazily once we have the owner's numeric id.
  const [trails, setTrails] = useState<TrailListItem[] | null>(null);
  const [topics, setTopics] = useState<TopicListItem[] | null>(null);

  // The repo shown in the right-pane File City. Auto-seeded with the owner's
  // profile repo (see below) so the page lands on a live city instead of an
  // empty pane; the user can pick any other from the Repositories rail.
  const [selected, setSelected] = useState<ProjectRepo | null>(null);

  // An org's profile README lives in a `.github` repo at `profile/README.md`,
  // and GitHub hides `.github` from the repo listing — so we can't find it the
  // way we find a user's `<login>/<login>` repo. Probe for it directly; when it
  // exists it becomes the default selection with an explicit README path.
  const [orgProfileRepo, setOrgProfileRepo] = useState<ProjectRepo | null>(null);
  // Gates auto-select until the (async) org probe settles, so an org doesn't
  // briefly land on its most-recent repo before the profile repo resolves.
  const [orgProbeDone, setOrgProbeDone] = useState(false);

  useEffect(() => {
    setProfileLoading(true);
    setReposError(null);
    fetch(`/api/github/owner/${owner}/repos`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.owner) {
          setProfile(data.owner as OwnerProfile);
          setRepos((data.repositories ?? []) as Repo[]);
        } else {
          setReposError(data.error ?? 'Could not load this owner.');
          setRepos([]);
        }
      })
      .catch((e) => {
        setReposError(String(e?.message ?? e));
        setRepos([]);
      })
      .finally(() => setProfileLoading(false));
  }, [owner]);

  useEffect(() => {
    let cancelled = false;
    setPinnedNames(null);
    fetch(`/api/github/user/${owner}/pinned`)
      .then((r) => (r.ok ? r.json() : { pinnedRepos: [] }))
      .then((data: { pinnedRepos?: string[] }) => {
        if (!cancelled) setPinnedNames(data.pinnedRepos ?? []);
      })
      .catch(() => {
        if (!cancelled) setPinnedNames([]);
      });
    return () => {
      cancelled = true;
    };
  }, [owner]);

  useEffect(() => {
    setActivityLoading(true);
    fetch(`/api/github/user/${owner}/activity?contributionDays=365&activityDays=1`)
      .then((r) => r.json())
      .then((data) => {
        const map = new Map<string, number>();
        ((data.contributions as DailyContribution[]) ?? []).forEach((c) =>
          map.set(c.date, c.count),
        );
        setContributions(map);
        setRecentActivity((data.activity as ActivityEvent[]) ?? []);
        setContributedRepos((data.contributedRepos as ContributedRepo[]) ?? []);
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
    fetch(`/api/trails/by-user/${profile.id}`)
      .then((r) => (r.ok ? r.json() : { entries: [] }))
      .then((data: { entries: TrailByUserEntry[] }) => {
        if (cancelled) return;
        setTrails(
          (data.entries ?? []).map((e) => ({
            id: e.id,
            title: e.title,
            owner: e.owner,
            repo: e.repo,
            markerCount: e.markerCount,
            updatedAt: e.updatedAt,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setTrails([]);
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    setTopics(null);
    fetch(`/api/topics/by-user/${profile.id}`)
      .then((r) => (r.ok ? r.json() : { entries: [] }))
      .then((data: { entries: TopicByUserEntry[] }) => {
        if (cancelled) return;
        setTopics(
          (data.entries ?? []).map((e) => ({
            id: e.id,
            title: e.title,
            trailCount: e.trailCount,
            updatedAt: e.updatedAt,
            descriptionPreview: e.descriptionPreview,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setTopics([]);
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  const totalCommits = useMemo(() => {
    let s = 0;
    contributions.forEach((v) => {
      s += v;
    });
    return s;
  }, [contributions]);

  const commitGroups = useMemo((): CommitGroup[] => {
    const map = new Map<string, CommitGroup>();
    recentActivity
      .filter((e) => e.type === 'commit')
      .forEach((e) => {
        const g = map.get(e.repository) ?? {
          repository: e.repository,
          commitCount: 0,
          additions: 0,
          deletions: 0,
          timestamp: e.timestamp,
        };
        g.commitCount += e.metadata?.commitCount ?? 1;
        g.additions += e.metadata?.additions ?? 0;
        g.deletions += e.metadata?.deletions ?? 0;
        if (e.timestamp > g.timestamp) g.timestamp = e.timestamp;
        map.set(e.repository, g);
      });
    return [...map.values()].sort((a, b) =>
      b.timestamp.localeCompare(a.timestamp),
    );
  }, [recentActivity]);

  // Owner repos as the rail's ProjectRepo shape.
  const projectRepos = useMemo<ProjectRepo[] | null>(
    () =>
      repos?.map((r) => ({
        id: r.id,
        full_name: r.full_name,
        name: r.name,
        owner: { login: r.owner?.login ?? owner, avatar_url: r.owner?.avatar_url },
        description: r.description,
        language: r.language,
        stargazers_count: r.stargazers_count,
        private: r.private,
      })) ?? null,
    [repos, owner],
  );

  // Probe for an org's `.github` profile repo once we know the owner is an org.
  // Users resolve their profile repo from the listing (below), so their probe is
  // a no-op that just marks the gate done.
  useEffect(() => {
    setOrgProfileRepo(null);
    setOrgProbeDone(false);
    if (!profile) return;
    if (profile.type !== 'Organization') {
      setOrgProbeDone(true);
      return;
    }
    let cancelled = false;
    fetch(
      `/api/github/repo/${owner}/.github?action=file&path=${encodeURIComponent(
        ORG_PROFILE_README,
      )}`,
    )
      .then((r) => {
        if (cancelled || !r.ok) return;
        setOrgProfileRepo({
          id: -1,
          full_name: `${owner}/.github`,
          name: '.github',
          owner: { login: owner, avatar_url: profile.avatar_url },
        });
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setOrgProbeDone(true);
      });
    return () => {
      cancelled = true;
    };
  }, [profile, owner]);

  // Pinned repos, enriched from the loaded repo list (which carries description /
  // language / stars — the pinned API only returns full names). Pinned repos not
  // in the list (e.g. pinned someone else's repo) fall back to a name-only row.
  const pinnedRepos = useMemo<ProjectRepo[] | null>(() => {
    if (pinnedNames === null) return null;
    return pinnedNames.map((fullName, i) => {
      const match = projectRepos?.find((r) => r.full_name === fullName);
      if (match) return match;
      const [login, name] = fullName.split('/');
      return {
        id: -100 - i,
        full_name: fullName,
        name: name ?? fullName,
        owner: { login: login ?? owner },
      };
    });
  }, [pinnedNames, projectRepos, owner]);

  // Seed the right pane once repos land and the org probe has settled. Prefer
  // the owner's GitHub *profile* repo — an org's `.github` repo, or a user's
  // `<login>/<login>` repo — whose README is the intro GitHub renders on the
  // profile page; fall back to the most recently-updated repo otherwise.
  useEffect(() => {
    if (selected || !projectRepos || !orgProbeDone) return;
    if (orgProfileRepo) {
      setSelected(orgProfileRepo);
      return;
    }
    const userProfileRepo =
      profile?.type !== 'Organization'
        ? projectRepos.find((r) => r.name.toLowerCase() === owner.toLowerCase())
        : undefined;
    const pick = userProfileRepo ?? projectRepos[0];
    if (pick) setSelected(pick);
  }, [projectRepos, selected, orgProbeDone, orgProfileRepo, profile?.type, owner]);

  const aboutInfo: UserAboutInfo | null = profile
    ? {
        login: profile.login,
        name: profile.name,
        avatar_url: profile.avatar_url,
        html_url: profile.html_url,
        bio: profile.bio,
        location: profile.location,
        followers: profile.followers,
        following: profile.following,
        public_repos: profile.public_repos,
        created_at: profile.created_at ?? null,
      }
    : null;

  return (
    <div
      className="h-viewport-fixed flex flex-col overflow-hidden"
      style={{ background: theme.colors.background, color: theme.colors.text }}
    >
      {/* Header — the owner/repo explorer's breadcrumb header, minus the repo crumb. */}
      <header
        className="border-b px-5 flex items-center gap-2 shrink-0 relative"
        style={{
          background: theme.colors.surface,
          borderColor: theme.colors.border,
          paddingTop: 'calc(var(--safe-top) + 0.875rem)',
          paddingBottom: '0.875rem',
          zIndex: 10,
        }}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Link
            href="/"
            className="transition-opacity hover:opacity-80"
            style={{
              fontFamily: theme.fonts.body,
              fontSize: theme.fontSizes[4],
              fontWeight: theme.fontWeights.bold,
              textDecoration: 'none',
            }}
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
            className="shrink-0 transition-opacity hover:opacity-80"
            title={owner}
            aria-label={owner}
            style={{ textDecoration: 'none' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://github.com/${owner}.png?size=64`}
              alt=""
              width={28}
              height={28}
              className="rounded-full"
              style={{ border: `1px solid ${theme.colors.border}` }}
            />
          </Link>
          <Link
            href={`/${owner}`}
            className="transition-opacity hover:opacity-80 truncate"
            style={{
              fontFamily: theme.fonts.body,
              fontSize: theme.fontSizes[2],
              fontWeight: theme.fontWeights.semibold,
              color: theme.colors.text,
              textDecoration: 'none',
            }}
          >
            {owner}
          </Link>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden md:block">
            <RepoSearchBar />
          </div>
          <div className="hidden md:flex">
            <AgentViewButton path={`/${owner}`} iconOnly />
          </div>
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

      {/* Body — the two-pane rail + File City, mirroring /home and /owner/repo. */}
      <div className="flex-1 min-h-0 flex flex-col-reverse md:flex-row">
        <OwnerLeftPanel
          owner={owner}
          profile={aboutInfo}
          profileLoading={profileLoading}
          repos={projectRepos}
          reposError={reposError}
          pinnedRepos={pinnedRepos}
          trails={trails}
          topics={topics}
          contributions={contributions}
          totalCommits={totalCommits}
          commitGroups={commitGroups}
          contributedRepos={contributedRepos}
          activityLoading={activityLoading}
          selectedRepoFullName={selected?.full_name ?? null}
          onSelectRepo={setSelected}
        />
        <main className="flex-1 min-h-0 flex flex-col">
          {selected ? (
            <RepoFileCityPane
              owner={selected.owner.login}
              repo={selected.name}
              readmePath={
                orgProfileRepo && selected.full_name === orgProfileRepo.full_name
                  ? ORG_PROFILE_README
                  : undefined
              }
            />
          ) : (
            <IdleRightPane />
          )}
        </main>
      </div>
    </div>
  );
}

function IdleRightPane() {
  const { theme } = useTheme();
  return (
    <div
      className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 px-8 text-center"
      style={{ background: theme.colors.backgroundSecondary }}
    >
      <Boxes size={40} style={{ color: theme.colors.textMuted, opacity: 0.7 }} />
      <div
        style={{
          color: theme.colors.textMuted,
          fontSize: theme.fontSizes[2],
          maxWidth: 360,
          lineHeight: 1.5,
        }}
      >
        Pick a repository from the rail to explore its File City.
      </div>
    </div>
  );
}
