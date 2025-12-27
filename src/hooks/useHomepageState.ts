'use client';

import { useState } from 'react';

export type ActiveView = 'collections' | 'your-repos' | 'github-search';

interface UseHomepageStateReturn {
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

export function useHomepageState(): UseHomepageStateReturn {
  const [activeView, setActiveView] = useState<ActiveView>('github-search');
  const [searchQuery, setSearchQuery] = useState('');

  return {
    activeView,
    setActiveView,
    searchQuery,
    setSearchQuery,
  };
}
