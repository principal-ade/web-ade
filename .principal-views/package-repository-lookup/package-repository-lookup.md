# Package Repository Lookup

## Overview

The Package Repository Lookup feature allows users to discover the source repository URL for any package across multiple package ecosystems (npm, PyPI, Maven, Go, Cargo, NuGet). This enables automated discovery of open-source project repositories from package names.

## What Problem Does This Solve?

When analyzing codebases and their dependencies using the codebase-composition library, we can identify all packages in use. However, package manifests don't always include repository URLs, and even when they do, they may be outdated or incorrectly formatted. This feature solves that by:

1. **Unified Interface**: Single API to look up repositories across different package ecosystems
2. **Intelligent Fallback**: Tries multiple data sources (npm registry, deps.dev) to maximize success rate
3. **Batch Processing**: Efficiently process multiple packages with configurable concurrency
4. **Rich Metadata**: Returns not just repository URLs but also license info, documentation links, and version data

## Operations Available

### Single Package Lookup
`GET /api/packages/repository-lookup?name={packageName}&system={ecosystem}`

Look up a single package by name and ecosystem. Supports:
- npm (default)
- pypi
- maven
- go
- cargo
- nuget

### Batch Package Lookup
`POST /api/packages/repository-lookup/batch`

Look up multiple packages in a single request with:
- Configurable concurrency (default: 10, max: 100 packages per request)
- Mixed ecosystems in a single batch
- Summary statistics (total, found, not found, errors)

## Design Choices

### Why npm Registry First, Then deps.dev?

For npm packages, we use a **dual-source strategy**:

1. **npm Registry (Primary)**: Fast, no rate limits, no API key required
2. **deps.dev (Fallback)**: Used when npm registry doesn't return a repository or for non-npm packages

This maximizes success rate while minimizing latency for the most common case (npm packages).

### Why deps.dev for Other Ecosystems?

We chose Google's deps.dev API because it:
- Supports 6+ package ecosystems in one API
- Requires no authentication
- Has generous rate limits
- Provides rich metadata (licenses, documentation, security advisories)
- Is maintained by Google's Open Source Security team

### API Response Format Design

The API returns a consistent format across all ecosystems:

```json
{
  "packageName": "string",
  "system": "npm|pypi|maven|go|cargo|nuget",
  "repository": "string|null",
  "homepage": "string?",
  "documentation": "string?",
  "licenses": "string[]?",
  "version": "string?",
  "source": "npm-registry|deps.dev|not-found"
}
```

The `source` field lets clients know which data source provided the information, useful for:
- Debugging failed lookups
- Understanding data freshness
- Metrics and monitoring

### Batch Concurrency Control

The batch endpoint uses controlled concurrency (default: 10) to:
- Respect external API rate limits
- Prevent overwhelming the server
- Allow tuning based on deployment environment

## Common Workflow Patterns

### Pattern 1: Enrich Package Analysis
```
1. Scan codebase with codebase-composition
2. Extract all dependencies
3. Batch lookup repositories for all packages
4. Generate dependency report with source links
```

### Pattern 2: Dependency Vetting
```
1. User installs new package
2. Look up repository URL
3. Check repository health (stars, activity, security)
4. Recommend or warn user
```

### Pattern 3: License Compliance
```
1. Discover all dependencies
2. Batch lookup with license metadata
3. Generate license compliance report
4. Flag incompatible licenses
```

## Error Scenarios and Recovery

### Package Not Found
- **Cause**: Package doesn't exist or isn't published to public registries
- **Recovery**: Returns 404 with `source: "not-found"`
- **Client Action**: Treat as private/unpublished package

### API Rate Limits
- **Cause**: Too many requests to external APIs
- **Recovery**: Batch endpoint has built-in concurrency control
- **Client Action**: Reduce batch size or concurrency

### Invalid System/Package Name
- **Cause**: Unsupported ecosystem or malformed package name
- **Recovery**: Returns 400 with validation error
- **Client Action**: Fix request parameters

### External API Unavailable
- **Cause**: npm registry or deps.dev temporarily down
- **Recovery**: Graceful fallback, returns partial results
- **Client Action**: Retry failed packages later

## Implementation Notes

### Data Sources
1. **npm Registry**: `https://registry.npmjs.org/{package}`
2. **deps.dev**: `https://api.deps.dev/v3/systems/{system}/packages/{name}`

### deps.dev API Structure
The deps.dev API requires two requests per package:
1. Get package metadata (list of versions)
2. Get specific version details (includes repository links)

This is why we cache the latest version info and fetch version-specific details.

### Repository URL Normalization
Both npm and deps.dev may return repository URLs in various formats:
- `git+https://github.com/user/repo.git`
- `https://github.com/user/repo`
- `github:user/repo`

We normalize these to standard HTTPS URLs by:
- Removing `git+` prefix
- Removing `.git` suffix
- Converting shorthand to full URLs

## Future Enhancements

Potential improvements:
- **Caching**: Add Redis/in-memory cache for frequently requested packages
- **Offline Mode**: Use local package database for common packages
- **Repository Health**: Include stars, last commit date, open issues
- **Security**: Include known vulnerabilities from deps.dev
- **Private Registries**: Support enterprise package registries
