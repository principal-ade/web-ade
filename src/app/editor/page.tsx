'use client';

import { EditorHeader } from "@/components/EditorHeader";
import { RepoSelectionModal } from "@/components/RepoSelectionModal";
import { useState, useEffect } from "react";

export default function EditorPage() {
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    // Show modal when landing on /editor without a repo
    setShowModal(true);
  }, []);

  return (
    <div className="h-screen w-screen overflow-hidden bg-black flex flex-col">
      <EditorHeader />
      <div className="flex-1 overflow-hidden flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl text-white mb-4">Select a GitHub Repository</h2>
          <p className="text-gray-400">Choose a repository to view its documentation</p>
        </div>
      </div>
      <RepoSelectionModal isOpen={showModal} onClose={() => setShowModal(false)} />
    </div>
  );
}
