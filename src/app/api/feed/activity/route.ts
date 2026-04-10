/**
 * Feed Activity API
 *
 * Returns aggregated activity (commits + PRs) from followed users and repos.
 * Requires authentication.
 */

import { NextResponse } from 'next/server';
import { getGitHubToken, getGitHubUserId } from '@/lib/auth/cookies';
import { getUserFeedProfile } from '@/lib/feed-collections/s3-storage';
import {
  fetchFollowedUsersActivity,
  fetchFollowedReposActivity,
} from '@/lib/feed-activity/fetchers';
import type { FeedActivityResponse } from '@/lib/feed-activity/types';

export async function GET() {
  try {
    const userToken = await getGitHubToken();
    const githubId = await getGitHubUserId();

    if (!userToken || !githubId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Get user's watches from S3
    const profile = await getUserFeedProfile(String(githubId));
    const followedUsers = profile?.watchedUsers ?? [];
    const followedRepos = profile?.watchedRepos ?? [];

    // If no watches, return empty activity
    if (followedUsers.length === 0 && followedRepos.length === 0) {
      const response: FeedActivityResponse = {
        activity: [],
        followedUsersCount: 0,
        followedReposCount: 0,
      };
      return NextResponse.json(response);
    }

    // Fetch activity in parallel
    const [userActivities, repoActivities] = await Promise.all([
      fetchFollowedUsersActivity(followedUsers, userToken),
      fetchFollowedReposActivity(followedRepos, userToken),
    ]);

    // Merge and sort by timestamp (newest first)
    const allActivity = [...userActivities, ...repoActivities]
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )
      .slice(0, 50); // Limit to 50 most recent

    const response: FeedActivityResponse = {
      activity: allActivity,
      followedUsersCount: followedUsers.length,
      followedReposCount: followedRepos.length,
    };

    const jsonResponse = NextResponse.json(response);

    // Cache for 2 minutes
    jsonResponse.headers.set(
      'Cache-Control',
      'private, max-age=120, stale-while-revalidate=240'
    );

    return jsonResponse;
  } catch (error) {
    console.error('[feed-activity] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
