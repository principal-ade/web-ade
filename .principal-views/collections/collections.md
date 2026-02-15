# Collections/Worlds Management

## Overview

Collections (also called "Worlds") allow users to organize and share curated groups of GitHub repositories. Each collection can contain multiple repositories and provides a unified view for exploring related codebases.

## Problem Statement

Developers often work across multiple related repositories but lack a unified way to:
- Group repositories by project, team, or topic
- Share their curated repository lists with others
- Visualize and explore repository collections as cohesive units
- Persist their collections across devices and sessions

Collections solve this by providing GitHub-backed, shareable repository collections.

## Core Operations

### Collection Management

**Create Collection**
- Users define a name, description, and icon
- Collections are immediately synced to GitHub for persistence
- Collections support both new and existing GitHub repository backing

**Load Collections**
- Fetches user's own collections from GitHub on authentication
- Populates UI state with collections and memberships
- Returns empty state for first-time users

**Import Collection**
- Copy another user's public collection
- Creates new collection with attribution: "Collection Name (from @username)"
- Duplicates all repository memberships
- Syncs to user's own GitHub repository

### GitHub Integration

**GitHub as Source of Truth**
- No backend database needed
- Git provides version control and history
- Users own their data
- Public repos enable easy sharing
- Familiar authentication via GitHub OAuth

**Data Storage**
- Repository: `{username}/alexandria-collections`
- Files: `collections.json` and `collection-memberships.json`
- Public by default for sharing

## Data Model

```typescript
Collection {
  id: string              // Unique identifier
  name: string            // Display name
  description?: string    // Optional description
  icon?: string           // Icon identifier
  createdAt: number       // Unix timestamp
  updatedAt: number       // Unix timestamp
}

CollectionMembership {
  repositoryId: string    // "owner/repo" format
  collectionId: string    // Collection FK
  addedAt: number         // Unix timestamp
  metadata?: {
    sourceRepository?: {  // For forks
      owner: string
      name: string
    }
  }
}
```

## Workflow Patterns

### Creating a World
1. User clicks "Create Collection"
2. Enters name, description, icon
3. Validation ensures required fields
4. Collection added to local state (optimistic)
5. Synced to GitHub via saveToGitHub()
6. GitHub repo created if first collection
7. Success or rollback on failure

### Loading Collections
1. User authenticates with GitHub OAuth
2. Context initiates load from API
3. API fetches files from GitHub repo
4. Parses JSON files
5. Returns data to context for state population

### Sharing a World
1. User clicks "Share" button
2. Copies URL: `https://yoursite.com/repos/@username`
3. Other users visit shared URL
4. Fetches from public GitHub repo
5. Renders read-only collection view
6. Allows import with one click

### Importing a World
1. User views shared collection
2. Clicks "Import" button
3. Creates copy with attribution
4. Copies all repository memberships
5. Syncs to user's own GitHub repo

## Error Scenarios

### GitHub Rate Limiting
- **Detection**: 429 status from GitHub API
- **Recovery**: Display "retry at" timestamp, queue for retry
- **Prevention**: Cache reads, batch writes

### Sync Failures
- **Detection**: Network errors, GitHub downtime
- **Recovery**: Retry with exponential backoff, preserve local state
- **Prevention**: Optimistic UI, offline detection

### Import Conflicts
- **Detection**: Duplicate collection name
- **Recovery**: Auto-append suffix, prompt user
- **Prevention**: Check before import

### Permission Errors
- **Detection**: 403 from GitHub (private repo, insufficient permissions)
- **Recovery**: Prompt re-authentication, explain permissions needed
- **Prevention**: Validate permissions before mutation

## Future Enhancements

- Offline support with service workers
- Collaborative collections (multi-user editing)
- Collection templates and themes
- Advanced search and filtering
- Nested collections (collections of collections)
