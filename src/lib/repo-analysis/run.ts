/**
 * Repo analysis on a Freestyle VM.
 *
 * Clones a GitHub repo onto a Freestyle VM DIRECTLY from github.com (not via
 * Freestyle Git import — that import path returns INTERNAL_ERROR on some repos;
 * a direct VM clone works on every repo tried, including the import-failing
 * ones), runs ONE in-VM git sweep, and reads the aggregated result back.
 *
 * The sweep produces the two metrics web-ade's File City map consumes:
 *   - `lineCounts`  — per-file newline count → 3D building heights. Mirrors the
 *                     electron-app's `countLinesInRepository`.
 *   - `byEmail`     — contributor ownership (email → file → lines, via blame) →
 *                     contributor highlight layers. Mirrors `getOwnershipMap`.
 *
 * The whole sweep runs in a SINGLE `vm.exec` and prints aggregated JSON, rather
 * than one exec per file — every exec is a network round-trip to Freestyle, so
 * the sweep stays local to the VM's disk and only KB–MB of JSON crosses back.
 *
 * Warm-VM reuse: the VM is created with `sticky` (cache) persistence and is NOT
 * deleted after a run, so the clone survives. A caller that passes back the
 * previous run's `vmId` gets a `git fetch` + reset (skipping the slow clone) and
 * one re-sweep against the new HEAD. If the VM was evicted, or the fetch fails
 * (force-push, etc.), the run transparently falls back to a fresh clone (on the
 * same VM, or a brand-new one). An idle warm VM auto-suspends and bills storage
 * only.
 *
 * The sweep stamps the commit `sha` it ran against (`git rev-parse HEAD`) so the
 * caller can cache the result keyed by commit. A big repo's first clone + blame
 * can take minutes, so the calling route runs on the Node runtime with a raised
 * `maxDuration`.
 */
import { freestyle } from 'freestyle';

export interface RepoAnalysis {
  /** The commit the sweep ran against (`git rev-parse HEAD`); '' if unresolved. */
  sha: string;
  /** repo-relative path → newline count (the height metric). */
  lineCounts: Record<string, number>;
  /** Number of files counted. */
  fileCount: number;
  /** email → { path → lines that email owns at HEAD (per blame) }. */
  byEmail: Record<string, Record<string, number>>;
  /** path → total blamed lines in that file. */
  totalLines: Record<string, number>;
  /** Sum of every `totalLines` value. */
  totalLinesGlobal: number;
  /** `git shortlog` rows: who committed, how often. */
  contributors: Array<{ name: string; commits: number; email: string }>;
}

export interface LaunchRepoAnalysisOpts {
  owner: string;
  repo: string;
  /**
   * User's GitHub token for private repos — embedded host-side in the clone URL
   * and scrubbed from the VM's git remote right after the clone. Omit for public
   * repos (anonymous clone, nothing sensitive ever enters the VM).
   */
  userToken?: string;
  /**
   * Id of a warm VM from a previous run that still holds this repo's clone.
   * When set, the job runs `git fetch` + reset on it instead of cloning; falls
   * back to a fresh VM if the VM is gone or won't accept the job.
   */
  existingVmId?: string;
  /** Pre-signed PUT URL the VM uploads the success envelope to. */
  analysisUrl: string;
  /** Pre-signed PUT URL the VM uploads a failure record to. */
  errorUrl: string;
}

/** The VM the job was fired on — the caller records `vmId` so the next run can
 *  reuse the warm clone. `reused` is true when an existing VM accepted the job
 *  (no fresh boot). Note this returns as soon as the job is LAUNCHED; the result
 *  itself is published to S3 by the VM, not returned here. */
export interface LaunchRepoAnalysisResult {
  vmId: string;
  reused: boolean;
}

/** The in-VM sweep — pure stdlib Python (git + python3 ship on the VM image).
 *  Combines the line-count and blame-ownership sweeps into one pass so the
 *  expensive blame runs once. Reads a repo path, prints `RepoAnalysis` JSON. */
