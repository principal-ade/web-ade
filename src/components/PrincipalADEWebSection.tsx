'use client';

import { useTheme } from '@a24z/industry-theme';
import { FolderTree, MessageSquare, Terminal } from 'lucide-react';
import Link from 'next/link';
import { ThreePanelLayout } from '@principal-ade/panel-layouts';
import { EmptyStatePanel } from './EmptyStatePanel';
import '@a24z/panels/panels.css';

export function PrincipalADEWebSection() {
  const { theme } = useTheme();

  return (
    <section
      className="relative overflow-hidden h-full flex items-center px-6"
      style={{
        background: `linear-gradient(135deg, ${theme.colors.background} 0%, ${theme.colors.muted} 100%)`,
      }}
    >
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <div
            className="inline-block mb-4 px-4 py-2 rounded-full text-sm font-medium"
            style={{
              background: theme.colors.primary,
              color: theme.colors.background,
            }}
          >
            Principal ADE Web
          </div>

          <h1 className="text-5xl font-bold mb-6" style={{ color: theme.colors.text }}>
            Your Git-Based Agentic Workspace
          </h1>

          <p className="text-xl mb-8 max-w-3xl mx-auto" style={{ color: theme.colors.textMuted }}>
            Experience the next generation of AI-powered development. Built with extensible panels,
            powered by advanced AI, and designed for modern workflows.
          </p>

          <div className="flex gap-4 justify-center">
            <Link
              href="/editor"
              className="px-6 py-3 rounded-lg font-medium transition-all hover:scale-105"
              style={{
                background: theme.colors.primary,
                color: theme.colors.background,
              }}
            >
              Try Editor →
            </Link>
            <button
              className="px-6 py-3 rounded-lg font-medium transition-all hover:scale-105"
              style={{
                background: theme.colors.secondary,
                color: theme.colors.text,
              }}
            >
              Learn More
            </button>
          </div>
        </div>

        {/* Visual representation */}
        <div className="mt-16 relative">
          <div
            className="rounded-lg shadow-2xl overflow-hidden"
            style={{
              background: theme.colors.surface,
              border: `1px solid ${theme.colors.border}`,
              height: '500px',
            }}
          >
            <ThreePanelLayout
              theme={theme}
              leftPanel={
                <EmptyStatePanel
                  title="File Explorer"
                  description="Browse your project files"
                  Icon={FolderTree}
                />
              }
              middlePanel={
                <EmptyStatePanel
                  title="AI Chat"
                  description="Chat with your AI assistant"
                  Icon={MessageSquare}
                />
              }
              rightPanel={
                <EmptyStatePanel
                  title="Terminal"
                  description="Run commands and see output"
                  Icon={Terminal}
                />
              }
              defaultSizes={{
                left: 25,
                middle: 50,
                right: 25,
              }}
              minSizes={{
                left: 15,
                middle: 30,
                right: 20,
              }}
              collapsiblePanels={{
                left: true,
                right: true,
              }}
              showCollapseButtons={false}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
