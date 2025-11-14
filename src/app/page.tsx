import { PrincipalADEWebSection } from "@/components/PrincipalADEWebSection";
import { AgenticWorkSection } from "@/components/AgenticWorkSection";
import { OptimizedWorkSection } from "@/components/OptimizedWorkSection";
import { LivingDocumentationSection } from "@/components/LivingDocumentationSection";

export default function Home() {
  return (
    <div className="w-screen bg-black">
      <PrincipalADEWebSection />

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-gray-600 to-transparent" />

      <AgenticWorkSection />

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-gray-600 to-transparent" />

      <OptimizedWorkSection />

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-gray-600 to-transparent" />

      <LivingDocumentationSection />
    </div>
  );
}
