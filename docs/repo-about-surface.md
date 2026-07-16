# Repo About Surface — Wiring (web-ade)

> How the **repository About** UI is built and fed in web-ade: the full
> owner/repo card (`RepoOverview`) and the presentational home-oriented card
> (`RepoAboutCard`). This doc is about the left-rail About surface only — not
> `FileCityGuidePanel` and not the desktop `RepositoryProfilePanel`.

## What it is

The About surface answers: *what is this repo, who works on it, and how do I
open the README / jump into deeper left-rail views?*

It is intentionally **presentational + host-fed** (or host-local fetch next to
the card). It does not own the File City; it *signals* the right pane (e.g.
toggle readme mode) via callbacks.

Two implementations share the same visual product:

| Component | Kind | Used where |
| --- | --- | --- |
| `RepoOverview` | Connected (fetches + analysis) | Owner/repo explorer left rail |
| `RepoAboutCard` | Presentational (props only) | Designed for signed-in home left panel; Storybook today |

`RepoAboutCard` is the portable extract of `RepoOverview` for hosts that already
have GitHub meta (or want Storybook isolation).

## Visual content (shared product)

Regardless of host:

- Repo name (link to GitHub)
- Star count; optional star **toggle** (caller owns auth + API)
- License badge (shape/color by SPDX family)
- Description
- Facts row: created/relative age, fork parent, optional file count / total lines
- Top contributor faces (cap ~4) with optional commits vs lines metric on full overview
- Optional **README** button (`readmePath` + `onOpenReadme` / `readmeActive`)

Skeleton when `info` is null and `loading` is true; null render when load
settled with no data (overview) or empty (card).

## Mount A — Owner/repo explorer (`RepoOverview`)

**File:** `src/app/[owner]/[repo]/RepoExplorerPage.tsx` (inline `RepoOverview`
and related hooks/caches in the same module).

**Placement:** top of the left rail “tours/about” view (`ToursPane`), above nav
cards (Activity, Issues, PRs, Contributors, Structure, Trails).

```
Left rail (tours view)
├── RepoOverview          ← this surface
│     warmRepoOverview(owner, repo) at page mount
│     useRepoOverviewData / useRepoContributorsData
│     useRepoAnalysis (optional lines/fileCount, commits↔lines toggle)
│     star GET/PUT/DELETE /api/github/star/:owner/:repo
├── README button (via overview CTA / ToursPane props)
├── Tour CTA (when single tour)
└── Nav cards → slide to activity / issues / …
```

**Data pipeline**

| Concern | Mechanism |
| --- | --- |
| Repo metadata | Shared cache + inflight map; `warmRepoOverview` on page mount so first paint is often warm |
| Contributors | GitHub contributor graph cache; analysis shortlog fallback when graph empty |
| Line ownership | Cached repo analysis (`useRepoAnalysis`) — not fetched on About alone |
| Star state | Only when authenticated |
| README path | `findReadmePath(filePaths)` from loaded tree; toggle lives on parent |

**Callbacks into the page**

- `onSelectContributor` → open Contributors view focused on that person
- README open/close → parent sets `activeReadmePath` and clears competing
  selections (see `docs/file-city-guide-panel-surface.md` for right-pane effect)

**Not in this card:** trail list, package structure, activity feed — those are
sibling left-rail views.

## Mount B — Home-oriented card (`RepoAboutCard`)

**Files**

- `src/components/home/RepoAboutCard.tsx` — presentational
- `src/components/home/RepoAboutCard.stories.tsx` — Storybook matrix

**Props contract**

```ts
// Core
owner, repo
info: RepoAboutInfo | null   // description, stargazers_count, created_at, license, fork, parent
loading?: boolean
contributors?: RepoAboutContributor[] | null

// Optional facts / actions
fileCount?, totalLines?
onSelectContributor?
starred?, onToggleStar?, starLoading?
readmePath?, onOpenReadme?, readmeActive?
showBorder?
```

No data fetching, no `RepoAnalysisProvider`. A future connected wrapper should
feed GitHub (or tRPC) the same way `SignedInHome` feeds `UserAboutCard`.

**Intended placement (not fully wired yet)**

Signed-in home left panel (`HomeLeftPanel`) currently shows only
`UserAboutCard` on the overview. Product intent (align with owner/repo + desktop
home prep):

- Track `selectedRepoFullName` when the user picks a project (already used for
  list highlight + right pane)
- Show `RepoAboutCard` for that selection (overview or sub-view header region)
- `onOpenReadme` → drive `RepoFileCityPane` / guide readme mode on the right

Until that lands, treat Storybook as the live contract for the card UI.

## Data shapes

```ts
interface RepoAboutInfo {
  description?: string | null;
  stargazers_count: number;
  created_at: string;
  license?: { spdx_id?: string | null } | null;
  fork?: boolean;
  parent?: { full_name: string } | null;
}

interface RepoAboutContributor {
  id: number;
  login: string;
  avatar_url: string;
  html_url: string;
  contributions: number;
}
```

`RepoOverview` may show richer contributor cards (lines %, FLIP between
commits/lines modes) when analysis coverage exists; `RepoAboutCard` stays on
the simpler GitHub-contributor faces unless the host passes counts only.

## Separation from File City

| About surface | File City guide |
| --- | --- |
| Left rail / identity card | Right pane 3D panel |
| GitHub meta + people | Tree + mode slices |
| README **button** | README **mode** content |
| Does not import `FileCityGuidePanel` | Does not render About |

Hosts compose both (owner/repo, future home). Do not merge them into one
component.

## Checklist for a new host of About

- [ ] Resolve `owner` / `repo` (or full_name)
- [ ] Fetch or pass `RepoAboutInfo` (+ loading skeleton)
- [ ] Optionally fetch contributors
- [ ] Wire star only if authenticated and APIs exist
- [ ] If README button: resolve path from tree; toggle parent state for guide
- [ ] Prefer `RepoAboutCard` when you own fetching; use `RepoOverview` patterns
  only inside the explorer unless you extract shared hooks

## Key source paths

| Path | Role |
| --- | --- |
| `src/app/[owner]/[repo]/RepoExplorerPage.tsx` | `RepoOverview`, warm caches, ToursPane |
| `src/components/home/RepoAboutCard.tsx` | Presentational About for home-style hosts |
| `src/components/home/HomeLeftPanel.tsx` | Home left rail (About not yet for selected repo) |
| `src/components/home/SignedInHome.tsx` | Connected home data |
| `src/components/home/UserAboutCard.tsx` | User-level sibling (not repo About) |
| `docs/file-city-guide-panel-surface.md` | Right-pane partner surface |
