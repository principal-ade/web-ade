# Schematic API Missing `owned-scopes` from `library.yaml`

## Overview

The schematic API at `app.principal-ade.com` does not include `library.yaml` content in its response. This prevents trace processing from matching instrumentation scopes to their storyboards, causing spans to display unhelpful scope warnings.

## Current Behavior

When querying the schematic API:

```bash
curl https://app.principal-ade.com/api/schematic?owner=principal-ade&repo=industry-themed-backlogmd-kanban-panel
```

The response only includes:

```json
{
  "commitSha": "abc123...",
  "registeredAt": "2026-03-01T...",
  "repositoryUrl": "https://github.com/principal-ade/industry-themed-backlogmd-kanban-panel",
  "storyboards": [
    {
      "name": "kanban-panel",
      "scope": "root",
      "scenarios": [...]
    }
  ]
}
```

**Missing fields:**
- `library` - the parsed `library.yaml` content
- `resources` - the resource definitions
- `ownedScopes` - which instrumentation scopes belong to this repository

## The Problem

### Symptom

Spans in the trace viewer display:

```
backlog.core.init (Scope "@industry-theme/backlogmd-kanban-panel" is registered but has no storyboards defined in .principal-views/)
```

### Root Cause

1. Libraries define `owned-scopes` in `.principal-views/library.yaml` to claim ownership of instrumentation scopes
2. The schematic API does not parse or return this information
3. Trace processing cannot match instrumentation scopes to storyboards
4. All spans from claimed scopes show the "no storyboards defined" warning

### Example `library.yaml`

The kanban panel has this configuration:

```yaml
# .principal-views/library.yaml
version: "1.0.0"
name: "@industry-theme/backlogmd-kanban-panel"
description: "Kanban board panel for visualizing Backlog.md tasks"

resources:
  backlogmd-kanban-panel:
    service.name: "@industry-theme/backlogmd-kanban-panel"
    deployment.environment: "production"
    owned-scopes:
      - "@industry-theme/backlogmd-kanban-panel"
      - "@backlog-md/core"

  backlogmd-kanban-panel-storybook:
    service.name: "industry-themed-backlogmd-kanban-panel-storybook"
    deployment.environment: "development"
    owned-scopes:
      - "@industry-theme/backlogmd-kanban-panel"
      - "@backlog-md/core"
```

This declares that:
- The kanban panel owns its own instrumentation scope
- It also owns the `@backlog-md/core` scope (a dependency it uses)
- Both storybook and production environments have these scope claims

## Expected Behavior

The schematic API should return `owned-scopes` information so trace processing can:

1. Match spans with scope `@industry-theme/backlogmd-kanban-panel` to this repository's storyboards
2. Match spans with scope `@backlog-md/core` to this repository's storyboards (when that's the consumer)
3. Display the appropriate storyboard context for the span

### Proposed API Response

```json
{
  "commitSha": "abc123...",
  "registeredAt": "2026-03-01T...",
  "repositoryUrl": "https://github.com/principal-ade/industry-themed-backlogmd-kanban-panel",
  "library": {
    "version": "1.0.0",
    "name": "@industry-theme/backlogmd-kanban-panel",
    "description": "Kanban board panel for visualizing Backlog.md tasks"
  },
  "resources": {
    "backlogmd-kanban-panel": {
      "service.name": "@industry-theme/backlogmd-kanban-panel",
      "deployment.environment": "production",
      "owned-scopes": [
        "@industry-theme/backlogmd-kanban-panel",
        "@backlog-md/core"
      ]
    }
  },
  "storyboards": [
    {
      "name": "kanban-panel",
      "scope": "root",
      "scenarios": [...]
    }
  ]
}
```

## Implementation Requirements

### Server-Side Changes

1. **Parse `library.yaml`** from `.principal-views/library.yaml` when indexing repositories
2. **Store resource definitions** including `owned-scopes` in the database
3. **Include in API response** the `library` and `resources` fields

### Schema Changes

The schematic storage may need to add:

```typescript
interface SchematicResource {
  'service.name': string;
  'deployment.environment': string;
  'owned-scopes'?: string[];
}

interface SchematicResponse {
  commitSha: string;
  registeredAt: string;
  repositoryUrl: string;
  library?: {
    version: string;
    name: string;
    description?: string;
  };
  resources?: Record<string, SchematicResource>;
  storyboards: Storyboard[];
}
```

### Client-Side Changes

The trace processing logic needs to:

1. Fetch schematic data including `owned-scopes`
2. Build a scope-to-storyboard mapping
3. Match spans by their instrumentation scope to the appropriate storyboards

## Impact

### Affected Components

- **Trace Viewer**: Cannot show storyboard context for library spans
- **Scope Registration**: Shows misleading "no storyboards defined" warning
- **Multi-Library Traces**: Cannot attribute spans to correct library context

### Use Cases Blocked

1. **Library authors** cannot define which scopes belong to their library
2. **Consumers** cannot see storyboard context for dependency spans
3. **Multi-scope libraries** cannot claim ownership of internal/external scopes

## Workaround

Currently, there is no client-side workaround. The data simply isn't available in the API response.

A temporary solution would be to hardcode scope-to-repository mappings in the trace processing code, but this is not maintainable.

## Related Files

- `.principal-views/library.yaml` - Where `owned-scopes` is defined
- `src/lib/trace-orchestration.ts` - Where scope matching would happen
- Schematic API endpoint - Needs to parse and return `library.yaml` content

## Priority

**High** - This blocks the core observability demo feature where traces from multiple libraries should display with their respective storyboard context.

## Verification

After the fix is implemented, verify:

1. Query the schematic API and confirm `resources` with `owned-scopes` is present
2. View a trace with `@industry-theme/backlogmd-kanban-panel` scope
3. Confirm the span displays with storyboard context instead of the warning message

---

**Created**: 2026-03-02
**Author**: Development Team
**Status**: Open
