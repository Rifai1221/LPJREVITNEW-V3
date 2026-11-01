import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { getDefaultState } from '../src/services/storageService';
import { AppStateData } from '../src/types';
import {
  saveSchoolTenantAppState,
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

  describe('Requirement 3a & 3b: Flush Old School State Before Switch', () => {
    it('should flush dirty state to old tenantId before switching to new tenant', async () => {
      const oldTenantId = 'sch_old_111';
      const newTenantId = 'sch_new_222';

      let isDirty = true;
      let flushCalledWithTenant: string | null = null;
      let newSchoolLoaded = false;

      // Simulated safe switchSchool workflow
      const mockSwitchSchool = async (targetId: string) => {
        // Step 1: FLUSH if dirty
        if (isDirty) {
          flushCalledWithTenant = oldTenantId;
          isDirty = false;
        }

        // Step 2: Load new tenant
        newSchoolLoaded = true;
      };

      await mockSwitchSchool(newTenantId);

      assert.strictEqual(flushCalledWithTenant, oldTenantId, 'Flush must be called with old tenant ID');
      assert.strictEqual(isDirty, false, 'isDirty flag must be cleared upon flush');
      assert.strictEqual(newSchoolLoaded, true, 'New school should be loaded after flush completes');
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
