'use client';

import { useGlobalTheme, availableThemes } from '@/contexts/ThemeContext';
import { useTheme } from '@principal-ade/industry-theme';

export function ThemeToggle() {
  const { currentThemeName, setTheme, cycleTheme } = useGlobalTheme();
  const { theme } = useTheme();

  return (
    <div
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 1000,
        display: 'flex',
        gap: '8px',
        alignItems: 'center',
      }}
    >
      <span
        style={{
          color: theme.colors.textMuted,
          fontSize: theme.fontSizes[1],
          fontWeight: 500,
        }}
      >
        Theme:
      </span>
      <select
        value={currentThemeName}
        onChange={(e) => setTheme(e.target.value as typeof currentThemeName)}
        style={{
          background: theme.colors.surface,
          color: theme.colors.text,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: theme.radii[1],
          padding: `${theme.space[2]}px ${theme.space[3]}px`,
          fontSize: theme.fontSizes[1],
          fontWeight: 500,
          cursor: 'pointer',
          outline: 'none',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = theme.colors.primary;
          e.currentTarget.style.background = theme.colors.backgroundSecondary;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = theme.colors.border;
          e.currentTarget.style.background = theme.colors.surface;
        }}
      >
        {availableThemes.map(({ name }) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      <button
        onClick={cycleTheme}
        style={{
          background: theme.colors.primary,
          color: theme.colors.background,
          border: 'none',
          borderRadius: theme.radii[1],
          padding: `${theme.space[2]}px ${theme.space[3]}px`,
          fontSize: theme.fontSizes[1],
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = '0.8';
          e.currentTarget.style.transform = 'translateY(-1px)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = '1';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
        title="Cycle through themes"
      >
        Cycle Theme
      </button>
    </div>
  );
}
