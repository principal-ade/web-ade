'use client';

import { useState, useEffect } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import {
  Blocks,
  KanbanSquare,
  BookOpen,
  FileCode,
  CircleDot,
  Hexagon,
  LineChart,
  GitPullRequest,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { layoutConfigs, LayoutConfig } from './LayoutConfigDropdown';

const layoutIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  default: Blocks,
  kanban: KanbanSquare,
  documentation: BookOpen,
  'file-editor': FileCode,
  'github-issues': CircleDot,
  'quality-debug': Hexagon,
  'file-city': LineChart,
  'pull-requests': GitPullRequest,
};

interface LayoutSidebarProps {
  currentConfigId: string;
  onConfigChange: (config: LayoutConfig) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function LayoutSidebar({
  currentConfigId,
  onConfigChange,
  collapsed,
  onToggleCollapse,
}: LayoutSidebarProps) {
  const { theme } = useTheme();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  if (isMobile) return null;

  return (
    <aside
      className="h-full flex flex-col flex-shrink-0"
      style={{
        width: collapsed ? '48px' : '200px',
        transition: 'width 200ms ease-in-out',
        background: theme.colors.surface,
        borderRight: `1px solid ${theme.colors.border}`,
      }}
    >
      {/* Collapse Toggle */}
      <button
        onClick={onToggleCollapse}
        className="flex items-center justify-center h-14 transition-all hover:opacity-80"
        style={{
          borderBottom: `1px solid ${theme.colors.border}`,
          color: theme.colors.textMuted,
        }}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? (
          <ChevronRight className="w-5 h-5" />
        ) : (
          <ChevronLeft className="w-5 h-5" />
        )}
      </button>

      {/* Layout Items */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {layoutConfigs.map((config) => {
          const Icon = layoutIcons[config.id] || Blocks;
          const isActive = config.id === currentConfigId;

          return (
            <button
              key={config.id}
              onClick={() => onConfigChange(config)}
              className="w-full flex items-center gap-3 h-10 transition-all"
              style={{
                padding: collapsed ? '0 14px' : '0 12px',
                background: isActive ? theme.colors.backgroundTertiary : 'transparent',
                color: isActive ? theme.colors.primary : theme.colors.text,
              }}
              title={collapsed ? config.name : undefined}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = theme.colors.backgroundSecondary;
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <span
                style={{
                  opacity: collapsed ? 0 : 1,
                  width: collapsed ? 0 : 'auto',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  transition: 'opacity 150ms ease-in-out',
                  fontFamily: theme.fonts.body,
                  fontSize: theme.fontSizes[2],
                }}
              >
                {config.name}
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
