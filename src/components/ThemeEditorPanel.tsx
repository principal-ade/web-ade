'use client';

import { useState } from 'react';
import { useTheme, type Theme } from '@principal-ade/industry-theme';
import { useGlobalTheme } from '@/contexts/ThemeContext';
import { RotateCcw } from 'lucide-react';

interface ColorCategory {
  name: string;
  colors: Array<{
    key: keyof Theme['colors'];
    label: string;
  }>;
}

const colorCategories: ColorCategory[] = [
  {
    name: 'Primary',
    colors: [
      { key: 'primary', label: 'Primary' },
      { key: 'secondary', label: 'Secondary' },
      { key: 'accent', label: 'Accent' },
    ],
  },
  {
    name: 'Background',
    colors: [
      { key: 'background', label: 'Background' },
      { key: 'backgroundSecondary', label: 'Secondary' },
      { key: 'backgroundTertiary', label: 'Tertiary' },
      { key: 'surface', label: 'Surface' },
      { key: 'muted', label: 'Muted' },
    ],
  },
  {
    name: 'Text',
    colors: [
      { key: 'text', label: 'Text' },
      { key: 'textSecondary', label: 'Secondary' },
      { key: 'textTertiary', label: 'Tertiary' },
      { key: 'textMuted', label: 'Muted' },
    ],
  },
  {
    name: 'UI',
    colors: [
      { key: 'border', label: 'Border' },
      { key: 'highlight', label: 'Highlight' },
    ],
  },
  {
    name: 'Status',
    colors: [
      { key: 'success', label: 'Success' },
      { key: 'warning', label: 'Warning' },
      { key: 'error', label: 'Error' },
      { key: 'info', label: 'Info' },
    ],
  },
];

interface ColorInputProps {
  colorKey: keyof Theme['colors'];
  label: string;
  value: string;
  baseValue: string;
  isOverridden: boolean;
  onChange: (key: keyof Theme['colors'], value: string) => void;
  onReset: (key: keyof Theme['colors']) => void;
}

function ColorInput({ colorKey, label, value, baseValue, isOverridden, onChange, onReset }: ColorInputProps) {
  const { theme } = useTheme();
  const [inputValue, setInputValue] = useState(value);

  const handleColorChange = (newValue: string) => {
    setInputValue(newValue);
    onChange(colorKey, newValue);
  };

  return (
    <div
      className="flex items-center gap-2 p-2 rounded-md"
      style={{ background: theme.colors.backgroundSecondary }}
    >
      <input
        type="color"
        value={value.startsWith('#') ? value : '#000000'}
        onChange={(e) => handleColorChange(e.target.value)}
        className="w-8 h-8 rounded cursor-pointer border-0"
        style={{ background: 'transparent' }}
      />
      <div className="flex-1 min-w-0">
        <div
          className="text-xs font-medium truncate"
          style={{ color: theme.colors.text }}
        >
          {label}
        </div>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => handleColorChange(e.target.value)}
          className="w-full text-xs px-1 py-0.5 rounded border-0 outline-none"
          style={{
            background: theme.colors.background,
            color: theme.colors.text,
            fontFamily: theme.fonts.monospace,
          }}
        />
      </div>
      {isOverridden && (
        <button
          onClick={() => {
            setInputValue(baseValue);
            onReset(colorKey);
          }}
          className="p-1 rounded hover:opacity-80 transition-opacity"
          style={{ color: theme.colors.textMuted }}
          title="Reset to default"
        >
          <RotateCcw size={14} />
        </button>
      )}
    </div>
  );
}

export function ThemeEditorPanel() {
  const { theme } = useTheme();
  const { baseTheme, colorOverrides, setColor, resetColor, resetAllColors } = useGlobalTheme();

  const hasOverrides = Object.keys(colorOverrides).length > 0;

  return (
    <div
      className="h-full w-full overflow-auto p-4"
      style={{ background: theme.colors.background }}
    >
      <div className="flex items-center justify-between mb-4">
        <h2
          className="text-lg font-semibold"
          style={{ color: theme.colors.text }}
        >
          Theme Editor
        </h2>
        {hasOverrides && (
          <button
            onClick={resetAllColors}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:opacity-80 transition-opacity"
            style={{
              background: theme.colors.secondary,
              color: theme.colors.text,
            }}
          >
            <RotateCcw size={12} />
            Reset All
          </button>
        )}
      </div>

      <p
        className="text-sm mb-4"
        style={{ color: theme.colors.textMuted }}
      >
        Customize theme colors. Changes are applied live and saved automatically.
      </p>

      <div className="space-y-4">
        {colorCategories.map((category) => (
          <div key={category.name}>
            <h3
              className="text-sm font-medium mb-2"
              style={{ color: theme.colors.textSecondary }}
            >
              {category.name}
            </h3>
            <div className="grid gap-2">
              {category.colors.map((color) => {
                const currentValue = theme.colors[color.key] ?? '#000000';
                const baseValue = baseTheme.colors[color.key] ?? '#000000';
                const isOverridden = color.key in colorOverrides;

                return (
                  <ColorInput
                    key={color.key}
                    colorKey={color.key}
                    label={color.label}
                    value={currentValue}
                    baseValue={baseValue}
                    isOverridden={isOverridden}
                    onChange={setColor}
                    onReset={resetColor}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
