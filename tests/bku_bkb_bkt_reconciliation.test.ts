import { describe, it } from 'node:test';
import assert from 'node:assert';
import { defaultRealSchoolData } from '../src/data/realSchoolData.ts';
import {
  generateWeeklyTransactionsFromProgressAndRealData,
} from '../src/services/generator/batchGenerator.ts';
import {
  calculateBkuFromTransactions,
  calculateBktFromBku,
} from '../src/services/generator/bkuGenerator.ts';
import {
  generateStandardBkbRecords,
  harmonizeBkbRecordsWithSiplah,
  calculateRunningBkb,
  reconcileCashBalances,
  syncBkbFromBku,
} from '../src/services/cashLedgerIntegrationService.ts';
import {
  validateCashLedgerInvariants,
  validateFinancialReconciliation,
} from '../src/utils/reconciliationValidator.ts';
import { syncAndReconcileAll9CategoriesToBudget } from '../src/utils/projectSummaryRekapHelper.ts';
import { initialProgressWeeks, initialStores, initialWorkers, initialRpdItems } from '../src/data/initialData.ts';
import { AppStateData, StoreVendor } from '../src/types/index.ts';

describe('BKU vs BKB + BKT Financial Reconciliation & Invariants', () => {
  it('should result in 2 SIPLAH BKB debits, 0 discrepancy, and no negative BKT balance with real school data', () => {
    const school = {
      namaSekolah: 'SD NEGERI 1 MUARA DUA',
      npsn: '10203040',
      totalAnggaran: 552457000,
      termin1Nilai: 386719900,
      termin2Nilai: 165737100,
      tahunAnggaran: '2026',
      kabKota: 'KOTA LHOKSEUMAWE',
      provinsi: 'ACEH',
      namaBank: 'Bank Aceh Syariah',
      nomorRekening: '123-456-7890',
      namaRekening: 'LPJ REVITALISASI SDN 1 MUARA DUA',
      namaKepalaSekolah: 'Dra. Hj. Cut Nurhaliza, M.Pd',
      nipKepalaSekolah: '196803121992032001',
      namaBendahara: 'Rahmat Hidayat, S.Pd',
      nipBendahara: '198205142008011003',
    };

    const progressWeeks = initialProgressWeeks || [];
    const stores: StoreVendor[] = [
      ...(initialStores || []),
      { id: 's-siplah-1', namaToko: 'HANIMO', pemilikNama: 'CV. HANIMO', pekerjaan: 'Penyedia SipLah Mebeler', alamat: 'Lhokseumawe', kategori: 'SIPLAH' },
      { id: 's-siplah-2', namaToko: 'N&N STATIONARY', pemilikNama: 'UD. N&N STATIONARY', pekerjaan: 'Penyedia SipLah Mebeler & ATK', alamat: 'Lhokseumawe', kategori: 'SIPLAH' },
    ];
    const workers = initialWorkers || [];
    const rpdItems = initialRpdItems || [];

    let kwitansiList: any[] = [];
    let wageReports: any[] = [];
    let bkbList: any[] = [];

    // Generate weekly transactions for weeks 1 through 14
    for (let wNum = 1; wNum <= 14; wNum++) {
      const weekObj = progressWeeks.find((w) => w.mingguKe === wNum) || progressWeeks[0];
      const res = generateWeeklyTransactionsFromProgressAndRealData({
        targetWeek: wNum,
        weekObj,
        weeksToUse: progressWeeks,
        school: school as any,
        workers,
        stores,
        rpdItems,
        realSchoolData: defaultRealSchoolData,
        existingKwitansi: kwitansiList,
        existingWageReports: wageReports,
        existingBkb: bkbList,
      });
      kwitansiList = res.updatedKwitansi;
      wageReports = res.updatedWageReports;
      bkbList = res.updatedBkb;
    }

    const recons = syncAndReconcileAll9CategoriesToBudget({
      school: school as any,
      rpdItems,
      realSchoolData: defaultRealSchoolData,
      kwitansiList,
      wageReports,
      stores,
      progressWeeks,
    });
    kwitansiList = recons.updatedKwitansiList;

    // Filter SipLah receipts
    const siplahKwitansi = kwitansiList.filter(
      (k) =>
        k.kategoriBiayaPajak === 'Siplah' ||
        /siplah|hanimo|n&n/i.test(`${k.noBukti} ${k.uraian} ${k.namaToko}`) ||
        (k.items && k.items.some((i: any) => /siplah/i.test(i.kategoriBiaya || '')))
    );

    // 2. Generate BKU
    const bkuList = calculateBkuFromTransactions(
      kwitansiList,
      school as any,
      [],
      progressWeeks,
      [],
      wageReports,
      14,
      stores,
      bkbList
    );

    // 3. Generate & Harmonize BKB from BKU
    const bkbRecords = syncBkbFromBku(bkuList, school as any, progressWeeks);
    const siplahBkbDebits = bkbRecords.filter((b) => b.kategori === 'SIPLAH');

    assert.strictEqual(siplahBkbDebits.length, siplahKwitansi.length, 'Every SipLah kwitansi must have exactly 1 SipLah debit in BKB');

    // 4. Calculate BKT
    const bktList = calculateBktFromBku(bkuList, bkbRecords);
    assert.ok(bktList.length > 0, 'BKT list should not be empty');

    // 5. Invariant Checks
    const invReport = validateCashLedgerInvariants(bkuList, bkbRecords, bktList, kwitansiList);
    assert.strictEqual(
      invReport.isSatisfied,
      true,
      `Cash ledger invariants violated:\n${invReport.violations.join('\n')}`
    );
    assert.strictEqual(invReport.violations.length, 0);

    // 6. Non-negative BKT check
    const negativeBkt = bktList.find((b) => (b.saldo || 0) < 0);
    assert.strictEqual(negativeBkt, undefined, 'BKT balance must never be negative on any date');

    // 7. Cash Reconciliation check
    const lastBku = bkuList[bkuList.length - 1];
    const lastBkb = bkbRecords[bkbRecords.length - 1];
    const lastBkt = bktList[bktList.length - 1];

    const recon = reconcileCashBalances(lastBku.saldo || 0, lastBkb.saldo || 0, lastBkt.saldo || 0);
    assert.strictEqual(recon.isBalanced, true, 'BKU balance must equal BKB + BKT balance exactly');
    assert.strictEqual(recon.selisih, 0, 'Selisih BKU vs (BKB+BKT) must be 0');

    // 8. Full Financial Reconciliation
    const appState: AppStateData = {
      school: school as any,
      rpdItems,
      workers,
      stores,
      wageReports,
      kwitansiList,
      manualBkuTransactions: [],
      progressWeeks,
      bkbRecords,
      realSchoolData: defaultRealSchoolData,
    };

    const fullRecon = validateFinancialReconciliation(
      appState,
      bkuList,
      bktList,
      bkbRecords,
      []
    );

    const cashAlerts = fullRecon.alerts.filter((a) => a.category === 'KAS_LEDGER' || a.category === 'NEGATIVE_BALANCE');
    assert.strictEqual(cashAlerts.length, 0, `Expected 0 cash alerts, got:\n${cashAlerts.map(a => a.description).join('\n')}`);
  });
});
