'use client';

import { ResponsiveConfigurablePanelLayout, PanelLayout, EditableConfigurablePanelLayout } from '@principal-ade/panel-layouts';
import { useTheme } from '@principal-ade/industry-theme';
import { ThemedAIChatPanel } from '@principal-ade/industry-themed-ai-sdk/components';
import { PanelProvider, usePanelProvider } from '@/contexts/PanelContext';
import { useState, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { EditorHeader } from './EditorHeader';
import '@principal-ade/panel-layouts/styles.css';
import '@principal-ade/industry-themed-ai-sdk/styles.css';

// Dynamically import the MarkdownPanel with SSR disabled
const MarkdownPanelLoader = dynamic(
  () => import('@industry-theme/markdown-panels').then((mod) => {
    const Component = mod.panels[0]!.component;
    return { default: Component };
  }),
  { ssr: false }
);

// Dynamically import the AlexandriaDocsPanel with SSR disabled
const AlexandriaDocsPanelLoader = dynamic(
  () => import('@industry-theme/alexandria-docs-panel').then((mod) => {
    const Component = mod.panels[0]!.component;
    return { default: Component };
  }),
  { ssr: false }
);

// Dynamically import the CodeCityPanel with SSR disabled
const CodeCityPanelLoader = dynamic(
  () => import('@industry-theme/code-city-panel').then((mod) => {
    const Component = mod.panels[0]!.component;
    return { default: Component };
  }),
  { ssr: false }
);

function EditorLayoutContent() {
  const { theme } = useTheme();
  const { context, actions, events } = usePanelProvider();
  const [layout, setLayout] = useState<PanelLayout>({
    left: 'docs',
    middle: 'markdown-viewer',
    right: 'code-city',
  });
  const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(false);
  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
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

  const panels = [
    {
      id: 'docs',
      label: 'Docs',
      content: (
        <div className="h-full w-full overflow-hidden">
          <AlexandriaDocsPanelLoader context={context} actions={actions} events={events} />
        </div>
      ),
    },
    {
      id: 'ai-chat',
      label: 'AI Chat',
      content: (
        <div className="h-full w-full overflow-hidden">
          <ThemedAIChatPanel
            context={context}
            actions={actions}
            events={events}
            api="/api/chat"
            placeholder="Ask me anything about your code..."
          />
        </div>
      ),
    },
    {
      id: 'markdown-viewer',
      label: 'Markdown',
      content: (
        <div className="h-full w-full overflow-hidden">
          <MarkdownPanelLoader context={context} actions={actions} events={events} />
        </div>
      ),
    },
    {
      id: 'code-city',
      label: 'Code City',
      content: (
        <div className="h-full w-full overflow-hidden">
          <CodeCityPanelLoader context={context} actions={actions} events={events} />
        </div>
      ),
    },
    {
      id: 'terminal',
      label: 'Terminal',
      content: (
        <div className="flex h-full w-full items-center justify-center p-4 text-sm">
          <div className="text-center">
            <h3 className="text-lg font-semibold mb-2">Right Panel</h3>
            <p style={{ color: theme.colors.textMuted }}>Output / Terminal</p>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="h-full w-full flex flex-col">
      <EditorHeader
        leftSidebarCollapsed={leftSidebarCollapsed}
        rightSidebarCollapsed={rightSidebarCollapsed}
        onToggleLeftSidebar={handleToggleLeftSidebar}
        onToggleRightSidebar={handleToggleRightSidebar}
        onSwitchLeftMiddlePanels={handleSwitchLeftMiddlePanels}
        onSwitchRightMiddlePanels={handleSwitchRightMiddlePanels}
        onConfigurePanels={handleConfigurePanels}
        isEditMode={isEditMode}
      />
      <div className="flex-1 overflow-hidden">
        {isMobile ? (
          <ResponsiveConfigurablePanelLayout
            theme={theme}
            panels={panels}
            layout={layout}
            defaultSizes={{
              left: 25,
              middle: 50,
              right: 25,
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
            collapsed={{
              left: leftSidebarCollapsed,
              right: rightSidebarCollapsed,
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
            defaultSizes={{
              left: 25,
              middle: 50,
              right: 25,
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
            collapsed={{
              left: leftSidebarCollapsed,
              right: rightSidebarCollapsed,
            }}
            showCollapseButtons={false}
          />
        )}
      </div>
    </div>
  );
}

interface EditorLayoutProps {
  githubRepo?: string;
}

export function EditorLayout({ githubRepo }: EditorLayoutProps = {}) {
  return (
    <PanelProvider
      workspace={{
        name: 'web-ade',
        path: '/workspace',
      }}
      repository={{
        name: 'web-ade',
        path: '/workspace/web-ade',
      }}
      githubRepo={githubRepo}
    >
      <EditorLayoutContent />
    </PanelProvider>
  );
}
