# Authoring repo lists — curated + unsupported

Hosted trail authoring imports a repo into Freestyle Git, then a VM clones it.
Freestyle's server-side import currently **fails for some repos** (e.g.
`anomalyco/opencode`, `pingdotgg/t3code`) — not our code, not size alone, not the
token (investigation tracked in topic `topic-1781154092475`-adjacent work; see
the "Freestyle Git import failures" topic). Until that's fixed we:

- offer a **curated, verified-good** list to pick from, and
- **track repos that have failed** so the picker can warn before a repeat attempt
  and tell users we're investigating.

## Endpoint

`GET /api/authoring/repos` — auth-gated (same GitHub token as `POST
/api/authoring/runs`; `401 { code: "NOT_AUTHENTICATED" }` otherwise).

```jsonc
{
  "curated": [
    { "owner": "expressjs", "repo": "express", "defaultBranch": "master",
      "description": "Minimal, fast Node.js web framework.", "sizeKb": 9789,
      "verifiedAt": "2026-06-14" }
    // …
  ],
  "unsupported": [
    { "owner": "anomalyco", "repo": "opencode",
      "firstFailedAt": "2026-06-14T…", "lastFailedAt": "2026-06-14T…",
      "failCount": 2, "lastError": { "code": "UNAVAILABLE", "message": "…" } }
  ],
  "notice": "Some repositories currently can't be imported for authoring, and we're investigating…"
}
```

- `curated` — static, version-controlled (`src/lib/authoring/curated-repos.ts`).
- `unsupported` — global, most-recently-failed first. A repo lands here
  (`src/lib/authoring/run-job.ts` → `recordUnsupportedRepo`) only when a run
  fails with a **deliberate `AuthoringError('UNAVAILABLE')`** from the substrate
  layer (bad import/clone/VM). Deliberately excluded, to avoid false positives:
  - **raw transport blips** (`fetch failed`) that `isTransportError` maps to
    `UNAVAILABLE` — transient, can hit any host→GitHub/Freestyle hop (incl. the
    long opencode exec) after a successful import;
  - **private repos** — this list is served globally; never leak the name;
  - **curated repos** — verified to import, so a failure there is transient.
- `notice` — server-controlled copy; render it on an unsupported pick.

## Mobile-app behavior (to implement in the `mobile-app` repo)

Mirror this into `mobile-app/docs/AUTHORING_API.md`.

1. **Repo picker** fetches `GET /api/authoring/repos`. Surface `curated` as the
   suggested/default picks.
2. **Free search stays open** (existing GitHub repo search). For each result
   whose `owner/repo` matches an entry in `unsupported`, show an indicator —
   e.g. "⚠ import currently failing — we're investigating".
3. **Warn but allow** (product decision): picking an unsupported repo shows the
   `notice` plus a shortcut to the curated list, but the user may still start the
   run.
4. **Only fail once**: after a run ends in `UNAVAILABLE`, refetch
   `GET /api/authoring/repos` (or optimistically add the repo) so the indicator
   appears on the next search — the user isn't surprised twice.

## Follow-ups (not in this change)

- Fail-fast import-readiness gate (poll `branches.list()` after Freestyle
  `create`, abort before booting the VM) — would let us record a more precise
  code than `UNAVAILABLE` and fail in seconds instead of ~30s.
- Aging-out / re-verification of `unsupported` entries once Freestyle is fixed.
