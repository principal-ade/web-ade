'use client';

import { EditorHeader } from "@/components/EditorHeader";
import { GlobalCommandPalette } from "@/components/GlobalCommandPalette";
import { WelcomePanel } from "@/components/WelcomePanel";
import { useTheme } from "@principal-ade/industry-theme";
import { useState, useEffect, useMemo } from "react";
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

function HomePageContent() {
  const { theme } = useTheme();
  const [recentRepos, setRecentRepos] = useState<string[]>([]);
  const [recentOwners, setRecentOwners] = useState<string[]>([]);

  // Load recent items from localStorage on mount
  useEffect(() => {
    setRecentRepos(getRecentItems(RECENT_REPOS_KEY));
    setRecentOwners(getRecentItems(RECENT_OWNERS_KEY));
  }, []);

  // Build autocomplete data for command palette
  const autocompleteData: CommandPaletteData = useMemo(() => {
    return {
      collections: [],
      repositories: recentRepos,
      owners: recentOwners,
    };
  }, [recentRepos, recentOwners]);

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
        <WelcomePanel />
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
