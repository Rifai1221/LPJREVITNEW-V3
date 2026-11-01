import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  consolidateAndStandardizeReceiptItems,
  getProjectStoreItemUnitPrice,
  clearProjectStorePriceCache,
} from '../src/services/generator/kwitansiGenerator';
import { calculateBkuFromTransactions, calculateBktFromBku } from '../src/services/generator/bkuGenerator';
import { syncBkbFromBku } from '../src/services/cashLedgerIntegrationService';
import { initialProgressWeeks, initialStores } from '../src/data/initialData';

describe('Kwitansi & BKT New Rules Unit Tests', () => {
  it('(a) no duplicate item rows in a single receipt', () => {
    const rawItems = [
      { namaBarang: 'Semen Portland (PC)', volume: 10, satuan: 'Zak', hargaSatuan: 70000, jumlah: 700000 },
      { namaBarang: 'Semen Portland (PC)', volume: 5, satuan: 'Zak', hargaSatuan: 70000, jumlah: 350000 },
      { namaBarang: 'Pasir Pasang', volume: 2, satuan: 'm³', hargaSatuan: 220000, jumlah: 440000 },
    ];
    const consolidated = consolidateAndStandardizeReceiptItems(rawItems);
    const semenItems = consolidated.filter(i => /semen/i.test(i.namaBarang));
    assert.strictEqual(semenItems.length, 1, 'There must be no duplicate item rows for Semen in the same receipt');
  });

  it('(b) price of the same item from the same store is consistent across receipts', () => {
    clearProjectStorePriceCache();
    const store = 'TB Sentosa Jaya';
    const item1 = 'Semen Portland (PC)';
    const price1 = getProjectStoreItemUnitPrice(store, item1, 72500);
    const price2 = getProjectStoreItemUnitPrice(store, item1, 80000); // Different raw input, should return cached price

    assert.strictEqual(price1, price2, 'Price of the same item from the same store must be consistent across receipts');
  });

  it('(c) volume is integer and jumlah = volume * harga with no zero items', () => {
    const rawItems = [
      { namaBarang: 'Bata Ringan Hebel', volume: 100.4, satuan: 'bh', hargaSatuan: 9500, jumlah: 953800 },
      { namaBarang: 'Paku Campuran', volume: 1, satuan: 'Kg', hargaSatuan: 21500, jumlah: 21500 },
    ];
    const consolidated = consolidateAndStandardizeReceiptItems(rawItems);
    for (const item of consolidated) {
      assert.strictEqual(Number.isInteger(item.volume), true, 'Volume must be integer');
      assert.strictEqual(item.jumlah, item.volume * item.hargaSatuan, 'jumlah must equal volume * harga');
      assert.ok(item.jumlah > 0, 'No zero amounts allowed');
      assert.ok(item.volume > 0, 'No zero volume allowed');
    }
  });

  it('(d) BKT numbers are unique between income and withdrawal', () => {
    const school = {
      namaSekolah: 'SDN 1 TEST',
      totalAnggaran: 100000000,
      termin1Nilai: 70000000,
      termin2Nilai: 30000000,
      tahunAnggaran: '2026',
    };
    const bkuList = calculateBkuFromTransactions([], school as any, [], initialProgressWeeks, [], [], 14, initialStores, []);
    const bkbList = syncBkbFromBku(bkuList, school as any, initialProgressWeeks);
    const bktList = calculateBktFromBku(bkuList, bkbList);

    const bkuPenerimaanBukti = bkuList.filter(b => b.jenis === 'PENERIMAAN').map(b => b.noBukti);
    const bkbWithdrawalBukti = bkbList.filter(b => b.kategori === 'TARIK_TUNAI').map(b => b.noBukti);

    for (const p of bkuPenerimaanBukti) {
      for (const w of bkbWithdrawalBukti) {
        assert.notStrictEqual(p, w, `Income BKT number (${p}) must not collide with withdrawal BKT number (${w})`);
      }
    }
  });
});
