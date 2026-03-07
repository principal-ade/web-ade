/**
 * OTEL Canvas Coverage Highlight Layers
 *
 * Converts OTEL canvas node references (pv.otel.files) into HighlightLayers
 * for visualization in the File City panel.
 */

import type { HighlightLayer } from '@industry-theme/file-city-panel';
import type { ExtendedCanvas, ExtendedCanvasNode } from '@principal-ai/principal-view-core';

export interface OtelCoverageOptions {
  /** Include draft nodes (default: false) */
  showDraft?: boolean;
  /** Include approved nodes (default: true) */
  showApproved?: boolean;
  /** Include implemented nodes (default: true) */
  showImplemented?: boolean;
}

export interface ParsedOtelCanvas {
  path: string;
  content: ExtendedCanvas;
}

/**
 * Extract file paths from a canvas node
 * Checks in order of preference:
 * 1. pv.otel.files (current standard)
 * 2. pv.references (for file references)
 * 3. pv.sources (deprecated, for backward compatibility)
 */
function getOtelFiles(node: ExtendedCanvasNode): string[] {
  // Primary: pv.otel.files
  if (node.pv?.otel?.files && node.pv.otel.files.length > 0) {
    return node.pv.otel.files;
  }

  // Secondary: pv.references (filter to file paths only)
  if (node.pv?.references && node.pv.references.length > 0) {
    // Filter out URLs and package names, keep only file paths
    return node.pv.references.filter(
      (ref) => !ref.startsWith('http') && !ref.startsWith('@') && (ref.includes('/') || ref.endsWith('.ts') || ref.endsWith('.tsx'))
    );
  }

  // Deprecated: pv.sources (for backward compatibility)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sources = (node.pv as any)?.sources;
  if (sources && Array.isArray(sources) && sources.length > 0) {
    return sources;
  }

  return [];
}

/**
 * Get the implementation status of a node
 */
function getNodeStatus(node: ExtendedCanvasNode): 'draft' | 'approved' | 'implemented' | undefined {
  return node.pv?.status;
}

/**
 * Check if a node has an event definition (inline or reference)
 */
function hasEvent(node: ExtendedCanvasNode): boolean {
  return !!(node.pv?.event?.name || node.pv?.eventRef);
}

/**
 * Build HighlightLayers from OTEL canvas files for File City visualization.
 *
 * Groups files by their implementation status:
 * - Implemented (green): Files with instrumentation code
 * - Approved (amber): Files approved for instrumentation, pending implementation
 * - Draft (gray): Design phase, not yet approved
 *
 * @param canvases - Array of parsed OTEL canvas files
 * @param options - Configuration options
 * @returns Array of HighlightLayers for the File City panel
 */
export function buildOtelHighlightLayers(
  canvases: ParsedOtelCanvas[],
  options: OtelCoverageOptions = {}
): HighlightLayer[] {
  const { showDraft = false, showApproved = true, showImplemented = true } = options;

  // Group files by status
  const implementedFiles = new Set<string>();
  const approvedFiles = new Set<string>();
  const draftFiles = new Set<string>();

  for (const canvas of canvases) {
    const nodes = canvas.content.nodes || [];

    for (const node of nodes) {
      // Only process nodes with events (telemetry points)
      if (!hasEvent(node)) continue;

      const status = getNodeStatus(node);
      const files = getOtelFiles(node);

      for (const file of files) {
        // Normalize path (remove leading ./ if present)
        const normalizedPath = file.replace(/^\.\//, '');

        if (status === 'implemented') {
          implementedFiles.add(normalizedPath);
        } else if (status === 'approved') {
          approvedFiles.add(normalizedPath);
        } else if (status === 'draft') {
          draftFiles.add(normalizedPath);
        }
      }
    }
  }

  const layers: HighlightLayer[] = [];

  if (showImplemented && implementedFiles.size > 0) {
    layers.push({
      id: 'otel-implemented',
      name: 'Instrumented',
      enabled: true,
      color: '#22c55e', // green-500
      priority: 140,
      items: [...implementedFiles].map((path) => ({
        path,
        type: 'file' as const,
        renderStrategy: 'fill' as const,
      })),
    });
  }

  if (showApproved && approvedFiles.size > 0) {
    layers.push({
      id: 'otel-approved',
      name: 'Approved (pending)',
      enabled: true,
      color: '#f59e0b', // amber-500
      priority: 130,
      items: [...approvedFiles].map((path) => ({
        path,
        type: 'file' as const,
        renderStrategy: 'fill' as const,
      })),
    });
  }

  if (showDraft && draftFiles.size > 0) {
    layers.push({
      id: 'otel-draft',
      name: 'Draft',
      enabled: false, // disabled by default
      color: '#6b7280', // gray-500
      priority: 120,
      items: [...draftFiles].map((path) => ({
        path,
        type: 'file' as const,
        renderStrategy: 'border' as const,
      })),
    });
  }

  return layers;
}

/**
 * Count files by status from OTEL canvases
 */
export function countOtelCoverageFiles(canvases: ParsedOtelCanvas[]): {
  implemented: number;
  approved: number;
  draft: number;
  total: number;
} {
  const implementedFiles = new Set<string>();
  const approvedFiles = new Set<string>();
  const draftFiles = new Set<string>();

  for (const canvas of canvases) {
    const nodes = canvas.content.nodes || [];

    for (const node of nodes) {
      if (!hasEvent(node)) continue;

      const status = getNodeStatus(node);
      const files = getOtelFiles(node);

      for (const file of files) {
        const normalizedPath = file.replace(/^\.\//, '');

        if (status === 'implemented') {
          implementedFiles.add(normalizedPath);
        } else if (status === 'approved') {
          approvedFiles.add(normalizedPath);
        } else if (status === 'draft') {
          draftFiles.add(normalizedPath);
        }
      }
    }
  }

  return {
    implemented: implementedFiles.size,
    approved: approvedFiles.size,
    draft: draftFiles.size,
    total: implementedFiles.size + approvedFiles.size + draftFiles.size,
  };
}
