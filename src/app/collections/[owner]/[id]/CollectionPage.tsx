'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Boxes, Globe, Layers, Lock, Star } from 'lucide-react';
import { useTheme } from '@principal-ade/industry-theme';
import { UserAvatarMenu } from '@/components/UserAvatarMenu';
import { AgentViewButton } from '@/components/AgentViewButton';
import { RepoSearchBar } from '@/components/RepoSearchBar';
import { RepoFileCityPane } from '@/components/home/RepoFileCityPane';
import { RepoRowShell } from '@/components/home/RepoRowShell';
import type { Collection, CollectionRepo } from '@/lib/starred-collections/types';
import type { ProjectRepo } from '@/components/home/HomeProjectsView';

export function CollectionPage({ owner, id }: { owner: string; id: string }) {
  const { theme } = useTheme();

  const [collection, setCollection] = useState<Collection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ProjectRepo | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/github/owner/${owner}/starred-collections/${id}`)
      .then((r) => {
        if (!r.ok) {
          if (r.status === 404) throw new Error('Collection not found');
          throw new Error('Failed to load collection');
        }
        return r.json();
      })
      .then((data: Collection) => {
        setCollection(data);
      })
      .catch((e) => {
        setError(e.message ?? 'Failed to load collection');
      })
      .finally(() => setLoading(false));
  }, [owner, id]);

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error || !collection) {
    return <ErrorState error={error ?? 'Collection not found'} />;
  }

  const repos = collection.repos ?? [];

  return (
    <div
      className="h-viewport-fixed flex flex-col overflow-hidden"
      style={{ background: theme.colors.background, color: theme.colors.text }}
    >
      <header
        className="border-b px-5 flex items-center gap-2 shrink-0 relative"
        style={{
          background: theme.colors.surface,
          borderColor: theme.colors.border,
          paddingTop: 'calc(var(--safe-top) + 0.875rem)',
          paddingBottom: '0.875rem',
          zIndex: 10,
        }}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Link
            href="/"
            className="transition-opacity hover:opacity-80"
            style={{
              fontFamily: theme.fonts.body,
              fontSize: theme.fontSizes[4],
              fontWeight: theme.fontWeights.bold,
              textDecoration: 'none',
            }}
          >
            <span style={{ color: theme.colors.text }}>Principal</span>{' '}
            <span style={{ color: theme.colors.primary }}>AI</span>
          </Link>

          <span
            className="mx-2"
            style={{ color: theme.colors.textMuted }}
            aria-hidden="true"
          >
            /
          </span>

          <div className="flex items-center gap-2 min-w-0">
            <Layers size={16} style={{ color: theme.colors.textSecondary, opacity: 0.7 }} />
            <span
              className="truncate"
              style={{
                fontFamily: theme.fonts.body,
                fontSize: theme.fontSizes[2],
                fontWeight: theme.fontWeights.semibold,
                color: theme.colors.text,
              }}
            >
              {collection.name}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden md:block">
            <RepoSearchBar />
          </div>
          <div className="hidden md:flex">
            <AgentViewButton path={`/collections/${owner}/${id}`} iconOnly />
          </div>
          <UserAvatarMenu />
        </div>
      </header>

      <div className="flex-1 min-h-0 flex flex-col-reverse md:flex-row">
        <aside
          className="flex flex-col shrink-0 w-full md:w-[25%] h-[45%] md:h-auto border-t md:border-t-0 md:border-r"
          style={{
            background: theme.colors.background,
            borderColor: theme.colors.border,
          }}
        >
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-none">
            {/* About section */}
            <div className="px-4 py-4 flex items-start gap-3 border-b"
              style={{ borderColor: theme.colors.border }}
            >
              <Link
                href={`/${owner}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://github.com/${owner}.png?size=80`}
                  alt=""
                  width={44}
                  height={44}
                  className="rounded-full"
                  style={{ border: `1px solid ${theme.colors.border}` }}
                />
              </Link>
              <div className="min-w-0 flex-1">
                <h2
                  style={{
                    fontSize: theme.fontSizes[3],
                    fontWeight: theme.fontWeights.bold,
                    color: theme.colors.text,
                  }}
                >
                  {collection.name}
                </h2>
                <Link
                  href={`/${owner}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: theme.fontSizes[1],
                    color: theme.colors.textSecondary,
                    textDecoration: 'none',
                  }}
                  className="hover:underline"
                >
                  @{owner}
                </Link>
                <div className="flex items-center gap-3 mt-1.5" style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[0] }}>
                  <span className="inline-flex items-center gap-1">
                    {collection.visibility === 'public' ? <Globe size={11} /> : <Lock size={11} />}
                    {collection.visibility === 'public' ? 'Public' : 'Private'}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Star size={11} />
                    {repos.length} {repos.length === 1 ? 'repo' : 'repos'}
                  </span>
                </div>
              </div>
            </div>

            {collection.description && (
              <div
                className="px-4 py-3 border-b"
                style={{
                  borderColor: theme.colors.border,
                  fontSize: theme.fontSizes[1],
                  color: theme.colors.textMuted,
                  lineHeight: 1.5,
                }}
              >
                {collection.description}
              </div>
            )}

            {/* Repo list */}
            <div>
              {repos.length === 0 ? (
                <div
                  className="px-4 py-6"
                  style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[1] }}
                >
                  This collection is empty.
                </div>
              ) : (
                repos.map((repo) => (
                  <CollectionRepoRow
                    key={`${repo.owner}/${repo.repo}`}
                    repo={repo}
                    selected={`${repo.owner}/${repo.repo}` === selected?.full_name}
                    onSelect={() => {
                      setSelected({
                        id: 0,
                        full_name: `${repo.owner}/${repo.repo}`,
                        name: repo.repo,
                        owner: {
                          login: repo.owner,
                          avatar_url: repo.avatarUrl,
                        },
                        description: repo.description ?? null,
                        stargazers_count: repo.stargazersCount,
                      });
                    }}
                  />
                ))
              )}
            </div>
          </div>
        </aside>

        <main className="flex-1 min-h-0 flex flex-col">
          {selected ? (
            <RepoFileCityPane
              owner={selected.owner.login}
              repo={selected.name}
            />
          ) : (
            <IdleRightPane />
          )}
        </main>
      </div>
    </div>
  );
}

function CollectionRepoRow({
  repo,
  selected,
  onSelect,
}: {
  repo: CollectionRepo;
  selected: boolean;
  onSelect: () => void;
}) {
  const { theme } = useTheme();
  const fullName = `${repo.owner}/${repo.repo}`;

  return (
    <RepoRowShell fullName={fullName} selected={selected} onSelect={onSelect}>
      <div className="flex items-center gap-3 min-w-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={
            repo.avatarUrl ??
            `https://github.com/${repo.owner}.png?size=72`
          }
          alt=""
          width={36}
          height={36}
          className="rounded-md shrink-0"
          style={{ background: theme.colors.backgroundSecondary }}
        />
        <div className="min-w-0 flex flex-col">
          <span
            className="truncate"
            style={{
              fontSize: theme.fontSizes[2],
              fontWeight: theme.fontWeights.semibold,
            }}
          >
            {repo.repo}
          </span>
          <span
            className="truncate"
            style={{
              fontSize: theme.fontSizes[0],
              color: theme.colors.textMuted,
            }}
          >
            {repo.owner}
          </span>
        </div>
      </div>

      {repo.description && (
        <div
          className="mt-1"
          style={{
            color: theme.colors.textMuted,
            fontSize: theme.fontSizes[0],
            display: '-webkit-box',
            WebkitLineClamp: 1,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {repo.description}
        </div>
      )}

      {repo.stargazersCount != null && repo.stargazersCount > 0 && (
        <div
          className="mt-1 flex items-center gap-1"
          style={{
            color: theme.colors.textMuted,
            fontSize: theme.fontSizes[0],
          }}
        >
          <Star size={11} />
          {repo.stargazersCount.toLocaleString()}
        </div>
      )}
    </RepoRowShell>
  );
}

function IdleRightPane() {
  const { theme } = useTheme();
  return (
    <div
      className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 px-8 text-center"
      style={{ background: theme.colors.backgroundSecondary }}
    >
      <Boxes size={40} style={{ color: theme.colors.textMuted, opacity: 0.7 }} />
      <div
        style={{
          color: theme.colors.textMuted,
          fontSize: theme.fontSizes[2],
          maxWidth: 360,
          lineHeight: 1.5,
        }}
      >
        Select a repository from the collection to explore its File City.
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  const { theme } = useTheme();
  return (
    <div
      className="h-viewport-fixed flex flex-col overflow-hidden"
      style={{ background: theme.colors.background }}
    >
      <div
        className="border-b px-5 flex items-center gap-2 shrink-0"
        style={{
          background: theme.colors.surface,
          borderColor: theme.colors.border,
          paddingTop: 'calc(var(--safe-top) + 0.875rem)',
          paddingBottom: '0.875rem',
        }}
      />
      <div
        className="flex-1 flex items-center justify-center"
        style={{ color: theme.colors.textMuted, fontSize: theme.fontSizes[2] }}
      >
        Loading collection…
      </div>
    </div>
  );
}

function ErrorState({ error }: { error: string }) {
  const { theme } = useTheme();
  return (
    <div
      className="h-viewport-fixed flex flex-col items-center justify-center gap-3 px-8 text-center"
      style={{ background: theme.colors.background, color: theme.colors.textMuted }}
    >
      <Boxes size={40} style={{ opacity: 0.5 }} />
      <div style={{ fontSize: theme.fontSizes[3], fontWeight: theme.fontWeights.semibold, color: theme.colors.text }}>
        {error === 'Collection not found' ? 'Not Found' : 'Error'}
      </div>
      <div style={{ fontSize: theme.fontSizes[2], maxWidth: 400, lineHeight: 1.5 }}>
        {error === 'Collection not found'
          ? 'This collection doesn\'t exist or has been made private.'
          : error}
      </div>
    </div>
  );
}
