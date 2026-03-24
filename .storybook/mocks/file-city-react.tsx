/**
 * Mock for @principal-ai/file-city-react
 * Used in Storybook to avoid bundling issues with the real package
 */
import React from 'react';

// Mock ArchitectureMapHighlightLayers component
export const ArchitectureMapHighlightLayers: React.FC<{
  cityData: unknown;
  highlightLayers?: unknown[];
  fullSize?: boolean;
  showFileNames?: boolean;
  canvasBackgroundColor?: string;
}> = ({ canvasBackgroundColor = '#f6f8fa' }) => {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: canvasBackgroundColor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 4,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          color: '#57606a',
          fontSize: 12,
        }}
      >
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        <span>File City Preview</span>
      </div>
    </div>
  );
};

// Mock MultiVersionCityBuilder
export const MultiVersionCityBuilder = {
  build: (versionMap: Map<string, unknown>) => ({
    unionCity: {
      buildings: [],
      districts: [],
      stats: { totalFiles: 0, totalDirectories: 0 },
    },
    versionCities: versionMap,
  }),
};

// Mock types
export interface CityData {
  buildings: unknown[];
  districts: unknown[];
  stats: { totalFiles: number; totalDirectories: number };
}

export interface HighlightLayer {
  id: string;
  name: string;
  enabled: boolean;
  color: string;
  priority: number;
  items: Array<{
    path: string;
    type: 'file' | 'directory';
    renderStrategy: 'glow' | 'border';
  }>;
}

export interface FileTree {
  sha: string;
  root: unknown;
  allFiles: unknown[];
  allDirectories: unknown[];
  stats: {
    totalFiles: number;
    totalDirectories: number;
    totalSize: number;
    maxDepth: number;
  };
  metadata: unknown;
}
