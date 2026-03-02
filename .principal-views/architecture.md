# Quality Metrics Caching Architecture

## Problem

When loading repository panels, the application makes parallel API calls to fetch both the file tree and quality metrics artifacts. Both calls independently resolve the branch HEAD to a SHA, resulting in:

- Duplicate GitHub API calls for SHA resolution
- 4-5 GitHub API calls per quality fetch
- Short cache TTL (5 min) for branch-based lookups since branch HEAD can change
- No SHA reuse between tree and quality artifact fetches

## Solution

Sequence the fetches so that the tree fetch resolves the SHA first, then pass that SHA to the quality artifacts endpoint:

1. Fetch tree with branch reference - returns `commitSha` in response
2. Use the returned SHA to fetch quality artifacts with `action=commit&commit={sha}`

## Benefits

- Single SHA resolution (in tree fetch only)
- Reduced GitHub API calls (2-3 total vs 4-5)
- Longer cache TTL (10 min) for SHA-based lookups since commits are immutable
- Higher cache hit rate due to content-addressable keys

## Design Choices

- The tree endpoint already resolves SHA internally, so we expose it in the response
- Quality artifacts endpoint supports both `action=latest` (branch-based) and `action=commit` (SHA-based)
- Client code sequences the calls using async/await rather than parallel Promise.all
