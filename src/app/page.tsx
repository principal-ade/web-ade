'use client';

import { EditorHeader } from "@/components/EditorHeader";
import { RepoSelectionModal } from "@/components/RepoSelectionModal";
import { useState, useEffect } from "react";
import { useTheme } from "@principal-ade/industry-theme";

export default function HomePage() {
  const [showModal, setShowModal] = useState(false);
  const { theme } = useTheme();

  useEffect(() => {
    // Show modal when landing on / without a repo
    setShowModal(true);
  }, []);

  return (
    <div
      className="h-screen w-screen overflow-hidden flex flex-col"
      style={{ background: theme.colors.background }}
    >
      <EditorHeader />
      <div className="flex-1 overflow-hidden flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl mb-4" style={{ color: theme.colors.text }}>
            Select a GitHub Repository
          </h2>
          <p style={{ color: theme.colors.textMuted }}>
            Choose a repository to view its documentation
          </p>
        </div>
      </div>
      <RepoSelectionModal isOpen={showModal} onClose={() => setShowModal(false)} />
    </div>
  );
}
