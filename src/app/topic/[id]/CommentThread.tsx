'use client';

/**
 * CommentThread — the flat discussion attached to a topic.
 *
 * Reads `/api/topics/by-id/{id}/comments` on mount and refreshes on window
 * focus (v1 polling story; no websockets). Mutations PATCH/POST/DELETE the
 * matching routes and update the local list optimistically.
 *
 * The composer surface depends on the viewer:
 *   - signed-in: textarea + Post button.
 *   - signed-out: a "Sign in with GitHub to join the discussion" CTA — no
 *     textarea, so a user never types a comment they can't submit.
 *
 * Per-row mutate controls live inside CommentItem; the thread decides
 * `canEdit` (author only) and `canDelete` (author or topic owner — the
 * curator's moderation hook) and passes both down so the row stays purely
 * visual.
 */

import { MessageSquare, Send } from 'lucide-react';
import { InlineTrailLoader } from '@/components/trail/InlineTrailLoader';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { useAuth, type User } from '@/contexts/AuthContext';
import { MAX_COMMENT_CHARS } from '@/lib/topics/constants';
import { TopicErrorCodes, type TopicComment } from '@/lib/topics/types';
import { CommentItem } from './CommentItem';

interface CommentThreadProps {
  topicId: string;
  topicOwnerGithubId: number;
}

interface ListResponse {
  topicId: string;
  updatedAt: string;
  comments: TopicComment[];
}

export function CommentThread({
  topicId,
  topicOwnerGithubId,
}: CommentThreadProps) {
  const { theme } = useTheme();
  const { user, isAuthenticated, login } = useAuth();

  const [comments, setComments] = useState<TopicComment[]>([]);
  const [loadState, setLoadState] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');
  const [loadError, setLoadError] = useState<string | null>(null);

  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  // Avoid stomping an in-flight reload with a stale focus-triggered fetch.
  const reloadTokenRef = useRef(0);

  const sortedComments = useMemo(
    () =>
      [...comments].sort((a, b) =>
        a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
      ),
    [comments],
  );

  const loadComments = useCallback(async () => {
    const token = ++reloadTokenRef.current;
    setLoadState((prev) => (prev === 'ready' ? 'ready' : 'loading'));
    try {
      const res = await fetch(`/api/topics/by-id/${topicId}/comments`);
      const body = (await res.json().catch(() => ({}))) as
        | (ListResponse & { error?: string })
        | { error?: string };
      if (token !== reloadTokenRef.current) return;
      if (!res.ok) {
        setLoadError(
          (body as { error?: string })?.error ||
            `Failed to load comments (${res.status})`,
        );
        setLoadState('error');
        return;
      }
      setComments((body as ListResponse).comments ?? []);
      setLoadError(null);
      setLoadState('ready');
    } catch (err) {
      if (token !== reloadTokenRef.current) return;
      setLoadError(
        err instanceof Error ? err.message : 'Failed to load comments',
      );
      setLoadState('error');
    }
  }, [topicId]);

  useEffect(() => {
    void loadComments();
  }, [loadComments]);

  useEffect(() => {
    const onFocus = () => {
      void loadComments();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadComments]);

  const handlePost = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (trimmed.length > MAX_COMMENT_CHARS) {
      setPostError(`Comment exceeds ${MAX_COMMENT_CHARS} characters`);
      return;
    }
    setPosting(true);
    setPostError(null);
    try {
      const res = await fetch(`/api/topics/by-id/${topicId}/comments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: trimmed }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        comment?: TopicComment;
        error?: string;
        code?: string;
      };
      if (!res.ok) {
        if (body?.code === TopicErrorCodes.NOT_AUTHENTICATED) {
          setPostError('Sign in with GitHub to post a comment.');
        } else {
          setPostError(body?.error || `Failed to post (${res.status})`);
        }
        return;
      }
      if (body.comment) {
        setComments((prev) => [...prev, body.comment as TopicComment]);
      }
      setDraft('');
    } catch (err) {
      setPostError(
        err instanceof Error ? err.message : 'Failed to post comment',
      );
    } finally {
      setPosting(false);
    }
  }, [draft, topicId]);

  const handleSaveEdit = useCallback(
    async (commentId: string, nextBody: string) => {
      const res = await fetch(
        `/api/topics/by-id/${topicId}/comments/${commentId}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ body: nextBody }),
        },
      );
      const body = (await res.json().catch(() => ({}))) as {
        comment?: TopicComment;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(body?.error || `Failed to save (${res.status})`);
      }
      if (body.comment) {
        const updated = body.comment;
        setComments((prev) =>
          prev.map((c) => (c.id === commentId ? updated : c)),
        );
      }
    },
    [topicId],
  );

  const handleDelete = useCallback(
    async (commentId: string) => {
      const res = await fetch(
        `/api/topics/by-id/${topicId}/comments/${commentId}`,
        { method: 'DELETE' },
      );
      if (!res.ok && res.status !== 204) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body?.error || `Failed to delete (${res.status})`);
      }
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    },
    [topicId],
  );

  const isTopicOwner =
    !!user && user.id === topicOwnerGithubId;

  return (
    <section
      className="mt-6 rounded-lg border p-4"
      style={{
        background:
          theme.colors.backgroundSecondary ?? theme.colors.background,
        borderColor: theme.colors.border,
      }}
    >
      <header className="flex items-center gap-2 mb-3">
        <MessageSquare
          className="w-4 h-4"
          style={{ color: theme.colors.textMuted }}
        />
        <h2
          className="text-sm font-semibold uppercase tracking-wide"
          style={{ color: theme.colors.textMuted }}
        >
          Discussion
        </h2>
        {loadState === 'ready' && (
          <span
            className="text-xs"
            style={{ color: theme.colors.textMuted }}
          >
            ({comments.length})
          </span>
        )}
      </header>

      {loadState === 'loading' && comments.length === 0 && (
        <div
          className="flex items-center gap-2 text-sm py-4"
          style={{ color: theme.colors.textMuted }}
        >
          <InlineTrailLoader size={14} />
          Loading comments…
        </div>
      )}

      {loadState === 'error' && (
        <div
          className="text-sm py-2"
          style={{ color: theme.colors.error }}
        >
          {loadError}
        </div>
      )}

      {loadState !== 'loading' && comments.length === 0 && (
        <p
          className="text-sm italic py-2"
          style={{ color: theme.colors.textMuted }}
        >
          No comments yet — start the discussion.
        </p>
      )}

      {sortedComments.length > 0 && (
        <ul className="space-y-3">
          {sortedComments.map((c) => (
            <CommentItem
              key={c.id}
              comment={c}
              canEdit={canEditComment(user, c)}
              canDelete={canDeleteComment(user, c, isTopicOwner)}
              onSaveEdit={handleSaveEdit}
              onDelete={handleDelete}
            />
          ))}
        </ul>
      )}

      <div
        className="mt-4 pt-4"
        style={{ borderTop: `1px solid ${theme.colors.border}` }}
      >
        {isAuthenticated && user ? (
          <Composer
            draft={draft}
            setDraft={setDraft}
            posting={posting}
            postError={postError}
            onPost={handlePost}
          />
        ) : (
          <button
            type="button"
            onClick={() => login(window.location.pathname)}
            className="inline-flex items-center gap-2 px-3 h-9 rounded-md text-sm font-medium"
            style={{
              background: theme.colors.primary,
              color: theme.colors.background,
              border: `1px solid ${theme.colors.primary}`,
            }}
          >
            Sign in with GitHub to join the discussion
          </button>
        )}
      </div>
    </section>
  );
}

