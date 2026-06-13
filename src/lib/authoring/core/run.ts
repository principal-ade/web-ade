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
 *   --timeout   <secs>   max seconds for the opencode run (default: 240)
 *   --keep-assets        leave the copied-in .opencode tool behind (debug)
 *   --emit-json          print the validated payload as ONE JSON line to stdout
 *                        and skip publish — the VM→host boundary (logs → stderr)
 *   --publish            Stage L2: POST the validated payload to a web-ade host
 *   --host      <url>    publish target (default: http://localhost:3000)
 *   --owner     <o>      repo owner for publish (default: derived from origin)
 *   --repo      <r>      repo name for publish  (default: derived from origin)
 *   --token     <t>      GitHub token (default: $GITHUB_TOKEN) — the user's token
 *
 * Exit code 0 only if the payload passes validatePayload() AND every marker
 * resolves to real lines in the tree (and, with --publish, the POST succeeds).
 *
 * This file is the LOCAL env wrapper. The in-VM wrapper (env/freestyle.ts)
 * runs the same core (drive → assemble → validate); only boot + checkout +
 * publish differ. Nothing in core/ knows which environment it's in.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
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
import { EMIT_TRAIL_SOURCE } from './emit-trail-asset.generated';
import { publishTrail } from '../publish';
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

/**
 * Derive `{ owner, repo }` from the checkout's GitHub origin — mirrors the
 * "Origin derivation" step in docs/file-city-trail-sharing.md so publish
 * targets the same repo the trail was authored against.
 */
function resolveOriginRepo(
  repoRoot: string
): { owner: string; repo: string } | null {
  try {
    const url = execFileSync(
      'git',
      ['-C', repoRoot, 'remote', 'get-url', 'origin'],
      { encoding: 'utf8' }
    ).trim();
    const m = url.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/i);
    if (m && m[1] && m[2]) return { owner: m[1], repo: m[2] };
  } catch {
    // no origin / not a git repo — caller falls back to explicit flags
  }
  return null;
}

/**
 * The emit_trail tool source. Prefer the live file when running from the
 * web-ade source tree (local dev — edits take effect immediately); fall back
 * to the constant the bundler embedded, so the esbuild'd VM bundle carries the
 * asset and needs no source tree at `/opt/authoring`.
 */
function emitTrailSource(): string {
  const live = path.resolve(process.cwd(), ASSET_REL);
  if (existsSync(live)) return readFileSync(live, 'utf8');
  return EMIT_TRAIL_SOURCE;
}

/** Write the emit_trail tool into the checkout so opencode discovers it. */
function installAsset(repoRoot: string): { cleanup: () => void } {
  const toolDir = path.join(repoRoot, '.opencode', 'tool');
  const dest = path.join(toolDir, 'emit_trail.ts');
  const opencodeDirPreexisted = existsSync(path.join(repoRoot, '.opencode'));
  const destPreexisted = existsSync(dest);
  mkdirSync(toolDir, { recursive: true });
  writeFileSync(dest, emitTrailSource(), 'utf8');
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
  const timeoutMs =
    typeof args.timeout === 'string' ? Number(args.timeout) * 1000 : undefined;

  const emitJson = args['emit-json'] === true;
  // In --emit-json mode, stdout must carry ONLY the validated payload (one JSON
  // line) so the VM→host boundary can `JSON.parse` it; route human logging to
  // stderr. Otherwise log to stdout as usual.
  const writeLog = emitJson
    ? console.error.bind(console)
    : console.log.bind(console);

  writeLog(`\n── Stage L0+L1${emitJson ? ' (--emit-json)' : ''} ──────────────────────`);
  writeLog(`repo     : ${repoRoot}`);
  writeLog(`question : ${question}`);
  writeLog(`model    : ${model.providerID}/${model.modelID}`);

  const provenance = resolveProvenance(repoRoot);
  writeLog(`authoredAt: ${provenance.sha}${provenance.ref ? ` (${provenance.ref})` : ''}`);

  const emitTrailOut = path.join(
    os.tmpdir(),
    `emit-trail-${provenance.sha.slice(0, 8)}.json`
  );

  const asset = installAsset(repoRoot);
  writeLog(`\n[L0] driving opencode…`);
  let emitArgs;
  try {
    emitArgs = await driveOpencode({
      repoRoot,
      system: buildBrief(),
      prompt: buildQuestionPrompt(question),
      emitTrailOut,
      model,
      timeoutMs,
      onProgress: (label, detail) =>
        writeLog(`  · ${label}${detail ? ` — ${detail}` : ''}`),
    });
  } finally {
    if (!keepAssets) asset.cleanup();
  }

  writeLog(
    `[L0] emit_trail captured: "${emitArgs.title}" — ${emitArgs.markers.length} markers, subject=${emitArgs.subjectMarkerId}`
  );

  writeLog(`\n[L1] assembling + validating…`);
  const payload = assemblePayload(emitArgs, provenance);
  const result = validateAssembled(payload, repoRoot);

  for (const c of result.markerChecks) {
    writeLog(
      `  ${c.ok ? '✓' : '✗'} ${c.id}  ${c.sourcePath}:${c.range}${c.note ? `  — ${c.note}` : ''}`
    );
  }

  if (!result.ok) {
    writeLog(`\n❌ FAIL:`);
    for (const e of result.errors) writeLog(`   - ${e}`);
    process.exit(1);
  }
  writeLog(`\n✅ PASS — payload passes validatePayload() and all markers resolve.`);

  // --emit-json: emit the validated payload as a single JSON line on stdout and
  // stop. Publishing is the host's job (env/freestyle.ts), never the VM's.
  if (emitJson) {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
    process.exit(0);
  }

  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');
  writeLog(`\npayload written: ${outPath}`);

  // Stage L2 (optional): publish to a web-ade host with the user's GitHub token.
  if (args.publish === true) {
    const host =
      typeof args.host === 'string' ? args.host : 'http://localhost:3000';
    const origin = resolveOriginRepo(repoRoot);
    const owner =
      typeof args.owner === 'string' ? args.owner : origin?.owner;
    const repo = typeof args.repo === 'string' ? args.repo : origin?.repo;
    const token =
      typeof args.token === 'string' ? args.token : process.env.GITHUB_TOKEN;

    if (!owner || !repo) {
      writeLog(
        `\n❌ --publish: could not resolve owner/repo (no GitHub origin) — pass --owner/--repo.`
      );
      process.exit(1);
    }
    if (!token) {
      writeLog(
        `\n❌ --publish: no GitHub token — pass --token or set GITHUB_TOKEN (the user's token).`
      );
      process.exit(1);
    }

    writeLog(`\n[L2] publishing ${owner}/${repo} → ${host}…`);
    try {
      const { url } = await publishTrail({ host, token, owner, repo, payload });
      writeLog(`\n🌐 published: ${host.replace(/\/+$/, '')}${url}`);
    } catch (err) {
      writeLog(`\n❌ publish failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(`\n💥 ${err instanceof Error ? err.stack : String(err)}`);
  process.exit(1);
});
