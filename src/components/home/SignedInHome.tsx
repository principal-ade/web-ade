'use client';

import { useEffect, useState } from 'react';
import { Boxes } from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';
import type { User } from '@/contexts/AuthContext';
import { HomeTwoPane } from './HomeTwoPane';
import { RepoFileCityPane } from './RepoFileCityPane';
import type { UserAboutInfo } from './UserAboutCard';
import type { HomeNavCardCounts } from './HomeNavCards';
import type { ProjectRepo, ProjectSection } from './HomeProjectsView';
import type { RecentTrailItem } from './HomeRecentlyVisitedView';

// localStorage key shared with the header opener / recent-repos panels.
const RECENT_REPOS_KEY = 'recent-repositories';

// ---------------------------------------------------------------------------
// SignedInHome — the connected signed-in home surface. Fetches the viewer's
// GitHub profile (for the About card) and their repos + org repos (for the
// Projects view), then renders HomeTwoPane with a live File City in the right
// pane for whatever project the user picks.
// ---------------------------------------------------------------------------

// Minimal shape of a repo row from /api/github/user/repos (a GitHubRepo subset).
interface ApiRepo {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string; avatar_url: string };
  description: string | null;
  language: string | null;
  stargazers_count: number;
  private: boolean;
}

function toProjectRepo(r: ApiRepo): ProjectRepo {
  return {
    id: r.id,
    full_name: r.full_name,
    name: r.name,
    owner: { login: r.owner.login, avatar_url: r.owner.avatar_url },
    description: r.description,
    language: r.language,
    stargazers_count: r.stargazers_count,
    private: r.private,
  };
}

// Read the shared `recent-repositories` localStorage into ProjectRepos, tolerant
// of older/partial entries. Synthesizes a numeric id (list index) for the row key.
function readRecentProjects(): ProjectRepo[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(RECENT_REPOS_KEY) ?? '[]',
    );
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((it, i): ProjectRepo[] => {
      if (it == null || typeof it !== 'object') return [];
      const o = it as Record<string, unknown>;
      const owner = o.owner as Record<string, unknown> | undefined;
      if (typeof o.full_name !== 'string' || !owner) return [];
      const login = typeof owner.login === 'string' ? owner.login : '';
      return [
        {
          id: i,
          full_name: o.full_name,
          name:
            typeof o.name === 'string'
              ? o.name
              : o.full_name.split('/')[1] ?? o.full_name,
          owner: {
            login,
            avatar_url:
              typeof owner.avatar_url === 'string' ? owner.avatar_url : undefined,
          },
          description: typeof o.description === 'string' ? o.description : null,
          stargazers_count:
            typeof o.stargazers_count === 'number'
              ? o.stargazers_count
              : undefined,
        },
      ];
    });
  } catch {
    return [];
  }
}

export function SignedInHome({ user }: { user: User }) {
  // About card: seed with the identity we already have, enrich with GitHub bio/
  // stats once the profile lands.
  const [about, setAbout] = useState<UserAboutInfo | null>({
    login: user.login,
    name: user.name,
    avatar_url: user.avatar_url,
    html_url: `https://github.com/${user.login}`,
  });
  const [sections, setSections] = useState<ProjectSection[] | null>(null);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [starred, setStarred] = useState<ProjectRepo[] | null>(null);
  const [recentProjects, setRecentProjects] = useState<ProjectRepo[] | null>(null);
  const [recentTrails, setRecentTrails] = useState<RecentTrailItem[] | null>(null);
  const [counts, setCounts] = useState<HomeNavCardCounts>({});

  // Enrich the About card from the viewer's full GitHub profile (bio + stats).
  // The owner/repos endpoint returns the rich `owner` object; we ignore its repo
  // lists here (the org-aware list comes from /user/repos below).
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/github/owner/${user.login}/repos`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.owner) return;
        const o = data.owner;
        setAbout({
          login: o.login,
          name: o.name,
          avatar_url: o.avatar_url,
          html_url: o.html_url,
          bio: o.bio,
          company: o.company,
          location: o.location,
          followers: o.followers,
          following: o.following,
          public_repos: o.public_repos,
          created_at: o.created_at,
        });
      })
      .catch(() => {
        /* keep identity-only About */
      });
    return () => {
      cancelled = true;
    };
  }, [user.login]);

  // Projects: the viewer's own repos + each org's repos, grouped.
  useEffect(() => {
    let cancelled = false;
    setSections(null);
    setProjectsError(null);
    fetch('/api/github/user/repos')
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(
        (data: {
          owned?: ApiRepo[];
          starred?: ApiRepo[];
          organizations?: {
            login: string;
            avatar_url: string;
            repositories: ApiRepo[];
          }[];
        }) => {
          if (cancelled) return;
          const secs: ProjectSection[] = [];
          if (data.owned?.length) {
            secs.push({
              key: 'you',
              label: 'Your repositories',
              repos: data.owned.map(toProjectRepo),
            });
          }
          for (const org of data.organizations ?? []) {
            if (org.repositories?.length) {
              secs.push({
                key: org.login,
                label: org.login,
                avatar_url: org.avatar_url,
                repos: org.repositories.map(toProjectRepo),
              });
            }
          }
          setSections(secs);
          setStarred((data.starred ?? []).map(toProjectRepo));
          setCounts((c) => ({
            ...c,
            projects: secs.reduce((n, s) => n + s.repos.length, 0),
            starred: data.starred?.length ?? 0,
          }));
        },
      )
      .catch((e) => {
        if (!cancelled) {
          setProjectsError(String(e?.message ?? e));
          setStarred([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Recently-visited projects come from the shared `recent-repositories`
  // localStorage (written by the header opener / repo pages). Mapped to
  // ProjectRepos so a click selects into the right-pane File City.
  useEffect(() => {
    const load = () => setRecentProjects(readRecentProjects());
    load();
    window.addEventListener('recent-items-updated', load);
    return () => window.removeEventListener('recent-items-updated', load);
  }, []);

  // Recently-visited trails from the by-user API (navigate to the trail page).
  useEffect(() => {
    let cancelled = false;
    setRecentTrails(null);
    fetch(`/api/trails/recently-visited/by-user/${user.id}`)
      .then((r) => (r.ok ? r.json() : { entries: [] }))
      .then((data: { entries?: RecentTrailItem[] }) => {
        if (cancelled) return;
        setRecentTrails(data.entries ?? []);
      })
      .catch(() => {
        if (!cancelled) setRecentTrails([]);
      });
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  const navCounts: HomeNavCardCounts = {
    ...counts,
    recent:
      (recentProjects?.length ?? 0) + (recentTrails?.length ?? 0) || undefined,
  };

  return (
    <HomeTwoPane
      user={about}
      counts={navCounts}
      projects={sections}
      projectsError={projectsError}
      starred={starred}
      recentProjects={recentProjects}
      recentTrails={recentTrails}
      renderRightPane={(repo) =>
        repo ? (
          <RepoFileCityPane
            key={repo.full_name}
            owner={repo.owner}
            repo={repo.repo}
          />
        ) : (
          <IdleRightPane />
        )
      }
    />
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
        Pick a project from the rail to explore its File City.
      </div>
    </div>
  );
}
