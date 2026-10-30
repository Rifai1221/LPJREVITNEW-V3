/**
 * Core Money & Currency Engine
 * Enforces integer Rupiah processing across the application.
 * Prevents floating-point decimal discrepancies, fractional cents (desimal liar),
 * and rounding mismatches in accounting records.
 */

/**
 * Normalizes any value into a clean integer Rupiah (rounded to nearest integer).
 * Handles numbers, numeric strings with Indonesian dot/comma formatting, null/undefined.
 */
export function toRupiah(val: number | string | null | undefined): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') {
    if (isNaN(val) || !isFinite(val)) return 0;
    return Math.round(val);
  }
  if (typeof val === 'string') {
    const cleanStr = val.trim();
    if (!cleanStr) return 0;
    // Handle Indonesian formatting: e.g. "Rp 1.250.000,00" or "1.250.000"
    const normalized = cleanStr
      .replace(/[^0-9,-]/g, '') // remove "Rp", dots, spaces
      .replace(',', '.');       // convert comma to decimal point
    const num = parseFloat(normalized);
    if (isNaN(num) || !isFinite(num)) return 0;
    return Math.round(num);
  }
  return 0;
}

/**
 * Safely sums an arbitrary number of amounts in integer Rupiah.
 */
export function addRupiah(...amounts: (number | string | null | undefined)[]): number {
  return amounts.reduce((acc: number, curr) => acc + toRupiah(curr), 0);
}

/**
 * Subtracts subtrahend from minuend in integer Rupiah.
 */
export function subRupiah(
  minuend: number | string | null | undefined,
  subtrahend: number | string | null | undefined
): number {
  return toRupiah(minuend) - toRupiah(subtrahend);
}

/**
 * Multiplies an amount by a multiplier (and optional divisor) and rounds to whole Rupiah.
 */
export function mulRupiah(
  amount: number | string | null | undefined,
  multiplier: number,
  divisor = 1
): number {
  const base = toRupiah(amount);
  if (base === 0 || multiplier === 0) return 0;
  return Math.round((base * multiplier) / (divisor || 1));
}

/**
 * Divides an amount by a divisor and rounds to whole Rupiah.
 */
export function divRupiah(
  amount: number | string | null | undefined,
  divisor: number
): number {
  const base = toRupiah(amount);
  if (base === 0 || divisor === 0) return 0;
  return Math.round(base / divisor);
}

/**
 * Calculates percentage of an amount in whole integer Rupiah.
 * e.g. percentRupiah(100000, 11) -> 11000
 */
export function percentRupiah(
  amount: number | string | null | undefined,
  percent: number
): number {
  const base = toRupiah(amount);
  if (base === 0 || percent === 0) return 0;
  return Math.round((base * percent) / 100);
}

/**
 * Calculates DPP (Dasar Pengenaan Pajak) and PPN from an inclusive gross amount.
 * Guarantees that dpp + ppn === inclusiveGross (no 1-rupiah discrepancy!).
 */
export function calcDppAndPpn(
  inclusiveGross: number | string | null | undefined,
  ppnRatePercent = 11
): { dpp: number; ppn: number } {
  const gross = toRupiah(inclusiveGross);
  if (gross <= 0 || ppnRatePercent <= 0) {
    return { dpp: gross, ppn: 0 };
  }
  // Formula: DPP = Gross / (1 + PPN%) = (Gross * 100) / (100 + PPN%)
  const dpp = Math.round((gross * 100) / (100 + ppnRatePercent));
  const ppn = gross - dpp; // Exact balance guarantee
  return { dpp, ppn };
}

/**
 * Calculates PPh 22 on DPP (1.5% for government procurement with NPWP).
 */
export function calcPph22(
  dpp: number | string | null | undefined,
  pph22RatePercent = 1.5
): number {
  const baseDpp = toRupiah(dpp);
  if (baseDpp <= 0 || pph22RatePercent <= 0) return 0;
  return Math.round((baseDpp * pph22RatePercent) / 100);
}

/**
 * Calculates PPh 23 on gross service/rental value (2% for services with NPWP).
 */
export function calcPph23(
  grossServiceAmount: number | string | null | undefined,
  pph23RatePercent = 2.0
): number {
  const base = toRupiah(grossServiceAmount);
  if (base <= 0 || pph23RatePercent <= 0) return 0;
  return Math.round((base * pph23RatePercent) / 100);
}

/**
 * Splits an amount proportionally across ratios, ensuring the sum of portions
 * matches the original total down to the single integer Rupiah.
 */
export function splitProportionalRupiah(
  totalAmount: number | string | null | undefined,
  weights: number[]
): number[] {
  const total = toRupiah(totalAmount);
  if (total <= 0 || weights.length === 0) {
    return weights.map(() => 0);
  }

  const sumWeights = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (sumWeights <= 0) {
    const even = divRupiah(total, weights.length);
    const result = weights.map(() => even);
    const diff = total - addRupiah(...result);
    if (result.length > 0) result[0] += diff;
    return result;
  }

  let allocated = 0;
  const portions = weights.map((w, idx) => {
    if (idx === weights.length - 1) {
      return total - allocated; // Remainder absorber
    }
    const share = Math.round((total * Math.max(0, w)) / sumWeights);
    allocated += share;
    return share;
  });

  return portions;
}

/**
 * Safe calculation of a line item total: volume * unitPrice.
 */
export function calcItemJumlah(volume: number, hargaSatuan: number): number {
  if (!volume || volume <= 0 || !hargaSatuan || hargaSatuan <= 0) return 0;
  return Math.round(volume * hargaSatuan);
}
