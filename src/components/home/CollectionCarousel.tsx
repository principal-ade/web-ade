'use client';

import React, { useRef, useState } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AvatarStack, type RepositoryInfo } from '../collections/AvatarStack';

interface CuratedCollection {
  id: string;
  name: string;
  description: string;
  icon?: string;
  theme?: string;
  repositories?: RepositoryInfo[];
}

interface CollectionCarouselProps {
  collections: CuratedCollection[];
  onCollectionClick: (collectionId: string) => void;
  loading?: boolean;
}

export function CollectionCarousel({
  collections,
  onCollectionClick,
  loading = false,
}: CollectionCarouselProps) {
  const { theme } = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    setShowLeftArrow(scrollLeft > 10);
    setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10);
  };

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const scrollAmount = 320;
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          gap: '16px',
          padding: '8px 0',
        }}
      >
        {[1, 2, 3].map((i) => (
          <SkeletonCard key={i} theme={theme} />
        ))}
      </div>
    );
  }

  if (collections.length === 0) {
    return (
      <div
        style={{
          padding: '32px',
          textAlign: 'center',
          color: theme.colors.textMuted,
          fontSize: `${theme.fontSizes[1]}px`,
        }}
      >
        No collections available
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {/* Left Arrow */}
      {showLeftArrow && (
        <button
          onClick={() => scroll('left')}
          style={{
            position: 'absolute',
            left: '-20px',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            border: `1px solid ${theme.colors.border}`,
            background: theme.colors.surface,
            color: theme.colors.text,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            zIndex: 10,
            transition: 'all 0.2s ease',
          }}
        >
          <ChevronLeft size={20} />
        </button>
      )}

      {/* Right Arrow */}
      {showRightArrow && collections.length > 2 && (
        <button
          onClick={() => scroll('right')}
          style={{
            position: 'absolute',
            right: '-20px',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            border: `1px solid ${theme.colors.border}`,
            background: theme.colors.surface,
            color: theme.colors.text,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            zIndex: 10,
            transition: 'all 0.2s ease',
          }}
        >
          <ChevronRight size={20} />
        </button>
      )}

      {/* Carousel Container */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          display: 'flex',
          gap: '16px',
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          scrollBehavior: 'smooth',
          padding: '8px 4px',
          // Hide scrollbar
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
        className="hide-scrollbar"
      >
        {collections.map((collection) => (
          <CollectionCard
            key={collection.id}
            collection={collection}
            theme={theme}
            onClick={() => onCollectionClick(collection.id)}
          />
        ))}
      </div>

      {/* Hide scrollbar CSS */}
      <style>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
}

const CollectionCard: React.FC<{
  collection: CuratedCollection;
  theme: ReturnType<typeof useTheme>['theme'];
  onClick: () => void;
}> = ({ collection, theme, onClick }) => {
  return (
    <div
      style={{
        minWidth: '300px',
        maxWidth: '300px',
        padding: '20px',
        borderRadius: '12px',
        backgroundColor: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        scrollSnapAlign: 'start',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = theme.colors.primary;
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = theme.colors.border;
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
      onClick={onClick}
    >
      {/* Header row: Name and avatar stack */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div
          style={{
            fontSize: `${theme.fontSizes[2]}px`,
            fontWeight: theme.fontWeights.semibold,
            color: theme.colors.text,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
        >
          {collection.name}
        </div>
        {collection.repositories && collection.repositories.length > 0 && (
          <AvatarStack
            repositories={collection.repositories}
            maxAvatars={3}
            size={24}
          />
        )}
      </div>

      {/* Description */}
      <div
        style={{
          fontSize: `${theme.fontSizes[1]}px`,
          color: theme.colors.textMuted,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          lineHeight: 1.4,
        }}
      >
        {collection.description || 'No description'}
      </div>

      {/* Repository count */}
      <div
        style={{
          fontSize: `${theme.fontSizes[0]}px`,
          color: theme.colors.textMuted,
        }}
      >
        {collection.repositories?.length || 0} repositories
      </div>
    </div>
  );
};

const SkeletonCard: React.FC<{
  theme: ReturnType<typeof useTheme>['theme'];
}> = ({ theme }) => {
  return (
    <div
      style={{
        minWidth: '300px',
        maxWidth: '300px',
        padding: '20px',
        borderRadius: '12px',
        backgroundColor: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: '60%',
          height: 20,
          borderRadius: '4px',
          backgroundColor: theme.colors.border,
          animation: 'pulse 1.5s ease-in-out infinite',
        }}
      />
      <div
        style={{
          width: '100%',
          height: 16,
          borderRadius: '4px',
          backgroundColor: theme.colors.border,
          animation: 'pulse 1.5s ease-in-out infinite',
        }}
      />
      <div
        style={{
          width: '40%',
          height: 14,
          borderRadius: '4px',
          backgroundColor: theme.colors.border,
          animation: 'pulse 1.5s ease-in-out infinite',
        }}
      />
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
};
