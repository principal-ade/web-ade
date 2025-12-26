'use client';

import { useTheme } from '@principal-ade/industry-theme';
import { useAuth } from '@/contexts/AuthContext';
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Monitor, Download, Plus, Edit2, Palette, GitCommit, ArrowLeftRight, Building2 } from 'lucide-react';
import { UserAvatarMenu } from './UserAvatarMenu';
import { useGlobalTheme } from '@/contexts/ThemeContext';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePresenceData, RepositorySession } from '@/hooks/usePresenceData';
import { useEffect, useState, useRef } from 'react';
import { Logo } from '@principal-ai/logo-component';
import { LayoutConfigDropdown, LayoutConfig } from './LayoutConfigDropdown';

interface EditorHeaderProps {
  currentLayoutConfigId?: string;
  onLayoutConfigChange?: (config: LayoutConfig) => void;
  leftCollapsed?: boolean;
  rightCollapsed?: boolean;
  onToggleLeft?: () => void;
  onToggleRight?: () => void;
  onSwapRightPanels?: () => void;
  selectedRepository?: string | null; // Format: "owner/repo"
  // User collection actions
  isUserCollection?: boolean;
  collectionName?: string;
  onAddRepository?: () => void;
  onEditCollection?: () => void;
  // Commit actions
  pendingChangesCount?: number;
  onCommitClick?: () => void;
  // Panel visibility
  hideLeftToggle?: boolean;
}