const SWEEP_PY = String.raw`
import json, os, re, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

repo = sys.argv[1] if len(sys.argv) > 1 else "/repo"

# Binary extensions for the LINE-COUNT pass — copied from the electron-app's
# GitRepositoryService.BINARY_EXTENSIONS so heights match its cache.
LC_BINARY = {
    "png", "jpg", "jpeg", "gif", "bmp", "ico", "webp", "svg",
    "mp3", "mp4", "wav", "avi", "mov", "webm", "ogg",
    "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
    "zip", "tar", "gz", "rar", "7z", "bz2",
    "exe", "dll", "so", "dylib", "bin",
    "ttf", "otf", "woff", "woff2", "eot",
    "db", "sqlite", "sqlite3",
    "lock", "lockb",
}

def git(args):
    return subprocess.run(["git", "-C", repo] + args,
                          capture_output=True, text=True, errors="replace")

files = [f for f in git(["ls-files"]).stdout.split("\n") if f]

# --- Line counts (height metric): newline count of each tracked text file. ---
def lc_is_binary(p):
    return p.split(".")[-1].lower() in LC_BINARY

def count_lines(content):
    if not content:
        return 0
    n = content.count("\n")
    return n if content.endswith("\n") else n + 1

line_counts = {}
for f in files:
    if lc_is_binary(f):
        continue
    full = os.path.join(repo, f)
    try:
        if os.path.getsize(full) > 1024 * 1024:
            continue
        with open(full, "r", encoding="utf-8", errors="replace") as fh:
            content = fh.read()
    except OSError:
        continue
    line_counts[f] = count_lines(content)

# --- Ownership (coverage metric): git blame line attribution per email. ---
# Drop binaries via the empty-tree numstat ("-\t-" rows) before blaming.
EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"
blame_binary = set()
for line in git(["diff", "--numstat", EMPTY_TREE, "HEAD"]).stdout.split("\n"):
    parts = line.split("\t")
    if len(parts) == 3 and parts[0] == "-" and parts[1] == "-":
        blame_binary.add(parts[2])
blame_files = [f for f in files if f not in blame_binary]

def blame(f):
    r = git(["blame", "--line-porcelain", "-w", "HEAD", "--", f])
    if r.returncode != 0:
        return f, None, 0
    counts = {}
    n = 0
    for line in r.stdout.split("\n"):
        if line.startswith("author-mail "):
            a = line.find("<")
            b = line.find(">", a)
            if a != -1 and b != -1:
                email = line[a + 1:b].lower()
                counts[email] = counts.get(email, 0) + 1
                n += 1
    return f, counts, n

by_email = {}
total_lines = {}
total_global = 0
with ThreadPoolExecutor(max_workers=8) as ex:
    for f, counts, n in ex.map(blame, blame_files):
        if not counts or n <= 0:
            continue
        total_lines[f] = n
        total_global += n
        for email, lines in counts.items():
            d = by_email.setdefault(email, {})
            d[f] = d.get(f, 0) + lines

# --- Contributors. ---
contributors = []
for line in git(["shortlog", "-s", "-n", "-e"]).stdout.split("\n"):
    m = re.match(r"^\s*(\d+)\s+(.+?)\s+<([^>]*)>$", line)
    if m:
        contributors.append({
            "name": m.group(2),
            "commits": int(m.group(1)),
            "email": m.group(3).lower(),
        })

# --- HEAD sha: the commit this sweep ran against (cache freshness key). ---
head_sha = git(["rev-parse", "HEAD"]).stdout.strip()

json.dump({
    "sha": head_sha,
    "lineCounts": line_counts,
    "fileCount": len(line_counts),
    "byEmail": by_email,
    "totalLines": total_lines,
    "totalLinesGlobal": total_global,
    "contributors": contributors,
}, sys.stdout)
`;

/** Minimal structural type for the bits of the Freestyle VM we use. */
interface VmHandle {
  exec(cmd: { command: string; timeoutMs?: number }): Promise<{
    stdout?: string | null;
    stderr?: string | null;
    statusCode?: number | null;
  }>;
}

/** The authed (token embedded, when present) and tokenless github.com URLs. */
function repoUrls(owner: string, repo: string, userToken?: string) {
  const auth = userToken ? `x-access-token:${userToken}@` : '';
  return {
    authed: `https://${auth}github.com/${owner}/${repo}.git`,
    tokenless: `https://github.com/${owner}/${repo}.git`,
  };
}

export class RepoAnalysisError extends Error {
  constructor(
    public stage: 'create' | 'launch',
    message: string
  ) {
    super(message);
    this.name = 'RepoAnalysisError';
  }
}

/** Keep-alive loop run during the sweep (see `analysisJobScript`). A tiny HTTPS
 *  ping every 30s so the VM isn't seen as network-idle while blame runs. */
const HEARTBEAT_SH = String.raw`#!/bin/bash
while :; do
  python3 -c 'import urllib.request; urllib.request.urlopen("https://api.github.com/zen", timeout=5)' >/dev/null 2>&1 || true
  sleep 30
done
`;

/**
 * In-VM publisher (pure stdlib Python). Reads the sweep's `RepoAnalysis` JSON,
 * wraps it in the `RepoAnalysisCache` envelope the cache reader expects, and
 * PUTs it to the pre-signed analysis URL — or PUTs a `RepoAnalysisErrorRecord`
 * to the error URL on failure. `owner`/`repo` are injected as JSON string
 * literals (valid, safe Python literals).
 */
