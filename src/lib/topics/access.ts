/**
 * Topic read-access gate.
 *
 * A topic is `public` (anyone, by link or via the feed) or `private` (creator
 * and recipients only). "Recipient" means the topic has been sent to the user
 * — tracked by a per-entry object in their topic inbox, so membership is a
 * single S3 point-read rather than a full inbox scan.
 *
 * This is the one place the private boundary is defined. Every read surface
 * that can expose a private topic's content — the topic record itself, its
 * comment thread, its suggestion queue — routes through {@link canReadTopic}
 * so the rule can't drift between them.
 */

import { getTopicInboxEntry } from './s3-storage';
import { isPublicTopic, type TopicPayload } from './types';

/**
 * Resolve whether `githubId` may read `topic`. Pass `null` for an anonymous
 * caller. Public topics are always readable; private topics require the caller
 * to be the creator or a recipient.
 */
export async function canReadTopic(
  topic: Pick<TopicPayload, 'id' | 'visibility' | 'createdBy'>,
  githubId: number | null,
): Promise<boolean> {
  if (isPublicTopic(topic)) return true;
  if (githubId === null) return false;
  if (topic.createdBy.githubId === githubId) return true;
  const entry = await getTopicInboxEntry(githubId, topic.id);
  return entry !== null;
}
