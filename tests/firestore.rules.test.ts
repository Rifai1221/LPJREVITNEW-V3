import { describe, it, before, after, beforeEach } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const PROJECT_ID = 'lpj-rules-test-project';

describe('Firestore Security Rules RBAC Verification', () => {
  let testEnv: RulesTestEnvironment;

  before(async () => {
    const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
    const rules = fs.readFileSync(rulesPath, 'utf8');

    const hostAndPort = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8089';
    const [host, portStr] = hostAndPort.split(':');
    const port = parseInt(portStr || '8089', 10);

    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules,
        host: host || '127.0.0.1',
        port,
      },
    });
  });

  after(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    if (testEnv) {
      await testEnv.clearFirestore();

      // Seed baseline data using admin context (bypasses security rules)
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();

        // 1. School A Setup (active status)
        await setDoc(doc(db, 'schools', 'sch_A'), {
          id: 'sch_A',
          namaSekolah: 'SDN 1 AMAN',
          npsn: '12345678',
          status: 'active',
          createdAt: new Date(),
        });

        // 1a. Security credentials in private subcollection
        await setDoc(doc(db, 'schools', 'sch_A', 'private', 'security'), {
          pinHash: 'scrypt_hashed_credential',
          pinSalt: 'random_salt_123',
          algo: 'scrypt',
          failedAttempts: 0,
        });

        // 1b. Members
        await setDoc(doc(db, 'schools', 'sch_A', 'members', 'uid_bendahara_a'), {
          uid: 'uid_bendahara_a',
          role: 'BENDAHARA',
          displayName: 'Bendahara Sekolah A',
          email: 'bendahara@sekolah.id',
        });
        await setDoc(doc(db, 'schools', 'sch_A', 'members', 'uid_tim_teknis_a'), {
          uid: 'uid_tim_teknis_a',
          role: 'TIM_TEKNIS',
          displayName: 'Tim Teknis A',
        });
        await setDoc(doc(db, 'schools', 'sch_A', 'members', 'uid_fasilitator_a'), {
          uid: 'uid_fasilitator_a',
          role: 'FASILITATOR',
          displayName: 'Fasilitator A',
        });
        await setDoc(doc(db, 'schools', 'sch_A', 'members', 'uid_kepala_sekolah_a'), {
          uid: 'uid_kepala_sekolah_a',
          role: 'KEPALA_SEKOLAH',
          displayName: 'Kepala Sekolah A',
        });

        // 1c. LPJ Data documents
        await setDoc(doc(db, 'schools', 'sch_A', 'lpj_data', 'master'), {
          rev: 1,
          namaSekolah: 'SDN 1 AMAN',
          updatedAt: '2026-10-31',
          updatedBy: 'uid_bendahara_a',
        });
        await setDoc(doc(db, 'schools', 'sch_A', 'lpj_data', 'progressWeeks'), {
          rev: 1,
          progressWeeks: [{ weekNum: 1, percentage: 10 }],
          wageReports: [],
          workers: [],
          updatedAt: '2026-10-31',
          updatedBy: 'uid_bendahara_a',
        });
        // Legacy document
        await setDoc(doc(db, 'schools', 'sch_A', 'lpj_data', 'current'), {
          rev: 1,
          isLegacy: true,
        });

        // 2. School B Setup (active status)
        await setDoc(doc(db, 'schools', 'sch_B'), {
          id: 'sch_B',
          namaSekolah: 'SMPN 2 RAHASIA',
          npsn: '87654321',
          status: 'active',
          createdAt: new Date(),
        });
        await setDoc(doc(db, 'schools', 'sch_B', 'members', 'uid_bendahara_b'), {
          uid: 'uid_bendahara_b',
          role: 'BENDAHARA',
        });
        await setDoc(doc(db, 'schools', 'sch_B', 'lpj_data', 'master'), {
          rev: 1,
          secretBudget: 100000000,
        });

        // 3. Deleted School Setup
        await setDoc(doc(db, 'schools', 'sch_deleted'), {
          id: 'sch_deleted',
          namaSekolah: 'SDN TERHAPUS',
          status: 'deleted',
        });
        await setDoc(doc(db, 'schools', 'sch_deleted', 'members', 'uid_member_deleted'), {
          uid: 'uid_member_deleted',
          role: 'BENDAHARA',
        });
        await setDoc(doc(db, 'schools', 'sch_deleted', 'lpj_data', 'master'), {
          rev: 1,
          secret: true,
        });

        // 4. User memberships setup (for Switch Sekolah)
        await setDoc(doc(db, 'users', 'uid_bendahara_a', 'memberships', 'sch_A'), {
          schoolId: 'sch_A',
          namaSekolah: 'SDN 1 AMAN',
          role: 'BENDAHARA',
          lastOpenedAt: '2026-10-31T00:00:00.000Z',
        });
      });
    }
  });

  it('1. Penolakan Pengguna Anonim (Unauthenticated Denied)', async () => {
    const unauthedDb = testEnv.unauthenticatedContext().firestore();

    await assertFails(getDoc(doc(unauthedDb, 'schools', 'sch_A')));
    await assertFails(getDoc(doc(unauthedDb, 'schools', 'sch_A', 'lpj_data', 'master')));
    await assertFails(
      setDoc(doc(unauthedDb, 'schools', 'sch_A', 'lpj_data', 'master'), { hack: true })
    );
  });

  it('2. Kasus (a): Pengguna non-member tidak bisa read/write sekolah A', async () => {
    const nonMemberDb = testEnv.authenticatedContext('uid_outsider').firestore();

    // Ditolak membaca metadata sekolah
    await assertFails(getDoc(doc(nonMemberDb, 'schools', 'sch_A')));

    // Ditolak membaca daftar anggota sekolah A
    await assertFails(getDoc(doc(nonMemberDb, 'schools', 'sch_A', 'members', 'uid_bendahara_a')));

    // Ditolak membaca data LPJ sekolah A
    await assertFails(getDoc(doc(nonMemberDb, 'schools', 'sch_A', 'lpj_data', 'master')));

    // Ditolak menulis data LPJ sekolah A
    await assertFails(
      updateDoc(doc(nonMemberDb, 'schools', 'sch_A', 'lpj_data', 'master'), {
        rev: 2,
        hack: true,
      })
    );
  });

  it('3. Kasus (b): Member sekolah A tidak bisa menyentuh sekolah B', async () => {
    const bendaharaADb = testEnv.authenticatedContext('uid_bendahara_a').firestore();

    // BISA membaca sekolah A miliknya
    await assertSucceeds(getDoc(doc(bendaharaADb, 'schools', 'sch_A')));
    await assertSucceeds(getDoc(doc(bendaharaADb, 'schools', 'sch_A', 'lpj_data', 'master')));

    // DITOLAK saat mencoba membaca sekolah B
    await assertFails(getDoc(doc(bendaharaADb, 'schools', 'sch_B')));
    await assertFails(getDoc(doc(bendaharaADb, 'schools', 'sch_B', 'lpj_data', 'master')));
    await assertFails(getDoc(doc(bendaharaADb, 'schools', 'sch_B', 'members', 'uid_bendahara_b')));

    // DITOLAK saat mencoba menulis di sekolah B
    await assertFails(
      updateDoc(doc(bendaharaADb, 'schools', 'sch_B', 'lpj_data', 'master'), {
        rev: 2,
        tampered: true,
      })
    );
  });

  it('4. Kasus (c): Pengguna tidak bisa self-assign role atau membuat member langsung', async () => {
    const outsiderDb = testEnv.authenticatedContext('uid_attacker').firestore();

    // Mencoba menambahkan diri sendiri sebagai BENDAHARA di sekolah A -> DITOLAK
    await assertFails(
      setDoc(doc(outsiderDb, 'schools', 'sch_A', 'members', 'uid_attacker'), {
        uid: 'uid_attacker',
        role: 'BENDAHARA',
      })
    );

    // Member sekolah A mencoba mengubah rolenya sendiri -> DITOLAK
    const timTeknisDb = testEnv.authenticatedContext('uid_tim_teknis_a').firestore();
    await assertFails(
      updateDoc(doc(timTeknisDb, 'schools', 'sch_A', 'members', 'uid_tim_teknis_a'), {
        role: 'BENDAHARA',
      })
    );

    // Pengguna mencoba membuat dokumen membership langsung di users/{uid}/memberships -> DITOLAK
    await assertFails(
      setDoc(doc(outsiderDb, 'users', 'uid_attacker', 'memberships', 'sch_A'), {
        schoolId: 'sch_A',
        role: 'BENDAHARA',
      })
    );
  });

  it('5. Kasus (d): Klien sama sekali tidak bisa membaca atau menulis private/security', async () => {
    const bendaharaADb = testEnv.authenticatedContext('uid_bendahara_a').firestore();
    const outsiderDb = testEnv.authenticatedContext('uid_outsider').firestore();

    // Bendahara sekolah A sendiri DITOLAK membaca security credentials
    await assertFails(getDoc(doc(bendaharaADb, 'schools', 'sch_A', 'private', 'security')));

    // Bendahara DITOLAK menulis ke private/security
    await assertFails(
      updateDoc(doc(bendaharaADb, 'schools', 'sch_A', 'private', 'security'), {
        pinHash: 'new_pin_hash',
      })
    );

    // Pihak luar juga DITOLAK
    await assertFails(getDoc(doc(outsiderDb, 'schools', 'sch_A', 'private', 'security')));
  });

  it('6. Kasus (e): FASILITATOR tidak bisa create atau update lpj_data', async () => {
    const fasilitatorDb = testEnv.authenticatedContext('uid_fasilitator_a').firestore();

    // Fasilitator BISA membaca data LPJ sekolah A
    await assertSucceeds(getDoc(doc(fasilitatorDb, 'schools', 'sch_A', 'lpj_data', 'master')));

    // Fasilitator DITOLAK membuat dokumen lpj_data baru
    await assertFails(
      setDoc(doc(fasilitatorDb, 'schools', 'sch_A', 'lpj_data', 'kwitansi'), {
        rev: 1,
        items: [],
      })
    );

    // Fasilitator DITOLAK mengubah data LPJ bahkan dengan rev+1
    await assertFails(
      updateDoc(doc(fasilitatorDb, 'schools', 'sch_A', 'lpj_data', 'master'), {
        rev: 2,
        namaSekolah: 'SDN 1 UBAH',
      })
    );
  });

  it('7. Kasus (f): Update tanpa rev == rev + 1 wajib ditolak', async () => {
    const bendaharaADb = testEnv.authenticatedContext('uid_bendahara_a').firestore();

    // Update dengan rev yang sama (rev: 1) -> DITOLAK
    await assertFails(
      updateDoc(doc(bendaharaADb, 'schools', 'sch_A', 'lpj_data', 'master'), {
        rev: 1,
        namaSekolah: 'SDN 1 AMAN REVISI',
      })
    );

    // Update tanpa menyertakan field rev -> DITOLAK
    await assertFails(
      updateDoc(doc(bendaharaADb, 'schools', 'sch_A', 'lpj_data', 'master'), {
        namaSekolah: 'SDN 1 AMAN REVISI',
      })
    );

    // Update dengan melompati rev (rev: 3 padahal sekarang rev: 1) -> DITOLAK
    await assertFails(
      updateDoc(doc(bendaharaADb, 'schools', 'sch_A', 'lpj_data', 'master'), {
        rev: 3,
        namaSekolah: 'SDN 1 AMAN REVISI',
      })
    );

    // Update dengan rev tepat rev + 1 (rev: 2) oleh BENDAHARA -> BERHASIL
    await assertSucceeds(
      updateDoc(doc(bendaharaADb, 'schools', 'sch_A', 'lpj_data', 'master'), {
        rev: 2,
        namaSekolah: 'SDN 1 AMAN TERVALIDASI',
      })
    );

    // Dokumen 'current' (legacy) ditolak untuk diupdate meskipun menyertakan rev: 2
    await assertFails(
      updateDoc(doc(bendaharaADb, 'schools', 'sch_A', 'lpj_data', 'current'), {
        rev: 2,
        isLegacy: false,
      })
    );
  });

  it('8. User Memberships: Pemilik hanya boleh update lastOpenedAt', async () => {
    const bendaharaADb = testEnv.authenticatedContext('uid_bendahara_a').firestore();
    const otherUserDb = testEnv.authenticatedContext('uid_other').firestore();

    // Pemilik BISA membaca membership miliknya
    await assertSucceeds(getDoc(doc(bendaharaADb, 'users', 'uid_bendahara_a', 'memberships', 'sch_A')));

    // User lain DITOLAK membaca membership milik bendahara A
    await assertFails(getDoc(doc(otherUserDb, 'users', 'uid_bendahara_a', 'memberships', 'sch_A')));

    // Pemilik BISA mengupdate lastOpenedAt
    await assertSucceeds(
      updateDoc(doc(bendaharaADb, 'users', 'uid_bendahara_a', 'memberships', 'sch_A'), {
        lastOpenedAt: '2026-11-01T07:00:00.000Z',
      })
    );

    // Pemilik DITOLAK mengubah role di membership miliknya
    await assertFails(
      updateDoc(doc(bendaharaADb, 'users', 'uid_bendahara_a', 'memberships', 'sch_A'), {
        role: 'SUPER_ADMIN',
      })
    );
  });

  it('9. Sekolah Status Deleted: Member Ditolak Mengakses Sekolah yang Dihapus', async () => {
    const memberDeletedDb = testEnv.authenticatedContext('uid_member_deleted').firestore();

    // Ditolak membaca sekolah yang statusnya deleted
    await assertFails(getDoc(doc(memberDeletedDb, 'schools', 'sch_deleted')));

    // Ditolak membaca lpj_data pada sekolah deleted
    await assertFails(getDoc(doc(memberDeletedDb, 'schools', 'sch_deleted', 'lpj_data', 'master')));
  });
});
