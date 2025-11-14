import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  webpack: (config) => {
    // Exclude Storybook files from Next.js build
    config.module.rules.push({
      test: /\.stories\.(ts|tsx|js|jsx)$/,
      use: 'null-loader'
    });
    return config;
  }
};

export default nextConfig;