function canEditComment(user: User | null, comment: TopicComment): boolean {
  if (!user) return false;
  return user.id === comment.author.githubId;
}

function canDeleteComment(
  user: User | null,
  comment: TopicComment,
  isTopicOwner: boolean,
): boolean {
  if (!user) return false;
  if (isTopicOwner) return true;
  return user.id === comment.author.githubId;
}

interface ComposerProps {
  draft: string;
  setDraft: (next: string) => void;
  posting: boolean;
  postError: string | null;
  onPost: () => void;
}

function Composer({
  draft,
  setDraft,
  posting,
  postError,
  onPost,
}: ComposerProps) {
  const { theme } = useTheme();
  const over = draft.length > MAX_COMMENT_CHARS;

  return (
    <div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Add to the discussion…"
        rows={3}
        className="w-full px-3 py-2 rounded-md outline-none resize-y text-sm"
        style={{
          background: theme.colors.background,
          color: theme.colors.text,
          border: `1px solid ${over ? theme.colors.error : theme.colors.border}`,
          fontFamily: theme.fonts.body,
        }}
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={onPost}
          disabled={posting || !draft.trim() || over}
          className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-sm font-medium disabled:opacity-50"
          style={{
            background: theme.colors.primary,
            color: theme.colors.background,
            border: `1px solid ${theme.colors.primary}`,
          }}
        >
          {posting ? (
            <InlineTrailLoader size={14} />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
          {posting ? 'Posting…' : 'Post'}
        </button>
        <span
          className="ml-auto text-xs"
          style={{
            color: over ? theme.colors.error : theme.colors.textMuted,
          }}
        >
          {draft.length} / {MAX_COMMENT_CHARS}
        </span>
      </div>
      {postError && (
        <p
          className="mt-2 text-xs"
          style={{ color: theme.colors.error }}
        >
          {postError}
        </p>
      )}
    </div>
  );
}
