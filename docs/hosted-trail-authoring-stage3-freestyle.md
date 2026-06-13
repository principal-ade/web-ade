# Stage 3 — opencode-in-Freestyle (the in-VM wrapper)

**Topic:** `topic-1781154092475-a1ls0neji` ("Hosted trail authoring: ask-a-question → get-a-trail")
**Companion to:** `docs/hosted-trail-authoring.md` (§7 Stage 3) and
`docs/hosted-trail-authoring-local-test.md` (Stages L0–L2, **proven**).

Stages L0–L2 proved the *new* half of the pipeline on a laptop: opencode emits a
`TrailPayload`, it clears `validatePayload()` offline, and the host-side
`publish.ts` POSTs it to web-ade and renders it in File City. Stage 3 changes
**only the environment wrapper**: run that exact same `core/` inside a Freestyle
VM instead of against a local checkout. Nothing in `core/` changes.

```
core/ (UNCHANGED)         env wrapper (the only thing that swaps)
  brief → drive →         ┌────────────────────────────────────────┐
  assemble → validate     │ core/run.ts   → local fs + local git    │ ← proven (L0–L2)
        │                 │ env/freestyle.ts → Freestyle VM + clone │ ← THIS DOC
        ▼                 └────────────────────────────────────────┘
  validated TrailPayload JSON  ── the boundary that crosses back to the host
        │
        ▼
  HOST: publish.ts → POST /api/trails  (user's token, never in the VM)
```

---

## 0. Prerequisite — satisfied; S3a + S3b are green

| Need | Status |
|---|---|
| `freestyle` npm SDK | ✅ installed (`freestyle@0.1.63`) |
| `FREESTYLE_API_KEY` | ✅ set in `.env.local` (`whoami` authenticates) |
| Base snapshot (opencode+node+git) | ✅ baked — `AUTHORING_BASE_SNAPSHOT=sh-n9yqrwrdegg0do7jj1ar` (S3b) |
| opencode + OpenRouter | opencode baked; OpenRouter provider-auth into the VM is a §6 S3c task |

S3a (boot + exec round-trip) and S3b (bake + verify snapshot) **passed** against a
real account; §1 and §3 below are corrected to the live SDK behavior. Next gate
is S3c (full run in the VM). The host-side seams (`resolve-repo`, `publish.ts`)
remain environment-independent.

---

## 1. Freestyle SDK surface — verified empirically (S3a/S3b passed)

Package: **`freestyle@0.1.63`** (`npm i freestyle`). The published docs show an
idealized API; the lines below are what the **installed SDK actually does**,
confirmed by running S3a (boot+exec) and S3b (bake snapshot) against a real
account:

```ts
import { freestyle } from 'freestyle';   // lazy singleton; reads FREESTYLE_API_KEY (or new Freestyle({apiKey}))

// create() returns a WRAPPER, not the Vm: { id, vmId, vm, domains, snapshotId, ... }
const created = await freestyle.vms.create({ name, snapshotId? });
const vm = created.vm;          // the Vm instance (exec/fs/snapshot/kill live here)
const vmId = created.vmId;      // id for vms.delete / vms.get

const { stdout, stderr, statusCode } = await vm.exec('git --version'); // stderr is null when empty
await vm.fs.writeTextFile('/root/work/x.ts', contents);
const { snapshotId } = await vm.snapshot();                 // → e.g. "sh-…"; bake a reusable image
const { forks } = await vm.fork({ count: 1, persistence: { type: 'ephemeral' } });
await vm.suspend();   // pause (paused-per-repo)        await vm.start();   // resume
await freestyle.vms.delete({ vmId });   // FULL removal
const list = await freestyle.vms.list();                   // [] (array) — leak audit
```

Gotchas that bit us (now encoded above):
- **`exec` runs a non-login shell with `HOME` unset.** Anything touching `$HOME`
  (the opencode installer, `~/.opencode/bin`) fails with `HOME: unbound variable`
  → prefix execs with `export HOME=/root PATH="/root/.opencode/bin:$PATH"; …`.
