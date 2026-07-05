'use client';

import { useState } from 'react';
import { Bookmark, Footprints } from 'lucide-react';
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
import { HomeStarredView } from './HomeStarredView';
import { HomeCollectionsView } from './HomeCollectionsView';
import {
  HomeRecentlyVisitedView,
  type RecentTrailItem,
  type CommunityRepoItem,
} from './HomeRecentlyVisitedView';
import {
  HomeTrailsTopicsView,
  type TrailListItem,
  type TopicListItem,
} from './HomeTrailsTopicsView';
import type { Collection } from '@/lib/starred-collections/types';

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
  'collections',
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
  /** "Starred Projects" view: the user's starred repos, flat. `null` = loading. */
  starred?: ProjectRepo[] | null;
  starredError?: string | null;
  /** "Collections" view: the user's starred collections. `null` = loading. */
  collections?: Collection[] | null;
  collectionsError?: string | null;
  /** "Recently Visited" view: recent repos (as ProjectRepos) + recent trails. */
  recentProjects?: ProjectRepo[] | null;
  recentTrails?: RecentTrailItem[] | null;
  /** "Recently Visited" view: repos the wider community opened recently. */
  communityProjects?: CommunityRepoItem[] | null;
  /** "Bookmarks" view: the user's bookmarked trails + topics. `null` = loading. */
  bookmarkTrails?: TrailListItem[] | null;
  bookmarkTopics?: TopicListItem[] | null;
  /** "Your Trails & Topics" view: the user's published trails + topics. */
  libraryTrails?: TrailListItem[] | null;
  libraryTopics?: TopicListItem[] | null;
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
  starred,
  starredError = null,
  collections,
  collectionsError = null,
  recentProjects,
  recentTrails,
  communityProjects,
  bookmarkTrails,
  bookmarkTopics,
  libraryTrails,
  libraryTopics,
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
        ) : view === 'starred' ? (
          <HomeStarredView
            repos={starred ?? null}
            error={starredError}
            selectedFullName={selectedRepoFullName}
            onSelectRepo={(repo) => onSelectRepo?.(repo)}
            onBack={() => go('home')}
          />
        ) : view === 'collections' ? (
          <HomeCollectionsView
            collections={collections ?? null}
            error={collectionsError}
            selectedCollectionId={null}
            onSelectCollection={() => {
              // TODO: Navigate to collection detail page
            }}
            onBack={() => go('home')}
          />
        ) : view === 'recent' ? (
          <HomeRecentlyVisitedView
            projects={recentProjects ?? null}
            trails={recentTrails ?? null}
            community={communityProjects ?? null}
            selectedFullName={selectedRepoFullName}
            onSelectRepo={(repo) => onSelectRepo?.(repo)}
            onBack={() => go('home')}
          />
        ) : view === 'bookmarks' ? (
          <HomeTrailsTopicsView
            icon={<Bookmark size={14} />}
            label="Bookmarks"
            trails={bookmarkTrails ?? null}
            topics={bookmarkTopics ?? null}
            emptyMessage="No bookmarks yet. Bookmark a trail or topic to find it here."
            onBack={() => go('home')}
          />
        ) : view === 'library' ? (
          <HomeTrailsTopicsView
            icon={<Footprints size={14} />}
            label="Your Trails & Topics"
            trails={libraryTrails ?? null}
            topics={libraryTopics ?? null}
            emptyMessage="You haven't published any trails or topics yet."
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
