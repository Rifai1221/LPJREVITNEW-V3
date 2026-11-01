import crypto from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db, requireAuth, assertBendahara, checkRateLimit } from './middleware.js';
import {
  CreateSchoolSchema,
  SearchSchoolsSchema,
  JoinSchoolSchema,
  ChangeSchoolPinSchema,
  DeleteSchoolSchema,
  RestoreSchoolSchema,
  SchoolSecurityRecord,
  SchoolMetadata,
} from './types.js';
import {
  generateSalt,
  hashPinScrypt,
  verifySchoolPin,
} from './crypto.js';

// User-level attempt tracker (in-memory)
const userAttemptMap = new Map<string, { failedAttempts: number; lockedUntil?: number }>();

function checkUserThrottling(uid: string): void {
  const record = userAttemptMap.get(uid);
  if (record && record.lockedUntil && record.lockedUntil > Date.now()) {
    const minutesLeft = Math.ceil((record.lockedUntil - Date.now()) / 60000);
    throw new HttpsError(
      'resource-exhausted',
      `Akun Anda terkunci sementara karena 5 kali percobaan PIN gagal. Coba lagi dalam ${minutesLeft} menit.`
    );
  }
}

function recordUserFailedAttempt(uid: string): void {
  const now = Date.now();
  const record = userAttemptMap.get(uid) || { failedAttempts: 0 };
  record.failedAttempts += 1;
  if (record.failedAttempts >= 5) {
    record.lockedUntil = now + 15 * 60 * 1000; // 15 minutes
  }
  userAttemptMap.set(uid, record);
}

function resetUserAttempts(uid: string): void {
  userAttemptMap.delete(uid);
}

/**
 * 1. createSchool
 */
export async function createSchoolHandler(request: CallableRequest<unknown>) {
  const user = requireAuth(request);
  const data = CreateSchoolSchema.parse(request.data);

  const cleanNpsn = data.npsn.replace(/[^a-zA-Z0-9]/g, '');
  const rand = crypto.randomBytes(4).toString('hex');
  const schoolId = `sch_${cleanNpsn}_${rand}`;

  // Hash PIN with scrypt
  const salt = generateSalt(16);
  const pinHash = await hashPinScrypt(data.pin, salt);

  const schoolRef = db.doc(`schools/${schoolId}`);
  const securityRef = db.doc(`schools/${schoolId}/private/security`);
  const memberRef = db.doc(`schools/${schoolId}/members/${user.uid}`);
  const membershipRef = db.doc(`users/${user.uid}/memberships/${schoolId}`);
  const metaRef = db.doc(`schools/${schoolId}/lpj_data/meta`);

  const batch = db.batch();

  batch.set(schoolRef, {
    id: schoolId,
    namaSekolah: data.namaSekolah,
    npsn: data.npsn,
    jenjang: data.jenjang || '',
    kabKota: data.kabKota || '',
    provinsi: data.provinsi || '',
    status: 'active',
    createdAt: FieldValue.serverTimestamp(),
  });

  batch.set(securityRef, {
    pinHash,
    pinSalt: salt,
    algo: 'scrypt',
    failedAttempts: 0,
    lockedUntil: null,
  });

  batch.set(memberRef, {
    uid: user.uid,
    role: 'BENDAHARA',
    email: user.email || '',
    displayName: user.name || 'Bendahara',
    joinedAt: FieldValue.serverTimestamp(),
  });

  batch.set(membershipRef, {
    schoolId,
    namaSekolah: data.namaSekolah,
    npsn: data.npsn,
    jenjang: data.jenjang || '',
    kabKota: data.kabKota || '',
    role: 'BENDAHARA',
    lastOpenedAt: FieldValue.serverTimestamp(),
  });

  batch.set(metaRef, {
    rev: 1,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: user.uid,
  });

  await batch.commit();

  return {
    schoolId,
    namaSekolah: data.namaSekolah,
    role: 'BENDAHARA',
  };
}

/**
 * 2. searchSchools
 */
