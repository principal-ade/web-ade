# Repo Notes

Users can attach personal notes to any GitHub repository. Notes exist in two independent scopes:

## Global notes

A note attached to a repo regardless of context — visible wherever that repo appears in the app.

- Stored in a single S3 file per user: `repo-notes/{userId}/notes.json`
- Fetched once on load as a flat record keyed by `"owner/repo"`
- Managed via `GET /api/repo-notes` and `PUT /DELETE /api/repo-notes/[owner]/[repo]`

## Collection-scoped notes

A note that only makes sense in the context of a specific collection — e.g. "why I added this repo here".

- Stored as a `notes` field on the `CollectionRepo` entry inside the collection's S3 JSON
- No separate store — lives alongside the repo metadata already tracked per collection
- Managed via `PATCH /api/starred-collections/[id]/repos/[owner]/[repo]`

## Limits

- Max 10,000 characters per note (both scopes)
- Sending `notes: null` in the collection PATCH clears the note
