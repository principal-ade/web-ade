import { tool } from '@opencode-ai/plugin';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * `emit_trail` — the single output contract for hosted trail authoring.
 *
 * This is the *flat* shape the agent produces (one marker per step, pinned
 * to file + line range). The runner expands it into a full `TrailPayload`
 * (mints id + timestamps, attaches `authoredAt`, builds the sequence view,
 * stamps `kind:'subject'`) — see `core/assemble.ts`. Keeping the tool flat
 * minimises what the agent can get structurally wrong.
 *
 * Capture is primarily via the opencode response stream (the runner reads
 * this tool call's `input` off `session.prompt`'s parts). As a robust
 * fallback / debug artifact, the handler ALSO writes the args to the path
 * in `EMIT_TRAIL_OUT` when set. Both mechanisms are local to wherever
 * opencode runs, so this file is identical on a laptop and inside a
 * Freestyle VM — only its install location (copied into the checkout)
 * differs.
 */

const s = tool.schema;

export default tool({
  description:
    'Emit the finished investigation trail. Call EXACTLY ONCE, only after ' +
    'you have read every file/line you reference and confirmed it resolves. ' +
    'Do not call this until the walkthrough is complete.',
  args: {
    title: s
      .string()
      .describe('Short title for the trail, shown in the drawer header.'),
    summary: s
      .string()
      .describe(
        'Markdown overview of the whole trail — what question it answers ' +
          'and the path it walks.'
      ),
    subjectMarkerId: s
      .string()
      .describe(
        'The id of the single marker that actually answers the question ' +
          '(the destination/subject). Must match one of markers[].id.'
      ),
    markers: s
      .array(
        s.object({
          id: s
            .string()
            .describe('Stable id for this step, e.g. "m1". Referenced by subjectMarkerId.'),
          label: s.string().describe('Human label for this step.'),
          sourcePath: s
            .string()
            .describe(
              'Repo-relative path (never absolute) to the file this step points at.'
            ),
          startLine: s
            .number()
            .int()
            .min(1)
            .describe('First line of the slice (1-based, inclusive).'),
          endLine: s
            .number()
            .int()
            .min(1)
            .describe('Last line of the slice (1-based, inclusive).'),
          description: s
            .string()
            .describe('Markdown explaining why this step matters (the "why").'),
        })
      )
      .min(1)
      .describe('Ordered steps of the trail, entry point first.'),
  },
  async execute(args) {
    const out = process.env.EMIT_TRAIL_OUT;
    if (out) {
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, JSON.stringify(args, null, 2), 'utf8');
    }
    return (
      `emit_trail captured: "${args.title}" — ${args.markers.length} markers, ` +
      `subject=${args.subjectMarkerId}. The trail has been recorded; you are done.`
    );
  },
});
