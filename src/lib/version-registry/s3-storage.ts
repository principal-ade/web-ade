/**
 * S3 Storage Manager for Version Registry
 *
 * Handles storing and retrieving version-to-commit mappings in S3.
 * Each version registration is stored as a JSON file in S3.
 *
 * customerId format: "owner/repo" (e.g., "acme/backend-monorepo")
 * S3 key format: version-registry/{owner}/{repo}/{serviceName}/{version}/{environment}.json
 */

import {
  S3Client,
  HeadObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import type {
  VersionRegistration,
  VersionRegistryKey,
} from './types';
import type { SchematicResponse } from './schematic-fetcher';

// Initialize S3 client with IAM role credentials
const s3Client = new S3Client({
  region: process.env.VERSION_REGISTRY_AWS_REGION || 'us-east-1',
  // Credentials auto-detected from Amplify IAM role - no keys needed
});

const BUCKET_NAME =
  process.env.VERSION_REGISTRY_S3_BUCKET || 'principal-view-data';

/**
 * Parses GitHub repository URL to extract owner/repo
 *
 * @param repositoryUrl - GitHub repository URL
 * @returns customerId in format "owner/repo"
 * @throws Error if URL format is invalid
 */
export function parseGitHubUrl(repositoryUrl: string): string {
  try {
    // Remove trailing slashes and .git extension
    const cleanUrl = repositoryUrl.replace(/\.git$/, '').replace(/\/$/, '');

    // Handle both https://github.com/owner/repo and git@github.com:owner/repo
    const match = cleanUrl.match(/github\.com[/:]([\w.-]+)\/([\w.-]+)/);

    if (!match) {
      throw new Error(`Invalid GitHub URL format: ${repositoryUrl}`);
    }

    const owner = match[1];
    const repo = match[2];

    return `${owner}/${repo}`;
  } catch {
    throw new Error(`Failed to parse GitHub URL: ${repositoryUrl}`);
  }
}

/**
 * Builds S3 key for a version registration
 *
 * Pattern: version-registry/{owner}/{repo}/{serviceName}/{version}/{environment}.json
 * where customerId = "owner/repo"
 *
 * @param key - Version registry key components
 * @returns S3 object key
 */
export function buildS3Key(key: VersionRegistryKey): string {
  const { customerId, serviceName, version, environment } = key;
  // customerId already contains "owner/repo", so just insert it directly
  return `version-registry/${customerId}/${serviceName}/${version}/${environment}.json`;
}

/**
 * Checks if a version registration exists in S3
 *
 * Uses HEAD request to check existence without downloading the file.
 *
 * @param key - Version registry key components
 * @returns true if registration exists, false otherwise
 */
export async function checkVersionExists(
  key: VersionRegistryKey
): Promise<boolean> {
  try {
    const s3Key = buildS3Key(key);
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
      })
    );
    return true;
  } catch {
    // Object doesn't exist (NoSuchKey error)
    return false;
  }
}

/**
 * Stores a version registration to S3
 *
 * Stores as immutable JSON file with long cache TTL.
 *
 * @param registration - Version registration data
 * @returns S3 key where registration was stored
 * @throws Error if upload fails
 */
