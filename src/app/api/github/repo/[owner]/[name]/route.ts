import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { gitTreeCache } from "@/lib/git-tree-cache";
import { getGitHubToken } from "@/lib/auth/cookies";
import type {
  GitHubTreeResponse,
  GitHubRepoInfoResponse,
  GitHubReadmeResponse,
  GitHubFileResponse,
  GitHubContributorsResponse,
  GitHubCountsResponse,
  GitHubCommit,
} from "@/types/api";

function addCorsHeaders(response: NextResponse) {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );
  return response;
}

// Handle preflight OPTIONS requests
export async function OPTIONS() {
  const response = new NextResponse(null, { status: 200 });
  return addCorsHeaders(response);
}

const GITHUB_API_BASE = "https://api.github.com";

// Cache durations (in seconds) for different action types
const CACHE_DURATIONS = {
  info: 300, // 5 minutes - repository info changes infrequently
  tree: 180, // 3 minutes - file tree changes with commits
  readme: 600, // 10 minutes - README changes rarely
  file: 600, // 10 minutes - individual files change rarely
  contributors: 1800, // 30 minutes - very stable data
  "file-count": 600, // 10 minutes - stable data
  counts: 120, // 2 minutes - PR/issue counts can change frequently
} as const;

// A full 40-char commit SHA addresses immutable content — the bytes at that ref
// can never change, so a SHA-pinned read is cached indefinitely and a new commit
// is simply a new cache key (self-busting). Branch names, tags, and "HEAD" are
// mutable refs and keep the short TTLs above.
const IMMUTABLE_MAX_AGE = 31_536_000; // 1 year — the max sane max-age/s-maxage
const isCommitSha = (ref: string | null | undefined): ref is string =>
  !!ref && /^[0-9a-f]{40}$/i.test(ref);

class GitHubApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

async function makeGitHubRequest<T>(endpoint: string, userToken?: string | null): Promise<T> {
  // Use user's token if provided, otherwise fall back to server token
  const token = userToken || process.env.GITHUB_TOKEN || null;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "CodeCity-App/1.0",
  };

  if (token) {
    headers["Authorization"] = `token ${token}`;
  }

  const response = await fetch(`${GITHUB_API_BASE}${endpoint}`, { headers });

  if (!response.ok) {
    let errorMessage = `GitHub API Error: ${response.status} ${response.statusText}`;

    // Add token diagnostic information for 401 errors
    if (response.status === 401) {
      const tokenSource = token ? "environment" : "none";
      const tokenPrefix = token ? `${token.substring(0, 8)}...` : "null";

      errorMessage += `\nToken Status: ${tokenSource} (${tokenPrefix})`;

      if (!token) {
        errorMessage +=
          "\nSuggestion: No GitHub token available. Please set GITHUB_TOKEN environment variable.";
      } else {
        errorMessage +=
          "\nSuggestion: Token may be expired or invalid. Please check your GitHub token permissions and expiration.";
      }
    }

    throw new GitHubApiError(errorMessage, response.status);
  }

  return response.json() as Promise<T>;
}

// GraphQL request for efficient data fetching
async function makeGitHubGraphQLRequest(
  query: string,
  variables: Record<string, unknown>,
  userToken?: string | null
) {
  const token = userToken || process.env.GITHUB_TOKEN || null;

  if (!token) {
    throw new GitHubApiError("GitHub token required for GraphQL API", 401);
  }

  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "CodeCity-App/1.0",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new GitHubApiError(
      `GitHub GraphQL Error: ${response.status} ${response.statusText}`,
      response.status
    );
  }

  const data = await response.json();

  if (data.errors) {
    throw new GitHubApiError(
      `GitHub GraphQL Error: ${data.errors[0]?.message || "Unknown error"}`,
      400
    );
  }

  return data.data;
}

