'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Github, HardDrive, X, AlertTriangle } from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';
import { useLocalFileSystem } from '@/contexts/LocalFileSystemContext';

interface LocalFolderButtonProps {
  /** Current repository in "owner/repo" format */
  currentRepoId: string;
}

interface ConfirmDialogState {
  isOpen: boolean;
  type: 'different-repo' | 'no-git' | 'disconnect' | null;
  detectedRepo?: { owner: string; repo: string; fullName: string };
  pendingHandle?: FileSystemDirectoryHandle;
}

export function LocalFolderButton({ currentRepoId }: LocalFolderButtonProps) {
  const { theme } = useTheme();
  const router = useRouter();
  const {
    isSupported,
    adapter,
    folderName,
    isLoading,
    error,
    pickDirectory,
    attachFolder,
    disconnectFolder,
    clearError,
  } = useLocalFileSystem();

  const [dialog, setDialog] = useState<ConfirmDialogState>({
    isOpen: false,
    type: null,
  });

  const isLocal = !!adapter;

  const handleGitHubClick = useCallback(async () => {
    if (!adapter) return; // Already on GitHub

    // Show disconnect confirmation
    setDialog({
      isOpen: true,
      type: 'disconnect',
    });
  }, [adapter]);

  const handleLocalClick = useCallback(async () => {
    if (adapter) return; // Already on Local

    // Pick a directory
    const result = await pickDirectory(currentRepoId);

    if (!result) {
      // User cancelled or error
      return;
    }

    if (result.attached) {
      // Successfully attached to current repo
      return;
    }

    if (result.detectedRepo) {
      // Different repo detected - show confirmation
      setDialog({
        isOpen: true,
        type: 'different-repo',
        detectedRepo: result.detectedRepo,
      });
    } else {
      // No git remote found - ask if they want to attach anyway
      setDialog({
        isOpen: true,
        type: 'no-git',
      });
    }
  }, [adapter, pickDirectory, currentRepoId]);

  const handleConfirm = useCallback(async () => {
    if (dialog.type === 'disconnect') {
      await disconnectFolder(currentRepoId);
      setDialog({ isOpen: false, type: null });
      // Trigger a page refresh to reload from GitHub
      window.location.reload();
      return;
    }

    if (dialog.type === 'different-repo' && dialog.detectedRepo) {
      // Navigate to the detected repo (the folder will be attached there)
      router.push(`/${dialog.detectedRepo.fullName}`);
      setDialog({ isOpen: false, type: null });
      return;
    }

    if (dialog.type === 'no-git' && dialog.pendingHandle) {
      // Attach anyway to current repo
      await attachFolder(dialog.pendingHandle, currentRepoId);
      setDialog({ isOpen: false, type: null });
      return;
    }

    setDialog({ isOpen: false, type: null });
  }, [dialog, disconnectFolder, attachFolder, router, currentRepoId]);

  const handleCancel = useCallback(() => {
    setDialog({ isOpen: false, type: null });
  }, []);

  // Don't render if not supported
  if (!isSupported) {
    return (
      <div
        className="flex items-center rounded-md text-xs opacity-50"
        style={{
          background: theme.colors.secondary,
          border: `1px solid ${theme.colors.border}`,
        }}
        title="Local folder access requires Chrome or Edge browser"
      >
        <span
          className="flex items-center gap-1 px-2 py-1 rounded-l-md"
          style={{
            background: theme.colors.primary,
            color: theme.colors.textOnPrimary,
          }}
        >
          <Github className="w-3 h-3" />
          GitHub
        </span>
        <span
          className="flex items-center gap-1 px-2 py-1 rounded-r-md"
          style={{
            color: theme.colors.textMuted,
          }}
        >
          <HardDrive className="w-3 h-3" />
          Local
        </span>
      </div>
    );
  }

  return (
    <>
      {/* Toggle Switch */}
      <div
        className="flex items-center rounded-md text-xs"
        style={{
          background: theme.colors.secondary,
          border: `1px solid ${theme.colors.border}`,
          opacity: isLoading ? 0.7 : 1,
        }}
      >
        <button
          onClick={handleGitHubClick}
          disabled={isLoading || !isLocal}
          className="flex items-center gap-1 px-2 py-1 rounded-l-md transition-all"
          style={{
            background: !isLocal ? theme.colors.primary : 'transparent',
            color: !isLocal ? theme.colors.textOnPrimary : theme.colors.text,
            cursor: isLocal ? 'pointer' : 'default',
          }}
          title={isLocal ? 'Switch to GitHub' : 'Currently viewing from GitHub'}
        >
          <Github className="w-3 h-3" />
          <span className="hidden sm:inline">GitHub</span>
        </button>
        <button
          onClick={handleLocalClick}
          disabled={isLoading}
          className="flex items-center gap-1 px-2 py-1 rounded-r-md transition-all"
          style={{
            background: isLocal ? theme.colors.primary : 'transparent',
            color: isLocal ? theme.colors.textOnPrimary : theme.colors.text,
            cursor: !isLocal ? 'pointer' : 'default',
          }}
          title={
            isLocal
              ? `Local folder: ${folderName}`
              : 'Connect local folder'
          }
        >
          <HardDrive className="w-3 h-3" />
          <span className="hidden sm:inline">Local</span>
        </button>
      </div>

      {/* Error Toast */}
      {error && (
        <div
          className="fixed bottom-4 right-4 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg z-50"
          style={{
            background: theme.colors.error,
            color: theme.colors.textOnPrimary,
          }}
        >
          <AlertTriangle className="w-4 h-4" />
          <span className="text-sm">{error}</span>
          <button
            onClick={clearError}
            className="ml-2 hover:opacity-80"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Confirmation Dialog */}
      {dialog.isOpen && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.5)' }}
        >
          <div
            className="rounded-lg shadow-xl p-6 max-w-md w-full mx-4"
            style={{
              background: theme.colors.surface,
              border: `1px solid ${theme.colors.border}`,
            }}
          >
            {dialog.type === 'disconnect' && (
              <>
                <h3
                  className="text-lg font-semibold mb-2"
                  style={{ color: theme.colors.text }}
                >
                  Switch to GitHub?
                </h3>
                <p
                  className="text-sm mb-4"
                  style={{ color: theme.colors.textMuted }}
                >
                  This will disconnect <strong>{folderName}</strong> and switch back to viewing files from GitHub.
                </p>
              </>
            )}

            {dialog.type === 'different-repo' && dialog.detectedRepo && (
              <>
                <h3
                  className="text-lg font-semibold mb-2"
                  style={{ color: theme.colors.text }}
                >
                  Different Repository Detected
                </h3>
                <p
                  className="text-sm mb-4"
                  style={{ color: theme.colors.textMuted }}
                >
                  This folder belongs to{' '}
                  <strong>{dialog.detectedRepo.fullName}</strong>, but you&apos;re
                  currently viewing <strong>{currentRepoId}</strong>.
                </p>
                <p
                  className="text-sm mb-4"
                  style={{ color: theme.colors.textMuted }}
                >
                  Would you like to switch to{' '}
                  <strong>{dialog.detectedRepo.fullName}</strong>?
                </p>
              </>
            )}

            {dialog.type === 'no-git' && (
              <>
                <h3
                  className="text-lg font-semibold mb-2"
                  style={{ color: theme.colors.text }}
                >
                  No Git Repository Found
                </h3>
                <p
                  className="text-sm mb-4"
                  style={{ color: theme.colors.textMuted }}
                >
                  This folder doesn&apos;t appear to be a git repository, or it
                  doesn&apos;t have a GitHub remote configured.
                </p>
                <p
                  className="text-sm mb-4"
                  style={{ color: theme.colors.textMuted }}
                >
                  Would you like to attach it to <strong>{currentRepoId}</strong>{' '}
                  anyway?
                </p>
              </>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={handleCancel}
                className="px-4 py-2 rounded-md text-sm transition-all hover:opacity-80"
                style={{
                  background: theme.colors.secondary,
                  color: theme.colors.text,
                  border: `1px solid ${theme.colors.border}`,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="px-4 py-2 rounded-md text-sm transition-all hover:opacity-80"
                style={{
                  background:
                    dialog.type === 'disconnect'
                      ? theme.colors.primary
                      : theme.colors.primary,
                  color: theme.colors.textOnPrimary,
                }}
              >
                {dialog.type === 'disconnect'
                  ? 'Switch to GitHub'
                  : dialog.type === 'different-repo'
                  ? 'Switch Repository'
                  : 'Attach Anyway'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
