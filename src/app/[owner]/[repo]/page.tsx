/**
 * Owner/repo page (server component).
 *
 * Server-rendered shell so we can emit per-repo Open Graph / Twitter metadata
 * (`generateMetadata`) — social unfurls get the repo's File City card from
 * `/api/card/[owner]/[repo]` instead of the generic site card. The interactive
 * explorer (`RepoTrailExplorerPage`) is a client component rendered underneath,
 * receiving owner/repo as props (so the split is purely a metadata boundary).
 */

import type { Metadata } from 'next';
import { headers } from 'next/headers';
import RepoPageClient from './RepoPageClient';

interface RepoPageProps {
  params: Promise<{ owner: string; repo: string }>;
}

/** Canonical base URL — mirrors `resolveBaseUrl` in the root layout. */
async function resolveBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') || h.get('host') || 'localhost:3000';
  const proto =
    h.get('x-forwarded-proto') ||
    (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  return (
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    `${proto}://${host}`
  );
}

/** Best-effort repo description for the unfurl text. */
async function getRepoDescription(
  owner: string,
  repo: string
): Promise<string | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'web-ade',
      },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { description: string | null };
    return data.description;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: RepoPageProps): Promise<Metadata> {
  const { owner, repo } = await params;
  const baseUrl = await resolveBaseUrl();
  const description =
    (await getRepoDescription(owner, repo)) ||
    `Explore ${owner}/${repo} as a File City — code trails through the codebase.`;
  const title = `${owner}/${repo}`;
  const imageUrl = `${baseUrl}/api/card/${owner}/${repo}`;
  const pageUrl = `${baseUrl}/${owner}/${repo}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      url: pageUrl,
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 628,
          alt: `${owner}/${repo} — File City`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default async function RepoPage({ params }: RepoPageProps) {
  const { owner, repo } = await params;
  return <RepoPageClient owner={owner} repo={repo} />;
}
