# FileCityGuidePanel — Surface Wiring (web-ade)

> How the **File City guide** surface is hosted in web-ade: package contract,
> full owner/repo explorer host, and the minimal home/collection host
> (`RepoFileCityPane`). This doc is about *this* component only — not the
> left-rail About card and not the desktop `RepositoryProfilePanel`.

## What it is

`FileCityGuidePanel` comes from `@industry-theme/file-city-panel`. It is a
panel-framework panel that renders a 3D File City and switches chrome by
**mode**, driven by context data slices:

| Mode | Active when | What the user sees |
| --- | --- | --- |
| Idle | No tour/commit/readme/issue/PR/week slice data | Colored city (+ optional file-type legend) |
| Tour | `tour.data` set | Step walkthrough + city focus/highlights |
| Commit | `commit.data` set | Commit header + message markdown + changed files on city |
| Week | `weekCommits.data` set | This week’s commits list + city highlights (+ header fetch progress) |
| Readme | `readme.data` set | README markdown left + city + file-type legend |
| Issue | `issue.data` set | Issue header + body + affected files on city |
| Pull request | `pullRequest.data` set | PR header + body + changed files on city |

At most one of tour / commit / week / readme / issue / pullRequest should drive
the panel at a time. Host-supplied `highlightLayers` apply only in idle (or when
no mode-specific layers are derived).

**Package note:** web-ade pins `@industry-theme/file-city-panel` **^0.9.11**
(week mode + `WeekCommitsView.loading` header progress).

## Package contract (host responsibilities)

### Context (`FileCityGuidePanelContext`)

| Slice / field | Required? | Role |
| --- | --- | --- |
| `fileTree` | Yes | Builds the city; panel cannot render without a tree |
| `lineCounts` | Yes (may be empty) | Building heights |
| `tour` | Yes (may be `null`) | Introduction tour payload |
| `commit?` | Optional | Commit view |
| `weekCommits?` | Optional | This-week commits view (`loading` for header progress) |
| `readme?` | Optional | Native readme mode |
| `issue?` | Optional | Issue view |
| `pullRequest?` | Optional | PR view |
| `highlightLayers` | Yes (may be `null`) | Host layers when idle |
| `repository` | Yes (not a slice) | `{ id, path?, owner?, name? }` |

### Actions (`FileCityGuidePanelActions`)

| Action | Role |
| --- | --- |
| `openFile(path, line?)` | Host opens file (editor, source drawer, or external URL) |
| `fetchAudioUrls?` | Tour TTS; omit to hide audio controls |
| `closeCommit?` / `closeIssue?` / … | Mode exit; omit to hide close affordances |

### Common props (defaults)

Useful host knobs used in web-ade:

- `defaultIsolationMode`, `excludedFolders`
- `showColorLegend`, `showColorLegendToggle`, `showFileTreeToggle`
- `readmeMarkdownWidth` (e.g. `0.66` on home)
- `defaultSkipWelcome`

Import pattern (client-only; 3D/WebGL):

```ts
const FileCityGuidePanel = dynamic(
  () =>
    import('@industry-theme/file-city-panel').then((m) => m.FileCityGuidePanel),
  { ssr: false },
);
```

## Mount A — Owner/repo explorer (full host)

**Files**

- `src/app/[owner]/[repo]/RepoExplorerPage.tsx` — page shell, left/right panes
- Hooks: `useReadme`, `useCommitView`, `useIssueView`, `usePullRequestView`, …
- Tree / analysis: `RepoAnalysisContext`, GitHub tree fetch, trail/tour lists

**Layout**

```
RepoExplorerPage
├── Left rail (About + nav cards + lists)   ← see repo-about-surface.md
└── Right pane → FileCityGuidePanel
      context: fileTree, lineCounts, tour, commit, readme, issue, pullRequest,
               highlightLayers, repository
      actions: openFile → FileSourcePanel / selection state
               close* → clear selected sha/number
```

**Selection model (right pane driven by left rail)**

