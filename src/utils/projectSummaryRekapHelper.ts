import {
  SchoolMasterData,
  RpdItem,
  KwitansiDocument,
  WeeklyWageReport,
  ProjectProgressWeek,
  RealSchoolData,
  RabSubItem,
  StoreVendor,
  TokoItem,
  WorkerItem,
} from '../types';
import { isAhspLaborComponent } from './kwitansiTagHelper';
import { sanitizeYear } from './monthHelper';

export type RekapCategoryKey =
  | 'PAPAN_NAMA'
  | 'BAHAN_MATERIAL'
  | 'SMKK'
  | 'SIPLAH'
  | 'UPAH_KERJA'
  | 'FURNITUR_PINTU_JENDELA'
  | 'KONSULTAN_PERENCANA'
  | 'PENGAWAS'
  | 'PENGELOLA_SPJ';

export interface RekapCategoryItem {
  key: RekapCategoryKey;
  no: number;
  title: string;
  shortCode: string;
  rabTagLabel: string;
  kwitansiTagLabel: string;
  icon: string;
  paguNominal: number;
  paguPersen: number; // % terhadap total anggaran sekolah
  realisasiNominal: number;
  realisasiPersen: number; // % penyerapan terhadap pagu kategori
  realisasiBobotTotal: number; // % realisasi terhadap total anggaran
  sisaPagu: number; // paguNominal - realisasiNominal
  status: 'SINKRON_PAS' | 'BERJALAN_NORMAL' | 'MELEBIHI_PAGU' | 'BELUM_REALISASI';
  statusLabel: string;
  statusBadgeClass: string;
  kwitansiCount: number;
  kwitansiList: KwitansiDocument[];
}

export interface RekapProjectSummaryResult {
  categories: RekapCategoryItem[];
  totalPagu: number;
  totalPaguPersen: number;
  totalRealisasi: number;
  totalRealisasiPersen: number;
  totalSisa: number;
  isOverBudget: boolean;
  isFullyBalanced: boolean;
  activeWeekMax: number;
  currentFisikBobot: number;
}

/**
 * Mendeteksi kategori dari suatu Kwitansi / Transaksi
 */
export function classifyKwitansiCategory(kw: KwitansiDocument): RekapCategoryKey {
  const bukti = (kw.noBukti || '').toUpperCase().trim();
  const uraian = (kw.uraian || '').toLowerCase();
  const namaToko = (kw.namaToko || '').toLowerCase();
  const combined = `${bukti} ${uraian} ${namaToko} ${kw.tipe || ''}`.toLowerCase();

  // 1. Belanja SipLah (Daring) - Prioritas Utama
  // Tangkap semua bukti yang berawalan/mengandung SipLah atau KW-SIPLAH atau item berlabel SipLah
  if (
    bukti.startsWith('SIPLAH') ||
    bukti.includes('/SIPLAH') ||
    bukti.includes('KW-SIPLAH') ||
    /siplah/i.test(combined) ||
    kw.items?.some((it) => it.tag === 'SipLah' || /siplah/i.test(it.namaBarang || ''))
  ) {
    return 'SIPLAH';
  }

  // 2. SMKK (K3 Konstruksi) - Prioritas Utama
  // Tangkap kwitansi 01/KW-SMKK/2026, KW-SMKK, SMKK, dst.
  if (
    bukti.includes('SMKK') ||
    kw.tipe === 'SMKK' ||
    /smkk|k3\b|tali keselamatan|rompi reflektor|helm safety|sepatu boot|sepatu safety|p3k|rambu k3/i.test(combined)
  ) {
    return 'SMKK';
  }

  // 3. Papan Nama Proyek (Cetak)
  if (
    bukti.startsWith('CTK') ||
    bukti.includes('/CTK') ||
    kw.tipe === 'CETAK' ||
    /papan\s*nama|prasasti|banner\s*proyek|\bctk\b/i.test(combined)
  ) {
    return 'PAPAN_NAMA';
  }

  // 4. Konsultan Perencana Teknis
  if (
    bukti.includes('KONS-P') ||
    (kw.tipe === 'KONSULTAN' && /perencana/i.test(combined))
  ) {
    return 'KONSULTAN_PERENCANA';
  }

  // 5. Konsultan Pengawas Lapangan
  if (
    bukti.includes('KONS-W') ||
    (kw.tipe === 'KONSULTAN' && /pengawas/i.test(combined))
  ) {
    return 'PENGAWAS';
  }

  // 6. Upah Tukang / Pekerja
  if (
    bukti.startsWith('UK/') ||
    bukti.includes('/UK/') ||
    bukti.includes('KW-UPAH') ||
    kw.tipe === 'UPAH' ||
    /daftar\s*upah|upah\s*tukang|upah\s*pekerja|borongan\s*upah/i.test(combined)
  ) {
    return 'UPAH_KERJA';
  }

  // 7. Pengelola Administrasi & SPJ
  // ATURAN KETAT: Hanya kwitansi dengan nomor bukti berbentuk ADM (misal ADM/01/2026, ADM-01, dsb.)
  if (
    bukti.startsWith('ADM/') ||
    bukti.startsWith('ADM-') ||
    bukti.includes('/ADM/') ||
    bukti.includes('KW-ADM') ||
    bukti === 'ADM' ||
    bukti.includes('ADM')
  ) {
    return 'PENGELOLA_SPJ';
  }

  // 8. Furnitur / Pintu & Jendela / Mebeler Pabrikasi (non-SipLah)
  if (
    bukti.startsWith('FUR') ||
    bukti.includes('/FUR/') ||
    kw.tipe === 'PINTU_JENDELA' ||
    kw.tipe === 'PERABOT' ||
    (/pintu|jendela|kusen|aluminium/i.test(combined) && !bukti.includes('SIPLAH')) ||
    (kw.items?.some((it) => it.isBarangPabrikasi || it.tag === 'FUR') && !bukti.includes('SIPLAH'))
  ) {
    return 'FURNITUR_PINTU_JENDELA';
  }

  // 9. Bahan Material Bangunan (Default)
  return 'BAHAN_MATERIAL';
}

/**
 * Menghitung rekapitulasi 9 kategori dari Pagu (RAB / RPD) dan Realisasi (Kwitansi & Upah)
 */
