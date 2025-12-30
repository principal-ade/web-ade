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
  Home,
} from 'lucide-react';
import Link from 'next/link';
import { Logo } from '@principal-ai/logo-component';
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

// Match header height (h-14 = 56px)
const SIDEBAR_COLLAPSED_WIDTH = 56;
const SIDEBAR_EXPANDED_WIDTH = 200;
// Icon container width to center icons (same as collapsed width)
const ICON_CONTAINER_WIDTH = 56;

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
      className="h-full flex flex-col flex-shrink-0 overflow-hidden"
      style={{
        width: collapsed ? `${SIDEBAR_COLLAPSED_WIDTH}px` : `${SIDEBAR_EXPANDED_WIDTH}px`,
        transition: 'width 200ms ease-in-out',
        background: theme.colors.surface,
        borderRight: `1px solid ${theme.colors.border}`,
      }}
    >
      {/* Logo Header - Click to toggle sidebar */}
      <button
        onClick={onToggleCollapse}
        className="flex items-center w-full transition-opacity hover:opacity-80"
        style={{
          height: `${SIDEBAR_COLLAPSED_WIDTH}px`,
          minWidth: `${SIDEBAR_EXPANDED_WIDTH}px`,
          borderBottom: `1px solid ${theme.colors.border}`,
        }}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <div
          className="flex items-center justify-center flex-shrink-0"
          style={{ width: `${ICON_CONTAINER_WIDTH}px` }}
        >
          <Logo width={28} height={28} color={theme.colors.primary} />
        </div>
        <span
          style={{
            whiteSpace: 'nowrap',
            fontFamily: theme.fonts.heading,
            fontSize: theme.fontSizes[3],
            fontWeight: 600,
          }}
        >
          <span style={{ color: theme.colors.text }}>Principal</span>
          {' '}
          <span style={{ color: theme.colors.primary }}>AI</span>
        </span>
      </button>

      {/* Layout Items */}
      <nav className="flex-1 pb-2 overflow-y-auto overflow-x-hidden">
        {layoutConfigs.map((config) => {
          const Icon = layoutIcons[config.id] || Blocks;
          const isActive = config.id === currentConfigId;

          return (
            <button
              key={config.id}
              onClick={() => onConfigChange(config)}
              className="w-full flex items-center h-10 transition-colors"
              style={{
                minWidth: `${SIDEBAR_EXPANDED_WIDTH}px`,
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
              <div
                className="flex items-center justify-center flex-shrink-0"
                style={{ width: `${ICON_CONTAINER_WIDTH}px` }}
              >
                <Icon className="w-5 h-5" />
              </div>
              <span
                style={{
                  whiteSpace: 'nowrap',
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

      {/* Home Button - Bottom */}
      <Link
        href="/"
        className="flex items-center h-10 transition-all hover:opacity-80"
        style={{
          minWidth: `${SIDEBAR_EXPANDED_WIDTH}px`,
          borderTop: `1px solid ${theme.colors.border}`,
          color: theme.colors.textMuted,
          textDecoration: 'none',
        }}
        title="Go to home page"
      >
        <div
          className="flex items-center justify-center flex-shrink-0"
          style={{ width: `${ICON_CONTAINER_WIDTH}px` }}
        >
          <Home className="w-5 h-5" />
        </div>
        <span
          style={{
            whiteSpace: 'nowrap',
            fontFamily: theme.fonts.body,
            fontSize: theme.fontSizes[2],
          }}
        >
          Home
        </span>
      </Link>
    </aside>
  );
}
