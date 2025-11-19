/**
 * Utility functions for grouping and managing repository sessions
 */

import type { RepositorySession } from '@/hooks/usePresenceData';

/**
 * Grouped sessions by device
 */
export interface GroupedSessions {
  currentDevice: RepositorySession[];
  otherDevices: Map<
    string,
    {
      agentId: string;
      clientType: 'desktop' | 'web';
      sessions: RepositorySession[];
    }
  >;
}

/**
 * Groups sessions by device, separating current device from others
 *
 * @param allSessions - All repository sessions for the user
 * @param currentAgentId - The agentId of the current device
 * @returns Grouped sessions
 */
export function groupSessionsByDevice(
  allSessions: RepositorySession[],
  currentAgentId: string
): GroupedSessions {
  const currentDevice: RepositorySession[] = [];
  const otherDevices = new Map<
    string,
    {
      agentId: string;
      clientType: 'desktop' | 'web';
      sessions: RepositorySession[];
    }
  >();

  for (const session of allSessions) {
    if (session.agentId === currentAgentId) {
      currentDevice.push(session);
    } else {
      const existing = otherDevices.get(session.agentId);
      if (existing) {
        existing.sessions.push(session);
      } else {
        otherDevices.set(session.agentId, {
          agentId: session.agentId,
          clientType: session.clientType || 'desktop',
          sessions: [session],
        });
      }
    }
  }

  return { currentDevice, otherDevices };
}

/**
 * Gets a human-readable device type label
 *
 * @param clientType - The client type from the session
 * @returns Display label
 */
export function getDeviceTypeLabel(clientType: 'desktop' | 'web'): string {
  return clientType === 'desktop' ? 'Desktop' : 'Web Browser';
}

/**
 * Formats a repository ID for display
 *
 * @param repoId - Repository ID (e.g., "owner/repo")
 * @returns Formatted string
 */
export function formatRepoId(repoId: string): string {
  return repoId;
}

/**
 * Gets relative time string from timestamp
 *
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Relative time string (e.g., "2 minutes ago")
 */
export function getRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}
