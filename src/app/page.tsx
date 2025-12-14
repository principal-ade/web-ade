'use client';

import { EditorHeader } from "@/components/EditorHeader";
import { WelcomePanel, type CuratedCollection } from "@/components/WelcomePanel";
import { useTheme } from "@principal-ade/industry-theme";
import { useRouter } from "next/navigation";
import { useCallback, useState, useEffect } from "react";


interface CollectionsResponse {
  collections: Array<{
    id: string;
    name: string;
    description: string;
    icon?: string;
    theme?: string;
  }>;
  memberships: Record<string, string[]>;
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
        const collectionsWithCount = data.collections.map(c => ({
          ...c,
          repositoryCount: data.memberships[c.id]?.length || 0,
        }));
        setCollections(collectionsWithCount);
      })
      .catch(err => console.error('Failed to fetch collections:', err))
      .finally(() => setLoading(false));
  }, []);

  const handleNavigate = useCallback((owner: string, repo: string) => {
    router.push(`/${owner}/${repo}`);
  }, [router]);

  const handleCollectionClick = useCallback((collectionId: string) => {
    router.push(`/collections/${collectionId}`);
  }, [router]);

  return (
    <div
      className="h-screen w-screen overflow-hidden flex flex-col"
      style={{ background: theme.colors.background }}
    >
      <EditorHeader />
      <div style={{ flex: 1, minHeight: 0, height: '100%' }}>
        <WelcomePanel
          onNavigate={handleNavigate}
          curatedCollections={collections}
          onCollectionClick={handleCollectionClick}
          loading={loading}
        />
      </div>
    </div>
  );
}

export default function HomePage() {
  return <HomePageContent />;
}
