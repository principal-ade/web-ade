# OTEL Scope Migration Progress

## Overview
Adding required `otel.scope` field to all event nodes in canvas files to fix validation errors.

## Strategy
- **Server-side scopes**: Use `-api` suffix (e.g., `collections-api`)
- **Client-side scopes**: Use `-page` suffix (e.g., `collections-page`)
- **Framework scopes**: No suffix (e.g., `next.js`)

## Scope Definitions Created

### Server-side API Scopes
| Scope Name | Color | Description | Status |
|------------|-------|-------------|--------|
| `authentication-api` | #10B981 | Authentication and user session management | ✅ Added |
| `activity-feed-api` | #16a34a | Activity feed data fetching and aggregation | ✅ Added |
| `collections-api` | #6d28d9 | Collections API operations (GitHub integration) | ✅ Added |
| `feed-collections-api` | #ec4899 | Feed collections API (S3 storage, subscriptions, follows) | ✅ Added |
| `feed-suggestions-api` | #f59e0b | Feed suggestions and commit queue (GitHub suggestions, search, feed operations) | ✅ Added |
| `line-counts-api` | #14b8a6 | Line count computation and caching (GET/PUT operations, S3 storage) | ✅ Added |
| `package-lookup-api` | #84cc16 | Package repository lookup (npm registry, fallback strategies) | ✅ Added |
| `tour-availability-api` | #f97316 | Tour availability checking (GitHub API, cache operations) | ✅ Added |
| `tts-generation-api` | #ef4444 | Text-to-speech generation (ElevenLabs API, S3 caching) | ✅ Added |
| `auth-callback-api` | #10b981 | OAuth callback handling (state validation, token exchange) | ✅ Added |
| `version-registry-api` | #f59e0b | Version registry (semver to git SHA mapping, caching) | ✅ Added |

### Client-side Page Scopes
| Scope Name | Color | Description | Status |
|------------|-------|-------------|--------|
| `activity-feed-page` | #0891b2 | Activity feed UI interactions and display | ✅ Added |
| `collections-page` | #8b5cf6 | Collections UI management (create, import, load) | ✅ Added |
| `owner-page` | #a855f7 | Owner page UI (repository list, file tree, panels, view modes) | ✅ Added |
| `repository-page` | #3b82f6 | Repository page UI (file tree, panels, view modes, navigation) | ✅ Added |
| `shared-collections-page` | #06b6d4 | Shared collections page UI (user collections, progressive loading) | ✅ Added |
| `stories-layout-page` | #8b5cf6 | Stories layout interactions (layout switching, panel rendering) | ✅ Added |
| `worlds-page` | #14b8a6 | Worlds page UI (collection map, user interactions) | ✅ Added |

### Framework Scopes
| Scope Name | Color | Description | Status |
|------------|-------|-------------|--------|
| `next.js` | #000000 | Next.js framework instrumentation | ✅ Existing |

---

## Canvas Files Progress (17/17 Complete) ✅

### ✅ Completed Files

#### 1. activity-feed.otel.canvas
- **Scopes Used**: `activity-feed-api` (12 events), `activity-feed-page` (6 events)
- **Split**: Data fetching vs UI interactions
- **Status**: ✅ Done

#### 2. authentication.otel.canvas
- **Scopes Used**: `authentication-api` (5 events)
- **Notes**: Token status checking workflow
- **Status**: ✅ Done

#### 3. auth-me.otel.canvas
- **Scopes Used**: `authentication-api` (7 events)
- **Notes**: GET /api/auth/me endpoint
- **Status**: ✅ Done

#### 4. collections.otel.canvas
- **Scopes Used**: `collections-api` (3 events), `collections-page` (23 events)
- **Split**: Server GitHub ops vs client-side management
- **Status**: ✅ Done

#### 5. feed-collections.otel.canvas
- **Scopes Used**: `feed-collections-api` (18 events), `activity-feed-page` (5 events, reused)
- **Notes**: S3 storage, subscriptions, follows
- **Status**: ✅ Done

#### 6. feed-suggestions.otel.canvas
- **Scopes Used**: `feed-suggestions-api` (38 events)
- **Notes**: GitHub suggestions, search, and feed commit queue operations
- **Status**: ✅ Done

