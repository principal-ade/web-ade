# Panel Focus Pattern

This document describes how to implement cross-panel focus navigation in web-ade using the host-orchestrated focus pattern.

## Overview

When a user interacts with one panel (e.g., clicking a user in a list), we often want another panel to receive focus (e.g., the activity timeline). Rather than having panels directly focus each other, we use a **host-orchestrated pattern** where:

1. **Panels emit domain events** - Panels emit events describing what happened (e.g., "user selected")
2. **Host listens and orchestrates** - The page/host listens for these events and decides what should happen
3. **Panels receive focus via events** - Panels listen for `panel:focus` events and respond accordingly

This pattern keeps panels decoupled and allows the host to control the UX.

## Architecture

```
┌─────────────────────┐     domain event      ┌──────────────┐
│  FollowingUsersPanel │ ──────────────────▶  │   Host Page  │
│                     │   activity:view:user  │              │
└─────────────────────┘                       │  (listens &  │
                                              │  orchestrates)│
                                              └──────┬───────┘
                                                     │
                                                     │ panel:focus
                                                     ▼
                                              ┌──────────────────┐
                                              │ UserActivityPanel │
                                              │                  │
                                              │ usePanelFocus-   │
                                              │ Listener()       │
                                              └──────────────────┘
```

## Implementation Steps

### Step 1: Panel emits a domain event

The source panel emits an event describing what happened. This is a **domain event**, not a focus event.

```tsx
// In FollowingUsersPanel.tsx
<button
  onClick={() => {
    events.emit({
      type: 'activity:view:user',
      source: 'following-users-panel',
      timestamp: Date.now(),
      payload: { username: user.login },
    });
  }}
>
  {user.name}
</button>
```

### Step 2: Host listens and emits focus event

The host page listens for domain events and decides when to emit focus events.

```tsx
// In activity/page.tsx
useEffect(() => {
  const unsubscribe = events.on('activity:view:user', (event) => {
    const payload = event.payload as { username: string };
    if (payload?.username) {
      // Update state
      setViewedUser(payload.username);

      // Emit focus event to the target panel
      events.emit({
        type: 'panel:focus',
        source: 'activity-page',
        timestamp: Date.now(),
        payload: {
          panelId: 'activity-timeline',  // Must match the panel's ID
          panelSlot: 'middle'            // Optional: which slot the panel is in
        },
      });
    }
  });

  return () => unsubscribe();
}, [events]);
```

### Step 3: Target panel listens for focus

The target panel uses `usePanelFocusListener` from `@principal-ade/panel-layouts` to respond to focus events.

```tsx
// In UserActivityPanel.tsx
import { usePanelFocusListener } from '@principal-ade/panel-layouts';

export function UserActivityPanel({ events, ...props }: UserActivityPanelProps) {
  // Ref for the panel container
  const panelRef = useRef<HTMLDivElement>(null);

  // Listen for panel focus events
  usePanelFocusListener(
    'activity-timeline',  // Panel ID - must match what host emits
    events,
    () => panelRef.current?.focus()  // onFocus callback
  );

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      className="h-full w-full outline-none"
    >
      {/* Panel content */}
    </div>
  );
}
```

## Key Points

### Panel IDs must match

The `panelId` in the focus event payload must match the ID passed to `usePanelFocusListener`:

```tsx
// Host emits:
payload: { panelId: 'activity-timeline' }

// Panel listens with:
usePanelFocusListener('activity-timeline', events, onFocus)
```

### Focus requires DOM setup

For the panel to actually receive keyboard focus:

1. Add a `ref` to the container element
2. Add `tabIndex={-1}` to make it focusable
3. Add `outline-none` class if you don't want the default focus outline
4. Call `ref.current?.focus()` in the onFocus callback

### Optional: Visual focus indicator

If you want a visual indicator when focused:

```tsx
const [isFocused, setIsFocused] = useState(false);

usePanelFocusListener(
  'my-panel',
  events,
  () => {
    setIsFocused(true);
    panelRef.current?.focus();
  },
  () => setIsFocused(false)  // onBlur callback
);

return (
  <div
    ref={panelRef}
    tabIndex={-1}
    style={{
      outline: isFocused ? '2px solid #4ec9b0' : 'none',
      outlineOffset: '-2px',
    }}
  >
    {/* content */}
  </div>
);
```

## Event Types

### Domain Events (panel-specific)

These describe what happened in the panel:

- `activity:view:user` - User was selected in following panel
- `activity:item:selected` - Activity item was clicked
- `issue:selected` - Issue/PR was selected
- `repository:preview` - Repository should be previewed

### Focus Events (framework)

These control panel focus:

- `panel:focus` - Focus a specific panel
  - `payload.panelId` - ID of panel to focus
  - `payload.panelSlot` - Optional slot name (left/middle/right)
- `panel:blur` - Blur a specific panel (emitted automatically by usePanelFocus)

## Example: Issue Detail Focus on Owner/Repo Page

When a user clicks an issue in the issues list, the issue detail panel should receive focus.

### Implementation Status

✅ **COMPLETED**: Both `GitHubIssuesPanel` and `GitHubIssueDetailPanel` now have `usePanelFocusListener` implemented in `@industry-theme/github-panels` package.

