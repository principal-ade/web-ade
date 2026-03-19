# Stories Layout - OTEL Canvas

This canvas documents the telemetry flow for the **Stories** layout on the repository page.

## Layout Configuration

The Stories layout (`id: 'stories'`) consists of:

- **Left Panel**: `storyboard-list` - Lists available OTEL canvases and workflow files
- **Middle Panel**: `workflow-scenarios` (Canvas Editor) - Displays the selected canvas with nodes and edges
- **Right Panel**: `file-city` - 3D visualization of the codebase with storyboard highlights

## Event Flow

### 1. Layout Initialization

When the user switches to the Stories layout:
1. `LayoutSidebar` triggers layout change
2. `storyboard-list-panel` mounts in the left panel
3. Panel loads available canvases from `.principal-views/**/*.otel.canvas`

### 2. Canvas Selection Flow

When a user selects a canvas from the storyboard list:

1. **User Action**: Click on canvas in `storyboard-list-panel`
2. **Event Emit**: Panel emits `custom` event with `action: 'openCanvas'`
   - Source: `storyboard-list-panel`
   - Payload: `{ action: 'openCanvas', canvas: { path, id, name }, openMode }`
3. **Event Receive**: `EditorLayout` receives the event
4. **State Update**: Stores `selectedCanvasData` in component state
5. **Panel Switch**: Middle panel switches to `canvas-editor`

### 3. Storyboard Context Building

After canvas selection (and optionally workflow/scenario selection):

1. **Effect Trigger**: `useEffect` watches `selectedCanvasData` and `selectedWorkflowData`
2. **Context Build**: Calls `buildStoryboardContext()` from `@principal-ai/principal-view-core`
3. **Event Emit**: Emits `storyboard:context:update` event
   - Source: `editor-layout`
   - Payload: `StoryboardContextSliceData` with canvas nodes, references, and highlights

### 4. File City Highlighting

When File City receives the storyboard context:

1. **Event Receive**: File City panel subscribes to `storyboard:context:update`
2. **Extract References**: Parses node references from canvas (files in `pv.references`)
3. **Apply Highlights**: Applies highlight layer to referenced files
4. **Render**: Re-renders 3D visualization with highlighted buildings

### 5. Interactive Node Focus

When a user clicks a node in the canvas editor:

1. **User Action**: Click on canvas node
2. **Extract References**: Gets file paths from `node.pv.references`
3. **Event Emit**: Emits focus event to File City
4. **Camera Animation**: File City animates camera to focus on referenced files

## Key Components

| Component | File | Role |
|-----------|------|------|
| `LayoutSidebar` | `src/components/LayoutSidebar.tsx` | Layout selection |
| `StoryboardListPanel` | `packages/.../storyboard-list-panel/` | Lists canvases |
| `CanvasEditorPanel` | `packages/.../canvas-editor-panel/` | Renders canvas |
| `FileCityPanel` | `packages/.../file-city-panel/` | 3D visualization |
| `EditorLayout` | `src/components/EditorLayout.tsx` | Event orchestration |
| `RepositoryPageProvider` | `src/contexts/RepositoryPageProvider.tsx` | Data loading |

## Event Types

| Event | Source | Consumers |
|-------|--------|-----------|
| `custom` (openCanvas) | storyboard-list-panel | EditorLayout, RepositoryPageProvider |
| `storyboard:context:update` | editor-layout | FileCityPanel |
| `storyboard:focus` | canvas-editor | EditorLayout |
