/**
 * Project a File City layout down to a 2D, panel-fitted set of rectangles for
 * the trail brief OG card.
 *
 * The full city is built from the repo tree (so positions/sizes are real). We
 * frame to the *whole* city — every directory district is projected as a back
 * layer so the map reads as the real codebase — but only the trail's *touched*
 * files (the buildings a marker's `sourcePath` points at) are drawn on top,
 * colored + threaded by the dashed trail. So you get all directories for
 * context without the noise of every file. Top-down projection (world x/z +
 * width/depth → screen x/y/w/h), full-city bounds fit to the target panel.
 * Pure data → the Satori card stays presentational.
 */

import { getFileColor } from '@principal-ai/file-city-builder';
import type { CityData, CityDistrict } from '@principal-ai/file-city-builder';

export interface FileMapRect {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  path: string;
}

/** A projected directory platform. `depth` is its nesting level (0 = top). */
export interface FileMapDistrict {
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
}

export interface FileMapData {
  /** Touched buildings, projected + colored, in trail (marker) order. */
  rects: FileMapRect[];
  /** Rect centers in the same order — the dashed trail walks these. */
  centers: Array<{ x: number; y: number }>;
  /** Every directory district, projected as a back layer (context). */
  districts: FileMapDistrict[];
  /** Panel dimensions the rects are laid out within. */
  w: number;
  h: number;
}

/** Flatten the district tree (districts can nest via `children`) into a flat
 *  list carrying each node's nesting depth. */
function flattenDistricts(
  districts: CityDistrict[],
  depth = 0,
  acc: Array<{ d: CityDistrict; depth: number }> = [],
): Array<{ d: CityDistrict; depth: number }> {
  for (const d of districts) {
    acc.push({ d, depth });
    if (d.children?.length) flattenDistricts(d.children, depth + 1, acc);
  }
  return acc;
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

  const districtNodes = flattenDistricts(city.districts);

  // Frame to the WHOLE city so every directory fits. Prefer the precomputed
  // city bounds; fall back to the union of districts + buildings if degenerate.
  let { minX, minZ, maxX, maxZ } = city.bounds;
  if (!(maxX > minX && maxZ > minZ)) {
    minX = Infinity;
    minZ = Infinity;
    maxX = -Infinity;
    maxZ = -Infinity;
    for (const { d } of districtNodes) {
      minX = Math.min(minX, d.worldBounds.minX);
      minZ = Math.min(minZ, d.worldBounds.minZ);
      maxX = Math.max(maxX, d.worldBounds.maxX);
      maxZ = Math.max(maxZ, d.worldBounds.maxZ);
    }
    for (const b of city.buildings) {
      const [dw, , dd] = b.dimensions;
      minX = Math.min(minX, b.position.x - dw / 2);
      minZ = Math.min(minZ, b.position.z - dd / 2);
      maxX = Math.max(maxX, b.position.x + dw / 2);
      maxZ = Math.max(maxZ, b.position.z + dd / 2);
    }
  }

  const bw = maxX - minX || 1;
  const bh = maxZ - minZ || 1;
  const availW = targetW - pad * 2;
  const availH = targetH - pad * 2;
  const scale = Math.min(availW / bw, availH / bh);
  const offX = pad + (availW - bw * scale) / 2;
  const offY = pad + (availH - bh * scale) / 2;
  const sx = (x: number) => offX + (x - minX) * scale;
  const sy = (z: number) => offY + (z - minZ) * scale;

  // All directory platforms (back layer). Largest first so nested dirs paint
  // on top of their parents.
  const districts: FileMapDistrict[] = districtNodes
    .map(({ d, depth }) => ({
      x: sx(d.worldBounds.minX),
      y: sy(d.worldBounds.minZ),
      w: Math.max(2, (d.worldBounds.maxX - d.worldBounds.minX) * scale),
      h: Math.max(2, (d.worldBounds.maxZ - d.worldBounds.minZ) * scale),
      depth,
    }))
    .sort((a, b) => a.depth - b.depth);

  // Touched files only (front layer), at their real positions in the framed city.
  const rects: FileMapRect[] = touched.map((b) => {
    const [dw, , dd] = b.dimensions;
    return {
      x: sx(b.position.x - dw / 2),
      y: sy(b.position.z - dd / 2),
      w: Math.max(8, dw * scale),
      h: Math.max(8, dd * scale),
      color: getFileColor(b.path),
      path: b.path,
    };
  });

  const centers = rects.map((r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 }));

  return { rects, centers, districts, w: targetW, h: targetH };
}
