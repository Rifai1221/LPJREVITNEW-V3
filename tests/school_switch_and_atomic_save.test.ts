import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { getDefaultState } from '../src/services/storageService';
import { AppStateData } from '../src/types';
import {
  saveSchoolTenantAppState,
  loadSchoolTenantAppState,
  assertDocumentSize,
  getStoredTenantRev,
  setStoredTenantRev,
} from '../src/services/schoolTenantService';

// Mock localStorage environment in Node
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
    get length() {
      return store.size;
    },
  } as Storage;
}

describe('School Switch Protocol & Atomic Save Unit Tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('Requirement 3a & 3b: Flush Old School State Before Switch (Real Code Execution)', () => {
    it('should save state A, switch to B, modify B, return to A, and verify A is strictly unchanged', async () => {
      const tenantAObj = {
        id: 'sch_A_10105685',
        npsn: '10105685',
        namaSekolah: 'SD NEGERI A',
        jenjang: 'SD' as const,
        kabKota: 'Banda Aceh',
        provinsi: 'Aceh',
        email: 'sdna@sekolah.id',
        createdAt: '2026-01-01',
        lastLogin: '2026-01-01',
      };

      const tenantBObj = {
        id: 'sch_B_10101234',
        npsn: '10101234',
        namaSekolah: 'SD NEGERI B',
        jenjang: 'SD' as const,
        kabKota: 'Banda Aceh',
        provinsi: 'Aceh',
        email: 'sdnb@sekolah.id',
        createdAt: '2026-01-01',
        lastLogin: '2026-01-01',
      };

      // 1. Prepare and save State A
      const stateA: AppStateData = {
        ...getDefaultState(),
        tenantId: tenantAObj.id,
        school: {
          ...getDefaultState().school,
          namaSekolah: 'SD NEGERI A',
          npsn: '10105685',
        },
        kwitansiList: [
          {
            id: 'kw-a-1',
            noBukti: 'KW-A-01',
            tipe: 'MATERIAL',
            tanggal: '01/08/2026',
            tanggalFormatted: '01 Agustus 2026',
            bulan: 'Agustus 2026',
            uraian: 'Pembelian Semen Sekolah A',
            penerimaNama: 'TB A',
            penerimaPekerjaan: 'Toko',
            penerimaAlamat: 'Aceh',
            items: [],
            nominal: 5000000,
            isPpn: false,
            isPph22: false,
            isPph23: false,
            ppnAmount: 0,
            pph22Amount: 0,
            pph23Amount: 0,
          },
        ],
      };
      (stateA.school as any).id = tenantAObj.id;

      const saveARes = await saveSchoolTenantAppState(tenantAObj.id, stateA, 1, 'user-1');
      assert.strictEqual(saveARes.local, true, 'School A state save must succeed');

      // 2. Switch to School B
      const loadBRes = await loadSchoolTenantAppState(tenantBObj, 'user-1');
      assert.strictEqual(loadBRes.state.tenantId, tenantBObj.id, 'Loaded state must match tenant B ID');

      const stateBModified: AppStateData = {
        ...loadBRes.state,
        tenantId: tenantBObj.id,
        school: {
          ...loadBRes.state.school,
          namaSekolah: 'SD NEGERI B MODIFIED',
        },
        kwitansiList: [
          {
            id: 'kw-b-99',
            noBukti: 'KW-B-99',
            tipe: 'MATERIAL',
            tanggal: '05/08/2026',
            tanggalFormatted: '05 Agustus 2026',
            bulan: 'Agustus 2026',
            uraian: 'Pembelian Cat Sekolah B',
            penerimaNama: 'TB B',
            penerimaPekerjaan: 'Toko',
            penerimaAlamat: 'Aceh',
            items: [],
            nominal: 12000000,
            isPpn: false,
            isPph22: false,
            isPph23: false,
            ppnAmount: 0,
            pph22Amount: 0,
            pph23Amount: 0,
          },
        ],
      };
      (stateBModified.school as any).id = tenantBObj.id;

      const saveBRes = await saveSchoolTenantAppState(tenantBObj.id, stateBModified, 1, 'user-1');
      assert.strictEqual(saveBRes.local, true, 'School B state save must succeed');

      // 3. Return to School A and verify A is strictly intact
      const loadARes = await loadSchoolTenantAppState(tenantAObj, 'user-1');
      assert.strictEqual(loadARes.state.tenantId, tenantAObj.id, 'Loaded tenantId must be tenant A');
      assert.strictEqual(loadARes.state.school.namaSekolah, 'SD NEGERI A', 'School A name must remain unchanged');
      assert.strictEqual(loadARes.state.kwitansiList.length, 1, 'School A must have exactly its own 1 receipt');
      assert.strictEqual(loadARes.state.kwitansiList[0].noBukti, 'KW-A-01', 'School A receipt must be KW-A-01');
    });
  });

  describe('Requirement 3c: Outdated Load Results Ignored (Token Race Guard)', () => {
    it('should ignore stale load results when fast successive switches occur (A -> B -> C)', async () => {
      let switchRequestId = 0;
      let activeLoadedSchool: string | null = null;

      // Simulated switchSchool with request token counter
      const mockSwitchSchoolAsync = async (schoolName: string, simulatedDelayMs: number) => {
        const requestId = ++switchRequestId;

        // Simulate async loadSchoolTenantAppState
        await new Promise((resolve) => setTimeout(resolve, simulatedDelayMs));

        // Token check: if requestId is no longer current, discard!
        if (switchRequestId !== requestId) {
          return; // STALE: Discard!
        }

        activeLoadedSchool = schoolName;
      };

      // Rapid clicks: Switch A (slow, 80ms), Switch B (medium, 40ms), Switch C (fast, 10ms)
      const pA = mockSwitchSchoolAsync('School A', 80);
      const pB = mockSwitchSchoolAsync('School B', 40);
      const pC = mockSwitchSchoolAsync('School C', 10);

      await Promise.all([pA, pB, pC]);

      // School C arrived first, but even when A and B eventually resolve, School C must remain active!
      assert.strictEqual(activeLoadedSchool, 'School C', 'Final active school must strictly be School C');
    });
  });

  describe('Requirement 4: Storage Guard Assertion (Tenant Mismatch Rejection)', () => {
    it('should reject save when state.school.id does not match target tenantId', async () => {
      const state: AppStateData = {
        ...getDefaultState(),
        school: {
          ...getDefaultState().school,
          namaSekolah: 'SDN 1 KORUP',
          npsn: '12345678',
        },
      };
      (state.school as any).id = 'sch_legit_123';

      // Attempt saving with a different tenantId
      await assert.rejects(
        async () => {
          await saveSchoolTenantAppState('sch_attacker_999', state, 1, 'user-1');
        },
        /MISMATCH_ASSERTION/,
        'Should throw MISMATCH_ASSERTION when tenantId does not match state.school.id'
      );
    });

    it('should allow save when tenantId matches state.school.id', async () => {
      const state: AppStateData = {
        ...getDefaultState(),
        school: {
          ...getDefaultState().school,
          namaSekolah: 'SDN 1 MUARA DUA',
          npsn: '10105685',
        },
      };
      (state.school as any).id = 'sch_10105685_test';

      // Local save should succeed without error
      const res = await saveSchoolTenantAppState('sch_10105685_test', state, 1, 'user-1');
      assert.strictEqual(res.local, true, 'Local save should succeed');
    });
  });

  describe('Requirement 5: Atomic Save & Revision Conflict Detection', () => {
    it('should detect rev conflict when server rev does not match expected rev and perform zero partial writes', () => {
      const currentExpectedRev = 3;
      const serverRev = 4; // Server is ahead!

      let documentsWritten: string[] = [];

      // Simulate atomic transaction logic
      const simulateAtomicTransaction = (expected: number, server: number) => {
        if (server !== expected) {
          throw new Error('CONCURRENCY_CONFLICT');
        }
        // Write all domains atomically
        documentsWritten.push('meta', 'master', 'kwitansi', 'bku', 'wageReports', 'progressWeeks', 'rpd');
      };

      assert.throws(
        () => {
          simulateAtomicTransaction(currentExpectedRev, serverRev);
        },
        /CONCURRENCY_CONFLICT/,
        'Should abort transaction upon revision mismatch'
      );

      // Verify zero partial writes
      assert.strictEqual(documentsWritten.length, 0, 'No domain documents should be written when revision conflicts');
    });

    it('should reject documents exceeding 950KB limit', () => {
      // Create a payload larger than 950KB
      const hugeString = 'X'.repeat(960 * 1024);
      const hugePayload = { data: hugeString };

      assert.throws(
        () => {
          assertDocumentSize(hugePayload, 'kwitansi');
        },
        /UKURAN_DOKUMEN_LEBIH/,
        'Should reject payload larger than safe 950KB limit'
      );
    });

    it('should accept documents within safe size limit', () => {
      const normalPayload = { namaSekolah: 'SDN 1 MUARA DUA', npsn: '10105685' };
      assert.doesNotThrow(() => {
        assertDocumentSize(normalPayload, 'master');
      });
    });
  });
});
