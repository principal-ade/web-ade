import { EditorLayout } from "@/components/EditorLayout";
import { EditorHeader } from "@/components/EditorHeader";

export default function EditorPage() {
  return (
    <div className="h-screen w-screen overflow-hidden bg-black flex flex-col">
      <EditorHeader />
      <div className="flex-1 overflow-hidden">
        <EditorLayout />
      </div>
    </div>
  );
}
