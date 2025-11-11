'use client';

import { useTheme } from '@a24z/industry-theme';
import {
  Package,
  Palette,
  Zap,
  Lock,
  RefreshCw,
  Radio,
  Plug,
  Wrench,
  Search,
  Rocket,
  Puzzle,
  Globe,
} from 'lucide-react';

export function FeaturesSection() {
  const { theme } = useTheme();

  const features = [
    {
      Icon: Package,
      title: 'NPM Distribution',
      description: 'Leverage the world\'s largest package registry. Install panels like any other dependency.',
      benefits: ['Version control', 'Dependency management', 'Private registries supported'],
    },
    {
      Icon: Palette,
      title: 'Automatic Theming',
      description: 'Panels inherit themes from the host application. No manual styling needed.',
      benefits: ['Industry theme integration', 'CSS variables', 'Dark mode support'],
    },
    {
      Icon: Zap,
      title: 'Dynamic Loading',
      description: 'Panels load on-demand with code splitting. Fast initial load times.',
      benefits: ['React.lazy support', 'Suspense boundaries', 'Error recovery'],
    },
    {
      Icon: Lock,
      title: 'Type Safety',
      description: 'Full TypeScript support with comprehensive type definitions.',
      benefits: ['IntelliSense support', 'Compile-time checks', 'Better DX'],
    },
    {
      Icon: RefreshCw,
      title: 'Lifecycle Hooks',
      description: 'Control panel behavior at mount, unmount, and data changes.',
      benefits: ['onMount', 'onUnmount', 'onDataChange'],
    },
    {
      Icon: Radio,
      title: 'Event System',
      description: 'Built-in pub/sub for inter-panel communication.',
      benefits: ['Panel-to-panel messaging', 'Type-safe events', 'Decoupled architecture'],
    },
    {
      Icon: Plug,
      title: 'Context API',
      description: 'Access shared application state and data slices.',
      benefits: ['Repository data', 'Git status', 'File tree access'],
    },
    {
      Icon: Wrench,
      title: 'Actions API',
      description: 'Trigger host application actions from your panel.',
      benefits: ['Open files', 'Git operations', 'Panel navigation'],
    },
    {
      Icon: Search,
      title: 'Auto Discovery',
      description: 'Host apps automatically find and register panels.',
      benefits: ['No manual registration', 'Scoped packages', 'Metadata validation'],
    },
    {
      Icon: Rocket,
      title: 'Hot Reload',
      description: 'Develop panels with fast refresh and immediate feedback.',
      benefits: ['HMR support', 'Fast iteration', 'Dev mode'],
    },
    {
      Icon: Puzzle,
      title: 'Composable',
      description: 'Build panels from smaller, reusable components.',
      benefits: ['Shared UI libraries', 'Component composition', 'Modular design'],
    },
    {
      Icon: Globe,
      title: 'Multi-Environment',
      description: 'Works in Electron, Web, and hybrid applications.',
      benefits: ['Cross-platform', 'Node.js access', 'Browser compatible'],
    },
  ];

  return (
    <section className="py-20 px-6" style={{ background: theme.colors.background }}>
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4" style={{ color: theme.colors.foreground }}>
            Powerful Features
          </h2>
          <p className="text-lg max-w-2xl mx-auto" style={{ color: theme.colors.mutedForeground }}>
            Everything you need to build professional, production-ready panel extensions
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <div
              key={index}
              className="p-6 rounded-lg transition-all hover:scale-105"
              style={{
                background: theme.colors.card,
                border: `1px solid ${theme.colors.border}`,
              }}
            >
              <feature.Icon className="w-10 h-10 mb-3" style={{ color: theme.colors.primary }} />
              <h3 className="text-lg font-bold mb-2" style={{ color: theme.colors.foreground }}>
                {feature.title}
              </h3>
              <p className="text-sm mb-4" style={{ color: theme.colors.mutedForeground }}>
                {feature.description}
              </p>
              <ul className="space-y-1">
                {feature.benefits.map((benefit, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span style={{ color: theme.colors.primary }}>•</span>
                    <span style={{ color: theme.colors.foreground }}>{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Stats */}
        <div className="mt-16 grid md:grid-cols-4 gap-6">
          {[
            { number: '100%', label: 'Type Safe' },
            { number: '<50KB', label: 'Bundle Size' },
            { number: '∞', label: 'Extensibility' },
            { number: '0', label: 'Config Required' },
          ].map((stat, i) => (
            <div
              key={i}
              className="text-center p-6 rounded-lg"
              style={{
                background: theme.colors.card,
                border: `1px solid ${theme.colors.border}`,
              }}
            >
              <div className="text-3xl font-bold mb-2" style={{ color: theme.colors.primary }}>
                {stat.number}
              </div>
              <div className="text-sm" style={{ color: theme.colors.mutedForeground }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
