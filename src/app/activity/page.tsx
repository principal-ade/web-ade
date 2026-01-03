'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTheme } from '@principal-ade/industry-theme';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { PanelProvider, usePanelProvider } from '@/contexts/PanelContext';
import { useAuth } from '@/contexts/AuthContext';
import { UserAvatarMenu } from '@/components/UserAvatarMenu';
import { Logo } from '@principal-ai/logo-component';
import {
  EditableConfigurablePanelLayout,
  ResponsiveConfigurablePanelLayout,
  PanelLayout,
} from '@principal-ade/panel-layouts';
import '@principal-ade/panel-layouts/styles.css';
import {
  Calendar,
  Home,
  Map,
} from 'lucide-react';

import { UserActivityPanel } from '@/components/UserActivityPanel';
import { FollowingUsersPanel } from '@/components/FollowingUsersPanel';

// Dynamic import for FeedCodeCityPanel (SSR disabled)
const FeedCodeCityPanelLoader = dynamic(
  () => import('@industry-theme/file-city-panel').then((mod) => {
    // Use FeedCodeCityPanel (index 1) which includes project header
    const Component = mod.panels[1]!.component;
    return { default: Component };
  }),
  { ssr: false }
);

// Dynamic import for GitHubMessagesPanel (SSR disabled)
const GitHubMessagesPanelLoader = dynamic(
  () => import('@industry-theme/github-panels').then((mod) => {
    const Component = mod.panels[6]!.component;
    return { default: Component };
  }),
  { ssr: false }
);

interface ActivityPageContentProps {
  currentUser: string;
  selectedRepo: string | null;
  onRepoSelect: (repo: string | null) => void;
}

