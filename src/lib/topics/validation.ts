import {
  MAX_COMMENT_CHARS,
  MAX_DESCRIPTION_CHARS,
  MAX_INBOX_COMMENT_CHARS,
  MAX_INBOX_RECIPIENTS,
  MAX_REASON_CHARS,
  MAX_STATUS_LABEL_CHARS,
  MAX_STATUS_NOTE_CHARS,
  MAX_STATUS_REF_TITLE_CHARS,
  MAX_STATUS_REF_VALUE_CHARS,
  MAX_TITLE_CHARS,
  MAX_TRAILS_PER_TOPIC,
} from './constants';
import {
  TopicErrorCodes,
  TopicShareError,
  type CreateSuggestionRequest,
  type SendTopicRequest,
  type TopicStatus,
  type TopicStatusState,
  type TopicVisibility,
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

const STATUS_STATES: readonly TopicStatusState[] = [
  'active',
  'needs-attention',
  'waiting',
  'done',
];
const STATUS_REF_KINDS = ['url', 'pr', 'issue', 'topic', 'trail'] as const;

/** Trimmed free-form text; empty becomes `undefined` so stored status stays clean. */
function validateStatusText(
  value: unknown,
  field: string,
  max: number,
): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'string') invalid(`${field} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > max) invalid(`${field} exceeds ${max} chars`);
  return trimmed;
}

function validateStatusUntil(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'string')
    invalid('status.waitingOn.until must be a string');
  if (Number.isNaN(Date.parse(value)))
    invalid('status.waitingOn.until must be an ISO 8601 date');
  return value;
}

function validateStatusRef(value: unknown): {
  kind: (typeof STATUS_REF_KINDS)[number];
  value: string;
  title?: string;
} {
  if (!isPlainObject(value)) invalid('status.waitingOn.ref must be an object');
  const kind = value.kind;
  if (
    typeof kind !== 'string' ||
    !STATUS_REF_KINDS.includes(kind as (typeof STATUS_REF_KINDS)[number])
  )
    invalid(`status.waitingOn.ref.kind must be one of ${STATUS_REF_KINDS.join(', ')}`);
  const refValue = validateStatusText(
    value.value,
    'status.waitingOn.ref.value',
    MAX_STATUS_REF_VALUE_CHARS,
  );
  if (refValue === undefined) invalid('status.waitingOn.ref.value is required');
  const title = validateStatusText(
    value.title,
    'status.waitingOn.ref.title',
    MAX_STATUS_REF_TITLE_CHARS,
  );
  return {
    kind: kind as (typeof STATUS_REF_KINDS)[number],
    value: refValue,
    ...(title !== undefined ? { title } : {}),
  };
}

function validateWaitingOn(value: unknown): TopicStatus['waitingOn'] {
  if (!isPlainObject(value))
    invalid('status.waitingOn must be an object');
  const note = validateStatusText(
    value.note,
    'status.waitingOn.note',
    MAX_STATUS_NOTE_CHARS,
  );
  const until = validateStatusUntil(value.until);
  const ref = 'ref' in value && value.ref != null
    ? validateStatusRef(value.ref)
    : undefined;
  // Collapse an all-empty waitingOn to undefined so it doesn't linger in storage.
  if (note === undefined && until === undefined && ref === undefined)
    return undefined;
  return {
    ...(note !== undefined ? { note } : {}),
    ...(until !== undefined ? { until } : {}),
    ...(ref !== undefined ? { ref } : {}),
  };
}

/**
 * Validate a topic status. `state` is required; `label` and `waitingOn` are
 * optional and normalized (trimmed, empties dropped). Mirrors the desktop
 * `TopicStatus` shape — see {@link file://./types.ts}.
 */
export function validateStatus(value: unknown): TopicStatus {
  if (!isPlainObject(value)) invalid('status must be an object');
  const state = value.state;
  if (
    typeof state !== 'string' ||
    !STATUS_STATES.includes(state as TopicStatusState)
  )
    invalid(`status.state must be one of ${STATUS_STATES.join(', ')}`);
  const label = validateStatusText(
    value.label,
    'status.label',
    MAX_STATUS_LABEL_CHARS,
  );
  const waitingOn =
    'waitingOn' in value && value.waitingOn != null
      ? validateWaitingOn(value.waitingOn)
      : undefined;
  return {
    state: state as TopicStatusState,
    ...(label !== undefined ? { label } : {}),
    ...(waitingOn !== undefined ? { waitingOn } : {}),
  };
}

/** Validate a topic visibility. Only the two literals are accepted. */
export function validateVisibility(value: unknown): TopicVisibility {
  if (value === 'private' || value === 'public') return value;
  invalid("visibility must be 'private' or 'public'");
}

export function validateCreateRequest(body: unknown): {
  title: string;
  description: string;
  trailIds: string[];
  status?: TopicStatus;
  visibility?: TopicVisibility;
} {
  if (!isPlainObject(body)) invalid('request body must be an object');
  return {
    title: validateTitle(body.title),
    description: validateDescription(body.description),
    trailIds: validateTrailIds(body.trailIds),
    ...(body.status != null ? { status: validateStatus(body.status) } : {}),
    ...(body.visibility != null
      ? { visibility: validateVisibility(body.visibility) }
      : {}),
  };
}

export function validateUpdateRequest(body: unknown): UpdateTopicRequest {
  if (!isPlainObject(body)) invalid('request body must be an object');
  const out: UpdateTopicRequest = {};
  if ('title' in body) out.title = validateTitle(body.title);
  if ('description' in body) out.description = validateDescription(body.description);
  if ('status' in body) out.status = validateStatus(body.status);
  if ('visibility' in body) out.visibility = validateVisibility(body.visibility);
  if (
    out.title === undefined &&
    out.description === undefined &&
    out.status === undefined &&
    out.visibility === undefined
  )
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
 * Validate an optional suggestion reason. Trimmed; an explicit empty string
 * becomes `undefined` so the stored record stays clean. Over-length reasons
 * surface as the generic INVALID_PAYLOAD path — there's no dedicated code
 * because the UI caps input before submit.
 */
export function validateSuggestionReason(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'string') invalid('reason must be a string');
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > MAX_REASON_CHARS)
    invalid(`reason exceeds ${MAX_REASON_CHARS} chars`);
  return trimmed;
}

/**
 * GitHub owner/repo segments per
 * https://docs.github.com/en/get-started/learning-about-github/github-glossary.
 * Lowercased for case-insensitive matching against trail `owner`/`repo`.
 */
const GH_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;
const MAX_GH_SEGMENT_LEN = 100;

function validateGhSegment(value: unknown, field: string): string {
  if (typeof value !== 'string') invalid(`${field} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length === 0) invalid(`${field} cannot be empty`);
  if (trimmed.length > MAX_GH_SEGMENT_LEN)
    invalid(`${field} exceeds ${MAX_GH_SEGMENT_LEN} chars`);
  if (!GH_SEGMENT_PATTERN.test(trimmed)) invalid(`${field} has invalid chars`);
  return trimmed;
}

