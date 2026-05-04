'use client';

/**
 * Ported from desktop-app/electron-app/.../SharedSequenceDiagramRow.tsx.
 * Same UX, web-ade types in place of the desktop's IPC types.
 */

import React, { useCallback, useState } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { GitCompare, Loader2, Share2 } from 'lucide-react';
import type { SharedSequenceDiagramIndexEntry } from '@/lib/sequence-diagrams/types';

const relativeTime = (iso: string): string => {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
};

export interface SharedSequenceDiagramRowProps {
  entry: SharedSequenceDiagramIndexEntry;
  isActive: boolean;
  onActivate: (id: string) => Promise<void>;
}

export const SharedSequenceDiagramRow: React.FC<SharedSequenceDiagramRowProps> = ({
  entry,
  isActive,
  onActivate,
}) => {
  const { theme } = useTheme();
  const [hovered, setHovered] = useState(false);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleActivate = useCallback(async () => {
    if (activating) return;
    setActivating(true);
    setError(null);
    try {
      await onActivate(entry.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this share.');
    } finally {
      setActivating(false);
    }
  }, [activating, entry.id, onActivate]);

  const title = entry.title?.trim() || `Untitled flow · ${entry.eventCount} events`;
  const author = entry.createdBy?.githubLogin;

  return (
    <div
      role="button"
      tabIndex={0}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleActivate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleActivate();
        }
      }}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        gap: '10px',
        padding: '10px 12px',
        borderRadius: '8px',
        border: `1px solid ${isActive ? theme.colors.primary : theme.colors.border}`,
        background: hovered
          ? theme.colors.backgroundSecondary
          : theme.colors.background,
        cursor: activating ? 'wait' : 'pointer',
        position: 'relative',
        transition: 'background 120ms, border-color 120ms',
      }}
    >
      <div
        aria-hidden
        style={{
          width: '3px',
          borderRadius: '2px',
          background: isActive ? theme.colors.primary : 'transparent',
        }}
      />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            minWidth: 0,
          }}
        >
          <Share2
            size={12}
            color={theme.colors.primary}
            aria-label="Shared on web-ade"
          />
          <span
            style={{
              fontSize: theme.fontSizes[1],
              fontWeight: theme.fontWeights.medium,
              color: theme.colors.text,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
              minWidth: 0,
            }}
            title={title}
          >
            {title}
          </span>
          {entry.hasDiffSnippets && (
            <span
              title="Includes diff snippets"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                padding: '1px 6px',
                fontSize: theme.fontSizes[0],
                color: theme.colors.textSecondary,
                border: `1px solid ${theme.colors.border}`,
                borderRadius: '999px',
                whiteSpace: 'nowrap',
              }}
            >
              <GitCompare size={10} />
              diff
            </span>
          )}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: theme.fontSizes[0],
            color: theme.colors.textSecondary,
          }}
        >
          <span>{entry.eventCount} events</span>
          <span aria-hidden>·</span>
          <span title={entry.updatedAt}>{relativeTime(entry.updatedAt)}</span>
          {author && (
            <>
              <span aria-hidden>·</span>
              <span title={`GitHub: ${author}`}>by {author}</span>
            </>
          )}
        </div>
        {entry.summaryPreview && (
          <div
            style={{
              fontSize: theme.fontSizes[0],
              color: theme.colors.textSecondary,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {entry.summaryPreview}
          </div>
        )}
        {error && (
          <div
            title={error}
            style={{
              fontSize: theme.fontSizes[0],
              color: theme.colors.error ?? theme.colors.textSecondary,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {error}
          </div>
        )}
      </div>
      {activating && (
        <div
          style={{
            alignSelf: 'flex-start',
            padding: '4px',
            color: theme.colors.textSecondary,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Loader2
            size={14}
            style={{ animation: 'spin 1s linear infinite' }}
          />
        </div>
      )}
    </div>
  );
};
