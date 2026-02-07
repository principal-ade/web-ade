# Version Registry

## Overview

The Version Registry is a critical component of the contract-based observability platform. It maps customer version strings (semver, git SHA, build numbers) to git commit SHAs, enabling trace processing to fetch the correct contract at the exact version that was deployed.

## Architecture

**Storage:** S3 (durable) with optional Redis caching (future optimization)
**customerId Format:** `owner/repo` (e.g., "acme/backend-monorepo")
**S3 Key Pattern:** `version-registry/{owner}/{repo}/{serviceName}/{version}/{environment}.json`

## API Usage

### Version Registration (POST /api/versions)

CI/CD pipelines register new deployments by submitting version information.

**Endpoint:** `POST https://app.principal-ade.com/api/versions`

**Authentication:** Optional - Include `Authorization: Bearer <github-token>` header for private repositories

**Request Body:**
```json
{
  "serviceName": "payment-api",
  "version": "v1.2.3",
  "gitSHA": "abc123def456789012345678901234567890abcd",
  "repositoryUrl": "https://github.com/acme/backend-monorepo",
  "environment": "production",
  "gitRef": "refs/tags/v1.2.3",
  "deployedBy": "github-actions",
  "metadata": {
    "workflow": "deploy",
    "run_id": "12345",
    "actor": "developer"
  }
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "registrationId": "version-registry/acme/backend-monorepo/payment-api/v1.2.3/production.json",
  "schematicLoaded": true,
  "schematicId": "acme/backend-monorepo@abc123def456",
  "message": "Version registered successfully"
}
```

**Example (curl):**
```bash
curl -X POST "https://app.principal-ade.com/api/versions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -d '{
    "serviceName": "payment-api",
    "version": "v1.2.3",
    "gitSHA": "abc123def456789012345678901234567890abcd",
    "repositoryUrl": "https://github.com/acme/backend-monorepo",
    "environment": "production"
  }'
```

**GitHub Action Example:**
```yaml
- name: Register version schematic
  run: |
    VERSION=$(node -p "require('./package.json').version")
    curl -X POST "https://app.principal-ade.com/api/versions" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${{ secrets.GITHUB_TOKEN }}" \
      -d "{
        \"serviceName\": \"my-service\",
        \"version\": \"$VERSION\",
        \"gitSHA\": \"${{ github.sha }}\",
        \"repositoryUrl\": \"${{ github.server_url }}/${{ github.repository }}\",
        \"environment\": \"production\"
      }"
```

**Flow:**
1. `version.registration.started` - Request received with service name, version, git SHA
2. `version.registration.validated` - Request validation passes (git SHA format, version format)
3. `version.registration.s3.stored` - Mapping stored to S3 as immutable JSON
4. `version.registration.schematic.fetching` - Fetching schematic from GitHub at commit SHA
5. `version.registration.schematic.fetched` - Schematic fetched successfully
6. `version.registration.schematic.stored` - Schematic stored to S3
7. `version.registration.complete` - Registration successful, returns S3 key

**Error Paths:**
- Validation failure → `version.registration.error` (invalid git SHA, missing fields)
- Storage failure → `version.registration.error` (S3 error)
- Schematic fetch failure → `version.registration.error` (GitHub API error, authentication)

### Version Lookup (GET /api/versions/lookup)

Trace processing looks up git commit SHA for a given version.

**Endpoint:** `GET https://app.principal-ade.com/api/versions/lookup`

**Query Parameters:**
- `customerId` (required) - Repository identifier in "owner/repo" format
- `serviceName` (required) - Service name
- `version` (required) - Version string
- `environment` (optional) - Deployment environment (defaults to "production")

**Response (200 OK):**
```json
{
  "found": true,
  "registration": {
    "customerId": "acme/backend-monorepo",
    "serviceName": "payment-api",
    "version": "v1.2.3",
    "gitSHA": "abc123def456789012345678901234567890abcd",
    "repositoryUrl": "https://github.com/acme/backend-monorepo",
    "environment": "production",
    "deployedAt": "2026-02-07T03:51:30.197Z",
    "deployedBy": "github-actions",
    "gitRef": "refs/tags/v1.2.3",
    "metadata": { ... }
  }
}
```

**Response (404 Not Found):**
```json
{
  "found": false,
  "error": "Version not found"
}
```

**Example (curl):**
```bash
curl "https://app.principal-ade.com/api/versions/lookup?customerId=acme/backend-monorepo&serviceName=payment-api&version=v1.2.3&environment=production"
```

**Example (JavaScript):**
```javascript
const response = await fetch(
  'https://app.principal-ade.com/api/versions/lookup?' +
  new URLSearchParams({
    customerId: 'acme/backend-monorepo',
    serviceName: 'payment-api',
    version: 'v1.2.3',
    environment: 'production'
  })
);

const { found, registration } = await response.json();
if (found) {
  console.log('Git SHA:', registration.gitSHA);
  console.log('Deployed at:', registration.deployedAt);
}
```

**Flow:**
1. `version.lookup.started` - Request received with customerId, serviceName, version
2. `version.lookup.s3.retrieved` - Mapping retrieved from S3 (~150ms)
3. `version.lookup.complete` - Returns git SHA and deployment metadata

**Error Paths:**
- Version not registered → `version.lookup.not_found` (404)
- Storage failure → `version.lookup.error` (S3 error)

## Schematic Storage

When a version is registered, the system automatically:

1. **Fetches the complete repository tree** at the specified commit SHA from GitHub
2. **Discovers all telemetry files** (`.otel.canvas`, `.workflow.json`) using CanvasDiscovery
3. **Parses and validates** all canvases, workflows, and storyboards
4. **Stores the complete schematic** to S3 at `schematics/{owner}/{repo}/{commitSha}/schematic.json`

**Schematic Deduplication:**
Multiple versions (e.g., v1.0.0, v1.0.1) that point to the same commit SHA share a single schematic in S3, reducing storage costs and fetch time.

**Private Repository Support:**
For private repositories, include a GitHub token in the `Authorization: Bearer <token>` header. The token is used to authenticate with GitHub's API when fetching repository contents.

**Caching:**
Schematics are cached in S3 with a 1-year TTL. If a schematic already exists for a commit SHA, it's reused instead of re-fetching from GitHub.

## Automated Registration

This repository includes a GitHub Action workflow (`.github/workflows/register-schematic.yml`) that automatically registers schematics on every push to main:

```yaml
# Automatic schematic registration
on:
  push:
    branches:
      - main

# Extracts version from package.json
# Registers schematic with full commit SHA
# Includes workflow metadata (run_id, actor, event)
```

**To add this to your repository:**
1. Copy `.github/workflows/register-schematic.yml` to your repository
2. Update `serviceName` to match your service
3. Push to main - registration happens automatically
4. Check GitHub Actions tab for registration status

## Key Characteristics

**Performance:**
- Registration: ~8-10 seconds (includes GitHub fetch + S3 storage)
- Registration (cached): ~200-300ms (schematic already in S3)
- Lookup: ~150ms (S3 read)
- Future: <1ms with Redis caching (99% cache hit rate expected)

**Cost:**
- S3 storage: < $0.01/month (1000 versions × 1KB + schematics)
- S3 requests: ~$0.0004/month (assuming cache misses only)
- GitHub API: Free (within rate limits)

**Scalability:**
- S3 provides infinite scaling
- No connection pools or database management required
- Versions are immutable (perfect for caching)
- Schematics deduplicated by commit SHA

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
