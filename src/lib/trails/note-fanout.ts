/**
 * Participant notification for trail notes.
 *
 * A shared trail is a collaborative thread: when a note is added, the people
 * involved — the sender who shared it and everyone it was sent to — should see
 * it in their inbox, except the author of the note itself.
 *
 * Recipients already derive their dot from `noteCount - notesSeenCount` on
 * read, so they need no write here. Two participants do:
 *
 *   1. The sender has no inbox row by default — sending writes recipients'
 *      inboxes and the sender's outbox, never the sender's own inbox. Create a
 *      row lazily on the first note so the sender participates in activity on
 *      trails they shared.
 *   2. The note's author would otherwise dot themselves: their own note bumps
 *      `noteCount` past their watermark. Advance their watermark so it doesn't.
 *
 * Best-effort by contract — callers await but swallow failures, mirroring
 * `syncTrailNoteSummary`. Call *after* `syncTrailNoteSummary` so the index
 * entry carries the fresh `noteCount`.
 */

import {
  findIndexEntry,
  getIndex,
  putInboxEntry,
  updateInbox,
} from './s3-storage';
import { MAX_INBOX_ENTRIES } from './constants';
import type { InboxIndexEntry, SharedTrailIndexEntry } from './types';

/**
 * The inbox row a trail's sender gets when their trail first receives a note.
 * `sender` is the trail's own creator (self) — the UI detects self and labels
 * it "shared by you". `readAt` is stamped so a new note reads as a "new notes"
 * dot rather than an "unopened" row. `notesSeenCount` is the full count when
 * the sender wrote the note (caught up, no self-dot) and 0 otherwise (the notes
 * are new to them).
 */
export function buildSenderNoteInboxRow(
  entry: SharedTrailIndexEntry,
  owner: string,
  repo: string,
  noteCount: number,
  senderIsAuthor: boolean,
  now: string
): InboxIndexEntry {
  return {
    trailId: entry.id,
    sender: {
      githubId: entry.createdBy.githubId,
      githubLogin: entry.createdBy.githubLogin,
    },
    sentAt: entry.createdAt ?? now,
    readAt: now,
    notesSeenCount: senderIsAuthor ? noteCount : 0,
    snapshot: entry,
    owner,
    repo,
  };
}

/**
 * Advance an inbox row's watermark to `noteCount` so the row's author isn't
 * notified of the note they just wrote. Leaves rows for other trails untouched
 * and stamps `readAt` if the author had never opened the trail.
 */
export function applyAuthorWatermark(
  entry: InboxIndexEntry,
  trailId: string,
  noteCount: number,
  now: string
): InboxIndexEntry {
  if (entry.trailId !== trailId) return entry;
  return { ...entry, notesSeenCount: noteCount, readAt: entry.readAt ?? now };
}

/**
 * Notify the participants of a trail that a note was added. See module header.
 * `authorGithubId` is the signed-in author for authored notes, or `null` for
 * anonymous notes (which have no author to exclude).
 */
export async function notifyParticipantsOfNote(
  owner: string,
  repo: string,
  id: string,
  authorGithubId: number | null
): Promise<void> {
  const index = await getIndex(owner, repo);
  const entry = findIndexEntry(index, id);
  if (!entry) return;

  const noteCount = entry.noteCount ?? 0;
  const senderId = entry.createdBy.githubId;
  const now = new Date().toISOString();

  // 1. Ensure the sender has an inbox row for their own trail.
  const senderRow = buildSenderNoteInboxRow(
    entry,
    owner,
    repo,
    noteCount,
    authorGithubId === senderId,
    now
  );
  let createdSenderRow = false;
  await updateInbox(senderId, (inbox) => {
    const has = inbox.entries.some(
      (e) => e.trailId === id && e.sender.githubId === senderId
    );
    if (has) return inbox;
    createdSenderRow = true;
    const next = [senderRow, ...inbox.entries];
    if (next.length > MAX_INBOX_ENTRIES) next.length = MAX_INBOX_ENTRIES;
    return { ...inbox, entries: next };
  });
  if (createdSenderRow) {
    await putInboxEntry(senderId, senderRow).catch(() => undefined);
  }

  // 2. Advance the author's watermark so they aren't dotted for their own note.
  if (authorGithubId != null) {
    let patched: InboxIndexEntry | undefined;
    await updateInbox(authorGithubId, (inbox) => {
      let touched = false;
      const entries = inbox.entries.map((e) => {
        if (e.trailId !== id) return e;
        touched = true;
        patched = applyAuthorWatermark(e, id, noteCount, now);
        return patched;
      });
      return touched ? { ...inbox, entries } : inbox;
    });
    if (patched) {
      await putInboxEntry(authorGithubId, patched).catch(() => undefined);
    }
  }
}
