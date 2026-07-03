'use client';

import React from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { Github, Search, Folder, GitBranch } from 'lucide-react';

export interface GitHubSearchingAnimationProps {
  /** Size of the animation in pixels */
  size?: number;
  /** Optional message to display below the animation */
  message?: string;
}

export const GitHubSearchingAnimation: React.FC<GitHubSearchingAnimationProps> = ({
  size = 140,
  message = 'Searching GitHub...',
}) => {
  const { theme } = useTheme();

  const githubSize = size * 0.28;
  const folderSize = size * 0.18;
  const gitLogoSize = folderSize * 0.45;
  const glassSize = size * 0.38;
  const orbitRadius = size * 0.38;

  // Position folders around the center (6 folders in a hexagon pattern)
  // Angles in standard math coordinates (0° = right, counter-clockwise positive)
  const folderAngles = [0, 60, 120, 180, 240, 300];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
      }}
    >
      <div
        style={{
          position: 'relative',
          width: size,
          height: size,
        }}
      >
        {/* Central GitHub icon */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 1,
          }}
        >
          <Github
            size={githubSize}
            style={{
              color: theme.colors.primary,
            }}
          />
        </div>

        {/* Folders arranged in a circle around GitHub */}
        {folderAngles.map((angle, i) => {
          const radians = (angle * Math.PI) / 180;
          const x = Math.cos(radians) * orbitRadius;
          const y = -Math.sin(radians) * orbitRadius; // Negative because CSS Y is inverted

          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: size / 2 + x - folderSize / 2,
                top: size / 2 + y - folderSize / 2,
                animation: `folderPop${i} 4.5s ease-in-out infinite`,
              }}
            >
              <div style={{ position: 'relative' }}>
                <Folder
                  size={folderSize}
                  style={{
                    color: theme.colors.textMuted,
                    fill: theme.colors.surface,
                  }}
                  strokeWidth={1.5}
                />
                {/* Git icon on folder */}
                <div
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -35%)',
                  }}
                >
                  <GitBranch
                    size={gitLogoSize}
                    style={{
                      color: theme.colors.text,
                      opacity: 0.6,
                    }}
                    strokeWidth={2}
                  />
                </div>
              </div>
            </div>
          );
        })}

        {/* Magnifying glass - stepping around folders */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 0,
            height: 0,
            zIndex: 10,
            animation: 'glassOrbit 4.5s ease-in-out infinite',
          }}
        >
          {/*
            Lucide Search icon: lens center is at ~46% from top-left (11/24 in 24x24 viewbox)
            To center the lens over a folder at distance orbitRadius:
            - Move right by orbitRadius (to reach folder)
            - Then offset left by 46% of glassSize (to align lens center, not icon center)
          */}
          <div
            style={{
              position: 'absolute',
              left: orbitRadius - glassSize * 0.46,
              top: -glassSize * 0.46,
            }}
          >
            <Search
              size={glassSize}
              style={{
                color: theme.colors.primary,
                filter: `drop-shadow(0 0 10px ${theme.colors.primary}50)`,
              }}
              strokeWidth={2.5}
            />
            {/* Lens glow - positioned at lens center (46% from top-left) */}
            <div
              style={{
                position: 'absolute',
                top: glassSize * 0.13,
                left: glassSize * 0.13,
                width: glassSize * 0.66,
                height: glassSize * 0.66,
                borderRadius: '50%',
                background: `radial-gradient(circle, ${theme.colors.primary}30 0%, transparent 70%)`,
                animation: 'lensGlow 0.75s ease-in-out infinite',
              }}
            />
          </div>
        </div>

        {/* Subtle pulse rings from center */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: githubSize * 1.4,
            height: githubSize * 1.4,
            borderRadius: '50%',
            border: `1px solid ${theme.colors.primary}`,
            animation: 'pulseRing 2.5s ease-out infinite',
            opacity: 0,
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* Message */}
      {message && (
        <div
          style={{
            fontFamily: theme.fonts.body,
            fontSize: theme.fontSizes[1],
            color: theme.colors.textMuted,
            animation: 'textPulse 2s ease-in-out infinite',
          }}
        >
          {message}
        </div>
      )}

      {/* Keyframe animations - stops at each folder position */}
      <style>{`
        @keyframes glassOrbit {
          0%, 8% { transform: rotate(0deg); }
          16.66%, 25% { transform: rotate(-60deg); }
          33.33%, 41% { transform: rotate(-120deg); }
          50%, 58% { transform: rotate(-180deg); }
          66.66%, 75% { transform: rotate(-240deg); }
          83.33%, 91% { transform: rotate(-300deg); }
          100% { transform: rotate(-360deg); }
        }

        /* Folder 0: active at 0-8% */
        @keyframes folderPop0 {
          0%, 8% { transform: scale(1); opacity: 1; }
          12%, 96% { transform: scale(0.75); opacity: 0.5; }
          100% { transform: scale(1); opacity: 1; }
        }

        /* Folder 1: active at 16.66-25% */
        @keyframes folderPop1 {
          0%, 12% { transform: scale(0.75); opacity: 0.5; }
          16.66%, 25% { transform: scale(1); opacity: 1; }
          29%, 100% { transform: scale(0.75); opacity: 0.5; }
        }

        /* Folder 2: active at 33.33-41% */
        @keyframes folderPop2 {
          0%, 29% { transform: scale(0.75); opacity: 0.5; }
          33.33%, 41% { transform: scale(1); opacity: 1; }
          45%, 100% { transform: scale(0.75); opacity: 0.5; }
        }

        /* Folder 3: active at 50-58% */
        @keyframes folderPop3 {
          0%, 45% { transform: scale(0.75); opacity: 0.5; }
          50%, 58% { transform: scale(1); opacity: 1; }
          62%, 100% { transform: scale(0.75); opacity: 0.5; }
        }

        /* Folder 4: active at 66.66-75% */
        @keyframes folderPop4 {
          0%, 62% { transform: scale(0.75); opacity: 0.5; }
          66.66%, 75% { transform: scale(1); opacity: 1; }
          79%, 100% { transform: scale(0.75); opacity: 0.5; }
        }

        /* Folder 5: active at 83.33-91% */
        @keyframes folderPop5 {
          0%, 79% { transform: scale(0.75); opacity: 0.5; }
          83.33%, 91% { transform: scale(1); opacity: 1; }
          95%, 100% { transform: scale(0.75); opacity: 0.5; }
        }

        @keyframes lensGlow {
          0%, 100% {
            opacity: 0.5;
          }
          50% {
            opacity: 1;
          }
        }

        @keyframes pulseRing {
          0% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 0.4;
          }
          100% {
            transform: translate(-50%, -50%) scale(2.5);
            opacity: 0;
          }
        }

        @keyframes textPulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
    </div>
  );
};
