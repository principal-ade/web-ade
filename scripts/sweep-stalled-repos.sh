#!/bin/bash
set -euo pipefail

BASE="${1:-https://app.principal-ade.com}"
DIR="${2:-${TMPDIR:-/tmp}/repo-sweep-batch}"
SUMMARY="$DIR/summary.json"

echo "Fetching stalled repos from $BASE..."
DATA=$(curl -sf "$BASE/api/repo-analysis/status")
REPOS=$(echo "$DATA" | node -e "
const d=[];
process.stdin.on('data',c=>d.push(c));
process.stdin.on('end',()=>{
  const j=JSON.parse(Buffer.concat(d).toString());
  const seen = new Set();
  [...j.stalled, ...j.failed].forEach(r => {
    const key = r.owner+'/'+r.repo;
    if (!seen.has(key)) { seen.add(key); console.log(key); }
  });
  j.inProgress.forEach(r => {
    const ageMs = Date.now() - new Date(r.launchedAt).getTime();
    if (ageMs > 10 * 60 * 1000) {
      const key = r.owner+'/'+r.repo;
      if (!seen.has(key)) { seen.add(key); console.log(key); }
    }
  });
});
")

if [ -z "$REPOS" ]; then
  echo "Nothing to sweep."
  exit 0
fi

echo "Repos to process ($(echo "$REPOS" | wc -l | tr -d ' ')):"
echo "$REPOS" | while read -r line; do echo "  $line"; done

echo ""
echo "Starting sequential sweeps in $DIR..."
echo ""

mkdir -p "$DIR"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Write repo list to a file so we can read it without a pipe (no subshell)
REPO_FILE="$DIR/repos.txt"
echo "$REPOS" > "$REPO_FILE"
TOTAL=$(wc -l < "$REPO_FILE" | tr -d ' ')
IDX=0

# Init summary
echo '[]' > "$SUMMARY"

while read -r line <&3; do
  OWNER="${line%%/*}"
  REPO="${line##*/}"
  IDX=$((IDX + 1))

  echo "========================================"
  echo "[$IDX/$TOTAL] $OWNER/$REPO"
  echo "========================================"

  REPO_DIR="$DIR/$OWNER/$REPO"
  TIMINGS_FILE="$REPO_DIR/timings.json"
  RESULT_FILE="$REPO_DIR/result.json"

  set +e
  "$SCRIPT_DIR/local-repo-sweep.sh" "$OWNER" "$REPO" --dir "$REPO_DIR" --push --cleanup
  EXIT_CODE=$?
  set -e
  if [ "$EXIT_CODE" -ne 0 ]; then
    echo "[$IDX/$TOTAL] $OWNER/$REPO FAILED (exit $EXIT_CODE, continuing)"
  fi

  # Append to summary
  if [ -f "$TIMINGS_FILE" ]; then
    node -e "
    const fs = require('fs');
    const t = JSON.parse(fs.readFileSync('$TIMINGS_FILE', 'utf8'));
    const r = fs.existsSync('$RESULT_FILE') ? JSON.parse(fs.readFileSync('$RESULT_FILE', 'utf8')) : {};
    const summary = JSON.parse(fs.readFileSync('$SUMMARY', 'utf8'));
    summary.push({
      repo: '$OWNER/$REPO',
      timings: t,
      fileCount: r.fileCount || null,
      totalLines: r.totalLinesGlobal || null,
      numContributors: r.contributors ? r.contributors.length : null,
    });
    fs.writeFileSync('$SUMMARY', JSON.stringify(summary, null, 2));
    "
  fi

  echo ""
done 3< "$REPO_FILE"

echo "=== BATCH DONE ==="
echo ""
echo "=== SUMMARY ==="
node -e "
const s = JSON.parse(require('fs').readFileSync('$SUMMARY', 'utf8'));
console.log('repo | ls-files (s) | line-counts (s) | blame (s) | shortlog (s) | files | lines');
console.log('-' .repeat(100));
s.forEach(e => {
  const t = e.timings || {};
  console.log(
    e.repo.padEnd(35) +
    '| ' + String(t['ls-files'] || '-').padStart(10) +
    ' | ' + String(t['line-counts'] || '-').padStart(12) +
    ' | ' + String(t['blame']?.total || t['blame-complete'] || '-').padStart(8) +
    ' | ' + String(t['shortlog'] || '-').padStart(8) +
    ' | ' + String(e.fileCount || '-').padStart(6) +
    ' | ' + String(e.totalLines || '-').padStart(7)
  );
});
"
echo ""
echo "Full summary saved to: $SUMMARY"
