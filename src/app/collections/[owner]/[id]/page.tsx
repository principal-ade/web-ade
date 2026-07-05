'use client';

import { useParams } from 'next/navigation';
import { CollectionPage } from './CollectionPage';

export default function Page() {
  const params = useParams();
  const owner = params.owner as string;
  const id = params.id as string;
  return <CollectionPage owner={owner} id={id} />;
}
