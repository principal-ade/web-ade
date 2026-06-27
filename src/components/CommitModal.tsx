'use client';

import { useState } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { X, GitCommit, Check, AlertCircle } from 'lucide-react';
import type { PendingFileChange } from '@/contexts/PendingChangesContext';
import { InlineTrailLoader } from '@/components/trail/InlineTrailLoader';

interface CommitModalProps {
  isOpen: boolean;
  onClose: () => void;
  pendingChanges: PendingFileChange[];
  repositoryName: { owner: string; repo: string };
  onCommit: (message: string, selectedPaths: string[]) => Promise<void>;
}

export function CommitModal({
  isOpen,
  onClose,
  pendingChanges,
  repositoryName,
  onCommit,
}: CommitModalProps) {
  const { theme } = useTheme();
  const [message, setMessage] = useState('');
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(
    new Set(pendingChanges.map(c => c.path))
  );
  const [isCommitting, setIsCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const togglePath = (path: string) => {
    setSelectedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedPaths(new Set(pendingChanges.map(c => c.path)));
  };

  const deselectAll = () => {
    setSelectedPaths(new Set());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!message.trim()) {
      setError('Commit message is required');
      return;
    }

    if (selectedPaths.size === 0) {
      setError('Select at least one file to commit');
      return;
    }

    setIsCommitting(true);
    try {
      await onCommit(message.trim(), Array.from(selectedPaths));
      setMessage('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to commit changes');
    } finally {
      setIsCommitting(false);
    }
  };

  const selectedCount = selectedPaths.size;
  const totalCount = pendingChanges.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
      style={{ backgroundColor: `${theme.colors.background}cc` }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isCommitting) {
          onClose();
        }
      }}
    >
      <div
        className="rounded-lg shadow-xl max-w-lg w-full mx-4"
        style={{
          background: theme.colors.surface,
          border: `1px solid ${theme.colors.border}`,
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: `1px solid ${theme.colors.border}` }}
        >
          <div className="flex items-center gap-3">
            <GitCommit className="w-5 h-5" style={{ color: theme.colors.primary }} />
            <h2 className="text-lg font-semibold" style={{ color: theme.colors.text }}>
              Commit Changes
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={isCommitting}
            className="flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80 disabled:opacity-50"
            style={{
              background: theme.colors.secondary,
              color: theme.colors.text,
            }}
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Content */}
          <div className="px-6 py-4 space-y-4">
            {/* Repository info */}
            <p className="text-sm" style={{ color: theme.colors.textMuted }}>
              Committing to <span style={{ color: theme.colors.text }}>{repositoryName.owner}/{repositoryName.repo}</span>
            </p>

            {/* Commit message */}
            <div>
              <label
                htmlFor="commit-message"
                className="block text-sm font-medium mb-2"
                style={{ color: theme.colors.text }}
              >
                Commit message
              </label>
              <textarea
                id="commit-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe your changes..."
                rows={3}
                disabled={isCommitting}
                className="w-full px-3 py-2 rounded-md focus:outline-none focus:ring-2 resize-none disabled:opacity-50"
                style={{
                  background: theme.colors.background,
                  border: `1px solid ${theme.colors.border}`,
                  color: theme.colors.text,
                }}
                autoFocus
              />
            </div>

            {/* File selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label
                  className="block text-sm font-medium"
                  style={{ color: theme.colors.text }}
                >
                  Files to commit ({selectedCount}/{totalCount})
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={selectAll}
                    disabled={isCommitting}
                    className="text-xs px-2 py-1 rounded transition-opacity hover:opacity-80 disabled:opacity-50"
                    style={{ color: theme.colors.primary }}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    onClick={deselectAll}
                    disabled={isCommitting}
                    className="text-xs px-2 py-1 rounded transition-opacity hover:opacity-80 disabled:opacity-50"
                    style={{ color: theme.colors.textMuted }}
                  >
                    Deselect all
                  </button>
                </div>
              </div>
              <div
                className="rounded-md max-h-48 overflow-y-auto"
                style={{
                  background: theme.colors.background,
                  border: `1px solid ${theme.colors.border}`,
                }}
              >
                {pendingChanges.map((change) => (
                  <label
                    key={change.path}
                    className="flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors hover:opacity-80"
                    style={{
                      borderBottom: `1px solid ${theme.colors.border}`,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedPaths.has(change.path)}
                      onChange={() => togglePath(change.path)}
                      disabled={isCommitting}
                      className="rounded"
                      style={{ accentColor: theme.colors.primary }}
                    />
                    <span
                      className="text-sm font-mono truncate flex-1"
                      style={{ color: theme.colors.text }}
                      title={change.path}
                    >
                      {change.path}
                    </span>
                    <Check
                      className="w-4 h-4 flex-shrink-0"
                      style={{
                        color: theme.colors.success,
                        opacity: selectedPaths.has(change.path) ? 1 : 0,
                      }}
                    />
                  </label>
                ))}
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-md text-sm"
                style={{
                  background: `${theme.colors.error}20`,
                  color: theme.colors.error,
                }}
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-end gap-3 px-6 py-4"
            style={{ borderTop: `1px solid ${theme.colors.border}` }}
          >
            <button
              type="button"
              onClick={onClose}
              disabled={isCommitting}
              className="px-4 py-2 rounded-md text-sm font-medium transition-all hover:opacity-80 disabled:opacity-50"
              style={{
                background: theme.colors.secondary,
                color: theme.colors.text,
                border: `1px solid ${theme.colors.border}`,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCommitting || selectedCount === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all hover:opacity-80 disabled:opacity-50"
              style={{
                background: theme.colors.primary,
                color: theme.colors.textOnPrimary,
              }}
            >
              {isCommitting ? (
                <>
                  <InlineTrailLoader size={16} />
                  Committing...
                </>
              ) : (
                <>
                  <GitCommit className="w-4 h-4" />
                  Commit {selectedCount} file{selectedCount !== 1 ? 's' : ''}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
