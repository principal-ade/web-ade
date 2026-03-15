'use client';

/**
 * Card Render Page
 *
 * This page renders a repo card at Twitter card dimensions (1200x628).
 * It's designed to be screenshotted by Playwright/Puppeteer for OG image generation.
 *
 * The page is minimal - just the card on a dark background with no chrome.
 */

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { AlexandriaEntryWithMetrics } from '@industry-theme/repository-composition-panels';

// Dynamic import to avoid SSR issues
const RepoCardStatic = dynamic(
  () =>
    import('@industry-theme/repository-composition-panels').then(
      (mod) => mod.RepoCardStatic
    ),
  { ssr: false }
);

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  owner: {
    login: string;
    avatar_url: string;
  };
  stargazers_count: number;
  language: string | null;
  license?: {
    spdx_id: string;
  } | null;
  topics?: string[];
  created_at?: string;
}

function toAlexandriaEntry(repo: GitHubRepo, fileCount?: number): AlexandriaEntryWithMetrics {
  return {
    name: repo.name,
    path: `/${repo.owner.login}/${repo.name}` as AlexandriaEntryWithMetrics['path'],
    registeredAt: new Date().toISOString(),
    hasViews: false,
    viewCount: 0,
    views: [],
    github: {
      id: repo.full_name,
      owner: repo.owner.login,
      name: repo.name,
      description: repo.description || undefined,
      stars: repo.stargazers_count,
      license: repo.license?.spdx_id,
      primaryLanguage: repo.language || undefined,
      topics: repo.topics,
      createdAt: repo.created_at,
      lastUpdated: new Date().toISOString(),
    },
    metrics: {
      fileCount: fileCount || 0,
      lineCount: 0,
      commitCount: 0,
      contributors: 0,
      lastEditedAt: new Date().toISOString(),
      createdAt: repo.created_at,
    },
  };
}

export default function CardRenderPage() {
  const params = useParams();
  const owner = params.owner as string;
  const repo = params.repo as string;

  const [repoData, setRepoData] = useState<AlexandriaEntryWithMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileCityLoaded, setFileCityLoaded] = useState(false);
  const [ready, setReady] = useState(false);

  // File City image URL (nocache=1 to always get fresh image)
  const fileCityUrl = `/api/file-city/${owner}/${repo}?width=400&height=300&nocache=1`;

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch repo info from GitHub API
        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
        if (!response.ok) {
          throw new Error(`GitHub API error: ${response.status}`);
        }
        const data: GitHubRepo = await response.json();

        // Fetch file count from tree
        let fileCount = 0;
        try {
          const treeResponse = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`
          );
          if (treeResponse.ok) {
            const treeData = await treeResponse.json();
            fileCount = treeData.tree?.filter((item: { type: string }) => item.type === 'blob').length || 0;
          }
        } catch {
          // Ignore tree fetch errors
        }

        setRepoData(toAlexandriaEntry(data, fileCount));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch repo');
      }
    }

    fetchData();
  }, [owner, repo]);

  // Preload File City image
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setFileCityLoaded(true);
    };
    img.onerror = () => {
      // Still mark as loaded so we don't block forever
      console.warn('File City image failed to load');
      setFileCityLoaded(true);
    };
    img.src = fileCityUrl;
  }, [fileCityUrl]);

  // Set ready when both repo data and image are loaded
  useEffect(() => {
    if (repoData && fileCityLoaded) {
      // Small additional delay for rendering
      setTimeout(() => setReady(true), 200);
    }
  }, [repoData, fileCityLoaded]);

  // Twitter card dimensions
  const WIDTH = 1200;
  const HEIGHT = 628;

  // Card dimensions (maintain aspect ratio similar to existing cards)
  const CARD_HEIGHT = HEIGHT - 40; // 588px
  const CARD_WIDTH = Math.round(CARD_HEIGHT * 0.6); // ~353px (keeping 3:5 ratio)

  if (error) {
    return (
      <div
        style={{
          width: WIDTH,
          height: HEIGHT,
          backgroundColor: '#0a0a0f',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ff4444',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        Error: {error}
      </div>
    );
  }

  return (
    <div
      id="card-render-container"
      data-ready={ready}
      style={{
        width: WIDTH,
        height: HEIGHT,
        backgroundColor: '#0a0a0f',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {repoData ? (
        <RepoCardStatic
          repository={repoData}
          cardTheme="dark"
          width={CARD_WIDTH}
          height={CARD_HEIGHT}
          spriteSize={280}
          customImage={fileCityUrl}
        />
      ) : (
        <div
          style={{
            width: CARD_WIDTH,
            height: CARD_HEIGHT,
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #1a1a2e 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#666',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          Loading...
        </div>
      )}
    </div>
  );
}
