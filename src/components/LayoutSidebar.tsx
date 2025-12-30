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
  owner?: string; // When provided, shows owner avatar/name instead of Principal AI logo
}

export function LayoutSidebar({
  currentConfigId,
  onConfigChange,
  collapsed,
  onToggleCollapse,
  owner,
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
      {/* Header - Shows owner avatar/name on repo pages, or Principal AI logo on home */}
      <div
        className="flex items-center w-full"
        style={{
          height: `${SIDEBAR_COLLAPSED_WIDTH}px`,
          minWidth: `${SIDEBAR_EXPANDED_WIDTH}px`,
          borderBottom: `1px solid ${theme.colors.border}`,
        }}
      >
        {owner ? (
          <>
            <button
              onClick={onToggleCollapse}
              className="flex items-center justify-center flex-shrink-0 transition-opacity hover:opacity-80"
              style={{ width: `${ICON_CONTAINER_WIDTH}px`, height: '100%' }}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://github.com/${owner}.png?size=64`}
                alt={owner}
                className="w-7 h-7 flex-shrink-0"
                style={{ borderRadius: '6px' }}
              />
            </button>
            <Link
              href={`/${owner}`}
              className="flex items-center transition-opacity hover:opacity-80"
              style={{
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                fontFamily: theme.fonts.heading,
                fontSize: theme.fontSizes[3],
                fontWeight: 600,
                color: theme.colors.text,
              }}
              title={`Go to ${owner}'s page`}
            >
              {owner}
            </Link>
            <Link
              href="/"
              className="flex items-center justify-center ml-auto mr-2 transition-opacity hover:opacity-80"
              style={{ color: theme.colors.textMuted }}
              title="Go to home page"
            >
              <Home className="w-4 h-4" />
            </Link>
          </>
        ) : (
          <>
            <button
              onClick={onToggleCollapse}
              className="flex items-center justify-center flex-shrink-0 transition-opacity hover:opacity-80"
              style={{ width: `${ICON_CONTAINER_WIDTH}px`, height: '100%' }}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <Logo width={28} height={28} color={theme.colors.primary} />
            </button>
            <Link
              href="/"
              className="flex items-center transition-opacity hover:opacity-80"
              style={{
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                fontFamily: theme.fonts.heading,
                fontSize: theme.fontSizes[3],
                fontWeight: 600,
              }}
              title="Go to home page"
            >
              <span style={{ color: theme.colors.text }}>Principal</span>
              {' '}
              <span style={{ color: theme.colors.primary }}>AI</span>
            </Link>
          </>
        )}
      </div>

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

    </aside>
  );
}
