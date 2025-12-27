/**
 * Utility to extract GitHub remote information from .git/config content
 *
 * Supports various git remote URL formats:
 * - SSH: git@github.com:owner/repo.git
 * - HTTPS: https://github.com/owner/repo.git
 * - HTTPS without .git: https://github.com/owner/repo
 */

export interface GitRemoteInfo {
  owner: string;
  repo: string;
  fullName: string; // "owner/repo" format
}

/**
 * Parse a git remote URL to extract owner and repo
 * @param url - The remote URL (SSH or HTTPS format)
 * @returns GitRemoteInfo or null if not a valid GitHub URL
 */
export function parseGitRemoteUrl(url: string): GitRemoteInfo | null {
  // SSH format: git@github.com:owner/repo.git
  const sshMatch = url.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (sshMatch && sshMatch[1] && sshMatch[2]) {
    const owner = sshMatch[1];
    const repo = sshMatch[2];
    return {
      owner,
      repo,
      fullName: `${owner}/${repo}`,
    };
  }

  // HTTPS format: https://github.com/owner/repo.git or https://github.com/owner/repo
  const httpsMatch = url.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/
  );
  if (httpsMatch && httpsMatch[1] && httpsMatch[2]) {
    const owner = httpsMatch[1];
    const repo = httpsMatch[2];
    return {
      owner,
      repo,
      fullName: `${owner}/${repo}`,
    };
  }

  return null;
}

/**
 * Parse a .git/config file content to extract the origin remote
 * @param configContent - The content of the .git/config file
 * @returns GitRemoteInfo or null if no valid GitHub origin found
 */
export function parseGitConfig(configContent: string): GitRemoteInfo | null {
  // Look for [remote "origin"] section and extract url
  const lines = configContent.split('\n');
  let inOriginSection = false;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Check for [remote "origin"] section start
    if (trimmedLine.match(/^\[remote\s+"origin"\]$/i)) {
      inOriginSection = true;
      continue;
    }

    // Check for start of a different section
    if (trimmedLine.startsWith('[') && inOriginSection) {
      inOriginSection = false;
      continue;
    }

    // Look for url = ... within origin section
    if (inOriginSection) {
      const urlMatch = trimmedLine.match(/^url\s*=\s*(.+)$/i);
      if (urlMatch && urlMatch[1]) {
        const url = urlMatch[1].trim();
        return parseGitRemoteUrl(url);
      }
    }
  }

  return null;
}

/**
 * Read .git/config from a FileSystemDirectoryHandle and parse it
 * @param rootHandle - The root directory handle of the repository
 * @returns GitRemoteInfo or null if not a git repo or no GitHub origin
 */
export async function getGitRemoteFromHandle(
  rootHandle: FileSystemDirectoryHandle
): Promise<GitRemoteInfo | null> {
  try {
    // Try to get .git directory
    const gitDirHandle = await rootHandle.getDirectoryHandle('.git');

    // Try to get config file
    const configHandle = await gitDirHandle.getFileHandle('config');
    const file = await configHandle.getFile();
    const content = await file.text();

    return parseGitConfig(content);
  } catch {
    // .git directory or config file doesn't exist
    return null;
  }
}
