/**
 * Content negotiation for share links.
 *
 * The `/trail/{id}` page is a client-hydrated SPA: a browser navigation needs
 * the HTML shell (and, for link-preview crawlers, the Open Graph tags), but a
 * programmatic caller — curl, an LLM fetcher, an agent handed the bare link —
 * only gets a "Loading trail" shell and a <noscript> breadcrumb it has to
 * parse out. This middleware reads the request's intent from its headers and,
 * for non-browser callers, rewrites the same URL to the structured by-id API
 * so `curl https://app.principal-ade.com/trail/<id>` returns Markdown (or JSON
 * on request) directly, at the canonical URL, with no breadcrumb to follow.
 *
 * Browsers and OG crawlers pass through untouched. Topics will follow once the
 * trail path is proven (see the matcher).
 */

import { NextRequest, NextResponse } from 'next/server';

// Link-preview crawlers that need the OG <meta> HTML from the page's
// generateMetadata(), not Markdown. Matched on User-Agent.
const OG_CRAWLERS =
  /(twitterbot|slackbot|facebookexternalhit|discordbot|linkedinbot|whatsapp|telegrambot|googlebot|bingbot|bsky|mastodon|embedly|redditbot)/i;

export function middleware(request: NextRequest): NextResponse {
  const match = request.nextUrl.pathname.match(/^\/trail\/([^/]+)\/?$/);
  if (!match) return NextResponse.next();
  const id = match[1];

  const accept = request.headers.get('accept') ?? '';
  const ua = request.headers.get('user-agent') ?? '';

  // Next's own RSC / prefetch navigations during client-side routing must
  // reach the page, not the API. They carry an `RSC` header (or ask for
  // `text/x-component`), so let those through verbatim.
  if (
    request.headers.get('rsc') ||
    request.headers.get('next-router-prefetch') ||
    accept.includes('text/x-component')
  ) {
    return NextResponse.next();
  }

  // Browser document navigations explicitly prefer HTML; OG crawlers need the
  // meta tags. Both get the SPA.
  if (accept.includes('text/html') || OG_CRAWLERS.test(ua)) {
    return NextResponse.next();
  }

  // Everything else is a programmatic caller. Rewrite to the structured API at
  // the same URL — Markdown by default, JSON when the caller explicitly asks
  // for it and not Markdown. The API enforces the same repo-access gate, so a
  // private trail comes back as a CLI-aware 403.
  //
  // The format is passed as a request header rather than a query param: query
  // params added during a rewrite don't reliably survive into the destination
  // route's `request.url` / `nextUrl`, but forwarded request headers do.
  const wantsJson =
    accept.includes('application/json') && !accept.includes('text/markdown');
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-agent-format', wantsJson ? 'json' : 'md');
  const url = request.nextUrl.clone();
  url.pathname = `/api/trails/by-id/${id}`;
  return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
}

export const config = {
  // Single-segment trail share links only. Topics, and any nested paths, are
  // intentionally excluded for now.
  matcher: ['/trail/:id'],
};
