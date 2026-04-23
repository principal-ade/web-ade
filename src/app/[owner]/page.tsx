'use client';

import { useParams } from 'next/navigation';
import { OwnerProfilePage } from './OwnerProfilePage';

export default function OwnerPage() {
  const params = useParams();
  const owner = params.owner as string;
  return <OwnerProfilePage owner={owner} />;
}
