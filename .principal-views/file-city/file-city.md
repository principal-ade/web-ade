# File City Image Generation

## Overview

File City renders a treemap-style PNG visualization of a GitHub repository's file structure. Each directory becomes a "district" and each file a "building", sized by file count. The image is used as a repo profile picture and in activity feed cards.

## Operations

### `GET /api/file-city/[owner]/[repo]`

Generates or serves a cached PNG for the given repository.

**Query parameters:**
- `branch` — git ref to visualize (default: `HEAD`, resolves to default branch)
- `width` / `height` — image dimensions in pixels, clamped 100–2000 (default: 400×400)
- `commit` — single commit SHA to highlight changed files
- `commits` — comma-separated commit SHAs to highlight (multi-commit cards)
- `nocache=1` — bypass S3 and browser cache, always re-render

## Caching Strategy

Three layers:

| Layer | Scope | TTL |
|---|---|---|
| In-memory (`gitTreeCache`) | Git tree per branch | 24 hours |
| Redis | Commit detail responses | 24 hours |
| S3 (read + write) | Base repo images only | Browser: 1 week |

**Base repo images** (no `commit`/`commits` params) are read from S3 on cache hit, skipping the render entirely. On miss, the image is rendered and written to S3 asynchronously (fire-and-forget).

**Commit-specific images** are never cached in S3 — they are ephemeral renders for activity feed use and excluded to avoid unbounded storage growth.

## Design Choices

- **PNG over interactive canvas for mobile/cards** — pre-rendered PNGs are used in `MobileRepoCard` and repo card OG images for performance. The interactive `CodeCityPanel` (from `@industry-theme/file-city-panel`) is used in the desktop editor layout.
- **S3 write-through, not read-through (historically)** — S3 was originally write-only. The read path was added when these images became repo profile pictures requiring a 1-week cache.
- **`nocache=1` for card generation** — the `/card/[owner]/[repo]` screenshot route uses `?nocache=1` to guarantee a fresh render, bypassing all caching layers.

## Workflow Patterns

### Profile image (no commits)
Request → S3 hit → return PNG (1-week cache)
Request → S3 miss → render → async S3 upload → return PNG (1-week cache)

### Activity feed commit highlight
Request with `?commit={sha}` → render (no S3) → return PNG (1-week cache)

### Card / OG image
Request with `?nocache=1` → render (no S3) → return PNG (no-store)

## Error Scenarios

- **GitHub API non-200** during tree fetch → 500
- **Empty repository** (no files) → 500
- **S3 upload failure** → warn-only, response is not affected (fire-and-forget)
- **Render failure** → 500

## Related Files

- `src/app/api/file-city/[owner]/[repo]/route.ts` — API handler
- `src/lib/file-city/renderer.ts` — PNG rendering pipeline
- `src/lib/file-city/s3-cache.ts` — S3 read/write helpers
- `src/lib/git-tree-cache.ts` — In-memory tree cache (24h TTL singleton)
- `src/panels/RepoActivityCard.tsx` — Desktop activity feed (uses live canvas, not PNG)
- `src/components/home/MobileRepoCard.tsx` — Mobile card (uses PNG API)
- `src/app/card/[owner]/[repo]/render/page.tsx` — OG card renderer (uses PNG API with nocache)
