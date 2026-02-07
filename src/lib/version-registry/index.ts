/**
 * Version Registry Module
 *
 * Exports all public APIs for the version registry system.
 */

// Types
export type {
  VersionRegistration,
  VersionRegistrationRequest,
  VersionRegistrationResponse,
  VersionLookupRequest,
  VersionLookupResponse,
  VersionListRequest,
  VersionListResponse,
  VersionRegistryKey,
  VersionRegistryError,
} from './types';

export { VersionRegistryErrorCode } from './types';

// Core functions
export {
  registerVersion,
  lookupVersion,
  validateRegistrationRequest,
} from './version-manager';

// S3 operations
export {
  storeVersionRegistration,
  getVersionRegistration,
  checkVersionExists,
  listRepoRegistrations,
  buildS3Key,
  parseGitHubUrl,
  storeSchematic,
  getSchematic,
  checkSchematicExists,
  buildSchematicS3Key,
} from './s3-storage';

// Schematic fetching
export {
  fetchSchematicFromGitHub,
  generateSchematicId,
} from './schematic-fetcher';
