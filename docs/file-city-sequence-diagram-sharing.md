# File City Sequence Diagram Sharing

This document describes how to publish a saved sequence-diagram payload to web-ade so a recipient with GitHub access to the same repo can view the diagram in a browser.

The producing side is the desktop app's File City sequence-diagram persistence layer, documented at `desktop-app/electron-app/docs/file-city-sequence-diagram-persistence.md` (separate repo). This doc supersedes the "Cross-machine sync of saved payloads" non-goal in that doc.

## Background

Persisted sequence diagrams live in `userData/file-city-sequence-diagrams/` and never leave the producing machine. Reviewers, teammates, and async collaborators have no way to see a walkthrough that someone else generated. The desired UX is "private gist" semantics — small, link-shareable artifacts — but scoped to the repo the diagram describes.

The web-ade platform does not have an internal repository entity. Repos are referenced as `owner/repo` strings, and access is gated by calling GitHub with the requester's token (precedent: `src/lib/starred-collections/`). Sharing inherits this posture: anyone who can read the repo on GitHub can read its shared diagrams; nobody else can.

## Goals

- Publish a saved payload from the dev-workspace sidebar to web-ade with one click.
- Receive a shareable URL viewable by any GitHub user with read access to the repo.
- Reuse GitHub-based access primitives — no new ACL system on web-ade.
- Make shared payloads self-contained on day one so the viewer never needs the recipient's filesystem.
- Reserve a clean opt-in path for hydrating snippets from GitHub later, so explanatory diagrams that point at committed code don't have to bake everything in forever.

## Non-goals

