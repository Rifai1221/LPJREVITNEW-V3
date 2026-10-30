import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
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

    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules,
        host: '127.0.0.1',
        port: 8080,
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

        // 1. School A & Member Setup
        await setDoc(doc(db, 'schools', 'sch_A'), {
          id: 'sch_A',
          namaSekolah: 'SDN 1 AMAN',
          npsn: '12345678',
        });
        await setDoc(doc(db, 'schools', 'sch_A', 'members', 'uid_bendahara_a'), {
          uid: 'uid_bendahara_a',
          role: 'BENDAHARA',
        });
        await setDoc(doc(db, 'schools', 'sch_A', 'members', 'uid_tim_teknis_a'), {
          uid: 'uid_tim_teknis_a',
          role: 'TIM_TEKNIS',
        });
        await setDoc(doc(db, 'schools', 'sch_A', 'members', 'uid_fasilitator_a'), {
          uid: 'uid_fasilitator_a',
          role: 'FASILITATOR',
        });
        await setDoc(doc(db, 'schools', 'sch_A', 'lpj_data', 'current'), {
          progressWeeks: [{ weekNum: 1, percentage: 10 }],
          wageReports: [],
          workers: [],
          kwitansiList: [{ id: 'k1', total: 500000 }],
          manualBkuTransactions: [],
        });

        // 2. School B Setup
        await setDoc(doc(db, 'schools', 'sch_B'), {
          id: 'sch_B',
          namaSekolah: 'SMPN 2 RAHASIA',
          npsn: '87654321',
        });
        await setDoc(doc(db, 'schools', 'sch_B', 'members', 'uid_bendahara_b'), {
          uid: 'uid_bendahara_b',
          role: 'BENDAHARA',
        });
        await setDoc(doc(db, 'schools', 'sch_B', 'lpj_data', 'current'), {
          secretBudget: 100000000,
        });

        // 3. app_settings Setup
        await setDoc(doc(db, 'app_settings', 'active_school'), {
          activeTenantId: 'sch_A',
        });
      });
    }
  });

  it('1. Penolakan Pengguna Anonim (Unauthenticated Denied)', async () => {
    const unauthedDb = testEnv.unauthenticatedContext().firestore();

    // Anonim mencoba membaca lpj_data -> DITOLAK
    await assertFails(getDoc(doc(unauthedDb, 'schools', 'sch_A', 'lpj_data', 'current')));

    // Anonim mencoba menulis data -> DITOLAK
    await assertFails(
      setDoc(doc(unauthedDb, 'schools', 'sch_A', 'lpj_data', 'current'), { hack: true })
    );
  });

  it('2. Peran Baca-Saja (FASILITATOR) Tidak Bisa Menulis', async () => {
    const fasilitatorDb = testEnv.authenticatedContext('uid_fasilitator_a').firestore();

    // Fasilitator BISA membaca data sekolahnya
    await assertSucceeds(getDoc(doc(fasilitatorDb, 'schools', 'sch_A', 'lpj_data', 'current')));

    // Fasilitator DITOLAK saat mencoba mengubah data
    await assertFails(
      updateDoc(doc(fasilitatorDb, 'schools', 'sch_A', 'lpj_data', 'current'), {
        progressWeeks: [{ weekNum: 1, percentage: 100 }],
      })
    );
  });

  it('3. Isolasi Multi-Tenant: Sekolah A Tidak Bisa Membaca Sekolah B', async () => {
    const bendaharaADb = testEnv.authenticatedContext('uid_bendahara_a').firestore();

    // Bendahara A BISA membaca data sekolah A
    await assertSucceeds(getDoc(doc(bendaharaADb, 'schools', 'sch_A', 'lpj_data', 'current')));

    // Bendahara A DITOLAK saat mencoba mengintip data sekolah B
    await assertFails(getDoc(doc(bendaharaADb, 'schools', 'sch_B', 'lpj_data', 'current')));

    // Bendahara A DITOLAK saat mencoba membaca anggota sekolah B
    await assertFails(getDoc(doc(bendaharaADb, 'schools', 'sch_B', 'members', 'uid_bendahara_b')));
  });

  it('4. TIM_TEKNIS Hanya Boleh Mengubah Progres & Upah, Ditolak Mengubah Keuangan', async () => {
    const timTeknisDb = testEnv.authenticatedContext('uid_tim_teknis_a').firestore();

    // Boleh mengubah progres fisik
    await assertSucceeds(
      updateDoc(doc(timTeknisDb, 'schools', 'sch_A', 'lpj_data', 'current'), {
        progressWeeks: [{ weekNum: 1, percentage: 25 }],
      })
    );

    // DITOLAK saat mencoba mengubah kwitansi / transaksi finansial
    await assertFails(
      updateDoc(doc(timTeknisDb, 'schools', 'sch_A', 'lpj_data', 'current'), {
        kwitansiList: [{ id: 'k1', total: 99999999 }],
      })
    );
  });

  it('5. Akses Koleksi app_settings Ditolak Secara Mutlak', async () => {
    const bendaharaADb = testEnv.authenticatedContext('uid_bendahara_a').firestore();

    // Mencoba membaca app_settings -> DITOLAK
    await assertFails(getDoc(doc(bendaharaADb, 'app_settings', 'active_school')));

    // Mencoba menulis app_settings -> DITOLAK
    await assertFails(
      setDoc(doc(bendaharaADb, 'app_settings', 'active_school'), { activeTenantId: 'sch_B' })
    );
  });
});
