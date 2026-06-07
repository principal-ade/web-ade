/**
 * Build a trail's File City map: the full-tree → touched-files projection used
 * by both the trail OG card (`/api/og/trail/[id]`) and the standalone map image
 * (`/api/og/trail/[id]/map`) consumed by the live feed `TrailCard`.
 *
 * Best-effort: a tree-fetch failure (or a trail with no resolvable touched
 * files) returns `null` so callers can render without a map rather than fail.
 */

import { projectTouchedCity, type FileMapData } from '@/components/trail/og/fileCityProjection';
import type { TrailPayload } from '@/lib/trails/types';
import type { CityData } from '@principal-ai/file-city-builder';

export async function buildTrailFileMap(
  baseUrl: string,
  owner: string,
  repo: string,
  payload: TrailPayload,
  size: number
): Promise<FileMapData | null> {
  const touchedPaths = (payload.markers ?? [])
    .map((m) => m.sourcePath)
    .filter((p): p is string => !!p);

  if (touchedPaths.length === 0) return null;

  try {
    const cityRes = await fetch(
      `${baseUrl}/api/file-city-data/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      { cache: 'no-store' }
    );
    if (!cityRes.ok) return null;
    const { cityData }: { cityData: CityData } = await cityRes.json();
    return projectTouchedCity(cityData, touchedPaths, size, size);
  } catch {
    return null;
  }
}
