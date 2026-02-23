'use client';

import { EditorHeader } from "@/components/EditorHeader";
import { GlobalCommandPalette } from "@/components/GlobalCommandPalette";
import { WelcomePanel } from "@/components/WelcomePanel";
import { useTheme } from "@principal-ade/industry-theme";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { CommandPaletteData } from "@/components/GlobalCommandPalette";
import { HomePageProvider, useHomePageProvider } from "@/contexts/HomePageProvider";
import { Clock, Search } from 'lucide-react';
import {
  ResponsiveConfigurablePanelLayout,
  PanelLayout,
} from '@principal-ade/panel-layouts';
import '@principal-ade/panel-layouts/styles.css';
import dynamicImport from 'next/dynamic';
import { useRouter } from 'next/navigation';

// Disable static generation to prevent SSR errors with client-side dependencies
export const dynamic = 'force-dynamic';

// Dynamic import for RecentRepositoriesPanel
const RecentRepositoriesPanelLoader = dynamicImport(
  () => import('@industry-theme/github-panels').then((mod) => mod.RecentRepositoriesPanel),
  { ssr: false }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
) as React.ComponentType<any>;

// LocalStorage keys - same as RecentRepositoriesPanel from @industry-theme/github-panels
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

function HomePageContent() {
  const { theme } = useTheme();
  const { context, actions, events } = useHomePageProvider();
  const router = useRouter();
  const [recentRepos, setRecentRepos] = useState<string[]>([]);
  const [recentOwners, setRecentOwners] = useState<string[]>([]);
  const openWithMicRef = useRef<(() => void) | null>(null);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Set mounted to prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  // Load recent items from localStorage on mount and listen for updates
  useEffect(() => {
    const loadRecent = () => {
      setRecentRepos(getRecentRepos());
      setRecentOwners(getRecentOwners());
    };

    loadRecent();

    // Listen for updates from RecentRepositoriesPanel
    window.addEventListener('recent-items-updated', loadRecent);
    return () => window.removeEventListener('recent-items-updated', loadRecent);
  }, []);


  const handleOpenWithMic = useCallback(() => {
    openWithMicRef.current?.();
  }, []);

  // Listen for repository selection events from panels (single-click navigation)
  useEffect(() => {
    if (!events) return;

    const unsubscribe = events.on('repository:selected', (event) => {
      const payload = event.payload as { repository?: { full_name?: string } };
      if (payload?.repository?.full_name) {
        router.push(`/${payload.repository.full_name}`);
      }
    });

    return () => unsubscribe();
  }, [events, router]);

  // Build autocomplete data for command palette
  const autocompleteData: CommandPaletteData = useMemo(() => {
    return {
      collections: [],
      repositories: recentRepos,
      owners: recentOwners,
    };
  }, [recentRepos, recentOwners]);

  // Define panels for the layout
  const panels = useMemo(() => [
    {
      id: 'recent',
      label: 'Recent',
      icon: <Clock size={16} />,
      content: (
        <div className="h-full w-full overflow-hidden">
          <RecentRepositoriesPanelLoader
            context={context}
            actions={actions}
            events={events}
            onNavigate={(path: string) => router.push(path)}
          />
        </div>
      ),
    },
    {
      id: 'welcome',
      label: 'Search',
      icon: <Search size={16} />,
      content: (
        <div className="h-full w-full overflow-hidden">
          <WelcomePanel />
        </div>
      ),
    },
    {
      id: 'empty-right',
      label: '',
      content: <div />,
    },
  ], [theme, context, actions, events, router]);

  // Define layout with recent panel on left, welcome panel in the middle
  const layout = useMemo<PanelLayout>(() => ({
    left: 'recent',
    middle: 'welcome',
    right: 'empty-right',
  }), []);

  return (
    <div
      className="h-viewport-fixed overflow-hidden flex flex-col"
      style={{
        background: theme.colors.background
      }}
    >
      <EditorHeader
        onOpenWithMic={speechSupported ? handleOpenWithMic : undefined}
      />

      {/* Panel Layout */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', minHeight: 0 }}>
        <div className="absolute inset-0">
        {mounted ? (
          <ResponsiveConfigurablePanelLayout
            theme={theme}
            panels={panels}
            layout={layout}
            defaultSizes={{
              left: 25,
              middle: 75,
              right: 0,
            }}
            minSizes={{
              left: 20,
              middle: 40,
              right: 0,
            }}
            collapsiblePanels={{
              left: true,
              right: false,
            }}
            collapsed={{
              left: recentRepos.length === 0,
              right: true,
            }}
            showCollapseButtons={true}
            mobileBreakpoint="(max-width: 768px)"
          />
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: theme.colors.textMuted,
            }}
          >
            Loading...
          </div>
        )}
        </div>
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

export default function HomePage() {
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
      <HomePageContent />
    </HomePageProvider>
  );
}
