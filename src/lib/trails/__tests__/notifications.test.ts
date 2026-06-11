import { describe, it, expect } from 'vitest';
import type { InboxIndexEntry, SharedTrailIndexEntry } from '../types';
import { deriveInboxNotification } from '../notifications';

/** Build a minimal inbox entry; only the fields the derivation reads matter. */
function entry(opts: {
  readAt: string | null;
  notesSeenCount?: number;
  noteCount?: number;
}): Pick<InboxIndexEntry, 'readAt' | 'notesSeenCount' | 'snapshot'> {
  return {
    readAt: opts.readAt,
    notesSeenCount: opts.notesSeenCount,
    snapshot: { noteCount: opts.noteCount } as SharedTrailIndexEntry,
  };
}

const OPENED = '2026-06-11T00:00:00.000Z';

describe('deriveInboxNotification', () => {
  it('state 1 — unopened, no notes: dot, nothing new', () => {
    expect(deriveInboxNotification(entry({ readAt: null, noteCount: 0 }))).toEqual(
      { dot: true, unread: true, noteCount: 0, newNoteCount: 0 }
    );
  });

  it('state 2 — unopened, has notes: dot, every note counts as new', () => {
    expect(
      deriveInboxNotification(entry({ readAt: null, noteCount: 2 }))
    ).toEqual({ dot: true, unread: true, noteCount: 2, newNoteCount: 2 });
  });

  it('state 3 — opened, all seen: no dot', () => {
    expect(
      deriveInboxNotification(
        entry({ readAt: OPENED, notesSeenCount: 3, noteCount: 3 })
      )
    ).toEqual({ dot: false, unread: false, noteCount: 3, newNoteCount: 0 });
  });

  it('state 4 — opened, new notes since: dot, exact (N new)', () => {
    expect(
      deriveInboxNotification(
        entry({ readAt: OPENED, notesSeenCount: 3, noteCount: 5 })
      )
    ).toEqual({ dot: true, unread: false, noteCount: 5, newNoteCount: 2 });
  });

  it('opened with a deleted note (count below watermark) clamps new to 0', () => {
    expect(
      deriveInboxNotification(
        entry({ readAt: OPENED, notesSeenCount: 4, noteCount: 2 })
      )
    ).toEqual({ dot: false, unread: false, noteCount: 2, newNoteCount: 0 });
  });

  it('pre-feature entry (undefined counts) reads as opened/all-seen', () => {
    // readAt set, no notesSeenCount, no snapshot.noteCount → all default to 0.
    expect(deriveInboxNotification(entry({ readAt: OPENED }))).toEqual({
      dot: false,
      unread: false,
      noteCount: 0,
      newNoteCount: 0,
    });
  });

  it('pre-feature unread entry still shows a dot', () => {
    expect(deriveInboxNotification(entry({ readAt: null }))).toEqual({
      dot: true,
      unread: true,
      noteCount: 0,
      newNoteCount: 0,
    });
  });
});
