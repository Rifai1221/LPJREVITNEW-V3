import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  consolidateAndStandardizeReceiptItems,
  normalizeMaterialItems,
  getReconstitutedKusenPintuUnitItems,
  deduplicateKwitansiList,
} from '../src/services/generator/kwitansiGenerator';
import { defaultRealSchoolData } from '../src/data/realSchoolData';
import { generateWeeklyTransactionsFromProgressAndRealData } from '../src/services/generator/batchGenerator';
import { initialSchoolData, initialWorkers, initialRpdItems, initialProgressWeeks, initialStores } from '../src/data/initialData';
import { syncAndReconcileAll9CategoriesToBudget } from '../src/utils/projectSummaryRekapHelper';

describe('Pintu & Jendela (Fur/xx) and Manufactured Item Reconciliation', () => {
  it('consolidateAndStandardizeReceiptItems should preserve manufactured unit items and not fall back to 25000', () => {
    const rawItems = [
      {
        namaBarang: 'Pasang Pintu Utama (PJ1)',
        volume: 2,
        satuan: 'unit',
        hargaSatuan: 3612291.88,
        jumlah: 7224584,
        isBarangPabrikasi: true,
      },
      {
        namaBarang: 'Pasang Jendela Alumunium (J1)',
        volume: 10,
        satuan: 'unit',
        hargaSatuan: 3893845.59,
        jumlah: 38938456,
        isBarangPabrikasi: true,
      },
    ];

    const result = consolidateAndStandardizeReceiptItems(rawItems);
    assert.strictEqual(result.length, 2);

    const pj1 = result.find((it) => /pintu utama|pj1\b/i.test(it.namaBarang));
    const j1 = result.find((it) => !/pintu/i.test(it.namaBarang) && /jendela|\(j1\)/i.test(it.namaBarang));

    assert.ok(pj1, 'PJ1 must be present');
    assert.ok(j1, 'J1 must be present');

    assert.strictEqual(pj1.volume, 2);
    assert.strictEqual(pj1.satuan.toLowerCase(), 'unit');
    assert.notStrictEqual(pj1.hargaSatuan, 25000);
    assert.ok(pj1.hargaSatuan > 3000000, `PJ1 unit price should be millions, got: ${pj1.hargaSatuan}`);
    assert.strictEqual(pj1.jumlah, 7224584);

    assert.strictEqual(j1.volume, 10);
    assert.strictEqual(j1.satuan.toLowerCase(), 'unit');
    assert.notStrictEqual(j1.hargaSatuan, 25000);
    assert.ok(j1.hargaSatuan > 3000000, `J1 unit price should be millions, got: ${j1.hargaSatuan}`);
    assert.strictEqual(j1.jumlah, 38938456);
  });

  it('normalizeMaterialItems should not force volume to 1 or price to 25000 for manufactured items', () => {
    const rawItems = [
      {
        namaBarang: 'Pasang Pintu Utama (PJ1)',
        volume: 2,
        satuan: 'unit',
        hargaSatuan: 3612291.88,
        jumlah: 7224584,
        isBarangPabrikasi: true,
      },
      {
        namaBarang: 'Pasang Jendela Alumunium (J1)',
        volume: 10,
        satuan: 'unit',
        hargaSatuan: 3893845.59,
        jumlah: 38938456,
        isBarangPabrikasi: true,
      },
    ];

    const result = normalizeMaterialItems(rawItems);
    const pj1 = result.find((it) => /pintu utama|pj1\b/i.test(it.namaBarang));
    const j1 = result.find((it) => !/pintu/i.test(it.namaBarang) && /jendela|\(j1\)/i.test(it.namaBarang));

    assert.ok(pj1);
    assert.ok(j1);
    assert.strictEqual(pj1.volume, 2);
    assert.strictEqual(j1.volume, 10);
    assert.notStrictEqual(pj1.hargaSatuan, 25000);
    assert.notStrictEqual(j1.hargaSatuan, 25000);
  });

  it('getReconstitutedKusenPintuUnitItems should use dynamic RAB prices and volumes from realSchoolData', () => {
    const items = getReconstitutedKusenPintuUnitItems<any>([], undefined, defaultRealSchoolData);
    assert.strictEqual(items.length, 2);

    const pj1 = items.find((i) => /pintu utama|pj1\b/i.test(i.namaBarang))!;
    const j1 = items.find((i) => !/pintu/i.test(i.namaBarang) && /jendela|\(j1\)/i.test(i.namaBarang))!;

    assert.strictEqual(pj1.volume, 2);
    assert.strictEqual(pj1.satuan, 'unit');
    assert.strictEqual(pj1.isBarangPabrikasi, true);

    assert.strictEqual(j1.volume, 10);
    assert.strictEqual(j1.satuan, 'unit');
    assert.strictEqual(j1.isBarangPabrikasi, true);

    const total = pj1.jumlah + j1.jumlah;
    assert.strictEqual(total, 46163040);

    // With targetNom
    const targetNom = 46163040;
    const targetedItems = getReconstitutedKusenPintuUnitItems<any>([], targetNom, defaultRealSchoolData);
    const sumTarget = targetedItems.reduce((s, it) => s + it.jumlah, 0);
    assert.strictEqual(sumTarget, targetNom);
  });

  it('deduplicateKwitansiList should deduplicate fixed category receipts with same store and nominal', () => {
    const kwList = [
      {
        id: 'kw-1',
        noBukti: 'Fur/07/2026',
        tipe: 'PINTU_JENDELA',
        namaToko: 'CV. ALUMATAMA JAYA',
        nominal: 46163040,
        tanggal: '15/09/2026',
      },
      {
        id: 'kw-2',
        noBukti: 'Fur/01/2026',
        tipe: 'PINTU_JENDELA',
        namaToko: 'CV. ALUMATAMA JAYA',
        nominal: 46163040,
        tanggal: '10/09/2026',
      },
    ];

    const deduplicated = deduplicateKwitansiList(kwList as any);
    assert.strictEqual(deduplicated.length, 1);
    assert.strictEqual(deduplicated[0].noBukti, 'Fur/07/2026');
  });

  it('syncAndReconcileAll9CategoriesToBudget should produce Fur receipts matching RAB pagu with PJ1 and J1 items', () => {
    const school = { ...initialSchoolData, totalAnggaran: 552457000 };
    const rpdItems = initialRpdItems || [];
    const realSchoolData = defaultRealSchoolData;
    const progressWeeks = initialProgressWeeks || [];
    const stores = initialStores || [];

    const syncResult = syncAndReconcileAll9CategoriesToBudget({
      school,
      rpdItems,
      realSchoolData,
      kwitansiList: [],
      wageReports: [],
      stores,
      progressWeeks,
    });

    const furKws = syncResult.updatedKwitansiList.filter(
      (k) => (k.noBukti || '').startsWith('Fur/') || k.tipe === 'PINTU_JENDELA'
    );
    assert.ok(furKws.length >= 1, 'Should have at least 1 Fur kwitansi');

    const totalFurNominal = furKws.reduce((s, k) => s + (k.nominal || 0), 0);
    assert.strictEqual(totalFurNominal, 46163040, 'Total Fur nominal should match Division V RAB pagu exactly');

    // Check items in the Fur kwitansi
    const items = furKws.flatMap((k) => k.items || []);
    const pj1Item = items.find((it) => /pintu utama|pj1\b/i.test(it.namaBarang));
    const j1Item = items.find((it) => !/pintu/i.test(it.namaBarang) && /jendela|\(j1\)/i.test(it.namaBarang));

    assert.ok(pj1Item, 'PJ1 item must be present');
    assert.ok(j1Item, 'J1 item must be present');
    assert.strictEqual(pj1Item.volume, 2);
    assert.strictEqual(j1Item.volume, 10);
    assert.notStrictEqual(pj1Item.hargaSatuan, 25000);
    assert.notStrictEqual(j1Item.hargaSatuan, 25000);
    assert.ok(pj1Item.hargaSatuan > 3000000);
    assert.ok(j1Item.hargaSatuan > 3000000);
  });
});
