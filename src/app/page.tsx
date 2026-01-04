'use client';

import { EditorHeader } from "@/components/EditorHeader";
import { GlobalCommandPalette } from "@/components/GlobalCommandPalette";
import { WelcomePanel } from "@/components/WelcomePanel";
import { GalleryCarouselView } from "@/components/home/GalleryCarouselView";
import { useTheme } from "@principal-ade/industry-theme";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { CommandPaletteData } from "@/components/GlobalCommandPalette";
import { PanelProvider, usePanelProvider } from "@/contexts/PanelContext";
import {
  ResponsiveConfigurablePanelLayout,
  PanelLayout,
} from '@principal-ade/panel-layouts';
import '@principal-ade/panel-layouts/styles.css';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';

// Dynamic import for RecentRepositoriesPanel
const RecentRepositoriesPanelLoader = dynamic(
  () => import('@industry-theme/github-panels').then((mod) => mod.RecentRepositoriesPanel),
  { ssr: false }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
) as React.ComponentType<any>;

// LocalStorage keys for recent items
const RECENT_REPOS_KEY = 'recent-repos';
const RECENT_OWNERS_KEY = 'recent-owners';

// RecentOwner format used by [owner]/page.tsx when storing to localStorage
interface RecentOwner {
  owner: string;
  visitedAt: string;
}

interface GalleryCollection {
  id: string;
  name: string;
  description: string;
  repositories: Array<{
    id: string;
    full_name: string;
    owner: {
      login: string;
      avatar_url: string;
    };
    name: string;
    description: string | null;
    language: string | null;
    stargazers_count: number;
    forks_count: number;
  }>;
}

function getRecentItems(key: string, max: number = 10): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return [];

    const parsed: unknown[] = JSON.parse(stored);

    // Handle recent-owners format: [{ owner: string, visitedAt: string }, ...]
    // vs recent-repos format: [string, ...]
    return parsed.slice(0, max).map(item => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && 'owner' in item) {
        return (item as RecentOwner).owner;
      }
      return '';
    }).filter(Boolean);
  } catch {
    return [];
  }
}

