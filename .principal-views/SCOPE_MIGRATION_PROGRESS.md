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

### Client-side Page Scopes
| Scope Name | Color | Description | Status |
|------------|-------|-------------|--------|
| `activity-feed-page` | #0891b2 | Activity feed UI interactions and display | ✅ Added |
| `collections-page` | #8b5cf6 | Collections UI management (create, import, load) | ✅ Added |

### Framework Scopes
| Scope Name | Color | Description | Status |
|------------|-------|-------------|--------|
| `next.js` | #000000 | Next.js framework instrumentation | ✅ Existing |

---

## Canvas Files Progress (5/17 Complete)

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

---

### 🔄 Remaining Files (12)

#### 6. feed-suggestions.otel.canvas
- **Estimated Scopes**: TBD (likely `feed-suggestions-api`)
- **Status**: ⏳ Pending

#### 7. file-city.otel.canvas
- **Estimated Scopes**: TBD (likely `file-city-api`)
- **Status**: ⏳ Pending

#### 8. line-counts.otel.canvas
- **Estimated Scopes**: TBD (likely `line-counts-api`)
- **Status**: ⏳ Pending

#### 9. owner-page.otel.canvas
- **Estimated Scopes**: TBD (likely `owner-page`)
- **Status**: ⏳ Pending

#### 10. package-lookup.otel.canvas
- **Estimated Scopes**: TBD (likely `package-lookup-api`)
- **Status**: ⏳ Pending

#### 11. repository-api.otel.canvas
- **Estimated Scopes**: TBD (likely `repository-api`)
- **Status**: ⏳ Pending

#### 12. repository-page.otel.canvas
- **Estimated Scopes**: TBD (likely `repository-page`)
- **Status**: ⏳ Pending

#### 13. shared-collections-page.otel.canvas
- **Estimated Scopes**: TBD (likely `shared-collections-page`)
- **Status**: ⏳ Pending

#### 14. stories-layout.otel.canvas
- **Estimated Scopes**: TBD (likely `stories-layout`)
- **Status**: ⏳ Pending

#### 15. tour-availability-api.otel.canvas
- **Estimated Scopes**: TBD (likely `tour-availability-api`)
- **Status**: ⏳ Pending

#### 16. tts-generation.otel.canvas
- **Estimated Scopes**: TBD (likely `tts-generation-api`)
- **Status**: ⏳ Pending

#### 17. worlds-page.otel.canvas
- **Estimated Scopes**: TBD (likely `worlds-page`)
- **Status**: ⏳ Pending

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

### Validation:
Run `npx @principal-ai/principal-view-cli@latest validate` to check progress.

---

## Notes
- Renamed `auth-me` → `authentication-api` for naming consistency
- Some client events reuse existing scopes (e.g., `activity-feed-page`)
- Color scheme: Green (#10B981) for auth, Blue (#0891b2) for feeds, Purple (#6d28d9/#8b5cf6) for collections, Pink (#ec4899) for feed-collections

## Last Updated
2026-04-14
