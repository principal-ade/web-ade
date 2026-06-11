# Hosted Trail Authoring — ask-a-question → get-a-trail

**Topic:** `topic-1781154092475-a1ls0neji` ("Hosted trail authoring: ask-a-question → get-a-trail")

This document is the implementation + test plan for turning trail authoring into
a self-serve hosted service. It is written so we can stand the pipeline up in
**stages**, testing each one in isolation before wiring the next, rather than
needing all of Freestyle + opencode + the app integrated on day one.

## 1. Goal

Today a trail is produced by a coding agent that already has the repo checked
out locally, explores it, emits a `TrailPayload`, and POSTs it to web-ade
`POST /api/trails`. We want:

> A user picks a repo and asks a natural-language question **in our app**, and
> gets back a published trail — no local Claude Code, no local checkout.

The authoring loop moves to the cloud and runs per-request. The trail it
produces is byte-identical in shape to a hand-authored one, so it reuses the
**entire** existing publish / storage / render / delivery stack unchanged.

## 2. Fixed substrate choices

| Concern | Choice | Notes |
|---|---|---|
| Authoring agent | **opencode** | Headless via `opencode serve` — OpenAPI 3.1 HTTP server + SSE, SQLite-backed sessions. Driven over REST, not the TUI. |
| Execution sandbox | **Freestyle VM** | Full Linux, ~600 ms boot, root. Runs `opencode serve` + holds the repo checkout. |
| Repo / SHA | **Freestyle Git** | Pins the commit we stamp into `authoredAt.sha`. |
| VM amortization | **live-fork / pause-resume** | Warm a base VM per repo; fork or resume per question instead of re-cloning. |
| Publish / storage / render | **existing web-ade stack** | `POST /api/trails` → S3 → File City. No changes. Precedent: `GET /api/pr-trail` already generates a trail server-side. |

## 3. Architecture

```
 App (user asks a question about repo R)
   │  POST /api/authoring/runs { owner, repo, ref?, question }
   ▼
 Authoring service (new)
   │ 1. resolve R @ sha           ── Freestyle Git
   │ 2. fork/resume VM, checkout  ── Freestyle VM
   │ 3. start opencode serve in VM, open a session
   │ 4. drive session with the trail-authoring brief + question
   │ 5. opencode emits TrailPayload via the `emit_trail` tool
   │ 6. validate payload against the real tree (in-VM)
   │ 7. POST /api/trails (existing publish path) → /trail/{id}
   │ 8. pause/destroy VM
   ▼
 App ← { trailUrl: "/trail/{id}" }  (delivered async; reuse inbox/feed)
```

Everything in steps 1–6 is **new** and lives in the authoring runner. Step 7
onward is **existing** and untouched.

## 4. The contract opencode must emit

opencode's only job is to produce a valid `TrailPayload`. We bind a single tool,
`emit_trail`, whose argument schema is the publishable payload. The runner does
**not** ask opencode to call `POST /api/trails` directly — opencode emits, the
runner validates + publishes. This keeps GitHub auth and the publish endpoint
out of the sandbox.

`TrailPayload` type source of truth: `@industry-theme/file-city-panel`
(`Trail.d.ts`). The publish-time validation rules (from
`docs/file-city-trail-sharing.md` → `POST /api/trails`) that the emitted payload
**must** satisfy:

1. `id` (string — runner mints `crypto.randomUUID()`, not opencode), `title`
   (string), `createdAt` + `updatedAt` (ISO 8601) all required.
2. `markers` non-empty; every marker has a string `id`.
3. Single-repo trail: omit `repos[]`, set payload-level
   `authoredAt: { sha, ref }`. (Multi-repo would require `marker.repo` on every
   marker — out of scope for v1; one repo per question.)
4. `views` non-empty and **must include a `kind: 'sequence'` view** — it is the
   only renderer v1 ships. Every `markers[].markerId` in the view must resolve
   to a `payload.markers[]` id, and every view-marker needs a `name`.
5. Snippets:
   - `marker.snippet` requires `marker.sourcePath`.
   - Prefer **slice snippets** (`kind: 'slice'`, 1-based `startLine`/`endLine`).
     No baking needed — viewers read the tree at view time.
   - Diff snippets need `oldContents` + (`newContents` or `gitRef`); not used for
     question-driven trails in v1.
6. `notes` is server-stripped — don't emit it.
7. Serialized payload ≤ 10 MB.

The authoring brief (opencode system prompt) is derived from the existing
`author-investigation-trail` / `author-informative-trail` skills — those skills
are the spec for what makes a good trail. Default `purpose: 'investigation'` for
question-driven trails; mark the load-bearing answer marker with
`kind: 'subject'`.

### `emit_trail` tool schema (sketch)

```jsonc
{
  "name": "emit_trail",
  "description": "Emit the finished trail. Call exactly once when the walkthrough is complete.",
  "input_schema": {
    "type": "object",
    "required": ["title", "summary", "markers", "subjectMarkerId"],
    "properties": {
      "title": { "type": "string" },
      "summary": { "type": "string", "description": "markdown overview" },
      "markers": {
        "type": "array", "minItems": 1,
        "items": {
          "type": "object",
          "required": ["id", "label", "sourcePath", "startLine", "endLine", "description"],
          "properties": {
            "id": { "type": "string" },
            "label": { "type": "string" },
            "sourcePath": { "type": "string", "description": "repo-relative path" },
            "startLine": { "type": "integer", "minimum": 1 },
            "endLine": { "type": "integer", "minimum": 1 },
            "description": { "type": "string", "description": "why this step matters (markdown)" }
          }
        }
      },
      "subjectMarkerId": { "type": "string", "description": "the marker that answers the question" }
    }
  }
}
```

