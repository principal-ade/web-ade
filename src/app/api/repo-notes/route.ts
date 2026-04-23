/**
 * Repo Notes API - Main Route
 *
 * GET - Fetch all repo notes for the authenticated user
 */

import { NextResponse } from 'next/server';
import { getGitHubToken, getGitHubUserId } from '@/lib/auth/request';
import { getRepoNotes } from '@/lib/repo-notes/s3-storage';
import type { RepoNotesData } from '@/lib/repo-notes/types';

/**
 * GET /api/repo-notes
 *
 * Returns all repo notes for the authenticated user.
 * Response: RepoNotesData ({ notes: Record<"owner/repo", RepoNote>, updatedAt })
 */
export async function GET() {
  try {
    const githubToken = await getGitHubToken();
    const userId = await getGitHubUserId();

    if (!githubToken || !userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const data = await getRepoNotes(String(userId));

    const response: RepoNotesData = data ?? { notes: {}, updatedAt: new Date().toISOString() };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Get repo notes error:', error);
    return NextResponse.json({ error: 'Failed to get repo notes' }, { status: 500 });
  }
}
