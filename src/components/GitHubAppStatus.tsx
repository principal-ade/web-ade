'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { Github, Check, ExternalLink, RefreshCw, Zap } from 'lucide-react';
import { LoadingSpinner } from './LoadingSpinner';

interface GitHubAppStatusProps {
  repoId: string;
  /** Base URL of the repository traffic controller */
  trafficControllerUrl?: string;
  /** Callback when install is initiated */
  onInstallClick?: () => void;
  /** Compact mode for inline display */
  compact?: boolean;
  /** Whether the user has permission to install the GitHub App (admin access) */
  canInstall?: boolean;
}

interface AppStatus {
  installed: boolean;
  installationId?: number;
  installedAt?: number;
  installedBy?: string;
  suspended?: boolean;
  events?: string[];
}

interface InstallUrlResponse {
  installUrl: string;
  appSlug: string;
  repoId: string | null;
  instructions: string[];
}

/**
 * GitHubAppStatus Component
 *
 * Shows whether the Principal GitHub App is installed on a repository
 * and provides a button to install it if not.
 */
export function GitHubAppStatus({
  repoId,
  trafficControllerUrl = process.env.NEXT_PUBLIC_TRAFFIC_CONTROLLER_URL || 'http://localhost:3000',
  onInstallClick,
  compact = false,
  canInstall = false,
}: GitHubAppStatusProps) {
  const { theme } = useTheme();
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [installUrl, setInstallUrl] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!repoId) return;

    setLoading(true);
    setError(null);

    try {
      // Parse repoId (format: "owner/repo")
      const [owner, repo] = repoId.split('/');

      if (!owner || !repo) {
        throw new Error('Invalid repository ID format');
      }

      // Use local API endpoint that checks GitHub directly
      const response = await fetch(
        `/api/github/repo/${owner}/${repo}/app-installation`
      );

      if (!response.ok && response.status !== 404) {
        throw new Error('Failed to fetch app status');
      }

      const data: AppStatus = await response.json();
      setStatus(data);

      // If not installed, fetch the install URL from traffic controller
      if (!data.installed) {
        const urlResponse = await fetch(
          `${trafficControllerUrl}/api/github-app/install-url?repoId=${encodeURIComponent(repoId)}`
        );

        if (urlResponse.ok) {
          const urlData: InstallUrlResponse = await urlResponse.json();
          setInstallUrl(urlData.installUrl);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check status');
    } finally {
      setLoading(false);
    }
  }, [repoId, trafficControllerUrl]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleInstallClick = () => {
    if (installUrl) {
      onInstallClick?.();
      window.open(installUrl, '_blank', 'noopener,noreferrer');
    }
  };

  // Compact mode - just a small badge
  if (compact) {
    if (loading) {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 8px',
            borderRadius: '4px',
            backgroundColor: theme.colors.backgroundTertiary,
            fontSize: `${theme.fontSizes[0]}px`,
            color: theme.colors.textSecondary,
          }}
        >
          <LoadingSpinner size={12} />
        </span>
      );
    }

    if (status?.installed && !status.suspended) {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 8px',
            borderRadius: '4px',
            backgroundColor: '#10b98120',
            fontSize: `${theme.fontSizes[0]}px`,
            color: '#10b981',
            fontWeight: theme.fontWeights.medium,
          }}
          title="GitHub App installed - Real-time sync enabled"
        >
          <Zap size={12} />
          Sync Active
        </span>
      );
    }

    // Hide the "Enable Sync" button in compact mode
    // Only show the "Sync Active" badge when already installed
    return null;
  }

  // Full mode - card display
  return (
    <div
      style={{
        backgroundColor: theme.colors.backgroundSecondary,
        borderRadius: '8px',
        border: `1px solid ${theme.colors.border}`,
        padding: '16px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: theme.colors.backgroundTertiary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Github size={18} style={{ color: theme.colors.text }} />
          </div>
          <div>
            <h4
              style={{
                margin: 0,
                fontSize: `${theme.fontSizes[2]}px`,
                fontWeight: theme.fontWeights.medium,
                color: theme.colors.text,
              }}
            >
              Real-time Sync
            </h4>
            <p
              style={{
                margin: 0,
                fontSize: `${theme.fontSizes[1]}px`,
                color: theme.colors.textSecondary,
              }}
            >
              Principal GitHub App
            </p>
          </div>
        </div>

        <button
          onClick={fetchStatus}
          disabled={loading}
          style={{
            background: 'none',
            border: 'none',
            padding: '6px',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            color: theme.colors.textSecondary,
            opacity: loading ? 0.5 : 1,
          }}
          title="Refresh status"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: theme.colors.textSecondary,
            fontSize: `${theme.fontSizes[1]}px`,
          }}
        >
          <LoadingSpinner size={14} />
          Checking status...
        </div>
      ) : error ? (
        <div
          style={{
            padding: '12px',
            backgroundColor: '#ef444420',
            borderRadius: '6px',
            fontSize: `${theme.fontSizes[1]}px`,
            color: '#ef4444',
          }}
        >
          {error}
        </div>
      ) : status?.installed && !status.suspended ? (
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 12px',
              backgroundColor: '#10b98120',
              borderRadius: '6px',
              marginBottom: '12px',
            }}
          >
            <Check size={16} style={{ color: '#10b981' }} />
            <span
              style={{
                fontSize: `${theme.fontSizes[1]}px`,
                color: '#10b981',
                fontWeight: theme.fontWeights.medium,
              }}
            >
              Installed & Active
            </span>
          </div>

          <p
            style={{
              margin: 0,
              fontSize: `${theme.fontSizes[1]}px`,
              color: theme.colors.textSecondary,
              lineHeight: 1.5,
            }}
          >
            Backlog changes are synced in real-time. When you move a task, connected
            desktop apps will be notified automatically.
          </p>

          {status.installedBy && status.installedAt && (
            <p
              style={{
                margin: '8px 0 0 0',
                fontSize: `${theme.fontSizes[0]}px`,
                color: theme.colors.textTertiary,
              }}
            >
              Installed by {status.installedBy} on{' '}
              {new Date(status.installedAt).toLocaleDateString()}
            </p>
          )}
        </div>
      ) : status?.suspended ? (
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 12px',
              backgroundColor: '#f59e0b20',
              borderRadius: '6px',
              marginBottom: '12px',
            }}
          >
            <span
              style={{
                fontSize: `${theme.fontSizes[1]}px`,
                color: '#f59e0b',
                fontWeight: theme.fontWeights.medium,
              }}
            >
              App Suspended
            </span>
          </div>

          <p
            style={{
              margin: 0,
              fontSize: `${theme.fontSizes[1]}px`,
              color: theme.colors.textSecondary,
            }}
          >
            The GitHub App is currently suspended. Please check your GitHub App settings.
          </p>
        </div>
      ) : canInstall ? (
        <div>
          <p
            style={{
              margin: '0 0 12px 0',
              fontSize: `${theme.fontSizes[1]}px`,
              color: theme.colors.textSecondary,
              lineHeight: 1.5,
            }}
          >
            Install the Principal GitHub App to enable real-time sync between this
            repository and your desktop app. When you move backlog tasks, agents will
            automatically start working on them.
          </p>

          <button
            onClick={handleInstallClick}
            disabled={!installUrl}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 16px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: theme.colors.primary,
              color: theme.colors.textOnPrimary,
              fontSize: `${theme.fontSizes[2]}px`,
              fontWeight: theme.fontWeights.medium,
              cursor: installUrl ? 'pointer' : 'not-allowed',
              opacity: installUrl ? 1 : 0.5,
            }}
          >
            <Github size={16} />
            Install GitHub App
            <ExternalLink size={14} />
          </button>
        </div>
      ) : (
        <div>
          <p
            style={{
              margin: 0,
              fontSize: `${theme.fontSizes[1]}px`,
              color: theme.colors.textSecondary,
              lineHeight: 1.5,
            }}
          >
            Real-time sync is not enabled. Contact a repository admin to install the
            Principal GitHub App.
          </p>
        </div>
      )}
    </div>
  );
}
