'use client';

import { useTheme } from '@principal-ade/industry-theme';
import { User, Github } from 'lucide-react';
import type { ActiveView } from '@/hooks/useHomepageState';

interface SearchToggleButtonsProps {
  activeView: ActiveView;
  onViewChange: (view: ActiveView) => void;
  isAuthenticated: boolean;
}

export function SearchToggleButtons({
  activeView,
  onViewChange,
  isAuthenticated,
}: SearchToggleButtonsProps) {
  const { theme } = useTheme();

  // Don't show toggle when not authenticated
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        backgroundColor: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: '24px',
        padding: '4px',
        marginBottom: '8px',
      }}
    >
      <button
        onClick={() => onViewChange('github-search')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 16px',
          borderRadius: '20px',
          border: 'none',
          background: activeView === 'github-search' ? theme.colors.primary : 'transparent',
          color: activeView === 'github-search' ? theme.colors.textOnPrimary : theme.colors.textMuted,
          fontSize: theme.fontSizes[1],
          fontFamily: theme.fonts.body,
          fontWeight: theme.fontWeights.medium,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
      >
        <Github size={16} />
        <span>Search GitHub</span>
      </button>
      <button
        onClick={() => onViewChange('your-repos')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 16px',
          borderRadius: '20px',
          border: 'none',
          background: activeView === 'your-repos' ? theme.colors.primary : 'transparent',
          color: activeView === 'your-repos' ? theme.colors.textOnPrimary : theme.colors.textMuted,
          fontSize: theme.fontSizes[1],
          fontFamily: theme.fonts.body,
          fontWeight: theme.fontWeights.medium,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
      >
        <User size={16} />
        <span>Your Repos</span>
      </button>
    </div>
  );
}
