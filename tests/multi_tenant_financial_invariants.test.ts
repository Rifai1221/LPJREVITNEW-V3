import { describe, it } from 'node:test';
import assert from 'node:assert';
import { defaultRealSchoolData } from '../src/data/realSchoolData.ts';
import {
  generateWeeklyTransactionsFromProgressAndRealData,
  calibrateAllTransactionsToCurrentProgress,
} from '../src/services/generator/batchGenerator.ts';
import {
  calculateBkuFromTransactions,
  calculateBktFromBku,
} from '../src/services/generator/bkuGenerator.ts';
import {
  syncBkbFromBku,
  calculateIntegratedBkt,
} from '../src/services/cashLedgerIntegrationService.ts';
import {
  validateCashLedgerInvariants,
  validateFinancialReconciliation,
} from '../src/utils/reconciliationValidator.ts';
import { syncAndReconcileAll9CategoriesToBudget } from '../src/utils/projectSummaryRekapHelper.ts';
import { getItemMaterialLaborSplit } from '../src/utils/ahspHelper.ts';
import { alignAndShiftTransactionsForCashflow } from '../src/services/generator/splitTransactionService.ts';
import { initialProgressWeeks, initialStores, initialWorkers, initialRpdItems } from '../src/data/initialData.ts';
import {
  SchoolMasterData,
  StoreVendor,
  WorkerItem,
  RealSchoolData,
  ProjectProgressWeek,
  AppStateData,
  KwitansiDocument,
} from '../src/types/index.ts';