### How It Works

**1. GitHubIssuesPanel emits `issue:selected` event** (already implemented)

Located in: `/Users/griever/Developer/industry-themed-github-panels/src/panels/GitHubIssuesPanel.tsx:108-117`

```tsx
const handleIssueClick = (issue: GitHubIssue) => {
  setSelectedIssueId(issue.id);
  // Emit issue selected event for detail panel
  events.emit<IssueSelectedEventPayload>({
    type: 'issue:selected',
    source: 'github-issues-panel',
    timestamp: Date.now(),
    payload: {
      issue,
      owner,
      repo,
    },
  });
};
```

**2. Host page needs to listen and emit focus event**

In your `[owner]/[repo]/page.tsx`, add this listener:

```tsx
// In [owner]/[repo]/page.tsx
useEffect(() => {
  const unsubscribe = events.on('issue:selected', (event) => {
    const payload = event.payload as {
      issue?: GitHubIssue;
      owner?: string;
      repo?: string;
    };

    if (payload?.issue) {
      // Emit focus event to the issue detail panel
      events.emit({
        type: 'panel:focus',
        source: 'repo-page',
        timestamp: Date.now(),
        payload: {
          panelId: 'github-issue-detail',
          panelSlot: 'middle'  // or whichever slot contains the detail panel
        },
      });
    }
  });

  return () => unsubscribe();
}, [events]);
```

**3. GitHubIssueDetailPanel listens for focus** (✅ implemented)

Located in: `/Users/griever/Developer/industry-themed-github-panels/src/panels/GitHubIssueDetailPanel.tsx:44-49`

```tsx
// Listen for panel focus events
usePanelFocusListener(
  'github-issue-detail',
  events,
  () => panelRef.current?.focus()
);
```

The panel container has been configured with:
- `ref={panelRef}` - For DOM access
- `tabIndex={-1}` - Makes it focusable programmatically
- `outline: 'none'` - Removes default focus outline

### Optional: Tab Switching Pattern

If the detail panel is in a tabbed container, switch tabs before focusing:

```tsx
// In [owner]/[repo]/page.tsx
useEffect(() => {
  const unsubscribe = events.on('issue:selected', (event) => {
    const payload = event.payload as {
      issue?: GitHubIssue;
      owner?: string;
      repo?: string;
    };

    if (payload?.issue) {
      // Switch to the detail tab first (e.g., index 1)
      setActiveTab(1);

      // Focus after tab switch completes
      requestAnimationFrame(() => {
        events.emit({
          type: 'panel:focus',
          source: 'repo-page',
          timestamp: Date.now(),
          payload: {
            panelId: 'github-issue-detail',
            panelSlot: 'middle'
          },
        });
      });
    }
  });

  return () => unsubscribe();
}, [events]);
```

### GitHubIssuesPanel Focus (✅ implemented)

The issues panel also supports focus, allowing the host to focus it when needed (e.g., after closing an issue detail):

Located in: `/Users/griever/Developer/industry-themed-github-panels/src/panels/GitHubIssuesPanel.tsx:54-59`

```tsx
// Listen for panel focus events
usePanelFocusListener(
  'github-issues',
  events,
  () => panelRef.current?.focus()
);
```

To focus the issues panel from the host:

```tsx
events.emit({
  type: 'panel:focus',
  source: 'repo-page',
  timestamp: Date.now(),
  payload: {
    panelId: 'github-issues',
    panelSlot: 'left'  // or whichever slot contains the issues panel
  },
});
```

## Example: Adding Focus to Another Panel

Say you want the file-city panel to focus when an activity item is selected:

### 1. Host already emits `activity:item:selected`

```tsx
// UserActivityPanel.tsx already does this
events.emit({
  type: 'activity:item:selected',
  source: 'user-activity-panel',
  timestamp: Date.now(),
  payload: { repository: event.repository },
});
```

### 2. Add focus emit in host

```tsx
// activity/page.tsx
useEffect(() => {
  const unsubscribe = events.on('activity:item:selected', (event) => {
    const payload = event.payload as { repository: string };
    if (payload?.repository) {
      onRepoSelect(payload.repository);

      // Focus the file-city panel
      events.emit({
        type: 'panel:focus',
        source: 'activity-page',
        timestamp: Date.now(),
        payload: { panelId: 'file-city', panelSlot: 'right' },
      });
    }
  });
  return () => unsubscribe();
}, [events]);
```

### 3. Add listener in FeedCodeCityPanel

If FeedCodeCityPanel is from `@industry-theme/file-city-panel`, you may need to wrap it or modify the package to add focus listening.

## Related Files

- `src/contexts/PanelContext.tsx` - Creates the PanelEventBus
- `src/app/activity/page.tsx` - Example host orchestration
- `src/components/UserActivityPanel.tsx` - Example panel with focus listener
- `src/components/FollowingUsersPanel.tsx` - Example panel emitting domain events

## Dependencies

- `@principal-ade/panel-framework-core` - Provides `PanelEventBus` and types
- `@principal-ade/panel-layouts` - Provides `usePanelFocusListener` hook
