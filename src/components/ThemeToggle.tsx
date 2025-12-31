'use client';

import { useGlobalTheme, availableThemes } from '@/contexts/ThemeContext';
import { useTheme } from '@principal-ade/industry-theme';
import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Palette } from 'lucide-react';

export function ThemeToggle() {
  const { currentThemeName, setTheme, cycleTheme } = useGlobalTheme();
  const { theme } = useTheme();
  const [isMobile, setIsMobile] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        gap: '8px',
        alignItems: 'center',
      }}
    >
      {!isMobile && (
        <div ref={dropdownRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all"
            style={{
              background: theme.colors.surface,
              color: theme.colors.text,
              border: `1px solid ${theme.colors.border}`,
              fontSize: theme.fontSizes[1],
              fontWeight: 500,
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = theme.colors.primary;
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = `0 4px 12px ${theme.colors.primary}20`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = theme.colors.border;
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            <Palette className="w-4 h-4" style={{ color: theme.colors.primary }} />
            <span>{currentThemeName}</span>
            <ChevronDown
              className="w-4 h-4 transition-transform"
              style={{
                transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                color: theme.colors.textMuted,
              }}
            />
          </button>

          {isOpen && (
            <div
              className="absolute top-full mt-2 right-0 rounded-lg shadow-xl overflow-hidden z-50"
              style={{
                background: theme.colors.surface,
                border: `1px solid ${theme.colors.border}`,
                minWidth: '180px',
                maxHeight: '300px',
                overflowY: 'auto',
              }}
            >
              {availableThemes.map(({ name }) => (
                <button
                  key={name}
                  onClick={() => {
                    setTheme(name);
                    setIsOpen(false);
                  }}
                  className="w-full text-left px-4 py-2.5 transition-all flex items-center gap-2"
                  style={{
                    background: currentThemeName === name ? theme.colors.backgroundSecondary : 'transparent',
                    color: currentThemeName === name ? theme.colors.primary : theme.colors.text,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: theme.fontSizes[1],
                    fontWeight: currentThemeName === name ? 600 : 400,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = theme.colors.backgroundSecondary;
                    e.currentTarget.style.color = theme.colors.primary;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = currentThemeName === name ? theme.colors.backgroundSecondary : 'transparent';
                    e.currentTarget.style.color = currentThemeName === name ? theme.colors.primary : theme.colors.text;
                  }}
                >
                  {currentThemeName === name && (
                    <div
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: theme.colors.primary }}
                    />
                  )}
                  <span>{name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <button
        onClick={cycleTheme}
        className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all"
        style={{
          background: theme.colors.primary,
          color: theme.colors.textOnPrimary,
          border: 'none',
          fontSize: theme.fontSizes[1],
          fontWeight: 600,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = '0.9';
          e.currentTarget.style.transform = 'translateY(-1px)';
          e.currentTarget.style.boxShadow = `0 4px 12px ${theme.colors.primary}40`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = '1';
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = 'none';
        }}
        title="Cycle through themes"
      >
        {isMobile ? <Palette className="w-4 h-4" /> : 'Cycle Theme'}
      </button>
    </div>
  );
}
