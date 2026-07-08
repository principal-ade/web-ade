#!/bin/bash
set -euo pipefail

usage() {
  echo "Usage: $0 <owner> <repo> [options]"
  echo "Options:"
  echo "  --push    Upload the result to S3 (requires AWS credentials)"
  echo "  --dir <p> Clone into <p> instead of /tmp (clone can be GBs)"
  exit 1
}

if [ $# -lt 2 ]; then usage; fi

OWNER="$1"
REPO="$2"
shift 2

PUSH=""
CLEANUP=""
WORKDIR=""
while [ $# -gt 0 ]; do
  case "$1" in
    --push) PUSH="--push"; shift ;;
    --cleanup) CLEANUP="--cleanup"; shift ;;
    --dir) WORKDIR="$2"; shift 2 ;;
    *) usage ;;
  esac
done

: "${WORKDIR:=${TMPDIR:-/tmp}/repo-sweep/${OWNER}/${REPO}}"

PARENT="$(dirname "$WORKDIR")"
mkdir -p "$PARENT"
FREE_KB=$(df -k "$PARENT" 2>/dev/null | awk 'NR==2{print $4}') || true
if [ -n "${FREE_KB:-}" ] && [ "$FREE_KB" -lt 1048576 ] 2>/dev/null; then
  echo "Warning: only $(( FREE_KB / 1024 ))MB free on $PARENT"
  echo "Use --dir <path> to clone somewhere with more space"
fi

mkdir -p "$WORKDIR"
cd "$WORKDIR"

CLONE_DIR="$WORKDIR/repo"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
STARTED_EPOCH="$(date +%s)"

echo "=== repo-sweep: $OWNER/$REPO ==="
echo "workdir: $WORKDIR"
echo ""

# ---- Clone ----
if [ -d "$CLONE_DIR/.git" ]; then
  echo "[clone] Warm — git fetch"
  START=$(date +%s)
  (cd "$CLONE_DIR" && git fetch --depth=50 origin 2>&1 | tail -3 && git reset --hard FETCH_HEAD) || true
  END=$(date +%s)
  echo "  took: $((END - START))s"
else
  echo "[clone] Cold — git clone --single-branch"
  START=$(date +%s)
  git clone --single-branch "https://github.com/${OWNER}/${REPO}.git" "$CLONE_DIR"
  END=$(date +%s)
  echo "  took: $((END - START))s"
fi

cd "$CLONE_DIR"
HEAD_SHA=$(git rev-parse HEAD)
echo "  HEAD: $HEAD_SHA"
FILE_COUNT=$(git ls-files | wc -l | tr -d ' ')
echo "  tracked files: $FILE_COUNT"
echo ""

# ---- Line counts ----
echo "[line-counts] scanning files..."
START=$(date +%s%)

# Extract the SWEEP_PY logic for timing — we run the actual Python sweep
# but with timing wrappers. For now, run the full sweep and add timing.

END=$(date +%s)

# ---- Full sweep with timing ----
echo "[sweep] Running full sweep (line counts + blame + contributors)..."
START=$(date +%s)

# Write sweep.py with timing instrumentation
cat > "$WORKDIR/sweep.py" << 'PYEOF'
import json, os, re, subprocess, sys, time

repo = sys.argv[1] if len(sys.argv) > 1 else "/repo"
EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"
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
    return subprocess.run(["git", "-C", repo] + args, capture_output=True, text=True, errors="replace")

def lc_is_binary(p):
    return p.split(".")[-1].lower() in LC_BINARY

def count_lines(content):
    if not content: return 0
    n = content.count("\n")
    return n if content.endswith("\n") else n + 1

timings = {}

t0 = time.time()
files = [f for f in git(["ls-files"]).stdout.split("\n") if f]
t1 = time.time()
timings["ls-files"] = round(t1 - t0, 1)
print(json.dumps({"phase": "ls-files", "files": len(files), "seconds": timings["ls-files"]}))

line_counts = {}
counted = 0
skipped_binary = 0
skipped_size = 0
t0 = time.time()
for f in files:
    if lc_is_binary(f):
        skipped_binary += 1
        continue
    full = os.path.join(repo, f)
    try:
        if os.path.getsize(full) > 1024 * 1024:
            skipped_size += 1
            continue
        with open(full, "r", encoding="utf-8", errors="replace") as fh:
            content = fh.read()
    except OSError:
        continue
    line_counts[f] = count_lines(content)
    counted += 1
t1 = time.time()
timings["line-counts"] = round(t1 - t0, 1)
print(json.dumps({"phase": "line-counts", "counted": counted, "skipped_binary": skipped_binary, "skipped_size": skipped_size, "seconds": timings["line-counts"]}))

blame_binary = set()
t0 = time.time()
for line in git(["diff", "--numstat", EMPTY_TREE, "HEAD"]).stdout.split("\n"):
    parts = line.split("\t")
    if len(parts) == 3 and parts[0] == "-" and parts[1] == "-":
        blame_binary.add(parts[2])
t1 = time.time()
timings["blame-diff-numstat"] = round(t1 - t0, 1)
blame_files = [f for f in files if f not in blame_binary]
print(json.dumps({"phase": "blame-diff-numstat", "non_text": len(blame_binary), "to_blame": len(blame_files), "seconds": timings["blame-diff-numstat"]}))

