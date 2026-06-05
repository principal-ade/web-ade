/**
 * Send a trail to one or more GitHub-login recipients.
 *
 * Repo-access gate: sender must pass the same `GET /repos/{owner}/{repo}`
 * check as a reader — you can only share what you can read.
 *
 * Idempotency: re-sending the same `(trailId, sender, recipient)` triple
 * refreshes `sentAt` and the snapshot, and clears `readAt` (the row
 * resurfaces as new). Matches "I'm pinging you again" semantics.
 *
 * Partial delivery is non-fatal: unknown or malformed recipient logins
 * are returned in `failed[]` rather than failing the whole send.
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchGitHubUser, getGitHubToken } from '@/lib/auth/request';
import {
  findIndexEntry,
  getIdPointer,
  getIndex,
  putInboxEntry,
  updateInbox,
  updateOutbox,
} from '@/lib/trails/s3-storage';
import { validateOwnerRepo, validateSendRequest } from '@/lib/trails/validation';
import {
  checkRepoAccess,
  isValidGitHubLogin,
  resolveGitHubLogin,
} from '@/lib/trails/github-access';
import { MAX_INBOX_ENTRIES, MAX_OUTBOX_ENTRIES } from '@/lib/trails/constants';
import {
  ShareErrorCodes,
  TrailShareError,
  type InboxIndexEntry,
  type OutboxIndexEntry,
} from '@/lib/trails/types';

interface Params {
  params: Promise<{ id: string }>;
}

type FailureReason = 'unknown_user' | 'invalid_login';

interface DeliveredEntry {
  login: string;
  githubId: number;
}

interface FailedEntry {
  login: string;
  reason: FailureReason;
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: 'Invalid trail id', code: ShareErrorCodes.INVALID_REQUEST },
        { status: 400 }
      );
    }

    const githubToken = await getGitHubToken();
    if (!githubToken) {
      return NextResponse.json(
        { error: 'Not authenticated', code: ShareErrorCodes.NOT_AUTHENTICATED },
        { status: 401 }
      );
    }

    const sender = await fetchGitHubUser(githubToken);
    if (!sender) {
      return NextResponse.json(
        { error: 'Not authenticated', code: ShareErrorCodes.NOT_AUTHENTICATED },
        { status: 401 }
      );
    }

    const pointer = await getIdPointer(id);
    if (!pointer) {
      return NextResponse.json(
        { error: 'Trail not found', code: ShareErrorCodes.NOT_FOUND },
        { status: 404 }
      );
    }

    const { owner, repo } = pointer;
    validateOwnerRepo(owner, repo);

    const access = await checkRepoAccess(owner, repo, githubToken);
    if (!access) {
      return NextResponse.json(
        {
          error: 'No read access to this repository',
          code: ShareErrorCodes.NO_REPO_ACCESS,
        },
        { status: 403 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body', code: ShareErrorCodes.INVALID_REQUEST },
        { status: 400 }
      );
    }
    const { recipients, comment } = validateSendRequest(body);

    const repoIndex = await getIndex(owner, repo);
    const snapshot = findIndexEntry(repoIndex, id);
    if (!snapshot) {
      // Pointer existed but the repo index doesn't have it — stale pointer.
      return NextResponse.json(
        { error: 'Trail not found', code: ShareErrorCodes.NOT_FOUND },
        { status: 404 }
      );
    }

    const delivered: DeliveredEntry[] = [];
    const failed: FailedEntry[] = [];

    // Resolve recipient logins → GitHub user ids. Sequential to keep the
    // GitHub rate-limit footprint predictable; logins are cached for 24h
    // so retries cost nothing.
    const resolved: Array<{ login: string; githubId: number }> = [];
    for (const login of recipients) {
      if (!isValidGitHubLogin(login)) {
        failed.push({ login, reason: 'invalid_login' });
        continue;
      }
      const user = await resolveGitHubLogin(login);
      if (!user) {
        failed.push({ login, reason: 'unknown_user' });
        continue;
      }
      resolved.push({ login: user.githubLogin, githubId: user.githubId });
    }

    const sentAt = new Date().toISOString();

    for (const recipient of resolved) {
      const newEntry: InboxIndexEntry = {
        trailId: id,
        sender: { githubId: sender.id, githubLogin: sender.login },
        ...(comment ? { comment } : {}),
        sentAt,
        readAt: null,
        snapshot,
        owner,
        repo,
      };

      await updateInbox(recipient.githubId, (inbox) => {
        // Idempotency key: same (trailId, sender) triple replaces the
        // prior row. A different sender sharing the same trail gets a
        // separate row so the recipient can see who pinged them last.
        const filtered = inbox.entries.filter(
          (entry) =>
            !(
              entry.trailId === newEntry.trailId &&
              entry.sender.githubId === newEntry.sender.githubId
            )
        );
        const next = [newEntry, ...filtered];
        // Soft cap — oldest by sentAt get pruned. Newest-first append means
        // sentAt-desc and array-order agree, so trimming the tail is safe.
        if (next.length > MAX_INBOX_ENTRIES) {
          next.length = MAX_INBOX_ENTRIES;
        }
        return { ...inbox, entries: next };
      });

      // Per-entry object — point-read helper for read-state mutations.
      // Failures here are logged; the inbox index is the source of truth.
      await putInboxEntry(recipient.githubId, newEntry).catch(() => undefined);

      delivered.push({ login: recipient.login, githubId: recipient.githubId });
    }

    // Sender-side mirror: record what was shared so a "Sent" view can list it
    // without scanning every recipient's inbox. One row per trail; resends
    // merge new recipients in and refresh sentAt. Best-effort — the inbox
    // deliveries above are the primary effect, so a failure here must not fail
    // a send the recipients already received.
    if (delivered.length > 0) {
      await updateOutbox(sender.id, (outbox) => {
        const existing = outbox.entries.find((e) => e.trailId === id);

        // Merge delivered recipients into the prior set, deduped by githubId.
        const byId = new Map<number, { githubId: number; githubLogin: string }>();
        for (const r of existing?.recipients ?? []) byId.set(r.githubId, r);
        for (const r of delivered) {
          byId.set(r.githubId, { githubId: r.githubId, githubLogin: r.login });
        }

        const newEntry: OutboxIndexEntry = {
          trailId: id,
          recipients: [...byId.values()],
          ...(comment ? { comment } : {}),
          sentAt,
          snapshot,
          owner,
          repo,
        };

        const filtered = outbox.entries.filter((e) => e.trailId !== id);
        const next = [newEntry, ...filtered];
        if (next.length > MAX_OUTBOX_ENTRIES) {
          next.length = MAX_OUTBOX_ENTRIES;
        }
        return { ...outbox, entries: next };
      }).catch((error) => {
        console.error('[Trails] Outbox write failed (non-fatal):', error);
      });
    }

    return NextResponse.json({ delivered, failed });
  } catch (error) {
    if (error instanceof TrailShareError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }
    console.error('[Trails] Send error:', error);
    return NextResponse.json(
      { error: 'Failed to send trail' },
      { status: 500 }
    );
  }
}
