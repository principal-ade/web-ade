#!/usr/bin/env bash
set -uo pipefail

# Analyze owner/repo page traffic from Amplify access logs.
# Pulls logs in 46h chunks and aggregates.
#
# IMPORTANT: Amplify access logs are only retained for ~48 hours.
# Chunks older than that will be skipped with a clear message.
#
# Usage:
#   ./scripts/analyze-repo-traffic.sh              # last 7 days
#   ./scripts/analyze-repo-traffic.sh 14            # last 14 days
#   ./scripts/analyze-repo-traffic.sh 3 /tmp/out    # last 3 days, output dir

DAYS="${1:-7}"
OUT_DIR="${2:-/tmp/repo-traffic}"
APP_ID="d1qe4erof8hwdq"
DOMAIN="principal-ade.com"
CHUNK_HOURS=46

mkdir -p "$OUT_DIR"

echo "==> Pulling $DAYS days of access logs in ${CHUNK_HOURS}h chunks..."

# Build list of chunks covering the requested range
# Subtract 1h from "now" to avoid logs that haven't landed yet
NOW_EPOCH=$(($(date +%s) - 3600))
TOTAL_SECONDS=$((DAYS * 86400))
CHUNK_SECONDS=$((CHUNK_HOURS * 3600))
CHUNKS=$(( (TOTAL_SECONDS + CHUNK_SECONDS - 1) / CHUNK_SECONDS ))

COMBINED="$OUT_DIR/combined.csv"
> "$COMBINED"

for (( i=0; i<CHUNKS; i++ )); do
  CHUNK_START=$((NOW_EPOCH - TOTAL_SECONDS + (i * CHUNK_SECONDS)))
  CHUNK_END=$((CHUNK_START + CHUNK_SECONDS))
  if (( CHUNK_END > NOW_EPOCH )); then
    CHUNK_END=$NOW_EPOCH
  fi

  START_ISO=$(date -u -r "$CHUNK_START" +%Y-%m-%dT%H:%M:%S)
  END_ISO=$(date -u -r "$CHUNK_END" +%Y-%m-%dT%H:%M:%S)
  CHUNK_FILE="$OUT_DIR/chunk-${i}.csv"

  echo "  Chunk $((i+1))/$CHUNKS: $START_ISO -> $END_ISO"

  # Generate logs URL
  LOG_URL=$(aws amplify generate-access-logs \
    --app-id "$APP_ID" \
    --domain-name "$DOMAIN" \
    --start-time "$START_ISO" \
    --end-time "$END_ISO" \
    --output json 2>/dev/null \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['logUrl'])" 2>/dev/null) || LOG_URL=""

  if [ -z "$LOG_URL" ]; then
    echo "    SKIP (logs not available for this range)"
    continue
  fi

  # Download
  HTTP_CODE=$(curl -s -o "$CHUNK_FILE" -w '%{http_code}' "$LOG_URL")
  if [ "$HTTP_CODE" = "200" ]; then
    LINES=$(wc -l < "$CHUNK_FILE" | tr -d ' ')
    echo "    OK ($LINES rows)"
  else
    echo "    FAILED (HTTP $HTTP_CODE)"
    rm -f "$CHUNK_FILE"
  fi
done

# Combine all chunks (skip header on all but first)
FIRST=1
for f in "$OUT_DIR"/chunk-*.csv; do
  [ -f "$f" ] || continue
  if [ "$FIRST" -eq 1 ]; then
    cat "$f" >> "$COMBINED"
    FIRST=0
  else
    tail -n +2 "$f" >> "$COMBINED"
  fi
done

TOTAL_ROWS=$(wc -l < "$COMBINED" | tr -d ' ')
echo ""
echo "==> Combined: $TOTAL_ROWS rows"
echo "==> Analyzing..."

python3 - "$COMBINED" << 'PYEOF'
import csv, re, sys
from collections import Counter, defaultdict

COMBINED = sys.argv[1]

with open(COMBINED, 'r') as f:
    rows = list(csv.DictReader(f))

RESERVED = {'api', '_next', 'trail', 'topic', 'topics', 'tour', 'card', 'cards',
            'explore', 'feed', 'legacy', 'home', 'status', 'collections',
            'community-repos', 'auth'}

def extract_owner_repo(stem):
    m = re.match(r'^/([^/]+)/([^/]+)/?$', stem)
    if m and m.group(1).lower() not in RESERVED:
        return f"{m.group(1)}/{m.group(2)}"
    m2 = re.match(r'^/api/(?:repos|github/repo|repo-analysis|trails|tours|file-city-data|card)/(?!by-id/|inbox/|unread-count)([^/]+)/([^/]+)', stem)
    if m2:
        return f"{m2.group(1)}/{m2.group(2)}"
    return None

repo_all = defaultdict(lambda: {'pages': 0, 'data': 0, 'dates': Counter()})

for row in rows:
    stem = row.get('cs-uri-stem', '')
    date = row.get('date', '')

    owner_repo = extract_owner_repo(stem)
    if not owner_repo:
        continue

    is_page = not stem.startswith('/api/')
    entry = repo_all[owner_repo]
    if is_page:
        entry['pages'] += 1
    else:
        entry['data'] += 1
    entry['dates'][date] += 1

total_page = sum(v['pages'] for v in repo_all.values())
total_data = sum(v['data'] for v in repo_all.values())
total_all = len(rows)

dates = sorted(set(d for v in repo_all.values() for d in v['dates']))
print(f"\n{'='*60}")
print(f"  REPO TRAFFIC REPORT")
print(f"  Period: {dates[0]} to {dates[-1]}" if dates else "  Period: N/A")
print(f"{'='*60}")
print(f"  Total log entries:     {total_all:>8}")
print(f"  Repos with activity:   {len(repo_all):>8}")
print(f"  Page loads:            {total_page:>8}")
print(f"  Data API calls:        {total_data:>8}")
if total_page:
    print(f"  Avg data calls/page:   {total_data/total_page:>8.1f}")

print(f"\n{'─'*40}")
print(f"  DAILY REQUESTS")
print(f"{'─'*40}")
day_totals = Counter()
for v in repo_all.values():
    day_totals.update(v['dates'])
for date in sorted(day_totals):
    print(f"  {date}:  {day_totals[date]:>5}")

print(f"\n{'─'*40}")
print(f"  TOP 30 REPOS BY TOTAL ACTIVITY")
print(f"{'─'*40}")
print(f"  {'Total':>6}  {'Pages':>5}  {'Data':>5}  Repo")
print(f"  {'─'*6}  {'─'*5}  {'─'*5}  {'─'*30}")
for repo, v in sorted(repo_all.items(), key=lambda x: -(x[1]['pages'] + x[1]['data']))[:30]:
    total = v['pages'] + v['data']
    print(f"  {total:>6}  {v['pages']:>5}  {v['data']:>5}  {repo}")

status = Counter(row.get('sc-status', '') for row in rows)
print(f"\n{'─'*40}")
print(f"  STATUS CODES")
print(f"{'─'*40}")
for s, c in status.most_common():
    print(f"  {s}: {c}")
print()
PYEOF

echo "==> Done. Raw data in $COMBINED"
