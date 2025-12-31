'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useTheme } from '@principal-ade/industry-theme';
import { useState, useEffect, useMemo } from 'react';
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
} from 'lucide-react';

import { UserActivityPanel } from '@/components/UserActivityPanel';
import { ActivityFilterPanel } from '@/components/ActivityFilterPanel';
import { FollowingUsersPanel } from '@/components/FollowingUsersPanel';

interface ActivityPageContentProps {
  username: string;
}

function ActivityPageContent({ username }: ActivityPageContentProps) {
  const { theme } = useTheme();
  const { context, actions, events } = usePanelProvider();
  const [isMobile, setIsMobile] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(true); // Start collapsed since right panel is empty
  const [userInfo, setUserInfo] = useState<{ login: string; name: string | null; avatarUrl: string } | null>(null);

  const [layout] = useState<PanelLayout>({
    left: 'following-users',
    middle: 'activity-timeline',
    right: 'activity-filters',
  });

  // Fetch user info for header
  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        const response = await fetch(`/api/github/user/${username}/activity`);
        if (response.ok) {
          const data = await response.json();
          setUserInfo(data.user);
        }
      } catch (err) {
        console.error('Failed to fetch user info:', err);
      }
    };

    fetchUserInfo();
  }, [username]);

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
            username={username}
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
            username={username}
          />
        </div>
      ),
    },
    {
      id: 'activity-filters',
      label: 'Filters',
      content: (
        <div className="h-full w-full overflow-hidden">
          <ActivityFilterPanel
            context={context}
            actions={actions}
            events={events}
            username={username}
          />
        </div>
      ),
    },
    {
      id: 'empty',
      label: '',
      content: <div />,
    },
  ], [context, actions, events, username]);

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
                Activity
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
            href={`/${username}`}
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
          name: 'activity',
          path: `/activity/${username}`,
        }}
      >
        <ActivityPageContent username={username} />
      </PanelProvider>
    </div>
  );
}

function ActivityPageNoUser() {
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

  // If authenticated, redirect to their activity
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
          Sign in to view your GitHub activity, or visit a specific user&apos;s activity page.
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

export default function ActivityPage() {
  const params = useParams();

  // Optional catch-all: params.username is an array or undefined
  const usernameArray = params.username as string[] | undefined;
  const username = usernameArray?.[0];

  // If no username provided, show auth-aware page
  if (!username) {
    return <ActivityPageNoUser />;
  }

  return <ActivityPageWrapper username={username} />;
}
