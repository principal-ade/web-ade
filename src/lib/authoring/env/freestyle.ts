/**
 * Stage 3 — the in-VM environment wrapper.
 *
 * Runs the SAME `core/` (drive → assemble → validate) the local path proved in
 * L0–L2, but inside a Freestyle VM instead of against a local checkout. The
 * only thing that swaps is this file; `core/` is unchanged. The validated
 * `TrailPayload` JSON is the boundary that crosses back to the host, which
 * publishes with the user's token — the token never enters the VM (it's used
 * only for the host-side sha resolve + the clone command, then scrubbed).
 *
 * See `docs/hosted-trail-authoring-stage3-freestyle.md` for the full design and
 * the empirically-verified `freestyle@0.1.63` SDK surface this is written
 * against (S3a + S3b are green).
 *
 * The VM runner is the self-contained esbuild bundle built by
 * `core/build-vm-bundle.mjs` (`.vm-dist/run-in-vm.cjs`) — node builtins only +
 * the baked opencode binary. We `fs.writeTextFile` it into a fresh VM per run
 * (no rebake needed while `core/` churns).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { freestyle } from 'freestyle';
import { publishTrail } from '../publish';
import type { AuthoringErrorCode } from '../run-types';

/** Default model — free, tool-calling, UI-selectable later (pass `opts.model`). */
export const DEFAULT_MODEL = 'openrouter/nvidia/nemotron-3-super-120b-a12b:free';

const VM_WORKDIR = '/work';
const VM_BUNDLE_DIR = '/opt/authoring';
const VM_BUNDLE_PATH = `${VM_BUNDLE_DIR}/run-in-vm.cjs`;

export type { AuthoringErrorCode };

export class AuthoringError extends Error {
  constructor(
    public code: AuthoringErrorCode,
    detail?: string
  ) {
    super(`${code}${detail ? `: ${detail}` : ''}`);
    this.name = 'AuthoringError';
  }
}

export interface FreestyleRunOpts {
  owner: string;
  repo: string;
  ref?: string;
  question: string;
  /** User's GitHub token — host-only: resolve + clone + publish. Never reaches opencode. */
  userToken: string;
  /** `provider/model`; UI-selectable, defaults to the free model. */
  model?: string;
  /** Publish on the host after the VM run. Default true; false → return payload only (S3c gate). */
  publish?: boolean;
  /** Max seconds for the in-VM opencode run (free models are slow). Default 540. */
  timeoutSecs?: number;
  onProgress?: (label: string, detail?: string) => void;
}

export interface FreestyleRunResult {
  payload: Record<string, unknown>;
  /** Present when `publish !== false`. */
  trailId?: string;
  /** Present when `publish !== false`. `/trail/{id}`. */
  trailUrl?: string;
}

/** POSIX single-quote shell-escape — safe to drop into an `exec` string. */
function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Import a GitHub repo into a fresh Freestyle Git repo, server-side. Freestyle
 * fetches from github.com on its own (well-connected) network, so the VM never
 * has to reach github.com. The user's token is embedded in the source URL to
 * authenticate the import for private repos — it lives only in this host-side
 * call and the (short-lived, deleted) Freestyle repo config; it never enters the
 * VM. Returns the new repoId. Classifies auth/not-found as REPO_RESOLVE_FAILED,
 * everything else as UNAVAILABLE (infra).
 */
async function importToFreestyleGit(
  owner: string,
  repo: string,
  ref: string | undefined,
  userToken: string
): Promise<string> {
  const url = `https://x-access-token:${userToken}@github.com/${owner}/${repo}.git`;
  try {
    const res = await freestyle.git.repos.create({
      name: `authoring-${owner}-${repo}`,
      // Import the requested ref; null → the repo's default branch.
      source: { url, rev: ref ?? null },
    });
    return res.repoId;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/not found|404|403|unauthor|denied|authentication|permission/i.test(msg)) {
      throw new AuthoringError('REPO_RESOLVE_FAILED', `repo import failed: ${msg}`);
    }
    throw new AuthoringError('UNAVAILABLE', `Freestyle Git import failed: ${msg}`);
  }
}

/**
 * Mint a scoped, read-only Freestyle identity token for one repo — the
 * credential the VM uses to clone it in-network. Returns the identityId (for
 * teardown) and the token.
 */
