# Topic comments

Add a flat **comment thread** to each topic — a discussion surface for readers to react to a curated collection of trails. Comments live on the topic record's own scope (not on individual trails), so a topic page becomes a single place where the conversation about a set of investigations happens.

Companion to [[topics.md]]; addresses follow-up #5 ("Topic-level discussion thread") from that document. This is v1: flat (no nesting), text-only, no reactions, no edit history — same posture as the rest of the topic surface.

## Goals

- Any GitHub-authenticated user can post a comment on any topic (topics are public-by-link; the comment surface should be too).
- The CLI can post a comment using the same GitHub-token resolution it already uses for `topic create` / `topic add-trail`.
- Anonymous readers see the thread and a clear "sign in with GitHub to comment" CTA — never a silent failure.
- Each comment is attributable to a GitHub identity (id + login) so moderation and self-deletion are unambiguous.

## Non-goals (v1)

| Deferred | Why |
| --- | --- |
| Threaded replies / mentions | Flat list ships sooner; threading is a layout + data-shape change we can layer on. |
| Reactions / votes | Separate primitive; orthogonal to text. |
| Edit history | Allow in-place edit (last writer wins, `updatedAt` bumps) but don't persist prior versions. |
| Markdown extensions (mentions, embeds) | Render plain markdown via the same renderer used for topic descriptions; no special tokens. |
| Per-trail / per-marker comments inside a topic | Belongs with the v2 comparison rail (topics.md follow-up #4 / #7), not here. |
| CLI sign-in / device-code flow | Out of scope — discussed separately. v1 leans entirely on the existing token resolvers (`gh auth token` → `git credential fill`). |

## Access model

- **Read.** Public. Anyone with the topic URL can fetch the thread, mirroring how the topic record itself is read. No repo gating — comments belong to the topic, not to any embedded trail's repo.
- **Write (create).** Any GitHub-authenticated caller. Identified via the same `fetchGitHubUser` + `getGitHubToken` path used by `POST /api/topics` (`src/lib/auth/request.ts`). No repo-membership requirement.
- **Write (mutate).** Edit and delete have asymmetric authorization:
  - **Edit.** Author-only (matched on `author.githubId`). The topic owner cannot rewrite someone else's words — that would muddy attribution. If the curator wants the comment gone they can delete it.
  - **Delete.** Author **or** topic owner (matched on the topic record's `createdBy.githubId`). This gives the curator a moderation hook without inventing a separate role.
- **Anonymous fallback.** A `POST` without a resolvable identity returns `401 NOT_AUTHENTICATED` with the existing topic error envelope. The web UI translates that into a "Sign in with GitHub to comment" CTA; the CLI translates it into `exitWithTokenError()` — the same message it already prints when no token is available.

## Comment record shape

```ts
interface TopicComment {
  id: string;                    // server-minted uuid
  topicId: string;               // foreign key into topics/_by-id/
  body: string;                  // markdown, plain text accepted
  author: { githubId: number; githubLogin: string };
  createdAt: string;             // ISO 8601
  updatedAt: string;             // ISO 8601 — equals createdAt unless edited
}
```

Limits (proposed; mirror the surrounding code):

- `MAX_COMMENT_CHARS` = 8 000 (same as `MAX_DESCRIPTION_CHARS`)
- `MAX_COMMENTS_PER_TOPIC` = 500 (soft cap; reject `POST` past this with a `LIMIT_REACHED` code)

## Storage layout

```
topics/_by-id/{topicId}.json                     ← unchanged (topic record)
topics/_comments/{topicId}.json                  ← comment list for a topic
```

One object per topic holds the ordered list of comments. Mutations use the same ETag-locked read-modify-write (3 retries) pattern already in `src/lib/topics/s3-storage.ts`. Concurrent comment posts are the realistic write contention case (vs. the rare owner-edit contention for the topic record), so the retry path matters here.

Rationale for one object per topic (rather than `_comments/{topicId}/{commentId}.json` per comment):

- Reads are list-oriented — the page renders the whole thread.
- 500 × ~2 KB upper bound is ~1 MB, well within sensible S3 object sizes.
- Lets us keep `updatedAt` on the container for cheap "any new comments?" polling.

## Routes

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/topics/by-id/{id}/comments` | Public | List comments for a topic (ascending by `createdAt`). |
| `POST` | `/api/topics/by-id/{id}/comments` | Authed | Append a comment. Body: `{ body: string }`. Returns the minted comment. |
| `PATCH` | `/api/topics/by-id/{id}/comments/{commentId}` | Author only | Edit `body`. Bumps `updatedAt`. |
| `DELETE` | `/api/topics/by-id/{id}/comments/{commentId}` | Author or topic owner | Remove a single comment. |

Error envelope reuses the existing topic shape `{ error, code }` from `src/lib/topics/types.ts`. New codes:

- `NOT_AUTHENTICATED` — unauthenticated `POST`/`PATCH`/`DELETE` (already used by topics).
- `COMMENT_NOT_FOUND` — id mismatch on mutate.
- `COMMENT_FORBIDDEN` — caller is neither author nor topic owner.
- `COMMENT_TOO_LONG` — body > `MAX_COMMENT_CHARS`.
- `COMMENT_LIMIT_REACHED` — topic has hit `MAX_COMMENTS_PER_TOPIC`.

The HTTP status mapping in the CLI's `describeHttpError` (`packages/cli/src/commands/topic.ts:72-95`) already handles 401/403/404 with friendly messages — comments inherit that behavior without changes.

## CLI surface

Add a `topic comment` subcommand group, sibling to `add-trail` / `update`:

```
principal topic comment add    <topic-id-or-url> --body <text>
principal topic comment list   <topic-id-or-url>
principal topic comment delete <topic-id-or-url> <comment-id>
```

Auth resolution mirrors the existing topic commands exactly — there is no new auth code:

1. Try `gh auth token` (via `spawnSync`).
2. Fall back to `git credential fill` for `host=github.com`.
3. If both fail, exit `2` with the message `topic.ts` already prints today: "Could not resolve a GitHub token. Run `gh auth login`, or configure a git credential helper for github.com."

`list` is public and works without a token (token attached if present, for rate-limit favoring — same posture as `topic view`).

`add` and `delete` require a token. If the user has none, the CLI prints the same `exitWithTokenError()` message it prints for `create` and `add-trail`. That message intentionally points them at `gh auth login` — it does **not** offer a CLI-native sign-in flow, because the CLI doesn't have one yet (see "CLI sign-in" below).

### Web UI changes

- **`/topic/{id}`** — render a `<CommentThread>` below the trail-card list. For each comment: avatar (from `githubLogin`), markdown body, relative timestamp, and (when the caller is the author or topic owner) inline Edit/Delete controls.
- **Composer.** Below the thread:
  - Signed-in: a textarea + Post button, posting to `/api/topics/by-id/{id}/comments`.
  - Signed-out: a placeholder "Sign in with GitHub to join the discussion" linking to the existing sign-in flow (`src/lib/auth`). No textarea — don't let the user type a comment they can't submit.
- **Polling / refresh.** v1 refetches on focus + after own mutations. No live websockets.

## CLI sign-in (deferred)

A separate decision, **not** part of this design. Today the CLI never originates a GitHub sign-in — it leans on `gh` or git credentials being present already. Two future options to evaluate when we pick this up:

1. **Reuse `gh auth login` exclusively.** The CLI's auth surface becomes "install `gh`, run `gh auth login`." Zero new code; reuses Microsoft/GitHub's device-code UX.
2. **Native device-code flow.** Implement the GitHub OAuth Device Authorization Grant in `packages/cli` (issue codes, poll, persist a token to `~/.config/principal-ai/`). More work, but no `gh` dependency.

Whichever we choose, the comment commands above don't change — they only need a token in hand, and they get one from the existing resolver chain.

## Design decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Topic-level vs. per-trail thread | Topic-level | Topics are the unit users land on; per-trail notes already exist on `/trail/{id}`. Per-marker / per-trail-within-topic comments are a v2 question tied to the comparison rail. |
| Identity | GitHub id + login on each comment | Same shape as `createdBy` on topics and trails; no separate "principal user" abstraction needed. |
| Moderation | Topic owner can delete (but **not** edit) any comment in their topic | Curators already own the page; giving them delete is enough moderation power without letting them rewrite attributed text. |
| Storage | One JSON per topic under `topics/_comments/` | List-oriented reads; ETag-locked writes match the rest of `topics/`; avoids a SQL dependency. |
| Anonymous compose UX | No textarea, sign-in CTA only | Don't let users type a message they can't submit — a clear gate is kinder than a failing Post button. |
| Comment edits | In-place, last writer wins, no history | Matches the topic record's edit posture; history is a v2 question if it ever matters. |
| CLI auth | Reuse existing `gh`/`git credential` resolvers verbatim | Zero new auth code; sign-in story is decided separately. |

## Follow-ups

In rough priority order:

1. **Notifications.** Email the topic owner on new comments (and comment authors on replies, once replies exist). Requires a notification channel decision.
2. **Threaded replies.** Add `parentCommentId` to the record and render one level of nesting; collapse beyond N. Defer further nesting until usage demands it.
3. **Reactions.** Lightweight 👍 / 👎 / 🎉 reactions stored as `reactions: Record<emoji, githubId[]>` on the comment.
4. **Per-marker comments inside a topic.** Lands with the v2 comparison rail (topics.md follow-up #4). A comment can attach to `(trailId, markerId)` and surface inline next to that marker on the topic page.
5. **Soft prune.** Once `MAX_COMMENTS_PER_TOPIC` is regularly hit, mirror the trails prune-by-`updatedAt` pattern.
6. **CLI sign-in** (see "CLI sign-in" above). Drives whether more CLI subcommands can be authed without a working `gh` install.
7. **Abuse controls.** Rate-limit `POST /comments` per-githubId; provide a topic-owner "lock thread" toggle.

## File map (planned)

```
src/lib/topics/
  constants.ts            (+ MAX_COMMENT_CHARS, MAX_COMMENTS_PER_TOPIC)
  types.ts                (+ TopicComment, request/response types, new error codes)
  comments-storage.ts     get / append / update / delete (ETag-locked, mirrors s3-storage.ts)
  validation.ts           (+ validateCommentBody)

src/app/api/topics/by-id/[id]/comments/
  route.ts                              GET / POST
  [commentId]/route.ts                  PATCH / DELETE

src/app/topic/[id]/
  CommentThread.tsx       List + composer
  CommentItem.tsx         Single comment + owner/author controls

packages/cli/src/commands/topic.ts      (+ comment add / list / delete subcommands;
                                         reuses existing token resolver + describeHttpError)
```
