import {
  collection,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  getDocs,
  serverTimestamp,
  disableNetwork,
} from 'firebase/firestore';
import { db } from './firebase';
import { AppStateData } from '../types';
import { sanitizeAndFilterDemoState } from './storageService';
import {
  SchoolTenant,
  DEFAULT_PRESET_TENANTS,
  PRESET_SDN1_MUARA_DUA,
  createSchoolStateForTenant,
} from '../data/tenantPresets';
import { initialStores } from '../data/initialData';
import {
  setIndexedDbCache,
  getIndexedDbCache,
  removeIndexedDbCache,
} from './indexedDbService';

const ACTIVE_TENANT_STORAGE_KEY = 'ACTIVE_SCHOOL_TENANT_ID_V1';
const TENANT_CACHE_PREFIX = 'LPJ_TENANT_CACHE_';

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

// 1. Get currently active tenant ID (with fallback to global Firestore setting)
export function getStoredActiveTenantId(): string {
  try {
    const saved = localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY);
    if (saved) return saved;
    if (isHideDemoPresets()) {
      return 'sch_real_primary';
    }
    return PRESET_SDN1_MUARA_DUA.id;
  } catch {
    return 'sch_real_primary';
  }
}

export function setStoredActiveTenantId(tenantId: string): void {
  try {
    localStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, tenantId);
  } catch (err) {
    console.error('Failed to set active tenant:', err);
  }
}

// Global active school tracker stored in Firestore
export async function getGlobalActiveTenantId(): Promise<string | null> {
  if (checkIsQuotaExhausted()) return null;
  try {
    const activeDocRef = doc(db, 'app_settings', 'active_school');
    const snap = await withTimeout(getDoc(activeDocRef), 6000);
    if (snap.exists() && snap.data()?.activeTenantId) {
      return snap.data().activeTenantId as string;
    }
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    if (errMsg.includes('resource-exhausted') || errMsg.includes('Quota limit exceeded') || errMsg.includes('Quota exceeded')) {
      markQuotaExhausted();
    }
    console.warn('Could not read global active school from Firestore:', err);
  }
  return null;
}

// Check whether the user wants to hide pure demo presets (Default TRUE for real production)
export function isHideDemoPresets(): boolean {
  try {
    const val = localStorage.getItem('LPJ_HIDE_DEMO_DATA');
    if (val === 'false') return false;
    return true; // Clean production by default
  } catch {
    return true;
  }
}

const DELETED_TENANTS_KEY = 'LPJ_DELETED_TENANTS_IDS';