export function EditorHeader({
  currentLayoutConfigId = 'default',
  onLayoutConfigChange,
  leftCollapsed = false,
  rightCollapsed = false,
  onToggleLeft,
  onToggleRight,
  onSwapRightPanels,
  selectedRepository,
  isUserCollection = false,
  collectionName,
  onAddRepository,
  onEditCollection,
  pendingChangesCount = 0,
  onCommitClick,
  hideLeftToggle = false,
}: EditorHeaderProps = {}) {
  const { theme } = useTheme();
  const { cycleTheme, currentThemeName } = useGlobalTheme();
  const { user, isAuthenticated } = useAuth();
  const pathname = usePathname();
  const [repositoryName, setRepositoryName] = useState<{ owner: string; repo: string } | null>(null);
  const [ownerOnly, setOwnerOnly] = useState<string | null>(null);
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [orgSwitcherOpen, setOrgSwitcherOpen] = useState(false);
  const orgSwitcherRef = useRef<HTMLDivElement>(null);
  const [organizations, setOrganizations] = useState<Array<{ id: number; login: string; avatar_url: string; description: string | null }>>([]);

  // Extract repository name, owner, or collection from URL
  useEffect(() => {
    if (pathname) {
      const pathParts = pathname.split('/').filter(Boolean);

      // Check for collection path: /collections/[id]
      if (pathParts[0] === 'collections' && pathParts[1]) {
        setRepositoryName(null);
        setOwnerOnly(null);
        setCollectionId(pathParts[1]);
      }
      // Path format: /owner/repo
      else if (pathParts.length >= 2 && pathParts[0] && pathParts[1]) {
        const owner = pathParts[0];
        const repo = pathParts[1];
        setRepositoryName({ owner, repo });
        setOwnerOnly(null);
        setCollectionId(null);
      } else if (pathParts.length === 1 && pathParts[0]) {
        // Path format: /owner (owner page only)
        setRepositoryName(null);
        setOwnerOnly(pathParts[0]);
        setCollectionId(null);
      } else {
        setRepositoryName(null);
        setOwnerOnly(null);
        setCollectionId(null);
      }
    }
  }, [pathname]);

  // Close org switcher when clicking outside
  useEffect(() => {
    if (!orgSwitcherOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (orgSwitcherRef.current && !orgSwitcherRef.current.contains(event.target as Node)) {
        setOrgSwitcherOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [orgSwitcherOpen]);

  // Fetch user's organizations when authenticated
  useEffect(() => {
    if (!isAuthenticated || !user) {
      setOrganizations([]);
      return;
    }

    fetch('/api/github/user/orgs')
      .then((res) => res.json())
      .then((data) => {
        if (data.organizations) {
          setOrganizations(data.organizations);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch organizations:', err);
      });
  }, [isAuthenticated, user]);

  // Global presence connection status (connects to __global_presence__ room)
  const { connected, sessions } = usePresenceData();

  // Check if user has a desktop app connected
  const hasDesktopApp = sessions.some((s: RepositorySession) => s.clientType === 'desktop');

  return (
    <header
      className="h-14 flex items-center justify-between px-4 border-b relative z-50"
      style={{
        background: theme.colors.surface,
        borderColor: theme.colors.border,
      }}
    >
      {/* Left section: Logo/Avatar and Repository info */}
      <div className="flex items-center gap-3 flex-shrink-0 flex-1">
        {/* Show repo avatar + owner/repo on repo pages */}
        {repositoryName && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Org switcher dropdown */}
            <div className="relative" ref={orgSwitcherRef}>
              <button
                onClick={() => setOrgSwitcherOpen(!orgSwitcherOpen)}
                className="flex items-center transition-all hover:opacity-80"
                title="Switch organization"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://github.com/${repositoryName.owner}.png?size=64`}
                  alt={repositoryName.owner}
                  className="w-8 h-8 flex-shrink-0"
                  style={{
                    borderRadius: '6px',
                  }}
                />
              </button>

              {/* Dropdown Menu */}
              {orgSwitcherOpen && isAuthenticated && user && (
                <div
                  className="absolute left-0 top-full mt-1 py-1 rounded-md shadow-lg border min-w-[180px] z-50"
                  style={{
                    background: theme.colors.background,
                    borderColor: theme.colors.border,
                  }}
                >
                  {/* Current user */}
                  <Link
                    href={`/${user.login}`}
                    className="flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:opacity-80"
                    style={{
                      color: theme.colors.text,
                      background: repositoryName.owner === user.login ? theme.colors.surface : 'transparent',
                    }}
                    onClick={() => setOrgSwitcherOpen(false)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={user.avatar_url}
                      alt={user.login}
                      className="w-5 h-5 rounded"
                    />
                    {user.login}
                  </Link>

                  {/* Organizations */}
                  {organizations.length > 0 && (
                    <>
                      <div
                        className="my-1 h-px"
                        style={{ background: theme.colors.border }}
                      />
                      <div
                        className="px-3 py-1.5 text-xs font-medium"
                        style={{ color: theme.colors.textMuted }}
                      >
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3 h-3" />
                          Organizations
                        </div>
                      </div>
                      {organizations.map((org) => (
                        <Link
                          key={org.id}
                          href={`/${org.login}`}
                          className="flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:opacity-80"
                          style={{
                            color: theme.colors.text,
                            background: repositoryName.owner === org.login ? theme.colors.surface : 'transparent',
                          }}
                          onClick={() => setOrgSwitcherOpen(false)}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={org.avatar_url}
                            alt={org.login}
                            className="w-5 h-5 rounded"
                          />
                          {org.login}
                        </Link>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
            <div
              className="flex items-center gap-1.5 text-base font-semibold hidden sm:flex"
              style={{ fontFamily: theme.fonts.body }}
            >
              <Link
                href={`/${repositoryName.owner}`}
                className="transition-opacity hover:opacity-80"
                style={{ color: theme.colors.textMuted, textDecoration: 'none' }}
              >
                {repositoryName.owner}
              </Link>
              <span style={{ color: theme.colors.textMuted }}>/</span>
              <a
                href={`https://github.com/${repositoryName.owner}/${repositoryName.repo}`}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-opacity hover:opacity-80"
                style={{ color: theme.colors.text, textDecoration: 'none' }}
              >
                {repositoryName.repo}
              </a>
              {onLayoutConfigChange && (
                <>
                  <span style={{ color: theme.colors.textMuted }}>:</span>
                  <LayoutConfigDropdown
                    currentConfigId={currentLayoutConfigId}
                    onConfigChange={onLayoutConfigChange}
                    theme={theme}
                    inline
                  />
                </>
              )}
            </div>
          </div>
        )}
        {/* Show owner avatar + name on owner pages with org switcher dropdown */}
        {ownerOnly && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Org switcher dropdown */}
            <div className="relative" ref={orgSwitcherRef}>
              <button
                onClick={() => setOrgSwitcherOpen(!orgSwitcherOpen)}
                className="flex items-center transition-all hover:opacity-80"
                title="Switch organization"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://github.com/${ownerOnly}.png?size=64`}
                  alt={ownerOnly}
                  className="w-8 h-8 flex-shrink-0"
                  style={{
                    borderRadius: '6px',
                  }}
                />
              </button>

              {/* Dropdown Menu */}
              {orgSwitcherOpen && isAuthenticated && user && (
                <div
                  className="absolute left-0 top-full mt-1 py-1 rounded-md shadow-lg border min-w-[180px] z-50"
                  style={{
                    background: theme.colors.background,
                    borderColor: theme.colors.border,
                  }}
                >
                  {/* Current user */}
                  <Link
                    href={`/${user.login}`}
                    className="flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:opacity-80"
                    style={{
                      color: theme.colors.text,
                      background: ownerOnly === user.login ? theme.colors.surface : 'transparent',
                    }}
                    onClick={() => setOrgSwitcherOpen(false)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={user.avatar_url}
                      alt={user.login}
                      className="w-5 h-5 rounded"
                    />
                    {user.login}
                  </Link>

                  {/* Organizations */}
                  {organizations.length > 0 && (
                    <>
                      <div
                        className="my-1 h-px"
                        style={{ background: theme.colors.border }}
                      />
                      <div
                        className="px-3 py-1.5 text-xs font-medium"
                        style={{ color: theme.colors.textMuted }}
                      >
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3 h-3" />
                          Organizations
                        </div>
                      </div>
                      {organizations.map((org) => (
                        <Link
                          key={org.id}
                          href={`/${org.login}`}
                          className="flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:opacity-80"
                          style={{
                            color: theme.colors.text,
                            background: ownerOnly === org.login ? theme.colors.surface : 'transparent',
                          }}
                          onClick={() => setOrgSwitcherOpen(false)}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={org.avatar_url}
                            alt={org.login}
                            className="w-5 h-5 rounded"
                          />
                          {org.login}
                        </Link>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>

            <div
              className="flex items-center gap-1.5 text-base font-semibold hidden sm:flex"
              style={{ fontFamily: theme.fonts.body }}
            >
              <Link
                href={`/${ownerOnly}`}
                className="transition-opacity hover:opacity-80"
                style={{ color: theme.colors.textMuted, textDecoration: 'none' }}
              >
                {ownerOnly}
              </Link>
              {selectedRepository && (
                <>
                  <span style={{ color: theme.colors.textMuted }}>/</span>
                  <span style={{ color: theme.colors.text }}>
                    {selectedRepository.split('/')[1]}
                  </span>
                  <Link
                    href={`/${selectedRepository}`}
                    className="ml-2 px-2 py-0.5 rounded text-xs transition-all hover:opacity-80"
                    style={{
                      background: theme.colors.primary,
                      color: '#fff',
                      textDecoration: 'none',
                    }}
                  >
                    Open
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
        {/* Collection name on left with logo */}
        {collectionId && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link
              href="/"
              className="flex items-center transition-all hover:opacity-80"
              title="Home"
            >
              <Logo width={32} height={32} color={theme.colors.primary} />
            </Link>
            <div
              className="flex items-center gap-1.5 text-base font-semibold"
              style={{ fontFamily: theme.fonts.body }}
            >
              <Link
                href={`/collections/${collectionId}`}
                className="transition-opacity hover:opacity-80"
                style={{ color: theme.colors.text, textDecoration: 'none' }}
              >
                {collectionName || collectionId.replace('ws-', '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
              </Link>
            </div>
          </div>
        )}
        {/* Download ADE or Open in Desktop - only show on home page (not owner pages) */}
        {!repositoryName && !ownerOnly && !collectionId && (
          hasDesktopApp ? (
            <button
              onClick={() => {
                window.location.href = 'principal-ade://open';
              }}
              className="flex items-center gap-1.5 px-2 py-1 text-sm rounded-md transition-all hover:opacity-80"
              style={{
                color: theme.colors.primary,
              }}
              title="Open Principal ADE desktop app"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Open Desktop</span>
            </button>
          ) : (
            <a
              href="https://principal-ade.com/download"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-2 py-1 text-sm rounded-md transition-all hover:opacity-80"
              style={{
                color: theme.colors.primary,
              }}
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Download ADE</span>
            </a>
          )
        )}
      </div>

      {/* Center section: Principal AI branding on home page */}
      {!repositoryName && !ownerOnly && !collectionId ? (
        /* Home page - show Principal AI Gallery */
        <Link
          href="/"
          className="flex items-center gap-3 absolute left-1/2 transform -translate-x-1/2 transition-opacity hover:opacity-80"
          style={{
            fontFamily: theme.fonts.body,
            textDecoration: 'none',
          }}
        >
          <Logo width={32} height={32} color={theme.colors.primary} />
          <span
            className="text-xl font-bold"
            style={{ fontFamily: theme.fonts.body }}
          >
            <span style={{ color: theme.colors.text }}>Principal</span>
            {' '}
            <span style={{ color: theme.colors.primary }}>AI</span>
            {' '}
            <span style={{ color: theme.colors.text }}>Gallery</span>
          </span>
          <Logo width={32} height={32} color={theme.colors.primary} />
        </Link>
      ) : collectionId && selectedRepository ? (
        /* Collection page with selected repository - show in center */
        <Link
          href={`/${selectedRepository}`}
          className="absolute left-1/2 transform -translate-x-1/2 transition-opacity hover:opacity-80"
          style={{
            fontSize: theme.fontSizes[4],
            fontWeight: theme.fontWeights.semibold,
            fontFamily: theme.fonts.body,
            color: theme.colors.text,
            textDecoration: 'none',
          }}
        >
          {selectedRepository.split('/')[1]}
        </Link>
      ) : null}

      <div className="flex items-center gap-3 flex-shrink-0 flex-1 justify-end">
        {/* User collection action buttons */}
        {isUserCollection && collectionId && (
          <div className="flex items-center gap-2">
            {onAddRepository && (
              <button
                onClick={onAddRepository}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all hover:opacity-80"
                style={{
                  background: theme.colors.primary,
                  color: '#fff',
                }}
                title="Add repository to collection"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Add Repo</span>
              </button>
            )}
            {onEditCollection && (
              <button
                onClick={onEditCollection}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all hover:opacity-80"
                style={{
                  background: theme.colors.secondary,
                  color: theme.colors.text,
                  border: `1px solid ${theme.colors.border}`,
                }}
                title="Edit collection"
              >
                <Edit2 className="w-4 h-4" />
                <span className="hidden sm:inline">Edit</span>
              </button>
            )}
          </div>
        )}

        {/* TODO: Open in Desktop App button - temporarily hidden, will be added back later */}
        {/* {repositoryName && (
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
        )} */}

        {/* Commit changes button - only show when there are pending changes */}
        {repositoryName && onCommitClick && pendingChangesCount > 0 && (
          <button
            onClick={onCommitClick}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all hover:opacity-80"
            style={{
              background: theme.colors.primary,
              color: '#fff',
            }}
            title={`Commit ${pendingChangesCount} pending change${pendingChangesCount !== 1 ? 's' : ''}`}
          >
            <GitCommit className="w-4 h-4" />
            <span className="hidden sm:inline">Commit</span>
            <span
              className="ml-1 px-1.5 py-0.5 text-xs rounded-full"
              style={{
                background: 'rgba(255,255,255,0.2)',
              }}
            >
              {pendingChangesCount}
            </span>
          </button>
        )}

        {/* Panel collapse toggles */}
        <div className="hidden md:flex items-center gap-1">
          {onToggleLeft && !hideLeftToggle && (
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
          {onSwapRightPanels && (
            <button
              onClick={onSwapRightPanels}
              className="flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80"
              style={{
                background: theme.colors.secondary,
                color: theme.colors.text,
              }}
              title="Swap middle and right panels"
            >
              <ArrowLeftRight className="w-4 h-4" />
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

        {/* Theme Switcher - only on home page */}
        {!repositoryName && !ownerOnly && !collectionId && (
          <button
            onClick={cycleTheme}
            className="flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80"
            style={{
              background: theme.colors.secondary,
              color: theme.colors.text,
            }}
            title={`Theme: ${currentThemeName} (click to cycle)`}
          >
            <Palette className="w-4 h-4" />
          </button>
        )}

        {/* TODO: Connection indicator hidden - finding new placement */}

        {/* User Avatar Menu */}
        <UserAvatarMenu />
      </div>
    </header>
  );
}
