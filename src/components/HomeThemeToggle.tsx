'use client';

import { useGlobalTheme } from '@/contexts/ThemeContext';
import { useTheme } from '@principal-ade/industry-theme';
import { Moon, Code2 } from 'lucide-react';

/**
 * Compact theme toggle for the home page header, mirroring the electron-app's
 * header theme selector (lucide icons, bordered transparent button). It flips
 * between the Dark and Dev themes — the icon/label shows the one you'll switch
 * *to* (Dark→Moon, Dev→Code2).
 */
export function HomeThemeToggle() {
  const { currentThemeName, setTheme } = useGlobalTheme();
  const { theme } = useTheme();

  const isDev = currentThemeName === 'Dev';
  const next = isDev ? 'Dark' : 'Dev';
  const Icon = isDev ? Moon : Code2;

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors hover:opacity-80"
      style={{
        border: `1px solid color-mix(in srgb, ${theme.colors.border} 70%, transparent)`,
        color: theme.colors.textMuted,
        background: `color-mix(in srgb, ${theme.colors.surface} 60%, transparent)`,
      }}
      title={`Switch to ${next} theme`}
      aria-label={`Switch to ${next} theme`}
    >
      <Icon size={14} />
      <span className="hidden sm:inline">{next}</span>
    </button>
  );
}
