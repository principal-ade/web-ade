/**
 * The flat shape the `emit_trail` opencode tool produces. This is the
 * boundary between the agent and the runner: opencode fills this in,
 * `assemble.ts` expands it into a full `TrailPayload`.
 *
 * Kept deliberately flat (no nested snippet/views) — see
 * `opencode-assets/.opencode/tool/emit_trail.ts`.
 */
export interface EmitTrailMarker {
  id: string;
  label: string;
  /** Repo-relative path. */
  sourcePath: string;
  /** 1-based inclusive. */
  startLine: number;
  /** 1-based inclusive. */
  endLine: number;
  description: string;
}

export interface EmitTrailArgs {
  title: string;
  summary: string;
  /** Must match one of `markers[].id`. */
  subjectMarkerId: string;
  markers: EmitTrailMarker[];
}

/** Provenance stamped onto the assembled payload's `authoredAt`. */
export interface Provenance {
  sha: string;
  ref?: string;
}
