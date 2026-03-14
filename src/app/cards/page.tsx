'use client';

import React, { useState, useEffect } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { EditorHeader } from '@/components/EditorHeader';
import { HomePageProvider } from '@/contexts/HomePageProvider';
import nextDynamic from 'next/dynamic';
import type { AlexandriaEntryWithMetrics } from '@industry-theme/repository-composition-panels';
import type { RepoSpritePackage } from '@industry-theme/repository-composition-panels';
import { trpc } from '@/lib/trpc/client';

export const dynamic = 'force-dynamic';

// Dynamic import to avoid SSR issues with PixiJS
const RepoCardStatic = nextDynamic(
  () =>
    import('@industry-theme/repository-composition-panels').then(
      (mod) => mod.RepoCardStatic
    ),
  { ssr: false }
);

// Sample data for single-package repo
const SAMPLE_REPO: AlexandriaEntryWithMetrics = {
  name: 'react',
  path: '/facebook/react' as AlexandriaEntryWithMetrics['path'],
  registeredAt: new Date().toISOString(),
  hasViews: true,
  viewCount: 42,
  views: [],
  github: {
    id: 'facebook/react',
    owner: 'facebook',
    name: 'react',
    description: 'The library for web and native user interfaces.',
    stars: 225000,
    license: 'MIT',
    primaryLanguage: 'TypeScript',
    topics: ['javascript', 'frontend', 'ui', 'declarative'],
    lastUpdated: new Date().toISOString(),
    ownerAvatar: 'https://avatars.githubusercontent.com/u/69631?v=4',
  },
  metrics: {
    fileCount: 2847,
    lineCount: 450000,
    commitCount: 17234,
    contributors: 1650,
    lastEditedAt: new Date(Date.now() - 86400000).toISOString(),
    createdAt: '2013-05-24T00:00:00Z',
  },
};

// Sample monorepo data - openclaw/openclaw
const SAMPLE_MONOREPO: AlexandriaEntryWithMetrics = {
  name: 'openclaw',
  path: '/openclaw/openclaw' as AlexandriaEntryWithMetrics['path'],
  registeredAt: new Date().toISOString(),
  hasViews: true,
  viewCount: 128,
  views: [],
  github: {
    id: 'openclaw/openclaw',
    owner: 'openclaw',
    name: 'openclaw',
    description: 'Your own personal AI assistant. Any OS. Any Platform. The lobster way.',
    stars: 307306,
    license: 'MIT',
    primaryLanguage: 'TypeScript',
    topics: ['ai', 'assistant', 'crustacean', 'molty', 'openclaw'],
    lastUpdated: new Date().toISOString(),
    ownerAvatar: 'https://avatars.githubusercontent.com/u/198279852?v=4',
  },
  metrics: {
    fileCount: 1245,
    lineCount: 180000,
    commitCount: 3421,
    contributors: 89,
    lastEditedAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    createdAt: '2024-01-15T00:00:00Z',
  },
};

// Language color mapping for packages
const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  Rust: '#dea584',
  Go: '#00ADD8',
};

interface ComponentInfo {
  name: string;
  field: string;
  description: string;
  visual?: string;
}

interface ApiGroup {
  name: string;
  endpoint: string;
  description: string;
  components: ComponentInfo[];
}

