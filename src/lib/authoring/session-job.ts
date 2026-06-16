/**
 * Background jobs for the two-phase authoring SESSION flow.
 *
 *   runPrepareJob — fire-and-forget from POST /sessions. Drives
 *     `prepareFreestyleSession` (import → VM boot → clone), patching the session
 *     status importing → preparing → ready so the client can render the
 *     "Initializing / Preparing / Ready" steps. A failed import (the common
 *     case) lands the session in `failed` BEFORE the user asks anything. On
 *     `ready` it arms a TTL reaper so an abandoned session can't leak a live VM.
 *
 *   runAskJob — fire-and-forget from POST /sessions/{id}/ask. Cancels the
 *     reaper, drives `askInFreestyleSession` in the already-booted VM, delivers
 *     the published trail to the requester's inbox, and ALWAYS tears the VM down
 *     in a finally (success or failure).
 *
 * Like the run job, neither must ever throw to the route — every failure is
 * captured into the session's `failed` state.
 *
 * Reaper caveat: the TTL timer is in-process (consistent with the existing
 * fire-and-forget run model). A server restart while a session is `ready` but
 * unasked orphans its VM — a sweep-based reaper is the durable follow-up.
 */
import {
  prepareFreestyleSession,
  askInFreestyleSession,
  teardownFreestyleSession,
  AuthoringError,
} from './env/freestyle';
import { getSessionRecord, patchSession } from './session-store';
import { deliverToInbox, isTransportError } from './run-job';
import { recordUnsupportedRepo } from './unsupported-store';
import { isCuratedRepo } from './curated-repos';
import type { AuthoringErrorCode } from './session-types';

/**
 * How long a `ready` session (VM up, waiting for a question) lives before the
 * reaper tears it down. The booted VM bills for this whole window, so keep it
 * tight — long enough for a user to read "Ready" and type a question.
 */
const READY_TTL_MS = 10 * 60 * 1000;

