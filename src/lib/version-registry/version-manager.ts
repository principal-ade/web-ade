/**
 * Version Registry Manager
 *
 * Core business logic for version registration and lookup.
 * Coordinates S3 storage operations with validation and error handling.
 *
 * @otel canvas: .principal-views/version-registry/version-registry.otel.canvas
 */

import type { Span } from '@opentelemetry/api';
import {
  storeVersionRegistration,
  getVersionRegistration,
  checkVersionExists,
  parseGitHubUrl,
  storeSchematic,
  checkSchematicExists,
} from './s3-storage';
import {
  fetchSchematicFromGitHub,
  generateSchematicId,
} from './schematic-fetcher';
import type {
  VersionRegistration,
  VersionRegistrationRequest,
  VersionRegistrationResponse,
  VersionLookupRequest,
  VersionLookupResponse,
} from './types';

/**
 * Validates a git SHA format (40 character hex string)
 */
function isValidGitSHA(sha: string): boolean {
  return /^[a-f0-9]{40}$/i.test(sha);
}

/**
 * Validates version string format
 * Accepts: semver (v1.2.3), git SHA, or custom version strings
 */
function isValidVersion(version: string): boolean {
  // Allow alphanumeric, dots, dashes, underscores
  // Minimum 1 character, maximum 128
  return /^[\w.-]{1,128}$/.test(version);
}

/**
 * Registers a new version-to-commit mapping
 *
 * @param request - Version registration request
 * @param customerId - Customer ID (owner/repo format)
 * @param githubToken - GitHub token for fetching schematics (optional, from Authorization header)
 * @param span - OpenTelemetry span for instrumentation (optional)
 * @returns Registration response
 */
export async function registerVersion(
  request: VersionRegistrationRequest,
  customerId?: string,
  githubToken?: string,
  span?: Span
): Promise<VersionRegistrationResponse> {
  // Extract customerId from repositoryUrl if not provided
  let resolvedCustomerId = customerId;
  if (!resolvedCustomerId) {
    try {
      resolvedCustomerId = parseGitHubUrl(request.repositoryUrl);
    } catch {
      return {
        success: false,
        registrationId: '',
        message: `Invalid repository URL: ${request.repositoryUrl}`,
      };
    }
  }

  // Validate required fields
  if (!request.serviceName || !request.version || !request.gitSHA) {
    return {
      success: false,
      registrationId: '',
      message: 'Missing required fields: serviceName, version, gitSHA',
    };
  }

  // Validate git SHA format
  if (!isValidGitSHA(request.gitSHA)) {
    return {
      success: false,
      registrationId: '',
      message: 'Invalid git SHA format (must be 40 character hex string)',
    };
  }

  // Validate version format
  if (!isValidVersion(request.version)) {
    return {
      success: false,
      registrationId: '',
      message: 'Invalid version format',
    };
  }

  // Emit: version.registration.validated
  span?.addEvent('version.registration.validated', {
    'customer.id': resolvedCustomerId,
    'service.name': request.serviceName,
    'version': request.version,
  });

  // Build registration object
  const registration: VersionRegistration = {
    customerId: resolvedCustomerId,
    serviceName: request.serviceName,
    version: request.version,
    gitSHA: request.gitSHA,
    gitRef: request.gitRef,
    repositoryUrl: request.repositoryUrl,
    environment: request.environment || 'production',
    deployedAt: new Date().toISOString(),
    deployedBy: request.deployedBy,
    metadata: request.metadata,
  };

  try {
    // Check if version already exists
    const exists = await checkVersionExists({
      customerId: resolvedCustomerId,
      serviceName: request.serviceName,
      version: request.version,
      environment: registration.environment,
    });

    if (exists) {
      // Version already registered - this is idempotent, so return success
      // (Could also fetch and compare gitSHA to ensure it matches)
      console.log('[Version Manager] Version already registered:', {
        customerId: resolvedCustomerId,
        serviceName: request.serviceName,
        version: request.version,
        environment: registration.environment,
      });
    }

    // Store to S3 (overwrites if exists)
    const s3Key = await storeVersionRegistration(registration, span);

    // Fetch and store schematic from GitHub at this SHA (BLOCKING - registration fails if this fails)
    // Check if schematic already exists in S3 (cache)
    const schematicExists = await checkSchematicExists(
      registration.repositoryUrl,
      registration.gitSHA
    );

    let schematicId: string;

    // Emit: version.registration.schematic.fetching
    span?.addEvent('version.registration.schematic.fetching', {
      'repository.url': registration.repositoryUrl,
      'git.sha': registration.gitSHA,
      'schematic.cached': schematicExists,
    });

    if (schematicExists) {
      console.log('[Version Manager] Schematic already cached in S3');
      schematicId = generateSchematicId(registration.repositoryUrl, registration.gitSHA);
    } else {
      // Fetch schematic from GitHub (this will throw if it fails)
      console.log('[Version Manager] Fetching schematic from GitHub...');
      try {
        const schematic = await fetchSchematicFromGitHub(
          registration.repositoryUrl,
          registration.gitSHA,
          githubToken,
          span
        );

        // Store schematic in S3
        await storeSchematic(registration.repositoryUrl, registration.gitSHA, schematic, span);
        schematicId = generateSchematicId(registration.repositoryUrl, registration.gitSHA);

        console.log('[Version Manager] Schematic fetched and stored:', {
          schematicId,
          storyboards: schematic.storyboards.length,
        });
      } catch (schematicError) {
        // Emit: version.registration.schematic-error
        span?.addEvent('version.registration.schematic-error', {
          'error.type': schematicError instanceof Error ? schematicError.name : 'UnknownError',
          'error.message': schematicError instanceof Error ? schematicError.message : String(schematicError),
        });
        throw schematicError;
      }
    }

    return {
      success: true,
      registrationId: s3Key,
      schematicLoaded: true,
      schematicId,
      message: exists
        ? 'Version already registered (idempotent)'
        : 'Version registered successfully',
    };
  } catch (error) {
    console.error('[Version Manager] Registration failed:', {
      error: error instanceof Error ? error.message : String(error),
      customerId: resolvedCustomerId,
      serviceName: request.serviceName,
      version: request.version,
    });

    return {
      success: false,
      registrationId: '',
      message: 'Registration failed due to storage error',
    };
  }
}

