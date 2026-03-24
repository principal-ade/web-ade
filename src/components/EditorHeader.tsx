'use client';

import { useTheme } from '@principal-ade/industry-theme';
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Palette, GitCommit, ArrowLeftRight, X, Star, Menu, Package, Activity } from 'lucide-react';
import { UserAvatarMenu } from './UserAvatarMenu';
import { useGlobalTheme } from '@/contexts/ThemeContext';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePresenceData } from '@/hooks/usePresenceData';
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { GitHubAppStatus } from './GitHubAppStatus';
import { useVersionRegistry } from '@/hooks/useVersionRegistry';
import { VersionRegistryModal } from './VersionRegistryModal';
import { useServiceStatus } from '@/hooks/useServiceStatus';
import { useLiveVersions } from '@/hooks/useLiveVersions';

interface EditorHeaderProps {
  currentLayoutConfigId?: string;
  leftCollapsed?: boolean;
  rightCollapsed?: boolean;
  onToggleLeft?: () => void;
  onToggleRight?: () => void;
  onSwapRightPanels?: () => void;
  selectedRepository?: string | null; // Format: "owner/repo"
  // Commit actions
  pendingChangesCount?: number;
  onCommitClick?: () => void;
  // Panel visibility
  hideLeftToggle?: boolean;
  // Vim mode toggle
  vimMode?: boolean;
  onVimModeToggle?: () => void;
  // Color mode selection (for clear button)
  selectedColorMode?: string | null;
  onClearColorMode?: () => void;
  // Mobile sidebar
  onOpenMobileSidebar?: () => void;
  // Voice input
  onOpenWithMic?: () => void;
}

