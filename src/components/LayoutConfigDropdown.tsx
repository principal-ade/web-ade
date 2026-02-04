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
  hidden?: boolean; // If true, layout is hidden from sidebar but still functional
}

export const layoutConfigs: LayoutConfig[] = [
  {
    id: 'tour',
    name: 'Tour',
    layout: {
      left: 'packages',
      middle: 'file-city',
      right: 'file-city',
    },
    collapsed: {
      left: true,
      right: true,
    },
  },
  {
    id: 'stories',
    name: 'Stories',
    layout: {
      left: 'storyboard-list',
      middle: 'workflow-scenarios',
      right: 'file-city',
    },
    collapsed: {
      left: false,
      right: false,
    },
  },
  {
    id: 'skills',
    name: 'Skills',
    layout: {
      left: 'skills-list',
      middle: 'skill-detail',
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
    hidden: true,
  },
  {
    id: 'kanban',
    name: 'Triaged',
    layout: {
      left: 'kanban',
      middle: 'task-detail',
      right: 'github-messages',
    },
    collapsed: {
      left: false,
      right: true,
    },
    hidden: true,
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
    hidden: true,
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
    hidden: true,
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
    hidden: true,
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
          {layoutConfigs.filter(config => !config.hidden).map((config) => (
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
