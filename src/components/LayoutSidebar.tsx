'use client';

import { useState, useEffect } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { useGlobalTheme } from '@/contexts/ThemeContext';
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
  Palette,
  X,
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
const SIDEBAR_EXPANDED_WIDTH = 250;
// Icon container width to center icons (same as collapsed width)
const ICON_CONTAINER_WIDTH = 56;

interface LayoutSidebarProps {
  currentConfigId: string;
  onConfigChange: (config: LayoutConfig) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  owner?: string; // When provided, shows owner avatar/name instead of Principal AI logo
  badges?: Record<string, number>; // Badge counts for specific layout config IDs (e.g., { 'github-issues': 12, 'pull-requests': 5 })
  mobileOpen?: boolean; // When true, renders as slide-in overlay on mobile
  onMobileClose?: () => void; // Callback to close mobile overlay
}

export function LayoutSidebar({
  currentConfigId,
  onConfigChange,
  collapsed,
  onToggleCollapse,
  owner,
  badges,
  mobileOpen,
  onMobileClose,
}: LayoutSidebarProps) {
  const { theme } = useTheme();
  const { currentThemeName, cycleTheme } = useGlobalTheme();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // On mobile, only render when mobileOpen is true (as overlay)
  if (isMobile && !mobileOpen) return null;

  // Mobile overlay mode
  if (isMobile && mobileOpen) {
    return (
      <>
        {/* Backdrop */}
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 50,
          }}
          onClick={onMobileClose}
        />

        {/* Sidebar overlay */}
        <aside
          className="h-full flex flex-col overflow-hidden"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            bottom: 0,
            width: `${SIDEBAR_EXPANDED_WIDTH}px`,
            maxWidth: '100vw',
            background: theme.colors.surface,
            borderRight: `1px solid ${theme.colors.border}`,
            zIndex: 51,
            animation: 'layoutSidebarSlideIn 0.2s ease-out',
          }}
        >
          {/* Mobile Header with close button */}
          <div
            className="flex items-center justify-between w-full"
            style={{
              height: `${SIDEBAR_COLLAPSED_WIDTH}px`,
              borderBottom: `1px solid ${theme.colors.border}`,
              padding: '0 16px',
            }}
          >
            {owner ? (
              <Link
                href={`/${owner}`}
                onClick={onMobileClose}
                className="flex items-center gap-3 transition-opacity hover:opacity-80"
                style={{ textDecoration: 'none' }}
              >
                <img
                  src={`https://github.com/${owner}.png?size=64`}
                  alt={owner}
                  className="w-7 h-7 flex-shrink-0"
                  style={{ borderRadius: '6px' }}
                />
                <span
                  style={{
                    fontFamily: theme.fonts.heading,
                    fontSize: theme.fontSizes[3],
                    fontWeight: 600,
                    color: theme.colors.text,
                  }}
                >
                  {owner}
                </span>
              </Link>
            ) : (
              <Link
                href="/"
                onClick={onMobileClose}
                className="flex items-center gap-3 transition-opacity hover:opacity-80"
                style={{ textDecoration: 'none' }}
              >
                <Logo width={28} height={28} color={theme.colors.primary} />
                <span style={{ fontFamily: theme.fonts.heading, fontSize: theme.fontSizes[3], fontWeight: 600 }}>
                  <span style={{ color: theme.colors.text }}>Principal</span>{' '}
                  <span style={{ color: theme.colors.primary }}>AI</span>
                </span>
              </Link>
            )}
            <button
              onClick={onMobileClose}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                color: theme.colors.textMuted,
                borderRadius: '4px',
              }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Home Link */}
          <Link
            href="/"
            onClick={onMobileClose}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 16px',
              color: theme.colors.text,
              textDecoration: 'none',
              borderBottom: `1px solid ${theme.colors.border}`,
            }}
          >
            <Home size={16} />
            <span style={{ fontSize: `${theme.fontSizes[1]}px` }}>Home</span>
          </Link>

          {/* Layout Items */}
          <nav className="flex-1 py-2 overflow-y-auto overflow-x-hidden">
            {layoutConfigs.map((config) => {
              const Icon = layoutIcons[config.id] || Blocks;
              const isActive = config.id === currentConfigId;
              const badgeCount = badges?.[config.id];

              return (
                <button
                  key={config.id}
                  onClick={() => {
                    onConfigChange(config);
                    onMobileClose?.();
                  }}
                  className="w-full flex items-center h-10 px-4 gap-3 transition-colors"
                  style={{
                    background: isActive ? theme.colors.backgroundTertiary : 'transparent',
                    color: isActive ? theme.colors.primary : theme.colors.text,
                  }}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <span
                    className="flex items-center gap-2"
                    style={{
                      fontFamily: theme.fonts.body,
                      fontSize: theme.fontSizes[2],
                    }}
                  >
                    {config.name}
                    {badgeCount !== undefined && badgeCount > 0 && (
                      <span
                        className="min-w-[20px] h-[20px] flex items-center justify-center rounded-full text-xs font-medium"
                        style={{
                          background: theme.colors.primary,
                          color: theme.colors.background,
                          fontSize: '11px',
                          padding: '0 6px',
                        }}
                      >
                        {badgeCount > 99 ? '99+' : badgeCount}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Theme Toggle */}
          <div style={{ borderTop: `1px solid ${theme.colors.border}` }}>
            <button
              onClick={cycleTheme}
              className="w-full flex items-center h-10 px-4 gap-3 transition-colors"
              style={{
                background: 'transparent',
                color: theme.colors.text,
              }}
            >
              <Palette className="w-5 h-5 flex-shrink-0" />
              <span style={{ fontFamily: theme.fonts.body, fontSize: theme.fontSizes[2] }}>
                {currentThemeName}
              </span>
            </button>
          </div>
        </aside>

        <style>{`
          @keyframes layoutSidebarSlideIn {
            from { transform: translateX(-100%); }
            to { transform: translateX(0); }
          }
        `}</style>
      </>
    );
  }

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

          const badgeCount = badges?.[config.id];

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
              title={collapsed ? `${config.name}${badgeCount ? ` (${badgeCount})` : ''}` : undefined}
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
                className="flex items-center justify-center flex-shrink-0 relative"
                style={{ width: `${ICON_CONTAINER_WIDTH}px` }}
              >
                <Icon className="w-5 h-5" />
                {/* Badge indicator when collapsed */}
                {collapsed && badgeCount !== undefined && badgeCount > 0 && (
                  <span
                    className="absolute -top-1 right-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-xs font-medium"
                    style={{
                      background: theme.colors.primary,
                      color: theme.colors.background,
                      fontSize: '10px',
                      padding: '0 4px',
                    }}
                  >
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </div>
              <span
                className="flex items-center gap-2"
                style={{
                  whiteSpace: 'nowrap',
                  fontFamily: theme.fonts.body,
                  fontSize: theme.fontSizes[2],
                }}
              >
                {config.name}
                {/* Badge when expanded */}
                {!collapsed && badgeCount !== undefined && badgeCount > 0 && (
                  <span
                    className="min-w-[20px] h-[20px] flex items-center justify-center rounded-full text-xs font-medium"
                    style={{
                      background: theme.colors.primary,
                      color: theme.colors.background,
                      fontSize: '11px',
                      padding: '0 6px',
                    }}
                  >
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Theme Toggle */}
      <div
        style={{
          borderTop: `1px solid ${theme.colors.border}`,
        }}
      >
        <button
          onClick={cycleTheme}
          className="w-full flex items-center h-10 transition-colors"
          style={{
            minWidth: `${SIDEBAR_EXPANDED_WIDTH}px`,
            background: 'transparent',
            color: theme.colors.text,
          }}
          title={collapsed ? `Theme: ${currentThemeName}` : 'Cycle theme'}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = theme.colors.backgroundSecondary;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <div
            className="flex items-center justify-center flex-shrink-0"
            style={{ width: `${ICON_CONTAINER_WIDTH}px` }}
          >
            <Palette className="w-5 h-5" />
          </div>
          <span
            style={{
              whiteSpace: 'nowrap',
              fontFamily: theme.fonts.body,
              fontSize: theme.fontSizes[2],
            }}
          >
            {currentThemeName}
          </span>
        </button>
      </div>
    </aside>
  );
}
