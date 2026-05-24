'use client';

/**
 * Slim header for /topic/[id] — Principal AI brand, share button, optional
 * owner-only delete. Mirrors TrailHeader's surface but doesn't bind to an
 * owner/repo pair, since topics curate across many repos.
 */

import Link from 'next/link';
import { useTheme } from '@principal-ade/industry-theme';
import { UserAvatarMenu } from '@/components/UserAvatarMenu';
import { TopicActions } from './TopicActions';

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
        {/*
          Action buttons render in the header on tablet+ and move under
          the curator row on mobile (see TopicPage). UserAvatarMenu stays
          in the header at every breakpoint.
        */}
        <div className="hidden md:flex items-center gap-2">
          <TopicActions
            shareCopied={shareCopied}
            onShare={onShare}
            onBriefAgent={onBriefAgent}
            discussionOpen={discussionOpen}
            onToggleDiscussion={onToggleDiscussion}
            isOwner={isOwner}
            onDelete={onDelete}
            starred={starred}
            onToggleStar={onToggleStar}
            starToggleInFlight={starToggleInFlight}
          />
        </div>

        <UserAvatarMenu />
      </div>
    </header>
  );
}
