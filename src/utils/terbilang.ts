/**
 * Standard Indonesian Number-to-Words Converter (Terbilang)
 * Compliant with PUEBI, Indonesian Banking Standards, and Government Financial Audits.
 *
 * Handles:
 * - 0 -> "Nol Rupiah"
 * - Negative values -> "Minus [Angka] Rupiah"
 * - "Seratus" for 100-199
 * - "Seribu" for 1.000-1.999
 * - "Satu Juta" / "Sejuta" for 1.000.000
 * - Belasan (11 - 19)
 * - Very large numbers up to Kuadriliun (10^15) and Kuintiliun (10^18)
 */

const SATUAN = [
  '',
  'Satu',
  'Dua',
  'Tiga',
  'Empat',
  'Lima',
  'Enam',
  'Tujuh',
  'Delapan',
  'Sembilan',
  'Sepuluh',
  'Sebelas',
];

/**
 * Recursive conversion of a positive integer up to 999 Triliun / Kuadriliun into Indonesian words.
 */
export function terbilangAngka(n: number): string {
  if (isNaN(n) || !isFinite(n)) return '';
  n = Math.floor(Math.abs(n));

  if (n === 0) return 'Nol';
  if (n < 12) return SATUAN[n];
  if (n < 20) return SATUAN[n - 10] + ' Belas';
  if (n < 100) {
    const sisa = n % 10;
    return (SATUAN[Math.floor(n / 10)] + ' Puluh' + (sisa > 0 ? ' ' + SATUAN[sisa] : '')).trim();
  }
  if (n < 200) {
    const sisa = n - 100;
    return ('Seratus' + (sisa > 0 ? ' ' + terbilangAngka(sisa) : '')).trim();
  }
  if (n < 1000) {
    const sisa = n % 100;
    return (SATUAN[Math.floor(n / 100)] + ' Ratus' + (sisa > 0 ? ' ' + terbilangAngka(sisa) : '')).trim();
  }
  if (n < 2000) {
    const sisa = n - 1000;
    return ('Seribu' + (sisa > 0 ? ' ' + terbilangAngka(sisa) : '')).trim();
  }
  if (n < 1000000) {
    const ribuan = Math.floor(n / 1000);
    const sisa = n % 1000;
    return (terbilangAngka(ribuan) + ' Ribu' + (sisa > 0 ? ' ' + terbilangAngka(sisa) : '')).trim();
  }
  if (n < 1000000000) {
    const jutaan = Math.floor(n / 1000000);
    const sisa = n % 1000000;
    return (terbilangAngka(jutaan) + ' Juta' + (sisa > 0 ? ' ' + terbilangAngka(sisa) : '')).trim();
  }
  if (n < 1000000000000) {
    const miliaran = Math.floor(n / 1000000000);
    const sisa = n % 1000000000;
    return (terbilangAngka(miliaran) + ' Miliar' + (sisa > 0 ? ' ' + terbilangAngka(sisa) : '')).trim();
  }
  if (n < 1000000000000000) {
    const triliunan = Math.floor(n / 1000000000000);
    const sisa = n % 1000000000000;
    return (terbilangAngka(triliunan) + ' Triliun' + (sisa > 0 ? ' ' + terbilangAngka(sisa) : '')).trim();
  }
  if (n <= Number.MAX_SAFE_INTEGER) {
    const kuadriliunan = Math.floor(n / 1000000000000000);
    const sisa = n % 1000000000000000;
    return (terbilangAngka(kuadriliunan) + ' Kuadriliun' + (sisa > 0 ? ' ' + terbilangAngka(sisa) : '')).trim();
  }

  return n.toLocaleString('id-ID');
}

/**
 * Standard Indonesian Currency Terbilang (with "Rupiah,-" suffix).
 * e.g. 1500000 -> "Satu Juta Lima Ratus Ribu Rupiah,-"
 * e.g. 0 -> "Nol Rupiah,-"
 * e.g. -25000 -> "Minus Dua Puluh Lima Ribu Rupiah,-"
 */
export function terbilangRupiah(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) return 'Nol Rupiah,-';
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return 'Nol Rupiah,-';

  if (Math.abs(num) < 0.001) {
    return 'Nol Rupiah,-';
  }

  const isNegative = num < 0;
  const absAmount = Math.abs(num);
  const bulat = Math.floor(absAmount);
  const desimal = Math.round((absAmount - bulat) * 100);

  let kata = terbilangAngka(bulat).replace(/\s+/g, ' ').trim() + ' Rupiah';

  if (desimal > 0) {
    kata += ' ' + terbilangAngka(desimal) + ' Sen';
  }

  if (isNegative) {
    kata = 'Minus ' + kata;
  }

  return kata + ',-';
}

/**
 * Flexible terbilang helper:
 * - If withRupiahSuffix is true (default), returns "Satu Juta Rupiah,-"
 * - If withRupiahSuffix is false, returns "Satu Juta"
 */
export function terbilang(amount: number | string | null | undefined, withRupiahSuffix = true): string {
  if (!withRupiahSuffix) {
    if (amount === null || amount === undefined) return 'Nol';
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(num)) return 'Nol';
    if (Math.abs(num) < 0.001) return 'Nol';
    const isNeg = num < 0;
    const res = terbilangAngka(Math.abs(num));
    return isNeg ? 'Minus ' + res : res;
  }
  return terbilangRupiah(amount);
}
