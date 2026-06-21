/**
 * Build a repo's full File City map: the whole-tree → every-building
 * projection used by the repo OG card (`/api/card/[owner]/[repo]`).
 *
 * Mirrors `buildTrailFileMap`, but projects the entire city (all files colored
 * by type, no trail) via `projectFullCity` rather than only a trail's touched
 * files. Best-effort: a tree-fetch failure returns `null` so the card can
 * render without a map rather than fail.
 */

import { projectFullCity, type FileMapData } from '@/components/trail/og/fileCityProjection';
import type { CityData } from '@principal-ai/file-city-builder';

export async function buildRepoFileMap(
  baseUrl: string,
  owner: string,
  repo: string,
  size: number,
  pad?: number,
  /** Cap on rendered buildings (largest kept) to bound Satori on huge repos. */
  maxBuildings = 2000
): Promise<FileMapData | null> {
  try {
    const cityRes = await fetch(
      `${baseUrl}/api/file-city-data/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      { cache: 'no-store' }
    );
    if (!cityRes.ok) return null;
    const { cityData }: { cityData: CityData } = await cityRes.json();
    return projectFullCity(cityData, size, size, pad, maxBuildings);
  } catch {
    return null;
  }
}
