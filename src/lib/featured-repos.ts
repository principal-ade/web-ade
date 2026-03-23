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
  {
    owner: 'pingdotgg',
    repo: 't3code',
  },
  {
    owner: 'iamlukethedev',
    repo: 'Claw3D',
  },
  {
    owner: 'openclaw',
    repo: 'openclaw',
  },
  {
    owner: 'paperclipai',
    repo: 'paperclip',
  },
  {
    owner: 'Dimillian',
    repo: 'CodexMonitor',
  },
  {
    owner: 'ubicloud',
    repo: 'ubicloud',
  },
  {
    owner: 'different-ai',
    repo: 'openwork',
  },
  {
    owner: 'ghostty-org',
    repo: 'ghostty',
  },
  {
    owner: 'rivet-dev',
    repo: 'secure-exec',
  },
  {
    owner: 'yazinsai',
    repo: 'OpenOats',
  },
  {
    owner: 'tigerbeetle',
    repo: 'tigerbeetle',
  },
];

/**
 * Get the full name of a repo (owner/repo format)
 */
export function getRepoFullName(repo: FeaturedRepo): string {
  return `${repo.owner}/${repo.repo}`;
}