export function calculateProjectSummaryRekap(
  school: SchoolMasterData,
  rpdItems: RpdItem[] = [],
  kwitansiList: KwitansiDocument[] = [],
  wageReports: WeeklyWageReport[] = [],
  progressWeeks: ProjectProgressWeek[] = [],
  realSchoolData?: RealSchoolData
): RekapProjectSummaryResult {
  const totalAnggaran = school?.totalAnggaran || 0;

  // Active weeks
  const activeWeeks = (progressWeeks || []).filter(
    (w) => (w.bobotRealisasi && w.bobotRealisasi > 0) || w.divisions?.some((d) => (d.prestasiMingguIni || 0) > 0)
  );
  const activeWeekNums = new Set(activeWeeks.map((w) => w.mingguKe));
  const activeWeekMax = activeWeekNums.size > 0 ? Math.max(...Array.from(activeWeekNums)) : 0;
  const latestWeek = progressWeeks && progressWeeks.length > 0
    ? progressWeeks[progressWeeks.length - 1]
    : { bobotRealisasi: 0 };
  const currentFisikBobot = latestWeek.bobotRealisasi || 0;

  // Pagu buckets
  const paguMap: Record<RekapCategoryKey, number> = {
    PAPAN_NAMA: 0,
    BAHAN_MATERIAL: 0,
    SMKK: 0,
    SIPLAH: 0,
    UPAH_KERJA: 0,
    FURNITUR_PINTU_JENDELA: 0,
    KONSULTAN_PERENCANA: 0,
    PENGAWAS: 0,
    PENGELOLA_SPJ: 0,
  };

  // 1. Ekstraksi Pagu dari Real School Data (RAB Detail) jika tersedia
  let hasRealRab = false;
  if (realSchoolData?.divisions && realSchoolData.divisions.length > 0) {
    hasRealRab = true;
    realSchoolData.divisions.forEach((div) => {
      (div.items || []).forEach((it: RabSubItem) => {
        const itemNominal = it.jumlah || 0;
        const uraian = (it.uraian || '').toLowerCase();
        const tags = (it.tags || []).map((t) => t.toUpperCase());
        const kat = it.kategoriBiaya;

        // Cek Split Alokasi (Virtual Split UPAH_BAHAN)
        if (it.allocationSplit && it.allocationSplit.isConfirmed) {
          paguMap.BAHAN_MATERIAL += it.allocationSplit.materialValue || 0;
          paguMap.UPAH_KERJA += it.allocationSplit.laborValue || 0;
          return;
        }

        // Papan Nama Proyek
        if (tags.includes('CTK') || kat === 'CETAK' || /papan\s*nama|prasasti|banner/i.test(uraian)) {
          paguMap.PAPAN_NAMA += itemNominal;
        }
        // SMKK
        else if (tags.includes('SMKK') || kat === 'SMKK' || /smkk|k3|helm|rompi|sepatu boot|p3k|rambu/i.test(uraian)) {
          paguMap.SMKK += itemNominal;
        }
        // SipLah
        else if (tags.includes('SIPLAH') || kat === 'SIPLAH' || /siplah/i.test(uraian)) {
          paguMap.SIPLAH += itemNominal;
        }
        // Konsultan Perencana
        else if (tags.includes('KONS-P') || kat === 'PERENCANA' || /perencana teknis|jasa.*perencanaan/i.test(uraian)) {
          paguMap.KONSULTAN_PERENCANA += itemNominal;
        }
        // Pengawas
        else if (tags.includes('KONS-W') || kat === 'PENGAWAS' || /pengawas lapangan|jasa.*pengawasan/i.test(uraian)) {
          paguMap.PENGAWAS += itemNominal;
        }
        // Pengelola SPJ
        else if (tags.includes('SPJ') || kat === 'PENGELOLA' || /pengelola.*spj|administrasi lpj|atk/i.test(uraian)) {
          paguMap.PENGELOLA_SPJ += itemNominal;
        }
        // Furnitur & Pintu Jendela
        else if (
          tags.includes('FUR') ||
          kat === 'PINTU_JENDELA' ||
          it.isBarangPabrikasi ||
          /pintu|kusen|jendela|ventilasi|mebeler|kursi|meja|loker|rak|perabot/i.test(uraian)
        ) {
          paguMap.FURNITUR_PINTU_JENDELA += itemNominal;
        }
        // Upah
        else if (
          tags.includes('UPAH') ||
          kat === 'UPAH' ||
          isAhspLaborComponent(it.uraian || '', kat)
        ) {
          paguMap.UPAH_KERJA += itemNominal;
        }
        // Bahan Material
        else {
          paguMap.BAHAN_MATERIAL += itemNominal;
        }
      });
    });
  }

  // 2. Fallback / Tambahan ke RPD jika RAB Real Kosong atau Kategori Tertentu (misal Konsultan/SPJ ada di RPD)
  if (!hasRealRab || (paguMap.KONSULTAN_PERENCANA === 0 && paguMap.PENGAWAS === 0 && paguMap.PENGELOLA_SPJ === 0)) {
    rpdItems.forEach((rpd) => {
      const u = (rpd.uraian || '').toLowerCase();
      const kat = rpd.kategori;
      const amt = rpd.jumlahAnggaran || 0;

      if (kat === 'PERSIAPAN') {
        if (/papan\s*nama|cetak/i.test(u)) {
          if (paguMap.PAPAN_NAMA === 0) paguMap.PAPAN_NAMA += amt;
        } else if (/smkk|k3/i.test(u)) {
          if (paguMap.SMKK === 0) paguMap.SMKK += amt;
        } else {
          if (!hasRealRab) paguMap.BAHAN_MATERIAL += amt;
        }
      } else if (kat === 'GAJI_REHAB' || kat === 'GAJI_BARU') {
        if (!hasRealRab) paguMap.UPAH_KERJA += amt;
      } else if (kat === 'PERABOT') {
        if (paguMap.FURNITUR_PINTU_JENDELA === 0) paguMap.FURNITUR_PINTU_JENDELA += amt;
      } else if (kat === 'KONSULTAN_ADM') {
        if (/perencana/i.test(u)) {
          if (paguMap.KONSULTAN_PERENCANA === 0) paguMap.KONSULTAN_PERENCANA += amt;
        } else if (/pengawas/i.test(u)) {
          if (paguMap.PENGAWAS === 0) paguMap.PENGAWAS += amt;
        } else if (/pengelola|spj|lpj|administrasi/i.test(u)) {
          if (paguMap.PENGELOLA_SPJ === 0) paguMap.PENGELOLA_SPJ += amt;
        }
      } else if (kat === 'BAHAN_REHAB' || kat === 'BAHAN_BARU') {
        if (/pintu|jendela|kusen/i.test(u)) {
          if (paguMap.FURNITUR_PINTU_JENDELA === 0) paguMap.FURNITUR_PINTU_JENDELA += amt;
        } else if (/siplah/i.test(u)) {
          if (paguMap.SIPLAH === 0) paguMap.SIPLAH += amt;
        } else if (!hasRealRab) {
          paguMap.BAHAN_MATERIAL += amt;
        }
      }
    });
  }

  // Jika total pagu dihitung masih 0 tapi totalAnggaran ada, buat proporsi standar Revitalisasi
  const rawSumPagu = Object.values(paguMap).reduce((a, b) => a + b, 0);
  if (rawSumPagu === 0 && totalAnggaran > 0) {
    paguMap.PAPAN_NAMA = Math.round(totalAnggaran * 0.002); // ~0.2%
    paguMap.KONSULTAN_PERENCANA = Math.round(totalAnggaran * 0.025); // ~2.5%
    paguMap.PENGAWAS = Math.round(totalAnggaran * 0.025); // ~2.5%
    paguMap.PENGELOLA_SPJ = Math.round(totalAnggaran * 0.025); // ~2.5%
    paguMap.SMKK = Math.round(totalAnggaran * 0.015); // ~1.5%
    paguMap.SIPLAH = 0;
    paguMap.FURNITUR_PINTU_JENDELA = Math.round(totalAnggaran * 0.12); // ~12%
    paguMap.UPAH_KERJA = Math.round(totalAnggaran * 0.32); // ~32%
    paguMap.BAHAN_MATERIAL =
      totalAnggaran -
      (paguMap.PAPAN_NAMA +
        paguMap.KONSULTAN_PERENCANA +
        paguMap.PENGAWAS +
        paguMap.PENGELOLA_SPJ +
        paguMap.SMKK +
        paguMap.FURNITUR_PINTU_JENDELA +
        paguMap.UPAH_KERJA);
  }

  // Realisasi mapping
  const realisasiMap: Record<RekapCategoryKey, number> = {
    PAPAN_NAMA: 0,
    BAHAN_MATERIAL: 0,
    SMKK: 0,
    SIPLAH: 0,
    UPAH_KERJA: 0,
    FURNITUR_PINTU_JENDELA: 0,
    KONSULTAN_PERENCANA: 0,
    PENGAWAS: 0,
    PENGELOLA_SPJ: 0,
  };

  const kwListMap: Record<RekapCategoryKey, KwitansiDocument[]> = {
    PAPAN_NAMA: [],
    BAHAN_MATERIAL: [],
    SMKK: [],
    SIPLAH: [],
    UPAH_KERJA: [],
    FURNITUR_PINTU_JENDELA: [],
    KONSULTAN_PERENCANA: [],
    PENGAWAS: [],
    PENGELOLA_SPJ: [],
  };

  // Iterasi Kwitansi yang ada
  (kwitansiList || []).forEach((kw) => {
    const cat = classifyKwitansiCategory(kw);
    realisasiMap[cat] += kw.nominal || 0;
    kwListMap[cat].push(kw);
  });

  // Sinkronisasi Upah: Jika kwitansi UPAH belum tercatat tetapi wageReports ada,
  // gunakan total upah dari wageReports
  const validWageReports = activeWeekNums.size > 0
    ? wageReports.filter((w) => activeWeekNums.has(w.mingguKe))
    : wageReports;
  const totalWageReports = validWageReports.reduce((s, w) => s + (w.totalUpah || 0), 0);

  if (realisasiMap.UPAH_KERJA === 0 && totalWageReports > 0) {
    realisasiMap.UPAH_KERJA = totalWageReports;
  }

  // Definisi metadata 9 kategori sesuai konsep user
  const categoryDefs: Array<{
    key: RekapCategoryKey;
    no: number;
    title: string;
    shortCode: string;
    rabTagLabel: string;
    kwitansiTagLabel: string;
    icon: string;
  }> = [
    {
      key: 'PAPAN_NAMA',
      no: 1,
      title: 'Papan Nama Proyek',
      shortCode: 'CTK',
      rabTagLabel: 'RAB Cetak / CTK',
      kwitansiTagLabel: 'Kwitansi Cetak (CTK)',
      icon: '🖨️',
    },
    {
      key: 'BAHAN_MATERIAL',
      no: 2,
      title: 'Bahan Material Bangunan',
      shortCode: 'MAT',
      rabTagLabel: 'RAB Material / MAT',
      kwitansiTagLabel: 'Kwitansi Material (KW-MAT)',
      icon: '🧱',
    },
    {
      key: 'SMKK',
      no: 3,
      title: 'SMKK (K3 Konstruksi)',
      shortCode: 'SMKK',
      rabTagLabel: 'RAB SMKK',
      kwitansiTagLabel: 'Kwitansi SMKK (KW-SMKK)',
      icon: '🦺',
    },
    {
      key: 'SIPLAH',
      no: 4,
      title: 'Belanja SipLah (Daring)',
      shortCode: 'SipLah',
      rabTagLabel: 'RAB Siplah',
      kwitansiTagLabel: 'Kwitansi SipLah (KW-SIPLAH)',
      icon: '🛒',
    },
    {
      key: 'UPAH_KERJA',
      no: 5,
      title: 'Upah Tenaga Kerja',
      shortCode: 'UPAH',
      rabTagLabel: 'RAB Upah / AHSP Tenaga',
      kwitansiTagLabel: 'Daftar Upah / KW-UPAH',
      icon: '👷',
    },
    {
      key: 'FURNITUR_PINTU_JENDELA',
      no: 6,
      title: 'Furnitur (Pintu & Jendela / Pabrikasi)',
      shortCode: 'FUR',
      rabTagLabel: 'RAB Furnitur / Fabrikasi',
      kwitansiTagLabel: 'Kwitansi Furnitur (Fur)',
      icon: '🚪',
    },
    {
      key: 'KONSULTAN_PERENCANA',
      no: 7,
      title: 'Pembayaran Konsultan Perencana',
      shortCode: 'KONS-P',
      rabTagLabel: 'RAB Perencana / KONS-P',
      kwitansiTagLabel: 'Kwitansi Perencana (KONS-P)',
      icon: '📐',
    },
    {
      key: 'PENGAWAS',
      no: 8,
      title: 'Konsultan Pengawas Lapangan',
      shortCode: 'KONS-W',
      rabTagLabel: 'RAB Pengawas / KONS-W',
      kwitansiTagLabel: 'Kwitansi Pengawas (KONS-W)',
      icon: '🔍',
    },
    {
      key: 'PENGELOLA_SPJ',
      no: 9,
      title: 'Pengelola Administrasi & SPJ',
      shortCode: 'SPJ',
      rabTagLabel: 'RAB Pengelola SPJ / ADM',
      kwitansiTagLabel: 'Kwitansi Pengelola SPJ (ADM)',
      icon: '📑',
    },
  ];

  // Hitung total pagu dari seluruh kategori
  const calculatedTotalPagu = Object.values(paguMap).reduce((a, b) => a + b, 0);
  const effectiveTotalPagu = totalAnggaran > 0 ? totalAnggaran : calculatedTotalPagu;

  const categories: RekapCategoryItem[] = categoryDefs.map((def) => {
    const pagu = paguMap[def.key] || 0;
    const realisasi = realisasiMap[def.key] || 0;
    const paguPct = effectiveTotalPagu > 0 ? (pagu / effectiveTotalPagu) * 100 : 0;
    const realisasiPct = pagu > 0 ? (realisasi / pagu) * 100 : realisasi > 0 ? 100 : 0;
    const bobotTotal = effectiveTotalPagu > 0 ? (realisasi / effectiveTotalPagu) * 100 : 0;
    const sisa = pagu - realisasi;

    // Menentukan Status Sinkronisasi
    let status: RekapCategoryItem['status'] = 'BELUM_REALISASI';
    let statusLabel = 'Belum Ada Penyaluran';
    let statusBadgeClass = 'bg-slate-100 text-slate-700 border-slate-200';

    if (realisasi === 0) {
      status = 'BELUM_REALISASI';
      statusLabel = 'Belum Ada Realisasi';
      statusBadgeClass = 'bg-slate-100 text-slate-600 border-slate-200';
    } else if (Math.abs(sisa) <= 1000) {
      // Pas / Tepat Sesuai Pagu (toleransi pembulatan Rp 1.000)
      status = 'SINKRON_PAS';
      statusLabel = '✓ Tepat Sesuai Pagu (100%)';
      statusBadgeClass = 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold';
    } else if (sisa < -1000) {
      // Melebihi Pagu
      status = 'MELEBIHI_PAGU';
      statusLabel = `⚠️ Melebihi Pagu (+Rp ${Math.abs(sisa).toLocaleString('id-ID')})`;
      statusBadgeClass = 'bg-rose-50 text-rose-800 border-rose-300 font-bold';
    } else {
      // Berjalan Normal (0 < realisasi < pagu)
      status = 'BERJALAN_NORMAL';
      statusLabel = `Berjalan (${realisasiPct.toFixed(1)}%)`;
      statusBadgeClass = 'bg-blue-50 text-blue-800 border-blue-300 font-semibold';
    }

    return {
      key: def.key,
      no: def.no,
      title: def.title,
      shortCode: def.shortCode,
      rabTagLabel: def.rabTagLabel,
      kwitansiTagLabel: def.kwitansiTagLabel,
      icon: def.icon,
      paguNominal: pagu,
      paguPersen: paguPct,
      realisasiNominal: realisasi,
      realisasiPersen: realisasiPct,
      realisasiBobotTotal: bobotTotal,
      sisaPagu: sisa,
      status,
      statusLabel,
      statusBadgeClass,
      kwitansiCount: kwListMap[def.key].length,
      kwitansiList: kwListMap[def.key],
    };
  });

  const totalRealisasi = categories.reduce((sum, c) => sum + c.realisasiNominal, 0);
  const totalPaguPersen = categories.reduce((sum, c) => sum + c.paguPersen, 0);
  const totalRealisasiPersen =
    effectiveTotalPagu > 0 ? (totalRealisasi / effectiveTotalPagu) * 100 : 0;
  const totalSisa = effectiveTotalPagu - totalRealisasi;
  const isOverBudget = totalRealisasi > effectiveTotalPagu + 1000;
  const isFullyBalanced = Math.abs(totalSisa) <= 1000;

  return {
    categories,
    totalPagu: effectiveTotalPagu,
    totalPaguPersen,
    totalRealisasi,
    totalRealisasiPersen,
    totalSisa,
    isOverBudget,
    isFullyBalanced,
    activeWeekMax,
    currentFisikBobot,
  };
}

