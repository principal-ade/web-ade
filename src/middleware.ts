/**
 * Content negotiation for share links.
 *
 * The `/trail/{id}` and `/topic/{id}` pages are client-hydrated SPAs: a browser
 * navigation needs the HTML shell (and, for link-preview crawlers, the Open
 * Graph tags), but a programmatic caller — curl, an LLM fetcher, an agent
 * handed the bare link — only gets a "Loading…" shell and a <noscript>
 * breadcrumb it has to parse out. This middleware reads the request's intent
 * from its headers and, for non-browser callers, rewrites the same URL to the
 * structured by-id API so `curl https://app.principal-ade.com/trail/<id>`
 * returns Markdown (or JSON on request) directly, at the canonical URL, with no
 * breadcrumb to follow.
 *
 * Browsers and OG crawlers pass through untouched.
 */

import { NextRequest, NextResponse } from 'next/server';

// Link-preview crawlers that need the OG <meta> HTML from the page's
// generateMetadata(), not Markdown. Matched on User-Agent.
const OG_CRAWLERS =
  /(twitterbot|slackbot|facebookexternalhit|discordbot|linkedinbot|whatsapp|telegrambot|googlebot|bingbot|bsky|mastodon|embedly|redditbot)/i;

// Single-segment share links → their structured by-id API. The page noun in
// the URL (`trail`/`topic`) maps to the API collection segment.
const SHARE_ROUTES: Array<{ re: RegExp; api: (id: string) => string }> = [
  { re: /^\/trail\/([^/]+)\/?$/, api: (id) => `/api/trails/by-id/${id}` },
  { re: /^\/topic\/([^/]+)\/?$/, api: (id) => `/api/topics/by-id/${id}` },
];

// Top-level path segments that are real app routes (pages, API, assets), not
// repo owners. A two-segment path whose first segment is one of these is NOT
// an `/{owner}/{repo}` repo page, so the catalog rewrite must skip it.
const RESERVED_OWNERS = new Set([
  'api',
  '_next',
  'trail',
  'topic',
  'topics',
  'tour',
  'card',
  'cards',
  'explore',
  'feed',
  'legacy',
  'home',
  'file-city-tutorial',
]);

// `/{owner}/{repo}` repo page → its agent catalog API. Like the trail/topic
// share links, the page is a client-hydrated SPA, so non-browser callers get
// the structured manifest instead of the loading shell.
const REPO_RE = /^\/([^/]+)\/([^/]+)\/?$/;

/** Resolve the structured API path for a rewritable page URL, or undefined. */
function resolveApiPath(pathname: string): string | undefined {
  // The home page (`/`) has no params; a non-browser caller gets the site
  // index — an orientation manifest + the public repos that have trails.
  if (pathname === '/') return '/api/home';
  for (const r of SHARE_ROUTES) {
    const captured = r.re.exec(pathname)?.[1];
    if (captured) return r.api(captured);
  }
  const repo = REPO_RE.exec(pathname);
  const owner = repo?.[1];
  const name = repo?.[2];
  if (owner && name && !RESERVED_OWNERS.has(owner.toLowerCase())) {
    return `/api/repos/${owner}/${name}`;
  }
  return undefined;
}

export function middleware(request: NextRequest): NextResponse {
  // Signed-in users don't need the marketing landing — send document
  // navigations to `/` straight to the app home (`/home`). Gated on the auth
  // cookie and real browser navigations (not RSC/prefetch, not agent callers),
  // and skips the `?view=` feeds, which live on `/`.
  const { pathname, searchParams } = request.nextUrl;
  if (
    pathname === '/' &&
    !searchParams.has('view') &&
    request.cookies.has('github_token') &&
    (request.headers.get('accept') ?? '').includes('text/html') &&
    !request.headers.get('rsc') &&
    !request.headers.get('next-router-prefetch')
  ) {
    return NextResponse.redirect(new URL('/home', request.url));
  }

  const apiPath = resolveApiPath(request.nextUrl.pathname);
  if (!apiPath) return NextResponse.next();

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
  // for it and not Markdown. The API enforces the same access gate, so a
  // private trail comes back as a CLI-aware 403, a private topic as a CLI-aware
  // 404, and a private repo as a CLI-aware 403 catalog notice.
  //
  // The format is passed as a request header rather than a query param: query
  // params added during a rewrite don't reliably survive into the destination
  // route's `request.url` / `nextUrl`, but forwarded request headers do.
  const wantsJson =
    accept.includes('application/json') && !accept.includes('text/markdown');
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-agent-format', wantsJson ? 'json' : 'md');
  const url = request.nextUrl.clone();
  url.pathname = apiPath;
  return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
}

export const config = {
  // The home page, single-segment trail/topic share links, plus two-segment
  // `/{owner}/{repo}` repo pages. `/:owner/:repo` matches any two-segment path,
  // so the handler filters out reserved first segments (api, _next, app routes)
  // before treating it as a repo. Deeper paths are excluded.
  matcher: ['/', '/file-city-tutorial', '/trail/:id', '/topic/:id', '/:owner/:repo'],
};
