/**
 * SessionsPanel - Display cross-device repository sessions
 *
 * Shows the user which devices they have repositories open on,
 * enabling cross-device awareness.
 */

'use client';

import { usePresenceData, type RepositorySession } from '@/hooks/usePresenceData';
import { groupSessionsByDevice, getDeviceTypeLabel, getRelativeTime } from '@/lib/sessions/sessionUtils';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@principal-ade/industry-theme';
import { Monitor, Globe, RefreshCw, Loader2 } from 'lucide-react';

export function SessionsPanel() {
  const { theme } = useTheme();
  const { isAuthenticated, user } = useAuth();
  const { sessions, currentAgentId, loading, error, refetch } = usePresenceData();

  // Don't render if not authenticated
  if (!isAuthenticated || !user) {
    return (
      <div
        className="h-full w-full flex items-center justify-center p-4"
        style={{ color: theme.colors.textMuted }}
      >
        <div className="text-center">
          <p className="text-sm">Please log in to view your sessions</p>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div
        className="h-full w-full flex items-center justify-center p-4"
        style={{ color: theme.colors.textMuted }}
      >
        <div className="text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
          <p className="text-sm">Loading sessions...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        className="h-full w-full flex items-center justify-center p-4"
        style={{ color: theme.colors.error }}
      >
        <div className="text-center max-w-xs">
          <p className="text-sm mb-2">Failed to load sessions</p>
          <p className="text-xs mb-4" style={{ color: theme.colors.textMuted }}>
            {error.message}
          </p>
          <button
            onClick={() => void refetch()}
            className="px-3 py-1.5 text-xs rounded"
            style={{
              background: theme.colors.surface,
              color: theme.colors.text,
              border: `1px solid ${theme.colors.border}`,
            }}
          >
            <RefreshCw className="h-3 w-3 inline mr-1" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Group sessions by device
  const grouped = currentAgentId
    ? groupSessionsByDevice(sessions, currentAgentId)
    : { currentDevice: sessions, otherDevices: new Map() };

  // Empty state
  if (sessions.length === 0) {
    return (
      <div
        className="h-full w-full flex items-center justify-center p-4"
        style={{ color: theme.colors.textMuted }}
      >
        <div className="text-center max-w-xs">
          <Globe className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <h3 className="text-sm font-semibold mb-1" style={{ color: theme.colors.text }}>
            No Active Sessions
          </h3>
          <p className="text-xs">
            Open a repository in the editor or desktop app to see your active sessions here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-full w-full flex flex-col overflow-hidden"
      style={{ background: theme.colors.background }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between p-3 border-b"
        style={{ borderColor: theme.colors.border }}
      >
        <h3 className="text-sm font-semibold" style={{ color: theme.colors.text }}>
          Your Sessions
        </h3>
        <button
          onClick={() => void refetch()}
          className="p-1 rounded hover:opacity-75"
          style={{ color: theme.colors.textMuted }}
          title="Refresh sessions"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Current Device */}
        {grouped.currentDevice.length > 0 && (
          <div>
            <div
              className="flex items-center gap-2 text-xs font-medium mb-2"
              style={{ color: theme.colors.textMuted }}
            >
              <Globe className="h-3 w-3" />
              <span>This Device (Web)</span>
            </div>
            <div className="space-y-1.5">
              {grouped.currentDevice.map((session) => (
                <div
                  key={session.repoId}
                  className="p-2 rounded text-xs"
                  style={{
                    background: theme.colors.surface,
                    border: `1px solid ${theme.colors.border}`,
                  }}
                >
                  <div className="font-medium mb-0.5" style={{ color: theme.colors.text }}>
                    {session.repoId}
                  </div>
                  <div className="flex items-center justify-between">
                    <span style={{ color: theme.colors.textMuted }}>{session.branch}</span>
                    <span className="text-[10px]" style={{ color: theme.colors.textMuted }}>
                      {getRelativeTime(session.lastActivity)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Other Devices */}
        {grouped.otherDevices.size > 0 && (
          <div>
            <div
              className="text-xs font-medium mb-2"
              style={{ color: theme.colors.textMuted }}
            >
              Other Devices
            </div>
            {Array.from(grouped.otherDevices.values()).map((device) => (
              <div key={device.agentId} className="mb-3">
                <div className="flex items-center gap-2 text-xs mb-1.5">
                  {device.clientType === 'desktop' ? (
                    <Monitor className="h-3 w-3" style={{ color: theme.colors.textMuted }} />
                  ) : (
                    <Globe className="h-3 w-3" style={{ color: theme.colors.textMuted }} />
                  )}
                  <span className="font-medium" style={{ color: theme.colors.text }}>
                    {getDeviceTypeLabel(device.clientType)}
                  </span>
                </div>
                <div className="space-y-1.5 pl-5">
                  {device.sessions.map((session: RepositorySession) => (
                    <div
                      key={session.repoId}
                      className="p-2 rounded text-xs"
                      style={{
                        background: theme.colors.surface,
                        border: `1px solid ${theme.colors.border}`,
                      }}
                    >
                      <div className="font-medium mb-0.5" style={{ color: theme.colors.text }}>
                        {session.repoId}
                      </div>
                      <div className="flex items-center justify-between">
                        <span style={{ color: theme.colors.textMuted }}>{session.branch}</span>
                        <span className="text-[10px]" style={{ color: theme.colors.textMuted }}>
                          {getRelativeTime(session.lastActivity)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer - Status */}
      {sessions.length > 0 && (
        <div
          className="p-2 border-t text-[10px] text-center"
          style={{
            borderColor: theme.colors.border,
            color: theme.colors.textMuted,
          }}
        >
          {sessions.length} active session{sessions.length !== 1 ? 's' : ''} •{' '}
          {grouped.otherDevices.size + 1} device{grouped.otherDevices.size !== 0 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
