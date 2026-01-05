'use client';

import { EditorLayout } from "@/components/EditorLayout";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useTheme } from "@principal-ade/industry-theme";
import { useMemo, useEffect, useCallback, Suspense, useState } from "react";
import { useRepoPresence } from "@/hooks/useRepoPresence";
import { useLocalFileSystem } from "@/contexts/LocalFileSystemContext";
import { LocalFileSystemAdapter } from "@/lib/client/LocalFileSystemAdapter";
import { addRecentRepository } from "@industry-theme/github-panels";

const REPO_LAYOUT_CONFIGS_KEY = 'repo-layout-configs';

// Store and retrieve layout configuration for each repository
function saveRepositoryLayoutConfig(owner: string, repo: string, configId: string) {
  if (typeof window === 'undefined') return;

  try {
    const stored = localStorage.getItem(REPO_LAYOUT_CONFIGS_KEY);
    const configs: Record<string, string> = stored ? JSON.parse(stored) : {};

    configs[`${owner}/${repo}`] = configId;

    localStorage.setItem(REPO_LAYOUT_CONFIGS_KEY, JSON.stringify(configs));
  } catch (err) {
    console.error('Failed to save repository layout config:', err);
  }
}

function getRepositoryLayoutConfig(owner: string, repo: string): string | undefined {
  if (typeof window === 'undefined') return undefined;

  try {
    const stored = localStorage.getItem(REPO_LAYOUT_CONFIGS_KEY);
    if (!stored) return undefined;

    const configs: Record<string, string> = JSON.parse(stored);
    return configs[`${owner}/${repo}`];
  } catch {
    return undefined;
  }
}

// Save repository with full GitHub metadata
async function saveRecentRepositoryWithMetadata(owner: string, repo: string, configId?: string) {
  if (typeof window === 'undefined') return;

  try {
    // Fetch full repository metadata from GitHub API
    const response = await fetch(`/api/github/repo/${owner}/${repo}?action=info`);

    if (response.ok) {
      const repoData = await response.json();

      // Save to recent repositories panel
      addRecentRepository(repoData);
    }

    // Save layout config separately
    if (configId) {
      saveRepositoryLayoutConfig(owner, repo, configId);
    }
  } catch (err) {
    console.error('Failed to save recent repository with metadata:', err);
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
    return getRepositoryLayoutConfig(owner, repo) || 'documentation';
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

    // Save to recent repositories with full metadata
    saveRecentRepositoryWithMetadata(owner, repo, configId);
  }, [router, owner, repo]);

  // Save repository to recent history on initial load
  useEffect(() => {
    saveRecentRepositoryWithMetadata(owner, repo, initialConfigId);
  }, [owner, repo, initialConfigId]);

  // Set browser tab title to repo name
  useEffect(() => {
    document.title = `${owner}/${repo}`;
  }, [owner, repo]);

  // Don't render until we've checked for local mode
  if (!localModeChecked) {
    return (
      <div
        className="h-screen-safe w-screen overflow-hidden"
        style={{ background: theme.colors.background }}
      />
    );
  }

  return (
    <div
      className="h-screen-safe w-screen overflow-hidden"
      style={{ background: theme.colors.background, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
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
    <Suspense fallback={<div className="h-screen-safe w-screen" />}>
      <RepoPageContent />
    </Suspense>
  );
}