function HomePageContent() {
  const { theme } = useTheme();
  const { context, actions, events } = usePanelProvider();
  const router = useRouter();
  const [recentRepos, setRecentRepos] = useState<string[]>([]);
  const [recentOwners, setRecentOwners] = useState<string[]>([]);
  const [showGallery, setShowGallery] = useState(false);
  const [galleryCollections, setGalleryCollections] = useState<GalleryCollection[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const detailsFetchedRef = useRef(false);
  const openWithMicRef = useRef<(() => void) | null>(null);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Set mounted to prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Load recent items from localStorage on mount
  useEffect(() => {
    setRecentRepos(getRecentItems(RECENT_REPOS_KEY));
    setRecentOwners(getRecentItems(RECENT_OWNERS_KEY));
  }, []);

  // Fetch gallery collections when gallery is shown
  useEffect(() => {
    if (!showGallery || galleryCollections.length > 0) return;

    setGalleryLoading(true);
    fetch('/api/collections')
      .then((res) => res.json())
      .then((data) => {
        const collections = data.collections || [];
        const memberships = data.memberships || [];

        // Group repositories by collection
        const collectionsWithRepos: GalleryCollection[] = collections.map(
          (collection: { id: string; name: string; description: string }) => {
            const collectionMemberships = memberships
              .filter((m: { collectionId: string }) => m.collectionId === collection.id);

            // Create basic repo objects, using sourceRepository for forks
            const repos = collectionMemberships.slice(0, 12).map((m: {
              repositoryId: string;
              metadata?: { sourceRepository?: { owner: string; name: string } }
            }) => {
              // Use source repo (original) if this is a fork, otherwise use the repo itself
              const source = m.metadata?.sourceRepository;
              const displayOwner = source?.owner || m.repositoryId.split('/')[0] || '';
              const displayName = source?.name || m.repositoryId.split('/')[1] || '';
              const displayFullName = source ? `${source.owner}/${source.name}` : m.repositoryId;

              return {
                id: m.repositoryId,
                full_name: displayFullName,
                owner: {
                  login: displayOwner,
                  avatar_url: `https://github.com/${displayOwner}.png?size=64`,
                },
                name: displayName,
                description: null,
                language: null,
                stargazers_count: 0,
                forks_count: 0,
              };
            });

            return {
              id: collection.id,
              name: collection.name,
              description: collection.description || '',
              repositories: repos,
            };
          }
        );

        setGalleryCollections(collectionsWithRepos.filter(c => c.repositories.length > 0));
      })
      .catch((err) => {
        console.error('Failed to fetch gallery collections:', err);
      })
      .finally(() => {
        setGalleryLoading(false);
      });
  }, [showGallery, galleryCollections.length]);

  // Fetch full repo details in the background
  useEffect(() => {
    if (galleryCollections.length === 0 || galleryLoading || detailsFetchedRef.current) return;

    // Mark as fetched to prevent re-running
    detailsFetchedRef.current = true;

    // Collect all unique repo full_names to fetch
    const reposToFetch = new Map<string, { collectionIndex: number; repoIndex: number }[]>();
    galleryCollections.forEach((collection, collectionIndex) => {
      collection.repositories.forEach((repo, repoIndex) => {
        const key = repo.full_name;
        if (!reposToFetch.has(key)) {
          reposToFetch.set(key, []);
        }
        reposToFetch.get(key)!.push({ collectionIndex, repoIndex });
      });
    });

    if (reposToFetch.size === 0) return;

    // Fetch repo details in parallel
    const fetchRepoDetails = async () => {
      const updates: { collectionIndex: number; repoIndex: number; data: GalleryCollection['repositories'][0] }[] = [];

      await Promise.all(
        Array.from(reposToFetch.entries()).map(async ([fullName, positions]) => {
          try {
            const res = await fetch(`/api/github/repos/${fullName}`);
            if (!res.ok) return;
            const data = await res.json();

            positions.forEach(({ collectionIndex, repoIndex }) => {
              updates.push({
                collectionIndex,
                repoIndex,
                data: {
                  id: galleryCollections[collectionIndex]!.repositories[repoIndex]!.id,
                  full_name: fullName,
                  owner: {
                    login: data.owner?.login || fullName.split('/')[0] || '',
                    avatar_url: data.owner?.avatar_url || `https://github.com/${fullName.split('/')[0]}.png?size=64`,
                  },
                  name: data.name || fullName.split('/')[1] || '',
                  description: data.description || null,
                  language: data.language || null,
                  stargazers_count: data.stargazers_count || 0,
                  forks_count: data.forks_count || 0,
                },
              });
            });
          } catch {
            // Ignore fetch errors
          }
        })
      );

      if (updates.length > 0) {
        setGalleryCollections((prev) => {
          const updated = [...prev];
          updates.forEach(({ collectionIndex, repoIndex, data }) => {
            if (updated[collectionIndex]) {
              updated[collectionIndex] = {
                ...updated[collectionIndex],
                repositories: updated[collectionIndex].repositories.map((repo, idx) =>
                  idx === repoIndex ? data : repo
                ),
              };
            }
          });
          return updated;
        });
      }
    };

    fetchRepoDetails();
  }, [galleryCollections, galleryLoading]);

  const handleToggleGallery = useCallback(() => {
    setShowGallery((prev) => !prev);
  }, []);

  const handleOpenWithMic = useCallback(() => {
    openWithMicRef.current?.();
  }, []);

  // Build autocomplete data for command palette
  const autocompleteData: CommandPaletteData = useMemo(() => {
    return {
      collections: [],
      repositories: recentRepos,
      owners: recentOwners,
    };
  }, [recentRepos, recentOwners]);

  // Define panels for the layout
  const panels = useMemo(() => [
    {
      id: 'recent',
      label: 'Recent',
      content: (
        <div className="h-full w-full overflow-hidden">
          <RecentRepositoriesPanelLoader
            context={context}
            actions={actions}
            events={events}
            onNavigate={(path: string) => router.push(path)}
          />
        </div>
      ),
    },
    {
      id: 'welcome',
      label: 'Search',
      content: (
        <div className="h-full w-full overflow-hidden">
          {showGallery ? (
            galleryLoading ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  color: theme.colors.textMuted,
                }}
              >
                Loading gallery...
              </div>
            ) : (
              <GalleryCarouselView collections={galleryCollections} />
            )
          ) : (
            <WelcomePanel onToggleGallery={handleToggleGallery} />
          )}
        </div>
      ),
    },
    {
      id: 'empty-right',
      label: '',
      content: <div />,
    },
  ], [showGallery, galleryLoading, galleryCollections, handleToggleGallery, theme, context, actions, events, router]);

  // Define layout with recent panel on left, welcome panel in the middle
  const layout = useMemo<PanelLayout>(() => ({
    left: 'recent',
    middle: 'welcome',
    right: 'empty-right',
  }), []);

  return (
    <div
      className="h-screen w-screen overflow-hidden flex flex-col"
      style={{ background: theme.colors.background, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <EditorHeader
        showGallery={showGallery}
        onToggleGallery={handleToggleGallery}
        onOpenWithMic={speechSupported ? handleOpenWithMic : undefined}
      />

      {/* Panel Layout */}
      <div className="flex-1 overflow-hidden">
        {mounted ? (
          <ResponsiveConfigurablePanelLayout
            theme={theme}
            panels={panels}
            layout={layout}
            defaultSizes={{
              left: 25,
              middle: 75,
              right: 0,
            }}
            minSizes={{
              left: 20,
              middle: 40,
              right: 0,
            }}
            collapsiblePanels={{
              left: true,
              right: false,
            }}
            collapsed={{
              left: false,
              right: true,
            }}
            showCollapseButtons={true}
            mobileBreakpoint="(max-width: 768px)"
          />
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: theme.colors.textMuted,
            }}
          >
            Loading...
          </div>
        )}
      </div>

      {/* Global Command Palette (Cmd+Shift+P) */}
      <GlobalCommandPalette
        autocompleteData={autocompleteData}
        initialSuggestions={[
          '/repo',
          '/collection',
          '/github',
          '/home',
        ]}
        onOpenWithMicReady={(fn) => {
          openWithMicRef.current = fn;
          setSpeechSupported(fn !== null);
        }}
      />
    </div>
  );
}

export default function HomePage() {
  return (
    <PanelProvider
      workspace={{
        name: 'web-ade',
        path: '/workspace',
      }}
      repository={{
        name: 'home',
        path: '/home',
      }}
    >
      <HomePageContent />
    </PanelProvider>
  );
}
