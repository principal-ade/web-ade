/**
 * CollectionManager
 *
 * Manages collections and their memberships using a FileSystemAdapter.
 * This is a simplified replacement for WorkspaceManager that works with
 * the new Collection types from @principal-ai/alexandria-collections.
 */

import type {
  Collection,
  CollectionMembership,
  CollectionsData,
  CollectionMembershipsData,
} from '@principal-ai/alexandria-collections';
import type { FileSystemAdapter } from '@principal-ai/alexandria-core-library/github';

export class CollectionManager {
  private rootPath: string;
  private adapter: FileSystemAdapter;

  constructor(rootPath: string, adapter: FileSystemAdapter) {
    this.rootPath = rootPath;
    this.adapter = adapter;
  }

  private getCollectionsPath(): string {
    return this.adapter.join(this.rootPath, 'collections.json');
  }

  private getMembershipsPath(): string {
    return this.adapter.join(this.rootPath, 'collection-memberships.json');
  }

  /**
   * Read a file with async support, falling back to sync if needed
   */
  private async readFile(path: string): Promise<string> {
    if (this.adapter.readFileAsync) {
      return this.adapter.readFileAsync(path);
    }
    return this.adapter.readFile(path);
  }

  /**
   * Write a file (sync, as the interface doesn't have async write)
   */
  private writeFile(path: string, content: string): void {
    this.adapter.writeFile(path, content);
  }

  /**
   * Get all collections
   */
  async getCollections(): Promise<Collection[]> {
    const path = this.getCollectionsPath();
    try {
      const content = await this.readFile(path);
      const data: CollectionsData = JSON.parse(content);
      return data.collections || [];
    } catch {
      return [];
    }
  }

  /**
   * Get a single collection by ID
   */
  async getCollection(id: string): Promise<Collection | undefined> {
    const collections = await this.getCollections();
    return collections.find((c) => c.id === id);
  }

  /**
   * Create a new collection
   */
  async createCollection(input: {
    name: string;
    description?: string;
    icon?: string;
    theme?: string;
  }): Promise<Collection> {
    const collections = await this.getCollections();
    const now = Date.now();
    const id = `col-${now}-${Math.random().toString(36).substring(2, 9)}`;

    const newCollection: Collection = {
      id,
      name: input.name,
      description: input.description,
      icon: input.icon,
      theme: input.theme,
      createdAt: now,
      updatedAt: now,
    };

    collections.push(newCollection);
    await this.saveCollections(collections);

    return newCollection;
  }

  /**
   * Update an existing collection
   */
  async updateCollection(
    id: string,
    updates: Partial<Omit<Collection, 'id' | 'createdAt'>>
  ): Promise<Collection> {
    const collections = await this.getCollections();
    const index = collections.findIndex((c) => c.id === id);

    if (index === -1) {
      throw new Error(`Collection not found: ${id}`);
    }

    const existing = collections[index]!;
    const updated: Collection = {
      id: existing.id,
      name: updates.name ?? existing.name,
      description: updates.description ?? existing.description,
      theme: updates.theme ?? existing.theme,
      icon: updates.icon ?? existing.icon,
      isDefault: updates.isDefault ?? existing.isDefault,
      suggestedClonePath: updates.suggestedClonePath ?? existing.suggestedClonePath,
      metadata: updates.metadata ?? existing.metadata,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };

    collections[index] = updated;
    await this.saveCollections(collections);

    return updated;
  }

  /**
   * Delete a collection and its memberships
   */
  async deleteCollection(id: string): Promise<void> {
    const collections = await this.getCollections();
    const filtered = collections.filter((c) => c.id !== id);

    if (filtered.length === collections.length) {
      throw new Error(`Collection not found: ${id}`);
    }

    await this.saveCollections(filtered);

    // Also remove all memberships for this collection
    const memberships = await this.getAllMemberships();
    const filteredMemberships = memberships.filter((m) => m.collectionId !== id);
    await this.saveMemberships(filteredMemberships);
  }

  /**
   * Get all memberships
   */
  async getAllMemberships(): Promise<CollectionMembership[]> {
    const path = this.getMembershipsPath();
    try {
      const content = await this.readFile(path);
      const data: CollectionMembershipsData = JSON.parse(content);
      return data.memberships || [];
    } catch {
      return [];
    }
  }

  /**
   * Get memberships for a specific collection
   */
  async getCollectionMemberships(collectionId: string): Promise<CollectionMembership[]> {
    const memberships = await this.getAllMemberships();
    return memberships.filter((m) => m.collectionId === collectionId);
  }

  /**
   * Add a repository to a collection
   */
  async addRepositoryToCollection(
    repositoryId: string,
    collectionId: string,
    metadata?: Record<string, unknown>
  ): Promise<CollectionMembership> {
    const memberships = await this.getAllMemberships();

    // Check if already exists
    const existing = memberships.find(
      (m) => m.repositoryId === repositoryId && m.collectionId === collectionId
    );

    if (existing) {
      return existing;
    }

    const newMembership: CollectionMembership = {
      repositoryId,
      collectionId,
      addedAt: Date.now(),
      metadata,
    };

    memberships.push(newMembership);
    await this.saveMemberships(memberships);

    return newMembership;
  }

  /**
   * Remove a repository from a collection
   */
  async removeRepositoryFromCollection(
    repositoryId: string,
    collectionId: string
  ): Promise<void> {
    const memberships = await this.getAllMemberships();
    const filtered = memberships.filter(
      (m) => !(m.repositoryId === repositoryId && m.collectionId === collectionId)
    );

    await this.saveMemberships(filtered);
  }

  /**
   * Import collections and memberships from external source (e.g., GitHub sync).
   * When replace is true (default), completely replaces local data with imported data.
   * When replace is false, merges with existing local data.
   */
  async importData(
    importCollections: Collection[],
    importMemberships: CollectionMembership[],
    replace: boolean = true
  ): Promise<void> {
    if (replace) {
      // Replace mode: GitHub is source of truth
      await this.saveCollections(importCollections);
      await this.saveMemberships(importMemberships);
      return;
    }

    // Merge mode: add new items, keep existing
    const existingCollections = await this.getCollections();
    const existingMemberships = await this.getAllMemberships();

    const existingIds = new Set(existingCollections.map((c) => c.id));
    const newCollections = importCollections.filter((c) => !existingIds.has(c.id));
    const mergedCollections = [...existingCollections, ...newCollections];

    const existingMembershipKeys = new Set(
      existingMemberships.map((m) => `${m.collectionId}:${m.repositoryId}`)
    );
    const newMemberships = importMemberships.filter(
      (m) => !existingMembershipKeys.has(`${m.collectionId}:${m.repositoryId}`)
    );
    const mergedMemberships = [...existingMemberships, ...newMemberships];

    await this.saveCollections(mergedCollections);
    await this.saveMemberships(mergedMemberships);
  }

  /**
   * Save collections to storage
   */
  private async saveCollections(collections: Collection[]): Promise<void> {
    const path = this.getCollectionsPath();
    const data: CollectionsData = {
      version: '1.0',
      collections,
    };
    this.writeFile(path, JSON.stringify(data, null, 2));
  }

  /**
   * Save memberships to storage
   */
  private async saveMemberships(memberships: CollectionMembership[]): Promise<void> {
    const path = this.getMembershipsPath();
    const data: CollectionMembershipsData = {
      version: '1.0',
      memberships,
    };
    this.writeFile(path, JSON.stringify(data, null, 2));
  }
}
