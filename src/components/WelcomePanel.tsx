import React, { useCallback } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { AvatarStack, type RepositoryInfo } from './collections/AvatarStack';


/**
 * Curated collection of repositories
 */
export interface CuratedCollection {
  id: string;
  name: string;
  description: string;
  icon?: string;
  theme?: string;
  repositories?: RepositoryInfo[];
}

/**
 * Props for the WelcomePanel
 */
export interface WelcomePanelProps {
  curatedCollections?: CuratedCollection[];
  onCollectionClick?: (collectionId: string) => void;
  loading?: boolean;
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
      {/* Avatar Stack */}
      <AvatarStack repositories={collection.repositories || []} size={36} maxAvatars={4} />
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
 * WelcomePanel - Displays curated collections
 */
export const WelcomePanel: React.FC<WelcomePanelProps> = ({
  curatedCollections = [],
  onCollectionClick,
  loading = false,
}) => {
  const { theme } = useTheme();

  const handleCollectionClick = useCallback((collection: CuratedCollection) => {
    if (onCollectionClick) {
      onCollectionClick(collection.id);
    }
  }, [onCollectionClick]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: theme.colors.background,
        color: theme.colors.text,
        fontFamily: theme.fonts.body,
      }}
    >
      {/* Curated Collections Section */}
      {(loading || curatedCollections.length > 0) && (
        <div
          style={{
            padding: '24px 32px 48px 32px',
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
            Curated Collections
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
    </div>
  );
};
