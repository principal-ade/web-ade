'use client';

/**
 * CommentItem — one row in the topic comment thread.
 *
 * Renders avatar + login + relative timestamp + markdown body. Edit is
 * author-only; Delete is available to the author or the topic owner (the
 * curator's moderation hook). Mutations are driven from props so the
 * parent thread keeps the optimistic list state in one place.
 */

import { Pencil, Save, Trash2, X } from 'lucide-react';
import { InlineTrailLoader } from '@/components/trail/InlineTrailLoader';
import { useState } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { IndustryMarkdownSlide } from 'themed-markdown';
import { MAX_COMMENT_CHARS } from '@/lib/topics/constants';
import type { TopicComment } from '@/lib/topics/types';

interface CommentItemProps {
  comment: TopicComment;
  canEdit: boolean;
  canDelete: boolean;
  onSaveEdit: (commentId: string, body: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
}

export function CommentItem({
  comment,
  canEdit,
  canDelete,
  onSaveEdit,
  onDelete,
}: CommentItemProps) {
  const { theme } = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [busy, setBusy] = useState<'idle' | 'saving' | 'deleting'>('idle');
  const [error, setError] = useState<string | null>(null);

  const startEdit = () => {
    setDraft(comment.body);
    setError(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft(comment.body);
    setError(null);
  };

  const saveEdit = async () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      setError('Comment cannot be empty');
      return;
    }
    if (trimmed.length > MAX_COMMENT_CHARS) {
      setError(`Comment exceeds ${MAX_COMMENT_CHARS} characters`);
      return;
    }
    setBusy('saving');
    setError(null);
    try {
      await onSaveEdit(comment.id, trimmed);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setBusy('idle');
    }
  };

  const handleDelete = async () => {
    const ok = window.confirm('Delete this comment? This cannot be undone.');
    if (!ok) return;
    setBusy('deleting');
    setError(null);
    try {
      await onDelete(comment.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
      setBusy('idle');
    }
  };

  const edited = comment.updatedAt !== comment.createdAt;

  return (
    <li
      className="rounded-lg border p-4"
      style={{
        background:
          theme.colors.backgroundSecondary ?? theme.colors.background,
        borderColor: theme.colors.border,
      }}
    >
      <header className="flex items-start gap-3">
        <a
          href={`https://github.com/${comment.author.githubLogin}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0"
          title={comment.author.githubLogin}
        >
          <img
            src={`https://avatars.githubusercontent.com/u/${comment.author.githubId}?v=4`}
            alt=""
            width={32}
            height={32}
            className="rounded-full"
            style={{ border: `1px solid ${theme.colors.border}` }}
          />
        </a>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <div
              className="text-sm font-medium truncate"
              style={{ color: theme.colors.text }}
            >
              @{comment.author.githubLogin}
            </div>
            <div
              className="text-xs whitespace-nowrap"
              style={{ color: theme.colors.textMuted }}
              title={new Date(comment.createdAt).toLocaleString()}
            >
              {formatRelativeTime(comment.createdAt)}
              {edited ? ' · edited' : ''}
            </div>
          </div>
        </div>

        {!editing && (canEdit || canDelete) && (
          <div className="flex items-center gap-1 flex-shrink-0">
            {canEdit && (
              <button
                type="button"
                onClick={startEdit}
                className="inline-flex items-center justify-center w-7 h-7 rounded-md transition-opacity hover:opacity-80"
                style={{
                  color: theme.colors.textMuted,
                  border: `1px solid ${theme.colors.border}`,
                  background: 'transparent',
                }}
                aria-label="Edit comment"
                title="Edit"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={busy === 'deleting'}
                className="inline-flex items-center justify-center w-7 h-7 rounded-md transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{
                  color: theme.colors.textMuted,
                  border: `1px solid ${theme.colors.border}`,
                  background: 'transparent',
                }}
                aria-label="Delete comment"
                title="Delete"
              >
                {busy === 'deleting' ? (
                  <InlineTrailLoader size={14} />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>
        )}
      </header>

      {editing ? (
        <div className="mt-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 rounded-md outline-none resize-y text-sm"
            style={{
              background: theme.colors.background,
              color: theme.colors.text,
              border: `1px solid ${theme.colors.border}`,
              fontFamily: theme.fonts.body,
            }}
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={saveEdit}
              disabled={busy === 'saving' || !draft.trim()}
              className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-sm font-medium disabled:opacity-50"
              style={{
                background: theme.colors.primary,
                color: theme.colors.background,
                border: `1px solid ${theme.colors.primary}`,
              }}
            >
              {busy === 'saving' ? (
                <InlineTrailLoader size={14} />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              {busy === 'saving' ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              disabled={busy === 'saving'}
              className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-sm disabled:opacity-50"
              style={{
                background: 'transparent',
                color: theme.colors.text,
                border: `1px solid ${theme.colors.border}`,
              }}
            >
              <X className="w-3.5 h-3.5" />
              Cancel
            </button>
            <span
              className="ml-auto text-xs"
              style={{ color: theme.colors.textMuted }}
            >
              {draft.length} / {MAX_COMMENT_CHARS}
            </span>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <IndustryMarkdownSlide
            content={comment.body}
            theme={theme}
            slideIdPrefix={`topic-${comment.topicId}-comment-${comment.id}`}
            slideIndex={0}
            transparentBackground
            disableBasePadding={{ horizontal: true }}
          />
        </div>
      )}

      {error && (
        <p
          className="mt-2 text-xs"
          style={{ color: theme.colors.error }}
        >
          {error}
        </p>
      )}
    </li>
  );
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 45) return 'just now';
  if (seconds < 90) return '1 min ago';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  // Past a week — fall back to a date.
  return new Date(iso).toLocaleDateString();
}
