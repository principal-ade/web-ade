'use client';

import { useTheme } from '@principal-ade/industry-theme';
import { useRouter } from 'next/navigation';
import { LocalFolderButton } from './LocalFolderButton';
import { Logo } from '@principal-ai/logo-component';

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
  const router = useRouter();

  const titleByStatus: Record<AccessStatus, string> = {
    loading: 'Checking repository access...',
    granted: 'Access granted',
    'login-required': 'Sign in to view this repository',
    unauthorized: 'You do not have access to this repository',
    'not-found': 'Project not found',
    error: 'Unable to load repository',
  };

  const descriptionByStatus: Record<AccessStatus, string> = {
    loading: 'Verifying permissions for the requested repository.',
    granted: 'Access granted',
    'login-required': 'Log in with your GitHub account to open private repositories, or open from a local folder if you have it cloned.',
    unauthorized:
      'Your account is signed in, but GitHub denied access. You can open from a local folder if you have it cloned.',
    'not-found': '',
    error: 'An unexpected error occurred. You can open from a local folder if you have it cloned.',
  };

  const showLogin = status === 'login-required' && onLogin;
  const showRetry = status !== 'loading';

  // Special loading screen
  if (status === 'loading') {
    return (
      <div
        className="flex h-full w-full flex-col items-center justify-center gap-6 px-6 text-center"
        style={{
          background: theme.colors.background,
          color: theme.colors.text,
          fontFamily: theme.fonts.body,
        }}
      >
        <div className="relative">
          <Logo
            width={64}
            height={64}
            color={theme.colors.accent}
            particleColor={theme.colors.primary}
            letterColor={theme.colors.text}
            opacity={0.9}
          />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold" style={{ color: theme.colors.text }}>
            {titleByStatus[status]}
          </h2>
          <p className="text-sm" style={{ color: theme.colors.textMuted }}>
            {descriptionByStatus[status]}
          </p>
        </div>
      </div>
    );
  }

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
        <h2 className={status === 'not-found' ? 'text-3xl font-semibold' : 'text-2xl font-semibold'} style={{ color: theme.colors.text }}>
          {titleByStatus[status]}
        </h2>
        {descriptionByStatus[status] && (
          <p className="text-sm" style={{ color: theme.colors.textMuted }}>
            {descriptionByStatus[status]}
          </p>
        )}
        {repository && status === 'not-found' && (
          <p className="text-xl" style={{ color: theme.colors.textMuted }}>
            <a
              href={`https://github.com/${repository}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium hover:underline"
              style={{ color: theme.colors.primary }}
            >
              {repository}
            </a>
          </p>
        )}
        {repository && status !== 'not-found' && (
          <p className="text-sm" style={{ color: theme.colors.textMuted }}>
            Project: <span className="font-medium" style={{ color: theme.colors.text }}>{repository}</span>
          </p>
        )}
        {errorMessage && status === 'error' && (
          <p className="text-xs" style={{ color: theme.colors.error }}>
            {errorMessage}
          </p>
        )}
      </div>
      {status === 'not-found' ? (
        <div className="flex items-center gap-3">
          {onLogin && (
            <button
              onClick={onLogin}
              className="px-4 py-2 rounded-md text-sm"
              style={{
                background: theme.colors.primary,
                color: theme.colors.textOnPrimary,
              }}
            >
              Sign In
            </button>
          )}
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 rounded-md text-sm border"
            style={{
              background: theme.colors.surface,
              color: theme.colors.text,
              borderColor: theme.colors.border,
            }}
          >
            Go Home
          </button>
        </div>
      ) : (
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
          {repository && (
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
      )}
    </div>
  );
}
