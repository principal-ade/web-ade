interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

class GitTreeCache {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private cache: Map<string, CacheEntry<any>> = new Map();
  private ttl: number;

  constructor(ttlMs: number = 1000 * 60 * 60 * 24) { // Default 24 hour TTL
    this.ttl = ttlMs;
  }

  /**
   * Get cached tree data by SHA hash
   * Returns null if not in cache or expired
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get<T = any>(sha: string): T | null {
    const entry = this.cache.get(sha);

    if (!entry) {
      return null;
    }

    // Check if entry has expired
    const now = Date.now();
    if (now - entry.timestamp > this.ttl) {
      this.cache.delete(sha);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Set tree data for a given SHA hash
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  set<T = any>(sha: string, data: T): void {
    this.cache.set(sha, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Check if SHA is in cache and not expired
   */
  has(sha: string): boolean {
    const value = this.get(sha);
    return value !== null;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Remove expired entries from cache
   */
  cleanup(): void {
    const now = Date.now();
    for (const [sha, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(sha);
      }
    }
  }

  /**
   * Get cache statistics
   */
  stats() {
    return {
      size: this.cache.size,
      ttl: this.ttl,
      entries: Array.from(this.cache.keys())
    };
  }
}

// Export a singleton instance with 24 hour TTL
// Git tree SHAs are immutable, so we can cache them for a long time
export const gitTreeCache = new GitTreeCache(1000 * 60 * 60 * 24);
