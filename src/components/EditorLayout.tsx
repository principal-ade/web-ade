'use client';

import { EditableConfigurablePanelLayout } from '@principal-ade/panel-layouts';
import { useTheme } from '@a24z/industry-theme';
import { ThemedAIChatPanel } from '@principal-ade/industry-themed-ai-sdk/components';
import { PanelProvider, usePanelProvider } from '@/contexts/PanelContext';
import { useState } from 'react';
import '@principal-ade/panel-layouts/styles.css';
import '@principal-ade/industry-themed-ai-sdk/styles.css';

function EditorLayoutContent() {
  const { theme } = useTheme();
  const { context, actions, events } = usePanelProvider();
  const [isEditMode] = useState(false);
  const [layout, setLayout] = useState({
    left: 'file-tree',
    middle: 'ai-chat',
    right: 'terminal',
  });

  const panels = [
    {
      id: 'file-tree',
      label: 'File Tree',
      content: (
        <div className="flex h-full w-full items-center justify-center p-4 text-sm">
          <div className="text-center">
            <h3 className="text-lg font-semibold mb-2">Left Panel</h3>
            <p className="text-gray-400">File Tree</p>
          </div>
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
      id: 'terminal',
      label: 'Terminal',
      content: (
        <div className="flex h-full w-full items-center justify-center p-4 text-sm">
          <div className="text-center">
            <h3 className="text-lg font-semibold mb-2">Right Panel</h3>
            <p className="text-gray-400">Output / Terminal</p>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="h-full w-full">
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
        showCollapseButtons={false}
      />
    </div>
  );
}

export function EditorLayout() {
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
    >
      <EditorLayoutContent />
    </PanelProvider>
  );
}
