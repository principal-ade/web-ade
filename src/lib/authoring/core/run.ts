/**
 * Stage L0 + L1 in one runnable: drive opencode against a local checkout,
 * assemble the emitted args into a TrailPayload, and validate it offline.
 *
 *   npx tsx src/lib/authoring/core/run.ts \
 *     --repo-root . \
 *     --question "How does POST /api/trails validate payloads?"
 *
 * Flags:
 *   --repo-root <path>   repo opencode explores (default: cwd)
 *   --question  <text>   the question to author a trail for
 *   --out       <path>   where to write the assembled payload JSON
 *   --model     <p/m>    provider/model override (default: opencode's default)
 *   --keep-assets        leave the copied-in .opencode tool behind (debug)
 *
 * Exit code 0 only if the payload passes validatePayload() AND every marker
 * resolves to real lines in the tree.
 *
 * This file is the LOCAL env wrapper. The in-VM wrapper (env/freestyle.ts)
 * runs the same core (drive → assemble → validate); only boot + checkout +
 * publish differ. Nothing in core/ knows which environment it's in.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { buildBrief, buildQuestionPrompt } from './brief';
import { driveOpencode } from './drive';
import { assemblePayload } from './assemble';
import { validateAssembled } from './validate';
import type { Provenance } from './types';

const ASSET_REL =
  'src/lib/authoring/opencode-assets/.opencode/tool/emit_trail.ts';
const DEFAULT_QUESTION = 'How does POST /api/trails validate payloads?';
// Known-good free, tool-calling model (verified driving this pipeline).
// Many OpenRouter `:free` endpoints silently drop function-calling or cap
// output tokens; this one reliably emits the emit_trail call. Override with
// --model. opencode has no implicit default, so we must pass one.
const DEFAULT_MODEL = 'openrouter/nvidia/nemotron-3-super-120b-a12b:free';

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a || !a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

function resolveProvenance(repoRoot: string): Provenance {
  try {
    const sha = execFileSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    let ref: string | undefined;
    try {
      ref = execFileSync(
        'git',
        ['-C', repoRoot, 'rev-parse', '--abbrev-ref', 'HEAD'],
        { encoding: 'utf8' }
      ).trim();
    } catch {
      // detached HEAD or no branch — sha is authoritative anyway
    }
    return { sha, ref };
  } catch {
    console.warn(
      `[run] ${repoRoot} is not a git repo — stamping a placeholder sha`
    );
    return { sha: 'LOCAL-NO-GIT' };
  }
}

/** Copy the emit_trail tool into the checkout so opencode discovers it. */
function installAsset(repoRoot: string): { cleanup: () => void } {
  const src = path.resolve(process.cwd(), ASSET_REL);
  if (!existsSync(src)) {
    throw new Error(
      `emit_trail asset not found at ${src} — run from the web-ade repo root`
    );
  }
  const toolDir = path.join(repoRoot, '.opencode', 'tool');
  const dest = path.join(toolDir, 'emit_trail.ts');
  const opencodeDirPreexisted = existsSync(path.join(repoRoot, '.opencode'));
  const destPreexisted = existsSync(dest);
  mkdirSync(toolDir, { recursive: true });
  copyFileSync(src, dest);
  return {
    cleanup: () => {
      if (!destPreexisted) {
        try {
          rmSync(dest);
        } catch {
          /* ignore */
        }
      }
      // Only remove .opencode if we created it (avoid clobbering a real one).
      if (!opencodeDirPreexisted) {
        try {
          rmSync(path.join(repoRoot, '.opencode'), {
            recursive: true,
            force: true,
          });
        } catch {
          /* ignore */
        }
      }
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(
    typeof args['repo-root'] === 'string' ? args['repo-root'] : process.cwd()
  );
  const question =
    typeof args.question === 'string' ? args.question : DEFAULT_QUESTION;
  const outPath = path.resolve(
    typeof args.out === 'string'
      ? args.out
      : 'src/lib/authoring/.out/trail-payload.json'
  );
  const modelSpec =
    typeof args.model === 'string' ? args.model : DEFAULT_MODEL;
  const [providerID, ...modelRest] = modelSpec.split('/');
  const model = { providerID: providerID ?? '', modelID: modelRest.join('/') };
  const keepAssets = args['keep-assets'] === true;

  console.log(`\n── Stage L0+L1 ───────────────────────────────────────`);
  console.log(`repo     : ${repoRoot}`);
  console.log(`question : ${question}`);
  console.log(`model    : ${model.providerID}/${model.modelID}`);

  const provenance = resolveProvenance(repoRoot);
  console.log(`authoredAt: ${provenance.sha}${provenance.ref ? ` (${provenance.ref})` : ''}`);

  const emitTrailOut = path.join(
    os.tmpdir(),
    `emit-trail-${provenance.sha.slice(0, 8)}.json`
  );

  const asset = installAsset(repoRoot);
  console.log(`\n[L0] driving opencode…`);
  let emitArgs;
  try {
    emitArgs = await driveOpencode({
      repoRoot,
      system: buildBrief(),
      prompt: buildQuestionPrompt(question),
      emitTrailOut,
      model,
      onProgress: (label, detail) =>
        console.log(`  · ${label}${detail ? ` — ${detail}` : ''}`),
    });
  } finally {
    if (!keepAssets) asset.cleanup();
  }

  console.log(
    `[L0] emit_trail captured: "${emitArgs.title}" — ${emitArgs.markers.length} markers, subject=${emitArgs.subjectMarkerId}`
  );

  console.log(`\n[L1] assembling + validating…`);
  const payload = assemblePayload(emitArgs, provenance);
  const result = validateAssembled(payload, repoRoot);

  for (const c of result.markerChecks) {
    console.log(
      `  ${c.ok ? '✓' : '✗'} ${c.id}  ${c.sourcePath}:${c.range}${c.note ? `  — ${c.note}` : ''}`
    );
  }

  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`\npayload written: ${outPath}`);

  if (result.ok) {
    console.log(`\n✅ PASS — payload passes validatePayload() and all markers resolve.`);
    process.exit(0);
  } else {
    console.log(`\n❌ FAIL:`);
    for (const e of result.errors) console.log(`   - ${e}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`\n💥 ${err instanceof Error ? err.stack : String(err)}`);
  process.exit(1);
});