function ActivityPageContent({ currentUser, selectedRepo, onRepoSelect }: ActivityPageContentProps) {
  const { theme } = useTheme();
  const { context, actions, events } = usePanelProvider();
  const router = useRouter();
  const [isMobile, setIsMobile] = useState(false);
  const [leftCollapsed] = useState(false);
  const [rightCollapsed] = useState(false);
  const [viewedUser, setViewedUser] = useState(currentUser);

  const [layout] = useState<PanelLayout>({
    left: 'following-users',
    middle: 'activity-timeline',
    right: {
      type: 'tabs',
      panels: ['file-city', 'github-messages'],
    },
  });

  // Listen for user selection events from FollowingUsersPanel
  useEffect(() => {
    const unsubscribe = events.on('activity:view:user', (event) => {
      const payload = event.payload as { username: string };
      if (payload?.username) {
        setViewedUser(payload.username);
      }
    });

    return () => unsubscribe();
  }, [events]);

  // Listen for activity item selection to show in file-city
  useEffect(() => {
    const unsubscribe = events.on('activity:item:selected', (event) => {
      const payload = event.payload as { repository: string };
      if (payload?.repository) {
        // Only trigger repo change if actually different
        if (selectedRepo !== payload.repository) {
          // Clear any previous commit highlighting when switching repos
          if (selectedRepo) {
            events.emit({
              type: 'commitFiles:cleared',
              source: 'activity-page',
              timestamp: Date.now(),
              payload: {},
            });
          }

          onRepoSelect(payload.repository);

          // Emit repository:preview for file-city panel
          events.emit({
            type: 'repository:preview',
            source: 'activity-page',
            timestamp: Date.now(),
            payload: { repository: { full_name: payload.repository } },
          });
        }
      }
    });

    return () => unsubscribe();
  }, [events, onRepoSelect, selectedRepo]);

  // Listen for commit selection to fetch details and show in file-city
  useEffect(() => {
    const unsubscribe = events.on('git-panels.commit-detail:selected', async (event) => {
      const payload = event.payload as { hash: string; repository: string };
      if (!payload?.hash || !payload?.repository) return;

      const [owner, repo] = payload.repository.split('/');
      if (!owner || !repo) return;

      // Ensure the repo is selected first
      if (selectedRepo !== payload.repository) {
        onRepoSelect(payload.repository);
      }

      try {
        const response = await fetch(
          `/api/github/repo/${owner}/${repo}/commits/${payload.hash}`,
          { credentials: 'include' }
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch commit: ${response.statusText}`);
        }

        const data = await response.json();

        // Transform GitHub API response to GitCommitDetail format
        const commitDetail = {
          hash: data.sha,
          message: data.commit.message,
          author: data.commit.author.name,
          authorEmail: data.commit.author.email,
          date: data.commit.author.date,
          htmlUrl: data.html_url,
          stats: data.stats ? {
            total: data.stats.total,
            additions: data.stats.additions,
            deletions: data.stats.deletions,
          } : undefined,
          files: data.files?.map((f: { filename: string; status: string; additions: number; deletions: number; changes: number; previous_filename?: string }) => ({
            filename: f.filename,
            status: f.status,
            additions: f.additions,
            deletions: f.deletions,
            changes: f.changes,
            previous_filename: f.previous_filename,
          })),
          parents: data.parents?.map((p: { sha: string }) => p.sha),
        };

        // Send commit detail to trigger file-city visualization
        events.emit({
          type: 'git-panels.commit-detail:loaded',
          source: 'activity-page',
          timestamp: Date.now(),
          payload: { commit: commitDetail },
        });
      } catch (err) {
        console.error('[activity] Failed to fetch commit details:', err);
      }
    });

    return () => unsubscribe();
  }, [events, selectedRepo, onRepoSelect]);

  // Listen for project:open event from FeedCodeCityPanel
  useEffect(() => {
    const unsubscribe = events.on('project:open', (event) => {
      const payload = event.payload as { repo?: { fullName?: string } };
      if (payload?.repo?.fullName) {
        // Navigate to the repository page
        router.push(`/${payload.repo.fullName}`);
      }
    });

    return () => unsubscribe();
  }, [events, router]);

  // Fetch messages for an issue or PR
  const fetchMessages = useCallback(async (
    owner: string,
    repo: string,
    number: number,
    target: {
      type: 'issue' | 'pull_request';
      number: number;
      title: string;
      state: 'open' | 'closed';
      merged?: boolean;
    }
  ) => {
    try {
      const response = await fetch(
        `/api/github/repo/${owner}/${repo}/issues/${number}/timeline?per_page=100`,
        { credentials: 'include' }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch messages: ${response.statusText}`);
      }

      const data = await response.json();

      events.emit({
        type: 'github-messages:data',
        source: 'activity-page',
        timestamp: Date.now(),
        payload: {
          target: {
            type: target.type,
            number: target.number,
            title: target.title,
            state: target.state,
            merged: target.merged,
          },
          timeline: data.timeline || [],
          reviewComments: data.reviewComments || [],
          owner,
          repo,
          loading: false,
          isAuthenticated: true,
        },
      });
    } catch (err) {
      console.error('[activity] Failed to fetch messages:', err);
    }
  }, [events]);

  // Listen for issue selection to fetch messages
  useEffect(() => {
    const unsubscribe = events.on('issue:selected', (event) => {
      const payload = event.payload as {
        issue?: { number: number; title: string; state: string };
        owner?: string;
        repo?: string;
      };
      if (payload?.issue && payload.owner && payload.repo) {
        fetchMessages(payload.owner, payload.repo, payload.issue.number, {
          type: 'issue',
          number: payload.issue.number,
          title: payload.issue.title,
          state: payload.issue.state === 'closed' ? 'closed' : 'open',
        });
      }
    });

    return () => unsubscribe();
  }, [events, fetchMessages]);

  // Listen for PR selection to fetch messages
  useEffect(() => {
    const unsubscribe = events.on('pr:selected', (event) => {
      const payload = event.payload as {
        pr?: { number: number; title: string; state: string; merged?: boolean };
        owner?: string;
        repo?: string;
      };
      if (payload?.pr && payload.owner && payload.repo) {
        fetchMessages(payload.owner, payload.repo, payload.pr.number, {
          type: 'pull_request',
          number: payload.pr.number,
          title: payload.pr.title,
          state: payload.pr.state === 'closed' ? 'closed' : 'open',
          merged: payload.pr.merged,
        });
      }
    });

    return () => unsubscribe();
  }, [events, fetchMessages]);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const panels = useMemo(() => [
    {
      id: 'following-users',
      label: 'Following',
      content: (
        <div className="h-full w-full overflow-hidden">
          <FollowingUsersPanel
            context={context}
            actions={actions}
            events={events}
            username={currentUser}
            viewedUser={viewedUser}
          />
        </div>
      ),
    },
    {
      id: 'activity-timeline',
      label: 'Timeline',
      content: (
        <div className="h-full w-full overflow-hidden">
          <UserActivityPanel
            context={context}
            actions={actions}
            events={events}
            username={viewedUser}
          />
        </div>
      ),
    },
    {
      id: 'file-city',
      label: 'Map',
      content: (
        <div className="h-full w-full overflow-hidden">
          {selectedRepo ? (
            <FeedCodeCityPanelLoader
              context={context}
              actions={actions}
              events={events}
            />
          ) : (
            <div
              className="h-full w-full flex items-center justify-center"
              style={{ color: theme.colors.textMuted }}
            >
              <div className="text-center p-4">
                <Map className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p style={{ fontSize: `${theme.fontSizes[2]}px`, fontFamily: theme.fonts.body }}>
                  Click an activity item to view the repository
                </p>
              </div>
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'github-messages',
      label: 'Conversation',
      content: (
        <div className="h-full w-full overflow-hidden">
          <GitHubMessagesPanelLoader
            context={context}
            actions={actions}
            events={events}
          />
        </div>
      ),
    },
    {
      id: 'empty',
      label: '',
      content: <div />,
    },
  ], [context, actions, events, currentUser, viewedUser, selectedRepo, theme]);

  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      {/* Header */}
      <header
        className="flex items-center justify-between px-4 border-b relative z-50"
        style={{
          background: theme.colors.surface,
          borderColor: theme.colors.border,
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
          paddingBottom: '0.75rem',
        }}
      >
        {/* Left section */}
        <div className="flex items-center gap-3 flex-shrink-0 flex-1">
          <Link
            href="/"
            className="flex items-center transition-all hover:opacity-80"
            title="Home"
          >
            <Logo width={32} height={32} color={theme.colors.primary} />
          </Link>

          <span
            className="text-base font-semibold"
            style={{
              fontFamily: theme.fonts.body,
              color: theme.colors.text,
            }}
          >
            Feed
          </span>
        </div>

        {/* Right section */}
        <div className="flex items-center gap-3 flex-shrink-0 flex-1 justify-end">
          {/* Navigation links */}
          <Link
            href={`/${viewedUser}`}
            className="px-3 py-1.5 text-xs rounded transition-all hover:opacity-80"
            style={{
              background: theme.colors.surface,
              color: theme.colors.text,
              border: `1px solid ${theme.colors.border}`,
            }}
          >
            View Repos
          </Link>

          {/* User Avatar Menu */}
          <UserAvatarMenu />
        </div>
      </header>

      {/* Panel Layout */}
      <div className="flex-1 overflow-hidden">
        {isMobile ? (
          <ResponsiveConfigurablePanelLayout
            theme={theme}
            panels={panels}
            layout={layout}
            defaultSizes={{
              left: 30,
              middle: 40,
              right: 30,
            }}
            minSizes={{
              left: 20,
              middle: 20,
              right: 20,
            }}
            collapsiblePanels={{
              left: false,
              right: false,
            }}
            collapsed={{
              left: leftCollapsed,
              right: rightCollapsed,
            }}
            showCollapseButtons={false}
            mobileBreakpoint="(max-width: 768px)"
          />
        ) : (
          <EditableConfigurablePanelLayout
            theme={theme}
            panels={panels}
            layout={layout}
            isEditMode={false}
            defaultSizes={{
              left: 30,
              middle: 40,
              right: 30,
            }}
            minSizes={{
              left: 20,
              middle: 20,
              right: 20,
            }}
            collapsiblePanels={{
              left: false,
              right: false,
            }}
            collapsed={{
              left: leftCollapsed,
              right: rightCollapsed,
            }}
            showCollapseButtons={false}
          />
        )}
      </div>
    </div>
  );
}

function ActivityPageWrapper({ username }: { username: string }) {
  const { theme } = useTheme();
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);

  const handleRepoSelect = useCallback((repo: string | null) => {
    setSelectedRepo(repo);
  }, []);

  return (
    <div
      className="h-screen w-screen overflow-hidden"
      style={{ background: theme.colors.background, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <PanelProvider
        workspace={{
          name: 'web-ade',
          path: '/workspace',
        }}
        repository={{
          name: selectedRepo ? selectedRepo.split('/')[1] || 'activity' : 'activity',
          path: selectedRepo ? `/GitHub/${selectedRepo}` : '/activity',
        }}
        githubRepo={selectedRepo || undefined}
      >
        <ActivityPageContent
          currentUser={username}
          selectedRepo={selectedRepo}
          onRepoSelect={handleRepoSelect}
        />
      </PanelProvider>
    </div>
  );
}

export default function ActivityPage() {
  const { theme } = useTheme();
  const { isAuthenticated, user, isLoading } = useAuth();

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div
        className="h-screen w-screen flex items-center justify-center"
        style={{ background: theme.colors.background, color: theme.colors.textMuted }}
      >
        <div className="text-center">
          <Calendar className="h-12 w-12 mx-auto mb-3 animate-pulse" />
          <p className="text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // If authenticated, show activity
  if (isAuthenticated && user?.login) {
    return <ActivityPageWrapper username={user.login} />;
  }

  // Not authenticated, show prompt
  return (
    <div
      className="h-screen w-screen flex items-center justify-center"
      style={{ background: theme.colors.background }}
    >
      <div className="text-center max-w-md px-4">
        <Calendar className="h-16 w-16 mx-auto mb-4" style={{ color: theme.colors.textMuted }} />
        <h1
          className="text-2xl font-bold mb-2"
          style={{ color: theme.colors.text }}
        >
          Activity Timeline
        </h1>
        <p
          className="text-sm mb-6"
          style={{ color: theme.colors.textMuted }}
        >
          Sign in to view your GitHub activity and see what the people you follow are up to.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/"
            className="px-4 py-2 rounded text-sm font-medium transition-all hover:opacity-80"
            style={{
              background: theme.colors.surface,
              color: theme.colors.text,
              border: `1px solid ${theme.colors.border}`,
            }}
          >
            <Home className="w-4 h-4 inline mr-2" />
            Home
          </Link>
          <Link
            href="/api/auth/login"
            className="px-4 py-2 rounded text-sm font-medium transition-all hover:opacity-80"
            style={{
              background: theme.colors.primary,
              color: theme.colors.textOnPrimary,
            }}
          >
            Sign in with GitHub
          </Link>
        </div>
      </div>
    </div>
  );
}
