import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { ThemeProvider, useTheme } from '@principal-ade/industry-theme';
import {
  mockCollections,
  mockCollectionRepositories,
  mockStarredRepos,
  mockFollowingUsers,
} from '../__mocks__/pageMocks';
import {
  Plus,
  FolderOpen,
  Edit2,
  Cloud,
  CloudOff,
  Share2,
  Settings,
  Compass,
  Clock,
  GitFork,
  User,
  Library,
  Star,
  Users,
  X,
  Home,
  ChevronDown,
  Layers,
} from 'lucide-react';
import type { Collection } from '@principal-ai/alexandria-collections';

/**
 * Mock LibraryPageContent that shows the page layout without dynamic panel imports
 */
function MockLibraryPageContent({
  collections = mockCollections,
  selectedCollectionId = mockCollections[0]?.id || null,
  collectionRepositories = mockCollectionRepositories,
  viewMode: initialViewMode = 'manage',
  gitHubSynced = false,
}: {
  collections?: Collection[];
  selectedCollectionId?: string | null;
  collectionRepositories?: Record<string, string[]>;
  viewMode?: 'manage' | 'explore';
  gitHubSynced?: boolean;
}) {
  const { theme } = useTheme();
  const [viewMode, setViewMode] = React.useState<'manage' | 'explore'>(initialViewMode);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [sidebarTab, setSidebarTab] = React.useState<'recent' | 'collections' | 'following' | 'starred'>('collections');
  const [dropdownOpen, setDropdownOpen] = React.useState(false);
  const [currentCollectionId, setCurrentCollectionId] = React.useState(selectedCollectionId);

  const selectedCollection = collections.find(c => c.id === currentCollectionId);
  const repos = currentCollectionId ? (collectionRepositories[currentCollectionId] || []) : [];

  const user = {
    login: 'octocat',
    name: 'The Octocat',
    avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4',
  };

  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      {/* Header */}
      <header
        className="h-14 grid grid-cols-3 items-center px-4 border-b"
        style={{ background: theme.colors.surface, borderColor: theme.colors.border }}
      >
        {/* Left: Avatar and Collection Dropdown */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            <img
              src={user.avatar_url}
              alt={user.name}
              style={{ width: 32, height: 32, borderRadius: '50%', border: `2px solid ${theme.colors.border}` }}
            />
          </button>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              style={{
                color: theme.colors.textSecondary,
                fontSize: `${theme.fontSizes[2]}px`,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              Collections
            </button>
            <span style={{ color: theme.colors.textSecondary }}>/</span>
            <span style={{ color: theme.colors.text, fontWeight: theme.fontWeights.semibold }}>
              {selectedCollection?.name || 'Select Collection'}
            </span>

            {dropdownOpen && (
              <>
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                  onClick={() => setDropdownOpen(false)}
                />
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    marginTop: '4px',
                    minWidth: '280px',
                    backgroundColor: theme.colors.background,
                    border: `1px solid ${theme.colors.border}`,
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                    zIndex: 50,
                  }}
                >
                  <button
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 12px',
                      backgroundColor: 'transparent',
                      border: 'none',
                      borderBottom: `1px solid ${theme.colors.border}`,
                      cursor: 'pointer',
                      color: theme.colors.primary,
                    }}
                  >
                    <Plus size={16} />
                    Create New Collection
                  </button>
                  {collections.map(collection => (
                    <button
                      key={collection.id}
                      onClick={() => {
                        setCurrentCollectionId(collection.id);
                        setDropdownOpen(false);
                      }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 12px',
                        backgroundColor: collection.id === currentCollectionId ? theme.colors.backgroundTertiary : 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: theme.colors.text,
                        textAlign: 'left',
                      }}
                    >
                      <FolderOpen size={16} style={{ color: theme.colors.textSecondary }} />
                      <span>{collection.name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Center: Mode Switch */}
        <div className="flex items-center justify-center">
          <div
            className="flex items-center rounded-lg p-0.5"
            style={{ background: theme.colors.backgroundTertiary, border: `1px solid ${theme.colors.border}` }}
          >
            <button
              onClick={() => setViewMode('manage')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all"
              style={{
                background: viewMode === 'manage' ? theme.colors.surface : 'transparent',
                color: viewMode === 'manage' ? theme.colors.text : theme.colors.textSecondary,
                boxShadow: viewMode === 'manage' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              <Settings size={14} />
              <span>Manage</span>
            </button>
            <button
              onClick={() => setViewMode('explore')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-all"
              style={{
                background: viewMode === 'explore' ? theme.colors.surface : 'transparent',
                color: viewMode === 'explore' ? theme.colors.text : theme.colors.textSecondary,
                boxShadow: viewMode === 'explore' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              <Compass size={14} />
              <span>Explore</span>
            </button>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center justify-end gap-3">
          {viewMode === 'manage' && (
            <>
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm"
                style={{ background: theme.colors.primary, color: theme.colors.textOnPrimary }}
              >
                <Plus size={16} />
                <span>Add Repo</span>
              </button>
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm"
                style={{ background: theme.colors.secondary, color: theme.colors.text, border: `1px solid ${theme.colors.border}` }}
              >
                <Edit2 size={16} />
                <span>Edit</span>
              </button>
            </>
          )}
          {gitHubSynced && (
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm"
              style={{ background: '#10b98120', color: '#10b981', border: '1px solid #10b981' }}
            >
              <Share2 size={16} />
              <span>Share</span>
            </button>
          )}
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm"
            style={{
              background: gitHubSynced ? '#10b98120' : theme.colors.secondary,
              color: gitHubSynced ? '#10b981' : theme.colors.text,
              border: `1px solid ${gitHubSynced ? '#10b981' : theme.colors.border}`,
            }}
          >
            {gitHubSynced ? <Cloud size={16} /> : <CloudOff size={16} />}
            <span>{gitHubSynced ? 'Synced' : 'Sync'}</span>
          </button>
          <img
            src={user.avatar_url}
            alt={user.name}
            style={{ width: 32, height: 32, borderRadius: '50%', border: `2px solid ${theme.colors.border}` }}
          />
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Left Panel - Collection Repositories */}
        <div
          className="w-2/5 border-r overflow-auto"
          style={{ background: theme.colors.background, borderColor: theme.colors.border }}
        >
          <div className="p-4">
            <h3 className="text-sm font-semibold mb-3" style={{ color: theme.colors.text }}>
              {selectedCollection?.name || 'Collection'} ({repos.length} repos)
            </h3>
            {repos.length > 0 ? (
              repos.map((repoName, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg mb-2 transition-all hover:opacity-80"
                  style={{ background: theme.colors.surface, border: `1px solid ${theme.colors.border}` }}
                >
                  <div className="font-medium text-sm" style={{ color: theme.colors.text }}>
                    {repoName}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8" style={{ color: theme.colors.textMuted }}>
                <FolderOpen size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
                <p>No repositories in this collection</p>
                <button
                  className="mt-4 px-4 py-2 rounded-md text-sm"
                  style={{ background: theme.colors.primary, color: theme.colors.textOnPrimary }}
                >
                  Add Repository
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Middle/Right Panels */}
        {viewMode === 'manage' ? (
          <div className="flex-1 flex">
            <div
              className="flex-1 p-4 border-r"
              style={{ background: theme.colors.background, borderColor: theme.colors.border }}
            >
              <h3 className="text-sm font-semibold mb-3" style={{ color: theme.colors.text }}>
                Starred Repositories
              </h3>
              {mockStarredRepos.map((repo) => (
                <div
                  key={repo.id}
                  className="p-3 rounded-lg mb-2"
                  style={{ background: theme.colors.surface, border: `1px solid ${theme.colors.border}` }}
                >
                  <div className="flex items-center gap-2">
                    <img src={repo.owner.avatar_url} alt={repo.owner.login} className="w-5 h-5 rounded" />
                    <span style={{ color: theme.colors.text }}>{repo.full_name}</span>
                    <button
                      className="ml-auto px-2 py-1 rounded text-xs"
                      style={{ background: theme.colors.primary, color: theme.colors.textOnPrimary }}
                    >
                      Add
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex">
            <div
              className="flex-1 flex items-center justify-center"
              style={{ background: theme.colors.backgroundTertiary }}
            >
              <div className="text-center" style={{ color: theme.colors.textMuted }}>
                <Compass size={48} style={{ marginBottom: '12px', opacity: 0.5 }} />
                <div className="text-lg mb-2">File City / Architecture View</div>
                <div className="text-sm">
                  {repos.length > 0 ? 'Select a repository to explore' : 'Add repositories to explore'}
                </div>
              </div>
            </div>
            <div
              className="w-1/4 border-l p-4"
              style={{ background: theme.colors.background, borderColor: theme.colors.border }}
            >
              <h3 className="text-sm font-semibold mb-3" style={{ color: theme.colors.text }}>
                Quality / Packages
              </h3>
              <div className="p-4 rounded-lg" style={{ background: theme.colors.surface }}>
                <div style={{ color: theme.colors.textMuted }} className="text-sm">
                  Select a repository to view metrics
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sidebar Overlay */}
      {sidebarOpen && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 50 }}
            onClick={() => setSidebarOpen(false)}
          />
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              bottom: 0,
              width: '400px',
              backgroundColor: theme.colors.background,
              borderRight: `1px solid ${theme.colors.border}`,
              zIndex: 51,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${theme.colors.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <img
                    src={user.avatar_url}
                    alt={user.name}
                    style={{ width: 40, height: 40, borderRadius: '50%' }}
                  />
                  <div>
                    <div style={{ color: theme.colors.text, fontWeight: 600 }}>{user.name}</div>
                    <div style={{ color: theme.colors.textMuted, fontSize: '12px' }}>@{user.login}</div>
                  </div>
                </div>
                <button
                  onClick={() => setSidebarOpen(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.colors.textMuted }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>
            <div style={{ padding: '12px 20px', borderBottom: `1px solid ${theme.colors.border}`, cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: theme.colors.text }}>
                <Home size={16} />
                <span>Home</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '4px', padding: '16px 20px 12px', flexWrap: 'wrap' }}>
              {(['recent', 'collections', 'following', 'starred'] as const).map((tab) => {
                const icons = { recent: Clock, collections: FolderOpen, following: Users, starred: Star };
                const labels = { recent: 'Recent', collections: 'Collections', following: 'Following', starred: 'Starred' };
                const Icon = icons[tab];
                return (
                  <button
                    key={tab}
                    onClick={() => setSidebarTab(tab)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 12px',
                      color: sidebarTab === tab ? theme.colors.text : theme.colors.textMuted,
                      backgroundColor: sidebarTab === tab ? theme.colors.surface : 'transparent',
                      border: sidebarTab === tab ? `1px solid ${theme.colors.border}` : '1px solid transparent',
                      borderRadius: '6px',
                      cursor: 'pointer',
                    }}
                  >
                    <Icon size={14} />
                    {labels[tab]}
                  </button>
                );
              })}
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
              {sidebarTab === 'collections' && (
                <div>
                  {collections.map((collection) => (
                    <div
                      key={collection.id}
                      onClick={() => {
                        setCurrentCollectionId(collection.id);
                        setSidebarOpen(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        color: theme.colors.text,
                        marginBottom: '2px',
                        cursor: 'pointer',
                        backgroundColor: collection.id === currentCollectionId ? theme.colors.surface : 'transparent',
                      }}
                    >
                      <FolderOpen size={16} style={{ color: theme.colors.textMuted }} />
                      <div>
                        <div>{collection.name}</div>
                        <div style={{ fontSize: '12px', color: theme.colors.textMuted }}>
                          {(collectionRepositories[collection.id] || []).length} repos
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Story wrapper with theme
 */
const StoryWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <ThemeProvider>
    <div style={{ height: '100vh', width: '100vw' }}>
      {children}
    </div>
  </ThemeProvider>
);

const meta: Meta = {
  title: 'Pages/LibraryPage',
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj;

/**
 * Default state in Manage mode with collections
 */
export const Default: Story = {
  render: () => (
    <StoryWrapper>
      <MockLibraryPageContent />
    </StoryWrapper>
  ),
};

/**
 * Explore mode with visualization panels
 */
export const ExploreMode: Story = {
  render: () => (
    <StoryWrapper>
      <MockLibraryPageContent viewMode="explore" />
    </StoryWrapper>
  ),
};

/**
 * With GitHub sync enabled
 */
export const GitHubSynced: Story = {
  render: () => (
    <StoryWrapper>
      <MockLibraryPageContent gitHubSynced={true} />
    </StoryWrapper>
  ),
};

/**
 * Empty collection state
 */
export const EmptyCollection: Story = {
  render: () => (
    <StoryWrapper>
      <MockLibraryPageContent
        selectedCollectionId="col-3"
        collectionRepositories={{ ...mockCollectionRepositories, 'col-3': [] }}
      />
    </StoryWrapper>
  ),
};

/**
 * No collections - new user state
 */
export const NoCollections: Story = {
  render: () => {
    const EmptyState = () => {
      const { theme } = useTheme();
      const user = { avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4' };

      return (
        <div className="h-full w-full flex flex-col overflow-hidden">
          <header
            className="h-14 flex items-center justify-between px-4 border-b"
            style={{ background: theme.colors.surface, borderColor: theme.colors.border }}
          >
            <div className="flex items-center gap-3">
              <img src={user.avatar_url} alt="User" style={{ width: 32, height: 32, borderRadius: '50%' }} />
              <span style={{ color: theme.colors.textSecondary }}>Collections</span>
            </div>
            <img src={user.avatar_url} alt="User" style={{ width: 32, height: 32, borderRadius: '50%' }} />
          </header>
          <div
            className="flex-1 flex flex-col items-center justify-center gap-4"
            style={{ color: theme.colors.textSecondary }}
          >
            <Layers size={48} style={{ opacity: 0.5 }} />
            <p>No collections yet. Create one to get started!</p>
            <button
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                backgroundColor: theme.colors.primary,
                color: theme.colors.textOnPrimary,
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              <Plus size={18} />
              Create Collection
            </button>
          </div>
        </div>
      );
    };

    return (
      <StoryWrapper>
        <EmptyState />
      </StoryWrapper>
    );
  },
};

/**
 * Collection dropdown open
 */
export const CollectionDropdownOpen: Story = {
  render: () => {
    const WithDropdown = () => {
      const { theme } = useTheme();
      const user = { avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4', name: 'The Octocat' };

      return (
        <div className="h-full w-full flex flex-col overflow-hidden">
          <header
            className="h-14 flex items-center px-4 border-b"
            style={{ background: theme.colors.surface, borderColor: theme.colors.border }}
          >
            <div className="flex items-center gap-3">
              <img src={user.avatar_url} alt={user.name} style={{ width: 32, height: 32, borderRadius: '50%' }} />
              <div style={{ position: 'relative' }}>
                <div className="flex items-center gap-2">
                  <span style={{ color: theme.colors.textSecondary }}>Collections</span>
                  <span style={{ color: theme.colors.textSecondary }}>/</span>
                  <span style={{ color: theme.colors.text, fontWeight: 600 }}>Frontend Tools</span>
                  <ChevronDown size={16} style={{ color: theme.colors.textMuted }} />
                </div>
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    marginTop: '4px',
                    minWidth: '280px',
                    backgroundColor: theme.colors.background,
                    border: `1px solid ${theme.colors.border}`,
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                    zIndex: 50,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 12px',
                      borderBottom: `1px solid ${theme.colors.border}`,
                      color: theme.colors.primary,
                    }}
                  >
                    <Plus size={16} />
                    Create New Collection
                  </div>
                  {mockCollections.map(collection => (
                    <div
                      key={collection.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 12px',
                        backgroundColor: collection.id === 'col-1' ? theme.colors.backgroundTertiary : 'transparent',
                        color: theme.colors.text,
                      }}
                    >
                      <FolderOpen size={16} style={{ color: theme.colors.textSecondary }} />
                      <span>{collection.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </header>
          <div className="flex-1" style={{ background: theme.colors.background, opacity: 0.5 }} />
        </div>
      );
    };

    return (
      <StoryWrapper>
        <WithDropdown />
      </StoryWrapper>
    );
  },
};

/**
 * Loading state
 */
export const Loading: Story = {
  render: () => {
    const LoadingState = () => {
      const { theme } = useTheme();

      return (
        <div
          className="h-full w-full flex items-center justify-center"
          style={{ background: theme.colors.background, color: theme.colors.text }}
        >
          <div className="flex flex-col items-center gap-4">
            <div
              className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
              style={{ borderColor: theme.colors.primary, borderTopColor: 'transparent' }}
            />
            <span>Loading library...</span>
          </div>
        </div>
      );
    };

    return (
      <StoryWrapper>
        <LoadingState />
      </StoryWrapper>
    );
  },
};

/**
 * Sidebar open showing collections
 */
export const SidebarOpen: Story = {
  render: () => {
    const WithSidebar = () => {
      const { theme } = useTheme();
      const user = { avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4', name: 'The Octocat', login: 'octocat' };

      return (
        <div className="h-full w-full relative">
          <div className="h-full w-full opacity-50">
            <header
              className="h-14 flex items-center px-4 border-b"
              style={{ background: theme.colors.surface, borderColor: theme.colors.border }}
            >
              <span style={{ color: theme.colors.text }}>Collections / Frontend Tools</span>
            </header>
          </div>
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 50 }} />
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              bottom: 0,
              width: '400px',
              backgroundColor: theme.colors.background,
              borderRight: `1px solid ${theme.colors.border}`,
              zIndex: 51,
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${theme.colors.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <img src={user.avatar_url} alt={user.name} style={{ width: 40, height: 40, borderRadius: '50%' }} />
                <div>
                  <div style={{ color: theme.colors.text, fontWeight: 600 }}>{user.name}</div>
                  <div style={{ color: theme.colors.textMuted, fontSize: '12px' }}>@{user.login}</div>
                </div>
              </div>
            </div>
            <div style={{ padding: '12px 20px', borderBottom: `1px solid ${theme.colors.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: theme.colors.text }}>
                <Home size={16} />
                <span>Home</span>
              </div>
            </div>
            <div style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', gap: '4px' }}>
                <span style={{ padding: '8px 12px', color: theme.colors.textMuted }}>Recent</span>
                <span
                  style={{
                    padding: '8px 12px',
                    background: theme.colors.surface,
                    border: `1px solid ${theme.colors.border}`,
                    borderRadius: '6px',
                    color: theme.colors.text,
                  }}
                >
                  Collections
                </span>
              </div>
            </div>
            <div style={{ padding: '0 20px' }}>
              {mockCollections.map(collection => (
                <div
                  key={collection.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    color: theme.colors.text,
                    marginBottom: '2px',
                    backgroundColor: collection.id === 'col-1' ? theme.colors.surface : 'transparent',
                  }}
                >
                  <FolderOpen size={16} style={{ color: theme.colors.textMuted }} />
                  <div>
                    <div>{collection.name}</div>
                    <div style={{ fontSize: '12px', color: theme.colors.textMuted }}>
                      {(mockCollectionRepositories[collection.id] || []).length} repos
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    };

    return (
      <StoryWrapper>
        <WithSidebar />
      </StoryWrapper>
    );
  },
};
