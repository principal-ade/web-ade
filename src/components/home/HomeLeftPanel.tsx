'use client';

import { useState } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { SlidePane, makeSlideDirection } from '@/components/rail/SlidePane';
import { RailPaneHeader } from '@/components/rail/RailPaneHeader';
import { UserAboutCard, type UserAboutInfo } from './UserAboutCard';
import {
  HomeNavCards,
  HOME_NAV_CARDS,
  type HomeNavCardCounts,
  type HomeNavKey,
} from './HomeNavCards';
import {
  HomeProjectsView,
  type ProjectRepo,
  type ProjectSection,
} from './HomeProjectsView';

// ---------------------------------------------------------------------------
// HomeLeftPanel — the signed-in home's left rail, the user-based sibling of the
// owner/repo explorer's TrailListPane. It mirrors that nav mechanic exactly: a
// single `view` state drives a SlidePane carousel. The default "home" view holds
// the About card + nav cards; clicking a card slides the rail to that view,
// which leads with a back-to-home header (RailPaneHeader closeAsBack).
//
// Destination views are placeholders for now — this step locks in the nav shell
// so each view (Projects, Starred, Bookmarks, …) can be filled in next.
// ---------------------------------------------------------------------------

export type HomeView = 'home' | HomeNavKey;

// 'home' is leftmost; opening a card slides in from the right, back slides left.
const HOME_SLIDE_ORDER: readonly HomeView[] = [
  'home',
  'projects',
  'starred',
  'bookmarks',
  'library',
  'recent',
];
const homeSlideDirection = makeSlideDirection(HOME_SLIDE_ORDER as readonly string[]);

export interface HomeLeftPanelProps {
  /** The signed-in user, for the About card. `null` + `userLoading` = skeleton. */
  user: UserAboutInfo | null;
  userLoading?: boolean;
  /** Counts shown on the nav cards. */
  counts?: HomeNavCardCounts;
  /** Notified whenever the active view changes (e.g. to drive the right pane). */
  onViewChange?: (view: HomeView) => void;

  /** "Your Projects" view: the user's repos + org repos, grouped. `null` = loading. */
  projects?: ProjectSection[] | null;
  projectsError?: string | null;
  /** full_name of the repo currently shown in the right pane, highlighted in lists. */
  selectedRepoFullName?: string | null;
  /** A repo was picked from a list — the shell routes this to the right-pane city. */
  onSelectRepo?: (repo: ProjectRepo) => void;
}

export function HomeLeftPanel({
  user,
  userLoading = false,
  counts,
  onViewChange,
  projects,
  projectsError = null,
  selectedRepoFullName = null,
  onSelectRepo,
}: HomeLeftPanelProps) {
  const { theme } = useTheme();
  const [view, setView] = useState<HomeView>('home');

  const go = (next: HomeView) => {
    setView(next);
    onViewChange?.(next);
  };

  return (
    <aside
      className="flex flex-col shrink-0 w-full md:w-[25%] h-[45%] md:h-auto border-t md:border-t-0 md:border-r"
      style={{
        background: theme.colors.background,
        borderColor: theme.colors.border,
      }}
    >
      <SlidePane viewKey={view} resolveDirection={homeSlideDirection}>
        {view === 'home' ? (
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-none">
            <UserAboutCard info={user} loading={userLoading} />
            <HomeNavCards
              counts={counts}
              activeView={null}
              onOpenView={(key) => go(key)}
            />
          </div>
        ) : view === 'projects' ? (
          <HomeProjectsView
            sections={projects ?? null}
            error={projectsError}
            selectedFullName={selectedRepoFullName}
            onSelectRepo={(repo) => onSelectRepo?.(repo)}
            onBack={() => go('home')}
          />
        ) : (
          <HomeNavPlaceholderView view={view} onBack={() => go('home')} />
        )}
      </SlidePane>
    </aside>
  );
}

// Temporary body for a nav-card destination: the shared back-to-home header over
// a "coming soon" note. Each of these will be replaced by the real view.
function HomeNavPlaceholderView({
  view,
  onBack,
}: {
  view: HomeNavKey;
  onBack: () => void;
}) {
  const { theme } = useTheme();
  const meta = HOME_NAV_CARDS.find((c) => c.key === view);

  return (
    <>
      <RailPaneHeader
        icon={meta?.icon}
        label={meta?.label ?? view}
        onClose={onBack}
        closeAsBack
      />
      <div className="flex-1 min-h-0 overflow-y-auto flex items-center justify-center px-6">
        <p
          className="text-center"
          style={{
            color: theme.colors.textMuted,
            fontSize: theme.fontSizes[1],
            lineHeight: 1.5,
          }}
        >
          {meta?.description ?? ''}
          <br />
          <span style={{ opacity: 0.7 }}>Coming soon.</span>
        </p>
      </div>
    </>
  );
}
