import { describe, it } from 'node:test';
import assert from 'node:assert';
import { schoolFixtures } from './fixtures/schools_fixture_data.ts';
import { defaultRealSchoolData } from '../src/data/realSchoolData.ts';
import {
  generateWeeklyTransactionsFromProgressAndRealData,
} from '../src/services/generator/batchGenerator.ts';
import {
  calculateBkuFromTransactions,
} from '../src/services/generator/bkuGenerator.ts';
import {
  syncBkbFromBku,
  calculateIntegratedBkt,
} from '../src/services/cashLedgerIntegrationService.ts';
import {
  validateMasterInvariants,
} from '../src/utils/reconciliationValidator.ts';
import { syncAndReconcileAll9CategoriesToBudget } from '../src/utils/projectSummaryRekapHelper.ts';
import { initialProgressWeeks, initialStores, initialWorkers, initialRpdItems } from '../src/data/initialData.ts';

describe('Multi-School Fixture Pipeline & Master Invariants (1-6)', () => {
  schoolFixtures.forEach((fixture) => {
    it(`Fixture: ${fixture.school.namaSekolah} (${fixture.school.totalAnggaran.toLocaleString('id-ID')})`, () => {
      const school = fixture.school;
      const weekCount = fixture.weekCount;
      
      let progressWeeks = initialProgressWeeks.slice(0, Math.min(initialProgressWeeks.length, weekCount));
      if (progressWeeks.length < weekCount) {
        const baseWeeks = initialProgressWeeks;
        progressWeeks = [];
        for (let i = 1; i <= weekCount; i++) {
          const src = baseWeeks[(i - 1) % baseWeeks.length];
          progressWeeks.push({
            ...src,
            mingguKe: i,
            bobotRencana: Math.round((i / weekCount) * 100 * 100) / 100,
            bobotRealisasi: Math.round((i / weekCount) * 100 * 100) / 100,
          });
        }
      }

      const stores = initialStores;
      const workers = initialWorkers;
      const rpdItems = initialRpdItems;

      let kwitansiList: any[] = [];
      let wageReports: any[] = [];
      let bkbList: any[] = [];

      for (let wNum = 1; wNum <= weekCount; wNum++) {
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

      const bkuList = calculateBkuFromTransactions(
        kwitansiList,
        school as any,
        [],
        progressWeeks,
        [],
        wageReports
      );
      const bkbRecords = syncBkbFromBku(bkuList, school as any, progressWeeks, kwitansiList);
      const bktList = calculateIntegratedBkt(bkuList, bkbRecords, kwitansiList, school as any, progressWeeks);

      const invariantReport = validateMasterInvariants(
        school,
        kwitansiList,
        bkuList,
        bkbRecords,
        bktList,
        wageReports
      );

      assert.strictEqual(
        invariantReport.isAllPassed,
        true,
        `Master invariants failed for ${school.namaSekolah}:\n` +
          invariantReport.checks
            .filter((c) => !c.passed)
            .map((c) => ` - ${c.title}: ${c.message}`)
            .join('\n')
      );
    });
  });
});