function validateGithubRepoId(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0)
    invalid('githubRepoId must be a positive integer');
  return value;
}

export function validateSuggestRequest(body: unknown): CreateSuggestionRequest {
  if (!isPlainObject(body)) invalid('request body must be an object');
  // Default kind to 'trail' so existing CLI clients posting `{ trailId }`
  // without the discriminator keep working.
  const kind = body.kind ?? 'trail';
  if (kind !== 'trail' && kind !== 'project')
    invalid('kind must be "trail" or "project"');
  const reason = validateSuggestionReason(body.reason);
  if (kind === 'trail') {
    const { trailId } = body;
    if (!isUuid(trailId)) invalid('trailId must be a uuid');
    return reason === undefined
      ? { kind: 'trail', trailId }
      : { kind: 'trail', trailId, reason };
  }
  const owner = validateGhSegment(body.owner, 'owner');
  const repo = validateGhSegment(body.repo, 'repo');
  const githubRepoId = validateGithubRepoId(body.githubRepoId);
  const base = { kind: 'project' as const, owner, repo };
  return {
    ...base,
    ...(githubRepoId !== undefined ? { githubRepoId } : {}),
    ...(reason !== undefined ? { reason } : {}),
  };
}

/**
 * Optional dismissal reason on reject. Same shape/limits as a suggester's
 * reason — owner-authored note explaining why the suggestion is dismissed.
 */
export function validateRejectRequest(
  body: unknown,
): { reason?: string } {
  if (body == null) return {};
  if (!isPlainObject(body)) invalid('request body must be an object');
  const reason = validateSuggestionReason(body.reason);
  return reason === undefined ? {} : { reason };
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

/**
 * Validate a `POST .../send` request body. Returns a clean shape with
 * recipients deduped (case-insensitive on login) and the optional sender
 * comment trimmed. Resolution of logins to GitHub user ids happens in the
 * route — this layer only checks shape and limits. Mirrors the trail
 * `validateSendRequest` ([[../trails/validation.ts]]) so clients share one
 * request contract across trails and topics.
 */
export function validateSendRequest(input: unknown): SendTopicRequest {
  if (!isPlainObject(input)) {
    throw new TopicShareError(
      'Request body must be an object',
      400,
      TopicErrorCodes.INVALID_REQUEST,
    );
  }
  const body = input as Record<string, unknown>;

  if (!Array.isArray(body.recipients)) {
    throw new TopicShareError(
      'recipients must be an array',
      400,
      TopicErrorCodes.RECIPIENTS_REQUIRED,
    );
  }

  const seen = new Set<string>();
  const recipients: string[] = [];
  for (const raw of body.recipients) {
    if (typeof raw !== 'string') {
      throw new TopicShareError(
        'recipients entries must be strings',
        400,
        TopicErrorCodes.INVALID_REQUEST,
      );
    }
    const login = raw.trim();
    if (login.length === 0) continue;
    const key = login.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recipients.push(login);
  }

  if (recipients.length === 0) {
    throw new TopicShareError(
      'recipients must contain at least one login',
      400,
      TopicErrorCodes.RECIPIENTS_REQUIRED,
    );
  }

  if (recipients.length > MAX_INBOX_RECIPIENTS) {
    throw new TopicShareError(
      `Too many recipients (max ${MAX_INBOX_RECIPIENTS})`,
      400,
      TopicErrorCodes.TOO_MANY_RECIPIENTS,
    );
  }

  const out: SendTopicRequest = { recipients };

  if (body.comment !== undefined) {
    if (typeof body.comment !== 'string') {
      throw new TopicShareError(
        'comment must be a string',
        400,
        TopicErrorCodes.INVALID_REQUEST,
      );
    }
    const comment = body.comment.trim();
    if (comment.length > 0) {
      if (comment.length > MAX_INBOX_COMMENT_CHARS) {
        throw new TopicShareError(
          `comment exceeds ${MAX_INBOX_COMMENT_CHARS} chars`,
          400,
          TopicErrorCodes.COMMENT_TOO_LONG,
        );
      }
      out.comment = comment;
    }
  }

  return out;
}

