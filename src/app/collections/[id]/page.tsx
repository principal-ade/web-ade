'use client';

import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTheme } from "@principal-ade/industry-theme";
import { useState, useEffect, useCallback } from "react";
import { PanelProvider, usePanelProvider } from "@/contexts/PanelContext";
import { useUserCollections } from "@/contexts/UserCollectionsContext";
import { EditorHeader } from "@/components/EditorHeader";
import { GlobalCommandPalette } from "@/components/GlobalCommandPalette";
import { CollectionModal } from "@/components/collections/CollectionModal";
import { AddRepositoryModal } from "@/components/collections/AddRepositoryModal";
import dynamic from "next/dynamic";
import {
  EditableConfigurablePanelLayout,
  ResponsiveConfigurablePanelLayout,
  PanelLayout,
} from "@principal-ade/panel-layouts";
import '@principal-ade/panel-layouts/styles.css';

// Dynamically import panels with SSR disabled
const WorkspaceCollectionPanelLoader = dynamic(
  () => import('@industry-theme/alexandria-panels').then((mod) => mod.WorkspaceCollectionPanel),
  { ssr: false }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
) as React.ComponentType<any>;

const PrincipalViewPanelLoader = dynamic(
  () => import('@industry-theme/principal-view-panels').then((mod) => mod.panels[0]!.component),
  { ssr: false }
);


const CodeQualityPanelLoader = dynamic(
  () => import('@principal-ade/code-quality-panels').then((mod) => {
    const Component = mod.panels[0]!.component;
    return { default: Component };
  }),
  { ssr: false }
);

const FileCityPanelLoader = dynamic(
  () => import('@industry-theme/file-city-panel').then((mod) => mod.panels[0]!.component),
  { ssr: false }
);

// Dynamically import the PackageCompositionPanel with SSR disabled
const PackageCompositionPanelLoader = dynamic(
  () => import('@industry-theme/repository-composition-panels').then((mod) => mod.PackageCompositionPanel),
  { ssr: false }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
) as React.ComponentType<any>;

// Dynamically import the DependencyGraphPanel with SSR disabled
const DependencyGraphPanelLoader = dynamic(
  () => import('@industry-theme/repository-composition-panels').then((mod) => mod.DependencyGraphPanel),
  { ssr: false }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
) as React.ComponentType<any>;

interface Collection {
  id: string;
  name: string;
  description: string;
  icon?: string;
  theme?: string;
}

interface CollectionMembership {
  repositoryId: string;
  collectionId: string;
  addedAt: number;
  metadata?: Record<string, unknown>;
}

interface CollectionData {
  collection: Collection;
  memberships: CollectionMembership[];
}

interface CollectionPageContentProps {
  collectionId: string;
  onPreviewChange?: (repo: string | null) => void;
  initialPreviewedRepo?: string | null;
  // User collection props
  isUserCollection?: boolean;
  collectionName?: string;
  onAddRepository?: () => void;
  onEditCollection?: () => void;
  // Autocomplete data for command palette
  allCollections?: Array<{ id: string; name: string }>;
}

