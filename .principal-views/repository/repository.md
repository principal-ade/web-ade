# Repository Page

This canvas documents the user interactions for the `/[owner]/[repo]` page, which displays a GitHub repository with multiple layout modes.

## Overview

The Repository page provides an interactive view of a single GitHub repository with multiple sidebar layout options:
- **Overview** - README/markdown viewing with File City
- **Tour** - Interactive codebase tour
- **Stories** - Workflow storyboards and scenarios
- **Skills** - Claude skills in the repository
- **Quality Views** - Code quality metrics and lenses
- **Telemetry** - OpenTelemetry traces and spans

## Page Architecture

### Key Files
- `src/app/[owner]/[repo]/page.tsx` - Main page component
- `src/contexts/RepositoryPageProvider.tsx` - Data provider for repository state
- `src/components/EditorLayout.tsx` - Layout manager with sidebar modes

### Data Sources
- **File Tree**: `/api/github/tree` - GitHub tree API
- **Packages**: `/api/github/packages` - Package composition analysis
- **File Content**: `/api/github/file` - GitHub file content API

## Workflows by Layout Mode

### Shared Workflows (all layouts)

#### `page-init.workflow.json` - Page Initialization
Handles initial page load with parallel data fetching (file tree + packages).

#### `data-hydration.workflow.json` - Data Hydration
Two scenarios for data flowing to panels:
- `file-tree-to-city` - File tree → File City Panel
- `packages-to-panel` - Packages → Package Composition Panel

#### `file-selection.workflow.json` - File Selection
User clicks a file → content loads → editor/markdown panel renders.

### Layout-Specific Workflows

| Workflow | Layout | Key Flow |
|----------|--------|----------|
| `overview.workflow.json` | Overview | README auto-load → markdown panel |
| `tour.workflow.json` | Tour | Tour config load → step navigation |
| `stories.workflow.json` | Stories | Storyboard list → select → scenarios |
| `skills.workflow.json` | Skills | Skills list → select → detail |
| `quality.workflow.json` | Quality Views | Quality data → lens select → metrics |
| `telemetry.workflow.json` | Telemetry | Traces list → select → details |

## Event Naming Convention

All events follow the pattern: `repo.<domain>.<action>`

| Domain | Description |
|--------|-------------|
| `page` | Page-level lifecycle |
| `layout` | Layout mode switching |
| `file-tree` | File tree loading |
| `packages` | Package composition loading |
| `file` | File selection and content |
| `state` | State store updates |
| `panel` | Panel renders |
| `readme` | README auto-loading |
| `tour` | Tour configuration and navigation |
| `storyboard` | Storyboard list and selection |
| `skills` | Skills list and selection |
| `quality` | Quality data and lenses |
| `traces` | Telemetry traces |

## Data Flow Pattern

1. **Page init** - Triggers parallel data loads
2. **Layout switch** - User changes sidebar mode
3. **Load** - API calls for layout-specific data
4. **Success/Error** - Handle response
5. **State update** - Write to provider state
6. **Panel render** - Panels subscribe to state and re-render

## Related Canvases

- `.principal-views/worlds/worlds.otel.canvas` - Worlds page (collections overview)
- `.principal-views/shared-collections/shared-collections.otel.canvas` - Shared collections view
