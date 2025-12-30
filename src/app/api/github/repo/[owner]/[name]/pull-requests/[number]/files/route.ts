import { NextRequest, NextResponse } from "next/server";
import { getGitHubToken } from "@/lib/auth/cookies";

function addCorsHeaders(response: NextResponse) {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );
  return response;
}

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 200 });
  return addCorsHeaders(response);
}

const GITHUB_API_BASE = "https://api.github.com";

interface RouteParams {
  params: Promise<{
    owner: string;
    name: string;
    number: string;
  }>;
}

export interface PullRequestFile {
  sha: string;
  filename: string;
  status: "added" | "removed" | "modified" | "renamed" | "copied" | "changed" | "unchanged";
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  previous_filename?: string;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { owner, name, number } = await params;
  const prNumber = parseInt(number, 10);

  if (isNaN(prNumber)) {
    return addCorsHeaders(
      NextResponse.json(
        { error: "Invalid pull request number" },
        { status: 400 },
      ),
    );
  }

  // Get user's GitHub token from cookies
  const userToken = await getGitHubToken();
  const token = userToken || process.env.GITHUB_TOKEN || null;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "WebADE/1.0",
  };

  if (token) {
    headers["Authorization"] = `token ${token}`;
  }

  try {
    // GitHub API can return up to 3000 files, paginated at 30 per page by default
    // We'll fetch up to 300 files (10 pages) to balance completeness with performance
    const allFiles: PullRequestFile[] = [];
    let page = 1;
    const perPage = 100;
    const maxPages = 3;

    while (page <= maxPages) {
      const queryParams = new URLSearchParams({
        per_page: perPage.toString(),
        page: page.toString(),
      });

      const response = await fetch(
        `${GITHUB_API_BASE}/repos/${owner}/${name}/pulls/${prNumber}/files?${queryParams}`,
        { headers },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return addCorsHeaders(
          NextResponse.json(
            {
              error: errorData.message || `GitHub API error: ${response.status}`,
              status: response.status,
              isAuthenticated: !!userToken,
            },
            { status: response.status },
          ),
        );
      }

      const files = await response.json();

      if (!Array.isArray(files) || files.length === 0) {
        break;
      }

      // Transform files to our interface
      const transformedFiles: PullRequestFile[] = files.map((file: {
        sha: string;
        filename: string;
        status: string;
        additions: number;
        deletions: number;
        changes: number;
        patch?: string;
        previous_filename?: string;
      }) => ({
        sha: file.sha,
        filename: file.filename,
        status: file.status as PullRequestFile["status"],
        additions: file.additions,
        deletions: file.deletions,
        changes: file.changes,
        patch: file.patch,
        previous_filename: file.previous_filename,
      }));

      allFiles.push(...transformedFiles);

      if (files.length < perPage) {
        break;
      }

      page++;
    }

    // Group files by status for easier consumption
    const filesByStatus = {
      added: allFiles.filter(f => f.status === "added").map(f => f.filename),
      modified: allFiles.filter(f => f.status === "modified" || f.status === "changed").map(f => f.filename),
      removed: allFiles.filter(f => f.status === "removed").map(f => f.filename),
      renamed: allFiles.filter(f => f.status === "renamed").map(f => ({
        filename: f.filename,
        previous_filename: f.previous_filename,
      })),
    };

    // Return files with cache headers
    const jsonResponse = NextResponse.json(
      {
        files: allFiles,
        filesByStatus,
        totalFiles: allFiles.length,
        owner,
        repo: name,
        pullNumber: prNumber,
        isAuthenticated: !!userToken,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        },
      },
    );

    return addCorsHeaders(jsonResponse);
  } catch (error) {
    console.error("[pull-request-files API] Error fetching PR files:", error);
    return addCorsHeaders(
      NextResponse.json(
        {
          error: "Failed to fetch pull request files",
          isAuthenticated: !!userToken,
        },
        { status: 500 },
      ),
    );
  }
}
