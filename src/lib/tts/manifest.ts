/**
 * Per-tour audio manifest
 *
 * A small sidecar JSON object in the TTS S3 bucket that records, for one tour
 * file, which steps have generated audio (by content key) and when audio was
 * last generated. It is the source of truth for two things the audio blobs
 * alone can't answer:
 *
 *   1. Status badges on the tours list — distinguishing "never generated"
 *      (no manifest) from "outdated" (manifest exists but a step's narration
 *      text changed, so its current content key is no longer recorded).
 *   2. The once-per-hour generation cooldown (`lastGeneratedAt`).
 *
 * Reading it costs one S3 GET per tour on the list; writing it costs one PUT
 * after a generation run.
 */

import type { IntroductionTour, TTSOptions } from './types';
import type { TourAudioStatus } from '../tours/types';
import { generateContentHash, generateS3Key } from './key-generator';
import { getStepDescription } from './github-fetcher';
import { getS3Json, putS3Json } from './s3-cache';

/**
 * A tour may be (re)generated at most once per this window. Shared/global per
 * tour — the gate lives on the manifest, not per user. Overridable for tests
 * or tuning via `TTS_GENERATION_COOLDOWN_MS`.
 */
export const GENERATION_COOLDOWN_MS = Number(
  process.env.TTS_GENERATION_COOLDOWN_MS ?? 60 * 60 * 1000
);

export interface TourAudioManifest {
  version: 1;
  /** ISO 8601 of the last generation attempt; null when never attempted. */
  lastGeneratedAt: string | null;
  /** Options the audio was generated with (keys are options-sensitive). */
  options: TTSOptions;
  /** stepId → content S3 key that was ensured present for that step. */
  steps: Record<string, string>;
}

/** S3 key for a tour's manifest. Path is hashed so the key is slash-safe. */
export async function manifestKey(
  owner: string,
  repo: string,
  path: string
): Promise<string> {
  const pathHash = await generateContentHash(path);
  return `tts-audio/${owner}/${repo}/manifests/${pathHash}.json`;
}

export async function readManifest(
  owner: string,
  repo: string,
  path: string
): Promise<TourAudioManifest | null> {
  const key = await manifestKey(owner, repo, path);
  return getS3Json<TourAudioManifest>(key);
}

export async function writeManifest(
  owner: string,
  repo: string,
  path: string,
  manifest: TourAudioManifest
): Promise<void> {
  const key = await manifestKey(owner, repo, path);
  await putS3Json(key, manifest);
}

/**
 * Canonical content S3 key for one step's audio. Returns null when the step has
 * no usable text (empty / over-length) — such steps are skipped everywhere
 * (status, generation, playback) rather than treated as missing audio.
 *
 * Uses `getStepDescription` (markdown-stripped, normalized) so this key matches
 * what the `generate`/`generateTourStep` mutations write and what cache-only
 * playback looks up — one canonical derivation for the whole feature.
 */
export async function tourStepContentKey(
  owner: string,
  repo: string,
  tour: IntroductionTour,
  stepId: string,
  options: TTSOptions
): Promise<string | null> {
  let text: string;
  try {
    text = getStepDescription(tour, stepId);
  } catch {
    return null;
  }
  return generateS3Key(owner, repo, text, options);
}

/**
 * Derives the list-facing audio status for a tour by comparing each step's
 * current content key against what the manifest recorded.
 *
 * - `ready`     — every (text-bearing) step's current key is recorded.
 * - `outdated`  — a prior generation exists but some current keys aren't
 *                 recorded (narration text changed since).
 * - `partial`   — some steps recorded, no prior generation timestamp (rare;
 *                 e.g. an interrupted first run).
 * - `none`      — no manifest, or nothing recorded.
 */
export async function computeTourAudioStatus(
  owner: string,
  repo: string,
  tour: IntroductionTour,
  options: TTSOptions,
  manifest: TourAudioManifest | null
): Promise<TourAudioStatus> {
  const stepIds = Array.isArray(tour.steps)
    ? tour.steps.map((s) => s.id)
    : [];

  let readySteps = 0;
  let totalSteps = 0;
  for (const stepId of stepIds) {
    const key = await tourStepContentKey(owner, repo, tour, stepId, options);
    if (key === null) continue; // textless step — not counted toward audio
    totalSteps++;
    if (manifest?.steps?.[stepId] === key) readySteps++;
  }

  const lastGeneratedAt = manifest?.lastGeneratedAt ?? null;

  let state: TourAudioStatus['state'];
  if (totalSteps > 0 && readySteps === totalSteps) {
    state = 'ready';
  } else if (lastGeneratedAt && readySteps > 0) {
    state = 'outdated';
  } else if (readySteps > 0) {
    state = 'partial';
  } else {
    state = 'none';
  }

  let canGenerateAt: string | null = null;
  if (lastGeneratedAt) {
    const next = new Date(lastGeneratedAt).getTime() + GENERATION_COOLDOWN_MS;
    if (next > Date.now()) canGenerateAt = new Date(next).toISOString();
  }

  return { state, totalSteps, readySteps, lastGeneratedAt, canGenerateAt };
}
