import React, { useCallback, useState, useMemo, useEffect } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { ArrowRight, Search, ExternalLink, Github, User, Building2, Clock, GitFork, FolderOpen, Library } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useUserCollections } from '@/contexts/UserCollectionsContext';
import { AvatarStack, type RepositoryInfo } from './collections/AvatarStack';
import type { Collection } from '@principal-ai/alexandria-collections';

const RECENT_REPOSITORIES_KEY = 'recent-repositories';
const RECENT_OWNERS_KEY = 'recent-owners';

interface RecentRepository {
  owner: string;
  repo: string;
  visitedAt: string;
}

interface RecentOwner {
  owner: string;
  visitedAt: string;
}

/**
 * Repository with collection context for search results
 */
interface RepositorySearchResult {
  repo: RepositoryInfo;
  collection: CuratedCollection;
}


/**
 * Curated collection of repositories
 */
export interface CuratedCollection {
  id: string;
  name: string;
  description: string;
  icon?: string;
  theme?: string;
  repositories?: RepositoryInfo[];
}

/**
 * Props for the WelcomePanel
 */
export interface WelcomePanelProps {
  curatedCollections?: CuratedCollection[];
  onCollectionClick?: (collectionId: string) => void;
  onRepositoryClick?: (collectionId: string, repositoryId: string) => void;
  loading?: boolean;
}

/**
 * GitHub repo from user repos API
 */
interface UserGitHubRepo {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
    avatar_url: string;
    type: string;
  };
  private: boolean;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  updated_at: string;
}

/**
 * Organization with repositories from user repos API
 */
interface UserOrganization {
  id: number;
  login: string;
  avatar_url: string;
  description: string | null;
  repositories: UserGitHubRepo[];
}

/**
 * Response from /api/github/user/repos
 */
interface UserReposResponse {
  isAuthenticated: boolean;
  owned: UserGitHubRepo[];
  starred: UserGitHubRepo[];
  organizations: UserOrganization[];
}


/**
 * Skeleton card component for loading state
 */
