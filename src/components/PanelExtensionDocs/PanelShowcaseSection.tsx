'use client';

import { useTheme } from '@a24z/industry-theme';
import { Bot, GitBranch, FolderOpen, BarChart3, FlaskConical, FileText } from 'lucide-react';

export function PanelShowcaseSection() {
  const { theme } = useTheme();

  const panels = [
    {
      Icon: Bot,
      name: 'AI Chat Panel',
      description: 'Intelligent code assistant with context awareness',
      features: ['Vercel AI SDK', 'Markdown rendering', 'Code highlighting', 'Stream responses'],
      status: 'In Development',
      packageName: '@principal-ade/ai-chat-panel',
    },
    {
      Icon: GitBranch,
      name: 'Git Status Panel',
      description: 'Visual git status with interactive staging',
      features: ['File status', 'Diff viewer', 'Stage/unstage', 'Commit history'],
      status: 'Planned',
      packageName: '@principal-ade/git-panel',
    },
    {
      Icon: FolderOpen,
      name: 'File Explorer Panel',
      description: 'Tree-based file navigation with search',
      features: ['Virtual scrolling', 'Fuzzy search', 'File icons', 'Context menu'],
      status: 'Planned',
      packageName: '@principal-ade/file-explorer-panel',
    },
    {
      Icon: BarChart3,
      name: 'Code Metrics Panel',
      description: 'Visualize code quality and complexity',
      features: ['LOC stats', 'Complexity graphs', 'Coverage reports', 'Trends'],
      status: 'Planned',
      packageName: '@principal-ade/metrics-panel',
    },
    {
      Icon: FlaskConical,
      name: 'Test Runner Panel',
      description: 'Run and monitor test suites',
      features: ['Watch mode', 'Coverage view', 'Test filtering', 'Results history'],
      status: 'Planned',
      packageName: '@principal-ade/test-panel',
    },
    {
      Icon: FileText,
      name: 'Markdown Editor Panel',
      description: 'Rich markdown editing with preview',
      features: ['Live preview', 'Syntax highlighting', 'Image upload', 'Export options'],
      status: 'Planned',
      packageName: '@principal-ade/markdown-panel',
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Available':
        return theme.colors.success || '#22c55e';
      case 'In Development':
        return theme.colors.warning || '#f59e0b';
      default:
        return theme.colors.textMuted;
    }
  };

  return (
    <section className="py-20 px-6" style={{ background: theme.colors.muted }}>
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4" style={{ color: theme.colors.text }}>
            Panel Showcase
          </h2>
          <p className="text-lg max-w-2xl mx-auto" style={{ color: theme.colors.textMuted }}>
            Example panels demonstrating the capabilities of the extension system
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {panels.map((panel, index) => (
            <div
              key={index}
              className="rounded-lg overflow-hidden transition-all hover:scale-102"
              style={{
                background: theme.colors.surface,
                border: `1px solid ${theme.colors.border}`,
              }}
            >
              {/* Panel Header */}
              <div
                className="p-6 border-b"
                style={{ borderColor: theme.colors.border }}
              >
                <div className="flex items-start gap-4">
                  <panel.Icon className="w-12 h-12 flex-shrink-0" style={{ color: theme.colors.primary }} />
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-bold" style={{ color: theme.colors.text }}>
                        {panel.name}
                      </h3>
                      <span
                        className="text-xs px-2 py-1 rounded"
                        style={{
                          background: getStatusColor(panel.status) + '20',
                          color: getStatusColor(panel.status),
                        }}
                      >
                        {panel.status}
                      </span>
                    </div>
                    <p className="text-sm mb-3" style={{ color: theme.colors.textMuted }}>
                      {panel.description}
                    </p>
                    <code
                      className="text-xs px-2 py-1 rounded"
                      style={{
                        background: theme.colors.background,
                        color: theme.colors.primary,
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                      }}
                    >
                      {panel.packageName}
                    </code>
                  </div>
                </div>
              </div>

              {/* Panel Preview */}
              <div className="p-6" style={{ background: theme.colors.background }}>
                <div className="text-xs font-medium mb-3" style={{ color: theme.colors.textMuted }}>
                  KEY FEATURES
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {panel.features.map((feature, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-sm p-2 rounded"
                      style={{ background: theme.colors.muted }}
                    >
                      <span style={{ color: theme.colors.primary }}>✓</span>
                      <span style={{ color: theme.colors.text }}>{feature}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div
                className="p-4 border-t flex gap-2"
                style={{ borderColor: theme.colors.border }}
              >
                <button
                  className="px-4 py-2 rounded text-sm font-medium flex-1 transition-all"
                  style={{
                    background: theme.colors.primary,
                    color: theme.colors.background,
                  }}
                  disabled={panel.status !== 'Available'}
                >
                  {panel.status === 'Available' ? 'Install' : 'Coming Soon'}
                </button>
                <button
                  className="px-4 py-2 rounded text-sm font-medium transition-all"
                  style={{
                    background: theme.colors.secondary,
                    color: theme.colors.text,
                  }}
                >
                  Learn More
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div
          className="mt-16 p-8 rounded-lg text-center"
          style={{
            background: theme.colors.surface,
            border: `1px solid ${theme.colors.border}`,
          }}
        >
          <h3 className="text-2xl font-bold mb-3" style={{ color: theme.colors.text }}>
            Build Your Own Panel
          </h3>
          <p className="text-lg mb-6" style={{ color: theme.colors.textMuted }}>
            Have an idea for a panel? The extension system makes it easy to create and share.
          </p>
          <div className="flex gap-4 justify-center">
            <button
              className="px-6 py-3 rounded-lg font-medium transition-all hover:scale-105"
              style={{
                background: theme.colors.primary,
                color: theme.colors.background,
              }}
            >
              Read the Spec
            </button>
            <button
              className="px-6 py-3 rounded-lg font-medium transition-all hover:scale-105"
              style={{
                background: theme.colors.secondary,
                color: theme.colors.text,
              }}
            >
              View Examples
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