describe('Multi-Tenant Financial Invariants (6 Strict Rules)', () => {
  // -------------------------------------------------------------
  // FIXTURE 1: SDN 1 MUARA DUA (Rp 552.457.000, 70/30, 14 Weeks, 6 Workers)
  // -------------------------------------------------------------
  it('Fixture 1 (SDN 1 Muara Dua): Must satisfy all 6 invariants at 100% completion', () => {
    const school: SchoolMasterData = {
      namaSekolah: 'SD NEGERI 1 MUARA DUA',
      npsn: '10203040',
      totalAnggaran: 552457000,
      termin1Nilai: 386719900,
      termin2Nilai: 165737100,
      termin1Persen: 70,
      termin2Persen: 30,
      termin1Tanggal: '01/07/2026',
      termin2Tanggal: '15/09/2026',
      periodePenggunaan: '01 Juli 2026 s/d 31 Oktober 2026',
      tahunAnggaran: '2026',
      kabKota: 'KOTA LHOKSEUMAWE',
      provinsi: 'ACEH',
      namaBank: 'Bank Aceh Syariah',
      nomorRekening: '123-456-7890',
      namaRekening: 'LPJ SDN 1 MUARA DUA',
      namaKepalaSekolah: 'Dra. Hj. Cut Nurhaliza, M.Pd',
      nipKepalaSekolah: '196803121992032001',
      namaBendahara: 'Rahmat Hidayat, S.Pd',
      nipBendahara: '198205142008011003',
    };

    const progressWeeks = initialProgressWeeks || [];
    const stores: StoreVendor[] = initialStores || [];
    const workers: WorkerItem[] = initialWorkers || [];
    const rpdItems = initialRpdItems || [];

    let kwitansiList: KwitansiDocument[] = [];
    let wageReports: any[] = [];
    let bkbList: any[] = [];

    for (let wNum = 1; wNum <= 14; wNum++) {
      const weekObj = progressWeeks.find((w) => w.mingguKe === wNum) || progressWeeks[0];
      const res = generateWeeklyTransactionsFromProgressAndRealData({
        targetWeek: wNum,
        weekObj,
        weeksToUse: progressWeeks,
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
      rpdItems,
      realSchoolData: defaultRealSchoolData,
      kwitansiList,
      wageReports,
      stores,
      progressWeeks,
    });
    kwitansiList = recons.updatedKwitansiList;

    // Generate BKU from kwitansi
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

    // Generate BKB from BKU
    const bkbRecords = syncBkbFromBku(bkuList, school, progressWeeks);

    // Generate BKT from BKU and BKB
    const bktRecords = calculateIntegratedBkt(bkuList, bkbRecords, school, progressWeeks);

    // INVARIANT 1: PAGU TETAP
    const totalKwitansi = kwitansiList.reduce((s, k) => s + (k.nominal || 0), 0);
    const bkuPengeluaran = bkuList.filter((tx) => tx.jenis === 'PENGELUARAN').reduce((s, tx) => s + (tx.pengeluaran || 0), 0);
    const bkuPenerimaan = bkuList.filter((tx) => tx.jenis === 'PENERIMAAN').reduce((s, tx) => s + (tx.penerimaan || 0), 0);

    assert.strictEqual(totalKwitansi, school.totalAnggaran, 'Total kwitansi must equal school.totalAnggaran exactly');
    assert.strictEqual(bkuPengeluaran, school.totalAnggaran, 'Total BKU pengeluaran must equal school.totalAnggaran');
    assert.strictEqual(bkuPenerimaan, school.termin1Nilai! + school.termin2Nilai!, 'Total BKU penerimaan must equal T1 + T2');

    // Final saldo BKU, BKB, BKT == 0
    const finalBkuSaldo = bkuList[bkuList.length - 1].saldo;
    const finalBkbSaldo = bkbRecords[bkbRecords.length - 1].saldo;
    const finalBktSaldo = bktRecords[bktRecords.length - 1].saldo;
    assert.strictEqual(finalBkuSaldo, 0, 'Final Saldo BKU must be 0');
    assert.strictEqual(finalBkbSaldo, 0, 'Final Saldo BKB must be 0');
    assert.strictEqual(finalBktSaldo, 0, 'Final Saldo BKT must be 0');

    // Total upah == pagu upah from RAB/AHSP
    let rabWagePagu = 0;
    (defaultRealSchoolData.divisions || []).forEach((div: any) => {
      (div.items || []).forEach((it: any) => {
        const split = getItemMaterialLaborSplit(it, defaultRealSchoolData.ahspList || []);
        rabWagePagu += split.labor;
      });
    });
    const totalKwitansiUpah = kwitansiList.filter((k) => k.tipe === 'UPAH').reduce((s, k) => s + (k.nominal || 0), 0);
    assert.strictEqual(totalKwitansiUpah, rabWagePagu, 'Total kwitansi upah must match exact RAB wage pagu');

    // INVARIANT 3: TIDAK ADA SALDO MINUS
    const minusBku = bkuList.find((tx) => (tx.saldo || 0) < 0);
    const minusBkb = bkbRecords.find((tx) => (tx.saldo || 0) < 0);
    const minusBkt = bktRecords.find((tx) => (tx.saldo || 0) < 0);
    assert.ok(!minusBku, `BKU must never be negative, found minus: ${minusBku?.saldo} at ${minusBku?.tanggal}`);
    assert.ok(!minusBkb, `BKB must never be negative, found minus: ${minusBkb?.saldo} at ${minusBkb?.tanggal}`);
    assert.ok(!minusBkt, `BKT must never be negative, found minus: ${minusBkt?.saldo} at ${minusBkt?.tanggal}`);

    // No -p1 or -p2 splits
    const hasP1P2Kw = kwitansiList.some((k) => k.id.includes('-p1') || k.id.includes('-p2') || k.id.includes('-part1'));
    assert.ok(!hasP1P2Kw, 'Kwitansi must NOT be split into -p1 / -p2');

    // INVARIANT 4: KWITANSI BILANGAN BULAT & HARGA KONSISTEN
    for (const kw of kwitansiList) {
      if (!kw.items || kw.items.length === 0) continue;
      let itemSum = 0;
      for (const item of kw.items) {
        assert.ok(Number.isInteger(item.volume), `Item ${item.namaBarang} volume must be integer: ${item.volume}`);
        assert.ok(Number.isInteger(item.hargaSatuan), `Item ${item.namaBarang} hargaSatuan must be integer: ${item.hargaSatuan}`);
        assert.strictEqual(
          item.volume * item.hargaSatuan,
          item.jumlah,
          `Item ${item.namaBarang} volume * hargaSatuan (${item.volume} * ${item.hargaSatuan} = ${item.volume * item.hargaSatuan}) must equal jumlah (${item.jumlah})`
        );
        itemSum += item.jumlah;
      }
      assert.strictEqual(itemSum, kw.nominal, `Sum of items (${itemSum}) must equal kwitansi nominal (${kw.nominal}) on ${kw.noBukti}`);
    }

    // Ledger invariant validation
    const ledgerInv = validateCashLedgerInvariants(bkuList, bkbRecords, bktRecords, kwitansiList);
    assert.ok(ledgerInv.isSatisfied, `Ledger invariants must be satisfied. Violations: ${ledgerInv.violations.join('; ')}`);
  });

  // -------------------------------------------------------------
  // FIXTURE 2: SMPN 3 HARAPAN BANGSA (Rp 280.000.000, 60/40, 10 Weeks, 4 Workers, Custom Rates)
  // -------------------------------------------------------------
  it('Fixture 2 (SMPN 3 Harapan Bangsa): 60/40 Termin, 10 Weeks, custom rates and 2 stores', () => {
    const school: SchoolMasterData = {
      namaSekolah: 'SMP NEGERI 3 HARAPAN BANGSA',
      npsn: '20304050',
      totalAnggaran: 280000000,
      termin1Nilai: 168000000,
      termin2Nilai: 112000000,
      termin1Persen: 60,
      termin2Persen: 40,
      termin1Tanggal: '01/07/2026',
      termin2Tanggal: '20/08/2026',
      periodePenggunaan: '01 Juli 2026 s/d 15 September 2026',
      tahunAnggaran: '2026',
      kabKota: 'KABUPATEN BANDUNG',
      provinsi: 'JAWA BARAT',
      namaBank: 'Bank BJB',
      nomorRekening: '001-223-3445',
      namaRekening: 'LPJ SMPN 3 HARAPAN BANGSA',
      namaKepalaSekolah: 'Budi Santoso, M.Pd',
      nipKepalaSekolah: '197505101999031002',
      namaBendahara: 'Siti Aminah, S.Pd',
      nipBendahara: '198501202010012005',
    };

    // 10 weeks progress
    const progressWeeks: ProjectProgressWeek[] = Array.from({ length: 10 }, (_, i) => {
      const wNum = i + 1;
      const startDay = 1 + i * 7;
      const sDayStr = String(startDay).padStart(2, '0');
      const eDayStr = String(startDay + 6).padStart(2, '0');
      const bobot = 10;
      return {
        id: `w-${wNum}`,
        mingguKe: wNum,
        bobot,
        bobotRealisasi: bobot,
        cumulativeProgress: wNum * 10,
        startDate: `2026-07-${sDayStr}`,
        endDate: `2026-07-${eDayStr}`,
        status: 'COMPLETE',
      };
    });

    const stores: StoreVendor[] = [
      { id: 'store-smp-1', namaToko: 'TB Sinar Abadi', pemilikNama: 'Haji Suryana', pekerjaan: 'Bahan Bangunan', alamat: 'Bandung', kategori: 'MATERIAL' },
      { id: 'store-smp-2', namaToko: 'CV Mitra Mandiri', pemilikNama: 'Dedi Kusuma', pekerjaan: 'Mebeler & Kusen', alamat: 'Bandung', kategori: 'PERABOT' },
    ];

    const workers: WorkerItem[] = [
      { id: 'w1', nama: 'Ujang', role: 'Tukang', tarifHarian: 150000, jumlahHari: 6, subtotal: 900000 },
      { id: 'w2', nama: 'Asep', role: 'Tukang', tarifHarian: 150000, jumlahHari: 6, subtotal: 900000 },
      { id: 'w3', nama: 'Dadang', role: 'Pekerja', tarifHarian: 125000, jumlahHari: 6, subtotal: 750000 },
      { id: 'w4', nama: 'Cecep', role: 'Pekerja', tarifHarian: 125000, jumlahHari: 6, subtotal: 750000 },
    ];

    // Divisions with wage and material
    const smpSchoolData: RealSchoolData = {
      ...defaultRealSchoolData,
      totalNilaiRab: 280000000,
      divisions: [
        {
          id: 'div-smp-1',
          kode: 'I',
          uraian: 'Pekerjaan Persiapan & SMKK',
          bobot: 5,
          items: [
            { id: 'it-1', uraian: 'Papan Nama & Administrasi', volume: 1, satuan: 'Ls', hargaSatuan: 2800000, jumlah: 2800000, kategoriBiaya: 'CETAK' },
            { id: 'it-2', uraian: 'Penerapan K3 / SMKK', volume: 1, satuan: 'Ls', hargaSatuan: 11200000, jumlah: 11200000, kategoriBiaya: 'SMKK' },
          ],
        },
        {
          id: 'div-smp-2',
          kode: 'II',
          uraian: 'Pekerjaan Struktur & Dinding',
          bobot: 50,
          items: [
            { id: 'it-3', uraian: 'Semen Portland PCC', volume: 500, satuan: 'Zak', hargaSatuan: 72000, jumlah: 36000000, kategoriBiaya: 'BAHAN' },
            { id: 'it-4', uraian: 'Pasir Pasang Ayak', volume: 80, satuan: 'm³', hargaSatuan: 250000, jumlah: 20000000, kategoriBiaya: 'BAHAN' },
            { id: 'it-5', uraian: 'Bata Merah Standar', volume: 20000, satuan: 'bh', hargaSatuan: 1000, jumlah: 20000000, kategoriBiaya: 'BAHAN' },
            { id: 'it-6', uraian: 'Besi Beton Campuran', volume: 200, satuan: 'btg', hargaSatuan: 95000, jumlah: 19000000, kategoriBiaya: 'BAHAN' },
            { id: 'it-7', uraian: 'Upah Tenaga Pasangan Dinding & Plesteran', volume: 300, satuan: 'OH', hargaSatuan: 150000, jumlah: 45000000, kategoriBiaya: 'UPAH' },
          ],
        },
        {
          id: 'div-smp-3',
          kode: 'III',
          uraian: 'Pekerjaan Kusen & Pintu Alumunium',
          bobot: 25,
          items: [
            { id: 'it-8', uraian: 'Pintu & Jendela Alumunium Lengkap', volume: 20, satuan: 'Unit', hargaSatuan: 2500000, jumlah: 50000000, isBarangPabrikasi: true, kategoriBiaya: 'PERABOT' },
            { id: 'it-9', uraian: 'Upah Pasang Kusen & Pintu', volume: 133, satuan: 'OH', hargaSatuan: 150000, jumlah: 20000000, kategoriBiaya: 'UPAH' },
          ],
        },
        {
          id: 'div-smp-4',
          kode: 'IV',
          uraian: 'Pekerjaan Finishing & Pengecatan',
          bobot: 20,
          items: [
            { id: 'it-10', uraian: 'Cat Tembok Eksterior/Interior Weatherproof', volume: 80, satuan: 'Pail', hargaSatuan: 400000, jumlah: 32000000, kategoriBiaya: 'BAHAN' },
            { id: 'it-11', uraian: 'Upah Tenaga Pengecatan & Pembersihan', volume: 160, satuan: 'OH', hargaSatuan: 150000, jumlah: 24000000, kategoriBiaya: 'UPAH' },
          ],
        },
      ],
    };

    let kwitansiList: KwitansiDocument[] = [];
    let wageReports: any[] = [];
    let bkbList: any[] = [];

    for (let wNum = 1; wNum <= 10; wNum++) {
      const weekObj = progressWeeks.find((w) => w.mingguKe === wNum)!;
      const res = generateWeeklyTransactionsFromProgressAndRealData({
        targetWeek: wNum,
        weekObj,
        weeksToUse: progressWeeks,
        school,
        workers,
        stores,
        rpdItems: [],
        realSchoolData: smpSchoolData,
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
      realSchoolData: smpSchoolData,
      kwitansiList,
      wageReports,
      stores,
      progressWeeks,
    });
    kwitansiList = recons.updatedKwitansiList;

    // Generate BKU
    const bkuList = calculateBkuFromTransactions(
      kwitansiList,
      school,
      [],
      progressWeeks,
      [],
      wageReports,
      10,
      stores,
      bkbList
    );

    // Generate BKB & BKT
    const bkbRecords = syncBkbFromBku(bkuList, school, progressWeeks);
    const bktRecords = calculateIntegratedBkt(bkuList, bkbRecords, school, progressWeeks);

    // INVARIANT 1: PAGU TETAP
    const totalKwitansi = kwitansiList.reduce((s, k) => s + (k.nominal || 0), 0);
    const bkuPengeluaran = bkuList.filter((tx) => tx.jenis === 'PENGELUARAN').reduce((s, tx) => s + (tx.pengeluaran || 0), 0);
    const bkuPenerimaan = bkuList.filter((tx) => tx.jenis === 'PENERIMAAN').reduce((s, tx) => s + (tx.penerimaan || 0), 0);

    assert.strictEqual(totalKwitansi, school.totalAnggaran, 'Total kwitansi must equal SMPN 3 pagu (280.000.000)');
    assert.strictEqual(bkuPengeluaran, school.totalAnggaran, 'BKU pengeluaran must equal 280.000.000');
    assert.strictEqual(bkuPenerimaan, 280000000, 'BKU penerimaan must equal 280.000.000');
    assert.strictEqual(bkuList[bkuList.length - 1].saldo, 0, 'Final BKU saldo must be 0');
    assert.strictEqual(bkbRecords[bkbRecords.length - 1].saldo, 0, 'Final BKB saldo must be 0');
    assert.strictEqual(bktRecords[bktRecords.length - 1].saldo, 0, 'Final BKT saldo must be 0');

    // INVARIANT 3: TIDAK ADA SALDO MINUS
    const minusBku = bkuList.find((tx) => (tx.saldo || 0) < 0);
    const minusBkb = bkbRecords.find((tx) => (tx.saldo || 0) < 0);
    const minusBkt = bktRecords.find((tx) => (tx.saldo || 0) < 0);
    assert.ok(!minusBku, 'BKU must never be minus');
    assert.ok(!minusBkb, 'BKB must never be minus');
    assert.ok(!minusBkt, 'BKT must never be minus');

    // INVARIANT 4: KWITANSI BILANGAN BULAT & HARGA KONSISTEN
    for (const kw of kwitansiList) {
      if (!kw.items) continue;
      for (const item of kw.items) {
        assert.ok(Number.isInteger(item.volume), `Volume must be integer: ${item.volume}`);
        assert.ok(Number.isInteger(item.hargaSatuan), `Harga satuan must be integer: ${item.hargaSatuan}`);
        assert.strictEqual(item.volume * item.hargaSatuan, item.jumlah, 'Volume * HargaSatuan == Jumlah');
      }
    }
  });

  // -------------------------------------------------------------
  // FIXTURE 3: SDN 5 TERPENCIL (Rp 420.000.000, 65/35, 12 Weeks, LATE TERMIN 2 DISBURSEMENT AT WEEK 11)
  // -------------------------------------------------------------
  it('Fixture 3 (SDN 5 Terpencil): Very Late Termin 2 disbursement (Week 11) forces full transaction shift without splitting', () => {
    const school: SchoolMasterData = {
      namaSekolah: 'SD NEGERI 5 TERPENCIL',
      npsn: '30405060',
      totalAnggaran: 420000000,
      termin1Nilai: 273000000,
      termin2Nilai: 147000000,
      termin1Persen: 65,
      termin2Persen: 35,
      termin1Tanggal: '01/07/2026',
      // CRITICAL: Termin 2 disbursed very late on Week 11 (22 September 2026)!
      termin2Tanggal: '22/09/2026',
      periodePenggunaan: '01 Juli 2026 s/d 30 September 2026',
      tahunAnggaran: '2026',
      kabKota: 'KABUPATEN NDUGA',
      provinsi: 'PAPUA PEGUNUNGAN',
      namaBank: 'Bank Papua',
      nomorRekening: '500-112-9988',
      namaRekening: 'LPJ SDN 5 TERPENCIL',
      namaKepalaSekolah: 'Yohanes Kogoya, S.Pd',
      nipKepalaSekolah: '197808152002121004',
      namaBendahara: 'Matius Wenda, S.Pd',
      nipBendahara: '198811202015021002',
    };

    // 12 weeks schedule
    const progressWeeks: ProjectProgressWeek[] = Array.from({ length: 12 }, (_, i) => {
      const wNum = i + 1;
      const startDay = 1 + (i % 4) * 7;
      const monthNum = 7 + Math.floor(i / 4);
      const mStr = String(monthNum).padStart(2, '0');
      const sDayStr = String(startDay).padStart(2, '0');
      const eDayStr = String(startDay + 6).padStart(2, '0');
      const bobot = Math.round((100 / 12) * 100) / 100;
      return {
        id: `w-${wNum}`,
        mingguKe: wNum,
        bobot,
        bobotRealisasi: bobot,
        cumulativeProgress: Math.min(100, Math.round((wNum / 12) * 100)),
        startDate: `2026-${mStr}-${sDayStr}`,
        endDate: `2026-${mStr}-${eDayStr}`,
        status: 'COMPLETE',
      };
    });

    const stores: StoreVendor[] = [
      { id: 'store-nduga-1', namaToko: 'TB Sentosa Papua', pemilikNama: 'Ahmad Sentosa', pekerjaan: 'Bahan Konstruksi', alamat: 'Nduga', kategori: 'MATERIAL' },
      { id: 'store-nduga-2', namaToko: 'UD Kayu Rimba', pemilikNama: 'Paulus Telenggen', pekerjaan: 'Kusen Kayu & Perabot', alamat: 'Nduga', kategori: 'PERABOT' },
      { id: 'store-nduga-3', namaToko: 'Mitra Perlengkapan K3', pemilikNama: 'Samuel Murib', pekerjaan: 'Alat K3 & Cetak', alamat: 'Wamena', kategori: 'SMKK' },
    ];

    const workers: WorkerItem[] = [
      { id: 'w1', nama: 'Elieser', role: 'Tukang', tarifHarian: 140000, jumlahHari: 6, subtotal: 840000 },
      { id: 'w2', nama: 'Markus', role: 'Tukang', tarifHarian: 140000, jumlahHari: 6, subtotal: 840000 },
      { id: 'w3', nama: 'Simon', role: 'Tukang', tarifHarian: 140000, jumlahHari: 6, subtotal: 840000 },
      { id: 'w4', nama: 'Lukas', role: 'Pekerja', tarifHarian: 115000, jumlahHari: 6, subtotal: 690000 },
      { id: 'w5', nama: 'Yafet', role: 'Pekerja', tarifHarian: 115000, jumlahHari: 6, subtotal: 690000 },
    ];

    const terpencilSchoolData: RealSchoolData = {
      ...defaultRealSchoolData,
      totalNilaiRab: 420000000,
      divisions: [
        {
          id: 'div-ter-1',
          kode: 'I',
          uraian: 'Pekerjaan Persiapan & SMKK',
          bobot: 6,
          items: [
            { id: 'it-t1', uraian: 'Papan Nama Proyek & Dokumentasi', volume: 1, satuan: 'Ls', hargaSatuan: 5200000, jumlah: 5200000, kategoriBiaya: 'CETAK' },
            { id: 'it-t2', uraian: 'Pengadaan SMKK dan APD Lengkap', volume: 1, satuan: 'Ls', hargaSatuan: 20000000, jumlah: 20000000, kategoriBiaya: 'SMKK' },
          ],
        },
        {
          id: 'div-ter-2',
          kode: 'II',
          uraian: 'Pekerjaan Pasangan Dinding & Plesteran',
          bobot: 44,
          items: [
            { id: 'it-t3', uraian: 'Semen Portland PCC 50kg', volume: 1000, satuan: 'Zak', hargaSatuan: 85000, jumlah: 85000000, kategoriBiaya: 'BAHAN' },
            { id: 'it-t4', uraian: 'Pasir Beton Ayak Bersih', volume: 150, satuan: 'm³', hargaSatuan: 300000, jumlah: 45000000, kategoriBiaya: 'BAHAN' },
            { id: 'it-t5', uraian: 'Upah Tenaga Pasangan Dinding', volume: 385, satuan: 'OH', hargaSatuan: 140000, jumlah: 53900000, kategoriBiaya: 'UPAH' },
          ],
        },
        {
          id: 'div-ter-3',
          kode: 'III',
          uraian: 'Pekerjaan Rangka Atap & Penutup Seng',
          bobot: 30,
          items: [
            { id: 'it-t6', uraian: 'Kayu Balok & Kaso Rangka Atap', volume: 800, satuan: 'btg', hargaSatuan: 60000, jumlah: 48000000, kategoriBiaya: 'BAHAN' },
            { id: 'it-t7', uraian: 'Atap Seng Gelombang BJLS', volume: 300, satuan: 'Lembar', hargaSatuan: 150000, jumlah: 45000000, kategoriBiaya: 'BAHAN' },
            { id: 'it-t8', uraian: 'Upah Tenaga Rangka Atap', volume: 235, satuan: 'OH', hargaSatuan: 140000, jumlah: 32900000, kategoriBiaya: 'UPAH' },
          ],
        },
        {
          id: 'div-ter-4',
          kode: 'IV',
          uraian: 'Pekerjaan Kusen & Pintu Mebeler',
          bobot: 20,
          items: [
            { id: 'it-t9', uraian: 'Kusen dan Daun Pintu Kayu Kamper', volume: 20, satuan: 'Unit', hargaSatuan: 2750000, jumlah: 55000000, isBarangPabrikasi: true, kategoriBiaya: 'PERABOT' },
            { id: 'it-t10', uraian: 'Upah Pasang Kusen & Pintu', volume: 214, satuan: 'OH', hargaSatuan: 140000, jumlah: 30000000, kategoriBiaya: 'UPAH' },
          ],
        },
      ],
    };

    let kwitansiList: KwitansiDocument[] = [];
    let wageReports: any[] = [];
    let bkbList: any[] = [];

    // Generate weeks 1 to 12
    for (let wNum = 1; wNum <= 12; wNum++) {
      const weekObj = progressWeeks.find((w) => w.mingguKe === wNum)!;
      const res = generateWeeklyTransactionsFromProgressAndRealData({
        targetWeek: wNum,
        weekObj,
        weeksToUse: progressWeeks,
        school,
        workers,
        stores,
        rpdItems: [],
        realSchoolData: terpencilSchoolData,
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
      realSchoolData: terpencilSchoolData,
      kwitansiList,
      wageReports,
      stores,
      progressWeeks,
    });
    kwitansiList = recons.updatedKwitansiList;

    // INVARIANT 3 TEST: Check cashflow shifting to Week 11
    const shiftResult = alignAndShiftTransactionsForCashflow({
      kwitansiList,
      school,
      progressWeeks,
      termin2DisbursementDate: '2026-09-22',
      termin2WeekNumber: 11,
    });

    kwitansiList = shiftResult.shiftedKwitansiList;

    // Assert that transactions that exceeded Termin 1 were shifted to Week 11
    if (shiftResult.hasShiftedTransactions) {
      assert.ok(shiftResult.shiftedCount > 0, 'Transactions exceeding T1 were shifted');
      shiftResult.shiftedTransactionDetails.forEach((dt) => {
        assert.strictEqual(dt.newWeek, 11, `Shifted transaction ${dt.noBukti} must be shifted to Week 11`);
      });
    }

    // Generate BKU from shifted kwitansis
    const bkuList = calculateBkuFromTransactions(
      kwitansiList,
      school,
      [],
      progressWeeks,
      [],
      wageReports,
      12,
      stores,
      bkbList
    );

    // Generate BKB and BKT
    const bkbRecords = syncBkbFromBku(bkuList, school, progressWeeks);
    const bktRecords = calculateIntegratedBkt(bkuList, bkbRecords, school, progressWeeks);

    // INVARIANT 1: Total nominal kwitansi == BKU pengeluaran == 420.000.000
    const totalKwitansi = kwitansiList.reduce((s, k) => s + (k.nominal || 0), 0);
    const bkuPengeluaran = bkuList.filter((tx) => tx.jenis === 'PENGELUARAN').reduce((s, tx) => s + (tx.pengeluaran || 0), 0);
    const bkuPenerimaan = bkuList.filter((tx) => tx.jenis === 'PENERIMAAN').reduce((s, tx) => s + (tx.penerimaan || 0), 0);

    assert.strictEqual(totalKwitansi, 420000000, 'Total kwitansi must equal 420.000.000');
    assert.strictEqual(bkuPengeluaran, 420000000, 'BKU pengeluaran must equal 420.000.000');
    assert.strictEqual(bkuPenerimaan, 420000000, 'BKU penerimaan must equal 420.000.000');
    assert.strictEqual(bkuList[bkuList.length - 1].saldo, 0, 'Final BKU saldo must be 0');
    assert.strictEqual(bkbRecords[bkbRecords.length - 1].saldo, 0, 'Final BKB saldo must be 0');
    assert.strictEqual(bktRecords[bktRecords.length - 1].saldo, 0, 'Final BKT saldo must be 0');

    // INVARIANT 3: TIDAK ADA SALDO MINUS EVEN WITH VERY LATE TERMIN 2
    const minusBku = bkuList.find((tx) => (tx.saldo || 0) < 0);
    const minusBkb = bkbRecords.find((tx) => (tx.saldo || 0) < 0);
    const minusBkt = bktRecords.find((tx) => (tx.saldo || 0) < 0);
    assert.ok(!minusBku, `BKU must never be minus during late Termin 2: ${minusBku?.saldo} on ${minusBku?.tanggal}`);
    assert.ok(!minusBkb, `BKB must never be minus during late Termin 2: ${minusBkb?.saldo} on ${minusBkb?.tanggal}`);
    assert.ok(!minusBkt, `BKT must never be minus during late Termin 2: ${minusBkt?.saldo} on ${minusBkt?.tanggal}`);

    // DATES ON KWITANSI, BKU, BKT MUST BE 100% IDENTICAL
    kwitansiList.forEach((kw) => {
      const bkuTx = bkuList.find((b) => b.kwitansiIdRef === kw.id || b.noBukti === kw.noBukti);
      if (bkuTx) {
        assert.strictEqual(
          bkuTx.tanggal,
          kw.tanggal,
          `Date on Kwitansi (${kw.tanggal}) and BKU (${bkuTx.tanggal}) must match 100% for ${kw.noBukti}`
        );
      }
      const bktTx = bktRecords.find((b) => b.kwitansiIdRef === kw.id || b.noBukti === kw.noBukti);
      if (bktTx) {
        assert.strictEqual(
          bktTx.tanggal,
          kw.tanggal,
          `Date on Kwitansi (${kw.tanggal}) and BKT (${bktTx.tanggal}) must match 100% for ${kw.noBukti}`
        );
      }
    });

    // INVARIANT 4: KWITANSI BILANGAN BULAT & HARGA KONSISTEN
    for (const kw of kwitansiList) {
      if (!kw.items) continue;
      for (const item of kw.items) {
        assert.ok(Number.isInteger(item.volume), `Volume must be integer: ${item.volume}`);
        assert.ok(Number.isInteger(item.hargaSatuan), `Harga satuan must be integer: ${item.hargaSatuan}`);
        assert.strictEqual(item.volume * item.hargaSatuan, item.jumlah, 'Volume * HargaSatuan == Jumlah');
      }
    }

    // Ledger Invariant Verification
    const ledgerInv = validateCashLedgerInvariants(bkuList, bkbRecords, bktRecords, kwitansiList);
    assert.ok(ledgerInv.isSatisfied, `Ledger invariants must be satisfied. Violations: ${ledgerInv.violations.join('; ')}`);
  });
});
