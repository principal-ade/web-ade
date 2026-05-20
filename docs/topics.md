# Topics

A **topic** is a curated collection of trails on a shared subject — typically the same conceptual problem solved across different repos (e.g. "how do these three agent CLIs detect filesystem changes?"). Topics let an author group trails into a single shareable page where readers can compare implementations side-by-side.

Topics ship **parallel** to trails ([[file-city-trail-sharing.md]]). They reference trails by id but don't own them: each embedded trail keeps its own notes, sign-offs, and `/trail/{id}` page. The topic record itself is just `{ title, description, ordered trailIds, owner }`.

## Relationship to trails

| | Trails | Topics |
| --- | --- | --- |
| Scope | One investigation, scoped to one (or multi-repo) `TrailPayload` | Curated list of trails across any repos |
| Repo-bound | Yes — `owner/repo` is part of the identifier | No — topics curate across many repos |
| Read auth | GitHub repo read access required | Public by link; embedded trails still gate per-trail |
| Write auth | Sharer's GitHub identity on `createdBy` | Same — owner is the creating GitHub user |
| HTTP root | `/api/trails` | `/api/topics` |
| Share URL | `/trail/{id}` | `/topic/{id}` |
| S3 prefix | `trails/` | `topics/` |
| Discussion | Per-marker notes on the trail | (v1) Per-trail notes; topic-level thread deferred |

## Access model

- **Read.** Public-by-link. The topic record carries no repo-access metadata of its own. Each embedded trail continues to enforce repo read access independently when `/api/trails/by-id/{id}` resolves it — a private trail inside a topic renders as "in a private repository" inline, without blocking the rest of the page.
- **Write.** Owner-only. The creating GitHub user is recorded on `createdBy.githubId`; all mutations check that identity matches.
- **Auth surface.** Same GitHub cookie / Bearer token model as trails (see [[auth-design.md]]).

## Storage layout

```
topics/_by-id/{topicId}.json   ← the topic record (single object per topic)
```

Topics aren't repo-scoped, so there's no per-repo manifest. Every read hits the by-id key directly. Mutations use ETag-locked read-modify-write (3 retries) — concurrent edits are rare since only the owner can mutate, but the retry path keeps the surface honest.

## Topic record shape

```ts
interface TopicPayload {
  id: string;                    // server-minted uuid
  title: string;
  description: string;           // markdown
  trailIds: string[];            // ordered; foreign keys into trails/_by-id/
  createdBy: { githubId: number; githubLogin: string };
  createdAt: string;             // ISO 8601
  updatedAt: string;             // ISO 8601
}
```

Limits (see `src/lib/topics/constants.ts`):

- `MAX_TITLE_CHARS` = 200
- `MAX_DESCRIPTION_CHARS` = 8 000
- `MAX_TRAILS_PER_TOPIC` = 50

