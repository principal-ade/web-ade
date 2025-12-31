'use client';

import { useTheme } from '@principal-ade/industry-theme';
import { LocalFolderButton } from './LocalFolderButton';

export type AccessStatus = 'loading' | 'granted' | 'login-required' | 'unauthorized' | 'not-found' | 'error';

interface AccessNoticeProps {
  status: AccessStatus;
  onRetry: () => void;
  onLogin?: () => void;
  repository?: string;
  errorMessage?: string | null;
}

export function AccessNotice({ status, onRetry, onLogin, repository, errorMessage }: AccessNoticeProps) {
  const { theme } = useTheme();

  const titleByStatus: Record<AccessStatus, string> = {
    loading: 'Checking repository access...',
    granted: 'Access granted',
    'login-required': 'Sign in to view this repository',
    unauthorized: 'You do not have access to this repository',
    'not-found': 'Repository not found or is private',
    error: 'Unable to load repository',
  };

  const descriptionByStatus: Record<AccessStatus, string> = {
    loading: 'Verifying permissions for the requested repository.',
    granted: 'Access granted',
    'login-required': 'Log in with your GitHub account to open private repositories, or open from a local folder if you have it cloned.',
    unauthorized:
      'Your account is signed in, but GitHub denied access. You can open from a local folder if you have it cloned.',
    'not-found': 'The repository may be private or the name is incorrect. You can open from a local folder if you have it cloned.',
    error: 'An unexpected error occurred. You can open from a local folder if you have it cloned.',
  };

  const showLogin = status === 'login-required' && onLogin;
  const showRetry = status !== 'loading';

  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-4 px-6 text-center"
      style={{
        background: theme.colors.background,
        color: theme.colors.text,
        fontFamily: theme.fonts.body,
      }}
    >
      <div className="space-y-2 max-w-xl">
        <h2 className="text-2xl font-semibold" style={{ color: theme.colors.text }}>
          {titleByStatus[status]}
        </h2>
        <p className="text-sm" style={{ color: theme.colors.textMuted }}>
          {descriptionByStatus[status]}
        </p>
        {repository && (
          <p className="text-sm" style={{ color: theme.colors.textMuted }}>
            Repository: <span className="font-medium" style={{ color: theme.colors.text }}>{repository}</span>
          </p>
        )}
        {errorMessage && status === 'error' && (
          <p className="text-xs" style={{ color: theme.colors.error }}>
            {errorMessage}
          </p>
        )}
      </div>
      <div className="flex items-center gap-3">
        {showLogin && (
          <button
            onClick={onLogin}
            className="px-4 py-2 rounded-md text-sm"
            style={{
              background: theme.colors.primary,
              color: theme.colors.textOnPrimary,
            }}
          >
            Sign in with GitHub
          </button>
        )}
        {/* Local folder option - available when we have a repository */}
        {repository && status !== 'loading' && (
          <LocalFolderButton currentRepoId={repository} />
        )}
        {showRetry && (
          <button
            onClick={onRetry}
            className="px-4 py-2 rounded-md text-sm border"
            style={{
              background: theme.colors.surface,
              color: theme.colors.text,
              borderColor: theme.colors.border,
            }}
          >
            Retry access check
          </button>
        )}
      </div>
    </div>
  );
}
