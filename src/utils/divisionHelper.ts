import {
  DivisionProgressItem,
  ProjectProgressWeek,
  KwitansiDocument,
  WeeklyWageReport,
  WorkerItem,
  SchoolMasterData,
  RpdItem,
  RpdKategori,
  TokoItem,
  RealSchoolData,
  AhspKomponen,
} from '../types';

/**
 * Smart AHSP Budget Rebalancing Engine (Skema A: Proporsional ke Bahan Utama):
 * Reallocates removed or added component nominals proportionally across remaining BAHAN components
 * so that the AHSP Total Harga Satuan remains 100% constant.
 */
export function rebalanceAhspComponents(
  components: AhspKomponen[],
  targetTotal: number,
  mode: 'BAHAN_PRIMARY' | 'ALL_PROPORTIONAL' = 'BAHAN_PRIMARY'
): AhspKomponen[] {
  if (!components || components.length === 0 || targetTotal <= 0) return components;

  const currentSum = components.reduce(
    (s, c) => s + (typeof c.totalHarga === 'number' ? c.totalHarga : Math.round((c.koefisien || 1) * (c.hargaSatuan || 0) * 100) / 100),
    0
  );
  const diff = Math.round((targetTotal - currentSum) * 100) / 100;

  if (Math.abs(diff) < 0.01) {
    return components;
  }

  // Identify target components (Skema A: BAHAN primary)
  let targets = mode === 'BAHAN_PRIMARY'
    ? components.filter((c) => c.kategori === 'BAHAN')
    : components;

  if (targets.length === 0) {
    targets = components;
  }

  const targetSum = targets.reduce((s, c) => s + (c.totalHarga || 0), 0);
  const targetIds = new Set(targets.map((t) => t.id));

  let allocatedDiff = 0;
  const result = components.map((c) => {
    if (!targetIds.has(c.id)) return { ...c };

    const isLastTarget = targets[targets.length - 1].id === c.id;
    let propDiff = 0;
    if (targetSum > 0) {
      propDiff = isLastTarget ? diff - allocatedDiff : (c.totalHarga / targetSum) * diff;
    } else {
      propDiff = diff / targets.length;
    }
    allocatedDiff += propDiff;

    const newTotal = Math.max(10, Math.round(((c.totalHarga || 0) + propDiff) * 100) / 100);
    let newHargaSatuan = c.hargaSatuan;
    if (c.koefisien > 0) {
      newHargaSatuan = Math.round((newTotal / c.koefisien) * 100) / 100;
    }

    return {
      ...c,
      hargaSatuan: newHargaSatuan > 0 ? newHargaSatuan : c.hargaSatuan,
      totalHarga: newTotal,
    };
  });

  const finalSum = result.reduce((s, c) => s + c.totalHarga, 0);
  const finalDiff = Math.round((targetTotal - finalSum) * 100) / 100;
  if (Math.abs(finalDiff) >= 0.01 && result.length > 0) {
    const lastTargetIdx = result.findIndex((c) => targetIds.has(c.id));
    if (lastTargetIdx >= 0) {
      const c = result[lastTargetIdx];
      const fixedTotal = Math.max(10, Math.round((c.totalHarga + finalDiff) * 100) / 100);
      result[lastTargetIdx] = {
        ...c,
        hargaSatuan: c.koefisien > 0 ? Math.round((fixedTotal / c.koefisien) * 100) / 100 : c.hargaSatuan,
        totalHarga: fixedTotal,
      };
    }
  }

  return result;
}

/**
 * Convert positive integer to Roman numeral string (1 -> I, 2 -> II, 4 -> IV, etc.)
 */
export function toRoman(num: number): string {
  if (num <= 0 || !Number.isFinite(num)) return '';
  const romanMap: [number, string][] = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let res = '';
  let n = Math.floor(num);
  for (const [val, roman] of romanMap) {
    while (n >= val) {
      res += roman;
      n -= val;
    }
  }
  return res;
}

/**
 * Renumber items using Roman numerals according to their category ('FISIK' or 'MANAJEMEN').
 * Locks exact Roman codes for physical work items as displayed in the official form layout:
 * I, II, III, IV, V, VI, VII, VIII, X, XI, XII for Physical Work, and I, II, III for Management.
 */
