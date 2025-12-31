'use client';

import React, { useState } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { User } from 'lucide-react';

/** Repository info with optional source repository for forks */
export interface RepositoryInfo {
  /** Repository ID in format "owner/repo" */
  repositoryId: string;
  /** Source repository info if this is a fork */
  sourceRepository?: {
    owner: string;
    name: string;
  };
}

interface AvatarStackProps {
  /** Repository info objects with optional source repository metadata */
  repositories: RepositoryInfo[];
  /** Maximum number of avatars to show */
  maxAvatars?: number;
  /** Size of each avatar in pixels */
  size?: number;
}

/**
 * Extract unique owners from repositories and generate GitHub avatar URLs
 * Uses source repository owner for forks when available
 */
function getAvatarUrls(repositories: RepositoryInfo[], maxAvatars: number): string[] {
  const owners = new Set<string>();

  for (const repo of repositories) {
    // Use source repository owner for forks, otherwise use the repo owner
    const owner = repo.sourceRepository?.owner || repo.repositoryId.split('/')[0];
    if (owner) {
      owners.add(owner);
    }
    if (owners.size >= maxAvatars) break;
  }

  // Use avatars.githubusercontent.com for more reliable loading
  return Array.from(owners).map(owner => `https://avatars.githubusercontent.com/${owner}?size=64`);
}

/**
 * Single avatar with fallback to placeholder
 */
const Avatar: React.FC<{
  url?: string;
  size: number;
  index: number;
  theme: ReturnType<typeof useTheme>['theme'];
}> = ({ url, size, index, theme }) => {
  const [hasError, setHasError] = useState(false);

  const containerStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    border: `2px solid ${theme.colors.surface}`,
    marginLeft: index === 0 ? 0 : -size / 3,
    position: 'relative',
    zIndex: 10 - index,
    backgroundColor: theme.colors.border,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  };

  if (!url || hasError) {
    return (
      <div style={containerStyle}>
        <User size={size * 0.5} color={theme.colors.textSecondary} />
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <img
        src={url}
        alt="Repository owner"
        referrerPolicy="no-referrer"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
        onError={() => setHasError(true)}
      />
    </div>
  );
};

/**
 * AvatarStack - Displays overlapping avatars for repository owners
 */
export function AvatarStack({
  repositories,
  maxAvatars = 4,
  size = 32
}: AvatarStackProps) {
  const { theme } = useTheme();

  const avatarUrls = getAvatarUrls(repositories, maxAvatars);

  // Count unique owners (using source repo owner for forks)
  const uniqueOwners = new Set(
    repositories.map(r => r.sourceRepository?.owner || r.repositoryId.split('/')[0])
  );
  const remainingCount = repositories.length > 0
    ? Math.max(0, uniqueOwners.size - maxAvatars)
    : 0;

  // If no repositories, show placeholder avatars
  if (avatarUrls.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {[0, 1, 2].map((index) => (
          <Avatar key={index} size={size} index={index} theme={theme} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {avatarUrls.map((url, index) => (
        <Avatar key={url} url={url} size={size} index={index} theme={theme} />
      ))}
      {remainingCount > 0 && (
        <div
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            border: `2px solid ${theme.colors.surface}`,
            marginLeft: -size / 3,
            position: 'relative',
            zIndex: 10 - avatarUrls.length,
            backgroundColor: theme.colors.primary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: size * 0.35,
            fontWeight: 600,
            color: theme.colors.textOnPrimary,
            flexShrink: 0,
          }}
        >
          +{remainingCount}
        </div>
      )}
    </div>
  );
}