function publisherPy(owner: string, repo: string): string {
  return String.raw`
import sys, os, json, time, urllib.request, datetime

def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

# Start time is stamped by job.sh and exported; report end-to-end duration so
# runs are tracked without reconstructing it from S3 object timestamps.
STARTED_AT = os.environ.get("STARTED_AT") or None
_STARTED_EPOCH = os.environ.get("STARTED_EPOCH")

def duration_ms():
    if not _STARTED_EPOCH:
        return None
    try:
        return int((time.time() - float(_STARTED_EPOCH)) * 1000)
    except (TypeError, ValueError):
        return None

def put(url, body):
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="PUT")
    urllib.request.urlopen(req)

OWNER = ${JSON.stringify(owner)}
REPO = ${JSON.stringify(repo)}
mode = sys.argv[1]
url = sys.argv[2]

if mode == "success":
    analysis = json.load(open(sys.argv[3]))
    put(url, {
        "owner": OWNER,
        "repo": REPO,
        "sha": analysis.get("sha") or None,
        "generatedAt": now(),
        "generatedBy": "web-ade",
        "startedAt": STARTED_AT,
        "durationMs": duration_ms(),
        "analysis": analysis,
    })
else:
    put(url, {
        "owner": OWNER,
        "repo": REPO,
        "stage": sys.argv[3],
        "message": sys.argv[4][:500],
        "failedAt": now(),
        "startedAt": STARTED_AT,
        "durationMs": duration_ms(),
    })
`;
}

/**
 * The detached job the VM runs to completion on its own. Clones (or, on a warm
 * VM, fetch + resets) `/repo`, runs the sweep, and publishes the result envelope
 * to S3 via the pre-signed URL — or an error record on any failure. A clone
 * failure's stderr is NOT surfaced (it can echo the token-bearing remote); other
 * stages report a generic per-stage message.
 */
function analysisJobScript(
  owner: string,
  repo: string,
  userToken?: string
): string {
  const { authed, tokenless } = repoUrls(owner, repo, userToken);
  return String.raw`#!/bin/bash
ANALYSIS_URL="$1"
ERROR_URL="$2"
STAGE="setup"
# Stamp when THIS job's work begins so publish.py can report end-to-end
# duration (and how long a failure took). Exported so both publish modes see it.
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
STARTED_EPOCH="$(date +%s)"
export STARTED_AT STARTED_EPOCH
fail() {
  python3 /tmp/publish.py error "$ERROR_URL" "$STAGE" "$1" || true
  exit 1
}

# Single-flight: a re-trigger on this WARM VM must not start a second concurrent
# sweep (two sweeps compete for CPU and each runs slower). mkdir is atomic; a
# lock left by a hard-killed prior run (>30m old) is stolen. If a sweep is
# already running, exit 0 — it will publish the result this caller is waiting on.
if ! mkdir /tmp/sweep.lock 2>/dev/null; then
  if [ -n "$(find /tmp/sweep.lock -maxdepth 0 -mmin +30 2>/dev/null)" ]; then
    rmdir /tmp/sweep.lock 2>/dev/null
    mkdir /tmp/sweep.lock 2>/dev/null || { echo "sweep already running"; exit 0; }
  else
    echo "sweep already running; exiting"
    exit 0
  fi
fi

# The blame phase is CPU-bound but NETWORK-SILENT for minutes, and Freestyle
# measures idle by network activity — so without traffic the VM would idle-
# suspend mid-sweep. A tiny-ping loop keeps it awake. Run it in its own process
# group (setsid) so the WHOLE group can be killed on exit — killing just the
# loop's pid would orphan its in-flight sleep/python and delay the post-job
# suspend.
if command -v setsid >/dev/null 2>&1; then
  setsid bash /tmp/heartbeat.sh </dev/null >/dev/null 2>&1 &
else
  bash /tmp/heartbeat.sh </dev/null >/dev/null 2>&1 &
fi
HEARTBEAT_PID=$!
trap 'kill -- -"$HEARTBEAT_PID" 2>/dev/null; kill "$HEARTBEAT_PID" 2>/dev/null; rmdir /tmp/sweep.lock 2>/dev/null' EXIT

STAGE="clone"
  if [ -d /repo/.git ]; then
    if ! ( cd /repo && git fetch ${authed} && git reset --hard FETCH_HEAD ); then
      rm -rf /repo
      git clone --single-branch ${authed} /repo || fail "git clone failed"
      ( cd /repo && git remote set-url origin ${tokenless} ) || true
    fi
  else
    git clone --single-branch ${authed} /repo || fail "git clone failed"
    ( cd /repo && git remote set-url origin ${tokenless} ) || true
  fi

STAGE="sweep"
python3 /tmp/sweep.py /repo > /tmp/analysis.json || fail "sweep failed"

STAGE="publish"
python3 /tmp/publish.py success "$ANALYSIS_URL" /tmp/analysis.json || fail "publish failed"
`;
}

