import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import React from 'react';
import { ThemeProvider } from '@principal-ade/industry-theme';
import TopicPage from './page';
import { AuthProvider } from '@/contexts/AuthContext';
import type { TopicComment, TopicPayload } from '@/lib/topics/types';
import type { SharedTrailIndexEntry } from '@/lib/trails/types';

// ---- Fixtures ---------------------------------------------------------------

const OWNER_USER = {
  id: 583231,
  login: 'octocat',
  email: 'octocat@github.com',
  name: 'Octo Cat',
  avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4',
};

const VIEWER_USER = {
  id: 12345,
  login: 'visitor',
  email: 'visitor@example.com',
  name: 'Anon Visitor',
};

const THIRD_PARTY_AUTHOR = {
  githubId: 776655,
  githubLogin: 'curious-dev',
};

const TOPIC_ID = 'topic-fixture-1';

function makeTopic(overrides?: Partial<TopicPayload>): TopicPayload {
  return {
    id: TOPIC_ID,
    title: 'How three repos handle auth token refresh',
    description:
      'A side-by-side look at proactive token refresh in three different codebases.\n\nEach trail walks the same conceptual flow — detect upcoming expiry, refresh in the background, gracefully fall back on failure — but in a different language and runtime.',
    trailIds: ['trail-a', 'trail-b', 'trail-c'],
    createdBy: { githubId: OWNER_USER.id, githubLogin: OWNER_USER.login },
    createdAt: '2026-04-01T12:00:00.000Z',
    updatedAt: '2026-05-15T09:30:00.000Z',
    ...overrides,
  };
}

function makeTrailEntry(
  id: string,
  title: string,
  overrides?: Partial<SharedTrailIndexEntry>,
): SharedTrailIndexEntry {
  return {
    id,
    title,
    summaryPreview:
      'Walks the AuthContext refresh loop: a 60s check tick reads token-status, fires /refresh when within the 5-minute window, and backs off with exponential delays on transient failures.',
    markerCount: 7,
    repoNames: ['web-ade'],
    hasDiffSnippets: false,
    createdAt: '2026-03-12T10:00:00.000Z',
    updatedAt: '2026-04-02T15:20:00.000Z',
    createdBy: { githubId: OWNER_USER.id, githubLogin: OWNER_USER.login },
    githubRepoId: 1296269,
    ...overrides,
  };
}

interface MockState {
  topic: TopicPayload | null;
  topicStatus?: number;
  topicError?: { error: string; code: string };
  user: typeof OWNER_USER | typeof VIEWER_USER | null;
  trails: Record<
    string,
    | { status: 'ok'; entry: SharedTrailIndexEntry; owner: string; repo: string }
    | { status: 'error'; httpStatus: number; error: string; code: string }
    | { status: 'pending' }
  >;
  comments?: TopicComment[];
  /** Optional override so a story can force unauth on comment writes. */
  commentsWriteStatus?: number;
  commentsWriteError?: { error: string; code: string };
}

function makeComment(
  overrides: Partial<TopicComment> & { id: string; body: string },
): TopicComment {
  const now = new Date().toISOString();
  return {
    topicId: TOPIC_ID,
    createdAt: now,
    updatedAt: now,
    author: THIRD_PARTY_AUTHOR,
    ...overrides,
  };
}

let mockCommentSeq = 1;
function nextCommentId(): string {
  return `mock-comment-${Date.now()}-${mockCommentSeq++}`;
}

/** Fixture: a short discussion mixing the curator with a third-party commenter. */
function seedDiscussion(): TopicComment[] {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();
  return [
    makeComment({
      id: 'seed-1',
      body: 'Nice side-by-side. The Tauri version sidesteps the renderer entirely, right? Curious how cancellation flows back into the Rust task.',
      author: THIRD_PARTY_AUTHOR,
      createdAt: new Date(now - 3 * day).toISOString(),
      updatedAt: new Date(now - 3 * day).toISOString(),
    }),
    makeComment({
      id: 'seed-2',
      body: 'Yeah — `trail-c` covers exactly that. The renderer listens for a `tokens.refreshed` event and treats anything else as a quiet retry tick.',
      author: { githubId: OWNER_USER.id, githubLogin: OWNER_USER.login },
      createdAt: new Date(now - 3 * day + 2 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now - 3 * day + 2 * 60 * 60 * 1000).toISOString(),
    }),
    makeComment({
      id: 'seed-3',
      body: 'Heads up — the **electron** trail still references the old `tokenStatus.expiresIn` field. I think we renamed that.',
      author: { githubId: 998877, githubLogin: 'eagle-eyed' },
      createdAt: new Date(now - 12 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now - 11 * 60 * 60 * 1000).toISOString(),
    }),
    makeComment({
      id: 'seed-4',
      body: 'Quick clarification on the proactive-refresh window — is the 5 min hard-coded or env-driven anywhere?',
      author: THIRD_PARTY_AUTHOR,
      createdAt: new Date(now - 20 * 60 * 1000).toISOString(),
      updatedAt: new Date(now - 20 * 60 * 1000).toISOString(),
    }),
  ];
}

