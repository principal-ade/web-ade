'use client';

import { useTheme } from '@principal-ade/industry-theme';
import { useAuth } from '@/contexts/AuthContext';
import { LogOut, Wifi, WifiOff, Search, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Monitor, User, Github } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePresenceData } from '@/hooks/usePresenceData';
import { useEffect, useState, useRef } from 'react';
import { Logo } from '@principal-ai/logo-component';
import { LayoutConfigDropdown, LayoutConfig, layoutConfigs } from './LayoutConfigDropdown';

interface EditorHeaderProps {
  currentLayoutConfigId?: string;
  onLayoutConfigChange?: (config: LayoutConfig) => void;
  leftCollapsed?: boolean;
  rightCollapsed?: boolean;
  onToggleLeft?: () => void;
  onToggleRight?: () => void;
}

export function EditorHeader({
  currentLayoutConfigId = 'default',
  onLayoutConfigChange,
  leftCollapsed = false,
  rightCollapsed = false,
  onToggleLeft,
  onToggleRight,
}: EditorHeaderProps = {}) {
  const { theme } = useTheme();
  const { user, isAuthenticated, isLoading, login, logout } = useAuth();
  const pathname = usePathname();
  const [repositoryName, setRepositoryName] = useState<{ owner: string; repo: string } | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Extract repository name from URL
  useEffect(() => {
    if (pathname) {
      const pathParts = pathname.split('/');
      // Path format: /owner/repo
      if (pathParts.length >= 3 && pathParts[1] && pathParts[2]) {
        const owner = pathParts[1];
        const repo = pathParts[2];
        setRepositoryName({ owner, repo });
      } else {
        setRepositoryName(null);
      }
    }
  }, [pathname]);

  // Close user menu when clicking outside
  useEffect(() => {
    if (!userMenuOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [userMenuOpen]);

  // Global presence connection status (connects to __global_presence__ room)
  const { connected } = usePresenceData();

  return (
    <header
      className="h-14 flex items-center justify-between px-4 border-b relative"
      style={{
        background: theme.colors.surface,
        borderColor: theme.colors.border,
      }}
    >
      {/* Left section: Logo and Layout Config Dropdown */}
      <div className="flex items-center gap-3 flex-shrink-0 flex-1">
        <Link
          href="/"
          className="flex items-center justify-center w-8 h-8 transition-all hover:opacity-80 flex-shrink-0"
          title="Home"
        >
          <Logo width={32} height={32} color={theme.colors.primary} />
        </Link>
        {/* Layout Config Dropdown - hidden on mobile */}
        {onLayoutConfigChange && (
          <div className="hidden md:flex">
            <LayoutConfigDropdown
              currentConfigId={currentLayoutConfigId}
              onConfigChange={onLayoutConfigChange}
              theme={theme}
            />
          </div>
        )}
      </div>

      {/* Center section: Repository avatar, name/owner, and switch button */}
      {repositoryName && (
        <div
          className="flex items-center gap-3 absolute left-1/2 transform -translate-x-1/2"
          style={{
            fontFamily: theme.fonts.body,
          }}
        >
          {/* Repo Avatar */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://github.com/${repositoryName.owner}.png?size=64`}
            alt={repositoryName.owner}
            className="w-9 h-9 flex-shrink-0"
            style={{
              borderRadius: '6px',
            }}
          />

          {/* Name/Owner */}
          <div className="flex flex-col items-center gap-px">
            <Link
              href={`/${repositoryName.owner}`}
              className="transition-opacity hover:opacity-80"
              style={{
                fontSize: theme.fontSizes[2],
                fontWeight: theme.fontWeights.body,
                color: theme.colors.textMuted,
                textDecoration: 'none',
              }}
            >
              {repositoryName.owner}
            </Link>
            <a
              href={`https://github.com/${repositoryName.owner}/${repositoryName.repo}`}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-opacity hover:opacity-80"
              style={{
                fontSize: theme.fontSizes[3],
                fontWeight: theme.fontWeights.semibold,
                color: theme.colors.text,
                textDecoration: 'none',
              }}
            >
              {repositoryName.repo}
            </a>
          </div>

          {/* Search GitHub Button */}
          <button
            onClick={() => {
              const githubSearchConfig = layoutConfigs.find(c => c.id === 'github-search');
              if (githubSearchConfig && onLayoutConfigChange) {
                onLayoutConfigChange(githubSearchConfig);
              }
            }}
            className="w-9 h-9 flex items-center justify-center flex-shrink-0 transition-all hover:opacity-80"
            style={{
              borderRadius: '6px',
              background: theme.colors.secondary,
              color: theme.colors.text,
            }}
            title="Search GitHub repositories"
          >
            <Search className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex items-center gap-3 flex-shrink-0 flex-1 justify-end">
        {/* Open in Desktop App button */}
        {repositoryName && (
          <button
            onClick={() => {
              // Construct deep link URL for the desktop app
              const deepLinkUrl = `principal-ade://open-workspace?owner=${encodeURIComponent(repositoryName.owner)}&repo=${encodeURIComponent(repositoryName.repo)}`;
              window.location.href = deepLinkUrl;
            }}
            className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all hover:opacity-80"
            style={{
              background: theme.colors.secondary,
              color: theme.colors.text,
              border: `1px solid ${theme.colors.border}`,
            }}
            title="Open in Principal ADE desktop app"
          >
            <Monitor className="w-4 h-4" />
            <span>Desktop</span>
          </button>
        )}

        {/* Panel collapse toggles */}
        <div className="hidden md:flex items-center gap-1">
          {onToggleLeft && (
            <button
              onClick={onToggleLeft}
              className="flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80"
              style={{
                background: leftCollapsed ? theme.colors.primary : theme.colors.secondary,
                color: leftCollapsed ? theme.colors.background : theme.colors.text,
              }}
              title={leftCollapsed ? 'Expand left panel' : 'Collapse left panel'}
            >
              {leftCollapsed ? (
                <PanelLeftOpen className="w-4 h-4" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </button>
          )}
          {onToggleRight && (
            <button
              onClick={onToggleRight}
              className="flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80"
              style={{
                background: rightCollapsed ? theme.colors.primary : theme.colors.secondary,
                color: rightCollapsed ? theme.colors.background : theme.colors.text,
              }}
              title={rightCollapsed ? 'Expand right panel' : 'Collapse right panel'}
            >
              {rightCollapsed ? (
                <PanelRightOpen className="w-4 h-4" />
              ) : (
                <PanelRightClose className="w-4 h-4" />
              )}
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="text-sm" style={{ color: theme.colors.textMuted }}>
            Loading...
          </div>
        ) : isAuthenticated && user ? (
          <>
            {/* Global Presence Connection Indicator */}
            <div
              className="flex items-center justify-center w-8 h-8 rounded-md"
              style={{
                background: connected ? theme.colors.success + '20' : theme.colors.error + '20',
                color: connected ? theme.colors.success : theme.colors.error,
              }}
              title={connected ? 'Connected to server' : 'Disconnected from server'}
            >
              {connected ? (
                <Wifi className="w-3 h-3" />
              ) : (
                <WifiOff className="w-3 h-3" />
              )}
            </div>

            {/* User Menu Dropdown */}
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center rounded-full transition-all hover:opacity-80"
              >
                {user.avatar_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.avatar_url}
                    alt={user.name || user.login}
                    className="w-8 h-8 rounded-full"
                  />
                )}
              </button>

              {/* Dropdown Menu */}
              {userMenuOpen && (
                <div
                  className="absolute right-0 top-full mt-1 py-1 rounded-md shadow-lg border min-w-[160px] z-50"
                  style={{
                    background: theme.colors.surface,
                    borderColor: theme.colors.border,
                  }}
                >
                  <a
                    href={`https://github.com/${user.login}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:opacity-80"
                    style={{ color: theme.colors.text }}
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <Github className="w-4 h-4" />
                    Open in GitHub
                  </a>
                  <div
                    className="my-1 h-px"
                    style={{ background: theme.colors.border }}
                  />
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      logout();
                    }}
                    className="flex items-center gap-2 px-3 py-2 text-sm w-full transition-colors hover:opacity-80"
                    style={{ color: theme.colors.error }}
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <button
            onClick={() => login()}
            className="flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80"
            style={{
              background: theme.colors.primary,
              color: theme.colors.background,
            }}
            title="Login"
          >
            <User className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
}
