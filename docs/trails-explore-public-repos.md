# Explore: Public Repos With Trails

A page that lists every public repo that has at least one trail. The challenge isn't storage cost — `LIST` against S3 is cheap — it's that the existing trail layout (`trails/{owner}/{repo}/...`) doesn't record whether a repo is public or private. Visibility is enforced at read time by hitting GitHub per request (see `file-city-trail-sharing.md` → "Access model").

This doc proposes stamping repo visibility into each per-repo `index.json` at write time so the explore page can filter without a GitHub round-trip per repo.

## Why stamp visibility (vs. a separate manifest, vs. live GitHub calls)

| Approach | Read cost | Write cost | Staleness handling |
| --- | --- | --- | --- |
| Live GitHub call per repo | N requests × ~150ms, hits rate limits | Free | Always fresh |
| Stamp in `index.json` | One S3 `LIST` + N small `GET`s, all parallel | Already rewriting the index, one extra field | Lazy — corrected on next trail write or background refresh |
| Separate `_public-repos/` manifest | One small `GET` | Two writes per mutation (repo index + global manifest), needs consistency story | Same lazy issue, plus dual-source-of-truth risk |

The middle option is the smallest change and keeps `index.json` as the single source of truth for everything about a repo's trails.

## Schema change

`SharedTrailIndex` in `src/lib/trails/types.ts` currently:

```ts
export interface SharedTrailIndex {
  version: 1;
  updatedAt: string;
  entries: SharedTrailIndexEntry[];
}
```

Becomes:

```ts
export interface SharedTrailIndex {
  version: 1;
  updatedAt: string;
  entries: SharedTrailIndexEntry[];
  /** GitHub repo visibility as observed at last index write. */
  repoVisibility?: 'public' | 'private';
  /** ISO timestamp of the last visibility check (independent of updatedAt). */
  repoVisibilityCheckedAt?: string;
}
```

Both fields are optional so existing indexes parse unchanged. Absence means "unknown — assume private until proven otherwise" on the explore page.

Visibility lives on the index (per-repo) rather than on each `SharedTrailIndexEntry` (per-trail). A repo has one visibility; duplicating it per-trail would just create internal-inconsistency bugs.

## Where visibility gets stamped

Every trail mutation already funnels through `updateIndex(owner, repo, modifier)` in `src/lib/trails/s3-storage.ts:205`. That's the natural place to stamp:

1. `POST /api/trails` — publish. The route already verifies the caller has write access to the repo via `GET /repos/{owner}/{repo}`. That same response carries `private: boolean`. Pass it down.
2. `DELETE /api/trails/by-id/{id}` — also calls `updateIndex` to remove the entry. Same access check; same stamp opportunity.
3. `PATCH /api/trails/by-id/{id}` (settings, sign-off, etc.) — these update the *payload* but most do not touch the index. We don't need to stamp here; the next publish or delete will refresh it.

Concretely, the publish/delete paths look up the repo, get `private`, and pass it to `updateIndex` so the modifier can write it onto the index alongside the entry mutation. One S3 `PutObject` covers both — no extra writes.

## How the explore page consumes it

1. `GET /api/trails/repos` (new route).
2. Server-side: `LIST` S3 objects with `Prefix=trails/` and `Delimiter=/` to enumerate owner segments, then per-owner `LIST` with `Delimiter=/` to enumerate repos. A few requests total even at thousands of repos.
3. For each repo, `GET trails/{owner}/{repo}/index.json` in parallel. (Bounded by `Promise.all` with a concurrency cap, e.g. 20 at a time.)
4. **Lazy backfill on read.** If an index has no `repoVisibility`, the route checks GitHub anonymously (`GET /repos/{owner}/{repo}`: 200 → public, 404 → private/missing) and stamps the result back into the index via the existing `updateIndex` flow before continuing. Subsequent reads skip the GitHub call.
5. Filter to `repoVisibility === 'public'`. Return `{ owner, repo, trailCount, lastUpdated }[]`.
6. Cache the result for ~60s at the route level (matches the existing GitHub-repo-access cache TTL — same staleness budget).
7. The page renders the full list (no pagination for now — small enough that one shot is fine), each entry linking to the existing `/{owner}/{repo}` repo-trails page.

The page lives at `src/app/explore/page.tsx` → route `/explore`.

## Handling the staleness window

Two cases to think about:

**Public → private.** A repo's visibility flips on GitHub but its `index.json` still says `public`. The explore page will list it. That's a leak risk — but only of the *repo's existence and trail count*. The actual trail contents are still protected because `GET /api/trails/[owner]/[repo]/route.ts` re-checks GitHub on every read. The leaked info is roughly "this repo used to be public and had trails," which is comparable to GitHub's own cached UI.

Mitigations, in increasing cost:

- Accept it. The explore page warns that listings refresh lazily.
- Background sweeper: a cron job re-checks visibility for indexes older than e.g. 24h and rewrites the index field. Cheap and bounded.
- Re-check at explore-page render time. Defeats the purpose of stamping; only do this if the leak is unacceptable.

**Private → public.** A repo flips public but its stamped `index.json` still says `private`. The repo silently doesn't appear in `/explore` until the next mutation. Lower-stakes — users don't lose anything they had before, they just don't get free promotion. The same background sweeper fixes this too.

**Repo deleted on GitHub.** The S3 index lives on. Same sweeper can detect 404 and either flip to `private` (safe default) or delete the index entirely. Either is fine; flipping is reversible.

## Backfill

No separate backfill job. The explore route's lazy-stamp behaviour (step 4 above) is the backfill — every index gets its visibility filled in the first time the route encounters it. While we're testing, normal use of `/explore` self-heals the population. No infra, no script, no separate code path to keep working.

The publish/delete handlers should *also* stamp visibility (they already have the GitHub access check in hand), so newly-written indexes land with the field already set. The lazy path is just for the long tail of indexes that pre-date the change and haven't been mutated since.

## Failure modes / edge cases

- **Index missing `repoVisibility` field after rollout.** Treat as unknown / not-public. Don't show on explore. The lazy/scheduled backfill fixes it.
- **Owner login renamed.** S3 keys keep the old login (lowercased). `githubRepoId` on each entry is the rename-stable anchor; the sweeper can use it to re-resolve `owner/repo` via `GET /repositories/{id}` and either rewrite keys or accept the drift. Out of scope for this doc but worth noting — it's the same problem the existing layout already has.
- **Repo flips visibility mid-publish.** The publish path's GitHub check and the stamp happen in the same handler, so they observe the same visibility. No torn write.
- **`LIST` returns indexes for repos that were once shared but have since had every trail deleted.** Today `updateIndex` writes an empty `entries: []` index rather than deleting the key. The explore page should filter `entries.length > 0`. (Or delete-on-empty in `updateIndex` — separate cleanup.)

## What this does NOT do

- It doesn't change visibility enforcement on trail *contents*. `GET /api/trails/[owner]/[repo]/route.ts` continues to check GitHub on every read. The stamp is only a hint for listing.
- It doesn't address private-repo discovery (a logged-in user wanting to see all the private repos they have trails in). That's the `/api/trails/by-user/{githubId}` route's job and stays separate.
- It doesn't introduce any new S3 prefixes, locks, or write paths. It piggybacks entirely on the existing ETag-locked index write.

## Open questions

- Sort order — by `updatedAt`, by trail count, by some popularity signal? `visitors.totalCount` is already tracked per trail; the index could aggregate it for repo-level ranking.
