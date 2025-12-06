'use client';

import { useParams } from "next/navigation";
import { useTheme } from "@principal-ade/industry-theme";
import { useState, useEffect } from "react";
import { PanelProvider, usePanelProvider } from "@/contexts/PanelContext";
import { EditorHeader } from "@/components/EditorHeader";
import dynamic from "next/dynamic";
import {
  EditableConfigurablePanelLayout,
  ResponsiveConfigurablePanelLayout,
  PanelLayout,
} from "@principal-ade/panel-layouts";
import '@principal-ade/panel-layouts/styles.css';
import { ExternalLink } from 'lucide-react';

// Dynamically import the OwnerRepositoriesPanel with SSR disabled
const OwnerRepositoriesPanelLoader = dynamic(
  () => import('@industry-theme/github-panels').then((mod) => {
    const Component = mod.panels[2]!.component as React.ComponentType<
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      any
    >;
    return { default: Component };
  }),
  { ssr: false }
);

// Dynamically import the MarkdownPanel with SSR disabled
const MarkdownPanelLoader = dynamic(
  () => import('@industry-theme/markdown-panels').then((mod) => {
    const Component = mod.panels[0]!.component;
    return { default: Component };
  }),
  { ssr: false }
);

function OwnerPageContent({ owner }: { owner: string }) {
  const { theme } = useTheme();
  const { context, actions, events } = usePanelProvider();
  const [isMobile, setIsMobile] = useState(false);
  const [previewedRepo, setPreviewedRepo] = useState<string | null>(null);
  const [layout] = useState<PanelLayout>({
    left: 'owner-repositories',
    middle: 'markdown-viewer',
    right: 'empty',
  });

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Listen for repository preview events
  useEffect(() => {
    if (!events) return;

    const unsubscribers = [
      events.on('repository:preview', (event) => {
        const payload = event.payload as { repository: { full_name: string } };
        if (payload?.repository?.full_name) {
          const parts = payload.repository.full_name.split('/');
          const repoOwner = parts[0];
          const repo = parts[1];
          if (repoOwner && repo) {
            setPreviewedRepo(payload.repository.full_name);
            (actions as { previewReadme?: (owner: string, repo: string) => Promise<string> }).previewReadme?.(repoOwner, repo);
          }
        }
      }),
      events.on('repository:selected', (event) => {
        const payload = event.payload as { repository: { full_name: string } };
        if (payload?.repository?.full_name) {
          window.location.href = `/${payload.repository.full_name}`;
        }
      }),
    ];

    return () => unsubscribers.forEach((unsub) => unsub());
  }, [events, actions]);

  const panels = [
    {
      id: 'owner-repositories',
      label: 'Repositories',
      content: (
        <div className="h-full w-full overflow-hidden">
          <OwnerRepositoriesPanelLoader
            context={context}
            actions={actions}
            events={events}
            owner={owner}
          />
        </div>
      ),
    },
    {
      id: 'markdown-viewer',
      label: 'Preview',
      content: (
        <div className="h-full w-full overflow-hidden">
          <MarkdownPanelLoader context={context} actions={actions} events={events} />
        </div>
      ),
    },
    {
      id: 'empty',
      label: '',
      content: <div />,
    },
  ];

  return (
    <div className="h-full w-full flex flex-col">
      <EditorHeader />
      <div className="flex-1 overflow-hidden">
        {isMobile ? (
          <ResponsiveConfigurablePanelLayout
            theme={theme}
            panels={panels}
            layout={layout}
            defaultSizes={{
              left: 35,
              middle: 65,
              right: 0,
            }}
            minSizes={{
              left: 25,
              middle: 40,
              right: 0,
            }}
            collapsiblePanels={{
              left: true,
              right: false,
            }}
            collapsed={{
              left: false,
              right: true,
            }}
            showCollapseButtons={false}
            mobileBreakpoint="(max-width: 768px)"
          />
        ) : (
          <EditableConfigurablePanelLayout
            theme={theme}
            panels={panels}
            layout={layout}
            isEditMode={false}
            defaultSizes={{
              left: 35,
              middle: 65,
              right: 0,
            }}
            minSizes={{
              left: 25,
              middle: 40,
              right: 0,
            }}
            collapsiblePanels={{
              left: true,
              right: false,
            }}
            collapsed={{
              left: false,
              right: true,
            }}
            showCollapseButtons={false}
          />
        )}
      </div>

      {/* Open Repository Button - shows when previewing a repo */}
      {previewedRepo && (
        <button
          onClick={() => {
            window.location.href = `/${previewedRepo}`;
          }}
          className="fixed bottom-6 right-6 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg transition-all hover:scale-105 z-50"
          style={{
            background: theme.colors.primary,
            color: theme.colors.background,
            fontFamily: theme.fonts.body,
            fontSize: theme.fontSizes[2],
            fontWeight: theme.fontWeights.semibold,
          }}
        >
          <ExternalLink size={18} />
          Open {previewedRepo.split('/')[1]}
        </button>
      )}
    </div>
  );
}

export default function OwnerPage() {
  const params = useParams();
  const owner = params.owner as string;
  const { theme } = useTheme();

  return (
    <div
      className="h-screen w-screen overflow-hidden"
      style={{ background: theme.colors.background }}
    >
      <PanelProvider
        workspace={{
          name: 'web-ade',
          path: '/workspace',
        }}
        repository={{
          name: owner,
          path: `/workspace/${owner}`,
        }}
      >
        <OwnerPageContent owner={owner} />
      </PanelProvider>
    </div>
  );
}
