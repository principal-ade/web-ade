/**
 * Drive opencode to produce an `emit_trail` call, and capture its args.
 *
 * This module is environment-agnostic: it spins up an opencode server via
 * the SDK and points it at `repoRoot` through the `directory` query param.
 * Locally `repoRoot` is a checkout on disk; inside a Freestyle VM it's the
 * cloned repo — the code is the same either way. Reference implementation:
 * `desktop-app/electron-app/src/main/opencode/openCodeRunner.ts`.
 *
 * Capture strategy (portable, no streaming parser required):
 *   1. Primary — scan the resolved prompt response's parts for the
 *      `emit_trail` tool call and read its `input`.
 *   2. Fallback — read the JSON the tool handler wrote to `EMIT_TRAIL_OUT`.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { EmitTrailArgs } from './types';

// `@opencode-ai/sdk` is ESM-only (its `exports` map exposes only the
// `import` condition). Loading via a dynamic import() forces Node's ESM
// resolver even when this module is evaluated as CJS (tsx in a non-module
// package), avoiding ERR_PACKAGE_PATH_NOT_EXPORTED.
async function loadSdk() {
  return import('@opencode-ai/sdk');
}

export interface DriveOpts {
  /** Absolute path to the repo checkout opencode explores. */
  repoRoot: string;
  /** System prompt (the brief). */
  system: string;
  /** User turn (the question prompt). */
  prompt: string;
  /** Where the tool handler writes its fallback copy. */
  emitTrailOut: string;
  /** `provider/model`, e.g. `anthropic/claude-opus-4-8`. Omitted → opencode default. */
  model?: { providerID: string; modelID: string };
  /** opencode agent to run as — must be one with tools bound. Default `build`. */
  agent?: string;
  timeoutMs?: number;
  onProgress?: (label: string, detail?: string) => void;
}

const DEFAULT_TIMEOUT_MS = 240_000;

/** Make sure the opencode binary is resolvable by the SDK's spawn. */
function ensureOpencodeOnPath(): void {
  try {
    execFileSync('which', ['opencode'], { stdio: 'ignore' });
    return;
  } catch {
    // fall through
  }
  const fallbackDir = path.join(
    process.env.HOME ?? '',
    '.opencode',
    'bin'
  );
  if (existsSync(path.join(fallbackDir, 'opencode'))) {
    process.env.PATH = `${fallbackDir}${path.delimiter}${process.env.PATH ?? ''}`;
  }
}

/** Pull the emit_trail tool call's input out of a prompt response. */
function findEmitTrailInput(parts: unknown[]): EmitTrailArgs | null {
  for (const p of parts) {
    const part = p as {
      type?: string;
      tool?: string;
      input?: unknown;
      state?: { input?: unknown };
    };
    if (part.type === 'tool' && part.tool === 'emit_trail') {
      const input = part.input ?? part.state?.input;
      if (input && typeof input === 'object') return input as EmitTrailArgs;
    }
  }
  return null;
}

export async function driveOpencode(opts: DriveOpts): Promise<EmitTrailArgs> {
  ensureOpencodeOnPath();
  const onProgress = opts.onProgress ?? (() => {});

  // The tool handler reads this to write its fallback copy.
  process.env.EMIT_TRAIL_OUT = opts.emitTrailOut;

  const { createOpencodeServer, createOpencodeClient } = await loadSdk();

  let server: { url: string; close(): void } | undefined;
  try {
    server = await createOpencodeServer({});
    const client = createOpencodeClient({ baseUrl: server.url });
    onProgress('opencode server up', server.url);

    const sessionResp = await client.session.create({
      body: { title: 'hosted-trail-authoring L0' },
    });
    const sessionId = sessionResp.data?.id;
    if (!sessionId) throw new Error('session.create returned no id');
    onProgress('session created', sessionId);

    const signal = AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    const promptResp = await client.session.prompt({
      path: { id: sessionId },
      query: { directory: opts.repoRoot },
      body: {
        agent: opts.agent ?? 'build',
        system: opts.system,
        ...(opts.model ? { model: opts.model } : {}),
        parts: [{ type: 'text', text: opts.prompt }],
      },
      signal,
    });

    const httpStatus =
      (promptResp as { response?: Response }).response?.status ?? null;
    if (httpStatus !== null && httpStatus >= 400) {
      const errBody = JSON.stringify(
        (promptResp as { error?: unknown }).error ?? {}
      ).slice(0, 500);
      throw new Error(`HTTP ${httpStatus} from session.prompt — ${errBody}`);
    }

    const info = promptResp.data?.info;
    if (info?.error) {
      const err = info.error as { name?: string; data?: unknown };
      throw new Error(
        `assistant error (${err.name ?? 'unknown'}): ${JSON.stringify(
          err.data ?? err
        ).slice(0, 400)}`
      );
    }

    const parts = (promptResp.data?.parts ?? []) as unknown[];
    onProgress(
      'prompt finished',
      `parts=[${parts.map((p) => (p as { type?: string }).type ?? '?').join(',')}]`
    );

    // Primary: capture from the response parts.
    const fromParts = findEmitTrailInput(parts);
    if (fromParts) return fromParts;

    // Fallback: the handler's on-disk copy.
    if (existsSync(opts.emitTrailOut)) {
      onProgress('captured via EMIT_TRAIL_OUT fallback', opts.emitTrailOut);
      return JSON.parse(readFileSync(opts.emitTrailOut, 'utf8')) as EmitTrailArgs;
    }

    const toolParts = parts.filter(
      (p) => (p as { type?: string }).type === 'tool'
    );
    const text = parts
      .filter((p) => (p as { type?: string }).type === 'text')
      .map((p) => (p as { text?: string }).text ?? '')
      .join('\n')
      .slice(0, 800);
    throw new Error(
      'opencode finished without calling emit_trail.\n' +
        `  parts=[${parts.map((p) => (p as { type?: string }).type ?? '?').join(',')}]\n` +
        `  tool calls made: ${toolParts.length}\n` +
        `  assistant text (first 800 chars):\n${text}`
    );
  } finally {
    if (server) {
      try {
        server.close();
      } catch {
        // ignore
      }
    }
  }
}
