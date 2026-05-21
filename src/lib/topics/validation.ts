import {
  MAX_COMMENT_CHARS,
  MAX_DESCRIPTION_CHARS,
  MAX_TITLE_CHARS,
  MAX_TRAILS_PER_TOPIC,
} from './constants';
import {
  TopicErrorCodes,
  TopicShareError,
  type UpdateTopicRequest,
} from './types';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function invalid(message: string): never {
  throw new TopicShareError(message, 400, TopicErrorCodes.INVALID_PAYLOAD);
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function validateTitle(value: unknown): string {
  if (typeof value !== 'string') invalid('title is required');
  const trimmed = value.trim();
  if (trimmed.length === 0) invalid('title cannot be empty');
  if (trimmed.length > MAX_TITLE_CHARS)
    invalid(`title exceeds ${MAX_TITLE_CHARS} chars`);
  return trimmed;
}

function validateDescription(value: unknown): string {
  if (value == null) return '';
  if (typeof value !== 'string') invalid('description must be a string');
  if (value.length > MAX_DESCRIPTION_CHARS)
    invalid(`description exceeds ${MAX_DESCRIPTION_CHARS} chars`);
  return value;
}

function validateTrailIds(value: unknown): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) invalid('trailIds must be an array');
  if (value.length > MAX_TRAILS_PER_TOPIC)
    invalid(`trailIds exceeds cap of ${MAX_TRAILS_PER_TOPIC}`);
  for (const id of value) {
    if (!isUuid(id)) invalid(`invalid trail id: ${String(id)}`);
  }
  // Dedup while preserving order — duplicates would yield a misleading list.
  return Array.from(new Set(value as string[]));
}

export function validateCreateRequest(body: unknown): {
  title: string;
  description: string;
  trailIds: string[];
} {
  if (!isPlainObject(body)) invalid('request body must be an object');
  return {
    title: validateTitle(body.title),
    description: validateDescription(body.description),
    trailIds: validateTrailIds(body.trailIds),
  };
}

export function validateUpdateRequest(body: unknown): UpdateTopicRequest {
  if (!isPlainObject(body)) invalid('request body must be an object');
  const out: UpdateTopicRequest = {};
  if ('title' in body) out.title = validateTitle(body.title);
  if ('description' in body) out.description = validateDescription(body.description);
  if (out.title === undefined && out.description === undefined)
    invalid('no fields to update');
  return out;
}

export function validateReorderRequest(body: unknown): string[] {
  if (!isPlainObject(body)) invalid('request body must be an object');
  return validateTrailIds(body.trailIds);
}

export function validateAddTrailRequest(body: unknown): string {
  if (!isPlainObject(body)) invalid('request body must be an object');
  const { trailId } = body;
  if (!isUuid(trailId)) invalid('trailId must be a uuid');
  return trailId;
}

/**
 * Validate a comment body. Comments are markdown but accept plain text;
 * leading/trailing whitespace is trimmed and an empty body is rejected.
 * Over-length bodies surface as COMMENT_TOO_LONG so the route can map a
 * dedicated HTTP code, rather than the generic INVALID_PAYLOAD path.
 */
export function validateCommentBody(value: unknown): string {
  if (typeof value !== 'string')
    throw new TopicShareError(
      'body is required',
      400,
      TopicErrorCodes.INVALID_PAYLOAD,
    );
  const trimmed = value.trim();
  if (trimmed.length === 0)
    throw new TopicShareError(
      'body cannot be empty',
      400,
      TopicErrorCodes.INVALID_PAYLOAD,
    );
  if (trimmed.length > MAX_COMMENT_CHARS)
    throw new TopicShareError(
      `body exceeds ${MAX_COMMENT_CHARS} chars`,
      413,
      TopicErrorCodes.COMMENT_TOO_LONG,
    );
  return trimmed;
}

export function validateCreateCommentRequest(body: unknown): { body: string } {
  if (!isPlainObject(body)) invalid('request body must be an object');
  return { body: validateCommentBody(body.body) };
}

export function validateUpdateCommentRequest(body: unknown): { body: string } {
  if (!isPlainObject(body)) invalid('request body must be an object');
  if (!('body' in body)) invalid('no fields to update');
  return { body: validateCommentBody(body.body) };
}

/**
 * Extract a trail id from either a bare uuid or a `…/trail/<id>` URL.
 * Returns null if the input doesn't contain a uuid.
 */
export function extractTrailId(input: string): string | null {
  const trimmed = input.trim();
  if (UUID_PATTERN.test(trimmed)) return trimmed;
  const match = trimmed.match(/trail\/([0-9a-f-]+)/i);
  if (match && isUuid(match[1])) return match[1];
  return null;
}