// Cached version of makeGitHubRequest
function makeCachedGitHubRequest<T>(
  endpoint: string,
  cacheKey: string,
  revalidate: number,
  userToken?: string | null,
): Promise<T> {
  // Note: We include userToken in the cache key for user-specific data
  const fullCacheKey = userToken ? `${cacheKey}-user-${userToken.substring(0, 8)}` : cacheKey;
  return unstable_cache(
    async () => makeGitHubRequest<T>(endpoint, userToken),
    [fullCacheKey],
    {
      revalidate,
      tags: ["github-api", fullCacheKey],
    },
  )();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; name: string }> },
) {
  try {
    const { owner, name } = await params;
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action") || "info";

    // Get user's GitHub token from HTTP-only cookie
    const userToken = await getGitHubToken();

    // Response data - union of all possible response types
    let data: GitHubRepoInfoResponse | GitHubTreeResponse | GitHubReadmeResponse | GitHubContributorsResponse | GitHubFileResponse | GitHubCountsResponse;
    // Set when the response is pinned to an immutable commit SHA, so the cache
    // headers below can be `immutable` rather than a short revalidate window.
    let immutable = false;

    switch (action) {
      case "info":
        data = await makeCachedGitHubRequest<GitHubRepoInfoResponse>(
          `/repos/${owner}/${name}`,
          `repo-info-${owner}-${name}`,
          CACHE_DURATIONS.info,
          userToken,
        );
        break;

      case "tree": {
        // Fetch tree with in-memory caching by SHA
        // First resolve the ref to actual commit SHA to ensure cache freshness
        const requestedRef = searchParams.get("ref") || "HEAD";

        // Get the latest commit SHA for the ref to use as cache key
        // This ensures we don't serve stale trees when new commits are pushed
        let resolvedSha: string;
        try {
          const refData = await makeGitHubRequest<GitHubCommit>(
            `/repos/${owner}/${name}/commits/${requestedRef}`,
            userToken
          );
          resolvedSha = refData.sha;
        } catch {
          // If we can't resolve the ref, fall back to using the ref directly
          resolvedSha = requestedRef;
        }

        const cacheKey = `${owner}/${name}/${resolvedSha}`;

        // Check in-memory cache first using the resolved SHA
        const cachedTree = gitTreeCache.get(cacheKey) as GitHubTreeResponse | undefined;
        if (cachedTree) {
          data = cachedTree;
          break;
        }

        // Not in cache, fetch from GitHub using the resolved SHA
        const treeData = await makeGitHubRequest<GitHubTreeResponse>(
          `/repos/${owner}/${name}/git/trees/${resolvedSha}?recursive=1`,
          userToken
        );

        // Cache by SHA
        if (treeData && treeData.sha) {
          gitTreeCache.set(cacheKey, treeData);
          gitTreeCache.set(treeData.sha, treeData); // Also cache by tree SHA for direct lookups
        }
        data = treeData;
        break;
      }

      case "readme":
        data = await makeCachedGitHubRequest<GitHubReadmeResponse>(
          `/repos/${owner}/${name}/readme`,
          `repo-readme-${owner}-${name}`,
          CACHE_DURATIONS.readme,
          userToken,
        );
        break;

      case "contributors":
        data = await makeCachedGitHubRequest<GitHubContributorsResponse>(
          `/repos/${owner}/${name}/contributors?per_page=100`,
          `repo-contributors-${owner}-${name}`,
          CACHE_DURATIONS.contributors,
          userToken,
        );
        break;

      case "file": {
        const filePath = searchParams.get("path");
        if (!filePath) {
          return NextResponse.json(
            { error: "File path required" },
            { status: 400 },
          );
        }
        // Optional commit/branch/tag pin. When a trail records the sha it
        // was authored against, the viewer passes it here so snippets read
        // the file as it existed then — not whatever HEAD is now. The ref
        // is part of the cache key so pinned reads don't collide with the
        // unpinned (HEAD) read of the same path.
        const ref = searchParams.get("ref");
        const pinned = isCommitSha(ref);
        const endpoint = ref
          ? `/repos/${owner}/${name}/contents/${filePath}?ref=${encodeURIComponent(ref)}`
          : `/repos/${owner}/${name}/contents/${filePath}`;
        const cacheKey = ref
          ? `repo-file-${owner}-${name}-${ref}-${filePath}`
          : `repo-file-${owner}-${name}-${filePath}`;
        // A SHA-pinned read is immutable: cache it for a year so a re-commit is
        // picked up via its new SHA key, not by waiting out a TTL. Unpinned or
        // branch/HEAD reads stay on the short revalidate window.
        immutable = pinned;
        data = await makeCachedGitHubRequest<GitHubFileResponse>(
          endpoint,
          cacheKey,
          pinned ? IMMUTABLE_MAX_AGE : CACHE_DURATIONS.file,
          userToken,
        );
        break;
      }

      case "raw": {
        // Stream the raw file bytes (not the base64 JSON wrapper) so binary
        // documents — .docx, .pdf, .pptx — can be fetched as an ArrayBuffer by
        // the client preview. Uses the GitHub "raw" media type, which also
        // sidesteps the 1MB limit of the contents JSON response. Auth flows
        // through the same user/server token, so private repos work too.
        const filePath = searchParams.get("path");
        if (!filePath) {
          return NextResponse.json(
            { error: "File path required" },
            { status: 400 },
          );
        }
        const ref = searchParams.get("ref");
        const pinned = isCommitSha(ref);
        const endpoint = ref
          ? `/repos/${owner}/${name}/contents/${filePath}?ref=${encodeURIComponent(ref)}`
          : `/repos/${owner}/${name}/contents/${filePath}`;

        const token = userToken || process.env.GITHUB_TOKEN || null;
        const headers: Record<string, string> = {
          Accept: "application/vnd.github.raw",
          "User-Agent": "CodeCity-App/1.0",
        };
        if (token) headers["Authorization"] = `token ${token}`;

        const ghResponse = await fetch(`${GITHUB_API_BASE}${endpoint}`, {
          headers,
        });
        if (!ghResponse.ok) {
          throw new GitHubApiError(
            `GitHub API Error: ${ghResponse.status} ${ghResponse.statusText}`,
            ghResponse.status,
          );
        }

        const buffer = await ghResponse.arrayBuffer();
        const rawResponse = new NextResponse(buffer, { status: 200 });
        rawResponse.headers.set(
          "Content-Type",
          ghResponse.headers.get("content-type") || "application/octet-stream",
        );
        // SHA-pinned reads are immutable — cache them hard so a re-commit is
        // picked up via its new SHA key. Unpinned files change rarely, so still
        // lean on HTTP caching (binary bodies don't round-trip through
        // unstable_cache cleanly).
        rawResponse.headers.set(
          "Cache-Control",
          pinned
            ? `public, max-age=${IMMUTABLE_MAX_AGE}, immutable`
            : `public, s-maxage=${CACHE_DURATIONS.file}, stale-while-revalidate=${CACHE_DURATIONS.file * 2}`,
        );
        return addCorsHeaders(rawResponse);
      }

      case "counts": {
        // Use GraphQL to efficiently fetch PR and issue counts in a single request
        const countsQuery = `
          query($owner: String!, $name: String!) {
            repository(owner: $owner, name: $name) {
              issues(states: OPEN) { totalCount }
              pullRequests(states: OPEN) { totalCount }
            }
          }
        `;
        const countsData = await makeGitHubGraphQLRequest(
          countsQuery,
          { owner, name },
          userToken
        );
        data = {
          openIssues: countsData.repository.issues.totalCount,
          openPullRequests: countsData.repository.pullRequests.totalCount,
        } satisfies GitHubCountsResponse;
        break;
      }

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    // Add cache control headers to response
    const cacheDuration = CACHE_DURATIONS[action as keyof typeof CACHE_DURATIONS] || 300;
    const response = NextResponse.json(data);

    // Set cache headers for CDN/browser caching. SHA-pinned content is immutable,
    // so it's cached hard and never revalidated; everything else uses the action's
    // short TTL with stale-while-revalidate.
    response.headers.set(
      "Cache-Control",
      immutable
        ? `public, max-age=${IMMUTABLE_MAX_AGE}, immutable`
        : `public, s-maxage=${cacheDuration}, stale-while-revalidate=${cacheDuration * 2}`,
    );

    return response;
  } catch (error) {
    console.error("GitHub API proxy error:", error);

    if (error instanceof GitHubApiError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
