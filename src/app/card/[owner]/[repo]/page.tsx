/**
 * Card Display Page
 *
 * Shows the generated card image to users - what they'll see matches what Twitter shows.
 * Includes proper Open Graph and Twitter Card meta tags for sharing.
 */

import { Metadata } from 'next';
import { headers } from 'next/headers';
import CardPreview from './CardPreview';

interface PageProps {
  params: Promise<{
    owner: string;
    repo: string;
  }>;
}

// Fetch repo data for meta tags
async function getRepoData(owner: string, repo: string) {
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { owner, repo } = await params;

  // Get base URL
  const headersList = await headers();
  const host = headersList.get('host') || 'localhost:3000';
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `${protocol}://${host}`;

  // Fetch repo data for description
  const repoData = await getRepoData(owner, repo);
  const description = repoData?.description || `Repository card for ${owner}/${repo}`;
  const title = `${owner}/${repo}`;

  // Card image URL
  const imageUrl = `${baseUrl}/api/card/${owner}/${repo}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      url: `${baseUrl}/card/${owner}/${repo}`,
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 628,
          alt: `${owner}/${repo} repository card`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default async function CardPage({ params }: PageProps) {
  const { owner, repo } = await params;

  // Get base URL for the image
  const headersList = await headers();
  const host = headersList.get('host') || 'localhost:3000';
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `${protocol}://${host}`;

  const imageUrl = `${baseUrl}/api/card/${owner}/${repo}`;
  const shareUrl = `${baseUrl}/card/${owner}/${repo}`;

  return (
    <CardPreview
      owner={owner}
      repo={repo}
      imageUrl={imageUrl}
      shareUrl={shareUrl}
    />
  );
}