// ---- fetch mock harness -----------------------------------------------------

function installFetchMock(state: MockState) {
  const original = global.fetch;
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();

    if (url.endsWith('/api/auth/me')) {
      return jsonResponse({
        isAuthenticated: !!state.user,
        user: state.user,
      });
    }

    if (url.endsWith('/api/auth/token-status')) {
      return jsonResponse({
        authenticated: !!state.user,
        expiresAt: null,
        expiresIn: null,
        shouldRefresh: false,
      });
    }

    const profileMatch = url.match(/\/api\/github\/user-profile\/([^/?]+)$/);
    if (profileMatch) {
      const login = profileMatch[1]!;
      if (login === OWNER_USER.login) {
        return jsonResponse({
          login: OWNER_USER.login,
          id: OWNER_USER.id,
          name: OWNER_USER.name,
          avatar_url: OWNER_USER.avatar_url,
        });
      }
      return jsonResponse({
        login,
        id: 0,
        name: null,
        avatar_url: `https://avatars.githubusercontent.com/u/0?v=4`,
      });
    }

    const topicMatch = url.match(/\/api\/topics\/by-id\/([^/?]+)$/);
    if (topicMatch) {
      if (method === 'GET') {
        if (!state.topic || state.topicError) {
          return jsonResponse(
            state.topicError ?? { error: 'Topic not found', code: 'NOT_FOUND' },
            state.topicStatus ?? 404,
          );
        }
        return jsonResponse({ topic: state.topic });
      }
      if (method === 'PATCH' && state.topic) {
        const body = init?.body ? JSON.parse(init.body as string) : {};
        state.topic = {
          ...state.topic,
          title: body.title ?? state.topic.title,
          description: body.description ?? state.topic.description,
          updatedAt: new Date().toISOString(),
        };
        return jsonResponse({ topic: state.topic });
      }
      if (method === 'DELETE') {
        return jsonResponse({ ok: true });
      }
    }

    const addTrailMatch = url.match(/\/api\/topics\/by-id\/([^/]+)\/trails$/);
    if (addTrailMatch && method === 'POST' && state.topic) {
      const body = init?.body ? JSON.parse(init.body as string) : {};
      const newId = body.trailId as string;
      if (!state.trails[newId]) {
        state.trails[newId] = {
          status: 'ok',
          entry: makeTrailEntry(newId, 'Newly added trail'),
          owner: 'octocat',
          repo: 'sample-repo',
        };
      }
      state.topic = {
        ...state.topic,
        trailIds: [...state.topic.trailIds, newId],
        updatedAt: new Date().toISOString(),
      };
      return jsonResponse({ topic: state.topic });
    }

    const removeTrailMatch = url.match(
      /\/api\/topics\/by-id\/([^/]+)\/trails\/([^/]+)$/,
    );
    if (removeTrailMatch && method === 'DELETE' && state.topic) {
      const removeId = removeTrailMatch[2]!;
      state.topic = {
        ...state.topic,
        trailIds: state.topic.trailIds.filter((id) => id !== removeId),
        updatedAt: new Date().toISOString(),
      };
      return jsonResponse({ topic: state.topic });
    }

    const commentsListMatch = url.match(
      /\/api\/topics\/by-id\/([^/]+)\/comments$/,
    );
    if (commentsListMatch) {
      if (method === 'GET') {
        const list = state.comments ?? [];
        return jsonResponse({
          topicId: commentsListMatch[1],
          updatedAt: new Date().toISOString(),
          comments: list,
        });
      }
      if (method === 'POST') {
        if (state.commentsWriteError || !state.user) {
          return jsonResponse(
            state.commentsWriteError ?? {
              error: 'Not authenticated',
              code: 'NOT_AUTHENTICATED',
            },
            state.commentsWriteStatus ?? 401,
          );
        }
        const body = init?.body ? JSON.parse(init.body as string) : {};
        const newComment = makeComment({
          id: nextCommentId(),
          body: String(body.body ?? ''),
          author: {
            githubId: state.user.id,
            githubLogin: state.user.login,
          },
        });
        state.comments = [...(state.comments ?? []), newComment];
        return jsonResponse({ comment: newComment }, 201);
      }
    }

    const commentByIdMatch = url.match(
      /\/api\/topics\/by-id\/([^/]+)\/comments\/([^/]+)$/,
    );
    if (commentByIdMatch) {
      const commentId = commentByIdMatch[2]!;
      if (method === 'PATCH') {
        const body = init?.body ? JSON.parse(init.body as string) : {};
        const existing = (state.comments ?? []).find((c) => c.id === commentId);
        if (!existing) {
          return jsonResponse(
            { error: 'Comment not found', code: 'COMMENT_NOT_FOUND' },
            404,
          );
        }
        const updated: TopicComment = {
          ...existing,
          body: String(body.body ?? existing.body),
          updatedAt: new Date().toISOString(),
        };
        state.comments = (state.comments ?? []).map((c) =>
          c.id === commentId ? updated : c,
        );
        return jsonResponse({ comment: updated });
      }
      if (method === 'DELETE') {
        state.comments = (state.comments ?? []).filter(
          (c) => c.id !== commentId,
        );
        return new Response(null, { status: 204 });
      }
    }

    const trailMatch = url.match(/\/api\/trails\/by-id\/([^/?]+)$/);
    if (trailMatch) {
      const trailId = trailMatch[1]!;
      const trail = state.trails[trailId];
      if (!trail || trail.status === 'pending') {
        // Never resolve — keeps loading skeleton visible.
        return new Promise<Response>(() => {});
      }
      if (trail.status === 'error') {
        return jsonResponse(
          { error: trail.error, code: trail.code },
          trail.httpStatus,
        );
      }
      return jsonResponse({
        entry: trail.entry,
        owner: trail.owner,
        repo: trail.repo,
      });
    }

    // Fallback: never resolve, so unrecognized calls don't surprise the UI.
    return new Promise<Response>(() => {});
  }) as typeof global.fetch;

  return () => {
    global.fetch = original;
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// ---- Story shell ------------------------------------------------------------

const StoryShell: React.FC<{ state: MockState; children: React.ReactNode }> = ({
  state,
  children,
}) => {
  const [ready, setReady] = React.useState(false);

  React.useLayoutEffect(() => {
    const restore = installFetchMock(state);
    setReady(true);
    return restore;
  }, [state]);

  if (!ready) return null;

  return (
    <ThemeProvider>
      <AuthProvider>{children}</AuthProvider>
    </ThemeProvider>
  );
};

// ---- Meta -------------------------------------------------------------------

const meta: Meta<typeof TopicPage> = {
  title: 'Pages/TopicPage',
  component: TopicPage,
  parameters: {
    layout: 'fullscreen',
    nextjs: {
      appDirectory: true,
      navigation: {
        pathname: `/topic/${TOPIC_ID}`,
        segments: [['id', TOPIC_ID]],
      },
    },
  },
};
export default meta;
type Story = StoryObj<typeof TopicPage>;

// ---- Stories ----------------------------------------------------------------

/** Public viewer (signed out) — sees curated trails but no editing controls. */
export const PublicViewer: Story = {
  render: () => {
    const state: MockState = {
      topic: makeTopic(),
      user: null,
      trails: {
        'trail-a': {
          status: 'ok',
          entry: makeTrailEntry('trail-a', 'Token refresh in web-ade'),
          owner: 'principal-ade',
          repo: 'web-ade',
        },
        'trail-b': {
          status: 'ok',
          entry: makeTrailEntry('trail-b', 'Token refresh in electron-app', {
            markerCount: 12,
            summaryPreview:
              'Same shape as the web side but driven by a main-process timer and IPC bridge to the renderer.',
          }),
          owner: 'principal-ade',
          repo: 'electron-app',
        },
        'trail-c': {
          status: 'ok',
          entry: makeTrailEntry('trail-c', 'Token refresh in desktop-app', {
            markerCount: 5,
            summaryPreview:
              'Tauri host wires the same refresh tick into a Rust async task; the renderer subscribes via an event.',
          }),
          owner: 'principal-ade',
          repo: 'desktop-app',
        },
      },
      comments: seedDiscussion(),
    };
    return (
      <StoryShell state={state}>
        <TopicPage />
      </StoryShell>
    );
  },
};

/** Owner viewing their own topic — edit, add-trail, remove, and delete are visible. */
export const OwnerView: Story = {
  render: () => {
    const state: MockState = {
      topic: makeTopic(),
      user: OWNER_USER,
      trails: {
        'trail-a': {
          status: 'ok',
          entry: makeTrailEntry('trail-a', 'Token refresh in web-ade'),
          owner: 'principal-ade',
          repo: 'web-ade',
        },
        'trail-b': {
          status: 'ok',
          entry: makeTrailEntry('trail-b', 'Token refresh in electron-app', {
            markerCount: 12,
          }),
          owner: 'principal-ade',
          repo: 'electron-app',
        },
        'trail-c': {
          status: 'ok',
          entry: makeTrailEntry('trail-c', 'Token refresh in desktop-app', {
            markerCount: 5,
          }),
          owner: 'principal-ade',
          repo: 'desktop-app',
        },
      },
      comments: seedDiscussion(),
    };
    return (
      <StoryShell state={state}>
        <TopicPage />
      </StoryShell>
    );
  },
};

/** Signed-in but not the curator — viewer chrome with another user's identity. */
export const SignedInVisitor: Story = {
  render: () => {
    const state: MockState = {
      topic: makeTopic(),
      user: VIEWER_USER,
      trails: {
        'trail-a': {
          status: 'ok',
          entry: makeTrailEntry('trail-a', 'Token refresh in web-ade'),
          owner: 'principal-ade',
          repo: 'web-ade',
        },
        'trail-b': {
          status: 'ok',
          entry: makeTrailEntry('trail-b', 'Token refresh in electron-app'),
          owner: 'principal-ade',
          repo: 'electron-app',
        },
        'trail-c': {
          status: 'ok',
          entry: makeTrailEntry('trail-c', 'Token refresh in desktop-app'),
          owner: 'principal-ade',
          repo: 'desktop-app',
        },
      },
      comments: [
        ...seedDiscussion(),
        makeComment({
          id: 'seed-viewer',
          body: "Adding one of mine so I can demo edit/delete — only this row should show mutate controls for the signed-in visitor.",
          author: { githubId: VIEWER_USER.id, githubLogin: VIEWER_USER.login },
          createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
          updatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        }),
      ],
    };
    return (
      <StoryShell state={state}>
        <TopicPage />
      </StoryShell>
    );
  },
};

/** Empty topic that the owner is viewing — add-trail control front and center. */
export const OwnerEmptyTopic: Story = {
  render: () => {
    const state: MockState = {
      topic: makeTopic({ trailIds: [], title: 'Untitled draft topic', description: '' }),
      user: OWNER_USER,
      trails: {},
    };
    return (
      <StoryShell state={state}>
        <TopicPage />
      </StoryShell>
    );
  },
};

/** Mixed trail states — one loading, one in a private repo, one unavailable. */
export const TrailsWithErrors: Story = {
  render: () => {
    const state: MockState = {
      topic: makeTopic({
        trailIds: ['trail-ok', 'trail-private', 'trail-missing', 'trail-loading'],
      }),
      user: OWNER_USER,
      trails: {
        'trail-ok': {
          status: 'ok',
          entry: makeTrailEntry('trail-ok', 'Token refresh in web-ade'),
          owner: 'principal-ade',
          repo: 'web-ade',
        },
        'trail-private': {
          status: 'error',
          httpStatus: 403,
          error: 'Caller has no access to the source repository.',
          code: 'NO_REPO_ACCESS',
        },
        'trail-missing': {
          status: 'error',
          httpStatus: 404,
          error: 'Trail not found.',
          code: 'NOT_FOUND',
        },
        'trail-loading': { status: 'pending' },
      },
    };
    return (
      <StoryShell state={state}>
        <TopicPage />
      </StoryShell>
    );
  },
};

/** Topic itself fails to load — full-page error card. */
export const TopicNotFound: Story = {
  render: () => {
    const state: MockState = {
      topic: null,
      topicStatus: 404,
      topicError: { error: 'Topic not found.', code: 'NOT_FOUND' },
      user: null,
      trails: {},
    };
    return (
      <StoryShell state={state}>
        <TopicPage />
      </StoryShell>
    );
  },
};

/** Topic fetch never resolves — initial spinner. */
export const LoadingTopic: Story = {
  render: () => {
    const state: MockState = {
      topic: null,
      user: null,
      trails: {},
    };
    // Block the topic fetch by overriding installFetchMock via a flag:
    // simplest path is to swap the topic GET handler — we do it inline.
    const wrappedState: MockState = new Proxy(state, {});
    // Replace topic GET with a never-resolving promise by leaving topic === null
    // AND providing no error: installFetchMock returns 404 in that case, so we
    // need a dedicated handler. Quick workaround: monkey-patch fetch after
    // mount to intercept the topic URL.
    const Wrapper: React.FC = () => {
      React.useLayoutEffect(() => {
        const original = global.fetch;
        global.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === 'string' ? input : input.toString();
          if (url.includes('/api/topics/by-id/')) {
            return new Promise<Response>(() => {});
          }
          if (url.endsWith('/api/auth/me')) {
            return jsonResponse({ isAuthenticated: false, user: null });
          }
          if (url.endsWith('/api/auth/token-status')) {
            return jsonResponse({
              authenticated: false,
              expiresAt: null,
              expiresIn: null,
              shouldRefresh: false,
            });
          }
          return original(input, init);
        }) as typeof global.fetch;
        return () => {
          global.fetch = original;
        };
      }, []);
      return (
        <ThemeProvider>
          <AuthProvider>
            <TopicPage />
          </AuthProvider>
        </ThemeProvider>
      );
    };
    void wrappedState;
    return <Wrapper />;
  },
};

