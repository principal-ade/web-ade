'use client';

import { useTheme } from '@principal-ade/industry-theme';
import { useAuth } from '@/contexts/AuthContext';
import { LogIn, LogOut, Wifi, WifiOff, Home, ArrowLeftRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useControlTowerClient } from '@/lib/control-tower';
import { getTrafficControllerUrl, getWebSocketToken } from '@/lib/control-tower/config';
import { useEffect, useState } from 'react';
import { RepoSelectionModal } from './RepoSelectionModal';

export function EditorHeader() {
  const { theme } = useTheme();
  const { user, isAuthenticated, isLoading, login, logout } = useAuth();
  const pathname = usePathname();
  const [wsToken, setWsToken] = useState<string | null>(null);
  const [repositoryName, setRepositoryName] = useState<{ owner: string; repo: string } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Extract repository name from URL
  useEffect(() => {
    if (pathname) {
      const pathParts = pathname.split('/');
      console.log('[EditorHeader] URL pathname:', pathname);
      console.log('[EditorHeader] Path parts:', pathParts);
      // Path format: /editor/owner/repo or /editor
      if (pathParts.length >= 4 && pathParts[1] === 'editor' && pathParts[2] && pathParts[3]) {
        const owner = pathParts[2];
        const repo = pathParts[3];
        console.log('[EditorHeader] Setting repository:', { owner, repo });
        setRepositoryName({ owner, repo });
      } else {
        console.log('[EditorHeader] No repository found in path');
        setRepositoryName(null);
      }
    }
  }, [pathname]);

  // Fetch WebSocket token when user authenticates and has a repository
  useEffect(() => {
    if (isAuthenticated && repositoryName) {
      const fullRepoName = `${repositoryName.owner}/${repositoryName.repo}`;
      getWebSocketToken(fullRepoName, 'main')
        .then(setWsToken)
        .catch(error => {
          console.error('[EditorHeader] Failed to fetch WebSocket token:', error);
        });
    }
  }, [isAuthenticated, repositoryName]);

  // WebSocket connection status
  const { connected } = useControlTowerClient({
    serverUrl: getTrafficControllerUrl(),
    accessToken: wsToken || 'temp-token',
    autoConnect: isAuthenticated && !!wsToken && !!repositoryName,
    enableReconnection: true,
  });

  return (
    <header
      className="h-12 flex items-center justify-between px-4 border-b"
      style={{
        background: theme.colors.surface,
        borderColor: theme.colors.border,
      }}
    >
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80"
          style={{
            background: theme.colors.secondary,
            color: theme.colors.text
          }}
          title="Home"
        >
          <Home className="w-4 h-4" />
        </Link>
        {repositoryName && (
          <div
            className="flex flex-col"
            style={{
              fontFamily: theme.fonts.body,
              lineHeight: theme.lineHeights.tight,
            }}
          >
            <a
              href={`https://github.com/${repositoryName.owner}/${repositoryName.repo}`}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-opacity hover:opacity-80"
              style={{
                fontSize: theme.fontSizes[2],
                fontWeight: theme.fontWeights.semibold,
                color: theme.colors.text,
                textDecoration: 'none',
              }}
            >
              {repositoryName.repo}
            </a>
            <a
              href={`https://github.com/${repositoryName.owner}`}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-opacity hover:opacity-80"
              style={{
                fontSize: theme.fontSizes[1],
                fontWeight: theme.fontWeights.body,
                color: theme.colors.textMuted,
                textDecoration: 'none',
              }}
            >
              {repositoryName.owner}
            </a>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        {isLoading ? (
          <div className="text-sm" style={{ color: theme.colors.textMuted }}>
            Loading...
          </div>
        ) : isAuthenticated && user ? (
          <>
            {/* WebSocket Connection Indicator */}
            <div
              className="flex items-center gap-1.5 px-2 py-1 rounded text-xs"
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
              <span>{connected ? 'Connected' : 'Offline'}</span>
            </div>

            <div className="flex items-center gap-2">
              {user.avatar_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatar_url}
                  alt={user.name}
                  className="w-6 h-6 rounded-full"
                />
              )}
              <span className="text-sm" style={{ color: theme.colors.text }}>
                {user.name || user.login}
              </span>
            </div>
            <button
              onClick={logout}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all hover:opacity-80"
              style={{
                background: theme.colors.secondary,
                color: theme.colors.text,
              }}
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </>
        ) : (
          <button
            onClick={login}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all hover:opacity-80"
            style={{
              background: theme.colors.primary,
              color: theme.colors.background,
            }}
          >
            <LogIn className="w-4 h-4" />
            Login
          </button>
        )}
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80"
          style={{
            background: theme.colors.secondary,
            color: theme.colors.text,
          }}
          title="Switch repository"
        >
          <ArrowLeftRight className="w-4 h-4" />
        </button>
      </div>

      <RepoSelectionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        currentRepo={repositoryName}
      />
    </header>
  );
}
