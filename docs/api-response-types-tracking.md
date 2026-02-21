# API Response Types Tracking

This document tracks the work needed to add proper TypeScript types to all API endpoints. Without typed responses, `response.json()` returns `any`, bypassing type checking and allowing bugs like using `data.files` when the API returns `data.tree`.

## Goal

Add typed response interfaces to all API routes and their consumers to catch type mismatches at compile time.

## Pattern to Follow

```typescript
// 1. Define response type in a shared types file (src/types/api.ts)
export interface GitHubTreeResponse {
  sha: string;
  url: string;
  tree: Array<{
    path: string;
    mode: string;
    type: 'blob' | 'tree';
    sha: string;
    size?: number;
    url: string;
  }>;
  truncated: boolean;
}

// 2. Type the API route response
return NextResponse.json<GitHubTreeResponse>(data);

// 3. Type the fetch consumer
const data: GitHubTreeResponse = await response.json();
// OR use a typed fetch wrapper
const data = await fetchTyped<GitHubTreeResponse>(`/api/github/repo/${repo}?action=tree`);
```

## API Routes Status

### GitHub Repository Routes
| Route | Status | Notes |
|-------|--------|-------|
| `/api/github/repo/[owner]/[name]` | [ ] | Multiple actions: info, tree, readme, file, contributors, counts |
| `/api/github/repo/[owner]/[name]/commits` | [ ] | |
| `/api/github/repo/[owner]/[name]/commits/[sha]` | [ ] | |
| `/api/github/repo/[owner]/[name]/commit` | [ ] | |
| `/api/github/repo/[owner]/[name]/issues` | [ ] | |
| `/api/github/repo/[owner]/[name]/issues/[number]` | [ ] | |
| `/api/github/repo/[owner]/[name]/issues/[number]/timeline` | [ ] | |
| `/api/github/repo/[owner]/[name]/issues/[number]/reactions` | [ ] | |
| `/api/github/repo/[owner]/[name]/issues/comments/[commentId]/reactions` | [ ] | |
| `/api/github/repo/[owner]/[name]/pull-requests` | [ ] | |
| `/api/github/repo/[owner]/[name]/pull-requests/[number]` | [ ] | |
| `/api/github/repo/[owner]/[name]/pull-requests/[number]/files` | [ ] | |
| `/api/github/repo/[owner]/[name]/pull-requests/comments/[commentId]/reactions` | [ ] | |
| `/api/github/repo/[owner]/[name]/packages` | [ ] | |
| `/api/github/repo/[owner]/[name]/permissions` | [ ] | |
| `/api/github/repo/[owner]/[name]/quality-artifacts` | [ ] | |
| `/api/github/repo/[owner]/[name]/codebase-views` | [ ] | |
| `/api/github/repo/[owner]/[name]/app-installation` | [ ] | |

### GitHub User Routes
| Route | Status | Notes |
|-------|--------|-------|
| `/api/github/user/repos` | [ ] | |
| `/api/github/user/orgs` | [ ] | |
| `/api/github/user/[username]/following` | [ ] | |
| `/api/github/user/[username]/activity` | [ ] | |
| `/api/github/user/[username]/commits/[owner]/[repo]` | [ ] | |

### GitHub Owner Routes
| Route | Status | Notes |
|-------|--------|-------|
| `/api/github/owner/[owner]/repos` | [ ] | |

### GitHub Collections Routes
| Route | Status | Notes |
|-------|--------|-------|
| `/api/github/collections` | [ ] | |
| `/api/github/collections/[username]` | [ ] | |
| `/api/github/collections/[username]/permissions` | [ ] | |
| `/api/github/collections/[username]/regions` | [ ] | |

### GitHub Other Routes
| Route | Status | Notes |
|-------|--------|-------|
| `/api/github/search` | [ ] | |
| `/api/github/star/[owner]/[repo]` | [ ] | |

### Auth Routes
| Route | Status | Notes |
|-------|--------|-------|
| `/api/auth/login` | [ ] | |
| `/api/auth/logout` | [ ] | |
| `/api/auth/callback` | [ ] | |
| `/api/auth/me` | [ ] | |
| `/api/auth/refresh` | [ ] | |
| `/api/auth/token-status` | [ ] | |
| `/api/auth/room-token` | [ ] | |

### Collections Routes
| Route | Status | Notes |
|-------|--------|-------|
| `/api/collections` | [ ] | |
| `/api/collections/[id]` | [ ] | |

### Versions Routes
| Route | Status | Notes |
|-------|--------|-------|
| `/api/versions` | [ ] | |
| `/api/versions/lookup` | [ ] | |
| `/api/versions/list` | [ ] | |
| `/api/versions/delete` | [ ] | |
| `/api/versions/schematic` | [ ] | |

### OTEL/Telemetry Routes
| Route | Status | Notes |
|-------|--------|-------|
| `/api/otel-heartbeat` | [ ] | |
| `/api/otel/services/[serviceName]/status` | [ ] | |
| `/api/otel/services/[serviceName]/versions/live` | [ ] | |
| `/api/otel/traces/[serviceName]` | [ ] | |
| `/api/otel/traces/[serviceName]/versions/[version]` | [ ] | |
| `/api/telemetry/collect` | [ ] | |
| `/api/test-telemetry` | [ ] | |
| `/api/test-manual-telemetry` | [ ] | |

### Packages Routes
| Route | Status | Notes |
|-------|--------|-------|
| `/api/packages/repository-lookup` | [ ] | |
| `/api/packages/repository-lookup/batch` | [ ] | |

### Other Routes
| Route | Status | Notes |
|-------|--------|-------|
| `/api/chat` | [ ] | |
| `/api/chat/gemini` | [ ] | |
| `/api/tts/generate` | [ ] | |
| `/api/tts/batch-generate` | [ ] | |
| `/api/backlog/tasks/create` | [ ] | |

## Consumers to Update

After adding types to API routes, update all fetch consumers:

### Context Providers
- [ ] `src/contexts/RepositoryPageProvider.tsx` - tree, commits, issues
- [ ] `src/contexts/ActivityPageProvider.tsx` - tree, commits
- [ ] `src/contexts/WorldsPageProvider.tsx` - tree
- [ ] `src/contexts/OwnerPageProvider.tsx` - tree

### Components
- [ ] Audit all components using `fetch('/api/...')`

## Implementation Steps

1. Create `src/types/api/` directory for shared API types
2. Start with high-impact routes (tree response caused the bug)
3. Add types to route handlers
4. Update consumers to use typed responses
5. Consider a typed fetch wrapper utility

## Related Issues

- Bug: `data.files` vs `data.tree` mismatch caught at runtime, not compile time
- Fixed in commit: dc0b924
