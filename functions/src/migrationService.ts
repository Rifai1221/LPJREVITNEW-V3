import { FieldValue } from 'firebase-admin/firestore';
import { CallableRequest } from 'firebase-functions/v2/https';
import { db, requireAdmin } from './middleware.js';
import { MigrateLegacySchoolsSchema } from './types.js';

export interface SchoolMigrationReport {
  schoolId: string;
  namaSekolah: string;
  migratedPin: boolean;
  membersBackfilled: number;
  status: 'active' | 'already-migrated' | 'skipped';
  details?: string;
}

/**
 * 9. migrateLegacySchools (Admin callable)
 */
export async function migrateLegacySchoolsHandler(request: CallableRequest<unknown>) {
  requireAdmin(request);
  const { dryRun } = MigrateLegacySchoolsSchema.parse(request.data || {});

  const schoolsSnap = await db.collection('schools').get();
  const reports: SchoolMigrationReport[] = [];

  for (const schoolDoc of schoolsSnap.docs) {
    const schoolId = schoolDoc.id;
    const data = schoolDoc.data();
    const namaSekolah = data.namaSekolah || schoolId;

    let migratedPin = false;
    let membersBackfilled = 0;

    // 1. Check if security subcollection exists
    const secRef = db.doc(`schools/${schoolId}/private/security`);
    const secSnap = await secRef.get();

    const hasRootPin = Boolean(data.pinHash && data.pinSalt);
    const hasStatus = Boolean(data.status);

    if (hasRootPin && !secSnap.exists) {
      if (!dryRun) {
        await secRef.set({
          pinHash: data.pinHash,
          pinSalt: data.pinSalt,
          algo: 'sha256-legacy',
          failedAttempts: 0,
          lockedUntil: null,
          mustResetPin: Boolean(data.mustResetPin),
          migratedAt: FieldValue.serverTimestamp(),
        });

        // Clean root fields AFTER verification
        await schoolDoc.ref.update({
          pinHash: FieldValue.delete(),
          pinSalt: FieldValue.delete(),
          mustResetPin: FieldValue.delete(),
          status: 'active',
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      migratedPin = true;
    } else if (!hasStatus) {
      if (!dryRun) {
        await schoolDoc.ref.update({
          status: 'active',
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    // 2. Backfill users/{uid}/memberships from schools/{schoolId}/members
    const membersSnap = await db.collection(`schools/${schoolId}/members`).get();
    for (const mDoc of membersSnap.docs) {
      const memberUid = mDoc.id;
      const mData = mDoc.data();

      const membershipRef = db.doc(`users/${memberUid}/memberships/${schoolId}`);
      const membershipSnap = await membershipRef.get();

      if (!membershipSnap.exists) {
        if (!dryRun) {
          await membershipRef.set({
            schoolId,
            namaSekolah: data.namaSekolah || 'Sekolah Terdaftar',
            npsn: data.npsn || '',
            jenjang: data.jenjang || '',
            kabKota: data.kabKota || '',
            role: mData.role || 'TIM_TEKNIS',
            lastOpenedAt: FieldValue.serverTimestamp(),
          });
        }
        membersBackfilled += 1;
      }
    }

    reports.push({
      schoolId,
      namaSekolah,
      migratedPin,
      membersBackfilled,
      status: migratedPin || membersBackfilled > 0 ? 'active' : 'already-migrated',
    });
  }

  return {
    dryRun: Boolean(dryRun),
    totalSchoolsScanned: schoolsSnap.size,
    summary: reports,
  };
}
