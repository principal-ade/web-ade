import { NextRequest, NextResponse } from 'next/server';

const SUPPORTED_SYSTEMS = ['npm', 'pypi', 'maven', 'go', 'cargo', 'nuget'] as const;
type PackageSystem = typeof SUPPORTED_SYSTEMS[number];

interface PackageRequest {
  name: string;
  system?: PackageSystem;
}

interface RepositoryLookupResult {
  packageName: string;
  system: PackageSystem;
  repository: string | null;
  homepage?: string;
  documentation?: string;
  licenses?: string[];
  version?: string;
  source: 'deps.dev' | 'npm-registry' | 'not-found';
  error?: string;
}

interface BatchRepositoryLookupResponse {
  results: RepositoryLookupResult[];
  summary: {
    total: number;
    found: number;
    notFound: number;
    errors: number;
  };
}

interface DepsDevVersionKey {
  system: string;
  name: string;
  version: string;
}

interface DepsDevLink {
  label: string;
  url: string;
}

interface DepsDevVersionSummary {
  versionKey: DepsDevVersionKey;
  publishedAt?: string;
  isDefault?: boolean;
}

interface DepsDevVersionDetail {
  versionKey: DepsDevVersionKey;
  publishedAt?: string;
  isDefault?: boolean;
  licenses?: string[];
  links?: DepsDevLink[];
}

interface DepsDevPackageResponse {
  packageKey: {
    system: string;
    name: string;
  };
  versions?: DepsDevVersionSummary[];
}

async function lookupPackageRepository(
  packageName: string,
  system: PackageSystem = 'npm'
): Promise<RepositoryLookupResult> {
  try {
    // For npm packages, try npm registry first
    if (system === 'npm') {
      const npmResult = await fetchFromNpmRegistry(packageName);
      if (npmResult?.repository) {
        return npmResult;
      }
    }

    // Try deps.dev for all packages or as fallback
    const depsDevResult = await fetchFromDepsdev(system, packageName);
    if (depsDevResult) {
      return depsDevResult;
    }

    // Not found
    return {
      packageName,
      system,
      repository: null,
      source: 'not-found',
    };
  } catch (error) {
    return {
      packageName,
      system,
      repository: null,
      source: 'not-found',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function fetchFromDepsdev(
  system: PackageSystem,
  packageName: string
): Promise<RepositoryLookupResult | null> {
  try {
    const encodedName = encodeURIComponent(packageName);

    // First, get the package to find available versions
    const packageUrl = `https://api.deps.dev/v3/systems/${system}/packages/${encodedName}`;
    const packageResponse = await fetch(packageUrl, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!packageResponse.ok) {
      return null;
    }

    const packageData: DepsDevPackageResponse = await packageResponse.json();
    const versions = packageData.versions || [];

    if (versions.length === 0) {
      return null;
    }

    const defaultVersion = versions.find(v => v.isDefault);
    const latestVersion = defaultVersion || versions[versions.length - 1];

    if (!latestVersion) {
      return null;
    }

    // Now fetch the specific version to get links
    const versionUrl = `https://api.deps.dev/v3/systems/${system}/packages/${encodedName}/versions/${encodeURIComponent(latestVersion.versionKey.version)}`;
    const versionResponse = await fetch(versionUrl, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!versionResponse.ok) {
      return null;
    }

    const versionData: DepsDevVersionDetail = await versionResponse.json();

    // Extract links from the array
    let repository: string | null = null;
    let homepage: string | undefined;
    let documentation: string | undefined;

    if (versionData.links) {
      for (const link of versionData.links) {
        switch (link.label) {
          case 'SOURCE_REPO':
            repository = link.url;
            break;
          case 'HOMEPAGE':
            homepage = link.url;
            break;
          case 'DOCUMENTATION':
            documentation = link.url;
            break;
        }
      }
    }

    return {
      packageName,
      system,
      repository,
      homepage,
      documentation,
      licenses: versionData.licenses,
      version: versionData.versionKey.version,
      source: 'deps.dev',
    };
  } catch (error) {
    return null;
  }
}

async function fetchFromNpmRegistry(
  packageName: string
): Promise<RepositoryLookupResult | null> {
  try {
    const encodedName = encodeURIComponent(packageName);
    const url = `https://registry.npmjs.org/${encodedName}`;

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const latestVersion = data['dist-tags']?.latest;
    const versionInfo = latestVersion ? data.versions?.[latestVersion] : null;

    let repoUrl: string | null = null;
    const repo = versionInfo?.repository || data.repository;

    if (repo) {
      if (typeof repo === 'string') {
        repoUrl = repo;
      } else if (repo.url) {
        repoUrl = repo.url;
      }

      if (repoUrl) {
        repoUrl = repoUrl.replace(/^git\+/, '').replace(/\.git$/, '');
      }
    }

    return {
      packageName,
      system: 'npm',
      repository: repoUrl,
      homepage: versionInfo?.homepage || data.homepage,
      licenses: versionInfo?.license ? [versionInfo.license] : undefined,
      version: latestVersion,
      source: 'npm-registry',
    };
  } catch (error) {
    return null;
  }
}

/**
 * Batch process packages with concurrency control
 */
async function batchLookup(
  packages: PackageRequest[],
  concurrency: number = 10
): Promise<RepositoryLookupResult[]> {
  const results: RepositoryLookupResult[] = [];
  const queue = [...packages];

  while (queue.length > 0) {
    const batch = queue.splice(0, concurrency);
    const batchResults = await Promise.all(
      batch.map(pkg => lookupPackageRepository(pkg.name, pkg.system || 'npm'))
    );
    results.push(...batchResults);
  }

  return results;
}

/**
 * POST /api/packages/repository-lookup/batch
 *
 * Request body:
 * {
 *   packages: [
 *     { name: "react", system: "npm" },
 *     { name: "django", system: "pypi" }
 *   ],
 *   concurrency?: number  // Max concurrent requests (default: 10)
 * }
 *
 * Returns repository URLs and metadata for all specified packages
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    if (!body.packages || !Array.isArray(body.packages)) {
      return NextResponse.json(
        { error: 'Request body must contain a "packages" array' },
        { status: 400 }
      );
    }

    const packages: PackageRequest[] = body.packages;
    const concurrency = body.concurrency || 10;

    // Validate package requests
    for (const pkg of packages) {
      if (!pkg.name) {
        return NextResponse.json(
          { error: 'Each package must have a "name" field' },
          { status: 400 }
        );
      }

      if (pkg.system && !SUPPORTED_SYSTEMS.includes(pkg.system)) {
        return NextResponse.json(
          {
            error: `Invalid system "${pkg.system}". Supported: ${SUPPORTED_SYSTEMS.join(', ')}`,
            supportedSystems: SUPPORTED_SYSTEMS,
          },
          { status: 400 }
        );
      }
    }

    // Limit batch size to prevent abuse
    if (packages.length > 100) {
      return NextResponse.json(
        { error: 'Maximum batch size is 100 packages' },
        { status: 400 }
      );
    }

    // Perform batch lookup
    const results = await batchLookup(packages, concurrency);

    // Calculate summary statistics
    const summary = {
      total: results.length,
      found: results.filter(r => r.repository !== null).length,
      notFound: results.filter(r => r.source === 'not-found' && !r.error).length,
      errors: results.filter(r => r.error).length,
    };

    const response: BatchRepositoryLookupResponse = {
      results,
      summary,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in batch repository lookup:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
