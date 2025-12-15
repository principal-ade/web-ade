# Agent Command Palette Integration Guide

This guide covers integrating the Agent Command Palette from `@principal-ade/panel-layouts` into web applications. The Agent Command Palette is an AI-driven command interface that replaces traditional search-based command palettes with natural language understanding.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Integration Steps for web-ade](#integration-steps-for-web-ade)
4. [Integrating on Other Surfaces](#integrating-on-other-surfaces)
5. [Tool System](#tool-system)
6. [Event System](#event-system)
7. [API Reference](#api-reference)

---

## Overview

### What is the Agent Command Palette?

The Agent Command Palette provides two modes of interaction:

| Mode | Trigger | Description |
|------|---------|-------------|
| **Natural Language** | Type normally | AI interprets user intent and executes appropriate tools |
| **Quick Command** | Prefix with `/` | Direct command execution bypassing AI |

### Key Features

- **Natural Language Understanding**: Users type "hide the left sidebar" instead of searching for commands
- **Tool Execution Tracking**: Visual feedback showing pending, running, success, and error states
- **History Navigation**: Arrow keys to recall previous commands
- **Keyboard-Driven**: Alt+P to open, Enter to execute, Escape to close
- **Bottom-Anchored UI**: Slides up from screen bottom with smooth animations
- **AI Provider Agnostic**: Works with Gemini, OpenAI, Anthropic, or custom providers

### Comparison with Traditional Command Palette

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    TRADITIONAL COMMAND PALETTE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  User types: "toggle"                                                        │
│  ↓                                                                          │
│  Fuzzy search matches:                                                       │
│    • Toggle Left Sidebar                                                     │
│    • Toggle Right Sidebar                                                    │
│    • Toggle Dark Mode                                                        │
│  ↓                                                                          │
│  User selects one → Executes                                                │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                    AGENT COMMAND PALETTE                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  User types: "hide all sidebars and focus on the editor"                    │
│  ↓                                                                          │
│  AI understands intent and determines tools:                                │
│    1. collapse_all_panels                                                   │
│    2. focus_panel(slot: "middle")                                           │
│  ↓                                                                          │
│  Tools execute automatically with visual feedback                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Architecture

### High-Level Component Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              HOST APPLICATION                                │
│                           (e.g., web-ade, desktop)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐     ┌──────────────────┐     ┌───────────────────┐    │
│  │                 │     │                  │     │                   │    │
│  │   AgentCommand  │────▶│  AI Provider     │────▶│  Tool Executor    │    │
│  │     Palette     │     │  (Gemini/OpenAI) │     │                   │    │
│  │                 │◀────│                  │◀────│                   │    │
│  └────────┬────────┘     └──────────────────┘     └─────────┬─────────┘    │
│           │                                                  │              │
│           │ Panel Events                                     │ Tool Calls   │
│           ▼                                                  ▼              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         Panel Event Bus                              │   │
│  │                    (PanelEventEmitter from panel-framework-core)     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│           │                                                                 │
│           ▼                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         Layout System                                │   │
│  │              (Panel toggle, switch, collapse, focus)                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Flow Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                           USER INTERACTION FLOW                             │
└────────────────────────────────────────────────────────────────────────────┘

  ┌──────────┐
  │   User   │
  └────┬─────┘
       │
       │ 1. Types "hide sidebars"
       ▼
  ┌──────────────────────┐
  │ AgentCommandPalette  │
  │   Component          │
  └──────────┬───────────┘
             │
             │ 2. Emits 'agent-command-palette:submit' event
             ▼
  ┌──────────────────────┐
  │   Event Listener     │
  │  (in host app)       │
  └──────────┬───────────┘
             │
             │ 3. Forwards to AI Provider with tool schemas
             ▼
  ┌──────────────────────┐
  │    AI Provider       │
  │  (Gemini/OpenAI)     │
  │                      │
  │  System prompt +     │
  │  Tool definitions    │
  └──────────┬───────────┘
             │
             │ 4. Returns tool calls: [{name: "collapse_all_panels", args: {}}]
             ▼
  ┌──────────────────────┐
  │   Tool Executor      │
  │                      │
  │  - Updates palette   │
  │    status            │
  │  - Emits panel       │
  │    events            │
  └──────────┬───────────┘
             │
             │ 5. Emits 'panel:collapse-all' event
             ▼
  ┌──────────────────────┐
  │   Layout Handler     │
  │                      │
  │  setLeftCollapsed()  │
  │  setRightCollapsed() │
  └──────────────────────┘
```

### Component Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     @principal-ade/panel-layouts                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  src/agent-command-palette/                                                 │
│  ├── components/                                                            │
│  │   ├── AgentCommandPalette.tsx    ← Main UI container                    │
│  │   ├── AgentCommandInput.tsx      ← Input with mode detection            │
│  │   ├── ToolExecutionList.tsx      ← Shows tool progress                  │
│  │   └── AgentResponseDisplay.tsx   ← Agent text responses                 │
│  │                                                                          │
│  ├── hooks/                                                                 │
│  │   └── useAgentCommandPalette.ts  ← State management + keyboard          │
│  │                                                                          │
│  └── types/                                                                 │
│      └── agent-command-palette.types.ts                                     │
│                                                                             │
│  src/tools/                                                                 │
│  ├── layoutTools.ts                 ← UTCP tool definitions                │
│  └── aiProviderFormats.ts           ← Converters for Gemini/OpenAI/Claude  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### State Machine

```
                              ┌─────────┐
                              │  IDLE   │◀─────────────────────┐
                              └────┬────┘                      │
                                   │                           │
                                   │ User submits query        │
                                   ▼                           │
                              ┌─────────┐                      │
                         ┌───▶│THINKING │                      │
                         │    └────┬────┘                      │
                         │         │                           │
                         │         │ AI returns tool calls     │
                         │         ▼                           │
                         │    ┌──────────┐                     │
                         │    │EXECUTING │──────┐              │
                         │    └────┬─────┘      │              │
                         │         │            │              │
           More tools    │         │ All tools  │ Error        │
           to execute    │         │ complete   │              │
                         │         ▼            ▼              │
                         │    ┌─────────┐  ┌─────────┐         │
                         └────│COMPLETE │  │  ERROR  │─────────┤
                              └────┬────┘  └─────────┘         │
                                   │                           │
                                   │ Auto-close delay          │
                                   └───────────────────────────┘
```

---

## Integration Steps for web-ade

### Step 1: Update Imports

In `src/components/EditorLayout.tsx`, update the imports:

```typescript
// Before:
import {
  CommandPalette,
  useCommandPalette,
  getPanelCommands,
} from '@principal-ade/panel-layouts';

// After:
import {
  AgentCommandPalette,
  useAgentCommandPalette,
  layoutTools,
  toolsToGeminiFormat,
} from '@principal-ade/panel-layouts';
```

### Step 2: Set Up the Hook

Replace the `useCommandPalette` hook with `useAgentCommandPalette`:

```typescript
function EditorLayoutContent({ /* props */ }) {
  const { events } = usePanelProvider();

  // Initialize Agent Command Palette
  const agentPalette = useAgentCommandPalette({
    events,
    keyboard: { key: 'p', altKey: true }, // Alt+P to open
    config: {
      placeholder: 'What would you like to do?',
      autoCloseDelay: 1500,
    },
    onExecuteTool: handleToolExecution,
    initialSuggestions: [
      'hide sidebars',
      'show the AI chat panel',
      'focus on the editor',
    ],
  });

  // Tool execution handler for quick commands
  async function handleToolExecution(name: string, args: Record<string, unknown>) {
    switch (name) {
      case 'toggle':
        const panel = (args.args as string[])?.[0];
        if (panel === 'left') setLeftSidebarCollapsed(prev => !prev);
        if (panel === 'right') setRightSidebarCollapsed(prev => !prev);
        return { success: true };
      case 'collapse':
        setLeftSidebarCollapsed(true);
        setRightSidebarCollapsed(true);
        return { success: true };
      case 'expand':
        setLeftSidebarCollapsed(false);
        setRightSidebarCollapsed(false);
        return { success: true };
      default:
        return { error: `Unknown command: ${name}` };
    }
  }

  // ... rest of component
}
```

### Step 3: Connect to AI Provider

Listen for the `agent-command-palette:submit` event and forward to your AI provider:

```typescript
useEffect(() => {
  if (!events) return;

  const unsubscribe = events.on('agent-command-palette:submit', async (event) => {
    const { query, mode } = event.payload as { query: string; mode: string };

    if (mode === 'quick-command') {
      // Quick commands handled by onExecuteTool callback
      return;
    }

    // Natural language mode - send to AI
    try {
      // Update palette status
      agentPalette.setStatus?.('thinking');

      // Call your AI provider with tool schemas
      const response = await fetch('/api/chat/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: query }],
          tools: toolsToGeminiFormat(layoutTools),
        }),
      });

      const data = await response.json();

      // Process tool calls from AI response
      if (data.toolCalls) {
        for (const toolCall of data.toolCalls) {
          await executeToolFromAI(toolCall.name, toolCall.args);
        }
      }

      agentPalette.setStatus?.('complete');
    } catch (error) {
      agentPalette.setStatus?.('error');
    }
  });

  return () => unsubscribe();
}, [events, agentPalette]);
```

### Step 4: Render the Component

Replace the `CommandPalette` component with `AgentCommandPalette`:

```tsx
return (
  <div className="h-full w-full flex flex-col">
    {/* ... other components */}

    {/* Agent Command Palette */}
    <AgentCommandPalette
      palette={agentPalette}
      config={{
        placeholder: 'What would you like to do?',
      }}
    />
  </div>
);
```

### Step 5: Wire Up Tool Execution

Create a function to execute tools called by the AI:

```typescript
async function executeToolFromAI(name: string, args: Record<string, unknown>) {
  // Add tool to pending list with visual feedback
  const toolId = `ai-${Date.now()}`;
  agentPalette.addPendingTool?.({ id: toolId, name, args });
  agentPalette.updateToolStatus?.(toolId, 'running');

  try {
    switch (name) {
      case 'toggle_panel':
        const panel = args.panel as 'left' | 'right';
        if (panel === 'left') setLeftSidebarCollapsed(prev => !prev);
        if (panel === 'right') setRightSidebarCollapsed(prev => !prev);
        break;

      case 'collapse_all_panels':
        setLeftSidebarCollapsed(true);
        setRightSidebarCollapsed(true);
        break;

      case 'expand_all_panels':
        setLeftSidebarCollapsed(false);
        setRightSidebarCollapsed(false);
        break;

      case 'switch_panel':
        const { slot, panel: newPanel } = args as { slot: string; panel: string };
        setLayout(prev => ({ ...prev, [slot]: newPanel }));
        break;

      case 'focus_panel':
        const { slot: focusSlot } = args as { slot: string };
        setFocusedPanel(focusSlot as PanelSlotId);
        break;

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    agentPalette.updateToolStatus?.(toolId, 'success');
  } catch (error) {
    agentPalette.updateToolStatus?.(toolId, 'error', undefined,
      error instanceof Error ? error.message : 'Unknown error');
  }
}
```

---

## Integrating on Other Surfaces

### Desktop Application (Electron/Tauri)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DESKTOP INTEGRATION                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     Main Process / Backend                           │   │
│  │  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────┐   │   │
│  │  │  Local LLM   │    │  OpenAI API  │    │  Anthropic API       │   │   │
│  │  │  (Ollama)    │    │              │    │                      │   │   │
│  │  └──────────────┘    └──────────────┘    └──────────────────────┘   │   │
│  └────────────────────────────────┬────────────────────────────────────┘   │
│                                   │ IPC                                     │
│  ┌────────────────────────────────▼────────────────────────────────────┐   │
│  │                     Renderer Process                                 │   │
│  │                                                                      │   │
│  │  ┌──────────────────────┐    ┌─────────────────────────────────┐   │   │
│  │  │ AgentCommandPalette  │───▶│  AI Bridge Hook                 │   │   │
│  │  │                      │◀───│  (sends IPC to main process)    │   │   │
│  │  └──────────────────────┘    └─────────────────────────────────┘   │   │
│  │                                                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Example Integration:**

```typescript
// renderer/hooks/useDesktopAgentPalette.ts
import { useAgentCommandPalette } from '@principal-ade/panel-layouts';

export function useDesktopAgentPalette() {
  const palette = useAgentCommandPalette({
    events: panelEvents,
    onExecuteTool: async (name, args) => {
      // Execute tool via IPC to main process
      return window.electronAPI.executeTool(name, args);
    },
  });

  useEffect(() => {
    // Listen for AI submit events
    const unsubscribe = panelEvents.on('agent-command-palette:submit', async (event) => {
      const { query } = event.payload;

      // Send to main process for AI processing
      const response = await window.electronAPI.processNaturalLanguage(query);

      // Execute returned tools
      for (const tool of response.tools) {
        await palette.executeToolWithFeedback(tool.name, tool.args);
      }
    });

    return unsubscribe;
  }, []);

  return palette;
}
```

### Mobile Application (React Native)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          MOBILE INTEGRATION                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     React Native App                                 │   │
│  │                                                                      │   │
│  │  ┌──────────────────────────────────────────────────────────────┐   │   │
│  │  │  AgentCommandSheet (Bottom Sheet variant)                     │   │   │
│  │  │                                                               │   │   │
│  │  │  • Swipe up gesture to open                                  │   │   │
│  │  │  • Voice input support                                        │   │   │
│  │  │  • Haptic feedback on tool execution                         │   │   │
│  │  └──────────────────────────────────────────────────────────────┘   │   │
│  │                          │                                           │   │
│  │                          ▼                                           │   │
│  │  ┌──────────────────────────────────────────────────────────────┐   │   │
│  │  │  Native Bridge                                                │   │   │
│  │  │  • On-device ML (Core ML / TensorFlow Lite)                  │   │   │
│  │  │  • Cloud API fallback                                         │   │   │
│  │  └──────────────────────────────────────────────────────────────┘   │   │
│  │                                                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key Adaptations for Mobile:**

1. **Bottom Sheet UI**: Replace fixed positioning with a draggable bottom sheet
2. **Voice Input**: Add microphone button for speech-to-text
3. **Gesture Support**: Swipe up from bottom to open
4. **On-Device Processing**: Use lightweight models for quick commands

### VS Code Extension

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        VS CODE EXTENSION                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     Extension Host                                   │   │
│  │                                                                      │   │
│  │  ┌──────────────────┐                                               │   │
│  │  │  registerCommand │──▶ 'extension.openAgentPalette'               │   │
│  │  └──────────────────┘                                               │   │
│  │           │                                                          │   │
│  │           ▼                                                          │   │
│  │  ┌──────────────────────────────────────────────────────────────┐   │   │
│  │  │  Webview Panel                                                │   │   │
│  │  │  ┌──────────────────────────────────────────────────────┐    │   │   │
│  │  │  │  AgentCommandPalette (React)                         │    │   │   │
│  │  │  │                                                       │    │   │   │
│  │  │  │  Communicates via postMessage                        │    │   │   │
│  │  │  └──────────────────────────────────────────────────────┘    │   │   │
│  │  └──────────────────────────────────────────────────────────────┘   │   │
│  │           │                                                          │   │
│  │           │ vscode.postMessage({ type: 'toolCall', ... })           │   │
│  │           ▼                                                          │   │
│  │  ┌──────────────────────────────────────────────────────────────┐   │   │
│  │  │  VS Code API Executor                                         │   │   │
│  │  │                                                               │   │   │
│  │  │  • vscode.commands.executeCommand(...)                       │   │   │
│  │  │  • vscode.window.showTextDocument(...)                       │   │   │
│  │  │  • vscode.workspace.openTextDocument(...)                    │   │   │
│  │  └──────────────────────────────────────────────────────────────┘   │   │
│  │                                                                      │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Tool System

### Available Layout Tools

The `layoutTools` array from `@principal-ade/panel-layouts` includes:

| Tool Name | Description | Parameters |
|-----------|-------------|------------|
| `get_visible_panels` | Query current panel visibility | None |
| `get_panel_state` | Get state from a specific panel | `panelId: string` |
| `list_panels_with_state` | List panels supporting state queries | None |
| `toggle_panel` | Collapse/expand a side panel | `panel: 'left' \| 'right'` |
| `collapse_all_panels` | Collapse both sidebars | None |
| `expand_all_panels` | Expand both sidebars | None |
| `switch_panel` | Change panel content in a slot | `slot: string, panel: string` |
| `focus_panel` | Set focus to a panel slot | `slot: string` |
| `reset_layout` | Reset to default layout | None |

### Converting Tools for AI Providers

```typescript
import {
  layoutTools,
  toolsToGeminiFormat,
  toolsToOpenAIFormat,
  toolsToAnthropicFormat,
} from '@principal-ade/panel-layouts';

// For Google Gemini
const geminiTools = toolsToGeminiFormat(layoutTools);
// Returns: { functionDeclarations: [...] }

// For OpenAI
const openAITools = toolsToOpenAIFormat(layoutTools);
// Returns: [{ type: 'function', function: {...} }, ...]

// For Anthropic Claude
const anthropicTools = toolsToAnthropicFormat(layoutTools);
// Returns: [{ name: '...', description: '...', input_schema: {...} }, ...]
```

### Adding Custom Tools

```typescript
import type { PanelTool } from '@principal-ade/panel-framework-core';

const customTools: PanelTool[] = [
  {
    name: 'open_settings',
    description: 'Open the application settings panel',
    inputs: {
      type: 'object',
      properties: {
        section: {
          type: 'string',
          enum: ['general', 'appearance', 'keyboard'],
          description: 'Which settings section to open',
        },
      },
      required: [],
    },
    outputs: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
    tags: ['settings', 'preferences'],
    tool_call_template: {
      call_template_type: 'panel_event',
      event_type: 'settings:open',
    },
  },
];

// Combine with layout tools
const allTools = [...layoutTools, ...customTools];
```

---

## Event System

### Events Emitted by Agent Command Palette

| Event Type | Payload | When |
|------------|---------|------|
| `agent-command-palette:opened` | `{}` | Palette opens |
| `agent-command-palette:closed` | `{}` | Palette closes |
| `agent-command-palette:submit` | `{ query: string, mode: 'natural' \| 'quick-command' }` | User submits a query |

### Events to Listen For (Tool Execution)

| Event Type | Payload | Action |
|------------|---------|--------|
| `panel:toggle` | `{ panel: 'left' \| 'right' }` | Toggle sidebar |
| `panel:collapse-all` | `{}` | Collapse both sidebars |
| `panel:expand-all` | `{}` | Expand both sidebars |
| `panel:switch` | `{ slot: string, panel: string }` | Switch panel content |
| `panel:focus` | `{ slot: string }` | Set focus |
| `panel:reset-layout` | `{}` | Reset to default |

### Event Flow Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          EVENT FLOW                                       │
└──────────────────────────────────────────────────────────────────────────┘

User types "hide left sidebar"
           │
           ▼
┌─────────────────────────┐
│ agent-command-palette:  │
│ submit                  │
│ {                       │
│   query: "hide left...",│
│   mode: "natural"       │
│ }                       │
└───────────┬─────────────┘
            │
            ▼
    [AI Processing]
            │
            ▼
┌─────────────────────────┐
│ panel:toggle            │
│ {                       │
│   panel: "left"         │
│ }                       │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Layout Handler          │
│                         │
│ setLeftSidebarCollapsed │
│ (true)                  │
└─────────────────────────┘
```

---

## API Reference

### useAgentCommandPalette Options

```typescript
interface UseAgentCommandPaletteOptions {
  /** Event emitter for panel events */
  events?: PanelEventEmitter;

  /** Keyboard shortcut configuration */
  keyboard?: {
    key?: string;      // Default: 'p'
    altKey?: boolean;  // Default: true
    ctrlKey?: boolean; // Default: false
    metaKey?: boolean; // Default: false
    shiftKey?: boolean;// Default: false
  };

  /** Configuration options */
  config?: {
    placeholder?: string;      // Input placeholder text
    autoCloseDelay?: number;   // ms to auto-close after completion (0 to disable)
    maxHistoryEntries?: number;// Max history items to keep
    className?: string;        // Custom CSS class
    style?: React.CSSProperties;
  };

  /** Callback for quick command execution */
  onExecuteTool?: (name: string, args: Record<string, unknown>) => Promise<unknown>;

  /** Initial suggestions shown when palette is empty */
  initialSuggestions?: string[];
}
```

### useAgentCommandPalette Return Value

```typescript
interface UseAgentCommandPaletteReturn {
  // Visibility
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;

  // Input
  query: string;
  setQuery: (query: string) => void;
  mode: 'natural' | 'quick-command';

  // Execution
  status: 'idle' | 'thinking' | 'executing' | 'complete' | 'error';
  pendingTools: ToolExecution[];
  completedTools: ToolExecution[];
  agentResponse: string;
  submit: () => void;
  executeQuickCommand: (command: string) => void;

  // History
  history: CommandHistoryEntry[];
  historyPrevious: () => void;
  historyNext: () => void;

  // Suggestions
  suggestions: string[];

  // Actions
  clear: () => void;
}
```

### AgentCommandPalette Props

```typescript
interface AgentCommandPaletteProps {
  /** Hook return value from useAgentCommandPalette */
  palette: UseAgentCommandPaletteReturn;

  /** Configuration options */
  config?: {
    placeholder?: string;
    className?: string;
    style?: React.CSSProperties;
  };
}
```

---

## Migration Checklist

- [ ] Update imports from `CommandPalette` to `AgentCommandPalette`
- [ ] Replace `useCommandPalette` with `useAgentCommandPalette`
- [ ] Set up AI provider integration for natural language processing
- [ ] Implement tool execution handler for quick commands
- [ ] Add event listener for `agent-command-palette:submit`
- [ ] Configure tool schemas for your AI provider
- [ ] Test keyboard shortcuts (Alt+P by default)
- [ ] Verify tool execution with visual feedback
- [ ] Test history navigation with arrow keys
- [ ] Add custom suggestions relevant to your app

---

## Troubleshooting

### Palette doesn't open with Alt+P

- Check if another component is capturing the keyboard event
- Verify the palette hook is properly initialized
- Try a different key combination via the `keyboard` option

### Tools not executing

- Ensure event listeners are set up for panel events
- Verify the AI provider is returning proper tool calls
- Check browser console for errors in tool execution

### AI not understanding commands

- Review your system prompt to include available tool descriptions
- Use `generateToolsSystemPrompt(layoutTools)` to create a consistent prompt
- Ensure tool schemas are properly formatted for your AI provider

---

## Further Reading

- [Agent Command Palette Design Doc](../../panel-layouts/docs/agent-command-palette-design.md)
- [UTCP Tool Specification](../../panel-framework-core/docs/utcp-tools.md)
- [Panel Event System](../../panel-framework-core/docs/events.md)
