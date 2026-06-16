'use client';

/**
 * Trail viewer — presentational rendering of a shared trail's FileCity
 * panel plus toast. The header is intentionally NOT bundled: different
 * surfaces (standalone /trail/{id}, topic-page embed, etc.) want
 * different header chrome. Pair this component with `useTrailSession`
 * to drive both your header of choice and this viewer from one shared
 * piece of state.
 *
 * Loading and error states are handled internally — `useTrailSession`
 * returns a discriminated union, and the viewer dispatches on it. The
 * loading branch warms FileCity3D's WebGL pipeline behind a loading
 * screen so the panel's first paint inherits a hot GPU cache.
 */

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import {
  PanelEventBus,
  type DataSlice,
  type PanelContextValue,
  type PanelEventEmitter,
} from '@principal-ade/panel-framework-core';
import {
  GitFileTreeBuilder,
  type FileTree,
} from '@principal-ai/repository-abstraction';
import { trpc } from '@/lib/trpc/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthorNames } from '@/hooks/useAuthorNames';
import { TrailLoadingScreen } from '@/components/trail/TrailLoadingScreen';
import { TrailErrorView } from '@/components/trail/TrailErrorView';
import type {
  FileCityTrailExplorerPanelActions,
  FileCityTrailExplorerPanelContext,
  FileCityTrailExplorerRepository,
} from '@industry-theme/file-city-panel';
import {
  type ShareErrorCode,
  type TrailNote,
  type TrailNoteDraft,
  type TrailPayload,
  type TrailSignOff,
  type TrailSignOffDraft,
  type SharedTrailIndexEntry,
} from '@/lib/trails/types';
import {
  LOCAL_AUTHOR,
  appendLocalNote,
  appendLocalSignOff,
  isLocalId,
  loadLocalMutations,
  markTrailVisited,
  newLocalId,
  removeLocalNote,
  removeLocalSignOff,
  replaceLocalNote,
} from '@/lib/trails/local-mutations';

const FileCityTrailExplorerPanel = dynamic(
  () =>
    import('@industry-theme/file-city-panel').then(
      (m) => m.FileCityTrailExplorerPanel,
    ),
  { ssr: false },
);

const FileCity3D = dynamic(
  () => import('@principal-ai/file-city-react').then((m) => m.FileCity3D),
  { ssr: false },
);

// Warm both chunks at module-evaluate time so they're cached by the
// time data resolves. See docs/nextjs-3d-rendering-issue.md.
if (typeof window !== 'undefined') {
  void (FileCityTrailExplorerPanel as { preload?: () => Promise<unknown> }).preload?.();
  void (FileCity3D as { preload?: () => Promise<unknown> }).preload?.();
}

interface TrailResponse {
  owner: string;
  repo: string;
  entry: SharedTrailIndexEntry;
  payload: TrailPayload;
  bookmarked: boolean;
  allowAnonNotes: boolean;
}

const ANON_NOTE_ID_PREFIX = 'anon-';
function isAnonNoteId(id: string): boolean {
  return id.startsWith(ANON_NOTE_ID_PREFIX);
}

