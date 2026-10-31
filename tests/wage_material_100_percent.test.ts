import { describe, it } from 'node:test';
import assert from 'node:assert';
import { defaultRealSchoolData } from '../src/data/realSchoolData';
import { initialSchoolData, initialWorkers, initialRpdItems, initialProgressWeeks, initialStores } from '../src/data/initialData';
import { generateWeeklyTransactionsFromProgressAndRealData, calibrateAllTransactionsToCurrentProgress } from '../src/services/generator/batchGenerator';
import { getItemMaterialLaborSplit } from '../src/utils/ahspHelper';
import { classifyKwitansiCategory } from '../src/utils/projectSummaryRekapHelper';
import { toRupiah } from '../src/utils/money';

describe('Wage & Material Reconciliation at 100% Progress', () => {
  it('should match exact RAB labor and material budget at 100% progress with zero tolerance', () => {
    const realSchoolData = defaultRealSchoolData;
    const totalRab = realSchoolData.divisions.reduce(
      (sum, div) => sum + div.items.reduce((s, it) => s + toRupiah(it.jumlah), 0),
      0
    );
    const school = { ...initialSchoolData, totalAnggaran: totalRab };
    const rpdItems = initialRpdItems || [];
    const workers = initialWorkers || [];
    const stores = initialStores || [];

    // Calculate exact Pagu from RAB
    let paguUpah = 0;
    let paguMaterial = 0;
    let paguFixed = 0;

    realSchoolData.divisions.forEach((div) => {
      div.items.forEach((it) => {
        const u = (it.uraian || '').toLowerCase();
        const kat = (it.kategoriBiaya || '').toUpperCase();
        const tags = (it.tags || []).map((t) => t.toUpperCase());

        const isFixed =
          tags.includes('CTK') || kat === 'CETAK' || /papan\s*nama|prasasti/i.test(u) ||
          tags.includes('SMKK') || kat === 'SMKK' || /smkk|k3/i.test(u) ||
          tags.includes('SIPLAH') || kat === 'SIPLAH' || /siplah/i.test(u) ||
          tags.includes('KONS-P') || kat === 'PERENCANA' || /perencana/i.test(u) ||
          tags.includes('KONS-W') || kat === 'PENGAWAS' || /pengawas/i.test(u) ||
          tags.includes('SPJ') || kat === 'PENGELOLA' || /spj|administrasi/i.test(u) ||
          tags.includes('FUR') || kat === 'PINTU_JENDELA' || it.isBarangPabrikasi || /pintu|jendela|mebeler/i.test(u);

        if (isFixed) {
          paguFixed += toRupiah(it.jumlah);
        } else {
          const split = getItemMaterialLaborSplit(it, realSchoolData.ahspList);
          paguMaterial += split.material;
          paguUpah += split.labor;
        }
      });
    });

    assert.strictEqual(
      paguMaterial + paguUpah + paguFixed,
      totalRab,
      'Sum of category budgets must equal total RAB exactly'
    );

    // Build 100% completed progress weeks
    const progressWeeks = initialProgressWeeks.map((pw, idx) => {
      if (idx === initialProgressWeeks.length - 1) {
        return {
          ...pw,
          bobotRealisasi: 100,
          divisions: (pw.divisions || []).map((d) => ({
            ...d,
            prestasiSdMingguIni: d.bobotTotal,
            prestasiMingguIni: Math.max(0, d.bobotTotal - (d.prestasiMingguLalu || 0)),
          })),
        };
      }
      return pw;
    });

    let kwitansiList: any[] = [];
    let wageReports: any[] = [];
    let bkbList: any[] = [];

    // Run weekly generation for all weeks through week 14
    for (let wNum = 1; wNum <= progressWeeks.length; wNum++) {
      const weekObj = progressWeeks.find((w) => w.mingguKe === wNum) || progressWeeks[wNum - 1];
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

    // Calibrate to full 100% progress
    const calib = calibrateAllTransactionsToCurrentProgress({
      school,
      realSchoolData,
      progressWeeks,
      kwitansiList,
      workers,
      stores,
      rpdItems,
      existingBkb: bkbList,
    });

    const finalKw = calib.calibratedKwitansi;
    const finalWages = calib.calibratedWageReports;

    // Check wages
    const totalWageReceipts = finalKw
      .filter((k: any) => k.tipe === 'UPAH' || classifyKwitansiCategory(k) === 'UPAH_KERJA')
      .reduce((s: number, k: any) => s + toRupiah(k.nominal), 0);

    const totalWageReportsSum = finalWages.reduce(
      (s: number, w: any) => s + toRupiah(w.totalUpah),
      0
    );

    // Wage receipts must match weekly wage reports
    assert.strictEqual(
      totalWageReceipts,
      totalWageReportsSum,
      'Total wage receipts must equal wage reports sum'
    );

    // Wage must equal pagu upah with 0 tolerance
    assert.strictEqual(
      totalWageReceipts,
      paguUpah,
      `Total kwitansi UPAH (${totalWageReceipts}) must equal pagu upah (${paguUpah})`
    );

    // Grand total of all kwitansi must not exceed total RAB
    const grandTotal = finalKw.reduce((s: number, k: any) => s + toRupiah(k.nominal), 0);
    assert.strictEqual(
      grandTotal,
      totalRab,
      `Grand total kwitansi (${grandTotal}) must equal total RAB (${totalRab})`
    );
  });
});
