# Issue to Task Lifecycle

## Problem

Developers track work in GitHub Issues but need a way to convert selected issues into local backlog tasks that can be managed in a Kanban workflow without constant GitHub API calls.

## Operations

1. **Browse Issues** - View GitHub issues in a panel
2. **Select Issue** - Click an issue to view details and timeline
3. **Push to Backlog** - Convert an issue into a local backlog task
4. **Manage Tasks** - View and update tasks in Kanban board

## Flow

1. User selects an issue in the GitHub Issues Panel
2. The `issue:selected` event triggers:
   - PanelContext fetches the issue timeline from GitHub API
   - EditorLayout focuses the Issue Detail Panel
3. User clicks "Push to Backlog" button
4. The `issue:push-to-backlog` event triggers task creation:
   - Build task markdown with title, labels, priority, and issue refs
   - Append task to `backlog.md`
   - Create git commit
5. The `issue:task-created` event updates the Kanban Panel
6. User can select and update tasks via the Kanban and Task Detail panels

## Design Choices

- Tasks are stored as markdown files in `backlog/tasks/*.md` for portability and git-friendliness
- Git commits are created automatically to maintain history
- Issue references are preserved in task metadata for traceability
- Events decouple panel components for modularity