function CollectionPageContent({
  collectionId: _collectionId,
  onPreviewChange,
  initialPreviewedRepo,
  isUserCollection = false,
  collectionName,
  onAddRepository,
  onEditCollection,
  allCollections = [],
}: CollectionPageContentProps) {
  const { theme } = useTheme();
  const router = useRouter();
  const { context, actions, events } = usePanelProvider();
  const [isMobile, setIsMobile] = useState(false);
  const [previewedRepo, setPreviewedRepo] = useState<string | null>(initialPreviewedRepo ?? null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  // Layout matching owner page
  const layout: PanelLayout = {
    left: 'workspace-collection',
    middle: {
      type: 'tabs',
      panels: ['file-city', 'visual-validation', 'dependency-graph'],
    },
    right: {
      type: 'tabs',
      panels: ['code-quality', 'package-composition'],
    },
  };

  const handlePreviewChange = useCallback((repo: string | null) => {
    setPreviewedRepo(repo);
    onPreviewChange?.(repo);
  }, [onPreviewChange]);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Load initial repo data if provided via URL
  useEffect(() => {
    if (!initialPreviewedRepo || !actions) return;

    const [owner, repo] = initialPreviewedRepo.split('/');
    if (owner && repo) {
      (actions as { previewReadme?: (owner: string, repo: string) => Promise<string> }).previewReadme?.(owner, repo);
    }
  }, [initialPreviewedRepo, actions]);

  // Auto-select first repository when repositories are loaded
  const workspaceReposSlice = context.getSlice('workspaceRepositories');
  const workspaceReposData = workspaceReposSlice?.data as { repositories?: Array<{ full_name: string; owner: { login: string }; name: string }> } | undefined;
  const workspaceReposLoading = workspaceReposSlice?.loading ?? true;

  useEffect(() => {
    if (!events || workspaceReposLoading || previewedRepo) return;

    const repositories = workspaceReposData?.repositories;
    if (repositories && repositories.length > 0) {
      // Select first repository alphabetically by name
      const sortedRepos = [...repositories].sort((a, b) => a.name.localeCompare(b.name));
      const firstRepo = sortedRepos[0];
      if (firstRepo?.full_name) {
        handlePreviewChange(firstRepo.full_name);
        (actions as { previewReadme?: (owner: string, repo: string) => Promise<string> }).previewReadme?.(
          firstRepo.owner.login,
          firstRepo.name
        );
      }
    }
  }, [events, workspaceReposLoading, workspaceReposData?.repositories, previewedRepo, handlePreviewChange, actions]);

  // Listen for repository events
  useEffect(() => {
    if (!events) return;

    const unsubscribers = [
      events.on('repository:selected', (event) => {
        const payload = event.payload as { repository?: { full_name?: string } };
        if (payload?.repository?.full_name) {
          const fullName = payload.repository.full_name;
          handlePreviewChange(fullName);
          const [owner, repo] = fullName.split('/');
          if (owner && repo) {
            (actions as { previewReadme?: (owner: string, repo: string) => Promise<string> }).previewReadme?.(owner, repo);
          }
        }
      }),
      events.on('repository:navigate', (event) => {
        const payload = event.payload as { owner?: string; repo?: string };
        if (payload?.owner && payload?.repo) {
          router.push(`/${payload.owner}/${payload.repo}`);
        }
      }),
    ];

    return () => unsubscribers.forEach((unsub) => unsub());
  }, [events, actions, handlePreviewChange, router]);

  const panels = [
    {
      id: 'workspace-collection',
      label: 'Repositories',
      content: (
        <div className="h-full w-full overflow-hidden">
          <WorkspaceCollectionPanelLoader
            context={context}
            actions={{
              ...actions,
              navigateToRepository: (owner: string, repo: string) => {
                router.push(`/${owner}/${repo}`);
              },
              previewRepository: (repository: { full_name: string; owner: { login: string }; name: string }) => {
                handlePreviewChange(repository.full_name);
                (actions as { previewReadme?: (owner: string, repo: string) => Promise<string> }).previewReadme?.(
                  repository.owner.login,
                  repository.name
                );
              },
            }}
            events={events}
            selectedRepository={previewedRepo}
            defaultShowSearch
          />
        </div>
      ),
    },
    {
      id: 'visual-validation',
      label: 'Architecture',
      content: (
        <div className="h-full w-full overflow-hidden">
          <PrincipalViewPanelLoader context={context} actions={actions} events={events} />
        </div>
      ),
    },
    {
      id: 'code-quality',
      label: 'Quality',
      content: (
        <div className="h-full w-full overflow-hidden">
          <CodeQualityPanelLoader context={context} actions={actions} events={events} />
        </div>
      ),
    },
    {
      id: 'package-composition',
      label: 'Packages',
      content: (
        <div className="h-full w-full overflow-hidden">
          <PackageCompositionPanelLoader context={context} actions={actions} events={events} />
        </div>
      ),
    },
    {
      id: 'dependency-graph',
      label: 'Dependencies',
      content: (
        <div className="h-full w-full overflow-hidden">
          <DependencyGraphPanelLoader context={context} actions={actions} events={events} />
        </div>
      ),
    },
    {
      id: 'file-city',
      label: 'File City',
      content: (
        <div className="h-full w-full overflow-hidden">
          <FileCityPanelLoader context={context} actions={actions} events={events} />
        </div>
      ),
    },
    {
      id: 'empty',
      label: '',
      content: <div />,
    },
  ];

  return (
    <div className="h-full w-full flex flex-col">
      <EditorHeader
        leftCollapsed={leftCollapsed}
        rightCollapsed={rightCollapsed}
        onToggleLeft={() => setLeftCollapsed(!leftCollapsed)}
        onToggleRight={() => setRightCollapsed(!rightCollapsed)}
        selectedRepository={previewedRepo}
        isUserCollection={isUserCollection}
        collectionName={collectionName}
        onAddRepository={onAddRepository}
        onEditCollection={onEditCollection}
      />
      <div className="flex-1 overflow-hidden">
        {isMobile ? (
          <ResponsiveConfigurablePanelLayout
            theme={theme}
            panels={panels}
            layout={layout}
            defaultSizes={{ left: 25, middle: 50, right: 25 }}
            minSizes={{ left: 15, middle: 30, right: 15 }}
            collapsiblePanels={{ left: true, right: true }}
            collapsed={{ left: leftCollapsed, right: rightCollapsed }}
            showCollapseButtons={false}
            mobileBreakpoint="(max-width: 768px)"
          />
        ) : (
          <EditableConfigurablePanelLayout
            theme={theme}
            panels={panels}
            layout={layout}
            isEditMode={false}
            defaultSizes={{ left: 25, middle: 50, right: 25 }}
            minSizes={{ left: 15, middle: 30, right: 15 }}
            collapsiblePanels={{ left: true, right: true }}
            collapsed={{ left: leftCollapsed, right: rightCollapsed }}
            showCollapseButtons={false}
          />
        )}
      </div>

      {/* Global Command Palette (Cmd+Shift+P) */}
      <GlobalCommandPalette
        events={events}
        autocompleteData={{
          collections: allCollections,
        }}
      />
    </div>
  );
}

function CollectionPageWrapper({ collectionId }: { collectionId: string }) {
  const { theme } = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const userCollections = useUserCollections();

  const [previewedRepo, setPreviewedRepo] = useState<string | null>(() => {
    return searchParams.get('project');
  });
  const [collection, setCollection] = useState<Collection | null>(null);
  const [repositories, setRepositories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states for user collections
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [addRepoModalOpen, setAddRepoModalOpen] = useState(false);

  // Check if this is a user collection
  const isUserCollection = userCollections.isUserCollection(collectionId);
  const userCollection = userCollections.getCollection(collectionId);

  // Update URL when previewed repo changes
  const handlePreviewChange = useCallback((repo: string | null) => {
    setPreviewedRepo(repo);
    const params = new URLSearchParams(searchParams.toString());
    if (repo) {
      params.set('project', repo);
    } else {
      params.delete('project');
    }
    router.replace(`/collections/${collectionId}?${params.toString()}`, { scroll: false });
  }, [collectionId, router, searchParams]);

  // Load collection data - either from user collections or API
  useEffect(() => {
    // Wait for user collections to load before checking
    if (userCollections.loading) return;

    if (isUserCollection && userCollection) {
      // Load from user collections context
      setCollection({
        id: userCollection.id,
        name: userCollection.name,
        description: userCollection.description || '',
        icon: userCollection.icon,
        theme: userCollection.theme,
      });
      setRepositories(userCollections.getCollectionRepositories(collectionId));
      setLoading(false);
    } else {
      // Fetch from API (curated collections)
      fetch(`/api/collections/${collectionId}`)
        .then((res) => {
          if (!res.ok) throw new Error('Collection not found');
          return res.json();
        })
        .then((data: CollectionData) => {
          setCollection(data.collection);
          // Extract repository IDs from memberships
          const repoIds = (data.memberships || []).map(m => m.repositoryId);
          setRepositories(repoIds);
          setLoading(false);
        })
        .catch((err) => {
          setError(err.message);
          setLoading(false);
        });
    }
  }, [collectionId, isUserCollection, userCollection, userCollections]);

  // Update repositories when user collection memberships change
  useEffect(() => {
    if (isUserCollection) {
      setRepositories(userCollections.getCollectionRepositories(collectionId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUserCollection, collectionId, userCollections.memberships]);

  // Handlers for user collection actions
  const handleSaveCollection = useCallback(async (name: string, description: string, icon: string) => {
    await userCollections.updateCollection(collectionId, { name, description, icon });
    setCollection((prev) => prev ? { ...prev, name, description, icon } : null);
  }, [collectionId, userCollections]);

  const handleDeleteCollection = useCallback(async () => {
    await userCollections.deleteCollection(collectionId);
    router.push('/');
  }, [collectionId, userCollections, router]);

  const handleAddRepository = useCallback(async (repositoryId: string) => {
    await userCollections.addRepository(collectionId, repositoryId);
    // State will be updated by the useEffect that watches userCollections.memberships
  }, [collectionId, userCollections]);

  const handleRemoveRepository = useCallback(async (repositoryId: string) => {
    await userCollections.removeRepository(collectionId, repositoryId);
    // State will be updated by the useEffect that watches userCollections.memberships
  }, [collectionId, userCollections]);

  if (loading || userCollections.loading) {
    return (
      <div
        className="h-screen w-screen flex items-center justify-center"
        style={{ background: theme.colors.background, color: theme.colors.text }}
      >
        Loading collection...
      </div>
    );
  }

  if (error || !collection) {
    return (
      <div
        className="h-screen w-screen flex flex-col items-center justify-center gap-4"
        style={{ background: theme.colors.background, color: theme.colors.text }}
      >
        <p>{error || 'Collection not found'}</p>
        <Link
          href="/"
          style={{
            padding: '8px 16px',
            borderRadius: '8px',
            backgroundColor: theme.colors.primary,
            color: theme.colors.textOnPrimary,
            textDecoration: 'none',
          }}
        >
          Back to Home
        </Link>
      </div>
    );
  }

  return (
    <div
      className="h-screen w-screen overflow-hidden"
      style={{ background: theme.colors.background }}
    >
      <PanelProvider
        key={`${collectionId}-${repositories.length}-${repositories[repositories.length - 1] || 'empty'}`}
        workspace={{
          name: collection.name,
          path: `/collections/${collectionId}`,
        }}
        repository={{
          name: previewedRepo ? previewedRepo.split('/')[1] || collection.name : collection.name,
          path: previewedRepo ? `/GitHub/${previewedRepo}` : `/collections/${collectionId}`,
        }}
        githubRepo={previewedRepo || undefined}
        collectionId={collectionId}
        collectionRepositories={repositories}
      >
        <CollectionPageContent
          collectionId={collectionId}
          onPreviewChange={handlePreviewChange}
          initialPreviewedRepo={previewedRepo}
          isUserCollection={isUserCollection}
          collectionName={collection.name}
          onAddRepository={() => setAddRepoModalOpen(true)}
          onEditCollection={() => setEditModalOpen(true)}
          allCollections={userCollections.collections.map(c => ({ id: c.id, name: c.name }))}
        />
      </PanelProvider>

      {/* Modals for user collections */}
      {isUserCollection && userCollection && (
        <>
          <CollectionModal
            isOpen={editModalOpen}
            onClose={() => setEditModalOpen(false)}
            onSave={handleSaveCollection}
            onDelete={handleDeleteCollection}
            initialData={userCollection}
            mode="edit"
          />
          <AddRepositoryModal
            isOpen={addRepoModalOpen}
            onClose={() => setAddRepoModalOpen(false)}
            onAdd={handleAddRepository}
            onRemove={handleRemoveRepository}
            existingRepositories={repositories}
            collectionName={collection.name}
          />
        </>
      )}
    </div>
  );
}

export default function CollectionPage() {
  const params = useParams();
  const collectionId = params.id as string;

  return <CollectionPageWrapper collectionId={collectionId} />;
}
