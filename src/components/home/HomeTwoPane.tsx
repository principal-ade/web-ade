'use client';

import { useState } from 'react';
import { Boxes } from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';
import {
  HomeLeftPanel,
  type HomeLeftPanelProps,
  type HomeView,
} from './HomeLeftPanel';
import type { ProjectRepo } from './HomeProjectsView';

// ---------------------------------------------------------------------------
// HomeTwoPane — the signed-in home surface: the user-based left rail next to a
// right pane that shows the File City for the currently-selected project. It
// mirrors the owner/repo explorer's body (aside + main), but repo-agnostic — the
// user picks any project from the rail and the right pane renders it.
//
// The right pane is a render slot (`renderRightPane`) so the real app can inject
// the live FileCityGuidePanel while Storybook/tests use the built-in placeholder
// (the 3D city can't render under the Storybook mock). The shell owns the
// selected-repo state and feeds it to both panes.
// ---------------------------------------------------------------------------

export interface SelectedRepo {
  owner: string;
  repo: string;
  full_name: string;
}

export interface HomeTwoPaneProps
  extends Omit<
    HomeLeftPanelProps,
    'onSelectRepo' | 'selectedRepoFullName' | 'onViewChange'
  > {
  /** Render the right pane for the selected repo (or the idle state when null). */
  renderRightPane?: (repo: SelectedRepo | null) => React.ReactNode;
  /** Controlled selected repo. When provided, the parent owns the selection
   *  (e.g. so a header search bar can drive the right pane); otherwise the shell
   *  tracks it internally. */
  selected?: SelectedRepo | null;
  /** Notified when the selected project changes. */
  onSelectRepo?: (repo: SelectedRepo | null) => void;
  onViewChange?: (view: HomeView) => void;
}

export function HomeTwoPane({
  renderRightPane,
  selected: controlledSelected,
  onSelectRepo,
  onViewChange,
  ...leftPanelProps
}: HomeTwoPaneProps) {
  const { theme } = useTheme();
  const [internalSelected, setInternalSelected] = useState<SelectedRepo | null>(
    null,
  );
  const isControlled = controlledSelected !== undefined;
  const selected = isControlled ? controlledSelected : internalSelected;

  const pickRepo = (repo: ProjectRepo) => {
    const [owner, name] = repo.full_name.split('/');
    const next: SelectedRepo | null =
      owner && name ? { owner, repo: name, full_name: repo.full_name } : null;
    if (!isControlled) setInternalSelected(next);
    onSelectRepo?.(next);
  };

  return (
    <div
      className="flex-1 min-h-0 flex flex-col-reverse md:flex-row"
      style={{ background: theme.colors.background }}
    >
      <HomeLeftPanel
        {...leftPanelProps}
        selectedRepoFullName={selected?.full_name ?? null}
        onSelectRepo={pickRepo}
        onViewChange={onViewChange}
      />
      <main className="flex-1 min-h-0 flex flex-col">
        {renderRightPane ? (
          renderRightPane(selected)
        ) : (
          <HomeRightPanePlaceholder selected={selected} />
        )}
      </main>
    </div>
  );
}

// Built-in idle / placeholder right pane. The real app replaces this via
// `renderRightPane` with the File City guide panel for the selected repo.
function HomeRightPanePlaceholder({
  selected,
}: {
  selected: SelectedRepo | null;
}) {
  const { theme } = useTheme();
  return (
    <div
      className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 px-8 text-center"
      style={{ background: theme.colors.backgroundSecondary }}
    >
      <Boxes size={40} style={{ color: theme.colors.textMuted, opacity: 0.7 }} />
      {selected ? (
        <>
          <div
            style={{
              color: theme.colors.text,
              fontSize: theme.fontSizes[3],
              fontWeight: theme.fontWeights.semibold,
            }}
          >
            {selected.full_name}
          </div>
          <div
            style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[2] }}
          >
            File City renders here in the app.
          </div>
        </>
      ) : (
        <div
          style={{
            color: theme.colors.textMuted,
            fontSize: theme.fontSizes[2],
            maxWidth: 360,
            lineHeight: 1.5,
          }}
        >
          Pick a project from the rail to explore its File City.
        </div>
      )}
    </div>
  );
}
