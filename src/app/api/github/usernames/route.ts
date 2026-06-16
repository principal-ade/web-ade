/**
 * GET /api/github/usernames?logins=a,b,c
 *
 * Batch login → display-name resolver. Trails store each note / sign-off /
 * visitor author as a GitHub login (stamped server-side); the viewer wants
 * to render friendlier profile names. This resolves many logins in a single
 * GitHub GraphQL request and returns a `{ login: name }` map.
 *
 * Display-only: callers keep using the raw login as the identity key and
 * fall back to it whenever a name is missing here, so a partial or empty
 * map degrades gracefully to the legacy "show the login" behaviour.
 *
 * Uses the caller's GitHub token if present (higher rate limits + required
 * for GraphQL), or the server-side GITHUB_TOKEN env fallback. With no token
 * at all the route returns an empty map rather than erroring.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken } from '@/lib/auth/cookies';

// GitHub login rules: 1–39 chars, alphanumeric or single hyphens. We also
// use this to gate which logins are safe to inline as GraphQL aliases.
const LOGIN_RE = /^[A-Za-z0-9-]{1,39}$/;

// Cap the fan-out so a malformed request can't ask us to build an enormous
// query. Trails rarely have more than a few dozen distinct authors.
const MAX_LOGINS = 100;

interface GraphQLUserNode {
  login: string;
  name: string | null;
}

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('logins') ?? '';
  const logins = Array.from(
    new Set(
      raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => LOGIN_RE.test(s))
    )
  ).slice(0, MAX_LOGINS);

  if (logins.length === 0) {
    return NextResponse.json({ names: {} });
  }

  const callerToken = await getGitHubToken();
  const token = callerToken || process.env.GITHUB_TOKEN || null;

  // GraphQL requires authentication. Without a token, degrade to an empty
  // map so the viewer simply renders logins.
  if (!token) {
    return NextResponse.json({ names: {} });
  }

  // One aliased `user(login:)` field per login: `u0: user(login:"a"){...}`.
  // Logins are pre-validated against LOGIN_RE so they're safe to inline.
  const query = `query {\n${logins
    .map((login, i) => `  u${i}: user(login: "${login}") { login name }`)
    .join('\n')}\n}`;

  let names: Record<string, string> = {};
  try {
    const res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
      next: { revalidate: 3600 },
    });

    if (res.ok) {
      const json = (await res.json()) as {
        data?: Record<string, GraphQLUserNode | null>;
      };
      const data = json.data ?? {};
      for (const node of Object.values(data)) {
        if (node && node.name && node.name.trim().length > 0) {
          names[node.login] = node.name;
        }
      }
    }
  } catch {
    // Network/GraphQL failure → empty map; the viewer falls back to logins.
    names = {};
  }

  return NextResponse.json(
    { names },
    {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=3600',
      },
    }
  );
}
