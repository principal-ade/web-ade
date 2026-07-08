import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import {
  BUCKET_NAME,
  BUCKET_REGION,
  S3_PREFIX,
} from '@/lib/trails/constants';
import { TrailShareError, ShareErrorCodes } from '@/lib/trails/types';
import {
  getCommunityRepoVisitFeed,
  type CommunityRepoVisitFeed,
} from '@/lib/repos/community-visits';
import { getRepoAnalysisFromS3 } from '@/lib/repo-analysis/s3-cache';

const s3Client = new S3Client({ region: BUCKET_REGION });

const CAROUSEL_KEY = `${S3_PREFIX}/_community-repos/carousel.json`;

const CAROUSEL_CACHE_CONTROL = 'max-age=3600';

export interface CarouselContributor {
  name: string;
  email?: string;
  commits: number;
  lines?: number;
}

export interface CarouselRepo {
  fullName: string;
  owner: string;
  repo: string;
  description: string | null;
  language: string | null;
  stargazersCount: number;
  visitorCount: number;
  lastVisitedAt: string;
  topContributors: CarouselContributor[];
  totalLines?: number;
}

export interface CarouselCache {
  version: 1;
  builtAt: string;
  sourceFeedUpdatedAt: string;
  repoCount: number;
  repos: CarouselRepo[];
}

function isNoSuchKey(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'name' in error &&
    (error as { name: string }).name === 'NoSuchKey'
  );
}

function linesByEmailFromAnalysis(
  byEmail: Record<string, Record<string, number>>
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [email, files] of Object.entries(byEmail)) {
    result[email.toLowerCase()] = Object.values(files).reduce((s, v) => s + v, 0);
  }
  return result;
}

async function buildCarousel(feed: CommunityRepoVisitFeed): Promise<CarouselCache> {
  const analysisResults = await Promise.allSettled(
    feed.entries.map((entry) =>
      getRepoAnalysisFromS3(entry.owner, entry.repo).then((analysis) => ({
        fullName: entry.fullName,
        analysis,
      }))
    )
  );

  const analysisMap = new Map<string, { linesPerEmail: Record<string, number>; contributors: Array<{ name: string; commits: number; email: string }>; totalLinesGlobal: number } | null>();

  for (const result of analysisResults) {
    if (result.status === 'fulfilled' && result.value.analysis) {
      analysisMap.set(result.value.fullName.toLowerCase(), {
        linesPerEmail: linesByEmailFromAnalysis(result.value.analysis.analysis.byEmail),
        contributors: result.value.analysis.analysis.contributors,
        totalLinesGlobal: result.value.analysis.analysis.totalLinesGlobal,
      });
    } else if (result.status === 'fulfilled') {
      analysisMap.set(result.value.fullName.toLowerCase(), null);
    }
  }

  const repos: CarouselRepo[] = feed.entries
    .slice()
    .sort((a, b) => b.stargazersCount - a.stargazersCount)
    .map((entry) => {
    const analysis = analysisMap.get(entry.fullName.toLowerCase());

    let topContributors: CarouselContributor[] = [];
    let totalLines: number | undefined;

    if (analysis) {
      totalLines = analysis.totalLinesGlobal;

      topContributors = analysis.contributors
        .map((c) => ({
          name: c.name,
          email: c.email,
          commits: c.commits,
          lines: analysis.linesPerEmail[c.email.toLowerCase()] ?? undefined,
        }))
        .sort((a, b) => (b.lines ?? b.commits) - (a.lines ?? a.commits))
        .slice(0, 10);
    }

    return {
      fullName: entry.fullName,
      owner: entry.owner,
      repo: entry.repo,
      description: entry.description,
      language: entry.language,
      stargazersCount: entry.stargazersCount,
      visitorCount: entry.visitorCount,
      lastVisitedAt: entry.lastVisitedAt,
      topContributors,
      totalLines,
    };
  });

  return {
    version: 1,
    builtAt: new Date().toISOString(),
    sourceFeedUpdatedAt: feed.updatedAt,
    repoCount: repos.length,
    repos,
  };
}

async function getCached(): Promise<CarouselCache | null> {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({ Bucket: BUCKET_NAME, Key: CAROUSEL_KEY })
    );
    const body = await response.Body?.transformToString();
    if (!body) return null;
    return JSON.parse(body) as CarouselCache;
  } catch (error: unknown) {
    if (isNoSuchKey(error)) return null;
    console.error('[CarouselCache] Get failed:', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TrailShareError(
      'Failed to retrieve carousel cache',
      500,
      ShareErrorCodes.S3_ERROR
    );
  }
}

async function store(cache: CarouselCache): Promise<void> {
  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: CAROUSEL_KEY,
        Body: JSON.stringify(cache),
        ContentType: 'application/json',
        CacheControl: CAROUSEL_CACHE_CONTROL,
      })
    );
  } catch (error: unknown) {
    console.error('[CarouselCache] Store failed:', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new TrailShareError(
      'Failed to save carousel cache',
      500,
      ShareErrorCodes.S3_ERROR
    );
  }
}

function sortReposByStars(repos: CarouselRepo[]): CarouselRepo[] {
  return repos.slice().sort((a, b) => b.stargazersCount - a.stargazersCount);
}

export async function getOrBuildCarousel(): Promise<CarouselCache> {
  const [cached, feed] = await Promise.all([
    getCached(),
    getCommunityRepoVisitFeed(),
  ]);

  if (cached && cached.sourceFeedUpdatedAt >= feed.updatedAt && cached.repoCount >= feed.entries.length) {
    return { ...cached, repos: sortReposByStars(cached.repos) };
  }

  const built = await buildCarousel(feed);
  await store(built).catch((err) => {
    console.error('[CarouselCache] Background store failed:', err);
  });
  return built;
}

export async function warmCarouselCache(): Promise<void> {
  try {
    const feed = await getCommunityRepoVisitFeed();
    const built = await buildCarousel(feed);
    await store(built);
  } catch (error) {
    console.error('[CarouselCache] Warm failed:', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