- Editing diagrams on the web side.
- Real-time collaboration.
- Cross-repo or org-wide indexes.
- Comments, reactions, threading.
- Embedding the viewer outside web-ade.
- Hydrating `newContents` from GitHub on day one (deferred — see [Snippet Handling](#snippet-handling)).

## Access model

- **Identifier.** `owner/repo`, derived from the local repo's GitHub remote at share time. Stored on the shared record.
- **Authorization.** Every read and write calls `GET /repos/{owner}/{repo}` on GitHub with the requester's token. 200 → allowed; 404 → denied. Public, private, and org repos all work without per-repo configuration.
- **Reasoning.** A user with GitHub read access to the repo can fetch the same source themselves. Embedding diff snippets in shared payloads does not expand their effective access. The one exception — speculative `newContents` from a working tree — is named below.

## Storage layout

Mirrors starred-collections:

- **S3 prefix:** `sequence-diagrams/{owner}/{repo}/`
- **Per-payload object:** `sequence-diagrams/{owner}/{repo}/{id}.json`
- **Per-repo index:** `sequence-diagrams/{owner}/{repo}/index.json`

```ts
interface SharedSequenceDiagramIndex {
  version: 1;
  entries: SharedSequenceDiagramIndexEntry[];
}

interface SharedSequenceDiagramIndexEntry {
  id: string;
  title?: string;
  summaryPreview?: string;
  eventCount: number;
  hasDiffSnippets: boolean;
  createdBy: { githubId: number; githubLogin: string };
  /** GitHub numeric repo id at upload time, used as a rename-stable backstop. */
  githubRepoId: number;
  createdAt: string; // ISO 8601
  updatedAt: string;
  sizeBytes: number;
}
```

`SharedSequenceDiagramIndexEntry` extends `BaseSequenceDiagramIndexEntry` from `@industry-theme/file-city-panel` with the web-side `createdBy` and `githubRepoId` fields. The desktop sidebar and the web list view render from the same base type.

**Shared types live in `@industry-theme/file-city-panel`.** `SequenceDiagramPayload`, `DiffSnippet`, `SequenceEvent`, `SequenceEdge`, and `BaseSequenceDiagramIndexEntry` are imported from that package — the same source the desktop consumes. Web-ade owns only the storage-coupled extensions (sharer identity, GitHub repo id, request/response envelopes, error codes) in `src/lib/sequence-diagrams/types.ts`.

`id` is **producer-supplied** and required on the wire — the desktop bridge mints it (`crypto.randomUUID()`) before posting. Re-sharing a local payload requires the producer to mint a new id; the same id posted twice overwrites the existing shared record.

## Snippet handling

`DiffSnippet` today is a hybrid: `oldContents` is always embedded; `newContents` is optional and read from local disk at view time. That model breaks once the viewer runs in a browser on a machine that doesn't have the repo checked out.

Two flavors of snippet:

- **Reference snippets** point at code that exists at a known git ref. Could be hydrated from GitHub.
- **Speculative snippets** describe proposed changes that exist only in the producer's working tree. Must be baked in.

### Day one: bake everything

The share handler walks the payload and, for any snippet missing `newContents`, reads the local file and inlines it. Shared payloads become fully self-contained. Snapshot is frozen at share time, which matches the share-as-artifact model.

### Future: opt-in hydration via `gitRef`

Reserve a snippet-level field now, even with no producer populating it yet:

```ts
interface DiffSnippet {
  // ...existing fields...
  gitRef?: { sha: string; path: string; branch?: string };
}
```

When `gitRef` is set, the share handler may strip `newContents` and the viewer hydrates from GitHub's contents API at view time. Producers (review walkthroughs etc.) opt in by setting `gitRef` when they know they're pointing at committed code. No schema migration when the time comes — only producer changes.

### Hydration fallback chain

When the viewer hydrates a snippet and `gitRef.sha` is unreachable on GitHub:

1. Try `gitRef.sha`.
2. On 404, try `gitRef.branch` if present.
3. Fall back to the default branch's `HEAD`.

The viewer surfaces what happened: a small badge on the snippet ("showing latest, original ref unavailable") with the original sha visible on hover. Silent swap is the misleading case; flagged swap is fine.

**Line ranges.** v1 keeps the original `lineRange` after a swap. Lines may have drifted; the badge makes that legible. A future fuzzy-anchor pass (relocate the highlight by matching the original snippet's first/last lines) is a follow-up if drift turns out to bite.

**Deleted files.** This is the one case where swap-to-latest fails closed. If the resolved file no longer exists, render a clear placeholder ("file no longer exists at `<path>` as of `<sha>`") instead of dropping the snippet silently.

## HTTP API (web-ade)

All routes accept either an `Authorization: Bearer <github_token>` header (mobile / API clients, including the desktop bridge) or the `github_token` cookie (web clients). Every route gates on `GET /repos/{owner}/{repo}` against GitHub with the requester's token, cached per `(token-prefix, owner, repo)` for 60s.

Error responses use the shape `{ error: string, code: ShareErrorCode }`. See `src/lib/sequence-diagrams/types.ts` for the full code list.

### `POST /api/sequence-diagrams`

Publish a payload.

**Request body:**
```ts
{
  owner: string;
  repo: string;
  payload: SequenceDiagramPayload;
}
```

**Validation:**
1. `owner` / `repo` match `/^[A-Za-z0-9._-]+$/`.
2. `payload` carries the strict shared shape: `id`, `title`, `createdAt`, `updatedAt` are all required (timestamps must be ISO 8601). Producers that pre-date the strict contract must be upgraded.
3. `payload.events` is a non-empty array; each event has `id` and `name`.
4. `payload.edges`, when present, is an array of `{ id, fromEvent, toEvent }` per the upstream `SequenceEdge` shape.
5. Every diff snippet has `startLine` and `endLine` (1-based) and either `newContents` (baked) or `gitRef: { sha, path }` (reserved for future hydration). Snippets missing line bounds are rejected with `INVALID_PAYLOAD`; snippets missing both `newContents` and `gitRef` are rejected with `SNIPPET_NOT_BAKED` — web-ade can't read the producer's filesystem, so baking is the desktop bridge's responsibility.
6. Total serialized payload ≤ 10 MB.

**Behavior:**
1. Verify the requester has GitHub read access to `owner/repo`. On 403/404 → `{ code: NO_REPO_ACCESS }`, status 403.
2. Use `payload.id` as the stored id; `payload.createdAt` / `updatedAt` propagate to the index entry as-is.
3. Write `sequence-diagrams/{owner-lower}/{repo-lower}/{id}.json`.
4. Append the index entry to `sequence-diagrams/{owner-lower}/{repo-lower}/index.json` under ETag-locked update with retry (max 3). When the repo exceeds the 200-entry soft cap, the oldest entries by `updatedAt` are pruned in-place.

**Response (201):**
```ts
{
  id: string;
  url: string;                                  // "/d/{owner}/{repo}/{id}"
  entry: SharedSequenceDiagramIndexEntry;
}
```

### `GET /api/sequence-diagrams/{owner}/{repo}`

List shared diagrams for a repo, gated by the same access check. Returns metadata only — payloads are fetched separately.

**Response (200):**
```ts
{
  entries: SharedSequenceDiagramIndexEntry[];   // sorted by updatedAt desc
}
```

### `GET /api/sequence-diagrams/{owner}/{repo}/{id}`

Fetch a single diagram, gated by the same access check.

**Response (200):**
```ts
{
  entry: SharedSequenceDiagramIndexEntry;
  payload: SequenceDiagramPayload;
}
```

Returns 404 with `{ code: NOT_FOUND }` if either the index entry or the payload object is missing.

### `DELETE /api/sequence-diagrams/{owner}/{repo}/{id}`

Permanently delete a shared payload.

**Authorization:** restricted to the original `createdBy.githubId` (revisit if curation pain emerges — see [Open Questions](#open-questions)). The repo-access check still runs first.

**Behavior:** removes the per-payload object and the matching index entry under the same ETag-locked update path as POST.

**Response (200):** `{ success: true }`.

### Index entry shape

`SharedSequenceDiagramIndexEntry` extends `BaseSequenceDiagramIndexEntry` (from `@industry-theme/file-city-panel`) with web-side fields:

```ts
interface SharedSequenceDiagramIndexEntry extends BaseSequenceDiagramIndexEntry {
  // From BaseSequenceDiagramIndexEntry:
  //   id: string;
  //   title: string;                // required; hosts default to e.g. "Untitled flow"
  //   summaryPreview: string;       // required; empty string when no summary
  //   eventCount: number;
  //   hasDiffSnippets: boolean;
  //   createdAt: string;            // ISO 8601
  //   updatedAt: string;
  //   sizeBytes: number;
  createdBy: { githubId: number; githubLogin: string };
  githubRepoId: number;             // GitHub numeric repo id at upload time
}
```

### Viewer page (not yet built)

`/d/{owner}/{repo}/{id}` will render the same diagram component used by the desktop overlay, gated by the same access check. Short prefix matches gist precedent. Tracked under [Status](#status).

### Storage key conventions

S3 keys lowercase `owner` and `repo` (GitHub treats them case-insensitively), but the on-disk index entry preserves casing as uploaded. Two clients posting to `Acme/Foo` vs `acme/foo` write to the same prefix and see each other's entries.

## Desktop integration

### Origin derivation

When the user hits "Share…" on a row in `SequenceDiagramsPanel`:

1. Read `git remote get-url origin` for the repo at `repositoryPath`.
2. Parse `github.com[:/](owner)/(repo)(\.git)?$`. If no GitHub origin, refuse with a clear message ("Sharing requires a GitHub remote on this repo").
3. If multiple GitHub remotes exist, default to `origin` and offer a chooser in an overflow.

### Bake step

Before upload, walk the payload and inline `newContents` for each snippet missing it (`FileSystemService.readFile` against `repositoryPath`). If a referenced file is missing on disk, surface a confirmation prompt ("3 snippets reference missing files; share anyway?") rather than silently shipping placeholders.

### Bridge route

Add `POST /api/file-city/sequence/:id/share` to the localhost bridge.

1. Loads the payload by id from the local store.
2. Resolves `owner/repo` (passed from the renderer or derived in main).
3. Bakes `newContents`.
4. Posts to web-ade using the desktop's stored auth.
5. Returns `{ url }` to the renderer for clipboard / open-in-browser.

### IPC additions

Add to `FileCitySequenceAPI`:

```ts
share: (id: string, options?: { owner?: string; repo?: string }) => Promise<{ url: string }>;
```

The renderer derives `owner`/`repo` when it has them in scope; otherwise main resolves from the local git remote.

### UI affordance

`SequenceDiagramRow` gains a "Share" action in its hover/overflow cluster (alongside the existing trash icon). After a successful share, the row stamps a small "shared" indicator and the action becomes "Copy link." Re-share creates a new record (no implicit overwrite — explicit "Replace shared copy" is a follow-up if it's wanted).

## Security

- **GitHub-backed access control** is the entire authorization model. If GitHub revokes access (org change, repo deletion, transfer), reads start failing on the next request. No cache to invalidate.
- **Rate limiting.** Each `GET /repos/{owner}/{repo}` access check counts against the requester's GitHub API budget. Cache the response per `(user, repo)` for ~60s to avoid burning rate-limit on rapid view traffic. Don't cache 404s.
- **Speculative content provenance.** `newContents` baked in from a working tree may include unpushed code. The repo-access argument still holds (anyone with read access could be sent the same diff via Slack), but producers should know what they're sharing. The future `gitRef` opt-in narrows this surface for reference snippets.
- **Repo renames / transfers.** GitHub redirects API calls for renamed repos transparently, so the access check keeps working. The S3 prefix becomes a stale label, but `githubRepoId` on the index entry gives a rename-stable backstop. A migration job can rewrite prefixes later if needed.

## Open questions

1. **Delete authorization.** Today only the original sharer can delete. Should anyone with push access be allowed to delete shares for the repo (cleanup of stale agent-generated artifacts)? Defaulting to creator-only is safer; revisit if curation pain emerges.
2. **Storage backend.** S3 mirrors starred-collections and is fine to start. Postgres `jsonb` would give cheaper listing/indexing if shared volume grows. Don't reach for it day one.
3. **Renderer extraction.** `SequenceDiagramOverlay` lives in electron-app today. The web viewer needs the same component free of electron-only deps. Sizing the extraction (or building a parallel web-only renderer that consumes the same payload type) is the primary v0 task.
4. **Per-share expiry.** Add a TTL field for ephemeral agent shares, or rely entirely on explicit delete? Probably explicit-only for v1; add `expiresAt` if junk piles up.
5. **Viewer staleness UX for hydrated snippets.** Even on a successful hydration, should the viewer show "current as of `<sha>`" unconditionally so reviewers always know what they're looking at? Default yes — surface the sha; reviewers don't need to ask.

## Status

**Slice 1 — web-ade backend: shipped.** API is live and round-trippable from any caller with a valid GitHub token. No platform UI yet; viewer page and desktop integration still pending.

- [x] Add S3 helpers under `src/lib/sequence-diagrams/` on web-ade, mirroring `src/lib/starred-collections/s3-storage.ts`.
- [x] Add `POST /api/sequence-diagrams`, `GET` (list + by-id), `DELETE` with GitHub access gating.
- [x] Reserve `gitRef?: { sha; path; branch? }` on `DiffSnippet` in the duplicated payload types (no producers yet).
- [x] Replace duplicated payload types with imports from `@industry-theme/file-city-panel` (shared cross-repo source of truth). Validation tightened to require `id`, `title`, `createdAt`, `updatedAt` on payloads and `startLine` / `endLine` on diff snippets — producers must be on the new contract.
- [ ] **Slice 2:** Audit `SequenceDiagramOverlay` for electron-only dependencies; extract a payload-rendering component reusable from web-ade.
- [ ] **Slice 2:** Build the viewer page at `/d/:owner/:repo/:id`.
- [ ] **Slice 3:** Add bake-on-share helper + `POST /api/file-city/sequence/:id/share` to the electron bridge.
- [ ] **Slice 3:** Add `share` to `FileCitySequenceAPI`, wire the preload + renderer.
- [ ] **Slice 3:** Add the "Share" action and post-share state to `SequenceDiagramRow`.
- [ ] Update the persistence doc in `desktop-app/electron-app/docs/file-city-sequence-diagram-persistence.md`: drop "Cross-machine sync" from non-goals; link here.

### Smoke test (slice 1)

```bash
TOKEN=...   # any GitHub token with read access to owner/repo
ID=$(uuidgen)
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# publish (id, title, createdAt, updatedAt are all required)
curl -sX POST http://localhost:3000/api/sequence-diagrams \
  -H "Authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d "{\"owner\":\"acme\",\"repo\":\"widgets\",\"payload\":{\"id\":\"$ID\",\"title\":\"flow A\",\"createdAt\":\"$NOW\",\"updatedAt\":\"$NOW\",\"events\":[{\"id\":\"a\",\"name\":\"step 1\"}]}}"

# list
curl -s http://localhost:3000/api/sequence-diagrams/acme/widgets \
  -H "Authorization: Bearer $TOKEN"

# fetch one
curl -s http://localhost:3000/api/sequence-diagrams/acme/widgets/<id> \
  -H "Authorization: Bearer $TOKEN"

# delete (creator only)
curl -sX DELETE http://localhost:3000/api/sequence-diagrams/acme/widgets/<id> \
  -H "Authorization: Bearer $TOKEN"
```