## Routes

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/topics` | Authed | Create topic. Validates every initial trail id resolves via `trails/_by-id/{id}.json` before minting. |
| `GET` | `/api/topics/by-id/{id}` | Public | Read the topic record. |
| `PATCH` | `/api/topics/by-id/{id}` | Owner | Update title and/or description. |
| `DELETE` | `/api/topics/by-id/{id}` | Owner | Delete the topic. (Embedded trails are untouched.) |
| `POST` | `/api/topics/by-id/{id}/trails` | Owner | Append a trail by id. Checks for duplicate, cap, and that the trail exists. |
| `PATCH` | `/api/topics/by-id/{id}/trails` | Owner | Reorder. Body must be a permutation of the existing trail set — no add/remove via reorder. |
| `DELETE` | `/api/topics/by-id/{id}/trails/{trailId}` | Owner | Remove a single trail. |

## UI

- **`/topic/{id}`** — public view. Header (Principal AI brand, Share button, owner-only Delete). Body renders the title and a whitespace-preserving description, then a numbered list of trail cards. Each card fetches its summary from `/api/trails/by-id/{id}` in parallel and links to `/trail/{id}` for the full view + notes. Owner sees: header Edit toggle (title/description), per-card Remove, and a paste-to-add input for new trails.
- **`/topic/new`** — create form (title, description, optional first trail URL). Gated to signed-in users with a sign-in CTA fallback. POSTs to `/api/topics`, routes to `/topic/{id}` on success.

The share button mirrors the trail share pattern: `${origin}/topic/${id}` to clipboard, with a 1.5s "Copied" feedback state.

## Design decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Noun | `topic` (not `discussion`) | Honest about v1 scope (no thread yet); leaves room for non-discussion uses like guides or lessons. Marketing copy can still use "discussion" naturally. |
| Visibility | Public by link, owner-only mutations | Matches existing trail share semantics — least surprise for users moving between surfaces. |
| Storage backend | S3 (`topics/_by-id/{id}.json`) | Mirrors trails. Avoids introducing a SQL dependency just for this feature. |
| Per-user index | Deferred | "My topics" listing not in v1; users keep their links via browser history / bookmarks. Adds an ETag-locked manifest object that's easy to add later. |
| Stage taxonomy / comparison rail | Deferred | The most valuable v2 affordance, but it requires per-marker stage tagging and a non-trivial UI. v1 ships as "a folder of trails with discussion-friendly framing"; v2 makes the comparison structural. |
| Add-trail surface | Paste a `/trail/{id}` URL or bare uuid | Fastest v1; matches the paste-to-navigate input on the landing header. A "my trails" picker is a nice v2. |
| Discussion thread | Reuses per-trail notes; no topic-level thread | Notes already live on trails; layering a topic-level thread is a v2 question (own thread model vs. extension of notes). |
| Repo-access gating per trail | Topic record is public; trails self-gate | Topics curate across repos a single reader may or may not have access to. Inline "private repository" cards are honest about that without blocking the rest of the page. |

## Follow-ups

In rough priority order:

1. **Repo-access UX polish.** A reader without access to one of the embedded trails currently sees a small inline error block. Worth a clearer "X of Y trails are in repos you can't read — sign in or request access" rollup near the top of the page once usage warrants it.
2. **"My topics" listing.** A `/topics` (or `/profile/topics`) page that lists topics the signed-in user owns. Requires a per-user index file (`topics/_by-user/{githubId}.json`) with the same ETag-locked manifest pattern trails use.
3. **Reorder UI.** API already accepts a permutation; the view page has no drag handle yet. Drop-in: `@dnd-kit/sortable` over the existing `<TrailCard>` list, fire `PATCH /api/topics/by-id/{id}/trails` on drop.
4. **Stage taxonomy + comparison rail (v2).** Per-topic ordered list of stage names. Trail authors tag markers with a stage; the topic page renders a cross-trail comparison rail. This is what turns a topic from "a folder of trails" into "a side-by-side analysis."
5. **Topic-level discussion thread.** Choose between (a) reusing the existing notes/sign-offs primitive scoped to the topic, or (b) a dedicated thread model. (b) lets replies mention trails / stages as first-class entities.
6. **Add-trail picker.** Inline picker pulling from the signed-in user's owned + recently-visited trails, complementing the paste-URL input.
7. **Cross-trail marker linking.** Author can declare "marker X in trail A is analogous to marker Y in trail B" — powers the comparison rail and enables marker-level threads that span repos.
8. **Soft caps / pruning.** Topics currently allow up to 50 trails with no pruning logic; if topic growth becomes a thing, mirror the trails `MAX_TRAILS_PER_REPO` prune-by-`updatedAt` pattern.

## File map

```
src/lib/topics/
  constants.ts        S3 / limits
  types.ts            TopicPayload, request/response, TopicShareError
  s3-storage.ts       get / put / update (ETag-locked) / delete
  validation.ts       title / description / trailIds; extractTrailId() helper

src/app/api/topics/
  route.ts                              POST create
  by-id/[id]/route.ts                   GET / PATCH / DELETE
  by-id/[id]/trails/route.ts            POST add, PATCH reorder
  by-id/[id]/trails/[trailId]/route.ts  DELETE

src/app/topic/
  [id]/page.tsx           Public view + owner controls
  [id]/TrailHeaderLite.tsx
  new/page.tsx            Create form
```
