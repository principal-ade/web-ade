'use client';

import Link from 'next/link';
import { Check, Github, Terminal } from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';
import { useCallback, useEffect, useRef, useState } from 'react';

const COPY_FEEDBACK_MS = 1500;

const buildAgentCommand = (trailId: string) =>
  `npx -y @principal-ai/principal-view-cli@latest trail ${trailId}`;

interface TrailHeaderProps {
  owner: string;
  repo: string;
  trailId: string;
}

export function TrailHeader({ owner, repo, trailId }: TrailHeaderProps) {
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
      className="border-b px-4 flex items-center justify-between gap-2 flex-shrink-0"
      style={{
        background: theme.colors.surface,
        borderColor: theme.colors.border,
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)',
        paddingBottom: '0.5rem',
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
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
      </div>
    </header>
  );
}
