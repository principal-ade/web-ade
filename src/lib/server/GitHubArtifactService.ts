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
 * Response shape for the API
 */
export interface QualityArtifactResponse {
  commitSha: string;
  branch: string;
  timestamp: string;
  qualityMetrics: {
    hexagon: QualityHexagonMetrics;
  };
  artifactId: number;
  artifactName: string;
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

    return {
      commitSha: results.metadata.git?.commit ?? extractCommitSha(artifactName) ?? 'unknown',
      branch: results.metadata.git?.branch ?? 'unknown',
      timestamp: results.metadata.timestamp,
      qualityMetrics: results.qualityMetrics ?? {
        hexagon: {
          tests: 0,
          deadCode: 0,
          formatting: 0,
          linting: 0,
          types: 0,
          documentation: 0,
        },
      },
      artifactId,
      artifactName,
    };
  }
}
