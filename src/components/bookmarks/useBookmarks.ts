'use client';

import { useCallback, useEffect, useState } from 'react';
import type { BookmarkRepo } from './types';

// localStorage key for the bookmarks "passport" — a fixed-length column of
// slots, each holding a full repo object (or null). We persist the whole repo
// (not just full_name) so placed bookmarks render in the panel even after the
// user navigates away from that repo.
const BOOKMARKS_KEY = 'repo-bookmarks';

// Fired on the window after a same-tab write so other hook instances (e.g. the
// header badge and the open panel) re-read immediately. Cross-tab updates ride
// the native 'storage' event.
const BOOKMARKS_EVENT = 'repo-bookmarks:changed';

export const BOOKMARK_SLOT_COUNT = 8;

// A placed bookmark is the repo plus an optional user note.
export type BookmarkEntry = BookmarkRepo & { note?: string };

export type BookmarkSlots = (BookmarkEntry | null)[];

const emptySlots = (): BookmarkSlots =>
  Array.from({ length: BOOKMARK_SLOT_COUNT }, () => null);

function isRepo(v: unknown): v is BookmarkRepo {
  if (v == null || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  const owner = o.owner as Record<string, unknown> | undefined;
  return (
    typeof o.full_name === 'string' &&
    typeof o.name === 'string' &&
    !!owner &&
    typeof owner.login === 'string' &&
    typeof owner.avatar_url === 'string'
  );
}

function readBookmarks(): BookmarkSlots {
  if (typeof window === 'undefined') return emptySlots();
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(BOOKMARKS_KEY) ?? '[]',
    );
    const base = emptySlots();
    if (Array.isArray(parsed)) {
      parsed.slice(0, BOOKMARK_SLOT_COUNT).forEach((item, i) => {
        if (!isRepo(item)) return;
        const note = (item as { note?: unknown }).note;
        base[i] =
          typeof note === 'string' && note ? { ...item, note } : item;
      });
    }
    return base;
  } catch {
    return emptySlots();
  }
}

function writeBookmarks(slots: BookmarkSlots): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(slots));
    window.dispatchEvent(new Event(BOOKMARKS_EVENT));
  } catch {
    // best-effort — quota / private mode
  }
}

// Persisted bookmark slots plus the place / move / remove operations the panel
// needs. Slots start empty on the server and hydrate on mount to avoid SSR
// mismatch.
export function useBookmarks() {
  const [slots, setSlots] = useState<BookmarkSlots>(emptySlots);

  useEffect(() => {
    setSlots(readBookmarks());
    const sync = () => setSlots(readBookmarks());
    window.addEventListener(BOOKMARKS_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(BOOKMARKS_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const commit = useCallback(
    (updater: (prev: BookmarkSlots) => BookmarkSlots) => {
      setSlots((prev) => {
        const next = updater(prev);
        writeBookmarks(next);
        return next;
      });
    },
    [],
  );

  // Drop a repo into a slot. If it's already bookmarked elsewhere, move it
  // (clear the old slot) so a repo never appears twice.
  const place = useCallback(
    (slotIndex: number, repo: BookmarkRepo) => {
      commit((prev) => {
        const next = [...prev];
        const existing = next.findIndex(
          (s) => s?.full_name === repo.full_name,
        );
        if (existing !== -1) next[existing] = null;
        next[slotIndex] = repo;
        return next;
      });
    },
    [commit],
  );

  // Move/swap the contents of one slot into another (reordering placed stamps).
  const move = useCallback(
    (from: number, to: number) => {
      if (from === to) return;
      commit((prev) => {
        const next = [...prev];
        const displaced = next[to] ?? null;
        next[to] = next[from] ?? null;
        next[from] = displaced;
        return next;
      });
    },
    [commit],
  );

  const remove = useCallback(
    (slotIndex: number) => {
      commit((prev) => {
        const next = [...prev];
        next[slotIndex] = null;
        return next;
      });
    },
    [commit],
  );

  // Attach/replace a note on a placed bookmark. An empty note clears it.
  const setNote = useCallback(
    (slotIndex: number, note: string) => {
      commit((prev) => {
        const entry = prev[slotIndex];
        if (!entry) return prev;
        const next = [...prev];
        const trimmed = note.trim();
        if (trimmed) {
          next[slotIndex] = { ...entry, note: trimmed };
        } else {
          const { note: _omit, ...rest } = entry;
          next[slotIndex] = rest;
        }
        return next;
      });
    },
    [commit],
  );

  const count = slots.filter(Boolean).length;
  const has = useCallback(
    (fullName: string) => slots.some((s) => s?.full_name === fullName),
    [slots],
  );

  return { slots, place, move, remove, setNote, count, has };
}
