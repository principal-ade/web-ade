import { describe, it, expect } from 'vitest';
import type { InboxIndexEntry, SharedTrailIndexEntry } from '../types';
import { deriveInboxNotification } from '../notifications';
import {
  applyAuthorWatermark,
  buildSenderNoteInboxRow,
} from '../note-fanout';

const NOW = '2026-06-17T00:00:00.000Z';
const CREATED = '2026-06-01T00:00:00.000Z';

/** Minimal repo index entry; only the fields the fan-out reads matter. */
function indexEntry(opts: {
  noteCount?: number;
  createdAt?: string;
}): SharedTrailIndexEntry {
  return {
    id: 'trail-1',
    createdBy: { githubId: 42, githubLogin: 'octocat' },
    noteCount: opts.noteCount,
    createdAt: opts.createdAt,
  } as SharedTrailIndexEntry;
}

describe('buildSenderNoteInboxRow', () => {
  it('sender is not the author: row reflects new notes as a non-unread dot', () => {
    const row = buildSenderNoteInboxRow(
      indexEntry({ noteCount: 2, createdAt: CREATED }),
      'octo',
      'repo',
      2,
      false,
      NOW
    );
    // Identity: the sender row is "from" the trail's own creator (self).
    expect(row.sender).toEqual({ githubId: 42, githubLogin: 'octocat' });
    expect(row.trailId).toBe('trail-1');
    expect(row.sentAt).toBe(CREATED);
    expect(row.readAt).toBe(NOW);
    expect(row.notesSeenCount).toBe(0);

    // Composed with the real derivation: a "new notes" dot, not an unopened row.
    expect(deriveInboxNotification(row)).toEqual({
      dot: true,
      unread: false,
      noteCount: 2,
      newNoteCount: 2,
    });
  });

  it('sender wrote the note: caught up, no self-dot', () => {
    const row = buildSenderNoteInboxRow(
      indexEntry({ noteCount: 1, createdAt: CREATED }),
      'octo',
      'repo',
      1,
      true,
      NOW
    );
    expect(row.notesSeenCount).toBe(1);
    expect(deriveInboxNotification(row)).toEqual({
      dot: false,
      unread: false,
      noteCount: 1,
      newNoteCount: 0,
    });
  });

  it('falls back to now when the trail has no createdAt', () => {
    const row = buildSenderNoteInboxRow(
      indexEntry({ noteCount: 1 }),
      'octo',
      'repo',
      1,
      false,
      NOW
    );
    expect(row.sentAt).toBe(NOW);
  });
});

describe('applyAuthorWatermark', () => {
  const base: InboxIndexEntry = {
    trailId: 'trail-1',
    sender: { githubId: 7, githubLogin: 'sender' },
    sentAt: CREATED,
    readAt: '2026-06-10T00:00:00.000Z',
    notesSeenCount: 1,
    snapshot: { noteCount: 3 } as SharedTrailIndexEntry,
    owner: 'octo',
    repo: 'repo',
  };

  it('advances the watermark so the author is not dotted for their own note', () => {
    const patched = applyAuthorWatermark(base, 'trail-1', 3, NOW);
    expect(patched.notesSeenCount).toBe(3);
    expect(patched.readAt).toBe(base.readAt); // already opened — preserved
    expect(deriveInboxNotification(patched)).toEqual({
      dot: false,
      unread: false,
      noteCount: 3,
      newNoteCount: 0,
    });
  });

  it('stamps readAt when the author had never opened the trail', () => {
    const patched = applyAuthorWatermark(
      { ...base, readAt: null },
      'trail-1',
      3,
      NOW
    );
    expect(patched.readAt).toBe(NOW);
    expect(patched.notesSeenCount).toBe(3);
  });

  it('leaves rows for other trails untouched', () => {
    const other = { ...base, trailId: 'trail-2' };
    expect(applyAuthorWatermark(other, 'trail-1', 3, NOW)).toBe(other);
  });
});
