'use client';

/**
 * ProjectsPanel - Conditionally shows CurrentProjectsPanel or GitHubProjectsPanel
 *
 * Shows CurrentProjectsPanel when connected to presence server (online),
 * otherwise shows GitHubProjectsPanel (user's repos).
 */

import dynamic from 'next/dynamic';
import type { FC } from 'react';
import type { PanelComponentProps } from '@principal-ade/panel-framework-core';
import { usePanelProvider } from '@/contexts/PanelContext';

function PanelLoadingState({ message }: { message: string }) {
  return (
    <div className="h-full w-full flex items-center justify-center text-sm text-gray-500">
      {message}
    </div>
  );
}

// Dynamically import panels with SSR disabled
// Cast to FC<PanelComponentProps> to preserve type information
const CurrentProjectsPanelLoader = dynamic<PanelComponentProps>(
  () => import('@industry-theme/git-sync-panels').then((mod) => ({
    default: mod.CurrentProjectsPanel as FC<PanelComponentProps>,
  })),
  { ssr: false, loading: () => <PanelLoadingState message="Loading projects..." /> }
);

const GitHubProjectsPanelLoader = dynamic<PanelComponentProps>(
  () => import('@industry-theme/github-panels').then((mod) => ({
    default: mod.panels[0]!.component as FC<PanelComponentProps>,
  })),
  { ssr: false, loading: () => <PanelLoadingState message="Loading repositories..." /> }
);

export function ProjectsPanel({ context, actions, events }: PanelComponentProps) {
  const { presenceConnected } = usePanelProvider();

  // When connected to presence server, show current projects
  // Otherwise, show GitHub repositories list
  if (presenceConnected) {
    return <CurrentProjectsPanelLoader context={context} actions={actions} events={events} />;
  }

  return <GitHubProjectsPanelLoader context={context} actions={actions} events={events} />;
}
