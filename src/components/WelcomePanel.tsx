'use client';

import React from 'react';
import { CenteredSearchLayout } from './home/CenteredSearchLayout';

interface WelcomePanelProps {
  showSearch?: boolean;
}

/**
 * WelcomePanel - Homepage with centered search
 *
 * Features a Google-style centered search bar with toggle buttons
 * for Your Repos and Search GitHub views.
 */
export const WelcomePanel: React.FC<WelcomePanelProps> = ({ showSearch = false }) => {
  return <CenteredSearchLayout showSearch={showSearch} />;
};
