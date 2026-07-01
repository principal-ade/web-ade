// Shared helpers for the header repo opener / search bar. Kept out of any one
// component so both the owner/repo explorer header and the signed-in home header
// read the same `recent-repositories` localStorage and parse paths identically.

// Minimal shape of a repo for the opener's typeahead — satisfied by both
// `/api/github/search` results and the persisted `recent-repositories` entries.
export interface HeaderRepoSearchItem {
  full_name: string;
  name: string;
  owner: { login: string; avatar_url: string };
  description?: string | null;
  stargazers_count?: number;
}

// localStorage key shared with the legacy repo page / RecentRepositoriesPanel
// (written via `addRecentRepository`). Each entry is a full GitHub repo object.
export const RECENT_REPOS_KEY = 'recent-repositories';

// Parse a pasted GitHub link or `owner/repo` path into its parts, or null when
// the text isn't a direct repo reference (so it should be treated as a search).
export function parseGithubRepoPath(
  input: string,
): { owner: string; repo: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const stripped = trimmed
    .replace(/^https?:\/\//i, '')
    .replace(/^github\.com\//i, '')
    .replace(/^\/+/, '');
  const [owner, repoRaw] = stripped.split('/');
  if (!owner || !repoRaw) return null;
  const repo = repoRaw.replace(/\.git$/i, '');
  if (!repo) return null;
  return { owner, repo };
}

// Read the persisted recently-visited repos, narrowed to the fields the opener
// needs and tolerant of older/partial entries.
export function readRecentRepos(): HeaderRepoSearchItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(RECENT_REPOS_KEY) ?? '[]',
    );
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((it): HeaderRepoSearchItem[] => {
      if (it == null || typeof it !== 'object') return [];
      const o = it as Record<string, unknown>;
      const owner = o.owner as Record<string, unknown> | undefined;
      if (
        typeof o.full_name !== 'string' ||
        !owner ||
        typeof owner.login !== 'string' ||
        typeof owner.avatar_url !== 'string'
      ) {
        return [];
      }
      return [
        {
          full_name: o.full_name,
          name:
            typeof o.name === 'string'
              ? o.name
              : o.full_name.split('/')[1] ?? o.full_name,
          owner: { login: owner.login, avatar_url: owner.avatar_url },
          description: typeof o.description === 'string' ? o.description : null,
          stargazers_count:
            typeof o.stargazers_count === 'number'
              ? o.stargazers_count
              : undefined,
        },
      ];
    });
  } catch {
    return [];
  }
}
