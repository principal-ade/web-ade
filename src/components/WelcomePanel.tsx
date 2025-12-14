import React, { useState, useCallback } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import {
  BookOpen,
  Network,
  ArrowRight,
  Github,
  Sparkles,
  FolderOpen,
  Wrench,
  Atom,
  Cog,
  Cpu,
  Zap,
  Code,
  Layers,
  Box,
  type LucideIcon,
} from 'lucide-react';

// Map icon names to components
const iconMap: Record<string, LucideIcon> = {
  Sparkles,
  Wrench,
  Atom,
  Cog,
  Cpu,
  Zap,
  Code,
  Layers,
  Box,
  FolderOpen,
  BookOpen,
  Network,
};

/**
 * Highlighted project for the quick start section (reserved for future use)
 */
export interface HighlightedProject {
  owner: string;
  repo: string;
  label?: string;
}

/**
 * Curated collection of repositories
 */
export interface CuratedCollection {
  id: string;
  name: string;
  description: string;
  icon?: string;
  theme?: string;
  repositoryCount?: number;
}

/**
 * Props for the WelcomePanel
 */
export interface WelcomePanelProps {
  onNavigate?: (owner: string, repo: string) => void;
  curatedCollections?: CuratedCollection[];
  onCollectionClick?: (collectionId: string) => void;
  highlightedProjects?: HighlightedProject[];
  loading?: boolean;
}

/**
 * Parse a GitHub URL or owner/repo string
 */
function parseGitHubInput(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim();

  // Try full URL: https://github.com/owner/repo
  const urlMatch = trimmed.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (urlMatch && urlMatch[1] && urlMatch[2]) {
    return { owner: urlMatch[1], repo: urlMatch[2].replace(/\.git$/, '') };
  }

  // Try owner/repo format
  const shortMatch = trimmed.match(/^([^/]+)\/([^/]+)$/);
  if (shortMatch && shortMatch[1] && shortMatch[2]) {
    return { owner: shortMatch[1], repo: shortMatch[2] };
  }

  return null;
}

/**
 * Skeleton card component for loading state
 */