| Left rail action | Right pane effect |
| --- | --- |
| Guide switch → City | Clear readme + week → idle city |
| Guide switch → README | Set `activeReadmePath` → `readme` slice via `useReadme` |
| Guide switch → This week | `weekActive` → `useWeekCommits` → `weekCommits` slice |
| Select commit | `commit` slice; clear readme / week |
| Select issue / PR | `issue` / `pullRequest` slice; clear readme / week |
| Select tour | `tour` slice; collapse competing selections |
| Select file (idle) | Host layers / source drawer (not a guide “mode”) |

README auto-open preference is per-repo in `localStorage`
(`webade:readmeOpen:owner/repo`).

**Data sources (typical)**

- Tree: GitHub tree API (page-level state → `fileTree` slice)
- README content: `useReadme` → `/api/github/repo/...` file fetch → `ReadmeView`
- Week commits: `useWeekCommits` → list with `since`/`until` + per-sha detail
  (`WeekCommitsView`, header shows progress while `loading`)
- Commits / issues / PRs: dedicated hooks mapping API shapes to panel view types
- Tours: store / discovery → `IntroductionTour`
- Line counts / analysis: repo analysis cache when available

This is the **canonical full wiring** for the guide panel in web-ade.

## Mount B — Home / owner profile / collections (minimal host)

**File:** `src/components/home/RepoFileCityPane.tsx`

Self-contained right pane: load tree + root README, render guide in
**idle + readme** only (no tours, commits, issues, PRs).

**Call sites**

| Surface | How it selects the repo |
| --- | --- |
| Signed-in home | `SignedInHome` → `HomeTwoPane` `renderRightPane` → `RepoFileCityPane` |
| Owner profile | `OwnerProfilePage` when a repo is picked |
| Collection page | `CollectionPage` when a package/repo is picked |

**Wiring inside `RepoFileCityPane`**

```
owner + repo (+ optional readmePath override)
  │
  ├─ trpc.github.getTree → GitFileTreeBuilder → fileTree slice
  ├─ findRootReadme(filePaths) or readmePath prop
  ├─ useReadme(owner, repo, path) → readme slice
  └─ FileCityGuidePanel
       actions.openFile → window.open(GitHub blob URL)
       tour/commit/issue slices null
       lineCounts empty
```

**Org profile README exception:** pass `readmePath="profile/README.md"` for
`.github` profile repos (not root README).

**Errors:** large/unparseable trees surface a centered message instead of
mounting a broken city.

## Related UI that is *not* this panel

- **Repo about / overview** (left rail card) — `docs/repo-about-surface.md`
- **Desktop project hub** (`RepositoryProfilePanel`) — lives in electron-app;
  different product (clone lifecycle, heatmap banner, multi-clone). Do not treat
  it as a drop-in replacement for `FileCityGuidePanel`.

## Checklist for a new host of this panel

- [ ] Provide `fileTree` with loading/error semantics
- [ ] Provide `repository` id (`owner/name` style is fine)
- [ ] Decide which modes you need; leave unused optional slices `null` or omit
- [ ] Wire `openFile` to your product surface (GitHub, source drawer, desktop tab)
- [ ] If using readme mode: map content to `ReadmeView` (see `useReadme`)
- [ ] Client-only dynamic import if SSR
- [ ] Pin package version that includes the modes you use (≥ 0.9.x for
  readme/issue/PR)

## Key source paths

| Path | Role |
| --- | --- |
| `node_modules/@industry-theme/file-city-panel` | Panel package |
| `src/components/home/RepoFileCityPane.tsx` | Minimal host |
| `src/components/home/HomeTwoPane.tsx` | Home shell (right pane slot) |
| `src/components/home/SignedInHome.tsx` | Connected home → `RepoFileCityPane` |
| `src/app/[owner]/[repo]/RepoExplorerPage.tsx` | Full host |
| `src/hooks/useReadme.ts` | README → `ReadmeView` |
| `src/hooks/useCommitView.ts` | Commit → `CommitView` |
| `src/hooks/useIssueView.ts` | Issue → issue view type |
| `src/hooks/usePullRequestView.ts` | PR → PR view type |
