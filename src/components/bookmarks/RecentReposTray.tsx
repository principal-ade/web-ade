'use client';

import React from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { Star, GripVertical } from 'lucide-react';
import type { BookmarkRepo } from './types';
import { REPO_DND_MIME } from './types';

interface RecentReposTrayProps {
  repos: BookmarkRepo[];
  // full_names already placed in the passport — shown dimmed/disabled here.
  placed: Set<string>;
}

// The source list: recently-opened repos rendered as draggable chips. Users
// drag a chip onto a passport slot to "stamp" it. Repos already placed are
// dimmed so it's clear what's left to collect.
export function RecentReposTray({ repos, placed }: RecentReposTrayProps) {
  const { theme } = useTheme();

  return (
    <aside
      style={{
        width: '260px',
        flexShrink: 0,
        padding: '16px',
        borderRadius: theme.radii[3] ?? 14,
        background: theme.colors.backgroundSecondary,
        border: `1px solid ${theme.colors.border}`,
      }}
    >
      <div
        style={{
          fontSize: theme.fontSizes[0],
          fontWeight: theme.fontWeights.bold,
          textTransform: 'uppercase',
          letterSpacing: '0.6px',
          color: theme.colors.text,
          marginBottom: '4px',
        }}
      >
        Recent repos
      </div>
      <div
        style={{
          fontSize: theme.fontSizes[1],
          color: theme.colors.textMuted,
          marginBottom: '12px',
        }}
      >
        Drag a repo onto your passport →
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {repos.map((repo) => {
          const isPlaced = placed.has(repo.full_name);
          return (
            <div
              key={repo.full_name}
              draggable={!isPlaced}
              onDragStart={(e) => {
                e.dataTransfer.setData(REPO_DND_MIME, repo.full_name);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              className="flex items-center gap-2"
              style={{
                padding: '8px 10px',
                borderRadius: theme.radii[2] ?? 10,
                background: theme.colors.surface,
                border: `1px solid ${theme.colors.border}`,
                cursor: isPlaced ? 'default' : 'grab',
                opacity: isPlaced ? 0.4 : 1,
                boxShadow: isPlaced ? 'none' : theme.shadows[0],
              }}
            >
              <GripVertical size={14} style={{ color: theme.colors.textMuted, flexShrink: 0 }} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${repo.owner.avatar_url}${
                  repo.owner.avatar_url.includes('?') ? '&' : '?'
                }s=48`}
                alt=""
                width={24}
                height={24}
                style={{ borderRadius: theme.radii[1] ?? 5, flexShrink: 0 }}
              />
              <div className="min-w-0 flex-1">
                <div
                  className="truncate"
                  style={{
                    fontSize: theme.fontSizes[2],
                    fontWeight: theme.fontWeights.semibold,
                    color: theme.colors.text,
                  }}
                >
                  {repo.name}
                </div>
                <div
                  className="truncate"
                  style={{ fontSize: theme.fontSizes[1], color: theme.colors.textMuted }}
                >
                  {repo.owner.login}
                </div>
              </div>
              {typeof repo.stargazers_count === 'number' && (
                <span
                  className="flex items-center gap-1"
                  style={{
                    fontSize: theme.fontSizes[1],
                    color: theme.colors.textMuted,
                    flexShrink: 0,
                  }}
                >
                  <Star size={11} />
                  {repo.stargazers_count.toLocaleString()}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
