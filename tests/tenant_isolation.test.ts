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
import { AppStateData } from '../src/types';
import { getDefaultState } from '../src/services/storageService';
import { SchoolTenant, createSchoolStateForTenant } from '../src/data/tenantPresets';
import {
  saveSchoolTenantAppState,
  loadSchoolTenantAppState,
  clearUserTenantCacheAndQueue,
} from '../src/services/schoolTenantService';

const PROJECT_ID = 'lpj-tenant-isolation-test';

// Mock browser global environment if running in Node
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) || null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] || null,
    length: 0,
  } as any;
}

describe('Requirement 2: Multi-Tenant Data Isolation Unit Tests', () => {
  let testEnv: RulesTestEnvironment | null = null;
  const isEmulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

  before(async () => {
    if (isEmulatorAvailable) {
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
    }
  });

  after(async () => {
    if (testEnv) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    if (testEnv) {
      await testEnv.clearFirestore();

      // Seed baseline data using admin context
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();

        // 1. School A: SDN 1 AMAN
        await setDoc(doc(db, 'schools', 'sch_A'), {
          id: 'sch_A',
          namaSekolah: 'SDN 1 AMAN',
          npsn: '11111111',
          status: 'active',
          createdAt: new Date(),
        });
        await setDoc(doc(db, 'schools', 'sch_A', 'private', 'security'), {
          pinHash: 'scrypt_hashed_pin_A',
          pinSalt: 'salt_A',
          algo: 'scrypt',
          failedAttempts: 0,
        });
        await setDoc(doc(db, 'schools', 'sch_A', 'members', 'user_U1'), {
          uid: 'user_U1',
          role: 'BENDAHARA',
          displayName: 'Bendahara Sekolah A',
        });
        await setDoc(doc(db, 'schools', 'sch_A', 'members', 'user_U1_teknis'), {
          uid: 'user_U1_teknis',
          role: 'TIM_TEKNIS',
          displayName: 'Teknis Sekolah A',
        });
        await setDoc(doc(db, 'schools', 'sch_A', 'lpj_data', 'meta'), {
          rev: 1,
          updatedAt: '2026-10-31',
        });
        await setDoc(doc(db, 'schools', 'sch_A', 'lpj_data', 'master'), {
          rev: 1,
          namaSekolah: 'SDN 1 AMAN',
        });

        // 2. School B: SMPN 2 RAHASIA
        await setDoc(doc(db, 'schools', 'sch_B'), {
          id: 'sch_B',
          namaSekolah: 'SMPN 2 RAHASIA',
          npsn: '22222222',
          status: 'active',
          createdAt: new Date(),
        });
        await setDoc(doc(db, 'schools', 'sch_B', 'private', 'security'), {
          pinHash: 'scrypt_hashed_pin_B',
          pinSalt: 'salt_B',
          algo: 'scrypt',
          failedAttempts: 0,
        });
        await setDoc(doc(db, 'schools', 'sch_B', 'members', 'user_U2'), {
          uid: 'user_U2',
          role: 'BENDAHARA',
          displayName: 'Bendahara Sekolah B',
        });
        await setDoc(doc(db, 'schools', 'sch_B', 'lpj_data', 'meta'), {
          rev: 1,
          updatedAt: '2026-10-31',
        });
        await setDoc(doc(db, 'schools', 'sch_B', 'lpj_data', 'master'), {
          rev: 1,
          namaSekolah: 'SMPN 2 RAHASIA',
        });
        await setDoc(doc(db, 'schools', 'sch_B', 'auditLogs', 'log_1'), {
          action: 'PAYMENT_APPROVED',
          by: 'user_U2',
        });
        await setDoc(doc(db, 'schools', 'sch_B', 'snapshots', 'snap_1'), {
          snapshotId: 'snap_1',
          rev: 1,
        });
      });
    }
  });

  describe('Firestore Security Rules Level: Strict Tenant Isolation', () => {
    it('should forbid User U1 from reading or writing ANY data in School B (lpj_data, members, auditLogs, snapshots, private)', async (t) => {
      if (!testEnv) {
        t.skip('Skipped because FIRESTORE_EMULATOR_HOST is not set');
        return;
      }

      const u1Db = testEnv.authenticatedContext('user_U1').firestore();

      // 1. Cannot read or write B's lpj_data
      await assertFails(getDoc(doc(u1Db, 'schools', 'sch_B', 'lpj_data', 'master')));
      await assertFails(getDoc(doc(u1Db, 'schools', 'sch_B', 'lpj_data', 'meta')));
      await assertFails(
        updateDoc(doc(u1Db, 'schools', 'sch_B', 'lpj_data', 'master'), { rev: 2, hack: true })
      );

      // 2. Cannot read or write B's members
      await assertFails(getDoc(doc(u1Db, 'schools', 'sch_B', 'members', 'user_U2')));
      await assertFails(
        setDoc(doc(u1Db, 'schools', 'sch_B', 'members', 'user_U1'), { role: 'BENDAHARA' })
      );

      // 3. Cannot read or write B's auditLogs
      await assertFails(getDoc(doc(u1Db, 'schools', 'sch_B', 'auditLogs', 'log_1')));
      await assertFails(
        setDoc(doc(u1Db, 'schools', 'sch_B', 'auditLogs', 'log_hack'), { action: 'SPY' })
      );

      // 4. Cannot read or write B's snapshots
      await assertFails(getDoc(doc(u1Db, 'schools', 'sch_B', 'snapshots', 'snap_1')));
      await assertFails(
        setDoc(doc(u1Db, 'schools', 'sch_B', 'snapshots', 'snap_hack'), { fake: true })
      );

      // 5. Cannot read or write B's private security subcollection
      await assertFails(getDoc(doc(u1Db, 'schools', 'sch_B', 'private', 'security')));
      await assertFails(
        updateDoc(doc(u1Db, 'schools', 'sch_B', 'private', 'security'), { pinHash: 'compromised' })
      );
    });

    it('should forbid user from elevating their own role directly in members document', async (t) => {
      if (!testEnv) {
        t.skip('Skipped because FIRESTORE_EMULATOR_HOST is not set');
        return;
      }

      const u1TeknisDb = testEnv.authenticatedContext('user_U1_teknis').firestore();

      // TIM_TEKNIS attempts to self-promote to BENDAHARA
      await assertFails(
        updateDoc(doc(u1TeknisDb, 'schools', 'sch_A', 'members', 'user_U1_teknis'), {
          role: 'BENDAHARA',
        })
      );
    });

    it('should reject writing lpj_data when revision does not match expected increment (rev concurrency rule)', async (t) => {
      if (!testEnv) {
        t.skip('Skipped because FIRESTORE_EMULATOR_HOST is not set');
        return;
      }

      const u1Db = testEnv.authenticatedContext('user_U1').firestore();

      // Current rev is 1. Writing rev 1 (not incremented) must be rejected
      await assertFails(
        updateDoc(doc(u1Db, 'schools', 'sch_A', 'lpj_data', 'master'), {
          rev: 1, // must be > existing
          namaSekolah: 'SDN 1 AMAN MODIFIED',
        })
      );
    });
  });

  describe('Service Level: Switch A -> B -> A Byte-for-Byte Integrity', () => {
    it('should preserve School A state byte-for-byte after switching to School B and returning to School A', async () => {
      const tenantA: SchoolTenant = {
        id: 'sch_A_iso',
        namaSekolah: 'SDN 1 AMAN ISOLATION',
        npsn: '11111111',
        jenjang: 'SD',
        kabKota: 'Kab. Aman',
        provinsi: 'Prov. Sejahtera',
        email: 'sdn1@sekolah.id',
        isDemo: false,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
      };

      const tenantB: SchoolTenant = {
        id: 'sch_B_iso',
        namaSekolah: 'SMPN 2 RAHASIA ISOLATION',
        npsn: '22222222',
        jenjang: 'SMP/MTs',
        kabKota: 'Kab. Rahasia',
        provinsi: 'Prov. Rahasia',
        email: 'smpn2@sekolah.id',
        isDemo: false,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
      };

      const callerUid = 'user_isolator_1';

      // 1. Construct distinct comprehensive state for School A
      const initialA: AppStateData = {
        ...createSchoolStateForTenant(tenantA, 'full'),
        kwitansiList: [
          {
            id: 'kwt_A_1',
            noBukti: 'KWT/001/A',
            uraian: 'Pembelian Semen Padang 50 Zak',
            total: 3500000,
            tanggal: '2026-03-01',
            kategori: 'MATERIAL',
            namaPenerima: 'TB Aman Sejahtera',
            items: [{ uraian: 'Semen Padang', volume: 50, satuan: 'Zak', hargaSatuan: 70000, jumlah: 3500000 }],
          } as any,
        ],
        manualBkuTransactions: [
          {
            id: 'bku_A_1',
            noBukti: 'BKU/001/A',
            tanggal: '2026-03-01',
            uraian: 'Bayar Semen Padang',
            pengeluaran: 3500000,
            kategoriBiaya: 'Konstruksi',
          } as any,
        ],
      };
      (initialA.school as any).id = tenantA.id;

      // 2. Construct distinct state for School B
      const initialB: AppStateData = {
        ...createSchoolStateForTenant(tenantB, 'full'),
        kwitansiList: [
          {
            id: 'kwt_B_1',
            noBukti: 'KWT/999/B',
            uraian: 'Pembayaran Pasir Urug 10 Truk',
            total: 8000000,
            tanggal: '2026-04-10',
            kategori: 'MATERIAL',
            namaPenerima: 'CV Rahasia Abadi',
            items: [{ uraian: 'Pasir Urug', volume: 10, satuan: 'Truk', hargaSatuan: 800000, jumlah: 8000000 }],
          } as any,
        ],
        manualBkuTransactions: [
          {
            id: 'bku_B_1',
            noBukti: 'BKU/999/B',
            tanggal: '2026-04-10',
            uraian: 'Bayar Pasir Urug',
            pengeluaran: 8000000,
            kategoriBiaya: 'Konstruksi',
          } as any,
        ],
      };
      (initialB.school as any).id = tenantB.id;

      // Clean before test
      await clearUserTenantCacheAndQueue(callerUid);

      // STEP 1: Save state of School A
      const saveResA = await saveSchoolTenantAppState(tenantA.id, initialA, 1, callerUid);
      assert.strictEqual(saveResA.local, true, 'Local cache save for School A must succeed');

      // STEP 2: Switch to School B (load B, save B)
      const loadResB = await loadSchoolTenantAppState(tenantB, callerUid);
      assert.strictEqual(loadResB.state.school?.namaSekolah, tenantB.namaSekolah, 'School B must load correctly');
      assert.strictEqual(loadResB.state.kwitansiList.length, 0, 'School B fresh preset must not have School A receipts');

      // Now save customized School B state
      const saveResB = await saveSchoolTenantAppState(tenantB.id, initialB, 1, callerUid);
      assert.strictEqual(saveResB.local, true, 'Local cache save for School B must succeed');

      // STEP 3: Switch BACK to School A
      const reloadedA = await loadSchoolTenantAppState(tenantA, callerUid);

      // Verify School A data
      assert.strictEqual(reloadedA.state.school?.namaSekolah, tenantA.namaSekolah);
      assert.strictEqual(reloadedA.state.kwitansiList.length, 1);
      assert.strictEqual(reloadedA.state.kwitansiList[0].noBukti, 'KWT/001/A');
      assert.strictEqual(reloadedA.state.manualBkuTransactions.length, 1);
      assert.strictEqual(reloadedA.state.manualBkuTransactions[0].noBukti, 'BKU/001/A');

      // BYTE-PER-BYTE CHECK:
      // Strip undefined/timestamps normalization to ensure exact payload fidelity
      const cleanA1 = JSON.stringify(initialA);
      const cleanA2 = JSON.stringify(reloadedA.state);
      assert.strictEqual(cleanA2, cleanA1, 'School A state must be byte-for-byte identical after round-trip switch!');
    });
  });
});
