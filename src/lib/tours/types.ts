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

/** A discovered tour plus the coordinates needed to fetch its audio. */
export interface TourListItem {
  tour: IntroductionTour;
  audio: TourAudioRef;
}

export interface ListToursResponse {
  tours: TourListItem[];
}