from concurrent.futures import ThreadPoolExecutor, as_completed

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

# Blame with per-file timing
timings["blame"] = {"total": 0, "files": 0, "total_lines": 0, "slowest": {"file": "", "seconds": 0}}
blame_start = time.time()
by_email = {}
total_lines = {}
total_global = 0
with ThreadPoolExecutor(max_workers=8) as ex:
    fut = {ex.submit(blame, f): f for f in blame_files}
    for f in as_completed(fut):
        fn = fut[f]
        try:
            fname, counts, n = f.result()
        except Exception as e:
            print(json.dumps({"phase": "blame-error", "file": fn, "error": str(e)}))
            continue
        if not counts or n <= 0:
            continue
        total_lines[fname] = n
        total_global += n
        for email, lines in counts.items():
            d = by_email.setdefault(email, {})
            d[fname] = d.get(fname, 0) + lines
blame_end = time.time()
timings["blame"]["total"] = round(blame_end - blame_start, 1)
print(json.dumps({"phase": "blame-complete", "total_seconds": timings["blame"]["total"], "total_lines": total_global}))

t0 = time.time()
contributors = []
for line in git(["shortlog", "-s", "-n", "-e"]).stdout.split("\n"):
    m = re.match(r"^\s*(\d+)\s+(.+?)\s+<([^>]*)>$", line)
    if m:
        contributors.append({"name": m.group(2), "commits": int(m.group(1)), "email": m.group(3).lower()})
t1 = time.time()
timings["shortlog"] = round(t1 - t0, 1)
print(json.dumps({"phase": "shortlog", "contributors": len(contributors), "seconds": timings["shortlog"]}))

head_sha = git(["rev-parse", "HEAD"]).stdout.strip()

result = {
    "sha": head_sha,
    "lineCounts": line_counts,
    "fileCount": len(line_counts),
    "byEmail": by_email,
    "totalLines": total_lines,
    "totalLinesGlobal": total_global,
    "contributors": contributors,
}
# Write result and timings to separate files
with open(sys.argv[2], "w") as f:
    json.dump(result, f)
with open(sys.argv[3], "w") as f:
    json.dump(timings, f, indent=2)

print(json.dumps({"phase": "done", "timings": timings}))
PYEOF

python3 "$WORKDIR/sweep.py" "$CLONE_DIR" "$WORKDIR/result.json" "$WORKDIR/timings.json"

SWEEP_END=$(date +%s)
echo "  total sweep: $((SWEEP_END - START))s"
echo ""

# Show timings
echo "=== TIMINGS ==="
python3 -c "
import json
t = json.load(open('$WORKDIR/timings.json'))
for k, v in t.items():
    if isinstance(v, dict) and 'seconds' in v:
        print(f'  {k}: {v[\"seconds\"]}s')
    elif isinstance(v, (int, float)):
        print(f'  {k}: {v}s')
    elif isinstance(v, dict):
        print(f'  {k}: {json.dumps(v)}')
" 2>/dev/null || python3 -m json.tool "$WORKDIR/timings.json"

echo ""
echo "=== RESULT STATS ==="
python3 -c "
import json
r = json.load(open('$WORKDIR/result.json'))
print(f'  sha: {r[\"sha\"]}')
print(f'  files with line counts: {r[\"fileCount\"]}')
print(f'  total lines blamed: {r[\"totalLinesGlobal\"]}')
print(f'  unique emails (blame): {len(r[\"byEmail\"])}')
print(f'  contributors (shortlog): {len(r[\"contributors\"])}')
"

# ---- Push to S3 ----
if [ "$PUSH" = "--push" ]; then
  echo ""
  echo "[push] Uploading result to S3..."
  GENERATED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  DURATION_MS=$(( ( $(date +%s) - STARTED_EPOCH ) * 1000 ))

  python3 -c "
import json, os
bucket = os.environ.get('TTS_S3_BUCKET', 'repo-tour-audio')
owner = '$OWNER'
repo = '$REPO'
key = f'repo-analysis/{owner.lower()}/{repo.lower()}.json'
result = json.load(open('$WORKDIR/result.json'))
envelope = {
    'owner': owner,
    'repo': repo,
    'sha': result.get('sha'),
    'generatedAt': '$GENERATED_AT',
    'generatedBy': 'local-harness',
    'startedAt': '$STARTED_AT',
    'durationMs': $DURATION_MS,
    'analysis': result,
}
import subprocess
subprocess.run([
    'aws', 's3', 'cp', '--cache-control', 'no-cache', '--content-type', 'application/json',
    '-', f's3://{bucket}/{key}'
], input=json.dumps(envelope), text=True, check=True)
print(f'Uploaded to s3://{bucket}/{key}')
" 2>&1
  echo "[push] Done"
fi

echo ""
echo "=== DONE ==="
echo "Result: $WORKDIR/result.json"
echo "Timings: $WORKDIR/timings.json"
echo "Clone: $CLONE_DIR"

if [ -n "$CLEANUP" ]; then
  echo ""
  echo "[cleanup] Removing $CLONE_DIR..."
  rm -rf "$CLONE_DIR"
  echo "[cleanup] Done"
fi
