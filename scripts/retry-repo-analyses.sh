#!/bin/bash
set -euo pipefail

BASE="${1:-https://app.principal-ade.com}"

echo "Fetching stalled + failed repos from $BASE..."
DATA=$(curl -sf "$BASE/api/repo-analysis/status")

# Extract owners/repos from stalled and failed buckets
echo "$DATA" | node -e "
const d = [];
process.stdin.on('data', c => d.push(c));
process.stdin.on('end', () => {
  const json = JSON.parse(d.join(''));
  const repos = [
    ...json.stalled.map(r => ({ owner: r.owner, repo: r.repo, reason: 'stalled' })),
    ...json.failed.map(r => ({ owner: r.owner, repo: r.repo, reason: r.error?.stage || 'failed' })),
  ];
  repos.forEach(r => console.log(\`\${r.owner}/\${r.repo}\`));
});
"

echo ""
echo "Triggering re-analysis..."
echo "$DATA" | node -e "
const d = [];
process.stdin.on('data', c => d.push(c));
process.stdin.on('end', async () => {
  const json = JSON.parse(d.join(''));
  const repos = [
    ...json.stalled.map(r => ({ owner: r.owner, repo: r.repo })),
    ...json.failed.map(r => ({ owner: r.owner, repo: r.repo })),
  ];
  for (const r of repos) {
    const url = '$BASE/api/repo-analysis/' + encodeURIComponent(r.owner) + '/' + encodeURIComponent(r.repo);
    try {
      const res = await fetch(url, { method: 'POST' });
      const body = await res.text();
      console.log(r.owner + '/' + r.repo + ' → ' + res.status + ' ' + body.slice(0, 120));
    } catch (e) {
      console.error(r.owner + '/' + r.repo + ' → ERROR ' + e.message);
    }
  }
});
"
