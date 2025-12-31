'use client';

import React, { useState, useCallback } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { X, Github, Plus, Trash2 } from 'lucide-react';

interface AddRepositoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (repositoryId: string) => Promise<void>;
  onRemove?: (repositoryId: string) => Promise<void>;
  existingRepositories: string[];
  collectionName: string;
}

/**
 * Parse a GitHub URL or owner/repo string
 */
function parseGitHubInput(input: string): string | null {
  const trimmed = input.trim();

  // Try full URL: https://github.com/owner/repo
  const urlMatch = trimmed.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (urlMatch && urlMatch[1] && urlMatch[2]) {
    const repo = urlMatch[2].replace(/\.git$/, '');
    return `${urlMatch[1]}/${repo}`;
  }

  // Try owner/repo format
  const shortMatch = trimmed.match(/^([^/]+)\/([^/]+)$/);
  if (shortMatch && shortMatch[1] && shortMatch[2]) {
    return `${shortMatch[1]}/${shortMatch[2]}`;
  }

  return null;
}

export function AddRepositoryModal({
  isOpen,
  onClose,
  onAdd,
  onRemove,
  existingRepositories,
  collectionName,
}: AddRepositoryModalProps) {
  const { theme } = useTheme();
  const [input, setInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = useCallback(async () => {
    const repositoryId = parseGitHubInput(input);
    if (!repositoryId) {
      setError('Enter a valid format: owner/repo or GitHub URL');
      return;
    }

    if (existingRepositories.includes(repositoryId)) {
      setError('This repository is already in the collection');
      return;
    }

    try {
      setAdding(true);
      setError(null);
      await onAdd(repositoryId);
      setInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add repository');
    } finally {
      setAdding(false);
    }
  }, [input, existingRepositories, onAdd]);

  const handleRemove = useCallback(
    async (repositoryId: string) => {
      if (!onRemove) return;

      try {
        setRemovingId(repositoryId);
        setError(null);
        await onRemove(repositoryId);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to remove repository');
      } finally {
        setRemovingId(null);
      }
    },
    [onRemove]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !adding) {
        e.preventDefault();
        handleAdd();
      }
    },
    [handleAdd, adding]
  );

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: theme.colors.background,
          borderRadius: '12px',
          border: `1px solid ${theme.colors.border}`,
          padding: '24px',
          width: '100%',
          maxWidth: '520px',
          maxHeight: '90vh',
          overflow: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '24px',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: `${theme.fontSizes[4]}px`,
              fontWeight: theme.fontWeights.semibold,
              color: theme.colors.text,
            }}
          >
            Add Repository
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              color: theme.colors.textSecondary,
            }}
          >
            <X size={20} />
          </button>
        </div>

        <p
          style={{
            margin: '0 0 16px',
            fontSize: `${theme.fontSizes[1]}px`,
            color: theme.colors.textSecondary,
          }}
        >
          Add repositories to &quot;{collectionName}&quot;
        </p>

        {/* Error message */}
        {error && (
          <div
            style={{
              padding: '12px',
              marginBottom: '16px',
              backgroundColor: `${theme.colors.error}20`,
              borderRadius: '8px',
              color: theme.colors.error,
              fontSize: `${theme.fontSizes[1]}px`,
            }}
          >
            {error}
          </div>
        )}

        {/* Add input */}
        <div style={{ marginBottom: '24px' }}>
          <div
            style={{
              display: 'flex',
              gap: '8px',
              padding: '6px',
              borderRadius: '12px',
              backgroundColor: theme.colors.background,
              border: `1px solid ${theme.colors.border}`,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                paddingLeft: '12px',
                color: theme.colors.textSecondary,
              }}
            >
              <Github size={20} />
            </div>
            <input
              type="text"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setError(null);
              }}
              onKeyDown={handleKeyDown}
              placeholder="owner/repo or GitHub URL"
              style={{
                flex: 1,
                padding: '12px 8px',
                border: 'none',
                background: 'transparent',
                color: theme.colors.text,
                fontSize: `${theme.fontSizes[2]}px`,
                outline: 'none',
              }}
            />
            <button
              onClick={handleAdd}
              disabled={adding || !input.trim()}
              style={{
                padding: '12px 16px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: theme.colors.primary,
                color: theme.colors.textOnPrimary,
                fontSize: `${theme.fontSizes[2]}px`,
                fontWeight: theme.fontWeights.semibold,
                cursor: adding || !input.trim() ? 'not-allowed' : 'pointer',
                opacity: adding || !input.trim() ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Plus size={18} />
              {adding ? 'Adding...' : 'Add'}
            </button>
          </div>
        </div>

        {/* Existing repositories */}
        {existingRepositories.length > 0 && (
          <div>
            <h3
              style={{
                margin: '0 0 12px',
                fontSize: `${theme.fontSizes[1]}px`,
                fontWeight: theme.fontWeights.medium,
                color: theme.colors.textSecondary,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Repositories ({existingRepositories.length})
            </h3>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                maxHeight: '240px',
                overflow: 'auto',
              }}
            >
              {existingRepositories.map((repo) => (
                <div
                  key={repo}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px',
                    borderRadius: '8px',
                    backgroundColor: theme.colors.background,
                    border: `1px solid ${theme.colors.border}`,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                    }}
                  >
                    <Github size={16} style={{ color: theme.colors.textSecondary }} />
                    <span
                      style={{
                        fontSize: `${theme.fontSizes[2]}px`,
                        color: theme.colors.text,
                      }}
                    >
                      {repo}
                    </span>
                  </div>
                  {onRemove && (
                    <button
                      onClick={() => handleRemove(repo)}
                      disabled={removingId === repo}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: removingId === repo ? 'not-allowed' : 'pointer',
                        padding: '4px',
                        color: theme.colors.textSecondary,
                        opacity: removingId === repo ? 0.5 : 1,
                      }}
                      title="Remove from collection"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {existingRepositories.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '32px',
              color: theme.colors.textSecondary,
              fontSize: `${theme.fontSizes[1]}px`,
            }}
          >
            No repositories in this collection yet.
            <br />
            Add your first repository above.
          </div>
        )}

        {/* Close button */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginTop: '24px',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '12px 20px',
              borderRadius: '8px',
              border: `1px solid ${theme.colors.border}`,
              backgroundColor: 'transparent',
              color: theme.colors.text,
              fontSize: `${theme.fontSizes[2]}px`,
              fontWeight: theme.fontWeights.medium,
              cursor: 'pointer',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
