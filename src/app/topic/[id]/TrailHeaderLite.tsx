'use client';

/**
 * Slim header for /topic/[id] — Principal AI brand, share button, optional
 * owner-only delete. Mirrors TrailHeader's surface but doesn't bind to an
 * owner/repo pair, since topics curate across many repos.
 */

import Link from 'next/link';
import { Check, Share2, Trash2 } from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';

interface TrailHeaderLiteProps {
  topicId: string;
  shareCopied: boolean;
  onShare: () => void;
  isOwner: boolean;
  onDelete: () => void;
}

export function TrailHeaderLite({
  shareCopied,
  onShare,
  isOwner,
  onDelete,
}: TrailHeaderLiteProps) {
  const { theme } = useTheme();
  return (
    <header
      className="border-b px-4 flex items-center gap-2 flex-shrink-0"
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
        <span
          className="text-base font-semibold truncate"
          style={{ color: theme.colors.text }}
        >
          Topic
        </span>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={onShare}
          className="flex items-center gap-1.5 px-3 h-8 rounded-md text-sm font-medium transition-all hover:opacity-80"
          style={{
            background: shareCopied ? theme.colors.primary : 'transparent',
            color: shareCopied ? theme.colors.background : theme.colors.text,
            border: `1px solid ${shareCopied ? theme.colors.primary : theme.colors.border}`,
            fontFamily: theme.fonts.body,
            cursor: 'pointer',
          }}
          aria-label="Copy share link"
        >
          {shareCopied ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
          <span>{shareCopied ? 'Copied' : 'Share'}</span>
        </button>

        {isOwner && (
          <button
            type="button"
            onClick={onDelete}
            className="flex items-center justify-center w-8 h-8 rounded-md transition-opacity hover:opacity-80"
            style={{
              color: theme.colors.textMuted,
              border: `1px solid ${theme.colors.border}`,
              background: 'transparent',
            }}
            aria-label="Delete topic"
            title="Delete topic"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
}
