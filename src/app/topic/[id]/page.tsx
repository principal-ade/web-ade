'use client';

/**
 * Topic page — viewer + owner controls for a curated collection of trails.
 *
 * Topics curate trails (typically across multiple repos) that discuss the
 * same conceptual problem from different angles. Reads are public-by-link;
 * mutations are gated to the topic's owner.
 *
 * The page resolves the topic via /api/topics/by-id/{id}, then fetches each
 * embedded trail's summary via /api/trails/by-id/{id}. Notes/sign-offs on
 * each trail stay on /trail/{id} — this page is a thin curated index.
 */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';
import { IndustryMarkdownSlide } from 'themed-markdown';
import { useAuth } from '@/contexts/AuthContext';
import { TrailHeaderLite } from './TrailHeaderLite';
import {
  TopicErrorCodes,
  type TopicErrorCode,
  type TopicPayload,
} from '@/lib/topics/types';
import { extractTrailId } from '@/lib/topics/validation';
import {
  ShareErrorCodes,
  type ShareErrorCode,
  type SharedTrailIndexEntry,
} from '@/lib/trails/types';

interface TrailFetchResult {
  state: 'loading' | 'ok' | 'error';
  entry?: SharedTrailIndexEntry;
  owner?: string;
  repo?: string;
  errorMessage?: string;
  errorCode?: ShareErrorCode | null;
}

interface CuratorProfile {
  login: string;
  id: number;
  name: string | null;
  avatar_url: string;
}

const COPY_FEEDBACK_MS = 1500;

