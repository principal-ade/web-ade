# Hosted trail authoring — Stage L0 + L1 runnable

The local proof from `docs/hosted-trail-authoring-local-test.md`: drive opencode
against a local checkout, assemble its `emit_trail` output into a `TrailPayload`,
and validate it offline through web-ade's **real** gate — no Freestyle, no
GitHub token, no server.

```
opencode emits flat emit_trail args
  → assemble into a TrailPayload
  → validatePayload() returns clean
  → every marker's sourcePath + line range resolves in the local tree
```

## Run it

Prereqs: `opencode` on PATH (1.17.x) and authed against a provider
(`opencode auth list` — this repo's runs used OpenRouter).

```bash
# from the web-ade repo root — all flags optional
npx tsx src/lib/authoring/core/run.ts

# or target a repo / ask a specific question / pin a model
npx tsx src/lib/authoring/core/run.ts \
  --repo-root . \
  --question "How does POST /api/trails validate payloads?" \
  --model openrouter/nvidia/nemotron-3-super-120b-a12b:free
```

Exit code is `0` only when the payload passes `validatePayload()` and every
marker resolves to real lines. The assembled payload is written to
`src/lib/authoring/.out/trail-payload.json` (gitignored).

### Stage L2 — publish to a local web-ade (eyes-on render)

Add `--publish` to POST the validated payload to a running web-ade and get back
a `/trail/{id}` URL to open in File City (and in the iOS simulator, whose dev
build already points at `localhost:3000`). owner/repo are derived from the
checkout's GitHub origin; the token is the **user's** GitHub token (see
`docs/hosted-trail-authoring.md` §9 — host-side publish, never from the VM).

```bash
# in one shell: a local web-ade on :3000  →  npm run dev
# then publish (reads the user's token out of .env.local):
GITHUB_TOKEN=$(grep -E '^GITHUB_TOKEN=' .env.local | cut -d= -f2-) \
  npx tsx src/lib/authoring/core/run.ts --publish
# → 🌐 published: http://localhost:3000/trail/<id>
#
# flags: --host <url> (default :3000) · --owner/--repo (override origin) · --token <t>
```

### Model note (the one real gotcha)

opencode has **no implicit default model**, so the runner passes one
(`DEFAULT_MODEL` in `run.ts`). Pick carefully: most OpenRouter `:free`
endpoints either silently drop function-calling (the agent answers in prose
and never calls `emit_trail`) or cap output tokens below what opencode
requests (hard 400). Verified working free model:
`openrouter/nvidia/nemotron-3-super-120b-a12b:free` — though free tiers are
rate-limited and occasionally time out; re-run, or use a cheap paid model
(e.g. `openrouter/openai/gpt-oss-120b`, ~$0.001/run) for reliability.

## Layout — the reuse seam

```
core/                 ← identical on a laptop and inside a Freestyle VM
  brief.ts            ← system prompt (from the author-investigation-trail skill)
  drive.ts            ← @opencode-ai/sdk: serve + session + capture emit_trail
  assemble.ts         ← flat args → TrailPayload (pure)
  validate.ts         ← validatePayload() + marker-vs-tree resolution
  run.ts              ← LOCAL env wrapper: git sha, copy asset, drive→assemble→validate, (--publish)
  types.ts
publish.ts            ← host-side POST /api/trails with the user's token (L2 + Stage 3 share it)
opencode-assets/
  .opencode/tool/emit_trail.ts   ← copied into the checkout so opencode finds it
env/
  freestyle.ts        ← STAGE 3 STUB: boot VM + clone + run the SAME core + publish
```

Everything in `core/` is environment-agnostic and produces a validated
`TrailPayload`. Only the `env/*` wrapper swaps (local fs vs Freestyle
boot+clone, host-side publish). See `docs/hosted-trail-authoring.md` for the
full staged plan and `project_hosted_trail_authoring` memory for the design
decisions behind this split.

## How capture works

`emit_trail` is a file-based opencode tool (`@opencode-ai/plugin`). The runner
reads the call's args primarily off the prompt response's parts, and falls back
to the JSON the handler writes to `EMIT_TRAIL_OUT`. Both are local to wherever
opencode runs, so the mechanism is identical local and in-VM.

In practice the **fallback carries most runs**: with the nemotron free model the
tool call did not surface as a `tool` part in the prompt response, but the
handler executed and wrote the file. Keep both paths — capture from the event
stream (`client.event.subscribe`, see the electron-app runner) is a third option
if a model surfaces tool parts only on the stream.