export async function storeVersionRegistration(
  registration: VersionRegistration
): Promise<string> {
  try {
    const s3Key = buildS3Key({
      customerId: registration.customerId,
      serviceName: registration.serviceName,
      version: registration.version,
      environment: registration.environment,
    });

    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: JSON.stringify(registration, null, 2),
        ContentType: 'application/json',
        CacheControl: 'max-age=31536000', // 1 year - versions are immutable
        Metadata: {
          'registered-at': registration.deployedAt,
          'service-name': registration.serviceName,
          'version': registration.version,
          'environment': registration.environment,
        },
      })
    );

    console.log('[Version Registry] Stored registration:', {
      s3Key,
      serviceName: registration.serviceName,
      version: registration.version,
      environment: registration.environment,
    });

    return s3Key;
  } catch (error) {
    console.error('[Version Registry] Storage failed:', {
      serviceName: registration.serviceName,
      version: registration.version,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error('S3_ERROR');
  }
}

/**
 * Retrieves a version registration from S3
 *
 * @param key - Version registry key components
 * @returns Version registration data or null if not found
 */
export async function getVersionRegistration(
  key: VersionRegistryKey
): Promise<VersionRegistration | null> {
  try {
    const s3Key = buildS3Key(key);
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
      })
    );

    const data = await response.Body?.transformToString();
    if (!data) {
      return null;
    }

    const registration = JSON.parse(data) as VersionRegistration;

    console.log('[Version Registry] Retrieved registration:', {
      s3Key,
      serviceName: registration.serviceName,
      version: registration.version,
      gitSHA: registration.gitSHA,
    });

    return registration;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'NoSuchKey') {
      console.log('[Version Registry] Version not found:', {
        key: buildS3Key(key),
      });
      return null;
    }

    console.error('[Version Registry] Retrieval failed:', {
      key: buildS3Key(key),
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error('S3_ERROR');
  }
}

/**
 * Deletes a version registration from S3
 *
 * @param key - Version registry key components
 * @returns true if deleted successfully, false if not found
 * @throws Error if deletion fails
 */
