/**
 * Version Registry Type Definitions
 *
 * Types for the version registry system that maps customer version strings
 * (semver, git SHA, build numbers) to git commit SHAs for contract-based
 * observability.
 */

/**
 * Core version registration data stored in S3
 */
export interface VersionRegistration {
  customerId: string;
  serviceName: string;
  version: string;
  gitSHA: string;
  gitRef?: string;
  repositoryUrl: string;
  environment: string;
  deployedAt: string;
  deployedBy?: string;
  schematicId?: string;
  metadata?: {
    actor?: string;
    workflow?: string;
    runId?: string;
    runNumber?: string;
    [key: string]: unknown;
  };
}

/**
 * Request to register a new version
 */
export interface VersionRegistrationRequest {
  serviceName: string;
  version: string;
  gitSHA: string;
  gitRef?: string;
  repositoryUrl: string;
  environment?: string;
  deployedBy?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Response from version registration endpoint
 */
export interface VersionRegistrationResponse {
  success: boolean;
  registrationId: string;
  schematicLoaded?: boolean;
  schematicId?: string;
  message: string;
}

/**
 * Request to lookup a version mapping
 */
export interface VersionLookupRequest {
  customerId: string;
  serviceName: string;
  version: string;
  environment?: string;
}

/**
 * Response from version lookup
 */
export interface VersionLookupResponse {
  found: boolean;
  registration?: VersionRegistration;
  error?: string;
}

/**
 * Error codes for version registry operations
 */
export enum VersionRegistryErrorCode {
  INVALID_REQUEST = 'INVALID_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  VERSION_NOT_FOUND = 'VERSION_NOT_FOUND',
  REGISTRATION_FAILED = 'REGISTRATION_FAILED',
  S3_ERROR = 'S3_ERROR',
  INVALID_GIT_SHA = 'INVALID_GIT_SHA',
  INVALID_VERSION_FORMAT = 'INVALID_VERSION_FORMAT',
  SCHEMATIC_FETCH_FAILED = 'SCHEMATIC_FETCH_FAILED',
}

/**
 * Extended error type with version registry-specific fields
 */
export interface VersionRegistryError extends Error {
  code: VersionRegistryErrorCode;
  registrationId?: string;
  version?: string;
}

/**
 * S3 key components for version registry
 */
export interface VersionRegistryKey {
  customerId: string;
  serviceName: string;
  version: string;
  environment: string;
}

/**
 * Request to list all registrations for a repository
 */
export interface VersionListRequest {
  customerId: string;
}

/**
 * Response from listing all registrations for a repository
 */
export interface VersionListResponse {
  success: boolean;
  registrations: VersionRegistration[];
  count: number;
  error?: string;
}

/**
 * Response from getting the latest registration for a repository
 */
export interface VersionLatestResponse {
  success: boolean;
  registration: VersionRegistration | null;
  error?: string;
}
