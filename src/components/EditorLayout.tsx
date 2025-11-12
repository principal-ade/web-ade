'use client';

import { ThreePanelLayout } from '@principal-ade/panel-layouts';
import { useTheme } from '@a24z/industry-theme';
import { ThemedAIChatPanel } from '@principal-ade/industry-themed-ai-sdk/components';
import { useMemo } from 'react';
import '@a24z/panels/panels.css';
import '@principal-ade/industry-themed-ai-sdk/styles.css';

export function EditorLayout() {
  const { theme } = useTheme();

  // Mock panel context for the AI chat panel
  const mockPanelContext = useMemo(() => ({
    repositoryPath: '/Users/example/project',
    repository: { path: '/Users/example/project', name: 'example-project' },
    gitStatus: { staged: [], unstaged: [], untracked: [], deleted: [] },
    gitStatusLoading: false,
    markdownFiles: [],
    fileTree: null,
    packages: null,
    quality: null,
    loading: false,
    refresh: async () => {},
    hasSlice: (slice: string) => slice === 'git',
    isSliceLoading: () => false,
  }), []);

  const mockPanelActions = useMemo(() => ({
    openFile: (filePath: string) => console.log('Open file:', filePath),
    openGitDiff: (filePath: string) => console.log('Open git diff:', filePath),
    navigateToPanel: (panelId: string) => console.log('Navigate to panel:', panelId),
    notifyPanels: (event: unknown) => console.log('Notify panels:', event),
  }), []);

  const mockPanelEvents = useMemo(() => ({
    emit: (event: unknown) => console.log('Emit event:', event),
    on: (type: string, handler: unknown) => {
      console.log('Subscribe to:', type, handler);
      return () => console.log('Unsubscribe from:', type);
    },
    off: (type: string, handler: unknown) => console.log('Unsubscribe from:', type, handler),
  }), []);

  return (
    <div className="h-full w-full">
      <ThreePanelLayout
        theme={theme}
        leftPanel={
          <div className="flex h-full w-full items-center justify-center p-4 text-sm">
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-2">Left Panel</h3>
              <p className="text-gray-400">File Tree</p>
            </div>
          </div>
        }
        middlePanel={
          <div className="h-full w-full overflow-hidden">
            <ThemedAIChatPanel
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              context={mockPanelContext as any}
              actions={mockPanelActions}
              events={mockPanelEvents}
              api="/api/chat"
              placeholder="Ask me anything about your code..."
            />
          </div>
        }
        rightPanel={
          <div className="flex h-full w-full items-center justify-center p-4 text-sm">
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-2">Right Panel</h3>
              <p className="text-gray-400">Output / Terminal</p>
            </div>
          </div>
        }
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
