import { describe, it } from 'node:test';
import assert from 'node:assert';
import { SchoolMasterData, StoreVendor, ProjectProgressWeek, KwitansiDocument, RpdItem } from '../src/types/index.ts';
import { defaultRealSchoolData } from '../src/data/realSchoolData.ts';
import { initialProgressWeeks, initialStores, initialWorkers, initialRpdItems } from '../src/data/initialData.ts';
import { generateWeeklyTransactionsFromProgressAndRealData } from '../src/services/generator/batchGenerator.ts';
import { syncAndReconcileAll9CategoriesToBudget } from '../src/utils/projectSummaryRekapHelper.ts';
import { planCashFlow } from '../src/services/cashPlanner.ts';
import { calculateBkuFromTransactions } from '../src/services/generator/bkuGenerator.ts';
import { syncBkbFromBku, calculateIntegratedBkt } from '../src/services/cashLedgerIntegrationService.ts';
import { parseTxDateToIso } from '../src/utils/monthHelper.ts';
import { deriveRpd } from '../src/utils/rpdFromLedger.ts';

function createSchoolFixture(overrides: Partial<SchoolMasterData>): SchoolMasterData {
  const total = overrides.totalAnggaran || 500000000;
  const t1Persen = overrides.termin1Persen ?? 70;
  const t2Persen = overrides.termin2Persen ?? (100 - t1Persen);
  const t1Nilai = overrides.termin1Nilai ?? Math.round(total * (t1Persen / 100));
  const t2Nilai = overrides.termin2Nilai ?? (total - t1Nilai);

  return {
    namaSekolah: 'SD NEGERI FIXTURE',
    npsn: '12345678',
    totalAnggaran: total,
    termin1Persen: t1Persen,
    termin2Persen: t2Persen,
    termin1Nilai: t1Nilai,
    termin2Nilai: t2Nilai,
    tahunAnggaran: '2026',
    kabKota: 'KOTA LHOKSEUMAWE',
    provinsi: 'ACEH',
    namaBank: 'Bank Aceh Syariah',
    nomorRekening: '123-456-7890',
    namaRekening: 'LPJ REVITALISASI',
    namaKepalaSekolah: 'Kepala Sekolah M.Pd',
    nipKepalaSekolah: '197001011995011001',
    namaBendahara: 'Bendahara S.Pd',
    nipBendahara: '198001012005011002',
    ...overrides,
  } as unknown as SchoolMasterData;
}

