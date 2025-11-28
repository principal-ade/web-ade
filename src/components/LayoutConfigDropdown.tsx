'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Layout, MessageSquare, FileText, Building2, Columns3 } from 'lucide-react';
import { useTheme, Theme } from '@principal-ade/industry-theme';
import type { PanelLayout } from '@principal-ade/panel-layouts';

export interface LayoutConfig {
  id: string;
  name: string;
  icon: React.ReactNode;
  layout: PanelLayout;
  collapsed: {
    left: boolean;
    right: boolean;
  };
}

export const layoutConfigs: LayoutConfig[] = [
  {
    id: 'default',
    name: 'AI Assistant',
    icon: <MessageSquare size={14} />,
    layout: {
      left: 'docs',
      middle: 'ai-chat',
      right: 'markdown-viewer',
    },
    collapsed: {
      left: false,
      right: false,
    },
  },
  {
    id: 'documentation',
    name: 'Documentation',
    icon: <FileText size={14} />,
    layout: {
      left: 'docs',
      middle: 'markdown-viewer',
      right: 'code-city',
    },
    collapsed: {
      left: false,
      right: false,
    },
  },
  {
    id: 'code-focus',
    name: 'Code Focus',
    icon: <Building2 size={14} />,
    layout: {
      left: 'docs',
      middle: 'code-city',
      right: 'sessions',
    },
    collapsed: {
      left: true,
      right: true,
    },
  },
  {
    id: 'three-panel',
    name: 'Three Panel',
    icon: <Columns3 size={14} />,
    layout: {
      left: 'ai-chat',
      middle: 'markdown-viewer',
      right: 'code-city',
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
        <Layout size={14} style={{ color: theme.colors.textMuted }} />
        <span className="hidden sm:inline">{currentConfig.name}</span>
        <ChevronDown
          size={14}
          style={{
            color: theme.colors.textMuted,
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
              className="w-full flex items-center gap-2 px-3 py-2 text-left transition-all"
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
              <span style={{ color: theme.colors.textMuted }}>{config.icon}</span>
              <span>{config.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
