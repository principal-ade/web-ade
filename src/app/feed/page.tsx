'use client';

import { EditorHeader } from "@/components/EditorHeader";
import { GlobalCommandPalette } from "@/components/GlobalCommandPalette";
import { ActivityFeedPanel } from "@/panels/ActivityFeedPanel";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { useTheme } from "@principal-ade/industry-theme";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { CommandPaletteData } from "@/components/GlobalCommandPalette";
import { HomePageProvider } from "@/contexts/HomePageProvider";

// Disable static generation to prevent SSR errors with client-side dependencies
export const dynamic = 'force-dynamic';

// LocalStorage keys
const RECENT_REPOS_KEY = 'recent-repositories';
const RECENT_OWNERS_KEY = 'recent-owners';

function getRecentRepos(max: number = 10): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(RECENT_REPOS_KEY);
    if (!stored) return [];

    const parsed: unknown[] = JSON.parse(stored);
    return parsed
      .filter((item): item is { full_name: string } =>
        item != null && typeof item === 'object' && 'full_name' in item && typeof (item as { full_name: unknown }).full_name === 'string'
      )
      .slice(0, max)
      .map(item => item.full_name);
  } catch {
    return [];
  }
}

function getRecentOwners(max: number = 10): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(RECENT_OWNERS_KEY);
    if (!stored) return [];

    const parsed: unknown[] = JSON.parse(stored);
    return parsed
      .filter((item): item is { login: string } =>
        item != null && typeof item === 'object' && 'login' in item && typeof (item as { login: unknown }).login === 'string'
      )
      .slice(0, max)
      .map(item => item.login);
  } catch {
    return [];
  }
}

function GitActivityFeedPageContent() {
  const { theme } = useTheme();
  const openWithMicRef = useRef<(() => void) | null>(null);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [recentRepos, setRecentRepos] = useState<string[]>([]);
  const [recentOwners, setRecentOwners] = useState<string[]>([]);

  // Load recent items from localStorage on mount and listen for updates
  useEffect(() => {
    const loadRecent = () => {
      setRecentRepos(getRecentRepos());
      setRecentOwners(getRecentOwners());
    };

    loadRecent();

    window.addEventListener('recent-items-updated', loadRecent);
    return () => window.removeEventListener('recent-items-updated', loadRecent);
  }, []);

  const handleOpenWithMic = useCallback(() => {
    openWithMicRef.current?.();
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
      className="h-viewport-fixed overflow-hidden flex flex-col"
      style={{
        background: theme.colors.background
      }}
    >
      <LoadingOverlay />

      <EditorHeader
        onOpenWithMic={speechSupported ? handleOpenWithMic : undefined}
      />

      {/* Main Content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <ActivityFeedPanel />
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
        onOpenWithMicReady={(fn) => {
          openWithMicRef.current = fn;
          setSpeechSupported(fn !== null);
        }}
      />
    </div>
  );
}

export default function GitActivityFeedPage() {
  return (
    <HomePageProvider
      workspace={{
        name: 'web-ade',
        path: '/workspace',
      }}
      repository={{
        name: 'home',
        path: '/home',
      }}
    >
      <GitActivityFeedPageContent />
    </HomePageProvider>
  );
}
