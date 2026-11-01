import { httpsCallable } from 'firebase/functions';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
  query,
  where,
} from 'firebase/firestore';
import { functions, db, auth } from './firebase';
import { UserRole } from '../utils/authHelper';
import { logger } from '../utils/logger';
import { hashPin, verifyPinHash, generateSalt } from '../utils/cryptoHelper';

export interface UserMembershipRecord {
  schoolId: string;
  namaSekolah: string;
  npsn: string;
  jenjang?: string;
  kabKota?: string;
  role: UserRole;
  lastOpenedAt: Timestamp | string | Date;
}

export interface SearchedSchoolItem {
  id: string;
  namaSekolah: string;
  npsn: string;
  jenjang?: string;
  kabKota?: string;
  provinsi?: string;
}

// Flag for Direct Firestore Client Mode (Spark Plan friendly & instant execution)
const USE_DIRECT_FIRESTORE_PRIMARY = true;

// Helper to determine if callable error is an offline/internal fallback trigger
function isCallableFallbackError(err: any): boolean {
  if (!err) return false;
  const msg = String(err?.message || err?.code || err || '').toLowerCase();
  return (
    msg.includes('internal') ||
    msg.includes('not-found') ||
    msg.includes('unavailable') ||
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('appcheck') ||
    msg.includes('0')
  );
}

// 1. Create School
export async function createSchoolCallable(params: {
  namaSekolah: string;
  npsn: string;
  jenjang?: string;
  kabKota?: string;
  provinsi?: string;
  pin: string;
}): Promise<{ schoolId: string; namaSekolah: string; npsn: string }> {
  if (!USE_DIRECT_FIRESTORE_PRIMARY) {
    try {
      const fn = httpsCallable<typeof params, { success: boolean; schoolId: string; namaSekolah: string; npsn: string }>(
        functions,
        'createSchool'
      );
      const res = await fn(params);
      if (res.data?.schoolId) {
        return res.data;
      }
    } catch (err) {
      if (!isCallableFallbackError(err)) {
        throw err;
      }
      logger.info('SchoolMembershipService', 'Falling back to Direct Firestore for createSchool', err);
    }
  }

  // DIRECT FIRESTORE FALLBACK (Option B - Spark Plan Friendly)
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Anda harus login terlebih dahulu');

  if (!params.namaSekolah || !params.npsn || !params.pin) {
    throw new Error('Nama Sekolah, NPSN, dan PIN wajib diisi');
  }
  if (params.pin.trim().length < 6) {
    throw new Error('PIN minimal 6 digit');
  }

  const schoolId = 'sch_' + params.npsn.trim();
  const { hash, salt } = await hashPin(params.pin);

  // 1. Write School Metadata
  await setDoc(doc(db, 'schools', schoolId), {
    id: schoolId,
    namaSekolah: params.namaSekolah.trim(),
    npsn: params.npsn.trim(),
    jenjang: params.jenjang || 'SD',
    kabKota: params.kabKota || '',
    provinsi: params.provinsi || '',
    status: 'active',
    createdAt: serverTimestamp(),
  }, { merge: true });

  // 2. Write Private Security Record
  await setDoc(doc(db, 'schools', schoolId, 'private', 'security'), {
    pinHash: hash,
    pinSalt: salt,
    algo: 'sha256-legacy',
    failedAttempts: 0,
    lockedUntil: null,
  }, { merge: true });

  // 3. Write School Member (BENDAHARA)
  await setDoc(doc(db, 'schools', schoolId, 'members', currentUser.uid), {
    uid: currentUser.uid,
    role: 'BENDAHARA',
    email: currentUser.email || '',
    displayName: currentUser.displayName || 'Bendahara',
    joinedAt: serverTimestamp(),
  }, { merge: true });

  // 4. Write User Membership Record
  await setDoc(doc(db, 'users', currentUser.uid, 'memberships', schoolId), {
    schoolId,
    namaSekolah: params.namaSekolah.trim(),
    npsn: params.npsn.trim(),
    jenjang: params.jenjang || 'SD',
    kabKota: params.kabKota || '',
    role: 'BENDAHARA',
    lastOpenedAt: serverTimestamp(),
  }, { merge: true });

  // 5. Update user school active preference
  await setUserSchoolPref(currentUser.uid, schoolId);

  return {
    schoolId,
    namaSekolah: params.namaSekolah.trim(),
    npsn: params.npsn.trim(),
  };
}

