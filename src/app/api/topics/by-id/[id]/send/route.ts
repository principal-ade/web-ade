/**
 * Send a topic to one or more GitHub-login recipients.
 *
 * Mirrors `POST /api/trails/by-id/[id]/send` on the topic side. Topics are
 * public-by-link (the by-id GET is unauthenticated), so unlike the trail send
 * there's no repo-access gate — any authenticated user who has the topic id
 * may send it. Delivery lands in each recipient's topic inbox.
 *
 * Idempotency: re-sending the same `(topicId, sender, recipient)` triple
 * refreshes `sentAt` and the snapshot, and clears `readAt` (the row resurfaces
 * as new). Partial delivery is non-fatal: unknown or malformed recipient
 * logins are returned in `failed[]` rather than failing the whole send.
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchGitHubUser, getGitHubToken } from '@/lib/auth/request';
import {
  isValidGitHubLogin,
  resolveGitHubLogin,
} from '@/lib/trails/github-access';
import {
  getTopic,
  putTopicInboxEntry,
  topicToByUserEntry,
  updateTopicInbox,
  updateTopicOutbox,
} from '@/lib/topics/s3-storage';
import { validateSendRequest } from '@/lib/topics/validation';
import { MAX_INBOX_ENTRIES, MAX_OUTBOX_ENTRIES } from '@/lib/topics/constants';
import {
  TopicErrorCodes,
  TopicShareError,
  type SendTopicFailureReason,
  type TopicInboxIndexEntry,
  type TopicOutboxIndexEntry,
} from '@/lib/topics/types';

interface Params {
  params: Promise<{ id: string }>;
}

interface DeliveredEntry {
  login: string;
  githubId: number;
}

interface FailedEntry {
  login: string;
  reason: SendTopicFailureReason;
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;

    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { error: 'Invalid topic id', code: TopicErrorCodes.INVALID_REQUEST },
        { status: 400 },
      );
    }

    const githubToken = await getGitHubToken();
    if (!githubToken) {
      return NextResponse.json(
        { error: 'Not authenticated', code: TopicErrorCodes.NOT_AUTHENTICATED },
        { status: 401 },
      );
    }

    const sender = await fetchGitHubUser(githubToken);
    if (!sender) {
      return NextResponse.json(
        { error: 'Not authenticated', code: TopicErrorCodes.NOT_AUTHENTICATED },
        { status: 401 },
      );
    }

    const topic = await getTopic(id);
    if (!topic) {
      return NextResponse.json(
        { error: 'Topic not found', code: TopicErrorCodes.NOT_FOUND },
        { status: 404 },
      );
    }

    // Creator-only send: recipients can view a private topic but can't widen
    // its audience. The creator owns the guest list.
    if (topic.createdBy.githubId !== sender.id) {
      return NextResponse.json(
        { error: 'Not the topic owner', code: TopicErrorCodes.NOT_OWNER },
        { status: 403 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body', code: TopicErrorCodes.INVALID_REQUEST },
        { status: 400 },
      );
    }
    const { recipients, comment } = validateSendRequest(body);

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

    const snapshot = topicToByUserEntry(topic);
    const sentAt = new Date().toISOString();

    for (const recipient of resolved) {
      const newEntry: TopicInboxIndexEntry = {
        topicId: id,
        sender: { githubId: sender.id, githubLogin: sender.login },
        ...(comment ? { comment } : {}),
        sentAt,
        readAt: null,
        snapshot,
      };

      await updateTopicInbox(recipient.githubId, (inbox) => {
        // Idempotency key: same (topicId, sender) triple replaces the prior
        // row. A different sender sharing the same topic gets a separate row
        // so the recipient can see who pinged them last.
        const filtered = inbox.entries.filter(
          (entry) =>
            !(
              entry.topicId === newEntry.topicId &&
              entry.sender.githubId === newEntry.sender.githubId
            ),
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
      await putTopicInboxEntry(recipient.githubId, newEntry).catch(
        () => undefined,
      );

      delivered.push({ login: recipient.login, githubId: recipient.githubId });
    }

    // Sender-side mirror: record what was shared so a "Sent" view can list it
    // without scanning every recipient's inbox. One row per topic; resends
    // merge new recipients in and refresh sentAt. Best-effort — the inbox
    // deliveries above are the primary effect, so a failure here must not fail
    // a send the recipients already received.
    if (delivered.length > 0) {
      await updateTopicOutbox(sender.id, (outbox) => {
        const existing = outbox.entries.find((e) => e.topicId === id);

        // Merge delivered recipients into the prior set, deduped by githubId.
        const byId = new Map<number, { githubId: number; githubLogin: string }>();
        for (const r of existing?.recipients ?? []) byId.set(r.githubId, r);
        for (const r of delivered) {
          byId.set(r.githubId, { githubId: r.githubId, githubLogin: r.login });
        }

        const newEntry: TopicOutboxIndexEntry = {
          topicId: id,
          recipients: [...byId.values()],
          ...(comment ? { comment } : {}),
          sentAt,
          snapshot,
        };

        const filtered = outbox.entries.filter((e) => e.topicId !== id);
        const next = [newEntry, ...filtered];
        if (next.length > MAX_OUTBOX_ENTRIES) {
          next.length = MAX_OUTBOX_ENTRIES;
        }
        return { ...outbox, entries: next };
      }).catch((error) => {
        console.error('[Topics] Outbox write failed (non-fatal):', error);
      });
    }

    return NextResponse.json({ delivered, failed });
  } catch (error) {
    if (error instanceof TopicShareError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.statusCode },
      );
    }
    console.error('[Topics] Send error:', error);
    return NextResponse.json({ error: 'Failed to send topic' }, { status: 500 });
  }
}
