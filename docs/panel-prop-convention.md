# Panel Prop Convention (web-ade)

**Status:** Living doc — panel convention issues / known exceptions
**Tracked by topic:** "Panel Convention Tracking" (`topic-1780331634638-sag3bvaly`)
**Sibling doc:** `electron-app/docs/panel-prop-convention.md`

## The convention (shared framework)

web-ade uses the **same** panel framework as electron-app — `@principal-ade/panel-framework-core@^0.5.1` (with `@principal-ade/panel-layouts@^0.4.8`, `@principal-ade/panels@^1.0.88`, and the `@industry-theme/*` panel packages). The framework's intended contract is the same triad:

- **`context`** — `PanelContextValue<T>`, narrowed per page (see `panel-context-migration.md`). Page providers (`HomePageProvider`, `RepositoryPageProvider`, …) expose only the typed `DataSlice`s that page needs.
- **`actions`** — `PanelActions`, sometimes enhanced at the use site (`enhancedActions`).
- **`events`** — a `PanelEventBus` (`PanelEventEmitter`). Custom event payloads live in `src/types/panel-events.ts`.

## Where web-ade diverges

Unlike electron-app (which holds the triad strictly), **web-ade routinely passes extra domain props alongside — or instead of — the triad.** This is the central convention difference to be aware of when moving between the two repos.

Two patterns appear:

**1. Triad + extra domain props.** Panels still receive `context`/`actions`/`events` but also take page-specific props. Examples (in `src/components/EditorLayout.tsx` and `RepoTrailExplorerPage.tsx`):

- `FileCityTrailExplorerPanel` — `currentAuthor`, `defaultIsolationMode`, `briefSide`, `hideNonHighlightedBuildings`, `excludedFolders`
- `CanvasEditorPanelLoader` — `canvasPath`, `canvasName`, `canvasFileInfo`, `workflowTemplate`, `selectedWorkflowId`, `workflowPath`
- `TraceDetailsPanelLoader` — `selectedTrace`
- Panels extending `PanelComponentProps` with extras, e.g. `AIChatPanel` / `WebLLMChatPanel` add `placeholder`

**2. No triad at all — raw props.** Some "panels" bypass the contract entirely and take plain domain props. Concrete example, `src/panels/RepositoryActivityFeedPanel.tsx:130`:

```ts
export interface RepositoryActivityFeedPanelProps {
  owner: string;
  repo: string;
  className?: string;
  events?: PanelEventEmitter;   // events optional; no context, no actions
}
```

`SharedSequenceDiagramsListPanel` similarly takes `owner` / `repo` / `activeId` / `walkthroughId` / `onActiveIdChange`.

### Why web-ade gets away with it (and the cost)

web-ade hosts most of these panels in **fixed, page-owned slots** built by the page itself (`EditorLayout`, the page providers), not in a generic user-configurable slot. The page knows exactly which panel it is rendering and what props to thread, so the lost configurability doesn't bite the way it would in electron-app's reorderable workspace.

The cost is the same one electron-app avoids: these panels are **not freely configurable** — they can only live in a host that knows their bespoke props — and their data dependencies aren't expressed through the framework's `context`, so they're invisible to slice-based tooling.

## Web-specific concerns layered on top

- **SSR / dynamic imports.** Panels that touch `document`/WebGL at import time are loaded via `dynamic(() => import(...), { ssr: false })` (e.g. `MarkdownPanel`, `CodeCityPanel`, `FileCity*`). See `nextjs-3d-rendering-issue.md`.
- **Per-page context providers** instead of one monolith — see `panel-context-migration.md`.
- **Host-orchestrated focus** via `panel:focus` events — see `panel-focus-pattern.md`.

## Related existing docs

- `docs/panel-context-migration.md` — monolithic → page-specific providers.
- `docs/panel-focus-pattern.md` — host-orchestrated panel focus via events.
- `docs/backlog-panel-write-support.md` — adding a `fileSystem` adapter to context.

This doc is scoped to the **prop contract** and where web-ade deviates from it; the above cover context/focus/adapter detail.