export function EditorHeader({
  currentLayoutConfigId,
  leftCollapsed = false,
  rightCollapsed = false,
  onToggleLeft,
  onToggleRight,
  onSwapRightPanels,
  selectedRepository,
  pendingChangesCount = 0,
  onCommitClick,
  hideLeftToggle = false,
  vimMode = false,
  onVimModeToggle,
  selectedColorMode,
  onClearColorMode,
  onOpenMobileSidebar,
  onOpenWithMic: _onOpenWithMic,
}: EditorHeaderProps = {}) {
  const { theme } = useTheme();
  const { cycleTheme, currentThemeName } = useGlobalTheme();
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();
  const [repositoryName, setRepositoryName] = useState<{ owner: string; repo: string } | null>(null);
  const [ownerOnly, setOwnerOnly] = useState<string | null>(null);
  const [isStarred, setIsStarred] = useState(false);
  const [isStarLoading, setIsStarLoading] = useState(false);
  const [canInstallApp, setCanInstallApp] = useState(false);
  const [showRegistryModal, setShowRegistryModal] = useState(false);

  // Fetch version registry data
  const customerId = repositoryName ? `${repositoryName.owner}/${repositoryName.repo}` : null;
  const serviceName = repositoryName ? repositoryName.repo : null;

  // Fetch version registry with live filtering (default behavior)
  const { registrations, loading: registryLoading, error: registryError, count: registryCount, refetch: refetchVersionRegistry } = useVersionRegistry(customerId, {
    serviceName: serviceName || undefined,
  });

  // Fetch OTEL service status
  const { isAlive: serviceIsAlive, status: serviceStatus } = useServiceStatus(serviceName);

  // Fetch live versions for the modal
  const { liveVersions } = useLiveVersions(serviceName);

  // Extract repository name or owner from URL
  useEffect(() => {
    if (pathname) {
      const pathParts = pathname.split('/').filter(Boolean);

      // Path format: /owner/repo
      if (pathParts.length >= 2 && pathParts[0] && pathParts[1]) {
        const owner = pathParts[0];
        const repo = pathParts[1];
        setRepositoryName({ owner, repo });
        setOwnerOnly(null);
      } else if (pathParts.length === 1 && pathParts[0]) {
        // Path format: /owner (owner page only)
        setRepositoryName(null);
        setOwnerOnly(pathParts[0]);
      } else {
        setRepositoryName(null);
        setOwnerOnly(null);
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

  // Fetch admin permissions when on a repo page and user is authenticated
  useEffect(() => {
    if (!repositoryName || !isAuthenticated) {
      setCanInstallApp(false);
      return;
    }

    const fetchPermissions = async () => {
      try {
        const response = await fetch(`/api/github/repo/${repositoryName.owner}/${repositoryName.repo}/permissions`);
        if (response.ok) {
          const data = await response.json();
          setCanInstallApp(data.isAdmin === true);
        }
      } catch (error) {
        console.error('Failed to fetch permissions:', error);
        setCanInstallApp(false);
      }
    };

    fetchPermissions();
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
    <>
      <header
        className="border-b relative z-50 px-4"
        style={{
          background: theme.colors.surface,
          borderColor: theme.colors.border,
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)',
          paddingBottom: '0.5rem',
        }}
      >
      {/* Inner wrapper - constrained width only on home page to match feed panel */}
      <div className="flex items-center justify-between" style={!repositoryName && !ownerOnly ? { maxWidth: 1350, margin: '0 auto' } : undefined}>
      {/* Left section: Logo/Avatar and Repository info */}
      <div className="flex items-center gap-3 flex-shrink-0 flex-1">
        {/* Show repo name on repo pages */}
        {repositoryName && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Mobile hamburger menu */}
            {onOpenMobileSidebar && (
              <button
                onClick={onOpenMobileSidebar}
                className="md:hidden flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80"
                style={{
                  background: theme.colors.secondary,
                  color: theme.colors.text,
                }}
                title="Open navigation"
              >
                <Menu className="w-4 h-4" />
              </button>
            )}
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
            {/* Version Registry indicator - show if there are registered versions */}
            {registryCount > 0 && (
              <button
                onClick={() => setShowRegistryModal(true)}
                className="flex items-center gap-1 px-2 py-1 rounded-md transition-all hover:opacity-80"
                style={{
                  background: theme.colors.primary,
                  color: theme.colors.textOnPrimary,
                }}
                title={`${registryCount} version${registryCount !== 1 ? 's' : ''} registered`}
              >
                <Package className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">{registryCount}</span>
              </button>
            )}
            {/* OTEL Service Status indicator - show if service has status */}
            {serviceStatus && (
              <div
                className="flex items-center gap-1 px-2 py-1 rounded-md"
                style={{
                  background: serviceIsAlive ? '#22c55e' : '#f59e0b',
                  color: '#ffffff',
                }}
                title={serviceIsAlive
                  ? `Service active - Last trace: ${new Date(serviceStatus.lastSeen).toLocaleString()}`
                  : `Service inactive - Last trace: ${new Date(serviceStatus.lastSeen).toLocaleString()}`
                }
              >
                <Activity className="w-3.5 h-3.5" />
                <span className="text-xs font-medium">
                  {serviceIsAlive ? 'Live' : 'Stale'}
                </span>
              </div>
            )}
            {/* GitHub App sync status - hidden on mobile */}
            <div className="hidden md:inline-flex">
              <GitHubAppStatus
                repoId={`${repositoryName.owner}/${repositoryName.repo}`}
                compact
                canInstall={canInstallApp}
              />
            </div>
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
        {/* Principal AI title - only show on home page */}
        {!repositoryName && !ownerOnly && (
          <h1
            className="text-xl font-bold m-0"
            style={{
              fontFamily: theme.fonts.body,
            }}
          >
            <span style={{ color: theme.colors.text }}>Principal</span>
            {' '}
            <span style={{ color: theme.colors.primary }}>AI</span>
          </h1>
        )}
      </div>


      <div className="flex items-center gap-3 flex-shrink-0 flex-1 justify-end">
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

        {/* Theme Switcher - only on home page */}
        {!repositoryName && !ownerOnly && (
          <button
            onClick={cycleTheme}
            className="flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80"
            style={{
              background: theme.colors.primary,
              color: theme.colors.textOnPrimary,
            }}
            title={`Theme: ${currentThemeName} (click to cycle)`}
          >
            <Palette className="w-4 h-4" />
          </button>
        )}

        {/* Discord Link - only on home page */}
        {!repositoryName && !ownerOnly && (
          <a
            href="https://discord.gg/G3qdcC2DXq"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center px-3 h-8 rounded-md transition-all hover:opacity-80 text-sm font-medium"
            style={{
              background: '#5865F2',
              color: '#fff',
            }}
            title="Join our Discord"
          >
            Join Community
          </a>
        )}

        {/* Voice Input Button - TODO: Re-enable later */}
        {/* {onOpenWithMic && (
          <button
            onClick={onOpenWithMic}
            className="flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80"
            style={{
              background: theme.colors.secondary,
              color: theme.colors.text,
            }}
            title="Voice command (opens command palette with microphone)"
          >
            <Mic className="w-4 h-4" />
          </button>
        )} */}

        {/* User Avatar Menu */}
        <UserAvatarMenu />
      </div>
      </div>
      </header>

      {/* Version Registry Modal */}
      {repositoryName && (
        <VersionRegistryModal
          isOpen={showRegistryModal}
          onClose={() => setShowRegistryModal(false)}
          registrations={registrations}
          loading={registryLoading}
          error={registryError}
          repositoryName={`${repositoryName.owner}/${repositoryName.repo}`}
          liveVersions={liveVersions}
          onViewTraces={(serviceName, version) => {
            // TODO: Open trace viewer panel or navigate to traces page
            console.log('View traces for:', { serviceName, version });
            alert(`Viewing traces for ${serviceName}:${version}\n\nTrace viewer coming soon!`);
          }}
          onRefresh={refetchVersionRegistry}
        />
      )}
    </>
  );
}
