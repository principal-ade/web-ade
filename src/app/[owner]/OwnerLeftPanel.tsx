'use client';

import { useMemo, useState } from 'react';
import {
  Activity,
  ChevronRight,
  FolderGit2,
  Footprints,
  Layers,
  Star,
} from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';
import { SlidePane, makeSlideDirection } from '@/components/rail/SlidePane';
import {
  UserAboutCard,
  type UserAboutInfo,
} from '@/components/home/UserAboutCard';
import {
  HomeProjectsView,
  type ProjectRepo,
} from '@/components/home/HomeProjectsView';
import {
  HomeTrailsTopicsView,
  type TrailListItem,
  type TopicListItem,
} from '@/components/home/HomeTrailsTopicsView';
import {
  OwnerActivityView,
  type CommitGroup,
  type ContributedRepo,
} from './OwnerActivityView';
import { HomeStarredView } from '@/components/home/HomeStarredView';
import { HomeCollectionsView } from '@/components/home/HomeCollectionsView';
import { HomeCollectionDetailView } from '@/components/home/HomeCollectionDetailView';
import type { Collection } from '@/lib/starred-collections/types';

// ---------------------------------------------------------------------------
// OwnerLeftPanel — the owner page's left rail, the owner-scoped sibling of the
// signed-in home's HomeLeftPanel. It reuses the exact same nav mechanic: a
// single `view` state drives a SlidePane carousel. The default "home" view holds
// the owner's About card + nav cards; opening a card slides the rail to that
// view (Repositories / Activity / Trails & Topics), each leading with a
// back-to-overview header. Picking a repo routes to the right-pane File City.
// ---------------------------------------------------------------------------

export type OwnerView = 'home' | 'repositories' | 'starred' | 'collections' | 'collection-detail' | 'activity' | 'library';

const OWNER_SLIDE_ORDER: readonly OwnerView[] = [
  'home',
  'repositories',
  'starred',
  'collections',
  'collection-detail',
  'activity',
  'library',
];
const ownerSlideDirection = makeSlideDirection(
  OWNER_SLIDE_ORDER as readonly string[],
);

export interface OwnerLeftPanelProps {
  owner: string;
  /** The owner's profile, for the About card. `null` + `loading` = skeleton. */
  profile: UserAboutInfo | null;
  profileLoading?: boolean;

  /** The owner's repositories. `null` = loading. */
  repos: ProjectRepo[] | null;
  reposError?: string | null;

  /** The owner's pinned repositories, shown above the Repositories card. `null`
   *  = loading (skeleton); empty = the pinned section is hidden. */
  pinnedRepos: ProjectRepo[] | null;

  /** The owner's published trails + topics. `null` = loading. */
  trails: TrailListItem[] | null;
  topics: TopicListItem[] | null;

  /** Activity view data (already derived by the page). */
  contributions: Map<string, number>;
  totalCommits: number;
  commitGroups: CommitGroup[];
  contributedRepos: ContributedRepo[];
  activityLoading?: boolean;

  /** The owner's starred repos. `null` = loading. */
  starred?: ProjectRepo[] | null;
  starredError?: string | null;
  /** The owner's collections. `null` = loading. */
  collections?: Collection[] | null;
  collectionsError?: string | null;
  /** Whether the signed-in viewer can create/delete/toggle these collections
   *  (i.e. they're viewing their own profile). Defaults to `true` to preserve
   *  existing callers; the owner page passes this explicitly. */
  canManageCollections?: boolean;
  onCreateCollection?: (name: string, description: string, visibility: 'public' | 'private') => Promise<void>;
  onDeleteCollection?: (collectionId: string) => Promise<void>;
  onUpdateCollection?: (collectionId: string, data: { visibility?: 'public' | 'private' }) => Promise<void>;
  onRefreshCollections?: () => void;
  /** The authenticated user's login, used for collection share URLs. */
  userLogin?: string;

  /** full_name of the repo shown in the right pane, highlighted in the list. */
  selectedRepoFullName?: string | null;
  onSelectRepo: (repo: ProjectRepo) => void;
}

interface OwnerNavCard {
  key: Exclude<OwnerView, 'home'>;
  icon: React.ReactNode;
  label: string;
  description: string;
  count?: number;
}

