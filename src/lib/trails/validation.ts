import { isValidPurl } from '@principal-ai/alexandria-core-library';
import { TrailShareError, ShareErrorCodes } from './types';
import type {
  CreateSharedTrailRequest,
  TrailDiffSnippet,
  TrailMarker,
  TrailMarkdownNoteScope,
  TrailNoteDraft,
  TrailPayload,
  TrailPurpose,
  TrailRepo,
  TrailSignOffDraft,
  TrailSliceSnippet,
  TrailSnippetDiffAnchor,
  TrailSnippetSliceAnchor,
  TrailView,
} from './types';
import {
  MAX_PAYLOAD_BYTES,
  MAX_INBOX_COMMENT_CHARS,
  MAX_INBOX_RECIPIENTS,
} from './constants';

const MAX_NOTE_BODY_BYTES = 16_000;
const MAX_SIGNOFF_COMMENT_BYTES = 2_000;

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
  if (typeof r.id !== 'string' || !isValidPurl(r.id)) {
    throw new TrailShareError(
      `Repo ${index}: id must be a valid Purl (e.g. pkg:github/owner/name). Mint with PurlBuilders.github(...) or createLocalRepoPurl(...) from @principal-ai/alexandria-core-library.`,
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
 * `id` and `share` are server-controlled: any client-provided values are
 * ignored, and the POST handler stamps them after this returns. The result
 * type therefore omits `id` (must be minted server-side) and `share` (the
 * server is the registry).
 *
 * Returns a payload value with `notes` removed.
 */
export function validatePayload(
  payload: unknown
): Omit<TrailPayload, 'id' | 'share'> {
  if (!isPlainObject(payload)) {
    throw new TrailShareError(
      'Payload must be an object',
      400,
      ShareErrorCodes.INVALID_PAYLOAD
    );
  }

  const p = payload as Partial<TrailPayload> & { kind?: unknown };

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

  // `purpose` replaces the legacy free-form `kind` field. Accept `kind`
  // as a fallback for producers that haven't upgraded yet; unknown
  // values drop to undefined (panel treats undefined as 'investigation').
  const purposeCandidate =
    typeof p.purpose === 'string'
      ? p.purpose
      : typeof p.kind === 'string'
        ? p.kind
        : undefined;
  const purpose: TrailPurpose | undefined =
    purposeCandidate === 'investigation' ||
    purposeCandidate === 'changelog' ||
    purposeCandidate === 'informative'
      ? purposeCandidate
      : undefined;

  // Subject-marker invariant. Investigation trails (including the
  // implicit default when purpose is undefined) must have exactly one
  // marker with kind:'subject' — that's the answer the trail directs
  // the reader toward. Other purposes don't carry subjects.
  const effectivePurpose: TrailPurpose = purpose ?? 'investigation';
  const subjectMarkers = markers.filter((m) => m.kind === 'subject');
  if (effectivePurpose === 'investigation') {
    if (subjectMarkers.length !== 1) {
      throw new TrailShareError(
        `Investigation trails must have exactly one marker with kind:'subject' (found ${subjectMarkers.length})`,
        400,
        ShareErrorCodes.INVALID_PAYLOAD
      );
    }
  } else if (subjectMarkers.length > 0) {
    throw new TrailShareError(
      `${effectivePurpose} trails must not have subject markers (found ${subjectMarkers.length})`,
      400,
      ShareErrorCodes.INVALID_PAYLOAD
    );
  }

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

  // Build a clean payload — explicitly omit notes, signOffs, and
  // visitors (all host-mutated only, written through dedicated routes
  // after publish). `id` and `share` are also omitted: the server mints
  // `id` and stamps `share` at publish time. The allowlist construction
  // below drops any other unknown fields.
  const clean: Omit<TrailPayload, 'id' | 'share'> = {
    title: p.title,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    markers,
    views: p.views as TrailView[],
  };
  if (purpose !== undefined) clean.purpose = purpose;

  if (typeof p.summary === 'string') clean.summary = p.summary;
  if (typeof p.request === 'string') clean.request = p.request;
  if (typeof p.author === 'string') clean.author = p.author;
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

function invalid(message: string): never {
  throw new TrailShareError(message, 400, ShareErrorCodes.INVALID_PAYLOAD);
}

function validateMarkdownScope(scope: unknown): TrailMarkdownNoteScope {
  if (!isPlainObject(scope)) invalid('note.scope must be an object');
  const kind = (scope as { kind?: unknown }).kind;
  if (kind === 'summary') return { kind: 'summary' };
  if (kind === 'description') {
    const markerId = (scope as { markerId?: unknown }).markerId;
    if (typeof markerId !== 'string' || markerId.length === 0) {
      invalid('description-scoped note must include a markerId');
    }
    return { kind: 'description', markerId };
  }
  return invalid("note.scope.kind must be 'summary' or 'description'");
}

function validateMarkdownAnchor(anchor: unknown): {
  kind: 'text-quote';
  exact: string;
  prefix?: string;
  suffix?: string;
} {
  if (!isPlainObject(anchor)) invalid('note.anchor must be an object');
  const a = anchor as Record<string, unknown>;
  if (a.kind !== 'text-quote') invalid("note.anchor.kind must be 'text-quote'");
  if (typeof a.exact !== 'string' || a.exact.length === 0) {
    invalid('note.anchor.exact must be a non-empty string');
  }
  const out: { kind: 'text-quote'; exact: string; prefix?: string; suffix?: string } = {
    kind: 'text-quote',
    exact: a.exact,
  };
  if (typeof a.prefix === 'string') out.prefix = a.prefix;
  if (typeof a.suffix === 'string') out.suffix = a.suffix;
  return out;
}

function validateSnippetSliceAnchor(anchor: unknown): TrailSnippetSliceAnchor {
  if (!isPlainObject(anchor)) invalid('note.anchor must be an object');
  const a = anchor as Record<string, unknown>;
  if (a.kind !== 'slice') invalid("snippet anchor.kind must be 'slice'");
  if (!Array.isArray(a.ranges) || a.ranges.length === 0) {
    invalid('snippet anchor.ranges must be a non-empty array');
  }
  const ranges = a.ranges.map((r, i) => {
    if (!isPlainObject(r)) invalid(`anchor.ranges[${i}] must be an object`);
    const range = r as Record<string, unknown>;
    if (!isPositiveInt(range.startLine) || !isPositiveInt(range.endLine)) {
      invalid(`anchor.ranges[${i}] must have positive startLine/endLine`);
    }
    if ((range.endLine as number) < (range.startLine as number)) {
      invalid(`anchor.ranges[${i}] endLine must be >= startLine`);
    }
    const out: {
      startLine: number;
      endLine: number;
      startLineText?: string;
      endLineText?: string;
    } = {
      startLine: range.startLine as number,
      endLine: range.endLine as number,
    };
    if (typeof range.startLineText === 'string') out.startLineText = range.startLineText;
    if (typeof range.endLineText === 'string') out.endLineText = range.endLineText;
    return out;
  });
  return { kind: 'slice', ranges } as TrailSnippetSliceAnchor;
}

function validateSnippetDiffAnchor(anchor: unknown): TrailSnippetDiffAnchor {
  // Diff-anchor snippet notes are schema-only today; the panel doesn't
  // surface them yet (per TRAIL_PANEL_HOST_INTEGRATION.md). Persist the
  // shape verbatim so a future panel version can render them without a
  // migration.
  if (!isPlainObject(anchor)) invalid('note.anchor must be an object');
  return anchor as unknown as TrailSnippetDiffAnchor;
}

/**
 * Validate a `TrailNoteDraft` from a host endpoint. Returns a clean
 * draft with `author` blanked out — callers overwrite it with the
 * authenticated identity before persisting.
 */
export function validateNoteDraft(input: unknown): TrailNoteDraft {
  if (!isPlainObject(input)) {
    throw new TrailShareError(
      'Note draft must be an object',
      400,
      ShareErrorCodes.INVALID_PAYLOAD
    );
  }
  const d = input as Record<string, unknown>;
  if (typeof d.body !== 'string' || d.body.length === 0) {
    invalid('note.body must be a non-empty string');
  }
  if (Buffer.byteLength(d.body, 'utf8') > MAX_NOTE_BODY_BYTES) {
    throw new TrailShareError(
      `note.body exceeds ${MAX_NOTE_BODY_BYTES} bytes`,
      413,
      ShareErrorCodes.PAYLOAD_TOO_LARGE
    );
  }

  if (d.kind === 'markdown') {
    return {
      kind: 'markdown',
      scope: validateMarkdownScope(d.scope),
      anchor: validateMarkdownAnchor(d.anchor),
      body: d.body,
      author: '',
    };
  }
  if (d.kind === 'snippet') {
    if (!isPlainObject(d.scope) || typeof (d.scope as { markerId?: unknown }).markerId !== 'string') {
      invalid('snippet note.scope.markerId is required');
    }
    const markerId = (d.scope as { markerId: string }).markerId;
    const anchorKind = isPlainObject(d.anchor)
      ? (d.anchor as { kind?: unknown }).kind
      : undefined;
    const anchor =
      anchorKind === 'diff'
        ? validateSnippetDiffAnchor(d.anchor)
        : validateSnippetSliceAnchor(d.anchor);
    return {
      kind: 'snippet',
      scope: { markerId },
      anchor,
      body: d.body,
      author: '',
    };
  }
  return invalid("note.kind must be 'markdown' or 'snippet'");
}

/**
 * Validate a body for `PATCH /notes/[noteId]`. Only `body` is mutable
 * post-create; everything else is fixed by the original draft.
 */
export function validateNoteBodyUpdate(input: unknown): { body: string } {
  if (!isPlainObject(input)) {
    throw new TrailShareError(
      'Request body must be an object',
      400,
      ShareErrorCodes.INVALID_REQUEST
    );
  }
  const body = (input as { body?: unknown }).body;
  if (typeof body !== 'string' || body.length === 0) {
    invalid('body must be a non-empty string');
  }
  if (Buffer.byteLength(body, 'utf8') > MAX_NOTE_BODY_BYTES) {
    throw new TrailShareError(
      `body exceeds ${MAX_NOTE_BODY_BYTES} bytes`,
      413,
      ShareErrorCodes.PAYLOAD_TOO_LARGE
    );
  }
  return { body };
}

/**
 * Validate a `TrailSignOffDraft`. Returns a clean draft with
 * `author` blanked out — callers overwrite with authenticated identity.
 */
export function validateSignOffDraft(input: unknown): TrailSignOffDraft {
  if (!isPlainObject(input)) {
    throw new TrailShareError(
      'Sign-off draft must be an object',
      400,
      ShareErrorCodes.INVALID_PAYLOAD
    );
  }
  const d = input as Record<string, unknown>;
  const draft: TrailSignOffDraft = { author: '' };
  if (d.comment !== undefined) {
    if (typeof d.comment !== 'string') {
      invalid('signOff.comment must be a string');
    }
    if (Buffer.byteLength(d.comment, 'utf8') > MAX_SIGNOFF_COMMENT_BYTES) {
      throw new TrailShareError(
        `signOff.comment exceeds ${MAX_SIGNOFF_COMMENT_BYTES} bytes`,
        413,
        ShareErrorCodes.PAYLOAD_TOO_LARGE
      );
    }
    draft.comment = d.comment;
  }
  return draft;
}

/**
 * Validate a `POST .../send` request body. Returns a clean shape with
 * recipients deduped (case-insensitive on login) and the optional sender
 * comment trimmed. Resolution of logins to GitHub user ids happens in the
 * route — this layer only checks shape and limits.
 */
export interface SendTrailRequest {
  recipients: string[];
  comment?: string;
}

export function validateSendRequest(input: unknown): SendTrailRequest {
  if (!isPlainObject(input)) {
    throw new TrailShareError(
      'Request body must be an object',
      400,
      ShareErrorCodes.INVALID_REQUEST
    );
  }
  const body = input as Record<string, unknown>;

  if (!Array.isArray(body.recipients)) {
    throw new TrailShareError(
      'recipients must be an array',
      400,
      ShareErrorCodes.RECIPIENTS_REQUIRED
    );
  }

  const seen = new Set<string>();
  const recipients: string[] = [];
  for (const raw of body.recipients) {
    if (typeof raw !== 'string') {
      throw new TrailShareError(
        'recipients entries must be strings',
        400,
        ShareErrorCodes.INVALID_REQUEST
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
    throw new TrailShareError(
      'recipients must contain at least one login',
      400,
      ShareErrorCodes.RECIPIENTS_REQUIRED
    );
  }

  if (recipients.length > MAX_INBOX_RECIPIENTS) {
    throw new TrailShareError(
      `Too many recipients (max ${MAX_INBOX_RECIPIENTS})`,
      400,
      ShareErrorCodes.TOO_MANY_RECIPIENTS
    );
  }

  const out: SendTrailRequest = { recipients };

  if (body.comment !== undefined) {
    if (typeof body.comment !== 'string') {
      throw new TrailShareError(
        'comment must be a string',
        400,
        ShareErrorCodes.INVALID_REQUEST
      );
    }
    const comment = body.comment.trim();
    if (comment.length > 0) {
      if (comment.length > MAX_INBOX_COMMENT_CHARS) {
        throw new TrailShareError(
          `comment exceeds ${MAX_INBOX_COMMENT_CHARS} chars`,
          400,
          ShareErrorCodes.COMMENT_TOO_LONG
        );
      }
      out.comment = comment;
    }
  }

  return out;
}

export function summarizePayload(
  payload: Pick<TrailPayload, 'markers' | 'summary' | 'repos'>
): {
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