async function mintRepoReadToken(
  repoId: string
): Promise<{ identityId: string; token: string }> {
  try {
    const { identityId } = await freestyle.identities.create();
    const ident = freestyle.identities.ref({ identityId });
    await ident.permissions.git.grant({ repoId, permission: 'read' });
    const { token } = await ident.tokens.create();
    return { identityId, token };
  } catch (err) {
    throw new AuthoringError(
      'UNAVAILABLE',
      `Freestyle identity/token mint failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/** The validated payload is the final `{…}` line of stdout (opencode noise precedes it). */
function lastJsonLine(stdout: string): Record<string, unknown> {
  const lines = stdout
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('{') && l.endsWith('}'));
  const last = lines[lines.length - 1];
  if (!last) throw new AuthoringError('AGENT_NO_EMIT', 'no JSON line in VM stdout');
  return JSON.parse(last) as Record<string, unknown>;
}

/**
 * Host-side access gate + sha pin via a plain GitHub API call (no `next/cache`,
 * so this is usable from a CLI test as well as a route). A 403/404 here is the
 * fail-fast equivalent of `checkRepoAccess` returning null.
 */
async function resolveSha(
  owner: string,
  repo: string,
  ref: string | undefined,
  token: string
): Promise<string> {
  const r = ref && ref.length > 0 ? ref : 'HEAD';
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/commits/${r}`,
    {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'user-agent': 'hosted-trail-authoring',
      },
    }
  );
  if (!res.ok) {
    throw new AuthoringError(
      'REPO_RESOLVE_FAILED',
      `${res.status} resolving ${owner}/${repo}@${r}`
    );
  }
  const j = (await res.json()) as { sha?: string };
  if (!j.sha) throw new AuthoringError('REPO_RESOLVE_FAILED', 'no sha in response');
  return j.sha;
}

/** Read the esbuild'd VM runner bundle from disk (build it first). */
function readVmBundle(): string {
  const bundle = path.resolve(
    process.cwd(),
    'src/lib/authoring/.vm-dist/run-in-vm.cjs'
  );
  try {
    return readFileSync(bundle, 'utf8');
  } catch {
    throw new Error(
      `VM bundle not found at ${bundle} — run \`node src/lib/authoring/core/build-vm-bundle.mjs\` first`
    );
  }
}

/**
 * The live Freestyle resources backing a prepared authoring session. These ids
 * are all that's needed to (a) reconnect to the VM for the ask phase
 * (`vms.ref({vmId})`) and (b) tear everything down afterwards — so they can be
 * persisted in the session store and survive across separate HTTP requests.
 */
export interface PreparedSession {
  vmId: string;
  repoId: string;
  identityId: string;
  /** The host-resolved HEAD sha (gate + display); the authoritative sha is
   *  re-stamped in-VM from the real `.git` during the ask phase. */
  sha: string;
}

export interface PrepareOpts {
  owner: string;
  repo: string;
  ref?: string;
  /** User's GitHub token — host-only (resolve + import). Never reaches the VM. */
  userToken: string;
  onProgress?: (label: string, detail?: string) => void;
}

export interface AskOpts {
  /** The VM booted by {@link prepareFreestyleSession}. */
  vmId: string;
  owner: string;
  repo: string;
  question: string;
  /** Host-resolved sha (display only). */
  sha?: string;
  model?: string;
  /** User's GitHub token — host-only (publish). Never reaches the VM. */
  userToken: string;
  publish?: boolean;
  timeoutSecs?: number;
  onProgress?: (label: string, detail?: string) => void;
}

/**
 * Phase 1 of a session — everything that does NOT need the question, so the UI
 * can show "Initializing" (Freestyle Git import) then "Preparing" (VM boot +
 * clone) and only reveal the question field once this resolves. Acquires the
 * three Freestyle resources (imported repo, scoped identity, booted VM with the
 * repo cloned into {@link VM_WORKDIR}) and returns their ids; the caller owns
 * teardown via {@link teardownFreestyleSession}.
 *
 * On any failure this tears down whatever it already created (so a failed
 * prepare never leaks resources) and rethrows the classified `AuthoringError`.
 */
