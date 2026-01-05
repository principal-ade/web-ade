'use client';

import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useTheme } from "@principal-ade/industry-theme";
import { useState, useCallback } from "react";
import { PanelProvider } from "@/contexts/PanelContext";
import '@principal-ade/panel-layouts/styles.css';
import { OwnerPageContent } from './OwnerPageContent';

function OwnerPageWrapper({ owner }: { owner: string }) {
  const { theme } = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [previewedRepo, setPreviewedRepo] = useState<string | null>(() => {
    // Initialize from URL query param
    return searchParams.get('project');
  });

  // Update URL when previewed repo changes
  const handlePreviewChange = useCallback((repo: string | null) => {
    setPreviewedRepo(repo);
    const params = new URLSearchParams(searchParams.toString());
    if (repo) {
      params.set('project', repo);
    } else {
      params.delete('project');
    }
    router.replace(`/${owner}?${params.toString()}`, { scroll: false });
  }, [owner, router, searchParams]);

  return (
    <div
      className="w-screen overflow-hidden"
      style={{
        background: theme.colors.background,
        height: '100vh'
      }}
    >
      <PanelProvider
        workspace={{
          name: 'web-ade',
          path: '/workspace',
        }}
        repository={{
          name: previewedRepo ? previewedRepo.split('/')[1] || owner : owner,
          path: previewedRepo ? `/GitHub/${previewedRepo}` : `/workspace/${owner}`,
        }}
        githubRepo={previewedRepo || undefined}
        initialOwner={owner}
      >
        <OwnerPageContent owner={owner} onPreviewChange={handlePreviewChange} initialPreviewedRepo={previewedRepo} />
      </PanelProvider>
    </div>
  );
}

export default function OwnerPage() {
  const params = useParams();
  const owner = params.owner as string;

  return <OwnerPageWrapper owner={owner} />;
}
