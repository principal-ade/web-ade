'use client';

import { useTheme } from '@a24z/industry-theme';
import { Users, Eye, GitBranch, Compass } from 'lucide-react';

export function OptimizedWorkSection() {
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
            The New Paradigm
          </div>

          <h2 className="text-4xl font-bold mb-6" style={{ color: theme.colors.text }}>
            Optimizing Work in an AI-First World
          </h2>

          <p className="text-xl max-w-3xl mx-auto" style={{ color: theme.colors.textMuted }}>
            Different modes of agentic work require different human capabilities
          </p>
        </div>

        {/* Two Column Layout */}
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          {/* Outer Work Optimization */}
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
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-bold" style={{ color: theme.colors.text }}>
                Collaboration & Alignment
              </h3>
            </div>

            <p className="text-base mb-6" style={{ color: theme.colors.textMuted }}>
              For outer agent work, focus on effective communication and ensuring AI agents
              understand and align with your goals.
            </p>

            <div className="space-y-4">
              {[
                {
                  icon: Users,
                  title: 'Clear Communication',
                  description: 'Express intent and goals effectively to AI agents'
                },
                {
                  icon: GitBranch,
                  title: 'Goal Alignment',
                  description: 'Ensure agents work toward the right objectives'
                },
                {
                  icon: Compass,
                  title: 'Direction Setting',
                  description: 'Guide agents with strategic vision and priorities'
                }
              ].map((feature, i) => (
                <div key={i} className="flex gap-3">
                  <feature.icon
                    className="w-5 h-5 mt-1 flex-shrink-0"
                    style={{ color: theme.colors.primary }}
                  />
                  <div>
                    <div className="font-medium mb-1" style={{ color: theme.colors.text }}>
                      {feature.title}
                    </div>
                    <div className="text-sm" style={{ color: theme.colors.textMuted }}>
                      {feature.description}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Inner Work Optimization */}
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
                  background: theme.colors.secondary,
                  color: theme.colors.text,
                }}
              >
                <Eye className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-bold" style={{ color: theme.colors.text }}>
                Observability & Steering
              </h3>
            </div>

            <p className="text-base mb-6" style={{ color: theme.colors.textMuted }}>
              For inner agent work, maintain visibility into autonomous operations and
              guide agents when they need course correction.
            </p>

            <div className="space-y-4">
              {[
                {
                  icon: Eye,
                  title: 'Process Visibility',
                  description: 'Monitor what agents are doing in real-time'
                },
                {
                  icon: Compass,
                  title: 'Active Steering',
                  description: 'Intervene and redirect when necessary'
                },
                {
                  icon: GitBranch,
                  title: 'Progress Tracking',
                  description: 'Understand agent progress and decision-making'
                }
              ].map((feature, i) => (
                <div key={i} className="flex gap-3">
                  <feature.icon
                    className="w-5 h-5 mt-1 flex-shrink-0"
                    style={{ color: theme.colors.secondary }}
                  />
                  <div>
                    <div className="font-medium mb-1" style={{ color: theme.colors.text }}>
                      {feature.title}
                    </div>
                    <div className="text-sm" style={{ color: theme.colors.textMuted }}>
                      {feature.description}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom CTA or Additional Info */}
        <div className="text-center">
          <p className="text-lg" style={{ color: theme.colors.textMuted }}>
            Master these skills to thrive in the age of agentic AI
          </p>
        </div>
      </div>
    </section>
  );
}