export function renumberDivisions<T extends { kode: string; uraian?: string; kategori: 'FISIK' | 'MANAJEMEN' }>(items: T[]): T[] {
  let manIndex = 0;
  let fisikIndex = 0;
  return items.map((item) => {
    if (item.kategori === 'MANAJEMEN') {
      manIndex += 1;
      // Respect manual user Roman numeral if already provided
      return { ...item, kode: item.kode?.trim() ? item.kode.trim() : toRoman(manIndex) };
    } else {
      fisikIndex += 1;
      // Respect manual user Roman numeral if already provided
      return { ...item, kode: item.kode?.trim() ? item.kode.trim() : toRoman(fisikIndex) };
    }
  });
}

export const DEFAULT_DIVISIONS: Omit<DivisionProgressItem, 'prestasiMingguLalu' | 'prestasiMingguIni' | 'prestasiSdMingguIni'>[] = [
  { id: 'div-1', kode: 'I', kategori: 'FISIK', uraian: 'PEKERJAAN PERSIAPAN', bobotTotal: 2.66, materialRef: ['Papan Nama', 'APD', 'SMKK'] },
  { id: 'div-2', kode: 'II', kategori: 'FISIK', uraian: 'PEKERJAAN GALIAN & URUGAN', bobotTotal: 1.79, materialRef: ['Tanah Timbun', 'Pasir Uruk'] },
  { id: 'div-3', kode: 'III', kategori: 'FISIK', uraian: 'PEKERJAAN PASANGAN', bobotTotal: 14.96, materialRef: ['Bata Merah', 'Batu Bata', 'Batu Kali', 'Pasir Pasang'] },
  { id: 'div-4', kode: 'IV', kategori: 'FISIK', uraian: 'PEKERJAAN BETON', bobotTotal: 13.66, materialRef: ['Besi Polos', 'Kerikil', 'Pasir Beton', 'Kawat tali beton', 'Semen PC'] },
  { id: 'div-5', kode: 'V', kategori: 'FISIK', uraian: 'PEKERJAAN KAYU, KACA, DAN BESI', bobotTotal: 8.36, materialRef: ['Kayu', 'Kusen', 'Daun Pintu', 'Daun Jendela', 'Besi Strip'] },
  { id: 'div-6', kode: 'VI', kategori: 'FISIK', uraian: 'PEKERJAAN ATAP', bobotTotal: 17.62, materialRef: ['Seng Spandek', 'Baja Profil', 'Baja ringan', 'Rangka Metal', 'Rabung'] },
  { id: 'div-7', kode: 'VII', kategori: 'FISIK', uraian: 'PEKERJAAN LANGIT-LANGIT', bobotTotal: 9.94, materialRef: ['Plafon PVC', 'Papan Gypsum', 'Rangka Furing', 'List Profil'] },
  { id: 'div-8', kode: 'VIII', kategori: 'FISIK', uraian: 'PEKERJAAN LANTAI', bobotTotal: 10.05, materialRef: ['Keramik', 'Semen Warna'] },
  { id: 'div-9', kode: 'X', kategori: 'FISIK', uraian: 'PEKERJAAN CAT-CATAN', bobotTotal: 5.32, materialRef: ['Cat Dasar', 'Cat Penutup', 'Cat Tembok', 'Tinner', 'Ampelas', 'Kuas'] },
  { id: 'div-10', kode: 'XI', kategori: 'FISIK', uraian: 'PEKERJAAN INSTALASI LISTRIK', bobotTotal: 1.60, materialRef: ['Kabel NYM', 'Downlight', 'Lampu LED', 'Saklar', 'Stop Kontak', 'MCB'] },
  { id: 'div-11', kode: 'XII', kategori: 'FISIK', uraian: 'PEKERJAAN MEBELER', bobotTotal: 7.62, materialRef: ['Kursi Guru', 'Meja Guru', 'Kursi Siswa', 'Meja Siswa', 'Meja & Kursi'] },
  { id: 'div-m1', kode: 'I', kategori: 'MANAJEMEN', uraian: 'BIAYA PERENCANAAN', bobotTotal: 1.85, materialRef: ['Perencanaan'] },
  { id: 'div-m2', kode: 'II', kategori: 'MANAJEMEN', uraian: 'BIAYA PENGAWASAN', bobotTotal: 2.19, materialRef: ['Pengawasan'] },
  { id: 'div-m3', kode: 'III', kategori: 'MANAJEMEN', uraian: 'BIAYA PENGELOLAAN', bobotTotal: 2.41, materialRef: ['Pengelolaan', 'ATK'] },
];

interface WeekPlanItem {
  m: number;
  p: string;
  r: number;
  wkFisik: Record<string, number>;
  wkAdm: Record<string, number>;
  ket: string;
}

/**
 * Generate weekly progression with realistic weekly incremental weights for all 14 weeks
 */
