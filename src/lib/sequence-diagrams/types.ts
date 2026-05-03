/**
 * Sequence Diagrams Sharing Types
 *
 * Payload types are duplicated from desktop-app/electron-app
 * (src/shared/main-process-api-interfaces/FileCitySequenceAPI.ts) until a
 * shared cross-repo dependency exists. Keep field names in sync; when the
 * shared package lands, swap these declarations for imports.
 */

// ============================================================================
// Payload (mirrors desktop-app)
// ============================================================================

export interface DiffSnippet {
  kind: 'diff';
  /** Pre-change file contents. Always embedded by the producer. */
  oldContents: string;
  /**
   * Post-change file contents. The desktop hydrates this from disk at view
   * time when omitted; for shared payloads it must either be embedded
   * (baked) or accompanied by `gitRef` so the viewer can hydrate from
   * GitHub. See file-city-sequence-diagram-sharing.md.
   */
  newContents?: string;
  startLine?: number;
  endLine?: number;
  language?: string;
  /**
   * Reserved for opt-in hydration from GitHub at view time. No producer sets
   * this today; declared so the schema is forward-compatible.
   */
  gitRef?: { sha: string; path: string; branch?: string };
}

export interface SequenceEvent {
  id: string;
  name: string;
  description?: string;
  sourcePath?: string;
  startLine?: number;
  endLine?: number;
  snippet?: DiffSnippet;
}

export interface SequenceEdge {
  fromEventId: string;
  toEventId: string;
  label?: string;
}

export interface SequenceDiagramPayload {
  id?: string;
  title?: string;
  summary?: string;
  /** Producer-side path; not used on the web viewer. */
  repositoryPath?: string;
  events: SequenceEvent[];
  edges?: SequenceEdge[];
  kind?: string;
}

// ============================================================================
// Web-side index (stored in S3)
// ============================================================================

export interface SharedSequenceDiagramIndexEntry {
  id: string;
  title?: string;
  summaryPreview?: string;
  eventCount: number;
  hasDiffSnippets: boolean;
  createdBy: { githubId: number; githubLogin: string };
  /** GitHub numeric repo id at upload time, used as a rename-stable backstop. */
  githubRepoId: number;
  createdAt: string;
  updatedAt: string;
  sizeBytes: number;
}

export interface SharedSequenceDiagramIndex {
  version: 1;
  updatedAt: string;
  entries: SharedSequenceDiagramIndexEntry[];
}

// ============================================================================
// Request / response shapes
// ============================================================================

export interface CreateSharedDiagramRequest {
  owner: string;
  repo: string;
  payload: SequenceDiagramPayload;
}

export interface CreateSharedDiagramResponse {
  id: string;
  url: string;
  entry: SharedSequenceDiagramIndexEntry;
}

export interface ListSharedDiagramsResponse {
  entries: SharedSequenceDiagramIndexEntry[];
}

// ============================================================================
// Errors
// ============================================================================

export class SequenceDiagramShareError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string
  ) {
    super(message);
    this.name = 'SequenceDiagramShareError';
  }
}

export const ShareErrorCodes = {
  NOT_AUTHENTICATED: 'NOT_AUTHENTICATED',
  NO_REPO_ACCESS: 'NO_REPO_ACCESS',
  NOT_FOUND: 'NOT_FOUND',
  NOT_OWNER: 'NOT_OWNER',
  INVALID_REQUEST: 'INVALID_REQUEST',
  INVALID_OWNER_REPO: 'INVALID_OWNER_REPO',
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  SNIPPET_NOT_BAKED: 'SNIPPET_NOT_BAKED',
  ETAG_CONFLICT: 'ETAG_CONFLICT',
  MAX_RETRIES: 'MAX_RETRIES',
  S3_ERROR: 'S3_ERROR',
  GITHUB_API_ERROR: 'GITHUB_API_ERROR',
} as const;

export type ShareErrorCode =
  (typeof ShareErrorCodes)[keyof typeof ShareErrorCodes];
