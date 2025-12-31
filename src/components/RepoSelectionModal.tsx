'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from '@principal-ade/industry-theme';
import { X } from 'lucide-react';

interface RepoSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentRepo?: { owner: string; repo: string } | null;
}

const DEFAULT_REPO = 'principal-ai/alexandria-core-library';

export function RepoSelectionModal({ isOpen, onClose, currentRepo }: RepoSelectionModalProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const [repoUrl, setRepoUrl] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const parseGitHubUrl = (url: string): string | null => {
    // Handle empty input
    if (!url.trim()) {
      return null;
    }

    // If it's already in owner/repo format
    if (/^[\w-]+\/[\w-]+$/.test(url.trim())) {
      return url.trim();
    }

    // Parse full GitHub URL
    try {
      const urlObj = new URL(url);
      if (urlObj.hostname === 'github.com') {
        const parts = urlObj.pathname.split('/').filter(Boolean);
        if (parts.length >= 2) {
          return `${parts[0]}/${parts[1]}`;
        }
      }
    } catch {
      // Not a valid URL, might be owner/repo format with extra characters
    }

    return null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const repo = parseGitHubUrl(repoUrl);
    if (!repo) {
      setError('Please enter a valid GitHub repository URL or owner/repo format');
      return;
    }

    // Navigate to GitHub-style path: /owner/repo
    router.push(`/${repo}`);
    onClose();
  };

  const handleUseDefault = () => {
    router.push(`/${DEFAULT_REPO}`);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
      style={{ backgroundColor: `${theme.colors.background}cc` }}
    >
      <div
        className="rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
        style={{
          background: theme.colors.surface,
          border: `1px solid ${theme.colors.border}`,
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2
            className="text-xl font-semibold"
            style={{ color: theme.colors.text }}
          >
            Select Documentation Repository
          </h2>
          {currentRepo && (
            <button
              onClick={onClose}
              className="flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80"
              style={{
                background: theme.colors.secondary,
                color: theme.colors.text,
              }}
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <p
          className="text-sm mb-6"
          style={{ color: theme.colors.textMuted }}
        >
          Enter a GitHub repository URL to view its documentation, or use our default repository.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="repo-url"
              className="block text-sm font-medium mb-2"
              style={{ color: theme.colors.text }}
            >
              GitHub Repository
            </label>
            <input
              id="repo-url"
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="e.g., owner/repo or https://github.com/owner/repo"
              className="w-full px-3 py-2 rounded-md focus:outline-none focus:ring-2"
              style={{
                background: theme.colors.background,
                border: `1px solid ${theme.colors.border}`,
                color: theme.colors.text,
              }}
            />
            {error && (
              <p className="mt-2 text-sm" style={{ color: theme.colors.error }}>
                {error}
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              className="flex-1 px-4 py-2 rounded-md font-medium transition-colors focus:outline-none focus:ring-2"
              style={{
                background: theme.colors.primary,
                color: theme.colors.textOnPrimary,
              }}
            >
              Load Repository
            </button>
            <button
              type="button"
              onClick={handleUseDefault}
              className="flex-1 px-4 py-2 rounded-md font-medium transition-colors focus:outline-none focus:ring-2"
              style={{
                background: theme.colors.muted,
                color: theme.colors.text,
              }}
            >
              Use Default
            </button>
          </div>
        </form>

        <div
          className="mt-4 pt-4"
          style={{ borderTop: `1px solid ${theme.colors.border}` }}
        >
          <p className="text-xs" style={{ color: theme.colors.textMuted }}>
            Default repository: <span className="font-mono">{DEFAULT_REPO}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