- **`vm.kill()` only *stops* the VM (disk persists); it does NOT delete it.** Full
  teardown is `freestyle.vms.delete({ vmId })`. Always tear down in a `finally`,
  and audit with `vms.list()` — stopped VMs still cost storage.
- **`create()` returns `{ vm, vmId, … }`** — destructure `.vm` for methods,
  `.vmId` for deletion. Using the wrapper directly → `vm.exec is not a function`.
- **No first-class git method** — clone is `vm.exec('git clone …')`, so the
  token-inject/scrub happens in shell, fully under our control.
- The validated-payload JSON crosses back as `exec().stdout` of the in-VM run.
- **node + git are already in the base image** (node v24.16, git 2.47); only
  opencode needs baking — see §3.

---

## 2. Run flow (host orchestrates; agent stays sandboxed)

`runInFreestyle({ owner, repo, ref?, question, userToken })`:

1. **Resolve on the host** (no VM yet): `checkRepoAccess(owner, repo, userToken)`
   → 403 fail-fast if no read access; `resolveHeadSha(owner, repo, userToken)` →
   pin the `sha`. (Both already exist in `src/lib/trails/github-access.ts`; this
   is the new `core/resolve-repo.ts` module — see §5.)
2. **Get a VM**: `create({ snapshotId: BASE })` (cold) or `fork()` off a warm
   per-repo VM (open decision §7). Base snapshot already has node + opencode +
   `core/` + the `.opencode/tool/emit_trail.ts` asset baked in.
3. **Clone at the pinned sha, with the token, then scrub it**:
   ```ts
   await vm.exec(
     `git clone --depth 1 https://x-access-token:${userToken}@github.com/${owner}/${repo}.git /work && ` +
     `cd /work && git fetch --depth 1 origin ${sha} && git checkout ${sha}`,
   );
   // scrub: remove any on-disk credential trace before the agent runs
   await vm.exec(`cd /work && git remote set-url origin https://github.com/${owner}/${repo}.git`);
   ```
   The token is present **only** for this step. opencode runs afterward.
4. **Run the identical core inside the VM**, egress-less, printing JSON to stdout:
   ```ts
   const { stdout, statusCode } = await vm.exec(
     `cd /work && OPENROUTER_API_KEY=${openrouterKey} ` +
     `node /opt/authoring/run-in-vm.js --repo-root /work --question ${shq(question)} --emit-json`,
   );
   if (statusCode !== 0) throw new AuthoringError('AGENT_NO_EMIT', stderr);
   const payload = JSON.parse(lastJsonLine(stdout));   // validated TrailPayload
   ```
   `run-in-vm` is `core/run.ts` in a mode that does **drive → assemble →
   validate** and prints the validated payload as a single JSON line, **without
   publishing** (publish is the host's job). See §5.
5. **Validate-in-VM already happened** (step 4 ran `validate.ts` against the real
   clone — same `validatePayload()` gate + marker tree-resolution as L1).
6. **Publish on the host** with the user's token — the exact `publishTrail()` from
   `src/lib/authoring/publish.ts` that L2 proved:
   ```ts
   const { url } = await publishTrail({ host: WEB_ADE_ORIGIN, token: userToken, owner, repo, payload });
   ```
7. **Tear down**: `vm.stop()` (resumable, for paused-per-repo) or
   `freestyle.vms.delete({ vmId })` (fork-per-question). Always in a `finally`.

The token touches the host (resolve + clone command + publish) but **never the
agent**: opencode runs after the scrub, with no write tools and no egress. This
is the §4/§9 security posture of `hosted-trail-authoring.md`, enforced.

---

## 3. The VM image (base snapshot) — **baked + verified (S3b)**

The base image is already built: **`AUTHORING_BASE_SNAPSHOT=sh-n9yqrwrdegg0do7jj1ar`**
(in `.env.local`). It carries opencode 1.17.4 on top of the stock node v24 + git
image. The S3b bake that produced it:

```ts
const { vm: builder } = await freestyle.vms.create({ name: 'authoring-base' });
await builder.exec('apt-get update -y && apt-get install -y curl unzip');     // node+git already present
await builder.exec('export HOME=/root; curl -fsSL https://opencode.ai/install | bash');
await builder.exec('ln -sf /root/.opencode/bin/opencode /usr/local/bin/opencode'); // onto a non-login PATH
const { snapshotId } = await builder.snapshot();     // → AUTHORING_BASE_SNAPSHOT
await freestyle.vms.delete({ vmId: builder.vmId });  // builder is disposable
```

Still **to add** before S3c (next bake or write-at-runtime): the `core/` runner
bundle + the `.opencode/tool/emit_trail.ts` asset + opencode's provider auth
(OpenRouter). Two options, both fine:
- **Bake them in** → per-question path is just *clone + exec* (fastest, but
  rebake on every `core/` change).
- **`fs.writeTextFile` per run** → write the single esbuild'd runner bundle into
  the fresh VM each time (no rebake; one extra write). Good while `core/` churns.

Rebake when opencode or the runner bundle change; pin the id in `.env.local`.

---

## 4. Reference implementation — `env/freestyle.ts`

Replaces the current Stage-3 stub. Untested until a key exists, but written
against the verified SDK above.

```ts
import { freestyle } from 'freestyle';
import { resolveRepo } from '../core/resolve-repo';
import { publishTrail } from '../publish';

