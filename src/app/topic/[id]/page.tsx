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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Footprints, Github, Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';
import { IndustryMarkdownSlide } from 'themed-markdown';
import { useAuth } from '@/contexts/AuthContext';
import { TrailLoadingAnimation } from '@/components/trail/TrailLoadingAnimation';
import { CommentThread } from './CommentThread';
import { SuggestionsPanel, type TopicTrailMeta } from './SuggestionsPanel';
import {
  SuggestTrailDialog,
  type ContributeMode,
} from './SuggestTrailDialog';
import { SuggestProjectDialog } from './SuggestProjectDialog';
import { TopicActions } from './TopicActions';
import { TrailHeaderLite } from './TrailHeaderLite';
import { TrailSequencePreview } from '@/components/topic/TrailSequencePreview';
import { TrailViewer, useTrailSession } from '@/components/trail/TrailViewer';
import { TrailHeader } from '@/components/trail/TrailHeader';
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

// Sentinel key for the "+" card in the repo cards row — selecting it
// reveals the contribute / suggest options inline like a repo expansion.
const ADD_CARD_KEY = '__add__';

// Duration of the trail sheet slide-up/down animation. Shared between
// the CSS keyframes and the unmount timeout so the WebGL viewer stays
// mounted for the full transition.
const TRAIL_SHEET_ANIM_MS = 480;

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
  // Bumped to force a topic refetch after an accepted suggestion appends a
  // new trail to `trailIds`. The trail-load effect picks up the new id on
  // its own once the topic state updates.
  const [topicReloadKey, setTopicReloadKey] = useState(0);
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
  const [discussionOpen, setDiscussionOpen] = useState(false);
  const [starred, setStarred] = useState(false);
  const [starInFlight, setStarInFlight] = useState(false);
  // Transient header status — e.g. "Sign in to star this topic." after an
  // anonymous click. Auto-clears so the slot returns to empty.
  const [headerStatus, setHeaderStatus] = useState<string | null>(null);
  useEffect(() => {
    if (!headerStatus) return;
    const t = window.setTimeout(() => setHeaderStatus(null), 6000);
    return () => window.clearTimeout(t);
  }, [headerStatus]);
  const [contributeMode, setContributeMode] = useState<ContributeMode | null>(
    null,
  );
  const [suggestProjectOpen, setSuggestProjectOpen] = useState(false);
  // Bumped after a project suggestion is created so the SuggestionsPanel
  // refetches and the new row appears immediately for the owner.
  const [suggestionsReloadKey, setSuggestionsReloadKey] = useState(0);

  const [curator, setCurator] = useState<CuratorProfile | null>(null);

  // Which repo card is currently expanded in the center column. Trails for
  // that repo render inline beneath the cards row.
  const [selectedRepoKey, setSelectedRepoKey] = useState<string | null>(null);
  // When a trail card inside the repo expansion is clicked, we surface
  // the TrailViewer. On lg+ it docks into the right grid column inline;
  // below lg it opens as a slide-up sheet over the body. `trailOverlayClosing`
  // is only used on the sheet — it delays unmount so the close animation
  // can play out before the WebGL panel is torn down.
  const [selectedTrailId, setSelectedTrailId] = useState<string | null>(null);
  const [trailOverlayClosing, setTrailOverlayClosing] = useState(false);

  // Tailwind's lg breakpoint is 1024px. Mirroring it here lets us pick
  // the right placement (right column vs sheet) and skip the slide
  // animation on desktop where it doesn't fit the surface.
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const closeTrailOverlay = useCallback(() => {
    if (isDesktop) {
      setSelectedTrailId(null);
      return;
    }
    setTrailOverlayClosing(true);
    window.setTimeout(() => {
      setSelectedTrailId(null);
      setTrailOverlayClosing(false);
    }, TRAIL_SHEET_ANIM_MS);
  }, [isDesktop]);

  // Opening a different trail mid-animation would leave the closing
  // state stuck on. Clear it whenever a fresh trail is chosen.
  const openTrailOverlay = useCallback((trailId: string) => {
    setTrailOverlayClosing(false);
    setSelectedTrailId(trailId);
  }, []);

  const isOwner = !!user && !!topic && topic.createdBy.githubId === user.id;

  /**
   * Repo identity for every trail on the topic, derived from the already-
   * fetched trail summaries. Fed to SuggestionsPanel so project-suggestion
   * rows can count matching trails without re-fetching.
   */
  const topicTrails: TopicTrailMeta[] = useMemo(() => {
    if (!topic) return [];
    return topic.trailIds.map((tid) => {
      const r = trailResults[tid];
      return {
        trailId: tid,
        owner: r?.owner,
        repo: r?.repo,
        title: r?.entry?.title,
      };
    });
  }, [topic, trailResults]);

  /**
   * Group trails by `owner/repo`. Each group renders as a single repo card
   * in the center column; clicking the card reveals the trails belonging to
   * that repo. Trails still loading are skipped — they'll surface as cards
   * once their summary fetch lands.
   */
  const repoGroups = useMemo(() => {
    if (!topic) return [] as Array<{
      key: string;
      owner: string;
      repo: string;
      trailIds: string[];
    }>;
    const map = new Map<
      string,
      { key: string; owner: string; repo: string; trailIds: string[] }
    >();
    for (const tid of topic.trailIds) {
      const r = trailResults[tid];
      if (!r?.owner || !r?.repo) continue;
      const key = `${r.owner}/${r.repo}`;
      let group = map.get(key);
      if (!group) {
        group = { key, owner: r.owner, repo: r.repo, trailIds: [] };
        map.set(key, group);
      }
      group.trailIds.push(tid);
    }
    return Array.from(map.values());
  }, [topic, trailResults]);

  // If the selected repo disappears (e.g. its last trail was removed),
  // collapse the expansion so we don't render against a stale key. The
  // sentinel "+" card is exempt — it doesn't correspond to a repo group.
  useEffect(() => {
    if (!selectedRepoKey || selectedRepoKey === ADD_CARD_KEY) return;
    if (!repoGroups.some((g) => g.key === selectedRepoKey)) {
      setSelectedRepoKey(null);
    }
  }, [repoGroups, selectedRepoKey]);

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
        setStarred(Boolean(body.starred));
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
  }, [topicId, topicReloadKey]);

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

  const handleToggleStar = useCallback(() => {
    // Signed out: surface a transient prompt in the header status slot
    // instead of redirecting to OAuth. The avatar menu already exposes a
    // sign-in path; an unexpected redirect on a read-only "star"
    // interaction surprises people more than it helps.
    if (!user) {
      setHeaderStatus('Sign in to star this topic.');
      return;
    }
    if (starInFlight) return;
    const previous = starred;
    setStarred(!previous);
    setStarInFlight(true);
    void (async () => {
      try {
        const res = await fetch(`/api/topics/by-id/${topicId}/star`, {
          method: previous ? 'DELETE' : 'POST',
        });
        if (!res.ok && res.status !== 204) {
          setStarred(previous);
        }
      } catch {
        setStarred(previous);
      } finally {
        setStarInFlight(false);
      }
    })();
  }, [user, starInFlight, starred, topicId]);

  // ---- Render -------------------------------------------------------------

  if (loadState.kind === 'loading') {
    return (
      <div
        className="w-screen flex items-center justify-center overflow-hidden"
        style={{ background: theme.colors.background, height: '100vh' }}
      >
        <div style={{ width: 'min(80vmin, 600px)', height: 'min(80vmin, 600px)' }}>
          <TrailLoadingAnimation message="Loading topic" />
        </div>
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
      <style>{`
        @keyframes topicTrailSheetUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes topicTrailSheetDown {
          from { transform: translateY(0); }
          to { transform: translateY(100%); }
        }
      `}</style>

      <TrailHeaderLite
        topicId={topicId}
        shareCopied={shareCopied}
        onShare={handleShare}
        onBriefAgent={() => setContributeMode('brief')}
        discussionOpen={discussionOpen}
        onToggleDiscussion={() => setDiscussionOpen((v) => !v)}
        isOwner={isOwner}
        onDelete={handleDeleteTopic}
        starred={starred}
        onToggleStar={handleToggleStar}
        starToggleInFlight={starInFlight}
        statusMessage={headerStatus}
      />

      <SuggestTrailDialog
        topic={topic}
        trailResults={trailResults}
        mode={contributeMode}
        onClose={() => setContributeMode(null)}
      />

      <SuggestProjectDialog
        topicId={topic.id}
        open={suggestProjectOpen}
        onClose={() => setSuggestProjectOpen(false)}
        onSubmitted={() => setSuggestionsReloadKey((k) => k + 1)}
      />

      <div className="flex-1 min-h-0 relative">
        {/*
          Mobile/tablet trail sheet — slides up from below the topic
          header and covers only the body, leaving the topic chrome
          visible above it. On lg+ the viewer docks into the right grid
          column instead (see the col-start-3 sibling inside <main>),
          so this sheet is gated on !isDesktop. We delay unmount until
          the close transition finishes, otherwise the WebGL panel
          would tear down mid-animation.
        */}
        {selectedTrailId && !isDesktop && (
          <TopicTrailLayer
            trailId={selectedTrailId}
            onClose={closeTrailOverlay}
            chrome="sheet"
            closing={trailOverlayClosing}
          />
        )}
        <div className="absolute inset-0 overflow-y-auto lg:overflow-hidden">
        <main className="px-4 md:px-8 pt-4 pb-8 w-full lg:h-full lg:grid lg:grid-cols-[minmax(0,1fr)_720px_minmax(0,1fr)] lg:pb-0">
        <div className="lg:col-start-2 lg:h-full lg:flex lg:flex-col lg:overflow-hidden lg:w-full">
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
            {/*
              Mobile-only action row. The same buttons render inside
              TrailHeaderLite at md+; here they sit under the curator so
              the mobile header stays compact (brand + avatar menu only).
            */}
            <div className="mt-3 flex md:hidden items-center gap-2 flex-wrap">
              <TopicActions
                shareCopied={shareCopied}
                onShare={handleShare}
                onBriefAgent={() => setContributeMode('brief')}
                discussionOpen={discussionOpen}
                onToggleDiscussion={() => setDiscussionOpen((v) => !v)}
                isOwner={isOwner}
                onDelete={handleDeleteTopic}
                starred={starred}
                onToggleStar={handleToggleStar}
                starToggleInFlight={starInFlight}
              />
            </div>

            {/*
              Repo cards — one per unique owner/repo across the topic's
              trails. Clicking a card expands an inline trail list below.
              The trail list itself no longer lives in the left column.
            */}
            <div className="mt-5">
              <h2
                className="text-xs font-semibold uppercase tracking-wide mb-3"
                style={{ color: theme.colors.textMuted }}
              >
                Project Trails
              </h2>

              <div className="flex items-center gap-2 flex-wrap">
                {repoGroups.map((g) => {
                  const single = g.trailIds.length === 1;
                  // Visually selected when this repo's expansion is open
                  // OR when the currently-open trail belongs to this repo
                  // (true for single-trail repos that skip the expansion).
                  const selected =
                    selectedRepoKey === g.key ||
                    (selectedTrailId !== null &&
                      g.trailIds.includes(selectedTrailId));
                  return (
                    <button
                      key={g.key}
                      type="button"
                      onClick={() => {
                        if (single) {
                          // Skip the expansion — open the only trail
                          // directly. Re-clicking the same trail closes
                          // it; clicking a different repo's card swaps.
                          const only = g.trailIds[0]!;
                          setSelectedRepoKey(null);
                          if (selectedTrailId === only) {
                            closeTrailOverlay();
                          } else {
                            openTrailOverlay(only);
                          }
                          return;
                        }
                        if (selectedTrailId) closeTrailOverlay();
                        setSelectedRepoKey((prev) =>
                          prev === g.key ? null : g.key,
                        );
                      }}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all hover:opacity-90"
                      style={{
                        background: selected
                          ? theme.colors.backgroundSecondary ??
                            theme.colors.background
                          : 'transparent',
                        border: `1px solid ${selected ? theme.colors.primary : theme.colors.border}`,
                        color: theme.colors.text,
                        cursor: 'pointer',
                      }}
                      aria-pressed={selected}
                      aria-label={`Show trails for ${g.owner}/${g.repo}`}
                    >
                      <img
                        src={`https://github.com/${g.owner}.png?size=64`}
                        alt=""
                        width={28}
                        height={28}
                        className="w-7 h-7 rounded-full flex-shrink-0"
                        style={{ border: `1px solid ${theme.colors.border}` }}
                      />
                      <div className="flex flex-col items-start leading-tight">
                        <span className="text-sm font-medium">{g.repo}</span>
                        <span
                          className="text-xs"
                          style={{ color: theme.colors.textMuted }}
                        >
                          {g.owner}
                          {g.trailIds.length > 1
                            ? ` · ${g.trailIds.length} trails`
                            : ''}
                        </span>
                      </div>
                    </button>
                  );
                })}

                {/*
                  "+" card — shares the cards row and toggles the same
                  expansion state with a sentinel key so the contribute /
                  suggest options surface inline like a repo's trails do.
                */}
                {(() => {
                  const selected = selectedRepoKey === ADD_CARD_KEY;
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTrailId(null);
                        setSelectedRepoKey((prev) =>
                          prev === ADD_CARD_KEY ? null : ADD_CARD_KEY,
                        );
                      }}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg transition-all hover:opacity-90"
                      style={{
                        background: selected
                          ? theme.colors.backgroundSecondary ??
                            theme.colors.background
                          : 'transparent',
                        border: `1px dashed ${selected ? theme.colors.primary : theme.colors.border}`,
                        color: theme.colors.text,
                        cursor: 'pointer',
                      }}
                      aria-pressed={selected}
                      aria-label="Add a trail or suggest a project"
                    >
                      <span
                        className="flex items-center justify-center w-7 h-7 rounded-full flex-shrink-0"
                        style={{
                          border: `1px solid ${theme.colors.border}`,
                          color: theme.colors.textMuted,
                        }}
                      >
                        <Plus className="w-4 h-4" />
                      </span>
                      <div className="flex flex-col items-start leading-tight">
                        <span className="text-sm font-medium">Add</span>
                        <span
                          className="text-xs"
                          style={{ color: theme.colors.textMuted }}
                        >
                          trail or project
                        </span>
                      </div>
                    </button>
                  );
                })()}
              </div>

              {repoGroups.length === 0 && selectedRepoKey !== ADD_CARD_KEY && (
                <p
                  className="text-sm italic mt-3"
                  style={{ color: theme.colors.textMuted }}
                >
                  {topic.trailIds.length === 0
                    ? 'No trails attached yet.'
                    : 'Loading trails…'}
                </p>
              )}

              {selectedRepoKey === ADD_CARD_KEY ? (
                <div className="mt-4 flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setContributeMode('suggest')}
                    className="flex items-center gap-1.5 px-3 h-9 rounded-md text-sm font-medium transition-all hover:opacity-80"
                    style={{
                      background: 'transparent',
                      color: theme.colors.text,
                      border: `1px solid ${theme.colors.border}`,
                      fontFamily: theme.fonts.body,
                      cursor: 'pointer',
                    }}
                    aria-label="Contribute a trail to this topic"
                  >
                    <Footprints className="w-4 h-4" />
                    <span>Contribute Trail</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSuggestProjectOpen(true)}
                    className="flex items-center gap-1.5 px-3 h-9 rounded-md text-sm font-medium transition-all hover:opacity-80"
                    style={{
                      background: 'transparent',
                      color: theme.colors.text,
                      border: `1px solid ${theme.colors.border}`,
                      fontFamily: theme.fonts.body,
                      cursor: 'pointer',
                    }}
                    aria-label="Suggest a project (repo) for this topic"
                  >
                    <Github className="w-4 h-4" />
                    <span>Suggest Project</span>
                  </button>
                </div>
              ) : selectedRepoKey ? (
                <ol className="mt-4 space-y-3">
                  {(
                    repoGroups.find((g) => g.key === selectedRepoKey)
                      ?.trailIds ?? []
                  ).map((tid) => (
                    <TrailCard
                      key={tid}
                      trailId={tid}
                      result={trailResults[tid]}
                      isOwner={isOwner}
                      onRemove={() => handleRemoveTrail(tid)}
                      onOpen={() => openTrailOverlay(tid)}
                    />
                  ))}
                </ol>
              ) : null}
            </div>

            {topic.description && (
              <div className="mt-5 lg:flex-1 lg:min-h-0">
                <IndustryMarkdownSlide
                  content={topic.description}
                  theme={theme}
                  slideIdPrefix={`topic-${topic.id}-description`}
                  slideIndex={0}
                  transparentBackground
                  disableBasePadding={{ horizontal: true }}
                />
              </div>
            )}
          </div>
        )}
        </div>

        {/*
          Desktop trail dock — only mounted on lg+. Sits in col-3 of the
          main grid; the slide-up sheet above is mobile-only so the two
          render paths are mutually exclusive (one TrailViewer instance
          at a time, no duplicate WebGL contexts).
        */}
        {selectedTrailId && isDesktop && (
          <TopicTrailLayer
            trailId={selectedTrailId}
            onClose={closeTrailOverlay}
            chrome="dock"
          />
        )}

        <div className="lg:col-start-1 lg:row-start-1 lg:h-full lg:overflow-y-auto lg:pb-8 lg:pr-8">
        <SuggestionsPanel
          topicId={topic.id}
          isOwner={isOwner}
          topicTrails={topicTrails}
          reloadKey={suggestionsReloadKey}
          onTrailAccepted={() => setTopicReloadKey((k) => k + 1)}
        />

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

        {discussionOpen && (
          <CommentThread
            topicId={topic.id}
            topicOwnerGithubId={topic.createdBy.githubId}
          />
        )}
        </div>
        </main>
        </div>
      </div>
    </div>
  );
}

