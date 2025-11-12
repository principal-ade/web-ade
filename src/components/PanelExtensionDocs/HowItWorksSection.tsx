'use client';

import { useTheme } from '@a24z/industry-theme';
import { Package, Search, Zap, ArrowRight } from 'lucide-react';

export function HowItWorksSection() {
  const { theme } = useTheme();

  const steps = [
    {
      Icon: Package,
      title: 'NPM Package',
      description: 'Publish your panel as a standard NPM package with the "panel-extension" keyword',
      items: ['Standard npm publish', 'Semantic versioning', 'Public or private registry'],
    },
    {
      Icon: Search,
      title: 'Auto Discovery',
      description: 'Host applications automatically discover installed panel packages',
      items: ['Scans node_modules', 'Finds panel-extension keyword', 'Validates metadata'],
    },
    {
      Icon: Zap,
      title: 'Dynamic Loading',
      description: 'Panels are loaded on-demand with React.lazy and proper error boundaries',
      items: ['Code splitting', 'Lazy loading', 'Error recovery'],
    },
  ];

  return (
    <section className="py-20 px-6" style={{ background: theme.colors.background }}>
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4" style={{ color: theme.colors.text }}>
            How It Works
          </h2>
          <p className="text-lg max-w-2xl mx-auto" style={{ color: theme.colors.textMuted }}>
            A simple, standardized flow from development to deployment
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((step, index) => (
            <div key={index} className="relative">
              <div
                className="p-8 rounded-lg h-full"
                style={{
                  background: theme.colors.surface,
                  border: `1px solid ${theme.colors.border}`,
                }}
              >
                <step.Icon className="w-12 h-12 mb-4" style={{ color: theme.colors.primary }} />
                <div className="text-sm font-medium mb-2" style={{ color: theme.colors.primary }}>
                  Step {index + 1}
                </div>
                <h3 className="text-xl font-bold mb-3" style={{ color: theme.colors.text }}>
                  {step.title}
                </h3>
                <p className="mb-4" style={{ color: theme.colors.textMuted }}>
                  {step.description}
                </p>
                <ul className="space-y-2">
                  {step.items.map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <span style={{ color: theme.colors.primary }}>✓</span>
                      <span style={{ color: theme.colors.text }}>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {index < steps.length - 1 && (
                <div
                  className="hidden md:block absolute top-1/2 -right-4 transform -translate-y-1/2"
                  style={{ color: theme.colors.primary }}
                >
                  <ArrowRight className="w-8 h-8" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Architecture Diagram */}
        <div className="mt-16">
          <div
            className="p-8 rounded-lg"
            style={{
              background: theme.colors.surface,
              border: `1px solid ${theme.colors.border}`,
            }}
          >
            <h3 className="text-xl font-bold mb-6 text-center" style={{ color: theme.colors.text }}>
              System Architecture
            </h3>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="space-y-3">
                <div className="font-medium" style={{ color: theme.colors.primary }}>Host Application</div>
                <div className="p-4 rounded text-sm" style={{ background: theme.colors.muted }}>
                  <div className="font-medium mb-2" style={{ color: theme.colors.text }}>Panel Discovery</div>
                  <div style={{ color: theme.colors.textMuted }}>Scans node_modules</div>
                </div>
                <div className="p-4 rounded text-sm" style={{ background: theme.colors.muted }}>
                  <div className="font-medium mb-2" style={{ color: theme.colors.text }}>Panel Loader</div>
                  <div style={{ color: theme.colors.textMuted }}>Dynamic imports</div>
                </div>
                <div className="p-4 rounded text-sm" style={{ background: theme.colors.muted }}>
                  <div className="font-medium mb-2" style={{ color: theme.colors.text }}>Panel Harness</div>
                  <div style={{ color: theme.colors.textMuted }}>Props injection</div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="font-medium" style={{ color: theme.colors.primary }}>Panel Package</div>
                <div className="p-4 rounded text-sm" style={{ background: theme.colors.muted }}>
                  <div className="font-medium mb-2" style={{ color: theme.colors.text }}>Metadata Export</div>
                  <div style={{ color: theme.colors.textMuted }}>id, name, icon, version</div>
                </div>
                <div className="p-4 rounded text-sm" style={{ background: theme.colors.muted }}>
                  <div className="font-medium mb-2" style={{ color: theme.colors.text }}>Component Export</div>
                  <div style={{ color: theme.colors.textMuted }}>React component</div>
                </div>
                <div className="p-4 rounded text-sm" style={{ background: theme.colors.muted }}>
                  <div className="font-medium mb-2" style={{ color: theme.colors.text }}>Lifecycle Hooks</div>
                  <div style={{ color: theme.colors.textMuted }}>onMount, onUnmount</div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="font-medium" style={{ color: theme.colors.primary }}>Runtime</div>
                <div className="p-4 rounded text-sm" style={{ background: theme.colors.muted }}>
                  <div className="font-medium mb-2" style={{ color: theme.colors.text }}>Context API</div>
                  <div style={{ color: theme.colors.textMuted }}>Shared state</div>
                </div>
                <div className="p-4 rounded text-sm" style={{ background: theme.colors.muted }}>
                  <div className="font-medium mb-2" style={{ color: theme.colors.text }}>Actions</div>
                  <div style={{ color: theme.colors.textMuted }}>File operations</div>
                </div>
                <div className="p-4 rounded text-sm" style={{ background: theme.colors.muted }}>
                  <div className="font-medium mb-2" style={{ color: theme.colors.text }}>Event Bus</div>
                  <div style={{ color: theme.colors.textMuted }}>Panel communication</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