export async function prepareFreestyleSession(
  opts: PrepareOpts
): Promise<PreparedSession> {
  const onProgress = opts.onProgress ?? (() => {});

  const baseSnapshot = process.env.AUTHORING_BASE_SNAPSHOT;
  if (!baseSnapshot) {
    throw new Error('AUTHORING_BASE_SNAPSHOT is not set (the baked base image id)');
  }

  // 1. Resolve access + sha on the host (gating only — fail fast before we
  //    allocate any Freestyle resources). The authoritative authoredAt.sha is
  //    stamped in-VM from the real .git after the clone.
  const sha = await resolveSha(opts.owner, opts.repo, opts.ref, opts.userToken);
  onProgress('resolved sha', `${opts.owner}/${opts.repo}@${sha.slice(0, 8)}`);

  const bundle = readVmBundle();

  // Resources to tear down if we fail partway (each undefined until created).
  let repoId: string | undefined;
  let identityId: string | undefined;
  let vmId: string | undefined;

  try {
    // 2. Import the GitHub repo into Freestyle Git — server-side, on Freestyle's
    //    own network (NOT from the VM, whose egress to github.com is flaky). The
    //    user's token authenticates the import for private repos and stays on the
    //    host; it never enters the VM. This is the "Initializing" step and the
    //    one that fails most often, so the UI gates the whole session on it.
    onProgress('importing', `${opts.owner}/${opts.repo}`);
    repoId = await importToFreestyleGit(opts.owner, opts.repo, opts.ref, opts.userToken);
    onProgress('repo imported to freestyle git', repoId);

    // 3. Mint a scoped, read-only Freestyle identity token so the VM can clone
    //    the imported repo in-network.
    const minted = await mintRepoReadToken(repoId);
    identityId = minted.identityId;
    const gitToken = minted.token;

    // 4. Boot a fresh VM off the baked base snapshot. A failure here is the
    //    execution substrate being unreachable/erroring — surface it as
    //    UNAVAILABLE so the client retries rather than rephrasing.
    onProgress('preparing', 'booting vm');
    let created: { vm: VmHandle; vmId: string };
    try {
      created = (await freestyle.vms.create({
        name: `authoring-${opts.owner}-${opts.repo}`,
        snapshotId: baseSnapshot,
      })) as { vm: VmHandle; vmId: string };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new AuthoringError('UNAVAILABLE', `failed to create authoring VM: ${detail}`);
    }
    const vm = created.vm;
    vmId = created.vmId;
    onProgress('vm booted', vmId);

    // 5. Write the self-contained runner bundle into the VM.
    await vm.exec(`mkdir -p ${VM_BUNDLE_DIR}`);
    await vm.fs.writeTextFile(VM_BUNDLE_PATH, bundle);
    onProgress('bundle written', VM_BUNDLE_PATH);

    // 6. Clone the imported repo from Freestyle Git — IN-NETWORK (git.freestyle.sh),
    //    not github.com. Auth is the scoped read-only identity token; scrub it
    //    from the remote afterwards so opencode never sees a credential. The
    //    clone keeps a real .git, so the in-VM `git rev-parse HEAD` still stamps
    //    authoredAt.sha. A failure here is in-network infra → UNAVAILABLE.
    //    The source import (step 2) populates the Freestyle repo asynchronously,
    //    so an immediate clone can race it and get a transient 500 / empty repo;
    //    Freestyle's git http can also blip. Retry with backoff — early misses
    //    while the import finishes, later attempts succeed. Persistent failure is
    //    infra → UNAVAILABLE.
    const freestyleRemote = `git.freestyle.sh/${repoId}`;
    const cloneCmd =
      `export HOME=/root; rm -rf ${VM_WORKDIR} && ` +
      `git clone --depth 1 https://x-access-token:${gitToken}@${freestyleRemote} ${VM_WORKDIR} && ` +
      `cd ${VM_WORKDIR} && git remote set-url origin https://${freestyleRemote}`;
    const CLONE_ATTEMPTS = 8;
    const CLONE_BACKOFF_MS = 4000;
    let clone: { statusCode?: number | null; stderr?: string | null } | null = null;
    let cloneThrew: unknown = null;
    for (let attempt = 1; attempt <= CLONE_ATTEMPTS; attempt++) {
      cloneThrew = null;
      try {
        clone = await vm.exec({ command: cloneCmd, timeoutMs: 90000 });
      } catch (err) {
        cloneThrew = err;
        clone = null;
      }
      if (clone && clone.statusCode === 0) break;
      onProgress(
        'freestyle clone retry',
        `${attempt}/${CLONE_ATTEMPTS}${clone?.statusCode != null ? ` (exit ${clone.statusCode})` : ''}`
      );
      if (attempt < CLONE_ATTEMPTS) await sleep(CLONE_BACKOFF_MS);
    }
    if (!clone || clone.statusCode !== 0) {
      throw new AuthoringError(
        'UNAVAILABLE',
        `freestyle git clone failed after ${CLONE_ATTEMPTS} attempts ` +
          `(import may not have populated): ` +
          `${cloneThrew instanceof Error ? cloneThrew.message : clone?.stderr ?? ''}`.trim()
      );
    }
    onProgress('cloned from freestyle git', sha.slice(0, 8));

    return { vmId, repoId, identityId, sha };
  } catch (err) {
    // A failed prepare must not leak the resources it managed to create.
    await teardownFreestyleSession({ vmId, identityId, repoId });
    throw err;
  }
}

/**
 * Phase 2 of a session — drive opencode in the already-prepared VM against the
 * user's question, then (unless `publish === false`) publish on the host with
 * the user's token. Reconnects to the VM by id (`vms.ref`), so this can run in a
 * separate request from {@link prepareFreestyleSession}. Does NOT tear the VM
 * down — the session lifecycle owns that via {@link teardownFreestyleSession}.
 */
