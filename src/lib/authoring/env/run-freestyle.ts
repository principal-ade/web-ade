/**
 * CLI harness for the Stage 3 in-VM run (S3c). Loads `.env.local`
 * (FREESTYLE_API_KEY, AUTHORING_BASE_SNAPSHOT, OPENROUTER_API_KEY, GITHUB_TOKEN,
 * WEB_ADE_ORIGIN), then drives `runInFreestyle` against a real repo.
 *
 *   # build the VM bundle first, then:
 *   node src/lib/authoring/core/build-vm-bundle.mjs
 *   npx tsx src/lib/authoring/env/run-freestyle.ts \
 *     --owner sindresorhus --repo is-odd \
 *     --question "How does the main function decide odd vs even?" \
 *     --no-publish
 *
 * Flags: --owner --repo [--ref] [--question] [--model p/m] [--no-publish].
 * Token comes from $GITHUB_TOKEN (the user's token — host-only).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runInFreestyle } from './freestyle';

/** Minimal `.env.local` loader — `KEY=value` lines; existing env wins. */
function loadEnv(file: string): void {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || !m[1]) continue;
    let val = m[2] ?? '';
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  }
}

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

async function main() {
  loadEnv(path.resolve('.env.local'));
  const args = parseArgs(process.argv.slice(2));

  const owner = typeof args.owner === 'string' ? args.owner : undefined;
  const repo = typeof args.repo === 'string' ? args.repo : undefined;
  if (!owner || !repo) {
    console.error('usage: --owner <o> --repo <r> [--ref] [--question] [--model] [--no-publish]');
    process.exit(2);
  }
  const ref = typeof args.ref === 'string' ? args.ref : undefined;
  const question =
    typeof args.question === 'string'
      ? args.question
      : 'How does this codebase work — trace the main entry path.';
  const model = typeof args.model === 'string' ? args.model : undefined;
  const publish = args['no-publish'] !== true;
  const userToken = process.env.GITHUB_TOKEN;
  if (!userToken) {
    console.error('GITHUB_TOKEN is not set (the user token for clone + publish)');
    process.exit(2);
  }

  console.error(`\n── Stage 3 (S3c) — in-VM authoring ───────────────────`);
  console.error(`repo     : ${owner}/${repo}${ref ? `@${ref}` : ''}`);
  console.error(`question : ${question}`);
  console.error(`model    : ${model ?? '(default free)'}`);
  console.error(`publish  : ${publish}\n`);

  const t0 = Date.now();
  const res = await runInFreestyle({
    owner,
    repo,
    ref,
    question,
    userToken,
    model,
    publish,
    onProgress: (label, detail) =>
      console.error(`  · ${label}${detail ? ` — ${detail}` : ''}`),
  });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  const p = res.payload as {
    title?: string;
    markers?: unknown[];
    views?: { kind?: string }[];
  };
  console.error(`\n✅ S3c run complete in ${secs}s`);
  console.error(`   title   : ${p.title}`);
  console.error(`   markers : ${p.markers?.length}`);
  console.error(`   views   : ${(p.views ?? []).map((v) => v.kind).join(', ')}`);
  if (res.trailUrl) console.error(`   trail   : ${res.trailUrl}`);
  // The validated payload on stdout (single line) — mirrors the VM boundary.
  process.stdout.write(`${JSON.stringify(res.payload)}\n`);
}

main().catch((err) => {
  console.error(`\n💥 ${err instanceof Error ? err.stack : String(err)}`);
  process.exit(1);
});
