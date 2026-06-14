// @vitest-environment node

/**
 * Tests the failure-recording hook in `runAuthoringJob`: a public repo that
 * fails with UNAVAILABLE is recorded; a private repo, or any other error code,
 * is not.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runInFreestyle, AuthoringError } from '@/lib/authoring/env/freestyle';
import { recordUnsupportedRepo } from '@/lib/authoring/unsupported-store';
import { patchRun } from '@/lib/authoring/run-store';
import { runAuthoringJob } from '@/lib/authoring/run-job';

vi.mock('@/lib/authoring/env/freestyle', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/authoring/env/freestyle')>(
      '@/lib/authoring/env/freestyle'
    );
  return { ...actual, runInFreestyle: vi.fn() };
});
vi.mock('@/lib/authoring/run-store', () => ({ patchRun: vi.fn() }));
vi.mock('@/lib/authoring/unsupported-store', () => ({
  recordUnsupportedRepo: vi.fn(),
}));

const mockedRun = vi.mocked(runInFreestyle);
const mockedRecord = vi.mocked(recordUnsupportedRepo);
const mockedPatch = vi.mocked(patchRun);

const baseParams = {
  runId: 'run_1',
  token: 'tok',
  owner: 'anomalyco',
  repo: 'opencode',
  question: 'how does it work?',
  requester: { id: 1, login: 'alice' },
};

describe('runAuthoringJob failure recording', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedPatch.mockResolvedValue(undefined);
    mockedRecord.mockResolvedValue(undefined);
  });

  it('records a public repo that fails with UNAVAILABLE', async () => {
    mockedRun.mockRejectedValue(new AuthoringError('UNAVAILABLE', 'import 500'));
    await runAuthoringJob({ ...baseParams, isPublic: true });
    expect(mockedRecord).toHaveBeenCalledTimes(1);
    expect(mockedRecord).toHaveBeenCalledWith(
      'anomalyco',
      'opencode',
      expect.objectContaining({ code: 'UNAVAILABLE' })
    );
  });

  it('does NOT record a private repo (avoids leaking its name)', async () => {
    mockedRun.mockRejectedValue(new AuthoringError('UNAVAILABLE', 'import 500'));
    await runAuthoringJob({ ...baseParams, isPublic: false });
    expect(mockedRecord).not.toHaveBeenCalled();
  });

  it('does NOT record non-UNAVAILABLE failures', async () => {
    mockedRun.mockRejectedValue(new AuthoringError('AGENT_NO_EMIT', 'no json'));
    await runAuthoringJob({ ...baseParams, isPublic: true });
    expect(mockedRecord).not.toHaveBeenCalled();
  });

  it('does NOT record a raw transport blip (fetch failed), even though it maps to UNAVAILABLE', async () => {
    // Not an AuthoringError — `isTransportError` classifies the run as
    // UNAVAILABLE, but this is a transient blip, not an import verdict.
    mockedRun.mockRejectedValue(new TypeError('fetch failed'));
    await runAuthoringJob({ ...baseParams, isPublic: true });
    expect(mockedRecord).not.toHaveBeenCalled();
  });

  it('does NOT record a curated repo (verified to import)', async () => {
    mockedRun.mockRejectedValue(new AuthoringError('UNAVAILABLE', 'import 500'));
    await runAuthoringJob({
      ...baseParams,
      owner: 'pierrecomputer',
      repo: 'pierre',
      isPublic: true,
    });
    expect(mockedRecord).not.toHaveBeenCalled();
  });

  it('does NOT record on success', async () => {
    mockedRun.mockResolvedValue({ payload: {}, trailId: null, trailUrl: null });
    await runAuthoringJob({ ...baseParams, isPublic: true });
    expect(mockedRecord).not.toHaveBeenCalled();
    expect(mockedPatch).toHaveBeenCalledWith(
      'run_1',
      expect.objectContaining({ status: 'succeeded' })
    );
  });
});
