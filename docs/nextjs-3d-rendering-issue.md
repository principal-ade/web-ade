# Next.js 3D Panel Rendering Issue

## Problem Summary

When the trail page (`/trail/[id]`) finished loading, the user saw a flash sequence:
**loading screen → panel chrome with no city → loading screen → panel chrome with city**.

The same shape of issue showed up earlier in `CodeCityPanel` inside `EditorLayout` — clicking the 3D toggle paused the panel briefly before the 3D scene appeared.

**Key observation**: this issue does NOT occur in the Electron app — only in the Next.js web app.

## Diagnosis

A focused reproduction was built at `/dev/three-flash-test` (since deleted) with four
variants of mounting `FileCity3D`:

- A — `<Canvas>` static-imported
- B — `<Canvas>` + drei static-imported
- C — `<Canvas>` via `next/dynamic({ ssr: false })`, cold
- D — same as C but with the chunk preloaded on page mount

Findings from the test page:

1. Mounting `FileCity3D` directly with sample city data produced no flash on its own when toggled by visibility.
2. A `next/dynamic` cold mount (variant C) produced the chunk-fetch flash; preloading the chunk (variant D) eliminated it.
3. Mounting the panel a second time via a manual unmount/remount toggle produced **no** flash — the cost was first-time-per-session, not per-mount.

This narrowed the root cause: it isn't a per-mount React/R3F cost. It's a one-time-per-session cost (chunk fetch + first WebGL/shader init) that, in the trail page's structure, was being incurred *at the moment the loading overlay dismissed*, making it visible.

## Root Cause

The trail page used to render `FileCityTrailExplorerPanel` only after data finished loading. By that time, the loading overlay was gone — so all the first-time costs (chunk parse, R3F internals, WebGL context, shader compilation for building meshes) ran on a now-visible canvas.

Three first-time costs stack:

1. **Chunk fetch** for `@industry-theme/file-city-panel` and `@principal-ai/file-city-react`
2. **R3F / WebGL bootstrap** — first Canvas in the session creates the WebGL context, R3F caches its module-level state
3. **Shader compilation** — the GPU compiles the building-mesh shader programs the first time they're rendered

Once any one of these has happened, subsequent mounts are cheap (browser caches kick in, R3F state is reused). That's why the manual remount via the debug button was instantaneous.

## What Did NOT Work

For the record, these were tried and abandoned:

- **`FileCityTrailExplorerPanel.preload()` alone** (chunk preload): helped with the chunk-fetch flash but did nothing for the WebGL/shader costs incurred at first user-visible paint.
- **Skeleton-mount the panel during loading** (always-render `TrailViewer` with empty payload + empty fileTree, swap to real props when data arrives): the panel rendered, but the first-time GPU work didn't actually happen until real `cityData` arrived. The flash came back at the prop swap.
- **Skeleton-mount the panel with non-empty sample fileTree** (14 sample files so meshes/shaders compiled during loading): still flashed. The panel's state machine apparently doesn't behave the same way under skeleton-then-real data as it does under real-from-mount.

## Working Fix

In `src/app/trail/[id]/page.tsx`:

1. **Module-level chunk preload** for both `FileCityTrailExplorerPanel` and `FileCity3D` via `next/dynamic`'s `.preload()`. Fires the moment the page module evaluates client-side, in parallel with the trail data fetch.
2. **Render `FileCity3D` directly** (NOT the panel) behind the loading screen with a sample `WARMING_CITY_DATA`. This warms WebGL + shader caches without involving the panel's state machine. When data arrives, this warmer unmounts and the real `TrailViewer` mounts — its `FileCity3D` inherits the warm GPU state.
3. **Minimum loading window of 2 seconds** to guarantee the warmer has time to compile shaders even on very fast trail fetches. Without it, cached/super-fast loads can dismiss the overlay before warming completes and the flash returns.

The flow:

```
t=0    Page module evaluates → preload panel + FC3D chunks
t=0    TrailPage renders → !data → render <FileCity3D WARMING_CITY_DATA>
        behind <TrailLoadingScreen> overlay
t=0+   FC3D mounts hidden → WebGL context creates, shaders compile,
        sample buildings render
t=N    Trail metadata fetch + GitHub tree fetch complete
t=2s   Min-delay elapses → setData → loading branch unmounts, warmer
        FC3D unmounts, TrailViewer mounts
t=2s+  Panel's FC3D mounts → benefits from warm GPU state → no flash
```

## Trade-offs

- The 2s minimum is a budget for warming. If a future change makes warming faster, this can be lowered. If FC3D ever exposes a "first frame rendered" callback through the panel, this should be replaced with that signal.
- The warmer renders a full (offscreen) WebGL canvas behind the loading screen. There's a real GPU cost — but it's cost we'd pay anyway when the user sees the city; we're just paying it earlier.
- `WARMING_CITY_DATA` is hardcoded in the trail page. If FC3D's shader set ever expands (new file-color layers, new mesh types), this constant may need to be updated to exercise the new paths. Otherwise we'd warm an incomplete shader set and the new shader would still flash on first real-data paint.

## Files Touched

- `src/app/trail/[id]/page.tsx` — preloads, `WARMING_CITY_DATA`, warming render, min-delay
- `next.config.ts` — already had `transpilePackages` and `optimizePackageImports` for the Three.js stack; left in place

## What This Doesn't Fix

The original `CodeCityPanel` 3D toggle inside `EditorLayout` still has the same first-time-cost behavior. If we want to apply the same fix there, the pattern is:

1. Preload `FileCity3D` chunk on page mount
2. Either always-mount FC3D hidden (visibility-toggle pattern) or render a tiny warming FC3D somewhere offscreen during the panel's idle 2D state, before the user clicks "3D"

The warming-during-loading shape doesn't translate directly to the editor (no loading screen to hide behind), so a different surface for the warmer would need to be picked.
