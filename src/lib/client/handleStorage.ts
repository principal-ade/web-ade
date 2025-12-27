/**
 * IndexedDB utilities for persisting FileSystemDirectoryHandle mappings
 *
 * Maps GitHub repo identifiers (owner/repo) to FileSystemDirectoryHandle objects
 * so users can "attach" local folders to repos and have them persist across sessions.
 *
 * Note: While handles persist in IndexedDB, the browser requires re-requesting
 * permission each session. Use verifyPermission() to check/request access.
 */

const DB_NAME = 'web-ade-local-fs';
const DB_VERSION = 1;
const STORE_NAME = 'repo-handles';

interface StoredHandle {
  repoId: string;
  handle: FileSystemDirectoryHandle;
  folderName: string;
  attachedAt: string;
}

/**
 * Opens the IndexedDB database, creating it if necessary
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('Failed to open IndexedDB'));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'repoId' });
      }
    };
  });
}

/**
 * Store a FileSystemDirectoryHandle for a repository
 * @param repoId - Repository identifier in "owner/repo" format
 * @param handle - The FileSystemDirectoryHandle to store
 */
export async function storeRepoHandle(
  repoId: string,
  handle: FileSystemDirectoryHandle
): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const data: StoredHandle = {
      repoId,
      handle,
      folderName: handle.name,
      attachedAt: new Date().toISOString(),
    };

    const request = store.put(data);

    request.onsuccess = () => {
      db.close();
      resolve();
    };

    request.onerror = () => {
      db.close();
      reject(new Error('Failed to store handle'));
    };
  });
}

/**
 * Retrieve a stored FileSystemDirectoryHandle for a repository
 * @param repoId - Repository identifier in "owner/repo" format
 * @returns The stored handle data, or null if not found
 */
export async function getRepoHandle(
  repoId: string
): Promise<StoredHandle | null> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(repoId);

    request.onsuccess = () => {
      db.close();
      resolve(request.result || null);
    };

    request.onerror = () => {
      db.close();
      reject(new Error('Failed to get handle'));
    };
  });
}

/**
 * Remove a stored handle for a repository
 * @param repoId - Repository identifier in "owner/repo" format
 */
export async function removeRepoHandle(repoId: string): Promise<void> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(repoId);

    request.onsuccess = () => {
      db.close();
      resolve();
    };

    request.onerror = () => {
      db.close();
      reject(new Error('Failed to remove handle'));
    };
  });
}

/**
 * Get all stored repo-to-handle mappings
 * @returns Array of all stored handle data
 */
export async function getAllRepoHandles(): Promise<StoredHandle[]> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      db.close();
      resolve(request.result || []);
    };

    request.onerror = () => {
      db.close();
      reject(new Error('Failed to get all handles'));
    };
  });
}

/**
 * Verify and optionally request permission for a FileSystemDirectoryHandle
 *
 * Browsers require permission to be re-granted each session, even if the
 * handle is stored in IndexedDB. This function checks current permission
 * and requests it if needed.
 *
 * @param handle - The FileSystemDirectoryHandle to verify
 * @param requestIfNeeded - Whether to request permission if not granted (default: true)
 * @returns true if permission is granted, false otherwise
 */
export async function verifyPermission(
  handle: FileSystemDirectoryHandle,
  requestIfNeeded = true
): Promise<boolean> {
  // Check current permission state
  const options: FileSystemHandlePermissionDescriptor = { mode: 'readwrite' };

  let permission = await handle.queryPermission(options);

  if (permission === 'granted') {
    return true;
  }

  if (requestIfNeeded && permission === 'prompt') {
    // Request permission from user
    permission = await handle.requestPermission(options);
    return permission === 'granted';
  }

  return false;
}

/**
 * Check if the File System Access API is supported in the current browser
 */
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}
