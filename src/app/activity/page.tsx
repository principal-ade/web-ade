'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
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
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Calendar,
  Home,
  ArrowLeft,
  Map,
} from 'lucide-react';

import { UserActivityPanel } from '@/components/UserActivityPanel';
import { FollowingUsersPanel } from '@/components/FollowingUsersPanel';

// Dynamic import for FileCityPanel (SSR disabled)
const FileCityPanelLoader = dynamic(
  () => import('@industry-theme/file-city-panel').then((mod) => {
    const Component = mod.panels[0]!.component;
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
  const [isMobile, setIsMobile] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(true);
  const [viewedUser, setViewedUser] = useState(currentUser);
  const [userInfo, setUserInfo] = useState<{ login: string; name: string | null; avatarUrl: string } | null>(null);

  const isViewingOther = viewedUser !== currentUser;

  const [layout] = useState<PanelLayout>({
    left: 'following-users',
    middle: 'activity-timeline',
    right: 'file-city',
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
        // Clear any previous commit highlighting when switching repos
        if (selectedRepo && selectedRepo !== payload.repository) {
          events.emit({
            type: 'commitFiles:cleared',
            source: 'activity-page',
            timestamp: Date.now(),
            payload: {},
          });
        }

        onRepoSelect(payload.repository);
        setRightCollapsed(false); // Expand right panel to show file-city

        // Emit repository:preview for file-city panel
        events.emit({
          type: 'repository:preview',
          source: 'activity-page',
          timestamp: Date.now(),
          payload: { repository: { full_name: payload.repository } },
        });
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
        setRightCollapsed(false);
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

  // Fetch user info for header when viewed user changes
  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        const response = await fetch(`/api/github/user/${viewedUser}/activity`);
        if (response.ok) {
          const data = await response.json();
          setUserInfo(data.user);
        }
      } catch (err) {
        console.error('Failed to fetch user info:', err);
      }
    };

    fetchUserInfo();
  }, [viewedUser]);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleBackToSelf = useCallback(() => {
    setViewedUser(currentUser);
  }, [currentUser]);

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
            <FileCityPanelLoader
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
      id: 'empty',
      label: '',
      content: <div />,
    },
  ], [context, actions, events, currentUser, viewedUser, selectedRepo, theme]);

  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      {/* Header */}
      <header
        className="h-14 flex items-center justify-between px-4 border-b relative z-50"
        style={{
          background: theme.colors.surface,
          borderColor: theme.colors.border,
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

          {/* Back button when viewing someone else */}
          {isViewingOther && (
            <button
              onClick={handleBackToSelf}
              className="flex items-center gap-1 px-2 py-1 rounded transition-all hover:opacity-80"
              style={{
                background: theme.colors.primary,
                color: theme.colors.textOnPrimary,
                fontSize: `${theme.fontSizes[1]}px`,
                fontFamily: theme.fonts.body,
              }}
              title="Back to your activity"
            >
              <ArrowLeft className="w-3 h-3" />
              Back
            </button>
          )}

          {/* User info */}
          {userInfo && (
            <div className="flex items-center gap-2">
              <a
                href={`https://github.com/${userInfo.login}`}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-opacity hover:opacity-80"
              >
                <img
                  src={userInfo.avatarUrl}
                  alt={userInfo.login}
                  className="w-6 h-6 rounded-full"
                />
              </a>
              <a
                href={`https://github.com/${userInfo.login}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-base font-semibold transition-opacity hover:opacity-80"
                style={{
                  fontFamily: theme.fonts.body,
                  color: theme.colors.text,
                  textDecoration: 'none',
                }}
              >
                {userInfo.name || userInfo.login}
              </a>
              <span
                className="px-2 py-0.5 rounded text-xs"
                style={{
                  background: theme.colors.surface,
                  color: theme.colors.textMuted,
                  border: `1px solid ${theme.colors.border}`,
                }}
              >
                {isViewingOther ? 'Viewing' : 'Activity'}
              </span>
            </div>
          )}

          {!userInfo && (
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5" style={{ color: theme.colors.textMuted }} />
              <span
                className="text-base font-semibold"
                style={{
                  fontFamily: theme.fonts.body,
                  color: theme.colors.text,
                }}
              >
                Activity
              </span>
            </div>
          )}
        </div>

        {/* Right section */}
        <div className="flex items-center gap-3 flex-shrink-0 flex-1 justify-end">
          {/* Panel collapse toggles */}
          <div className="hidden md:flex items-center gap-1">
            <button
              onClick={() => setLeftCollapsed(!leftCollapsed)}
              className="flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80"
              style={{
                background: leftCollapsed ? theme.colors.primary : theme.colors.secondary,
                color: theme.colors.textOnPrimary,
              }}
              title={leftCollapsed ? 'Expand left panel' : 'Collapse left panel'}
            >
              {leftCollapsed ? (
                <PanelLeftOpen className="w-4 h-4" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </button>
            <button
              onClick={() => setRightCollapsed(!rightCollapsed)}
              className="flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80"
              style={{
                background: rightCollapsed ? theme.colors.primary : theme.colors.secondary,
                color: theme.colors.textOnPrimary,
              }}
              title={rightCollapsed ? 'Expand right panel' : 'Collapse right panel'}
            >
              {rightCollapsed ? (
                <PanelRightOpen className="w-4 h-4" />
              ) : (
                <PanelRightClose className="w-4 h-4" />
              )}
            </button>
          </div>

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
              left: 25,
              middle: 50,
              right: 25,
            }}
            minSizes={{
              left: 15,
              middle: 40,
              right: 15,
            }}
            collapsiblePanels={{
              left: true,
              right: true,
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
              left: 20,
              middle: 60,
              right: 20,
            }}
            minSizes={{
              left: 15,
              middle: 40,
              right: 15,
            }}
            collapsiblePanels={{
              left: true,
              right: true,
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
      style={{ background: theme.colors.background }}
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
            href="/api/auth/github"
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