export async function searchSchoolsHandler(request: CallableRequest<unknown>) {
  const user = requireAuth(request);
  const { query } = SearchSchoolsSchema.parse(request.data);

  checkRateLimit(user.uid, 20, 60000);

  const normalizedQuery = query.toLowerCase();

  // Fetch active schools to filter
  const snap = await db
    .collection('schools')
    .where('status', '==', 'active')
    .limit(100)
    .get();

  const results: Array<{
    schoolId: string;
    namaSekolah: string;
    npsn: string;
    kabKota?: string;
  }> = [];

  for (const docSnap of snap.docs) {
    const d = docSnap.data() as SchoolMetadata;
    const nameMatch = (d.namaSekolah || '').toLowerCase().includes(normalizedQuery);
    const npsnMatch = (d.npsn || '').toLowerCase().includes(normalizedQuery);
    const kabMatch = (d.kabKota || '').toLowerCase().includes(normalizedQuery);

    if (nameMatch || npsnMatch || kabMatch) {
      results.push({
        schoolId: docSnap.id,
        namaSekolah: d.namaSekolah,
        npsn: d.npsn,
        kabKota: d.kabKota,
      });
      if (results.length >= 10) break;
    }
  }

  return { results };
}

/**
 * 3. joinSchool
 */
export async function joinSchoolHandler(request: CallableRequest<unknown>) {
  const user = requireAuth(request);
  const data = JoinSchoolSchema.parse(request.data);

  checkUserThrottling(user.uid);

  const schoolRef = db.doc(`schools/${data.schoolId}`);
  const schoolSnap = await schoolRef.get();

  if (!schoolSnap.exists) {
    throw new HttpsError('not-found', 'Sekolah tidak ditemukan.');
  }

  const schoolData = schoolSnap.data() as SchoolMetadata;
  if (schoolData.status === 'deleted') {
    throw new HttpsError('not-found', 'Sekolah telah dihapus dan tidak dapat diakses.');
  }

  // Check if caller is already a member
  const memberRef = db.doc(`schools/${data.schoolId}/members/${user.uid}`);
  const memberSnap = await memberRef.get();
  if (memberSnap.exists) {
    const existingRole = memberSnap.data()?.role;
    // Update lastOpenedAt on user's membership
    const membershipRef = db.doc(`users/${user.uid}/memberships/${data.schoolId}`);
    await membershipRef.set(
      {
        schoolId: data.schoolId,
        namaSekolah: schoolData.namaSekolah,
        npsn: schoolData.npsn,
        jenjang: schoolData.jenjang || '',
        kabKota: schoolData.kabKota || '',
        role: existingRole,
        lastOpenedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return {
      schoolId: data.schoolId,
      namaSekolah: schoolData.namaSekolah,
      role: existingRole,
      isNewMember: false,
    };
  }

  // Load security credentials
  const secRef = db.doc(`schools/${data.schoolId}/private/security`);
  const secSnap = await secRef.get();

  let secData: SchoolSecurityRecord;
  if (!secSnap.exists) {
    // Check if legacy school had pinHash in root document
    if (schoolData.pinHash && schoolData.pinSalt) {
      secData = {
        pinHash: String(schoolData.pinHash),
        pinSalt: String(schoolData.pinSalt),
        algo: 'sha256-legacy',
        failedAttempts: 0,
        lockedUntil: null,
      };
    } else {
      throw new HttpsError(
        'failed-precondition',
        'Kredensial keamanan sekolah belum diinisialisasi oleh Bendahara.'
      );
    }
  } else {
    secData = secSnap.data() as SchoolSecurityRecord;
  }

  // Check school-level lockout
  if (secData.lockedUntil && secData.lockedUntil.toMillis() > Date.now()) {
    const minutesLeft = Math.ceil((secData.lockedUntil.toMillis() - Date.now()) / 60000);
    throw new HttpsError(
      'resource-exhausted',
      `Sekolah terkunci sementara karena terlalu banyak percobaan PIN salah. Coba lagi dalam ${minutesLeft} menit.`
    );
  }

  // Verify PIN
  const { isValid, isLegacy } = await verifySchoolPin(data.pin, secData);

  if (!isValid) {
    recordUserFailedAttempt(user.uid);
    const newFailed = (secData.failedAttempts || 0) + 1;
    const lockUpdate: Record<string, unknown> = {
      failedAttempts: newFailed,
    };
    if (newFailed >= 5) {
      lockUpdate.lockedUntil = Timestamp.fromMillis(Date.now() + 15 * 60 * 1000);
    }
    await secRef.set(lockUpdate, { merge: true });

    throw new HttpsError(
      'permission-denied',
      newFailed >= 5
        ? 'PIN salah 5 kali berturut-turut. Sekolah dikunci selama 15 menit demi keamanan.'
        : `PIN yang dimasukkan salah. Percobaan gagal: ${newFailed}/5.`
    );
  }

  // Reset counters on success
  resetUserAttempts(user.uid);

  // If legacy SHA-256 matched, re-hash immediately to scrypt and persist!
  if (isLegacy) {
    const newSalt = generateSalt(16);
    const newHash = await hashPinScrypt(data.pin, newSalt);
    await secRef.set(
      {
        pinHash: newHash,
        pinSalt: newSalt,
        algo: 'scrypt',
        failedAttempts: 0,
        lockedUntil: null,
      },
      { merge: true }
    );
  } else if (secData.failedAttempts > 0 || secData.lockedUntil) {
    await secRef.set({ failedAttempts: 0, lockedUntil: null }, { merge: true });
  }

  // Add new member and user membership atomically
  const batch = db.batch();

  batch.set(memberRef, {
    uid: user.uid,
    role: data.role,
    email: user.email || '',
    displayName: data.displayName || user.name || data.role,
    joinedAt: FieldValue.serverTimestamp(),
  });

  const membershipRef = db.doc(`users/${user.uid}/memberships/${data.schoolId}`);
  batch.set(membershipRef, {
    schoolId: data.schoolId,
    namaSekolah: schoolData.namaSekolah,
    npsn: schoolData.npsn,
    jenjang: schoolData.jenjang || '',
    kabKota: schoolData.kabKota || '',
    role: data.role,
    lastOpenedAt: FieldValue.serverTimestamp(),
  });

  await batch.commit();

  return {
    schoolId: data.schoolId,
    namaSekolah: schoolData.namaSekolah,
    role: data.role,
    isNewMember: true,
  };
}

/**
 * 4. changeSchoolPin
 */
export async function changeSchoolPinHandler(request: CallableRequest<unknown>) {
  const user = requireAuth(request);
  const data = ChangeSchoolPinSchema.parse(request.data);

  await assertBendahara(data.schoolId, user.uid);

  const secRef = db.doc(`schools/${data.schoolId}/private/security`);
  const secSnap = await secRef.get();

  const schoolSnap = await db.doc(`schools/${data.schoolId}`).get();
  const schoolData = schoolSnap.data() as SchoolMetadata;

  let secData: SchoolSecurityRecord | undefined = secSnap.exists
    ? (secSnap.data() as SchoolSecurityRecord)
    : undefined;

  const mustReset = secData?.mustResetPin || schoolData?.mustResetPin;

  if (!mustReset) {
    if (!data.oldPin) {
      throw new HttpsError(
        'invalid-argument',
        'PIN lama wajib dimasukkan untuk verifikasi penggantian PIN.'
      );
    }
    if (!secData) {
      if (schoolData.pinHash && schoolData.pinSalt) {
        secData = {
          pinHash: String(schoolData.pinHash),
          pinSalt: String(schoolData.pinSalt),
          algo: 'sha256-legacy',
          failedAttempts: 0,
        };
      } else {
        throw new HttpsError(
          'failed-precondition',
          'Data keamanan PIN tidak ditemukan.'
        );
      }
    }

    const { isValid } = await verifySchoolPin(data.oldPin, secData);
    if (!isValid) {
      throw new HttpsError('permission-denied', 'PIN lama yang Anda masukkan salah.');
    }
  }

  // Hash new PIN with scrypt
  const newSalt = generateSalt(16);
  const newHash = await hashPinScrypt(data.newPin, newSalt);

  const batch = db.batch();
  batch.set(
    secRef,
    {
      pinHash: newHash,
      pinSalt: newSalt,
      algo: 'scrypt',
      failedAttempts: 0,
      lockedUntil: null,
      mustResetPin: false,
    },
    { merge: true }
  );

  // Clean legacy fields from school root doc
  batch.update(db.doc(`schools/${data.schoolId}`), {
    pinHash: FieldValue.delete(),
    pinSalt: FieldValue.delete(),
    mustResetPin: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await batch.commit();

  return {
    success: true,
    message: 'PIN Sekolah berhasil diperbarui dengan enkripsi scrypt.',
  };
}

/**
 * 5. deleteSchool
 */
export async function deleteSchoolHandler(request: CallableRequest<unknown>) {
  const user = requireAuth(request);
  const data = DeleteSchoolSchema.parse(request.data);

  await assertBendahara(data.schoolId, user.uid);

  const schoolRef = db.doc(`schools/${data.schoolId}`);
  const schoolSnap = await schoolRef.get();
  if (!schoolSnap.exists) {
    throw new HttpsError('not-found', 'Sekolah tidak ditemukan.');
  }

  const schoolData = schoolSnap.data() as SchoolMetadata;

  // Confirm exact name
  if (data.confirmName.trim().toUpperCase() !== schoolData.namaSekolah.trim().toUpperCase()) {
    throw new HttpsError(
      'invalid-argument',
      `Konfirmasi nama sekolah tidak sesuai. Ketik persis: "${schoolData.namaSekolah}".`
    );
  }

  // Verify PIN
  const secRef = db.doc(`schools/${data.schoolId}/private/security`);
  const secSnap = await secRef.get();
  let secData = secSnap.exists ? (secSnap.data() as SchoolSecurityRecord) : null;
  if (!secData && schoolData.pinHash && schoolData.pinSalt) {
    secData = {
      pinHash: String(schoolData.pinHash),
      pinSalt: String(schoolData.pinSalt),
      algo: 'sha256-legacy',
      failedAttempts: 0,
    };
  }

  if (!secData) {
    throw new HttpsError('failed-precondition', 'Kredensial PIN tidak ditemukan.');
  }

  const { isValid } = await verifySchoolPin(data.pin, secData);
  if (!isValid) {
    throw new HttpsError('permission-denied', 'PIN otorisasi penghapusan salah.');
  }

  // Soft Delete: status = 'deleted', purgeAfter = +30 days
  const now = Date.now();
  const purgeAfter = Timestamp.fromMillis(now + 30 * 24 * 60 * 60 * 1000);

  const batch = db.batch();
  batch.update(schoolRef, {
    status: 'deleted',
    deletedAt: FieldValue.serverTimestamp(),
    purgeAfter,
  });

  // Remove memberships from all members so it disappears from their switch list
  const membersSnap = await db.collection(`schools/${data.schoolId}/members`).get();
  for (const mDoc of membersSnap.docs) {
    const memberUid = mDoc.id;
    const userMembershipRef = db.doc(`users/${memberUid}/memberships/${data.schoolId}`);
    batch.delete(userMembershipRef);
  }

  await batch.commit();

  return {
    success: true,
    message: `Sekolah "${schoolData.namaSekolah}" berhasil dinonaktifkan (Soft Delete). Data disimpan selama 30 hari untuk pemulihan sebelum dihapus permanen.`,
    purgeAfter: purgeAfter.toDate().toISOString(),
  };
}

/**
 * 6. restoreSchool
 */
export async function restoreSchoolHandler(request: CallableRequest<unknown>) {
  const user = requireAuth(request);
  const data = RestoreSchoolSchema.parse(request.data);

  // Caller must have been a Bendahara of this school
  const memberSnap = await db.doc(`schools/${data.schoolId}/members/${user.uid}`).get();
  if (!memberSnap.exists || memberSnap.data()?.role !== 'BENDAHARA') {
    throw new HttpsError(
      'permission-denied',
      'Hanya Bendahara terdaftar yang berhak memulihkan sekolah ini.'
    );
  }

  const schoolRef = db.doc(`schools/${data.schoolId}`);
  const schoolSnap = await schoolRef.get();
  if (!schoolSnap.exists) {
    throw new HttpsError('not-found', 'Sekolah tidak ditemukan.');
  }

  const schoolData = schoolSnap.data() as SchoolMetadata;
  if (schoolData.status !== 'deleted') {
    return { success: true, message: 'Sekolah sudah dalam status aktif.' };
  }

  if (schoolData.purgeAfter && schoolData.purgeAfter.toMillis() < Date.now()) {
    throw new HttpsError(
      'failed-precondition',
      'Masa tenggang pemulihan 30 hari telah berakhir. Data telah dijadwalkan untuk pembersihan permanen.'
    );
  }

  const batch = db.batch();
  batch.update(schoolRef, {
    status: 'active',
    deletedAt: FieldValue.delete(),
    purgeAfter: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Re-populate memberships for all members in schools/{schoolId}/members
  const membersSnap = await db.collection(`schools/${data.schoolId}/members`).get();
  for (const mDoc of membersSnap.docs) {
    const mData = mDoc.data();
    const userMembershipRef = db.doc(`users/${mDoc.id}/memberships/${data.schoolId}`);
    batch.set(userMembershipRef, {
      schoolId: data.schoolId,
      namaSekolah: schoolData.namaSekolah,
      npsn: schoolData.npsn,
      jenjang: schoolData.jenjang || '',
      kabKota: schoolData.kabKota || '',
      role: mData.role,
      lastOpenedAt: FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();

  return {
    success: true,
    message: `Sekolah "${schoolData.namaSekolah}" berhasil dipulihkan ke status aktif.`,
  };
}
