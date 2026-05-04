import {
  SequenceDiagramShareError,
  ShareErrorCodes,
} from './types';
import type {
  CreateSharedDiagramRequest,
  DiffSnippet,
  SequenceDiagramPayload,
  SequenceEdge,
  SequenceEvent,
} from './types';
import { MAX_PAYLOAD_BYTES } from './constants';

const OWNER_REPO_PATTERN = /^[A-Za-z0-9._-]+$/;
const ISO_DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;

export function validateOwnerRepo(owner: string, repo: string): void {
  if (
    !owner ||
    !repo ||
    typeof owner !== 'string' ||
    typeof repo !== 'string' ||
    !OWNER_REPO_PATTERN.test(owner) ||
    !OWNER_REPO_PATTERN.test(repo)
  ) {
    throw new SequenceDiagramShareError(
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

function validateSnippet(snippet: unknown, eventIndex: number): void {
  if (!isPlainObject(snippet)) {
    throw new SequenceDiagramShareError(
      `Event ${eventIndex}: snippet must be an object`,
      400,
      ShareErrorCodes.INVALID_PAYLOAD
    );
  }

  // Slice snippets are not produced by the share flow today — only diff
  // snippets are recognized. Unknown kinds pass through so producers can
  // experiment without web-ade being a gatekeeper.
  if (snippet.kind !== 'diff') {
    return;
  }

  const s = snippet as Partial<DiffSnippet>;

  if (typeof s.oldContents !== 'string') {
    throw new SequenceDiagramShareError(
      `Event ${eventIndex}: diff snippet missing oldContents`,
      400,
      ShareErrorCodes.INVALID_PAYLOAD
    );
  }

  if (!isPositiveInt(s.startLine) || !isPositiveInt(s.endLine)) {
    throw new SequenceDiagramShareError(
      `Event ${eventIndex}: diff snippet must include 1-based startLine and endLine`,
      400,
      ShareErrorCodes.INVALID_PAYLOAD
    );
  }

  const hasNewContents = typeof s.newContents === 'string';
  const hasGitRef =
    isPlainObject(s.gitRef) &&
    typeof (s.gitRef as { sha?: unknown }).sha === 'string' &&
    typeof (s.gitRef as { path?: unknown }).path === 'string';

  if (!hasNewContents && !hasGitRef) {
    throw new SequenceDiagramShareError(
      `Event ${eventIndex}: diff snippet must have either newContents (baked) or gitRef (hydrated). The desktop bridge bakes newContents before upload — re-share or upgrade the producer.`,
      400,
      ShareErrorCodes.SNIPPET_NOT_BAKED
    );
  }
}

function validateEvent(event: unknown, index: number): void {
  if (!isPlainObject(event)) {
    throw new SequenceDiagramShareError(
      `Event ${index}: must be an object`,
      400,
      ShareErrorCodes.INVALID_PAYLOAD
    );
  }
  const e = event as Partial<SequenceEvent> & { snippet?: unknown };
  if (typeof e.id !== 'string' || !e.id) {
    throw new SequenceDiagramShareError(
      `Event ${index}: missing id`,
      400,
      ShareErrorCodes.INVALID_PAYLOAD
    );
  }
  if (typeof e.name !== 'string') {
    throw new SequenceDiagramShareError(
      `Event ${index}: missing name`,
      400,
      ShareErrorCodes.INVALID_PAYLOAD
    );
  }
  if (e.snippet !== undefined) {
    validateSnippet(e.snippet, index);
  }
}

function validateEdge(edge: unknown, index: number): void {
  if (!isPlainObject(edge)) {
    throw new SequenceDiagramShareError(
      `Edge ${index}: must be an object`,
      400,
      ShareErrorCodes.INVALID_PAYLOAD
    );
  }
  const e = edge as Partial<SequenceEdge>;
  if (typeof e.id !== 'string' || !e.id) {
    throw new SequenceDiagramShareError(
      `Edge ${index}: missing id`,
      400,
      ShareErrorCodes.INVALID_PAYLOAD
    );
  }
  if (typeof e.fromEvent !== 'string' || !e.fromEvent) {
    throw new SequenceDiagramShareError(
      `Edge ${index}: missing fromEvent`,
      400,
      ShareErrorCodes.INVALID_PAYLOAD
    );
  }
  if (typeof e.toEvent !== 'string' || !e.toEvent) {
    throw new SequenceDiagramShareError(
      `Edge ${index}: missing toEvent`,
      400,
      ShareErrorCodes.INVALID_PAYLOAD
    );
  }
}

export function validatePayload(payload: unknown): SequenceDiagramPayload {
  if (!isPlainObject(payload)) {
    throw new SequenceDiagramShareError(
      'Payload must be an object',
      400,
      ShareErrorCodes.INVALID_PAYLOAD
    );
  }

  const p = payload as Partial<SequenceDiagramPayload>;

  if (typeof p.id !== 'string' || !p.id) {
    throw new SequenceDiagramShareError(
      'Payload.id is required',
      400,
      ShareErrorCodes.INVALID_PAYLOAD
    );
  }

  if (typeof p.title !== 'string' || !p.title) {
    throw new SequenceDiagramShareError(
      'Payload.title is required',
      400,
      ShareErrorCodes.INVALID_PAYLOAD
    );
  }

  if (!isIsoDateTime(p.createdAt)) {
    throw new SequenceDiagramShareError(
      'Payload.createdAt must be an ISO 8601 timestamp',
      400,
      ShareErrorCodes.INVALID_PAYLOAD
    );
  }

  if (!isIsoDateTime(p.updatedAt)) {
    throw new SequenceDiagramShareError(
      'Payload.updatedAt must be an ISO 8601 timestamp',
      400,
      ShareErrorCodes.INVALID_PAYLOAD
    );
  }

  if (!Array.isArray(p.events)) {
    throw new SequenceDiagramShareError(
      'Payload.events must be an array',
      400,
      ShareErrorCodes.INVALID_PAYLOAD
    );
  }

  if (p.events.length === 0) {
    throw new SequenceDiagramShareError(
      'Payload must have at least one event',
      400,
      ShareErrorCodes.INVALID_PAYLOAD
    );
  }

  p.events.forEach(validateEvent);

  if (p.edges !== undefined) {
    if (!Array.isArray(p.edges)) {
      throw new SequenceDiagramShareError(
        'Payload.edges must be an array if provided',
        400,
        ShareErrorCodes.INVALID_PAYLOAD
      );
    }
    p.edges.forEach(validateEdge);
  }

  // Cheap size guard: serialize once, check, return parsed value.
  const serialized = JSON.stringify(p);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_PAYLOAD_BYTES) {
    throw new SequenceDiagramShareError(
      `Payload exceeds ${MAX_PAYLOAD_BYTES} bytes`,
      413,
      ShareErrorCodes.PAYLOAD_TOO_LARGE
    );
  }

  return p as SequenceDiagramPayload;
}

export function validateCreateRequest(
  body: unknown
): CreateSharedDiagramRequest {
  if (!isPlainObject(body)) {
    throw new SequenceDiagramShareError(
      'Request body must be an object',
      400,
      ShareErrorCodes.INVALID_REQUEST
    );
  }
  const b = body as Partial<CreateSharedDiagramRequest>;
  validateOwnerRepo(b.owner ?? '', b.repo ?? '');
  const payload = validatePayload(b.payload);
  return { owner: b.owner!, repo: b.repo!, payload };
}

export function summarizePayload(payload: SequenceDiagramPayload): {
  eventCount: number;
  hasDiffSnippets: boolean;
  summaryPreview: string;
} {
  const eventCount = payload.events.length;
  const hasDiffSnippets = payload.events.some(
    (e) => e.snippet?.kind === 'diff'
  );
  const summaryPreview =
    typeof payload.summary === 'string' ? payload.summary.slice(0, 200) : '';
  return { eventCount, hasDiffSnippets, summaryPreview };
}