export function getDeletedTenantIds(): string[] {
  try {
    const raw = localStorage.getItem(DELETED_TENANTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addDeletedTenantId(tenantId: string) {
  try {
    const current = getDeletedTenantIds();
    if (!current.includes(tenantId)) {
      localStorage.setItem(DELETED_TENANTS_KEY, JSON.stringify([...current, tenantId]));
    }
  } catch {}
}

export function removeDeletedTenantId(tenantId: string) {
  try {
    const current = getDeletedTenantIds();
    const updated = current.filter((id) => id !== tenantId);
    localStorage.setItem(DELETED_TENANTS_KEY, JSON.stringify(updated));
  } catch {}
}

// 2. Fetch all registered school tenants (Cloud Firestore + Local Presets)
// CRITICAL: Any school saved in Firestore is real user data and MUST NEVER be dropped or overwritten!
export async function getAllSchoolTenants(): Promise<SchoolTenant[]> {
  const tenantsMap = new Map<string, SchoolTenant>();
  const hideDemo = isHideDemoPresets();
  const deletedIds = getDeletedTenantIds();

  // Step A: Load custom/active schools saved in Firestore FIRST (Highest Priority!)
  if (!checkIsQuotaExhausted()) {
    try {
      const schoolsCol = collection(db, 'schools');
      const snapshot = await withTimeout(getDocs(schoolsCol), 10000);
      snapshot.forEach((docSnap) => {
        if (deletedIds.includes(docSnap.id)) return; // Never resurrect deleted schools
        const data = docSnap.data();
        if (data && (data.npsn || data.namaSekolah)) {
          // Any document stored in Firestore was created or saved by the user!
          tenantsMap.set(docSnap.id, {
            id: docSnap.id,
            npsn: data.npsn || '',
            namaSekolah: data.namaSekolah || 'Sekolah Terdaftar',
            jenjang: data.jenjang || 'SD',
            kabKota: data.kabKota || '-',
            provinsi: data.provinsi || '-',
            email: data.email || '-',
            isDemo: Boolean(data.isDemo && !data.lastActive),
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
      console.warn('Could not fetch schools from Firestore:', err);
    }
  }

  // Step B: Also check local storage custom tenants list if any offline registered
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
  } catch {}

  // Step C: Include default presets unless user explicitly toggled "hideDemo" OR preset was deleted
  DEFAULT_PRESET_TENANTS.forEach((preset) => {
    if (!tenantsMap.has(preset.id) && !deletedIds.includes(preset.id)) {
      if (!hideDemo) {
        tenantsMap.set(preset.id, preset);
      }
    }
  });

  // Step D: Ensure at least one school exists (Real School first if demo is hidden)
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

  // Step E: Deduplicate strictly by tenant ID (Ensure all distinct registered schools are preserved)
  const deduplicatedMap = new Map<string, SchoolTenant>();
  Array.from(tenantsMap.values()).forEach((tenant) => {
    const key = tenant.id;
    const existing = deduplicatedMap.get(key);
    if (!existing) {
      deduplicatedMap.set(key, tenant);
    } else {
      // Prioritize non-demo schools
      if (!tenant.isDemo && existing.isDemo) {
        deduplicatedMap.set(key, tenant);
      } else if (tenant.isDemo && !existing.isDemo) {
        // Keep existing
      } else {
        // Prioritize the newer one chronologically
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

// Helper to remove any undefined values before saving to Firestore (Firestore rejects 'undefined')
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
    password?: string;
    templateType: 'full' | 'blank';
  }
): Promise<{ tenant: SchoolTenant; state: AppStateData }> {
  const cleanNpsn = params.npsn.trim().replace(/\D/g, '');
  const uniqueSuffix = Date.now().toString(36);
  const tenantId = `sch_${cleanNpsn ? `${cleanNpsn}_` : ''}${uniqueSuffix}`;

  // Ensure ID is not blacklisted
  removeDeletedTenantId(tenantId);

  const newTenant: SchoolTenant = {
    id: tenantId,
    npsn: cleanNpsn || '10000000',
    namaSekolah: params.namaSekolah.trim().toUpperCase(),
    jenjang: params.jenjang as SchoolTenant['jenjang'],
    kabKota: params.kabKota.trim(),
    provinsi: params.provinsi.trim(),
    email: params.email.trim(),
    isDemo: false,
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
          createdAt: serverTimestamp(),
          lastLogin: serverTimestamp(),
        }),
        8000
      );

      // 2. Save isolated initial LPJ state to Firestore subcollection
      const dataDocRef = doc(db, 'schools', tenantId, 'lpj_data', 'current');
      const cleanState = sanitizeForFirestore(initialState);
      await withTimeout(
        setDoc(dataDocRef, {
          ...cleanState,
          updatedAt: serverTimestamp(),
        }),
        12000
      );

      // 3. Update global active school pointer in Firestore
      const activeDocRef = doc(db, 'app_settings', 'active_school');
      await withTimeout(
        setDoc(activeDocRef, { activeTenantId: tenantId, updatedAt: serverTimestamp() }, { merge: true }),
        6000
      ).catch(() => {});
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (errMsg.includes('resource-exhausted') || errMsg.includes('Quota limit exceeded') || errMsg.includes('Quota exceeded')) {
        markQuotaExhausted();
      }
      console.warn('Firestore write warning during registration, caching locally:', err);
    }
  }

  // 4. Cache locally immediately via IndexedDB & LocalStorage
  const idbKey = `${TENANT_CACHE_PREFIX}${tenantId}`;
  await setIndexedDbCache(idbKey, initialState);
  try {
    localStorage.setItem(idbKey, JSON.stringify(initialState));
    
    // update local custom list
    const customListRaw = localStorage.getItem('LOCAL_CUSTOM_TENANTS_LIST');
    const customList: SchoolTenant[] = customListRaw ? JSON.parse(customListRaw) : [];
    if (!customList.some((t) => t.id === newTenant.id)) {
      customList.push(newTenant);
      localStorage.setItem('LOCAL_CUSTOM_TENANTS_LIST', JSON.stringify(customList));
    }
  } catch {}

  setStoredActiveTenantId(tenantId);
  return { tenant: newTenant, state: initialState };
}

// 4. Load LPJ data for a specific school from Cloud Firestore (with IndexedDB & local fallback)
// CRITICAL: This function must NEVER overwrite existing Firestore documents with default template!
export async function loadSchoolTenantAppState(tenant: SchoolTenant): Promise<{
  state: AppStateData;
  source: 'cloud' | 'cache' | 'fresh_preset';
}> {
  const tenantId = tenant.id;
  const defaultState = createSchoolStateForTenant(tenant, 'full');
  const idbKey = `${TENANT_CACHE_PREFIX}${tenantId}`;

  // Try 1: Fetch directly from Cloud Firestore (Highest Authority)
  if (!checkIsQuotaExhausted()) {
    try {
      const dataDocRef = doc(db, 'schools', tenantId, 'lpj_data', 'current');
      const docSnap = await withTimeout(getDoc(dataDocRef), 10000);

      if (docSnap.exists()) {
        const cloudData = docSnap.data();
        if (cloudData && cloudData.school) {
          const rawMergedState: AppStateData = {
            ...defaultState,
            ...cloudData,
            school: {
              ...defaultState.school,
              ...(cloudData.school || {}),
            },
            realSchoolData: cloudData.realSchoolData || defaultState.realSchoolData,
            rpdItems: Array.isArray(cloudData.rpdItems) ? cloudData.rpdItems : (defaultState.rpdItems || []),
            workers: Array.isArray(cloudData.workers) ? cloudData.workers : (defaultState.workers || []),
            stores: Array.isArray(cloudData.stores) ? cloudData.stores : (defaultState.stores || []),
            progressWeeks: Array.isArray(cloudData.progressWeeks) && cloudData.progressWeeks.length > 0 ? cloudData.progressWeeks : defaultState.progressWeeks,
            kwitansiList: Array.isArray(cloudData.kwitansiList) ? cloudData.kwitansiList : (defaultState.kwitansiList || []),
            wageReports: Array.isArray(cloudData.wageReports) ? cloudData.wageReports : (defaultState.wageReports || []),
            manualBkuTransactions: Array.isArray(cloudData.manualBkuTransactions) ? cloudData.manualBkuTransactions : [],
            deletedBkuIds: Array.isArray(cloudData.deletedBkuIds) ? cloudData.deletedBkuIds : [],
            deletedKwitansiIds: Array.isArray(cloudData.deletedKwitansiIds) ? cloudData.deletedKwitansiIds : [],
            bkbRecords: Array.isArray(cloudData.bkbRecords) ? cloudData.bkbRecords : [],
            manualTaxRecords: Array.isArray(cloudData.manualTaxRecords) ? cloudData.manualTaxRecords : [],
            deletedTaxIds: Array.isArray(cloudData.deletedTaxIds) ? cloudData.deletedTaxIds : [],
          };
          const mergedState = sanitizeAndFilterDemoState(rawMergedState);

          // Update IndexedDB & LocalStorage cache safely
          await setIndexedDbCache(idbKey, mergedState);
          try {
            localStorage.setItem(idbKey, JSON.stringify(mergedState));
          } catch {}

          return {
            state: mergedState,
            source: 'cloud',
          };
        }
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      if (errMsg.includes('resource-exhausted') || errMsg.includes('Quota limit exceeded') || errMsg.includes('Quota exceeded')) {
        markQuotaExhausted();
      }
      console.warn(`[Multi-Tenant] Could not read Firestore for ${tenantId}:`, err);
    }
  }

  // Try 2: Load from IndexedDB high-capacity cache for this school
  try {
    const idbCached = await getIndexedDbCache<AppStateData>(idbKey);
    if (idbCached && idbCached.school) {
      const rawMergedCache: AppStateData = {
        ...defaultState,
        ...idbCached,
        school: {
          ...defaultState.school,
          ...(idbCached.school || {}),
        },
        realSchoolData: idbCached.realSchoolData || defaultState.realSchoolData,
        rpdItems: Array.isArray(idbCached.rpdItems) ? idbCached.rpdItems : (defaultState.rpdItems || []),
        workers: Array.isArray(idbCached.workers) ? idbCached.workers : (defaultState.workers || []),
        stores: Array.isArray(idbCached.stores) ? idbCached.stores : (defaultState.stores || []),
        progressWeeks: Array.isArray(idbCached.progressWeeks) && idbCached.progressWeeks.length > 0 ? idbCached.progressWeeks : defaultState.progressWeeks,
        kwitansiList: Array.isArray(idbCached.kwitansiList) ? idbCached.kwitansiList : (defaultState.kwitansiList || []),
        wageReports: Array.isArray(idbCached.wageReports) ? idbCached.wageReports : (defaultState.wageReports || []),
        manualBkuTransactions: Array.isArray(idbCached.manualBkuTransactions) ? idbCached.manualBkuTransactions : [],
        deletedBkuIds: Array.isArray(idbCached.deletedBkuIds) ? idbCached.deletedBkuIds : [],
        deletedKwitansiIds: Array.isArray(idbCached.deletedKwitansiIds) ? idbCached.deletedKwitansiIds : [],
        bkbRecords: Array.isArray(idbCached.bkbRecords) ? idbCached.bkbRecords : [],
        manualTaxRecords: Array.isArray(idbCached.manualTaxRecords) ? idbCached.manualTaxRecords : [],
        deletedTaxIds: Array.isArray(idbCached.deletedTaxIds) ? idbCached.deletedTaxIds : [],
      };
      const mergedCache = sanitizeAndFilterDemoState(rawMergedCache);

      return {
        state: mergedCache,
        source: 'cache',
      };
    }
  } catch (err) {
    console.warn(`[Multi-Tenant] IndexedDB cache read error for ${tenantId}:`, err);
  }

  // Try 3: Load from LocalStorage fallback
  try {
    const cachedRaw = localStorage.getItem(idbKey);
    if (cachedRaw) {
      const parsed = JSON.parse(cachedRaw);
      if (parsed && parsed.school) {
        const rawMergedCache: AppStateData = {
          ...defaultState,
          ...parsed,
          school: {
            ...defaultState.school,
            ...(parsed.school || {}),
          },
          realSchoolData: parsed.realSchoolData || defaultState.realSchoolData,
          rpdItems: Array.isArray(parsed.rpdItems) ? parsed.rpdItems : (defaultState.rpdItems || []),
          workers: Array.isArray(parsed.workers) ? parsed.workers : (defaultState.workers || []),
          stores: Array.isArray(parsed.stores) ? parsed.stores : (defaultState.stores || []),
          progressWeeks: Array.isArray(parsed.progressWeeks) && parsed.progressWeeks.length > 0 ? parsed.progressWeeks : defaultState.progressWeeks,
          kwitansiList: Array.isArray(parsed.kwitansiList) ? parsed.kwitansiList : (defaultState.kwitansiList || []),
          wageReports: Array.isArray(parsed.wageReports) ? parsed.wageReports : (defaultState.wageReports || []),
          manualBkuTransactions: Array.isArray(parsed.manualBkuTransactions) ? parsed.manualBkuTransactions : [],
          deletedBkuIds: Array.isArray(parsed.deletedBkuIds) ? parsed.deletedBkuIds : [],
          deletedKwitansiIds: Array.isArray(parsed.deletedKwitansiIds) ? parsed.deletedKwitansiIds : [],
          bkbRecords: Array.isArray(parsed.bkbRecords) ? parsed.bkbRecords : [],
          manualTaxRecords: Array.isArray(parsed.manualTaxRecords) ? parsed.manualTaxRecords : [],
          deletedTaxIds: Array.isArray(parsed.deletedTaxIds) ? parsed.deletedTaxIds : [],
        };
        const mergedCache = sanitizeAndFilterDemoState(rawMergedCache);

        // Migrate seamlessly to IndexedDB
        setIndexedDbCache(idbKey, mergedCache);

        return {
          state: mergedCache,
          source: 'cache',
        };
      }
    }
  } catch (err) {
    console.warn(`[Multi-Tenant] LocalStorage cache read error for ${tenantId}:`, err);
  }

  // Try 4: Initialize from preset template in memory & IndexedDB
  await setIndexedDbCache(idbKey, defaultState);
  try {
    localStorage.setItem(idbKey, JSON.stringify(defaultState));
  } catch {}

  return {
    state: defaultState,
    source: 'fresh_preset',
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
  } catch {}
  return false;
}

export function markQuotaExhausted(): void {
  isCloudQuotaExhausted = true;
  try {
    // Suppress network write retries for 1 hour to prevent console spam
    localStorage.setItem('FIRESTORE_QUOTA_EXHAUSTED_UNTIL', String(Date.now() + 60 * 60 * 1000));
    disableNetwork(db).catch(() => {});
  } catch {}
}

// 5. Save school LPJ data to Cloud Firestore (Isolated per school tenant)
export async function saveSchoolTenantAppState(
  tenantId: string,
  stateData: AppStateData
): Promise<boolean> {
  const idbKey = `${TENANT_CACHE_PREFIX}${tenantId}`;

  // 1. Always update high-capacity IndexedDB cache instantly for 100% data safety
  await setIndexedDbCache(idbKey, stateData);

  // 2. Safely attempt LocalStorage update without throwing QuotaExceededError
  try {
    localStorage.setItem(idbKey, JSON.stringify(stateData));

    // Also sync school metadata in LOCAL_CUSTOM_TENANTS_LIST
    if (stateData.school) {
      const customListRaw = localStorage.getItem('LOCAL_CUSTOM_TENANTS_LIST');
      if (customListRaw) {
        const customList: SchoolTenant[] = JSON.parse(customListRaw);
        const idx = customList.findIndex((t) => t.id === tenantId);
        if (idx >= 0) {
          customList[idx] = {
            ...customList[idx],
            namaSekolah: stateData.school.namaSekolah || customList[idx].namaSekolah,
            npsn: stateData.school.npsn || customList[idx].npsn,
            jenjang: ((stateData.school as any)?.jenjang as any) || customList[idx].jenjang,
            kabKota: stateData.school.kabKota || customList[idx].kabKota,
            provinsi: stateData.school.provinsi || customList[idx].provinsi,
            lastLogin: new Date().toISOString(),
          };
          try {
            localStorage.setItem('LOCAL_CUSTOM_TENANTS_LIST', JSON.stringify(customList));
          } catch {}
        }
      }
    }
  } catch (err: any) {
    if (err?.name === 'QuotaExceededError' || String(err).includes('quota')) {
      console.info('[Storage] LocalStorage limit reached; data is safely preserved in IndexedDB.');
    } else {
      console.warn('[Storage] Notice on LocalStorage update:', err);
    }
  }

  // If quota was already marked exhausted, stay in local cache mode without spamming network
  if (checkIsQuotaExhausted()) {
    return true; // Successfully saved to local IndexedDB
  }

  // Save to isolated Firestore path: schools/{tenantId}/lpj_data/current
  try {
    const dataDocRef = doc(db, 'schools', tenantId, 'lpj_data', 'current');
    const cleanData = sanitizeForFirestore(stateData);
    await withTimeout(
      setDoc(dataDocRef, {
        ...cleanData,
        updatedAt: serverTimestamp(),
      }),
      15000 // 15 seconds timeout for large state uploads
    );

    // Also update parent school metadata document in schools/{tenantId}
    if (stateData.school) {
      const schoolDocRef = doc(db, 'schools', tenantId);
      await withTimeout(
        setDoc(
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
        ),
        8000
      ).catch((err) => console.warn('Notice updating parent school metadata:', err));
    }

    return true;
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    if (
      errMsg.includes('resource-exhausted') ||
      errMsg.includes('Quota limit exceeded') ||
      errMsg.includes('Quota exceeded')
    ) {
      markQuotaExhausted();
      console.warn('[Firestore] Free daily write quota reached. Data is securely preserved in browser IndexedDB.');
      return true;
    }
    console.warn(`[Multi-Tenant] Notice on Firestore save for ${tenantId}:`, err);
    return true; // IndexedDB save succeeded
  }
}

// 6. Delete a school tenant and its associated LPJ data
export async function deleteSchoolTenant(tenantId: string): Promise<boolean> {
  // 1. Blacklist ID so it can NEVER be loaded or resurrected
  addDeletedTenantId(tenantId);

  // 2. Remove from IndexedDB & LocalStorage cache
  const idbKey = `${TENANT_CACHE_PREFIX}${tenantId}`;
  await removeIndexedDbCache(idbKey);

  try {
    localStorage.removeItem(idbKey);
    localStorage.removeItem(`LPJ_OFFLINE_STATE_${tenantId}`);
    
    const customListRaw = localStorage.getItem('LOCAL_CUSTOM_TENANTS_LIST');
    if (customListRaw) {
      const customList: SchoolTenant[] = JSON.parse(customListRaw);
      const updated = customList.filter((t) => t.id !== tenantId);
      localStorage.setItem('LOCAL_CUSTOM_TENANTS_LIST', JSON.stringify(updated));
    }
  } catch (err) {
    console.warn('Error clearing local cache during tenant delete:', err);
  }

  // 3. Delete from Firestore
  try {
    const dataDocRef = doc(db, 'schools', tenantId, 'lpj_data', 'current');
    await deleteDoc(dataDocRef);

    const schoolDocRef = doc(db, 'schools', tenantId);
    await deleteDoc(schoolDocRef);
    return true;
  } catch (err) {
    console.warn('Firestore delete error:', err);
    return true; // Still true because locally and permanently blacklisted!
  }
}