export function OwnerLeftPanel({
  owner,
  profile,
  profileLoading = false,
  repos,
  reposError = null,
  pinnedRepos,
  trails,
  topics,
  contributions,
  totalCommits,
  commitGroups,
  contributedRepos,
  activityLoading = false,
  starred,
  starredError = null,
  collections,
  collectionsError = null,
  canManageCollections = true,
  onCreateCollection,
  onDeleteCollection,
  onUpdateCollection,
  onRefreshCollections,
  userLogin,
  selectedRepoFullName = null,
  onSelectRepo,
}: OwnerLeftPanelProps) {
  const { theme } = useTheme();
  const [view, setView] = useState<OwnerView>('home');
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);

  const openCollection = (collection: Collection) => {
    setSelectedCollection(collection);
    setView('collection-detail');
  };

  // The Repositories list, with the owner's pinned repos floated to the top (in
  // pin order) ahead of the rest. Pinned repos are the enriched rows from the
  // page, so they carry description / language / stars like any other row.
  const orderedRepos = useMemo<ProjectRepo[] | null>(() => {
    if (!repos) return null;
    if (!pinnedRepos || pinnedRepos.length === 0) return repos;
    const pinned = new Set(pinnedRepos.map((r) => r.full_name));
    return [...pinnedRepos, ...repos.filter((r) => !pinned.has(r.full_name))];
  }, [repos, pinnedRepos]);

  const trailTopicCount =
    (trails?.length ?? 0) + (topics?.length ?? 0) || undefined;

  const cards: OwnerNavCard[] = [
    {
      key: 'repositories',
      icon: <FolderGit2 size={18} />,
      label: 'Repositories',
      description: `Repositories owned by ${owner}`,
      count: repos?.length,
    },
    {
      key: 'starred',
      icon: <Star size={18} />,
      label: 'Starred',
      description: `Repositories starred by ${owner} \u00b7 sorted by last updated`,
      count: starred?.length,
    },
    {
      key: 'collections',
      icon: <Layers size={18} />,
      label: 'Collections',
      description: 'Your curated collections of repos',
      count: collections?.length,
    },
    {
      key: 'activity',
      icon: <Activity size={18} />,
      label: 'Activity',
      description: 'Recent commits and contributions',
    },
    {
      key: 'library',
      icon: <Footprints size={18} />,
      label: 'Trails & Topics',
      description: 'Published trails and curated topics',
      count: trailTopicCount,
    },
  ];

  return (
    <aside
      className="flex flex-col shrink-0 w-full md:w-[25%] h-[45%] md:h-auto border-t md:border-t-0 md:border-r"
      style={{
        background: theme.colors.background,
        borderColor: theme.colors.border,
      }}
    >
      <SlidePane viewKey={view} resolveDirection={ownerSlideDirection}>
        {view === 'home' ? (
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-none">
            <UserAboutCard info={profile} loading={profileLoading} />
            <div className="flex flex-col gap-2 px-4 py-3">
              {cards.map((card) => (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => setView(card.key)}
                  className="flex items-center gap-3 rounded-md px-3 py-2.5 border text-left transition-colors border-[var(--card-border)] hover:border-[var(--card-border-hover)]"
                  style={
                    {
                      background: theme.colors.backgroundSecondary,
                      color: theme.colors.text,
                      '--card-border': theme.colors.border,
                      '--card-border-hover': theme.colors.primary,
                    } as React.CSSProperties
                  }
                  title={`Open ${card.label.toLowerCase()}`}
                >
                  <span
                    className="shrink-0"
                    style={{ color: theme.colors.textSecondary }}
                  >
                    {card.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        style={{
                          fontSize: theme.fontSizes[2],
                          fontWeight: theme.fontWeights.semibold,
                        }}
                      >
                        {card.label}
                      </span>
                      {card.count != null && (
                        <span
                          style={{
                            fontSize: theme.fontSizes[1],
                            color: theme.colors.textMuted,
                          }}
                        >
                          {card.count.toLocaleString()}
                        </span>
                      )}
                    </div>
                    <div
                      className="truncate"
                      style={{
                        fontSize: theme.fontSizes[1],
                        color: theme.colors.textMuted,
                        lineHeight: 1.3,
                      }}
                    >
                      {card.description}
                    </div>
                  </div>
                  <ChevronRight
                    size={16}
                    className="shrink-0"
                    style={{ color: theme.colors.textMuted }}
                  />
                </button>
              ))}
            </div>
          </div>
        ) : view === 'repositories' ? (
          <HomeProjectsView
            title="Repositories"
            icon={<FolderGit2 size={14} />}
            showSectionHeaders={false}
            skeleton
            emptyMessage={`${owner} has no repositories yet.`}
            sections={
              orderedRepos
                ? [{ key: 'repos', label: 'Repositories', repos: orderedRepos }]
                : null
            }
            error={reposError}
            selectedFullName={selectedRepoFullName}
            onSelectRepo={onSelectRepo}
            onBack={() => setView('home')}
          />
        ) : view === 'starred' ? (
          <HomeStarredView
            repos={starred ?? null}
            error={starredError}
            selectedFullName={selectedRepoFullName}
            onSelectRepo={onSelectRepo}
            onBack={() => setView('home')}
          />
        ) : view === 'collections' ? (
          <HomeCollectionsView
            collections={collections ?? null}
            error={collectionsError}
            selectedCollectionId={selectedCollection?.id ?? null}
            canCreate={canManageCollections}
            onSelectCollection={openCollection}
            onBack={() => setView('home')}
            onCreateCollection={async (name, description, visibility) => {
              if (onCreateCollection) {
                await onCreateCollection(name, description, visibility);
              }
            }}
            onRefresh={onRefreshCollections}
          />
        ) : view === 'collection-detail' && selectedCollection ? (
          <HomeCollectionDetailView
            collection={selectedCollection}
            selectedFullName={selectedRepoFullName}
            userLogin={userLogin}
            canManage={canManageCollections}
            onSelectRepo={onSelectRepo}
            onBack={() => setView('collections')}
            onDeleteCollection={async (collectionId) => {
              if (onDeleteCollection) {
                await onDeleteCollection(collectionId);
              }
            }}
            onUpdateCollection={async (collectionId, data) => {
              if (onUpdateCollection) {
                await onUpdateCollection(collectionId, data);
                setSelectedCollection((prev) =>
                  prev && prev.id === collectionId
                    ? { ...prev, ...data, updatedAt: new Date().toISOString() }
                    : prev
                );
              }
            }}
          />
        ) : view === 'activity' ? (
          <OwnerActivityView
            contributions={contributions}
            totalCommits={totalCommits}
            commitGroups={commitGroups}
            contributedRepos={contributedRepos}
            loading={activityLoading}
            onBack={() => setView('home')}
          />
        ) : (
          <HomeTrailsTopicsView
            icon={<Footprints size={14} />}
            label="Trails & Topics"
            trails={trails}
            topics={topics}
            emptyMessage={`${owner} hasn't published any trails or topics yet.`}
            onBack={() => setView('home')}
          />
        )}
      </SlidePane>
    </aside>
  );
}
