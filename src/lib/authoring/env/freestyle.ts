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

export async function runInFreestyle(
  opts: FreestyleRunOpts
): Promise<FreestyleRunResult> {
  const onProgress = opts.onProgress ?? (() => {});
  const model = opts.model ?? DEFAULT_MODEL;

  const baseSnapshot = process.env.AUTHORING_BASE_SNAPSHOT;
  if (!baseSnapshot) {
    throw new Error('AUTHORING_BASE_SNAPSHOT is not set (the baked base image id)');
  }
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (!openrouterKey) {
    throw new Error('OPENROUTER_API_KEY is not set (opencode provider auth for the VM)');
  }
  const webAdeOrigin = process.env.WEB_ADE_ORIGIN ?? 'http://localhost:3000';

  // 1. Resolve access + pin sha on the host (no VM yet).
  const sha = await resolveSha(opts.owner, opts.repo, opts.ref, opts.userToken);
  onProgress('resolved sha', `${opts.owner}/${opts.repo}@${sha.slice(0, 8)}`);

  const bundle = readVmBundle();

  // 2. Boot a fresh VM off the baked base snapshot.
  const created = (await freestyle.vms.create({
    name: `authoring-${opts.owner}-${opts.repo}`,
    snapshotId: baseSnapshot,
  })) as { vm: VmHandle; vmId: string };
  const vm = created.vm;
  const vmId = created.vmId;
  onProgress('vm booted', vmId);

  try {
    // 3. Write the self-contained runner bundle into the VM.
    await vm.exec(`mkdir -p ${VM_BUNDLE_DIR}`);
    await vm.fs.writeTextFile(VM_BUNDLE_PATH, bundle);
    onProgress('bundle written', VM_BUNDLE_PATH);

    // 4. Clone @sha with the token, then scrub the credential from the remote.
    const remote = `github.com/${opts.owner}/${opts.repo}.git`;
    const clone = await vm.exec(
      `export HOME=/root; rm -rf ${VM_WORKDIR} && ` +
        `git clone https://x-access-token:${opts.userToken}@${remote} ${VM_WORKDIR} && ` +
        `cd ${VM_WORKDIR} && git checkout ${sha} && ` +
        `git remote set-url origin https://${remote}`
    );
    if (clone.statusCode !== 0) {
      throw new AuthoringError('REPO_RESOLVE_FAILED', clone.stderr ?? 'clone failed');
    }
    onProgress('cloned + scrubbed', sha.slice(0, 8));

    // 5. Run the SAME core inside the VM, egress-less, printing one JSON line.
    //    OPENROUTER_API_KEY authenticates opencode's provider; the user's
    //    GitHub token is NOT passed here — the agent never sees it.
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
    // 6. Validate-in-VM already happened (the bundle ran validate.ts against the
    //    real clone). Parse the validated payload off stdout.
    const payload = lastJsonLine(run.stdout ?? '');
    onProgress('payload captured', String((payload as { title?: string }).title));

    if (opts.publish === false) {
      return { payload };
    }

    // 7. Publish on the HOST with the user's token.
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
  } finally {
    // 8. Full teardown — fork-per-question leaves nothing live. (Swap to
    //    `vm.stop()` for the paused-per-repo lifecycle once §7 is decided.)
    await freestyle.vms.delete({ vmId }).catch(() => {});
    onProgress('vm deleted', vmId);
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
