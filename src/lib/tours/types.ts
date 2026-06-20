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

// ============================================================================
// Store-backed tours (S3). Parallels the trails store: a per-repo index of
// lightweight entries, a per-tour payload object, and an id pointer for
// repo-less share links. The git tree-walk in `discovery.ts` stays as a
// temporary fallback until backfill lands; these types describe the new
// authoritative source.
// ============================================================================

/**
 * The persisted form of a tour. Wraps the validated `IntroductionTour`
 * document with the coordinates the TTS backend needs to (re)generate audio.
 *
 * For git-authored tours the audio ref points at the source `*.tour.json`;
 * for store-published tours it records a stable `{ owner, repo, path }` key
 * (path is synthesized from the store id at publish time) so the TTS manifest
 * keying — which is `(owner, repo, path)` — keeps working without git.
 */
export interface StoredTourPayload {
  tour: IntroductionTour;
  audio: TourAudioRef;
}

/**
 * Who may create/delete tours for a repo. Reserves the authorization surface
 * called out in the migration plan: owners can tighten write access beyond the
 * default "anyone with repo write access". Absent → treat as `repo-write`.
 */
export interface TourWritePolicy {
  mode: 'repo-write' | 'owner-only' | 'allowlist';
  /** GitHub logins allowed when `mode === 'allowlist'`. */
  allow?: string[];
  updatedBy?: { githubId: number; githubLogin: string };
  /** ISO 8601 — when the policy was last set. */
  updatedAt?: string;
}

/**
 * One row in a repo's tour index. Lightweight — the full `IntroductionTour`
 * lives in the per-tour payload object, fetched by id. `id` is the
 * server-minted store id (used in share links); `tourId` is the author-chosen
 * `IntroductionTour.id`, kept for display/dedup.
 */
export interface TourIndexEntry {
  id: string;
  tourId: string;
  title: string;
  /** First ~200 chars of the tour description, for list rendering. */
  descriptionPreview: string;
  stepCount: number;
  audience?: string;
  version: string;
  createdBy: { githubId: number; githubLogin: string };
  /** GitHub numeric repo id at upload time — rename-stable backstop. */
  githubRepoId: number;
  createdAt: string;
  updatedAt: string;
  sizeBytes: number;
}

export interface TourIndex {
  version: 1;
  updatedAt: string;
  entries: TourIndexEntry[];
  /** Repo visibility at last index write — lets listings filter without GitHub. */
  repoVisibility?: 'public' | 'private';
  repoVisibilityCheckedAt?: string;
  /** Owner-configurable write gating (see {@link TourWritePolicy}). */
  writePolicy?: TourWritePolicy;
}

// ============================================================================
// Request / response shapes
// ============================================================================

export interface CreateTourRequest {
  owner: string;
  repo: string;
  /** The author-provided `IntroductionTour` document to publish. */
  tour: IntroductionTour;
}

export interface CreateTourResponse {
  id: string;
  url: string;
  entry: TourIndexEntry;
}

export interface ListStoredToursResponse {
  entries: TourIndexEntry[];
}
