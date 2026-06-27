/**
 * Topic page (server) — owns the crawler-facing metadata and the agent-facing
 * <noscript> breadcrumb for a shared topic.
 *
 * The interactive viewer lives in `TopicPageClient`; this server component
 * exists so social crawlers (Twitter/X, Slack, Facebook) get real Open Graph /
 * Twitter Card tags without running client JS, and so an automated agent handed
 * the bare share link finds the structured JSON + CLI path. Mirrors the trail
 * page (`src/app/trail/[id]/page.tsx`).
 *
 * Public vs. private: metadata is fetched crawler-equivalent (no auth
 * forwarded), so the by-id resolver only returns 200 for publicly-readable
 * topics. Public → the topic's real title/description. Private/not-found →
 * generic marketing copy, so a private topic's title never leaks to crawlers.
 */

import type { Metadata } from 'next';
import { headers } from 'next/headers';
import TopicPageClient from './TopicPageClient';
import type { TopicPayload } from '@/lib/topics/types';
import { ogStripMarkdown, ogTruncate } from '@/components/trail/og/ogTheme';

export const dynamic = 'force-dynamic';

const MARKETING_TITLE = 'Topics';
const MARKETING_DESCRIPTION = 'A new way to understand software';

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

/** Crawler-equivalent fetch (no auth). Returns the topic only when public. */
async function fetchPublicTopic(
  id: string,
  baseUrl: string,
): Promise<TopicPayload | null> {
  try {
    const res = await fetch(
      `${baseUrl}/api/topics/by-id/${encodeURIComponent(id)}`,
      { headers: { Accept: 'application/json' }, cache: 'no-store' },
    );
    if (!res.ok) return null;
    const data: { topic: TopicPayload } = await res.json();
    return data.topic;
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
  const imageUrl = `${baseUrl}/api/og`;
  const pageUrl = `${baseUrl}/topic/${id}`;

  const topic = await fetchPublicTopic(id, baseUrl);

  const title = topic?.title?.trim() ? topic.title : MARKETING_TITLE;
  const description = topic?.description?.trim()
    ? ogTruncate(ogStripMarkdown(topic.description), 200)
    : MARKETING_DESCRIPTION;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
      url: pageUrl,
      images: [{ url: imageUrl, width: 1200, height: 628, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default async function TopicPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const baseUrl = await resolveBaseUrl();
  const apiUrl = `${baseUrl}/api/topics/by-id/${encodeURIComponent(id)}`;

  // The interactive viewer is client-hydrated, so an automated agent handed the
  // bare share link only sees this shell + the OG tags. Surface a machine-
  // readable pointer to the structured JSON for the no-JS path (crawlers and
  // LLM fetchers read <noscript> text; real users never see it once JS runs).
  return (
    <>
      <noscript>
        <article>
          <h1>Principal topic</h1>
          <p>
            This is an interactive topic viewer that requires JavaScript. A topic
            bundles related code trails on one subject. If you are an automated
            agent, fetch the structured JSON — title, description, and ordered
            trail ids — from <a href={apiUrl}>{apiUrl}</a>. That response carries
            a <code>_links</code> map (resolved trails, comments, suggestions,
            human view) and a <code>_hints</code> field describing its shape.
            Sending <code>Accept: text/markdown</code> (or just{' '}
            <code>curl</code>-ing this page) returns a human-readable Markdown
            rendering instead.
          </p>
          <p>
            Private topics resolve only for their creator and recipients;
            everyone else gets a 404. To read a private topic shared with you,
            use the Principal CLI —{' '}
            <code>npx @principal-ai/principal-view-cli topic view {id}</code> —
            which resolves your GitHub token (via the <code>gh</code> CLI or a
            git credential helper) and calls the same API with a Bearer token, or
            open this page in a browser while signed in to Principal.
          </p>
        </article>
      </noscript>
      <TopicPageClient />
    </>
  );
}