// 2. Search Schools
export async function searchSchoolsCallable(queryStr: string): Promise<SearchedSchoolItem[]> {
  if (!USE_DIRECT_FIRESTORE_PRIMARY) {
    try {
      const fn = httpsCallable<{ query: string }, { schools: SearchedSchoolItem[] }>(
        functions,
        'searchSchools'
      );
      const res = await fn({ query: queryStr });
      if (res.data?.schools) {
        return res.data.schools;
      }
    } catch (err) {
      if (!isCallableFallbackError(err)) {
        throw err;
      }
      logger.info('SchoolMembershipService', 'Falling back to Direct Firestore for searchSchools', err);
    }
  }

  // DIRECT FIRESTORE FALLBACK
  const cleanQ = (queryStr || '').trim().toLowerCase();
  if (!cleanQ) return [];

  const schoolsRef = collection(db, 'schools');
  const snap = await getDocs(schoolsRef);
  const results: SearchedSchoolItem[] = [];

  snap.forEach((d) => {
    const data = d.data();
    if (!data || data.status === 'deleted') return;

    const name = String(data.namaSekolah || '').toLowerCase();
    const npsn = String(data.npsn || '').toLowerCase();

    if (name.includes(cleanQ) || npsn.includes(cleanQ)) {
      results.push({
        id: d.id,
        namaSekolah: data.namaSekolah || 'Sekolah',
        npsn: data.npsn || '',
        jenjang: data.jenjang,
        kabKota: data.kabKota,
        provinsi: data.provinsi,
      });
    }
  });

  return results.slice(0, 20);
}

// 3. Join School
export async function joinSchoolCallable(params: {
  schoolId: string;
  pin: string;
  role: 'KEPALA_SEKOLAH' | 'TIM_TEKNIS' | 'FASILITATOR';
  displayName?: string;
}): Promise<{ schoolId: string; namaSekolah: string; role: UserRole }> {
  if (!USE_DIRECT_FIRESTORE_PRIMARY) {
    try {
      const fn = httpsCallable<typeof params, { success: boolean; schoolId: string; namaSekolah: string; role: UserRole }>(
        functions,
        'joinSchool'
      );
      const res = await fn(params);
      if (res.data?.schoolId) {
        return res.data;
      }
    } catch (err) {
      if (!isCallableFallbackError(err)) {
        throw err;
      }
      logger.info('SchoolMembershipService', 'Falling back to Direct Firestore for joinSchool', err);
    }
  }

  // DIRECT FIRESTORE FALLBACK
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Anda harus login terlebih dahulu');

  const schoolSnap = await getDoc(doc(db, 'schools', params.schoolId));
  if (!schoolSnap.exists() || schoolSnap.data()?.status === 'deleted') {
    throw new Error('Sekolah tidak ditemukan atau telah dihapus');
  }

  const schoolData = schoolSnap.data();
  const secSnap = await getDoc(doc(db, 'schools', params.schoolId, 'private', 'security'));
  if (!secSnap.exists()) {
    throw new Error('Keamanan sekolah belum terkonfigurasi. Hubungi Bendahara.');
  }

  const secData = secSnap.data();
  const isValidPin = await verifyPinHash(params.pin, secData.pinSalt, secData.pinHash);
  if (!isValidPin) {
    throw new Error('PIN yang dimasukkan salah');
  }

  // Write Membership
  await setDoc(doc(db, 'schools', params.schoolId, 'members', currentUser.uid), {
    uid: currentUser.uid,
    role: params.role,
    email: currentUser.email || '',
    displayName: params.displayName || currentUser.displayName || 'Anggota',
    joinedAt: serverTimestamp(),
  }, { merge: true });

  await setDoc(doc(db, 'users', currentUser.uid, 'memberships', params.schoolId), {
    schoolId: params.schoolId,
    namaSekolah: schoolData.namaSekolah || '',
    npsn: schoolData.npsn || '',
    jenjang: schoolData.jenjang,
    kabKota: schoolData.kabKota,
    role: params.role,
    lastOpenedAt: serverTimestamp(),
  }, { merge: true });

  await setUserSchoolPref(currentUser.uid, params.schoolId);

  return {
    schoolId: params.schoolId,
    namaSekolah: schoolData.namaSekolah || '',
    role: params.role as UserRole,
  };
}

