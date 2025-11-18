'use client';

import { EditorLayout } from "@/components/EditorLayout";
import { useParams } from "next/navigation";
import { useTheme } from "@principal-ade/industry-theme";

export default function EditorRepoPage() {
  const params = useParams();
  const githubRepo = `${params.owner}/${params.repo}`;
  const { theme } = useTheme();

  return (
    <div
      className="h-screen w-screen overflow-hidden"
      style={{ background: theme.colors.background }}
    >
      <EditorLayout githubRepo={githubRepo} />
    </div>
  );
}
