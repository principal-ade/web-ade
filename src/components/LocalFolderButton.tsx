'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Folder, FolderOpen, X, AlertTriangle } from 'lucide-react';
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

  const handleClick = useCallback(async () => {
    if (adapter) {
      // Already attached - show disconnect confirmation
      setDialog({
        isOpen: true,
        type: 'disconnect',
      });
      return;
    }

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
      <button
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all opacity-50 cursor-not-allowed"
        style={{
          background: theme.colors.secondary,
          color: theme.colors.textMuted,
          border: `1px solid ${theme.colors.border}`,
        }}
        title="Local folder access requires Chrome or Edge browser"
        disabled
      >
        <Folder className="w-4 h-4" />
        <span className="hidden sm:inline">Local</span>
      </button>
    );
  }

  return (
    <>
      {/* Main Button */}
      <button
        onClick={handleClick}
        disabled={isLoading}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all hover:opacity-80"
        style={{
          background: adapter ? theme.colors.success : theme.colors.secondary,
          color: adapter ? theme.colors.textOnPrimary : theme.colors.text,
          border: `1px solid ${adapter ? theme.colors.success : theme.colors.border}`,
          opacity: isLoading ? 0.7 : 1,
        }}
        title={
          adapter
            ? `Local folder: ${folderName} (click to disconnect)`
            : 'Open local folder'
        }
      >
        {adapter ? (
          <FolderOpen className="w-4 h-4" />
        ) : (
          <Folder className="w-4 h-4" />
        )}
        <span className="hidden sm:inline">
          {adapter ? folderName : 'Local'}
        </span>
        {adapter && (
          <span
            className="ml-1 px-1.5 py-0.5 text-xs rounded-full"
            style={{
              background: 'rgba(255,255,255,0.2)',
            }}
          >
            Active
          </span>
        )}
      </button>

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
                  Disconnect Local Folder?
                </h3>
                <p
                  className="text-sm mb-4"
                  style={{ color: theme.colors.textMuted }}
                >
                  This will disconnect <strong>{folderName}</strong> from this
                  repository. You can reconnect it anytime.
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
                      ? theme.colors.error
                      : theme.colors.primary,
                  color: theme.colors.textOnPrimary,
                }}
              >
                {dialog.type === 'disconnect'
                  ? 'Disconnect'
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