export function buildDefaultWeeklyProgress(): ProjectProgressWeek[] {
  const weeksPlan: WeekPlanItem[] = [
    { m: 1, p: '01 Jul - 07 Jul 2026', r: 1.73, wkFisik: { 'div-1': 0.84 }, wkAdm: { 'div-m1': 0.55, 'div-m2': 0.22, 'div-m3': 0.24 }, ket: 'Pekerjaan persiapan, papan nama, K3, perencanaan teknis' },
    { m: 2, p: '08 Jul - 14 Jul 2026', r: 5.50, wkFisik: { 'div-1': 1.82, 'div-2': 1.79, 'div-3': 1.50 }, wkAdm: { 'div-m1': 0.30, 'div-m2': 0.20 }, ket: 'Pembersihan lapangan, galian tanah pondasi, pondasi batu kali' },
    { m: 3, p: '15 Jul - 21 Jul 2026', r: 12.80, wkFisik: { 'div-3': 4.00, 'div-4': 3.50, 'div-5': 1.20 }, wkAdm: { 'div-m2': 0.30, 'div-m3': 0.30 }, ket: 'Pasangan dinding bata merah, cor sloof dan kolom praktis' },
    { m: 4, p: '22 Jul - 28 Jul 2026', r: 21.00, wkFisik: { 'div-3': 4.50, 'div-4': 3.80, 'div-5': 1.80 }, wkAdm: { 'div-m2': 0.30 }, ket: 'Lanjutan dinding bata, ring balok, persiapan kusen pintu/jendela' },
    { m: 5, p: '29 Jul - 04 Agu 2026', r: 33.50, wkFisik: { 'div-3': 4.96, 'div-6': 6.50, 'div-5': 2.00 }, wkAdm: { 'div-m2': 0.30 }, ket: 'Kuda-kuda rangka baja profil, gording, dan atap spandek' },
    { m: 6, p: '05 Agu - 11 Agu 2026', r: 47.00, wkFisik: { 'div-6': 11.12, 'div-7': 3.50, 'div-5': 1.50 }, wkAdm: { 'div-m3': 0.50 }, ket: 'Penutupan atap spandek tuntas, rangka plafon furing' },
    { m: 7, p: '12 Agu - 18 Agu 2026', r: 58.00, wkFisik: { 'div-7': 6.44, 'div-8': 4.00, 'div-4': 3.00 }, wkAdm: { 'div-m2': 0.30 }, ket: 'Pemasangan plafon PVC, rabat lantai kerja' },
    { m: 8, p: '19 Agu - 25 Agu 2026', r: 70.00, wkFisik: { 'div-8': 6.05, 'div-4': 3.36, 'div-5': 1.86 }, wkAdm: { 'div-m1': 0.50, 'div-m2': 0.20 }, ket: 'Pemasangan lantai keramik 40x40, evaluasi termin 1 (70%)' },
    { m: 9, p: '26 Agu - 01 Sep 2026', r: 78.50, wkFisik: { 'div-9': 2.50, 'div-10': 0.80, 'div-11': 2.50 }, wkAdm: { 'div-m2': 0.20 }, ket: 'Pengecatan dasar interior/eksterior, instalasi pipa kabel listrik' },
    { m: 10, p: '02 Sep - 08 Sep 2026', r: 87.00, wkFisik: { 'div-9': 2.82, 'div-10': 0.80, 'div-11': 2.50 }, wkAdm: { 'div-m3': 0.40 }, ket: 'Finishing cat penutup tembok & kayu, pemasangan armatur lampu' },
    { m: 11, p: '09 Sep - 15 Sep 2026', r: 92.50, wkFisik: { 'div-11': 2.62 }, wkAdm: { 'div-m1': 0.50, 'div-m2': 0.20 }, ket: 'Pengiriman perabot mebeler meja siswa dan guru' },
    { m: 12, p: '16 Sep - 22 Sep 2026', r: 96.00, wkFisik: {}, wkAdm: { 'div-m2': 0.17, 'div-m3': 0.47 }, ket: 'Penataan mebeler, instalasi kunci & engsel, cek fungsi' },
    { m: 13, p: '23 Sep - 29 Sep 2026', r: 98.50, wkFisik: {}, wkAdm: { 'div-m3': 0.30 }, ket: 'Pembersihan sisa material, perapihan lanskap, uji operasional' },
    { m: 14, p: '30 Sep - 06 Okt 2026', r: 100.00, wkFisik: {}, wkAdm: { 'div-m3': 0.20 }, ket: 'Pekerjaan 100% tuntas, penyusunan LPJ final dan serah terima' },
  ];

  // Accumulator for cumulative weights
  const cumulativeMap: Record<string, number> = {};
  DEFAULT_DIVISIONS.forEach((d) => (cumulativeMap[d.id] = 0));

  return weeksPlan.map((wp) => {
    const combinedWk: Record<string, number> = { ...wp.wkFisik, ...wp.wkAdm };
    
    const divisions: DivisionProgressItem[] = DEFAULT_DIVISIONS.map((def) => {
      const lalu = cumulativeMap[def.id] || 0;
      const ini = combinedWk[def.id] || 0;
      const sdIni = Math.min(def.bobotTotal, Math.round((lalu + ini) * 100) / 100);
      cumulativeMap[def.id] = sdIni;

      return {
        ...def,
        prestasiMingguLalu: lalu,
        prestasiMingguIni: ini,
        prestasiSdMingguIni: sdIni,
      };
    });

    const totalRealSdIni = divisions.reduce((s, d) => s + d.prestasiSdMingguIni, 0);
    const roundedReal = Math.min(100, Math.round(totalRealSdIni * 100) / 100);
    const dev = Math.round((roundedReal - wp.r) * 100) / 100;

    return {
      mingguKe: wp.m,
      periode: wp.p,
      bobotRencana: wp.r,
      bobotRealisasi: roundedReal,
      deviasi: dev,
      keterangan: wp.ket,
      itemPekerjaan: Object.keys(wp.wkFisik),
      rencanaWaktuHK: 112,
      waktuTerlaksanaHK: wp.m * 7,
      sisaWaktuHK: Math.max(0, 112 - (wp.m * 7)),
      divisions,
    };
  });
}

