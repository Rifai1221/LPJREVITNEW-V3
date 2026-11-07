import {
  collection,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  disableNetwork,
  runTransaction,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { AppStateData } from '../types';
import { sanitizeAndFilterDemoState } from './storageService';
import {
  SchoolTenant,
  createSchoolStateForTenant,
} from '../data/tenantPresets';
import {
  setIndexedDbCache,
  getIndexedDbCache,
  removeIndexedDbCache,
} from './indexedDbService';
import { offloadLargeBlobs, rehydrateBlobsInState } from './blobStorageService';
import { UserRole } from '../utils/authHelper';
import { logger } from '../utils/logger';
import {
  createSchoolCallable,
  deleteSchoolCallable,
  UserMembershipRecord,
  isFirestoreDatabaseMissingGlobally,
  markFirestoreDatabaseMissingGlobally,
} from './schoolMembershipService';

const ACTIVE_TENANT_STORAGE_KEY = 'ACTIVE_SCHOOL_TENANT_ID_V1';
const SYNC_QUEUE_KEY = 'LPJ_SYNC_RETRY_QUEUE_V2';

export type CloudSyncStatus = 'ok' | 'failed' | 'quota' | 'skipped';

export interface SaveTenantResult {
  local: boolean;
  cloud: CloudSyncStatus;
  error?: string;
  rev?: number;
  serverState?: AppStateData;
}

export interface SyncQueueItem {
  id: string;
  uid?: string;
  tenantId: string;
  state: AppStateData;
  expectedRev?: number;
  attemptCount: number;
  nextRetryTime: number;
  createdAt: string;
}

function withTimeout<T>(promise: Promise<T>, ms = 12000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Firestore request timed out after ${ms}ms`));
    }, ms);
    promise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// 1. Scoped Storage Key Helpers (Requirement 6)
export function getTenantCacheKey(tenantId: string, uid?: string): string {
  const effectiveUid = uid || auth.currentUser?.uid || 'guest';
  return `LPJ_TENANT_CACHE_${effectiveUid}_${tenantId}`;
}

export function getGoogleSheetStorageKey(tenantId: string, uid?: string): string {
  const effectiveUid = uid || auth.currentUser?.uid || 'guest';
  return `GOOGLE_SHEET_INFO_${effectiveUid}_${tenantId}`;
}

export function getDeletedTenantsStorageKey(uid?: string): string {
  const effectiveUid = uid || auth.currentUser?.uid || 'guest';
  return `LPJ_DELETED_TENANTS_IDS_${effectiveUid}`;
}

// 2. Currently active tenant ID
export function getStoredActiveTenantId(): string {
  try {
    const saved = localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY);
    if (saved) return saved;
    return '';
  } catch (err) {
    logger.warn('SchoolTenantService', 'Failed to read active tenant ID from storage', undefined, err);
    return '';
  }
}

export function setStoredActiveTenantId(tenantId: string): void {
  try {
    localStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, tenantId);
    // Broadcast change to other browser tabs (Requirement 8)
    if (typeof window !== 'undefined' && window.BroadcastChannel) {
      try {
        const bc = new BroadcastChannel('LPJ_TENANT_CHANNEL');
        bc.postMessage({ type: 'ACTIVE_TENANT_CHANGED', tenantId });
        bc.close();
      } catch {}
    }
  } catch (err) {
    logger.error('SchoolTenantService', 'Failed to set active tenant ID in storage', err);
  }

  const currentUser = auth.currentUser;
  if (currentUser && tenantId) {
    const prefDocRef = doc(db, 'users', currentUser.uid, 'prefs', 'school');
    setDoc(prefDocRef, { activeTenantId: tenantId, updatedAt: serverTimestamp() }, { merge: true })
      .catch((err) => logger.warn('SchoolTenantService', 'Notice saving user school preference', undefined, err));
  }
}

export async function getGlobalActiveTenantId(): Promise<string | null> {
  const currentUser = auth.currentUser;
  if (!currentUser) return null;

  try {
    const prefDocRef = doc(db, 'users', currentUser.uid, 'prefs', 'school');
    const snap = await withTimeout(getDoc(prefDocRef), 5000);
    if (snap.exists()) {
      const data = snap.data();
      if (data && data.activeTenantId) {
        return data.activeTenantId as string;
      }
    }
  } catch (err) {
    logger.warn('SchoolTenantService', 'Notice fetching user school preference from Firestore', undefined, err);
  }
  return null;
}

export function getDeletedTenantIds(uid?: string): string[] {
  try {
    const key = getDeletedTenantsStorageKey(uid);
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    logger.warn('SchoolTenantService', 'Failed to parse deleted tenants from storage', undefined, err);
    return [];
  }
}

export function addDeletedTenantId(tenantId: string, uid?: string) {
  try {
    const key = getDeletedTenantsStorageKey(uid);
    const current = getDeletedTenantIds(uid);
    if (!current.includes(tenantId)) {
      localStorage.setItem(key, JSON.stringify([...current, tenantId]));
    }
  } catch (err) {
    logger.error('SchoolTenantService', 'Failed to add deleted tenant ID to storage', err);
  }
}

export function removeDeletedTenantId(tenantId: string, uid?: string) {
  try {
    const key = getDeletedTenantsStorageKey(uid);
    const current = getDeletedTenantIds(uid);
    const updated = current.filter((id) => id !== tenantId);
    localStorage.setItem(key, JSON.stringify(updated));
  } catch (err) {
    logger.error('SchoolTenantService', 'Failed to remove deleted tenant ID from storage', err);
  }
}

// Track local known revision per tenant
export function getStoredTenantRev(tenantId: string, uid?: string): number {
  const effectiveUid = uid || auth.currentUser?.uid || 'guest';
  try {
    const raw = localStorage.getItem(`LPJ_TENANT_REV_${effectiveUid}_${tenantId}`) ||
                localStorage.getItem(`LPJ_TENANT_REV_${tenantId}`);
    return raw ? Number(raw) || 1 : 1;
  } catch {
    return 1;
  }
}

export function setStoredTenantRev(tenantId: string, rev: number, uid?: string): void {
  const effectiveUid = uid || auth.currentUser?.uid || 'guest';
  try {
    localStorage.setItem(`LPJ_TENANT_REV_${effectiveUid}_${tenantId}`, String(rev));
    localStorage.setItem(`LPJ_TENANT_REV_${tenantId}`, String(rev));
  } catch (err) {
    logger.warn('SchoolTenantService', 'Failed to save local rev', undefined, err);
  }
}

// 3. Convert User Memberships to SchoolTenant list (Requirement 2: zero global school collection scans)
export function mapMembershipsToTenants(memberships: UserMembershipRecord[]): SchoolTenant[] {
  return memberships.map((m) => ({
    id: m.schoolId,
    namaSekolah: m.namaSekolah,
    npsn: m.npsn,
    jenjang: (m.jenjang || 'SD') as SchoolTenant['jenjang'],
    kabKota: m.kabKota || '-',
    provinsi: '-',
    email: '-',
    isDemo: false,
    createdAt: typeof m.lastOpenedAt === 'string' ? m.lastOpenedAt : new Date().toISOString(),
    lastLogin: typeof m.lastOpenedAt === 'string' ? m.lastOpenedAt : new Date().toISOString(),
  }));
}

/**
 * @deprecated Use memberships via subscribeUserMemberships instead.
 * Preserved for fallback when no user is signed in.
 */
export async function getAllSchoolTenants(): Promise<SchoolTenant[]> {
  return [];
}

function sanitizeForFirestore<T>(obj: T): Record<string, any> {
  return JSON.parse(JSON.stringify(obj, (_key, value) => (value === undefined ? null : value)));
}

// Document Size Checker (< 950 KB limit for 1 MB Firestore protection, Requirement 5)
export function assertDocumentSize(payload: Record<string, any>, docName: string): void {
  const json = JSON.stringify(payload);
  const sizeBytes = new Blob([json]).size;
  const MAX_ALLOWED_BYTES = 950 * 1024; // 950 KB
  if (sizeBytes > MAX_ALLOWED_BYTES) {
    throw new Error(
      `UKURAN_DOKUMEN_LEBIH: Dokumen '${docName}' berukuran ${(sizeBytes / 1024).toFixed(1)} KB (melebihi batas aman Firestore 950 KB). Simpan gambar/logo melalui penyimpanan blob lokal.`
    );
  }
}

// 4. Register a brand new School in Firestore via Cloud Function (Requirement 7)
export async function registerNewSchoolTenant(params: {
  namaSekolah: string;
  npsn: string;
  jenjang: 'TK/PAUD' | 'SD' | 'SMP/MTs' | 'SMA/SMK' | string;
  kabKota: string;
  provinsi: string;
  email?: string;
  pin: string;
  templateType: 'full' | 'blank';
}): Promise<{ tenant: SchoolTenant; state: AppStateData }> {
  // Call server-side Cloud Function
  const created = await createSchoolCallable({
    namaSekolah: params.namaSekolah.trim(),
    npsn: params.npsn.trim(),
    jenjang: params.jenjang,
    kabKota: params.kabKota.trim(),
    provinsi: params.provinsi.trim(),
    pin: params.pin.trim(),
  });

  const tenantId = created.schoolId;
  const newTenant: SchoolTenant = {
    id: tenantId,
    npsn: created.npsn,
    namaSekolah: created.namaSekolah,
    jenjang: params.jenjang as SchoolTenant['jenjang'],
    kabKota: params.kabKota.trim(),
    provinsi: params.provinsi.trim(),
    email: params.email?.trim() || '-',
    isDemo: false,
    createdAt: new Date().toISOString(),
    lastLogin: new Date().toISOString(),
  };

  const initialState = createSchoolStateForTenant(newTenant, params.templateType);

  const uid = auth.currentUser?.uid || 'guest';
  const idbKey = getTenantCacheKey(tenantId, uid);
  await setIndexedDbCache(idbKey, initialState);
  setStoredTenantRev(tenantId, 1, uid);
  setStoredActiveTenantId(tenantId);

  // Background Cloud Save (non-blocking for instant UI response)
  if (!isFirestoreDatabaseMissingGlobally()) {
    saveSchoolTenantAppState(tenantId, initialState, 0, uid).catch((err) => {
      logger.warn('SchoolTenantService', 'Notice initial background cloud save for new tenant', undefined, err);
    });
  }

  return { tenant: newTenant, state: initialState };
}

const BLOCKED_AUTOSAVE_PREFIX = 'LPJ_AUTOSAVE_BLOCKED_';

export function setCloudAutosaveBlocked(tenantId: string, blocked: boolean): void {
  try {
    if (blocked) {
      localStorage.setItem(`${BLOCKED_AUTOSAVE_PREFIX}${tenantId}`, 'true');
    } else {
      localStorage.removeItem(`${BLOCKED_AUTOSAVE_PREFIX}${tenantId}`);
    }
  } catch {}
}

export function isCloudAutosaveBlockedForTenant(tenantId: string): boolean {
  try {
    return localStorage.getItem(`${BLOCKED_AUTOSAVE_PREFIX}${tenantId}`) === 'true';
  } catch {
    return false;
  }
}

// 5. Read Domain Documents + Meta
export async function readDomainDocuments(tenantId: string): Promise<{ state: AppStateData; maxRev: number } | null> {
  const [metaSnap, masterSnap, kwitansiSnap, bkuSnap, wageSnap, progressSnap, rpdSnap] = await Promise.all([
    withTimeout(getDoc(doc(db, 'schools', tenantId, 'lpj_data', 'meta')), 8000).catch(() => null),
    withTimeout(getDoc(doc(db, 'schools', tenantId, 'lpj_data', 'master')), 8000),
    withTimeout(getDoc(doc(db, 'schools', tenantId, 'lpj_data', 'kwitansi')), 8000),
    withTimeout(getDoc(doc(db, 'schools', tenantId, 'lpj_data', 'bku')), 8000),
    withTimeout(getDoc(doc(db, 'schools', tenantId, 'lpj_data', 'wageReports')), 8000),
    withTimeout(getDoc(doc(db, 'schools', tenantId, 'lpj_data', 'progressWeeks')), 8000),
    withTimeout(getDoc(doc(db, 'schools', tenantId, 'lpj_data', 'rpd')), 8000),
  ]);

  if (!masterSnap.exists() && !kwitansiSnap.exists() && !bkuSnap.exists() && (!metaSnap || !metaSnap.exists())) {
    return null;
  }

  const metaData = metaSnap && metaSnap.exists() ? metaSnap.data() : null;
  const masterData = masterSnap.data() || {};
  const kwitansiData = kwitansiSnap.data() || {};
  const bkuData = bkuSnap.data() || {};
  const wageData = wageSnap.data() || {};
  const progressData = progressSnap.data() || {};
  const rpdData = rpdSnap.data() || {};

  const maxRev = Math.max(
    Number(metaData?.rev) || 1,
    Number(masterData.rev) || 1,
    Number(kwitansiData.rev) || 1,
    Number(bkuData.rev) || 1,
    Number(wageData.rev) || 1,
    Number(progressData.rev) || 1,
    Number(rpdData.rev) || 1
  );

  const rawState: AppStateData = {
    school: masterData.school || null,
    workers: masterData.workers || [],
    stores: masterData.stores || [],
    realSchoolData: masterData.realSchoolData || undefined,
    kwitansiList: kwitansiData.kwitansiList || [],
    deletedKwitansiIds: kwitansiData.deletedKwitansiIds || [],
    manualBkuTransactions: bkuData.manualBkuTransactions || [],
    deletedBkuIds: bkuData.deletedBkuIds || [],
    bkbRecords: bkuData.bkbRecords || [],
    manualTaxRecords: bkuData.manualTaxRecords || [],
    deletedTaxIds: bkuData.deletedTaxIds || [],
    wageReports: wageData.wageReports || [],
    progressWeeks: progressData.progressWeeks || [],
    rpdItems: rpdData.rpdItems || [],
  };

  const rehydrated = await rehydrateBlobsInState(rawState);
  return { state: rehydrated, maxRev };
}

// 6. Load LPJ data for a specific school
export async function loadSchoolTenantAppState(tenant: SchoolTenant, callerUid?: string): Promise<{
  state: AppStateData;
  source: 'cloud' | 'cache' | 'fresh_preset';
  rev: number;
  cloudReadFailed?: boolean;
  isCloudAutosaveBlocked?: boolean;
}> {
  const tenantId = tenant.id;
  const uid = callerUid || auth.currentUser?.uid || 'guest';
  const defaultState = createSchoolStateForTenant(tenant, 'full');
  defaultState.tenantId = tenantId;
  const idbKey = getTenantCacheKey(tenantId, uid);

  let cloudReadError = false;
  let docConfirmedMissing = false;

  // Try 1: Fetch from Cloud Firestore
  if (!isFirestoreDatabaseMissingGlobally() && !checkIsQuotaExhausted()) {
    try {
      const domainResult = await readDomainDocuments(tenantId);
      if (domainResult && domainResult.state && domainResult.state.school) {
        const mergedState = sanitizeAndFilterDemoState({
          ...defaultState,
          ...domainResult.state,
          tenantId,
          school: {
            ...defaultState.school,
            ...(domainResult.state.school || {}),
          },
        });
        mergedState.tenantId = tenantId;

        setStoredTenantRev(tenantId, domainResult.maxRev, uid);
        setCloudAutosaveBlocked(tenantId, false);
        await setIndexedDbCache(idbKey, mergedState);
        try {
          localStorage.setItem(idbKey, JSON.stringify(mergedState));
        } catch {}

        return {
          state: mergedState,
          source: 'cloud',
          rev: domainResult.maxRev,
          isCloudAutosaveBlocked: false,
        };
      }

      // Check legacy 'current' read-only for migration if domain docs do not exist
      const legacyDocRef = doc(db, 'schools', tenantId, 'lpj_data', 'current');
      const docSnap = await withTimeout(getDoc(legacyDocRef), 10000);
      if (docSnap.exists()) {
        const cloudData = docSnap.data();
        if (cloudData && cloudData.school) {
          const rawMergedState: AppStateData = {
            ...defaultState,
            ...cloudData,
            tenantId,
            school: {
              ...defaultState.school,
              ...(cloudData.school || {}),
            },
          };
          const mergedState = sanitizeAndFilterDemoState(rawMergedState);
          mergedState.tenantId = tenantId;
          const rev = Number(cloudData.rev) || 1;
          setStoredTenantRev(tenantId, rev, uid);
          setCloudAutosaveBlocked(tenantId, false);

          await setIndexedDbCache(idbKey, mergedState);
          try {
            localStorage.setItem(idbKey, JSON.stringify(mergedState));
          } catch {}

          return {
            state: mergedState,
            source: 'cloud',
            rev,
            isCloudAutosaveBlocked: false,
          };
        }
      } else {
        docConfirmedMissing = true;
      }
    } catch (err: any) {
      cloudReadError = true;
      const errMsg = err?.message || String(err);
      if (errMsg.includes('not-found') || errMsg.includes('not_found') || errMsg.includes('does not exist')) {
        markFirestoreDatabaseMissingGlobally();
      }
      if (errMsg.includes('resource-exhausted') || errMsg.includes('Quota limit exceeded') || errMsg.includes('Quota exceeded')) {
        markQuotaExhausted();
      }
      logger.warn('SchoolTenantService', `Could not read Firestore for ${tenantId}`, undefined, err);
    }
  }

  // Try 2: Load from IndexedDB
  try {
    const idbCached = await getIndexedDbCache<AppStateData>(idbKey);
    if (idbCached && idbCached.school) {
      const mergedCache = sanitizeAndFilterDemoState({
        ...defaultState,
        ...idbCached,
        tenantId,
        school: {
          ...defaultState.school,
          ...(idbCached.school || {}),
        },
      });
      mergedCache.tenantId = tenantId;

      const isBlocked = cloudReadError && !docConfirmedMissing;
      setCloudAutosaveBlocked(tenantId, isBlocked);

      return {
        state: mergedCache,
        source: 'cache',
        rev: getStoredTenantRev(tenantId, uid),
        cloudReadFailed: cloudReadError,
        isCloudAutosaveBlocked: isBlocked,
      };
    }
  } catch (err) {
    logger.warn('SchoolTenantService', `IndexedDB cache read error for ${tenantId}`, undefined, err);
  }

  // Try 3: Load from LocalStorage fallback
  try {
    const cachedRaw = localStorage.getItem(idbKey);
    if (cachedRaw) {
      const parsed = JSON.parse(cachedRaw);
      if (parsed && parsed.school) {
        const mergedCache = sanitizeAndFilterDemoState({
          ...defaultState,
          ...parsed,
          tenantId,
          school: {
            ...defaultState.school,
            ...(parsed.school || {}),
          },
        });
        mergedCache.tenantId = tenantId;

        const isBlocked = cloudReadError && !docConfirmedMissing;
        setCloudAutosaveBlocked(tenantId, isBlocked);

        setIndexedDbCache(idbKey, mergedCache);
        return {
          state: mergedCache,
          source: 'cache',
          rev: getStoredTenantRev(tenantId, uid),
          cloudReadFailed: cloudReadError,
          isCloudAutosaveBlocked: isBlocked,
        };
      }
    }
  } catch (err) {
    logger.warn('SchoolTenantService', `LocalStorage cache read error for ${tenantId}`, undefined, err);
  }

  // Try 4: Fresh preset
  defaultState.tenantId = tenantId;
  await setIndexedDbCache(idbKey, defaultState);
  try {
    localStorage.setItem(idbKey, JSON.stringify(defaultState));
  } catch {}

  const isBlocked = cloudReadError && !docConfirmedMissing;
  setCloudAutosaveBlocked(tenantId, isBlocked);

  return {
    state: defaultState,
    source: 'fresh_preset',
    rev: 1,
    cloudReadFailed: cloudReadError,
    isCloudAutosaveBlocked: isBlocked,
  };
}

let isCloudQuotaExhausted = false;

export function checkIsQuotaExhausted(): boolean {
  if (isCloudQuotaExhausted) return true;
  try {
    const until = localStorage.getItem('FIRESTORE_QUOTA_EXHAUSTED_UNTIL');
    if (until && Date.now() < Number(until)) {
      isCloudQuotaExhausted = true;
      return true;
    }
  } catch (err) {
    logger.warn('SchoolTenantService', 'Failed to read quota timestamp', undefined, err);
  }
  return false;
}

export function markQuotaExhausted(): void {
  isCloudQuotaExhausted = true;
  try {
    localStorage.setItem('FIRESTORE_QUOTA_EXHAUSTED_UNTIL', String(Date.now() + 60 * 60 * 1000));
    disableNetwork(db).catch(() => {});
  } catch (err) {
    logger.warn('SchoolTenantService', 'Failed to mark quota exhausted', undefined, err);
  }
}

// 7. Atomic Save with Single runTransaction (Requirement 4 & 5)
export async function saveSchoolTenantAppState(
  tenantId: string,
  stateData: AppStateData,
  expectedRev?: number,
  callerUid?: string
): Promise<SaveTenantResult> {
  if (!tenantId) {
    throw new Error('TENANT_ID_REQUIRED: tenantId wajib disertakan saat menyimpan state.');
  }

  // Storage Guard Assertion (Requirement 4 & TAHAP 6)
  if (stateData.tenantId && stateData.tenantId !== tenantId) {
    const errorMsg = `MISMATCH_ASSERTION: stateData.tenantId (${stateData.tenantId}) tidak cocok dengan target tenantId (${tenantId})! Penyimpanan ditolak demi keamanan data.`;
    logger.error('SchoolTenantService', errorMsg);
    throw new Error(errorMsg);
  }

  if (stateData.school) {
    const schoolObj = stateData.school as any;
    const stateId = schoolObj.id || schoolObj.tenantId;
    if (stateId && stateId !== tenantId) {
      const errorMsg = `MISMATCH_ASSERTION: State sekolah (ID: ${stateId}) tidak cocok dengan target tenantId (${tenantId})! Penyimpanan ditolak demi keamanan data.`;
      logger.error('SchoolTenantService', errorMsg);
      throw new Error(errorMsg);
    }
  }

  const effectiveUid = callerUid || auth.currentUser?.uid || 'guest';
  const idbKey = getTenantCacheKey(tenantId, effectiveUid);

  // Step 1: Always update high-capacity local IndexedDB cache instantly
  let localCachedOk = await setIndexedDbCache(idbKey, stateData);
  try {
    localStorage.setItem(idbKey, JSON.stringify(stateData));
    localCachedOk = true;
  } catch {}

  // Safety check: If Firestore DB is missing or autosave is blocked, skip cloud write
  if (isFirestoreDatabaseMissingGlobally() || isCloudAutosaveBlockedForTenant(tenantId)) {
    return {
      local: localCachedOk,
      cloud: 'skipped',
    };
  }

  // Quota check
  if (checkIsQuotaExhausted()) {
    return { local: localCachedOk, cloud: 'quota' };
  }

  const currentExpectedRev = expectedRev !== undefined ? expectedRev : getStoredTenantRev(tenantId, effectiveUid);

  try {
    // Offload blobs first outside the transaction
    const offloadedState = await offloadLargeBlobs(stateData);
    const userIdent = auth.currentUser?.email || auth.currentUser?.displayName || auth.currentUser?.uid || 'user';

    const metaDocRef = doc(db, 'schools', tenantId, 'lpj_data', 'meta');
    const masterDocRef = doc(db, 'schools', tenantId, 'lpj_data', 'master');
    const kwitansiDocRef = doc(db, 'schools', tenantId, 'lpj_data', 'kwitansi');
    const bkuDocRef = doc(db, 'schools', tenantId, 'lpj_data', 'bku');
    const wageReportsDocRef = doc(db, 'schools', tenantId, 'lpj_data', 'wageReports');
    const progressWeeksDocRef = doc(db, 'schools', tenantId, 'lpj_data', 'progressWeeks');
    const rpdDocRef = doc(db, 'schools', tenantId, 'lpj_data', 'rpd');
    const schoolDocRef = doc(db, 'schools', tenantId);

    let nextRev = currentExpectedRev + 1;

    // Single runTransaction for read rev + write domain docs + meta (Requirement 5)
    await runTransaction(db, async (transaction) => {
      const [metaSnap, masterSnap] = await Promise.all([
        transaction.get(metaDocRef),
        transaction.get(masterDocRef),
      ]);

      let serverRev = 0;
      if (metaSnap.exists()) {
        serverRev = Number(metaSnap.data()?.rev) || 1;
      } else if (masterSnap.exists()) {
        serverRev = Number(masterSnap.data()?.rev) || 1;
      }

      // Check revision concurrency conflict
      if (serverRev > 0 && currentExpectedRev > 0 && serverRev !== currentExpectedRev) {
        const conflictErr: any = new Error('CONCURRENCY_CONFLICT');
        conflictErr.serverRev = serverRev;
        throw conflictErr;
      }

      nextRev = (serverRev > 0 ? serverRev : currentExpectedRev) + 1;

      // Prepare payloads
      const metaPayload = sanitizeForFirestore({
        rev: nextRev,
        updatedBy: userIdent,
        updatedAt: serverTimestamp(),
      });

      const masterPayload = sanitizeForFirestore({
        school: offloadedState.school,
        workers: offloadedState.workers || [],
        stores: offloadedState.stores || [],
        realSchoolData: offloadedState.realSchoolData || null,
        rev: nextRev,
        updatedBy: userIdent,
        updatedAt: serverTimestamp(),
      });

      const kwitansiPayload = sanitizeForFirestore({
        kwitansiList: offloadedState.kwitansiList || [],
        deletedKwitansiIds: offloadedState.deletedKwitansiIds || [],
        rev: nextRev,
        updatedBy: userIdent,
        updatedAt: serverTimestamp(),
      });

      const bkuPayload = sanitizeForFirestore({
        manualBkuTransactions: offloadedState.manualBkuTransactions || [],
        deletedBkuIds: offloadedState.deletedBkuIds || [],
        bkbRecords: offloadedState.bkbRecords || [],
        manualTaxRecords: offloadedState.manualTaxRecords || [],
        deletedTaxIds: offloadedState.deletedTaxIds || [],
        rev: nextRev,
        updatedBy: userIdent,
        updatedAt: serverTimestamp(),
      });

      const wageReportsPayload = sanitizeForFirestore({
        wageReports: offloadedState.wageReports || [],
        rev: nextRev,
        updatedBy: userIdent,
        updatedAt: serverTimestamp(),
      });

      const progressWeeksPayload = sanitizeForFirestore({
        progressWeeks: offloadedState.progressWeeks || [],
        rev: nextRev,
        updatedBy: userIdent,
        updatedAt: serverTimestamp(),
      });

      const rpdPayload = sanitizeForFirestore({
        rpdItems: offloadedState.rpdItems || [],
        rev: nextRev,
        updatedBy: userIdent,
        updatedAt: serverTimestamp(),
      });

      // Assert document size limits (< 950 KB)
      assertDocumentSize(masterPayload, 'master');
      assertDocumentSize(kwitansiPayload, 'kwitansi');
      assertDocumentSize(bkuPayload, 'bku');
      assertDocumentSize(wageReportsPayload, 'wageReports');
      assertDocumentSize(progressWeeksPayload, 'progressWeeks');
      assertDocumentSize(rpdPayload, 'rpd');

      // Atomic write in single transaction
      transaction.set(metaDocRef, metaPayload, { merge: true });
      transaction.set(masterDocRef, masterPayload, { merge: true });
      transaction.set(kwitansiDocRef, kwitansiPayload, { merge: true });
      transaction.set(bkuDocRef, bkuPayload, { merge: true });
      transaction.set(wageReportsDocRef, wageReportsPayload, { merge: true });
      transaction.set(progressWeeksDocRef, progressWeeksPayload, { merge: true });
      transaction.set(rpdDocRef, rpdPayload, { merge: true });

      // Update parent school metadata
      if (offloadedState.school) {
        transaction.set(
          schoolDocRef,
          {
            id: tenantId,
            npsn: offloadedState.school.npsn || '',
            namaSekolah: offloadedState.school.namaSekolah || '',
            jenjang: (offloadedState.school as any)?.jenjang || 'SD',
            kabKota: offloadedState.school.kabKota || '',
            provinsi: offloadedState.school.provinsi || '',
            totalAnggaran: offloadedState.school.totalAnggaran || 0,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
    });

    setStoredTenantRev(tenantId, nextRev, effectiveUid);
    dequeueSyncItem(tenantId, effectiveUid);

    return {
      local: localCachedOk,
      cloud: 'ok',
      rev: nextRev,
    };
  } catch (err: any) {
    const errMsg = `${err?.code || ''} ${err?.message || ''} ${String(err)}`.toLowerCase();

    if (errMsg === 'concurrency_conflict' || errMsg.includes('concurrency_conflict')) {
      const serverResult = await readDomainDocuments(tenantId);
      logger.warn('SchoolTenantService', `Concurrency conflict detected for ${tenantId}. Expected rev ${currentExpectedRev}`);
      return {
        local: localCachedOk,
        cloud: 'failed',
        error: 'CONCURRENCY_CONFLICT',
        rev: err?.serverRev || currentExpectedRev + 1,
        serverState: serverResult?.state,
      };
    }

    if (errMsg.includes('not-found') || errMsg.includes('not_found') || errMsg.includes('does not exist')) {
      markFirestoreDatabaseMissingGlobally();
      return {
        local: localCachedOk,
        cloud: 'skipped',
      };
    }

    if (errMsg.includes('resource-exhausted') || errMsg.includes('Quota limit exceeded') || errMsg.includes('Quota exceeded')) {
      markQuotaExhausted();
      return { local: localCachedOk, cloud: 'quota' };
    }

    logger.error('SchoolTenantService', `Cloud save failed for ${tenantId}; enqueuing for retry`, err);

    // Enqueue for automatic retry with exponential backoff (Requirement 6)
    enqueueSyncItem({
      id: `${tenantId}_${Date.now()}`,
      uid: effectiveUid,
      tenantId,
      state: stateData,
      expectedRev: currentExpectedRev,
      attemptCount: 0,
      nextRetryTime: Date.now() + 2000,
      createdAt: new Date().toISOString(),
    });

    return {
      local: localCachedOk,
      cloud: 'failed',
      error: errMsg,
      rev: currentExpectedRev,
    };
  }
}

// 8. Offline Retry Queue with Exponential Backoff (Requirement 6: scoped to UID)
export function loadSyncQueue(): SyncQueueItem[] {
  try {
    const raw = localStorage.getItem(SYNC_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    logger.warn('SchoolTenantService', 'Failed to read sync queue from localStorage', undefined, err);
    return [];
  }
}

export function saveSyncQueue(queue: SyncQueueItem[]): void {
  try {
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    logger.warn('SchoolTenantService', 'Failed to write sync queue to localStorage', undefined, err);
  }
}

export function enqueueSyncItem(item: SyncQueueItem): void {
  const queue = loadSyncQueue().filter((q) => !(q.tenantId === item.tenantId && q.uid === item.uid));
  queue.push(item);
  saveSyncQueue(queue);
  notifySyncStatusListeners();
}

export function dequeueSyncItem(tenantId: string, uid?: string): void {
  const effectiveUid = uid || auth.currentUser?.uid;
  const queue = loadSyncQueue().filter((q) => {
    if (effectiveUid) {
      return !(q.tenantId === tenantId && q.uid === effectiveUid);
    }
    return q.tenantId !== tenantId;
  });
  saveSyncQueue(queue);
  notifySyncStatusListeners();
}

export function isTenantPendingSync(tenantId: string, uid?: string): boolean {
  const effectiveUid = uid || auth.currentUser?.uid;
  const queue = loadSyncQueue();
  return queue.some((item) => item.tenantId === tenantId && (!effectiveUid || item.uid === effectiveUid));
}

export function getPendingSyncCount(uid?: string): number {
  const effectiveUid = uid || auth.currentUser?.uid;
  const queue = loadSyncQueue();
  if (!effectiveUid) return queue.length;
  return queue.filter((q) => q.uid === effectiveUid).length;
}

type SyncStatusListener = (pendingCount: number) => void;
const syncStatusListeners: Set<SyncStatusListener> = new Set();

export function subscribeSyncStatus(listener: SyncStatusListener): () => void {
  syncStatusListeners.add(listener);
  listener(getPendingSyncCount());
  return () => {
    syncStatusListeners.delete(listener);
  };
}

function notifySyncStatusListeners() {
  const count = getPendingSyncCount();
  syncStatusListeners.forEach((fn) => fn(count));
}

// Background Retry Worker with Exponential Backoff (Requirement 6)
let retryWorkerTimer: any = null;

export function startSyncRetryWorker(intervalMs = 4000): void {
  if (retryWorkerTimer) return;

  retryWorkerTimer = setInterval(async () => {
    if (checkIsQuotaExhausted() || !navigator.onLine) return;

    const currentAuthUid = auth.currentUser?.uid;
    if (!currentAuthUid) return;

    const queue = loadSyncQueue();
    if (queue.length === 0) return;

    const now = Date.now();
    for (const item of queue) {
      // Must verify item belongs to currently authenticated user (Requirement 6)
      if (item.uid !== currentAuthUid) continue;

      if (now >= item.nextRetryTime) {
        logger.info('SchoolTenantService', `Retrying sync for tenant ${item.tenantId} (attempt ${item.attemptCount + 1})`);
        try {
          const res = await saveSchoolTenantAppState(item.tenantId, item.state, item.expectedRev, item.uid);
          if (res.cloud === 'ok') {
            dequeueSyncItem(item.tenantId, item.uid);
          } else {
            item.attemptCount += 1;
            const delay = Math.min(30000, Math.pow(2, Math.min(item.attemptCount, 5)) * 1000);
            item.nextRetryTime = now + delay;
            saveSyncQueue(queue);
            notifySyncStatusListeners();
          }
        } catch (err) {
          item.attemptCount += 1;
          const delay = Math.min(30000, Math.pow(2, Math.min(item.attemptCount, 5)) * 1000);
          item.nextRetryTime = now + delay;
          saveSyncQueue(queue);
          notifySyncStatusListeners();
        }
      }
    }
  }, intervalMs);
}

// Clear user tenant cache and retry queue on logout (Requirement 6)
export async function clearUserTenantCacheAndQueue(uid: string): Promise<void> {
  if (!uid) return;
  const keysToRemove: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (
        k &&
        (k.startsWith(`LPJ_TENANT_CACHE_${uid}_`) ||
          k.startsWith(`GOOGLE_SHEET_INFO_${uid}_`) ||
          k.startsWith(`LPJ_TENANT_REV_${uid}_`))
      ) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch {}

  // Filter out queue items for this user
  const queue = loadSyncQueue().filter((item) => item.uid !== uid);
  saveSyncQueue(queue);
  notifySyncStatusListeners();
}

/**
 * @deprecated Use deleteSchoolCallable from schoolMembershipService instead.
 */
export async function deleteSchoolTenant(tenantId: string): Promise<boolean> {
  console.warn('[DEPRECATED] deleteSchoolTenant client deletion dipanggil. Gunakan deleteSchoolCallable.');
  return false;
}

/**
 * @deprecated PIN hash is now stored in schools/{schoolId}/private/security via Cloud Functions.
 */
export async function updateSchoolPinHash(schoolId: string, newPin: string): Promise<any> {
  console.warn('[DEPRECATED] updateSchoolPinHash dipanggil di klien. Gunakan changeSchoolPinCallable.');
  return { pinHash: '', pinSalt: '' };
}

/**
 * @deprecated Member documents can only be created via Cloud Functions.
 */
export async function upsertSchoolMember(schoolId: string, member: any): Promise<void> {
  console.warn('[DEPRECATED] upsertSchoolMember dipanggil di klien. Gunakan joinSchoolCallable atau setMemberRoleCallable.');
}
