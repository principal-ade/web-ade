---
status: In Progress
priority: high
labels: [bug, core-integration]
references: [https://github.com/principal-ade/web-ade/issues/9]
createdDate: 2026-01-06
---

# Fix task creation to pass file paths to Core initializeLazy

The task creation API endpoint currently calls `core.initializeLazy([])` with an empty array, which prevents Core from building a proper task index. This causes two critical bugs:

1. **Duplicate Task IDs**: All created tasks get ID "1" because Core can't see existing tasks
2. **Poor Performance**: Empty initialization defeats the purpose of lazy loading

## Acceptance Criteria

- [ ] Core is initialized with existing task file paths
- [ ] New tasks get unique, sequential IDs (not all "1")
- [ ] Multiple tasks created in sequence have different IDs
- [ ] Task creation performance is acceptable (< 2 seconds)
- [ ] Unit test added to verify ID generation with existing tasks