/**
 * Automatically recalculates and cascades weekly progress across all weeks:
 * For each week W > 1:
 * - If a division does not have isManualMingguLalu = true, its prestasiMingguLalu
 *   is automatically taken from week (W-1)'s prestasiSdMingguIni.
 * - prestasiSdMingguIni = Math.min(bobotTotal, prestasiMingguLalu + prestasiMingguIni)
 * - Week bobotRealisasi = sum(divisions.prestasiSdMingguIni)
 * - Week deviasi = bobotRealisasi - bobotRencana
 */
export function recalculateAllWeeksProgress(weeks: ProjectProgressWeek[]): ProjectProgressWeek[] {
  if (!weeks || weeks.length === 0) return [];
  const sorted = [...weeks].sort((a, b) => a.mingguKe - b.mingguKe);

  for (let i = 0; i < sorted.length; i++) {
    const currentW = sorted[i];
    const prevW = i > 0 ? sorted[i - 1] : null;

    if (!currentW.divisions || currentW.divisions.length === 0) continue;

    const updatedDivs = currentW.divisions.map((d) => {
      let mingguLalu = Number(d.prestasiMingguLalu) || 0;

      // If week > 1 and not manually overridden, auto-take from previous week's prestasiSdMingguIni
      if (prevW && !d.isManualMingguLalu) {
        const matchedPrev = prevW.divisions?.find(
          (pd) => pd.id === d.id || (pd.kode === d.kode && pd.kategori === d.kategori)
        );
        if (matchedPrev) {
          mingguLalu = Number(matchedPrev.prestasiSdMingguIni) || 0;
        }
      }

      const ini = Number(d.prestasiMingguIni) || 0;
      const sdIni = Math.min(
        d.bobotTotal,
        Math.round((mingguLalu + ini) * 1000) / 1000
      );

      return {
        ...d,
        prestasiMingguLalu: Math.round(mingguLalu * 1000) / 1000,
        prestasiSdMingguIni: sdIni,
      };
    });

    const totalSdIni = Math.min(
      100,
      Math.round(updatedDivs.reduce((s, d) => s + (d.prestasiSdMingguIni || 0), 0) * 1000) / 1000
    );

    sorted[i] = {
      ...currentW,
      divisions: updatedDivs,
      bobotRealisasi: totalSdIni,
      deviasi: Math.round((totalSdIni - currentW.bobotRencana) * 1000) / 1000,
    };
  }

  return sorted;
}

/**
 * Extract map of wage rates (UPAH) from AHSP List in RealSchoolData
 */
export function getAhspWageRatesMap(ahspList?: any[]): Record<string, number> {
  const map: Record<string, number> = {};
  if (!ahspList || !Array.isArray(ahspList)) return map;

  ahspList.forEach((ah: any) => {
    (ah.komponen || []).forEach((c: any) => {
      if (c.kategori === 'UPAH' || /tukang|pekerja|mandor|kepala|buruh/i.test(c.uraian)) {
        const key = (c.uraian || '').toLowerCase().trim();
        if (c.hargaSatuan > 0) {
          map[key] = c.hargaSatuan;
        }
      }
    });
  });

  return map;
}

