# File City Trail Sharing

This document describes the **trail** sharing API on web-ade — the parallel to `file-city-sequence-diagram-sharing.md`. Trails are a new authored-walkthrough medium (markers + multi-view rendering); the sequence-diagram stack is frozen feature-wise and trails are where new investment goes. See `industry-themed-file-city-panels/docs/TRAIL_DESIGN.md` for the medium-level design.

This doc is the contract the desktop / electron-app bridge calls.

## Relationship to sequence diagrams

Trails ship **parallel** to sequence diagrams. Nothing migrates; nothing aliases. Trails do not read sequence-diagram payloads, sequence-diagram code does not read trail payloads, and the two sets of routes / S3 prefixes / index files are independent.

| | Sequence diagrams | Trails |
| --- | --- | --- |
| Payload type | `SequenceDiagramPayload` | `TrailPayload` |
| Marker/event noun | `event` (`payload.events[]`) | `marker` (`payload.markers[]`) |
| Structure | `events` + `edges` (one shape) | `markers` + `views[]` (multi-view) |
| HTTP root | `/api/sequence-diagrams` | `/api/trails` |
| By-id resolver | (none) | `/api/trails/by-id/{id}` |
| S3 prefix | `sequence-diagrams/` | `trails/` |
| Standalone share URL | (per-repo `/d/{owner}/{repo}/{id}` planned) | `/trail/{id}` (live) |

The shared cross-repo type source is `@industry-theme/file-city-panel` (v0.5.61+). Producers and web-ade import the trail types from that package — `TrailPayload`, `TrailMarker`, `TrailMarkerSnippet`, `TrailView`, `TrailRepo`, `BaseTrailIndexEntry`. Web-ade owns only the storage-coupled extensions in `src/lib/trails/types.ts`.

## Access model

Identical to sequence diagrams:

- **Identifier.** `owner/repo`, derived from the producer's GitHub remote at share time.
- **Read authorization.** `GET /repos/{owner}/{repo}` against GitHub. Token-bearing requests use the requester's token; anonymous requests fall through anonymously, so public repos remain readable to logged-out callers. 200 → allowed, 403/404 → denied. Result cached per `(token-prefix, owner, repo)` or `(anon, owner, repo)` for 60s.
- **Write authorization.** Writes (POST/DELETE) require a GitHub token. The sharer's GitHub identity is recorded on `createdBy`; DELETE is restricted to that identity.
- **Reasoning.** A user with GitHub read access can fetch the same source themselves. Embedding diff snippets in shared payloads does not expand effective access.

## Storage layout

```
trails/{owner-lower}/{repo-lower}/index.json   ← per-repo manifest (ETag-locked)
trails/{owner-lower}/{repo-lower}/{id}.json    ← per-payload object
trails/_by-id/{id}.json                        ← id → {owner, repo} pointer
```

S3 keys lowercase `owner` / `repo` (GitHub treats them case-insensitively); on-disk index entries preserve original casing.

The `_by-id/` pointer is what makes `/trail/{id}` work as a repo-less share link. Writes set the pointer at POST time; reads lazily backfill it if the pointer is missing but the payload still resolves through the per-repo route.

## HTTP API

All routes accept either `Authorization: Bearer <github_token>` or the `github_token` cookie. Error responses have shape `{ error: string, code: ShareErrorCode }`. Code list lives in `src/lib/trails/types.ts` (`ShareErrorCodes`). The full set:

