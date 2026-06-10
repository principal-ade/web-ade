import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TopicInboxIndexEntry } from '../types';
import { canReadTopic } from '../access';
import { getTopicInboxEntry } from '../s3-storage';

// Mock the storage point-read so the gate's logic is tested without S3.
// `vi.mock` is hoisted above the imports by vitest at transform time.
vi.mock('../s3-storage', () => ({
  getTopicInboxEntry: vi.fn(),
}));

const mockGetEntry = vi.mocked(getTopicInboxEntry);

const baseTopic = {
  id: 'topic-1',
  createdBy: { githubId: 100, githubLogin: 'creator' },
};

const inboxEntry = { topicId: 'topic-1' } as TopicInboxIndexEntry;

beforeEach(() => {
  mockGetEntry.mockReset();
});

describe('canReadTopic', () => {
  it('public topic is readable by anyone, including anonymous, with no inbox lookup', async () => {
    const topic = { ...baseTopic, visibility: 'public' as const };
    expect(await canReadTopic(topic, null)).toBe(true);
    expect(await canReadTopic(topic, 999)).toBe(true);
    expect(mockGetEntry).not.toHaveBeenCalled();
  });

  it('private topic denies an anonymous caller without an inbox lookup', async () => {
    const topic = { ...baseTopic, visibility: 'private' as const };
    expect(await canReadTopic(topic, null)).toBe(false);
    expect(mockGetEntry).not.toHaveBeenCalled();
  });

  it('treats absent visibility as private', async () => {
    expect(await canReadTopic(baseTopic, null)).toBe(false);
  });

  it('lets the creator read their private topic without an inbox lookup', async () => {
    expect(await canReadTopic(baseTopic, 100)).toBe(true);
    expect(mockGetEntry).not.toHaveBeenCalled();
  });

  it('lets a recipient (has an inbox entry) read a private topic', async () => {
    mockGetEntry.mockResolvedValue(inboxEntry);
    expect(await canReadTopic(baseTopic, 200)).toBe(true);
    expect(mockGetEntry).toHaveBeenCalledWith(200, 'topic-1');
  });

  it('denies a non-recipient (no inbox entry) on a private topic', async () => {
    mockGetEntry.mockResolvedValue(null);
    expect(await canReadTopic(baseTopic, 200)).toBe(false);
    expect(mockGetEntry).toHaveBeenCalledWith(200, 'topic-1');
  });
});
