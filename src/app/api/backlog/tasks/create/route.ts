import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken } from '@/lib/auth/cookies';
import { Core, type TaskCreateInput } from '@backlog-md/core';
import { GitHubBacklogAdapter } from '@/lib/server/GitHubBacklogAdapter';
import { Octokit } from '@octokit/rest';

export const runtime = 'nodejs';

/**
 * POST /api/backlog/tasks/create
 *
 * Creates a backlog task from a GitHub issue using @backlog-md/core
 *
 * Request body:
 * {
 *   owner: string;
 *   repo: string;
 *   issue: {
 *     number: number;
 *     title: string;
 *     body?: string | null;
 *     html_url: string;
 *     labels: Array<{ name: string }>;
 *     state: string;
 *   };
 * }
 *
 * Response:
 * {
 *   success: true;
 *   taskId: string;
 *   filePath: string;
 *   commitSha: string;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Get GitHub token from cookies
    const token = await getGitHubToken();

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized - please log in with GitHub' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { owner, repo, issue, taskType, additionalInstructions } = body;

    if (!owner || !repo || !issue || !taskType) {
      return NextResponse.json(
        { error: 'Missing required fields: owner, repo, issue, taskType' },
        { status: 400 }
      );
    }

    if (taskType !== 'investigate' && taskType !== 'fix') {
      return NextResponse.json(
        { error: 'Invalid taskType - must be "investigate" or "fix"' },
        { status: 400 }
      );
    }

    // Validate issue data
    if (!issue.number || !issue.title || !issue.html_url || !Array.isArray(issue.labels)) {
      return NextResponse.json(
        { error: 'Invalid issue data' },
        { status: 400 }
      );
    }

    // Get default branch
    const octokit = new Octokit({ auth: token });
    const { data: repoData } = await octokit.repos.get({ owner, repo });
    const defaultBranch = repoData.default_branch || 'main';

    // Create GitHub file system adapter
    const fs = new GitHubBacklogAdapter(owner, repo, defaultBranch, token);

    // Create Core instance
    const core = new Core({
      projectRoot: '',
      adapters: { fs },
    });

    // Check if this is a Backlog.md project
    const isBacklogProject = await core.isBacklogProject();

    if (!isBacklogProject) {
      return NextResponse.json(
        { error: 'Repository is not a Backlog.md project. Please initialize it first.' },
        { status: 400 }
      );
    }

    // Initialize Core with lazy loading
    await core.initializeLazy([]);

    // Convert GitHub issue to TaskCreateInput
    const labelNames = issue.labels.map((l: { name: string }) => l.name.toLowerCase());
    let priority: 'low' | 'medium' | 'high' | 'critical' = 'medium';
    if (labelNames.some((l: string) => l.includes('high') || l.includes('urgent') || l.includes('critical'))) {
      priority = 'high';
    } else if (labelNames.some((l: string) => l.includes('low'))) {
      priority = 'low';
    }

    // Build description with additional instructions
    let description = issue.body?.trim() || '_From GitHub issue - no description provided._';
    if (additionalInstructions?.trim()) {
      description += `\n\n## Additional Instructions\n\n${additionalInstructions.trim()}`;
    }

    // Set status based on task type
    const status = taskType === 'investigate' ? 'To Do' : 'In Progress';

    const taskInput: TaskCreateInput = {
      title: issue.title,
      description,
      status,
      priority,
      labels: issue.labels.map((l: { name: string }) => l.name),
      references: [
        issue.html_url,
        `${owner}/${repo}#${issue.number}`,
      ],
    };

    // Create the task using Core
    const task = await core.createTask(taskInput);

    if (!task || !task.id) {
      throw new Error('Failed to create task - no task returned from Core');
    }

    // Get the written files from the adapter
    const writtenFiles = fs.getWrittenFiles();

    if (writtenFiles.size === 0) {
      throw new Error('No files were written by Core');
    }

    // Commit all written files to GitHub
    const files = Array.from(writtenFiles.entries()).map(([path, content]) => ({
      path,
      content: Buffer.from(content, 'utf-8').toString('base64'),
    }));

    // Create a tree with all files
    const tree = await Promise.all(
      files.map(async (file) => ({
        path: file.path,
        mode: '100644' as const,
        type: 'blob' as const,
        content: Buffer.from(file.content, 'base64').toString('utf-8'),
      }))
    );

    // Get current commit SHA
    const { data: refData } = await octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${defaultBranch}`,
    });
    const currentCommitSha = refData.object.sha;

    // Get current tree SHA
    const { data: currentCommit } = await octokit.git.getCommit({
      owner,
      repo,
      commit_sha: currentCommitSha,
    });
    const currentTreeSha = currentCommit.tree.sha;

    // Create new tree
    const { data: newTree } = await octokit.git.createTree({
      owner,
      repo,
      base_tree: currentTreeSha,
      tree,
    });

    // Create commit
    const commitMessage = `Add task from issue #${issue.number}: ${issue.title}

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>`;

    const { data: newCommit } = await octokit.git.createCommit({
      owner,
      repo,
      message: commitMessage,
      tree: newTree.sha,
      parents: [currentCommitSha],
    });

    // Update ref
    await octokit.git.updateRef({
      owner,
      repo,
      ref: `heads/${defaultBranch}`,
      sha: newCommit.sha,
    });

    // Add GitHub label to the issue to mark it as having a task
    const labelName = `backlog-task:${taskType}`;
    try {
      // Check if label exists in repo, create if it doesn't
      try {
        await octokit.issues.getLabel({
          owner,
          repo,
          name: labelName,
        });
      } catch (labelError: unknown) {
        const error = labelError as { status?: number };
        // Label doesn't exist, create it
        if (error?.status === 404) {
          await octokit.issues.createLabel({
            owner,
            repo,
            name: labelName,
            color: '0e8a16', // green color
            description: `Task created from this issue (type: ${taskType})`,
          });
        }
      }

      // Add label to issue
      await octokit.issues.addLabels({
        owner,
        repo,
        issue_number: issue.number,
        labels: [labelName],
      });
    } catch (labelError) {
      console.error('[API] Failed to add label to issue:', labelError);
      // Don't fail the whole request if labeling fails
    }

    // Return success with task details
    return NextResponse.json({
      success: true,
      taskId: task.id,
      filePath: task.filePath || `backlog/tasks/${task.id}.md`,
      commitSha: newCommit.sha,
    });

  } catch (error) {
    console.error('[API] Error creating backlog task:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create backlog task' },
      { status: 500 }
    );
  }
}
