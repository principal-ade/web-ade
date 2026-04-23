/**
 * Repo Notes API - Single Repo Route
 *
 * PUT    - Upsert a note for a specific repo
 * DELETE - Delete the note for a specific repo
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGitHubToken, getGitHubUserId } from '@/lib/auth/request';
import { updateRepoNotes } from '@/lib/repo-notes/s3-storage';
import { MAX_NOTE_LENGTH } from '@/lib/repo-notes/types';

type Params = Promise<{ owner: string; repo: string }>;

/**
 * PUT /api/repo-notes/[owner]/[repo]
 *
 * Upsert a note for a specific repo.
 * Request Body: { content: string }
 * Response: { owner, repo, content, updatedAt }
 */
export async function PUT(request: NextRequest, { params }: { params: Params }) {
  try {
    const githubToken = await getGitHubToken();
    const userId = await getGitHubUserId();

    if (!githubToken || !userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { owner, repo } = await params;
    const { content } = (await request.json()) as { content: string };

    if (typeof content !== 'string') {
      return NextResponse.json({ error: 'content must be a string' }, { status: 400 });
    }

    if (content.length > MAX_NOTE_LENGTH) {
      return NextResponse.json(
        { error: `content exceeds maximum length of ${MAX_NOTE_LENGTH} characters` },
        { status: 400 }
      );
    }

    const key = `${owner}/${repo}`;
    const now = new Date().toISOString();

    const updated = await updateRepoNotes(String(userId), (data) => ({
      ...data,
      notes: {
        ...data.notes,
        [key]: { content, updatedAt: now },
      },
    }));

    return NextResponse.json({ owner, repo, ...updated.notes[key] });
  } catch (error) {
    console.error('Upsert repo note error:', error);
    return NextResponse.json({ error: 'Failed to save repo note' }, { status: 500 });
  }
}

/**
 * DELETE /api/repo-notes/[owner]/[repo]
 *
 * Delete the note for a specific repo.
 * Response: 204 No Content
 */
export async function DELETE(_request: NextRequest, { params }: { params: Params }) {
  try {
    const githubToken = await getGitHubToken();
    const userId = await getGitHubUserId();

    if (!githubToken || !userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { owner, repo } = await params;
    const key = `${owner}/${repo}`;

    await updateRepoNotes(String(userId), (data) => {
      const { [key]: _removed, ...rest } = data.notes;
      return { ...data, notes: rest };
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Delete repo note error:', error);
    return NextResponse.json({ error: 'Failed to delete repo note' }, { status: 500 });
  }
}