/**
 * Resolve exact AHSP wage rate for a specific worker role/label
 */
export function getAhspWageRateForRole(
  roleCode: string,
  roleLabel?: string,
  ahspMapOrList?: Record<string, number> | any[],
  fallbackRate?: number
): number {
  const ahspMap = Array.isArray(ahspMapOrList)
    ? getAhspWageRatesMap(ahspMapOrList)
    : ahspMapOrList || {};

  const cleanLabel = (roleLabel || '').toLowerCase().trim();
  const cleanCode = (roleCode || '').toLowerCase().trim();

  // 1. Direct match in AHSP Map
  if (cleanLabel && ahspMap[cleanLabel]) return ahspMap[cleanLabel];
  if (cleanCode && ahspMap[cleanCode]) return ahspMap[cleanCode];

  // 2. Keyword matching in AHSP Map keys
  for (const [k, rate] of Object.entries(ahspMap)) {
    if (cleanLabel && (cleanLabel.includes(k) || k.includes(cleanLabel))) return rate;
    if (cleanLabel.includes('kayu') && k.includes('kayu')) return rate;
    if (cleanLabel.includes('cat') && k.includes('cat')) return rate;
    if (cleanLabel.includes('batu') && k.includes('batu')) return rate;
    if ((cleanLabel.includes('besi') || cleanLabel.includes('baja')) && (k.includes('besi') || k.includes('baja'))) return rate;
    if (cleanLabel.includes('pipa') && (k.includes('pipa') || k.includes('plambing'))) return rate;
    if (cleanLabel.includes('listrik') && k.includes('listrik')) return rate;
    if (cleanLabel.includes('gali') && k.includes('gali')) return rate;
    if (cleanLabel.includes('mandor') && k.includes('mandor')) return rate;
    if ((cleanLabel.includes('kepala') || cleanCode === 'kt') && (k.includes('kepala') || k.includes('kt'))) return rate;
    if ((cleanLabel.includes('pekerja') || cleanCode === 'p' || cleanLabel.includes('buruh')) && (k.includes('pekerja') || k.includes('buruh'))) return rate;
  }

  // 3. Fallback defaults if not found in AHSP
  if (cleanCode === 'kt' || cleanLabel.includes('kepala')) return fallbackRate || 200000;
  if (cleanCode === 'mandor' || cleanLabel.includes('mandor')) return fallbackRate || 180000;
  if (cleanCode.includes('besi') || cleanLabel.includes('besi')) return fallbackRate || 160000;
  if (cleanCode.includes('listrik') || cleanLabel.includes('listrik')) return fallbackRate || 160000;
  if (cleanCode.startsWith('t') || cleanLabel.includes('tukang')) return fallbackRate || 150000;
  if (cleanCode === 'p' || cleanLabel.includes('pekerja')) return fallbackRate || 120000;

  return fallbackRate && fallbackRate > 0 ? fallbackRate : 120000;
}

/**
 * Builds division progress items directly from RealSchoolData divisions
 * so WeeklyProgressManager is 100% integrated with Data Real Sekolah.
 */
