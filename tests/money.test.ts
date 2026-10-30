import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  toRupiah,
  addRupiah,
  subRupiah,
  mulRupiah,
  divRupiah,
  percentRupiah,
  calcDppAndPpn,
  calcPph22,
  calcPph23,
  splitProportionalRupiah,
  calcItemJumlah,
} from '../src/utils/money';
import { terbilang, terbilangRupiah } from '../src/utils/terbilang';
import { getFiscalConfig, FISCAL_YEAR_CONFIGS } from '../src/data/fiscalTaxParameters';
import { reconcileCashBalances } from '../src/services/cashLedgerIntegrationService';
import {
  generateSecureId,
  getNextSequenceNumber,
  isVoucherNumberDuplicate,
  ensureUniqueVoucherNumber,
} from '../src/utils/idAndVoucherHelper';

describe('Financial Audit & Money Engine Unit Tests', () => {
  describe('1. Integer Rupiah Math & Sen Rounding Elimination', () => {
    it('should strictly truncate/round floats and sen to nearest whole integer rupiah', () => {
      assert.strictEqual(toRupiah(198196.22), 198196);
      assert.strictEqual(toRupiah(198196.78), 198197);
      assert.strictEqual(toRupiah(0.49), 0);
      assert.strictEqual(toRupiah(0.50), 1);
      assert.strictEqual(toRupiah(-1500.6), -1501);
    });

    it('should safely handle empty, null, and NaN inputs gracefully without crashing', () => {
      assert.strictEqual(toRupiah(null), 0);
      assert.strictEqual(toRupiah(undefined), 0);
      assert.strictEqual(toRupiah(NaN), 0);
      assert.strictEqual(toRupiah(''), 0);
      assert.strictEqual(toRupiah('invalid-str'), 0);
      assert.strictEqual(addRupiah(null, undefined, 5000), 5000);
      assert.strictEqual(subRupiah(undefined, 1000), -1000);
    });

    it('should accurately calculate item subtotal as integer rupiah', () => {
      // 4 Zak Semen @ Rp 73.000 = Rp 292.000 (not Rp 12.145.545!)
      const subtotalSemen = calcItemJumlah(4, 73000);
      assert.strictEqual(subtotalSemen, 292000);

      // 1 Kg Paku @ Rp 25.000 = Rp 25.000 (not Rp 894.278!)
      const subtotalPaku = calcItemJumlah(1, 25000);
      assert.strictEqual(subtotalPaku, 25000);

      // Fractional volume (e.g. 3.5 m3 pasir @ Rp 180.000)
      const subtotalPasir = calcItemJumlah(3.5, 180000);
      assert.strictEqual(subtotalPasir, 630000);
    });
  });

  describe('2. Material Receipt with PPN & PPh 22 (Inclusive DPP + PPN exact sum)', () => {
    it('should ensure DPP + PPN strictly equals gross receipt amount with Rp 0 drift', () => {
      // Test case: Rp 1.999.980 (previously caused 198196.22 floating point bug)
      const gross1 = 1999980;
      const tax1 = calcDppAndPpn(gross1, 11);
      assert.strictEqual(tax1.ppn + tax1.dpp, gross1, 'DPP + PPN must equal Gross exactly');
      assert.strictEqual(Number.isInteger(tax1.ppn), true);
      assert.strictEqual(Number.isInteger(tax1.dpp), true);

      // Test case: Large receipt Rp 62.453.892
      const gross2 = 62453892;
      const tax2 = calcDppAndPpn(gross2, 11);
      assert.strictEqual(tax2.ppn + tax2.dpp, gross2);
      assert.strictEqual(Number.isInteger(tax2.ppn), true);
      assert.strictEqual(Number.isInteger(tax2.dpp), true);

      // Calculate PPh 22 on DPP (1.5%)
      const pph22 = calcPph22(tax2.dpp, 1.5);
      assert.strictEqual(Number.isInteger(pph22), true);
      assert.strictEqual(pph22 > 0, true);
    });

    it('should accurately calculate PPh 23 on equipment rental and services', () => {
      const sewaAlat = 3500000;
      const pph23 = calcPph23(sewaAlat, 2);
      assert.strictEqual(pph23, 70000);
      assert.strictEqual(Number.isInteger(pph23), true);
    });
  });

  describe('3. Termin 1 (70%) and Termin 2 (30%) Sum Matching', () => {
    it('should split budget into Termin 1 and Termin 2 matching 100% total with zero drift', () => {
      const budgets = [
        100000000, // 100 Juta
        195450000, // 195.45 Juta
        2740737,   // Angka ganjil
        5,         // Angka sangat kecil
        333333333, // Angka pecahan sepertiga
      ];

      for (const total of budgets) {
        const termin1 = mulRupiah(total, 70, 100);
        const termin2 = subRupiah(total, termin1);

        assert.strictEqual(
          termin1 + termin2,
          total,
          `Termin 1 (${termin1}) + Termin 2 (${termin2}) must exactly equal Total (${total})`
        );
        assert.strictEqual(Number.isInteger(termin1), true);
        assert.strictEqual(Number.isInteger(termin2), true);
      }
    });

    it('should distribute borongan team wages proportionally with exact sum matching target', () => {
      const targetWageBudget = 2740737;
      // 7 workers with varied AHSP base rates
      const weights = [199782, 199782, 183834, 183834, 146909, 146909, 146909];

      const allocated = splitProportionalRupiah(targetWageBudget, weights);
      const sum = allocated.reduce((s, v) => s + v, 0);

      assert.strictEqual(sum, targetWageBudget, 'Allocated wages must strictly match target budget');
      for (const wage of allocated) {
        assert.strictEqual(Number.isInteger(wage), true);
        assert.strictEqual(wage > 0, true);
      }
    });
  });

  describe('4. Cash Ledger Reconciliation Integrity (BKU = BKB + BKT)', () => {
    it('should return isBalanced: true when BKU equals BKB + BKT exactly', () => {
      const res = reconcileCashBalances(15000000, 10000000, 5000000);
      assert.strictEqual(res.isBalanced, true);
      assert.strictEqual(res.selisih, 0);
    });

    it('should strictly detect selisih even for small discrepancies without false masking', () => {
      // Previously masked by <= 1000 tolerance
      const res1 = reconcileCashBalances(1000500, 1000000, 0);
      assert.strictEqual(res1.isBalanced, false);
      assert.strictEqual(res1.selisih, 500);

      const res2 = reconcileCashBalances(999800, 1000000, 0);
      assert.strictEqual(res2.isBalanced, false);
      assert.strictEqual(res2.selisih, -200);
    });
  });

  describe('5. Terbilang Indonesian Word Conversion Edge Cases', () => {
    it('should correctly format 0 as "Nol Rupiah,-"', () => {
      assert.strictEqual(terbilangRupiah(0), 'Nol Rupiah,-');
      assert.strictEqual(terbilang(0, false), 'Nol');
    });

    it('should correctly format negative numbers with "Minus"', () => {
      assert.strictEqual(terbilangRupiah(-50000), 'Minus Lima Puluh Ribu Rupiah,-');
      assert.strictEqual(terbilang(-1500, false), 'Minus Seribu Lima Ratus');
    });

    it('should correctly format "seratus" and "seribu"', () => {
      assert.strictEqual(terbilang(100, false), 'Seratus');
      assert.strictEqual(terbilang(1000, false), 'Seribu');
      assert.strictEqual(terbilangRupiah(1000), 'Seribu Rupiah,-');
      assert.strictEqual(terbilang(1100, false), 'Seribu Seratus');
    });

    it('should correctly format "satu juta" (not sejuta)', () => {
      assert.strictEqual(terbilang(1000000, false), 'Satu Juta');
      assert.strictEqual(terbilangRupiah(1000000), 'Satu Juta Rupiah,-');
    });

    it('should correctly format belasan (11 through 19)', () => {
      assert.strictEqual(terbilang(11, false), 'Sebelas');
      assert.strictEqual(terbilang(12, false), 'Dua Belas');
      assert.strictEqual(terbilang(15, false), 'Lima Belas');
      assert.strictEqual(terbilang(19, false), 'Sembilan Belas');
    });

    it('should correctly format very large numbers up to Kuadriliun', () => {
      assert.strictEqual(terbilang(1000000000, false), 'Satu Miliar');
      assert.strictEqual(terbilang(1000000000000, false), 'Satu Triliun');
      assert.strictEqual(terbilang(1000000000000000, false), 'Satu Kuadriliun');
    });
  });

  describe('6. Cryptographic IDs and Sequential Voucher Numbering', () => {
    it('should generate secure UUID without Math.random', () => {
      const id1 = generateSecureId('kw');
      const id2 = generateSecureId('kw');
      assert.strictEqual(id1.startsWith('kw-'), true);
      assert.notStrictEqual(id1, id2);
      assert.strictEqual(id1.length > 20, true);
    });

    it('should find next sequential number from existing vouchers', () => {
      const existing = ['KW/01/2026', 'KW/02/2026', 'KW/05/2026'];
      const nextSeq = getNextSequenceNumber(existing, /KW\/(\d+)\/2026/);
      assert.strictEqual(nextSeq, 6);
    });

    it('should detect duplicate voucher numbers and ensure uniqueness', () => {
      const existingList = [
        { id: '1', noBukti: 'KW/01/2026' },
        { id: '2', noBukti: 'KW/02/2026' },
      ];

      assert.strictEqual(isVoucherNumberDuplicate('KW/01/2026', existingList), true);
      assert.strictEqual(isVoucherNumberDuplicate('KW/03/2026', existingList), false);

      const uniqueVoucher = ensureUniqueVoucherNumber('KW/01/2026', existingList);
      assert.notStrictEqual(uniqueVoucher, 'KW/01/2026');
      assert.strictEqual(isVoucherNumberDuplicate(uniqueVoucher, existingList), false);
    });
  });

  describe('7. Fiscal & Tax Configuration Repository', () => {
    it('should load default 2026 configuration with UU HPP legal references', () => {
      const config = getFiscalConfig('2026');
      assert.strictEqual(config.year, '2026');
      assert.strictEqual(config.ppnRatePercent, 11);
      assert.strictEqual(config.pph22RatePercent, 1.5);
      assert.strictEqual(config.pph23RatePercent, 2.0);
      assert.strictEqual(config.taxExemptionThreshold, 2000000);
      assert.strictEqual(config.termin1Percent, 70);
      assert.strictEqual(config.termin2Percent, 30);
      assert.strictEqual(config.legalSource.includes('UU No. 7 Tahun 2021'), true);
    });

    it('should respect custom user overrides set in Master Data', () => {
      const schoolOverride = {
        tahunAnggaran: '2026',
        customPpnRate: 12, // Future rate
        customPph22Rate: 2.0,
      };
      const resolved = getFiscalConfig(schoolOverride);
      assert.strictEqual(resolved.ppnRatePercent, 12);
      assert.strictEqual(resolved.pph22RatePercent, 2.0);
      assert.strictEqual(resolved.pph23RatePercent, 2.0); // kept default
    });
  });
});
