# npx trail fetcher

Goal: let an agent (or human) read a private trail without installing the app and without exposing their GitHub token to the agent.

## Shape

```
npx @yourorg/trail <trail-url-or-id>
```

- Resolves the user's GitHub token locally (in-process).
- Calls the existing trail GET endpoint with `Authorization: Bearer <token>`.
- Prints the trail JSON to stdout.

## Token sources (try in order)

1. `gh auth token` — most devs have the GitHub CLI authed.
2. `git credential fill` (protocol=https, host=github.com) — works for anyone with git creds in Keychain / Credential Manager.
3. OAuth Device Flow — last resort, no tooling required. Show the code, poll for the token, cache it under `~/.config/yourorg/trail/` for reuse.

If none succeed, exit with a human message pointing at `gh auth login`.

## Backend

Hits the existing routes — no server changes needed:

- `src/app/api/trails/by-id/[id]/route.ts`
- `src/app/api/trails/[owner]/[repo]/[id]/route.ts`

Auth already accepts `Authorization: Bearer <token>` via `getGitHubToken()` in `src/lib/auth/request.ts:15`. Access is gated by `checkRepoAccess()` in `src/lib/trails/github-access.ts:33`, which delegates to GitHub — if the token can read the repo, the trail is returned.

## Keeping the token out of the agent's view

The agent sees argv, stdout, stderr, and the exit code. The token must not appear in any of them.

- **Never accept the token via argv or env.** Both leak via `ps`, shell history, `printenv`. Source it internally.
- **stdout is trail JSON only.** Nothing else.
- **stderr is sanitized status.** On error, print `"403 from GitHub — token lacks repo scope"`, never the request headers or response body verbatim.
- **No disk writes containing the token** other than the device-flow cache (which lives in the user's own config dir, not in cwd).
- **No debug logging of headers.** If you add a `--verbose` flag, redact `Authorization`.

This is hygiene, not a security boundary — an agent with shell access can run `gh auth token` itself. The point is preventing accidental leakage in normal flow.

## Pickup checklist for tomorrow

- [ ] Scaffold `packages/trail-cli/` (or wherever single-purpose CLIs live in this repo).
- [ ] Implement token resolution (gh → git credential → device flow).
- [ ] Implement URL/id parser (accept full trail URL or bare id).
- [ ] Wire the fetch + stdout JSON output.
- [ ] Add error sanitization wrapper around the fetch.
- [ ] Smoke test against a private repo trail with `gh auth token` populated.
- [ ] Publish under `@yourorg/trail` so `npx` resolves it.