export async function askInFreestyleSession(
  opts: AskOpts
): Promise<FreestyleRunResult> {
  const onProgress = opts.onProgress ?? (() => {});
  const model = opts.model ?? DEFAULT_MODEL;

  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (!openrouterKey) {
    throw new Error('OPENROUTER_API_KEY is not set (opencode provider auth for the VM)');
  }
  const webAdeOrigin = process.env.WEB_ADE_ORIGIN ?? 'http://localhost:3000';

  const vm = freestyle.vms.ref({ vmId: opts.vmId }) as VmHandle;

  // Run the SAME core inside the VM, egress-less, printing one JSON line.
  // OPENROUTER_API_KEY authenticates opencode's provider; no GitHub or
  // Freestyle credential is passed here — the agent never sees one.
  onProgress('driving opencode in VM', model);
  const timeoutSecs = opts.timeoutSecs ?? 540;
  // The opencode run can take minutes; the default synchronous-exec timeout
  // drops the connection ("fetch failed"). Give the exec more wall-clock than
  // the bundle's own `--timeout` so the bundle aborts cleanly first.
  const run = await vm.exec({
    command:
      `export HOME=/root PATH="/root/.opencode/bin:$PATH" ` +
      `OPENROUTER_API_KEY=${shq(openrouterKey)}; ` +
      `cd ${VM_WORKDIR} && node ${VM_BUNDLE_PATH} ` +
      `--repo-root ${VM_WORKDIR} --question ${shq(opts.question)} ` +
      `--model ${shq(model)} --timeout ${timeoutSecs} --emit-json`,
    timeoutMs: (timeoutSecs + 90) * 1000,
  });
  if (run.statusCode !== 0) {
    throw new AuthoringError('AGENT_NO_EMIT', run.stderr ?? `exit ${run.statusCode}`);
  }
  // Validate-in-VM already happened (the bundle ran validate.ts against the real
  // clone). Parse the validated payload off stdout.
  const payload = lastJsonLine(run.stdout ?? '');
  onProgress('payload captured', String((payload as { title?: string }).title));

  if (opts.publish === false) {
    return { payload };
  }

  // Publish on the HOST with the user's token.
  try {
    const { id, url } = await publishTrail({
      host: webAdeOrigin,
      token: opts.userToken,
      owner: opts.owner,
      repo: opts.repo,
      payload,
    });
    onProgress('published', url);
    return { payload, trailId: id, trailUrl: url };
  } catch (err) {
    throw new AuthoringError(
      'PUBLISH_FAILED',
      err instanceof Error ? err.message : String(err)
    );
  }
}

/**
 * Tear down every live Freestyle resource a session acquired — the VM, the
 * scoped identity, and the imported Freestyle repo. Each delete is best-effort
 * (a missing/already-deleted id is a no-op), so this is safe to call on a
 * partially-prepared session, after a completed ask, or from the TTL reaper.
 */
export async function teardownFreestyleSession(ids: {
  vmId?: string;
  identityId?: string;
  repoId?: string;
}): Promise<void> {
  if (ids.vmId) {
    await freestyle.vms.delete({ vmId: ids.vmId }).catch(() => {});
  }
  if (ids.identityId) {
    await freestyle.identities.delete({ identityId: ids.identityId }).catch(() => {});
  }
  if (ids.repoId) {
    await freestyle.git.repos.delete({ repoId: ids.repoId }).catch(() => {});
  }
}

/**
 * One-shot cold-create flow (the original Stage 3/4 path): prepare → ask →
 * teardown. Still used by `POST /api/authoring/runs` and the CLI harness. The
 * session API drives prepare/ask/teardown separately instead, so the VM can wait
 * for the user's question.
 */
export async function runInFreestyle(
  opts: FreestyleRunOpts
): Promise<FreestyleRunResult> {
  const prepared = await prepareFreestyleSession({
    owner: opts.owner,
    repo: opts.repo,
    ref: opts.ref,
    userToken: opts.userToken,
    onProgress: opts.onProgress,
  });
  try {
    return await askInFreestyleSession({
      vmId: prepared.vmId,
      owner: opts.owner,
      repo: opts.repo,
      question: opts.question,
      sha: prepared.sha,
      model: opts.model,
      userToken: opts.userToken,
      publish: opts.publish,
      timeoutSecs: opts.timeoutSecs,
      onProgress: opts.onProgress,
    });
  } finally {
    await teardownFreestyleSession(prepared);
    opts.onProgress?.('vm deleted', prepared.vmId);
  }
}

/** Minimal structural type for the bits of the Freestyle Vm we use. */
interface VmHandle {
  exec(cmd: string | { command: string; timeoutMs?: number }): Promise<{
    stdout?: string | null;
    stderr?: string | null;
    statusCode?: number | null;
  }>;
  fs: { writeTextFile(path: string, contents: string): Promise<unknown> };
}