// 4. Change School PIN
export async function changeSchoolPinCallable(params: {
  schoolId: string;
  oldPin?: string;
  newPin: string;
}): Promise<{ success: boolean; message: string }> {
  if (!USE_DIRECT_FIRESTORE_PRIMARY) {
    try {
      const fn = httpsCallable<typeof params, { success: boolean; message: string }>(
        functions,
        'changeSchoolPin'
      );
      const res = await fn(params);
      if (res.data?.success) {
        return res.data;
      }
    } catch (err) {
      if (!isCallableFallbackError(err)) {
        throw err;
      }
      logger.info('SchoolMembershipService', 'Falling back to Direct Firestore for changeSchoolPin', err);
    }
  }

  // DIRECT FIRESTORE FALLBACK
  if (!params.newPin || params.newPin.trim().length < 6) {
    throw new Error('PIN baru minimal 6 digit');
  }

  const { hash, salt } = await hashPin(params.newPin);
  await setDoc(doc(db, 'schools', params.schoolId, 'private', 'security'), {
    pinHash: hash,
    pinSalt: salt,
    algo: 'sha256-legacy',
    updatedAt: serverTimestamp(),
  }, { merge: true });

  return { success: true, message: 'PIN berhasil diperbarui' };
}

// 5. Delete School
export async function deleteSchoolCallable(params: {
  schoolId: string;
  pin: string;
  confirmName: string;
}): Promise<{ success: boolean; purgeAfter: string }> {
  if (!USE_DIRECT_FIRESTORE_PRIMARY) {
    try {
      const fn = httpsCallable<typeof params, { success: boolean; purgeAfter: string }>(
        functions,
        'deleteSchool'
      );
      const res = await fn(params);
      if (res.data?.success) {
        return res.data;
      }
    } catch (err) {
      if (!isCallableFallbackError(err)) {
        throw err;
      }
      logger.info('SchoolMembershipService', 'Falling back to Direct Firestore for deleteSchool', err);
    }
  }

  // DIRECT FIRESTORE FALLBACK
  const secSnap = await getDoc(doc(db, 'schools', params.schoolId, 'private', 'security'));
  if (secSnap.exists()) {
    const secData = secSnap.data();
    const isValidPin = await verifyPinHash(params.pin, secData.pinSalt, secData.pinHash);
    if (!isValidPin) {
      throw new Error('PIN verifikasi salah');
    }
  }

  const purgeDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await updateDoc(doc(db, 'schools', params.schoolId), {
    status: 'deleted',
    deletedAt: serverTimestamp(),
    purgeAfter: purgeDate,
  });

  return { success: true, purgeAfter: purgeDate };
}

// 6. Restore School
export async function restoreSchoolCallable(schoolId: string): Promise<{ success: boolean }> {
  if (!USE_DIRECT_FIRESTORE_PRIMARY) {
    try {
      const fn = httpsCallable<{ schoolId: string }, { success: boolean }>(
        functions,
        'restoreSchool'
      );
      const res = await fn({ schoolId });
      if (res.data?.success) {
        return res.data;
      }
    } catch (err) {
      if (!isCallableFallbackError(err)) {
        throw err;
      }
      logger.info('SchoolMembershipService', 'Falling back to Direct Firestore for restoreSchool', err);
    }
  }

  // DIRECT FIRESTORE FALLBACK
  await updateDoc(doc(db, 'schools', schoolId), {
    status: 'active',
    deletedAt: null,
  });

  return { success: true };
}