const WARMING_CITY_DATA: import('@principal-ai/file-city-react').CityData = {
  buildings: [
    { path: 'src/index.ts', position: { x: 5, y: 0, z: 5 }, dimensions: [8, 12, 8], type: 'file', fileExtension: 'ts', size: 4096, lineCount: 240 },
    { path: 'src/app.tsx', position: { x: 18, y: 0, z: 5 }, dimensions: [8, 18, 8], type: 'file', fileExtension: 'tsx', size: 8192, lineCount: 480 },
    { path: 'src/api/client.js', position: { x: 31, y: 0, z: 5 }, dimensions: [6, 9, 6], type: 'file', fileExtension: 'js', size: 3000, lineCount: 180 },
    { path: 'src/components/Button.tsx', position: { x: 5, y: 0, z: 22 }, dimensions: [6, 6, 6], type: 'file', fileExtension: 'tsx', size: 1024, lineCount: 80 },
    { path: 'src/components/Modal.tsx', position: { x: 14, y: 0, z: 22 }, dimensions: [6, 14, 6], type: 'file', fileExtension: 'tsx', size: 6000, lineCount: 320 },
    { path: 'src/utils/helpers.ts', position: { x: 23, y: 0, z: 22 }, dimensions: [6, 9, 6], type: 'file', fileExtension: 'ts', size: 2400, lineCount: 160 },
    { path: 'src/styles/main.css', position: { x: 31, y: 0, z: 22 }, dimensions: [6, 5, 6], type: 'file', fileExtension: 'css', size: 1500 },
    { path: 'package.json', position: { x: 5, y: 0, z: 38 }, dimensions: [5, 4, 5], type: 'file', fileExtension: 'json', size: 800 },
    { path: 'README.md', position: { x: 14, y: 0, z: 38 }, dimensions: [5, 5, 5], type: 'file', fileExtension: 'md', size: 1500 },
    { path: 'tsconfig.json', position: { x: 23, y: 0, z: 38 }, dimensions: [5, 4, 5], type: 'file', fileExtension: 'json', size: 600 },
  ],
  districts: [
    {
      path: 'src',
      worldBounds: { minX: 0, maxX: 38, minZ: 0, maxZ: 30 },
      fileCount: 7,
      type: 'directory',
      label: { text: 'src', bounds: { minX: 0, maxX: 38, minZ: 30, maxZ: 33 }, position: 'bottom' },
    },
  ],
  bounds: { minX: -2, maxX: 40, minZ: -2, maxZ: 42 },
  metadata: { totalFiles: 10, totalDirectories: 1, rootPath: '/warming', analyzedAt: new Date() },
};

function nullSlice<T>(name: string): DataSlice<T | null> {
  return {
    scope: 'repository',
    name,
    data: null,
    loading: false,
    error: null,
    refresh: async () => {},
  };
}

// --------------------------------------------------------------------
// Session
// --------------------------------------------------------------------

/**
 * Resolved data + mutation surface for a trail. When `state === 'ok'`
 * every other field on the session is populated; before then the
 * caller only has the load status to work with.
 */
export interface TrailSessionOk {
  state: 'ok';
  trailId: string;
  owner: string;
  repo: string;
  /** Live payload — server data merged with localStorage + in-memory mutations. */
  livePayload: TrailPayload;
  /** Derived: livePayload.notes.length > 0. Useful for the LGTM/Reviewed label. */
  hasNotes: boolean;

  // Bookmark ---------------------------------------------------------------
  bookmarked: boolean;
  bookmarkToggleInFlight: boolean;
  onToggleBookmark: () => void;

  // Anonymous-notes toggle (owner-only) -------------------------------
  isOwner: boolean;
  allowAnonNotes: boolean;
  anonNotesToggleInFlight: boolean;
  onToggleAnonNotes: () => void;

  // Auth status -------------------------------------------------------
  /** True when no user is signed in — gates the header's "Sign in" CTA. */
  showSignIn: boolean;
  onSignIn: () => void;

  // Transient header status (e.g. "Saved in this browser only…") -------
  headerStatus: string | null;

  // Panel wiring ------------------------------------------------------
  context: PanelContextValue<FileCityTrailExplorerPanelContext>;
  actions: FileCityTrailExplorerPanelActions;
  events: PanelEventEmitter;
  /** Undefined for anonymous viewers — gates the panel's note Edit/Delete. */
  currentAuthor?: string;

  // Toast (errors raised by mutations) --------------------------------
  toast: { message: string } | null;
  dismissToast: () => void;
}

export type TrailSession =
  | { state: 'loading'; trailId: string }
  | { state: 'error'; trailId: string; message: string; code: ShareErrorCode | null }
  | TrailSessionOk;

interface TrailContextResolved {
  owner: string;
  repo: string;
  payload: TrailPayload;
  fileTree: FileTree;
  initialBookmarked: boolean;
  initialAllowAnonNotes: boolean;
  ownerGithubId: number;
  /**
   * Commit the trail was authored against. All content resolution (file
   * tree + snippet reads) is pinned to it so markers don't drift onto a
   * newer HEAD. Undefined for older trails with no recorded provenance,
   * in which case resolution falls back to HEAD.
   */
  authoredSha?: string;
}

