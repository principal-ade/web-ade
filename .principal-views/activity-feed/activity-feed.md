# Activity Feed

Real-time GitHub activity feed displaying commits from featured repositories with hourly grouping and visualization.

## Overview

The Activity Feed is the home page experience, showing a curated stream of recent commits from featured repositories. It supports both mobile and desktop views with different interaction patterns.

## Key Features

- **Real-time polling**: 60-second refresh interval with visibility detection
- **ETag caching**: Conditional requests reduce API load (304 Not Modified)
- **Hourly grouping**: Commits grouped by hour with greeting labels
- **File City visualization**: Repository structure rendered as isometric city
- **Mobile-first**: Swipeable card interface with commit carousel

## Architecture

### Data Flow

```
Featured Repos (hardcoded)
        |
        v
useGitHubActivityFeed Hook
        |
        v
[Parallel Fetch] /api/github/repo/{owner}/{repo}/commits
        |
        v
Redis Cache (20min) + Next.js Cache (1min)
        |
        v
RepoActivitySummary[] (sorted by latest commit)
        |
        v
ActivityFeedPanel / MobileActivityFeed
        |
        v
UI Rendering
```

### Key Files

| File | Purpose |
|------|---------|
| `src/hooks/useGitHubActivityFeed.ts` | Data fetching hook with ETag support |
| `src/panels/ActivityFeedPanel.tsx` | Desktop 3-column layout |
| `src/components/home/MobileActivityFeed.tsx` | Mobile vertical swipe feed |
| `src/components/home/MobileRepoCard.tsx` | Mobile card with File City |
| `src/lib/featured-repos.ts` | Curated repository list |

### Mobile Experience

1. **Vertical swipe** between repository cards (CSS scroll-snap)
2. **Horizontal swipe** within card to browse commits
3. **File City image** updates per commit to show changed files
4. **Image prefetching** for smooth transitions

### Desktop Experience

1. **Left column**: Hourly activity heatmap
2. **Center column**: Feed cards grouped by hour
3. **Right column**: GitHub search + author profiles
4. **Time filtering** via heatmap click

## Mobile Porting Notes

When porting to React Native:

1. Replace CSS scroll-snap with React Native's `FlatList` + `pagingEnabled`
2. Replace File City PNG endpoint with native image loading
3. Implement swipe gestures with `react-native-gesture-handler`
4. Use `react-native-reanimated` for smooth carousel animations
5. Store data in state/context (same pattern as web)

## Libraries Used

| Package | Purpose | Mobile Equivalent |
|---------|---------|-------------------|
| `react` | UI framework | `react-native` |
| `@principal-ade/industry-theme` | Theming/styling | Same (or adapt for RN) |
| `@principal-ai/file-city-react` | File City canvas (desktop) | Use PNG API endpoint |
| `@principal-ai/logo-component` | Logo rendering | SVG or image asset |
| `lucide-react` | Icons | `lucide-react-native` |

## API Dependencies

- `GET /api/github/repo/{owner}/{repo}/commits` - Fetch commits
- `GET /api/github/repo/{owner}/{repo}/commits/{sha}` - Fetch commit stats
- `GET /api/file-city/{owner}/{repo}` - File City PNG image
- `GET /api/github/search` - Repository search (desktop)
