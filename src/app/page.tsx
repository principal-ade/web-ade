'use client';

import { EditorHeader } from "@/components/EditorHeader";
import { GlobalCommandPalette } from "@/components/GlobalCommandPalette";
import { WelcomePanel, type CuratedCollection } from "@/components/WelcomePanel";
import { useTheme } from "@principal-ade/industry-theme";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useMemo } from "react";
import type { CommandPaletteData } from "@/components/GlobalCommandPalette";

// LocalStorage keys for recent items
const RECENT_REPOS_KEY = 'recent-repos';
const RECENT_OWNERS_KEY = 'recent-owners';

// RecentOwner format used by [owner]/page.tsx when storing to localStorage
interface RecentOwner {
  owner: string;
  visitedAt: string;
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

interface RepositoryInfo {
  repositoryId: string;
  sourceRepository?: {
    owner: string;
    name: string;
  };
}

interface CollectionsResponse {
  collections: Array<{
    id: string;
    name: string;
    description: string;
    icon?: string;
    theme?: string;
  }>;
  memberships: Record<string, RepositoryInfo[]>;
}

function HomePageContent() {
  const { theme } = useTheme();
  const router = useRouter();
  const [collections, setCollections] = useState<CuratedCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [recentRepos, setRecentRepos] = useState<string[]>([]);
  const [recentOwners, setRecentOwners] = useState<string[]>([]);

  // Load recent items from localStorage on mount
  useEffect(() => {
    setRecentRepos(getRecentItems(RECENT_REPOS_KEY));
    setRecentOwners(getRecentItems(RECENT_OWNERS_KEY));
  }, []);

  // Fetch curated collections
  useEffect(() => {
    fetch('/api/collections')
      .then(res => res.json())
      .then((data: CollectionsResponse) => {
        const collectionsWithRepos = data.collections.map(c => ({
          ...c,
          repositories: data.memberships[c.id] || [],
        }));
        setCollections(collectionsWithRepos);
      })
      .catch(err => console.error('Failed to fetch collections:', err))
      .finally(() => setLoading(false));
  }, []);

  // Build autocomplete data for command palette
  const autocompleteData: CommandPaletteData = useMemo(() => {
    // Extract unique repositories from all collections
    const allRepos = new Set<string>();
    const allOwners = new Set<string>();

    collections.forEach(collection => {
      collection.repositories?.forEach(repo => {
        if (repo.repositoryId) {
          allRepos.add(repo.repositoryId);
          const owner = repo.repositoryId.split('/')[0];
          if (owner) allOwners.add(owner);
        }
      });
    });

    // Merge with recent items (recent first)
    const repositories = [...new Set([...recentRepos, ...allRepos])];
    const owners = [...new Set([...recentOwners, ...allOwners])];

    return {
      collections: collections.map(c => ({ id: c.id, name: c.name })),
      repositories,
      owners,
    };
  }, [collections, recentRepos, recentOwners]);

  const handleCollectionClick = useCallback((collectionId: string) => {
    router.push(`/collections/${collectionId}`);
  }, [router]);

  const handleRepositoryClick = useCallback((collectionId: string, repositoryId: string) => {
    router.push(`/collections/${collectionId}?project=${encodeURIComponent(repositoryId)}`);
  }, [router]);

  return (
    <div
      className="h-screen w-screen overflow-hidden flex flex-col"
      style={{ background: theme.colors.background }}
    >
      <EditorHeader />
      <div
        style={{
          flex: 1,
          minHeight: 0,
          height: '100%',
          overflowY: 'auto',
          backgroundColor: theme.colors.background,
        }}
      >
        <WelcomePanel
          curatedCollections={collections}
          onCollectionClick={handleCollectionClick}
          onRepositoryClick={handleRepositoryClick}
          loading={loading}
        />
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
      />
    </div>
  );
}

export default function HomePage() {
  return <HomePageContent />;
}
