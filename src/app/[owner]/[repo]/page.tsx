'use client';

import { useParams } from 'next/navigation';
import { RepoTrailExplorerPage } from './RepoTrailExplorerPage';

export default function RepoPage() {
  const params = useParams();
  const owner = params.owner as string;
  const repo = params.repo as string;
  return <RepoTrailExplorerPage owner={owner} repo={repo} />;
}
