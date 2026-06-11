/**
 * Inbox notification-state derivation — the single source of truth for the
 * orange dot and "(N new)" badge, shared by the inbox list and the
 * unread-count route so the electron/mobile mirrors render rather than
 * re-derive. Pure (no storage/server imports) so it's trivially testable.
 *
 * The four states (per the design):
 *   1. unopened, no notes   → dot, 0 new
 *   2. unopened, has notes  → dot, all notes new (whole "& N notes" orange)
 *   3. opened, all seen     → no dot (the only fully-read state)
 *   4. opened, new notes    → dot, "(N new)" while the total stays gray
 */

import type { InboxIndexEntry } from './types';

export interface InboxNotification {
  /** Whether to show the orange attention dot. */
  dot: boolean;
  /** Trail itself never opened (drives "whole row orange" vs just "(N new)"). */
  unread: boolean;
  /** Total notes on the trail. */
  noteCount: number;
  /** Notes added since the recipient last looked — the "(N new)" count. */
  newNoteCount: number;
}

export function deriveInboxNotification(
  entry: Pick<InboxIndexEntry, 'readAt' | 'notesSeenCount' | 'snapshot'>
): InboxNotification {
  const noteCount = entry.snapshot.noteCount ?? 0;
  const seen = entry.notesSeenCount ?? 0;
  const unread = entry.readAt === null;
  // Unopened ⇒ every note is unread; opened ⇒ only notes past the watermark.
  const newNoteCount = unread ? noteCount : Math.max(0, noteCount - seen);
  const dot = unread || newNoteCount > 0;
  return { dot, unread, noteCount, newNoteCount };
}
