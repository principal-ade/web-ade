/**
 * Utilities for tracking File City tour shown state in localStorage
 */

const TOUR_STORAGE_KEY = 'web-ade.fileCityTour.shownRepos';

/**
 * Get the set of repositories where the tour has been shown
 */
function getShownRepos(): Set<string> {
  if (typeof window === 'undefined') return new Set();

  try {
    const stored = localStorage.getItem(TOUR_STORAGE_KEY);
    if (!stored) return new Set();
    const array = JSON.parse(stored) as string[];
    return new Set(array);
  } catch (error) {
    console.warn('[TourStorage] Failed to read localStorage:', error);
    return new Set();
  }
}

/**
 * Save the set of repositories where the tour has been shown
 */
function saveShownRepos(repos: Set<string>): void {
  if (typeof window === 'undefined') return;

  try {
    const array = Array.from(repos);
    localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(array));
  } catch (error) {
    console.warn('[TourStorage] Failed to write localStorage:', error);
  }
}

/**
 * Check if the tour has been shown for a specific repository
 * @param owner - Repository owner
 * @param repo - Repository name
 * @returns true if the tour has been shown for this repo, false otherwise
 */
export function hasTourBeenShown(owner: string, repo: string): boolean {
  const repoKey = `${owner}/${repo}`;
  const shownRepos = getShownRepos();
  return shownRepos.has(repoKey);
}

/**
 * Mark the tour as shown for a specific repository
 * @param owner - Repository owner
 * @param repo - Repository name
 */
export function markTourAsShown(owner: string, repo: string): void {
  const repoKey = `${owner}/${repo}`;
  const shownRepos = getShownRepos();

  if (shownRepos.has(repoKey)) {
    // Already marked, no need to update
    return;
  }

  shownRepos.add(repoKey);
  saveShownRepos(shownRepos);
  console.log('[TourStorage] Marked tour as shown for:', repoKey);
}

/**
 * Clear the tour shown state for a specific repository
 * (useful for testing or resetting the tour)
 * @param owner - Repository owner
 * @param repo - Repository name
 */
export function clearTourShownState(owner: string, repo: string): void {
  const repoKey = `${owner}/${repo}`;
  const shownRepos = getShownRepos();

  if (!shownRepos.has(repoKey)) {
    // Not marked, no need to update
    return;
  }

  shownRepos.delete(repoKey);
  saveShownRepos(shownRepos);
  console.log('[TourStorage] Cleared tour shown state for:', repoKey);
}
