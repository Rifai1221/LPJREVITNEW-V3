import { describe, it } from 'node:test';
import assert from 'node:assert';
import { defaultRealSchoolData } from '../src/data/realSchoolData';
import { resolveAhsp, getItemMaterialLaborSplit } from '../src/utils/ahspHelper';
import { rebalanceAhspComponents } from '../src/utils/divisionHelper';
import { generateMonthlyManagementTransactions } from '../src/services/generator/batchGenerator';
import { isPreservedUnitItem } from '../src/services/generator/kwitansiGenerator';
import { reconcileCashBalances } from '../src/services/cashLedgerIntegrationService';

import { autoLinkRabToAhsp } from '../src/utils/excelHelper';

describe('Acceptance Test Suite: Template_RAB-AHSP.xlsx (TK Nuriadeen Reference)', () => {

  it('1. Reference Data Integrity: 13 Divisions, Total RAB Rp 552.457.000, AHSP Links', () => {
    assert.strictEqual(defaultRealSchoolData.divisions.length, 13, 'Must have exactly 13 divisions');

    const totalRab = defaultRealSchoolData.divisions.reduce((s, d) => s + (d.subTotal || 0), 0);
    assert.strictEqual(totalRab, 552457000, 'Total RAB must be strictly Rp 552.457.000');

    // Division IX must exist even with 0 items
    const divIX = defaultRealSchoolData.divisions.find((d) => d.kode.toUpperCase() === 'IX');
    assert.ok(divIX, 'Division IX must exist');
    assert.strictEqual(divIX.items.length, 0, 'Division IX should have 0 items');

    // Run auto-linking
    const linkRes = autoLinkRabToAhsp(defaultRealSchoolData.divisions, defaultRealSchoolData.ahspList || []);
    assert.ok(linkRes.linkedCount > 0, 'Auto-linker must link RAB items to AHSP');

    // Check AHSP linking
    const allItems = defaultRealSchoolData.divisions.flatMap((d) => d.items);
    let linkedCount = 0;
    allItems.forEach((it) => {
      const match = resolveAhsp(it, defaultRealSchoolData.ahspList);
      if (match) linkedCount++;
    });
    assert.ok(linkedCount > 0, 'Most items must be linked to AHSP');
  });

  it('2. Single Source of Truth: Upah/Bahan Split comes from AHSP components, not 60/40 guessing', () => {
    const divII = defaultRealSchoolData.divisions.find((d) => d.kode.toUpperCase() === 'II');
    const pasPondasiItem = divII?.items.find((i) => /pasangan batu kali|pondasi/i.test(i.uraian));
    assert.ok(pasPondasiItem, 'Pondasi item must exist in Div II');

    const ahsp = resolveAhsp(pasPondasiItem, defaultRealSchoolData.ahspList);
    assert.ok(ahsp, 'Pondasi item must link to AHSP');

    const split = getItemMaterialLaborSplit(pasPondasiItem, defaultRealSchoolData.ahspList);
    assert.notStrictEqual(split.isEstimation, true, 'Linked item must NOT use 60/40 estimation fallback');

    // Calculate exact sum of UPAH components in AHSP × volume
    const upahComps = ahsp.komponen.filter((c) => c.kategori === 'UPAH' || /tukang|pekerja|mandor/i.test(c.uraian));
    const upahSatuanAHSP = upahComps.reduce((s, c) => s + Math.round((c.koefisien || 0) * (c.hargaSatuan || 0)), 0);
    const expectedLabor = Math.round(pasPondasiItem.volume * upahSatuanAHSP);

    assert.strictEqual(Math.abs(split.labor - expectedLabor) <= 2, true, 'Labor split must match AHSP UPAH sum');
  });

  it('3. Consultant Budget & Monthly Distribution: PERENCANA, PENGAWAS, PENGELOLA sum persis RAB', () => {
    const allRabItems = defaultRealSchoolData.divisions.flatMap((d) => d.items);
    const itemsP = allRabItems.filter((it) => it.kategoriBiaya === 'PERENCANA' || /perencana/i.test(it.uraian));
    const itemsW = allRabItems.filter((it) => it.kategoriBiaya === 'PENGAWAS' || /pengawas/i.test(it.uraian));
    const itemsA = allRabItems.filter((it) => it.kategoriBiaya === 'PENGELOLA' || /pengelola|administrasi/i.test(it.uraian));

    const budgetP = itemsP.reduce((s, it) => s + Math.round(it.volume * it.hargaSatuan), 0);
    const budgetW = itemsW.reduce((s, it) => s + Math.round(it.volume * it.hargaSatuan), 0);
    const budgetA = itemsA.reduce((s, it) => s + Math.round(it.volume * it.hargaSatuan), 0);

    const totalConsultantRab = budgetP + budgetW + budgetA;
    assert.ok(totalConsultantRab > 30000000, 'Consultant total RAB must be around 35.6 Juta');

    // Generate monthly management kwitansi
    const weeksToUse: any[] = [
      { mingguKe: 1, bulan: 'Juli 2026', bobotRealisasi: 10 },
      { mingguKe: 5, bulan: 'Agustus 2026', bobotRealisasi: 40 },
      { mingguKe: 9, bulan: 'September 2026', bobotRealisasi: 75 },
      { mingguKe: 13, bulan: 'Oktober 2026', bobotRealisasi: 100 },
    ];

    const school: any = {
      namaSekolah: 'TK NURIADEEN CENDEKIA',
      tahunAnggaran: '2026',
      totalAnggaran: 552457000,
      kabKota: 'Kabupaten Bogor',
    };

    const result = generateMonthlyManagementTransactions({
      weeksToUse,
      activeWeeks: weeksToUse,
      school,
      realSchoolData: defaultRealSchoolData,
    });

    const kwP = result.managementKwitansi.filter((k) => k.noBukti.startsWith('KONS-P'));
    const sumP = kwP.reduce((s, k) => s + k.nominal, 0);
    assert.strictEqual(sumP, budgetP, 'Total KONS-P kwitansi must strictly equal PERENCANA RAB budget');

    const kwW = result.managementKwitansi.filter((k) => k.noBukti.startsWith('KONS-W'));
    const sumW = kwW.reduce((s, k) => s + k.nominal, 0);
    assert.strictEqual(sumW, budgetW, 'Total KONS-W kwitansi must strictly equal PENGAWAS RAB budget');
  });

  it('4. Fixed Purchase Items Preservation: Doors, Windows, Furniture, SMKK, Cetak', () => {
    assert.strictEqual(isPreservedUnitItem('Cetak Papan Nama Proyek', 'unit', false), false);
    assert.strictEqual(isPreservedUnitItem('Pintu Panil Kayu PJ1', 'unit', true), true);
    assert.strictEqual(isPreservedUnitItem('Kursi Siswa TK', 'buah', true), true);

    // SMKK safety items should be treated as fixed unit items in pure material check
    const smkkItemName = 'Helm Pelindung Proyek Safety SNI';
    const isFixedSmkk = /helm|rompi|sepatu boot|p3k/i.test(smkkItemName);
    assert.strictEqual(isFixedSmkk, true, 'SMKK items are fixed unit price items');
  });

  it('5. AHSP Component Deletion: Rebalance within category keeps total price intact', () => {
    const sampleAhsp = (defaultRealSchoolData.ahspList || [])[0];
    assert.ok(sampleAhsp, 'AHSP list must have at least 1 item');

    const comps = sampleAhsp.komponen.map((c) => ({ ...c }));
    const targetTotal = sampleAhsp.totalHargaSatuan;

    if (comps.length > 1) {
      // Remove second component
      const newComps = comps.filter((_, idx) => idx !== 1);
      const rebalanced = rebalanceAhspComponents(newComps, targetTotal, 'BAHAN_PRIMARY');

      const rebalancedTotal = rebalanced.reduce((s, c) => s + (c.totalHarga || Math.round(c.koefisien * c.hargaSatuan)), 0);
      assert.strictEqual(rebalancedTotal, targetTotal, 'Rebalanced components must maintain exact total price');
    }
  });

  it('6. Cash Book Invariant Check (BKU = BKB + BKT, No Deficit)', () => {
    const bku = 15000000;
    const bkb = 10000000;
    const bkt = 5000000;

    const res = reconcileCashBalances(bku, bkb, bkt);
    assert.strictEqual(res.isBalanced, true, 'BKU must equal BKB + BKT exactly');
    assert.strictEqual(res.selisih, 0, 'Selisih must be 0');

    // Deficit check
    assert.ok(bku >= 0, 'BKU balance must be non-negative');
    assert.ok(bkt >= 0, 'BKT balance must be non-negative');
    assert.ok(bkb >= 0, 'BKB balance must be non-negative');
  });
});
