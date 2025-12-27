'use client';

import { EditorLayout } from "@/components/EditorLayout";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useTheme } from "@principal-ade/industry-theme";
import { useMemo, useEffect, useCallback, Suspense, useState } from "react";
import { useRepoPresence } from "@/hooks/useRepoPresence";
import { useLocalFileSystem } from "@/contexts/LocalFileSystemContext";
import { LocalFileSystemAdapter } from "@/lib/client/LocalFileSystemAdapter";

const RECENT_REPOSITORIES_KEY = 'recent-repositories';
const MAX_RECENT_ITEMS = 10;

interface RecentRepository {
  owner: string;
  repo: string;
  visitedAt: string;
  configId?: string;
}

function saveRecentRepository(owner: string, repo: string, configId?: string) {
  if (typeof window === 'undefined') return;

  try {
    const stored = localStorage.getItem(RECENT_REPOSITORIES_KEY);
    const repositories: RecentRepository[] = stored ? JSON.parse(stored) : [];

    // Remove existing entry for this repo if present
    const filtered = repositories.filter(r => !(r.owner === owner && r.repo === repo));

    // Add to front with current timestamp and configId
    filtered.unshift({
      owner,
      repo,
      visitedAt: new Date().toISOString(),
      configId,
    });

    // Keep only the most recent items
    const trimmed = filtered.slice(0, MAX_RECENT_ITEMS);

    localStorage.setItem(RECENT_REPOSITORIES_KEY, JSON.stringify(trimmed));
  } catch (err) {
    console.error('Failed to save recent repository:', err);
  }
}

function getRecentRepositoryConfig(owner: string, repo: string): string | undefined {
  if (typeof window === 'undefined') return undefined;

  try {
    const stored = localStorage.getItem(RECENT_REPOSITORIES_KEY);
    if (!stored) return undefined;

    const repositories: RecentRepository[] = JSON.parse(stored);
    const found = repositories.find(r => r.owner === owner && r.repo === repo);
    return found?.configId;
  } catch {
    return undefined;
  }
}

function RepoPageContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const owner = params.owner as string;
  const repo = params.repo as string;
  // Memoize githubRepo to prevent unnecessary re-renders of PanelProvider
  const githubRepo = useMemo(() => `${owner}/${repo}`, [owner, repo]);
  const { theme } = useTheme();

  // Local filesystem support
  const { adapter, checkAndRestoreHandle } = useLocalFileSystem();
  const [localAdapterState, setLocalAdapterState] = useState<LocalFileSystemAdapter | null>(null);
  const [localModeChecked, setLocalModeChecked] = useState(false);

  // Check for stored local folder handle on load
  useEffect(() => {
    async function checkLocalHandle() {
      const restored = await checkAndRestoreHandle(githubRepo);
      if (restored) {
        // The adapter is now available via context
        setLocalModeChecked(true);
      } else {
        setLocalModeChecked(true);
      }
    }
    checkLocalHandle();
  }, [githubRepo, checkAndRestoreHandle]);

  // Sync adapter from context to local state
  useEffect(() => {
    setLocalAdapterState(adapter);
  }, [adapter]);

  // Get initial config from URL, then fall back to localStorage
  const initialConfigId = useMemo(() => {
    const urlConfig = searchParams.get('config');
    if (urlConfig) return urlConfig;
    return getRecentRepositoryConfig(owner, repo) || 'default';
  }, [searchParams, owner, repo]);

  // Connect to presence system for this repository
  useRepoPresence({ repoId: githubRepo });

  // Handle config change - update URL and localStorage
  const handleConfigChange = useCallback((configId: string) => {
    // Update URL with new config
    const url = new URL(window.location.href);
    if (configId === 'default') {
      url.searchParams.delete('config');
    } else {
      url.searchParams.set('config', configId);
    }
    router.replace(url.pathname + url.search, { scroll: false });

    // Save to recent repositories
    saveRecentRepository(owner, repo, configId);
  }, [router, owner, repo]);

  // Save repository to recent history on initial load
  useEffect(() => {
    saveRecentRepository(owner, repo, initialConfigId);
  }, [owner, repo, initialConfigId]);

  // Don't render until we've checked for local mode
  if (!localModeChecked) {
    return (
      <div
        className="h-screen w-screen overflow-hidden"
        style={{ background: theme.colors.background }}
      />
    );
  }

  return (
    <div
      className="h-screen w-screen overflow-hidden"
      style={{ background: theme.colors.background }}
    >
      <EditorLayout
        githubRepo={githubRepo}
        localAdapter={localAdapterState}
        initialConfigId={initialConfigId}
        onConfigChange={handleConfigChange}
      />
    </div>
  );
}

export default function RepoPage() {
  return (
    <Suspense fallback={<div className="h-screen w-screen" />}>
      <RepoPageContent />
    </Suspense>
  );
}
