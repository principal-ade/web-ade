/**
 * Test harness for the stars route integration tests.
 *
 * Pieces:
 *
 * 1. **S3** — `aws-sdk-client-mock` intercepts `S3Client.send()` and backs
 *    every command with an in-memory `Map<key, string>`. ETag-based
 *    preconditions are honored so the ETag-locked RMW path is real.
 * 2. **Auth + GitHub** — mocked at the route's seams (`fetchGitHubUser`,
 *    `getGitHubToken`, `checkRepoAccess`) rather than mocking HTTP. The
 *    route code is what we want to exercise; the helpers are tested
 *    elsewhere.
 *
 * The `vi.mock(...)` calls have to live in the test file (vitest hoists
 * them); this module exports the typed mock handles + the S3 harness.
 */

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { mockClient, type AwsClientStub } from 'aws-sdk-client-mock';

// ============================================================================
// S3 store
// ============================================================================

export interface S3Store {
  read<T = unknown>(key: string): T | null;
  put(key: string, value: unknown): void;
  remove(key: string): void;
  reset(): void;
  raw(): Map<string, string>;
}

export interface S3Harness {
  store: S3Store;
  mock: AwsClientStub<S3Client>;
}

class NoSuchKeyError extends Error {
  override name = 'NoSuchKey';
}

class PreconditionFailedError extends Error {
  override name = 'PreconditionFailed';
}

export function createS3Harness(): S3Harness {
  const data = new Map<string, string>();
  const etags = new Map<string, string>();
  let counter = 0;

  const store: S3Store = {
    read: <T = unknown,>(key: string): T | null => {
      const raw = data.get(key);
      return raw === undefined ? null : (JSON.parse(raw) as T);
    },
    put: (key: string, value: unknown): void => {
      data.set(key, JSON.stringify(value));
      etags.set(key, `"etag-${++counter}"`);
    },
    remove: (key: string): void => {
      data.delete(key);
      etags.delete(key);
    },
    reset: (): void => {
      data.clear();
      etags.clear();
      counter = 0;
    },
    raw: () => data,
  };

  const mock = mockClient(S3Client);

  mock.on(GetObjectCommand).callsFake((input: { Key?: string }) => {
    const key = input.Key ?? '';
    const raw = data.get(key);
    if (raw === undefined) {
      throw new NoSuchKeyError(`No such key: ${key}`);
    }
    return {
      Body: { transformToString: async () => raw },
      ETag: etags.get(key) ?? '',
    };
  });

  mock
    .on(PutObjectCommand)
    .callsFake((input: { Key?: string; Body?: string; IfMatch?: string }) => {
      const key = input.Key ?? '';
      const ifMatch = input.IfMatch;
      const currentEtag = etags.get(key);
      if (ifMatch && currentEtag && ifMatch !== currentEtag) {
        throw new PreconditionFailedError('ETag mismatch');
      }
      if (ifMatch && !currentEtag) {
        throw new PreconditionFailedError('No existing object for IfMatch');
      }
      data.set(key, input.Body ?? '');
      etags.set(key, `"etag-${++counter}"`);
      return {};
    });

  mock.on(DeleteObjectCommand).callsFake((input: { Key?: string }) => {
    const key = input.Key ?? '';
    data.delete(key);
    etags.delete(key);
    return {};
  });

  return { store, mock };
}
