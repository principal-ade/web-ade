'use client';

import {
  terminalTheme,
  regalTheme,
  matrixTheme,
  matrixMinimalTheme,
  slateTheme,
} from '@a24z/industry-theme';
import { FolderTree, MessageSquare, Terminal } from 'lucide-react';
import Link from 'next/link';
import { EditableConfigurablePanelLayout, PanelLayout } from '@principal-ade/panel-layouts';
import { EmptyStatePanel } from './EmptyStatePanel';
import { PanelControls } from './PanelControls';
import { useState, useCallback, useMemo } from 'react';
import '@principal-ade/panel-layouts/styles.css';

const themes = [
  { name: 'Terminal', theme: terminalTheme },
  { name: 'Regal', theme: regalTheme },
  { name: 'Matrix', theme: matrixTheme },
  { name: 'Matrix Minimal', theme: matrixMinimalTheme },
  { name: 'Slate', theme: slateTheme },
];

export function PrincipalADEWebSection() {
  const [themeIndex, setThemeIndex] = useState(0);
  const theme = themes[themeIndex]!.theme;
  const [isEditMode, setIsEditMode] = useState(false);
  const [layout, setLayout] = useState<PanelLayout>({
    left: 'file-explorer',
    middle: 'ai-chat',
    right: 'terminal',
  });
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false);

  // Handler functions for panel controls
  const handleToggleLeftSidebar = useCallback(() => {
    setLeftSidebarCollapsed((prev) => !prev);
  }, []);

  const handleToggleRightSidebar = useCallback(() => {
    setRightSidebarCollapsed((prev) => !prev);
  }, []);

  const handleSwitchLeftMiddlePanels = useCallback(() => {
    setLayout((prev) => ({
      left: prev.middle,
      middle: prev.left,
      right: prev.right,
    }));
  }, []);

  const handleSwitchRightMiddlePanels = useCallback(() => {
    setLayout((prev) => ({
      left: prev.left,
      middle: prev.right,
      right: prev.middle,
    }));
  }, []);

  const handleConfigurePanels = useCallback(() => {
    setIsEditMode((prev) => !prev);
  }, []);

  const handleCycleTheme = useCallback(() => {
    setThemeIndex((prev) => (prev + 1) % themes.length);
  }, []);

  const panels = useMemo(() => [
    {
      id: 'file-explorer',
      label: 'File Explorer',
      content: (
        <EmptyStatePanel
          title="File Explorer"
          description="Browse your project files"
          Icon={FolderTree}
          theme={theme}
        />
      ),
    },
    {
      id: 'ai-chat',
      label: 'AI Chat',
      content: (
        <EmptyStatePanel
          title="AI Chat"
          description="Chat with your AI assistant"
          Icon={MessageSquare}
          theme={theme}
        />
      ),
    },
    {
      id: 'terminal',
      label: 'Terminal',
      content: (
        <EmptyStatePanel
          title="Terminal"
          description="Run commands and see output"
          Icon={Terminal}
          theme={theme}
        />
      ),
    },
  ], [theme]);

  return (
    <section
      className="relative overflow-hidden h-full flex items-center px-6"
      style={{
        background: `linear-gradient(135deg, ${theme.colors.background} 0%, ${theme.colors.muted} 100%)`,
      }}
    >
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-6" style={{ color: theme.colors.text }}>
            Git-Based Agentic Workspace
          </h1>

          <p className="text-xl mb-8 max-w-3xl mx-auto" style={{ color: theme.colors.textMuted }}>
            Experience the next generation of AI-powered development. Built with extensible panels,
            powered by advanced AI, and designed for modern workflows.
          </p>

          {/* Try Editor Button */}
          <div className="flex justify-center">
            <Link
              href="/editor"
              className="px-8 py-4 rounded-lg font-medium transition-all hover:scale-105 text-lg"
              style={{
                background: theme.colors.primary,
                color: theme.colors.background,
              }}
            >
              Try Principal AI
            </Link>
          </div>
        </div>

        {/* Visual representation */}
        <div className="mt-8 relative">
          {/* Panel Controls */}
          <div
            className="flex justify-center p-3 rounded-t-lg"
            style={{
              background: theme.colors.surface,
              borderLeft: `1px solid ${theme.colors.border}`,
              borderRight: `1px solid ${theme.colors.border}`,
              borderTop: `1px solid ${theme.colors.border}`,
              borderBottom: `1px solid ${theme.colors.border}`,
            }}
          >
            <PanelControls
              leftSidebarCollapsed={leftSidebarCollapsed}
              rightSidebarCollapsed={rightSidebarCollapsed}
              onToggleLeftSidebar={handleToggleLeftSidebar}
              onToggleRightSidebar={handleToggleRightSidebar}
              onSwitchLeftMiddlePanels={handleSwitchLeftMiddlePanels}
              onSwitchRightMiddlePanels={handleSwitchRightMiddlePanels}
              onConfigurePanels={handleConfigurePanels}
              isEditMode={isEditMode}
              theme={theme}
            />
          </div>

          <div
            className="rounded-b-lg shadow-2xl overflow-hidden"
            style={{
              background: theme.colors.surface,
              borderLeft: `1px solid ${theme.colors.border}`,
              borderRight: `1px solid ${theme.colors.border}`,
              borderBottom: `1px solid ${theme.colors.border}`,
              height: '500px',
            }}
          >
            <EditableConfigurablePanelLayout
              theme={theme}
              panels={panels}
              layout={layout}
              isEditMode={isEditMode}
              onLayoutChange={setLayout}
              collapsed={{
                left: leftSidebarCollapsed,
                right: rightSidebarCollapsed,
              }}
              defaultSizes={{
                left: 33,
                middle: 34,
                right: 33,
              }}
              minSizes={{
                left: 15,
                middle: 30,
                right: 20,
              }}
              collapsiblePanels={{
                left: true,
                right: true,
              }}
              showCollapseButtons={false}
            />
          </div>

          {/* Theme Cycling Button */}
          <div className="flex justify-center mt-6">
            <button
              onClick={handleCycleTheme}
              className="px-6 py-3 rounded-lg font-medium transition-all hover:scale-105"
              style={{
                background: theme.colors.backgroundTertiary,
                color: theme.colors.text,
                border: `1px solid ${theme.colors.border}`,
              }}
            >
              Theme: {themes[themeIndex]!.name}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
