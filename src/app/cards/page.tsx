'use client';

import React, { useState } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { EditorHeader } from '@/components/EditorHeader';
import { HomePageProvider } from '@/contexts/HomePageProvider';
import nextDynamic from 'next/dynamic';
import type { AlexandriaEntryWithMetrics } from '@industry-theme/repository-composition-panels';

export const dynamic = 'force-dynamic';

// Dynamic import to avoid SSR issues with PixiJS
const RepoCardStatic = nextDynamic(
  () =>
    import('@industry-theme/repository-composition-panels').then(
      (mod) => mod.RepoCardStatic
    ),
  { ssr: false }
);

// Sample data for the card
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
    lastEditedAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
    createdAt: '2013-05-24T00:00:00Z',
  },
};

interface ComponentInfo {
  name: string;
  field: string;
  description: string;
  visual?: string; // Where it appears visually on the card
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

function CardExplanationContent() {
  const { theme } = useTheme();
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>('GitHub Repository API');

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
            justifyContent: 'center',
            backgroundColor: theme.colors.surface,
          }}
        >
          <p
            style={{
              fontSize: `${theme.fontSizes[1]}px`,
              color: theme.colors.textMuted,
              marginBottom: '24px',
              fontFamily: theme.fonts.body,
            }}
          >
            RepoCardStatic Preview
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
              repository={SAMPLE_REPO}
              cardTheme="dark"
              width={320}
              height={450}
              spriteSize={280}
            />
          </div>

          <div
            style={{
              marginTop: '24px',
              padding: '16px',
              borderRadius: '8px',
              backgroundColor: theme.colors.background,
              border: `1px solid ${theme.colors.border}`,
              maxWidth: '320px',
            }}
          >
            <p
              style={{
                fontSize: `${theme.fontSizes[0]}px`,
                color: theme.colors.textMuted,
                margin: 0,
                fontFamily: theme.fonts.body,
                lineHeight: 1.5,
              }}
            >
              <strong style={{ color: theme.colors.text }}>Sample:</strong> facebook/react
              <br />
              <strong style={{ color: theme.colors.text }}>Stars:</strong>{' '}
              {SAMPLE_REPO.github?.stars?.toLocaleString()}
              <br />
              <strong style={{ color: theme.colors.text }}>Files:</strong>{' '}
              {SAMPLE_REPO.metrics?.fileCount?.toLocaleString()}
              <br />
              <strong style={{ color: theme.colors.text }}>Language:</strong>{' '}
              {SAMPLE_REPO.github?.primaryLanguage}
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
