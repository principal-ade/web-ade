/**
 * Hardcoded list of featured repositories for the activity feed
 * These are popular/interesting repos to showcase on the home page
 */

export interface FeaturedRepo {
  owner: string;
  repo: string;
  description?: string;
}

export const FEATURED_REPOS: FeaturedRepo[] = [
  {
    owner: 'garrytan',
    repo: 'gstack',
    description: 'Full-stack web application template',
  },
  // Add more repos here as needed
];

/**
 * Get the full name of a repo (owner/repo format)
 */
export function getRepoFullName(repo: FeaturedRepo): string {
  return `${repo.owner}/${repo.repo}`;
}
