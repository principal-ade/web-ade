# Tour Availability

Checks if repositories in our tour org forks have tours available and caches the result under the parent repository.

## Overview

When viewing a fork from one of our tour organizations (Principal-Forks, Telementry-Test, TheKicker25, X-File-City), the system checks if the fork has a tour file and caches this information keyed by the parent repository.

## Frontend Flow (UI)

1. User navigates to repository page (e.g., `facebook/react`)
2. `EditorLayout` calls `checkTourAvailability` tRPC query
3. If tour available: "Tour" layout option becomes visible
4. If first visit + tour available: Auto-show the tour
5. If no tour: "Tour" layout option is hidden

## Backend Flow (API)

1. User views a fork page (e.g., `X-File-City/react`)
2. System checks Redis cache for existing tour availability info
3. If not cached, performs HEAD request to check for tour file at `docs/tours/introduction.tour.json`
4. If tour exists, resolves parent repository via GitHub API
5. Caches tour availability under parent's key (e.g., `facebook/react`)
6. Later queries for any repo can check if a tour is available

## Cache Strategy

- **Key**: `tour-available:{parentOwner}/{parentRepo}`
- **TTL**: 24 hours (tours don't change frequently)
- **Value**: Fork info with tour path

## Tour Organizations

- `Principal-Forks`
- `Telementry-Test`
- `TheKicker25`
- `X-File-City`

## Components

| Component | File | Purpose |
|-----------|------|---------|
| `checkTourAvailability` | `src/server/routers/github.ts` | tRPC procedure for backend check |
| `EditorLayout` | `src/components/EditorLayout.tsx` | Frontend integration point |
| `tourStorage` | `src/lib/tourStorage.ts` | Track shown state (localStorage) |
| `LayoutConfigDropdown` | `src/components/LayoutConfigDropdown.tsx` | Layout selection UI |
