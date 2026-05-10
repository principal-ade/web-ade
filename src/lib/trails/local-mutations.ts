/**
 * Browser-local trail notes + sign-offs for signed-out viewers.
 *
 * Anonymous visitors can still annotate and LGTM a trail; we persist
 * those mutations to `localStorage` keyed by trail id. They render
 * inside the same panel by being merged into the trail payload on
 * load, so the experience is identical — only the storage location
 * differs. Sign-in promotes nothing automatically: local items stay
 * local until the user manually re-adds them after authenticating.
 *
 * Local items are tagged with a `local-` id prefix so the panel and
 * action handlers can distinguish them from server items (e.g. only
 * local items are deletable / editable while signed out).
 */

import type { TrailNote, TrailSignOff } from './types';

const KEY_PREFIX = 'trail-local-mutations:';
const VISIT_KEY_PREFIX = 'trail-visited:';
const LOCAL_AUTHOR = 'You';

/**
 * Returns true the first time this browser hits a given trail id, and
 * false on every subsequent call. Used to gate the one-shot
 * `/visits` POST so reloads don't keep bumping `anonymousCount`.
 * Server-side has no equivalent dedup for anonymous visitors, so this
 * client gate is load-bearing.
 */
export function markTrailVisited(trailId: string): boolean {
  if (typeof window === 'undefined') return false;
  const key = `${VISIT_KEY_PREFIX}${trailId}`;
  if (window.localStorage.getItem(key)) return false;
  window.localStorage.setItem(key, new Date().toISOString());
  return true;
}

export const LOCAL_ID_PREFIX = 'local-';

export function isLocalId(id: string): boolean {
  return id.startsWith(LOCAL_ID_PREFIX);
}

export function newLocalId(): string {
  // Browsers without crypto.randomUUID (Safari < 15.4) still need a
  // unique-enough id. Date.now + a short random suffix is good enough
  // for per-browser scratch storage.
  const rand =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${LOCAL_ID_PREFIX}${rand}`;
}

interface LocalMutations {
  notes: TrailNote[];
  signOffs: TrailSignOff[];
}

const empty: LocalMutations = { notes: [], signOffs: [] };

function key(trailId: string): string {
  return `${KEY_PREFIX}${trailId}`;
}

function safeParse(raw: string | null): LocalMutations {
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as Partial<LocalMutations>;
    return {
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      signOffs: Array.isArray(parsed.signOffs) ? parsed.signOffs : [],
    };
  } catch {
    return empty;
  }
}

export function loadLocalMutations(trailId: string): LocalMutations {
  if (typeof window === 'undefined') return empty;
  return safeParse(window.localStorage.getItem(key(trailId)));
}

function write(trailId: string, data: LocalMutations): void {
  if (typeof window === 'undefined') return;
  if (data.notes.length === 0 && data.signOffs.length === 0) {
    window.localStorage.removeItem(key(trailId));
    return;
  }
  window.localStorage.setItem(key(trailId), JSON.stringify(data));
}

export function appendLocalNote(trailId: string, note: TrailNote): void {
  const data = loadLocalMutations(trailId);
  data.notes.push(note);
  write(trailId, data);
}

export function replaceLocalNote(
  trailId: string,
  noteId: string,
  body: string
): TrailNote | null {
  const data = loadLocalMutations(trailId);
  const idx = data.notes.findIndex((n) => n.id === noteId);
  if (idx < 0) return null;
  const existing = data.notes[idx]!;
  const updatedAt = new Date().toISOString();
  const next: TrailNote =
    existing.kind === 'markdown'
      ? { ...existing, body, updatedAt }
      : { ...existing, body, updatedAt };
  data.notes[idx] = next;
  write(trailId, data);
  return next;
}

export function removeLocalNote(trailId: string, noteId: string): boolean {
  const data = loadLocalMutations(trailId);
  const next = data.notes.filter((n) => n.id !== noteId);
  if (next.length === data.notes.length) return false;
  data.notes = next;
  write(trailId, data);
  return true;
}

export function appendLocalSignOff(
  trailId: string,
  signOff: TrailSignOff
): void {
  const data = loadLocalMutations(trailId);
  data.signOffs.push(signOff);
  write(trailId, data);
}

export function removeLocalSignOff(
  trailId: string,
  signOffId: string
): boolean {
  const data = loadLocalMutations(trailId);
  const next = data.signOffs.filter((s) => s.id !== signOffId);
  if (next.length === data.signOffs.length) return false;
  data.signOffs = next;
  write(trailId, data);
  return true;
}

export { LOCAL_AUTHOR };
