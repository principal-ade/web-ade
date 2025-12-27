'use client';

import { useTheme } from '@principal-ade/industry-theme';
import { useAuth } from '@/contexts/AuthContext';
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Plus, Edit2, Palette, GitCommit, ArrowLeftRight, Building2, FolderOpen } from 'lucide-react';
import { UserAvatarMenu } from './UserAvatarMenu';
import { useGlobalTheme } from '@/contexts/ThemeContext';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePresenceData } from '@/hooks/usePresenceData';
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
  // Gallery toggle
  showGallery?: boolean;
  onToggleGallery?: () => void;
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
  showGallery = false,
  onToggleGallery,
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
  // Keep connection active even though UI is hidden
  usePresenceData();

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
        {/* Gallery button - only show on home page */}
        {!repositoryName && !ownerOnly && !collectionId && onToggleGallery && (
          <button
            onClick={onToggleGallery}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-all hover:opacity-80"
            style={{
              background: showGallery ? theme.colors.primary : theme.colors.surface,
              color: showGallery ? '#fff' : theme.colors.text,
              border: `1px solid ${showGallery ? theme.colors.primary : theme.colors.border}`,
            }}
          >
            <FolderOpen className="w-4 h-4" />
            <span>Gallery</span>
          </button>
        )}
      </div>

      {/* Center section: Selected repository on collection page */}
      {collectionId && selectedRepository ? (
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

        {/* Discord Link - only on home page */}
        {!repositoryName && !ownerOnly && !collectionId && (
          <a
            href="https://discord.gg/G3qdcC2DXq"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80"
            style={{
              background: '#5865F2',
              color: '#fff',
            }}
            title="Join our Discord"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
          </a>
        )}

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
