'use client';

import dynamic from 'next/dynamic';
import { EditorHeader } from "@/components/EditorHeader";
import { useTheme } from "@principal-ade/industry-theme";
import { useRouter } from "next/navigation";
import { useCallback, useState, useEffect } from "react";

// Dynamically import WelcomePanel to avoid SSR issues
const WelcomePanel = dynamic(
  () => import('@industry-theme/github-panels').then(mod => mod.WelcomePanel),
  { ssr: false }
);

// Stub props for the panel
const stubEvents = {
  emit: () => {},
  on: () => () => {},
  off: () => {},
};

const stubActions = {
  openFile: () => {},
  closeFile: () => {},
  saveFile: () => Promise.resolve(),
  runCommand: () => Promise.resolve(),
};

// Check if user has any stored recent items
function hasStoredHistory(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const repos = localStorage.getItem('recent-repositories');
    const owners = localStorage.getItem('recent-owners');
    const hasRepos = repos ? JSON.parse(repos).length > 0 : false;
    const hasOwners = owners ? JSON.parse(owners).length > 0 : false;
    return hasRepos || hasOwners;
  } catch {
    return false;
  }
}

function HomePageContent() {
  const { theme } = useTheme();
  const router = useRouter();
  const [showHeader, setShowHeader] = useState(false);

  useEffect(() => {
    setShowHeader(hasStoredHistory());
  }, []);

  const handleNavigate = useCallback((owner: string, repo: string) => {
    router.push(`/${owner}/${repo}`);
  }, [router]);

  return (
    <div
      className="h-screen w-screen overflow-hidden flex flex-col"
      style={{ background: theme.colors.background }}
    >
      {showHeader && <EditorHeader />}
      <div className="flex-1 overflow-hidden">
        <WelcomePanel
          events={stubEvents}
          actions={stubActions}
          context={{} as never}
          onNavigate={handleNavigate}
          highlightedProjects={[]}
          featuredOrganizations={[
            { login: 'principal-ai', description: 'AI-powered development tools' },
            { login: 'principal-ade', description: 'Application Development Environment' },
            { login: 'principal-forks', description: 'Curated forks of popular projects' },
          ]}
        />
      </div>
    </div>
  );
}

export default function HomePage() {
  return <HomePageContent />;
}
