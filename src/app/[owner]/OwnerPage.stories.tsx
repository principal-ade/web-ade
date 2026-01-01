import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';
import { ThemeProvider, useTheme } from '@principal-ade/industry-theme';
import {
  PageStoryWrapper,
  MockPanelProvider,
  mockRepositories,
  mockStarredRepos,
  mockFollowingUsers,
  mockCollections,
} from '../__mocks__/pageMocks';
import { AuthProvider } from '@/contexts/AuthContext';
import { UserCollectionsProvider } from '@/contexts/UserCollectionsContext';
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  ArrowLeftRight,
  Clock,
  FolderOpen,
  GitFork,
  User,
  Library,
  Star,
  Users,
  X,
  Home,
} from 'lucide-react';

/**
 * Mock OwnerPageContent that shows the page layout without dynamic panel imports
 * This demonstrates the page structure and UI interactions
 */
function MockOwnerPageContent({ owner }: { owner: string }) {
  const { theme } = useTheme();
  const [previewedRepo, setPreviewedRepo] = React.useState<string | null>(null);
  const [leftCollapsed, setLeftCollapsed] = React.useState(false);
  const [rightCollapsed, setRightCollapsed] = React.useState(false);
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [sidebarTab, setSidebarTab] = React.useState<'recent' | 'collections' | 'following' | 'starred'>('recent');

  const user = {
    login: 'octocat',
    name: 'The Octocat',
    avatar_url: 'https://avatars.githubusercontent.com/u/583231?v=4',
  };

  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      {/* Header */}
      <header
        className="h-14 flex items-center justify-between px-4 border-b relative z-50"
        style={{
          background: theme.colors.surface,
          borderColor: theme.colors.border,
        }}
      >
        {/* Left section */}
        <div className="flex items-center gap-3 flex-shrink-0 flex-1">
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex items-center transition-all hover:opacity-80"
            title="Open recent activity"
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            <img
              src={user.avatar_url}
              alt={user.name}
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                border: `2px solid ${theme.colors.border}`,
              }}
            />
          </button>
          <div className="flex items-center gap-2 flex-shrink-0">
            <img
              src={`https://github.com/${owner}.png?size=64`}
              alt={owner}
              className="w-6 h-6 rounded-full"
            />
            <span
              className="text-base font-semibold"
              style={{ color: theme.colors.text }}
            >
              {owner}
            </span>
          </div>
          {previewedRepo && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <span style={{ color: theme.colors.textMuted }}>/</span>
              <span
                className="text-base font-semibold"
                style={{ color: theme.colors.text }}
              >
                {previewedRepo.split('/')[1]}
              </span>
              <span
                className="px-2 py-0.5 rounded text-xs"
                style={{
                  background: theme.colors.primary,
                  color: theme.colors.textOnPrimary,
                }}
              >
                Open
              </span>
            </div>
          )}
        </div>

        {/* Right section */}
        <div className="flex items-center gap-3 flex-shrink-0 flex-1 justify-end">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setLeftCollapsed(!leftCollapsed)}
              className="flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80"
              style={{
                background: leftCollapsed ? theme.colors.primary : theme.colors.secondary,
                color: theme.colors.textOnPrimary,
              }}
            >
              {leftCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
            <button
              className="flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80"
              style={{
                background: theme.colors.secondary,
                color: theme.colors.text,
              }}
            >
              <ArrowLeftRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setRightCollapsed(!rightCollapsed)}
              className="flex items-center justify-center w-8 h-8 rounded-md transition-all hover:opacity-80"
              style={{
                background: rightCollapsed ? theme.colors.primary : theme.colors.secondary,
                color: theme.colors.textOnPrimary,
              }}
            >
              {rightCollapsed ? <PanelRightOpen className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
            </button>
          </div>
          <img
            src={user.avatar_url}
            alt={user.name}
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              border: `2px solid ${theme.colors.border}`,
            }}
          />
        </div>
      </header>

      {/* Main Panel Area */}
      <div className="flex-1 overflow-hidden flex">
        {/* Left Panel - Repositories */}
        {!leftCollapsed && (
          <div
            className="w-1/4 min-w-[200px] border-r overflow-auto"
            style={{
              background: theme.colors.background,
              borderColor: theme.colors.border,
            }}
          >
            <div className="p-4">
              <h3
                className="text-sm font-semibold mb-3"
                style={{ color: theme.colors.text }}
              >
                Repositories
              </h3>
              {mockRepositories.map((repo) => (
                <button
                  key={repo.id}
                  onClick={() => setPreviewedRepo(repo.full_name)}
                  className="w-full text-left p-3 rounded-lg mb-2 transition-all hover:opacity-80"
                  style={{
                    background: previewedRepo === repo.full_name ? theme.colors.surface : 'transparent',
                    border: `1px solid ${previewedRepo === repo.full_name ? theme.colors.border : 'transparent'}`,
                  }}
                >
                  <div
                    className="font-medium text-sm"
                    style={{ color: theme.colors.text }}
                  >
                    {repo.name}
                  </div>
                  <div
                    className="text-xs mt-1 line-clamp-2"
                    style={{ color: theme.colors.textMuted }}
                  >
                    {repo.description}
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs" style={{ color: theme.colors.textMuted }}>
                    {repo.language && <span>{repo.language}</span>}
                    <span className="flex items-center gap-1">
                      <Star size={12} />
                      {repo.stargazers_count}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Middle Panel - Visualization */}
        <div
          className="flex-1 flex items-center justify-center"
          style={{ background: theme.colors.backgroundTertiary }}
        >
          <div className="text-center" style={{ color: theme.colors.textMuted }}>
            <div className="text-lg mb-2">File City / Architecture View</div>
            <div className="text-sm">
              {previewedRepo ? `Viewing: ${previewedRepo}` : 'Select a repository'}
            </div>
          </div>
        </div>

        {/* Right Panel - Quality */}
        {!rightCollapsed && (
          <div
            className="w-1/4 min-w-[200px] border-l overflow-auto"
            style={{
              background: theme.colors.background,
              borderColor: theme.colors.border,
            }}
          >
            <div className="p-4">
              <h3
                className="text-sm font-semibold mb-3"
                style={{ color: theme.colors.text }}
              >
                Code Quality / Packages
              </h3>
              <div
                className="p-4 rounded-lg"
                style={{ background: theme.colors.surface }}
              >
                <div style={{ color: theme.colors.textMuted }} className="text-sm">
                  {previewedRepo ? 'Quality metrics for selected repo' : 'Select a repository to view metrics'}
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
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 50,
            }}
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
            {/* Sidebar Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderBottom: `1px solid ${theme.colors.border}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <img
                  src={user.avatar_url}
                  alt={user.name}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: '50%',
                    border: `2px solid ${theme.colors.border}`,
                  }}
                />
                <div>
                  <div style={{ fontSize: `${theme.fontSizes[2]}px`, fontWeight: theme.fontWeights.semibold, color: theme.colors.text }}>
                    {user.name}
                  </div>
                  <div style={{ fontSize: `${theme.fontSizes[0]}px`, color: theme.colors.textMuted }}>
                    @{user.login}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  color: theme.colors.textMuted,
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Home Link */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 20px',
                color: theme.colors.text,
                borderBottom: `1px solid ${theme.colors.border}`,
                cursor: 'pointer',
              }}
            >
              <Home size={16} />
              <span>Home</span>
            </div>

            {/* Tab Header */}
            <div style={{ display: 'flex', gap: '4px', padding: '16px 20px 12px', flexWrap: 'wrap' }}>
              {(['recent', 'collections', 'following', 'starred'] as const).map((tab) => {
                const tabConfig = {
                  recent: { icon: Clock, label: 'Recent' },
                  collections: { icon: FolderOpen, label: 'Collections' },
                  following: { icon: Users, label: 'Following' },
                  starred: { icon: Star, label: 'Starred' },
                };
                const { icon: Icon, label } = tabConfig[tab];
                return (
                  <button
                    key={tab}
                    onClick={() => setSidebarTab(tab)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 12px',
                      fontSize: `${theme.fontSizes[1]}px`,
                      fontWeight: theme.fontWeights.semibold,
                      color: sidebarTab === tab ? theme.colors.text : theme.colors.textMuted,
                      backgroundColor: sidebarTab === tab ? theme.colors.surface : 'transparent',
                      border: sidebarTab === tab ? `1px solid ${theme.colors.border}` : '1px solid transparent',
                      borderRadius: '6px',
                      cursor: 'pointer',
                    }}
                  >
                    <Icon size={14} />
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Tab Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
              {sidebarTab === 'recent' && (
                <div style={{ color: theme.colors.textMuted, textAlign: 'center', padding: '32px 16px' }}>
                  <Clock size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
                  <p>No recent activity</p>
                </div>
              )}
              {sidebarTab === 'collections' && (
                <div>
                  {mockCollections.map((collection) => (
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
                        cursor: 'pointer',
                      }}
                    >
                      <FolderOpen size={16} style={{ color: theme.colors.textMuted }} />
                      <span>{collection.name}</span>
                    </div>
                  ))}
                </div>
              )}
              {sidebarTab === 'following' && (
                <div>
                  {mockFollowingUsers.map((followedUser) => (
                    <div
                      key={followedUser.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        color: theme.colors.text,
                        marginBottom: '2px',
                      }}
                    >
                      <img
                        src={followedUser.avatar_url}
                        alt={followedUser.login}
                        style={{ width: 28, height: 28, borderRadius: '50%' }}
                      />
                      <div>
                        <div style={{ fontSize: `${theme.fontSizes[1]}px` }}>
                          {followedUser.name || followedUser.login}
                        </div>
                        <div style={{ fontSize: `${theme.fontSizes[0]}px`, color: theme.colors.textMuted }}>
                          @{followedUser.login}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {sidebarTab === 'starred' && (
                <div>
                  {mockStarredRepos.map((repo) => (
                    <div
                      key={repo.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        color: theme.colors.text,
                        marginBottom: '2px',
                      }}
                    >
                      <img
                        src={repo.owner.avatar_url}
                        alt={repo.owner.login}
                        style={{ width: 28, height: 28, borderRadius: '6px' }}
                      />
                      <div>
                        <div style={{ fontSize: `${theme.fontSizes[1]}px` }}>{repo.full_name}</div>
                        <div
                          style={{
                            fontSize: `${theme.fontSizes[0]}px`,
                            color: theme.colors.textMuted,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <Star size={10} />
                          {repo.stargazers_count.toLocaleString()}
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
const StoryWrapper: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => (
  <ThemeProvider>
    <div style={{ height: '100vh', width: '100vw' }}>
      {children}
    </div>
  </ThemeProvider>
);

const meta: Meta = {
  title: 'Pages/OwnerPage',
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj;

/**
 * Default state showing an owner's repositories
 */
export const Default: Story = {
  render: () => (
    <StoryWrapper>
      <MockOwnerPageContent owner="octocat" />
    </StoryWrapper>
  ),
};

/**
 * With a repository selected/previewed
 */
export const WithPreviewedRepository: Story = {
  render: () => {
    const MockWithPreview = () => {
      const { theme } = useTheme();
      const [previewedRepo] = React.useState('octocat/hello-world');
      const [leftCollapsed] = React.useState(false);
      const [rightCollapsed] = React.useState(false);

      return (
        <div className="h-full w-full flex flex-col overflow-hidden">
          <header
            className="h-14 flex items-center justify-between px-4 border-b"
            style={{ background: theme.colors.surface, borderColor: theme.colors.border }}
          >
            <div className="flex items-center gap-3">
              <img
                src="https://avatars.githubusercontent.com/u/583231?v=4"
                alt="octocat"
                style={{ width: 32, height: 32, borderRadius: '50%', border: `2px solid ${theme.colors.border}` }}
              />
              <span style={{ color: theme.colors.text }} className="font-semibold">octocat</span>
              <span style={{ color: theme.colors.textMuted }}>/</span>
              <span style={{ color: theme.colors.text }} className="font-semibold">hello-world</span>
              <span
                className="px-2 py-0.5 rounded text-xs"
                style={{ background: theme.colors.primary, color: theme.colors.textOnPrimary }}
              >
                Open
              </span>
            </div>
          </header>
          <div className="flex-1 flex">
            <div className="w-1/4 border-r p-4" style={{ borderColor: theme.colors.border }}>
              {mockRepositories.map((repo) => (
                <div
                  key={repo.id}
                  className="p-3 rounded-lg mb-2"
                  style={{
                    background: previewedRepo === repo.full_name ? theme.colors.surface : 'transparent',
                    border: `1px solid ${previewedRepo === repo.full_name ? theme.colors.border : 'transparent'}`,
                  }}
                >
                  <div style={{ color: theme.colors.text }}>{repo.name}</div>
                </div>
              ))}
            </div>
            <div className="flex-1 flex items-center justify-center" style={{ background: theme.colors.backgroundTertiary }}>
              <div style={{ color: theme.colors.textMuted }}>Viewing: {previewedRepo}</div>
            </div>
            <div className="w-1/4 border-l p-4" style={{ borderColor: theme.colors.border }}>
              <div style={{ color: theme.colors.text }}>Quality Metrics</div>
            </div>
          </div>
        </div>
      );
    };

    return (
      <StoryWrapper>
        <MockWithPreview />
      </StoryWrapper>
    );
  },
};

/**
 * With left panel collapsed
 */
export const LeftPanelCollapsed: Story = {
  render: () => {
    const MockCollapsed = () => {
      const { theme } = useTheme();

      return (
        <div className="h-full w-full flex flex-col overflow-hidden">
          <header
            className="h-14 flex items-center justify-between px-4 border-b"
            style={{ background: theme.colors.surface, borderColor: theme.colors.border }}
          >
            <div className="flex items-center gap-3">
              <img
                src="https://avatars.githubusercontent.com/u/583231?v=4"
                alt="octocat"
                style={{ width: 32, height: 32, borderRadius: '50%' }}
              />
              <span style={{ color: theme.colors.text }} className="font-semibold">octocat</span>
            </div>
            <div className="flex gap-1">
              <button
                className="w-8 h-8 rounded-md flex items-center justify-center"
                style={{ background: theme.colors.primary, color: theme.colors.textOnPrimary }}
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            </div>
          </header>
          <div className="flex-1 flex items-center justify-center" style={{ background: theme.colors.backgroundTertiary }}>
            <div style={{ color: theme.colors.textMuted }}>
              Main visualization area (left panel collapsed)
            </div>
          </div>
        </div>
      );
    };

    return (
      <StoryWrapper>
        <MockCollapsed />
      </StoryWrapper>
    );
  },
};

/**
 * With sidebar open showing recent activity
 */
export const SidebarOpen: Story = {
  render: () => {
    const MockWithSidebar = () => {
      const { theme } = useTheme();

      return (
        <div className="h-full w-full relative">
          {/* Main content (dimmed) */}
          <div className="h-full w-full opacity-50">
            <header
              className="h-14 flex items-center px-4 border-b"
              style={{ background: theme.colors.surface, borderColor: theme.colors.border }}
            >
              <span style={{ color: theme.colors.text }}>octocat</span>
            </header>
          </div>

          {/* Backdrop */}
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', zIndex: 50 }} />

          {/* Sidebar */}
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
                <img
                  src="https://avatars.githubusercontent.com/u/583231?v=4"
                  alt="The Octocat"
                  style={{ width: 40, height: 40, borderRadius: '50%' }}
                />
                <div>
                  <div style={{ color: theme.colors.text, fontWeight: 600 }}>The Octocat</div>
                  <div style={{ color: theme.colors.textMuted, fontSize: '12px' }}>@octocat</div>
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
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                <span
                  style={{
                    padding: '8px 12px',
                    background: theme.colors.surface,
                    border: `1px solid ${theme.colors.border}`,
                    borderRadius: '6px',
                    color: theme.colors.text,
                    fontSize: '14px',
                  }}
                >
                  Recent
                </span>
                <span
                  style={{
                    padding: '8px 12px',
                    color: theme.colors.textMuted,
                    fontSize: '14px',
                  }}
                >
                  Collections
                </span>
              </div>
            </div>
          </div>
        </div>
      );
    };

    return (
      <StoryWrapper>
        <MockWithSidebar />
      </StoryWrapper>
    );
  },
};

/**
 * Empty state - owner with no repositories
 */
export const EmptyRepositories: Story = {
  render: () => {
    const MockEmpty = () => {
      const { theme } = useTheme();

      return (
        <div className="h-full w-full flex flex-col overflow-hidden">
          <header
            className="h-14 flex items-center px-4 border-b"
            style={{ background: theme.colors.surface, borderColor: theme.colors.border }}
          >
            <div className="flex items-center gap-3">
              <img
                src="https://avatars.githubusercontent.com/u/583231?v=4"
                alt="newuser"
                style={{ width: 32, height: 32, borderRadius: '50%' }}
              />
              <span style={{ color: theme.colors.text }} className="font-semibold">newuser</span>
            </div>
          </header>
          <div className="flex-1 flex">
            <div
              className="w-1/4 border-r p-4 flex flex-col items-center justify-center"
              style={{ borderColor: theme.colors.border }}
            >
              <GitFork size={48} style={{ color: theme.colors.textMuted, opacity: 0.5, marginBottom: '16px' }} />
              <div style={{ color: theme.colors.textMuted, textAlign: 'center' }}>
                No repositories found
              </div>
            </div>
            <div className="flex-1 flex items-center justify-center" style={{ background: theme.colors.backgroundTertiary }}>
              <div style={{ color: theme.colors.textMuted }}>Select a repository to view</div>
            </div>
          </div>
        </div>
      );
    };

    return (
      <StoryWrapper>
        <MockEmpty />
      </StoryWrapper>
    );
  },
};

/**
 * Unauthenticated state - showing sign in prompt
 */
export const Unauthenticated: Story = {
  render: () => {
    const MockUnauth = () => {
      const { theme } = useTheme();

      return (
        <div className="h-full w-full flex flex-col overflow-hidden">
          <header
            className="h-14 flex items-center justify-between px-4 border-b"
            style={{ background: theme.colors.surface, borderColor: theme.colors.border }}
          >
            <div className="flex items-center gap-3">
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: theme.colors.secondary,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <User size={16} style={{ color: theme.colors.textMuted }} />
              </div>
              <span style={{ color: theme.colors.text }} className="font-semibold">octocat</span>
            </div>
            <button
              style={{
                padding: '8px 16px',
                background: theme.colors.primary,
                color: theme.colors.textOnPrimary,
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              Sign In
            </button>
          </header>
          <div className="flex-1 flex items-center justify-center" style={{ background: theme.colors.backgroundTertiary }}>
            <div style={{ color: theme.colors.textMuted, textAlign: 'center' }}>
              <User size={48} style={{ marginBottom: '16px', opacity: 0.5 }} />
              <p>Sign in to view full repository details</p>
            </div>
          </div>
        </div>
      );
    };

    return (
      <StoryWrapper>
        <MockUnauth />
      </StoryWrapper>
    );
  },
};
