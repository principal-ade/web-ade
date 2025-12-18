'use client';

import { EditorHeader } from "@/components/EditorHeader";
import { WelcomePanel, type CuratedCollection } from "@/components/WelcomePanel";
import { useTheme } from "@principal-ade/industry-theme";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";


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
    </div>
  );
}

export default function HomePage() {
  return <HomePageContent />;
}
