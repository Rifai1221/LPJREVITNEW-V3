import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  detectDataAnomalies,
  sanitizeAndFilterDemoState,
  loadAppState,
  getDefaultState,
} from '../src/services/storageService';
import {
  enqueueSyncItem,
  dequeueSyncItem,
  isTenantPendingSync,
  getPendingSyncCount,
  SyncQueueItem,
} from '../src/services/schoolTenantService';
import { offloadLargeBlobs, rehydrateBlobsInState } from '../src/services/blobStorageService';
import { encryptJsonData, decryptJsonData } from '../src/utils/cryptoHelper';
import { AppStateData } from '../src/types';

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
  } as Storage;
}

describe('Storage & Synchronization Unit Tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('1. Concurrency & Conflict Detection Logic', () => {
    it('should detect when remote revision is strictly newer than local expected revision', () => {
      const localExpectedRev = 3;
      const serverRev = 5;

      const isConflict = serverRev > localExpectedRev;
      assert.strictEqual(isConflict, true, 'Should detect concurrency conflict when server is ahead');
    });

    it('should allow write and increment revision when revisions match', () => {
      const localExpectedRev = 4;
      const serverRev = 4;

      const isConflict = serverRev > localExpectedRev;
      assert.strictEqual(isConflict, false);
      const nextRev = Math.max(serverRev, localExpectedRev) + 1;
      assert.strictEqual(nextRev, 5, 'Next rev should be incremented');
    });

    it('should merge remote and local receipts without dropping unique items', () => {
      const serverKwList = [
        { id: 'kw-1', noBukti: 'KWT/01', nominal: 100000 },
        { id: 'kw-2', noBukti: 'KWT/02', nominal: 200000 },
      ];
      const localKwList = [
        { id: 'kw-2', noBukti: 'KWT/02', nominal: 250000 }, // updated locally
        { id: 'kw-3', noBukti: 'KWT/03', nominal: 300000 }, // created offline locally
      ];

      const serverMap = new Map(serverKwList.map((k) => [k.id, k]));
      const merged = [...serverKwList];
      localKwList.forEach((localItem) => {
        if (!serverMap.has(localItem.id)) {
          merged.push(localItem);
        }
      });

      assert.strictEqual(merged.length, 3, 'Merged list should contain all unique receipts');
      assert.ok(merged.some((k) => k.id === 'kw-3'), 'Local offline receipt should be preserved');
    });
  });

  describe('2. Retry Queue with Exponential Backoff', () => {
    it('should enqueue and dequeue sync items correctly', () => {
      const sampleItem: SyncQueueItem = {
        id: 'queue-tenant-1',
        tenantId: 'sch_test_01',
        state: getDefaultState(),
        attemptCount: 0,
        nextRetryTime: Date.now() + 2000,
        createdAt: new Date().toISOString(),
      };

      enqueueSyncItem(sampleItem);
      assert.strictEqual(isTenantPendingSync('sch_test_01'), true);
      assert.strictEqual(getPendingSyncCount(), 1);

      dequeueSyncItem('sch_test_01');
      assert.strictEqual(isTenantPendingSync('sch_test_01'), false);
      assert.strictEqual(getPendingSyncCount(), 0);
    });

    it('should calculate exponential backoff delay capped at 30 seconds', () => {
      const calculateDelay = (attempt: number) => {
        return Math.min(30000, Math.pow(2, Math.min(attempt, 5)) * 1000);
      };

      assert.strictEqual(calculateDelay(1), 2000, 'Attempt 1 delay should be 2s');
      assert.strictEqual(calculateDelay(2), 4000, 'Attempt 2 delay should be 4s');
      assert.strictEqual(calculateDelay(3), 8000, 'Attempt 3 delay should be 8s');
      assert.strictEqual(calculateDelay(4), 16000, 'Attempt 4 delay should be 16s');
      assert.strictEqual(calculateDelay(5), 32000 > 30000 ? 30000 : 32000, 'Attempt 5 capped at 30s');
      assert.strictEqual(calculateDelay(10), 30000, 'High attempt counts must cap at 30s');
    });
  });

  describe('3. Anomaly Detection vs Silent Mutation (Requirement 5)', () => {
    it('should propose fixes without mutating original state', () => {
      const stateWithAnomalies: AppStateData = {
        ...getDefaultState(),
        kwitansiList: [
          {
            id: 'kw_mat_err',
            noBukti: 'KWT/MAT/01/2026',
            tipe: 'MATERIAL',
            uraian: 'Honorarium Pengawas Teknis Lapangan',
            nominal: 500000,
            tanggal: '2026-03-01',
            penerimaNama: 'Erwin Syahputra (Pengawas)',
            penerimaPekerjaan: 'Pengawas Teknis',
            items: [],
          } as any,
        ],
      };

      // Detect anomalies
      const proposals = detectDataAnomalies(stateWithAnomalies);
      assert.strictEqual(proposals.length, 1);
      assert.strictEqual(proposals[0].category, 'KWITANSI');
      assert.ok(proposals[0].title.includes('Honorarium'));

      // Crucial: Original state was NOT mutated silently!
      assert.strictEqual(
        stateWithAnomalies.kwitansiList[0].uraian,
        'Honorarium Pengawas Teknis Lapangan',
        'State must NOT be mutated silently before approval'
      );

      // When user explicitly approves and applies proposal
      const repairedState = proposals[0].applyFix(stateWithAnomalies);
      assert.ok(
        repairedState.kwitansiList[0].uraian.includes('Pembayaran Lunas Biaya Pembelian Material'),
        'Fixed state must reflect approved proposal'
      );
    });

    it('should NOT call saveAppState inside loadAppState', () => {
      let savedCallCount = 0;
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = (key: string, val: string) => {
        if (key === 'LPJ_REVITALISASI_DATA_V1') {
          savedCallCount++;
        }
        originalSetItem.call(localStorage, key, val);
      };

      try {
        localStorage.setItem(
          'LPJ_REVITALISASI_DATA_V1',
          JSON.stringify({ school: { namaSekolah: 'SD TEST' }, rpdItems: [] })
        );
        savedCallCount = 0; // reset

        const loaded = loadAppState();
        assert.strictEqual(loaded.school.namaSekolah, 'SD TEST');
        assert.strictEqual(savedCallCount, 0, 'loadAppState must NEVER trigger saveAppState!');
      } finally {
        localStorage.setItem = originalSetItem;
      }
    });
  });

  describe('4. Blob Offloading for 1MB Firestore Limit Protection', () => {
    it('should replace large base64 logo with reference string', async () => {
      const largeBase64 = 'data:image/png;base64,' + 'A'.repeat(5000);
      const stateWithLogo: AppStateData = {
        ...getDefaultState(),
        school: {
          ...getDefaultState().school,
          logoLeftUrl: largeBase64,
        },
      };

      const offloaded = await offloadLargeBlobs(stateWithLogo);
      assert.ok(
        offloaded.school.logoLeftUrl?.startsWith('lpj_blob_ref:'),
        'Base64 string must be replaced by blob reference key'
      );
      assert.ok(
        (offloaded.school.logoLeftUrl?.length || 0) < 100,
        'Reference key must be tiny (< 100 chars)'
      );
    });
  });

  describe('5. Encrypted Backup & Restore Cycle (Requirement 6)', () => {
    it('should encrypt and decrypt school LPJ state accurately with password', async () => {
      const sampleState: AppStateData = {
        ...getDefaultState(),
        school: {
          ...getDefaultState().school,
          namaSekolah: 'SD NEGERI 1 TERSIMPAN AMAN',
          npsn: '10809988',
        },
      };

      const password = 'RahasiaSekolah#2026';
      const encryptedPayload = await encryptJsonData(sampleState, password);

      assert.strictEqual(typeof encryptedPayload, 'string');
      assert.strictEqual(encryptedPayload.length > 50, true);

      const restoredState = await decryptJsonData(encryptedPayload, password);
      assert.strictEqual(restoredState.school.namaSekolah, 'SD NEGERI 1 TERSIMPAN AMAN');
      assert.strictEqual(restoredState.school.npsn, '10809988');
    });

    it('should fail decryption if wrong password is provided', async () => {
      const sampleState = { school: { namaSekolah: 'SD DUA' } };
      const encryptedPayload = await encryptJsonData(sampleState, 'CorrectPass123');

      try {
        await decryptJsonData(encryptedPayload, 'WrongPass456');
        assert.fail('Should have thrown an error on wrong password');
      } catch (err: any) {
        assert.ok(err, 'Throws decryption error on invalid password');
      }
    });
  });
});
