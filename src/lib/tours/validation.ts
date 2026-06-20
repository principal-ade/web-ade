/**
 * Validation for store-backed tour publishing.
 *
 * Reuses the trails owner/repo validator and error types (the tour routes
 * already report via `TrailShareError`). Tour-document validation delegates to
 * `parseTour` from file-city-builder — the same validator the CLI's
 * `tour validate` and the git-discovery path use — so a published tour is held
 * to exactly the spec authors already target.
 */

import { parseTour } from '@principal-ai/file-city-builder';
import type { IntroductionTour } from '@principal-ai/file-city-builder';
import { TrailShareError, ShareErrorCodes } from '../trails/types';
import { validateOwnerRepo } from '../trails/validation';
import { MAX_PAYLOAD_BYTES } from './constants';
import type { CreateTourRequest, TourIndexEntry } from './types';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Validate an incoming tour document. Runs it through `parseTour` (the
 * canonical spec validator), then enforces the payload size cap. Returns the
 * parsed `IntroductionTour`.
 */
export function validateTour(tour: unknown): IntroductionTour {
  if (!isPlainObject(tour)) {
    throw new TrailShareError(
      'tour must be an object',
      400,
      ShareErrorCodes.INVALID_PAYLOAD
    );
  }

  const result = parseTour(JSON.stringify(tour));
  if (!result.success || !result.tour) {
    const detail =
      result.errors?.map((e) => e.message).join(', ') || 'unknown error';
    throw new TrailShareError(
      `Invalid tour: ${detail}`,
      400,
      ShareErrorCodes.INVALID_PAYLOAD
    );
  }

  const serialized = JSON.stringify(result.tour);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_PAYLOAD_BYTES) {
    throw new TrailShareError(
      `Tour exceeds ${MAX_PAYLOAD_BYTES} bytes`,
      413,
      ShareErrorCodes.PAYLOAD_TOO_LARGE
    );
  }

  return result.tour;
}

export function validateCreateTourRequest(body: unknown): CreateTourRequest {
  if (!isPlainObject(body)) {
    throw new TrailShareError(
      'Request body must be an object',
      400,
      ShareErrorCodes.INVALID_REQUEST
    );
  }
  const b = body as Partial<CreateTourRequest>;
  validateOwnerRepo(b.owner ?? '', b.repo ?? '');
  const tour = validateTour(b.tour);
  return { owner: b.owner!, repo: b.repo!, tour };
}

/** Lightweight index-entry fields derived from a validated tour document. */
export function summarizeTour(tour: IntroductionTour): Pick<
  TourIndexEntry,
  'tourId' | 'title' | 'descriptionPreview' | 'stepCount' | 'audience' | 'version'
> {
  return {
    tourId: tour.id,
    title: tour.title,
    descriptionPreview: (tour.description ?? '').slice(0, 200),
    stepCount: tour.steps.length,
    audience: tour.audience,
    version: tour.version,
  };
}
