import { describe, it, expect } from 'vitest';
import { isPublicTopic, toWireTopic, type TopicPayload } from '../types';

const baseTopic: TopicPayload = {
  id: 'topic-1',
  title: 'A topic',
  description: 'body',
  trailIds: ['t1'],
  createdBy: { githubId: 100, githubLogin: 'creator' },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('toWireTopic', () => {
  it('backfills absent visibility to private (legacy / sparse-on-disk record)', () => {
    const wire = toWireTopic(baseTopic);
    expect(wire.visibility).toBe('private');
  });

  it('does not mutate the input when backfilling', () => {
    const input = { ...baseTopic };
    const wire = toWireTopic(input);
    expect(input.visibility).toBeUndefined();
    expect(wire).not.toBe(input);
  });

  it('preserves an explicit private visibility and returns the same object', () => {
    const topic: TopicPayload = { ...baseTopic, visibility: 'private' };
    const wire = toWireTopic(topic);
    expect(wire.visibility).toBe('private');
    expect(wire).toBe(topic);
  });

  it('preserves an explicit public visibility', () => {
    const topic: TopicPayload = { ...baseTopic, visibility: 'public' };
    expect(toWireTopic(topic).visibility).toBe('public');
  });

  it('output always carries a visibility readable by isPublicTopic', () => {
    expect(isPublicTopic(toWireTopic(baseTopic))).toBe(false);
    expect(
      isPublicTopic(toWireTopic({ ...baseTopic, visibility: 'public' })),
    ).toBe(true);
  });
});
