# UTCP Migration Plan for web-ade

## Overview

Migrate from hardcoded Gemini function definitions to UTCP-based panel tools.

## Current State

### Hardcoded Functions in GeminiContext (8 total)

| Function | Type | Event Emitted | Panel Action |
|----------|------|---------------|--------------|
| `read_file` | Data fetch | - | `fetchFileContent()` |
| `open_file` | Action | - | `actions.openFile()` |
| `toggle_panel` | UI | `panel:toggle` | - |
| `collapse_all_panels` | UI | `panel:collapse-all` | - |
| `expand_all_panels` | UI | `panel:expand-all` | - |
| `switch_panel` | UI | `panel:switch` | - |
| `list_repositories` | Data fetch | - | `getRepositories()` |
| `switch_repository` | Navigation | `repository:selected` | - |

### Where They're Defined

1. **Client execution**: `GeminiContext.tsx` (lines 110-333)
2. **API tool schema**: `api/chat/gemini/route.ts` (lines 48-152)

## Migration Strategy

### Phase 1: Define Host Tools in web-ade

Create tools that web-ade provides to all panels. These represent capabilities the host app offers.

**File**: `src/tools/hostTools.ts`

```typescript
import type { PanelTool } from '@principal-ade/panel-framework-core';

export const hostTools: PanelTool[] = [
  // File operations
  {
    name: 'read_file',
    description: 'Read the contents of a file from the repository',
    inputs: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file' },
      },
      required: ['path'],
    },
    outputs: { type: 'object' },
    tags: ['file', 'read', 'content'],
    tool_call_template: {
      call_template_type: 'panel_event',
      event_type: 'host:read-file',
    },
  },
  {
    name: 'open_file',
    description: 'Open a file in the viewer panel',
    inputs: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file' },
      },
      required: ['path'],
    },
    outputs: { type: 'object' },
    tags: ['file', 'open', 'view'],
    tool_call_template: {
      call_template_type: 'panel_event',
      event_type: 'host:open-file',
    },
  },
  // Panel UI operations
  {
    name: 'toggle_panel',
    description: 'Collapse or expand a side panel',
    inputs: {
      type: 'object',
      properties: {
        panel: { type: 'string', enum: ['left', 'right'] },
      },
      required: ['panel'],
    },
    outputs: { type: 'object' },
    tags: ['panel', 'ui', 'toggle'],
    tool_call_template: {
      call_template_type: 'panel_event',
      event_type: 'panel:toggle',
    },
  },
  // ... etc for all 8 functions
];
```

### Phase 2: Update PanelContext

1. Import `PanelToolRegistry` and `getGlobalToolRegistry`
2. Register host tools on mount
3. Connect event emitter to registry
4. Add event listeners for tool events (like `host:read-file`)
5. Export registry access for GeminiContext

**File**: `src/contexts/PanelContext.tsx`

```typescript
import {
  getGlobalToolRegistry,
  setGlobalToolRegistryEventEmitter
} from '@principal-ade/panel-framework-core';
import { hostTools } from '../tools/hostTools';

// In provider setup:
useEffect(() => {
  const registry = getGlobalToolRegistry();

  // Register host tools
  registry.registerPanelTools({
    id: 'web-ade.host',
    name: 'Host Tools',
    tools: hostTools,
  });

  // Connect event emitter
  setGlobalToolRegistryEventEmitter(events);

  // Listen for tool events
  const unsubs = [
    events.on('host:read-file', async (event) => {
      const { path } = event.payload;
      const content = await fetchFileFromGitHub(path);
      // Return result somehow (TBD)
    }),
    // ... other listeners
  ];

  return () => {
    registry.unregisterPanelTools('web-ade.host');
    unsubs.forEach(u => u());
  };
}, []);
```

### Phase 3: Update GeminiContext

Replace hardcoded `executeFunctionCall` with registry-based invocation.

**Key Changes**:

1. Get tools from registry: `registry.getToolsAsAIFunctions()`
2. Execute via registry: `registry.invokeTool(name, args)`
3. Handle async results (need a callback/promise pattern)

**Challenge**: Current tools like `read_file` return data synchronously in the function.
The event-based system is fire-and-forget.

**Solution Options**:

A. **Request/Response Events**: Emit request, listen for response
```typescript
events.emit({ type: 'host:read-file-request', payload: { id, path } });
// Later receive:
events.on('host:read-file-response', (e) => { if (e.payload.id === id) resolve(e.payload.content) });
```

B. **Keep data-fetch functions separate**: Only migrate UI actions to tools
```typescript
// Keep in GeminiContext:
case 'read_file':
case 'list_repositories':

// Migrate to tools (fire-and-forget is OK):
case 'open_file':
case 'toggle_panel':
case 'switch_panel':
// etc.
```

C. **Hybrid approach**: Tools for UI, direct calls for data

**Recommendation**: Option C - Hybrid approach for now.

### Phase 4: Update API Route

The API route needs to know about available tools to send to Gemini.

**Options**:

1. **Static**: Keep tool definitions in the API route (current approach, but sync with registry)
2. **Dynamic**: Pass tool definitions from client in the request body
3. **Shared module**: Export tool definitions from a shared file

**Recommendation**: Option 3 - Shared module

```typescript
// src/tools/geminiToolSchema.ts
export function getGeminiToolSchema(tools: AIFunctionDefinition[]): GeminiTool {
  return {
    functionDeclarations: tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters as any,
    })),
  };
}
```

## Implementation Order

### Step 1: Create host tools definition
- [ ] Create `src/tools/hostTools.ts`
- [ ] Define all 8 current functions as PanelTool
- [ ] Create `src/tools/index.ts` barrel export

### Step 2: Update PanelContext
- [ ] Import tool registry
- [ ] Register host tools on mount
- [ ] Connect event emitter
- [ ] Add event listeners for UI tools (toggle, switch, etc.)
- [ ] Keep data-fetch functions as-is for now

### Step 3: Update GeminiContext
- [ ] Import tool registry
- [ ] Replace UI function cases with `registry.invokeTool()`
- [ ] Keep `read_file` and `list_repositories` as direct functions
- [ ] Update `switch_repository` to use tool

### Step 4: Update API route
- [ ] Import host tools
- [ ] Generate Gemini schema from tools
- [ ] Remove hardcoded GEMINI_TOOLS

### Step 5: Test end-to-end
- [ ] Test each function via Gemini
- [ ] Verify events are emitted correctly
- [ ] Verify panel state changes work

## Files to Modify

| File | Changes |
|------|---------|
| `src/tools/hostTools.ts` | **NEW** - Host tool definitions |
| `src/tools/index.ts` | **NEW** - Barrel export |
| `src/contexts/PanelContext.tsx` | Register tools, add event listeners |
| `src/contexts/GeminiContext.tsx` | Use registry for UI tools |
| `src/app/api/chat/gemini/route.ts` | Generate schema from tools |

## Future: Panel-Defined Tools

After this migration, external panels can add their own tools:

```typescript
// In @industry-theme/markdown-panels
export const panels: PanelDefinition[] = [{
  metadata: {
    id: 'markdown-viewer',
    tools: [
      {
        name: 'scroll_to_heading',
        description: 'Scroll to a heading in the markdown document',
        // ...
      },
      {
        name: 'toggle_toc',
        description: 'Show or hide the table of contents',
        // ...
      },
    ],
  },
  component: MarkdownPanel,
}];
```

These would automatically appear in Gemini's available tools.
