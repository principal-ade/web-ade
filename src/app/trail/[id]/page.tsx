'use client';

/**
 * Trail page — standalone viewer for a shared trail.
 *
 * The actual UI (data fetch, header, FileCity panel, loading + error
 * states) lives in `<TrailViewer />` so it can also be embedded by
 * other surfaces (e.g. the topic page). This file is just the route
 * wrapper that pulls the trail id from the URL and gives the viewer a
 * full-viewport sandbox.
 */

import { useParams } from 'next/navigation';
import { TrailViewer } from '@/components/trail/TrailViewer';

export default function TrailPage() {
  const params = useParams();
  const id = params?.id as string | undefined;
  if (!id) return null;

  return (
    <div className="w-screen" style={{ height: '100vh' }}>
      <TrailViewer trailId={id} updateDocumentTitle />
    </div>
  );
}
