import { NextResponse } from 'next/server';
import { TrailShareError } from '@/lib/trails/types';
import { getOrBuildCarousel } from '@/lib/community-carousel/carousel-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errorResponse(error: unknown): NextResponse {
  if (error instanceof TrailShareError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode }
    );
  }
  console.error('[Carousel] route error:', error);
  return NextResponse.json({ error: 'Request failed' }, { status: 500 });
}

export async function GET() {
  try {
    const carousel = await getOrBuildCarousel();
    return NextResponse.json(carousel);
  } catch (error) {
    return errorResponse(error);
  }
}
