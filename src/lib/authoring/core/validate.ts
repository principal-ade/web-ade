/**
 * The Stage L1 gate: does the assembled payload pass web-ade's *real*
 * validation, and does every marker resolve to real lines in the tree?
 *
 * Two checks, both offline:
 *   1. `validatePayload()` from `src/lib/trails/validation.ts` — the exact
 *      function the `POST /api/trails` route uses. If this passes, the
 *      payload would pass the endpoint.
 *   2. Tree resolution — every marker's `sourcePath` exists under
 *      `repoRoot` and its slice line range is within the file. This is the
 *      `validate-payload` responsibility from the design (run against the
 *      real checkout — locally a path on disk, in-VM the cloned tree).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { validatePayload } from '../../trails/validation';

export interface ValidationResult {
  ok: boolean;
  /** Hard failures that would block publishing. */
  errors: string[];
  /** Per-marker resolution detail, for eyes-on confidence. */
  markerChecks: Array<{
    id: string;
    sourcePath: string;
    range: string;
    ok: boolean;
    note?: string;
  }>;
}

export function validateAssembled(
  payload: Record<string, unknown>,
  repoRoot: string
): ValidationResult {
  const errors: string[] = [];

  // 1. The same gate the HTTP route uses.
  try {
    validatePayload(payload);
  } catch (err) {
    errors.push(
      `validatePayload: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // 2. Resolve every marker against the real tree.
  const markerChecks: ValidationResult['markerChecks'] = [];
  const markers = (payload.markers as Array<Record<string, unknown>>) ?? [];
  for (const m of markers) {
    const id = String(m.id);
    const sourcePath = m.sourcePath as string | undefined;
    const snippet = m.snippet as
      | { startLine?: number; endLine?: number }
      | undefined;
    if (!sourcePath || !snippet) {
      markerChecks.push({
        id,
        sourcePath: sourcePath ?? '(none)',
        range: '(no snippet)',
        ok: true,
        note: 'conceptual marker — no source to resolve',
      });
      continue;
    }
    const range = `${snippet.startLine}-${snippet.endLine}`;
    if (sourcePath.startsWith('/') || sourcePath.includes('..')) {
      const note = 'sourcePath must be repo-relative (no leading / or ..)';
      errors.push(`marker ${id}: ${note}`);
      markerChecks.push({ id, sourcePath, range, ok: false, note });
      continue;
    }
    try {
      const abs = path.join(repoRoot, sourcePath);
      const lineCount = readFileSync(abs, 'utf8').split('\n').length;
      const start = snippet.startLine ?? 0;
      const end = snippet.endLine ?? 0;
      let note: string | undefined;
      if (start < 1 || end < 1) note = 'line numbers must be >= 1';
      else if (start > end) note = `startLine ${start} > endLine ${end}`;
      else if (end > lineCount)
        note = `endLine ${end} exceeds file length (${lineCount} lines)`;
      if (note) {
        errors.push(`marker ${id} (${sourcePath}): ${note}`);
        markerChecks.push({ id, sourcePath, range, ok: false, note });
      } else {
        markerChecks.push({ id, sourcePath, range, ok: true });
      }
    } catch {
      const note = `sourcePath not found in tree`;
      errors.push(`marker ${id}: ${note} (${sourcePath})`);
      markerChecks.push({ id, sourcePath, range, ok: false, note });
    }
  }

  return { ok: errors.length === 0, errors, markerChecks };
}
