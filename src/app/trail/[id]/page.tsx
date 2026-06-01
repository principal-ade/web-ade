/**
 * Trail page (server) — owns the crawler-facing metadata for a shared trail.
 *
 * The interactive viewer lives in `TrailPageClient`; this server component
 * exists so social crawlers (Twitter/X, Slack, Facebook) get real Open Graph
 * / Twitter Card tags + a preview image without running client JS.
 *
 * Public vs. private: metadata is fetched crawler-equivalent (no auth
 * forwarded), so the by-id resolver only returns 200 for publicly-readable
 * trails. Public → the trail's real title/summary + `TrailBriefCardOG` image.
 * Private/not-found → generic "Code trails" marketing copy + the
 * `TrailMarketingCardOG` image. Either way the image route applies the same
 * fork, so tags and image stay consistent.
 */

import type { Metadata } from 'next';
import { headers } from 'next/headers';
import TrailPageClient from './TrailPageClient';
import type { TrailPayload } from '@/lib/trails/types';
import { ogStripMarkdown, ogTruncate } from '@/components/trail/og/ogTheme';

export const dynamic = 'force-dynamic';

const MARKETING_TITLE = 'Code trails';
const MARKETING_DESCRIPTION = 'A new way to collaborate on software';

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

/** Crawler-equivalent fetch (no auth). Returns the payload only when public. */
async function fetchPublicTrail(
  id: string,
  baseUrl: string,
): Promise<TrailPayload | null> {
  try {
    const res = await fetch(
      `${baseUrl}/api/trails/by-id/${encodeURIComponent(id)}`,
      { headers: { Accept: 'application/json' }, cache: 'no-store' },
    );
    if (!res.ok) return null;
    const data: { payload: TrailPayload } = await res.json();
    return data.payload;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const baseUrl = await resolveBaseUrl();
  const imageUrl = `${baseUrl}/api/og/trail/${id}`;
  const pageUrl = `${baseUrl}/trail/${id}`;

  const payload = await fetchPublicTrail(id, baseUrl);

  let title = MARKETING_TITLE;
  let description = MARKETING_DESCRIPTION;

  if (payload) {
    const request = payload.request?.trim();
    title =
      payload.share && request && request.length > 0 ? request : payload.title;
    description = payload.summary
      ? ogTruncate(ogStripMarkdown(payload.summary), 200)
      : `A guided trail through the codebase${payload.author ? ` by ${payload.author}` : ''}.`;
  }

  const imageAlt = payload ? `${title} — trail preview` : MARKETING_DESCRIPTION;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
      url: pageUrl,
      images: [{ url: imageUrl, width: 1200, height: 628, alt: imageAlt }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default function TrailPage() {
  return <TrailPageClient />;
}