export function buildDivisionsFromRealSchoolData(realData: RealSchoolData): DivisionProgressItem[] {
  if (!realData || !realData.divisions || realData.divisions.length === 0) {
    return DEFAULT_DIVISIONS.map((d) => ({
      ...d,
      prestasiMingguLalu: 0,
      prestasiMingguIni: 0,
      prestasiSdMingguIni: 0,
    }));
  }

  const result: DivisionProgressItem[] = [];
  const totalRab = realData.totalNilaiRab || realData.divisions.reduce((s, d) => s + (d.subTotal || 0), 0) || 1;

  let hasExplicitManagement = false;

  realData.divisions.forEach((div, idx) => {
    const upper = div.uraian.toUpperCase();
    const isCombinedMan = (upper.includes('PERENCANAAN') && upper.includes('PENGAWASAN')) || upper.includes('MANAJEMEN');
    const isPerencanaOnly = (upper.includes('PERENCANAAN') || upper.includes('PERENCANA')) && !upper.includes('PENGAWAS');
    const isPengawasOnly = (upper.includes('PENGAWASAN') || upper.includes('PENGAWAS')) && !upper.includes('PERENCANA');
    const isPengelolaanOnly = upper.includes('PENGELOLAAN') || upper.includes('ADMINISTRASI');

    if (isCombinedMan) {
      hasExplicitManagement = true;
      // Split into 3 management fees: Perencana, Pengawas, Pengelolaan
      const totalManBobot = div.bobotPersen || (div.subTotal / totalRab) * 100;
      // Proportions based on official school template (2.23 / 2.74 / 3.23 = 8.20)
      const ratio = totalManBobot > 0 ? totalManBobot / 8.20 : 1;
      const bPerencana = Math.round(2.230 * ratio * 1000) / 1000;
      const bPengawas = Math.round(2.740 * ratio * 1000) / 1000;
      const bPengelolaan = Math.round((totalManBobot - bPerencana - bPengawas) * 1000) / 1000;

      result.push({
        id: 'div-m1',
        kode: 'I',
        kategori: 'MANAJEMEN',
        uraian: 'BIAYA PERENCANAAN',
        bobotTotal: bPerencana,
        prestasiMingguLalu: 0,
        prestasiMingguIni: 0,
        prestasiSdMingguIni: 0,
        materialRef: ['Perencanaan'],
      });
      result.push({
        id: 'div-m2',
        kode: 'II',
        kategori: 'MANAJEMEN',
        uraian: 'BIAYA PENGAWASAN',
        bobotTotal: bPengawas,
        prestasiMingguLalu: 0,
        prestasiMingguIni: 0,
        prestasiSdMingguIni: 0,
        materialRef: ['Pengawasan'],
      });
      result.push({
        id: 'div-m3',
        kode: 'III',
        kategori: 'MANAJEMEN',
        uraian: 'BIAYA PENGELOLAAN',
        bobotTotal: bPengelolaan,
        prestasiMingguLalu: 0,
        prestasiMingguIni: 0,
        prestasiSdMingguIni: 0,
        materialRef: ['Pengelolaan', 'ATK'],
      });
    } else if (isPerencanaOnly) {
      hasExplicitManagement = true;
      const bobot = div.bobotPersen || Math.round((div.subTotal / totalRab) * 100000) / 1000;
      result.push({
        id: 'div-m1',
        kode: div.kode?.trim() ? div.kode.trim() : 'I',
        kategori: 'MANAJEMEN',
        uraian: 'BIAYA PERENCANAAN',
        bobotTotal: Math.round(bobot * 1000) / 1000,
        prestasiMingguLalu: 0,
        prestasiMingguIni: 0,
        prestasiSdMingguIni: 0,
        materialRef: ['Perencanaan'],
      });
    } else if (isPengawasOnly) {
      hasExplicitManagement = true;
      const bobot = div.bobotPersen || Math.round((div.subTotal / totalRab) * 100000) / 1000;
      result.push({
        id: 'div-m2',
        kode: div.kode?.trim() ? div.kode.trim() : 'II',
        kategori: 'MANAJEMEN',
        uraian: 'BIAYA PENGAWASAN',
        bobotTotal: Math.round(bobot * 1000) / 1000,
        prestasiMingguLalu: 0,
        prestasiMingguIni: 0,
        prestasiSdMingguIni: 0,
        materialRef: ['Pengawasan'],
      });
    } else if (isPengelolaanOnly) {
      hasExplicitManagement = true;
      const bobot = div.bobotPersen || Math.round((div.subTotal / totalRab) * 100000) / 1000;
      result.push({
        id: 'div-m3',
        kode: div.kode?.trim() ? div.kode.trim() : 'III',
        kategori: 'MANAJEMEN',
        uraian: 'BIAYA PENGELOLAAN',
        bobotTotal: Math.round(bobot * 1000) / 1000,
        prestasiMingguLalu: 0,
        prestasiMingguIni: 0,
        prestasiSdMingguIni: 0,
        materialRef: ['Pengelolaan', 'ATK'],
      });
    } else {
      const bobot = div.bobotPersen || Math.round((div.subTotal / totalRab) * 100000) / 1000;
      result.push({
        id: div.id || `div-${idx + 1}`,
        kode: div.kode?.trim() ? div.kode.trim() : toRoman(idx + 1),
        kategori: 'FISIK',
        uraian: div.uraian.toUpperCase().trim(),
        bobotTotal: Math.round(bobot * 1000) / 1000,
        prestasiMingguLalu: 0,
        prestasiMingguIni: 0,
        prestasiSdMingguIni: 0,
        materialRef: (div.items || []).slice(0, 5).map((it) => it.uraian),
      });
    }
  });

  if (!hasExplicitManagement) {
    result.push({
      id: 'div-m1',
      kode: 'I',
      kategori: 'MANAJEMEN',
      uraian: 'BIAYA PERENCANAAN',
      bobotTotal: 2.23,
      prestasiMingguLalu: 0,
      prestasiMingguIni: 0,
      prestasiSdMingguIni: 0,
      materialRef: ['Perencanaan'],
    });
    result.push({
      id: 'div-m2',
      kode: 'II',
      kategori: 'MANAJEMEN',
      uraian: 'BIAYA PENGAWASAN',
      bobotTotal: 2.74,
      prestasiMingguLalu: 0,
      prestasiMingguIni: 0,
      prestasiSdMingguIni: 0,
      materialRef: ['Pengawasan'],
    });
    result.push({
      id: 'div-m3',
      kode: 'III',
      kategori: 'MANAJEMEN',
      uraian: 'BIAYA PENGELOLAAN',
      bobotTotal: 3.23,
      prestasiMingguLalu: 0,
      prestasiMingguIni: 0,
      prestasiSdMingguIni: 0,
      materialRef: ['Pengelolaan', 'ATK'],
    });
  }

  return result;
}

