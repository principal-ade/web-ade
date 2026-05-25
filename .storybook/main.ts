import type { StorybookConfig } from "@storybook/nextjs-vite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
  "stories": [
    "../src/**/*.mdx",
    "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)",
    "../stories/**/*.stories.@(js|jsx|mjs|ts|tsx)"
  ],
  "addons": [
    "@chromatic-com/storybook",
    "@storybook/addon-docs",
    "@storybook/addon-a11y",
    "@storybook/addon-vitest"
  ],
  "framework": {
    "name": "@storybook/nextjs-vite",
    "options": {}
  },
  "staticDirs": [
    "../public"
  ],
  async viteFinal(config) {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...config.resolve.alias,
      "@": path.resolve(__dirname, "../src"),
      // Mock File City packages to avoid bundling issues
      "@principal-ai/file-city-react": path.resolve(__dirname, "./mocks/file-city-react.tsx"),
      // file-city-builder's package.json points "module" at a non-existent index.mjs;
      // alias the bare specifier to the real dist/index.js so Vite/esbuild can resolve it.
      "@principal-ai/file-city-builder": path.resolve(
        __dirname,
        "../node_modules/@principal-ai/file-city-builder/dist/index.js",
      ),
    };

    return config;
  },
};
export default config;
