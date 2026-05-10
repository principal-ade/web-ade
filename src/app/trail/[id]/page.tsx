'use client';

/**
 * Trail page — standalone viewer for a shared trail.
 *
 * Resolves the trail by id (no owner/repo in the URL) via
 * /api/trails/by-id/{id}, then renders FileCityTrailExplorerPanel with
 * the minimum context the panel requires. Intentionally avoids
 * RepositoryPageProvider so a shared trail link doesn't drag in the
 * editor's full data graph.
 *
 * The trail medium ships parallel to sequence diagrams — this page only
 * handles trails. Sequence diagrams are still served from
 * /d/{owner}/{repo}/{id} via the existing sequence-diagram surface.
 */

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
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
import { MapPinOff, AlertTriangle, Github } from 'lucide-react';
import { trpc } from '@/lib/trpc/client';
import { useAuth } from '@/contexts/AuthContext';
import { PrivatePropertySign } from './PrivatePropertySign';
import { TrailLoadingAnimation } from '@/components/trail/TrailLoadingAnimation';
import { TrailHeader } from '@/components/trail/TrailHeader';
import type {
  FileCityTrailExplorerPanelActions,
  FileCityTrailExplorerPanelContext,
  FileCityTrailExplorerRepository,
} from '@industry-theme/file-city-panel';
import {
  ShareErrorCodes,
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

// FileCity3D loaded directly so we can warm WebGL / shader caches with a
// minimal sample scene during the loading screen, without dragging in the
// trail panel's state machine (which behaved oddly with skeleton data).
const FileCity3D = dynamic(
  () => import('@principal-ai/file-city-react').then((m) => m.FileCity3D),
  { ssr: false },
);

// Warm both chunks at module evaluate time, in parallel with the trail
// data fetch. By the time data resolves and TrailViewer mounts, the panel
// chunk is cached and FC3D has already mounted+rendered behind the loading
// screen — so the panel's first FC3D mount inherits the warm GPU caches.
// See docs/nextjs-3d-rendering-issue.md.
if (typeof window !== 'undefined') {
  void (FileCityTrailExplorerPanel as { preload?: () => Promise<unknown> }).preload?.();
  void (FileCity3D as { preload?: () => Promise<unknown> }).preload?.();
}

interface TrailResponse {
  owner: string;
  repo: string;
  entry: SharedTrailIndexEntry;
  payload: TrailPayload;
}

interface TrailContext {
  owner: string;
  repo: string;
  payload: TrailPayload;
  fileTree: FileTree;
}

// Sample CityData used to warm FC3D's WebGL / shader caches during the
// loading screen. Mounted directly (not via the trail panel) so warming
// is independent of the panel's state machine. Diverse extensions so the
// full file-color shader set compiles before the real city paints.
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

function TrailLoadingScreen() {
  const { theme } = useTheme();
  return (
    <div
      className="w-screen flex items-center justify-center overflow-hidden"
      style={{ background: theme.colors.background, height: '100vh' }}
    >
      <TrailLoadingAnimation />
    </div>
  );
}

function TrailErrorView({
  message,
  code,
}: {
  message: string;
  code: ShareErrorCode | null;
}) {
  const { theme } = useTheme();
  const { isAuthenticated, login } = useAuth();

  const isNoAccess = code === ShareErrorCodes.NO_REPO_ACCESS;
  const isNotFound = code === ShareErrorCodes.NOT_FOUND;
  const showLogin = isNoAccess && !isAuthenticated;

  const Icon = isNotFound ? MapPinOff : AlertTriangle;
  const title = isNoAccess
    ? 'This trail is in a private repository'
    : isNotFound
      ? 'Trail not found'
      : 'Trail unavailable';
  const helper =
    isNoAccess && !showLogin
      ? 'Your current GitHub account does not have read access to this repository.'
      : null;

  return (
    <div
      className="w-screen flex items-center justify-center px-4"
      style={{ background: theme.colors.background, height: '100vh' }}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-lg border px-10 py-12 text-center shadow-sm"
        style={{
          color: theme.colors.text,
          background: theme.colors.backgroundSecondary ?? theme.colors.background,
          borderColor: theme.colors.border ?? 'rgba(255,255,255,0.08)',
        }}
      >
        {isNoAccess ? (
          <div className="-mx-10 -mt-12 mb-6 flex items-center justify-center">
            <PrivatePropertySign />
          </div>
        ) : (
          <div
            className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full"
            style={{
              background: `${theme.colors.accent}1a`,
              color: theme.colors.accent,
            }}
          >
            <Icon size={30} strokeWidth={1.75} />
          </div>
        )}
        <h1
          className="text-2xl font-semibold mb-3"
          style={isNoAccess ? { color: theme.colors.primary } : undefined}
        >
          {title}
        </h1>
        {(helper || !isNoAccess) && (
          <p
            className="text-base leading-relaxed"
            style={{ color: theme.colors.textMuted }}
          >
            {helper ?? message}
          </p>
        )}
        {showLogin && (
          <button
            type="button"
            onClick={() => login()}
            className="mt-8 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md text-base font-medium transition-opacity hover:opacity-90"
            style={{
              background: theme.colors.accent,
              color: theme.colors.background,
            }}
          >
            <Github size={18} strokeWidth={2} />
            Sign in with GitHub
          </button>
        )}
        <div className="mt-8">
          <Link
            href="/"
            className="text-sm underline-offset-2 hover:underline"
            style={{ color: theme.colors.textMuted }}
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}

function TrailViewer({ owner, repo, payload, fileTree }: TrailContext) {
  const trailId = payload.id;
  const { theme } = useTheme();
  const { user, login } = useAuth();

  // Live payload merges three layers: the server payload (immutable
  // source of truth), any signed-out localStorage mutations made in
  // this browser, and the in-memory result of the last mutation. The
  // useEffect re-merges whenever `payload` (from the server) changes
  // or the user signs in/out.
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

  const [livePayload, setLivePayload] = useState<TrailPayload>(() =>
    mergeServerWithLocal(payload),
  );
  useEffect(() => {
    setLivePayload(mergeServerWithLocal(payload));
  }, [payload, mergeServerWithLocal]);

  const [toast, setToast] = useState<{ message: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  const showError = useCallback((message: string) => {
    setToast({ message });
  }, []);

  /**
   * Header-centered status text shown after a localStorage-only
   * mutation. Auto-clears so the slot returns to empty; the caller
   * just sets the message string and the header fades it in/out.
   */
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
  const handleSignIn = useCallback(() => {
    login(window.location.pathname);
  }, [login]);

  const events = useMemo<PanelEventEmitter>(() => new PanelEventBus(), []);

  const repository = useMemo<FileCityTrailExplorerRepository>(() => {
    // For multi-repo trails the panel filters markers by `id`. Single-repo
    // trails carry no `marker.repo`, so any id passes the filter — we
    // mirror the payload's first registered repo when present and fall
    // back to "owner/repo" as a stable synthetic id otherwise.
    const id = livePayload.repos?.[0]?.id ?? `${owner}/${repo}`;
    return { id, owner, name: repo };
  }, [owner, repo, livePayload]);

  const context = useMemo<
    PanelContextValue<FileCityTrailExplorerPanelContext>
  >(() => {
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
      repository,
    };
  }, [fileTree, livePayload, repository]);

  const readFile = useCallback(
    async (path: string): Promise<string> => {
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
        `/api/github/repo/${owner}/${repo}?action=file&path=${encodeURIComponent(cleanPath)}`,
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
    [owner, repo],
  );

  const createTrailNote = useCallback(
    async (
      _payloadId: string,
      draft: TrailNoteDraft,
    ): Promise<TrailNote | null> => {
      if (!user) {
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
        setLivePayload((prev) => ({
          ...prev,
          notes: [...(prev.notes ?? []), note],
        }));
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
        setLivePayload((prev) => ({
          ...prev,
          notes: [...(prev.notes ?? []), note],
        }));
        return note;
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Failed to create note');
        return null;
      }
    },
    [trailId, user, showError, showLocalSavedStatus],
  );

  const updateTrailNote = useCallback(
    async (
      _payloadId: string,
      noteId: string,
      body: string,
    ): Promise<TrailNote | null> => {
      if (isLocalId(noteId)) {
        const updated = replaceLocalNote(trailId, noteId, body);
        if (!updated) {
          showError('Local note not found');
          return null;
        }
        setLivePayload((prev) => ({
          ...prev,
          notes: (prev.notes ?? []).map((n) => (n.id === noteId ? updated : n)),
        }));
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
        setLivePayload((prev) => ({
          ...prev,
          notes: (prev.notes ?? []).map((n) => (n.id === note.id ? note : n)),
        }));
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
        setLivePayload((prev) => ({
          ...prev,
          notes: (prev.notes ?? []).filter((n) => n.id !== noteId),
        }));
        return;
      }
      if (!user) {
        showError('Sign in to delete shared notes.');
        return;
      }
      try {
        const res = await fetch(
          `/api/trails/by-id/${trailId}/notes/${encodeURIComponent(noteId)}`,
          { method: 'DELETE' },
        );
        if (!res.ok && res.status !== 204) {
          const errBody = await res.json().catch(() => ({}));
          showError(errBody?.error || `Failed to delete note (${res.status})`);
          return;
        }
        setLivePayload((prev) => ({
          ...prev,
          notes: (prev.notes ?? []).filter((n) => n.id !== noteId),
        }));
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
        setLivePayload((prev) => ({
          ...prev,
          signOffs: [...(prev.signOffs ?? []), signOff],
        }));
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
        setLivePayload((prev) => ({
          ...prev,
          signOffs: [...(prev.signOffs ?? []), signOff],
        }));
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
        setLivePayload((prev) => ({
          ...prev,
          signOffs: (prev.signOffs ?? []).filter((s) => s.id !== signOffId),
        }));
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
        setLivePayload((prev) => ({
          ...prev,
          signOffs: (prev.signOffs ?? []).filter((s) => s.id !== signOffId),
        }));
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

  return (
    <div
      className="w-screen flex flex-col overflow-hidden"
      style={{ background: theme.colors.background, height: '100vh' }}
    >
      <TrailHeader
        owner={owner}
        repo={repo}
        trailId={trailId}
        statusMessage={headerStatus}
        showSignIn={!user}
        onSignIn={handleSignIn}
      />
      <div className="flex-1 min-h-0">
        <FileCityTrailExplorerPanel
          context={context}
          actions={actions}
          events={events}
          currentAuthor={user?.login ?? LOCAL_AUTHOR}
        />
      </div>
      {toast && (
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
          <span style={{ fontSize: theme.fontSizes[1] }}>{toast.message}</span>
          <button
            onClick={() => setToast(null)}
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

export default function TrailPage() {
  const params = useParams();
  const id = params?.id as string | undefined;

  const [data, setData] = useState<TrailContext | null>(null);
  const [error, setError] = useState<{
    message: string;
    code: ShareErrorCode | null;
  } | null>(null);

  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    // Minimum loading window so the warming FileCity3D (rendered behind
    // the loading screen) has time to mount, init WebGL, and compile its
    // shader programs before the real panel takes over. Without this,
    // very fast trail fetches can dismiss the overlay before warming
    // completes and the flash returns. See
    // docs/nextjs-3d-rendering-issue.md.
    const MIN_LOADING_MS = 2000;
    const minDelay = new Promise<void>((resolve) =>
      setTimeout(resolve, MIN_LOADING_MS),
    );

    async function load() {
      try {
        const res = await fetch(`/api/trails/by-id/${encodeURIComponent(id!)}`);
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

        const treeData = await trpc.github.getTree.query({
          owner: trail.owner,
          repo: trail.repo,
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
        // Hold off the data swap until the warming window has elapsed.
        await minDelay;
        if (cancelled) return;
        setData({
          owner: trail.owner,
          repo: trail.repo,
          payload: trail.payload,
          fileTree: tree,
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
  }, [id]);

  useEffect(() => {
    if (data?.payload?.title) {
      document.title = `${data.payload.title} · Trail`;
    } else {
      document.title = 'Trail';
    }
  }, [data]);

  if (error)
    return <TrailErrorView message={error.message} code={error.code} />;

  if (!data) {
    // Loading: render a hidden FileCity3D (with sample city data) so the
    // chunk loads, WebGL context inits, and shaders compile before the
    // real panel ever mounts. The loading animation overlays it. When
    // data arrives we unmount the warmer and mount TrailViewer; the
    // panel's first FC3D mount inherits the warm GPU caches → no flash.
    return (
      <>
        <div style={{ position: 'fixed', inset: 0, zIndex: 0 }}>
          <FileCity3D
            cityData={WARMING_CITY_DATA}
            width="100%"
            height="100%"
            showControls={false}
          />
        </div>
        <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
          <TrailLoadingScreen />
        </div>
      </>
    );
  }

  return (
    <TrailViewer
      owner={data.owner}
      repo={data.repo}
      payload={data.payload}
      fileTree={data.fileTree}
    />
  );
}
