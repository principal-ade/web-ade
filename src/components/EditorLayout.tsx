'use client';

import { ThreePanelLayout } from '@principal-ade/panel-layouts';
import { useTheme } from '@a24z/industry-theme';

export function EditorLayout() {
  const { theme } = useTheme();

  return (
    <ThreePanelLayout
      theme={theme}
      leftPanel={
        <div className="flex h-full items-center justify-center p-4 text-sm text-gray-400">
          Left Panel - File Tree
        </div>
      }
      middlePanel={
        <div className="flex h-full items-center justify-center p-4 text-sm text-gray-400">
          Middle Panel - Editor
        </div>
      }
      rightPanel={
        <div className="flex h-full items-center justify-center p-4 text-sm text-gray-400">
          Right Panel - Output
        </div>
      }
      defaultSizes={{
        left: 20,
        middle: 50,
        right: 30,
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
      showCollapseButtons={true}
    />
  );
}
