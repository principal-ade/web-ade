'use client';

import { useState } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { X, Github, Globe, Check, AlertCircle, Loader2, ExternalLink } from 'lucide-react';

interface GitHubSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  repoUrl?: string | null;
  isSynced: boolean;
}

type SyncState = 'idle' | 'syncing' | 'success' | 'error';

export function GitHubSyncModal({
  isOpen,
  onClose,
  onConfirm,
  repoUrl,
  isSynced,
}: GitHubSyncModalProps) {
  const { theme } = useTheme();
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setSyncState('syncing');
    setError(null);

    try {
      await onConfirm();
      setSyncState('success');
      // Auto-close after success
      setTimeout(() => {
        onClose();
        setSyncState('idle');
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync collections');
      setSyncState('error');
    }
  };

  const handleClose = () => {
    if (syncState !== 'syncing') {
      onClose();
      setSyncState('idle');
      setError(null);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: '16px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && syncState !== 'syncing') handleClose();
      }}
    >
      <div
        style={{
          backgroundColor: theme.colors.background,
          borderRadius: '12px',
          border: `1px solid ${theme.colors.border}`,
          padding: '24px',
          width: '100%',
          maxWidth: '480px',
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
            marginBottom: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: theme.colors.backgroundTertiary,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Github size={22} style={{ color: theme.colors.text }} />
            </div>
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: `${theme.fontSizes[4]}px`,
                  fontWeight: theme.fontWeights.semibold,
                  color: theme.colors.text,
                }}
              >
                {isSynced ? 'GitHub Sync Enabled' : 'Sync to GitHub'}
              </h2>
              <p
                style={{
                  margin: 0,
                  fontSize: `${theme.fontSizes[1]}px`,
                  color: theme.colors.textSecondary,
                }}
              >
                {isSynced ? 'Your collections are synced' : 'Save your collections to GitHub'}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={syncState === 'syncing'}
            style={{
              background: 'none',
              border: 'none',
              cursor: syncState === 'syncing' ? 'not-allowed' : 'pointer',
              padding: '8px',
              borderRadius: '6px',
              color: theme.colors.textSecondary,
              opacity: syncState === 'syncing' ? 0.5 : 1,
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        {syncState === 'success' ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '16px',
              padding: '24px 0',
            }}
          >
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                backgroundColor: '#10b98120',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Check size={32} style={{ color: '#10b981' }} />
            </div>
            <p
              style={{
                margin: 0,
                fontSize: `${theme.fontSizes[2]}px`,
                color: theme.colors.text,
                fontWeight: theme.fontWeights.medium,
              }}
            >
              Collections synced successfully!
            </p>
          </div>
        ) : (
          <>
            {/* Info Box */}
            <div
              style={{
                backgroundColor: theme.colors.backgroundTertiary,
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '20px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                }}
              >
                <Globe size={20} style={{ color: theme.colors.primary, flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <p
                    style={{
                      margin: '0 0 8px 0',
                      fontSize: `${theme.fontSizes[2]}px`,
                      color: theme.colors.text,
                      fontWeight: theme.fontWeights.medium,
                    }}
                  >
                    {isSynced ? 'Your collections are stored in:' : 'We will create a public repository:'}
                  </p>
                  <code
                    style={{
                      display: 'inline-block',
                      padding: '6px 10px',
                      backgroundColor: theme.colors.background,
                      borderRadius: '4px',
                      fontSize: `${theme.fontSizes[1]}px`,
                      color: theme.colors.primary,
                      fontFamily: theme.fonts.monospace,
                    }}
                  >
                    web-ade-collections
                  </code>
                  {repoUrl && (
                    <a
                      href={repoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        marginLeft: '8px',
                        fontSize: `${theme.fontSizes[1]}px`,
                        color: theme.colors.primary,
                        textDecoration: 'none',
                      }}
                    >
                      View <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* What happens */}
            {!isSynced && (
              <div style={{ marginBottom: '20px' }}>
                <p
                  style={{
                    margin: '0 0 12px 0',
                    fontSize: `${theme.fontSizes[1]}px`,
                    color: theme.colors.textSecondary,
                    fontWeight: theme.fontWeights.medium,
                  }}
                >
                  What happens:
                </p>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: '20px',
                    color: theme.colors.textSecondary,
                    fontSize: `${theme.fontSizes[1]}px`,
                    lineHeight: 1.6,
                  }}
                >
                  <li>A <strong style={{ color: theme.colors.text }}>public</strong> repository will be created in your GitHub account</li>
                  <li>Your collections will be saved as a JSON file</li>
                  <li>Collections will sync automatically when you make changes</li>
                  <li>Your collections will load automatically when you log in</li>
                </ul>
              </div>
            )}

            {/* Error message */}
            {error && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px',
                  backgroundColor: '#ef444420',
                  borderRadius: '6px',
                  marginBottom: '16px',
                }}
              >
                <AlertCircle size={18} style={{ color: '#ef4444' }} />
                <p
                  style={{
                    margin: 0,
                    fontSize: `${theme.fontSizes[1]}px`,
                    color: '#ef4444',
                  }}
                >
                  {error}
                </p>
              </div>
            )}

            {/* Actions */}
            <div
              style={{
                display: 'flex',
                gap: '12px',
                justifyContent: 'flex-end',
              }}
            >
              <button
                onClick={handleClose}
                disabled={syncState === 'syncing'}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: `1px solid ${theme.colors.border}`,
                  backgroundColor: 'transparent',
                  color: theme.colors.text,
                  fontSize: `${theme.fontSizes[2]}px`,
                  fontWeight: theme.fontWeights.medium,
                  cursor: syncState === 'syncing' ? 'not-allowed' : 'pointer',
                  opacity: syncState === 'syncing' ? 0.5 : 1,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={syncState === 'syncing'}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: theme.colors.primary,
                  color: '#fff',
                  fontSize: `${theme.fontSizes[2]}px`,
                  fontWeight: theme.fontWeights.medium,
                  cursor: syncState === 'syncing' ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                {syncState === 'syncing' ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Syncing...
                  </>
                ) : isSynced ? (
                  <>
                    <Check size={16} />
                    Sync Now
                  </>
                ) : (
                  <>
                    <Github size={16} />
                    Enable Sync
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
