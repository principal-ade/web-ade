/**
 * S3b — bake the authoring base snapshot.
 *
 * Boots a fresh Freestyle VM (node + git already in the stock image), installs
 * opencode, snapshots it, and prints the new snapshot id. Put that id in
 * `.env.local` as `AUTHORING_BASE_SNAPSHOT` (snapshots can go stale across
 * sessions — re-run this when `create({snapshotId})` starts returning
 * INTERNAL_ERROR).
 *
 *   node src/lib/authoring/env/bake-base-snapshot.mjs
 */
import { readFileSync } from 'node:fs';

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && process.env[m[1]] === undefined) {
    process.env[m[1]] = (m[2] || '').replace(/^["']|["']$/g, '');
  }
}

const { freestyle } = await import('freestyle');

console.log('creating builder VM…');
const created = await freestyle.vms.create({ name: 'authoring-base' });
const vm = created.vm;
const vmId = created.vmId;
console.log('builder vmId:', vmId);

const sh = async (cmd) => {
  const r = await vm.exec(cmd);
  console.log(`$ ${cmd.slice(0, 70)}…  → exit ${r.statusCode}`);
  if (r.statusCode !== 0) {
    throw new Error(`exec failed (${r.statusCode}): ${(r.stderr || '').slice(0, 300)}`);
  }
  return r;
};

try {
  await sh('apt-get update -y && apt-get install -y curl unzip');
  await sh('export HOME=/root; curl -fsSL https://opencode.ai/install | bash');
  await sh('ln -sf /root/.opencode/bin/opencode /usr/local/bin/opencode');
  const ver = await sh(
    'export HOME=/root PATH="/root/.opencode/bin:$PATH"; opencode --version'
  );
  console.log('opencode in base:', (ver.stdout || '').trim());

  const snap = await vm.snapshot();
  console.log('\n✅ NEW BASE SNAPSHOT:', snap.snapshotId);
  console.log('→ set AUTHORING_BASE_SNAPSHOT in .env.local to this id');
} finally {
  await freestyle.vms.delete({ vmId }).catch(() => {});
  console.log('builder deleted');
}