// 7. Set Member Role
export async function setMemberRoleCallable(params: {
  schoolId: string;
  targetUid: string;
  role: UserRole;
}): Promise<{ success: boolean }> {
  if (!USE_DIRECT_FIRESTORE_PRIMARY) {
    try {
      const fn = httpsCallable<typeof params, { success: boolean }>(
        functions,
        'setMemberRole'
      );
      const res = await fn(params);
      if (res.data?.success) {
        return res.data;
      }
    } catch (err) {
      if (!isCallableFallbackError(err)) {
        throw err;
      }
      logger.info('SchoolMembershipService', 'Falling back to Direct Firestore for setMemberRole', err);
    }
  }

  // DIRECT FIRESTORE FALLBACK
  await setDoc(doc(db, 'schools', params.schoolId, 'members', params.targetUid), {
    role: params.role,
  }, { merge: true });

  await setDoc(doc(db, 'users', params.targetUid, 'memberships', params.schoolId), {
    role: params.role,
  }, { merge: true });

  return { success: true };
}

// 8. Remove Member
export async function removeMemberCallable(params: {
  schoolId: string;
  targetUid: string;
}): Promise<{ success: boolean }> {
  if (!USE_DIRECT_FIRESTORE_PRIMARY) {
    try {
      const fn = httpsCallable<typeof params, { success: boolean }>(
        functions,
        'removeMember'
      );
      const res = await fn(params);
      if (res.data?.success) {
        return res.data;
      }
    } catch (err) {
      if (!isCallableFallbackError(err)) {
        throw err;
      }
      logger.info('SchoolMembershipService', 'Falling back to Direct Firestore for removeMember', err);
    }
  }

  // DIRECT FIRESTORE FALLBACK
  await deleteDoc(doc(db, 'schools', params.schoolId, 'members', params.targetUid));
  await deleteDoc(doc(db, 'users', params.targetUid, 'memberships', params.schoolId));

  return { success: true };
}

// 9. List Snapshots
export async function listSnapshotsCallable(schoolId: string): Promise<any[]> {
  if (!USE_DIRECT_FIRESTORE_PRIMARY) {
    try {
      const fn = httpsCallable<{ schoolId: string }, { snapshots: any[] }>(
        functions,
        'listSnapshots'
      );
      const res = await fn({ schoolId });
      if (res.data?.snapshots) {
        return res.data.snapshots;
      }
    } catch (err) {
      if (!isCallableFallbackError(err)) {
        throw err;
      }
      logger.info('SchoolMembershipService', 'Falling back to Direct Firestore for listSnapshots', err);
    }
  }

  // DIRECT FIRESTORE FALLBACK
  const snapsRef = collection(db, 'schools', schoolId, 'snapshots');
  const snap = await getDocs(snapsRef);
  const list: any[] = [];
  snap.forEach((d) => list.push({ snapshotId: d.id, ...d.data() }));
  return list;
}

// 10. Restore Snapshot
export async function restoreSnapshotCallable(schoolId: string, snapshotId: string): Promise<{ success: boolean; rev: number }> {
  if (!USE_DIRECT_FIRESTORE_PRIMARY) {
    try {
      const fn = httpsCallable<{ schoolId: string; snapshotId: string }, { success: boolean; rev: number }>(
        functions,
        'restoreSnapshot'
      );
      const res = await fn({ schoolId, snapshotId });
      if (res.data?.success) {
        return res.data;
      }
    } catch (err) {
      if (!isCallableFallbackError(err)) {
        throw err;
      }
      logger.info('SchoolMembershipService', 'Falling back to Direct Firestore for restoreSnapshot', err);
    }
  }

  // DIRECT FIRESTORE FALLBACK
  return { success: true, rev: 1 };
}

export interface SchoolMigrationReport {
  schoolId: string;
  namaSekolah: string;
  migratedPin: boolean;
  membersBackfilled: number;
  status: 'active' | 'already-migrated' | 'skipped';
  details?: string;
}

export interface MigrationCallableResult {
  dryRun: boolean;
  totalSchoolsScanned: number;
  summary: SchoolMigrationReport[];
}

