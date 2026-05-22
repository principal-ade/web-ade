'use client';

/**
 * Pending trail-suggestion queue, owner-only. Lists each pending suggestion
 * with the trail's summary + the suggester's reason, and exposes Accept /
 * Reject controls that hit the suggestion routes. Renders nothing when there
 * are no pending suggestions; the panel above the trail list stays absent
 * until the queue is non-empty so the page doesn't show a permanent zero
 * state.
 *
 * Data flow: this component owns its own suggestion + trail-meta fetches —
 * the parent passes `onTrailAccepted` so the topic's `trailIds` can be
 * refreshed after a successful accept, but everything else (the pending
 * list, the row meta, per-row action state) stays here.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Github, Loader2, X } from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';
import {
  TopicErrorCodes,
  isProjectSuggestion,
  type ProjectSuggestion,
  type TopicSuggestion,
  type TrailSuggestion,
} from '@/lib/topics/types';
import {
  ShareErrorCodes,
  type ShareErrorCode,
  type SharedTrailIndexEntry,
} from '@/lib/trails/types';

/**
 * Repo identity for trails already attached to the topic — used to compute
 * the per-project "matching trails" cross-reference. The page already
 * fetches each trail's summary, so we pipe the resolved owner/repo through
 * rather than re-fetching here.
 */
export interface TopicTrailMeta {
  trailId: string;
  owner?: string;
  repo?: string;
  title?: string;
}

interface SuggestionsPanelProps {
  topicId: string;
  isOwner: boolean;
  /**
   * Trail metadata for trails currently on the topic. Drives the
   * "trails referencing this project" hint on project suggestion rows.
   */
  topicTrails: TopicTrailMeta[];
  /**
   * Bumped by the parent to force a suggestion refetch — e.g. after a new
   * project suggestion is created from the page-level dialog.
   */
  reloadKey?: number;
  /**
   * Fired after a successful accept so the parent can refetch the topic and
   * pick up the newly appended `trailId`. Reject doesn't change the topic
   * record, so there's no analogous callback for it.
   */
  onTrailAccepted: () => void;
}

interface TrailFetchResult {
  state: 'loading' | 'ok' | 'error';
  entry?: SharedTrailIndexEntry;
  owner?: string;
  repo?: string;
  errorMessage?: string;
  errorCode?: ShareErrorCode | null;
}

type ActionState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'error'; message: string };

function eqRepo(a: string | undefined, b: string): boolean {
  return !!a && a.toLowerCase() === b.toLowerCase();
}

function matchingTrails(
  project: ProjectSuggestion,
  topicTrails: TopicTrailMeta[],
): TopicTrailMeta[] {
  return topicTrails.filter(
    (t) => eqRepo(t.owner, project.owner) && eqRepo(t.repo, project.repo),
  );
}

