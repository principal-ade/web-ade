# Mobile Safari Canvas Crash - File City Rendering

This document describes the mobile Safari crash issue encountered on principal-ade.com's homepage activity feed and the solution implemented.

## Problem

Users on mobile Safari experienced repeated crashes with the error message: "An error repeatedly occurred on principal-ade.com". The issue only affected mobile devices, not desktop.

## Root Causes

### 1. iOS Safari Canvas Memory Limits

iOS Safari enforces a strict canvas size limit of **67 million pixels** (approximately 8192 x 8192). The File City visualization's `calculateCanvasResolution` function could produce canvases up to 9500 x 9500 for large repositories, exceeding this limit.

**Console warning:**
```
Canvas area exceeds the maximum limit (width * height > 67108864)
```

When this limit is exceeded, Safari silently fails canvas operations or crashes the page.

### 2. CSS `display: none` Does Not Prevent React Mounting

The activity feed layout used Tailwind's responsive classes:
```tsx
<div className="hidden md:flex">
  {/* Desktop RepoActivityCard components with canvas */}
</div>
```

This CSS approach **visually hides** components on mobile but **does not prevent React from mounting them**. The component lifecycle runs, effects execute, and canvases are created even though they're not visible.

### 3. Cumulative GPU Memory Consumption

Each File City canvas uses WebGL for rendering. When multiple activity cards mount simultaneously:
- Multiple WebGL contexts are created
- Each allocates GPU memory
- iOS Safari's GPU memory budget is limited
- Cumulative usage causes crashes

## Solution Architecture

### 1. Server-Side Image Rendering

Instead of client-side canvas rendering, mobile now uses pre-rendered PNG images from the API:

```
GET /api/file-city/[owner]/[repo]?width=800&height=800&commit=<sha>
```

**API endpoint:** `src/app/api/file-city/[owner]/[repo]/route.ts`

The server generates images using Node.js `canvas` package which doesn't have the iOS memory constraints.

### 2. Conditional React Mounting

Added device detection to prevent desktop components from mounting on mobile:

```tsx
// src/panels/ActivityFeedPanel.tsx
const [isMobile, setIsMobile] = useState(false);

useEffect(() => {
  const checkMobile = () => setIsMobile(window.innerWidth < 768);
  checkMobile();
  window.addEventListener('resize', checkMobile);
  return () => window.removeEventListener('resize', checkMobile);
}, []);

// Only mount desktop components when not on mobile
{!isMobile && (
  <div className="hidden md:flex">
    {/* Desktop canvas-based components */}
  </div>
)}
```

This ensures canvas components are **never created** on mobile, not just hidden.

### 3. Commit-Aware Image Generation

Images can highlight files changed in a specific commit:

```tsx
// MobileRepoCard.tsx
const activeCommit = summary.commits[activeCommitIndex];
const fileCityImageUrl = activeCommit
  ? `/api/file-city/${owner}/${repo}?width=800&height=800&commit=${activeCommit.sha}`
  : `/api/file-city/${owner}/${repo}?width=800&height=800`;
```

The API fetches commit details and passes them to the renderer as `highlightFiles`.

### 4. Image Prefetching

To ensure smooth UX during swipe navigation, the next commit's image is prefetched:

```tsx
const nextCommit = summary.commits[activeCommitIndex + 1];

useEffect(() => {
  if (nextCommit && !loadedImages.has(nextCommit.sha)) {
    const img = new Image();
    img.src = `${baseImageUrl}&commit=${nextCommit.sha}`;
    img.onload = () => {
      setLoadedImages(prev => new Set(prev).add(nextCommit.sha));
    };
  }
}, [nextCommit, baseImageUrl, loadedImages]);
```

## Current Caching

### Redis Caching (Commit Details)

Commit details from GitHub API are cached in Redis:
- **TTL:** 24 hours
- **Key format:** `github:commit:${owner}/${repo}/${sha}`
- **Rationale:** Commits are immutable, so caching by SHA is safe

```tsx
// src/app/api/file-city/[owner]/[repo]/route.ts
const cacheKey = getCommitDetailCacheKey(owner, repo, sha);
const cached = await getCached<GitHubCommitDetailResponse>(cacheKey);
if (cached) return cached;
// ... fetch and cache
```

### Git Tree Caching (In-Memory)

The GitHub tree response is cached using the `gitTreeCache`:
- Keyed by both branch name and tree SHA
- Avoids redundant API calls for the same repository state

### S3 Caching (Images)

Generated images are uploaded to S3 for CDN caching:
- **Key format:** `file-city/${owner}/${repo}/${width}x${height}-${commitSha}.png`
- Non-blocking upload (doesn't delay response)
- Currently serves images directly rather than redirecting to S3

## Future Caching Improvements

### 1. S3 Cache-First Pattern

Instead of always generating images, check S3 first:

```tsx
// Proposed approach
const s3Key = generateFileCityS3Key(owner, repo, width, height, commitSha);

// Check if image exists in S3
const cachedUrl = await getFileCityImageUrl(s3Key);
if (cachedUrl) {
  return NextResponse.redirect(cachedUrl);
}

// Generate and cache
const buffer = await renderFileCityPng(options);
await uploadFileCityImage(s3Key, buffer);
return new NextResponse(buffer, ...);
```

**Considerations:**
- Requires public S3 bucket or signed URLs
- May need CloudFront distribution for global performance
- Must handle cache invalidation for repository changes

### 2. Pre-Generation Pipeline

For popular repositories, pre-generate images on push events:

```
GitHub Webhook → Lambda → Generate Image → S3
```

This would:
- Reduce first-load latency
- Amortize rendering costs
- Enable aggressive caching headers

### 3. Tiered Resolution

Generate multiple resolutions to optimize bandwidth:

| Device Type | Resolution | Use Case |
|------------|------------|----------|
| Mobile     | 400x400    | Quick load, swipe feed |
| Tablet     | 800x800    | Balance quality/size |
| Desktop    | 1200x1200  | High-detail view |

### 4. Conditional Regeneration

Only regenerate when repository structure changes:

```tsx
// Compare tree SHAs to detect changes
const currentTreeSha = await getTreeSha(owner, repo, branch);
const cachedTreeSha = s3Object.Metadata['tree-sha'];

if (currentTreeSha === cachedTreeSha) {
  // Serve cached version
}
```

## Key Files

| File | Purpose |
|------|---------|
| `src/components/home/MobileRepoCard.tsx` | Image-based mobile card |
| `src/panels/ActivityFeedPanel.tsx` | Conditional desktop mounting |
| `src/app/api/file-city/[owner]/[repo]/route.ts` | Image generation API |
| `src/lib/file-city/renderer.ts` | Server-side PNG rendering |
| `src/lib/file-city/s3-cache.ts` | S3 upload utilities |

## Lessons Learned

1. **CSS hiding is not unmounting** - Use conditional rendering (`{condition && <Component/>}`) to truly prevent component lifecycle execution.

2. **Test on real devices** - iOS Safari's memory constraints only surface on actual hardware. Use Safari Web Inspector via USB debugging.

3. **Mobile-first architecture** - Consider device capabilities when designing data-heavy visualizations. Server-side rendering can offload work from constrained mobile GPUs.

4. **Canvas limits vary** - Desktop browsers allow much larger canvases. Always cap dimensions for mobile compatibility or use server-side rendering.

## Related Issues

- Safari viewport height issue: `SAFARI_VIEWPORT_ISSUE.md`
