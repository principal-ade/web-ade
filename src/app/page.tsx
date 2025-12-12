'use client';

import dynamic from 'next/dynamic';
import { EditorHeader } from "@/components/EditorHeader";
import { useTheme } from "@principal-ade/industry-theme";
import { useRouter } from "next/navigation";
import { useCallback, useState, useEffect } from "react";
import type { CuratedCollection } from '@industry-theme/github-panels';

// Dynamically import WelcomePanel to avoid SSR issues
const WelcomePanel = dynamic(
  () => import('@industry-theme/github-panels').then(mod => mod.WelcomePanel),
  { ssr: false }
);

// Stub props for the panel
const stubEvents = {
  emit: () => {},
  on: () => () => {},
  off: () => {},
};

const stubActions = {
  openFile: () => {},
  closeFile: () => {},
  saveFile: () => Promise.resolve(),
  runCommand: () => Promise.resolve(),
};


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
      .catch(err => console.error('Failed to fetch collections:', err));
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
      <div className="flex-1 overflow-hidden">
        <WelcomePanel
          events={stubEvents}
          actions={stubActions}
          context={{} as never}
          onNavigate={handleNavigate}
          highlightedProjects={[]}
          curatedCollections={collections}
          onCollectionClick={handleCollectionClick}
        />
      </div>
    </div>
  );
}

export default function HomePage() {
  return <HomePageContent />;
}
