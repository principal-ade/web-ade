import type { NextConfig } from "next";
import MonacoWebpackPlugin from "monaco-editor-webpack-plugin";

const nextConfig: NextConfig = {
  // Disable type checking and linting during production builds
  // These should be handled in CI/pre-commit hooks to avoid OOM errors
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Limit worker processes during build to prevent OOM in CI environments
  experimental: {
    workerThreads: false,
    cpus: 1,
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
