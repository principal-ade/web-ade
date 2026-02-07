# Version Registry

## Overview

The Version Registry is a critical component of the contract-based observability platform. It maps customer version strings (semver, git SHA, build numbers) to git commit SHAs, enabling trace processing to fetch the correct contract at the exact version that was deployed.

## Architecture

**Storage:** S3 (durable) with optional Redis caching (future optimization)
**customerId Format:** `owner/repo` (e.g., "acme/backend-monorepo")
**S3 Key Pattern:** `version-registry/{owner}/{repo}/{serviceName}/{version}/{environment}.json`

## Workflows

### Version Registration (POST /api/versions)

CI/CD pipelines register new deployments by submitting version information.

**Flow:**
1. `version.registration.started` - Request received with service name, version, git SHA
2. `version.registration.validated` - Request validation passes (git SHA format, version format)
3. `version.registration.s3.stored` - Mapping stored to S3 as immutable JSON
4. `version.registration.complete` - Registration successful, returns S3 key

**Error Paths:**
- Validation failure → `version.registration.error` (invalid git SHA, missing fields)
- Storage failure → `version.registration.error` (S3 error)

### Version Lookup (GET /api/versions/lookup)

Trace processing looks up git commit SHA for a given version.

**Flow:**
1. `version.lookup.started` - Request received with customerId, serviceName, version
2. `version.lookup.s3.retrieved` - Mapping retrieved from S3 (~150ms)
3. `version.lookup.complete` - Returns git SHA and deployment metadata

**Error Paths:**
- Version not registered → `version.lookup.not_found` (404)
- Storage failure → `version.lookup.error` (S3 error)

## Key Characteristics

**Performance:**
- Registration: ~200-300ms (S3 write)
- Lookup: ~150ms (S3 read)
- Future: <1ms with Redis caching (99% cache hit rate expected)

**Cost:**
- S3 storage: < $0.01/month (1000 versions × 1KB)
- S3 requests: ~$0.0004/month (assuming cache misses only)

**Scalability:**
- S3 provides infinite scaling
- No connection pools or database management required
- Versions are immutable (perfect for caching)

## Related Documentation

- `/Users/griever/Developer/my-projects/otel-collection-server/.principal-views/version-registry-architecture.md` - Detailed architecture guide
- `src/lib/version-registry/` - Implementation code
- `src/app/api/versions/` - API endpoints

## Trace Integration

When a trace arrives with `service.name` and `service.version` attributes:

1. Extract customerId from service context (owner/repo)
2. Lookup version mapping: `GET /api/versions/lookup?customerId=owner/repo&serviceName=payment-api&version=v1.2.3`
3. Retrieve git SHA from response
4. Fetch schematic from GitHub at that specific SHA
5. Match trace against schematic workflows

**Unregistered versions** are rejected at the deployment gate, ensuring only validated services can emit traces.
