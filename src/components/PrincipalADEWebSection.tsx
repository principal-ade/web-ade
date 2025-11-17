'use client';

import { useTheme } from '@principal-ade/industry-theme';
import { FolderTree, MessageSquare, Terminal } from 'lucide-react';
import Link from 'next/link';
import { Logo } from '@principal-ai/logo-component';
import { ThemeToggle } from './ThemeToggle';
import { EditableConfigurablePanelLayout, ResponsiveConfigurablePanelLayout, PanelLayout } from '@principal-ade/panel-layouts';
import { EmptyStatePanel } from './EmptyStatePanel';
import { PanelControls } from './PanelControls';
import { useState, useCallback, useMemo, useEffect } from 'react';
import '@principal-ade/panel-layouts/styles.css';

export function PrincipalADEWebSection() {
  const { theme } = useTheme();
  const [isEditMode, setIsEditMode] = useState(false);
  const [layout, setLayout] = useState<PanelLayout>({
    left: 'file-explorer',
    middle: 'ai-chat',
    right: 'terminal',
  });
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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
      className="relative overflow-hidden min-h-screen px-4 md:px-6 pt-4 pb-8 md:py-0"
      style={{
        background: `linear-gradient(135deg, ${theme.colors.background} 0%, ${theme.colors.muted} 100%)`,
      }}
    >
      {/* Principal AI Logo and Theme Toggle - Top Row (Full Width) */}
      <div className="w-full flex justify-between items-center mb-4 md:mb-6">
        <Link
          href="https://principal-ade.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center transition-opacity hover:opacity-80"
        >
          <Logo
            width={isMobile ? 48 : 64}
            height={isMobile ? 48 : 64}
            color={theme.colors.primary}
            particleColor={theme.colors.accent}
            opacity={0.9}
          />
          <div className="text-xl md:text-2xl" style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem' }}>
            <span style={{ fontWeight: '600', color: theme.colors.text }}>Principal</span>
            <span style={{ fontWeight: '300', color: theme.colors.secondary }}>
              AI
            </span>
          </div>
        </Link>
        <ThemeToggle />
      </div>

      <div className="w-full max-w-6xl mx-auto flex items-center min-h-[calc(100vh-8rem)]">
        <div className="w-full">
        <div className="text-center mb-8 md:mb-12">
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4 md:mb-6" style={{ color: theme.colors.text }}>
            Git-Based Agentic Workspace
          </h1>

          <p className="text-base md:text-lg lg:text-xl mb-6 md:mb-8 max-w-3xl mx-auto px-4" style={{ color: theme.colors.textMuted }}>
            Experience the next generation of AI-Powered Work!
          </p>

          {/* Try Editor Button */}
          <div className="flex justify-center">
            <Link
              href="/editor"
              className="px-6 md:px-8 py-3 md:py-4 rounded-lg font-medium transition-all hover:scale-105 text-base md:text-lg"
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
        <div className="mt-6 md:mt-8 relative">
          {/* Panel Controls - Hidden on mobile */}
          <div
            className="hidden md:flex justify-center p-3 rounded-t-lg md:rounded-t-lg"
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
            className="rounded-lg md:rounded-t-none md:rounded-b-lg shadow-2xl overflow-hidden h-[400px] md:h-[500px] lg:h-[600px]"
            style={{
              background: theme.colors.surface,
              borderLeft: `1px solid ${theme.colors.border}`,
              borderRight: `1px solid ${theme.colors.border}`,
              borderBottom: `1px solid ${theme.colors.border}`,
              borderTop: `1px solid ${theme.colors.border}`,
            }}
          >
            {isMobile ? (
              <ResponsiveConfigurablePanelLayout
                theme={theme}
                panels={panels}
                layout={layout}
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
                mobileBreakpoint="(max-width: 768px)"
              />
            ) : (
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
            )}
          </div>
        </div>
        </div>
      </div>
    </section>
  );
}