/**
 * Looks up a version-to-commit mapping
 *
 * @param request - Version lookup request
 * @param span - OpenTelemetry span for instrumentation (optional)
 * @returns Lookup response with registration data if found
 */
export async function lookupVersion(
  request: VersionLookupRequest,
  span?: Span
): Promise<VersionLookupResponse> {
  // Validate required fields
  if (!request.customerId || !request.serviceName || !request.version) {
    return {
      found: false,
      error: 'Missing required fields: customerId, serviceName, version',
    };
  }

  try {
    const registration = await getVersionRegistration({
      customerId: request.customerId,
      serviceName: request.serviceName,
      version: request.version,
      environment: request.environment || 'production',
    }, span);

    if (!registration) {
      return {
        found: false,
        error: 'Version not found',
      };
    }

    return {
      found: true,
      registration,
    };
  } catch (error) {
    console.error('[Version Manager] Lookup failed:', {
      error: error instanceof Error ? error.message : String(error),
      customerId: request.customerId,
      serviceName: request.serviceName,
      version: request.version,
    });

    return {
      found: false,
      error: 'Lookup failed due to storage error',
    };
  }
}

/**
 * Validates a version registration request
 *
 * @param request - Request to validate
 * @returns Error message if invalid, null if valid
 */
export function validateRegistrationRequest(
  request: VersionRegistrationRequest
): string | null {
  if (!request.serviceName) {
    return 'serviceName is required';
  }

  if (!request.version) {
    return 'version is required';
  }

  if (!request.gitSHA) {
    return 'gitSHA is required';
  }

  if (!request.repositoryUrl) {
    return 'repositoryUrl is required';
  }

  if (!isValidGitSHA(request.gitSHA)) {
    return 'gitSHA must be a valid 40-character hex string';
  }

  if (!isValidVersion(request.version)) {
    return 'version format is invalid';
  }

  return null;
}