export default function TopicPage() {
  const { theme } = useTheme();
  const params = useParams<{ id: string }>();
  const topicId = params.id;
  const { user } = useAuth();

  const [topic, setTopic] = useState<TopicPayload | null>(null);
  const [loadState, setLoadState] = useState<
    | { kind: 'loading' }
    | { kind: 'ok' }
    | { kind: 'error'; message: string; code: TopicErrorCode | null }
  >({ kind: 'loading' });
  const [trailResults, setTrailResults] = useState<
    Record<string, TrailFetchResult>
  >({});

  const [isOwnerEditingHeader, setOwnerEditingHeader] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [savingHeader, setSavingHeader] = useState(false);

  const [addTrailInput, setAddTrailInput] = useState('');
  const [addingTrail, setAddingTrail] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [shareCopied, setShareCopied] = useState(false);

  const [curator, setCurator] = useState<CuratorProfile | null>(null);

  const isOwner = !!user && !!topic && topic.createdBy.githubId === user.id;

  // ---- Load topic ---------------------------------------------------------

  useEffect(() => {
    if (!topicId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/topics/by-id/${topicId}`);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (cancelled) return;
          setLoadState({
            kind: 'error',
            message: body?.error || `Failed to load topic (${res.status})`,
            code: (body?.code as TopicErrorCode | undefined) ?? null,
          });
          return;
        }
        if (cancelled) return;
        const t = body.topic as TopicPayload;
        setTopic(t);
        setDraftTitle(t.title);
        setDraftDescription(t.description);
        setLoadState({ kind: 'ok' });
      } catch (err) {
        if (cancelled) return;
        setLoadState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Failed to load topic',
          code: null,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [topicId]);

  // ---- Load each trail summary -------------------------------------------

  useEffect(() => {
    if (!topic) return;
    const idsToLoad = topic.trailIds.filter((tid) => !(tid in trailResults));
    if (idsToLoad.length === 0) return;
    setTrailResults((prev) => {
      const next = { ...prev };
      for (const tid of idsToLoad) next[tid] = { state: 'loading' };
      return next;
    });
    for (const tid of idsToLoad) {
      (async () => {
        try {
          const res = await fetch(`/api/trails/by-id/${tid}`);
          const body = await res.json().catch(() => ({}));
          if (!res.ok) {
            setTrailResults((prev) => ({
              ...prev,
              [tid]: {
                state: 'error',
                errorMessage:
                  body?.error || `Failed to load trail (${res.status})`,
                errorCode: (body?.code as ShareErrorCode | undefined) ?? null,
              },
            }));
            return;
          }
          setTrailResults((prev) => ({
            ...prev,
            [tid]: {
              state: 'ok',
              entry: body.entry as SharedTrailIndexEntry,
              owner: body.owner,
              repo: body.repo,
            },
          }));
        } catch (err) {
          setTrailResults((prev) => ({
            ...prev,
            [tid]: {
              state: 'error',
              errorMessage:
                err instanceof Error ? err.message : 'Failed to load trail',
              errorCode: null,
            },
          }));
        }
      })();
    }
  }, [topic, trailResults]);

  // ---- Load curator profile (avatar + display name) ----------------------

  useEffect(() => {
    if (!topic) return;
    const login = topic.createdBy.githubLogin;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/github/user-profile/${login}`);
        if (!res.ok) return;
        const profile = (await res.json()) as CuratorProfile;
        if (!cancelled) setCurator(profile);
      } catch {
        // Non-critical — fall back to login.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [topic]);

  // ---- Owner mutations ----------------------------------------------------

  const handleSaveHeader = useCallback(async () => {
    if (!topic) return;
    setSavingHeader(true);
    try {
      const res = await fetch(`/api/topics/by-id/${topic.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: draftTitle,
          description: draftDescription,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAddError(body?.error || `Failed to save (${res.status})`);
        return;
      }
      setTopic(body.topic as TopicPayload);
      setOwnerEditingHeader(false);
    } finally {
      setSavingHeader(false);
    }
  }, [topic, draftTitle, draftDescription]);

  const handleAddTrail = useCallback(async () => {
    if (!topic) return;
    const trailId = extractTrailId(addTrailInput);
    if (!trailId) {
      setAddError('Paste a trail URL or id (e.g. /trail/<uuid>)');
      return;
    }
    setAddingTrail(true);
    setAddError(null);
    try {
      const res = await fetch(`/api/topics/by-id/${topic.id}/trails`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ trailId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAddError(body?.error || `Failed to add trail (${res.status})`);
        return;
      }
      setTopic(body.topic as TopicPayload);
      setAddTrailInput('');
    } finally {
      setAddingTrail(false);
    }
  }, [topic, addTrailInput]);

  const handleRemoveTrail = useCallback(
    async (trailId: string) => {
      if (!topic) return;
      const res = await fetch(
        `/api/topics/by-id/${topic.id}/trails/${trailId}`,
        { method: 'DELETE' },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAddError(body?.error || `Failed to remove trail (${res.status})`);
        return;
      }
      setTopic(body.topic as TopicPayload);
    },
    [topic],
  );

  const handleDeleteTopic = useCallback(async () => {
    if (!topic) return;
    const ok = window.confirm(
      `Delete topic "${topic.title}"? This cannot be undone.`,
    );
    if (!ok) return;
    const res = await fetch(`/api/topics/by-id/${topic.id}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      window.location.href = '/';
    }
  }, [topic]);

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/topic/${topicId}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), COPY_FEEDBACK_MS);
    } catch {
      // clipboard denied — fail quietly
    }
  }, [topicId]);

  // ---- Render -------------------------------------------------------------

  if (loadState.kind === 'loading') {
    return (
      <div
        className="w-screen flex items-center justify-center"
        style={{ background: theme.colors.background, height: '100vh' }}
      >
        <Loader2
          className="animate-spin"
          size={28}
          style={{ color: theme.colors.textMuted }}
        />
      </div>
    );
  }

  if (loadState.kind === 'error') {
    return (
      <div
        className="w-screen flex items-center justify-center px-4"
        style={{ background: theme.colors.background, height: '100vh' }}
      >
        <div
          className="w-full max-w-md rounded-lg border px-8 py-10 text-center"
          style={{
            background:
              theme.colors.backgroundSecondary ?? theme.colors.background,
            borderColor: theme.colors.border,
            color: theme.colors.text,
          }}
        >
          <h1 className="text-xl font-semibold mb-2">
            {loadState.code === TopicErrorCodes.NOT_FOUND
              ? 'Topic not found'
              : 'Topic unavailable'}
          </h1>
          <p
            className="text-sm"
            style={{ color: theme.colors.textMuted }}
          >
            {loadState.message}
          </p>
          <Link
            href="/"
            className="inline-block mt-6 text-sm underline-offset-2 hover:underline"
            style={{ color: theme.colors.textMuted }}
          >
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  if (!topic) return null;

  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{ background: theme.colors.background, color: theme.colors.text }}
    >
      <TrailHeaderLite
        topicId={topicId}
        shareCopied={shareCopied}
        onShare={handleShare}
        isOwner={isOwner}
        onDelete={handleDeleteTopic}
      />

      <div className="flex-1 overflow-y-auto lg:overflow-hidden">
        <main className="px-4 md:px-8 pt-4 pb-8 w-full lg:h-full lg:grid lg:grid-cols-2 lg:gap-10 lg:pb-0">
        <div className="lg:h-full lg:flex lg:flex-col lg:overflow-hidden">
        {/* Header block: title + description, with owner edit toggle */}
        {isOwnerEditingHeader ? (
          <div
            className="rounded-lg border p-4 mb-8 lg:mb-0 lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:pb-8 lg:pr-2"
            style={{
              background:
                theme.colors.backgroundSecondary ?? theme.colors.background,
              borderColor: theme.colors.border,
            }}
          >
            <label
              className="block text-xs uppercase tracking-wide mb-1"
              style={{ color: theme.colors.textMuted }}
            >
              Title
            </label>
            <input
              type="text"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              className="w-full mb-4 px-3 py-2 rounded-md outline-none"
              style={{
                background: theme.colors.background,
                color: theme.colors.text,
                border: `1px solid ${theme.colors.border}`,
              }}
            />
            <label
              className="block text-xs uppercase tracking-wide mb-1"
              style={{ color: theme.colors.textMuted }}
            >
              Description
            </label>
            <textarea
              value={draftDescription}
              onChange={(e) => setDraftDescription(e.target.value)}
              rows={6}
              className="w-full mb-4 px-3 py-2 rounded-md outline-none resize-y"
              style={{
                background: theme.colors.background,
                color: theme.colors.text,
                border: `1px solid ${theme.colors.border}`,
                fontFamily: theme.fonts.body,
              }}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSaveHeader}
                disabled={savingHeader || !draftTitle.trim()}
                className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-sm font-medium disabled:opacity-50"
                style={{
                  background: theme.colors.primary,
                  color: theme.colors.background,
                  border: `1px solid ${theme.colors.primary}`,
                }}
              >
                <Save className="w-4 h-4" />
                {savingHeader ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOwnerEditingHeader(false);
                  setDraftTitle(topic.title);
                  setDraftDescription(topic.description);
                }}
                className="inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-sm"
                style={{
                  background: 'transparent',
                  color: theme.colors.text,
                  border: `1px solid ${theme.colors.border}`,
                }}
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="mb-8 lg:mb-0 lg:flex-1 lg:flex lg:flex-col lg:min-h-0">
            <div className="flex items-start justify-between gap-4">
              <h1
                className="text-3xl font-bold leading-tight"
                style={{ color: theme.colors.primary }}
              >
                {topic.title}
              </h1>
              {isOwner && (
                <button
                  type="button"
                  onClick={() => setOwnerEditingHeader(true)}
                  className="text-sm underline-offset-2 hover:underline"
                  style={{ color: theme.colors.textMuted }}
                >
                  Edit
                </button>
              )}
            </div>
            <div
              className="mt-3 flex items-center gap-2 text-sm"
              style={{ color: theme.colors.textMuted }}
            >
              <span>by</span>
              <a
                href={`https://github.com/${topic.createdBy.githubLogin}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 hover:underline"
              >
                <img
                  src={
                    curator?.avatar_url ??
                    `https://avatars.githubusercontent.com/u/${topic.createdBy.githubId}?v=4`
                  }
                  alt=""
                  width={32}
                  height={32}
                  className="rounded-full"
                  style={{ border: `1px solid ${theme.colors.border}` }}
                />
                <span
                  className="font-medium"
                  style={{ color: theme.colors.text }}
                >
                  {curator?.name || `@${topic.createdBy.githubLogin}`}
                </span>
              </a>
            </div>
            {topic.description && (
              <div className="mt-3 lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:pb-8 lg:pr-2">
                <IndustryMarkdownSlide
                  content={topic.description}
                  theme={theme}
                  slideIdPrefix={`topic-${topic.id}-description`}
                  slideIndex={0}
                  transparentBackground
                  disableScroll
                  disableBasePadding
                />
              </div>
            )}
          </div>
        )}
        </div>

        <div className="lg:h-full lg:overflow-y-auto lg:pb-8">
        {/* Trail list */}
        <ol className="space-y-3">
          {topic.trailIds.map((tid) => (
            <TrailCard
              key={tid}
              trailId={tid}
              result={trailResults[tid]}
              isOwner={isOwner}
              onRemove={() => handleRemoveTrail(tid)}
            />
          ))}
        </ol>

        {topic.trailIds.length === 0 && !isOwner && (
          <p
            className="text-sm italic"
            style={{ color: theme.colors.textMuted }}
          >
            No trails attached yet.
          </p>
        )}

        {isOwner && (
          <div
            className="mt-6 rounded-lg border p-4"
            style={{
              background:
                theme.colors.backgroundSecondary ?? theme.colors.background,
              borderColor: theme.colors.border,
            }}
          >
            <label
              className="block text-xs uppercase tracking-wide mb-1"
              style={{ color: theme.colors.textMuted }}
            >
              Add a trail
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={addTrailInput}
                placeholder="Paste a /trail/<id> URL or id"
                onChange={(e) => {
                  setAddTrailInput(e.target.value);
                  if (addError) setAddError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleAddTrail();
                  }
                }}
                className="flex-1 px-3 py-2 rounded-md outline-none text-sm"
                style={{
                  background: theme.colors.background,
                  color: theme.colors.text,
                  border: `1px solid ${theme.colors.border}`,
                }}
              />
              <button
                type="button"
                onClick={handleAddTrail}
                disabled={addingTrail || !addTrailInput.trim()}
                className="inline-flex items-center gap-1.5 px-3 h-9 rounded-md text-sm font-medium disabled:opacity-50"
                style={{
                  background: theme.colors.primary,
                  color: theme.colors.background,
                  border: `1px solid ${theme.colors.primary}`,
                }}
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </div>
            {addError && (
              <p
                className="mt-2 text-xs"
                style={{ color: theme.colors.error }}
              >
                {addError}
              </p>
            )}
          </div>
        )}
        </div>
        </main>
      </div>
    </div>
  );
}