const SkeletonCard: React.FC<{
  theme: ReturnType<typeof useTheme>['theme'];
}> = ({ theme }) => {
  return (
    <div
      style={{
        padding: '20px 24px',
        borderRadius: '12px',
        backgroundColor: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      {/* Header row skeleton */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div
          style={{
            width: 140,
            height: 20,
            borderRadius: '4px',
            backgroundColor: theme.colors.border,
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
        <div
          style={{
            width: 60,
            height: 24,
            borderRadius: '12px',
            backgroundColor: theme.colors.border,
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
      </div>
      {/* Description skeleton */}
      <div
        style={{
          width: '100%',
          height: 16,
          borderRadius: '4px',
          backgroundColor: theme.colors.border,
          animation: 'pulse 1.5s ease-in-out infinite',
        }}
      />
      {/* Button skeleton */}
      <div
        style={{
          width: 120,
          height: 32,
          borderRadius: '6px',
          backgroundColor: theme.colors.border,
          animation: 'pulse 1.5s ease-in-out infinite',
        }}
      />
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
};

/**
 * Collection card component - matches mockup with horizontal layout
 */
const CollectionCard: React.FC<{
  collection: CuratedCollection;
  theme: ReturnType<typeof useTheme>['theme'];
  onClick: () => void;
}> = ({ collection, theme, onClick }) => {
  return (
    <div
      style={{
        padding: '20px 24px',
        borderRadius: '12px',
        backgroundColor: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = theme.colors.primary;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = theme.colors.border;
      }}
      onClick={onClick}
    >
      {/* Header row: Name and avatar stack */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div
          style={{
            fontSize: `${theme.fontSizes[3]}px`,
            fontWeight: theme.fontWeights.semibold,
            color: theme.colors.text,
          }}
        >
          {collection.name}
        </div>
        <AvatarStack repositories={collection.repositories || []} size={28} maxAvatars={3} />
      </div>

      {/* Description */}
      <div
        style={{
          fontSize: `${theme.fontSizes[1]}px`,
          color: theme.colors.textSecondary,
          lineHeight: 1.5,
        }}
      >
        {collection.description}
      </div>

      {/* Open Collection button */}
      <button
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: `${theme.fontSizes[1]}px`,
          fontWeight: theme.fontWeights.semibold,
          color: theme.colors.text,
          backgroundColor: 'transparent',
          border: 'none',
          padding: '8px 0',
          cursor: 'pointer',
          transition: 'color 0.2s ease',
          width: 'fit-content',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = theme.colors.primary;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = theme.colors.text;
        }}
      >
        Open Collection
        <ArrowRight size={14} />
      </button>
    </div>
  );
};

/**
 * Repository card component for search results
 */
const RepositoryCard: React.FC<{
  result: RepositorySearchResult;
  theme: ReturnType<typeof useTheme>['theme'];
  onClick: () => void;
}> = ({ result, theme, onClick }) => {
  const { repo, collection } = result;
  // Use source repository (original) for display, fall back to fork info
  const displayOwner = repo.sourceRepository?.owner || repo.repositoryId.split('/')[0];
  const displayName = repo.sourceRepository?.name || repo.repositoryId.split('/')[1];

  // Check if this is a user repo or org repo
  const isUserRepo = collection.id === '__user_repos__';
  const isOrgRepo = collection.id.startsWith('__org_');

  return (
    <div
      style={{
        padding: '16px 20px',
        borderRadius: '12px',
        backgroundColor: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = theme.colors.primary;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = theme.colors.border;
      }}
      onClick={onClick}
    >
      {/* Repository avatar - uses original owner */}
      <img
        src={`https://avatars.githubusercontent.com/${displayOwner}?size=64`}
        alt={displayOwner}
        style={{
          width: 40,
          height: 40,
          borderRadius: '8px',
          flexShrink: 0,
        }}
        onError={(e) => {
          e.currentTarget.style.display = 'none';
        }}
      />

      {/* Repo info - shows original owner/name */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: `${theme.fontSizes[2]}px`,
            fontWeight: theme.fontWeights.semibold,
            color: theme.colors.text,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {displayOwner}/{displayName}
        </div>
        <div
          style={{
            fontSize: `${theme.fontSizes[0]}px`,
            color: theme.colors.textMuted,
            marginTop: '2px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          {isUserRepo && <User size={12} />}
          {isOrgRepo && <Building2 size={12} />}
          {isUserRepo || isOrgRepo ? collection.name : `in ${collection.name}`}
        </div>
      </div>

      {/* Arrow */}
      <ArrowRight size={16} style={{ color: theme.colors.textMuted, flexShrink: 0 }} />
    </div>
  );
};

/**
 * Recent item component for sidebar
 */
const RecentItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  theme: ReturnType<typeof useTheme>['theme'];
  onClick: () => void;
}> = ({ icon, label, sublabel, theme, onClick }) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 12px',
        borderRadius: '8px',
        cursor: 'pointer',
        transition: 'background-color 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = theme.colors.border;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent';
      }}
      onClick={onClick}
    >
      <img
        src={`https://avatars.githubusercontent.com/${label.split('/')[0]}?size=64`}
        alt={label}
        style={{
          width: 28,
          height: 28,
          borderRadius: '6px',
          flexShrink: 0,
        }}
        onError={(e) => {
          e.currentTarget.style.display = 'none';
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: `${theme.fontSizes[1]}px`,
            color: theme.colors.text,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </div>
        {sublabel && (
          <div
            style={{
              fontSize: `${theme.fontSizes[0]}px`,
              color: theme.colors.textMuted,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            {icon}
            {sublabel}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Collection item component for sidebar
 */
const CollectionItem: React.FC<{
  collection: Collection;
  repoCount: number;
  theme: ReturnType<typeof useTheme>['theme'];
  onClick: () => void;
}> = ({ collection, repoCount, theme, onClick }) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 12px',
        borderRadius: '8px',
        cursor: 'pointer',
        transition: 'background-color 0.15s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = theme.colors.border;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent';
      }}
      onClick={onClick}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: '6px',
          backgroundColor: theme.colors.surface,
          border: `1px solid ${theme.colors.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {collection.icon ? (
          <span style={{ fontSize: '14px' }}>{collection.icon}</span>
        ) : (
          <FolderOpen size={14} style={{ color: theme.colors.textMuted }} />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: `${theme.fontSizes[1]}px`,
            color: theme.colors.text,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {collection.name}
        </div>
        <div
          style={{
            fontSize: `${theme.fontSizes[0]}px`,
            color: theme.colors.textMuted,
          }}
        >
          {repoCount} {repoCount === 1 ? 'repo' : 'repos'}
        </div>
      </div>
    </div>
  );
};

/**
 * Recent Activity Sidebar component
 */
const RecentActivitySidebar: React.FC<{
  recentRepos: RecentRepository[];
  recentOwners: RecentOwner[];
  theme: ReturnType<typeof useTheme>['theme'];
  isAuthenticated: boolean;
  collections: Collection[];
  getCollectionRepositories: (collectionId: string) => string[];
}> = ({ recentRepos, recentOwners, theme, isAuthenticated, collections, getCollectionRepositories }) => {
  const [activeTab, setActiveTab] = useState<'recent' | 'collections'>('recent');
  const hasRecent = recentRepos.length > 0 || recentOwners.length > 0;

  // For non-authenticated users, only show if there are recent items
  if (!isAuthenticated && !hasRecent) {
    return null;
  }

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        padding: '32px 24px',
        borderLeft: `1px solid ${theme.colors.border}`,
        width: '25%',
        flexShrink: 0,
      }}
    >
      {/* Tab Header */}
      {isAuthenticated ? (
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={() => setActiveTab('recent')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              fontSize: `${theme.fontSizes[1]}px`,
              fontWeight: theme.fontWeights.semibold,
              color: activeTab === 'recent' ? theme.colors.text : theme.colors.textMuted,
              backgroundColor: activeTab === 'recent' ? theme.colors.surface : 'transparent',
              border: activeTab === 'recent' ? `1px solid ${theme.colors.border}` : '1px solid transparent',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              fontFamily: theme.fonts.body,
            }}
          >
            <Clock size={14} />
            Recent
          </button>
          <button
            onClick={() => setActiveTab('collections')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              fontSize: `${theme.fontSizes[1]}px`,
              fontWeight: theme.fontWeights.semibold,
              color: activeTab === 'collections' ? theme.colors.text : theme.colors.textMuted,
              backgroundColor: activeTab === 'collections' ? theme.colors.surface : 'transparent',
              border: activeTab === 'collections' ? `1px solid ${theme.colors.border}` : '1px solid transparent',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              fontFamily: theme.fonts.body,
            }}
          >
            <FolderOpen size={14} />
            Collections
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Clock size={16} style={{ color: theme.colors.textMuted }} />
          <h3
            style={{
              margin: 0,
              fontSize: `${theme.fontSizes[2]}px`,
              fontWeight: theme.fontWeights.semibold,
              color: theme.colors.text,
            }}
          >
            Recent
          </h3>
        </div>
      )}

      {/* Recent Tab Content */}
      {activeTab === 'recent' && (
        <>
          {/* Recent Repositories */}
          {recentRepos.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div
                style={{
                  fontSize: `${theme.fontSizes[0]}px`,
                  fontWeight: theme.fontWeights.medium,
                  color: theme.colors.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  padding: '0 12px',
                  marginBottom: '4px',
                }}
              >
                Repositories
              </div>
              {recentRepos.slice(0, 5).map((repo) => (
                <RecentItem
                  key={`${repo.owner}/${repo.repo}`}
                  icon={<GitFork size={10} />}
                  label={`${repo.owner}/${repo.repo}`}
                  sublabel={formatTimeAgo(repo.visitedAt)}
                  theme={theme}
                  onClick={() => {
                    window.location.href = `/${repo.owner}/${repo.repo}`;
                  }}
                />
              ))}
            </div>
          )}

          {/* Recent Owners */}
          {recentOwners.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div
                style={{
                  fontSize: `${theme.fontSizes[0]}px`,
                  fontWeight: theme.fontWeights.medium,
                  color: theme.colors.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  padding: '0 12px',
                  marginBottom: '4px',
                }}
              >
                Owners
              </div>
              {recentOwners.slice(0, 5).map((owner) => (
                <RecentItem
                  key={owner.owner}
                  icon={<User size={10} />}
                  label={owner.owner}
                  sublabel={formatTimeAgo(owner.visitedAt)}
                  theme={theme}
                  onClick={() => {
                    window.location.href = `/${owner.owner}`;
                  }}
                />
              ))}
            </div>
          )}

          {/* Empty state for Recent tab */}
          {!hasRecent && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '32px 16px',
                textAlign: 'center',
              }}
            >
              <Clock size={32} style={{ color: theme.colors.textMuted, marginBottom: '12px' }} />
              <p
                style={{
                  margin: 0,
                  fontSize: `${theme.fontSizes[1]}px`,
                  color: theme.colors.textMuted,
                }}
              >
                No recent activity
              </p>
            </div>
          )}
        </>
      )}

      {/* Collections Tab Content */}
      {activeTab === 'collections' && (
        <>
          {collections.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {collections.map((collection) => (
                <CollectionItem
                  key={collection.id}
                  collection={collection}
                  repoCount={getCollectionRepositories(collection.id).length}
                  theme={theme}
                  onClick={() => {
                    window.location.href = `/collections/${collection.id}`;
                  }}
                />
              ))}
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '32px 16px',
                textAlign: 'center',
              }}
            >
              <Library size={32} style={{ color: theme.colors.textMuted, marginBottom: '12px' }} />
              <p
                style={{
                  margin: 0,
                  fontSize: `${theme.fontSizes[1]}px`,
                  color: theme.colors.textMuted,
                  marginBottom: '16px',
                }}
              >
                No collections yet
              </p>
              <Link
                href="/library"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  fontSize: `${theme.fontSizes[1]}px`,
                  fontWeight: theme.fontWeights.semibold,
                  color: theme.colors.background,
                  backgroundColor: theme.colors.text,
                  borderRadius: '6px',
                  textDecoration: 'none',
                  transition: 'opacity 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '0.8';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '1';
                }}
              >
                Go to Library
                <ArrowRight size={14} />
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
};

/**
 * WelcomePanel - Displays curated collections and explore section
 */
/**
 * Parse a GitHub URL and extract owner/repo
 */
function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const trimmed = url.trim();

  // Handle owner/repo format directly
  const simpleMatch = trimmed.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (simpleMatch && simpleMatch[1] && simpleMatch[2]) {
    return { owner: simpleMatch[1], repo: simpleMatch[2] };
  }

  // Handle full GitHub URLs
  const urlMatch = trimmed.match(/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/);
  if (urlMatch && urlMatch[1] && urlMatch[2]) {
    return { owner: urlMatch[1], repo: urlMatch[2].replace(/\.git$/, '') };
  }

  return null;
}

export const WelcomePanel: React.FC<WelcomePanelProps> = ({
  curatedCollections = [],
  onCollectionClick,
  onRepositoryClick,
  loading = false,
}) => {
  const { theme } = useTheme();
  const { isAuthenticated } = useAuth();
  const { collections: userCollections, getCollectionRepositories } = useUserCollections();
  const [searchQuery, setSearchQuery] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [userRepos, setUserRepos] = useState<UserReposResponse | null>(null);
  const [recentRepos, setRecentRepos] = useState<RecentRepository[]>([]);
  const [recentOwners, setRecentOwners] = useState<RecentOwner[]>([]);

  // Fetch user repos when authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      setUserRepos(null);
      return;
    }

    const fetchUserRepos = async () => {
      try {
        const response = await fetch('/api/github/user/repos');
        if (response.ok) {
          const data: UserReposResponse = await response.json();
          setUserRepos(data);
        }
      } catch (error) {
        console.error('Failed to fetch user repos:', error);
      }
    };

    fetchUserRepos();
  }, [isAuthenticated]);

  // Load recent repositories and owners from localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const storedRepos = localStorage.getItem(RECENT_REPOSITORIES_KEY);
      if (storedRepos) {
        setRecentRepos(JSON.parse(storedRepos));
      }

      const storedOwners = localStorage.getItem(RECENT_OWNERS_KEY);
      if (storedOwners) {
        setRecentOwners(JSON.parse(storedOwners));
      }
    } catch (err) {
      console.error('Failed to load recent items:', err);
    }
  }, []);

  const handleExploreRepo = useCallback(() => {
    const parsed = parseGitHubUrl(repoUrl);
    if (parsed) {
      window.open(`https://app.principal-ade.com/${parsed.owner}/${parsed.repo}`, '_blank');
    }
  }, [repoUrl]);

  const handleCollectionClick = useCallback((collection: CuratedCollection) => {
    if (onCollectionClick) {
      onCollectionClick(collection.id);
    }
  }, [onCollectionClick]);

  const handleRepositoryClick = useCallback((result: RepositorySearchResult) => {
    const isUserOrOrgRepo = result.collection.id.startsWith('__');

    if (isUserOrOrgRepo) {
      // For user/org repos, navigate directly to the repo page
      const [owner, repo] = result.repo.repositoryId.split('/');
      window.open(`https://app.principal-ade.com/${owner}/${repo}`, '_blank');
    } else if (onRepositoryClick) {
      onRepositoryClick(result.collection.id, result.repo.repositoryId);
    } else if (onCollectionClick) {
      // Fallback to collection click if no repo click handler
      onCollectionClick(result.collection.id);
    }
  }, [onRepositoryClick, onCollectionClick]);

  // Search repositories across all collections and user repos (searches original owner/name for forks)
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];

    const query = searchQuery.toLowerCase();
    const results: RepositorySearchResult[] = [];

    // Search user's owned repos first (if authenticated)
    if (userRepos?.owned) {
      const userCollection: CuratedCollection = {
        id: '__user_repos__',
        name: 'Your Repositories',
        description: 'Your personal repositories',
        icon: 'user',
      };

      for (const repo of userRepos.owned) {
        const searchTarget = repo.full_name.toLowerCase();
        if (searchTarget.includes(query)) {
          results.push({
            repo: {
              repositoryId: repo.full_name,
            },
            collection: userCollection,
          });
        }
      }
    }

    // Search user's organization repos (if authenticated)
    if (userRepos?.organizations) {
      for (const org of userRepos.organizations) {
        const orgCollection: CuratedCollection = {
          id: `__org_${org.login}__`,
          name: org.login,
          description: org.description || `${org.login} organization`,
          icon: 'building',
        };

        for (const repo of org.repositories) {
          const searchTarget = repo.full_name.toLowerCase();
          if (searchTarget.includes(query)) {
            results.push({
              repo: {
                repositoryId: repo.full_name,
              },
              collection: orgCollection,
            });
          }
        }
      }
    }

    // Search curated collections
    for (const collection of curatedCollections) {
      for (const repo of collection.repositories || []) {
        // Search against original repo name for forks, or the repo ID
        const searchOwner = repo.sourceRepository?.owner || repo.repositoryId.split('/')[0];
        const searchName = repo.sourceRepository?.name || repo.repositoryId.split('/')[1];
        const searchTarget = `${searchOwner}/${searchName}`.toLowerCase();

        if (searchTarget.includes(query)) {
          results.push({ repo, collection });
        }
      }
    }

    return results;
  }, [searchQuery, curatedCollections, userRepos]);

  const isSearching = searchQuery.trim().length > 0;

  const hasRecentItems = recentRepos.length > 0 || recentOwners.length > 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        backgroundColor: theme.colors.background,
        color: theme.colors.text,
        fontFamily: theme.fonts.body,
        width: '100%',
      }}
    >
      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0 }}>
      {/* Curated Collections Section */}
      {(loading || curatedCollections.length > 0) && (
        <div
          style={{
            padding: '32px 32px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: '24px',
            width: '100%',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <h2
              style={{
                margin: 0,
                fontSize: `${theme.fontSizes[6] || 32}px`,
                fontWeight: theme.fontWeights.bold,
                color: theme.colors.text,
              }}
            >
              Curated Collections
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: `${theme.fontSizes[2]}px`,
                color: theme.colors.textSecondary,
                lineHeight: 1.5,
              }}
            >
              Instantly explore architecture, File City, and code quality for popular open-source projects.
            </p>
            <p
              style={{
                margin: 0,
                fontSize: `${theme.fontSizes[1]}px`,
                color: theme.colors.textMuted,
              }}
            >
              Curated collections analyze public open-source repositories only.
            </p>
          </div>

          {/* Search bar */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '560px',
            }}
          >
            <Search
              size={18}
              style={{
                position: 'absolute',
                left: '14px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: theme.colors.textMuted,
              }}
            />
            <input
              type="text"
              placeholder={isAuthenticated ? "Search your repos, orgs, and collections..." : "Search repositories..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 14px 12px 44px',
                fontSize: `${theme.fontSizes[1]}px`,
                backgroundColor: theme.colors.surface,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: '8px',
                color: theme.colors.text,
                outline: 'none',
                fontFamily: theme.fonts.body,
              }}
            />
          </div>

          {/* Container that maintains height based on collection cards */}
          <div
            style={{
              position: 'relative',
              width: '100%',
            }}
          >
            {/* Collection cards - always rendered to maintain height */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '16px',
                width: '100%',
                opacity: isSearching ? 0 : 1,
                transition: 'opacity 0.15s ease',
                pointerEvents: isSearching ? 'none' : 'auto',
              }}
            >
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <SkeletonCard key={i} theme={theme} />
                  ))
                : curatedCollections.map((collection) => (
                    <CollectionCard
                      key={collection.id}
                      collection={collection}
                      theme={theme}
                      onClick={() => handleCollectionClick(collection)}
                    />
                  ))}
            </div>

            {/* Search results - overlaid on top when searching */}
            {isSearching && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '12px',
                }}
              >
                {searchResults.map((result) => (
                  <RepositoryCard
                    key={`${result.collection.id}-${result.repo.repositoryId}`}
                    result={result}
                    theme={theme}
                    onClick={() => handleRepositoryClick(result)}
                  />
                ))}
              </div>
            )}
          </div>

        </div>
      )}

      {/* Explore your own projects Section - hidden when searching */}
      {!isSearching && (
        <div
          style={{
            padding: '32px 32px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: '24px',
          width: '100%',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <h2
            style={{
              margin: 0,
              fontSize: `${theme.fontSizes[5] || 24}px`,
              fontWeight: theme.fontWeights.bold,
              color: theme.colors.text,
            }}
          >
            Explore your own projects
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: `${theme.fontSizes[1]}px`,
              color: theme.colors.textSecondary,
              lineHeight: 1.5,
            }}
          >
            Analyze a repository or create a custom collection to organize work you care about.
          </p>
        </div>

        {/* Two cards side by side */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '16px',
            width: '100%',
          }}
        >
          {/* Learn more about Principal ADE card */}
          <div
            style={{
              padding: '24px',
              borderRadius: '12px',
              backgroundColor: theme.colors.surface,
              border: `1px solid ${theme.colors.border}`,
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: `${theme.fontSizes[3]}px`,
                fontWeight: theme.fontWeights.semibold,
                color: theme.colors.text,
              }}
            >
              Learn more about Principal ADE
            </h3>
            <p
              style={{
                margin: 0,
                fontSize: `${theme.fontSizes[1]}px`,
                color: theme.colors.textSecondary,
                lineHeight: 1.5,
              }}
            >
              Discover how Principal ADE helps you explore and understand codebases.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <a
                href="https://principal-ade.com"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 16px',
                  fontSize: `${theme.fontSizes[1]}px`,
                  fontWeight: theme.fontWeights.semibold,
                  color: theme.colors.background,
                  backgroundColor: theme.colors.text,
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'opacity 0.2s ease',
                  fontFamily: theme.fonts.body,
                  textDecoration: 'none',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '0.8';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '1';
                }}
              >
                <ExternalLink size={16} />
                Learn More
              </a>
            </div>
          </div>

          {/* Explore a repository card */}
          <div
            style={{
              padding: '24px',
              borderRadius: '12px',
              backgroundColor: theme.colors.surface,
              border: `1px solid ${theme.colors.border}`,
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: `${theme.fontSizes[3]}px`,
                fontWeight: theme.fontWeights.semibold,
                color: theme.colors.text,
              }}
            >
              Explore a repository
            </h3>
            <p
              style={{
                margin: 0,
                fontSize: `${theme.fontSizes[1]}px`,
                color: theme.colors.textSecondary,
                lineHeight: 1.5,
              }}
            >
              Enter a GitHub URL or owner/repo to explore any public repository.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleExploreRepo();
              }}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <div
                style={{
                  position: 'relative',
                  flex: 1,
                }}
              >
                <Github
                  size={16}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: theme.colors.textMuted,
                  }}
                />
                <input
                  type="text"
                  placeholder="owner/repo or GitHub URL"
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 38px',
                    fontSize: `${theme.fontSizes[1]}px`,
                    backgroundColor: theme.colors.background,
                    border: `1px solid ${theme.colors.border}`,
                    borderRadius: '8px',
                    color: theme.colors.text,
                    outline: 'none',
                    fontFamily: theme.fonts.body,
                  }}
                />
              </div>
              <button
                type="submit"
                disabled={!parseGitHubUrl(repoUrl)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '10px 16px',
                  fontSize: `${theme.fontSizes[1]}px`,
                  fontWeight: theme.fontWeights.semibold,
                  color: parseGitHubUrl(repoUrl) ? theme.colors.background : theme.colors.textMuted,
                  backgroundColor: parseGitHubUrl(repoUrl) ? theme.colors.text : theme.colors.border,
                  border: 'none',
                  borderRadius: '8px',
                  cursor: parseGitHubUrl(repoUrl) ? 'pointer' : 'not-allowed',
                  transition: 'opacity 0.2s ease',
                  fontFamily: theme.fonts.body,
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => {
                  if (parseGitHubUrl(repoUrl)) {
                    e.currentTarget.style.opacity = '0.8';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '1';
                }}
              >
                Explore
                <ArrowRight size={14} />
              </button>
            </form>
          </div>
        </div>
        </div>
      )}
      </div>

      {/* Recent Activity Sidebar */}
      {(hasRecentItems || isAuthenticated) && (
        <RecentActivitySidebar
          recentRepos={recentRepos}
          recentOwners={recentOwners}
          theme={theme}
          isAuthenticated={isAuthenticated}
          collections={userCollections}
          getCollectionRepositories={getCollectionRepositories}
        />
      )}
    </div>
  );
};
