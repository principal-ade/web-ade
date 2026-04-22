/**
 * Find Collection Helper
 *
 * Shared helper for finding a collection across user and org storage
 */

import { getCollections } from './s3-storage';
import { getUserOrgs } from './github-org';
import type { Collection, CollectionsData } from './types';

/**
 * Finds a collection across user and org storage
 * Returns collection, ownerType, ownerId, and all data for that owner
 */
export async function findCollection(
  collectionId: string,
  userId: string,
  githubToken: string
): Promise<{
  collection: Collection;
  ownerType: 'user' | 'org';
  ownerId: string;
  allData: CollectionsData;
} | null> {
  // Check user collections first
  const userData = await getCollections('user', userId);
  if (userData) {
    const userCollection = userData.collections.find(c => c.id === collectionId);
    if (userCollection) {
      return {
        collection: userCollection,
        ownerType: 'user',
        ownerId: userId,
        allData: userData,
      };
    }
  }

  // Check org collections
  const orgs = await getUserOrgs(githubToken);

  for (const orgLogin of orgs) {
    const orgData = await getCollections('org', orgLogin);
    if (orgData) {
      const orgCollection = orgData.collections.find(c => c.id === collectionId);
      if (orgCollection) {
        // User is already a member (from getUserOrgs)
        return {
          collection: orgCollection,
          ownerType: 'org',
          ownerId: orgLogin,
          allData: orgData,
        };
      }
    }
  }

  return null;
}
