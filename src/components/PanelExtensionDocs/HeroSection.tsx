'use client';

import { useTheme } from '@a24z/industry-theme';
import { Bot, GitBranch, FolderOpen } from 'lucide-react';

export function HeroSection() {
  const { theme } = useTheme();

  return (
    <section
      className="relative overflow-hidden py-20 px-6"
      style={{
        background: `linear-gradient(135deg, ${theme.colors.background} 0%, ${theme.colors.muted} 100%)`,
      }}
    >
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <div className="inline-block mb-4 px-4 py-2 rounded-full text-sm font-medium"
            style={{
              background: theme.colors.primary,
              color: theme.colors.primaryForeground,
            }}
          >
            Panel Extension System
          </div>

          <h1 className="text-5xl font-bold mb-6" style={{ color: theme.colors.foreground }}>
            Build Once, Run Anywhere
          </h1>

          <p className="text-xl mb-8 max-w-3xl mx-auto" style={{ color: theme.colors.mutedForeground }}>
            Create powerful, reusable React components that seamlessly integrate into any application.
            Distributed via NPM, themed automatically, and loaded dynamically.
          </p>

          <div className="flex gap-4 justify-center">
            <button
              className="px-6 py-3 rounded-lg font-medium transition-all hover:scale-105"
              style={{
                background: theme.colors.primary,
                color: theme.colors.primaryForeground,
              }}
            >
              Get Started →
            </button>
            <button
              className="px-6 py-3 rounded-lg font-medium transition-all hover:scale-105"
              style={{
                background: theme.colors.secondary,
                color: theme.colors.secondaryForeground,
              }}
            >
              View Spec
            </button>
          </div>
        </div>

        {/* Visual representation */}
        <div className="mt-16 relative">
          <div
            className="rounded-lg p-8 shadow-2xl"
            style={{
              background: theme.colors.card,
              border: `1px solid ${theme.colors.border}`,
            }}
          >
            <div className="flex items-center gap-3 mb-6 pb-4 border-b" style={{ borderColor: theme.colors.border }}>
              <div className="flex gap-2">
                <div className="w-3 h-3 rounded-full" style={{ background: '#ff5f56' }}></div>
                <div className="w-3 h-3 rounded-full" style={{ background: '#ffbd2e' }}></div>
                <div className="w-3 h-3 rounded-full" style={{ background: '#27c93f' }}></div>
              </div>
              <div className="text-sm" style={{ color: theme.colors.mutedForeground }}>
                Your Application
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {[
                { name: 'AI Chat Panel', Icon: Bot },
                { name: 'Git Status Panel', Icon: GitBranch },
                { name: 'File Explorer Panel', Icon: FolderOpen }
              ].map((panel, i) => (
                <div
                  key={i}
                  className="p-6 rounded-lg text-center"
                  style={{
                    background: theme.colors.muted,
                    border: `1px solid ${theme.colors.border}`,
                  }}
                >
                  <panel.Icon className="w-8 h-8 mx-auto mb-2" style={{ color: theme.colors.primary }} />
                  <div className="text-sm font-medium" style={{ color: theme.colors.foreground }}>
                    {panel.name}
                  </div>
                  <div className="text-xs mt-2" style={{ color: theme.colors.mutedForeground }}>
                    npm package
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
