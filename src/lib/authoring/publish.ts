/**
 * Host-side publish — the §5 `publish.ts` module.
 *
 * POST an assembled `TrailPayload` to web-ade's `POST /api/trails`, returning
 * the public `/trail/{id}` URL. This is the HOST's job, never the sandbox's:
 * opencode emits a payload with NO network egress; a trusted layer (the
 * Principal MCP Bridge today, the cloud authoring-service tomorrow) makes this
 * call. The agent never holds the token.
 *
 * Auth decision (docs/hosted-trail-authoring.md §9): we reuse the **user's
 * GitHub token** that web-ade already holds from their session — not a GitHub
 * App / service identity. The token lives only on the host and never enters
 * the VM, so `createdBy` and the route's repo-access gating stay the user's,
 * matching today's bridge flow.
 *
 * Env-agnostic by construction: host + token + owner/repo are passed in, so the
 * local L2 wrapper (`core/run.ts`) and the Freestyle env wrapper
 * (`env/freestyle.ts`) share this exact function.
 */

export interface PublishInput {
  /** web-ade origin, e.g. `http://localhost:3000` (no trailing slash needed). */
  host: string;
  /** The user's GitHub token, sent as `Authorization: Bearer`. */
  token: string;
  owner: string;
  repo: string;
  /** The assembled payload from `core/assemble.ts`. */
  payload: Record<string, unknown>;
}

export interface PublishResult {
  id: string;
  /** Repo-less share path, e.g. `/trail/{id}`. */
  url: string;
}

export async function publishTrail({
  host,
  token,
  owner,
  repo,
  payload,
}: PublishInput): Promise<PublishResult> {
  const endpoint = `${host.replace(/\/+$/, '')}/api/trails`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ owner, repo, payload }),
  });

  const text = await res.text();
  if (!res.ok) {
    // The route fails with `{ error, code }` — surface both so auth (401) and
    // repo-access (403) failures are legible rather than a bare status.
    let detail = text;
    try {
      const j = JSON.parse(text) as { error?: string; code?: string };
      detail = j.code ? `${j.error} [${j.code}]` : j.error ?? text;
    } catch {
      /* non-JSON error body — keep raw text */
    }
    throw new Error(`POST ${endpoint} → ${res.status}: ${detail}`);
  }

  const json = JSON.parse(text) as { id: string; url: string };
  return { id: json.id, url: json.url };
}
