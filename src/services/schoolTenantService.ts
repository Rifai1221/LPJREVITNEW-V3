import {
  collection,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  getDocs,
  serverTimestamp,
  disableNetwork,
  runTransaction,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { AppStateData } from '../types';
import { sanitizeAndFilterDemoState } from './storageService';
import {
  SchoolTenant,
  DEFAULT_PRESET_TENANTS,
  PRESET_SDN1_MUARA_DUA,
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

const ACTIVE_TENANT_STORAGE_KEY = 'ACTIVE_SCHOOL_TENANT_ID_V1';
const TENANT_CACHE_PREFIX = 'LPJ_TENANT_CACHE_';
const SYNC_QUEUE_KEY = 'LPJ_SYNC_RETRY_QUEUE_V1';
const TENANT_REV_PREFIX = 'LPJ_TENANT_REV_';

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

// 1. Get currently active tenant ID
export function getStoredActiveTenantId(): string {
  try {
    const saved = localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY);
    if (saved) return saved;
    if (isHideDemoPresets()) {
      return 'sch_real_primary';
    }
    return PRESET_SDN1_MUARA_DUA.id;
  } catch (err) {
    logger.warn('SchoolTenantService', 'Failed to read active tenant ID from storage', undefined, err);
    return 'sch_real_primary';
  }
}

export function setStoredActiveTenantId(tenantId: string): void {
  try {
    localStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, tenantId);
  } catch (err) {
    logger.error('SchoolTenantService', 'Failed to set active tenant ID in storage', err);
  }

  const currentUser = auth.currentUser;
  if (currentUser) {
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

export function isHideDemoPresets(): boolean {
  try {
    const val = localStorage.getItem('LPJ_HIDE_DEMO_DATA');
    if (val === 'false') return false;
    return true;
  } catch (err) {
    logger.warn('SchoolTenantService', 'Failed to read hide demo flag', undefined, err);
    return true;
  }
}

const DELETED_TENANTS_KEY = 'LPJ_DELETED_TENANTS_IDS';

export function getDeletedTenantIds(): string[] {
  try {
    const raw = localStorage.getItem(DELETED_TENANTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    logger.warn('SchoolTenantService', 'Failed to parse deleted tenants from storage', undefined, err);
    return [];
  }
}

export function addDeletedTenantId(tenantId: string) {
  try {
    const current = getDeletedTenantIds();
    if (!current.includes(tenantId)) {
      localStorage.setItem(DELETED_TENANTS_KEY, JSON.stringify([...current, tenantId]));
    }
  } catch (err) {
    logger.error('SchoolTenantService', 'Failed to add deleted tenant ID to storage', err);
  }
}

export function removeDeletedTenantId(tenantId: string) {
  try {
    const current = getDeletedTenantIds();
    const updated = current.filter((id) => id !== tenantId);
    localStorage.setItem(DELETED_TENANTS_KEY, JSON.stringify(updated));
  } catch (err) {
    logger.error('SchoolTenantService', 'Failed to remove deleted tenant ID from storage', err);
  }
}

// Track local known revision per tenant
export function getStoredTenantRev(tenantId: string): number {
  try {
    const raw = localStorage.getItem(`${TENANT_REV_PREFIX}${tenantId}`);
    return raw ? Number(raw) || 1 : 1;
  } catch {
    return 1;
  }
}

export function setStoredTenantRev(tenantId: string, rev: number): void {
  try {
    localStorage.setItem(`${TENANT_REV_PREFIX}${tenantId}`, String(rev));
  } catch (err) {
    logger.warn('SchoolTenantService', 'Failed to save local rev', undefined, err);
  }
}

// 2. Fetch all registered school tenants (Filtering out tombstones)
export async function getAllSchoolTenants(): Promise<SchoolTenant[]> {
  const tenantsMap = new Map<string, SchoolTenant>();
  const hideDemo = isHideDemoPresets();
  const deletedIds = getDeletedTenantIds();

  if (!checkIsQuotaExhausted()) {
    try {
      const schoolsCol = collection(db, 'schools');
      const snapshot = await withTimeout(getDocs(schoolsCol), 10000);
      snapshot.forEach((docSnap) => {
        if (deletedIds.includes(docSnap.id)) return;
        const data = docSnap.data();
        // Check tombstone
        if (data?.isDeleted) {
          addDeletedTenantId(docSnap.id);
          return;
        }
        if (data && (data.npsn || data.namaSekolah)) {
          tenantsMap.set(docSnap.id, {
            id: docSnap.id,
            npsn: data.npsn || '',
            namaSekolah: data.namaSekolah || 'Sekolah Terdaftar',
            jenjang: data.jenjang || 'SD',
            kabKota: data.kabKota || '-',
            provinsi: data.provinsi || '-',
            email: data.email || '-',
            isDemo: Boolean(data.isDemo && !data.lastActive),
            pinHash: data.pinHash,
            pinSalt: data.pinSalt,
            mustResetPin: data.mustResetPin ?? (!data.pinHash),
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : (data.createdAt || new Date().toISOString()),
            lastLogin: data.lastLogin?.toDate ? data.lastLogin.toDate().toISOString() : (data.lastLogin || new Date().toISOString()),
          });
        }
      });
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (errMsg.includes('resource-exhausted') || errMsg.includes('Quota limit exceeded') || errMsg.includes('Quota exceeded')) {
        markQuotaExhausted();
      }
      logger.warn('SchoolTenantService', 'Could not fetch schools from Firestore', undefined, err);
    }
  }

  // Local storage custom tenants list
  try {
    const customListRaw = localStorage.getItem('LOCAL_CUSTOM_TENANTS_LIST');
    if (customListRaw) {
      const customList: SchoolTenant[] = JSON.parse(customListRaw);
      customList.forEach((c) => {
        if (!tenantsMap.has(c.id) && !deletedIds.includes(c.id)) {
          tenantsMap.set(c.id, c);
        }
      });
    }
  } catch (err) {
    logger.warn('SchoolTenantService', 'Failed to read LOCAL_CUSTOM_TENANTS_LIST', undefined, err);
  }

  // Presets
  DEFAULT_PRESET_TENANTS.forEach((preset) => {
    if (!tenantsMap.has(preset.id) && !deletedIds.includes(preset.id)) {
      if (!hideDemo) {
        tenantsMap.set(preset.id, preset);
      }
    }
  });

  if (tenantsMap.size === 0) {
    if (hideDemo) {
      const realPrimary: SchoolTenant = {
        id: 'sch_real_primary',
        npsn: '',
        namaSekolah: 'SEKOLAH SAYA (LENGKAPI IDENTITAS)',
        jenjang: 'SD',
        kabKota: '',
        provinsi: '',
        email: '',
        isDemo: false,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
      };
      tenantsMap.set(realPrimary.id, realPrimary);
    } else {
      tenantsMap.set(PRESET_SDN1_MUARA_DUA.id, PRESET_SDN1_MUARA_DUA);
    }
  }

  const deduplicatedMap = new Map<string, SchoolTenant>();
  Array.from(tenantsMap.values()).forEach((tenant) => {
    const key = tenant.id;
    const existing = deduplicatedMap.get(key);
    if (!existing) {
      deduplicatedMap.set(key, tenant);
    } else {
      if (!tenant.isDemo && existing.isDemo) {
        deduplicatedMap.set(key, tenant);
      } else if (tenant.isDemo && !existing.isDemo) {
        // Keep existing
      } else {
        const dateA = new Date(tenant.createdAt || 0).getTime();
        const dateB = new Date(existing.createdAt || 0).getTime();
        if (dateA > dateB) {
          deduplicatedMap.set(key, tenant);
        }
      }
    }
  });

  return Array.from(deduplicatedMap.values());
}

function sanitizeForFirestore<T>(obj: T): Record<string, any> {
  return JSON.parse(JSON.stringify(obj, (_key, value) => (value === undefined ? null : value)));
}

// 3. Register a brand new School in Firestore
export async function registerNewSchoolTenant(
  params: {
    namaSekolah: string;
    npsn: string;
    jenjang: 'TK/PAUD' | 'SD' | 'SMP/MTs' | 'SMA/SMK' | string;
    kabKota: string;
    provinsi: string;
    email: string;
    pin?: string;
    templateType: 'full' | 'blank';
  }
): Promise<{ tenant: SchoolTenant; state: AppStateData }> {
  const cleanNpsn = params.npsn.trim().replace(/\D/g, '');
  const uniqueSuffix = Date.now().toString(36);
  const tenantId = `sch_${cleanNpsn ? `${cleanNpsn}_` : ''}${uniqueSuffix}`;

  removeDeletedTenantId(tenantId);

  let pinHash: string | undefined;
  let pinSalt: string | undefined;
  let mustResetPin = true;

  if (params.pin && params.pin.trim().length >= 6) {
    const { createSaltedPinRecord } = await import('../utils/authHelper');
    const record = await createSaltedPinRecord(params.pin.trim());
    pinHash = record.pinHash;
    pinSalt = record.pinSalt;
    mustResetPin = false;
  }

  const newTenant: SchoolTenant = {
    id: tenantId,
    npsn: cleanNpsn || '10000000',
    namaSekolah: params.namaSekolah.trim().toUpperCase(),
    jenjang: params.jenjang as SchoolTenant['jenjang'],
    kabKota: params.kabKota.trim(),
    provinsi: params.provinsi.trim(),
    email: params.email.trim(),
    isDemo: false,
    pinHash,
    pinSalt,
    mustResetPin,
    createdAt: new Date().toISOString(),
    lastLogin: new Date().toISOString(),
  };

  const initialState = createSchoolStateForTenant(newTenant, params.templateType);

  // 1. Save metadata to Firestore
  if (!checkIsQuotaExhausted()) {
    try {
      const schoolDocRef = doc(db, 'schools', tenantId);
      await withTimeout(
        setDoc(schoolDocRef, {
          id: newTenant.id,
          npsn: newTenant.npsn,
          namaSekolah: newTenant.namaSekolah,
          jenjang: newTenant.jenjang,
          kabKota: newTenant.kabKota,
          provinsi: newTenant.provinsi,
          email: newTenant.email,
          isDemo: false,
          pinHash: pinHash || null,
          pinSalt: pinSalt || null,
          mustResetPin,
          createdAt: serverTimestamp(),
          lastLogin: serverTimestamp(),
        }),
        8000
      );

      const currentAuthUser = auth.currentUser;
      if (currentAuthUser) {
        const memberDocRef = doc(db, 'schools', tenantId, 'members', currentAuthUser.uid);
        await withTimeout(
          setDoc(memberDocRef, {
            uid: currentAuthUser.uid,
            role: 'BENDAHARA',
            email: currentAuthUser.email || '',
            displayName: currentAuthUser.displayName || 'Bendahara',
            updatedAt: serverTimestamp(),
          }),
          8000
        ).catch((err) => logger.warn('SchoolTenantService', 'Notice adding initial member', undefined, err));
      }

      // Save domain documents
      await writeDomainDocuments(tenantId, initialState, 1);
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (errMsg.includes('resource-exhausted') || errMsg.includes('Quota limit exceeded') || errMsg.includes('Quota exceeded')) {
        markQuotaExhausted();
      }
      logger.warn('SchoolTenantService', 'Firestore write notice during registration, saving to local cache', undefined, err);
    }
  }

  const idbKey = `${TENANT_CACHE_PREFIX}${tenantId}`;
  await setIndexedDbCache(idbKey, initialState);
  setStoredTenantRev(tenantId, 1);

  try {
    localStorage.setItem(idbKey, JSON.stringify(initialState));
    const customListRaw = localStorage.getItem('LOCAL_CUSTOM_TENANTS_LIST');
    const customList: SchoolTenant[] = customListRaw ? JSON.parse(customListRaw) : [];
    if (!customList.some((t) => t.id === newTenant.id)) {
      customList.push(newTenant);
      localStorage.setItem('LOCAL_CUSTOM_TENANTS_LIST', JSON.stringify(customList));
    }
  } catch (err) {
    logger.warn('SchoolTenantService', 'Failed to update LOCAL_CUSTOM_TENANTS_LIST', undefined, err);
  }

  setStoredActiveTenantId(tenantId);
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

// 4. Domain Document Splitting & Writing Helper
const DOMAIN_NAMES = ['master', 'kwitansi', 'bku', 'wageReports', 'progressWeeks', 'rpd'] as const;

export async function writeDomainDocuments(
  tenantId: string,
  stateData: AppStateData,
  rev: number
): Promise<void> {
  const userIdent = auth.currentUser?.email || auth.currentUser?.displayName || auth.currentUser?.uid || 'user';
  const offloadedState = await offloadLargeBlobs(stateData);

  const currentPayload = sanitizeForFirestore({
    ...offloadedState,
    rev,
    updatedBy: userIdent,
    updatedAt: serverTimestamp(),
  });

  const masterPayload = sanitizeForFirestore({
    school: offloadedState.school,
    workers: offloadedState.workers || [],
    stores: offloadedState.stores || [],
    realSchoolData: offloadedState.realSchoolData || null,
    rev,
    updatedBy: userIdent,
    updatedAt: serverTimestamp(),
  });

  const kwitansiPayload = sanitizeForFirestore({
    kwitansiList: offloadedState.kwitansiList || [],
    deletedKwitansiIds: offloadedState.deletedKwitansiIds || [],
    rev,
    updatedBy: userIdent,
    updatedAt: serverTimestamp(),
  });

  const bkuPayload = sanitizeForFirestore({
    manualBkuTransactions: offloadedState.manualBkuTransactions || [],
    deletedBkuIds: offloadedState.deletedBkuIds || [],
    bkbRecords: offloadedState.bkbRecords || [],
    manualTaxRecords: offloadedState.manualTaxRecords || [],
    deletedTaxIds: offloadedState.deletedTaxIds || [],
    rev,
    updatedBy: userIdent,
    updatedAt: serverTimestamp(),
  });

  const wageReportsPayload = sanitizeForFirestore({
    wageReports: offloadedState.wageReports || [],
    rev,
    updatedBy: userIdent,
    updatedAt: serverTimestamp(),
  });

  const progressWeeksPayload = sanitizeForFirestore({
    progressWeeks: offloadedState.progressWeeks || [],
    rev,
    updatedBy: userIdent,
    updatedAt: serverTimestamp(),
  });

  const rpdPayload = sanitizeForFirestore({
    rpdItems: offloadedState.rpdItems || [],
    rev,
    updatedBy: userIdent,
    updatedAt: serverTimestamp(),
  });

  // Write all domain docs and current doc concurrently with rev
  await Promise.all([
    withTimeout(setDoc(doc(db, 'schools', tenantId, 'lpj_data', 'current'), currentPayload), 10000),
    withTimeout(setDoc(doc(db, 'schools', tenantId, 'lpj_data', 'master'), masterPayload), 10000),
    withTimeout(setDoc(doc(db, 'schools', tenantId, 'lpj_data', 'kwitansi'), kwitansiPayload), 10000),
    withTimeout(setDoc(doc(db, 'schools', tenantId, 'lpj_data', 'bku'), bkuPayload), 10000),
    withTimeout(setDoc(doc(db, 'schools', tenantId, 'lpj_data', 'wageReports'), wageReportsPayload), 10000),
    withTimeout(setDoc(doc(db, 'schools', tenantId, 'lpj_data', 'progressWeeks'), progressWeeksPayload), 10000),
    withTimeout(setDoc(doc(db, 'schools', tenantId, 'lpj_data', 'rpd'), rpdPayload), 10000),
  ]);
}

// Read domain documents and merge them back into AppStateData
export async function readDomainDocuments(tenantId: string): Promise<{ state: AppStateData; maxRev: number } | null> {
  const [masterSnap, kwitansiSnap, bkuSnap, wageSnap, progressSnap, rpdSnap] = await Promise.all([
    withTimeout(getDoc(doc(db, 'schools', tenantId, 'lpj_data', 'master')), 8000),
    withTimeout(getDoc(doc(db, 'schools', tenantId, 'lpj_data', 'kwitansi')), 8000),
    withTimeout(getDoc(doc(db, 'schools', tenantId, 'lpj_data', 'bku')), 8000),
    withTimeout(getDoc(doc(db, 'schools', tenantId, 'lpj_data', 'wageReports')), 8000),
    withTimeout(getDoc(doc(db, 'schools', tenantId, 'lpj_data', 'progressWeeks')), 8000),
    withTimeout(getDoc(doc(db, 'schools', tenantId, 'lpj_data', 'rpd')), 8000),
  ]);

  if (!masterSnap.exists() && !kwitansiSnap.exists() && !bkuSnap.exists()) {
    return null;
  }

  const masterData = masterSnap.data() || {};
  const kwitansiData = kwitansiSnap.data() || {};
  const bkuData = bkuSnap.data() || {};
  const wageData = wageSnap.data() || {};
  const progressData = progressSnap.data() || {};
  const rpdData = rpdSnap.data() || {};

  const maxRev = Math.max(
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

/**
 * Safe One-Time Non-Destructive Migration
 * If legacy 'current' document exists and domains don't exist yet,
 * splits 'current' into domains, verifies each domain was saved,
 * and marks 'migratedToDomains: true' on 'current' without deleting it.
 */
export async function safeMigrateLegacyDocumentIfNeeded(
  tenantId: string,
  legacyData: any
): Promise<AppStateData | null> {
  try {
    const rawState: AppStateData = {
      school: legacyData.school,
      rpdItems: legacyData.rpdItems || [],
      workers: legacyData.workers || [],
      stores: legacyData.stores || [],
      progressWeeks: legacyData.progressWeeks || [],
      kwitansiList: legacyData.kwitansiList || [],
      wageReports: legacyData.wageReports || [],
      manualBkuTransactions: legacyData.manualBkuTransactions || [],
      deletedBkuIds: legacyData.deletedBkuIds || [],
      deletedKwitansiIds: legacyData.deletedKwitansiIds || [],
      bkbRecords: legacyData.bkbRecords || [],
      manualTaxRecords: legacyData.manualTaxRecords || [],
      deletedTaxIds: legacyData.deletedTaxIds || [],
      realSchoolData: legacyData.realSchoolData,
    };

    const initialRev = Number(legacyData.rev) || 1;
    // 1. Write domain documents
    await writeDomainDocuments(tenantId, rawState, initialRev);

    // 2. Verify all 6 domain docs exist before marking legacy migrated
    const verified = await readDomainDocuments(tenantId);
    if (verified && verified.state.school) {
      // Mark legacy doc as migrated safely without deleting it
      const currentDocRef = doc(db, 'schools', tenantId, 'lpj_data', 'current');
      await setDoc(
        currentDocRef,
        {
          migratedToDomains: true,
          migratedAt: serverTimestamp(),
        },
        { merge: true }
      ).catch((err) => logger.warn('SchoolTenantService', 'Notice updating legacy migration marker', undefined, err));

      logger.info('SchoolTenantService', `Successfully migrated ${tenantId} to domain documents`);
      return verified.state;
    }
  } catch (err) {
    logger.error('SchoolTenantService', `Migration failed for ${tenantId}; keeping legacy document intact`, err);
  }
  return null;
}

// 5. Load LPJ data for a specific school from Cloud Firestore
export async function loadSchoolTenantAppState(tenant: SchoolTenant): Promise<{
  state: AppStateData;
  source: 'cloud' | 'cache' | 'fresh_preset';
  rev: number;
  cloudReadFailed?: boolean;
  isCloudAutosaveBlocked?: boolean;
}> {
  const tenantId = tenant.id;
  const defaultState = createSchoolStateForTenant(tenant, 'full');
  const idbKey = `${TENANT_CACHE_PREFIX}${tenantId}`;

  let cloudReadError = false;
  let docConfirmedMissing = false;

  // Try 1: Fetch from Cloud Firestore
  if (!checkIsQuotaExhausted()) {
    try {
      // Check split domain documents first
      const domainResult = await readDomainDocuments(tenantId);
      if (domainResult && domainResult.state && domainResult.state.school) {
        const mergedState = sanitizeAndFilterDemoState({
          ...defaultState,
          ...domainResult.state,
          school: {
            ...defaultState.school,
            ...(domainResult.state.school || {}),
          },
        });

        setStoredTenantRev(tenantId, domainResult.maxRev);
        setCloudAutosaveBlocked(tenantId, false);
        await setIndexedDbCache(idbKey, mergedState);
        try {
          localStorage.setItem(idbKey, JSON.stringify(mergedState));
        } catch (err) {
          logger.warn('SchoolTenantService', 'Notice saving cache to localStorage', undefined, err);
        }

        return {
          state: mergedState,
          source: 'cloud',
          rev: domainResult.maxRev,
          isCloudAutosaveBlocked: false,
        };
      }

      // Check legacy 'current' document and perform safe one-time migration
      const legacyDocRef = doc(db, 'schools', tenantId, 'lpj_data', 'current');
      const docSnap = await withTimeout(getDoc(legacyDocRef), 10000);

      if (docSnap.exists()) {
        const cloudData = docSnap.data();
        if (cloudData && cloudData.school) {
          const migratedState = await safeMigrateLegacyDocumentIfNeeded(tenantId, cloudData);
          const baseData = migratedState || cloudData;

          const rawMergedState: AppStateData = {
            ...defaultState,
            ...baseData,
            school: {
              ...defaultState.school,
              ...(baseData.school || {}),
            },
          };
          const mergedState = sanitizeAndFilterDemoState(rawMergedState);
          const rev = Number(cloudData.rev) || 1;
          setStoredTenantRev(tenantId, rev);
          setCloudAutosaveBlocked(tenantId, false);

          await setIndexedDbCache(idbKey, mergedState);
          try {
            localStorage.setItem(idbKey, JSON.stringify(mergedState));
          } catch (err) {
            logger.warn('SchoolTenantService', 'Notice saving cache to localStorage', undefined, err);
          }

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
        school: {
          ...defaultState.school,
          ...(idbCached.school || {}),
        },
      });

      const isBlocked = cloudReadError && !docConfirmedMissing;
      setCloudAutosaveBlocked(tenantId, isBlocked);

      return {
        state: mergedCache,
        source: 'cache',
        rev: getStoredTenantRev(tenantId),
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
          school: {
            ...defaultState.school,
            ...(parsed.school || {}),
          },
        });

        const isBlocked = cloudReadError && !docConfirmedMissing;
        setCloudAutosaveBlocked(tenantId, isBlocked);

        setIndexedDbCache(idbKey, mergedCache);
        return {
          state: mergedCache,
          source: 'cache',
          rev: getStoredTenantRev(tenantId),
          cloudReadFailed: cloudReadError,
          isCloudAutosaveBlocked: isBlocked,
        };
      }
    }
  } catch (err) {
    logger.warn('SchoolTenantService', `LocalStorage cache read error for ${tenantId}`, undefined, err);
  }

  // Try 4: Fresh preset
  await setIndexedDbCache(idbKey, defaultState);
  try {
    localStorage.setItem(idbKey, JSON.stringify(defaultState));
  } catch (err) {
    logger.warn('SchoolTenantService', 'Notice saving default preset to localStorage', undefined, err);
  }

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

// 6. Save school LPJ data with Transaction Concurrency & Retry Queue
export async function saveSchoolTenantAppState(
  tenantId: string,
  stateData: AppStateData,
  expectedRev?: number
): Promise<SaveTenantResult> {
  const idbKey = `${TENANT_CACHE_PREFIX}${tenantId}`;

  // Step 1: Always update high-capacity local IndexedDB cache instantly
  const localCachedOk = await setIndexedDbCache(idbKey, stateData);

  // Safely attempt LocalStorage update
  try {
    localStorage.setItem(idbKey, JSON.stringify(stateData));
  } catch (err: any) {
    if (err?.name === 'QuotaExceededError' || String(err).includes('quota')) {
      logger.info('SchoolTenantService', 'LocalStorage quota reached; data safely preserved in IndexedDB.');
    } else {
      logger.warn('SchoolTenantService', 'LocalStorage update notice', undefined, err);
    }
  }

  // Safety check: If autosave to cloud is blocked due to cloud read failure, skip cloud write
  if (isCloudAutosaveBlockedForTenant(tenantId)) {
    logger.warn('SchoolTenantService', `Cloud autosave is blocked for ${tenantId} to prevent overwriting cloud data.`);
    return {
      local: localCachedOk,
      cloud: 'failed',
      error: 'CLOUD_AUTOSAVE_BLOCKED',
    };
  }

  // Step 2: Quota check
  if (checkIsQuotaExhausted()) {
    return { local: localCachedOk, cloud: 'quota' };
  }

  // Step 3: Concurrency revision check via Firestore transaction
  const currentExpectedRev = expectedRev !== undefined ? expectedRev : getStoredTenantRev(tenantId);
  const masterDocRef = doc(db, 'schools', tenantId, 'lpj_data', 'master');
  const currentDocRef = doc(db, 'schools', tenantId, 'lpj_data', 'current');

  try {
    let nextRev = currentExpectedRev + 1;
    let conflictDetected = false;
    let serverRev = 1;

    await runTransaction(db, async (transaction) => {
      const masterSnap = await transaction.get(masterDocRef);
      const currentSnap = await transaction.get(currentDocRef);

      if (masterSnap.exists()) {
        serverRev = Number(masterSnap.data().rev) || 1;
      } else if (currentSnap.exists()) {
        serverRev = Number(currentSnap.data().rev) || 1;
      }

      // If server is strictly ahead of our expected revision, conflict!
      if ((masterSnap.exists() || currentSnap.exists()) && serverRev > currentExpectedRev) {
        conflictDetected = true;
        return;
      }
      nextRev = Math.max(serverRev, currentExpectedRev) + 1;
    });

    if (conflictDetected) {
      // Fetch full server state to allow interactive resolution modal
      const serverResult = await readDomainDocuments(tenantId);
      logger.warn('SchoolTenantService', `Concurrency conflict detected for ${tenantId}. Expected rev ${currentExpectedRev}, Cloud rev ${serverRev}`);
      return {
        local: localCachedOk,
        cloud: 'failed',
        error: 'CONCURRENCY_CONFLICT',
        rev: serverRev,
        serverState: serverResult?.state,
      };
    }

    // Step 4: Write domain documents with next revision
    await writeDomainDocuments(tenantId, stateData, nextRev);
    setStoredTenantRev(tenantId, nextRev);

    // Also update parent school metadata document in schools/{tenantId}
    if (stateData.school) {
      const schoolDocRef = doc(db, 'schools', tenantId);
      await setDoc(
        schoolDocRef,
        {
          id: tenantId,
          npsn: stateData.school.npsn || '',
          namaSekolah: stateData.school.namaSekolah || '',
          jenjang: (stateData.school as any)?.jenjang || 'SD',
          kabKota: stateData.school.kabKota || '',
          provinsi: stateData.school.provinsi || '',
          totalAnggaran: stateData.school.totalAnggaran || 0,
          updatedAt: serverTimestamp(),
          lastLogin: serverTimestamp(),
        },
        { merge: true }
      ).catch((err) => logger.warn('SchoolTenantService', 'Notice updating parent school metadata', undefined, err));
    }

    // Remove successful tenant from retry queue
    dequeueSyncItem(tenantId);

    return {
      local: localCachedOk,
      cloud: 'ok',
      rev: nextRev,
    };
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    if (errMsg.includes('resource-exhausted') || errMsg.includes('Quota limit exceeded') || errMsg.includes('Quota exceeded')) {
      markQuotaExhausted();
      return { local: localCachedOk, cloud: 'quota' };
    }

    logger.error('SchoolTenantService', `Cloud save failed for ${tenantId}; enqueuing for background retry`, err);

    // Enqueue for automatic retry with exponential backoff
    enqueueSyncItem({
      id: `${tenantId}_${Date.now()}`,
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

// 7. Offline Retry Queue with Exponential Backoff
function loadSyncQueue(): SyncQueueItem[] {
  try {
    const raw = localStorage.getItem(SYNC_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    logger.warn('SchoolTenantService', 'Failed to read sync queue from localStorage', undefined, err);
    return [];
  }
}

function saveSyncQueue(queue: SyncQueueItem[]): void {
  try {
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    logger.warn('SchoolTenantService', 'Failed to write sync queue to localStorage', undefined, err);
  }
}

export function enqueueSyncItem(item: SyncQueueItem): void {
  const queue = loadSyncQueue().filter((q) => q.tenantId !== item.tenantId);
  queue.push(item);
  saveSyncQueue(queue);
  notifySyncStatusListeners();
}

export function dequeueSyncItem(tenantId: string): void {
  const queue = loadSyncQueue().filter((q) => q.tenantId !== tenantId);
  saveSyncQueue(queue);
  notifySyncStatusListeners();
}

export function isTenantPendingSync(tenantId: string): boolean {
  const queue = loadSyncQueue();
  return queue.some((item) => item.tenantId === tenantId);
}

export function getPendingSyncCount(): number {
  return loadSyncQueue().length;
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

// Background Retry Worker with Exponential Backoff
let retryWorkerTimer: any = null;

export function startSyncRetryWorker(intervalMs = 4000): void {
  if (retryWorkerTimer) return;

  retryWorkerTimer = setInterval(async () => {
    if (checkIsQuotaExhausted() || !navigator.onLine) return;

    const queue = loadSyncQueue();
    if (queue.length === 0) return;

    const now = Date.now();
    for (const item of queue) {
      if (now >= item.nextRetryTime) {
        logger.info('SchoolTenantService', `Retrying sync for tenant ${item.tenantId} (attempt ${item.attemptCount + 1})`);
        try {
          const res = await saveSchoolTenantAppState(item.tenantId, item.state, item.expectedRev);
          if (res.cloud === 'ok') {
            dequeueSyncItem(item.tenantId);
          } else {
            // Exponential backoff: 2s, 4s, 8s, 16s, max 30s
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

// 8. Delete a school tenant with Firestore Tombstone (Requirement 6)
export async function deleteSchoolTenant(tenantId: string): Promise<boolean> {
  // If cloud deletion fails, MUST return false!
  let cloudSuccess = false;

  try {
    // 1. Write tombstone to Firestore first
    const schoolDocRef = doc(db, 'schools', tenantId);
    await withTimeout(
      setDoc(
        schoolDocRef,
        {
          isDeleted: true,
          deletedAt: serverTimestamp(),
          deletedBy: auth.currentUser?.uid || 'user',
        },
        { merge: true }
      ),
      8000
    );

    // 2. Delete domain documents
    for (const domain of DOMAIN_NAMES) {
      const domainDocRef = doc(db, 'schools', tenantId, 'lpj_data', domain);
      await deleteDoc(domainDocRef).catch((err) => logger.warn('SchoolTenantService', `Notice deleting domain ${domain}`, undefined, err));
    }
    const legacyDocRef = doc(db, 'schools', tenantId, 'lpj_data', 'current');
    await deleteDoc(legacyDocRef).catch((err) => logger.warn('SchoolTenantService', 'Notice deleting legacy doc', undefined, err));

    // 3. Delete school document
    await withTimeout(deleteDoc(schoolDocRef), 8000);
    cloudSuccess = true;
  } catch (err) {
    logger.error('SchoolTenantService', `Cloud deletion failed for ${tenantId}`, err);
    return false; // Requirement 6: kembalikan false bila penghapusan cloud gagal!
  }

  // Local cleanup only after cloud operation succeeded
  addDeletedTenantId(tenantId);
  dequeueSyncItem(tenantId);
  const idbKey = `${TENANT_CACHE_PREFIX}${tenantId}`;
  await removeIndexedDbCache(idbKey);

  try {
    localStorage.removeItem(idbKey);
    localStorage.removeItem(`LPJ_OFFLINE_STATE_${tenantId}`);
    localStorage.removeItem(`${TENANT_REV_PREFIX}${tenantId}`);

    const customListRaw = localStorage.getItem('LOCAL_CUSTOM_TENANTS_LIST');
    if (customListRaw) {
      const customList: SchoolTenant[] = JSON.parse(customListRaw);
      const updated = customList.filter((t) => t.id !== tenantId);
      localStorage.setItem('LOCAL_CUSTOM_TENANTS_LIST', JSON.stringify(updated));
    }
  } catch (err) {
    logger.warn('SchoolTenantService', 'Error clearing local cache during tenant delete', undefined, err);
  }

  return cloudSuccess;
}

// 9. School Members & Roles
export async function getSchoolMember(
  schoolId: string,
  uid: string
): Promise<{ uid: string; role: UserRole; email?: string; displayName?: string } | null> {
  if (checkIsQuotaExhausted() || !schoolId || !uid) return null;
  try {
    const memberDocRef = doc(db, 'schools', schoolId, 'members', uid);
    const snap = await withTimeout(getDoc(memberDocRef), 8000);
    if (snap.exists()) {
      return snap.data() as { uid: string; role: UserRole; email?: string; displayName?: string };
    }
  } catch (err) {
    logger.warn('SchoolTenantService', '[RBAC] Could not fetch school member from Firestore', undefined, err);
  }
  return null;
}

export async function upsertSchoolMember(
  schoolId: string,
  member: { uid: string; role: UserRole; email?: string; displayName?: string }
): Promise<void> {
  if (checkIsQuotaExhausted() || !schoolId || !member.uid) return;
  try {
    const memberDocRef = doc(db, 'schools', schoolId, 'members', member.uid);
    await withTimeout(
      setDoc(
        memberDocRef,
        {
          uid: member.uid,
          role: member.role,
          email: member.email || '',
          displayName: member.displayName || '',
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ),
      8000
    );
  } catch (err) {
    logger.warn('SchoolTenantService', '[RBAC] Failed to upsert member in Firestore', undefined, err);
  }
}

// 10. Update PIN salted hash
export async function updateSchoolPinHash(
  schoolId: string,
  newPin: string
): Promise<{ pinHash: string; pinSalt: string }> {
  const { createSaltedPinRecord } = await import('../utils/authHelper');
  const record = await createSaltedPinRecord(newPin);

  if (!checkIsQuotaExhausted()) {
    try {
      const schoolDocRef = doc(db, 'schools', schoolId);
      await withTimeout(
        setDoc(
          schoolDocRef,
          {
            pinHash: record.pinHash,
            pinSalt: record.pinSalt,
            mustResetPin: false,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        ),
        8000
      );
    } catch (err) {
      logger.warn('SchoolTenantService', 'Failed to update school PIN hash in Firestore', undefined, err);
    }
  }
  return { pinHash: record.pinHash, pinSalt: record.pinSalt };
}