interface TrailCardProps {
  trailId: string;
  result: TrailFetchResult | undefined;
  isOwner: boolean;
  onRemove: () => void;
}

function TrailCard({
  trailId,
  result,
  isOwner,
  onRemove,
}: TrailCardProps) {
  const { theme } = useTheme();
  const state = result?.state ?? 'loading';
  const repoOwner = result?.owner;

  return (
    <li
      className="rounded-lg border overflow-hidden"
      style={{
        background:
          theme.colors.backgroundSecondary ?? theme.colors.background,
        borderColor: theme.colors.border,
      }}
    >
      <div className="flex items-start gap-3 p-4">
        {repoOwner ? (
          <a
            href={`https://github.com/${repoOwner}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0"
            title={repoOwner}
          >
            <img
              src={`https://github.com/${repoOwner}.png?size=96`}
              alt={repoOwner}
              width={48}
              height={48}
              className="w-12 h-12 rounded-full"
              style={{ border: `1px solid ${theme.colors.border}` }}
            />
          </a>
        ) : (
          <span
            className="flex-shrink-0 w-12 h-12 rounded-full"
            style={{
              background: theme.colors.background,
              border: `1px solid ${theme.colors.border}`,
            }}
          />
        )}

        <div className="flex-1 min-w-0">
          {state === 'loading' && (
            <div
              className="flex items-center gap-2 text-sm"
              style={{ color: theme.colors.textMuted }}
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading trail…
            </div>
          )}

          {state === 'ok' && result?.entry && (
            <>
              <Link
                href={`/trail/${trailId}`}
                className="text-base font-semibold hover:underline"
                style={{ color: theme.colors.text }}
              >
                {result.entry.title}
              </Link>
              {result.repo && (
                <div
                  className="mt-1 text-xs"
                  style={{ color: theme.colors.textMuted }}
                >
                  {result.repo}
                </div>
              )}
            </>
          )}

          {state === 'error' && (
            <div className="text-sm">
              <div style={{ color: theme.colors.text }}>
                Trail{' '}
                <code
                  className="px-1 rounded text-xs"
                  style={{ background: theme.colors.background }}
                >
                  {trailId.slice(0, 8)}…
                </code>{' '}
                {result?.errorCode === ShareErrorCodes.NO_REPO_ACCESS
                  ? 'is in a private repository'
                  : 'unavailable'}
              </div>
              <div
                className="mt-1 text-xs"
                style={{ color: theme.colors.textMuted }}
              >
                {result?.errorMessage}
              </div>
            </div>
          )}
        </div>

        {isOwner && (
          <button
            type="button"
            onClick={onRemove}
            className="flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-md transition-opacity hover:opacity-80"
            style={{
              color: theme.colors.textMuted,
              border: `1px solid ${theme.colors.border}`,
              background: 'transparent',
            }}
            aria-label="Remove trail from topic"
            title="Remove trail"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </li>
  );
}