const SkeletonCard: React.FC<{
  theme: ReturnType<typeof useTheme>['theme'];
}> = ({ theme }) => {
  return (
    <div
      style={{
        padding: '24px',
        borderRadius: '12px',
        backgroundColor: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
        width: '280px',
      }}
    >
      {/* Icon skeleton */}
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: '10px',
          backgroundColor: theme.colors.border,
          animation: 'pulse 1.5s ease-in-out infinite',
        }}
      />
      {/* Text content skeleton */}
      <div>
        {/* Title */}
        <div
          style={{
            width: 168,
            height: 18,
            borderRadius: '4px',
            backgroundColor: theme.colors.border,
            animation: 'pulse 1.5s ease-in-out infinite',
            marginBottom: '8px',
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        />
        {/* Description lines */}
        <div
          style={{
            width: 210,
            height: 14,
            borderRadius: '4px',
            backgroundColor: theme.colors.border,
            animation: 'pulse 1.5s ease-in-out infinite',
            marginBottom: '6px',
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        />
        <div
          style={{
            width: 160,
            height: 14,
            borderRadius: '4px',
            backgroundColor: theme.colors.border,
            animation: 'pulse 1.5s ease-in-out infinite',
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        />
      </div>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
};

/**
 * Collection card component
 */
const CollectionCard: React.FC<{
  collection: CuratedCollection;
  theme: ReturnType<typeof useTheme>['theme'];
  onClick: () => void;
}> = ({ collection, theme, onClick }) => {
  // Get the icon component from the map, fallback to FolderOpen
  const IconComponent = (collection.icon && iconMap[collection.icon]) || FolderOpen;

  return (
    <button
      onClick={onClick}
      style={{
        padding: '24px',
        borderRadius: '12px',
        backgroundColor: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        width: '280px',
        textAlign: 'center',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = theme.colors.primary;
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = theme.colors.border;
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {/* Collection Icon */}
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: '10px',
          backgroundColor: `${theme.colors.primary}15`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: theme.colors.primary,
        }}
      >
        <IconComponent size={24} />
      </div>
      <div>
        <div
          style={{
            fontSize: `${theme.fontSizes[2]}px`,
            fontWeight: theme.fontWeights.semibold,
            color: theme.colors.text,
            marginBottom: '8px',
          }}
        >
          {collection.name}
        </div>
        <div
          style={{
            fontSize: `${theme.fontSizes[1]}px`,
            color: theme.colors.textSecondary,
            lineHeight: 1.5,
          }}
        >
          {collection.description}
        </div>
      </div>
    </button>
  );
};

/**
 * WelcomePanel - A landing panel with branding and repo search
 *
 * Features:
 * - Brand introduction with tagline
 * - Search input for owner/repo or GitHub URLs
 * - Feature highlights (documentation, diagrams, chat)
 * - Configurable quick start links to repos
 */
export const WelcomePanel: React.FC<WelcomePanelProps> = ({
  onNavigate,
  curatedCollections = [],
  onCollectionClick,
  loading = false,
}) => {
  const { theme } = useTheme();
  const [repoInput, setRepoInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsed = parseGitHubInput(repoInput);
    if (!parsed) {
      setError('Enter a valid format: owner/repo or GitHub URL');
      return;
    }

    if (onNavigate) {
      onNavigate(parsed.owner, parsed.repo);
    } else {
      // Default: navigate via window.location
      window.location.href = `/${parsed.owner}/${parsed.repo}`;
    }
  }, [repoInput, onNavigate]);

  const handleCollectionClick = useCallback((collection: CuratedCollection) => {
    if (onCollectionClick) {
      onCollectionClick(collection.id);
    }
  }, [onCollectionClick]);

  return (
    <div
      style={{
        height: '100%',
        minHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: theme.colors.background,
        color: theme.colors.text,
        fontFamily: theme.fonts.body,
        overflowY: 'auto',
      }}
    >
      {/* Curated Collections Section */}
      {(loading || curatedCollections.length > 0) && (
        <div
          style={{
            padding: '48px 32px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '24px',
            borderBottom: `1px solid ${theme.colors.border}`,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: `${theme.fontSizes[6] || 32}px`,
              fontWeight: theme.fontWeights.semibold,
              color: theme.colors.textSecondary,
              textAlign: 'center',
            }}
          >
            Explore Curated Collections
          </h2>
          <div
            style={{
              display: 'flex',
              gap: '16px',
              flexWrap: 'wrap',
              justifyContent: 'center',
              maxWidth: '1200px',
            }}
          >
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonCard key={i} theme={theme} />
                ))
              : curatedCollections.map((collection) => (
                  <CollectionCard
                    key={collection.id}
                    collection={collection}
                    theme={theme}
                    onClick={() => handleCollectionClick(collection)}
                  />
                ))}
          </div>
        </div>
      )}

      {/* Hero Section */}
      <div
        style={{
          padding: '48px 32px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        {/* Tagline */}
        <h1
          style={{
            margin: '0 0 32px',
            fontSize: `${theme.fontSizes[3]}px`,
            fontWeight: theme.fontWeights.bold,
            color: theme.colors.text,
          }}
        >
          Try your Projects
        </h1>

        {/* Search Input */}
        <form
          onSubmit={handleSubmit}
          style={{
            width: '100%',
            maxWidth: '500px',
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: '8px',
              padding: '6px',
              borderRadius: '12px',
              backgroundColor: theme.colors.surface,
              border: `2px solid ${error ? theme.colors.error : theme.colors.border}`,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                paddingLeft: '12px',
                color: theme.colors.textSecondary,
              }}
            >
              <Github size={20} />
            </div>
            <input
              type="text"
              value={repoInput}
              onChange={(e) => {
                setRepoInput(e.target.value);
                setError(null);
              }}
              placeholder="owner/repo or paste GitHub URL"
              style={{
                flex: 1,
                padding: '12px 8px',
                border: 'none',
                background: 'transparent',
                color: theme.colors.text,
                fontSize: `${theme.fontSizes[2]}px`,
                outline: 'none',
              }}
            />
            <button
              type="submit"
              style={{
                padding: '12px 20px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: theme.colors.primary,
                color: '#fff',
                fontSize: `${theme.fontSizes[2]}px`,
                fontWeight: theme.fontWeights.semibold,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              Explore
              <ArrowRight size={18} />
            </button>
          </div>
          {error && (
            <p
              style={{
                margin: '8px 0 0',
                fontSize: `${theme.fontSizes[1]}px`,
                color: theme.colors.error,
              }}
            >
              {error}
            </p>
          )}
        </form>
      </div>
    </div>
  );
};