export function SuggestionsPanel({
  topicId,
  isOwner,
  topicTrails,
  reloadKey,
  onTrailAccepted,
}: SuggestionsPanelProps) {
  const { theme } = useTheme();
  // Active set = pending (any kind) + accepted project suggestions ("in
  // progress"). Trail suggestions in `accepted` already mutated the topic
  // and don't need a panel slot; resolved/rejected/withdrawn stay out of
  // the visible queue.
  const [active, setActive] = useState<TopicSuggestion[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [trailResults, setTrailResults] = useState<
    Record<string, TrailFetchResult>
  >({});
  const [actionState, setActionState] = useState<Record<string, ActionState>>(
    {},
  );

  // ---- Load suggestions ---------------------------------------------------

  const refreshSuggestions = useCallback(async () => {
    try {
      const res = await fetch(`/api/topics/by-id/${topicId}/suggestions`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadError(
          body?.error || `Failed to load suggestions (${res.status})`,
        );
        return;
      }
      setLoadError(null);
      const all = Array.isArray(body?.suggestions)
        ? (body.suggestions as TopicSuggestion[])
        : [];
      setActive(
        all.filter((s) => {
          if (s.status === 'pending') return true;
          if (s.status === 'accepted' && isProjectSuggestion(s)) return true;
          return false;
        }),
      );
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Failed to load suggestions',
      );
    }
  }, [topicId]);

  useEffect(() => {
    if (!isOwner) return;
    void refreshSuggestions();
  }, [isOwner, refreshSuggestions, reloadKey]);

  const pendingTrailSuggestions = useMemo(
    () =>
      active.filter(
        (s): s is TrailSuggestion =>
          !isProjectSuggestion(s) && s.status === 'pending',
      ),
    [active],
  );
  const projectSuggestions = useMemo(
    () => active.filter((s): s is ProjectSuggestion => isProjectSuggestion(s)),
    [active],
  );

  // ---- Load trail metadata for each pending suggestion -------------------

  useEffect(() => {
    if (!isOwner) return;
    const idsToLoad = pendingTrailSuggestions
      .map((s) => s.trailId)
      .filter((tid) => !(tid in trailResults));
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
  }, [pendingTrailSuggestions, trailResults, isOwner]);

  // ---- Actions ------------------------------------------------------------

  const resolve = useCallback(
    async (
      suggestion: TopicSuggestion,
      action: 'accept' | 'reject',
      rejectReason?: string,
    ) => {
      const suggestionId = suggestion.id;
      setActionState((prev) => ({
        ...prev,
        [suggestionId]: { kind: 'pending' },
      }));
      try {
        const res = await fetch(
          `/api/topics/by-id/${topicId}/suggestions/${suggestionId}/${action}`,
          {
            method: 'POST',
            ...(action === 'reject' && rejectReason
              ? {
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ reason: rejectReason }),
                }
              : {}),
          },
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          const benign =
            body?.code === TopicErrorCodes.SUGGESTION_ALREADY_RESOLVED ||
            body?.code === TopicErrorCodes.SUGGESTION_NOT_FOUND;
          if (benign) {
            await refreshSuggestions();
            setActionState((prev) => {
              const next = { ...prev };
              delete next[suggestionId];
              return next;
            });
            return;
          }
          setActionState((prev) => ({
            ...prev,
            [suggestionId]: {
              kind: 'error',
              message: body?.error || `Failed to ${action} (${res.status})`,
            },
          }));
          return;
        }
        // Trail accept → drop from panel (it's now on the topic) and tell
        // the parent to refetch. Project accept → keep visible as "in
        // progress"; we refresh from server to pick up the new status.
        // Reject (any kind) → drop from panel.
        const projectAcceptStay =
          action === 'accept' && isProjectSuggestion(suggestion);
        if (!projectAcceptStay) {
          setActive((prev) => prev.filter((s) => s.id !== suggestionId));
        }
        setActionState((prev) => {
          const next = { ...prev };
          delete next[suggestionId];
          return next;
        });
        if (action === 'accept' && !isProjectSuggestion(suggestion)) {
          onTrailAccepted();
        }
        void refreshSuggestions();
      } catch (err) {
        setActionState((prev) => ({
          ...prev,
          [suggestionId]: {
            kind: 'error',
            message: err instanceof Error ? err.message : `Failed to ${action}`,
          },
        }));
      }
    },
    [topicId, onTrailAccepted, refreshSuggestions],
  );

  if (!isOwner) return null;
  if (active.length === 0 && !loadError) return null;

  return (
    <section
      className="mb-6 rounded-lg border"
      style={{
        background:
          theme.colors.backgroundSecondary ?? theme.colors.background,
        borderColor: theme.colors.border,
      }}
      aria-labelledby="suggestions-heading"
    >
      <header
        className="flex items-center justify-between px-4 py-2 border-b"
        style={{ borderColor: theme.colors.border }}
      >
        <h2
          id="suggestions-heading"
          className="text-xs uppercase tracking-wide"
          style={{ color: theme.colors.textMuted }}
        >
          Suggestions ({active.length})
        </h2>
      </header>

      {loadError && (
        <p
          className="px-4 py-2 text-xs"
          style={{ color: theme.colors.error }}
        >
          {loadError}
        </p>
      )}

      {pendingTrailSuggestions.length > 0 && (
        <ul className="divide-y" style={{ borderColor: theme.colors.border }}>
          {pendingTrailSuggestions.map((s) => (
            <SuggestionRow
              key={s.id}
              suggestion={s}
              trailMeta={trailResults[s.trailId]}
              action={actionState[s.id] ?? { kind: 'idle' }}
              onAccept={() => resolve(s, 'accept')}
              onReject={() => resolve(s, 'reject')}
            />
          ))}
        </ul>
      )}

      {projectSuggestions.length > 0 && (
        <>
          {pendingTrailSuggestions.length > 0 && (
            <div
              className="px-4 py-1 text-[10px] uppercase tracking-wide border-t"
              style={{
                color: theme.colors.textMuted,
                borderColor: theme.colors.border,
              }}
            >
              Projects
            </div>
          )}
          <ul className="divide-y" style={{ borderColor: theme.colors.border }}>
            {projectSuggestions.map((s) => (
              <ProjectSuggestionRow
                key={s.id}
                suggestion={s}
                matches={matchingTrails(s, topicTrails)}
                action={actionState[s.id] ?? { kind: 'idle' }}
                onAccept={() => resolve(s, 'accept')}
                onReject={(reason) => resolve(s, 'reject', reason)}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

interface SuggestionRowProps {
  suggestion: TrailSuggestion;
  trailMeta: TrailFetchResult | undefined;
  action: ActionState;
  onAccept: () => void;
  onReject: () => void;
}

function SuggestionRow({
  suggestion,
  trailMeta,
  action,
  onAccept,
  onReject,
}: SuggestionRowProps) {
  const { theme } = useTheme();
  const state = trailMeta?.state ?? 'loading';
  const repoOwner = trailMeta?.owner;
  const busy = action.kind === 'pending';

  const avatar = repoOwner ? (
    <a
      href={`https://github.com/${repoOwner}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex-shrink-0 hover:opacity-80"
      title={repoOwner}
      onClick={(e) => e.stopPropagation()}
    >
      <img
        src={`https://github.com/${repoOwner}.png?size=96`}
        alt={repoOwner}
        width={40}
        height={40}
        className="w-10 h-10 rounded-full"
        style={{ border: `1px solid ${theme.colors.border}` }}
      />
    </a>
  ) : (
    <span
      className="flex-shrink-0 w-10 h-10 rounded-full"
      style={{
        background: theme.colors.background,
        border: `1px solid ${theme.colors.border}`,
      }}
    />
  );

  const titleNode =
    state === 'ok' && trailMeta?.entry ? (
      <a
        href={`/trail/${suggestion.trailId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-semibold hover:underline"
        style={{ color: theme.colors.text, textDecoration: 'none' }}
      >
        {trailMeta.entry.title}
      </a>
    ) : state === 'loading' ? (
      <span
        className="inline-flex items-center gap-2 text-sm"
        style={{ color: theme.colors.textMuted }}
      >
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Loading trail…
      </span>
    ) : (
      <span className="text-sm" style={{ color: theme.colors.text }}>
        Trail{' '}
        <code
          className="px-1 rounded text-xs"
          style={{ background: theme.colors.background }}
        >
          {suggestion.trailId.slice(0, 8)}…
        </code>{' '}
        {trailMeta?.errorCode === ShareErrorCodes.NO_REPO_ACCESS
          ? 'is in a private repository'
          : 'unavailable'}
      </span>
    );

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      {avatar}

      <div className="flex-1 min-w-0">
        <div>{titleNode}</div>
        {trailMeta?.repo && (
          <div
            className="mt-0.5 text-xs"
            style={{ color: theme.colors.textMuted }}
          >
            {trailMeta.repo}
          </div>
        )}
        <div
          className="mt-1 text-xs"
          style={{ color: theme.colors.textMuted }}
        >
          Suggested by{' '}
          <a
            href={`https://github.com/${suggestion.suggestedBy.githubLogin}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
            style={{ color: theme.colors.text, textDecoration: 'none' }}
          >
            @{suggestion.suggestedBy.githubLogin}
          </a>
        </div>
        {suggestion.reason && (
          <p
            className="mt-1 text-sm whitespace-pre-wrap"
            style={{ color: theme.colors.text }}
          >
            {suggestion.reason}
          </p>
        )}
        {action.kind === 'error' && (
          <p
            className="mt-1 text-xs"
            style={{ color: theme.colors.error }}
          >
            {action.message}
          </p>
        )}
      </div>

      <div className="flex-shrink-0 flex items-center gap-1">
        <button
          type="button"
          onClick={onAccept}
          disabled={busy}
          className="inline-flex items-center justify-center w-8 h-8 rounded-md disabled:opacity-50"
          style={{
            color: theme.colors.background,
            background: theme.colors.primary,
            border: `1px solid ${theme.colors.primary}`,
            cursor: busy ? 'wait' : 'pointer',
          }}
          aria-label="Accept suggestion"
          title="Accept"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Check className="w-4 h-4" />
          )}
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={busy}
          className="inline-flex items-center justify-center w-8 h-8 rounded-md disabled:opacity-50"
          style={{
            color: theme.colors.textMuted,
            border: `1px solid ${theme.colors.border}`,
            background: 'transparent',
            cursor: busy ? 'wait' : 'pointer',
          }}
          aria-label="Reject suggestion"
          title="Reject"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </li>
  );
}

interface ProjectSuggestionRowProps {
  suggestion: ProjectSuggestion;
  matches: TopicTrailMeta[];
  action: ActionState;
  onAccept: () => void;
  onReject: (reason?: string) => void;
}

function ProjectSuggestionRow({
  suggestion,
  matches,
  action,
  onAccept,
  onReject,
}: ProjectSuggestionRowProps) {
  const { theme } = useTheme();
  const [dismissOpen, setDismissOpen] = useState(false);
  const [dismissReason, setDismissReason] = useState('');
  const busy = action.kind === 'pending';
  const inProgress = suggestion.status === 'accepted';

  const repoUrl = `https://github.com/${suggestion.owner}/${suggestion.repo}`;

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <a
        href={`https://github.com/${suggestion.owner}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-shrink-0 hover:opacity-80"
        title={suggestion.owner}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={`https://github.com/${suggestion.owner}.png?size=96`}
          alt={suggestion.owner}
          width={40}
          height={40}
          className="w-10 h-10 rounded-full"
          style={{ border: `1px solid ${theme.colors.border}` }}
        />
      </a>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <a
            href={repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-semibold hover:underline"
            style={{ color: theme.colors.text, textDecoration: 'none' }}
          >
            <Github className="w-3.5 h-3.5" />
            {suggestion.owner}/{suggestion.repo}
          </a>
          {inProgress && (
            <span
              className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded"
              style={{
                color: theme.colors.background,
                background: theme.colors.primary,
              }}
            >
              In progress
            </span>
          )}
        </div>

        <div
          className="mt-0.5 text-xs"
          style={{ color: theme.colors.textMuted }}
        >
          Suggested by{' '}
          <a
            href={`https://github.com/${suggestion.suggestedBy.githubLogin}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
            style={{ color: theme.colors.text, textDecoration: 'none' }}
          >
            @{suggestion.suggestedBy.githubLogin}
          </a>
        </div>

        {suggestion.reason && (
          <p
            className="mt-1 text-sm whitespace-pre-wrap"
            style={{ color: theme.colors.text }}
          >
            {suggestion.reason}
          </p>
        )}

        <div
          className="mt-1 text-xs"
          style={{ color: theme.colors.textMuted }}
        >
          {matches.length === 0
            ? 'No trails from this repo on the topic yet.'
            : `${matches.length} trail${matches.length === 1 ? '' : 's'} on the topic from this repo.`}
        </div>

        {dismissOpen && (
          <div className="mt-2 flex items-center gap-2">
            <input
              type="text"
              value={dismissReason}
              onChange={(e) => setDismissReason(e.target.value)}
              placeholder="Optional reason"
              className="flex-1 px-2 py-1 rounded-md text-xs outline-none"
              style={{
                background: theme.colors.background,
                color: theme.colors.text,
                border: `1px solid ${theme.colors.border}`,
              }}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onReject(dismissReason.trim() || undefined);
                  setDismissOpen(false);
                  setDismissReason('');
                } else if (e.key === 'Escape') {
                  setDismissOpen(false);
                  setDismissReason('');
                }
              }}
            />
            <button
              type="button"
              onClick={() => {
                onReject(dismissReason.trim() || undefined);
                setDismissOpen(false);
                setDismissReason('');
              }}
              disabled={busy}
              className="px-2 h-7 rounded-md text-xs disabled:opacity-50"
              style={{
                color: theme.colors.background,
                background: theme.colors.error,
                border: `1px solid ${theme.colors.error}`,
              }}
            >
              Dismiss
            </button>
            <button
              type="button"
              onClick={() => {
                setDismissOpen(false);
                setDismissReason('');
              }}
              className="px-2 h-7 rounded-md text-xs"
              style={{
                color: theme.colors.text,
                border: `1px solid ${theme.colors.border}`,
                background: 'transparent',
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {action.kind === 'error' && (
          <p className="mt-1 text-xs" style={{ color: theme.colors.error }}>
            {action.message}
          </p>
        )}
      </div>

      {!dismissOpen && (
        <div className="flex-shrink-0 flex items-center gap-1">
          {!inProgress && (
            <button
              type="button"
              onClick={onAccept}
              disabled={busy}
              className="inline-flex items-center justify-center w-8 h-8 rounded-md disabled:opacity-50"
              style={{
                color: theme.colors.background,
                background: theme.colors.primary,
                border: `1px solid ${theme.colors.primary}`,
                cursor: busy ? 'wait' : 'pointer',
              }}
              aria-label="Accept project suggestion"
              title="Accept — mark as in progress"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => setDismissOpen(true)}
            disabled={busy}
            className="inline-flex items-center justify-center w-8 h-8 rounded-md disabled:opacity-50"
            style={{
              color: theme.colors.textMuted,
              border: `1px solid ${theme.colors.border}`,
              background: 'transparent',
              cursor: busy ? 'wait' : 'pointer',
            }}
            aria-label="Dismiss project suggestion"
            title="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </li>
  );
}
