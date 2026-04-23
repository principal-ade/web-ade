# Repo Notes API - Telemetry Documentation

## Overview

Repo Notes lets users attach personal notes to any GitHub repository. Notes exist in two scopes:

- **Global notes** — per-user, per-repo. Stored in a single S3 file and fetched once on load. Visible wherever the repo appears in the app.
- **Collection-scoped notes** — per-user, per-collection, per-repo. Stored inline on the `CollectionRepo` entry inside the starred collection's S3 JSON. Only visible when viewing a repo in the context of a specific collection.

## Architecture

**Storage**: S3-based per-user JSON file (`repo-notes/{userId}/notes.json`) for global notes. Collection-scoped notes live inside the existing `starred-collections/{userId}/collections.json` file.
**Authentication**: GitHub OAuth tokens
**Concurrency Control**: Optimistic locking with ETags (same pattern as starred-collections)
**Note limit**: 10,000 characters per note

### Key Design Decisions

1. **Single file per user for global notes**: All notes for a user are stored in one S3 file keyed by `owner/repo`. This means a single GET loads all notes at once — no per-repo fetches needed, and the payload is small for typical usage.

2. **Collection notes inline in collection storage**: Rather than a separate store, collection-scoped notes are a field (`notes?: string`) on `CollectionRepo` inside the existing starred-collections JSON. This keeps collection data self-contained and avoids cross-referencing two stores at read time.

3. **No database**: Both note surfaces follow the app-wide pattern of S3 JSON files. Notes are user-scoped with no cross-user queries needed, making a document store the right fit.

4. **Null clears collection notes**: Sending `notes: null` in the PATCH body removes the note field from the `CollectionRepo` entry, keeping the JSON clean.

## Workflows

### 1. Get All Repo Notes

**Endpoint**: `GET /api/repo-notes`

Fetches the full `RepoNotesData` object for the authenticated user. Returns an empty `notes` record if the user has no notes yet (no 404).

**Event Flow**:
1. `repo-notes.get.started` — Request initiated
2. `repo-notes.get.s3.read` — Read `repo-notes/{userId}/notes.json` from S3
3. `repo-notes.get.success` — Notes data returned

**Error Paths**:
- `repo-notes.get.unauthorized` — Missing auth token
- `repo-notes.get.error` — S3 read failure

---

### 2. Upsert a Repo Note

**Endpoint**: `PUT /api/repo-notes/[owner]/[repo]`

Creates or replaces the note for a specific repo. Uses ETag-based optimistic locking on the user's notes file.

**Event Flow**:
1. `repo-notes.upsert.started` — Request initiated with owner, repo, content length
2. `repo-notes.upsert.validate` — Validate content is a string within 10,000 char limit
3. `repo-notes.upsert.s3.read` — Read current notes file with ETag
4. `repo-notes.upsert.s3.write` — Write updated file with If-Match header
5. `repo-notes.upsert.success` — Updated note returned

**Error Paths**:
- `repo-notes.upsert.unauthorized` — Missing auth token
- `repo-notes.upsert.validation-error` — Invalid content type or exceeds length limit
- `repo-notes.upsert.error` — S3 write failure or unresolvable ETag conflict

**Request Body**: `{ content: string }`

---

### 3. Delete a Repo Note

**Endpoint**: `DELETE /api/repo-notes/[owner]/[repo]`

Removes the note for a specific repo from the user's notes file. Idempotent — succeeds even if the note doesn't exist.

**Event Flow**:
1. `repo-notes.delete.started` — Request initiated
2. `repo-notes.delete.s3.read` — Read current notes file with ETag
3. `repo-notes.delete.s3.write` — Write file with the key omitted
4. `repo-notes.delete.success` — 204 No Content

**Error Paths**:
- `repo-notes.delete.unauthorized` — Missing auth token
- `repo-notes.delete.error` — S3 write failure

---

### 4. Update Collection-Scoped Repo Note

**Endpoint**: `PATCH /api/starred-collections/[id]/repos/[owner]/[repo]`

Sets or clears the `notes` field on a `CollectionRepo` entry within a starred collection. Uses the existing starred-collections ETag locking on the collection's S3 file.

**Event Flow**:
1. `repo-notes.collection-note.started` — Request initiated
2. `repo-notes.collection-note.validate` — Validate notes content within limit
3. `repo-notes.collection-note.find-collection` — Look up collection across user/org storage
4. `repo-notes.collection-note.s3.read` — Read collection data with ETag
5. `repo-notes.collection-note.s3.write` — Write updated collection with incremented version
6. `repo-notes.collection-note.success` — Updated `CollectionRepo` returned

**Error Paths**:
- `repo-notes.collection-note.unauthorized` — Missing auth token
- `repo-notes.collection-note.validation-error` — Notes exceeds length limit or wrong type
- `repo-notes.collection-note.not-found` — Collection ID not found
- `repo-notes.collection-note.repo-not-found` — Repo not in that collection
- `repo-notes.collection-note.error` — S3 write failure or ETag conflict

**Request Body**: `{ notes?: string | null }` — `null` clears the note

---

## S3 Storage Structure

**Global notes**:
```
s3://{bucket}/repo-notes/{userId}/notes.json
```

```json
{
  "notes": {
    "owner/repo": {
      "content": "This is my note.",
      "updatedAt": "2026-04-22T10:00:00Z"
    }
  },
  "updatedAt": "2026-04-22T10:00:00Z"
}
```

**Collection-scoped notes** (inline in starred-collections):
```
s3://{bucket}/starred-collections/{userId}/collections.json
```

```json
{
  "repos": [
    {
      "owner": "vercel",
      "repo": "next.js",
      "addedAt": "2026-04-01T00:00:00Z",
      "notes": "Great framework — watch the App Router internals closely."
    }
  ]
}
```

---

## Instrumentation Scope

**Scope Name**: `repo-notes-api`

Covers all note operations: global GET/PUT/DELETE and collection-scoped PATCH.

---

## API Endpoints Summary

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/repo-notes` | Fetch all global notes for user |
| PUT | `/api/repo-notes/:owner/:repo` | Upsert a global note |
| DELETE | `/api/repo-notes/:owner/:repo` | Delete a global note |
| PATCH | `/api/starred-collections/:id/repos/:owner/:repo` | Update collection-scoped note |

---

## References

- **Global notes storage**: `src/lib/repo-notes/s3-storage.ts`
- **Global notes types**: `src/lib/repo-notes/types.ts`
- **Global notes API**: `src/app/api/repo-notes/`
- **Collection-scoped note API**: `src/app/api/starred-collections/[id]/repos/[owner]/[repo]/route.ts`
- **CollectionRepo type**: `src/lib/starred-collections/types.ts`
