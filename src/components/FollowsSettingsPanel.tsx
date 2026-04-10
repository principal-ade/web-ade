'use client';

import { useState } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { X, UserPlus, FolderGit2, Trash2 } from 'lucide-react';
import { useWatches } from '@/hooks/useFollows';
import { LoadingSpinner } from './LoadingSpinner';
import {
  MAX_WATCHED_USERS,
  MAX_WATCHED_REPOS,
} from '@/lib/feed-collections/types';

export interface FollowsSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Panel for managing followed users and repositories
 */
export function FollowsSettingsPanel({ isOpen, onClose }: FollowsSettingsPanelProps) {
  const { theme } = useTheme();
  const {
    watchedUsers: followedUsers,
    watchedRepos: followedRepos,
    isLoading,
    watchUser: followUser,
    unwatchUser: unfollowUser,
    watchRepo: followRepo,
    unwatchRepo: unfollowRepo,
    canWatchMoreUsers: canFollowMoreUsers,
    canWatchMoreRepos: canFollowMoreRepos,
  } = useWatches();

  const [userInput, setUserInput] = useState('');
  const [repoInput, setRepoInput] = useState('');
  const [userLoading, setUserLoading] = useState(false);
  const [repoLoading, setRepoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleFollowUser(e: React.FormEvent) {
    e.preventDefault();
    if (!userInput.trim() || !canFollowMoreUsers) return;

    setUserLoading(true);
    setError(null);

    try {
      await followUser(userInput.trim());
      setUserInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to follow user');
    } finally {
      setUserLoading(false);
    }
  }

  async function handleUnfollowUser(login: string) {
    try {
      await unfollowUser(login);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unfollow user');
    }
  }

  async function handleFollowRepo(e: React.FormEvent) {
    e.preventDefault();
    if (!repoInput.trim() || !canFollowMoreRepos) return;

    setRepoLoading(true);
    setError(null);

    try {
      // Parse input - supports "owner/repo" or GitHub URL
      let owner: string = '';
      let repo: string = '';

      const input = repoInput.trim();
      if (input.includes('github.com')) {
        // Extract from URL: https://github.com/owner/repo
        const match = input.match(/github\.com\/([^/]+)\/([^/]+)/);
        if (!match || !match[1] || !match[2]) {
          throw new Error('Invalid GitHub URL');
        }
        owner = match[1];
        repo = match[2].replace(/\.git$/, '');
      } else if (input.includes('/')) {
        // owner/repo format
        const parts = input.split('/');
        if (parts.length !== 2 || !parts[0] || !parts[1]) {
          throw new Error('Invalid format. Use owner/repo');
        }
        owner = parts[0];
        repo = parts[1];
      } else {
        throw new Error('Invalid format. Use owner/repo or GitHub URL');
      }

      await followRepo(owner, repo);
      setRepoInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to follow repo');
    } finally {
      setRepoLoading(false);
    }
  }

  async function handleUnfollowRepo(owner: string, repo: string) {
    try {
      await unfollowRepo(owner, repo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unfollow repo');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0, 0, 0, 0.5)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[80vh] rounded-lg shadow-xl overflow-hidden flex flex-col"
        style={{ background: theme.colors.background }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-4 border-b"
          style={{ borderColor: theme.colors.border }}
        >
          <h2
            style={{
              fontSize: `${theme.fontSizes[3]}px`,
              fontWeight: theme.fontWeights.semibold,
              fontFamily: theme.fonts.body,
              color: theme.colors.text,
            }}
          >
            Manage Follows
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:opacity-70"
            style={{ color: theme.colors.textMuted }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Error message */}
          {error && (
            <div
              className="p-3 rounded"
              style={{
                background: theme.colors.error + '20',
                color: theme.colors.error,
                fontSize: `${theme.fontSizes[1]}px`,
              }}
            >
              {error}
            </div>
          )}

          {/* Users Section */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <UserPlus className="w-4 h-4" style={{ color: theme.colors.textMuted }} />
              <h3
                style={{
                  fontSize: `${theme.fontSizes[2]}px`,
                  fontWeight: theme.fontWeights.medium,
                  fontFamily: theme.fonts.body,
                  color: theme.colors.text,
                }}
              >
                Following Users ({followedUsers.length}/{MAX_WATCHED_USERS})
              </h3>
            </div>

            {/* Add user form */}
            <form onSubmit={handleFollowUser} className="flex gap-2 mb-3">
              <input
                type="text"
                placeholder="GitHub username"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                disabled={!canFollowMoreUsers || userLoading}
                className="flex-1 px-3 py-2 rounded"
                style={{
                  background: theme.colors.surface,
                  border: `1px solid ${theme.colors.border}`,
                  color: theme.colors.text,
                  fontSize: `${theme.fontSizes[1]}px`,
                  fontFamily: theme.fonts.body,
                }}
              />
              <button
                type="submit"
                disabled={!userInput.trim() || !canFollowMoreUsers || userLoading}
                className="px-4 py-2 rounded"
                style={{
                  background: canFollowMoreUsers ? theme.colors.primary : theme.colors.surface,
                  color: canFollowMoreUsers ? '#fff' : theme.colors.textMuted,
                  fontSize: `${theme.fontSizes[1]}px`,
                  fontFamily: theme.fonts.body,
                  cursor: canFollowMoreUsers && userInput.trim() ? 'pointer' : 'not-allowed',
                  opacity: canFollowMoreUsers && userInput.trim() ? 1 : 0.5,
                }}
              >
                {userLoading ? <LoadingSpinner size={16} /> : 'Follow'}
              </button>
            </form>

            {/* Followed users list */}
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <LoadingSpinner size={20} />
              </div>
            ) : followedUsers.length === 0 ? (
              <p
                className="py-4 text-center"
                style={{
                  color: theme.colors.textMuted,
                  fontSize: `${theme.fontSizes[1]}px`,
                }}
              >
                No users followed yet
              </p>
            ) : (
              <ul className="space-y-2">
                {followedUsers.map((user) => (
                  <li
                    key={user.login}
                    className="flex items-center justify-between p-2 rounded"
                    style={{ background: theme.colors.surface }}
                  >
                    <span
                      style={{
                        fontSize: `${theme.fontSizes[2]}px`,
                        fontFamily: theme.fonts.body,
                        color: theme.colors.text,
                      }}
                    >
                      @{user.login}
                    </span>
                    <button
                      onClick={() => handleUnfollowUser(user.login)}
                      className="p-1 rounded hover:opacity-70"
                      style={{ color: theme.colors.error }}
                      title="Unfollow"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Repos Section */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <FolderGit2 className="w-4 h-4" style={{ color: theme.colors.textMuted }} />
              <h3
                style={{
                  fontSize: `${theme.fontSizes[2]}px`,
                  fontWeight: theme.fontWeights.medium,
                  fontFamily: theme.fonts.body,
                  color: theme.colors.text,
                }}
              >
                Following Repos ({followedRepos.length}/{MAX_WATCHED_REPOS})
              </h3>
            </div>

            {/* Add repo form */}
            <form onSubmit={handleFollowRepo} className="flex gap-2 mb-3">
              <input
                type="text"
                placeholder="owner/repo or GitHub URL"
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                disabled={!canFollowMoreRepos || repoLoading}
                className="flex-1 px-3 py-2 rounded"
                style={{
                  background: theme.colors.surface,
                  border: `1px solid ${theme.colors.border}`,
                  color: theme.colors.text,
                  fontSize: `${theme.fontSizes[1]}px`,
                  fontFamily: theme.fonts.body,
                }}
              />
              <button
                type="submit"
                disabled={!repoInput.trim() || !canFollowMoreRepos || repoLoading}
                className="px-4 py-2 rounded"
                style={{
                  background: canFollowMoreRepos ? theme.colors.primary : theme.colors.surface,
                  color: canFollowMoreRepos ? '#fff' : theme.colors.textMuted,
                  fontSize: `${theme.fontSizes[1]}px`,
                  fontFamily: theme.fonts.body,
                  cursor: canFollowMoreRepos && repoInput.trim() ? 'pointer' : 'not-allowed',
                  opacity: canFollowMoreRepos && repoInput.trim() ? 1 : 0.5,
                }}
              >
                {repoLoading ? <LoadingSpinner size={16} /> : 'Follow'}
              </button>
            </form>

            {/* Followed repos list */}
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <LoadingSpinner size={20} />
              </div>
            ) : followedRepos.length === 0 ? (
              <p
                className="py-4 text-center"
                style={{
                  color: theme.colors.textMuted,
                  fontSize: `${theme.fontSizes[1]}px`,
                }}
              >
                No repos followed yet
              </p>
            ) : (
              <ul className="space-y-2">
                {followedRepos.map((repo) => (
                  <li
                    key={`${repo.owner}/${repo.repo}`}
                    className="flex items-center justify-between p-2 rounded"
                    style={{ background: theme.colors.surface }}
                  >
                    <span
                      style={{
                        fontSize: `${theme.fontSizes[2]}px`,
                        fontFamily: theme.fonts.body,
                        color: theme.colors.text,
                      }}
                    >
                      {repo.owner}/{repo.repo}
                    </span>
                    <button
                      onClick={() => handleUnfollowRepo(repo.owner, repo.repo)}
                      className="p-1 rounded hover:opacity-70"
                      style={{ color: theme.colors.error }}
                      title="Unfollow"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Footer */}
        <div
          className="p-4 border-t"
          style={{ borderColor: theme.colors.border }}
        >
          <p
            style={{
              fontSize: `${theme.fontSizes[0]}px`,
              fontFamily: theme.fonts.body,
              color: theme.colors.textMuted,
            }}
          >
            Your custom feed will show activity from followed users and repos.
          </p>
        </div>
      </div>
    </div>
  );
}
