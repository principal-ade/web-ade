# Trail Notes — Collaborative Notifications

Design specification for how note activity on a shared trail notifies the people
involved. Describes the intended behavior of the system.

## Model

A shared trail is a collaborative thread. Its **participants** are the person who
published and sent it (the sender) and everyone it was sent to (the recipients).
When any participant adds a note, every *other* participant is notified in their
inbox. A participant is never notified of their own note.

The inbox is each user's feed of trails they participate in, surfaced when a
trail needs their attention. A trail you sent and a trail sent to you are both
participations: each carries your personal read-state and lights up the same way
when someone else adds a note.

## Participants

For a note on trail `id`, the participant set is resolved from the trail's own
records:

- `getIdPointer(id)` (`_by-id/{id}.json`) → `{owner, repo}`.
- `getIndex(owner, repo)` + `findIndexEntry(index, id)` → the index entry, whose
  `createdBy.githubId` is the **sender** (`SharedTrailIndexEntry`, `types.ts`).
- `getOutbox(sender.githubId)` → that entry's delivery record, whose
  `recipients[]` are the **recipients** (`OutboxIndexEntry`, `types.ts`).

**Participants = sender ∪ recipients**, deduped by `githubId`.

Anonymous notes carry no author identity, so they notify every participant.

## The inbox feed

Each user has one inbox index (`_inbox/{githubId}`) listing the trails they
participate in. Every row carries the viewer's personal state:

- `readAt` — when the viewer last opened the trail (`null` until first open).
- `notesSeenCount` — the note-count watermark at the viewer's last open.
- `snapshot` — the trail's index entry, including `noteCount`, kept current by a
  lazy refresh on read.

`deriveInboxNotification` (`src/lib/trails/notifications.ts`) turns that state
into the rendered indicator:

```
unread       = readAt === null
newNoteCount = unread ? noteCount : max(0, noteCount - notesSeenCount)
dot          = unread || newNoteCount > 0
```

`GET /api/trails/inbox` stamps this `notification` onto every row and returns a
top-level `unreadCount`. The client renders the dot and the "(N new)" badge
directly from it.

## Notifying on a note

A note is created through `POST /api/trails/by-id/{id}/notes` (authored) or
`POST /api/trails/by-id/{id}/anon-notes` (anonymous). Creating a note:

1. **Persists the note** onto the trail payload.
2. **Refreshes the trail's `noteCount`** via `syncTrailNoteSummary(owner, repo,
   id)`, which recounts authored + anonymous notes and writes the total to the
   repo index entry.
3. **Fans out to participants.** It resolves the participant set and, for each
   participant, ensures an inbox row exists and reflects the new note. A trail
   reaches a participant's inbox the first time it carries activity for them, so
   a sender sees a trail they sent the moment it gets its first note.
4. **Advances the author's watermark.** The note's author has their own
   `notesSeenCount` advanced to include the note they just wrote, so the dot
   derivation leaves them unflagged while every other participant's watermark
   stays behind and their row lights up.

Fan-out writes are best-effort and reuse the inbox primitives `updateInbox` /
`putInboxEntry`. The participant set is small and notes are infrequent, so each
note is a handful of ETag-locked writes.

Opening a trail from the inbox stamps `readAt`, advances `notesSeenCount` to the
current `noteCount`, and clears the row's dot — so a participant who has caught
up shows no indicator until the next note arrives.

Deleting an inbox row removes only the viewer's own inbox entry
(`DELETE /api/trails/inbox/{trailId}` writes solely to `_inbox/{githubId}`); it
does not remove the viewer from the trail's `recipients[]`, which lives in the
sender's delivery record. Membership outlives the row. So a participant who
deletes a row remains a participant, and the next note's fan-out recreates the
row for them — deletion dismisses the current state, it does not unsubscribe.

## Freshness

A participant sees a new-note dot without reopening the trail because the client
keeps the inbox current: the unread-count poll observes the count change and
refreshes the inbox list, so the per-row dot appears on the next poll tick.

## References

- Notification derivation: `src/lib/trails/notifications.ts`
  (`deriveInboxNotification`).
- Note creation + count sync: `src/app/api/trails/by-id/[id]/notes/route.ts`,
  `src/app/api/trails/by-id/[id]/anon-notes/route.ts`,
  `src/lib/trails/route-helpers.ts` (`syncTrailNoteSummary`).
- Delivery + participant records:
  `src/app/api/trails/by-id/[id]/send/route.ts`,
  `src/lib/trails/s3-storage.ts`
  (`getInbox`, `updateInbox`, `putInboxEntry`, `getOutbox`, `getIdPointer`,
  `getIndex`, `findIndexEntry`).
- Inbox feed: `src/app/api/trails/inbox/route.ts`.
- Types: `src/lib/trails/types.ts` (`InboxIndexEntry`, `OutboxIndexEntry`,
  `SharedTrailIndexEntry`).
- Client surfaces (electron-app): `src/renderer/panels/InboxLeftPanel.tsx`,
  `src/renderer/principal-window/components/IntegratedShell/NavigationSidebar.tsx`.
- Publishing / access foundation: `docs/file-city-trail-sharing.md`.
- Agent-facing inbox read: `principal-ai inbox` (`@principal-ai/principal-view-cli`).
