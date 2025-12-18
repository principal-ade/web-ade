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
    id: 'default',
    name: 'File City',
    layout: {
      left: 'file-city',
      middle: 'visual-validation',
      right: 'ai-chat',
    },
    collapsed: {
      left: false,
      right: true,
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
  },
  {
    id: 'architecture',
    name: 'Architecture',
    layout: {
      left: 'config-browser',
      middle: 'visual-validation',
      right: 'file-city',
    },
    collapsed: {
      left: false,
      right: false,
    },
  },
  {
    id: 'theme-editor',
    name: 'Theme Editor',
    layout: {
      left: 'theme-editor',
      middle: 'markdown-viewer',
      right: 'ai-chat',
    },
    collapsed: {
      left: false,
      right: false,
    },
  },
  {
    id: 'agent-debug',
    name: 'Agent Debug',
    layout: {
      left: 'agent-tools',
      middle: 'ai-chat',
      right: 'event-bus',
    },
    collapsed: {
      left: false,
      right: false,
    },
  },
  {
    id: 'file-editor',
    name: 'File Editor',
    layout: {
      left: 'git-changes',
      middle: 'file-editor',
      right: 'visual-validation',
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
}

export function LayoutConfigDropdown({
  currentConfigId,
  onConfigChange,
  className = '',
  theme: propTheme,
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
        className="flex items-center gap-2 px-3 py-1.5 rounded-md transition-all hover:opacity-80"
        style={{
          background: theme.colors.secondary,
          color: theme.colors.text,
          border: `1px solid ${theme.colors.border}`,
          fontSize: theme.fontSizes[2],
          fontFamily: theme.fonts.body,
        }}
        title="Change layout configuration"
      >
        <span className="hidden sm:inline">{currentConfig.name}</span>
        <ChevronDown
          size={14}
          style={{
            color: theme.colors.text,
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        />
      </button>

      {isOpen && (
        <div
          className="absolute top-full left-0 mt-1 py-1 rounded-md shadow-lg z-50 min-w-[180px]"
          style={{
            background: theme.colors.surface,
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
