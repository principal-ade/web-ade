/**
 * GitHub Collections Repository Manager
 *
 * Handles GitHub-specific repository operations for collections storage.
 * Centralizes repo naming and visibility logic.
 */

export const PUBLIC_REPO_NAME = 'principal-ai-collections';
export const PRIVATE_REPO_NAME = 'principal-ai-collections-private';

export type CollectionVisibility = 'public' | 'private';

/**
 * Get the repository name based on visibility
 */
export function getRepoName(visibility: CollectionVisibility): string {
  return visibility === 'private' ? PRIVATE_REPO_NAME : PUBLIC_REPO_NAME;
}

/**
 * Check if a collections repository exists for a given owner
 */
export async function checkRepoExists(
  token: string,
  owner: string,
  visibility: CollectionVisibility
): Promise<boolean> {
  const repoName = getRepoName(visibility);
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repoName}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    }
  );

  return response.ok;
}

/**
 * Create a collections repository for a user
 */
export async function createCollectionsRepo(
  token: string,
  visibility: CollectionVisibility
): Promise<{ success: boolean; repoUrl?: string; error?: string }> {
  const repoName = getRepoName(visibility);
  const isPrivate = visibility === 'private';

  const response = await fetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: repoName,
      description: `My ${isPrivate ? 'private ' : ''}collections - synced repository collections`,
      private: isPrivate,
      auto_init: true,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    return { success: false, error: error.message || 'Failed to create repository' };
  }

  const repo = await response.json();
  return { success: true, repoUrl: repo.html_url };
}

/**
 * Check user's permission on a collections repository
 * Uses the repo API which returns permissions for the authenticated user
 */
export async function checkRepoPermissions(
  token: string,
  owner: string,
  visibility: CollectionVisibility
): Promise<{ canEdit: boolean; permission: 'admin' | 'write' | 'read' | 'none' }> {
  const repoName = getRepoName(visibility);

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repoName}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    }
  );

  if (!response.ok) {
    return { canEdit: false, permission: 'none' };
  }

  const repo = await response.json();

  // The repo API returns permissions object for authenticated user
  if (repo.permissions) {
    if (repo.permissions.admin) {
      return { canEdit: true, permission: 'admin' };
    }
    if (repo.permissions.push) {
      return { canEdit: true, permission: 'write' };
    }
    if (repo.permissions.pull) {
      return { canEdit: false, permission: 'read' };
    }
  }

  return { canEdit: false, permission: 'none' };
}
