'use client';

import { PrincipalADEWebSection } from "@/components/PrincipalADEWebSection";
import { AgenticWorkSection } from "@/components/AgenticWorkSection";
import { OptimizedWorkSection } from "@/components/OptimizedWorkSection";
import { LivingDocumentationSection } from "@/components/LivingDocumentationSection";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useTheme } from "@principal-ade/industry-theme";

export default function Home() {
  const { theme } = useTheme();

  return (
    <div className="w-screen" style={{ background: theme.colors.background }}>
      <ThemeToggle />
      <PrincipalADEWebSection />

      {/* Divider */}
      <div
        className="h-px"
        style={{ background: `linear-gradient(to right, transparent, ${theme.colors.border}, transparent)` }}
      />

      <AgenticWorkSection />

      {/* Divider */}
      <div
        className="h-px"
        style={{ background: `linear-gradient(to right, transparent, ${theme.colors.border}, transparent)` }}
      />

      <OptimizedWorkSection />

      {/* Divider */}
      <div
        className="h-px"
        style={{ background: `linear-gradient(to right, transparent, ${theme.colors.border}, transparent)` }}
      />

      <LivingDocumentationSection />
    </div>
  );
}
