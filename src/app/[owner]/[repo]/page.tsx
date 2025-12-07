'use client';

import { EditorLayout } from "@/components/EditorLayout";
import { useParams } from "next/navigation";
import { useTheme } from "@principal-ade/industry-theme";
import { useMemo, useEffect } from "react";

const RECENT_REPOSITORIES_KEY = 'recent-repositories';
const MAX_RECENT_ITEMS = 10;

interface RecentRepository {
  owner: string;
  repo: string;
  visitedAt: string;
}

function saveRecentRepository(owner: string, repo: string) {
  if (typeof window === 'undefined') return;

  try {
    const stored = localStorage.getItem(RECENT_REPOSITORIES_KEY);
    const repositories: RecentRepository[] = stored ? JSON.parse(stored) : [];

    // Remove existing entry for this repo if present
    const filtered = repositories.filter(r => !(r.owner === owner && r.repo === repo));

    // Add to front with current timestamp
    filtered.unshift({
      owner,
      repo,
      visitedAt: new Date().toISOString(),
    });

    // Keep only the most recent items
    const trimmed = filtered.slice(0, MAX_RECENT_ITEMS);

    localStorage.setItem(RECENT_REPOSITORIES_KEY, JSON.stringify(trimmed));
  } catch (err) {
    console.error('Failed to save recent repository:', err);
  }
}

export default function RepoPage() {
  const params = useParams();
  const owner = params.owner as string;
  const repo = params.repo as string;
  // Memoize githubRepo to prevent unnecessary re-renders of PanelProvider
  const githubRepo = useMemo(() => `${owner}/${repo}`, [owner, repo]);
  const { theme } = useTheme();

  // Save repository to recent history
  useEffect(() => {
    saveRecentRepository(owner, repo);
  }, [owner, repo]);

  return (
    <div
      className="h-screen w-screen overflow-hidden"
      style={{ background: theme.colors.background }}
    >
      <EditorLayout githubRepo={githubRepo} />
    </div>
  );
}
