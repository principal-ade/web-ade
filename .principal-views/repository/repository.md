# Repository Page

This canvas documents the user interactions for the `/[owner]/[repo]` page, which displays a GitHub repository with file browsing and package composition analysis.

## Overview

The Repository page provides an interactive view of a single GitHub repository with:
- File tree visualization (File City panel)
- Package composition analysis (monorepo detection)
- File content viewing and editing

## Page Architecture

### Key Files
- `src/app/[owner]/[repo]/page.tsx` - Main page component
- `src/contexts/RepositoryPageProvider.tsx` - Data provider for repository state

### Data Sources
- **File Tree**: `/api/github/tree` - GitHub tree API
- **Packages**: `/api/github/packages` - Package composition analysis
- **File Content**: `/api/github/file` - GitHub file content API

### Panel Layout
| Left Panel | Middle Panel | Right Panel |
|------------|--------------|-------------|
| File Tree / Packages | File City | File Editor |

## Workflows

### 1. Page Initialization (`page-init.workflow.json`)
Handles initial page load with parallel data fetching:

```
Page Init (owner/repo from URL)
    │
    ├──► File Tree Load (parallel)
    │         │
    │         ├──► Success → State → File City Panel
    │         └──► Error (empty repo, 404)
    │
    └──► Packages Load (parallel)
              │
              ├──► Success → State → Package Composition Panel
              └──► Error (no package.json)
```

### 2. Data Hydration (`data-hydration.workflow.json`)
Two data flows feeding their respective panels:

**Scenario 1: file-tree-to-city** (File City visualization)
```
file-tree.load
    │
    └──► file-tree.success
              │
              └──► state.file-tree.updated ──► panel.file-city.render
```

**Scenario 2: packages-to-panel** (Package Composition)
```
packages.load
    │
    └──► packages.success
              │
              └──► state.packages.updated ──► panel.packages.render
```

### 3. File Selection (`file-selection.workflow.json`)
When user clicks a file in the tree or File City:

```
File Selected
    │
    └──► File Content Load
              │
              ├──► Success → State → Editor Panel
              └──► Error (binary, too large)
```

## Event Naming Convention

All events follow the pattern: `repo.<domain>.<action>`

| Domain | Description |
|--------|-------------|
| `page` | Page-level lifecycle |
| `file-tree` | File tree loading |
| `packages` | Package composition loading |
| `file` | File selection and content |
| `state` | State store updates |
| `panel` | Panel renders |
| `readme` | README auto-loading |

## Data Flow Pattern

1. **Page init** - Triggers parallel data loads
2. **Load** - API calls to GitHub
3. **Success/Error** - Handle response
4. **State update** - Write to provider state
5. **Panel render** - Panels subscribe to state and re-render

## Related Canvases

- `.principal-views/worlds/worlds.otel.canvas` - Worlds page (collections overview)
- `.principal-views/shared-collections/shared-collections.otel.canvas` - Shared collections view
