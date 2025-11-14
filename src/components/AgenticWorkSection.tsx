'use client';

import { useTheme } from '@a24z/industry-theme';
import { Brain, Target, Workflow, Zap, Settings, Cpu } from 'lucide-react';

export function AgenticWorkSection() {
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
            The Agentic Approach
          </div>

          <h2 className="text-4xl font-bold mb-6" style={{ color: theme.colors.text }}>
            Outer / Inner Agentic Work
          </h2>

          <p className="text-xl max-w-3xl mx-auto" style={{ color: theme.colors.textMuted }}>
            Two complementary modes of AI collaboration that transform how you work
          </p>
        </div>

        {/* Two Column Layout */}
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          {/* Outer Agentic Work */}
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
                <Brain className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-bold" style={{ color: theme.colors.text }}>
                Outer Agentic Work
              </h3>
            </div>

            <p className="text-base mb-6" style={{ color: theme.colors.textMuted }}>
              AI assists your creative process in real-time, amplifying your capabilities
              with intelligent suggestions and instant iterations.
            </p>

            <div className="space-y-4">
              {[
                {
                  icon: Brain,
                  title: 'Leveraging AI Capabilities',
                  description: 'Harness powerful search and processing for rapid insights'
                },
                {
                  icon: Workflow,
                  title: 'Creative Amplification',
                  description: 'Enhance your ideas with AI-powered insights'
                },
                {
                  icon: Target,
                  title: 'Strategic Planning',
                  description: 'Break down complex projects into actionable steps'
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

          {/* Inner Agentic Work */}
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
                <Workflow className="w-6 h-6" />
              </div>
              <h3 className="text-2xl font-bold" style={{ color: theme.colors.text }}>
                Inner Agentic Work
              </h3>
            </div>

            <p className="text-base mb-6" style={{ color: theme.colors.textMuted }}>
              AI agents operate autonomously on structured tasks, handling complex workflows
              while you focus on strategic decisions.
            </p>

            <div className="space-y-4">
              {[
                {
                  icon: Settings,
                  title: 'Systematic Automation',
                  description: 'Automate repetitive and structured work patterns'
                },
                {
                  icon: Cpu,
                  title: 'Autonomous Execution',
                  description: 'Agents complete entire workflows independently'
                },
                {
                  icon: Zap,
                  title: 'Parallel Processing',
                  description: 'Multiple agents work simultaneously on different tasks'
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
            Seamlessly switch between modes or use both simultaneously to maximize your productivity
          </p>
        </div>
      </div>
    </section>
  );
}