| Code | Meaning |
| --- | --- |
| `NOT_AUTHENTICATED` | No token / cookie on a write endpoint, or invalid token. |
| `NO_REPO_ACCESS` | GitHub returned 403/404 for the repo-access check. |
| `NOT_FOUND` | Trail id resolves to no payload + index entry pair. |
| `NOT_OWNER` | DELETE attempted by someone other than `createdBy.githubId`. |
| `INVALID_REQUEST` | Malformed body (not JSON, not an object). |
| `INVALID_OWNER_REPO` | `owner` / `repo` failed the `[A-Za-z0-9._-]+` pattern check. |
| `INVALID_PAYLOAD` | Payload failed schema validation (see below). |
| `PAYLOAD_TOO_LARGE` | Serialized payload > 10 MB. |
| `SNIPPET_NOT_BAKED` | Diff snippet missing both `newContents` and `gitRef`. |
| `ETAG_CONFLICT` / `MAX_RETRIES` | Optimistic-lock retry exhaustion (transient). |
| `S3_ERROR` | Backend storage failure (transient or systemic). |
| `GITHUB_API_ERROR` | Non-access GitHub failure (rate limit, transient 5xx). |

### `POST /api/trails`

Publish a trail.

**Request body:**
```ts
{
  owner: string;
  repo: string;
  payload: TrailPayload;   // imported from @industry-theme/file-city-panel
}
```

**Validation rules:**

1. `owner` / `repo` match `/^[A-Za-z0-9._-]+$/`.
2. `payload.id` (string), `payload.title` (string), `payload.createdAt` and `payload.updatedAt` (ISO 8601) all required. Producers mint `id` (e.g. `crypto.randomUUID()`) before posting; the same id reposted overwrites the existing record.
3. `payload.markers` is a non-empty array. Each marker has `id` (string).
4. **Multi-repo trails** (`payload.repos.length > 1`) must set `marker.repo` on every marker, referencing a registered `repos[].id`. Single-repo trails may omit `repos[]` and use the payload-level `authoredAt` shorthand.
5. Each `payload.repos[]` entry has `id` (string) and `name` (string). `remote`, `authoredAtSha`, `authoredAtRef`, `defaultRef` are optional but recommended — record provenance now (`git rev-parse HEAD` at construction time), interpret it later.
6. `payload.views` is a non-empty array. v1 only registers a renderer for `kind: 'sequence'`; producers should ship that view in v1 trails. The other kinds (`linear`, `graph`, `tree`, `timeline`) validate but won't render.
7. View marker-id references must exist in `payload.markers[]`:
   - `kind: 'sequence'` — every `markers[].markerId` must resolve, every entry needs a `name`.
   - `kind: 'linear'` — every `order[]` id must resolve.
   - `kind: 'tree'` — every key and non-null value of `parent` must resolve.
   - `kind: 'timeline'` — every key of `at` must resolve, every value must be ISO 8601.
8. Snippets:
   - `marker.snippet` requires `marker.sourcePath`.
   - **Slice snippets** (`kind: 'slice'`) require 1-based `startLine` and `endLine`.
   - **Diff snippets** (`kind: 'diff'`) require `oldContents` (string), 1-based `startLine` / `endLine`, and either `newContents` (baked) or `gitRef: { sha, path }` (forward-compat scaffold for future hydration; no producer sets it in v1). Snippets missing both → `SNIPPET_NOT_BAKED`.
9. **Notes are stripped server-side.** `payload.notes` is a host-only field per the trail type contract — external POSTs cannot write notes through. The validator drops the field; no error is raised.
10. Total serialized payload ≤ 10 MB after stripping.

**Behavior:**

1. Repo-access check; 403/404 → `NO_REPO_ACCESS`.
2. Resolve the GitHub user (`createdBy`).
3. Write `trails/{owner-lower}/{repo-lower}/{payload.id}.json`.
4. Write `trails/_by-id/{payload.id}.json` pointer.
5. Append index entry under ETag-locked update with retry (max 3). Soft cap of 200 entries per repo; oldest by `updatedAt` are pruned in-place when exceeded. Republishing the same id replaces the existing entry rather than duplicating.

**Response (201):**
```ts
{
  id: string;
  url: string;                      // "/trail/{id}" — repo-less share link
  entry: SharedTrailIndexEntry;
}
```

### `GET /api/trails/{owner}/{repo}`

List shared trails for a repo, gated by the repo-access check.

**Response (200):**
```ts
{
  entries: SharedTrailIndexEntry[];   // sorted by updatedAt desc
}
```