/**
 * Drives a trail's data fetch, FileCity3D warm-up window, and all the
 * mutation state the header + panel need. Returns a discriminated
 * union so callers can render the right surface for each load state.
 *
 * Pair with `<TrailViewer />` for the panel + toast and your own
 * header component (e.g. `<TrailHeader />`) so the caller controls
 * which header parts are visible.
 */
export function useTrailSession(trailId: string): TrailSession {
  const { user, login } = useAuth();
  const [resolved, setResolved] = useState<TrailContextResolved | null>(null);
  const [error, setError] = useState<{
    message: string;
    code: ShareErrorCode | null;
  } | null>(null);

  // --- Load --------------------------------------------------------------

  useEffect(() => {
    if (!trailId) return;
    setResolved(null);
    setError(null);

    let cancelled = false;

    // Minimum loading window so the warming FileCity3D (rendered behind
    // the loading screen) has time to mount, init WebGL, and compile
    // its shader programs before the real panel takes over.
    const MIN_LOADING_MS = 2000;
    const minDelay = new Promise<void>((resolve) =>
      setTimeout(resolve, MIN_LOADING_MS),
    );

    async function load() {
      try {
        const res = await fetch(
          `/api/trails/by-id/${encodeURIComponent(trailId)}`,
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const message: string =
            body?.error ??
            (res.status === 404
              ? 'This trail does not exist or has been removed.'
              : `Failed to load trail (${res.status}).`);
          if (cancelled) return;
          setError({ message, code: (body?.code as ShareErrorCode) ?? null });
          return;
        }
        const trail = (await res.json()) as TrailResponse;

        // Resolve the commit the trail was authored against — registry
        // form (repos[0]) first, then the single-repo shorthand. Bare
        // line numbers against a moving branch silently drift; pinning to
        // this sha keeps every marker on the code the author actually saw.
        // The sha is stamped into the payload at publish time (see
        // POST /api/trails), so well-formed trails always carry one.
        const authoredSha =
          trail.payload.repos?.[0]?.authoredAtSha ??
          trail.payload.authoredAt?.sha;

        const treeData = await trpc.github.getTree.query({
          owner: trail.owner,
          repo: trail.repo,
          ...(authoredSha ? { ref: authoredSha } : {}),
        });
        const files = treeData.tree
          .filter((entry) => entry.type === 'blob')
          .map((entry) => ({
            path: entry.path,
            size: entry.size || 0,
          }));
        const tree = new GitFileTreeBuilder().build({
          files,
          rootPath: `/${trail.owner}/${trail.repo}`,
          commitSha: treeData.sha,
          branch: 'main',
        });

        if (cancelled) return;
        await minDelay;
        if (cancelled) return;
        setResolved({
          owner: trail.owner,
          repo: trail.repo,
          payload: trail.payload,
          fileTree: tree,
          initialBookmarked: trail.bookmarked ?? false,
          initialAllowAnonNotes: trail.allowAnonNotes ?? false,
          ownerGithubId: trail.entry.createdBy.githubId,
          authoredSha,
        });
      } catch (err) {
        if (cancelled) return;
        setError({
          message: err instanceof Error ? err.message : 'Failed to load trail.',
          code: null,
        });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [trailId]);

  // --- Bookmark --------------------------------------------------------------

  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarkInFlight, setBookmarkInFlight] = useState(false);
  useEffect(() => {
    if (resolved) setBookmarked(resolved.initialBookmarked);
  }, [resolved]);

  // --- Anon notes --------------------------------------------------------

  const [allowAnonNotes, setAllowAnonNotes] = useState(false);
  const [anonToggleInFlight, setAnonToggleInFlight] = useState(false);
  useEffect(() => {
    if (resolved) setAllowAnonNotes(resolved.initialAllowAnonNotes);
  }, [resolved]);

  // --- Toast (mutation errors) -------------------------------------------

  const [toast, setToast] = useState<{ message: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  const showError = useCallback((message: string) => {
    setToast({ message });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);

  // --- Header status (transient text shown by the caller's header) ------

  const [headerStatus, setHeaderStatus] = useState<string | null>(null);
  useEffect(() => {
    if (!headerStatus) return;
    const t = setTimeout(() => setHeaderStatus(null), 6000);
    return () => clearTimeout(t);
  }, [headerStatus]);
  const showLocalSavedStatus = useCallback(() => {
    setHeaderStatus(
      'Saved in this browser only — sign in to share with everyone else.',
    );
  }, []);

  const onSignIn = useCallback(() => {
    login(window.location.pathname);
  }, [login]);

  // --- Live payload (server + local + in-memory mutations) ---------------

  const mergeServerWithLocal = useCallback(
    (server: TrailPayload): TrailPayload => {
      const local = loadLocalMutations(server.id);
      if (local.notes.length === 0 && local.signOffs.length === 0) {
        return server;
      }
      return {
        ...server,
        notes: [...(server.notes ?? []), ...local.notes],
        signOffs: [...(server.signOffs ?? []), ...local.signOffs],
      };
    },
    [],
  );

  const [livePayload, setLivePayload] = useState<TrailPayload | null>(null);
  useEffect(() => {
    if (resolved) setLivePayload(mergeServerWithLocal(resolved.payload));
    else setLivePayload(null);
  }, [resolved, mergeServerWithLocal]);

  // --- Visit recording ---------------------------------------------------

  useEffect(() => {
    if (!resolved) return;
    const signedIn = !!user;
    if (!signedIn && !markTrailVisited(trailId)) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/trails/by-id/${trailId}/visits`, {
          method: 'POST',
        });
        if (!res.ok || cancelled) return;
        const { visitors } = (await res.json()) as {
          visitors: { named: string[]; anonymousCount: number };
        };
        if (cancelled) return;
        setLivePayload((prev) => (prev ? { ...prev, visitors } : prev));
      } catch {
        // Visit recording is best-effort.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trailId, user, resolved]);

  // --- Bookmark toggle -------------------------------------------------------

  const onToggleBookmark = useCallback(() => {
    if (!user) {
      setHeaderStatus('Sign in to bookmark this trail.');
      return;
    }
    if (bookmarkInFlight) return;
    const previous = bookmarked;
    setBookmarked(!previous);
    setBookmarkInFlight(true);
    void (async () => {
      try {
        const res = await fetch(`/api/trails/by-id/${trailId}/bookmark`, {
          method: previous ? 'DELETE' : 'POST',
        });
        if (!res.ok && res.status !== 204) {
          setBookmarked(previous);
          const body = await res.json().catch(() => ({}));
          showError(body?.error || `Failed to update bookmark (${res.status})`);
        }
      } catch (err) {
        setBookmarked(previous);
        showError(err instanceof Error ? err.message : 'Failed to update bookmark');
      } finally {
        setBookmarkInFlight(false);
      }
    })();
  }, [user, bookmarkInFlight, bookmarked, trailId, showError]);

  // --- Anon notes toggle (owner-only) ------------------------------------

  const isOwner = !!user && !!resolved && user.id === resolved.ownerGithubId;
  const onToggleAnonNotes = useCallback(() => {
    if (!isOwner || anonToggleInFlight) return;
    const previous = allowAnonNotes;
    const next = !previous;
    setAllowAnonNotes(next);
    setAnonToggleInFlight(true);
    void (async () => {
      try {
        const res = await fetch(`/api/trails/by-id/${trailId}/settings`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ allowAnonNotes: next }),
        });
        if (!res.ok) {
          setAllowAnonNotes(previous);
          const body = await res.json().catch(() => ({}));
          showError(body?.error || `Failed to update setting (${res.status})`);
        }
      } catch (err) {
        setAllowAnonNotes(previous);
        showError(
          err instanceof Error ? err.message : 'Failed to update setting',
        );
      } finally {
        setAnonToggleInFlight(false);
      }
    })();
  }, [isOwner, anonToggleInFlight, allowAnonNotes, trailId, showError]);

  // --- Panel wiring ------------------------------------------------------

  const events = useMemo<PanelEventEmitter>(() => new PanelEventBus(), []);

  const owner = resolved?.owner;
  const repo = resolved?.repo;
  const fileTree = resolved?.fileTree;
  const authoredSha = resolved?.authoredSha;

  const repository = useMemo<FileCityTrailExplorerRepository | null>(() => {
    if (!owner || !repo) return null;
    const id = livePayload?.repos?.[0]?.id ?? `${owner}/${repo}`;
    return { id, owner, name: repo };
  }, [owner, repo, livePayload]);

  const context = useMemo<
    PanelContextValue<FileCityTrailExplorerPanelContext> | null
  >(() => {
    if (!fileTree || !livePayload || !repository) return null;

    const fileTreeSlice: DataSlice<FileTree> = {
      scope: 'repository',
      name: 'fileTree',
      data: fileTree,
      loading: false,
      error: null,
      refresh: async () => {},
    };

    const trailSlice: DataSlice<TrailPayload | null> = {
      scope: 'repository',
      name: 'trail',
      data: livePayload,
      loading: false,
      error: null,
      refresh: async () => {},
    };

    return {
      currentScope: { type: 'repository' },
      refresh: async () => {},
      fileTree: fileTreeSlice,
      lineCounts: nullSlice('lineCounts'),
      trail: trailSlice,
      highlightLayers: nullSlice('highlightLayers'),
      repository,
    };
  }, [fileTree, livePayload, repository]);

  const readFile = useCallback(
    async (path: string): Promise<string> => {
      if (!owner || !repo) throw new Error('Trail not loaded yet');
      let cleanPath = path;
      if (cleanPath.startsWith('/')) cleanPath = cleanPath.slice(1);
      if (cleanPath.startsWith('GitHub/')) {
        cleanPath = cleanPath.slice('GitHub/'.length);
      }
      const repoPrefix = `${owner}/${repo}/`;
      if (cleanPath.startsWith(repoPrefix)) {
        cleanPath = cleanPath.slice(repoPrefix.length);
      }

      const response = await fetch(
        `/api/github/repo/${owner}/${repo}?action=file&path=${encodeURIComponent(cleanPath)}${
          authoredSha ? `&ref=${encodeURIComponent(authoredSha)}` : ''
        }`,
      );
      if (!response.ok) {
        throw new Error(`Failed to read file: ${response.statusText}`);
      }
      const data = await response.json();
      if (data.content && data.encoding === 'base64') {
        const binaryString = atob(String(data.content).replace(/\n/g, ''));
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return new TextDecoder('utf-8').decode(bytes);
      }
      return typeof data.content === 'string' ? data.content : '';
    },
    [owner, repo, authoredSha],
  );

  const createTrailNote = useCallback(
    async (
      _payloadId: string,
      draft: TrailNoteDraft,
    ): Promise<TrailNote | null> => {
      if (!user) {
        if (allowAnonNotes) {
          try {
            const res = await fetch(
              `/api/trails/by-id/${trailId}/anon-notes`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(draft),
              },
            );
            if (!res.ok) {
              const body = await res.json().catch(() => ({}));
              showError(
                body?.error || `Failed to post anonymous note (${res.status})`,
              );
              return null;
            }
            const { note } = (await res.json()) as { note: TrailNote };
            setLivePayload((prev) =>
              prev ? { ...prev, notes: [...(prev.notes ?? []), note] } : prev,
            );
            return note;
          } catch (err) {
            showError(
              err instanceof Error
                ? err.message
                : 'Failed to post anonymous note',
            );
            return null;
          }
        }

        const now = new Date().toISOString();
        const note: TrailNote =
          draft.kind === 'markdown'
            ? {
                id: newLocalId(),
                kind: 'markdown',
                scope: draft.scope,
                anchor: draft.anchor,
                body: draft.body,
                author: LOCAL_AUTHOR,
                createdAt: now,
                updatedAt: now,
              }
            : draft.kind === 'marker'
              ? {
                  id: newLocalId(),
                  kind: 'marker',
                  scope: draft.scope,
                  body: draft.body,
                  author: LOCAL_AUTHOR,
                  createdAt: now,
                  updatedAt: now,
                }
              : {
                  id: newLocalId(),
                  kind: 'snippet',
                  scope: draft.scope,
                  anchor: draft.anchor,
                  body: draft.body,
                  author: LOCAL_AUTHOR,
                  createdAt: now,
                  updatedAt: now,
                };
        appendLocalNote(trailId, note);
        setLivePayload((prev) =>
          prev ? { ...prev, notes: [...(prev.notes ?? []), note] } : prev,
        );
        showLocalSavedStatus();
        return note;
      }

      try {
        const res = await fetch(`/api/trails/by-id/${trailId}/notes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draft),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          showError(body?.error || `Failed to create note (${res.status})`);
          return null;
        }
        const { note } = (await res.json()) as { note: TrailNote };
        setLivePayload((prev) =>
          prev ? { ...prev, notes: [...(prev.notes ?? []), note] } : prev,
        );
        return note;
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Failed to create note');
        return null;
      }
    },
    [trailId, user, allowAnonNotes, showError, showLocalSavedStatus],
  );

  const updateTrailNote = useCallback(
    async (
      _payloadId: string,
      noteId: string,
      body: string,
    ): Promise<TrailNote | null> => {
      if (isAnonNoteId(noteId)) {
        showError('Anonymous notes cannot be edited.');
        return null;
      }
      if (isLocalId(noteId)) {
        const updated = replaceLocalNote(trailId, noteId, body);
        if (!updated) {
          showError('Local note not found');
          return null;
        }
        setLivePayload((prev) =>
          prev
            ? {
                ...prev,
                notes: (prev.notes ?? []).map((n) =>
                  n.id === noteId ? updated : n,
                ),
              }
            : prev,
        );
        showLocalSavedStatus();
        return updated;
      }
      if (!user) {
        showError('Sign in to edit shared notes.');
        return null;
      }
      try {
        const res = await fetch(
          `/api/trails/by-id/${trailId}/notes/${encodeURIComponent(noteId)}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ body }),
          },
        );
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          showError(errBody?.error || `Failed to update note (${res.status})`);
          return null;
        }
        const { note } = (await res.json()) as { note: TrailNote };
        setLivePayload((prev) =>
          prev
            ? {
                ...prev,
                notes: (prev.notes ?? []).map((n) =>
                  n.id === note.id ? note : n,
                ),
              }
            : prev,
        );
        return note;
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Failed to update note');
        return null;
      }
    },
    [trailId, user, showError, showLocalSavedStatus],
  );

  const deleteTrailNote = useCallback(
    async (_payloadId: string, noteId: string): Promise<void> => {
      if (isLocalId(noteId)) {
        removeLocalNote(trailId, noteId);
        setLivePayload((prev) =>
          prev
            ? { ...prev, notes: (prev.notes ?? []).filter((n) => n.id !== noteId) }
            : prev,
        );
        return;
      }
      if (!user) {
        showError('Sign in to delete shared notes.');
        return;
      }
      const endpoint = isAnonNoteId(noteId)
        ? `/api/trails/by-id/${trailId}/anon-notes/${encodeURIComponent(noteId)}`
        : `/api/trails/by-id/${trailId}/notes/${encodeURIComponent(noteId)}`;
      try {
        const res = await fetch(endpoint, { method: 'DELETE' });
        if (!res.ok && res.status !== 204) {
          const errBody = await res.json().catch(() => ({}));
          showError(errBody?.error || `Failed to delete note (${res.status})`);
          return;
        }
        setLivePayload((prev) =>
          prev
            ? { ...prev, notes: (prev.notes ?? []).filter((n) => n.id !== noteId) }
            : prev,
        );
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Failed to delete note');
      }
    },
    [trailId, user, showError],
  );

  const createTrailSignOff = useCallback(
    async (
      _payloadId: string,
      draft: TrailSignOffDraft,
    ): Promise<TrailSignOff | null> => {
      if (!user) {
        const now = new Date().toISOString();
        const signOff: TrailSignOff = {
          id: newLocalId(),
          author: LOCAL_AUTHOR,
          signedAt: now,
          ...(draft.comment !== undefined ? { comment: draft.comment } : {}),
        };
        appendLocalSignOff(trailId, signOff);
        setLivePayload((prev) =>
          prev
            ? { ...prev, signOffs: [...(prev.signOffs ?? []), signOff] }
            : prev,
        );
        showLocalSavedStatus();
        return signOff;
      }
      try {
        const res = await fetch(`/api/trails/by-id/${trailId}/sign-offs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draft),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          showError(body?.error || `Failed to sign off (${res.status})`);
          return null;
        }
        const { signOff } = (await res.json()) as { signOff: TrailSignOff };
        setLivePayload((prev) =>
          prev
            ? { ...prev, signOffs: [...(prev.signOffs ?? []), signOff] }
            : prev,
        );
        return signOff;
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Failed to sign off');
        return null;
      }
    },
    [trailId, user, showError, showLocalSavedStatus],
  );

  const deleteTrailSignOff = useCallback(
    async (_payloadId: string, signOffId: string): Promise<void> => {
      if (isLocalId(signOffId)) {
        removeLocalSignOff(trailId, signOffId);
        setLivePayload((prev) =>
          prev
            ? {
                ...prev,
                signOffs: (prev.signOffs ?? []).filter(
                  (s) => s.id !== signOffId,
                ),
              }
            : prev,
        );
        return;
      }
      if (!user) {
        showError('Sign in to remove shared sign-offs.');
        return;
      }
      try {
        const res = await fetch(
          `/api/trails/by-id/${trailId}/sign-offs/${encodeURIComponent(signOffId)}`,
          { method: 'DELETE' },
        );
        if (!res.ok && res.status !== 204) {
          const errBody = await res.json().catch(() => ({}));
          showError(
            errBody?.error || `Failed to remove sign-off (${res.status})`,
          );
          return;
        }
        setLivePayload((prev) =>
          prev
            ? {
                ...prev,
                signOffs: (prev.signOffs ?? []).filter(
                  (s) => s.id !== signOffId,
                ),
              }
            : prev,
        );
      } catch (err) {
        showError(
          err instanceof Error ? err.message : 'Failed to remove sign-off',
        );
      }
    },
    [trailId, user, showError],
  );

  const actions = useMemo<FileCityTrailExplorerPanelActions>(
    () => ({
      openFile: () => {
        // Trail viewer has no editor surface to open into; opening a file
        // would have nowhere to render. Intentional no-op.
      },
      readFile,
      createTrailNote,
      updateTrailNote,
      deleteTrailNote,
      createTrailSignOff,
      deleteTrailSignOff,
    }),
    [
      readFile,
      createTrailNote,
      updateTrailNote,
      deleteTrailNote,
      createTrailSignOff,
      deleteTrailSignOff,
    ],
  );

  // --- Output ------------------------------------------------------------

  if (error) {
    return {
      state: 'error',
      trailId,
      message: error.message,
      code: error.code,
    };
  }

  if (!resolved || !livePayload || !context) {
    return { state: 'loading', trailId };
  }

  return {
    state: 'ok',
    trailId,
    owner: resolved.owner,
    repo: resolved.repo,
    livePayload,
    hasNotes: (livePayload.notes ?? []).length > 0,
    bookmarked,
    bookmarkToggleInFlight: bookmarkInFlight,
    onToggleBookmark,
    isOwner,
    allowAnonNotes,
    anonNotesToggleInFlight: anonToggleInFlight,
    onToggleAnonNotes,
    showSignIn: !user,
    onSignIn,
    headerStatus,
    context,
    actions,
    events,
    // Anonymous viewers get no `currentAuthor`, so the panel hides the
    // inline note Edit/Delete buttons. (Local anon notes are authored
    // LOCAL_AUTHOR; we deliberately don't surface them as editable here.)
    currentAuthor: user?.login,
    toast,
    dismissToast,
  };
}

