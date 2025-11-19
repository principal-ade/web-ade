'use client';

import React from 'react';
import {
  PanelLeft,
  PanelLeftClose,
  PanelRight,
  PanelRightClose,
  ArrowLeftRight,
  ArrowRightLeft,
  Layout,
  Kanban,
  FileText,
} from 'lucide-react';
import { useTheme, Theme } from '@principal-ade/industry-theme';

type ViewMode = 'editor' | 'kanban';

interface PanelControlsProps {
  /** Whether the left sidebar is collapsed */
  leftSidebarCollapsed?: boolean;
  /** Whether the right sidebar is collapsed */
  rightSidebarCollapsed?: boolean;
  /** Callback when left sidebar toggle is clicked */
  onToggleLeftSidebar?: () => void;
  /** Callback when right sidebar toggle is clicked */
  onToggleRightSidebar?: () => void;
  /** Callback when switch left/middle panels is clicked */
  onSwitchLeftMiddlePanels?: () => void;
  /** Callback when switch right/middle panels is clicked */
  onSwitchRightMiddlePanels?: () => void;
  /** Callback when configure panels is clicked */
  onConfigurePanels?: () => void;
  /** Whether to show left sidebar controls (defaults to true if onToggleLeftSidebar is provided) */
  showSidebarControls?: boolean;
  /** Whether edit/configure mode is currently active */
  isEditMode?: boolean;
  /** Current view mode */
  viewMode?: ViewMode;
  /** Callback when view mode toggle is clicked */
  onToggleViewMode?: () => void;
  /** Optional class name for the container */
  className?: string;
  /** Optional inline styles for the container */
  style?: React.CSSProperties;
  /** Optional theme override */
  theme?: Theme;
}

/**
 * PanelControls - Reusable component for panel layout controls
 *
 * Provides buttons to:
 * - Toggle left and right sidebars
 * - Switch panel positions (left/middle and right/middle)
 * - Configure panel layouts
 *
 * Extracted from desktop-app RepositoryTitlebar for use in web-ade
 */
export function PanelControls({
  leftSidebarCollapsed,
  rightSidebarCollapsed,
  onToggleLeftSidebar,
  onToggleRightSidebar,
  onSwitchLeftMiddlePanels,
  onSwitchRightMiddlePanels,
  onConfigurePanels,
  showSidebarControls = true,
  isEditMode = false,
  viewMode,
  onToggleViewMode,
  className = '',
  style,
  theme: propTheme,
}: PanelControlsProps) {
  const { theme: contextTheme } = useTheme();
  const theme = propTheme || contextTheme;

  const buttonBaseStyle: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    color: theme.colors.textSecondary,
    cursor: 'pointer',
    padding: '6px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
    width: '32px',
    height: '32px',
  };

  const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.style.backgroundColor = theme.colors.backgroundTertiary;
    e.currentTarget.style.color = theme.colors.primary;
  };

  const handleMouseLeave = (
    e: React.MouseEvent<HTMLButtonElement>,
    isCollapsed?: boolean,
  ) => {
    e.currentTarget.style.backgroundColor = 'transparent';
    e.currentTarget.style.color =
      isCollapsed !== undefined && !isCollapsed
        ? theme.colors.primary
        : theme.colors.textSecondary;
  };

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        ...style,
      }}
    >
      {/* View mode toggle */}
      {onToggleViewMode && viewMode && (
        <button
          onClick={onToggleViewMode}
          title={viewMode === 'kanban' ? 'Switch to Editor' : 'Switch to Kanban'}
          style={{
            ...buttonBaseStyle,
            color: theme.colors.primary,
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={(e) => handleMouseLeave(e)}
        >
          {viewMode === 'kanban' ? (
            <FileText size={18} />
          ) : (
            <Kanban size={18} />
          )}
        </button>
      )}

      {/* Left sidebar toggle */}
      {showSidebarControls && onToggleLeftSidebar && (
        <button
          onClick={onToggleLeftSidebar}
          title={`${leftSidebarCollapsed ? 'Show' : 'Hide'} Sidebar (Cmd/Ctrl+B)`}
          style={{
            ...buttonBaseStyle,
            color: leftSidebarCollapsed
              ? theme.colors.textSecondary
              : theme.colors.primary,
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={(e) => handleMouseLeave(e, leftSidebarCollapsed)}
        >
          {leftSidebarCollapsed ? (
            <PanelLeft size={18} />
          ) : (
            <PanelLeftClose size={18} />
          )}
        </button>
      )}

      {/* Switch left and middle panels */}
      {onSwitchLeftMiddlePanels && (
        <button
          onClick={onSwitchLeftMiddlePanels}
          title="Switch left and middle panels"
          style={buttonBaseStyle}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={(e) => handleMouseLeave(e)}
        >
          <ArrowLeftRight size={14} />
        </button>
      )}

      {/* Configure panels */}
      {onConfigurePanels && (
        <button
          onClick={onConfigurePanels}
          title={isEditMode ? 'Exit edit mode' : 'Configure panel layout'}
          style={{
            ...buttonBaseStyle,
            color: isEditMode ? theme.colors.primary : theme.colors.textSecondary,
            backgroundColor: isEditMode ? theme.colors.backgroundTertiary : 'transparent',
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={(e) => handleMouseLeave(e)}
        >
          <Layout size={14} />
        </button>
      )}

      {/* Switch right and middle panels */}
      {onSwitchRightMiddlePanels && (
        <button
          onClick={onSwitchRightMiddlePanels}
          title="Switch right and middle panels"
          style={buttonBaseStyle}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={(e) => handleMouseLeave(e)}
        >
          <ArrowRightLeft size={14} />
        </button>
      )}

      {/* Right sidebar toggle */}
      {onToggleRightSidebar && (
        <button
          onClick={onToggleRightSidebar}
          title={`${rightSidebarCollapsed ? 'Show' : 'Hide'} Right Panel (Cmd/Ctrl+B)`}
          style={{
            ...buttonBaseStyle,
            color: rightSidebarCollapsed
              ? theme.colors.textSecondary
              : theme.colors.primary,
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={(e) => handleMouseLeave(e, rightSidebarCollapsed)}
        >
          {rightSidebarCollapsed ? (
            <PanelRight size={18} />
          ) : (
            <PanelRightClose size={18} />
          )}
        </button>
      )}
    </div>
  );
}
