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

Same shape as the desktop manifest plus `createdBy` and `githubRepoId` so the desktop sidebar and the web list view render from a common type.

**Type duplication is expected for now.** `SequenceDiagramPayload`, `DiffSnippet`, and the index entry types are owned by `desktop-app/electron-app` today. Until a shared types package exists, copy the relevant definitions into web-ade rather than introducing a cross-repo import. When the shared dependency lands, swap the duplicated declarations for imports in one pass.

`id` is server-generated (`crypto.randomUUID()`). Desktop ids and shared ids are independent — re-sharing a local payload creates a new record rather than overwriting.

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

All routes are authenticated via the existing platform session.

### `POST /api/sequence-diagrams` (new)

Body: `{ owner: string; repo: string; payload: SequenceDiagramPayload }`.

1. Verify GitHub read access to `owner/repo` for the requester.
2. Walk the payload server-side and bake any `newContents` that wasn't already inlined client-side (idempotent — desktop bakes too, but server bake guards against direct API callers).
3. Generate `id`, write `sequence-diagrams/{owner}/{repo}/{id}.json`, append to the per-repo index.
4. Return `{ id, url }`.

### `GET /api/sequence-diagrams/:owner/:repo` (new)

Returns the index entries for the repo, gated by the same access check.

### `GET /api/sequence-diagrams/:owner/:repo/:id` (new)

Returns the full payload, gated by the same access check.

### `DELETE /api/sequence-diagrams/:owner/:repo/:id` (new)

Permanently deletes a shared payload. Restricted to the original `createdBy.githubId` (or any user with push access to the repo, TBD — see [Open Questions](#open-questions)).

### Viewer page

`/d/:owner/:repo/:id` renders the same diagram component used by the desktop overlay, gated by the same access check. Short prefix matches gist precedent.

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

Not started. Sequenced rollout:

- [ ] Audit `SequenceDiagramOverlay` for electron-only dependencies; extract a payload-rendering component reusable from web-ade.
- [ ] Add S3 helpers under `src/lib/sequence-diagrams/` on web-ade, mirroring `src/lib/starred-collections/s3-storage.ts`.
- [ ] Add `POST /api/sequence-diagrams`, `GET` (list + by-id), `DELETE` with GitHub access gating.
- [ ] Build the viewer page at `/d/:owner/:repo/:id`.
- [ ] Add bake-on-share helper + `POST /api/file-city/sequence/:id/share` to the electron bridge.
- [ ] Add `share` to `FileCitySequenceAPI`, wire the preload + renderer.
- [ ] Add the "Share" action and post-share state to `SequenceDiagramRow`.
- [ ] Reserve `gitRef?: { sha; path; branch? }` on `DiffSnippet` (no producers yet).
- [ ] Update the persistence doc in `desktop-app/electron-app/docs/file-city-sequence-diagram-persistence.md`: drop "Cross-machine sync" from non-goals; link here.