export async function deleteVersionRegistration(
  key: VersionRegistryKey
): Promise<boolean> {
  try {
    const s3Key = buildS3Key(key);

    // Check if it exists first
    const exists = await checkVersionExists(key);
    if (!exists) {
      console.log('[Version Registry] Version not found for deletion:', { s3Key });
      return false;
    }

    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
      })
    );

    console.log('[Version Registry] Deleted registration:', {
      s3Key,
      serviceName: key.serviceName,
      version: key.version,
      environment: key.environment,
    });

    return true;
  } catch (error) {
    console.error('[Version Registry] Deletion failed:', {
      key: buildS3Key(key),
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error('S3_ERROR');
  }
}

/**
 * Lists all version registrations for a repository
 *
 * Returns all services, versions, and environments registered for the given repo.
 *
 * @param customerId - Repository in format "owner/repo"
 * @returns Array of version registrations
 */
export async function listRepoRegistrations(
  customerId: string
): Promise<VersionRegistration[]> {
  try {
    const prefix = `version-registry/${customerId}/`;
    const registrations: VersionRegistration[] = [];
    let continuationToken: string | undefined;

    console.log('[Version Registry] Listing registrations for:', { customerId, prefix });

    // S3 ListObjectsV2 may return paginated results
    do {
      const command = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });

      const response = await s3Client.send(command);

      if (response.Contents) {
        // Fetch each registration object
        for (const object of response.Contents) {
          if (!object.Key || !object.Key.endsWith('.json')) {
            continue;
          }

          try {
            const getCommand = new GetObjectCommand({
              Bucket: BUCKET_NAME,
              Key: object.Key,
            });

            const getResponse = await s3Client.send(getCommand);
            const data = await getResponse.Body?.transformToString();

            if (data) {
              const registration = JSON.parse(data) as VersionRegistration;
              registrations.push(registration);
            }
          } catch (error) {
            console.error('[Version Registry] Failed to fetch registration:', {
              key: object.Key,
              error: error instanceof Error ? error.message : String(error),
            });
            // Continue with other registrations even if one fails
          }
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    console.log('[Version Registry] Found registrations:', {
      customerId,
      count: registrations.length,
    });

    return registrations;
  } catch (error) {
    console.error('[Version Registry] List failed:', {
      customerId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error('S3_ERROR');
  }
}

/**
 * Lists all versions for a service (useful for debugging/admin)
 *
 * Note: Not implemented in MVP - would require S3 ListObjectsV2
 * Add this later if needed for admin dashboard.
 */
export async function listServiceVersions(
  _customerId: string,
  _serviceName: string,
  _environment?: string
): Promise<string[]> {
  // TODO: Implement using ListObjectsV2 if needed for admin features
  console.warn('[Version Registry] listServiceVersions not yet implemented');
  return [];
}

/**
 * Builds S3 key for a schematic
 *
 * Pattern: schematics/{owner}/{repo}/{commitSha}/schematic.json
 *
 * Schematics are stored by commit SHA, not by version, since multiple
 * versions (v1.0.0, v1.0.1, etc.) may point to the same commit and share
 * the same schematic.
 */
export function buildSchematicS3Key(repositoryUrl: string, commitSha: string): string {
  const customerId = parseGitHubUrl(repositoryUrl); // Returns "owner/repo"
  return `schematics/${customerId}/${commitSha}/schematic.json`;
}

/**
 * Stores a schematic to S3
 *
 * Schematics are immutable and cached with long TTL.
 * Multiple versions that share the same commit SHA will reference the same schematic.
 *
 * @param repositoryUrl - GitHub repository URL
 * @param commitSha - Git commit SHA
 * @param schematic - Complete SchematicResponse (includes library data)
 * @returns S3 key where schematic was stored
 */
export async function storeSchematic(
  repositoryUrl: string,
  commitSha: string,
  schematic: SchematicResponse
): Promise<string> {
  try {
    const s3Key = buildSchematicS3Key(repositoryUrl, commitSha);

    // Ensure required VersionIdentifier fields are present
    const completeSchematic: SchematicResponse = {
      ...schematic,
      repositoryUrl,
      commitSha,
    };

    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
        Body: JSON.stringify(completeSchematic, null, 2),
        ContentType: 'application/json',
        CacheControl: 'max-age=31536000', // 1 year - schematics are immutable
        Metadata: {
          'commit-sha': commitSha,
          'repository-url': repositoryUrl,
        },
      })
    );

    console.log('[Version Registry] Stored schematic:', {
      s3Key,
      commitSha: commitSha.substring(0, 12),
    });

    return s3Key;
  } catch (error) {
    console.error('[Version Registry] Schematic storage failed:', {
      repositoryUrl,
      commitSha: commitSha.substring(0, 12),
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error('S3_ERROR');
  }
}

/**
 * Retrieves a schematic from S3
 *
 * @param repositoryUrl - GitHub repository URL
 * @param commitSha - Git commit SHA
 * @returns Schematic (SchematicResponse with library data) or null if not found
 */
export async function getSchematic(
  repositoryUrl: string,
  commitSha: string
): Promise<SchematicResponse | null> {
  try {
    const s3Key = buildSchematicS3Key(repositoryUrl, commitSha);
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
      })
    );

    const data = await response.Body?.transformToString();
    if (!data) {
      return null;
    }

    const schematic = JSON.parse(data) as SchematicResponse;

    // Ensure required fields are present (for backward compatibility with old data)
    // These fields are required by VersionIdentifier but might be missing from old S3 data
    if (!schematic.repositoryUrl) {
      schematic.repositoryUrl = repositoryUrl;
    }
    if (!schematic.commitSha) {
      schematic.commitSha = commitSha;
    }

    console.log('[Version Registry] Retrieved schematic:', {
      s3Key,
      commitSha: commitSha.substring(0, 12),
      storyboardCount: schematic.storyboards?.length || 0,
    });

    return schematic;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'NoSuchKey') {
      console.log('[Version Registry] Schematic not found in S3:', {
        key: buildSchematicS3Key(repositoryUrl, commitSha),
      });
      return null;
    }

    console.error('[Version Registry] Schematic retrieval failed:', {
      repositoryUrl,
      commitSha: commitSha.substring(0, 12),
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error('S3_ERROR');
  }
}

/**
 * Checks if a schematic exists in S3
 *
 * @param repositoryUrl - GitHub repository URL
 * @param commitSha - Git commit SHA
 * @returns true if schematic exists, false otherwise
 */
export async function checkSchematicExists(
  repositoryUrl: string,
  commitSha: string
): Promise<boolean> {
  try {
    const s3Key = buildSchematicS3Key(repositoryUrl, commitSha);
    await s3Client.send(
      new HeadObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
      })
    );
    return true;
  } catch {
    return false;
  }
}
