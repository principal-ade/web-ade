'use client';

/**
 * Panel Context Provider for web-ade
 * Implements panel-framework-core v0.1.1 context and event system
 */

import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import { PanelEventBus } from '@principal-ade/panel-framework-core';
import type {
  PanelContextValue,
  PanelActions,
  PanelEventEmitter,
  DataSlice,
  WorkspaceMetadata,
  RepositoryMetadata,
} from '@principal-ade/panel-framework-core';

interface PanelProviderProps {
  children: ReactNode;
  workspace?: WorkspaceMetadata;
  repository?: RepositoryMetadata;
}

interface PanelProviderValue {
  context: PanelContextValue;
  actions: PanelActions;
  events: PanelEventEmitter;
}

const PanelContext = createContext<PanelProviderValue | null>(null);

export function PanelProvider({ children, workspace, repository }: PanelProviderProps) {
  // Initialize event bus once
  const events = useMemo(() => new PanelEventBus(), []);

  // State for data slices
  const [slices] = useState<Map<string, DataSlice>>(
    () =>
      new Map([
        [
          'git',
          {
            scope: 'repository',
            name: 'git',
            data: null,
            loading: false,
            error: null,
            refresh: async () => {
              // TODO: Implement git data fetching
              console.log('Refreshing git slice');
            },
          },
        ],
        [
          'markdown',
          {
            scope: 'repository',
            name: 'markdown',
            data: null,
            loading: false,
            error: null,
            refresh: async () => {
              // TODO: Implement markdown files fetching
              console.log('Refreshing markdown slice');
            },
          },
        ],
        [
          'fileTree',
          {
            scope: 'repository',
            name: 'fileTree',
            data: null,
            loading: false,
            error: null,
            refresh: async () => {
              // TODO: Implement file tree fetching
              console.log('Refreshing fileTree slice');
            },
          },
        ],
      ])
  );

  // Refresh function
  const refresh = useCallback(
    async (scope?: 'workspace' | 'repository', sliceName?: string) => {
      if (sliceName) {
        const slice = slices.get(sliceName);
        if (slice) {
          await slice.refresh();
        }
      } else {
        // Refresh all slices in the specified scope
        const promises = Array.from(slices.values())
          .filter((s) => !scope || s.scope === scope)
          .map((s) => s.refresh());
        await Promise.all(promises);
      }
    },
    [slices]
  );

  // Context value
  const context: PanelContextValue = useMemo(
    () => ({
      currentScope: {
        type: repository ? 'repository' : 'workspace',
        workspace,
        repository,
      },
      slices,
      getSlice: <T,>(name: string) => slices.get(name) as DataSlice<T> | undefined,
      getWorkspaceSlice: <T,>(name: string) => {
        const slice = slices.get(name);
        return slice?.scope === 'workspace' ? (slice as DataSlice<T>) : undefined;
      },
      getRepositorySlice: <T,>(name: string) => {
        const slice = slices.get(name);
        return slice?.scope === 'repository' ? (slice as DataSlice<T>) : undefined;
      },
      hasSlice: (name: string, scope?: 'workspace' | 'repository') => {
        const slice = slices.get(name);
        if (!slice) return false;
        return scope ? slice.scope === scope : true;
      },
      isSliceLoading: (name: string, scope?: 'workspace' | 'repository') => {
        const slice = slices.get(name);
        if (!slice) return false;
        if (scope && slice.scope !== scope) return false;
        return slice.loading;
      },
      refresh,
    }),
    [slices, workspace, repository, refresh]
  );

  // Actions
  const actions: PanelActions = useMemo(
    () => ({
      openFile: (filePath: string) => {
        // TODO: Implement file opening
        console.log('Opening file:', filePath);
        events.emit({
          type: 'file:opened',
          source: 'web-ade',
          timestamp: Date.now(),
          payload: { filePath },
        });
      },
      openGitDiff: (filePath: string, status?: string) => {
        // TODO: Implement git diff opening
        console.log('Opening git diff:', filePath, status);
      },
      navigateToPanel: (panelId: string) => {
        // TODO: Implement panel navigation
        console.log('Navigating to panel:', panelId);
        events.emit({
          type: 'panel:focus',
          source: 'web-ade',
          timestamp: Date.now(),
          payload: { panelId },
        });
      },
      notifyPanels: (event) => {
        events.emit(event);
      },
    }),
    [events]
  );

  const value: PanelProviderValue = useMemo(
    () => ({
      context,
      actions,
      events,
    }),
    [context, actions, events]
  );

  return <PanelContext.Provider value={value}>{children}</PanelContext.Provider>;
}

export function usePanelProvider() {
  const context = useContext(PanelContext);
  if (!context) {
    throw new Error('usePanelProvider must be used within PanelProvider');
  }
  return context;
}
