import { getIndexedDbCache, setIndexedDbCache } from './indexedDbService';
import { AppStateData } from '../types';
import { logger } from '../utils/logger';

const BLOB_PREFIX = 'lpj_blob_ref:';

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36) + '_' + str.length;
}

/**
 * Offloads base64 images (logos, progress photos) to IndexedDB
 * Replaces them with a lightweight reference key `lpj_blob_ref:<id>`
 * to prevent Firestore documents from exceeding the 1MB limit.
 */
export async function offloadLargeBlobs(state: AppStateData): Promise<AppStateData> {
  if (!state) return state;

  const newState: AppStateData = JSON.parse(JSON.stringify(state));

  try {
    // 1. Offload School Logos if base64
    if (newState.school?.logoLeftUrl && newState.school.logoLeftUrl.startsWith('data:image/')) {
      const key = `LPJ_BLOB_LOGO_L_${simpleHash(newState.school.logoLeftUrl)}`;
      await setIndexedDbCache(key, newState.school.logoLeftUrl);
      newState.school.logoLeftUrl = `${BLOB_PREFIX}${key}`;
    }

    if (newState.school?.logoRightUrl && newState.school.logoRightUrl.startsWith('data:image/')) {
      const key = `LPJ_BLOB_LOGO_R_${simpleHash(newState.school.logoRightUrl)}`;
      await setIndexedDbCache(key, newState.school.logoRightUrl);
      newState.school.logoRightUrl = `${BLOB_PREFIX}${key}`;
    }

    // 2. Offload Progress Photos
    if (Array.isArray(newState.progressWeeks)) {
      for (const week of newState.progressWeeks) {
        if (Array.isArray(week.photos)) {
          for (let i = 0; i < week.photos.length; i++) {
            const photo = week.photos[i];
            if (photo.url && photo.url.startsWith('data:image/')) {
              const key = `LPJ_BLOB_PHOTO_${photo.id || i}_${simpleHash(photo.url)}`;
              await setIndexedDbCache(key, photo.url);
              photo.url = `${BLOB_PREFIX}${key}`;
            }
          }
        }
      }
    }
  } catch (err) {
    logger.error('BlobStorageService', 'Failed to offload blobs to IndexedDB', err);
  }

  return newState;
}

/**
 * Rehydrates reference keys `lpj_blob_ref:<id>` back into full base64 strings
 * from IndexedDB for UI display and export rendering.
 */
export async function rehydrateBlobsInState(state: AppStateData): Promise<AppStateData> {
  if (!state) return state;

  const newState: AppStateData = JSON.parse(JSON.stringify(state));

  try {
    // 1. Rehydrate Logos
    if (newState.school?.logoLeftUrl && newState.school.logoLeftUrl.startsWith(BLOB_PREFIX)) {
      const key = newState.school.logoLeftUrl.replace(BLOB_PREFIX, '');
      const blob = await getIndexedDbCache<string>(key);
      if (blob) {
        newState.school.logoLeftUrl = blob;
      }
    }

    if (newState.school?.logoRightUrl && newState.school.logoRightUrl.startsWith(BLOB_PREFIX)) {
      const key = newState.school.logoRightUrl.replace(BLOB_PREFIX, '');
      const blob = await getIndexedDbCache<string>(key);
      if (blob) {
        newState.school.logoRightUrl = blob;
      }
    }

    // 2. Rehydrate Progress Photos
    if (Array.isArray(newState.progressWeeks)) {
      for (const week of newState.progressWeeks) {
        if (Array.isArray(week.photos)) {
          for (const photo of week.photos) {
            if (photo.url && photo.url.startsWith(BLOB_PREFIX)) {
              const key = photo.url.replace(BLOB_PREFIX, '');
              const blob = await getIndexedDbCache<string>(key);
              if (blob) {
                photo.url = blob;
              }
            }
          }
        }
      }
    }
  } catch (err) {
    logger.error('BlobStorageService', 'Failed to rehydrate blobs from IndexedDB', err);
  }

  return newState;
}