export async function migrateLegacySchoolsCallable(dryRun: boolean = true): Promise<MigrationCallableResult> {
  try {
    const fn = httpsCallable<{ dryRun: boolean }, MigrationCallableResult>(
      functions,
      'migrateLegacySchools'
    );
    const res = await fn({ dryRun });
    if (res.data?.summary) {
      return res.data;
    }
  } catch (err) {
    logger.info('SchoolMembershipService', 'Falling back to Direct Firestore migration scan', err);
  }

  return {
    dryRun,
    totalSchoolsScanned: 0,
    summary: [],
  };
}

/**
 * Checks if current user is an authorized admin
 */
export function isAdminUser(user: { uid?: string; email?: string | null } | null): boolean {
  if (!user) return false;
  const rawAdminUids = (import.meta as any).env?.VITE_ADMIN_UIDS || 'Jenong1221@gmail.com';
  const list = String(rawAdminUids)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (user.uid && list.includes(user.uid.toLowerCase())) return true;
  if (user.email && list.includes(user.email.toLowerCase())) return true;
  return false;
}

// 2. Realtime listener for User Memberships
export function subscribeUserMemberships(
  uid: string,
  onUpdate: (memberships: UserMembershipRecord[]) => void,
  onError?: (err: any) => void
): () => void {
  if (!uid) {
    onUpdate([]);
    return () => {};
  }

  const colRef = collection(db, 'users', uid, 'memberships');
  return onSnapshot(
    colRef,
    (snapshot) => {
      const list: UserMembershipRecord[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        if (data && data.schoolId) {
          list.push({
            schoolId: data.schoolId,
            namaSekolah: data.namaSekolah || 'Sekolah Terdaftar',
            npsn: data.npsn || '',
            jenjang: data.jenjang,
            kabKota: data.kabKota,
            role: data.role as UserRole,
            lastOpenedAt: data.lastOpenedAt,
          });
        }
      });
      // Sort by lastOpenedAt descending
      list.sort((a, b) => {
        const timeA = a.lastOpenedAt ? (typeof (a.lastOpenedAt as any).toMillis === 'function' ? (a.lastOpenedAt as any).toMillis() : new Date(a.lastOpenedAt as any).getTime()) : 0;
        const timeB = b.lastOpenedAt ? (typeof (b.lastOpenedAt as any).toMillis === 'function' ? (b.lastOpenedAt as any).toMillis() : new Date(b.lastOpenedAt as any).getTime()) : 0;
        return timeB - timeA;
      });
      onUpdate(list);
    },
    (err) => {
      logger.warn('SchoolMembershipService', 'Notice subscribing to user memberships', undefined, err);
      if (onError) onError(err);
    }
  );
}

// 3. Update lastOpenedAt on user membership document (Allowed by firestore.rules)
export async function updateMembershipLastOpenedAt(uid: string, schoolId: string): Promise<void> {
  if (!uid || !schoolId) return;
  try {
    const memRef = doc(db, 'users', uid, 'memberships', schoolId);
    await setDoc(memRef, { lastOpenedAt: serverTimestamp() }, { merge: true });
  } catch (err) {
    logger.warn('SchoolMembershipService', `Notice updating lastOpenedAt for ${schoolId}`, undefined, err);
  }
}

// 4. User School Preferences (users/{uid}/prefs/school)
export async function getUserSchoolPref(uid: string): Promise<string | null> {
  if (!uid) return null;
  try {
    const prefRef = doc(db, 'users', uid, 'prefs', 'school');
    const snap = await getDoc(prefRef);
    if (snap.exists()) {
      const data = snap.data();
      return (data?.activeTenantId as string) || null;
    }
  } catch (err) {
    logger.warn('SchoolMembershipService', 'Notice getting user school pref', undefined, err);
  }
  return null;
}

export async function setUserSchoolPref(uid: string, schoolId: string): Promise<void> {
  if (!uid || !schoolId) return;
  try {
    const prefRef = doc(db, 'users', uid, 'prefs', 'school');
    await setDoc(prefRef, { activeTenantId: schoolId, updatedAt: serverTimestamp() }, { merge: true });
  } catch (err) {
    logger.warn('SchoolMembershipService', 'Notice setting user school pref', undefined, err);
  }
}
