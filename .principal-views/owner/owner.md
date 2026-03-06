# Owner Page

This canvas documents the user interactions for the `/[owner]` page, which displays a GitHub owner's (user or organization) repositories with visualization panels.

## Overview

The Owner page provides a repository browser for a GitHub user or organization with two layout modes:
- **Default** - Repository list + File City + Quality/Packages panels
- **World** - Repository list + Collection Map + File City

## Page Architecture

### Key Files
- `src/app/[owner]/page.tsx` - Main page component and wrapper
- `src/app/[owner]/OwnerPageContent.tsx` - Page content with panels and sidebar
- `src/contexts/OwnerPageProvider.tsx` - Data provider for owner state

### Data Sources
- **Owner Repositories**: `/api/github/owner/:owner/repos` - Owner's repositories
- **File Tree**: `trpc.github.getTree` - Repository structure for preview
- **Architecture Canvas**: `/api/github/repo/:owner/:repo?action=file&path=.vgc/architecture.canvas`

## Workflows

### `page-init.workflow.json` - Page Initialization
Handles initial page load with repository fetching and recent owner tracking.

### `repo-preview.workflow.json` - Repository Preview
User clicks a repository to preview it with file tree and architecture canvas.

### `view-mode.workflow.json` - View Mode Switching
Switching between Default and World layout modes.

## Event Naming Convention

All events follow the pattern: `owner.<domain>.<action>`

| Domain | Description |
|--------|-------------|
| `page` | Page-level lifecycle |
| `repos` | Owner repositories loading |
| `repo` | Repository preview/navigation |
| `file-tree` | File tree loading for preview |
| `canvas` | Architecture canvas check/load |
| `view-mode` | Layout mode switching |
| `layout` | Layout configuration |
| `panel` | Panel renders |
| `state` | State store updates |

## Data Flow Pattern

1. **Page init** - Load owner repositories, save to recent
2. **Auto-select** - First repository auto-selected if no project param
3. **Preview** - File tree + canvas check loaded for selected repo
4. **Mode switch** - User changes Default ↔ World layout
5. **Navigate** - Double-click opens full repository page

## Panels

### Default Layout
| Position | Panel | Description |
|----------|-------|-------------|
| Left | Repositories | Owner's repo list |
| Middle | File City / Visual Validation | Repo visualization |
| Right | Quality / Packages | Code quality metrics |

### World Layout
| Position | Panel | Description |
|----------|-------|-------------|
| Left | Repositories | Owner's repo list |
| Middle | Collection Map | World map view |
| Right | File City / Visual Validation | Repo visualization |

## Related Canvases

- `.principal-views/repository/repository.otel.canvas` - Repository page (single repo view)
- `.principal-views/worlds/worlds.otel.canvas` - Worlds page (collections overview)
