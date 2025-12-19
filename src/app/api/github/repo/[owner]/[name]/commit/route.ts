import { NextRequest, NextResponse } from 'next/server';
import { Octokit } from '@octokit/rest';
import { getGitHubToken } from '@/lib/auth/cookies';

interface FileChange {
  path: string;
  content: string;
  sha: string;  // Current file SHA for conflict detection
}

interface CommitRequest {
  files: FileChange[];
  message: string;
  branch?: string;
}

interface CommitResponse {
  success: boolean;
  commitSha: string;
  commitUrl: string;
  files: Array<{
    path: string;
    sha: string;
  }>;
}

function addCorsHeaders(response: NextResponse) {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}

function cleanPath(path: string): string {
  // Remove leading slash - GitHub API doesn't accept paths starting with /
  let cleaned = path.startsWith('/') ? path.slice(1) : path;
  // Remove any double slashes
  cleaned = cleaned.replace(/\/+/g, '/');
  return cleaned;
}

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 200 });
  return addCorsHeaders(response);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ owner: string; name: string }> }
) {
  try {
    const { owner, name } = await params;
    const userToken = await getGitHubToken();

    if (!userToken) {
      return addCorsHeaders(
        NextResponse.json(
          { error: 'Authentication required. Please log in with GitHub.' },
          { status: 401 }
        )
      );
    }

    const body: CommitRequest = await request.json();
    const { files, message, branch } = body;

    if (!files || files.length === 0) {
      return addCorsHeaders(
        NextResponse.json(
          { error: 'No files provided for commit' },
          { status: 400 }
        )
      );
    }

    if (!message || message.trim().length === 0) {
      return addCorsHeaders(
        NextResponse.json(
          { error: 'Commit message is required' },
          { status: 400 }
        )
      );
    }

    const octokit = new Octokit({ auth: userToken });

    // Clean file paths - GitHub API doesn't accept leading slashes
    const cleanedFiles = files.map(file => ({
      ...file,
      path: cleanPath(file.path),
    }));

    // Get the default branch if not specified
    const targetBranch = branch || (await getDefaultBranch(octokit, owner, name));

    // For single file, use the simpler createOrUpdateFileContents API
    if (cleanedFiles.length === 1) {
      const file = cleanedFiles[0]!;
      const result = await commitSingleFile(octokit, owner, name, targetBranch, file, message);
      return addCorsHeaders(NextResponse.json(result));
    }

    // For multiple files, use the Git Data API for atomic commits
    const result = await commitMultipleFiles(octokit, owner, name, targetBranch, cleanedFiles, message);
    return addCorsHeaders(NextResponse.json(result));

  } catch (error) {
    console.error('Commit error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const status = errorMessage.includes('409') ? 409 : 500;

    return addCorsHeaders(
      NextResponse.json(
        {
          error: 'Failed to commit changes',
          details: errorMessage,
        },
        { status }
      )
    );
  }
}

async function getDefaultBranch(octokit: Octokit, owner: string, repo: string): Promise<string> {
  const { data } = await octokit.rest.repos.get({ owner, repo });
  return data.default_branch;
}

async function commitSingleFile(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
  file: FileChange,
  message: string
): Promise<CommitResponse> {
  const { data } = await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: file.path,
    message,
    content: Buffer.from(file.content, 'utf-8').toString('base64'),
    sha: file.sha,
    branch,
  });

  return {
    success: true,
    commitSha: data.commit.sha!,
    commitUrl: data.commit.html_url!,
    files: [{
      path: file.path,
      sha: data.content!.sha!,
    }],
  };
}

async function commitMultipleFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  branch: string,
  files: FileChange[],
  message: string
): Promise<CommitResponse> {
  // Step 1: Get the current commit SHA for the branch
  const { data: refData } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${branch}`,
  });
  const currentCommitSha = refData.object.sha;

  // Step 2: Get the tree SHA from the current commit
  const { data: commitData } = await octokit.rest.git.getCommit({
    owner,
    repo,
    commit_sha: currentCommitSha,
  });
  const baseTreeSha = commitData.tree.sha;

  // Step 3: Create blobs for each file
  const treeItems: Array<{
    path: string;
    mode: '100644';
    type: 'blob';
    sha: string;
  }> = [];

  const fileResults: Array<{ path: string; sha: string }> = [];

  for (const file of files) {
    const { data: blobData } = await octokit.rest.git.createBlob({
      owner,
      repo,
      content: Buffer.from(file.content, 'utf-8').toString('base64'),
      encoding: 'base64',
    });

    treeItems.push({
      path: file.path,
      mode: '100644',
      type: 'blob',
      sha: blobData.sha,
    });

    fileResults.push({
      path: file.path,
      sha: blobData.sha,
    });
  }

  // Step 4: Create a new tree with the updated files
  const { data: newTreeData } = await octokit.rest.git.createTree({
    owner,
    repo,
    base_tree: baseTreeSha,
    tree: treeItems,
  });

  // Step 5: Create a new commit pointing to the new tree
  const { data: newCommitData } = await octokit.rest.git.createCommit({
    owner,
    repo,
    message,
    tree: newTreeData.sha,
    parents: [currentCommitSha],
  });

  // Step 6: Update the branch reference to point to the new commit
  await octokit.rest.git.updateRef({
    owner,
    repo,
    ref: `heads/${branch}`,
    sha: newCommitData.sha,
  });

  return {
    success: true,
    commitSha: newCommitData.sha,
    commitUrl: newCommitData.html_url!,
    files: fileResults,
  };
}
