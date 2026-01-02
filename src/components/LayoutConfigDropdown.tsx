'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTheme, Theme } from '@principal-ade/industry-theme';
import type { PanelLayout } from '@principal-ade/panel-layouts';

export interface LayoutConfig {
  id: string;
  name: string;
  layout: PanelLayout;
  collapsed: {
    left: boolean;
    right: boolean;
  };
}

export const layoutConfigs: LayoutConfig[] = [
  {
    id: 'documentation',
    name: 'Documentation',
    layout: {
      left: 'docs',
      middle: 'markdown-viewer',
      right: 'file-city',
    },
    collapsed: {
      left: false,
      right: false,
    },
  },
  {
    id: 'github-issues',
    name: 'Issues',
    layout: {
      left: 'github-issues',
      middle: 'github-issue-detail',
      right: 'github-messages',
    },
    collapsed: {
      left: false,
      right: false,
    },
  },
  {
    id: 'kanban',
    name: 'Triaged',
    layout: {
      left: 'empty',
      middle: 'kanban',
      right: 'task-detail',
    },
    collapsed: {
      left: true,
      right: false,
    },
  },
  {
    id: 'pull-requests',
    name: 'Pull Requests',
    layout: {
      left: 'pull-requests',
      middle: 'pull-request-detail',
      right: 'file-city',
    },
    collapsed: {
      left: false,
      right: false,
    },
  },
  {
    id: 'git-history',
    name: 'Change Log',
    layout: {
      left: 'commit-history',
      middle: 'commit-detail',
      right: 'file-city',
    },
    collapsed: {
      left: false,
      right: false,
    },
  },
  {
    id: 'file-editor',
    name: 'Files',
    layout: {
      left: 'git-changes',
      middle: 'file-editor',
      right: 'file-city',
    },
    collapsed: {
      left: false,
      right: false,
    },
  },
  {
    id: 'default',
    name: 'Architecture',
    layout: {
      left: 'packages',
      middle: 'visual-validation',
      right: 'file-city',
    },
    collapsed: {
      left: false,
      right: false,
    },
  },
  {
    id: 'quality-debug',
    name: 'Quality Views',
    layout: {
      left: 'quality-hexagon',
      middle: 'lens-debug',
      right: 'file-city',
    },
    collapsed: {
      left: false,
      right: false,
    },
  },
  {
    id: 'file-city',
    name: 'Test Telemetry',
    layout: {
      left: 'telemetry-coverage',
      middle: 'trace-viewer',
      right: 'file-city',
    },
    collapsed: {
      left: false,
      right: false,
    },
  },
];

interface LayoutConfigDropdownProps {
  currentConfigId: string;
  onConfigChange: (config: LayoutConfig) => void;
  className?: string;
  theme?: Theme;
  inline?: boolean;
}

export function LayoutConfigDropdown({
  currentConfigId,
  onConfigChange,
  className = '',
  theme: propTheme,
  inline = false,
}: LayoutConfigDropdownProps) {
  const { theme: contextTheme } = useTheme();
  const theme = propTheme || contextTheme;
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentConfig = layoutConfigs.find((c) => c.id === currentConfigId) || layoutConfigs[0]!;

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close on escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1 transition-all hover:opacity-80 ${inline ? '' : 'px-3 py-1.5 rounded-md'}`}
        style={{
          background: inline ? 'transparent' : theme.colors.secondary,
          color: inline ? theme.colors.primary : theme.colors.text,
          border: inline ? 'none' : `1px solid ${theme.colors.border}`,
          fontSize: inline ? 'inherit' : theme.fontSizes[2],
          fontFamily: theme.fonts.body,
          fontWeight: inline ? 'inherit' : undefined,
        }}
        title="Change layout configuration"
      >
        <span className={inline ? '' : 'hidden sm:inline'}>{currentConfig.name}</span>
        <ChevronDown
          size={inline ? 12 : 14}
          style={{
            color: inline ? theme.colors.primary : theme.colors.text,
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        />
      </button>

      {isOpen && (
        <div
          className="absolute top-full left-0 mt-1 py-1 rounded-md shadow-lg z-50 min-w-[180px]"
          style={{
            background: theme.colors.backgroundSecondary,
            border: `1px solid ${theme.colors.border}`,
          }}
        >
          {layoutConfigs.map((config) => (
            <button
              key={config.id}
              onClick={() => {
                onConfigChange(config);
                setIsOpen(false);
              }}
              className="w-full px-3 py-2 text-left transition-all"
              style={{
                background: config.id === currentConfigId ? theme.colors.backgroundTertiary : 'transparent',
                color: config.id === currentConfigId ? theme.colors.primary : theme.colors.text,
                fontSize: theme.fontSizes[2],
                fontFamily: theme.fonts.body,
              }}
              onMouseEnter={(e) => {
                if (config.id !== currentConfigId) {
                  e.currentTarget.style.background = theme.colors.backgroundTertiary;
                }
              }}
              onMouseLeave={(e) => {
                if (config.id !== currentConfigId) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              {config.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
