'use client';

import React from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { Star } from 'lucide-react';

// Minimal repo shape — matches the persisted `recent-repositories` entries the
// home page already reads (see readRecentRepos in app/page.tsx).
export interface RecentProjectItem {
  full_name: string;
  name: string;
  owner: { login: string; avatar_url: string };
  description?: string | null;
  stargazers_count?: number;
}

interface RecentProjectsStripProps {
  projects: RecentProjectItem[];
  onOpen: (fullName: string) => void;
}

// A horizontal row of recently-opened repos shown across the bottom of the home
// page so returning visitors can pick up where they left off. Renders nothing
// until there's at least one recent repo.
export function RecentProjectsStrip({ projects, onOpen }: RecentProjectsStripProps) {
  const { theme } = useTheme();
  if (projects.length === 0) return null;

  return (
    <section className="w-full max-w-7xl mx-auto px-6 pb-10 pt-2">
      <div
        className="mb-3"
        style={{
          fontSize: theme.fontSizes[0],
          fontWeight: theme.fontWeights.semibold,
          color: theme.colors.textSecondary,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        Pick up where you left off
      </div>

      <div
        className="hide-scrollbar"
        style={{
          display: 'flex',
          gap: '12px',
          overflowX: 'auto',
          paddingBottom: '4px',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        {projects.map((p) => (
          <button
            key={p.full_name}
            type="button"
            onClick={() => onOpen(p.full_name)}
            className="flex items-center gap-3 text-left transition-colors shrink-0"
            style={{
              minWidth: '240px',
              maxWidth: '260px',
              padding: '12px 14px',
              borderRadius: '10px',
              background: `color-mix(in srgb, ${theme.colors.surface} 60%, transparent)`,
              border: `1px solid color-mix(in srgb, ${theme.colors.border} 70%, transparent)`,
              color: theme.colors.text,
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = `color-mix(in srgb, ${theme.colors.primary} 70%, transparent)`;
              e.currentTarget.style.background = `color-mix(in srgb, ${theme.colors.primary} 10%, transparent)`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = `color-mix(in srgb, ${theme.colors.border} 70%, transparent)`;
              e.currentTarget.style.background = `color-mix(in srgb, ${theme.colors.surface} 60%, transparent)`;
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${p.owner.avatar_url}${
                p.owner.avatar_url.includes('?') ? '&' : '?'
              }s=64`}
              alt=""
              width={32}
              height={32}
              className="rounded-md shrink-0"
              style={{ background: theme.colors.backgroundSecondary }}
            />
            <div className="min-w-0 flex-1">
              <div
                className="truncate"
                style={{
                  fontSize: theme.fontSizes[2],
                  fontWeight: theme.fontWeights.semibold,
                }}
              >
                {p.name}
              </div>
              <div
                className="truncate"
                style={{
                  fontSize: theme.fontSizes[1],
                  color: theme.colors.textMuted,
                }}
              >
                {p.owner.login}
              </div>
            </div>
            {typeof p.stargazers_count === 'number' && (
              <span
                className="flex items-center gap-1 shrink-0"
                style={{
                  color: theme.colors.textMuted,
                  fontSize: theme.fontSizes[1],
                }}
              >
                <Star className="w-3.5 h-3.5" />
                {p.stargazers_count.toLocaleString()}
              </span>
            )}
          </button>
        ))}
      </div>

      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>
    </section>
  );
}