interface TrailCardProps {
  trailId: string;
  result: TrailFetchResult | undefined;
  isOwner: boolean;
  onRemove: () => void;
  /**
   * When provided, clicking the card body fires this instead of toggling
   * the inline TrailSequencePreview. Topic page uses this to surface the
   * full TrailViewer in the section's expansion slot.
   */
  onOpen?: () => void;
}

function TrailCard({
  trailId,
  result,
  isOwner,
  onRemove,
  onOpen,
}: TrailCardProps) {
  const { theme } = useTheme();
  const state = result?.state ?? 'loading';
  const repoOwner = result?.owner;
  const [expanded, setExpanded] = useState(false);

  const openRepoOwner = (e: React.MouseEvent | React.KeyboardEvent) => {
    if (!repoOwner) return;
    e.preventDefault();
    e.stopPropagation();
    window.open(
      `https://github.com/${repoOwner}`,
      '_blank',
      'noopener,noreferrer',
    );
  };

  const avatar = repoOwner ? (
    <span
      role="link"
      tabIndex={0}
      onClick={openRepoOwner}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') openRepoOwner(e);
      }}
      className="flex-shrink-0 cursor-pointer hover:opacity-80"
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
    </span>
  ) : (
    <span
      className="flex-shrink-0 w-12 h-12 rounded-full"
      style={{
        background: theme.colors.background,
        border: `1px solid ${theme.colors.border}`,
      }}
    />
  );

  const removeButton = isOwner ? (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onRemove();
      }}
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
  ) : null;

  const body = (
    <div className="flex items-start gap-3 p-4">
      {avatar}

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
            <div
              className="text-base font-semibold"
              style={{ color: theme.colors.text }}
            >
              {result.entry.title}
            </div>
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

      {removeButton}
    </div>
  );

  return (
    <li
      className="rounded-lg border overflow-hidden"
      style={{
        background:
          theme.colors.backgroundSecondary ?? theme.colors.background,
        borderColor: theme.colors.border,
        transition: 'background-color 0.15s, border-color 0.15s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = `${theme.colors.primary}1A`;
        e.currentTarget.style.borderColor = `${theme.colors.primary}66`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor =
          theme.colors.backgroundSecondary ?? theme.colors.background;
        e.currentTarget.style.borderColor = theme.colors.border;
      }}
    >
      {state === 'ok' && result?.entry ? (
        <button
          type="button"
          onClick={() => {
            if (onOpen) {
              onOpen();
              return;
            }
            setExpanded((v) => !v);
          }}
          aria-expanded={onOpen ? undefined : expanded}
          className="block w-full text-left transition-opacity hover:opacity-90"
          style={{
            color: 'inherit',
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
          }}
        >
          {body}
        </button>
      ) : (
        body
      )}
      {state === 'ok' && !onOpen && (
        <div
          className="grid"
          style={{
            gridTemplateRows: expanded ? '1fr' : '0fr',
            transition: 'grid-template-rows 240ms ease',
          }}
        >
          <div style={{ overflow: 'hidden', minHeight: 0 }}>
            <div
              className="border-t px-4 py-3"
              style={{
                borderColor: theme.colors.border,
                opacity: expanded ? 1 : 0,
                transition: 'opacity 200ms ease',
              }}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: theme.colors.textMuted }}
                >
                  Trail Overview
                </span>
                <a
                  href={`/trail/${trailId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs hover:opacity-80"
                  style={{ color: theme.colors.primary }}
                >
                  Open full trail →
                </a>
              </div>
              {expanded && <TrailSequencePreview trailId={trailId} />}
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

interface TopicTrailLayerProps {
  trailId: string;
  onClose: () => void;
  /**
   * "sheet" = mobile slide-up overlay positioned inside the body
   * container. "dock" = desktop col-3 inline panel inside the main
   * grid. Each chrome wraps the same TrailHeader + TrailViewer pair.
   */
  chrome: 'sheet' | 'dock';
  /** Sheet only — drives the down-slide animation before unmount. */
  closing?: boolean;
}

/**
 * Embedded trail surface for the topic page. Calls `useTrailSession`
 * once (component mounts only when a trail is selected) and renders a
 * minimal TrailHeader — breadcrumb + close + sign-in only — above the
 * viewer. Star, stamp, agent-copy, github link, anon-notes toggle are
 * intentionally hidden in embed mode; the standalone /trail/{id} page
 * is where the full chrome lives.
 */
function TopicTrailLayer({
  trailId,
  onClose,
  chrome,
  closing,
}: TopicTrailLayerProps) {
  const { theme } = useTheme();
  const session = useTrailSession(trailId);

  const content = (
    <div className="w-full h-full flex flex-col overflow-hidden">
      {session.state === 'ok' && (
        <TrailHeader
          owner={session.owner}
          repo={session.repo}
          trailId={session.trailId}
          onClose={onClose}
          closeButtonPosition="right"
          statusMessage={session.headerStatus}
          hasNotes={session.hasNotes}
          ownerDisplay="avatar"
          showStar={false}
          showStamp={false}
          showAgentCopy={false}
          showGithubLink={false}
        />
      )}
      <div className="flex-1 min-h-0">
        <TrailViewer session={session} />
      </div>
    </div>
  );

  if (chrome === 'dock') {
    return (
      <div className="hidden lg:block lg:col-start-3 lg:row-start-1 lg:h-full lg:pl-4 lg:overflow-hidden">
        <div
          className="w-full h-full rounded-lg overflow-hidden border"
          style={{ borderColor: theme.colors.border }}
        >
          {content}
        </div>
      </div>
    );
  }

  return (
    <div
      className="absolute inset-0 z-40 overflow-hidden"
      style={{
        background: theme.colors.background,
        animation: `${closing ? 'topicTrailSheetDown' : 'topicTrailSheetUp'} ${TRAIL_SHEET_ANIM_MS}ms cubic-bezier(0.16, 1, 0.3, 1) forwards`,
        willChange: 'transform',
      }}
    >
      {content}
    </div>
  );
}
