'use client';

import { ThreePanelLayout } from '@principal-ade/panel-layouts';
import { useTheme } from '@a24z/industry-theme';
import '@a24z/panels/panels.css';

export function EditorLayout() {
  const { theme } = useTheme();

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
          <div className="flex h-full w-full items-center justify-center p-4 text-sm">
            <div className="text-center">
              <h3 className="text-lg font-semibold mb-2">Middle Panel</h3>
              <p className="text-gray-400">Editor</p>
            </div>
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
    </div>
  );
}
