'use client';

import Link from 'next/link';
import { Check, Github, LogIn, Terminal } from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';
import { useCallback, useEffect, useRef, useState } from 'react';

const COPY_FEEDBACK_MS = 1500;

const buildAgentCommand = (trailId: string) =>
  `npx -y @principal-ai/principal-view-cli@latest trail ${trailId}`;

interface TrailHeaderProps {
  owner: string;
  repo: string;
  trailId: string;
  /**
   * Transient status text shown centered in the header, e.g.
   * "Saved in this browser only. Sign in to share." Caller controls
   * the lifecycle (set + clear); the header just renders it with a
   * fade transition so it appears smoothly.
   */
  statusMessage?: string | null;
  /** Render a Sign in button next to the GitHub link. */
  showSignIn?: boolean;
  /** Called when the user clicks the Sign in button. */
  onSignIn?: () => void;
}

export function TrailHeader({
  owner,
  repo,
  trailId,
  statusMessage,
  showSignIn,
  onSignIn,
}: TrailHeaderProps) {
  const { theme } = useTheme();
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleCopyAgent = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(buildAgentCommand(trailId));
      setCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    } catch {
      // clipboard may be denied — fail quietly; user can refresh and retry
    }
  }, [trailId]);

  return (
    <header
      className="border-b px-4 flex items-center gap-2 flex-shrink-0 relative"
      style={{
        background: theme.colors.surface,
        borderColor: theme.colors.border,
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)',
        paddingBottom: '0.5rem',
      }}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Link
          href="/"
          className="text-xl font-bold transition-opacity hover:opacity-80"
          style={{ fontFamily: theme.fonts.body, textDecoration: 'none' }}
        >
          <span style={{ color: theme.colors.text }}>Principal</span>{' '}
          <span style={{ color: theme.colors.primary }}>AI</span>
        </Link>

        <span
          className="mx-2"
          style={{ color: theme.colors.textMuted }}
          aria-hidden="true"
        >
          /
        </span>

        <Link
          href={`/${owner}`}
          className="text-base font-semibold transition-opacity hover:opacity-80 truncate"
          style={{
            fontFamily: theme.fonts.body,
            color: theme.colors.text,
            textDecoration: 'none',
          }}
        >
          {owner}
        </Link>
        <span style={{ color: theme.colors.textMuted }} aria-hidden="true">
          /
        </span>
        <Link
          href={`/${owner}/${repo}`}
          className="text-base font-semibold transition-opacity hover:opacity-80 truncate"
          style={{
            fontFamily: theme.fonts.body,
            color: theme.colors.text,
            textDecoration: 'none',
          }}
        >
          {repo}
        </Link>
      </div>

      {/*
        Centered status slot. Absolute-positioned so it occupies the
        true visual center of the header rather than being squeezed
        between left and right groups. `pointer-events-none` lets users
        click through onto whatever sits behind it (no behavior here,
        but keeps interactions feeling snappy when text is animating
        in/out).
      */}
      <div
        className="absolute left-1/2 -translate-x-1/2 hidden md:flex items-center justify-center pointer-events-none"
        style={{
          top: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)',
          bottom: '0.5rem',
        }}
        aria-live="polite"
      >
        <span
          className="px-3 py-1 rounded-md text-sm font-medium transition-opacity duration-300 whitespace-nowrap"
          style={{
            opacity: statusMessage ? 1 : 0,
            background: theme.colors.backgroundSecondary,
            color: theme.colors.text,
            border: `1px solid ${theme.colors.border}`,
            fontFamily: theme.fonts.body,
          }}
        >
          {statusMessage ?? ' '}
        </span>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={handleCopyAgent}
          className="flex items-center gap-1.5 px-3 h-8 rounded-md text-sm font-medium transition-all hover:opacity-80"
          style={{
            background: copied ? theme.colors.primary : 'transparent',
            color: copied ? theme.colors.background : theme.colors.text,
            border: `1px solid ${copied ? theme.colors.primary : theme.colors.border}`,
            fontFamily: theme.fonts.body,
            cursor: 'pointer',
          }}
          title={`Copies: ${buildAgentCommand(trailId)}`}
          aria-label="Copy CLI command for agents"
        >
          {copied ? (
            <Check className="w-4 h-4" />
          ) : (
            <Terminal className="w-4 h-4" />
          )}
          <span>{copied ? 'Copied' : 'Share With Agent'}</span>
        </button>

        <a
          href={`https://github.com/${owner}/${repo}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80"
          style={{ color: theme.colors.text }}
          title={`Open ${owner}/${repo} on GitHub`}
          aria-label={`Open ${owner}/${repo} on GitHub`}
        >
          <Github className="w-5 h-5" />
        </a>

        {showSignIn && (
          <button
            type="button"
            onClick={onSignIn}
            className="flex items-center gap-1.5 px-3 h-8 rounded-md text-sm font-medium transition-all hover:opacity-90"
            style={{
              background: theme.colors.primary,
              color: theme.colors.background,
              border: `1px solid ${theme.colors.primary}`,
              fontFamily: theme.fonts.body,
              cursor: 'pointer',
            }}
            aria-label="Sign in"
          >
            <LogIn className="w-4 h-4" />
            <span>Sign in</span>
          </button>
        )}
      </div>
    </header>
  );
}
