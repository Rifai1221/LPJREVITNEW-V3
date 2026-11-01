import { httpsCallable } from 'firebase/functions';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  getDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { functions, db, auth } from './firebase';
import { UserRole } from '../utils/authHelper';
import { logger } from '../utils/logger';

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

// 1. Callables wrappers
export async function createSchoolCallable(params: {
  namaSekolah: string;
  npsn: string;
  jenjang?: string;
  kabKota?: string;
  provinsi?: string;
  pin: string;
}): Promise<{ schoolId: string; namaSekolah: string; npsn: string }> {
  const fn = httpsCallable<typeof params, { success: boolean; schoolId: string; namaSekolah: string; npsn: string }>(
    functions,
    'createSchool'
  );
  const res = await fn(params);
  return res.data;
}

export async function searchSchoolsCallable(query: string): Promise<SearchedSchoolItem[]> {
  const fn = httpsCallable<{ query: string }, { schools: SearchedSchoolItem[] }>(
    functions,
    'searchSchools'
  );
  const res = await fn({ query });
  return res.data?.schools || [];
}

export async function joinSchoolCallable(params: {
  schoolId: string;
  pin: string;
  role: 'KEPALA_SEKOLAH' | 'TIM_TEKNIS' | 'FASILITATOR';
  displayName?: string;
}): Promise<{ schoolId: string; namaSekolah: string; role: UserRole }> {
  const fn = httpsCallable<typeof params, { success: boolean; schoolId: string; namaSekolah: string; role: UserRole }>(
    functions,
    'joinSchool'
  );
  const res = await fn(params);
  return res.data;
}

export async function changeSchoolPinCallable(params: {
  schoolId: string;
  oldPin?: string;
  newPin: string;
}): Promise<{ success: boolean; message: string }> {
  const fn = httpsCallable<typeof params, { success: boolean; message: string }>(
    functions,
    'changeSchoolPin'
  );
  const res = await fn(params);
  return res.data;
}

export async function deleteSchoolCallable(params: {
  schoolId: string;
  pin: string;
  confirmName: string;
}): Promise<{ success: boolean; purgeAfter: string }> {
  const fn = httpsCallable<typeof params, { success: boolean; purgeAfter: string }>(
    functions,
    'deleteSchool'
  );
  const res = await fn(params);
  return res.data;
}

export async function restoreSchoolCallable(schoolId: string): Promise<{ success: boolean }> {
  const fn = httpsCallable<{ schoolId: string }, { success: boolean }>(
    functions,
    'restoreSchool'
  );
  const res = await fn({ schoolId });
  return res.data;
}

export async function setMemberRoleCallable(params: {
  schoolId: string;
  targetUid: string;
  role: UserRole;
}): Promise<{ success: boolean }> {
  const fn = httpsCallable<typeof params, { success: boolean }>(
    functions,
    'setMemberRole'
  );
  const res = await fn(params);
  return res.data;
}

export async function removeMemberCallable(params: {
  schoolId: string;
  targetUid: string;
}): Promise<{ success: boolean }> {
  const fn = httpsCallable<typeof params, { success: boolean }>(
    functions,
    'removeMember'
  );
  const res = await fn(params);
  return res.data;
}

export async function listSnapshotsCallable(schoolId: string): Promise<any[]> {
  const fn = httpsCallable<{ schoolId: string }, { snapshots: any[] }>(
    functions,
    'listSnapshots'
  );
  const res = await fn({ schoolId });
  return res.data?.snapshots || [];
}

export async function restoreSnapshotCallable(schoolId: string, snapshotId: string): Promise<{ success: boolean; rev: number }> {
  const fn = httpsCallable<{ schoolId: string; snapshotId: string }, { success: boolean; rev: number }>(
    functions,
    'restoreSnapshot'
  );
  const res = await fn({ schoolId, snapshotId });
  return res.data;
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
  const fn = httpsCallable<{ dryRun: boolean }, MigrationCallableResult>(
    functions,
    'migrateLegacySchools'
  );
  const res = await fn({ dryRun });
  return res.data;
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
      logger.warn('SchoolMembershipService', 'Error subscribing to user memberships', undefined, err);
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
