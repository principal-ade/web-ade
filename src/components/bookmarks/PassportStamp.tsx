'use client';

import React from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { Star, X, GripVertical } from 'lucide-react';
import type { BookmarkRepo } from './types';
import { REPO_DND_MIME } from './types';

interface PassportStampProps {
  repo: BookmarkRepo;
  onRemove?: () => void;
  // When set, the stamp itself is draggable so placed repos can be moved
  // between slots. Carries the originating slot index.
  draggableFromSlot?: number;
}

// A placed repo, styled as an inked passport stamp: a squarish card sitting
// square in its slot, with the double "ink" border that reads as a stamp.
export function PassportStamp({ repo, onRemove, draggableFromSlot }: PassportStampProps) {
  const { theme } = useTheme();
  const ink = theme.colors.primary;

  return (
    <div
      draggable={draggableFromSlot !== undefined}
      onDragStart={(e) => {
        if (draggableFromSlot === undefined) return;
        e.dataTransfer.setData(REPO_DND_MIME, repo.full_name);
        e.dataTransfer.setData('text/x-from-slot', String(draggableFromSlot));
        e.dataTransfer.effectAllowed = 'move';
      }}
      className="group relative flex h-full w-full flex-col"
      style={{
        padding: '12px',
        borderRadius: theme.radii[2] ?? 8,
        background: `color-mix(in srgb, ${theme.colors.surface} 88%, ${ink})`,
        border: `2px solid ${ink}`,
        outline: `2px solid ${ink}`,
        outlineOffset: '3px',
        boxShadow: theme.shadows[1] ?? '0 4px 10px rgba(0,0,0,0.18)',
        color: theme.colors.text,
        cursor: draggableFromSlot !== undefined ? 'grab' : 'default',
      }}
    >
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${repo.name}`}
          onClick={onRemove}
          className="absolute opacity-0 transition-opacity group-hover:opacity-100"
          style={{
            top: '4px',
            right: '4px',
            width: '20px',
            height: '20px',
            display: 'grid',
            placeItems: 'center',
            borderRadius: '50%',
            border: `1px solid ${ink}`,
            background: theme.colors.surface,
            color: ink,
            cursor: 'pointer',
            zIndex: 2,
          }}
        >
          <X size={12} />
        </button>
      )}

      <div className="flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${repo.owner.avatar_url}${
            repo.owner.avatar_url.includes('?') ? '&' : '?'
          }s=64`}
          alt=""
          width={28}
          height={28}
          style={{ borderRadius: theme.radii[1] ?? 6, flexShrink: 0 }}
        />
        <div className="min-w-0">
          <div
            className="truncate"
            style={{
              fontSize: theme.fontSizes[2],
              fontWeight: theme.fontWeights.bold,
              lineHeight: 1.15,
            }}
            title={repo.name}
          >
            {repo.name}
          </div>
          <div
            className="truncate"
            style={{ fontSize: theme.fontSizes[1], color: theme.colors.textMuted }}
            title={repo.owner.login}
          >
            {repo.owner.login}
          </div>
        </div>
      </div>

      <div
        className="mt-auto flex items-center justify-between"
        style={{ paddingTop: '8px', color: theme.colors.textSecondary }}
      >
        {repo.language ? (
          <span
            style={{
              fontSize: theme.fontSizes[0],
              fontWeight: theme.fontWeights.semibold,
              letterSpacing: '0.3px',
            }}
          >
            {repo.language}
          </span>
        ) : (
          <span
            style={{ fontSize: theme.fontSizes[0], color: theme.colors.accent, letterSpacing: '1px' }}
          >
            ✦ ENTRY ✦
          </span>
        )}
        {typeof repo.stargazers_count === 'number' && (
          <span className="flex items-center gap-1" style={{ fontSize: theme.fontSizes[1] }}>
            <Star size={11} />
            {repo.stargazers_count.toLocaleString()}
          </span>
        )}
      </div>

      {draggableFromSlot !== undefined && (
        <GripVertical
          size={12}
          aria-hidden
          className="absolute opacity-0 transition-opacity group-hover:opacity-60"
          style={{ bottom: '4px', left: '2px', color: ink }}
        />
      )}
    </div>
  );
}
