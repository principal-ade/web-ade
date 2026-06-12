/**
 * Flat `emit_trail` args → full `TrailPayload`.
 *
 * The runner (not the agent) owns all structural assembly: mint the id and
 * timestamps, attach single-repo `authoredAt` provenance, build the
 * `kind:'sequence'` view from marker order, and stamp `kind:'subject'` on
 * the answer marker. Pure function — no I/O — so it's identical everywhere.
 *
 * Returns an object shaped like a `TrailPayload`; `validate.ts` runs it
 * through web-ade's real `validatePayload()` gate (which strips/ignores the
 * server-controlled `id`).
 */
import { randomUUID } from 'node:crypto';
import type { EmitTrailArgs, Provenance } from './types';

export function assemblePayload(
  args: EmitTrailArgs,
  prov: Provenance
): Record<string, unknown> {
  const now = new Date().toISOString();

  const markers = args.markers.map((m) => ({
    id: m.id,
    label: m.label,
    sourcePath: m.sourcePath,
    snippet: {
      kind: 'slice' as const,
      startLine: m.startLine,
      endLine: m.endLine,
      focusLine: m.startLine,
    },
    description: m.description,
    ...(m.id === args.subjectMarkerId ? { kind: 'subject' as const } : {}),
  }));

  const sequenceView = {
    kind: 'sequence' as const,
    markers: args.markers.map((m) => ({
      markerId: m.id,
      // Sequence-view name drives lane derivation; label is a fine default.
      name: m.label || m.id,
    })),
    // Chain consecutive markers; flatMap+guard keeps it index-safe.
    edges: args.markers.flatMap((m, i, arr) => {
      const next = arr[i + 1];
      return next ? [{ id: `e${i}`, fromEvent: m.id, toEvent: next.id }] : [];
    }),
  };

  return {
    id: randomUUID(), // ignored by validatePayload; the POST route mints the real one
    title: args.title,
    summary: args.summary,
    purpose: 'investigation',
    authoredAt: { sha: prov.sha, ...(prov.ref ? { ref: prov.ref } : {}) },
    markers,
    views: [sequenceView],
    createdAt: now,
    updatedAt: now,
  };
}
