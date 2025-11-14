'use client';

import { useTheme, Theme } from '@a24z/industry-theme';
import { LucideIcon } from 'lucide-react';

interface EmptyStatePanelProps {
  title: string;
  description?: string;
  Icon?: LucideIcon;
  theme?: Theme;
}

export function EmptyStatePanel({ title, description, Icon, theme: propTheme }: EmptyStatePanelProps) {
  const { theme: contextTheme } = useTheme();
  const theme = propTheme || contextTheme;

  return (
    <div className="flex h-full w-full items-center justify-center p-4">
      <div className="text-center">
        {Icon && (
          <Icon
            className="w-12 h-12 mx-auto mb-4"
            style={{ color: theme.colors.primary, opacity: 0.5 }}
          />
        )}
        <h3 className="text-lg font-semibold mb-2" style={{ color: theme.colors.text }}>
          {title}
        </h3>
        {description && (
          <p className="text-sm" style={{ color: theme.colors.textMuted }}>
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