/**
 * Synchronizes weekly progress divisions with RealSchoolData divisions
 * while carefully preserving any existing progress percentage (prestasiMingguIni) entered by the user.
 */
export function syncProgressWeeksWithRealData(
  currentWeeks: ProjectProgressWeek[],
  realData: RealSchoolData
): ProjectProgressWeek[] {
  if (!realData || !realData.divisions || realData.divisions.length === 0) {
    return currentWeeks;
  }

  const targetDivisions = buildDivisionsFromRealSchoolData(realData);

  return currentWeeks.map((week) => {
    const existingDivs = week.divisions || [];

    const syncedDivisions = targetDivisions.map((targetDiv) => {
      // Find matching division in existing week by id, or by exact uraian, or by category & kode
      const match = existingDivs.find(
        (ed) =>
          ed.id === targetDiv.id ||
          (ed.kategori === targetDiv.kategori && ed.uraian.trim().toLowerCase() === targetDiv.uraian.trim().toLowerCase()) ||
          (ed.kategori === targetDiv.kategori && ed.kode.trim().toLowerCase() === targetDiv.kode.trim().toLowerCase())
      );

      const pIni = match ? Number(match.prestasiMingguIni) || 0 : 0;
      const pLalu = match ? Number(match.prestasiMingguLalu) || 0 : 0;
      const pSdIni = Math.min(targetDiv.bobotTotal, Math.round((pLalu + pIni) * 1000) / 1000);

      return {
        ...targetDiv,
        kode: match?.kode?.trim() ? match.kode.trim() : targetDiv.kode,
        prestasiMingguLalu: pLalu,
        prestasiMingguIni: pIni,
        prestasiSdMingguIni: pSdIni,
      };
    });

    const totalSdIni = Math.min(
      100,
      Math.round(syncedDivisions.reduce((s, d) => s + d.prestasiSdMingguIni, 0) * 1000) / 1000
    );

    return {
      ...week,
      bobotRealisasi: totalSdIni,
      deviasi: Math.round((totalSdIni - week.bobotRencana) * 100) / 100,
      divisions: syncedDivisions,
    };
  });
}

/**
 * Sequential Waterfall Budget Allocation Engine (Alokasi Berdasarkan Urutan Kronologis Progres)
 * Allocates budget items (RAB / RPD) sequentially into Termin 1 (70%) and Termin 2 (30%)
 * based on their actual chronological order in the work divisions (Divisi I, II, III, ... XII)
 * combined with weekly progress weights.
 */