/**
 * Engine Penyelarasan & Sinkronisasi Cerdas 9 Kategori Anggaran ke Pagu RAB.
 * Memastikan setiap kategori diselaraskan tepat sesuai pagu RAB (tidak melebihi dan tidak kurang),
 * serta menyeimbangkan belanja bahan material terakhir sehingga selisih kas akhir tepat Rp 0 (Nihil).
 */
export function syncAndReconcileAll9CategoriesToBudget(params: {
  school: SchoolMasterData;
  rpdItems?: RpdItem[];
  kwitansiList?: KwitansiDocument[];
  wageReports?: WeeklyWageReport[];
  progressWeeks?: ProjectProgressWeek[];
  realSchoolData?: RealSchoolData;
  stores?: StoreVendor[];
  workers?: WorkerItem[];
}): {
  updatedKwitansiList: KwitansiDocument[];
  updatedWageReports: WeeklyWageReport[];
  messages: string[];
  totalReconciledNominal: number;
} {
  const {
    school,
    rpdItems = [],
    kwitansiList = [],
    wageReports = [],
    progressWeeks = [],
    realSchoolData,
    stores = [],
    workers = [],
  } = params;

  const yearStr = String(sanitizeYear(school?.tahunAnggaran, 2026));
  const totalAnggaran = school?.totalAnggaran || 0;

  // 1. Hitung pagu target masing-masing dari 9 kategori
  const currentRekap = calculateProjectSummaryRekap(
    school,
    rpdItems,
    kwitansiList,
    wageReports,
    progressWeeks,
    realSchoolData
  );

  const paguMap: Record<RekapCategoryKey, number> = {
    PAPAN_NAMA: 0,
    BAHAN_MATERIAL: 0,
    SMKK: 0,
    SIPLAH: 0,
    UPAH_KERJA: 0,
    FURNITUR_PINTU_JENDELA: 0,
    KONSULTAN_PERENCANA: 0,
    PENGAWAS: 0,
    PENGELOLA_SPJ: 0,
  };

  currentRekap.categories.forEach((c) => {
    paguMap[c.key] = c.paguNominal;
  });

  // Jika total pagu 0 tapi totalAnggaran ada, buat proporsi standar
  const sumPagu = Object.values(paguMap).reduce((a, b) => a + b, 0);
  if (sumPagu === 0 && totalAnggaran > 0) {
    paguMap.PAPAN_NAMA = 1099800;
    paguMap.SMKK = 8981448;
    paguMap.KONSULTAN_PERENCANA = Math.round(totalAnggaran * 0.025);
    paguMap.PENGAWAS = Math.round(totalAnggaran * 0.025);
    paguMap.PENGELOLA_SPJ = Math.round(totalAnggaran * 0.025);
    paguMap.SIPLAH = 0;
    paguMap.FURNITUR_PINTU_JENDELA = Math.round(totalAnggaran * 0.12);
    paguMap.UPAH_KERJA = Math.round(totalAnggaran * 0.32);
    paguMap.BAHAN_MATERIAL =
      totalAnggaran -
      (paguMap.PAPAN_NAMA +
        paguMap.SMKK +
        paguMap.KONSULTAN_PERENCANA +
        paguMap.PENGAWAS +
        paguMap.PENGELOLA_SPJ +
        paguMap.FURNITUR_PINTU_JENDELA +
        paguMap.UPAH_KERJA);
  }

  // 2. Vendor toko rekanan
  const percetakanStore = stores.find(
    (s) => s.kategori === 'PERCETAKAN' || /cetak|print/i.test(s.namaToko)
  ) || {
    id: 's-def-ctk',
    namaToko: 'DEXA PRINTING',
    pemilikNama: 'Zulkifli',
    pekerjaan: 'Penyedia Percetakan & Papan Nama Proyek',
    alamat: `Jl. Listrik No. 04, ${school?.kabKota || 'Kota Setempat'}`,
    kategori: 'PERCETAKAN' as const,
  };

  const smkkStore = stores.find(
    (s) => s.kategori === 'K3' || /k3|safety|apd/i.test(s.namaToko)
  ) || {
    id: 's-def-smkk',
    namaToko: 'TB. Sumber Bangunan (Penyedia APD)',
    pemilikNama: 'Ridwan Hasan',
    pekerjaan: 'Penyedia Perlengkapan SMKK & APD',
    alamat: `Jl. Merdeka No. 45, ${school?.kabKota || 'Kota Setempat'}`,
    kategori: 'MATERIAL' as const,
  };

  const perencanaStore = stores.find((s) => s.kategori === 'PERENCANA') || {
    id: 's-def-kons-p',
    namaToko: 'KONSULTAN PERENCANA CIPTA KARYA',
    pemilikNama: school?.namaPerencana || 'Zulfahmi, ST',
    pekerjaan: 'Arsitek / Tenaga Ahli Perencana Teknis',
    alamat: school?.alamatPerencana || `Kota ${school?.kabKota || 'Setempat'}`,
    kategori: 'PERENCANA' as const,
  };

  const pengawasStore = stores.find((s) => s.kategori === 'PENGAWAS') || {
    id: 's-def-kons-w',
    namaToko: 'KONSULTAN PENGAWAS SUPERVISI',
    pemilikNama: school?.namaPengawas || 'M. Aris Syahputra, ST',
    pekerjaan: 'Tenaga Ahli Pengawas Lapangan',
    alamat: school?.alamatPengawas || `Kota ${school?.kabKota || 'Setempat'}`,
    kategori: 'PENGAWAS' as const,
  };

  const spjStore = stores.find((s) => s.kategori === 'PENGELOLA_SPJ') || {
    id: 's-def-spj',
    namaToko: 'TIM PENGELOLA SPJ KEGIATAN',
    pemilikNama: school?.namaKetuaP2SP || 'IRWAN YUSUF',
    pekerjaan: 'Pengelola Administrasi SPJ & LPJ',
    alamat: `Sekretariat P2SP / ${school?.namaSekolah || 'Sekolah'}`,
    kategori: 'PENGELOLA_SPJ' as const,
  };

  const kusenStore = stores.find(
    (s) =>
      s.kategori === 'PINTU_JENDELA_ALUMINIUM' ||
      s.kategori === 'PERABOT' ||
      /kusen|pintu|zami/i.test(s.namaToko)
  ) || {
    id: 's-def-fur',
    namaToko: 'UD. ZAMI JAYA',
    pemilikNama: 'Tarmizi',
    pekerjaan: 'Pengrajin Kayu & Mebeler Pintu Jendela',
    alamat: `Jl. Cunda No. 10, ${school?.kabKota || 'Kota Setempat'}`,
    kategori: 'PERABOT' as const,
  };

  const materialStore = stores.find((s) => s.kategori === 'MATERIAL') || {
    id: 's-def-mat',
    namaToko: 'USAHA FAMILY',
    pemilikNama: 'Ridwan Hasan',
    pekerjaan: 'Pemilik Toko Bahan Bangunan',
    alamat: `Jl. Merdeka No. 45, ${school?.kabKota || 'Kota Setempat'}`,
    kategori: 'MATERIAL' as const,
  };

  const siplahStore = stores.find(
    (s) => s.kategori === 'SIPLAH' || /siplah/i.test(s.namaToko)
  ) || {
    id: 's-def-siplah',
    namaToko: 'Mitra SipLah Blibli / Telkom',
    pemilikNama: 'Penyedia SipLah',
    pekerjaan: 'Mitra Daring SipLah Kemdikbud',
    alamat: `Platform Daring Mitra SipLah`,
    kategori: 'SIPLAH' as const,
  };

  const messages: string[] = [];
  let nextKwitansiList: KwitansiDocument[] = [...kwitansiList];
  let nextWageReports: WeeklyWageReport[] = [...wageReports];

  // 1. Pembersihan Otomatis Kwitansi Duplikat SipLah & SMKK jika Kwitansi Asli Toko Rekanan Sudah Ada
  const authenticSiplahList = nextKwitansiList.filter(
    (k) =>
      (k.noBukti?.toUpperCase().startsWith('SIPLAH/') || k.noBukti?.toUpperCase().includes('/SIPLAH')) &&
      !k.id.startsWith('kw-sync-') &&
      k.noBukti !== `KW-SIPLAH/01/${yearStr}`
  );
  if (authenticSiplahList.length > 0) {
    // Hapus kwitansi dummy KW-SIPLAH/01/2026 jika kwitansi asli SipLah/01, SipLah/02 toko rekanan sudah ada
    nextKwitansiList = nextKwitansiList.filter(
      (k) => !(k.id.startsWith('kw-sync-siplah') || k.noBukti === `KW-SIPLAH/01/${yearStr}`)
    );
  }

  const authenticSmkkList = nextKwitansiList.filter(
    (k) =>
      (k.noBukti?.includes('/KW-SMKK/') || k.noBukti?.startsWith('01/KW-SMKK')) &&
      !k.id.startsWith('kw-sync-')
  );
  if (authenticSmkkList.length > 0) {
    nextKwitansiList = nextKwitansiList.filter(
      (k) => !(k.id.startsWith('kw-sync-smkk') && k.noBukti === `KW-SMKK/01/${yearStr}`)
    );
  }

  // Helper untuk mencari kwitansi berdasarkan kategori
  const getKwByCategory = (catKey: RekapCategoryKey) => {
    return nextKwitansiList.filter((k) => classifyKwitansiCategory(k) === catKey);
  };

  // Helper untuk update atau create kwitansi
  const ensureFixedCategoryReceipt = (
    catKey: RekapCategoryKey,
    targetNominal: number,
    createData: Omit<KwitansiDocument, 'id' | 'nominal'>
  ) => {
    if (targetNominal <= 0) return;

    const existing = getKwByCategory(catKey);
    if (existing.length === 0) {
      const newKw: KwitansiDocument = {
        id: `kw-sync-${catKey.toLowerCase()}-${Date.now()}`,
        nominal: targetNominal,
        ...createData,
      };
      nextKwitansiList.push(newKw);
      messages.push(`Dibuat kwitansi baru untuk ${newKw.uraian.slice(0, 45)}... (Rp ${targetNominal.toLocaleString('id-ID')})`);
    } else {
      // Jika kwitansi sudah ada:
      // JANGAN PERNAH membuat kwitansi baru!
      const currentSum = existing.reduce((s, k) => s + (k.nominal || 0), 0);
      const diff = targetNominal - currentSum;
      // Jika ada selisih pada kwitansi tunggal, selaraskan langsung pas sesuai pagu
      if (Math.abs(diff) > 0.01 && existing.length === 1) {
        const targetKwId = existing[0].id;
        nextKwitansiList = nextKwitansiList.map((k) => {
          if (k.id === targetKwId) {
            return {
              ...k,
              nominal: targetNominal,
              items: k.items && k.items.length === 1 ? [{
                ...k.items[0],
                hargaSatuan: targetNominal,
                jumlah: targetNominal,
              }] : k.items,
            };
          }
          return k;
        });
        messages.push(`Diselaraskan kwitansi ${existing[0].noBukti} sebesar Rp ${targetNominal.toLocaleString('id-ID')} pas sesuai pagu.`);
      }
    }
  };

  // 1. PAPAN NAMA PROYEK (CETAK)
  ensureFixedCategoryReceipt('PAPAN_NAMA', paguMap.PAPAN_NAMA, {
    noBukti: `CTK/01/${yearStr}`,
    noSpb: `SPB-CTK/01/${yearStr}`,
    tipe: 'CETAK',
    tanggal: `18/07/${yearStr}`,
    tanggalFormatted: `18 Juli ${yearStr}`,
    bulan: `Juli ${yearStr}`,
    uraian: `Pembayaran Lunas Biaya Pembuatan dan Pemasangan Papan Nama Proyek Revitalisasi ${school?.namaSekolah || 'Sekolah'}, Tahun ${yearStr}.`,
    penerimaNama: percetakanStore.pemilikNama || 'Zulkifli',
    penerimaPekerjaan: percetakanStore.pekerjaan || 'Penyedia Percetakan',
    penerimaAlamat: percetakanStore.alamat || school?.kabKota || '',
    namaToko: percetakanStore.namaToko,
    items: [
      {
        namaBarang: 'Pasang Papan Nama Proyek Revitalisasi Bahan Banner & Multiplex Rangka Besi',
        volume: 1,
        satuan: 'unit',
        hargaSatuan: paguMap.PAPAN_NAMA,
        jumlah: paguMap.PAPAN_NAMA,
        tag: 'CTK',
      },
    ],
    isPpn: paguMap.PAPAN_NAMA >= 2000000,
    isPph22: paguMap.PAPAN_NAMA >= 2000000,
    isPph23: false,
    ppnAmount: paguMap.PAPAN_NAMA >= 2000000 ? Math.round((paguMap.PAPAN_NAMA / 1.11) * 0.11) : 0,
    pph22Amount: paguMap.PAPAN_NAMA >= 2000000 ? Math.round((paguMap.PAPAN_NAMA / 1.11) * 0.015) : 0,
    pph23Amount: 0,
    kategoriBiayaPajak: 'Percetakan',
    mingguKeRef: 1,
    isLocked: true,
  });

  // 2. SMKK (K3 KONSTRUKSI)
  const existingSmkkKw = getKwByCategory('SMKK');
  if (existingSmkkKw.length === 0 && paguMap.SMKK > 0) {
    ensureFixedCategoryReceipt('SMKK', paguMap.SMKK, {
      noBukti: `KW-SMKK/01/${yearStr}`,
      noSpb: `SPB-SMKK/01/${yearStr}`,
      tipe: 'SMKK',
      tanggal: `20/07/${yearStr}`,
      tanggalFormatted: `20 Juli ${yearStr}`,
      bulan: `Juli ${yearStr}`,
      uraian: `Pembayaran Lunas Pengadaan Perlengkapan Penerapan SMKK & K3 Konstruksi (Helm, Rompi, Sepatu Boot, Kotak P3K, Rambu K3, Tali Keselamatan) Revitalisasi ${school?.namaSekolah || 'Sekolah'}, Tahun ${yearStr}.`,
      penerimaNama: smkkStore.pemilikNama || 'Ridwan Hasan',
      penerimaPekerjaan: smkkStore.pekerjaan || 'Penyedia Perlengkapan K3',
      penerimaAlamat: smkkStore.alamat || school?.kabKota || '',
      namaToko: smkkStore.namaToko,
      items: [
        {
          namaBarang: 'Perlengkapan Penerapan SMKK (Helm Safety, Rompi Reflektor, Sepatu Boot, P3K, Rambu K3)',
          volume: 1,
          satuan: 'set',
          hargaSatuan: paguMap.SMKK,
          jumlah: paguMap.SMKK,
          tag: 'SMKK',
        },
      ],
      isPpn: paguMap.SMKK >= 2000000,
      isPph22: paguMap.SMKK >= 2000000,
      isPph23: false,
      ppnAmount: paguMap.SMKK >= 2000000 ? Math.round((paguMap.SMKK / 1.11) * 0.11) : 0,
      pph22Amount: paguMap.SMKK >= 2000000 ? Math.round((paguMap.SMKK / 1.11) * 0.015) : 0,
      pph23Amount: 0,
      kategoriBiayaPajak: 'Konstruksi',
      mingguKeRef: 1,
      isLocked: true,
    });
  } else if (existingSmkkKw.length > 0 && paguMap.SMKK > 0) {
    const sumSmkk = existingSmkkKw.reduce((s, k) => s + (k.nominal || 0), 0);
    const diffSmkk = paguMap.SMKK - sumSmkk;
    if (Math.abs(diffSmkk) > 0.01) {
      const lastSmkk = existingSmkkKw[existingSmkkKw.length - 1];
      const targetId = lastSmkk.id;
      const targetNewNominal = Math.max(0, (lastSmkk.nominal || 0) + diffSmkk);
      nextKwitansiList = nextKwitansiList.map((k) => {
        if (k.id === targetId) {
          return {
            ...k,
            nominal: targetNewNominal,
            items: k.items && k.items.length === 1 ? [{
              ...k.items[0],
              hargaSatuan: targetNewNominal,
              jumlah: targetNewNominal,
            }] : k.items,
          };
        }
        return k;
      });
      messages.push(`Diselaraskan kwitansi SMKK ${lastSmkk.noBukti} menjadi Rp ${targetNewNominal.toLocaleString('id-ID')} pas sesuai pagu.`);
    }
  }

  // 3. KONSULTAN PERENCANA
  ensureFixedCategoryReceipt('KONSULTAN_PERENCANA', paguMap.KONSULTAN_PERENCANA, {
    noBukti: `KONS-P/01/${yearStr}`,
    noSpb: `SPB-KONS-P/01/${yearStr}`,
    tipe: 'KONSULTAN',
    tanggal: `22/07/${yearStr}`,
    tanggalFormatted: `22 Juli ${yearStr}`,
    bulan: `Juli ${yearStr}`,
    uraian: `Pembayaran Lunas Honorarium Jasa Konsultansi Perencanaan Teknis, Desain & Gambar Kerja RAB Revitalisasi ${school?.namaSekolah || 'Sekolah'}, Tahun ${yearStr}.`,
    penerimaNama: perencanaStore.pemilikNama || school?.namaPerencana || 'Zulfahmi, ST',
    penerimaPekerjaan: perencanaStore.pekerjaan || 'Konsultan Perencana Teknis',
    penerimaAlamat: perencanaStore.alamat || school?.kabKota || '',
    namaToko: perencanaStore.namaToko,
    items: [
      {
        namaBarang: 'Honorarium Jasa Konsultansi Perencanaan Teknis & Penyusunan Dokumen RAB',
        volume: 1,
        satuan: 'ls',
        hargaSatuan: paguMap.KONSULTAN_PERENCANA,
        jumlah: paguMap.KONSULTAN_PERENCANA,
        tag: 'KONS-P',
      },
    ],
    isPpn: false,
    isPph22: false,
    isPph23: true,
    ppnAmount: 0,
    pph22Amount: 0,
    pph23Amount: Math.round(paguMap.KONSULTAN_PERENCANA * 0.02),
    kategoriBiayaPajak: 'Perencanaan_Pengelolaan',
    mingguKeRef: 1,
    isLocked: true,
  });

  // 4. KONSULTAN PENGAWAS
  ensureFixedCategoryReceipt('PENGAWAS', paguMap.PENGAWAS, {
    noBukti: `KONS-W/01/${yearStr}`,
    noSpb: `SPB-KONS-W/01/${yearStr}`,
    tipe: 'KONSULTAN',
    tanggal: `25/08/${yearStr}`,
    tanggalFormatted: `25 Agustus ${yearStr}`,
    bulan: `Agustus ${yearStr}`,
    uraian: `Pembayaran Lunas Honorarium Jasa Konsultansi Pengawasan Lapangan & Laporan Kemajuan Fisik Revitalisasi ${school?.namaSekolah || 'Sekolah'}, Tahun ${yearStr}.`,
    penerimaNama: pengawasStore.pemilikNama || school?.namaPengawas || 'M. Aris Syahputra, ST',
    penerimaPekerjaan: pengawasStore.pekerjaan || 'Konsultan Pengawas Lapangan',
    penerimaAlamat: pengawasStore.alamat || school?.kabKota || '',
    namaToko: pengawasStore.namaToko,
    items: [
      {
        namaBarang: 'Honorarium Jasa Konsultansi Pengawasan Teknis Lapangan & Supervisi Konstruksi',
        volume: 1,
        satuan: 'ls',
        hargaSatuan: paguMap.PENGAWAS,
        jumlah: paguMap.PENGAWAS,
        tag: 'KONS-W',
      },
    ],
    isPpn: false,
    isPph22: false,
    isPph23: true,
    ppnAmount: 0,
    pph22Amount: 0,
    pph23Amount: Math.round(paguMap.PENGAWAS * 0.02),
    kategoriBiayaPajak: 'Perencanaan_Pengelolaan',
    mingguKeRef: 5,
    isLocked: true,
  });

  // 5. PENGELOLA ADMINISTRASI SPJ
  // ATURAN KHUSUS: Mengalokasikan sisa kekurangan pagu ke ADM/04 (Pelunasan Akhir) agar tepat 100% pas
  const existingSpjKw = getKwByCategory('PENGELOLA_SPJ');
  if (existingSpjKw.length === 0 && paguMap.PENGELOLA_SPJ > 0) {
    ensureFixedCategoryReceipt('PENGELOLA_SPJ', paguMap.PENGELOLA_SPJ, {
      noBukti: `ADM/01/${yearStr}`,
      noSpb: `SPB-ADM/01/${yearStr}`,
      tipe: 'OPERASIONAL',
      tanggal: `28/08/${yearStr}`,
      tanggalFormatted: `28 Agustus ${yearStr}`,
      bulan: `Agustus ${yearStr}`,
      uraian: `Pembayaran Lunas Biaya Pengelolaan Administrasi, Penyusunan Dokumen SPJ/LPJ dan ATK Tim P2SP Revitalisasi ${school?.namaSekolah || 'Sekolah'}, Tahun ${yearStr}.`,
      penerimaNama: spjStore.pemilikNama || school?.namaKetuaP2SP || 'IRWAN YUSUF',
      penerimaPekerjaan: spjStore.pekerjaan || 'Pengelola Administrasi SPJ',
      penerimaAlamat: spjStore.alamat || school?.namaSekolah || '',
      namaToko: spjStore.namaToko,
      items: [
        {
          namaBarang: 'Biaya Pengelolaan Administrasi, Penggandaan Dokumen SPJ/LPJ & ATK Panitia P2SP',
          volume: 1,
          satuan: 'ls',
          hargaSatuan: paguMap.PENGELOLA_SPJ,
          jumlah: paguMap.PENGELOLA_SPJ,
          tag: 'SPJ',
        },
      ],
      isPpn: false,
      isPph22: false,
      isPph23: false,
      ppnAmount: 0,
      pph22Amount: 0,
      pph23Amount: 0,
      kategoriBiayaPajak: 'Perencanaan_Pengelolaan',
      mingguKeRef: 5,
      isLocked: true,
    });
  } else if (existingSpjKw.length > 0 && paguMap.PENGELOLA_SPJ > 0) {
    const sumSpj = existingSpjKw.reduce((s, k) => s + (k.nominal || 0), 0);
    const diffSpj = paguMap.PENGELOLA_SPJ - sumSpj;
    if (Math.abs(diffSpj) > 0.01) {
      // Prioritaskan kwitansi ADM/04 (Pelunasan Akhir) atau yang bernominal 0
      const targetSpj =
        existingSpjKw.find((k) => (k.nominal || 0) === 0 || /pelunasan/i.test(k.uraian || '') || (k.noBukti || '').includes('04')) ||
        existingSpjKw[existingSpjKw.length - 1];

      if (targetSpj) {
        const targetId = targetSpj.id;
        const targetNewNominal = Math.max(0, (targetSpj.nominal || 0) + diffSpj);
        nextKwitansiList = nextKwitansiList.map((k) => {
          if (k.id === targetId) {
            const defaultItemName =
              k.items?.[0]?.namaBarang ||
              k.uraian ||
              'Pembayaran Lunas (Pelunasan Akhir) Biaya Pengelolaan Administrasi SPJ & LPJ Kegiatan';
            return {
              ...k,
              nominal: targetNewNominal,
              items: [
                {
                  namaBarang: defaultItemName,
                  volume: 1,
                  satuan: 'ls',
                  hargaSatuan: targetNewNominal,
                  jumlah: targetNewNominal,
                  tag: 'SPJ',
                },
              ],
            };
          }
          return k;
        });
        messages.push(`Diselaraskan kwitansi pelunasan ${targetSpj.noBukti} (Pengelola SPJ) menjadi Rp ${targetNewNominal.toLocaleString('id-ID')} pas sesuai pagu.`);
      }
    }
  }

  // 6. BELANJA SIPLAH
  const existingSiplahKw = getKwByCategory('SIPLAH');
  if (existingSiplahKw.length === 0 && paguMap.SIPLAH > 0) {
    ensureFixedCategoryReceipt('SIPLAH', paguMap.SIPLAH, {
      noBukti: `KW-SIPLAH/01/${yearStr}`,
      noSpb: `SPB-SIPLAH/01/${yearStr}`,
      tipe: 'MATERIAL',
      tanggal: `10/09/${yearStr}`,
      tanggalFormatted: `10 September ${yearStr}`,
      bulan: `September ${yearStr}`,
      uraian: `Pembayaran Lunas Belanja Daring Pengadaan Barang Mitra SipLah Kemdikbud Revitalisasi ${school?.namaSekolah || 'Sekolah'}, Tahun ${yearStr}.`,
      penerimaNama: siplahStore.pemilikNama || 'Mitra SipLah',
      penerimaPekerjaan: siplahStore.pekerjaan || 'Mitra SipLah Kemdikbud',
      penerimaAlamat: siplahStore.alamat || 'Platform SipLah',
      namaToko: siplahStore.namaToko,
      items: [
        {
          namaBarang: 'Pengadaan Barang & Perlengkapan Daring via Mitra SipLah Kemdikbud',
          volume: 1,
          satuan: 'paket',
          hargaSatuan: paguMap.SIPLAH,
          jumlah: paguMap.SIPLAH,
          tag: 'SipLah',
        },
      ],
      isPpn: paguMap.SIPLAH >= 2000000,
      isPph22: paguMap.SIPLAH >= 2000000,
      isPph23: false,
      ppnAmount: paguMap.SIPLAH >= 2000000 ? Math.round((paguMap.SIPLAH / 1.11) * 0.11) : 0,
      pph22Amount: paguMap.SIPLAH >= 2000000 ? Math.round((paguMap.SIPLAH / 1.11) * 0.015) : 0,
      pph23Amount: 0,
      kategoriBiayaPajak: 'Siplah',
      mingguKeRef: 6,
      isLocked: true,
    });
  } else if (existingSiplahKw.length > 0 && paguMap.SIPLAH > 0) {
    const sumSiplah = existingSiplahKw.reduce((s, k) => s + (k.nominal || 0), 0);
    const diffSiplah = paguMap.SIPLAH - sumSiplah;
    if (Math.abs(diffSiplah) > 0.01 && Math.abs(diffSiplah) < 50000) {
      const lastSiplah = existingSiplahKw[existingSiplahKw.length - 1];
      const targetId = lastSiplah.id;
      const targetNewNominal = Math.max(0, (lastSiplah.nominal || 0) + diffSiplah);
      nextKwitansiList = nextKwitansiList.map((k) => {
        if (k.id === targetId) {
          return {
            ...k,
            nominal: targetNewNominal,
          };
        }
        return k;
      });
      messages.push(`Diselaraskan belanja SipLah ${lastSiplah.noBukti} pas sesuai pagu.`);
    }
  }

  // 7. FURNITUR (PINTU, JENDELA & MEBELER PABRIKASI)
  ensureFixedCategoryReceipt('FURNITUR_PINTU_JENDELA', paguMap.FURNITUR_PINTU_JENDELA, {
    noBukti: `Fur/01/${yearStr}`,
    noSpb: `SPB-Fur/01/${yearStr}`,
    tipe: 'PINTU_JENDELA',
    tanggal: `15/09/${yearStr}`,
    tanggalFormatted: `15 September ${yearStr}`,
    bulan: `September ${yearStr}`,
    uraian: `Pembayaran Lunas Fabrikasi & Pengadaan Kusen, Pintu Utama, Jendela Aluminium dan Mebeler Revitalisasi ${school?.namaSekolah || 'Sekolah'}, Tahun ${yearStr}.`,
    penerimaNama: kusenStore.pemilikNama || 'Tarmizi',
    penerimaPekerjaan: kusenStore.pekerjaan || 'Pengrajin Kayu & Mebeler',
    penerimaAlamat: kusenStore.alamat || school?.kabKota || '',
    namaToko: kusenStore.namaToko,
    items: [
      {
        namaBarang: 'Pengadaan & Fabrikasi Pintu Utama, Jendela Aluminium dan Mebeler Siswa/Guru',
        volume: 1,
        satuan: 'set',
        hargaSatuan: paguMap.FURNITUR_PINTU_JENDELA,
        jumlah: paguMap.FURNITUR_PINTU_JENDELA,
        tag: 'FUR',
        isBarangPabrikasi: true,
      },
    ],
    isPpn: paguMap.FURNITUR_PINTU_JENDELA >= 2000000,
    isPph22: paguMap.FURNITUR_PINTU_JENDELA >= 2000000,
    isPph23: false,
    ppnAmount: paguMap.FURNITUR_PINTU_JENDELA >= 2000000 ? Math.round((paguMap.FURNITUR_PINTU_JENDELA / 1.11) * 0.11) : 0,
    pph22Amount: paguMap.FURNITUR_PINTU_JENDELA >= 2000000 ? Math.round((paguMap.FURNITUR_PINTU_JENDELA / 1.11) * 0.015) : 0,
    pph23Amount: 0,
    kategoriBiayaPajak: 'Perabot',
    mingguKeRef: 7,
    isLocked: true,
  });

  // 8. UPAH TENAGA KERJA
  // Pastikan kwitansi UK/KW-UPAH ada sesuai pagu atau daftar upah
  const existingUpahKw = getKwByCategory('UPAH_KERJA');
  if (existingUpahKw.length === 0 && paguMap.UPAH_KERJA > 0) {
    const upahKw: KwitansiDocument = {
      id: `kw-sync-upah-${Date.now()}`,
      noBukti: `UK/01/${yearStr}`,
      noSpb: `SPB-UK/01/${yearStr}`,
      tipe: 'UPAH',
      tanggal: `26/07/${yearStr}`,
      tanggalFormatted: `26 Juli ${yearStr}`,
      bulan: `Juli ${yearStr}`,
      uraian: `Pembayaran Lunas Daftar Upah Kerja Harian Pekerja/Tukang Revitalisasi ${school?.namaSekolah || 'Sekolah'}, Tahun ${yearStr}.`,
      penerimaNama: school?.namaPelaksana || 'Budiman (Kepala Tukang)',
      penerimaPekerjaan: 'Kepala Tukang / Wakil Tenaga Kerja',
      penerimaAlamat: school?.alamat || school?.kabKota || '',
      items: [
        {
          namaBarang: 'Upah Tukang dan Pekerja Konstruksi Sesuai Rekapitulasi Daftar Hadir HOK',
          volume: 1,
          satuan: 'kegiatan',
          hargaSatuan: paguMap.UPAH_KERJA,
          jumlah: paguMap.UPAH_KERJA,
          tag: 'UPAH',
        },
      ],
      nominal: paguMap.UPAH_KERJA,
      isPpn: false,
      isPph22: false,
      isPph23: false,
      ppnAmount: 0,
      pph22Amount: 0,
      pph23Amount: 0,
      mingguKeRef: 1,
      isLocked: true,
    };
    nextKwitansiList.push(upahKw);
    messages.push(`Disinkronkan bukti pembayaran upah tenaga kerja sebesar Rp ${paguMap.UPAH_KERJA.toLocaleString('id-ID')}.`);
  } else if (existingUpahKw.length > 0 && paguMap.UPAH_KERJA > 0) {
    const sumUpah = existingUpahKw.reduce((s, k) => s + (k.nominal || 0), 0);
    const diffUpah = paguMap.UPAH_KERJA - sumUpah;
    if (Math.abs(diffUpah) > 0.01) {
      const lastUpahId = existingUpahKw[existingUpahKw.length - 1].id;
      nextKwitansiList = nextKwitansiList.map((k) => {
        if (k.id === lastUpahId) {
          const newNom = Math.max(0, (k.nominal || 0) + diffUpah);
          return {
            ...k,
            nominal: newNom,
            items: [{
              namaBarang: k.uraian,
              volume: 1,
              satuan: 'ls',
              hargaSatuan: newNom,
              jumlah: newNom,
              tag: 'UPAH',
            }],
          };
        }
        return k;
      });
      messages.push(`Diselaraskan bukti pembayaran upah kerja agar pas dengan pagu upah RAB.`);
    }
  }

  // 9. BAHAN MATERIAL (FLOATING BALANCER / PENUTUP KAS NIHIL)
  // Hitung total seluruh kategori non-material
  const nonMaterialSum = nextKwitansiList
    .filter((k) => classifyKwitansiCategory(k) !== 'BAHAN_MATERIAL')
    .reduce((s, k) => s + (k.nominal || 0), 0);

  const targetMaterialFinal = Math.max(0, totalAnggaran - nonMaterialSum);
  const materialKws = nextKwitansiList.filter((k) => classifyKwitansiCategory(k) === 'BAHAN_MATERIAL');

  if (materialKws.length === 0 && targetMaterialFinal > 0) {
    // Buat kwitansi material komprehensif
    const matKw: KwitansiDocument = {
      id: `kw-sync-mat-${Date.now()}`,
      noBukti: `01/KW-MAT/${yearStr}`,
      noSpb: `SPB-MAT/01/${yearStr}`,
      tipe: 'MATERIAL',
      tanggal: `05/08/${yearStr}`,
      tanggalFormatted: `5 Agustus ${yearStr}`,
      bulan: `Agustus ${yearStr}`,
      uraian: `Pembayaran Lunas Biaya Pembelian Bahan Material Bangunan (Semen, Pasir, Bata, Besi, Kayu, Keramik, Cat) Revitalisasi ${school?.namaSekolah || 'Sekolah'}, Tahun ${yearStr}, Daftar Terlampir.`,
      penerimaNama: materialStore.pemilikNama || 'Ridwan Hasan',
      penerimaPekerjaan: materialStore.pekerjaan || 'Pemilik Toko Bahan Bangunan',
      penerimaAlamat: materialStore.alamat || school?.kabKota || '',
      namaToko: materialStore.namaToko,
      items: [
        { namaBarang: 'Semen Portland (PC 40 kg)', volume: Math.round(targetMaterialFinal * 0.35 / 72000), satuan: 'Zak', hargaSatuan: 72000, jumlah: Math.round(targetMaterialFinal * 0.35), tag: 'MAT' },
        { namaBarang: 'Besi Beton Ulir & Polos SNI', volume: Math.round(targetMaterialFinal * 0.30 / 150000), satuan: 'Btg', hargaSatuan: 150000, jumlah: Math.round(targetMaterialFinal * 0.30), tag: 'MAT' },
        { namaBarang: 'Pasir Pasang & Batu Belah', volume: Math.round(targetMaterialFinal * 0.15 / 250000), satuan: 'm³', hargaSatuan: 250000, jumlah: Math.round(targetMaterialFinal * 0.15), tag: 'MAT' },
        { namaBarang: 'Keramik, Cat & Bahan Finishing Konstruksi', volume: 1, satuan: 'paket', hargaSatuan: targetMaterialFinal - (Math.round(targetMaterialFinal * 0.35) + Math.round(targetMaterialFinal * 0.30) + Math.round(targetMaterialFinal * 0.15)), jumlah: targetMaterialFinal - (Math.round(targetMaterialFinal * 0.35) + Math.round(targetMaterialFinal * 0.30) + Math.round(targetMaterialFinal * 0.15)), tag: 'MAT' },
      ],
      nominal: targetMaterialFinal,
      isPpn: targetMaterialFinal >= 2000000,
      isPph22: targetMaterialFinal >= 2000000,
      isPph23: false,
      ppnAmount: targetMaterialFinal >= 2000000 ? Math.round((targetMaterialFinal / 1.11) * 0.11) : 0,
      pph22Amount: targetMaterialFinal >= 2000000 ? Math.round((targetMaterialFinal / 1.11) * 0.015) : 0,
      pph23Amount: 0,
      kategoriBiayaPajak: 'Konstruksi',
      mingguKeRef: 2,
    };
    nextKwitansiList.push(matKw);
    messages.push(`Diterbitkan kwitansi material bangunan sebesar Rp ${targetMaterialFinal.toLocaleString('id-ID')} penyeimbang kas nihil.`);
  } else if (materialKws.length > 0 && targetMaterialFinal > 0) {
    const currentMatTotal = materialKws.reduce((s, k) => s + (k.nominal || 0), 0);
    const diffMat = targetMaterialFinal - currentMatTotal;
    if (Math.abs(diffMat) > 0.01) {
      const lastMatId = materialKws[materialKws.length - 1].id;
      nextKwitansiList = nextKwitansiList.map((k) => {
        if (k.id === lastMatId) {
          const adjustedNominal = Math.max(1000, (k.nominal || 0) + diffMat);
          const scale = k.nominal > 0 ? adjustedNominal / k.nominal : 1;
          const updatedItems = (k.items || []).map((it) => ({
            ...it,
            jumlah: Math.round(it.jumlah * scale),
          }));
          return {
            ...k,
            nominal: adjustedNominal,
            items: updatedItems.length > 0 ? updatedItems : [{
              namaBarang: k.uraian,
              volume: 1,
              satuan: 'ls',
              hargaSatuan: adjustedNominal,
              jumlah: adjustedNominal,
              tag: 'MAT',
            }],
          };
        }
        return k;
      });
      messages.push(`Kwitansi material terakhir disesuaikan sebesar Rp ${Math.abs(diffMat).toLocaleString('id-ID')} agar total pengeluaran tepat sama dengan Pagu Anggaran (Rp 0 Selisih).`);
    }
  }

  const finalTotal = nextKwitansiList.reduce((s, k) => s + (k.nominal || 0), 0);

  return {
    updatedKwitansiList: nextKwitansiList,
    updatedWageReports: nextWageReports,
    messages,
    totalReconciledNominal: finalTotal,
  };
}
