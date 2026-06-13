/**
 * Stage 4 — the background authoring job.
 *
 * Runs the cold-create VM flow (`runInFreestyle`), then on success delivers the
 * published trail into the requester's own inbox (reusing the existing
 * send→inbox machinery, so the trail surfaces via `getInbox` /
 * `getInboxUnreadCount` with no new delivery plumbing). Run status transitions
 * (queued → running → succeeded|failed) are persisted so `GET /runs/{id}` can
 * poll them.
 *
 * This is fire-and-forget from the POST route — it must never throw to the
 * caller; every failure is captured into the run's `failed` state.
 */
import { runInFreestyle, AuthoringError } from './env/freestyle';
import { patchRun } from './run-store';
import {
  getIndex,
  findIndexEntry,
  updateInbox,
  putInboxEntry,
} from '@/lib/trails/s3-storage';
import { MAX_INBOX_ENTRIES } from '@/lib/trails/constants';
import type { InboxIndexEntry } from '@/lib/trails/types';
import type { AuthoringErrorCode } from './run-types';

export interface AuthoringJobParams {
  runId: string;
  /** User's GitHub token — host-only (resolve + clone + publish). Never reaches the agent. */
  token: string;
  owner: string;
  repo: string;
  ref?: string;
  question: string;
  model?: string;
  /** The requesting user — the trail is self-delivered to their inbox. */
  requester: { id: number; login: string };
}

/** Self-deliver the freshly published trail into the requester's inbox. */
async function deliverToInbox(args: {
  trailId: string;
  owner: string;
  repo: string;
  user: { id: number; login: string };
}): Promise<void> {
  const index = await getIndex(args.owner, args.repo);
  const snapshot = findIndexEntry(index, args.trailId);
  if (!snapshot) return; // index not yet consistent — inbox is best-effort

  const entry: InboxIndexEntry = {
    trailId: args.trailId,
    sender: { githubId: args.user.id, githubLogin: args.user.login },
    sentAt: new Date().toISOString(),
    readAt: null,
    notesSeenCount: 0,
    snapshot,
    owner: args.owner,
    repo: args.repo,
  };

  await updateInbox(args.user.id, (inbox) => {
    const filtered = inbox.entries.filter(
      (e) =>
        !(e.trailId === entry.trailId && e.sender.githubId === entry.sender.githubId)
    );
    const next = [entry, ...filtered];
    if (next.length > MAX_INBOX_ENTRIES) next.length = MAX_INBOX_ENTRIES;
    return { ...inbox, entries: next };
  });
  await putInboxEntry(args.user.id, entry).catch(() => undefined);
}

export async function runAuthoringJob(p: AuthoringJobParams): Promise<void> {
  try {
    await patchRun(p.runId, { status: 'running' });

    const { trailId, trailUrl } = await runInFreestyle({
      owner: p.owner,
      repo: p.repo,
      ref: p.ref,
      question: p.question,
      userToken: p.token,
      model: p.model,
      publish: true,
    });

    if (trailId) {
      // Inbox delivery is best-effort — a failure here must not flip the run
      // to failed (the trail is published and the run succeeded).
      await deliverToInbox({
        trailId,
        owner: p.owner,
        repo: p.repo,
        user: p.requester,
      }).catch((e) =>
        console.error('[authoring] inbox delivery failed', p.runId, e)
      );
    }

    await patchRun(p.runId, {
      status: 'succeeded',
      trailId: trailId ?? null,
      trailUrl: trailUrl ?? null,
    });
  } catch (err) {
    const code: AuthoringErrorCode =
      err instanceof AuthoringError ? err.code : 'AGENT_NO_EMIT';
    const message = err instanceof Error ? err.message : String(err);
    console.error('[authoring] run failed', p.runId, code, message);
    await patchRun(p.runId, {
      status: 'failed',
      error: { code, message },
    }).catch((e) =>
      console.error('[authoring] failed-state write failed', p.runId, e)
    );
  }
}
