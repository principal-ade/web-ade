'use client';

import { useTheme } from '@a24z/industry-theme';
import { FolderTree, MessageSquare, Terminal } from 'lucide-react';
import Link from 'next/link';
import { EditableConfigurablePanelLayout } from '@principal-ade/panel-layouts';
import { EmptyStatePanel } from './EmptyStatePanel';
import { useState } from 'react';
import '@principal-ade/panel-layouts/styles.css';

export function PrincipalADEWebSection() {
  const { theme } = useTheme();
  const [isEditMode, setIsEditMode] = useState(false);
  const [layout, setLayout] = useState({
    left: 'file-explorer',
    middle: 'ai-chat',
    right: 'terminal',
  });

  const panels = [
    {
      id: 'file-explorer',
      label: 'File Explorer',
      content: (
        <EmptyStatePanel
          title="File Explorer"
          description="Browse your project files"
          Icon={FolderTree}
        />
      ),
    },
    {
      id: 'ai-chat',
      label: 'AI Chat',
      content: (
        <EmptyStatePanel
          title="AI Chat"
          description="Chat with your AI assistant"
          Icon={MessageSquare}
        />
      ),
    },
    {
      id: 'terminal',
      label: 'Terminal',
      content: (
        <EmptyStatePanel
          title="Terminal"
          description="Run commands and see output"
          Icon={Terminal}
        />
      ),
    },
  ];

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
              onClick={() => setIsEditMode(!isEditMode)}
              className="px-6 py-3 rounded-lg font-medium transition-all hover:scale-105"
              style={{
                background: isEditMode ? theme.colors.primary : theme.colors.secondary,
                color: isEditMode ? theme.colors.background : theme.colors.text,
              }}
            >
              {isEditMode ? 'Done Editing' : 'Customize Layout'}
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
            <EditableConfigurablePanelLayout
              theme={theme}
              panels={panels}
              layout={layout}
              isEditMode={isEditMode}
              onLayoutChange={setLayout}
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
