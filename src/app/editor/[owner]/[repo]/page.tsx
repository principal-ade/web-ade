'use client';

import { EditorLayout } from "@/components/EditorLayout";
import { EditorHeader } from "@/components/EditorHeader";
import { useParams } from "next/navigation";
import { useTheme } from "@principal-ade/industry-theme";

export default function EditorRepoPage() {
  const params = useParams();
  const githubRepo = `${params.owner}/${params.repo}`;
  const { theme } = useTheme();

  return (
    <div
      className="h-screen w-screen overflow-hidden flex flex-col"
      style={{ background: theme.colors.background }}
    >
      <EditorHeader />
      <div className="flex-1 overflow-hidden">
        <EditorLayout githubRepo={githubRepo} />
      </div>
    </div>
  );
}
