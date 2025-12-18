import type { NextConfig } from "next";
import MonacoWebpackPlugin from "monaco-editor-webpack-plugin";

const nextConfig: NextConfig = {
  /* config options here */
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