/**
 * Active discussion — owner is viewing a thread that has accumulated several
 * comments across multiple authors. Demonstrates the owner moderation
 * affordance (every row gets edit/delete), relative-timestamp variety, and
 * markdown rendering inside a comment body.
 */
export const ActiveDiscussion: Story = {
  render: () => {
    const day = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const state: MockState = {
      topic: makeTopic(),
      user: OWNER_USER,
      trails: {
        'trail-a': {
          status: 'ok',
          entry: makeTrailEntry('trail-a', 'Token refresh in web-ade'),
          owner: 'principal-ade',
          repo: 'web-ade',
        },
        'trail-b': {
          status: 'ok',
          entry: makeTrailEntry('trail-b', 'Token refresh in electron-app'),
          owner: 'principal-ade',
          repo: 'electron-app',
        },
        'trail-c': {
          status: 'ok',
          entry: makeTrailEntry('trail-c', 'Token refresh in desktop-app'),
          owner: 'principal-ade',
          repo: 'desktop-app',
        },
      },
      comments: [
        makeComment({
          id: 'ad-1',
          body: 'Kicking this off — does anyone else find the 60s tick a little aggressive given how rare actual expiries are?',
          author: { githubId: 222111, githubLogin: 'opener' },
          createdAt: new Date(now - 9 * day).toISOString(),
          updatedAt: new Date(now - 9 * day).toISOString(),
        }),
        makeComment({
          id: 'ad-2',
          body: "It's mainly a clock-skew hedge. We've seen drifts up to ~30s in the wild; halving the tick made the refresh window a non-event.\n\n```ts\nsetInterval(checkTokenStatus, 60_000);\n```",
          author: { githubId: OWNER_USER.id, githubLogin: OWNER_USER.login },
          createdAt: new Date(now - 8 * day - 4 * 60 * 60 * 1000).toISOString(),
          updatedAt: new Date(now - 8 * day - 4 * 60 * 60 * 1000).toISOString(),
        }),
        makeComment({
          id: 'ad-3',
          body: '> halving the tick made the refresh window a non-event\n\nFair. The Tauri side actually leans on a 30s tick because the native clock can be more reliable — worth calling out in the trail.',
          author: THIRD_PARTY_AUTHOR,
          createdAt: new Date(now - 5 * day).toISOString(),
          updatedAt: new Date(now - 5 * day + 30 * 60 * 1000).toISOString(),
        }),
        makeComment({
          id: 'ad-4',
          body: 'Edge case worth checking: what happens if `fetchUser` succeeds but `tokenStatus` 401s in the same tick?',
          author: { githubId: 998877, githubLogin: 'eagle-eyed' },
          createdAt: new Date(now - 3 * day).toISOString(),
          updatedAt: new Date(now - 3 * day).toISOString(),
        }),
        makeComment({
          id: 'ad-5',
          body: "Logged that as follow-up on the trail. Treating it as a 'refresh now and retry once' path.",
          author: { githubId: OWNER_USER.id, githubLogin: OWNER_USER.login },
          createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
          updatedAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
        }),
        makeComment({
          id: 'ad-6',
          body: 'Just hit refresh — should appear at "just now".',
          author: THIRD_PARTY_AUTHOR,
          createdAt: new Date(now - 10 * 1000).toISOString(),
          updatedAt: new Date(now - 10 * 1000).toISOString(),
        }),
      ],
    };
    return (
      <StoryShell state={state}>
        <TopicPage />
      </StoryShell>
    );
  },
};