export function calculateSequentialWaterfallRpdItems(
  realData: RealSchoolData,
  termin1Persen: number = 70
): RpdItem[] {
  const totalRab = realData.paguAnggaran && realData.paguAnggaran > 0
    ? realData.paguAnggaran
    : realData.divisions.reduce((s, d) => s + d.subTotal, 0);

  const t1Ratio = termin1Persen / 100; // 0.70
  const t1TargetRp = Math.round(totalRab * t1Ratio);

  let runningTotal = 0;
  const newRpdItems: RpdItem[] = [];

  realData.divisions.forEach((div) => {
    div.items.forEach((it) => {
      let kategori: RpdKategori = 'BAHAN_BARU';
      if (div.kode === 'I' || it.kategoriBiaya === 'SMKK') {
        kategori = 'PERSIAPAN';
      } else if (it.kategoriBiaya === 'UPAH') {
        kategori = 'GAJI_BARU';
      } else if (div.kode === 'XII') {
        kategori = 'PERABOT';
      }

      // Handle combined UPAH_BAHAN items
      if (it.kategoriBiaya === 'UPAH_BAHAN') {
        const vol100 = it.volume;
        const jml100 = it.jumlah;

        // 1. Bahan portion (65%)
        const jmlBahan = Math.round(jml100 * 0.65);
        const volBahan = Math.max(0.01, Math.round(vol100 * 0.65 * 100) / 100);
        const [bT1Jml, bT2Jml, bT1Vol, bT2Vol] = allocateWaterfallSplit(jmlBahan, volBahan, it.hargaSatuan, runningTotal, t1TargetRp);
        runningTotal += jmlBahan;

        newRpdItems.push({
          id: `rpd-${it.id}-bahan`,
          no: newRpdItems.length + 1,
          uraian: `${div.kode} - ${it.uraian} (Bahan)`,
          satuan: it.satuan,
          kategori: 'BAHAN_BARU',
          hargaSatuan: it.hargaSatuan,
          volume100: volBahan,
          jumlahAnggaran: jmlBahan,
          volumeTermin1: bT1Vol,
          jumlahTermin1: bT1Jml,
          volumeTermin2: bT2Vol,
          jumlahTermin2: bT2Jml,
          defaultToko: 'USAHA FAMILY',
        });

        // 2. Upah portion (35%)
        const jmlUpah = jml100 - jmlBahan;
        const volUpah = Math.max(0.01, Math.round(vol100 * 0.35 * 100) / 100);
        const upahHargaSat = volUpah > 0 ? Math.round(jmlUpah / volUpah) : it.hargaSatuan;
        const [uT1Jml, uT2Jml, uT1Vol, uT2Vol] = allocateWaterfallSplit(jmlUpah, volUpah, upahHargaSat, runningTotal, t1TargetRp);
        runningTotal += jmlUpah;

        newRpdItems.push({
          id: `rpd-${it.id}-upah`,
          no: newRpdItems.length + 1,
          uraian: `${div.kode} - ${it.uraian} (Upah)`,
          satuan: 'OH',
          kategori: 'GAJI_BARU',
          hargaSatuan: upahHargaSat,
          volume100: volUpah,
          jumlahAnggaran: jmlUpah,
          volumeTermin1: uT1Vol,
          jumlahTermin1: uT1Jml,
          volumeTermin2: uT2Vol,
          jumlahTermin2: uT2Jml,
          defaultToko: '-',
        });

        return;
      }

      // Standard item
      const jml100 = it.jumlah;
      const vol100 = it.volume;
      const [t1Jml, t2Jml, t1Vol, t2Vol] = allocateWaterfallSplit(jml100, vol100, it.hargaSatuan, runningTotal, t1TargetRp);
      runningTotal += jml100;

      newRpdItems.push({
        id: `rpd-${it.id}`,
        no: newRpdItems.length + 1,
        uraian: `${div.kode} - ${it.uraian}`,
        satuan: it.satuan,
        kategori,
        hargaSatuan: it.hargaSatuan,
        volume100: vol100,
        jumlahAnggaran: jml100,
        volumeTermin1: t1Vol,
        jumlahTermin1: t1Jml,
        volumeTermin2: t2Vol,
        jumlahTermin2: t2Jml,
        defaultToko: div.kode === 'XII' ? 'MEBEL JAYA' : 'USAHA FAMILY',
        isBarangPabrikasi: it.isBarangPabrikasi,
      });
    });
  });

  return newRpdItems;
}

function allocateWaterfallSplit(
  jml100: number,
  vol100: number,
  hargaSatuan: number,
  runningBefore: number,
  t1TargetRp: number
): [number, number, number, number] {
  const runningAfter = runningBefore + jml100;

  // Case 1: 100% in Termin 1
  if (runningAfter <= t1TargetRp) {
    return [jml100, 0, vol100, 0];
  }

  // Case 2: 100% in Termin 2
  if (runningBefore >= t1TargetRp) {
    return [0, jml100, 0, vol100];
  }

  // Case 3: Transition item across 70% threshold
  const t1Jml = Math.max(0, t1TargetRp - runningBefore);
  const t2Jml = Math.max(0, jml100 - t1Jml);

  let t1Vol = 0;
  if (hargaSatuan > 0) {
    t1Vol = Math.round((t1Jml / hargaSatuan) * 100) / 100;
  } else if (jml100 > 0) {
    t1Vol = Math.round((vol100 * (t1Jml / jml100)) * 100) / 100;
  }
  const t2Vol = Math.max(0, Math.round((vol100 - t1Vol) * 100) / 100);

  return [t1Jml, t2Jml, t1Vol, t2Vol];
}


