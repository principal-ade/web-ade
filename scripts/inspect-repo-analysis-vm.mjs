#!/usr/bin/env node
/**
 * Inspect the warm/suspended Freestyle VM behind a repo-analysis run.
 *
 * Answers the operational question: did the detached sweep actually WRITE
 * /tmp/analysis.json on the VM, and — if it did — did it fail to PUT it up to
 * S3? Refs the (possibly suspended) VM, execs a read-only diagnostic, and dumps
 * the job log + /tmp artifacts alongside the S3-side state (result / error).
 *
 * Usage:
 *   node scripts/inspect-repo-analysis-vm.mjs <owner>/<repo>   # resolve vmId from the S3 registry
 *   node scripts/inspect-repo-analysis-vm.mjs --vm <vmId>      # inspect a vmId directly
 *
 * Reads FREESTYLE_API_KEY (freestyle SDK) + TTS_AWS_REGION/TTS_S3_BUCKET + the
 * ambient AWS credential chain from .env.local, same as the app.
 *
 * NOTE: exec resumes a suspended VM (bills briefly). It is READ-ONLY — it never
 * re-triggers a sweep — so it won't clobber the very evidence you're inspecting.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- load .env.local into process.env (don't override anything already set) ---
function loadEnv(file) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnv(resolve(__dirname, '..', '.env.local'));

// --- args ---
const argv = process.argv.slice(2);
let owner, repo, vmId;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--vm') {
    vmId = argv[++i];
  } else if (argv[i].includes('/')) {
    [owner, repo] = argv[i].split('/');
  }
}
if (!vmId && (!owner || !repo)) {
  console.error(
    'usage: node scripts/inspect-repo-analysis-vm.mjs <owner>/<repo> | --vm <vmId>'
  );
  process.exit(2);
}

const BUCKET = process.env.TTS_S3_BUCKET || 'repo-tour-audio';
const REGION = process.env.TTS_AWS_REGION || 'us-east-1';

async function getS3Json(key) {
  const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
  const s3 = new S3Client({ region: REGION });
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    if (!res.Body) return null;
    return JSON.parse(await res.Body.transformToString());
  } catch (err) {
    const code = err?.name || err?.Code;
    if (code === 'NoSuchKey' || code === 'NotFound' || err?.$metadata?.httpStatusCode === 404) {
      return null;
    }
    console.warn(`  ! S3 read failed for ${key}: ${code || err?.message}`);
    return null;
  }
}

const lc = (s) => String(s).toLowerCase();

async function main() {
  // 1) Resolve the vmId + surface the S3-side state.
  if (!vmId) {
    console.log(`\n== S3 state for ${owner}/${repo} (bucket ${BUCKET}) ==`);
    const [ptr, result, error] = await Promise.all([
      getS3Json(`repo-analysis-vms/${lc(owner)}/${lc(repo)}.json`),
      getS3Json(`repo-analysis/${lc(owner)}/${lc(repo)}.json`),
      getS3Json(`repo-analysis-errors/${lc(owner)}/${lc(repo)}.json`),
    ]);
    console.log(`  warm-VM registry : ${ptr ? `${ptr.vmId} (updated ${ptr.updatedAt})` : '(none)'}`);
    console.log(`  result cache     : ${result ? `sha ${result.sha ?? '?'} @ ${result.generatedAt ?? '?'}` : '(none — nothing published)'}`);
    console.log(`  error record     : ${error ? `stage=${error.stage} :: ${error.message}` : '(none)'}`);
    if (!ptr?.vmId) {
      console.log('\nNo warm VM registered for this repo — nothing to inspect on-VM.');
      console.log('(A cold run that never launched leaves no vmId; a done run may have been evicted.)');
      return;
    }
    vmId = ptr.vmId;
  }

  // 2) Ref the (possibly suspended) VM and run a read-only diagnostic.
  console.log(`\n== Inspecting VM ${vmId} (exec resumes it if suspended) ==`);
  const { freestyle } = await import('freestyle');

  const script = `
echo "### job.out (tail 80) ###"
tail -n 80 /tmp/job.out 2>/dev/null || echo "(no /tmp/job.out)"
echo
echo "### /tmp artifacts ###"
ls -la /tmp/analysis.json /tmp/sweep.lock /tmp/job.sh /tmp/sweep.py /tmp/publish.py 2>/dev/null
echo
echo "### analysis.json ###"
if [ -f /tmp/analysis.json ]; then
  echo "PRESENT — size $(wc -c < /tmp/analysis.json) bytes"
  echo "head:"; head -c 500 /tmp/analysis.json; echo
else
  echo "ABSENT — the sweep did not produce a result file"
fi
echo
echo "### sweep.lock ###"
if [ -d /tmp/sweep.lock ]; then echo "PRESENT — a sweep is in-flight or crashed without releasing the lock"; else echo "(none)"; fi
echo
echo "### /repo HEAD ###"
( cd /repo 2>/dev/null && git rev-parse HEAD 2>/dev/null ) || echo "(no /repo clone)"
`.trim();

  const b64 = Buffer.from(script, 'utf8').toString('base64');
  const command = `echo ${b64} | base64 -d | bash`;

  let vm;
  try {
    vm = freestyle.vms.ref({ vmId });
  } catch (err) {
    console.error(`  ! could not ref VM ${vmId}: ${err?.message || err}`);
    console.error('  (likely evicted/deleted — sticky VMs are priority-evicted under storage quota)');
    process.exit(1);
  }

  let r;
  try {
    r = await vm.exec({ command, timeoutMs: 60_000 });
  } catch (err) {
    console.error(`  ! exec failed on VM ${vmId}: ${err?.message || err}`);
    console.error('  (VM may have been evicted/deleted since it was registered)');
    process.exit(1);
  }

  console.log(`\n--- exit ${r.statusCode ?? '?'} ---`);
  if (r.stdout) console.log(r.stdout);
  if (r.stderr && r.stderr.trim()) {
    console.log('--- stderr ---');
    console.log(r.stderr);
  }

  console.log('\nRead: analysis.json PRESENT + result cache (none) ⇒ the S3 PUT (VM→S3) leg failed.');
  console.log('      analysis.json ABSENT ⇒ died earlier — check job.out for the last STAGE.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
