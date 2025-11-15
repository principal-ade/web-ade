'use client';

import { ResponsiveConfigurablePanelLayout, PanelLayout } from '@principal-ade/panel-layouts';
import { useTheme } from '@principal-ade/industry-theme';
import { ThemedAIChatPanel } from '@principal-ade/industry-themed-ai-sdk/components';
import { PanelProvider, usePanelProvider } from '@/contexts/PanelContext';
import { useState } from 'react';
import dynamic from 'next/dynamic';
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

function EditorLayoutContent() {
  const { theme } = useTheme();
  const { context, actions, events } = usePanelProvider();
  const [layout] = useState<PanelLayout>({
    left: 'docs',
    middle: 'markdown-viewer',
    right: 'terminal',
  });

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
    <div className="h-full w-full">
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
          left: false,
          right: true,
        }}
        showCollapseButtons={false}
        mobileBreakpoint="(max-width: 768px)"
      />
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