// --------------------------------------------------------------------
// Presentational viewer
// --------------------------------------------------------------------

export interface TrailViewerProps {
  session: TrailSession;
  /**
   * At mobile width (<768px), keep the city map visible as a fixed-size
   * band beneath the brief. Defaults to the panel's own default (false).
   */
  mobileShowMap?: boolean;
  /**
   * Top/bottom orientation of the mobile map band (only meaningful
   * alongside mobileShowMap). Defaults to the panel's own
   * default ('bottom') when omitted.
   */
  mobileMapSide?: 'top' | 'bottom';
}

/**
 * Presentational shell — renders the loading warm-up, error view, or
 * the FileCity panel + toast depending on the session state. Callers
 * are responsible for rendering whatever header they want above this
 * (or none at all).
 */
export function TrailViewer({
  session,
  mobileShowMap,
  mobileMapSide,
}: TrailViewerProps) {
  const { theme } = useTheme();

  // Resolve every author login on the trail (note authors, sign-off authors,
  // verified visitors, the trail author) to a GitHub display name. The 'You'
  // (local optimistic) and 'Anonymous' (anon route) sentinels are not logins,
  // so they're excluded and render as-is. Display-only — the panel keeps
  // using the raw login for ownership/identity comparisons.
  const payload = session.state === 'ok' ? session.livePayload : null;
  const authorLogins = useMemo(() => {
    if (!payload) return [];
    const sentinels = new Set(['You', 'Anonymous']);
    const set = new Set<string>();
    const add = (v?: string | null) => {
      if (v && !sentinels.has(v)) set.add(v);
    };
    add(payload.author);
    for (const n of payload.notes ?? []) add(n.author);
    for (const s of payload.signOffs ?? []) add(s.author);
    for (const v of payload.visitors?.named ?? []) add(v);
    return Array.from(set);
  }, [payload]);
  const authorNames = useAuthorNames(authorLogins);

  if (session.state === 'error') {
    return <TrailErrorView message={session.message} code={session.code} />;
  }

  if (session.state === 'loading') {
    // Render a hidden FileCity3D (with sample city data) so the chunk
    // loads, WebGL context inits, and shaders compile before the real
    // panel ever mounts. The loading animation overlays it.
    return (
      <div className="relative w-full h-full">
        <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
          <FileCity3D
            cityData={WARMING_CITY_DATA}
            width="100%"
            height="100%"
            showControls={false}
          />
        </div>
        <div style={{ position: 'absolute', inset: 0, zIndex: 50 }}>
          <TrailLoadingScreen />
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full h-full flex flex-col overflow-hidden"
      style={{ background: theme.colors.background }}
    >
      <div className="flex-1 min-h-0">
        <FileCityTrailExplorerPanel
          context={session.context}
          actions={session.actions}
          events={session.events}
          currentAuthor={session.currentAuthor}
          authorNames={authorNames}
          briefLayout="split"
          defaultShowSequenceDrawer={true}
          defaultHideMap
          mobileShowMap={mobileShowMap}
          mobileMapSide={mobileMapSide}
          hideGraphToggle
          hideVisitorsRoster
          hideNotesByRoster
        />
      </div>
      {session.toast && (
        <div
          className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg"
          style={{
            background: theme.colors.error,
            color: '#fff',
            border: `1px solid ${theme.colors.border}`,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1ZM7 4.5a1 1 0 1 1 2 0v3a1 1 0 1 1-2 0v-3Zm1 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" />
          </svg>
          <span style={{ fontSize: theme.fontSizes[1] }}>
            {session.toast.message}
          </span>
          <button
            onClick={session.dismissToast}
            className="ml-2 opacity-70 hover:opacity-100"
            style={{ color: 'inherit' }}
            aria-label="Dismiss"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L7 6.293l1.646-1.647a.5.5 0 0 1 .708.708L7.707 7l1.647 1.646a.5.5 0 0 1-.708.708L7 7.707l-1.646 1.647a.5.5 0 0 1-.708-.708L6.293 7 4.646 5.354a.5.5 0 0 1 0-.708z" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
