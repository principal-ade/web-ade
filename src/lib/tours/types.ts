import type { IntroductionTour } from '@principal-ai/file-city-builder';

/**
 * Everything needed to build a `TourAudioContext` for one tour. Points at the
 * repo the tour was actually discovered in (which may be a fork, not the page
 * repo) so the TTS backend can re-fetch the tour file from GitHub.
 */
export interface TourAudioRef {
  owner: string;
  repo: string;
  /** Repo-relative path of the `*.tour.json` file. */
  path: string;
  /**
   * Commit SHA the tour was read at, for the TTS backend. Null when it
   * couldn't be resolved (rate limit / GitHub down) — audio then falls back
   * to cache-only mode rather than blocking the tour from listing.
   */
  commitSha: string | null;
}

/**
 * Audio-generation status for one tour, surfaced on the list so a row can show
 * whether narration exists, is stale, or needs generating — and whether the
 * once-per-hour cooldown currently blocks (re)generation.
 */
export interface TourAudioStatus {
  /**
   * - `ready`    — every text-bearing step has current audio.
   * - `outdated` — audio was generated before but a step's text changed since.
   * - `partial`  — some steps have audio, no completed prior generation.
   * - `none`     — no audio generated yet.
   */
  state: 'none' | 'partial' | 'ready' | 'outdated';
  /** Text-bearing steps (the denominator for "ready"). */
  totalSteps: number;
  /** Steps whose current audio is present. */
  readySteps: number;
  /** ISO 8601 of the last generation attempt; null if never. */
  lastGeneratedAt: string | null;
  /**
   * ISO 8601 of when generation is next allowed, or null when allowed now.
   * Set while inside the per-tour hourly cooldown.
   */
  canGenerateAt: string | null;
}

/** A discovered tour plus the coordinates needed to fetch its audio. */
export interface TourListItem {
  tour: IntroductionTour;
  audio: TourAudioRef;
  /** Generation status used to render the row's audio badge + button. */
  audioStatus: TourAudioStatus;
}

export interface ListToursResponse {
  tours: TourListItem[];
}