const API_GROUPS: ApiGroup[] = [
  {
    name: 'GitHub Repository API',
    endpoint: 'trpc.github.getFeaturedRepos',
    description: 'Core repository metadata from GitHub REST API',
    components: [
      {
        name: 'Owner',
        field: 'github.owner',
        description: 'Repository owner/organization name',
        visual: 'Top-left badge',
      },
      {
        name: 'Owner Avatar',
        field: 'github.ownerAvatar',
        description: 'Profile image URL of the owner',
        visual: 'Top-left badge icon',
      },
      {
        name: 'Repository Name',
        field: 'github.name',
        description: 'Short repository name',
        visual: 'Bottom label',
      },
      {
        name: 'Description',
        field: 'github.description',
        description: 'Repository description from GitHub',
        visual: 'Card content area (if supported)',
      },
      {
        name: 'Stars',
        field: 'github.stars',
        description: 'GitHub star count',
        visual: 'Top-right badge',
      },
      {
        name: 'Language',
        field: 'github.primaryLanguage',
        description: 'Primary programming language',
        visual: 'Bottom row + card color theme',
      },
      {
        name: 'License',
        field: 'github.license',
        description: 'SPDX license identifier (MIT, Apache-2.0, etc)',
        visual: 'Bottom row badge',
      },
      {
        name: 'Topics',
        field: 'github.topics',
        description: 'Repository topic tags',
        visual: 'Not currently displayed',
      },
    ],
  },
  {
    name: 'Package Discovery',
    endpoint: 'trpc.github.getRepoPackages',
    description: 'Monorepo package detection via PackageLayerModule',
    components: [
      {
        name: 'Package Name',
        field: 'packages[].name',
        description: 'Package name from package.json',
        visual: 'Individual building in sprite cluster',
      },
      {
        name: 'Package Path',
        field: 'packages[].path',
        description: 'Path within the repository (e.g., packages/core)',
        visual: 'Affects building position',
      },
      {
        name: 'Package Size',
        field: 'packages[].size',
        description: 'Size multiplier based on file/line count',
        visual: 'Building height/scale',
      },
      {
        name: 'Package Importance',
        field: 'packages[].importance',
        description: 'Visual prominence (0-100, root packages higher)',
        visual: 'Building position (center vs edge)',
      },
      {
        name: 'Is Monorepo Root',
        field: 'packageData.isMonorepoRoot',
        description: 'Whether this is the workspace root',
        visual: 'Central/largest building',
      },
      {
        name: 'Is Workspace',
        field: 'packageData.isWorkspace',
        description: 'Whether this is a workspace package',
        visual: 'Satellite buildings around root',
      },
      {
        name: 'Dependencies',
        field: 'packageData.dependencies',
        description: 'Package dependencies from package.json',
        visual: 'Not directly shown (used for metrics)',
      },
    ],
  },
  {
    name: 'Repository Metrics',
    endpoint: 'Derived from file tree / Alexandria',
    description: 'Extended metrics for sprite sizing and aging effects',
    components: [
      {
        name: 'File Count',
        field: 'metrics.fileCount',
        description: 'Total number of files in repository',
        visual: 'Bottom row + affects sprite size',
      },
      {
        name: 'Line Count',
        field: 'metrics.lineCount',
        description: 'Total lines of code',
        visual: 'Affects sprite complexity',
      },
      {
        name: 'Commit Count',
        field: 'metrics.commitCount',
        description: 'Number of commits in history',
        visual: 'Affects sprite weathering',
      },
      {
        name: 'Contributors',
        field: 'metrics.contributors',
        description: 'Number of unique contributors',
        visual: 'Affects sprite decorations',
      },
      {
        name: 'Last Edited',
        field: 'metrics.lastEditedAt',
        description: 'Timestamp of most recent change',
        visual: 'Affects sprite color saturation (aging)',
      },
    ],
  },
  {
    name: 'Procedural Generation',
    endpoint: 'Client-side (buildingSpriteGenerator)',
    description: 'The isometric building sprite is generated procedurally',
    components: [
      {
        name: 'Building Shape',
        field: 'Seeded from repo name',
        description: 'Deterministic building structure from name hash',
        visual: 'Main sprite body',
      },
      {
        name: 'Color Theme',
        field: 'Derived from primaryLanguage',
        description: 'Language-specific color palette',
        visual: 'Building colors',
      },
      {
        name: 'Size Scale',
        field: 'Based on fileCount + lineCount',
        description: 'Larger repos get bigger sprites (1.5x - 4.0x)',
        visual: 'Overall sprite size',
      },
      {
        name: 'Aging/Weathering',
        field: 'Based on lastEditedAt',
        description: 'Older untouched repos appear more weathered',
        visual: 'Color desaturation, texture',
      },
      {
        name: 'Star Decorations',
        field: 'Based on stars count',
        description: 'High-star repos get star decorations',
        visual: 'Floating stars above building',
      },
      {
        name: 'Collaborator Signs',
        field: 'Based on contributors',
        description: 'Many contributors adds activity indicators',
        visual: 'Small figures/signs near building',
      },
    ],
  },
  {
    name: 'Alexandria Registry',
    endpoint: 'LocalStorage / Alexandria API',
    description: 'View tracking and registration data',
    components: [
      {
        name: 'View Count',
        field: 'viewCount',
        description: 'How many times this repo has been viewed',
        visual: 'Not currently displayed on card',
      },
      {
        name: 'Registered At',
        field: 'registeredAt',
        description: 'When repo was added to Alexandria',
        visual: 'Not currently displayed on card',
      },
    ],
  },
];

