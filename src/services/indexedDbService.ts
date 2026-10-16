/**
 * High-Capacity IndexedDB Caching Engine
 * Bypasses 5MB LocalStorage quota limit to safely preserve large tenant state files (tens or hundreds of MBs).
 */

const DB_NAME = 'LPJ_APP_TENANT_DB_V1';
const STORE_NAME = 'school_tenant_cache';
const DB_VERSION = 1;

function openTenantDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported in environment'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const db: IDBDatabase = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error('Failed to open IndexedDB'));
    };
  });
}

/**
 * Store high-volume data in IndexedDB asynchronously without quota restriction
 */
export async function setIndexedDbCache<T>(key: string, value: T): Promise<boolean> {
  try {
    const db = await openTenantDb();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const req = store.put(value, key);

      req.onsuccess = () => resolve(true);
      req.onerror = (err) => {
        console.warn('[IndexedDB] Write error:', err);
        resolve(false);
      };
    });
  } catch (err) {
    console.warn('[IndexedDB] setIndexedDbCache unavailable:', err);
    return false;
  }
}

/**
 * Retrieve high-volume data from IndexedDB
 */
export async function getIndexedDbCache<T>(key: string): Promise<T | null> {
  try {
    const db = await openTenantDb();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const req = store.get(key);

      req.onsuccess = () => {
        resolve(req.result !== undefined ? (req.result as T) : null);
      };

      req.onerror = (err) => {
        console.warn('[IndexedDB] Read error:', err);
        resolve(null);
      };
    });
  } catch (err) {
    console.warn('[IndexedDB] getIndexedDbCache unavailable:', err);
    return null;
  }
}

/**
 * Delete cached tenant key from IndexedDB
 */
export async function removeIndexedDbCache(key: string): Promise<boolean> {
  try {
    const db = await openTenantDb();
    return new Promise((resolve) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const req = store.delete(key);

      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch (err) {
    console.warn('[IndexedDB] removeIndexedDbCache error:', err);
    return false;
  }
}
