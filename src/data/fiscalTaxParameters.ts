/**
 * Fiscal & Tax Parameters Configuration
 * Centralized, versioned, and year-specific parameter repository.
 * Replaces all hardcoded percentages (PPN, PPh 22, PPh 23, Termin 1 & 2).
 *
 * Catatan Aturan Hukum & Dasar Regulasi:
 * - PPN 11%: UU No. 7 Tahun 2021 tentang Harmonisasi Peraturan Perpajakan (UU HPP) Bab IV Pasal 7 ayat (1) huruf a,
 *   berlaku efektif sejak 1 April 2022. Ketentuan tarif 12% berlaku paling lambat 1 Januari 2025 sesuai keputusan pemerintah.
 * - PPh Pasal 22 (1.5%): PMK No. 59/PMK.03/2022 atas pembelian barang oleh instansi pemerintah dengan nilai bruto > Rp 2.000.000 (tidak termasuk PPN).
 * - PPh Pasal 23 (2%): UU PPh Pasal 23 ayat (1) huruf c atas imbalan jasa dan sewa peralatan oleh badan/orang pribadi ber-NPWP.
 * - Termin Penyaluran DAK Fisik Bidang Pendidikan: PMK No. 198/PMK.07/2021 tentang Pengelolaan DAK Fisik (Termin 1: 70%, Termin 2: 30%).
 */

export interface FiscalTaxConfig {
  year: string;
  versionName: string;
  ppnRatePercent: number;
  pph22RatePercent: number;
  pph23RatePercent: number;
  taxExemptionThreshold: number; // e.g. Rp 2.000.000 (di bawah nilai ini bebas pungut PPh 22 / PPN bendahara)
  termin1Percent: number;
  termin2Percent: number;
  initialCashWithdrawalPercent: number; // e.g. 35% penarikan tunai awal operasional
  legalSource: string;
  effectiveDate: string;
  notes: string;
  userVerificationPrompt: string;
}

export const FISCAL_YEAR_CONFIGS: Record<string, FiscalTaxConfig> = {
  '2026': {
    year: '2026',
    versionName: 'TA 2026 - Standar Revitalisasi Sekolah (UU HPP & PMK 59)',
    ppnRatePercent: 11,
    pph22RatePercent: 1.5,
    pph23RatePercent: 2.0,
    taxExemptionThreshold: 2000000,
    termin1Percent: 70,
    termin2Percent: 30,
    initialCashWithdrawalPercent: 35,
    legalSource: 'UU No. 7 Tahun 2021 (UU HPP) & PMK No. 59/PMK.03/2022',
    effectiveDate: '01 Januari 2026',
    notes: 'Tarif PPN 11% digunakan sebagai standar aman. Batas minimum pengenaan pajak belanja bendahara adalah Rp 2.000.000. Belanja di bawah Rp 2.000.000 tidak dikenakan pungut PPN/PPh 22.',
    userVerificationPrompt: 'Harap verifikasi tarif PPN & PPh terkini dengan Kantor Pelayanan Pajak (KPP) setempat atau Dinas Pendidikan sebelum pelaporan final.',
  },
  '2025': {
    year: '2025',
    versionName: 'TA 2025 - Standar Transisi DAK Fisik',
    ppnRatePercent: 11,
    pph22RatePercent: 1.5,
    pph23RatePercent: 2.0,
    taxExemptionThreshold: 2000000,
    termin1Percent: 70,
    termin2Percent: 30,
    initialCashWithdrawalPercent: 35,
    legalSource: 'UU No. 7 Tahun 2021 (UU HPP) & PMK 59/PMK.03/2022',
    effectiveDate: '01 Januari 2025',
    notes: 'Tarif PPN 11% dan PPh 22 1.5% atas pengadaan belanja material dan perabot.',
    userVerificationPrompt: 'Pastikan kesesuaian tarif dengan surat edaran bendahara daerah terkini.',
  },
  '2024': {
    year: '2024',
    versionName: 'TA 2024 - Standar DAK Fisik Reguler',
    ppnRatePercent: 11,
    pph22RatePercent: 1.5,
    pph23RatePercent: 2.0,
    taxExemptionThreshold: 2000000,
    termin1Percent: 70,
    termin2Percent: 30,
    initialCashWithdrawalPercent: 35,
    legalSource: 'UU No. 7 Tahun 2021 & PMK No. 59/PMK.03/2022',
    effectiveDate: '01 Januari 2024',
    notes: 'PPN 11%, PPh 22 1.5%, PPh 23 2%.',
    userVerificationPrompt: 'Arsip tahun anggaran 2024.',
  },
};

/**
 * Resolves fiscal & tax parameters for a school tenant:
 * 1. Takes base configuration for the school's budget year (e.g. 2026).
 * 2. Applies any custom overrides set by the user in Master Data.
 */
export function getFiscalConfig(
  yearOrSchool: string | { tahunAnggaran?: string; customPpnRate?: number; customPph22Rate?: number; customPph23Rate?: number; termin1Persen?: number; termin2Persen?: number }
): FiscalTaxConfig {
  let targetYear = '2026';
  let overrides: Partial<FiscalTaxConfig> = {};

  if (typeof yearOrSchool === 'string') {
    targetYear = yearOrSchool.trim() || '2026';
  } else if (yearOrSchool && typeof yearOrSchool === 'object') {
    targetYear = yearOrSchool.tahunAnggaran?.trim() || '2026';
    if (yearOrSchool.customPpnRate !== undefined && yearOrSchool.customPpnRate > 0) {
      overrides.ppnRatePercent = yearOrSchool.customPpnRate;
    }
    if (yearOrSchool.customPph22Rate !== undefined && yearOrSchool.customPph22Rate > 0) {
      overrides.pph22RatePercent = yearOrSchool.customPph22Rate;
    }
    if (yearOrSchool.customPph23Rate !== undefined && yearOrSchool.customPph23Rate > 0) {
      overrides.pph23RatePercent = yearOrSchool.customPph23Rate;
    }
    if (yearOrSchool.termin1Persen !== undefined && yearOrSchool.termin1Persen > 0) {
      overrides.termin1Percent = yearOrSchool.termin1Persen;
    }
    if (yearOrSchool.termin2Persen !== undefined && yearOrSchool.termin2Persen > 0) {
      overrides.termin2Percent = yearOrSchool.termin2Persen;
    }
  }

  const baseConfig = FISCAL_YEAR_CONFIGS[targetYear] || FISCAL_YEAR_CONFIGS['2026'];
  return {
    ...baseConfig,
    ...overrides,
  };
}