The runner expands this flat shape into a full `TrailPayload`: mints `id` +
timestamps, attaches `authoredAt: { sha, ref }`, builds the `sequence` view from
the marker order, and stamps `kind: 'subject'` on `subjectMarkerId`. Keeping the
tool schema flat (no nested `snippet`/`views`) reduces the surface opencode can
get wrong; the runner owns the structural assembly.

## 5. Runner components (new code)

Proposed home: `src/lib/authoring/` + `src/app/api/authoring/`.

| Module | Responsibility |
|---|---|
| `resolve-repo.ts` | owner/repo/ref → pinned sha (Freestyle Git). Reuses web-ade GitHub repo-access gating for auth. |
| `sandbox.ts` | fork/resume a Freestyle VM, checkout the sha, start `opencode serve`, return a session client. |
| `opencode-client.ts` | thin wrapper over opencode's OpenAPI: open session, send message, stream SSE, capture the `emit_trail` tool call. |
| `assemble-payload.ts` | flat `emit_trail` args → full `TrailPayload` (mint id, timestamps, `authoredAt`, sequence view, subject marker). |
| `validate-payload.ts` | re-check every marker `sourcePath` exists and `startLine`/`endLine` are within the file, **in the VM against the real tree**. Reject or auto-repair (open decision). |
| `publish.ts` | `POST /api/trails` with service GitHub auth. Returns `/trail/{id}`. |
| `app/api/authoring/runs/route.ts` | `POST` to start a run; async — returns a run id, delivers the trail URL via inbox/feed. |

## 6. Driving opencode (headless)

- `opencode serve --port <p> --hostname 127.0.0.1` inside the VM; protect with
  `OPENCODE_SERVER_PASSWORD` (HTTP basic, user `opencode`).
- One server per VM; one session per question. SSE stream carries
  message/tool-call events; the runner watches for the `emit_trail` tool call
  and treats its argument as the result.
- Model/provider configured via opencode config in the VM image. (Open
  decision: which provider — keep it a build-time config knob.)
- Bound tools: read-only repo exploration (read/grep/list) + `emit_trail`. No
  network egress, no write tools — the agent reads code and emits a payload,
  nothing else.

Refs: opencode [Server](https://opencode.ai/docs/server/),
[CLI](https://opencode.ai/docs/cli/), [Agents](https://opencode.ai/docs/agents/).

## 7. Staged test plan

Each stage is independently runnable and gates the next. Stages 0–2 need **no
Freestyle** — they validate the agent + contract + publish path on a local
checkout first, which is where most of the risk is.

### Stage 0 — opencode emits a valid payload locally (no Freestyle)
**Goal:** prove opencode + the brief + `emit_trail` produce a schema-valid
payload against a known repo.
- Check out a small known repo locally (e.g. this one).
- Run `opencode serve` locally; open a session with the trail-authoring brief +
  a fixed question (e.g. "How does `POST /api/trails` validate payloads?").
- Capture the `emit_trail` call.
- **Pass:** the captured args satisfy the flat `emit_trail` schema, and every
  `sourcePath` + line range resolves in the local checkout.

### Stage 1 — assemble + validate
**Goal:** the flat args become a publishable `TrailPayload`.
- Run `assemble-payload.ts` on the Stage 0 output.
- Run `validate-payload.ts` against the local tree.
- Run it through the **same** rules as `src/lib/trails/validation.ts`.
- **Pass:** payload passes web-ade validation offline; markers point at real
  lines.

### Stage 2 — publish + render (existing stack)
**Goal:** a machine-assembled payload round-trips through the real publish path.
- Against a local web-ade (`HOST=http://localhost:3000`) with a GitHub token,
  `POST /api/trails` using the Stage 1 payload (mirror the smoke test in
  `docs/file-city-trail-sharing.md`).
- Open `/trail/{id}` and confirm markers light up buildings in File City and the
  Pierre drawer shows the right slices.
- **Pass:** trail renders correctly end-to-end; markers + sequence view work.

### Stage 3 — wrap in a Freestyle VM
**Goal:** Stages 0–2 run inside a Freestyle VM instead of locally.
- Build a VM image with opencode + the checkout tooling.
- `resolve-repo` → fork/resume VM → checkout sha → `opencode serve` → drive →
  emit → validate-in-VM → publish.
- **Pass:** same trail produced as Stage 2, but driven entirely through the VM,
  and the VM pauses/destroys after.

### Stage 4 — end-to-end from the app
**Goal:** the user-facing async flow.
- App `POST /api/authoring/runs { owner, repo, question }` → run id.
- Trail URL delivered back via inbox/feed when authoring completes.
- **Pass:** asking a question in the app yields an openable `/trail/{id}` with no
  manual steps.

### Stage 5 — scale / lifecycle
- Concurrent questions on the same repo (fork-per-question vs paused-per-repo).
- Cold vs warm VM latency; cost of paused VMs.
- Private-repo auth (GitHub App vs user token).

## 8. Local smoke-test seed

The Stage 2 publish call mirrors the smoke test in
`docs/file-city-trail-sharing.md` (`POST /api/trails` with `owner`, `repo`,
`payload`). Use that as the fixture target: once `assemble-payload.ts` produces a
payload that publishes and renders, the contract is locked and the rest is
plumbing opencode + Freestyle in behind it.

## 9. Open decisions (tracked on the topic)

- **Sync vs async delivery** — leaning async (authoring is slow); reuse inbox/feed.
- **Private-repo auth** — GitHub App vs user-supplied token for the VM checkout.
- **VM lifecycle** — fork-per-question off a warm base vs one paused VM per repo
  (leaning paused-per-repo).
- **Validation strictness** — reject vs auto-repair markers whose line ranges drifted.
- **opencode model/provider** — build-time config knob; choice TBD.