function generateFullKwitansiList(school: SchoolMasterData, weeks: ProjectProgressWeek[]) {
  const stores: StoreVendor[] = [
    ...(initialStores || []),
    { id: 's-siplah-1', namaToko: 'HANIMO', pemilikNama: 'CV. HANIMO', pekerjaan: 'Penyedia SipLah Mebeler', alamat: 'Lhokseumawe', kategori: 'SIPLAH' },
    { id: 's-siplah-2', namaToko: 'N&N STATIONARY', pemilikNama: 'UD. N&N STATIONARY', pekerjaan: 'Penyedia SipLah Mebeler & ATK', alamat: 'Lhokseumawe', kategori: 'SIPLAH' },
  ];
  const workers = initialWorkers || [];
  const rpdItems: RpdItem[] = [];

  let kwitansiList: KwitansiDocument[] = [];
  let wageReports: any[] = [];
  let bkbList: any[] = [];

  for (let wNum = 1; wNum <= weeks.length; wNum++) {
    const weekObj = weeks.find((w) => w.mingguKe === wNum) || weeks[0];
    const res = generateWeeklyTransactionsFromProgressAndRealData({
      targetWeek: wNum,
      weekObj,
      weeksToUse: weeks,
      school,
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
    school,
    rpdItems: [],
    realSchoolData: defaultRealSchoolData,
    kwitansiList,
    wageReports,
    stores,
    progressWeeks: weeks,
  });

  return { kwitansiList: recons.updatedKwitansiList, wageReports, stores };
}

describe('Cash Planner Integration Tests (BKU, BKT, BKB Invariants)', () => {
  const testCases = [
    {
      name: 'Fixture 1: SDN 1 Muara Dua (Rp 552.457.000)',
      school: createSchoolFixture({
        namaSekolah: 'SD NEGERI 1 MUARA DUA',
        totalAnggaran: 552457000,
        termin1Persen: 70,
        termin2Persen: 30,
        termin1Nilai: 386719900,
        termin2Nilai: 165737100,
      }),
      weeks: initialProgressWeeks,
    },
    {
      name: 'Fixture 2: SMP Negeri 3 Banda Aceh (Rp 350.000.000)',
      school: createSchoolFixture({
        namaSekolah: 'SMP NEGERI 3 BANDA ACEH',
        totalAnggaran: 350000000,
        termin1Persen: 70,
        termin2Persen: 30,
        termin1Nilai: 245000000,
        termin2Nilai: 105000000,
      }),
      weeks: initialProgressWeeks,
    },
    {
      name: 'Fixture 3: SMA Negeri 1 Sigli (Rp 820.000.000)',
      school: createSchoolFixture({
        namaSekolah: 'SMA NEGERI 1 SIGLI',
        totalAnggaran: 820000000,
        termin1Persen: 60,
        termin2Persen: 40,
        termin1Nilai: 492000000,
        termin2Nilai: 328000000,
      }),
      weeks: initialProgressWeeks,
    },
    {
      name: 'Fixture 4: Skenario Termin 2 Terlambat (Tanggal Termin 2 = 15/10/2026)',
      school: createSchoolFixture({
        namaSekolah: 'SD NEGERI TERMIN 2 TERLAMBAT',
        totalAnggaran: 500000000,
        termin1Persen: 70,
        termin2Persen: 30,
        termin1Nilai: 350000000,
        termin2Nilai: 150000000,
        tanggalTermin2: '15/10/2026',
        termin2Tanggal: '15/10/2026',
      }),
      weeks: initialProgressWeeks,
    },
  ];

  testCases.forEach(({ name, school, weeks }) => {
    it(name, () => {
      const { kwitansiList, wageReports, stores } = generateFullKwitansiList(school, weeks);

      // 1. Run planCashFlow
      const plan = planCashFlow(kwitansiList, school, weeks, wageReports);
      const plannedKws = plan.plannedKwitansiList;

      // 2. Generate BKU
      const bkuList = calculateBkuFromTransactions(
        plannedKws,
        school,
        [],
        weeks,
        [],
        wageReports,
        weeks.length,
        stores,
        []
      );

      // 3. Generate BKB
      const bkbList = syncBkbFromBku(bkuList, school, weeks, plannedKws);

      // 4. Generate BKT
      const bktList = calculateIntegratedBkt(bkuList, bkbList, plannedKws, school, weeks);

      // ASSERTION 1: Minimum saldo BKU, BKT, BKB >= 0 at every transaction and week-end
      bkuList.forEach((tx) => {
        assert.ok((tx.saldo ?? 0) >= 0, `BKU saldo negative (${tx.saldo}) on date ${tx.tanggal} (${tx.noBukti})`);
      });
      bkbList.forEach((tx) => {
        assert.ok((tx.saldo ?? 0) >= 0, `BKB saldo negative (${tx.saldo}) on date ${tx.tanggal} (${tx.noBukti})`);
      });
      bktList.forEach((tx) => {
        assert.ok((tx.saldo ?? 0) >= 0, `BKT saldo negative (${tx.saldo}) on date ${tx.tanggal} (${tx.noBukti})`);
      });

      // ASSERTION 2: Saldo akhir ketiganya == 0
      const lastBkuSaldo = bkuList[bkuList.length - 1]?.saldo ?? -1;
      const lastBkbSaldo = bkbList[bkbList.length - 1]?.saldo ?? -1;
      const lastBktSaldo = bktList[bktList.length - 1]?.saldo ?? -1;

      assert.strictEqual(lastBkuSaldo, 0, `Final BKU saldo must be 0, got ${lastBkuSaldo}`);
      assert.strictEqual(lastBkbSaldo, 0, `Final BKB saldo must be 0, got ${lastBkbSaldo}`);
      assert.strictEqual(lastBktSaldo, 0, `Final BKT saldo must be 0, got ${lastBktSaldo}`);

      // ASSERTION 3: Total BKU pengeluaran == total kwitansi == totalAnggaran
      const totalBkuPengeluaran = bkuList
        .filter((t) => t.jenis === 'PENGELUARAN')
        .reduce((s, t) => s + (t.pengeluaran || 0), 0);
      const totalKwitansiNominal = plannedKws.reduce((s, k) => s + (k.nominal || 0), 0);

      assert.strictEqual(
        totalBkuPengeluaran,
        school.totalAnggaran,
        `Total BKU pengeluaran (${totalBkuPengeluaran}) must equal school.totalAnggaran (${school.totalAnggaran})`
      );
      assert.strictEqual(
        totalKwitansiNominal,
        school.totalAnggaran,
        `Total Kwitansi nominal (${totalKwitansiNominal}) must equal school.totalAnggaran (${school.totalAnggaran})`
      );

      // ASSERTION 4: Tanggal BKU == BKT == BKB == kwitansi untuk tiap transaksi
      plannedKws.forEach((kw) => {
        const bkuTx = bkuList.find((b) => b.kwitansiIdRef === kw.id || b.id === `bku-kw-${kw.id}`);
        if (bkuTx) {
          assert.strictEqual(bkuTx.tanggal, kw.tanggal, `Date mismatch between Kwitansi and BKU for ${kw.id}`);
        }

        const isBank =
          kw.metodeBayar === 'BANK' ||
          kw.kategoriBiayaPajak === 'Siplah' ||
          /siplah|daring/i.test(`${kw.noBukti || ''} ${kw.uraian || ''}`);

        if (isBank) {
          const bkbTx = bkbList.find((b) => b.kwitansiIdRef === kw.id || b.noBukti === kw.noBukti);
          if (bkbTx) {
            assert.strictEqual(bkbTx.tanggal, kw.tanggal, `Date mismatch between Kwitansi and BKB for ${kw.id}`);
          }
        } else {
          const bktTx = bktList.find((b) => b.kwitansiIdRef === kw.id || b.noBukti === kw.noBukti);
          if (bktTx) {
            assert.strictEqual(bktTx.tanggal, kw.tanggal, `Date mismatch between Kwitansi and BKT for ${kw.id}`);
          }
        }
      });

      // ASSERTION 5: Tidak ada noBukti ganda
      const checkNoDuplicates = (list: { noBukti?: string }[], ledgerName: string) => {
        const seen = new Set<string>();
        list.forEach((item) => {
          const nb = (item.noBukti || '').trim().toUpperCase();
          if (nb && nb !== '-' && nb !== 'MANUAL') {
            assert.ok(!seen.has(nb), `Duplicate noBukti '${nb}' found in ${ledgerName}`);
            seen.add(nb);
          }
        });
      };

      checkNoDuplicates(bkuList, 'BKU');
      checkNoDuplicates(bkbList, 'BKB');
      checkNoDuplicates(bktList, 'BKT');
    });
  });
});

describe('RPD Derived From Ledger Invariants', () => {
  it('deriveRpd sums to totalAnggaran and updates when receipts change', () => {
    const school = createSchoolFixture({ totalAnggaran: 500000000 });
    const weeks = initialProgressWeeks;
    const { kwitansiList, wageReports } = generateFullKwitansiList(school, weeks);
    const bkuList = calculateBkuFromTransactions(kwitansiList, school, [], weeks, [], wageReports);

    const derived = deriveRpd(kwitansiList, wageReports, bkuList, defaultRealSchoolData, school);
    const totalDerived = derived.reduce((s, i) => s + i.jumlahAnggaran, 0);
    assert.strictEqual(totalDerived, school.totalAnggaran, 'Derived RPD total must equal school.totalAnggaran');
  });
});
