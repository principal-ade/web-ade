/**
 * GitHub Actions Artifact Retrieval Service
 *
 * Fetches quality lens results from GitHub Actions artifacts.
 * Artifacts are created by quality-lens-cli running in CI/CD.
 */

import { Octokit } from '@octokit/rest';
import type {
  QualityHexagonMetrics,
  FormattedResults,
  GitMetadata,
} from '@principal-ai/codebase-quality-lenses';
import JSZip from 'jszip';

// Re-export types for consumers
export type { QualityHexagonMetrics, FormattedResults, GitMetadata };

/**
 * Artifact info returned when listing
 */
export interface ArtifactInfo {
  id: number;
  name: string;
  size_in_bytes: number;
  created_at: string;
  expires_at: string;
  commitSha: string | null;
}

/**
 * Per-file quality metric from a lens
 */
export interface FileMetricData {
  file: string;
  score: number;
  issueCount: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  hintCount: number;
  fixableCount?: number;
  categories?: Record<string, number>;
}

/**
 * Per-package quality metrics (from CLI output)
 */
export interface PackageQualityMetrics {
  name: string;
  path?: string;
  hexagon: QualityHexagonMetrics;
  /** List of lens IDs that actually ran for this package */
  lensesRan?: string[];
}

/**
 * Response shape for the API
 */
export interface QualityArtifactResponse {
  commitSha: string;
  branch: string;
  timestamp: string;
  qualityMetrics: {
    /** Per-package hexagons for monorepo support */
    packages: PackageQualityMetrics[];
  };
  /** Per-file coverage percentages from Jest (path -> line coverage %) */
  fileCoverage?: Record<string, number>;
  /** Per-file quality metrics from all lenses, keyed by lens name */
  fileMetrics?: {
    // Linting
    eslint?: FileMetricData[];
    'biome-lint'?: FileMetricData[];
    // Types
    typescript?: FileMetricData[];
    // Formatting
    prettier?: FileMetricData[];
    'biome-format'?: FileMetricData[];
    // Dead code
    knip?: FileMetricData[];
    // Tests
    jest?: FileMetricData[];
    vitest?: FileMetricData[];
    'bun-test'?: FileMetricData[];
    // Documentation
    alexandria?: FileMetricData[];
  };
  artifactId: number;
  artifactName: string;
  /** Raw lens results for debug panel - includes full results array with issues */
  rawResults?: FormattedResults;
}

/**
 * Extracts commit SHA from artifact name
 * Expected format: quality-lens-results-<sha>
 */
function extractCommitSha(artifactName: string): string | null {
  const match = artifactName.match(/^quality-lens-results-([a-f0-9]+)$/);
  return match?.[1] ?? null;
}

/**
 * Unzips artifact data and extracts results.json
 * GitHub always returns artifacts as ZIP files
 */
async function extractResultsFromZip(zipData: ArrayBuffer): Promise<FormattedResults> {
  const zip = await JSZip.loadAsync(zipData);
  const resultsFile = zip.file('results.json');

  if (!resultsFile) {
    throw new Error('results.json not found in artifact');
  }

  const content = await resultsFile.async('string');
  return JSON.parse(content) as FormattedResults;
}

export class GitHubArtifactService {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  /**
   * Lists all quality lens artifacts for a repository
   */
  async listQualityArtifacts(
    owner: string,
    repo: string,
    options: { limit?: number } = {}
  ): Promise<ArtifactInfo[]> {
    const { limit = 10 } = options;

    const { data } = await this.octokit.rest.actions.listArtifactsForRepo({
      owner,
      repo,
      per_page: 100,
    });

    // Filter to only quality-lens artifacts and limit
    const qualityArtifacts: ArtifactInfo[] = data.artifacts
      .filter(a => a.name.startsWith('quality-lens-results-'))
      .slice(0, limit)
      .map(a => ({
        id: a.id,
        name: a.name,
        size_in_bytes: a.size_in_bytes,
        created_at: a.created_at ?? '',
        expires_at: a.expires_at ?? '',
        commitSha: extractCommitSha(a.name),
      }));

    return qualityArtifacts;
  }

  /**
   * Gets quality metrics for a specific commit
   */
  async getQualityMetricsForCommit(
    owner: string,
    repo: string,
    commitSha: string
  ): Promise<QualityArtifactResponse | null> {
    // Search for artifact by commit SHA
    const { data } = await this.octokit.rest.actions.listArtifactsForRepo({
      owner,
      repo,
      name: `quality-lens-results-${commitSha}`,
      per_page: 1,
    });

    if (data.artifacts.length === 0) {
      // Try partial match - search all and filter
      const allArtifacts = await this.listQualityArtifacts(owner, repo, { limit: 50 });
      const matching = allArtifacts.find(a =>
        a.commitSha?.startsWith(commitSha) || a.name.includes(commitSha)
      );

      if (!matching) {
        return null;
      }

      return this.downloadAndParseArtifact(owner, repo, matching.id, matching.name);
    }

    const artifact = data.artifacts[0]!;
    return this.downloadAndParseArtifact(owner, repo, artifact.id, artifact.name);
  }

