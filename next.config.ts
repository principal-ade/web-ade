import type { NextConfig } from "next";
import MonacoWebpackPlugin from "monaco-editor-webpack-plugin";

const nextConfig: NextConfig = {
  // Disable type checking and linting during production builds
  // These are handled in pre-commit hooks for faster CI builds
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Transpile Three.js ecosystem packages to prevent code splitting issues
  transpilePackages: [
    'three',
    '@react-three/fiber',
    '@react-three/drei',
    '@react-spring/three',
    'troika-three-text',
  ],
  // Include Three.js packages in the main bundle to avoid lazy loading
  experimental: {
    optimizePackageImports: [
      'three',
      '@react-three/fiber',
      '@react-three/drei',
      '@react-spring/three',
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'github.com',
      },
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
      {
        protocol: 'https',
        hostname: '*.githubusercontent.com',
      },
    ],
  },
  webpack: (config, { isServer }) => {
    // Exclude test and storybook config files
    config.externals = config.externals || [];
    if (!isServer) {
      config.externals.push({
        'vitest/config': 'vitest/config',
        '@storybook/addon-vitest/vitest-plugin': '@storybook/addon-vitest/vitest-plugin',
      });

      // @pierre/diffs and @pierre/trees both register a custom element
      // (`<diffs-container>`, `<file-tree-container>`) via a side-effect-only
      // module at `dist/components/web-components.js` that attaches Shadow
      // DOM stylesheets. Each package's `sideEffects` field only marks that
      // one file, and the chain that imports it gets tree-shaken when
      // consumers — like @industry-theme/file-city-panel — only import the
      // React entry (`@pierre/diffs/react`, `@pierre/trees/react`), which
      // doesn't pull in `web-components.js`. Without the side effect, the
      // element never upgrades and Pierre's `:host`-scoped styles no-op.
      // Override the package-level sideEffects allow-list so webpack
      // preserves the registration.
      config.module.rules.push({
        test: /[\\/]node_modules[\\/]@pierre[\\/](?:diffs|trees)[\\/]/,
        sideEffects: true,
      });

      // Configure Monaco editor workers
      config.plugins.push(
        new MonacoWebpackPlugin({
          languages: [
            'javascript',
            'typescript',
            'json',
            'html',
            'css',
            'markdown',
            'python',
            'yaml',
          ],
          filename: 'static/[name].worker.js',
        })
      );
    }
    return config;
  },
};

export default nextConfig;
