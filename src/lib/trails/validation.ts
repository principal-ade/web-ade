import { TrailShareError, ShareErrorCodes } from './types';
import type {
  CreateSharedTrailRequest,
  TrailDiffSnippet,
  TrailMarker,
  TrailPayload,
  TrailRepo,
  TrailSliceSnippet,
  TrailView,
} from './types';
import { MAX_PAYLOAD_BYTES } from './constants';

const OWNER_REPO_PATTERN = /^[A-Za-z0-9._-]+$/;
const ISO_DATETIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

export function validateOwnerRepo(owner: string, repo: string): void {
  if (
    !owner ||
    !repo ||
    typeof owner !== 'string' ||
    typeof repo !== 'string' ||
    !OWNER_REPO_PATTERN.test(owner) ||
    !OWNER_REPO_PATTERN.test(repo)
  ) {
    throw new TrailShareError(
      'Invalid owner/repo',
      400,
      ShareErrorCodes.INVALID_OWNER_REPO
    );
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isIsoDateTime(value: unknown): value is string {
  return typeof value === 'string' && ISO_DATETIME_PATTERN.test(value);
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function validateSliceSnippet(snippet: TrailSliceSnippet, where: string): void {
  if (!isPositiveInt(snippet.startLine) || !isPositiveInt(snippet.endLine)) {
    throw new TrailShareError(
      `${where}: slice snippet must include 1-based startLine and endLine`,
      400,
      ShareErrorCodes.INVALID_PAYLOAD
    );
  }
}

function validateDiffSnippet(snippet: TrailDiffSnippet, where: string): void {
  if (typeof snippet.oldContents !== 'string') {
    throw new TrailShareError(
      `${where}: diff snippet missing oldContents`,
      400,
      ShareErrorCodes.INVALID_PAYLOAD
    );
  }

  if (!isPositiveInt(snippet.startLine) || !isPositiveInt(snippet.endLine)) {
    throw new TrailShareError(
      `${where}: diff snippet must include 1-based startLine and endLine`,
      400,
      ShareErrorCodes.INVALID_PAYLOAD
    );
  }

  const hasNewContents = typeof snippet.newContents === 'string';
  const hasGitRef =
    isPlainObject(snippet.gitRef) &&
    typeof (snippet.gitRef as { sha?: unknown }).sha === 'string' &&
    typeof (snippet.gitRef as { path?: unknown }).path === 'string';

  if (!hasNewContents && !hasGitRef) {
    throw new TrailShareError(
      `${where}: diff snippet must have either newContents (baked) or gitRef (hydrated). Producers must bake newContents before upload — re-share or upgrade the producer.`,
      400,
      ShareErrorCodes.SNIPPET_NOT_BAKED
    );
  }
}

function validateSnippet(snippet: unknown, where: string): void {
  if (!isPlainObject(snippet)) {
    throw new TrailShareError(
      `${where}: snippet must be an object`,
      400,
      ShareErrorCodes.INVALID_PAYLOAD
    );
  }
  if (snippet.kind === 'slice') {
    validateSliceSnippet(snippet as unknown as TrailSliceSnippet, where);
    return;
  }
  if (snippet.kind === 'diff') {
    validateDiffSnippet(snippet as unknown as TrailDiffSnippet, where);
    return;
  }
  throw new TrailShareError(
    `${where}: snippet.kind must be 'slice' or 'diff'`,
    400,
    ShareErrorCodes.INVALID_PAYLOAD
  );
}

function validateMarker(
  marker: unknown,
  index: number,
  repoIds: Set<string>,
  reposCount: number
): TrailMarker {
  if (!isPlainObject(marker)) {
    throw new TrailShareError(
      `Marker ${index}: must be an object`,
      400,
      ShareErrorCodes.INVALID_PAYLOAD
    );
  }
  const m = marker as Partial<TrailMarker> & { snippet?: unknown };
  if (typeof m.id !== 'string' || !m.id) {
    throw new TrailShareError(
      `Marker ${index}: missing id`,
      400,
      ShareErrorCodes.INVALID_PAYLOAD
    );
  }

  if (reposCount > 1) {
    if (typeof m.repo !== 'string' || !m.repo) {
      throw new TrailShareError(
        `Marker ${index} (${m.id}): multi-repo trails require marker.repo`,
        400,
        ShareErrorCodes.INVALID_PAYLOAD
      );
    }
    if (!repoIds.has(m.repo)) {
      throw new TrailShareError(
        `Marker ${index} (${m.id}): marker.repo "${m.repo}" not in payload.repos[]`,
        400,
        ShareErrorCodes.INVALID_PAYLOAD
      );
    }
  }

  if (m.snippet !== undefined) {
    if (typeof m.sourcePath !== 'string' || !m.sourcePath) {
      throw new TrailShareError(
        `Marker ${index} (${m.id}): a snippet requires sourcePath`,
        400,
        ShareErrorCodes.INVALID_PAYLOAD
      );
    }
    validateSnippet(m.snippet, `Marker ${index} (${m.id})`);
  }

  return m as TrailMarker;
}

function validateRepo(repo: unknown, index: number): TrailRepo {
  if (!isPlainObject(repo)) {
    throw new TrailShareError(
      `Repo ${index}: must be an object`,
      400,
      ShareErrorCodes.INVALID_PAYLOAD
    );
  }
  const r = repo as Partial<TrailRepo>;
  if (typeof r.id !== 'string' || !r.id) {
    throw new TrailShareError(
      `Repo ${index}: missing id`,
      400,
      ShareErrorCodes.INVALID_PAYLOAD
    );
  }
  if (typeof r.name !== 'string' || !r.name) {
    throw new TrailShareError(
      `Repo ${index} (${r.id}): missing name`,
      400,
      ShareErrorCodes.INVALID_PAYLOAD
    );
  }
  return r as TrailRepo;
}

function validateView(
  view: unknown,
  index: number,
  markerIds: Set<string>
): TrailView {
  if (!isPlainObject(view)) {
    throw new TrailShareError(
      `View ${index}: must be an object`,
      400,
      ShareErrorCodes.INVALID_PAYLOAD
    );
  }
  const where = `View ${index} (kind=${String(view.kind)})`;
  switch (view.kind) {
    case 'sequence': {
      if (!Array.isArray(view.markers)) {
        throw new TrailShareError(
          `${where}: markers must be an array`,
          400,
          ShareErrorCodes.INVALID_PAYLOAD
        );
      }
      if (!Array.isArray(view.edges)) {
        throw new TrailShareError(
          `${where}: edges must be an array`,
          400,
          ShareErrorCodes.INVALID_PAYLOAD
        );
      }
      view.markers.forEach((ref, i) => {
        if (!isPlainObject(ref)) {
          throw new TrailShareError(
            `${where} markers[${i}]: must be an object`,
            400,
            ShareErrorCodes.INVALID_PAYLOAD
          );
        }
        if (typeof ref.markerId !== 'string' || !markerIds.has(ref.markerId)) {
          throw new TrailShareError(
            `${where} markers[${i}]: markerId "${String(
              ref.markerId
            )}" not in payload.markers[]`,
            400,
            ShareErrorCodes.INVALID_PAYLOAD
          );
        }
        if (typeof ref.name !== 'string' || !ref.name) {
          throw new TrailShareError(
            `${where} markers[${i}]: missing name`,
            400,
            ShareErrorCodes.INVALID_PAYLOAD
          );
        }
      });
      view.edges.forEach((edge, i) => {
        if (!isPlainObject(edge)) {
          throw new TrailShareError(
            `${where} edges[${i}]: must be an object`,
            400,
            ShareErrorCodes.INVALID_PAYLOAD
          );
        }
      });
      break;
    }
    case 'linear': {
      if (view.order !== undefined && !Array.isArray(view.order)) {
        throw new TrailShareError(
          `${where}: order must be an array if provided`,
          400,
          ShareErrorCodes.INVALID_PAYLOAD
        );
      }
      if (Array.isArray(view.order)) {
        view.order.forEach((id, i) => {
          if (typeof id !== 'string' || !markerIds.has(id)) {
            throw new TrailShareError(
              `${where} order[${i}]: "${String(id)}" not in payload.markers[]`,
              400,
              ShareErrorCodes.INVALID_PAYLOAD
            );
          }
        });
      }
      break;
    }
    case 'tree': {
      if (!isPlainObject(view.parent)) {
        throw new TrailShareError(
          `${where}: parent must be an object`,
          400,
          ShareErrorCodes.INVALID_PAYLOAD
        );
      }
      for (const [child, parent] of Object.entries(view.parent)) {
        if (!markerIds.has(child)) {
          throw new TrailShareError(
            `${where} parent: child "${child}" not in payload.markers[]`,
            400,
            ShareErrorCodes.INVALID_PAYLOAD
          );
        }
        if (parent !== null && (typeof parent !== 'string' || !markerIds.has(parent))) {
          throw new TrailShareError(
            `${where} parent[${child}]: parent "${String(parent)}" not in payload.markers[]`,
            400,
            ShareErrorCodes.INVALID_PAYLOAD
          );
        }
      }
      break;
    }
    case 'timeline': {
      if (!isPlainObject(view.at)) {
        throw new TrailShareError(
          `${where}: at must be an object`,
          400,
          ShareErrorCodes.INVALID_PAYLOAD
        );
      }
      for (const [id, ts] of Object.entries(view.at)) {
        if (!markerIds.has(id)) {
          throw new TrailShareError(
            `${where} at: "${id}" not in payload.markers[]`,
            400,
            ShareErrorCodes.INVALID_PAYLOAD
          );
        }
        if (!isIsoDateTime(ts)) {
          throw new TrailShareError(
            `${where} at[${id}]: must be an ISO 8601 timestamp`,
            400,
            ShareErrorCodes.INVALID_PAYLOAD
          );
        }
      }
      break;
    }
    case 'graph': {
      if (!Array.isArray(view.nodes) || !Array.isArray(view.edges)) {
        throw new TrailShareError(
          `${where}: nodes and edges must be arrays`,
          400,
          ShareErrorCodes.INVALID_PAYLOAD
        );
      }
      break;
    }
    default:
      throw new TrailShareError(
        `${where}: unknown view kind "${String(view.kind)}"`,
        400,
        ShareErrorCodes.INVALID_PAYLOAD
      );
  }

  return view as unknown as TrailView;
}

/**
 * Validates a TrailPayload from an external HTTP request. Notes are stripped
 * — per the trail type docs, notes are mutated only via host endpoints; an
 * external HTTP POST that bundles notes must not have them written through.
 *
 * Returns a payload value with `notes` removed.
 */
export function validatePayload(payload: unknown): TrailPayload {
  if (!isPlainObject(payload)) {
    throw new TrailShareError(
      'Payload must be an object',
      400,
      ShareErrorCodes.INVALID_PAYLOAD
    );
  }

  const p = payload as Partial<TrailPayload>;

  if (typeof p.id !== 'string' || !p.id) {
    throw new TrailShareError(
      'Payload.id is required',
      400,
      ShareErrorCodes.INVALID_PAYLOAD
    );
  }

  if (typeof p.title !== 'string' || !p.title) {
    throw new TrailShareError(
      'Payload.title is required',
      400,
      ShareErrorCodes.INVALID_PAYLOAD
    );
  }

  if (!isIsoDateTime(p.createdAt)) {
    throw new TrailShareError(
      'Payload.createdAt must be an ISO 8601 timestamp',
      400,
      ShareErrorCodes.INVALID_PAYLOAD
    );
  }

  if (!isIsoDateTime(p.updatedAt)) {
    throw new TrailShareError(
      'Payload.updatedAt must be an ISO 8601 timestamp',
      400,
      ShareErrorCodes.INVALID_PAYLOAD
    );
  }

  // Repos
  let repos: TrailRepo[] = [];
  if (p.repos !== undefined) {
    if (!Array.isArray(p.repos)) {
      throw new TrailShareError(
        'Payload.repos must be an array if provided',
        400,
        ShareErrorCodes.INVALID_PAYLOAD
      );
    }
    repos = p.repos.map(validateRepo);
  }
  const repoIds = new Set(repos.map((r) => r.id));

  // Markers
  if (!Array.isArray(p.markers)) {
    throw new TrailShareError(
      'Payload.markers must be an array',
      400,
      ShareErrorCodes.INVALID_PAYLOAD
    );
  }
  if (p.markers.length === 0) {
    throw new TrailShareError(
      'Payload must have at least one marker',
      400,
      ShareErrorCodes.INVALID_PAYLOAD
    );
  }
  const markers = p.markers.map((m, i) =>
    validateMarker(m, i, repoIds, repos.length)
  );
  const markerIds = new Set(markers.map((m) => m.id));

  // Views
  if (!Array.isArray(p.views)) {
    throw new TrailShareError(
      'Payload.views must be an array',
      400,
      ShareErrorCodes.INVALID_PAYLOAD
    );
  }
  if (p.views.length === 0) {
    throw new TrailShareError(
      'Payload.views must have at least one view',
      400,
      ShareErrorCodes.INVALID_PAYLOAD
    );
  }
  p.views.forEach((v, i) => validateView(v, i, markerIds));

  // Build a clean payload — explicitly omit notes (host-only field).
  const clean: TrailPayload = {
    id: p.id,
    title: p.title,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    markers,
    views: p.views as TrailView[],
  };
  if (typeof p.kind === 'string') clean.kind = p.kind;
  if (typeof p.summary === 'string') clean.summary = p.summary;
  if (repos.length > 0) clean.repos = repos;
  if (
    isPlainObject(p.authoredAt) &&
    typeof (p.authoredAt as { sha?: unknown }).sha === 'string'
  ) {
    clean.authoredAt = p.authoredAt as TrailPayload['authoredAt'];
  }

  // Cheap size guard: serialize once, check, return parsed value.
  const serialized = JSON.stringify(clean);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_PAYLOAD_BYTES) {
    throw new TrailShareError(
      `Payload exceeds ${MAX_PAYLOAD_BYTES} bytes`,
      413,
      ShareErrorCodes.PAYLOAD_TOO_LARGE
    );
  }

  return clean;
}

export function validateCreateRequest(
  body: unknown
): CreateSharedTrailRequest {
  if (!isPlainObject(body)) {
    throw new TrailShareError(
      'Request body must be an object',
      400,
      ShareErrorCodes.INVALID_REQUEST
    );
  }
  const b = body as Partial<CreateSharedTrailRequest>;
  validateOwnerRepo(b.owner ?? '', b.repo ?? '');
  const payload = validatePayload(b.payload);
  return { owner: b.owner!, repo: b.repo!, payload };
}

export function summarizePayload(payload: TrailPayload): {
  markerCount: number;
  hasDiffSnippets: boolean;
  summaryPreview: string;
  repoNames: string[];
} {
  const markerCount = payload.markers.length;
  const hasDiffSnippets = payload.markers.some(
    (m) => m.snippet?.kind === 'diff'
  );
  const summaryPreview =
    typeof payload.summary === 'string' ? payload.summary.slice(0, 200) : '';
  const repoNames = (payload.repos ?? []).map((r) => r.name);
  return { markerCount, hasDiffSnippets, summaryPreview, repoNames };
}
