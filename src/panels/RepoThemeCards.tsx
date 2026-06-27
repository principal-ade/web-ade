'use client';

import React from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { Sparkles } from 'lucide-react';
import type { CommitTheme } from '@/hooks/useCommitThemes';
import { InlineTrailLoader } from '@/components/trail/InlineTrailLoader';

interface RepoThemeCardsProps {
  themes: CommitTheme[];
  loading: boolean;
  error: string | null;
  selectedTitle: string | null;
  onSelect: (title: string | null) => void;
}

export const RepoThemeCards: React.FC<RepoThemeCardsProps> = ({
  themes,
  loading,
  error,
  selectedTitle,
  onSelect,
}) => {
  const { theme } = useTheme();
  const spacing = { xs: 4, sm: 8, md: 12, lg: 16 };

  if (!loading && !error && themes.length === 0) return null;

  return (
    <div
      style={{
        padding: `${spacing.md}px ${spacing.lg}px`,
        borderBottom: `1px solid ${theme.colors.border}`,
        background: theme.colors.background,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing.xs,
          marginBottom: spacing.sm,
          fontSize: theme.fontSizes[1],
          color: theme.colors.textMuted,
        }}
      >
        <Sparkles size={12} />
        <span>Themes</span>
        {loading && <InlineTrailLoader size={12} />}
        {error && <span style={{ color: theme.colors.error }}>— {error}</span>}
      </div>

      <div
        style={{
          display: 'flex',
          gap: spacing.sm,
          overflowX: 'auto',
          paddingBottom: spacing.xs,
        }}
      >
        {themes.map((t) => {
          const isSelected = selectedTitle === t.title;
          return (
            <button
              key={t.title}
              onClick={() => onSelect(isSelected ? null : t.title)}
              style={{
                flex: '0 0 auto',
                minWidth: 180,
                maxWidth: 260,
                textAlign: 'left',
                padding: `${spacing.sm}px ${spacing.md}px`,
                background: isSelected ? theme.colors.primary + '20' : theme.colors.secondary,
                color: theme.colors.text,
                border: `1px solid ${isSelected ? theme.colors.primary : theme.colors.border}`,
                borderRadius: '6px',
                cursor: 'pointer',
                fontFamily: theme.fonts.body,
                display: 'flex',
                flexDirection: 'column',
                gap: spacing.xs,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: spacing.sm,
                }}
              >
                <span
                  style={{
                    fontSize: theme.fontSizes[2],
                    fontWeight: 600,
                    color: isSelected ? theme.colors.primary : theme.colors.text,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t.title}
                </span>
                <span
                  style={{
                    flex: '0 0 auto',
                    fontSize: theme.fontSizes[0],
                    color: theme.colors.textMuted,
                    padding: `1px ${spacing.xs}px`,
                    border: `1px solid ${theme.colors.border}`,
                    borderRadius: '999px',
                  }}
                >
                  {t.shas.length}
                </span>
              </div>
              {t.summary && (
                <span
                  style={{
                    fontSize: theme.fontSizes[1],
                    color: theme.colors.textMuted,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {t.summary}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
