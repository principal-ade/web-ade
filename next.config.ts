import type { NextConfig } from "next";
import MonacoWebpackPlugin from "monaco-editor-webpack-plugin";

const nextConfig: NextConfig = {
  // Disabled because StrictMode's intentional mount→unmount→remount on first
  // mount tears down and recreates Three.js / WebGL canvases (File City,
  // sequence explorer) faster than the GPU can dispose them, producing
  // `THREE.WebGLRenderer: Context Lost` warnings and visible re-init flicker.
  // Production builds have no StrictMode double-mount, so this only affects
  // dev. We lose StrictMode's effect double-invocation check in exchange.
  reactStrictMode: false,
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
