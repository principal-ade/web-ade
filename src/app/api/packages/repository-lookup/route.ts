import { NextRequest, NextResponse } from 'next/server';

/**
 * Supported package ecosystems by deps.dev API
 */
const SUPPORTED_SYSTEMS = ['npm', 'pypi', 'maven', 'go', 'cargo', 'nuget'] as const;
type PackageSystem = typeof SUPPORTED_SYSTEMS[number];

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

interface RepositoryLookupResponse {
  packageName: string;
  system: PackageSystem;
  repository: string | null;
  homepage?: string;
  documentation?: string;
  licenses?: string[];
  version?: string;
  source: 'deps.dev' | 'npm-registry' | 'not-found';
}

/**
 * Fetch repository information from deps.dev API
 */
async function fetchFromDepsdev(
  system: PackageSystem,
  packageName: string
): Promise<RepositoryLookupResponse | null> {
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
      if (packageResponse.status === 404) {
        return null;
      }
      throw new Error(`deps.dev API error: ${packageResponse.status} ${packageResponse.statusText}`);
    }

    const packageData: DepsDevPackageResponse = await packageResponse.json();

    // Get the latest version (last in the array, or find isDefault)
    const versions = packageData.versions || [];
    if (versions.length === 0) {
      return null;
    }

    const defaultVersion = versions.find(v => v.isDefault);
    const latestVersion = defaultVersion || versions[versions.length - 1];

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
    console.error(`Error fetching from deps.dev for ${system}:${packageName}:`, error);
    return null;
  }
}

/**
 * Fetch repository information from npm registry (fallback for npm packages)
 */
async function fetchFromNpmRegistry(
  packageName: string
): Promise<RepositoryLookupResponse | null> {
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

    // Get latest version info
    const latestVersion = data['dist-tags']?.latest;
    const versionInfo = latestVersion ? data.versions?.[latestVersion] : null;

    // Extract repository URL
    let repoUrl: string | null = null;
    const repo = versionInfo?.repository || data.repository;

    if (repo) {
      if (typeof repo === 'string') {
        repoUrl = repo;
      } else if (repo.url) {
        repoUrl = repo.url;
      }

      // Clean up git+ prefix and .git suffix
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
    console.error(`Error fetching from npm registry for ${packageName}:`, error);
    return null;
  }
}

/**
 * GET /api/packages/repository-lookup
 *
 * Query parameters:
 * - name: Package name (required)
 * - system: Package ecosystem (npm, pypi, maven, go, cargo, nuget) - defaults to npm
 *
 * Returns repository URL and metadata for the specified package
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const packageName = searchParams.get('name');
  const system = (searchParams.get('system') || 'npm') as PackageSystem;

  // Validate package name
  if (!packageName) {
    return NextResponse.json(
      { error: 'Missing required parameter: name' },
      { status: 400 }
    );
  }

  // Validate system
  if (!SUPPORTED_SYSTEMS.includes(system)) {
    return NextResponse.json(
      {
        error: `Invalid system. Supported systems: ${SUPPORTED_SYSTEMS.join(', ')}`,
        supportedSystems: SUPPORTED_SYSTEMS,
      },
      { status: 400 }
    );
  }

  try {
    let result: RepositoryLookupResponse | null = null;

    // For npm packages, try npm registry first (faster and no rate limits)
    if (system === 'npm') {
      result = await fetchFromNpmRegistry(packageName);
    }

    // If npm registry didn't work or it's not an npm package, try deps.dev
    if (!result || !result.repository) {
      const depsDevResult = await fetchFromDepsdev(system, packageName);
      // Use deps.dev result if we found a repository or if we didn't get npm registry result
      if (depsDevResult?.repository || !result) {
        result = depsDevResult;
      }
    }

    // If still no result, return not found
    if (!result) {
      return NextResponse.json(
        {
          packageName,
          system,
          repository: null,
          source: 'not-found',
        } as RepositoryLookupResponse,
        { status: 404 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in repository lookup:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
