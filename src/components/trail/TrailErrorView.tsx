'use client';

import Link from 'next/link';
import { useTheme } from '@principal-ade/industry-theme';
import { AlertTriangle, Clock, Github, MapPinOff, RefreshCw } from 'lucide-react';
import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { event } from '@/lib/analytics';
import { ShareErrorCodes, type ShareErrorCode } from '@/lib/trails/types';
import { PrivatePropertySign } from '@/app/trail/[id]/PrivatePropertySign';

interface TrailErrorViewProps {
  message: string;
  code: ShareErrorCode | null;
  /**
   * Title shown when the error is a private-repo / no-access failure.
   * Different surfaces phrase this differently — the trail page says
   * "This trail is in a private repository", the repo explorer says
   * "This repository is private".
   */
  noAccessTitle?: string;
  /** Title shown when the resource isn't found. */
  notFoundTitle?: string;
  /**
   * Title shown when GitHub is rate limiting us — a transient, retryable
   * condition (not the same as no access). Defaults to a generic phrasing.
   */
  rateLimitedTitle?: string;
  /** Title for any other failure. */
  fallbackTitle?: string;
}

export function TrailErrorView({
  message,
  code,
  noAccessTitle = 'This trail is in a private repository',
  notFoundTitle = 'Trail not found',
  rateLimitedTitle = 'Hang tight — GitHub is busy',
  fallbackTitle = 'Trail unavailable',
}: TrailErrorViewProps) {
  const { theme } = useTheme();
  const { isAuthenticated, login } = useAuth();

  const isNoAccess = code === ShareErrorCodes.NO_REPO_ACCESS;
  const isNotFound = code === ShareErrorCodes.NOT_FOUND;
  const isRateLimited = code === ShareErrorCodes.RATE_LIMITED;
  const showLogin = (isNoAccess || isRateLimited) && !isAuthenticated;

  useEffect(() => {
    if (!isRateLimited) return
    
    // Retry with exponential backoff if gtag isn't ready yet
    let attempts = 0
    const maxAttempts = 5
    
    const tryEvent = () => {
      if (window.gtag) {
        event({
          action: 'rate_limited',
          category: 'Error',
          label: window.location.pathname,
        })
        return true
      }
      
      attempts++
      if (attempts < maxAttempts) {
        setTimeout(tryEvent, Math.min(100 * Math.pow(2, attempts), 1000))
      }
      return false
    }
    
    tryEvent()
  }, [isRateLimited])

  const Icon = isNotFound ? MapPinOff : isRateLimited ? Clock : AlertTriangle;
  const title = isNoAccess
    ? noAccessTitle
    : isNotFound
      ? notFoundTitle
      : isRateLimited
        ? rateLimitedTitle
        : fallbackTitle;
  const helper = isRateLimited
    ? 'GitHub is limiting requests from this app right now. Give it a moment, then try again. If this repository is private or you want to expedite access, sign in with GitHub.'
    : isNoAccess && !showLogin
      ? 'Your current GitHub account does not have read access to this repository.'
      : null;

  return (
    <div
      className="w-screen flex items-center justify-center px-4"
      style={{ background: theme.colors.background, height: '100vh' }}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-lg border px-10 py-12 text-center shadow-sm"
        style={{
          color: theme.colors.text,
          background: theme.colors.backgroundSecondary ?? theme.colors.background,
          borderColor: theme.colors.border ?? 'rgba(255,255,255,0.08)',
        }}
      >
        {isNoAccess ? (
          <div className="-mx-10 -mt-12 mb-6 flex items-center justify-center">
            <PrivatePropertySign />
          </div>
        ) : (
          <div
            className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full"
            style={{
              background: `${theme.colors.accent}1a`,
              color: theme.colors.accent,
            }}
          >
            <Icon size={30} strokeWidth={1.75} />
          </div>
        )}
        <h1
          className="text-2xl font-semibold mb-3"
          style={isNoAccess ? { color: theme.colors.primary } : undefined}
        >
          {title}
        </h1>
        {(helper || !isNoAccess) && (
          <p
            className="text-base leading-relaxed"
            style={{ color: theme.colors.textMuted }}
          >
            {helper ?? message}
          </p>
        )}
        {showLogin && (
          <button
            type="button"
            onClick={() => login()}
            className="mt-8 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md text-base font-medium transition-opacity hover:opacity-90"
            style={{
              background: theme.colors.accent,
              color: theme.colors.background,
            }}
          >
            <Github size={18} strokeWidth={2} />
            Sign in with GitHub
          </button>
        )}
        {isRateLimited && (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-8 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md text-base font-medium transition-opacity hover:opacity-90"
            style={{
              background: theme.colors.accent,
              color: theme.colors.background,
            }}
          >
            <RefreshCw size={18} strokeWidth={2} />
            Try again
          </button>
        )}
        <div className="mt-8">
          <Link
            href="/"
            className="text-sm underline-offset-2 hover:underline"
            style={{ color: theme.colors.textMuted }}
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
