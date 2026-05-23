'use client';

/**
 * Slim header for /topic/[id] — Principal AI brand, share button, optional
 * owner-only delete. Mirrors TrailHeader's surface but doesn't bind to an
 * owner/repo pair, since topics curate across many repos.
 */

import Link from 'next/link';
import { Bot, Check, MessageSquare, Share2, Trash2 } from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';
import { UserAvatarMenu } from '@/components/UserAvatarMenu';
import { StarButton } from '@/components/StarButton';

interface TrailHeaderLiteProps {
  topicId: string;
  shareCopied: boolean;
  onShare: () => void;
  onBriefAgent: () => void;
  discussionOpen: boolean;
  onToggleDiscussion: () => void;
  isOwner: boolean;
  onDelete: () => void;
  /**
   * Current starred state. When `onToggleStar` is provided the header
   * renders a star button; otherwise the slot is omitted.
   */
  starred?: boolean;
  /** Forward click. Parent owns the optimistic update and the API call. */
  onToggleStar?: () => void;
  /** Disable the star button while a previous toggle is in flight. */
  starToggleInFlight?: boolean;
  /**
   * Transient status text shown centered in the header (e.g.
   * "Sign in to star this topic."). Caller controls the lifecycle — set
   * the message, the header fades it in; clear it, it fades out.
   */
  statusMessage?: string | null;
}

export function TrailHeaderLite({
  shareCopied,
  onShare,
  onBriefAgent,
  discussionOpen,
  onToggleDiscussion,
  isOwner,
  onDelete,
  starred,
  onToggleStar,
  starToggleInFlight,
  statusMessage,
}: TrailHeaderLiteProps) {
  const { theme } = useTheme();
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
        <span
          className="text-base font-semibold truncate"
          style={{ color: theme.colors.text }}
        >
          Topic
        </span>
      </div>

      {/*
        Centered status slot — mirrors TrailHeader. Absolute-positioned so
        it sits at the true visual center of the header rather than being
        squeezed between the brand and actions groups. `pointer-events-
        none` lets users click through onto the buttons behind it.
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
          {statusMessage ?? ' '}
        </span>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {onToggleStar && (
          <StarButton
            starred={!!starred}
            onClick={onToggleStar}
            disabled={starToggleInFlight}
          />
        )}

        <button
          type="button"
          onClick={onToggleDiscussion}
          className="flex items-center gap-1.5 px-3 h-8 rounded-md text-sm font-medium transition-all hover:opacity-80"
          style={{
            background: discussionOpen ? theme.colors.primary : 'transparent',
            color: discussionOpen ? theme.colors.background : theme.colors.text,
            border: `1px solid ${discussionOpen ? theme.colors.primary : theme.colors.border}`,
            fontFamily: theme.fonts.body,
            cursor: 'pointer',
          }}
          aria-label="Toggle discussion"
          aria-pressed={discussionOpen}
          title="Toggle discussion"
        >
          <MessageSquare className="w-4 h-4" />
          <span>Discussion</span>
        </button>

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

        <button
          type="button"
          onClick={onBriefAgent}
          className="flex items-center gap-1.5 px-3 h-8 rounded-md text-sm font-medium transition-all hover:opacity-80"
          style={{
            background: 'transparent',
            color: theme.colors.text,
            border: `1px solid ${theme.colors.border}`,
            fontFamily: theme.fonts.body,
            cursor: 'pointer',
          }}
          aria-label="Copy a brief about this topic for an AI agent"
          title="Brief an AI agent about this topic"
        >
          <Bot className="w-4 h-4" />
          <span>Share With Agent</span>
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

        <UserAvatarMenu />
      </div>
    </header>
  );
}