### `GET /api/trails/{owner}/{repo}/{id}`

Fetch a single trail.

**Response (200):**
```ts
{
  entry: SharedTrailIndexEntry;
  payload: TrailPayload;
}
```

Returns 404 with `NOT_FOUND` when either the index entry or the payload object is missing. On a successful read, lazily backfills the `_by-id/{id}.json` pointer if missing (best-effort; failure is logged, not surfaced).

### `DELETE /api/trails/{owner}/{repo}/{id}`

Delete a trail. Restricted to `createdBy.githubId`; the repo-access check still runs first. Removes the per-payload object, the by-id pointer, and the matching index entry.

**Response (200):** `{ success: true }`.

### `GET /api/trails/by-id/{id}`

Repo-less share-link resolver. Reads the `_by-id/{id}.json` pointer, then runs the repo-access check against the resolved `{owner, repo}` and returns the same shape as the per-repo GET — plus the resolved `owner` / `repo` so the caller knows where the trail lives.

This is what the `/trail/{id}` standalone page consumes; producers and other API clients normally use the per-repo routes directly.

**Response (200):**
```ts
{
  owner: string;
  repo: string;
  entry: SharedTrailIndexEntry;
  payload: TrailPayload;
}
```

## Index entry shape

`SharedTrailIndexEntry` extends `BaseTrailIndexEntry` (from `@industry-theme/file-city-panel`) with web-side fields:

```ts
interface SharedTrailIndexEntry extends BaseTrailIndexEntry {
  // From BaseTrailIndexEntry:
  //   id: string;
  //   title: string;             // required; producers default to e.g. "Untitled trail"
  //   summaryPreview: string;    // required; empty string when no summary
  //   markerCount: number;
  //   repoNames: string[];       // for multi-repo trail badges in pickers
  //   hasDiffSnippets: boolean;
  //   createdAt: string;         // ISO 8601
  //   updatedAt: string;
  //   sizeBytes: number;
  createdBy: { githubId: number; githubLogin: string };
  githubRepoId: number;          // GitHub numeric repo id at upload time
}
```

The desktop sidebar and the web list view both render from `BaseTrailIndexEntry` — the web-side extension fields are storage-bookkeeping and don't need to be displayed.

## Notes on the `notes` field

`TrailPayload.notes` exists in the schema but is **never accepted from external HTTP requests**. The validator strips it. Notes are mutated only by host-side endpoints (the trail explorer panel runs note creation through host actions, not through the share API). When trail-side notes ship, they will land on a separate host-controlled endpoint — not by piggybacking on the share payload.

For the bridge: do not bother forwarding `notes` from the desktop store on share — they will be discarded. Sharing a trail that already had notes loses them; that is intentional for v1 (notes are private to the authoring host until a notes-sharing flow is designed).

## Producer (desktop bridge) integration outline

This mirrors the sequence-diagram bridge integration; only the route and types change.

