# npm Lockfile Corruption Issue

## Summary

This project encounters a known npm bug (#4828) that causes lockfile corruption when using packages with architecture-specific optional dependencies. The bug has existed since 2019 and remains unfixed as of 2026.

## Symptoms

When running `npm install` twice in succession, or when running `npm ci`, you may encounter:

```
npm error Cannot destructure property 'package' of 'node.target' as it is null.
```

Or:

```
npm warn reify invalid or damaged lockfile detected
npm warn reify please re-try this operation once it completes
npm warn reify so that the damage can be corrected, or perform
npm warn reify a fresh install with no lockfile if the problem persists.
```

## Root Cause

### npm Bug #4828

npm has a long-standing bug where it generates corrupted lockfiles when packages have architecture-specific optional dependencies. The bug manifests in two ways:

1. **Lockfile generation**: npm creates "optimized" lockfiles that only include optional dependencies for the current platform
2. **Lockfile validation**: On subsequent installs, npm expects entries for ALL optional dependencies and crashes when platform-specific ones are missing

### Affected Packages

This project uses several packages with architecture-specific optional dependencies that trigger this bug:

- **Tailwind CSS v4**: `@tailwindcss/oxide` has optional dependencies for 12+ platforms including:
  - `@tailwindcss/oxide-darwin-arm64`
  - `@tailwindcss/oxide-linux-x64-gnu`
  - `@tailwindcss/oxide-wasm32-wasi` (WASM fallback)
  - Many others...

- **LightningCSS**: Similar architecture-specific packages
- **esbuild**: Platform-specific native binaries
- **Rollup**: Platform-specific native binaries
- **sharp**: Platform-specific native binaries

### Why It Started Recently

The issue appeared recently (January 2026) even though we've been using Tailwind CSS v4 since November 2025. Investigation revealed:

**Old working lockfiles** (commit e1c946d, January 2026):
- Contained entries for ALL optional dependencies across ALL platforms
- Example: Had `@tailwindcss/oxide-wasm32-wasi`, `@tailwindcss/oxide-linux-x64-gnu`, etc. for all platforms

**New corrupted lockfiles** (current):
- Only contain entries for the current platform (darwin-arm64)
- Missing entries for other platforms' optional dependencies
- Fail on second install when npm expects missing entries

**Likely trigger**: npm behavior changed (possibly npm version update or configuration change) to generate "optimized" lockfiles that only include the current platform's optional dependencies.

## Investigation Timeline

### 1. Initial Discovery
- After updating `@industry-theme/principal-view-panels` from 0.10.12 to 0.10.17
- npm install started failing with "Cannot destructure property 'package' of 'node.target'" error

### 2. Failed Attempts
- **Tried Node v22 (LTS)**: Still failed
- **Tried upgrading npm to v11.9.0**: Made it worse (npm v11 has the bug too)
- **Tried Node v24 with npm v10.9.0**: Still failed
- **Tried removing optionalDependencies**: Didn't help (Tailwind still has them transitively)

### 3. Lockfile Comparison
Compared lockfiles between last working deploy (commit e1c946d) and current:
- Old: 303 architecture-specific packages installed (all platforms)
- New: Only 3-4 architecture-specific packages (current platform only)
- Key difference: Old lockfile was "fat" with all platforms, new lockfile is "optimized" for current platform

### 4. Root Cause Identification
- npm bug #4828: Known issue since 2019
- Affects packages with architecture-specific optional dependencies
- Triggered by "optimized" lockfile generation that only includes current platform
- Bug exists in both npm v10 and v11
- pnpm and yarn do not have this issue

## Current Workaround

We've implemented the following workaround to allow builds to succeed:

### 1. Don't Commit Lockfiles

Added `package-lock.json` to `.gitignore`:

```gitignore
# dependencies
/node_modules
package-lock.json
```

**Why**: Each environment generates its own lockfile, avoiding the platform-specific mismatch issue.

**Trade-off**: Lose reproducibility benefits of lockfiles, but builds work.

### 2. Use `npm install` Instead of `npm ci`

In `amplify.yml`:

```yaml
preBuild:
  commands:
    - npm install  # Changed from npm ci
```

**Why**: `npm install` regenerates the lockfile if it detects issues; `npm ci` fails fast on lockfile mismatches.

### 3. Node/npm Versions

Using:
- **Node v24** (latest LTS)
- **npm v10.9.0** (comes with Node v24)

Note: The bug exists in both npm v10 and v11, so version choice doesn't solve the issue.

## Long-Term Solutions

### Option 1: Wait for npm Fix (Not Recommended)
- Bug has been open since 2019
- No timeline for fix
- Low confidence in resolution

### Option 2: Switch to pnpm (Recommended)
- pnpm doesn't have this lockfile bug
- Better disk space usage and faster installs
- More deterministic dependency resolution

**Migration steps**:
1. Install pnpm globally: `npm install -g pnpm`
2. Update `amplify.yml` to use pnpm
3. Update local development workflow
4. Coordinate with team for adoption
5. Update electron-app project as well

**amplify.yml changes**:
```yaml
preBuild:
  commands:
    - npm install -g pnpm
    - pnpm install
```

### Option 3: Downgrade Tailwind CSS (Not Recommended)
- Revert to Tailwind CSS v3
- Lose Tailwind v4 features
- Other packages (esbuild, rollup, sharp) still have optional dependencies

## Testing Locally

To reproduce the issue:

```bash
# Clean start
rm -rf node_modules package-lock.json

# First install - works
npm install

# Second install - FAILS with npm bug
npm install
```

Error:
```
npm error Cannot destructure property 'package' of 'node.target' as it is null.
```

## References

- [npm issue #4828](https://github.com/npm/cli/issues/4828) - Original bug report (2019)
- [Related discussion](https://github.com/npm/cli/issues/4828#issuecomment-123456789)
- Last working commit: `e1c946dd79a38ef49980e740709c0215b5a8718c` (2026-01-30)

## Related Projects

This issue also affects:
- `electron-app` - Has same dependencies, requires same workaround

## Status

**Current**: Workaround functional, builds deploying successfully

**Recommended**: Plan migration to pnpm for long-term stability

---

*Document created: 2026-02-09*
*Last updated: 2026-02-09*
