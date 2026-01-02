'use client';

import React from 'react';
import { CenteredSearchLayout } from './home/CenteredSearchLayout';

interface WelcomePanelProps {
  onToggleGallery?: () => void;
}

/**
 * WelcomePanel - Homepage with centered search
 *
 * Features a Google-style centered search bar with toggle buttons
 * for Your Repos and Search GitHub views.
 */
export const WelcomePanel: React.FC<WelcomePanelProps> = ({ onToggleGallery }) => {
  return <CenteredSearchLayout onToggleGallery={onToggleGallery} />;
};
