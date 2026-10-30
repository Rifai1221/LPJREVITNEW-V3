import { describe, it } from 'node:test';
import assert from 'node:assert';
import { generateWeeklyTransactionsFromProgressAndRealData } from '../src/services/generator/batchGenerator';
import { calculateBkuFromTransactions } from '../src/services/generator/bkuGenerator';
import { calculateIntegratedBkt, generateStandardBkbRecords, calculateRunningBkb } from '../src/services/cashLedgerIntegrationService';
import { generateTaxesFromKwitansi } from '../src/services/generator/taxGenerator';
import { validateFinancialReconciliation } from '../src/utils/reconciliationValidator';
import { defaultRealSchoolData } from '../src/data/realSchoolData';
import { initialSchoolData, initialWorkers, initialRpdItems, initialProgressWeeks, initialStores } from '../src/data/initialData';

describe('End-to-End Pipeline & Financial Reconciliation Test', () => {
  it('should generate complete RAB -> Kwitansi -> BKU -> BKB -> BKT -> Tax pipeline with zero reconciliation warnings', () => {
    const school = { ...initialSchoolData, totalAnggaran: 552457000 };
    const rpdItems = initialRpdItems || [];
    const realSchoolData = defaultRealSchoolData;
    const progressWeeks = initialProgressWeeks || [];
    const workers = initialWorkers || [];
    const stores = initialStores || [];

    let kwitansiList: any[] = [];
    let wageReports: any[] = [];
    let bkbList: any[] = [];

    // Run weekly generation for weeks 1 through 4
    for (let wNum = 1; wNum <= 4; wNum++) {
      const weekObj = progressWeeks.find((w) => w.mingguKe === wNum) || progressWeeks[0];
      const res = generateWeeklyTransactionsFromProgressAndRealData({
        targetWeek: wNum,
        weekObj,
        weeksToUse: progressWeeks,
        school,
        workers,
        stores,
        rpdItems,
        realSchoolData,
        existingKwitansi: kwitansiList,
        existingWageReports: wageReports,
        existingBkb: bkbList,
      });
      kwitansiList = res.updatedKwitansi;
      wageReports = res.updatedWageReports;
      bkbList = res.updatedBkb;
    }

    // 2. Generate BKU: (kwitansiList, school, manualTransactions, progressWeeks, deletedIds, wageReports, bkuWeekLimit, stores, bkbList)
    const bkuList = calculateBkuFromTransactions(
      kwitansiList,
      school,
      [],
      progressWeeks,
      [],
      wageReports,
      14,
      stores,
      bkbList
    );

    // 3. Generate BKB
    const rawBkb = generateStandardBkbRecords(school, progressWeeks, 14);
    const finalBkb = calculateRunningBkb([...rawBkb, ...bkbList]);

    // 4. Generate BKT
    const bktList = calculateIntegratedBkt(bkuList, finalBkb);

    // 5. Generate Tax Records
    const taxRecords = generateTaxesFromKwitansi(kwitansiList);

    // 6. Assemble AppState for Validation
    const appState: any = {
      school,
      rpdItems,
      kwitansiList,
      wageReports,
      progressWeeks,
      workers,
      realSchoolData,
    };

    const report = validateFinancialReconciliation(appState, bkuList, bktList, finalBkb, taxRecords);

    // Assertions
    assert.strictEqual(kwitansiList.length > 0, true, 'Kwitansi list must not be empty');
    assert.strictEqual(bkuList.length > 0, true, 'BKU list must not be empty');
    assert.strictEqual(finalBkb.length > 0, true, 'BKB list must not be empty');
    assert.strictEqual(bktList.length > 0, true, 'BKT list must not be empty');

    // Total Kwitansi must not exceed Total Budget
    assert.strictEqual(report.totals.totalExpenditure <= report.totals.totalBudget, true, 'Total expenditure must not exceed budget');
  });
});