/** Write the three scripts into the VM (base64 to dodge all quoting) and launch
 *  the job DETACHED (`nohup … &`), so this exec returns in ~seconds while the
 *  multi-minute clone+sweep keeps running and publishes to S3 on its own. */
function launchCommand(
  owner: string,
  repo: string,
  userToken: string | undefined,
  analysisUrl: string,
  errorUrl: string
): string {
  const sweepB64 = Buffer.from(SWEEP_PY, 'utf8').toString('base64');
  const pubB64 = Buffer.from(publisherPy(owner, repo), 'utf8').toString('base64');
  const hbB64 = Buffer.from(HEARTBEAT_SH, 'utf8').toString('base64');
  const jobB64 = Buffer.from(
    analysisJobScript(owner, repo, userToken),
    'utf8'
  ).toString('base64');
  // Presigned URLs are single-quoted; they never contain single quotes.
  return [
    'set -e',
    `printf %s '${sweepB64}' | base64 -d > /tmp/sweep.py`,
    `printf %s '${pubB64}' | base64 -d > /tmp/publish.py`,
    `printf %s '${hbB64}' | base64 -d > /tmp/heartbeat.sh`,
    `printf %s '${jobB64}' | base64 -d > /tmp/job.sh`,
    `nohup bash /tmp/job.sh '${analysisUrl}' '${errorUrl}' >/tmp/job.out 2>&1 </dev/null &`,
    'echo launched',
  ].join('\n');
}

/** Generous cap for the LAUNCH exec only — it just writes the scripts and spawns
 *  the background job, so it returns in seconds; the long work is detached. */
const LAUNCH_TIMEOUT_MS = 30_000;

/**
 * Fire the analysis job on a VM and return as soon as it's LAUNCHED. The VM runs
 * the clone+sweep to completion on its own and publishes straight to S3 via the
 * pre-signed URLs — so nothing here is held open for the multi-minute sweep, and
 * the platform request timeout never applies. The caller records the returned
 * `vmId` so the next run reuses the warm clone.
 */
export async function launchRepoAnalysis(
  opts: LaunchRepoAnalysisOpts
): Promise<LaunchRepoAnalysisResult> {
  const command = launchCommand(
    opts.owner,
    opts.repo,
    opts.userToken,
    opts.analysisUrl,
    opts.errorUrl
  );

  // 1) Warm path: fire the job on the VM that already holds this repo's clone.
  if (opts.existingVmId) {
    try {
      const vm = freestyle.vms.ref({ vmId: opts.existingVmId }) as VmHandle;
      const r = await vm.exec({ command, timeoutMs: LAUNCH_TIMEOUT_MS });
      if ((r.statusCode ?? 1) === 0) {
        return { vmId: opts.existingVmId, reused: true };
      }
      // Reachable but rejected the job — fall through to a fresh VM.
    } catch {
      // VM evicted / unreachable — fall through to a fresh VM.
    }
  }

  // 2) Cold path: boot a sticky (cache-persistence) VM, kept warm for next run.
  let created: { vm: VmHandle; vmId: string };
  try {
    created = (await freestyle.vms.create({
      name: `repo-analysis-${opts.owner}-${opts.repo}`,
      persistence: { type: 'sticky', priority: 5 },
      // Suspends ~10m after the job goes idle (the in-job heartbeat keeps it
      // awake DURING the sweep; this only governs post-completion suspend, and
      // backstops a heartbeat outage). Sticky persistence keeps the warm clone.
      idleTimeoutSeconds: 600,
    })) as { vm: VmHandle; vmId: string };
  } catch (err) {
    throw new RepoAnalysisError(
      'create',
      `Freestyle VM error: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  try {
    const r = await created.vm.exec({ command, timeoutMs: LAUNCH_TIMEOUT_MS });
    if ((r.statusCode ?? 1) !== 0) {
      throw new RepoAnalysisError(
        'launch',
        `job launch exited ${r.statusCode}: ${(r.stderr ?? '').trim().slice(0, 200)}`
      );
    }
    return { vmId: created.vmId, reused: false };
  } catch (err) {
    // Couldn't even launch — this VM holds nothing worth keeping warm.
    await freestyle.vms.delete({ vmId: created.vmId }).catch(() => {});
    throw err;
  }
}
