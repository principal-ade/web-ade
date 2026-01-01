'use client';

import { useTheme } from '@principal-ade/industry-theme';
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Plus, Edit2, Palette, GitCommit, ArrowLeftRight, Sparkles, X, Star, Rss } from 'lucide-react';
import { UserAvatarMenu } from './UserAvatarMenu';
import { useGlobalTheme } from '@/contexts/ThemeContext';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePresenceData } from '@/hooks/usePresenceData';
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Logo } from '@principal-ai/logo-component';
import { LocalFolderButton } from './LocalFolderButton';

interface EditorHeaderProps {
  currentLayoutConfigId?: string;
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
  // Vim mode toggle
  vimMode?: boolean;
  onVimModeToggle?: () => void;
  // Local folder button
  currentRepoId?: string;
  // Color mode selection (for clear button)
  selectedColorMode?: string | null;
  onClearColorMode?: () => void;
}

export function EditorHeader({
  currentLayoutConfigId,
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
  vimMode = false,
  onVimModeToggle,
  currentRepoId,
  selectedColorMode,
  onClearColorMode,
}: EditorHeaderProps = {}) {
  const { theme } = useTheme();
  const { cycleTheme, currentThemeName } = useGlobalTheme();
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();
  const [repositoryName, setRepositoryName] = useState<{ owner: string; repo: string } | null>(null);
  const [ownerOnly, setOwnerOnly] = useState<string | null>(null);
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [isStarred, setIsStarred] = useState(false);
  const [isStarLoading, setIsStarLoading] = useState(false);

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

  // Global presence connection status (connects to __global_presence__ room)
  // Keep connection active even though UI is hidden
  usePresenceData();

  // Fetch starred status when on a repo page and user is authenticated
  useEffect(() => {
    if (!repositoryName || !isAuthenticated) {
      setIsStarred(false);
      return;
    }

    const fetchStarredStatus = async () => {
      try {
        const response = await fetch(`/api/github/star/${repositoryName.owner}/${repositoryName.repo}`);
        if (response.ok) {
          const data = await response.json();
          setIsStarred(data.starred);
        }
      } catch (error) {
        console.error('Failed to fetch starred status:', error);
      }
    };

    fetchStarredStatus();
  }, [repositoryName, isAuthenticated]);

  // Toggle star status
  const handleToggleStar = useCallback(async () => {
    if (!repositoryName || isStarLoading) return;

    setIsStarLoading(true);
    try {
      const method = isStarred ? 'DELETE' : 'PUT';
      const response = await fetch(`/api/github/star/${repositoryName.owner}/${repositoryName.repo}`, {
        method,
      });

      if (response.ok) {
        setIsStarred(!isStarred);
      }
    } catch (error) {
      console.error('Failed to toggle star:', error);
    } finally {
      setIsStarLoading(false);
    }
  }, [repositoryName, isStarred, isStarLoading]);

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
        {/* Show repo name on repo pages */}
        {repositoryName && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <a
              href={`https://github.com/${repositoryName.owner}/${repositoryName.repo}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-base font-semibold transition-opacity hover:opacity-80"
              style={{
                fontFamily: theme.fonts.body,
                color: theme.colors.text,
                textDecoration: 'none',
              }}
            >
              {repositoryName.repo}
            </a>
            {/* Star button - only show for authenticated users */}
            {isAuthenticated && (
              <button
                onClick={handleToggleStar}
                disabled={isStarLoading}
                className="flex items-center justify-center w-7 h-7 rounded-md transition-all hover:opacity-80 disabled:opacity-50"
                style={{
                  background: 'transparent',
                  color: isStarred ? '#f59e0b' : theme.colors.textMuted,
                }}
                title={isStarred ? 'Unstar repository' : 'Star repository'}
              >
                <Star
                  className="w-4 h-4"
                  fill={isStarred ? '#f59e0b' : 'none'}
                  strokeWidth={isStarred ? 0 : 2}
                />
              </button>
            )}
          </div>
        )}
        {/* Show owner info on owner pages */}
        {ownerOnly && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <a
              href={`https://github.com/${ownerOnly}`}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-opacity hover:opacity-80"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://github.com/${ownerOnly}.png?size=64`}
                alt={ownerOnly}
                className="w-6 h-6 rounded-full"
              />
            </a>
            <a
              href={`https://github.com/${ownerOnly}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-base font-semibold transition-opacity hover:opacity-80"
              style={{
                fontFamily: theme.fonts.body,
                color: theme.colors.text,
                textDecoration: 'none',
              }}
            >
              {ownerOnly}
            </a>
          </div>
        )}
        {/* Show selected repository on owner pages */}
        {ownerOnly && selectedRepository && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <span style={{ color: theme.colors.textMuted }}>/</span>
            <Link
              href={`/${selectedRepository}`}
              className="text-base font-semibold transition-opacity hover:opacity-80"
              style={{
                fontFamily: theme.fonts.body,
                color: theme.colors.text,
                textDecoration: 'none',
              }}
            >
              {selectedRepository.split('/')[1]}
            </Link>
            <Link
              href={`/${selectedRepository}`}
              className="px-2 py-0.5 rounded text-xs transition-all hover:opacity-80"
              style={{
                background: theme.colors.primary,
                color: theme.colors.textOnPrimary,
                textDecoration: 'none',
              }}
            >
              Open
            </Link>
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
        {/* Feed and Gallery buttons - only show on home page */}
        {!repositoryName && !ownerOnly && !collectionId && (
          <div className="flex items-center gap-2">
            <Link
              href="/activity"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-all hover:opacity-80"
              style={{
                background: theme.colors.surface,
                color: theme.colors.text,
                border: `1px solid ${theme.colors.border}`,
                textDecoration: 'none',
              }}
            >
              <Rss className="w-4 h-4" />
              <span>Feed</span>
            </Link>
            {onToggleGallery && (
              <button
                onClick={onToggleGallery}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-all hover:opacity-80"
                style={{
                  background: showGallery ? theme.colors.primary : theme.colors.surface,
                  color: showGallery ? theme.colors.textOnPrimary : theme.colors.text,
                  border: `1px solid ${showGallery ? theme.colors.primary : theme.colors.border}`,
                }}
              >
                <Sparkles className="w-4 h-4" />
                <span>Gallery</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Center section */}
      <div className="absolute left-1/2 transform -translate-x-1/2 flex items-center">
        {/* GitHub/Local toggle on repo pages */}
        {repositoryName && currentRepoId && <LocalFolderButton currentRepoId={currentRepoId} />}
        {/* Selected repository on collection page */}
        {collectionId && selectedRepository && (
          <Link
            href={`/${selectedRepository}`}
            className="transition-opacity hover:opacity-80"
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
        )}
      </div>

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
                  color: theme.colors.textOnPrimary,
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
              color: theme.colors.textOnPrimary,
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

        {/* Clear color mode button - show when a color mode is selected */}
        {selectedColorMode && onClearColorMode && (
          <button
            onClick={onClearColorMode}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all hover:opacity-80"
            style={{
              background: theme.colors.secondary,
              color: theme.colors.text,
              border: `1px solid ${theme.colors.border}`,
            }}
            title={`Clear ${selectedColorMode} color mode`}
          >
            <X className="w-4 h-4" />
            <span className="hidden sm:inline capitalize">{selectedColorMode}</span>
          </button>
        )}

        {/* Vim mode toggle - only show on file-editor layout */}
        {currentLayoutConfigId === 'file-editor' && onVimModeToggle && (
          <button
            onClick={onVimModeToggle}
            className="hidden md:flex items-center justify-center px-3 py-1.5 rounded-md text-sm font-medium transition-all hover:opacity-80"
            style={{
              background: vimMode ? theme.colors.primary : theme.colors.secondary,
              color: theme.colors.textOnPrimary,
              border: `1px solid ${vimMode ? theme.colors.primary : theme.colors.border}`,
            }}
            title={vimMode ? 'Disable Vim mode' : 'Enable Vim mode'}
          >
            Vim
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

        {/* User Avatar Menu */}
        <UserAvatarMenu />
      </div>
    </header>
  );
}
