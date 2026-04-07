# Issue to Task Lifecycle

This feature enables users to convert GitHub issues into actionable backlog tasks within their local development workflow.

## Purpose

The Issue to Task Lifecycle bridges the gap between GitHub issue tracking and local task management, allowing developers to:
- View GitHub issues directly within the panel interface
- Convert issues into local backlog tasks with a single action
- Track task progress through a kanban-style board
- Maintain references back to the original GitHub issues

## Available Operations

1. **Issue Selection** - Browse and select GitHub issues from the Issues panel
2. **Timeline Fetch** - View issue timeline events and discussion history
3. **Push to Backlog** - Convert an issue into a markdown task in the local backlog
4. **Task Management** - View and manage tasks on the kanban board
5. **Task Detail Editing** - Update task status, priority, and notes

## Design Choices

- Tasks are stored as markdown files in `backlog/tasks/*.md` for portability and version control
- Git commits are automatically created when tasks are added, providing audit trail
- Panel events enable loose coupling between UI components
- Timeline data is fetched from GitHub API to provide full issue context

## Workflow Patterns

1. **Issue Triage**: Issues Panel → Select Issue → View Timeline → Push to Backlog
2. **Task Work**: Kanban Panel → Select Task → Update Status → Git Commit
3. **Context Switch**: Task Detail → View Referenced Issue → Return to Task

## Error Handling

- GitHub API failures display appropriate error messages
- File operation errors are caught and reported to the user
- Invalid issue numbers are handled gracefully