  /**
   * Gets quality metrics for the latest commit on a branch
   */
  async getLatestQualityMetrics(
    owner: string,
    repo: string,
    branch: string = 'main'
  ): Promise<QualityArtifactResponse | null> {
    try {
      // Get the latest commit SHA on the branch
      const { data: refData } = await this.octokit.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${branch}`,
      });

      const commitSha = refData.object.sha;

      // Try to find artifact for this exact commit
      const result = await this.getQualityMetricsForCommit(owner, repo, commitSha);

      if (result) {
        return result;
      }

      // If no artifact for latest commit, return the most recent artifact
      const artifacts = await this.listQualityArtifacts(owner, repo, { limit: 1 });

      if (artifacts.length === 0) {
        return null;
      }

      const firstArtifact = artifacts[0]!;
      return this.downloadAndParseArtifact(owner, repo, firstArtifact.id, firstArtifact.name);
    } catch {
      // If branch doesn't exist, try to get any artifact
      const artifacts = await this.listQualityArtifacts(owner, repo, { limit: 1 });

      if (artifacts.length === 0) {
        return null;
      }

      const firstArtifact = artifacts[0]!;
      return this.downloadAndParseArtifact(owner, repo, firstArtifact.id, firstArtifact.name);
    }
  }

  /**
   * Downloads artifact and parses the results.json
   */
  private async downloadAndParseArtifact(
    owner: string,
    repo: string,
    artifactId: number,
    artifactName: string
  ): Promise<QualityArtifactResponse> {
    // Download artifact as ZIP
    const { data: zipData } = await this.octokit.rest.actions.downloadArtifact({
      owner,
      repo,
      artifact_id: artifactId,
      archive_format: 'zip',
    });

    // Extract and parse results.json
    const results = await extractResultsFromZip(zipData as ArrayBuffer);

    // Extract file coverage and file metrics from lens results
    // Note: coverage and fileMetrics fields are added in newer versions of codebase-quality-lenses
    const fileCoverage: Record<string, number> = {};
    const fileMetrics: QualityArtifactResponse['fileMetrics'] = {};

    for (const result of results.results) {
      // Use type assertion since these fields may not be in the published npm types yet
      const resultWithExtras = result as typeof result & {
        coverage?: { files?: Array<{ file: string; lines: number }> };
        fileMetrics?: FileMetricData[];
      };

      // Extract coverage data (Jest)
      if (resultWithExtras.coverage?.files) {
        for (const file of resultWithExtras.coverage.files) {
          fileCoverage[file.file] = file.lines;
        }
      }

      // Extract fileMetrics by lens type
      if (resultWithExtras.fileMetrics && resultWithExtras.fileMetrics.length > 0) {
        const lensId = result.lens.id.toLowerCase();
        switch (lensId) {
          // Linting
          case 'eslint':
            fileMetrics.eslint = resultWithExtras.fileMetrics;
            break;
          case 'biome-lint':
          case 'biome':
            fileMetrics['biome-lint'] = resultWithExtras.fileMetrics;
            break;
          // Types
          case 'typescript':
          case 'typecheck':
          case 'tsc':
            fileMetrics.typescript = resultWithExtras.fileMetrics;
            break;
          // Formatting
          case 'prettier':
            fileMetrics.prettier = resultWithExtras.fileMetrics;
            break;
          case 'biome-format':
            fileMetrics['biome-format'] = resultWithExtras.fileMetrics;
            break;
          // Dead code
          case 'knip':
            fileMetrics.knip = resultWithExtras.fileMetrics;
            break;
          // Tests - also extract to fileCoverage for coverage visualization
          case 'jest':
          case 'test':
            fileMetrics.jest = resultWithExtras.fileMetrics;
            // Convert to fileCoverage format (score = line coverage %)
            for (const fm of resultWithExtras.fileMetrics) {
              fileCoverage[fm.file] = fm.score;
            }
            break;
          case 'vitest':
            fileMetrics.vitest = resultWithExtras.fileMetrics;
            // Convert to fileCoverage format (score = line coverage %)
            for (const fm of resultWithExtras.fileMetrics) {
              fileCoverage[fm.file] = fm.score;
            }
            break;
          case 'bun-test':
            fileMetrics['bun-test'] = resultWithExtras.fileMetrics;
            // Convert to fileCoverage format (score = line coverage %)
            for (const fm of resultWithExtras.fileMetrics) {
              fileCoverage[fm.file] = fm.score;
            }
            break;
          // Documentation
          case 'alexandria':
            fileMetrics.alexandria = resultWithExtras.fileMetrics;
            break;
        }
      }
    }

    // Get per-package hexagons from CLI output
    const packages = (results.qualityMetrics as { packages?: PackageQualityMetrics[] })?.packages ?? [];

    return {
      commitSha: results.metadata.git?.commit ?? extractCommitSha(artifactName) ?? 'unknown',
      branch: results.metadata.git?.branch ?? 'unknown',
      timestamp: results.metadata.timestamp,
      qualityMetrics: { packages },
      fileCoverage: Object.keys(fileCoverage).length > 0 ? fileCoverage : undefined,
      fileMetrics: Object.keys(fileMetrics).length > 0 ? fileMetrics : undefined,
      artifactId,
      artifactName,
      rawResults: results,
    };
  }
}