1. **Origin derivation.** From the local repo's git remote: parse `github.com[:/](owner)/(repo)(\.git)?$`. Refuse if no GitHub origin.
2. **Bake step.** Walk `payload.markers[]`. For every diff snippet missing `newContents`, read the local file (relative to the marker's repo path) and inline it. Slice snippets need no baking — line numbers index into a content source resolved at view time, and v1 viewers read the working tree via the host's `actions.readFile`.
3. **Provenance.** When constructing the payload, record `repos[].authoredAtSha` (and `authoredAtRef` for human display) via `git rev-parse HEAD`. Single-repo trails may use the `payload.authoredAt: { sha, ref }` shorthand instead.
4. **Strip notes locally too.** The server strips `notes`, but stripping client-side avoids posting bytes that will be discarded.
5. **Post.** `POST /api/trails` with the desktop's stored auth.
6. **Return** `{ url }` (the `/trail/{id}` link) to the renderer for clipboard / open-in-browser.

## Smoke test

```bash
TOKEN=...                              # GitHub token with read access to owner/repo
ID=$(uuidgen)
NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
HOST=http://localhost:3000

# Publish a minimal single-repo, single-view trail.
curl -sX POST $HOST/api/trails \
  -H "Authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d @- <<JSON
{
  "owner": "acme",
  "repo": "widgets",
  "payload": {
    "id": "$ID",
    "title": "smoke test trail",
    "createdAt": "$NOW",
    "updatedAt": "$NOW",
    "authoredAt": { "sha": "0000000000000000000000000000000000000000" },
    "markers": [
      { "id": "m1", "label": "step 1", "sourcePath": "README.md" }
    ],
    "views": [
      {
        "kind": "sequence",
        "markers": [{ "markerId": "m1", "name": "main.start" }],
        "edges": []
      }
    ]
  }
}
JSON

# List trails for the repo.
curl -s $HOST/api/trails/acme/widgets \
  -H "Authorization: Bearer $TOKEN"

# Fetch the trail by per-repo route.
curl -s $HOST/api/trails/acme/widgets/$ID \
  -H "Authorization: Bearer $TOKEN"

# Fetch the trail by repo-less id (the /trail/{id} page consumes this).
curl -s $HOST/api/trails/by-id/$ID \
  -H "Authorization: Bearer $TOKEN"

# Delete (creator-only).
curl -sX DELETE $HOST/api/trails/acme/widgets/$ID \
  -H "Authorization: Bearer $TOKEN"
```

## Differences from sequence diagrams worth flagging

- **Two structures live on one trail.** `payload.markers[]` is the content; `payload.views[]` is the structure between markers. Posting a trail means posting both. v1 viewers only render `views[].kind: 'sequence'`, but the schema commits to the multi-view shape.
- **By-id resolver lives at `/by-id/`, not `/`.** Next.js disallows sibling dynamic segments with conflicting slug names — `/api/trails/[id]` collides with `/api/trails/[owner]/[repo]/...`, so the resolver moved under `/by-id/`. The standalone share URL (`/trail/{id}`) is unchanged; only the API endpoint that backs it changed.
- **Marker repo references are validated.** Multi-repo trails fail closed if a marker's `repo` doesn't appear in `payload.repos[]`. Single-repo trails are exempt and may omit the registry entirely.
- **Notes are server-stripped.** Sharing a trail that has local notes does not propagate them. Plan for this in the bridge UX (e.g. show "Notes are private to your machine" if any are present at share time).

## Open questions

These are inherited from `TRAIL_DESIGN.md`; the share API is forward-compatible with all of them.

1. **Repo identity stability.** `TrailRepo.id` should survive repo renames; v1 lets producers pick a human-friendly id.
2. **Multi-repo producer cardinality.** The bridge runs in one electron-app instance with access to one filesystem at a time — multi-repo authoring needs producer support beyond v1.
3. **Index UI naming.** Trails get a "Trails" picker alongside the existing "Sequence Diagrams" picker; whether they share a shell is a UX call.

## Status

**Slice 1 — web-ade backend: shipped (this doc).** API is live and round-trippable from any caller with a valid GitHub token + a `TrailPayload`-emitting producer.

- [x] `src/lib/trails/` — constants, types, validation, github-access, s3-storage.
- [x] `POST /api/trails`, `GET /api/trails/{owner}/{repo}`, `GET|DELETE /api/trails/{owner}/{repo}/{id}`.
- [x] `GET /api/trails/by-id/{id}` (consumed by `/trail/{id}`).
- [x] `@industry-theme/file-city-panel` 0.5.61 — shared payload + index types.
- [ ] **Slice 2:** electron-app bridge route — `POST /api/file-city/trail/:id/share` (or equivalent), bake-on-share, stored-auth POST to web-ade.
- [ ] **Slice 2:** trail picker UI on the web side (parallel to the sequence-diagrams list panel).
- [ ] **Slice 3:** producers emitting `TrailPayload` from PR-walkthrough and trace flows. Until then, the API is callable but no production producer drives it.
