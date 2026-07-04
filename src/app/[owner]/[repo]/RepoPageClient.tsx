'use client';

/**
 * Client boundary for the owner/repo route.
 *
 * The server `page.tsx` owns `generateMetadata`; this wrapper renders the
 * interactive explorer. The explorer pulls in monaco-editor (and a 3D File
 * City) which touch `window` at module load, so it must not be server-rendered
 * — `dynamic(..., { ssr: false })` keeps it client-only. (When the page was a
 * client component this happened implicitly; a server page makes the monaco SSR
 * throw fatal, so the opt-out has to be explicit.)
 */

import dynamic from 'next/dynamic';

const RepoExplorerPage = dynamic(
  () => import('./RepoExplorerPage').then((m) => m.RepoExplorerPage),
  { ssr: false }
);

export default function RepoPageClient({
  owner,
  repo,
}: {
  owner: string;
  repo: string;
}) {
  return <RepoExplorerPage owner={owner} repo={repo} />;
}