const BASE_SNAPSHOT = process.env.AUTHORING_BASE_SNAPSHOT!;
const WEB_ADE_ORIGIN = process.env.WEB_ADE_ORIGIN ?? 'http://localhost:3000';

export interface FreestyleRunOpts {
  owner: string; repo: string; ref?: string; question: string;
  /** User's GitHub token — host-only: resolve + clone + publish. Never reaches opencode. */
  userToken: string;
}

export async function runInFreestyle(o: FreestyleRunOpts): Promise<{ trailUrl: string }> {
  // 1. resolve access + sha on the host
  const { sha } = await resolveRepo(o.owner, o.repo, o.ref, o.userToken); // throws 403 if no access

  // 2. boot from the baked base snapshot
  const { vm } = await freestyle.vms.create({ snapshotId: BASE_SNAPSHOT });
  try {
    // 3. clone @sha with the token, then scrub it
    const remote = `github.com/${o.owner}/${o.repo}.git`;
    const clone = await vm.exec(
      `rm -rf /work && git clone https://x-access-token:${o.userToken}@${remote} /work && ` +
      `cd /work && git checkout ${sha} && git remote set-url origin https://${remote}`,
    );
    if (clone.statusCode !== 0) throw new AuthoringError('REPO_RESOLVE_FAILED', clone.stderr);

    // 4. run the SAME core inside the VM, egress-less, emit JSON
    const run = await vm.exec(
      `cd /work && OPENROUTER_API_KEY=${process.env.OPENROUTER_API_KEY} ` +
      `node /opt/authoring/run-in-vm.js --repo-root /work --question ${shq(o.question)} --emit-json`,
    );
    if (run.statusCode !== 0) throw new AuthoringError('AGENT_NO_EMIT', run.stderr);
    const payload = JSON.parse(lastJsonLine(run.stdout!));

    // 5. publish on the HOST with the user's token (validate already ran in-VM)
    const { url } = await publishTrail({
      host: WEB_ADE_ORIGIN, token: o.userToken, owner: o.owner, repo: o.repo, payload,
    });
    return { trailUrl: url };
  } finally {
    await vm.stop().catch(() => {});   // or freestyle.vms.delete for fork-per-question
  }
}
```

`shq` = POSIX shell-quote; `lastJsonLine` = take the final `{…}` line from stdout
(opencode/log noise precedes it). `AuthoringError(code, detail)` maps to the
`AuthoringErrorCode`s the mobile contract (`mobile-app/docs/AUTHORING_API.md` §3)
expects: `REPO_RESOLVE_FAILED | AGENT_NO_EMIT | VALIDATION_FAILED | PUBLISH_FAILED | TIMEOUT`.

---

## 5. Two small host-side seams this needs (buildable now, no Freestyle)

1. **`core/resolve-repo.ts`** — `resolveRepo(owner, repo, ref?, token)` →
   `{ githubRepoId, sha, ref }`. Thin composition of the existing
   `checkRepoAccess` (throw `NO_REPO_ACCESS` on null) + `resolveHeadSha`
   (or resolve `ref` when provided). **Server-only**: it reaches `next/cache`
   (`github-access` → `github-cache` → `unstable_cache`), so it's exercised via
   the Stage-4 route or a `vitest` unit test, **not** a bare `tsx` script. (This
   is also why it lives at the runner level, not inside the env-agnostic
   opencode-drive path.)
2. **`core/run.ts --emit-json`** — a mode that prints the validated payload as a
   single JSON line to stdout and **skips publish** (publish is host-side). This
   is exactly what the VM execs in §2.4, and it's **testable locally today**:
   `npx tsx core/run.ts --emit-json | tail -1 | jq .` should yield the payload
   `core/run.ts` already assembles. Building this now de-risks the VM boundary
   before any VM exists.

---

## 6. Staged test plan (gated on a Freestyle key for S3b+)

| Stage | Goal | Needs key? | Pass |
|---|---|---|---|
| **S3a** ✅ | boot a VM, `exec('echo hi')`, read stdout | yes (minimal) | **done** — stdout round-trips; node+git found pre-baked |
| **S3b** ✅ | bake base snapshot (opencode on node+git base) | yes | **done** — `sh-n9yqrwrdegg0do7jj1ar`; opencode 1.17.4 + node + git verified in a fresh VM off it |
| **S3c** | full run in VM matches local L2 | yes | same `TrailPayload` shape as the L2 `.out`; markers resolve; host publish → `/trail/{id}` renders |
| **S3d** | lifecycle: fork / stop+start; 2 concurrent questions | yes | both produce trails; warm path skips clone |
| **S3e** | cost + latency: cold-create vs fork vs paused-resume | yes | numbers to settle the §7 lifecycle decision |

S3c is the real gate: it must reproduce the **already-proven** L2 result, just
driven through the VM. Everything underneath (brief, emit, assemble, validate,
publish) is unchanged and green from L0–L2.

---

## 7. Open decisions carried from the topic

- **VM lifecycle** — fork-per-question off a warm base vs one paused VM per repo
  (leaning paused-per-repo). S3d/S3e measure this; the code above uses
  `create({snapshotId})` + `stop()` and notes the `fork()`/`delete()` swap.
- **Marker validation** — reject vs auto-repair drifted line ranges. In-VM
  `validate.ts` currently rejects (`VALIDATION_FAILED`); auto-repair is a later knob.
- **Model/provider in the VM** — currently the `--model` default from `run.ts`
  (OpenRouter nemotron free, with the function-calling caveat in the README).
  Build-time config knob; revisit for reliability/cost once runs go async.
- **Token → GitHub App** — v1 injects the user's token for the clone step only and
  scrubs it. Graduate to a short-lived GitHub App installation token once runs go
  async (so a long-lived user token isn't the clone credential). Tracked in §9 of
  the main doc.

---

## 8. Sequencing for the build

1. **Now, no key:** land `core/resolve-repo.ts` + `core/run.ts --emit-json`
   (§5) — both testable locally; they're the host/VM boundary.
2. **With a key:** `npm i freestyle`, set `FREESTYLE_API_KEY`, run S3a → S3b
   (bake `BASE_SNAPSHOT`) → drop in `env/freestyle.ts` (§4) → S3c.
3. **Then Stage 4:** wrap `runInFreestyle` in `POST /api/authoring/runs` (the
   route the mobile contract codes against) + inbox delivery.
