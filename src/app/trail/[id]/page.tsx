'use client';

/**
 * Trail page — standalone viewer for a shared trail.
 *
 * Composes the shared `useTrailSession` hook with the full
 * `<TrailHeader />` and the presentational `<TrailViewer />` so the
 * route owns its own chrome. Other surfaces (e.g. the topic page) can
 * reuse the same hook + viewer with their own header.
 */

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { TrailHeader } from '@/components/trail/TrailHeader';
import {
  TrailViewer,
  useTrailSession,
} from '@/components/trail/TrailViewer';

export default function TrailPage() {
  const params = useParams();
  const id = params?.id as string | undefined;
  const session = useTrailSession(id ?? '');

  useEffect(() => {
    if (session.state === 'ok' && session.livePayload.title) {
      document.title = `${session.livePayload.title} · Trail`;
    } else {
      document.title = 'Trail';
    }
  }, [session]);

  if (!id) return null;

  return (
    <div
      className="w-screen flex flex-col overflow-hidden"
      style={{ height: '100vh' }}
    >
      {session.state === 'ok' && (
        <TrailHeader
          owner={session.owner}
          repo={session.repo}
          trailId={session.trailId}
          statusMessage={session.headerStatus}
          showSignIn={session.showSignIn}
          onSignIn={session.onSignIn}
          starred={session.starred}
          onToggleStar={session.onToggleStar}
          starToggleInFlight={session.starToggleInFlight}
          hasNotes={session.hasNotes}
          showAnonNotesToggle={session.isOwner}
          allowAnonNotes={session.allowAnonNotes}
          onToggleAnonNotes={session.onToggleAnonNotes}
          anonNotesToggleInFlight={session.anonNotesToggleInFlight}
        />
      )}
      <div className="flex-1 min-h-0">
        <TrailViewer session={session} />
      </div>
    </div>
  );
}
