/**
 * POST /api/auth/logout
 *
 * Clears all authentication cookies and ends the session.
 */

import { NextResponse } from 'next/server';
import { clearAuthCookies } from '@/lib/auth/cookies';

export async function POST() {
  try {
    // Clear all authentication cookies
    await clearAuthCookies();

    return NextResponse.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      {
        error: 'Failed to logout',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
