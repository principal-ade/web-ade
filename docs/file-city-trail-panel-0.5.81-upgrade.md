# Upgrading to `@industry-theme/file-city-panel` 0.5.81

The 0.5.81 release introduces three schema-level concepts to `TrailPayload`:
**purpose**, **share**, and a special **subject marker** role. Web-ade is
the share API for trails, so this upgrade has direct implications for
how the publish flow assigns identity and how readers see review chrome.

See the panel-side design notes for the full model:
[`docs/TRAIL_KINDS_AND_STAMPS.md`](https://github.com/principal-ai/industry-themed-file-city-panels/blob/main/docs/TRAIL_KINDS_AND_STAMPS.md)
(or your local clone). Quick recap below.

## What changed

### `TrailPayload.purpose` replaces `TrailPayload.kind`

The free-form `kind?: string` field is gone; it's now a typed enum:

```ts
type TrailPurpose = 'investigation' | 'changelog' | 'informative';

interface TrailPayload {
  // …
  purpose?: TrailPurpose; // undefined ⇒ treat as 'investigation'
}
```

Semantics:

- `'investigation'` — exploratory trail, ephemeral. Has a *subject*
  marker (the answer). Default when omitted.
- `'changelog'` — pinned to a diff/PR, ephemeral.
- `'informative'` — canonical structural description, durable. The
  only purpose that carries **stamps**.

### `TrailPayload.share` flags shared trails

```ts
interface TrailShare {
  id: string;
}

interface TrailPayload {
  // …
  share?: TrailShare;
}
```

`share` is the binary flag the panel uses to gate audience-side chrome:

- `share === undefined` — local-only trail. Panel hides stamp UI,
  visit counter, REVIEWED BY / VISITED BY rosters, and request
  framing. The intro modal renders in a quieter local mode.
- `share.id` defined — shared trail. Panel shows the full review
  chrome. Informative trails require ≥1 sign-off to be considered
  "verified."

**This is the key concept for web-ade.** When a trail is POSTed to the
share API, web-ade owns the share identity — the act of publishing IS
what makes the trail shared. Web-ade should assign `share.id` at publish
time (see "Required changes" below).

The intent is that `request` (currently still a top-level field for
back-compat) eventually migrates under `share` once the registry is
richer; v1 keeps it where it is.

### `TrailMarker.kind: 'subject'`

```ts
type TrailMarkerKind = 'subject';

interface TrailMarker {
  // …
  kind?: TrailMarkerKind;
}
```

`'subject'` is investigation-specific — it marks the bug location /
cause / answer the trail is directing the reader's focus toward. At
most one per trail. Promotion of an investigation to an informative
trail requires a subject. Other purposes don't carry subjects; the
field is omitted on their markers.

No validation is strictly required (the field flows through any
loose-cast validator that preserves unknown marker fields), but tightening
to "subject or strip" is recommended.

## Required changes in web-ade

### 1. Bump the dependency

```diff
- "@industry-theme/file-city-panel": "^0.5.80",
+ "@industry-theme/file-city-panel": "^0.5.81",
```

The caret-pinned `0.5.80` would not auto-upgrade across this minor's
type-level changes — bump explicitly and run `npm install`.

### 2. `src/lib/trails/validation.ts` — replace `kind` with `purpose`

Around `validatePayload`, line ~471:

```ts
// Before
if (typeof p.kind === 'string') clean.kind = p.kind;

// After
const purposeCandidate =
  typeof p.purpose === 'string'
    ? p.purpose
    : typeof p.kind === 'string'
      ? p.kind
      : undefined;
if (
  purposeCandidate === 'investigation' ||
  purposeCandidate === 'changelog' ||
  purposeCandidate === 'informative'
) {
  clean.purpose = purposeCandidate;
}
```

The `kind` fallback accepts the legacy field name for back-compat with
producers that haven't upgraded yet. Unknown values drop to `undefined`
(per the doc's "undefined ⇒ investigation" default rule).

### 3. Assign `share.id` at publish time

This is the meaningful behavior change for the share API. Currently
`POST /api/trails` validates a payload and stores it as-is. The new
panel won't render review chrome for trails without `share` set, so
stored payloads need it.

In `src/app/api/trails/route.ts` (the POST handler), after validation
and id resolution:

```ts
// Stamp the trail as shared. Web-ade owns the share registry, so the
// act of publishing IS what makes a trail shared — set `share.id`
// from the trail id so the panel renders audience-side chrome (stamp
// UI, rosters, request framing) on read.
const sharedPayload: TrailPayload = {
  ...payload,
  share: { id: payload.id },
};

const { sizeBytes } = await putPayload(owner, repo, id, sharedPayload);
// …
```

If a producer already set `share.id`, you can either preserve it or
override with the server-side id. Web-ade-as-registry probably wants
to **always override** — the registry's id is authoritative.

### 4. Migration for existing stored trails

Trails published before 0.5.81 don't have `share` set. When the new
panel renders them, it'll treat them as local-only and strip the
review chrome — including hiding sign-off stamps that *do* exist on
the payload.

Two options:

**Option A (recommended): backfill on read.** In
`toPublicPayload(stored)` (src/lib/trails/types.ts), set
`share.id ??= stored.id`. This is non-destructive — older S3 objects
keep their original bytes; the read path synthesizes the field.

```ts
export function toPublicPayload(stored: StoredTrailPayload): TrailPayload {
  const { _seenAnonIds: _drop, ...rest } = stored;
  // Backfill `share` for trails published before 0.5.81 — every trail
  // we serve from this registry is by definition shared.
  if (!rest.share) {
    return { ...rest, share: { id: rest.id } };
  }
  return rest;
}
```

**Option B: one-time S3 rewrite.** Iterate the index, load each
payload, set `share.id = payload.id` if missing, write back. Heavier
but normalizes storage.

Option A is fine for most cases. Option B becomes worthwhile if
something else starts depending on the stored shape.

### 5. (Optional) Accept `share` from external producers

Some producers may want to publish a trail with `share` already set
(e.g., agents that mint the share id themselves). Validation should
either accept and overwrite, or accept and pass through. Recommended:
**accept the field but always overwrite with the server-side id**,
since the registry is authoritative.

In `validatePayload`:

```ts
// Accept `share` from the body but only as a shape check; the POST
// handler will overwrite with the authoritative server-side id.
if (
  isPlainObject(p.share) &&
  typeof (p.share as { id?: unknown }).id === 'string'
) {
  clean.share = { id: (p.share as { id: string }).id };
}
```

Strictly speaking unnecessary — you'll overwrite anyway — but accepting
it lets future producers test their wiring without round-tripping
through the publish endpoint.

### 6. (Optional) Validate `marker.kind`

Currently the marker validator returns `m as TrailMarker`, which
preserves any fields including `kind`. To make it explicit:

```ts
const out: TrailMarker = { /* existing fields */ };
if (m.kind === 'subject') out.kind = 'subject';
return out;
```

Drop unknown values. The panel treats `undefined` as a regular marker,
so anything else gets stripped silently.

## What doesn't change

- `TrailMarker`, `TrailView`, `TrailNote`, `TrailNoteDraft`,
  `TrailSignOff`, `BaseTrailIndexEntry` — all preserved at their old
  shapes. The added fields are optional.
- `SharedTrailIndexEntry` / `SharedTrailIndex` / response shapes — no
  change.
- Note routes, sign-off routes, visits route — no change.
- Snippet validation — no change.

## Open questions for web-ade

These didn't need to be decided to ship 0.5.81 but are worth tracking:

1. **Stamp authority on shared informative trails.** The panel
   *requires* ≥1 sign-off before a shared informative trail is
   considered verified. Today web-ade accepts sign-offs after
   publish via a separate route. The "publish requires verification"
   rule is enforced on the panel side only — web-ade currently
   doesn't gate POST on the presence of a sign-off, and that's fine
   for v1.
2. **`request` migration.** Once the share registry gets richer
   (audience, snapshot vs. live-reference), `request` becomes a
   share-side concept and should move under `share`. For now it
   stays a top-level field on the payload for back-compat.
3. **Shared non-informative trails.** Whether shared investigations
   / changelogs surface anything beyond visibility (visit counts,
   read receipts) is deferred on the panel side. Web-ade's
   `/visits` route already covers visit counts uniformly across
   purposes, which is the most permissive interpretation. Revisit
   if we want to gate certain features on purpose.