type CardExample = 'single' | 'monorepo';
type VisualizationMode = 'sprite' | 'fileCity';

function CardExplanationContent() {
  const { theme } = useTheme();
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>('GitHub Repository API');
  const [selectedExample, setSelectedExample] = useState<CardExample>('single');
  const [visualizationMode, setVisualizationMode] = useState<VisualizationMode>('sprite');
  const [packages, setPackages] = useState<RepoSpritePackage[]>([]);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [packagesError, setPackagesError] = useState<string | null>(null);

  // Fetch packages for openclaw/openclaw when monorepo is selected
  useEffect(() => {
    if (selectedExample !== 'monorepo') {
      setPackages([]);
      return;
    }

    let mounted = true;
    setPackagesLoading(true);
    setPackagesError(null);

    async function fetchPackages() {
      try {
        const data = await trpc.github.getRepoPackages.query({
          owner: 'openclaw',
          repo: 'openclaw',
        });

        if (!mounted) return;

        // Transform PackageLayer[] to RepoSpritePackage[]
        // Size is computed based on package type (root packages are larger)
        const spritePackages: RepoSpritePackage[] = data.packages.map((pkg, idx) => ({
          name: pkg.packageData?.name || pkg.name,
          color: LANGUAGE_COLORS['TypeScript'] || '#3178c6',
          size: pkg.packageData?.isMonorepoRoot ? 2.5 : 1.5 + (idx * 0.2),
        }));

        setPackages(spritePackages);
      } catch (error) {
        if (!mounted) return;
        console.error('Failed to fetch packages:', error);
        setPackagesError(error instanceof Error ? error.message : 'Failed to fetch packages');
      } finally {
        if (mounted) {
          setPackagesLoading(false);
        }
      }
    }

    fetchPackages();

    return () => {
      mounted = false;
    };
  }, [selectedExample]);

  const currentRepo = selectedExample === 'single' ? SAMPLE_REPO : SAMPLE_MONOREPO;
  const currentPackages = selectedExample === 'monorepo' && packages.length > 0 ? packages : undefined;

  return (
    <div
      className="h-viewport-fixed overflow-hidden flex flex-col"
      style={{ background: theme.colors.background }}
    >
      <EditorHeader />

      {/* Main Content - Split View */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
        }}
      >
        {/* Left Panel - Component Breakdown */}
        <div
          style={{
            width: '50%',
            padding: '24px',
            overflowY: 'auto',
            borderRight: `1px solid ${theme.colors.border}`,
          }}
        >
          <h1
            style={{
              fontSize: `${theme.fontSizes[4]}px`,
              fontWeight: theme.fontWeights.bold,
              color: theme.colors.text,
              marginBottom: '8px',
              fontFamily: theme.fonts.heading,
            }}
          >
            Repository Card Components
          </h1>
          <p
            style={{
              fontSize: `${theme.fontSizes[1]}px`,
              color: theme.colors.textMuted,
              marginBottom: '24px',
              fontFamily: theme.fonts.body,
            }}
          >
            Components grouped by API/data source
          </p>

          {API_GROUPS.map((group) => (
            <div
              key={group.name}
              style={{
                marginBottom: '16px',
                borderRadius: '12px',
                border: `1px solid ${theme.colors.border}`,
                overflow: 'hidden',
              }}
            >
              {/* Group Header */}
              <button
                onClick={() =>
                  setExpandedGroup(expandedGroup === group.name ? null : group.name)
                }
                onMouseEnter={() => setHoveredGroup(group.name)}
                onMouseLeave={() => setHoveredGroup(null)}
                style={{
                  width: '100%',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  backgroundColor:
                    hoveredGroup === group.name
                      ? `${theme.colors.primary}10`
                      : theme.colors.surface,
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background-color 0.15s ease',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <h2
                    style={{
                      fontSize: `${theme.fontSizes[2]}px`,
                      fontWeight: theme.fontWeights.semibold,
                      color: theme.colors.text,
                      fontFamily: theme.fonts.heading,
                      margin: 0,
                    }}
                  >
                    {group.name}
                  </h2>
                  <span
                    style={{
                      color: theme.colors.textMuted,
                      fontSize: '12px',
                      transform: expandedGroup === group.name ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.2s ease',
                    }}
                  >
                    ▼
                  </span>
                </div>
                <code
                  style={{
                    fontSize: `${theme.fontSizes[0]}px`,
                    color: theme.colors.primary,
                    fontFamily: theme.fonts.monospace,
                  }}
                >
                  {group.endpoint}
                </code>
                <p
                  style={{
                    fontSize: `${theme.fontSizes[0]}px`,
                    color: theme.colors.textMuted,
                    margin: 0,
                    fontFamily: theme.fonts.body,
                  }}
                >
                  {group.description}
                </p>
              </button>

              {/* Expanded Components */}
              {expandedGroup === group.name && (
                <div
                  style={{
                    borderTop: `1px solid ${theme.colors.border}`,
                    backgroundColor: theme.colors.background,
                  }}
                >
                  {group.components.map((component, idx) => (
                    <div
                      key={component.name}
                      style={{
                        padding: '12px 16px',
                        borderBottom:
                          idx < group.components.length - 1
                            ? `1px solid ${theme.colors.border}`
                            : 'none',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'flex-start',
                          marginBottom: '4px',
                        }}
                      >
                        <span
                          style={{
                            fontSize: `${theme.fontSizes[1]}px`,
                            fontWeight: theme.fontWeights.medium,
                            color: theme.colors.text,
                            fontFamily: theme.fonts.body,
                          }}
                        >
                          {component.name}
                        </span>
                        <code
                          style={{
                            fontSize: `${theme.fontSizes[0]}px`,
                            color: theme.colors.textMuted,
                            fontFamily: theme.fonts.monospace,
                            backgroundColor: `${theme.colors.border}50`,
                            padding: '2px 6px',
                            borderRadius: '4px',
                          }}
                        >
                          {component.field}
                        </code>
                      </div>
                      <p
                        style={{
                          fontSize: `${theme.fontSizes[0]}px`,
                          color: theme.colors.textMuted,
                          margin: '0 0 4px 0',
                          fontFamily: theme.fonts.body,
                        }}
                      >
                        {component.description}
                      </p>
                      {component.visual && (
                        <span
                          style={{
                            fontSize: `${theme.fontSizes[0]}px`,
                            color: theme.colors.accent,
                            fontFamily: theme.fonts.body,
                          }}
                        >
                          → {component.visual}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Right Panel - Card Preview */}
        <div
          style={{
            width: '50%',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            backgroundColor: theme.colors.surface,
            overflowY: 'auto',
          }}
        >
          {/* Tab Switcher */}
          <div
            style={{
              display: 'flex',
              gap: '8px',
              marginBottom: '24px',
              padding: '4px',
              backgroundColor: theme.colors.background,
              borderRadius: '8px',
              border: `1px solid ${theme.colors.border}`,
            }}
          >
            <button
              onClick={() => setSelectedExample('single')}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontSize: `${theme.fontSizes[1]}px`,
                fontFamily: theme.fonts.body,
                fontWeight: theme.fontWeights.medium,
                backgroundColor:
                  selectedExample === 'single' ? theme.colors.primary : 'transparent',
                color:
                  selectedExample === 'single'
                    ? theme.colors.textOnPrimary
                    : theme.colors.textMuted,
                transition: 'all 0.15s ease',
              }}
            >
              Single Package
            </button>
            <button
              onClick={() => setSelectedExample('monorepo')}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontSize: `${theme.fontSizes[1]}px`,
                fontFamily: theme.fonts.body,
                fontWeight: theme.fontWeights.medium,
                backgroundColor:
                  selectedExample === 'monorepo' ? theme.colors.primary : 'transparent',
                color:
                  selectedExample === 'monorepo'
                    ? theme.colors.textOnPrimary
                    : theme.colors.textMuted,
                transition: 'all 0.15s ease',
              }}
            >
              Monorepo
            </button>
          </div>

          {/* Visualization Mode Toggle */}
          <div
            style={{
              display: 'flex',
              gap: '8px',
              marginBottom: '24px',
              padding: '4px',
              backgroundColor: theme.colors.background,
              borderRadius: '8px',
              border: `1px solid ${theme.colors.border}`,
            }}
          >
            <button
              onClick={() => setVisualizationMode('sprite')}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontSize: `${theme.fontSizes[1]}px`,
                fontFamily: theme.fonts.body,
                fontWeight: theme.fontWeights.medium,
                backgroundColor:
                  visualizationMode === 'sprite' ? theme.colors.primary : 'transparent',
                color:
                  visualizationMode === 'sprite'
                    ? theme.colors.textOnPrimary
                    : theme.colors.textMuted,
                transition: 'all 0.15s ease',
              }}
            >
              Sprite
            </button>
            <button
              onClick={() => setVisualizationMode('fileCity')}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                fontSize: `${theme.fontSizes[1]}px`,
                fontFamily: theme.fonts.body,
                fontWeight: theme.fontWeights.medium,
                backgroundColor:
                  visualizationMode === 'fileCity' ? theme.colors.primary : 'transparent',
                color:
                  visualizationMode === 'fileCity'
                    ? theme.colors.textOnPrimary
                    : theme.colors.textMuted,
                transition: 'all 0.15s ease',
              }}
            >
              File City
            </button>
          </div>

          <p
            style={{
              fontSize: `${theme.fontSizes[1]}px`,
              color: theme.colors.textMuted,
              marginBottom: '16px',
              fontFamily: theme.fonts.body,
            }}
          >
            {selectedExample === 'single' ? 'Single Package Card' : 'Monorepo Card (Multiple Buildings)'}
          </p>

          {/* The Card */}
          <div
            style={{
              width: '320px',
              height: '450px',
              transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            }}
          >
            <RepoCardStatic
              repository={currentRepo}
              packages={currentPackages}
              cardTheme="dark"
              width={320}
              height={450}
              spriteSize={280}
              customImage={visualizationMode === 'fileCity' ? `/api/file-city/${currentRepo.github?.owner}/${currentRepo.github?.name}` : undefined}
            />
          </div>

          {/* Info Card */}
          <div
            style={{
              marginTop: '24px',
              padding: '16px',
              borderRadius: '8px',
              backgroundColor: theme.colors.background,
              border: `1px solid ${theme.colors.border}`,
              maxWidth: '320px',
              width: '100%',
            }}
          >
            <p
              style={{
                fontSize: `${theme.fontSizes[0]}px`,
                color: theme.colors.textMuted,
                margin: 0,
                fontFamily: theme.fonts.body,
                lineHeight: 1.6,
              }}
            >
              <strong style={{ color: theme.colors.text }}>Repo:</strong>{' '}
              {currentRepo.github?.owner}/{currentRepo.github?.name}
              <br />
              <strong style={{ color: theme.colors.text }}>Description:</strong>{' '}
              {currentRepo.github?.description || 'N/A'}
              <br />
              <strong style={{ color: theme.colors.text }}>Stars:</strong>{' '}
              {currentRepo.github?.stars?.toLocaleString()}
              <br />
              <strong style={{ color: theme.colors.text }}>Files:</strong>{' '}
              {currentRepo.metrics?.fileCount?.toLocaleString()}
              <br />
              <strong style={{ color: theme.colors.text }}>Language:</strong>{' '}
              {currentRepo.github?.primaryLanguage}
              {selectedExample === 'monorepo' && (
                <>
                  <br />
                  <br />
                  <strong style={{ color: theme.colors.text }}>Packages:</strong>
                  <br />
                  {packagesLoading && (
                    <span style={{ fontStyle: 'italic' }}>Loading packages...</span>
                  )}
                  {packagesError && (
                    <span style={{ color: theme.colors.error }}>Error: {packagesError}</span>
                  )}
                  {!packagesLoading && !packagesError && currentPackages && currentPackages.map((pkg, idx) => (
                    <span key={pkg.name}>
                      • {pkg.name}
                      {idx < currentPackages.length - 1 && <br />}
                    </span>
                  ))}
                  {!packagesLoading && !packagesError && (!currentPackages || currentPackages.length === 0) && (
                    <span style={{ fontStyle: 'italic' }}>No packages found</span>
                  )}
                </>
              )}
            </p>
          </div>

          <p
            style={{
              fontSize: `${theme.fontSizes[0]}px`,
              color: theme.colors.textMuted,
              marginTop: '16px',
              fontFamily: theme.fonts.body,
              textAlign: 'center',
            }}
          >
            From{' '}
            <code style={{ fontFamily: theme.fonts.monospace }}>
              @industry-theme/repository-composition-panels
            </code>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function CardExplanationPage() {
  return (
    <HomePageProvider
      workspace={{ name: 'web-ade', path: '/workspace' }}
      repository={{ name: 'cards', path: '/cards' }}
    >
      <CardExplanationContent />
    </HomePageProvider>
  );
}
