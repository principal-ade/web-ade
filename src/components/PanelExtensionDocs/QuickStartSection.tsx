'use client';

import { useTheme } from '@principal-ade/industry-theme';
import { useState } from 'react';
import { Lightbulb, Package, Hammer, Rocket } from 'lucide-react';

export function QuickStartSection() {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState(0);

  const codeExamples = [
    {
      title: '1. Package Setup',
      language: 'json',
      code: `{
  "name": "@my-org/awesome-panel",
  "version": "1.0.0",
  "main": "dist/panel.bundle.js",
  "keywords": ["panel-extension"],
  "peerDependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  },
  "dependencies": {
    "date-fns": "^2.29.0"
  }
}`,
    },
    {
      title: '2. Export Metadata',
      language: 'typescript',
      code: `export const metadata = {
  id: 'my-org.awesome-panel',
  name: 'Awesome Panel',
  icon: '🚀',
  version: '1.0.0',
  author: 'My Organization',
  description: 'A panel that does awesome things'
};`,
    },
    {
      title: '3. Create Component',
      language: 'typescript',
      code: `import React from 'react';
import type { PanelComponentProps } from './types';

const MyPanel: React.FC<PanelComponentProps> = ({
  context,
  actions,
  events
}) => {
  const { repositoryPath, gitStatus } = context;

  return (
    <div className="p-4">
      <h2>Awesome Panel 🚀</h2>
      <p>Repository: {repositoryPath}</p>
      <p>Files changed: {gitStatus.unstaged.length}</p>
      <button onClick={() => actions.openFile?.('README.md')}>
        Open README
      </button>
    </div>
  );
};

export default MyPanel;`,
    },
    {
      title: '4. Add Lifecycle Hooks',
      language: 'typescript',
      code: `export const onMount = async (context) => {
  console.log('Panel mounted:', context.repositoryPath);
  // Initialize panel-specific data
  if (context.hasSlice('git')) {
    await context.refresh();
  }
};

export const onUnmount = async (context) => {
  console.log('Panel unmounting');
  // Cleanup resources
};

export const onDataChange = (slice, data) => {
  console.log(\`Data slice '\${slice}' changed\`, data);
  // React to data changes
};`,
    },
  ];

  return (
    <section className="py-20 px-6" style={{ background: theme.colors.muted }}>
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4" style={{ color: theme.colors.text }}>
            Quick Start
          </h2>
          <p className="text-lg max-w-2xl mx-auto" style={{ color: theme.colors.textMuted }}>
            Create your first panel extension in 4 simple steps
          </p>
        </div>

        <div
          className="rounded-lg overflow-hidden"
          style={{
            background: theme.colors.surface,
            border: `1px solid ${theme.colors.border}`,
          }}
        >
          {/* Tabs */}
          <div
            className="flex border-b"
            style={{ borderColor: theme.colors.border }}
          >
            {codeExamples.map((example, index) => (
              <button
                key={index}
                onClick={() => setActiveTab(index)}
                className="px-6 py-3 text-sm font-medium transition-colors"
                style={{
                  background: activeTab === index ? theme.colors.background : 'transparent',
                  color: activeTab === index ? theme.colors.text : theme.colors.textMuted,
                  borderBottom: activeTab === index ? `2px solid ${theme.colors.primary}` : 'none',
                }}
              >
                {example.title}
              </button>
            ))}
          </div>

          {/* Code Content */}
          <div className="p-6">
            <div
              className="rounded-lg p-6 overflow-x-auto"
              style={{
                background: theme.colors.background,
                border: `1px solid ${theme.colors.border}`,
              }}
            >
              <pre
                className="text-sm"
                style={{
                  color: theme.colors.text,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                }}
              >
                <code>{codeExamples[activeTab]?.code}</code>
              </pre>
            </div>

            <div className="mt-4 flex items-start gap-3">
              <Lightbulb className="w-6 h-6 flex-shrink-0" style={{ color: theme.colors.primary }} />
              <div>
                <p className="text-sm" style={{ color: theme.colors.textMuted }}>
                  {activeTab === 0 && 'The "panel-extension" keyword is required for discovery. Use peerDependencies for shared libraries.'}
                  {activeTab === 1 && 'Metadata must export id, name, and optionally icon, version, author, and description.'}
                  {activeTab === 2 && 'Your component receives context (data), actions (methods), and events (pub/sub) via props.'}
                  {activeTab === 3 && 'Lifecycle hooks are optional but recommended for initialization and cleanup.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* CLI Commands */}
        <div className="mt-8 grid md:grid-cols-3 gap-4">
          {[
            { Icon: Package, cmd: 'npm install', desc: 'Install dependencies' },
            { Icon: Hammer, cmd: 'npm run build', desc: 'Build your panel' },
            { Icon: Rocket, cmd: 'npm publish', desc: 'Publish to NPM' },
          ].map((item, i) => (
            <div
              key={i}
              className="p-4 rounded-lg"
              style={{
                background: theme.colors.surface,
                border: `1px solid ${theme.colors.border}`,
              }}
            >
              <item.Icon className="w-8 h-8 mb-2" style={{ color: theme.colors.primary }} />
              <code
                className="block px-3 py-2 rounded text-sm mb-2"
                style={{
                  background: theme.colors.background,
                  color: theme.colors.primary,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                }}
              >
                {item.cmd}
              </code>
              <p className="text-sm" style={{ color: theme.colors.textMuted }}>
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