#### 7. line-counts.otel.canvas
- **Scopes Used**: `line-counts-api` (19 events)
- **Notes**: Line count computation and caching (GET/PUT operations, S3 storage)
- **Status**: ✅ Done

#### 8. owner.otel.canvas
- **Scopes Used**: `owner-page` (21 events)
- **Notes**: Owner page UI (repository list, file tree, panels, view modes)
- **Status**: ✅ Done

#### 9. package-repository-lookup.otel.canvas
- **Scopes Used**: `package-lookup-api` (15 events)
- **Notes**: Package repository lookup (npm registry, fallback strategies)
- **Status**: ✅ Done

#### 10. repository.otel.canvas
- **Scopes Used**: `repository-page` (49 events)
- **Notes**: Repository page UI (file tree, panels, view modes, navigation)
- **Status**: ✅ Done

#### 11. shared-collections.otel.canvas
- **Scopes Used**: `shared-collections-page` (24 events)
- **Notes**: Shared collections page UI (user collections, progressive loading)
- **Status**: ✅ Done

#### 12. stories-layout.otel.canvas
- **Scopes Used**: `stories-layout-page` (23 events)
- **Notes**: Stories layout interactions (layout switching, panel rendering)
- **Status**: ✅ Done

#### 13. tour-availability.otel.canvas
- **Scopes Used**: `tour-availability-api` (14 events)
- **Notes**: Tour availability checking (GitHub API, cache operations)
- **Status**: ✅ Done

#### 14. tts-generation.otel.canvas
- **Scopes Used**: `tts-generation-api` (12 events)
- **Notes**: Text-to-speech generation (ElevenLabs API, S3 caching)
- **Status**: ✅ Done

#### 15. worlds.otel.canvas
- **Scopes Used**: `worlds-page` (30 events)
- **Notes**: Worlds page UI (collection map, user interactions)
- **Status**: ✅ Done

#### 16. auth-callback.otel.canvas
- **Scopes Used**: `auth-callback-api` (8 events)
- **Notes**: OAuth callback handling (state validation, token exchange)
- **Status**: ✅ Done

#### 17. version-registry.otel.canvas
- **Scopes Used**: `version-registry-api` (19 events)
- **Notes**: Version registry (semver to git SHA mapping, caching)
- **Status**: ✅ Done

---

## How to Continue

### For Each Canvas File:

1. **Read the canvas file** to understand event nodes and code references
2. **Determine scope(s)** based on:
   - Server-side (API routes, libs) → `-api` suffix
   - Client-side (hooks, components, panels) → `-page` suffix
   - Split if file has both server and client events
3. **Update each event node** by adding:
   ```json
   "otel": {
     "scope": "scope-name-here",
     "status": "draft"
   }
   ```
4. **Add new scopes to library.yaml**:
   - Add to `owned-scopes` array
   - Add to `scopes` object with color and description
5. **Add new scopes to architecture.scopes.canvas**:
   - Create new `otel-scope` node with appropriate position
6. **Mark file as complete** in this document

### Files to Update:
- `library.yaml` - Add scopes to owned-scopes and scopes sections
- `architecture.scopes.canvas` - Add visual scope nodes
- Individual `.otel.canvas` files - Add scope to each event's otel object

### Final Validation:
✅ All 85 files validated successfully (23 canvas files, 61 workflow files, 1 library file)

---

## Notes
- Renamed `auth-me` → `authentication-api` for naming consistency
- Some client events reuse existing scopes (e.g., `activity-feed-page`)
- Color scheme: Green (#10B981) for auth, Blue (#0891b2) for feeds, Purple (#6d28d9/#8b5cf6) for collections, Pink (#ec4899) for feed-collections

## Summary

### Total Scopes Created: 18
- **Server-side API Scopes**: 11
- **Client-side Page Scopes**: 7
- **Framework Scopes**: 1 (existing)

### Total Events Updated: 293+
All event nodes across 17 canvas files now have the required `otel.scope` field.

### Validation Status
✅ All 85 files pass validation
- 23 canvas files
- 61 workflow files
- 1 library file

## Last Updated
2026-04-15 - Migration Complete!
