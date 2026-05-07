'use client';

import Link from 'next/link';
import { Github } from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';

interface TrailHeaderProps {
  owner: string;
  repo: string;
}

export function TrailHeader({ owner, repo }: TrailHeaderProps) {
  const { theme } = useTheme();

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

      <a
        href={`https://github.com/${owner}/${repo}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80 flex-shrink-0"
        style={{ color: theme.colors.text }}
        title={`Open ${owner}/${repo} on GitHub`}
        aria-label={`Open ${owner}/${repo} on GitHub`}
      >
        <Github className="w-5 h-5" />
      </a>
    </header>
  );
}
