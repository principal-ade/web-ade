/**
 * Repo analysis on a Freestyle VM.
 *
 * Boots a throwaway Freestyle VM, clones a GitHub repo onto it DIRECTLY from
 * github.com (not via Freestyle Git import — that import path returns
 * INTERNAL_ERROR on some repos; a direct VM clone works on every repo tried,
 * including the import-failing ones), runs ONE in-VM git sweep, and reads the
 * aggregated result back. The VM is always torn down.
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
 * MVP scope: returns the map inline. No S3 cache and no sha-keyed storage yet
 * (a later optimization). A big repo's full clone + blame can take minutes, so
 * the calling route must run on the Node runtime with a raised `maxDuration`.
 */
import { freestyle } from 'freestyle';

export interface RepoAnalysis {
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

export interface RunRepoAnalysisOpts {
  owner: string;
  repo: string;
  /**
   * User's GitHub token for private repos — embedded host-side in the clone URL
   * and scrubbed from the VM's git remote right after the clone. Omit for public
   * repos (anonymous clone, nothing sensitive ever enters the VM).
   */
  userToken?: string;
  /** Total seconds budget for the in-VM clone + sweep. Default 240. */
  timeoutSecs?: number;
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
for line in git(["shortlog", "-s", "-n", "-e", "--all"]).stdout.split("\n"):
    m = re.match(r"^\s*(\d+)\s+(.+?)\s+<([^>]*)>$", line)
    if m:
        contributors.append({
            "name": m.group(2),
            "commits": int(m.group(1)),
            "email": m.group(3).lower(),
        })

json.dump({
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

/** Build the github.com clone command. Token (when present) is embedded
 *  host-side and scrubbed from the remote right after the clone. Full history —
 *  blame needs it. */
function cloneCommand(owner: string, repo: string, userToken?: string): string {
  const auth = userToken ? `x-access-token:${userToken}@` : '';
  const url = `https://${auth}github.com/${owner}/${repo}.git`;
  const tokenless = `https://github.com/${owner}/${repo}.git`;
  return (
    `rm -rf /repo && git clone ${url} /repo && ` +
    `cd /repo && git remote set-url origin ${tokenless}`
  );
}

/** Write the sweep into the VM (base64 to dodge all quoting) and run it. */
function sweepCommand(): string {
  const b64 = Buffer.from(SWEEP_PY, 'utf8').toString('base64');
  return `printf %s '${b64}' | base64 -d > /tmp/sweep.py && python3 /tmp/sweep.py /repo`;
}

export class RepoAnalysisError extends Error {
  constructor(
    public stage: 'create' | 'clone' | 'sweep' | 'parse',
    message: string
  ) {
    super(message);
    this.name = 'RepoAnalysisError';
  }
}

export async function runRepoAnalysis(
  opts: RunRepoAnalysisOpts
): Promise<RepoAnalysis> {
  const timeoutMs = (opts.timeoutSecs ?? 240) * 1000;

  let vmId: string | undefined;
  let vm: VmHandle | undefined;
  try {
    const created = (await freestyle.vms.create({
      name: `repo-analysis-${opts.owner}-${opts.repo}`,
      persistence: { type: 'ephemeral' },
      idleTimeoutSeconds: 120,
    })) as { vm: VmHandle; vmId: string };
    vm = created.vm;
    vmId = created.vmId;

    const clone = await vm.exec({
      command: cloneCommand(opts.owner, opts.repo, opts.userToken),
      timeoutMs,
    });
    if ((clone.statusCode ?? 1) !== 0) {
      throw new RepoAnalysisError(
        'clone',
        `git clone exited ${clone.statusCode}: ${(clone.stderr ?? '').trim().slice(0, 200)}`
      );
    }

    const sweep = await vm.exec({ command: sweepCommand(), timeoutMs });
    if ((sweep.statusCode ?? 1) !== 0) {
      throw new RepoAnalysisError(
        'sweep',
        `sweep exited ${sweep.statusCode}: ${(sweep.stderr ?? '').trim().slice(0, 200)}`
      );
    }

    try {
      return JSON.parse(sweep.stdout ?? '') as RepoAnalysis;
    } catch {
      throw new RepoAnalysisError(
        'parse',
        `unparseable sweep output: ${(sweep.stdout ?? '').trim().slice(0, 200)}`
      );
    }
  } catch (err) {
    if (err instanceof RepoAnalysisError) throw err;
    throw new RepoAnalysisError(
      'create',
      `Freestyle VM error: ${err instanceof Error ? err.message : String(err)}`
    );
  } finally {
    if (vmId) {
      await freestyle.vms.delete({ vmId }).catch(() => {});
    }
  }
}
