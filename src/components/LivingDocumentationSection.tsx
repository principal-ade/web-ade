'use client';

import { useTheme } from '@a24z/industry-theme';
import { FileText, Link2, CheckCircle, GitBranch, Eye, RefreshCw } from 'lucide-react';

export function LivingDocumentationSection() {
  const { theme } = useTheme();

  return (
    <section
      className="relative overflow-hidden min-h-screen flex items-center py-20 px-6"
      style={{
        background: `linear-gradient(135deg, ${theme.colors.background} 0%, ${theme.colors.muted} 100%)`,
      }}
    >
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-block mb-4 px-4 py-2 rounded-full text-sm font-medium"
            style={{
              background: theme.colors.primary,
              color: theme.colors.background,
            }}
          >
            Living Documentation
          </div>

          <h2 className="text-4xl font-bold mb-6" style={{ color: theme.colors.text }}>
            Documentation That Stays Alive
          </h2>

          <p className="text-xl max-w-3xl mx-auto" style={{ color: theme.colors.textMuted }}>
            CodebaseViews connect your documentation to actual code, ensuring docs stay accurate and AI agents understand exactly what you&apos;re talking about
          </p>
        </div>

        {/* Main Content */}
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          {/* Left: The Problem */}
          <div
            className="rounded-lg p-8"
            style={{
              background: theme.colors.surface,
              border: `2px solid ${theme.colors.border}`,
            }}
          >
            <div className="flex items-center gap-3 mb-6">
              <div
                className="p-3 rounded-lg"
                style={{
                  background: theme.colors.muted,
                  color: theme.colors.text,
                }}
              >
                <FileText className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-bold" style={{ color: theme.colors.text }}>
                The Problem
              </h3>
            </div>

            <p className="text-base mb-6" style={{ color: theme.colors.textMuted }}>
              Traditional documentation becomes outdated the moment code changes. Files move, implementations change, but docs stay the same.
            </p>

            <div
              className="p-4 rounded-lg"
              style={{
                background: theme.colors.muted,
                border: `1px solid ${theme.colors.border}`,
              }}
            >
              <p className="text-sm mb-2" style={{ color: theme.colors.text }}>
                &quot;The authentication system uses JWT tokens...&quot;
              </p>
              <div className="space-y-2 text-sm" style={{ color: theme.colors.textMuted }}>
                <div>❓ Which files implement this?</div>
                <div>❓ Where are the JWT utilities?</div>
                <div>❓ Is this still accurate?</div>
              </div>
            </div>
          </div>

          {/* Right: The Solution */}
          <div
            className="rounded-lg p-8"
            style={{
              background: theme.colors.surface,
              border: `2px solid ${theme.colors.border}`,
            }}
          >
            <div className="flex items-center gap-3 mb-6">
              <div
                className="p-3 rounded-lg"
                style={{
                  background: theme.colors.primary,
                  color: theme.colors.background,
                }}
              >
                <Link2 className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-bold" style={{ color: theme.colors.text }}>
                The Solution
              </h3>
            </div>

            <p className="text-base mb-6" style={{ color: theme.colors.textMuted }}>
              CodebaseViews create explicit, validated links between your documentation and the actual code files it describes.
            </p>

            <div
              className="p-4 rounded-lg"
              style={{
                background: theme.colors.backgroundTertiary,
                border: `1px solid ${theme.colors.primary}`,
              }}
            >
              <p className="text-sm mb-3 font-medium" style={{ color: theme.colors.text }}>
                Authentication System View
              </p>
              <div className="space-y-2 text-xs" style={{ color: theme.colors.textMuted }}>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-3 h-3" style={{ color: theme.colors.primary }} />
                  <span>jwt: src/auth/jwt.ts, src/auth/tokens.ts</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-3 h-3" style={{ color: theme.colors.primary }} />
                  <span>middleware: src/middleware/auth.ts</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-3 h-3" style={{ color: theme.colors.primary }} />
                  <span>config: src/config/auth.config.ts</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Key Benefits */}
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: CheckCircle,
              title: 'Always Accurate',
              description: 'Validation ensures all references point to real, existing files',
              color: theme.colors.primary
            },
            {
              icon: Eye,
              title: 'AI Precision',
              description: 'AI agents know exactly which files to examine for context',
              color: theme.colors.secondary
            },
            {
              icon: GitBranch,
              title: 'Impact Analysis',
              description: 'See which documentation is affected when code changes',
              color: theme.colors.primary
            },
            {
              icon: RefreshCw,
              title: 'Automated Validation',
              description: 'Get alerts when files move or references break',
              color: theme.colors.secondary
            },
            {
              icon: Link2,
              title: 'Navigate Easily',
              description: 'Jump seamlessly between documentation and implementation',
              color: theme.colors.primary
            },
            {
              icon: FileText,
              title: 'Coverage Tracking',
              description: 'Identify which code areas need documentation',
              color: theme.colors.secondary
            }
          ].map((benefit, i) => (
            <div
              key={i}
              className="p-6 rounded-lg"
              style={{
                background: theme.colors.surface,
                border: `1px solid ${theme.colors.border}`,
              }}
            >
              <benefit.icon
                className="w-8 h-8 mb-4"
                style={{ color: benefit.color }}
              />
              <h4 className="text-lg font-semibold mb-2" style={{ color: theme.colors.text }}>
                {benefit.title}
              </h4>
              <p className="text-sm" style={{ color: theme.colors.textMuted }}>
                {benefit.description}
              </p>
            </div>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="text-center mt-12">
          <p className="text-lg" style={{ color: theme.colors.textMuted }}>
            Keep your documentation alive and give AI the context it needs to truly understand your codebase
          </p>
        </div>
      </div>
    </section>
  );
}
