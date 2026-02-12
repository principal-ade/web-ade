'use client';

import { useTheme } from '@principal-ade/industry-theme';
import { X, Package, GitCommit, Calendar, Globe, Activity } from 'lucide-react';
import type { VersionRegistration } from '@/lib/version-registry/types';

interface VersionRegistryModalProps {
  isOpen: boolean;
  onClose: () => void;
  registrations: VersionRegistration[];
  loading: boolean;
  error: string | null;
  repositoryName: string;
  liveVersions?: string[];
}

export function VersionRegistryModal({
  isOpen,
  onClose,
  registrations,
  loading,
  error,
  repositoryName,
  liveVersions = [],
}: VersionRegistryModalProps) {
  const { theme } = useTheme();

  // Create a Set for faster lookup
  const liveVersionsSet = new Set(liveVersions);

  if (!isOpen) return null;

  // Format timestamp
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  // Group registrations by service
  const groupedByService = registrations.reduce((acc, reg) => {
    if (!acc[reg.serviceName]) {
      acc[reg.serviceName] = [];
    }
    acc[reg.serviceName]!.push(reg);
    return acc;
  }, {} as Record<string, VersionRegistration[]>);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{
        background: 'rgba(0, 0, 0, 0.5)',
      }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[80vh] overflow-hidden rounded-lg shadow-xl"
        style={{
          background: theme.colors.surface,
          border: `1px solid ${theme.colors.border}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{
            borderColor: theme.colors.border,
          }}
        >
          <div>
            <h2
              className="text-xl font-semibold"
              style={{
                color: theme.colors.text,
                fontFamily: theme.fonts.heading,
              }}
            >
              Version Registry
            </h2>
            <p
              className="text-sm mt-1"
              style={{
                color: theme.colors.textMuted,
                fontFamily: theme.fonts.body,
              }}
            >
              {repositoryName}
            </p>
          </div>
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
        </div>

        {/* Content */}
        <div
          className="overflow-y-auto px-6 py-4"
          style={{
            maxHeight: 'calc(80vh - 140px)',
          }}
        >
          {loading && (
            <div
              className="text-center py-8"
              style={{ color: theme.colors.textMuted }}
            >
              Loading registrations...
            </div>
          )}

          {error && (
            <div
              className="px-4 py-3 rounded-md"
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                color: '#ef4444',
                border: '1px solid rgba(239, 68, 68, 0.3)',
              }}
            >
              {error}
            </div>
          )}

          {!loading && !error && registrations.length === 0 && (
            <div
              className="text-center py-12"
              style={{ color: theme.colors.textMuted }}
            >
              <Package className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-base mb-2">No versions registered</p>
              <p className="text-sm">
                Register versions using the{' '}
                <code
                  className="px-2 py-1 rounded text-xs"
                  style={{
                    background: theme.colors.secondary,
                    color: theme.colors.text,
                  }}
                >
                  POST /api/versions
                </code>{' '}
                endpoint
              </p>
            </div>
          )}

          {!loading && !error && registrations.length > 0 && (
            <div className="space-y-6">
              {Object.entries(groupedByService).map(([serviceName, serviceRegs]) => (
                <div key={serviceName}>
                  <h3
                    className="text-lg font-semibold mb-3 flex items-center gap-2"
                    style={{
                      color: theme.colors.text,
                      fontFamily: theme.fonts.heading,
                    }}
                  >
                    <Package className="w-5 h-5" />
                    {serviceName}
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{
                        background: theme.colors.secondary,
                        color: theme.colors.textMuted,
                      }}
                    >
                      {serviceRegs.length}
                    </span>
                  </h3>

                  <div className="space-y-2">
                    {serviceRegs
                      .sort((a, b) => new Date(b.deployedAt).getTime() - new Date(a.deployedAt).getTime())
                      .map((reg, idx) => (
                        <div
                          key={idx}
                          className="p-4 rounded-md border"
                          style={{
                            background: theme.colors.background,
                            borderColor: theme.colors.border,
                          }}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <span
                                  className="font-mono text-sm font-semibold"
                                  style={{ color: theme.colors.text }}
                                >
                                  {reg.version}
                                </span>
                                <span
                                  className="px-2 py-0.5 text-xs rounded-full"
                                  style={{
                                    background: theme.colors.primary,
                                    color: theme.colors.textOnPrimary,
                                  }}
                                >
                                  {reg.environment}
                                </span>
                                {liveVersionsSet.has(reg.version) && (
                                  <span
                                    className="px-2 py-0.5 text-xs rounded-full flex items-center gap-1 font-medium"
                                    style={{
                                      background: 'rgba(34, 197, 94, 0.1)',
                                      color: '#22c55e',
                                      border: '1px solid rgba(34, 197, 94, 0.3)',
                                    }}
                                    title="Currently sending traces (seen in last 5 minutes)"
                                  >
                                    <Activity className="w-3 h-3" />
                                    Live
                                  </span>
                                )}
                              </div>

                              <div className="space-y-1">
                                <div className="flex items-center gap-2 text-sm">
                                  <GitCommit
                                    className="w-3.5 h-3.5 flex-shrink-0"
                                    style={{ color: theme.colors.textMuted }}
                                  />
                                  <a
                                    href={`${reg.repositoryUrl}/commit/${reg.gitSHA}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-mono hover:underline truncate"
                                    style={{ color: theme.colors.textMuted }}
                                  >
                                    {reg.gitSHA.substring(0, 12)}
                                  </a>
                                </div>

                                <div className="flex items-center gap-2 text-sm">
                                  <Calendar
                                    className="w-3.5 h-3.5 flex-shrink-0"
                                    style={{ color: theme.colors.textMuted }}
                                  />
                                  <span style={{ color: theme.colors.textMuted }}>
                                    {formatDate(reg.deployedAt)}
                                  </span>
                                </div>

                                {reg.deployedBy && (
                                  <div className="flex items-center gap-2 text-sm">
                                    <Globe
                                      className="w-3.5 h-3.5 flex-shrink-0"
                                      style={{ color: theme.colors.textMuted }}
                                    />
                                    <span style={{ color: theme.colors.textMuted }}>
                                      {reg.deployedBy}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {!loading && !error && registrations.length > 0 && (
          <div
            className="px-6 py-4 border-t"
            style={{
              borderColor: theme.colors.border,
              background: theme.colors.background,
            }}
          >
            <p
              className="text-sm text-center"
              style={{ color: theme.colors.textMuted }}
            >
              {registrations.length} version{registrations.length !== 1 ? 's' : ''} registered
              {liveVersions.length > 0 && (
                <>
                  {' · '}
                  <span style={{ color: '#22c55e' }}>
                    {liveVersions.length} live
                  </span>
                </>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