/** In-process reaper timers, keyed by sessionId. */
const reaperTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Classify a thrown error into a stable code (mirrors run-job's taxonomy). */
function classify(err: unknown): {
  code: AuthoringErrorCode;
  message: string;
  isAuthoringError: boolean;
} {
  const isAuthoringError = err instanceof AuthoringError;
  const code: AuthoringErrorCode = isAuthoringError
    ? err.code
    : isTransportError(err)
      ? 'UNAVAILABLE'
      : 'AGENT_NO_EMIT';
  const message = err instanceof Error ? err.message : String(err);
  return { code, message, isAuthoringError };
}

/** Reap a session that reached `ready` but was never asked. */
async function reapSession(sessionId: string): Promise<void> {
  reaperTimers.delete(sessionId);
  const session = await getSessionRecord(sessionId);
  if (!session) return;
  // Only reap a still-`ready` session. If the user has since asked, runAskJob
  // owns teardown (and has already cancelled this timer).
  if (session.status !== 'ready') return;
  await teardownFreestyleSession({
    vmId: session.vmId ?? undefined,
    identityId: session.identityId ?? undefined,
    repoId: session.repoId ?? undefined,
  });
  await patchSession(sessionId, { status: 'expired' }).catch((e) =>
    console.error('[authoring] expire-state write failed', sessionId, e)
  );
}

function scheduleReaper(sessionId: string): void {
  cancelReaper(sessionId);
  const timer = setTimeout(() => {
    void reapSession(sessionId);
  }, READY_TTL_MS);
  // Don't keep the Node process alive just for the reaper.
  if (typeof timer.unref === 'function') timer.unref();
  reaperTimers.set(sessionId, timer);
}

/** Cancel a pending reaper (called when the user asks). */
export function cancelReaper(sessionId: string): void {
  const t = reaperTimers.get(sessionId);
  if (t) {
    clearTimeout(t);
    reaperTimers.delete(sessionId);
  }
}

export interface PrepareJobParams {
  sessionId: string;
  /** User's GitHub token — host-only (resolve + import). Never reaches the VM. */
  token: string;
  owner: string;
  repo: string;
  ref?: string;
  /**
   * Whether the repo is public — gates recording into the GLOBAL unsupported
   * list on an import failure (a private repo's name must never be served).
   */
  isPublic: boolean;
}

export async function runPrepareJob(p: PrepareJobParams): Promise<void> {
  try {
    await patchSession(p.sessionId, { status: 'importing' });

    const prepared = await prepareFreestyleSession({
      owner: p.owner,
      repo: p.repo,
      ref: p.ref,
      userToken: p.token,
      onProgress: (label) => {
        // The VM-boot phase begins — flip importing → preparing. (Best-effort;
        // fired before prepare resolves, so it lands before the `ready` patch.)
        if (label === 'preparing') {
          void patchSession(p.sessionId, { status: 'preparing' }).catch(() => {});
        }
      },
    });

    const updated = await patchSession(p.sessionId, {
      status: 'ready',
      vmId: prepared.vmId,
      repoId: prepared.repoId,
      identityId: prepared.identityId,
      sha: prepared.sha,
    });
    // If the session record vanished mid-prepare, don't leak the VM we booted.
    if (!updated) {
      await teardownFreestyleSession(prepared);
      return;
    }
    scheduleReaper(p.sessionId);
  } catch (err) {
    const { code, message, isAuthoringError } = classify(err);
    console.error('[authoring] prepare failed', p.sessionId, code, message);
    await patchSession(p.sessionId, {
      status: 'failed',
      error: { code, message },
    }).catch((e) =>
      console.error('[authoring] prepare failed-state write failed', p.sessionId, e)
    );

    // Track repos that can't be imported (same rules as the run job): only a
    // deliberate substrate UNAVAILABLE for a public, non-curated repo — never a
    // transient transport blip, a private repo, or a verified repo.
    if (
      code === 'UNAVAILABLE' &&
      isAuthoringError &&
      p.isPublic &&
      !isCuratedRepo(p.owner, p.repo)
    ) {
      await recordUnsupportedRepo(p.owner, p.repo, { code, message }).catch((e) =>
        console.error('[authoring] unsupported-record failed', p.sessionId, e)
      );
    }
  }
}

export interface AskJobParams {
  sessionId: string;
  /** User's GitHub token — host-only (publish). Never reaches the VM. */
  token: string;
  /** The requesting user — the trail is self-delivered to their inbox. */
  requester: { id: number; login: string };
}

export async function runAskJob(p: AskJobParams): Promise<void> {
  cancelReaper(p.sessionId); // the user asked — the idle TTL no longer applies

  const session = await getSessionRecord(p.sessionId);
  if (!session || !session.vmId) {
    // The route only fires this for a `ready` session, so this is a guard.
    await patchSession(p.sessionId, {
      status: 'failed',
      error: { code: 'UNAVAILABLE', message: 'Session is no longer prepared.' },
    }).catch(() => {});
    return;
  }

  try {
    const { trailId, trailUrl } = await askInFreestyleSession({
      vmId: session.vmId,
      owner: session.owner,
      repo: session.repo,
      question: session.question ?? '',
      sha: session.sha ?? undefined,
      model: session.model,
      userToken: p.token,
      publish: true,
    });

    if (trailId) {
      // Inbox delivery is best-effort — a failure here must not flip the session
      // to failed (the trail is published and the ask succeeded).
      await deliverToInbox({
        trailId,
        owner: session.owner,
        repo: session.repo,
        user: p.requester,
      }).catch((e) =>
        console.error('[authoring] inbox delivery failed', p.sessionId, e)
      );
    }

    await patchSession(p.sessionId, {
      status: 'succeeded',
      trailId: trailId ?? null,
      trailUrl: trailUrl ?? null,
    });
  } catch (err) {
    const { code, message } = classify(err);
    console.error('[authoring] ask failed', p.sessionId, code, message);
    await patchSession(p.sessionId, {
      status: 'failed',
      error: { code, message },
    }).catch((e) =>
      console.error('[authoring] ask failed-state write failed', p.sessionId, e)
    );
  } finally {
    // The VM's job is done either way — cold-create leaves nothing live.
    await teardownFreestyleSession({
      vmId: session.vmId,
      identityId: session.identityId ?? undefined,
      repoId: session.repoId ?? undefined,
    });
  }
}
