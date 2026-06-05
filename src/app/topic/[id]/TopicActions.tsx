'use client';

import { Bot, Check, MessageSquare, Share2, Trash2 } from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';
import { BookmarkButton } from '@/components/BookmarkButton';

interface TopicActionsProps {
  shareCopied: boolean;
  onShare: () => void;
  onBriefAgent: () => void;
  discussionOpen: boolean;
  onToggleDiscussion: () => void;
  isOwner: boolean;
  onDelete: () => void;
  bookmarked?: boolean;
  onToggleBookmark?: () => void;
  bookmarkToggleInFlight?: boolean;
}

export function TopicActions({
  shareCopied,
  onShare,
  onBriefAgent,
  discussionOpen,
  onToggleDiscussion,
  isOwner,
  onDelete,
  bookmarked,
  onToggleBookmark,
  bookmarkToggleInFlight,
}: TopicActionsProps) {
  const { theme } = useTheme();
  return (
    <>
      {onToggleBookmark && (
        <BookmarkButton
          bookmarked={!!bookmarked}
          onClick={onToggleBookmark}
          disabled={bookmarkToggleInFlight}
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
    </>
  );
}
