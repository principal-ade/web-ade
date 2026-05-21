# Topic trail suggestions

Let any GitHub-authenticated user **suggest** a trail for a topic. The topic owner reviews and accepts or rejects each suggestion. Accepted suggestions become regular entries in `trailIds`; the owner remains the sole curator of what's actually published.

Companion to [[topics.md]]. Preserves the "curated collection" framing — open submissions would change what a topic *means*; a moderation queue keeps the owner's authority while opening contribution.

## Access model

| Action | Who |
| --- | --- |
| Suggest a trail | Any GitHub-authenticated user (one suggestion per `(topic, trail, suggester)` — no duplicates) |
| List suggestions | Public (same posture as the topic record) |
| Accept / reject | Topic owner only |
| Withdraw own suggestion | The suggester (while still `pending`) |

Auth reuses `fetchGitHubUser` + `getGitHubToken` from `src/lib/auth/request.ts`. Unauthenticated `POST` returns `401 NOT_AUTHENTICATED`, mapped by the CLI's `exitWithTokenError()` and by the web UI's sign-in CTA.

**Suggester need not be the trail's author.** Any authenticated user can suggest any resolvable trail — their own or someone else's. Three roles are independent: the trail's author, the suggester, and the topic owner who accepts/rejects. This is intentional: it lets readers pull trails they admire into relevant topics, treating a topic listing as a *reference* rather than an endorsement by the trail author. Consequences for follow-ups: notifications target the topic owner (on new suggestion) and the suggester (on resolution) — the trail author is not in the loop. The block list (follow-up 5) is per-topic against suggesters, not against trail authors.

## Record shape

```ts
interface TrailSuggestion {
  id: string;                    // server-minted uuid
  topicId: string;
  trailId: string;               // foreign key into trails/_by-id/
  reason?: string;               // optional one-line "why this fits", ≤ 500 chars
  suggestedBy: { githubId: number; githubLogin: string };
  status: 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  createdAt: string;             // ISO 8601
  resolvedAt?: string;           // set when status leaves 'pending'
  resolvedBy?: { githubId: number; githubLogin: string }; // owner who acted, or suggester for withdrawn
}
```

Limits:

- `MAX_PENDING_SUGGESTIONS_PER_TOPIC` = 100 (reject further `POST`s with `SUGGESTION_LIMIT_REACHED`)
- `MAX_REASON_CHARS` = 500

## Storage

```
topics/_by-id/{topicId}.json                       ← unchanged (topic record)
topics/_suggestions/{topicId}.json                 ← all suggestions for a topic
```

One object per topic, ordered by `createdAt`. ETag-locked read-modify-write, same pattern as `src/lib/topics/s3-storage.ts`. Rejected/withdrawn suggestions stay in the list (useful audit trail, cheap to filter) — only `pending` counts against `MAX_PENDING_SUGGESTIONS_PER_TOPIC`.

## Routes

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/topics/by-id/{id}/suggestions` | Public | List all suggestions. Supports `?status=pending` filter. |
| `POST` | `/api/topics/by-id/{id}/suggestions` | Authed | Suggest a trail. Body: `{ trailId, reason? }`. Validates the trail resolves; rejects duplicate `(topic, trail, suggester)` pairs. |
| `POST` | `/api/topics/by-id/{id}/suggestions/{suggestionId}/accept` | Owner | Mark accepted; append `trailId` to the topic's `trailIds` (atomic with the status flip via the same ETag write). |
| `POST` | `/api/topics/by-id/{id}/suggestions/{suggestionId}/reject` | Owner | Mark rejected. No topic-record mutation. |
| `POST` | `/api/topics/by-id/{id}/suggestions/{suggestionId}/withdraw` | Suggester | Mark withdrawn. No topic-record mutation. |

New error codes (extend `src/lib/topics/types.ts`):

- `SUGGESTION_NOT_FOUND`
- `SUGGESTION_FORBIDDEN` — caller is not owner (accept/reject) or not suggester (withdraw)
- `SUGGESTION_ALREADY_RESOLVED` — `status !== 'pending'` on accept/reject/withdraw
- `SUGGESTION_DUPLICATE` — same suggester already has a pending suggestion for this trail
- `SUGGESTION_LIMIT_REACHED`

The existing owner-only `POST /api/topics/by-id/{id}/trails` stays unchanged — owners can still add trails directly, bypassing the queue. Non-owners now have a path that didn't exist.

## CLI surface

```
principal topic suggest <topic-id-or-url> <trail-id-or-url> [--reason <text>]
principal topic suggestions <topic-id-or-url> [--status pending|accepted|rejected|withdrawn]
principal topic accept  <topic-id-or-url> <suggestion-id>
principal topic reject  <topic-id-or-url> <suggestion-id>
```

All reuse the existing `gh auth token` → `git credential fill` resolver. No new auth code; `suggestions` is public-readable (token attached when present for rate limits).

## Web UI

- **`/topic/{id}`** — owner sees an inline "Suggestions (N pending)" panel above the trail list with Accept / Reject buttons on each row. Non-owner signed-in sees a "Suggest a trail" button (opens a small dialog: paste trail URL + optional reason). Signed-out sees the same sign-in CTA used elsewhere.
- **State after accept.** Accepted trail appears at the end of `trailIds` (consistent with `POST /trails`). The owner can reorder afterward via the existing reorder PATCH.

## Design decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Curation model | Suggestion queue, owner approves | Preserves "topic = what the owner thinks belongs"; opening writes would change the noun. |
| Where the queue lives | Sibling object under `topics/_suggestions/` | Keeps the topic record small + cheaply cacheable; mutations don't churn the topic JSON. |
| Accept = atomic with append | Single ETag-locked write to the topic record + suggestion list | Avoids a half-applied state where the suggestion says accepted but the trail isn't in `trailIds`. |
| Resolved suggestions retained | Kept in the list with `status` set | Cheap audit trail; suggester can see "rejected" without re-suggesting. |
| Duplicate handling | One pending per `(topic, trail, suggester)` | Different users can both suggest the same trail (signal of interest); the same user cannot spam. |
| Notifications | Deferred | Doc-only follow-up; in v1 the owner notices via the topic page or `principal topic suggestions`. |

## Follow-ups

1. **Notify the owner on new suggestions** (email or in-app). Without this, suggestions only surface when the owner visits the page.
2. **Notify the suggester on resolution** (accepted / rejected with optional owner note).
3. **Owner note on reject.** Optional text body on the reject action, surfaced to the suggester.
4. **Bulk accept / reject** in the owner UI when a topic gets many pending suggestions at once.
5. **Block list per topic.** Owner can mute a specific GitHub user from suggesting further.

## File map (planned)

```
src/lib/topics/
  constants.ts            (+ MAX_PENDING_SUGGESTIONS_PER_TOPIC, MAX_REASON_CHARS)
  types.ts                (+ TrailSuggestion, new error codes)
  suggestions-storage.ts  list / append / resolve (ETag-locked)
  validation.ts           (+ validateSuggestionReason)

src/app/api/topics/by-id/[id]/suggestions/
  route.ts                                  GET / POST
  [suggestionId]/accept/route.ts            POST
  [suggestionId]/reject/route.ts            POST
  [suggestionId]/withdraw/route.ts          POST

src/app/topic/[id]/
  SuggestionsPanel.tsx    Owner queue + accept/reject controls
  SuggestDialog.tsx       Non-owner submit form

packages/cli/src/commands/topic.ts          (+ suggest / suggestions / accept / reject)
```
