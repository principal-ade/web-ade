/**
 * Project a File City layout down to a 2D, panel-fitted set of rectangles for
 * the trail brief OG card.
 *
 * The full city is built from the repo tree (so positions/sizes are real), but
 * the brief card only shows the trail's *touched* files — the buildings whose
 * path a marker's `sourcePath` points at — mirroring the trail explorer's
 * filtered view. We take those buildings, top-down project (world x/z +
 * width/depth → screen x/y/w/h), fit their bounding box to the target panel,
 * and color each by file type. Pure data → the Satori card stays presentational.
 */

import { getFileColor } from '@principal-ai/file-city-builder';
import type { CityData } from '@principal-ai/file-city-builder';

export interface FileMapRect {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  path: string;
}

export interface FileMapData {
  /** Touched buildings, projected + colored, in trail (marker) order. */
  rects: FileMapRect[];
  /** Rect centers in the same order — the dashed trail walks these. */
  centers: Array<{ x: number; y: number }>;
  /** Panel dimensions the rects are laid out within. */
  w: number;
  h: number;
}

/**
 * @param touchedPaths repo-relative file paths in trail order (marker
 *   `sourcePath`s). Order is preserved so the trail path threads them.
 */
export function projectTouchedCity(
  city: CityData,
  touchedPaths: string[],
  targetW: number,
  targetH: number,
  pad = 34,
): FileMapData | null {
  const byPath = new Map(city.buildings.map((b) => [b.path, b]));

  // Preserve marker order; drop paths with no matching building, and de-dupe
  // (a file can be visited by several markers — show it once).
  const seen = new Set<string>();
  const touched = touchedPaths
    .filter((p) => {
      if (seen.has(p) || !byPath.has(p)) return false;
      seen.add(p);
      return true;
    })
    .map((p) => byPath.get(p)!);

  if (touched.length === 0) return null;

  // World-space top-down rects (x/z plane; dimensions are [w, height, depth]).
  const world = touched.map((b) => {
    const [dw, , dd] = b.dimensions;
    return { x0: b.position.x - dw / 2, z0: b.position.z - dd / 2, w: dw, h: dd, path: b.path };
  });

  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const r of world) {
    minX = Math.min(minX, r.x0);
    minZ = Math.min(minZ, r.z0);
    maxX = Math.max(maxX, r.x0 + r.w);
    maxZ = Math.max(maxZ, r.z0 + r.h);
  }

  const bw = maxX - minX || 1;
  const bh = maxZ - minZ || 1;
  const availW = targetW - pad * 2;
  const availH = targetH - pad * 2;
  const scale = Math.min(availW / bw, availH / bh);
  const offX = pad + (availW - bw * scale) / 2;
  const offY = pad + (availH - bh * scale) / 2;

  const rects: FileMapRect[] = world.map((r) => ({
    x: offX + (r.x0 - minX) * scale,
    y: offY + (r.z0 - minZ) * scale,
    w: Math.max(10, r.w * scale),
    h: Math.max(10, r.h * scale),
    color: getFileColor(r.path),
    path: r.path,
  }));

  const centers = rects.map((r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 }));

  return { rects, centers, w: targetW, h: targetH };
}
