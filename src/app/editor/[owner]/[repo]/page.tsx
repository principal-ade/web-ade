'use client';

import { EditorLayout } from "@/components/EditorLayout";
import { EditorHeader } from "@/components/EditorHeader";
import { useParams } from "next/navigation";

export default function EditorRepoPage() {
  const params = useParams();
  const githubRepo = `${params.owner}/${params.repo}`;

  return (
    <div className="h-screen w-screen overflow-hidden bg-black flex flex-col">
      <EditorHeader />
      <div className="flex-1 overflow-hidden">
        <EditorLayout githubRepo={githubRepo} />
      </div>
    </div>
  );
}
