import {
  KwitansiDocument,
  WeeklyWageReport,
  ProjectProgressWeek,
} from '../../types';
import { parseTxDateToIso, resolveWeekDates } from '../../utils/monthHelper';

/**
 * Menghitung Cadangan Upah Terkunci (Labor Reserve) untuk minggu berjalan.
 * Memastikan uang untuk tukang diprioritaskan sebelum belanja material.
 */
export function calculateLockedLaborReserve(
  wageReports: WeeklyWageReport[],
  targetWeek: number
): number {
  const report = wageReports.find((r) => r.mingguKe === targetWeek);
  return report ? report.totalUpah : 0;
}

/**
 * Memastikan kwitansi material TIDAK dipecah menjadi dua baris/kwitansi (Invarian 3).
 * Bila kas tidak cukup, pembayaran digeser utuh ke minggu berikutnya (bukan di-split).
 */
export function splitMaterialPurchases(
  kw: KwitansiDocument,
  availableCash: number,
  laborReserve: number
): KwitansiDocument[] {
  // Sesuai Invarian 3: Transaksi TIDAK BOLEH di-split ke -part1/-part2.
  // Seluruh nominal kwitansi dipertahankan utuh.
  return [kw];
}

export interface CashflowShiftDetail {
  id: string;
  noBukti?: string;
  uraian: string;
  originalDate: string;
  originalWeek: number;
  newDate: string;
  newWeek: number;
  nominal: number;
}

export interface CashflowShiftResult {
  shiftedKwitansiList: KwitansiDocument[];
  hasShiftedTransactions: boolean;
  shiftedCount: number;
  exceedsUsagePeriodWarning: boolean;
  usagePeriodLimit?: string;
  shiftedTransactionDetails: CashflowShiftDetail[];
}

/**
 * Invarian 3: Menyelaraskan kwitansi dengan arus kas (cashflow) bank Termin 1 & Termin 2.
 * Jika pengeluaran pada tanggal tertentu melebihi dana Termin 1 yang tersedia di bank,
 * kwitansi tersebut DIGESER UTUH ke minggu saat Termin 2 cair (tanpa memotong/memecah nominal).
 * Tanggal pada kwitansi diperbarui dan menjadi satu-satunya sumber kebenaran bagi BKU, BKT, dan BKB.
 */
export function alignAndShiftTransactionsForCashflow(params: {
  kwitansiList: KwitansiDocument[];
  school?: any;
  progressWeeks?: ProjectProgressWeek[];
  termin2DisbursementDate?: string;
  termin2WeekNumber?: number;
}): CashflowShiftResult {
  const { kwitansiList, school, progressWeeks = [], termin2DisbursementDate, termin2WeekNumber } = params;
  if (!kwitansiList || kwitansiList.length === 0) {
    return {
      shiftedKwitansiList: [],
      hasShiftedTransactions: false,
      shiftedCount: 0,
      exceedsUsagePeriodWarning: false,
      shiftedTransactionDetails: [],
    };
  }

  const yearStr = school?.tahunAnggaran?.trim() || '2026';
  const totalAnggaran = school?.totalAnggaran || 0;
  const t1Persen = school?.termin1Persen ?? 70;
  const termin1Nilai = school?.termin1Nilai ?? Math.round((totalAnggaran * t1Persen) / 100);

  // Tentukan tanggal pencairan Termin 2 dalam format ISO (YYYY-MM-DD)
  let t2Iso = termin2DisbursementDate ? parseTxDateToIso(termin2DisbursementDate) : '';
  let t2WeekNum = termin2WeekNumber;

  if (!t2Iso && school?.termin2Tanggal) {
    t2Iso = parseTxDateToIso(school.termin2Tanggal);
  }

  if (!t2WeekNum && progressWeeks.length > 0) {
    if (t2Iso) {
      const foundW = progressWeeks.find((w) => {
        const resolved = resolveWeekDates(w, yearStr);
        return t2Iso! >= resolved.startDate && t2Iso! <= resolved.endDate;
      });
      if (foundW) t2WeekNum = foundW.mingguKe;
    }
    if (!t2WeekNum) {
      // Cari minggu di mana progres kumulatif mendekati atau melewati persentase Termin 1 (misal 70%)
      const thresholdBobot = Math.min(70, t1Persen);
      const foundProgressWeek = progressWeeks.find(
        (w) => (w.cumulativeProgress ?? (w as any).progressKumulatif ?? 0) >= thresholdBobot
      );
      if (foundProgressWeek) {
        t2WeekNum = foundProgressWeek.mingguKe;
      } else {
        // Fallback wajar: minggu ke-8 atau pertengahan jadwal
        t2WeekNum = Math.min(progressWeeks.length, Math.max(2, Math.floor(progressWeeks.length * 0.55)));
      }
    }
  }

  if (!t2Iso && t2WeekNum && progressWeeks.length > 0) {
    const t2W = progressWeeks.find((w) => w.mingguKe === t2WeekNum) || progressWeeks[Math.min(t2WeekNum - 1, progressWeeks.length - 1)];
    if (t2W) {
      const resolvedT2W = resolveWeekDates(t2W, yearStr);
      const resW = getDateInWeek(resolvedT2W.startDate, 1); // Selasa minggu Termin 2
      t2Iso = resW.dateIso;
    }
  }

  if (!t2Iso) {
    t2Iso = `${yearStr}-09-01`;
  }
  if (!t2WeekNum) {
    t2WeekNum = 8;
  }

  // Tentukan batas akhir periode penggunaan dana
  let usageEndIso = '';
  if (school?.periodePenggunaan) {
    const matchDates = school.periodePenggunaan.match(/(\d{1,2}\s+[A-Za-z]+\s+\d{4}|\d{4}-\d{2}-\d{2})/g);
    if (matchDates && matchDates.length >= 2) {
      usageEndIso = parseTxDateToIso(matchDates[1]);
    } else if (matchDates && matchDates.length === 1) {
      usageEndIso = parseTxDateToIso(matchDates[0]);
    }
  }
  if (!usageEndIso && progressWeeks.length > 0) {
    const lastW = progressWeeks[progressWeeks.length - 1];
    const resolvedLast = resolveWeekDates(lastW, yearStr);
    usageEndIso = resolvedLast.endDate || resolvedLast.startDate;
  }

  const shiftDetails: CashflowShiftDetail[] = [];
  let runningT1Expenditure = 0;
  let exceedsUsagePeriodWarning = false;

  // Urutkan kwitansi berdasarkan minggu & tanggal asli
  const sortedKw = [...kwitansiList].sort((a, b) => {
    const wA = extractWeekNumberFromKwitansi(a, progressWeeks, yearStr) ?? 1;
    const wB = extractWeekNumberFromKwitansi(b, progressWeeks, yearStr) ?? 1;
    if (wA !== wB) return wA - wB;
    const isoA = parseTxDateToIso(a.tanggal);
    const isoB = parseTxDateToIso(b.tanggal);
    return isoA.localeCompare(isoB);
  });

  const shiftedKwitansiList: KwitansiDocument[] = [];

  for (const kw of sortedKw) {
    const kwNominal = Math.round(kw.nominal || 0);
    const origIso = parseTxDateToIso(kw.tanggal);
    const origWeek = extractWeekNumberFromKwitansi(kw, progressWeeks, yearStr) ?? 1;

    const isBeforeT2 = origIso < t2Iso;

    if (isBeforeT2) {
      if (runningT1Expenditure + kwNominal <= termin1Nilai) {
        // Cukup dari Termin 1, tidak perlu digeser
        runningT1Expenditure += kwNominal;
        shiftedKwitansiList.push(kw);
        continue;
      }

      // Dana Termin 1 TIDAK CUKUP.
      // Sesuai Invarian 3: Transaksi DIGESER UTUH ke minggu Termin 2 cair
      let targetWeekNum = t2WeekNum;
      let targetWeekObj = progressWeeks.find((w) => w.mingguKe === targetWeekNum);
      if (!targetWeekObj && progressWeeks.length > 0) {
        targetWeekObj = progressWeeks[Math.min(targetWeekNum - 1, progressWeeks.length - 1)];
      }

      let newDateRes;
      if (targetWeekObj) {
        // Letakkan di hari pencairan atau setelahnya pada minggu Termin 2 cair
        const resolvedTarget = resolveWeekDates(targetWeekObj, yearStr);
        newDateRes = getDateInWeek(resolvedTarget.startDate, 2);
      } else {
        const [tY, tM, tD] = t2Iso.split('-');
        newDateRes = {
          dateIso: t2Iso,
          dateSlash: `${tD}/${tM}/${tY}`,
          dateFormatted: t2Iso,
          bulan: `September ${yearStr}`,
        };
      }

      // Pastikan tanggal pergeseran tidak lebih awal dari tanggal pencairan Termin 2
      if (newDateRes.dateIso < t2Iso) {
        const [tY, tM, tD] = t2Iso.split('-');
        newDateRes = {
          dateIso: t2Iso,
          dateSlash: `${tD}/${tM}/${tY}`,
          dateFormatted: t2Iso,
          bulan: newDateRes.bulan,
        };
      }

      // Cek apakah tanggal baru melewati periode penggunaan dana
      if (usageEndIso && newDateRes.dateIso > usageEndIso) {
        exceedsUsagePeriodWarning = true;
      }

      const updatedKw: KwitansiDocument = {
        ...kw,
        mingguKeRef: targetWeekNum,
        tanggal: newDateRes.dateSlash,
        tanggalFormatted: newDateRes.dateFormatted,
        bulan: newDateRes.bulan,
      };

      shiftDetails.push({
        id: kw.id,
        noBukti: kw.noBukti,
        uraian: kw.uraian,
        originalDate: kw.tanggal,
        originalWeek: origWeek,
        newDate: newDateRes.dateSlash,
        newWeek: targetWeekNum,
        nominal: kwNominal,
      });

      shiftedKwitansiList.push(updatedKw);
    } else {
      // Transaksi sudah berada di atau setelah Termin 2 cair
      shiftedKwitansiList.push(kw);
    }
  }

  return {
    shiftedKwitansiList,
    hasShiftedTransactions: shiftDetails.length > 0,
    shiftedCount: shiftDetails.length,
    exceedsUsagePeriodWarning,
    usagePeriodLimit: usageEndIso,
    shiftedTransactionDetails: shiftDetails,
  };
}

/**
 * Memeriksa apakah suatu transaksi merupakan pembayaran pasti/khusus yang TIDAK BOLEH di-split
 * (seperti Konsultan Perencana, Pengawas, Pengelola SPJ, Belanja SMKK, Belanja SipLah, Belanja Cetak, serta Upah Tukang).
 * Transaksi jenis ini wajib dicatat dan dibayarkan penuh / utuh.
 */
export function isFixedNonSplitPayment(tx: { noBukti?: string; uraian?: string }): boolean {
  const combined = `${tx.noBukti || ''} ${tx.uraian || ''}`.toLowerCase();

  // 1. Konsultan Perencana Teknis
  if (/perencana|kons-p|jasa.*perencanaan|honor.*perencana/i.test(combined)) return true;

  // 2. Konsultan Pengawas Lapangan
  if (/pengawas|kons-w|jasa.*pengawasan|honor.*pengawas/i.test(combined)) return true;

  // 3. Pengelola SPJ / LPJ / Administrasi
  if (/pengelola|spj|lpj|administrasi|tim\s*teknis|tim\s*pelaksana|p2sp|\badm\b/i.test(combined)) return true;

  // 4. Belanja SMKK / K3 Konstruksi
  if (/smkk|k3|keselamatan|helm|rompi|boot|p3k|rambu/i.test(combined)) return true;

  // 5. Belanja SipLah (Daring)
  if (/siplah|toko\s*daring|mitra\s*siplah|blibli|eureka|telkom/i.test(combined)) return true;

  // 6. Belanja Cetak / Percetakan / Penggandaan / Banner / Prasasti / Papan Nama
  if (/cetak|percetakan|penggandaan|fotocopy|banner|prasasti|papan\s*nama|baliho|\bctk\b/i.test(combined)) return true;

  // 7. Upah Tukang / Pekerja
  if (/upah|tukang|pekerja|mandor|borongan/i.test(combined)) return true;

  return false;
}

/**
 * Memeriksa apakah transaksi adalah murni belanja bahan material konstruksi.
 * HANYA belanja bahan material yang diperbolehkan untuk di-split sesuai ketersediaan kas fisik.
 */
export function isMaterialOnlyPurchase(tx: { noBukti?: string; uraian?: string }): boolean {
  if (isFixedNonSplitPayment(tx)) {
    return false;
  }

  const combined = `${tx.noBukti || ''} ${tx.uraian || ''}`.toLowerCase();

  // Bukti kode material standar
  if (/kw-mat|spb-.*mat|\bmat\b|tb\.|toko\s*bangunan|toko\s*besi/i.test(combined)) {
    return true;
  }

  // Kata kunci material konstruksi fisik
  if (/bahan|material|semen|pasir|bata|besi|baja|wiremesh|keramik|granit|cat|kayu|paku|kawat|batu|genteng|spandek|hollow|gypsum|kalsiboard|pipa|pintu|kusen|jendela|kaca|rab|belanja\s*material/i.test(combined)) {
    return true;
  }

  return false;
}

/**
 * Membersihkan uraian transaksi dari catatan pemecahan tahap buatan sistem
 * seperti "(Tahap 1 / Sesuai Sisa Kas)", "(Tahap 2 / Pelunasan Sisa)", dll.
 * Menghasilkan deskripsi belanja material yang bersih dan wajar (natural) layaknya belanja langsung.
 */
export function cleanNaturalUraian(uraian: string): string {
  if (!uraian) return '';
  return uraian
    .replace(/\s*\(\s*Tahap\s*[12]\s*\/[^\)]*\)/gi, '')
    .replace(/\s*\(\s*Tahap\s*[12][^\)]*\)/gi, '')
    .replace(/\s*-\s*Tahap\s*[12][^-]*/gi, '')
    .trim();
}

/**
 * Menurunkan nomor SPB yang selaras dengan nomor bukti kwitansi tanpa tanda pemecahan khusus.
 */
export function deriveSpbFromBukti(noBukti?: string, defaultSpb?: string): string {
  if (!noBukti || noBukti === '-') return defaultSpb || '';
  const cleanBukti = noBukti.replace(/-B$/, '').trim();

  // Pattern XX/KW-MAT/YYYY -> SPB-XX/MAT/YYYY
  const matchMat = cleanBukti.match(/^(\d{1,3})\/KW-MAT\/(.*)$/i);
  if (matchMat) {
    return `SPB-${matchMat[1]}/MAT/${matchMat[2]}`;
  }

  // Pattern XX/KW-ALAT/YYYY -> SPB-XX/ALAT/YYYY
  const matchAlat = cleanBukti.match(/^(\d{1,3})\/KW-ALAT\/(.*)$/i);
  if (matchAlat) {
    return `SPB-${matchAlat[1]}/ALAT/${matchAlat[2]}`;
  }

  // Pattern XX/KW-SMKK/YYYY -> SPB-XX/SMKK/YYYY
  const matchSmkk = cleanBukti.match(/^(\d{1,3})\/KW-SMKK\/(.*)$/i);
  if (matchSmkk) {
    return `SPB-${matchSmkk[1]}/SMKK/${matchSmkk[2]}`;
  }

  // Pattern Fur/XX/YYYY -> SPB-Fur/XX/YYYY
  const matchFur = cleanBukti.match(/^Fur\/(\d{1,3})\/(.*)$/i);
  if (matchFur) {
    return `SPB-Fur/${matchFur[1]}/${matchFur[2]}`;
  }

  // Pattern SipLah/XX/YYYY -> SPB-SipLah/XX/YYYY
  const matchSip = cleanBukti.match(/^SipLah\/(\d{1,3})\/(.*)$/i);
  if (matchSip) {
    return `SPB-SipLah/${matchSip[1]}/${matchSip[2]}`;
  }

  // Pattern CTK/XX/YYYY -> SPB-CTK/XX/YYYY
  const matchCtk = cleanBukti.match(/^CTK\/(\d{1,3})\/(.*)$/i);
  if (matchCtk) {
    return `SPB-CTK/${matchCtk[1]}/${matchCtk[2]}`;
  }

  return (defaultSpb || '').replace(/-B$/, '').trim();
}

/**
 * Mengurutkan dan memberi nomor bukti berurutan secara otomatis untuk seluruh pembelanjaan material
 * (KW-MAT / Fur) dalam BKU maupun BKT tanpa ada akhiran "-B", tanpa melompati nomor,
 * sehingga transaksi split langsung melanjutkan nomor berikutnya secara normal dan konsisten.
 */
export function renumberMaterialTransactionsChronologically<
  T extends {
    noBukti?: string;
    uraian?: string;
    tanggal?: string;
    tanggalObj?: string;
    jenis?: string;
    pengeluaran?: number;
    penerimaan?: number;
    pemasukan?: number;
  }
>(list: T[], targetYear: string = '2026'): T[] {
  const safeYear = targetYear?.trim() || '2026';
  let matSeq = 0;
  let furSeq = 0;

  return list.map((tx) => {
    // Lewati transaksi penerimaan / penarikan kas
    if (tx.jenis === 'PENERIMAAN' || (tx.pemasukan && tx.pemasukan > 0)) {
      return {
        ...tx,
        uraian: cleanNaturalUraian(tx.uraian || ''),
        noBukti: (tx.noBukti || '').replace(/-B$/, '').trim(),
      };
    }

    // Lewati pembayaran pasti (Konsultan, Pengawas, SPJ, SMKK, SipLah, Cetak, Upah)
    if (isFixedNonSplitPayment(tx)) {
      return {
        ...tx,
        uraian: cleanNaturalUraian(tx.uraian || ''),
        noBukti: (tx.noBukti || '').replace(/-B$/, '').trim(),
      };
    }

    const bukti = (tx.noBukti || '').replace(/-B$/, '').trim();
    const uraian = cleanNaturalUraian(tx.uraian || '');
    const combined = `${bukti} ${uraian}`.toLowerCase();

    // Kusen, Pintu & Jendela Aluminium (Fur) - Must be actual doors/windows/frames and NOT general building materials
    const hasMaterialLeak = /semen|pasir|bata|batu|keramik|besi|paku|kayu kaso|kaso|galvalum|spandek/i.test(combined);
    const isFur = (/fur\/|pintu|jendela|kusen|aluminium/i.test(combined) || /pintu|jendela|kusen/i.test(uraian)) && !hasMaterialLeak;
    if (isFur) {
      furSeq++;
      const padSeq = String(furSeq).padStart(2, '0');
      return {
        ...tx,
        noBukti: `Fur/${padSeq}/${safeYear}`,
        uraian,
      };
    }

    // Bahan Material Bangunan (KW-MAT)
    const isMat = /kw-mat|kwt-mat|\bmat\b|material|bahan|semen|pasir|bata|batu|keramik|besi|cat|kayu/i.test(combined) || isMaterialOnlyPurchase(tx);
    if (isMat) {
      matSeq++;
      const padSeq = String(matSeq).padStart(2, '0');
      return {
        ...tx,
        noBukti: `${padSeq}/KW-MAT/${safeYear}`,
        uraian,
      };
    }

    return {
      ...tx,
      uraian,
      noBukti: bukti,
    };
  });
}

export function getDateInWeek(startDateIso: string, dayOffset: number) {
  const sBase = new Date(`${startDateIso}T00:00:00`);
  const clampedOffset = Math.min(6, Math.max(0, dayOffset));
  const targetDate = new Date(sBase.getTime() + clampedOffset * 86400000);

  const d = String(targetDate.getDate()).padStart(2, '0');
  const m = targetDate.getMonth();
  const y = targetDate.getFullYear();
  const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const namaHari = dayNames[targetDate.getDay()];
  const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const fullMonths = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  return {
    namaHari,
    dateSlash: `${d}/${String(m + 1).padStart(2, '0')}/${y}`,
    dateFormatted: `${d} ${shortMonths[m]} ${y}`,
    bulan: `${fullMonths[m]} ${y}`,
    dateIso: `${y}-${String(m + 1).padStart(2, '0')}-${d}`,
  };
}

/**
 * Universal Locked Status Resolver:
 * A receipt is locked if isLocked is true or if it's an un-unlocked manual/custom receipt.
 * If explicitly set to isLocked === false, it is UNLOCKED.
 */
export function isReceiptLocked(k?: { isLocked?: boolean; isManual?: boolean; id?: string } | null): boolean {
  if (!k) return false;
  if (k.isLocked === false) return false;
  return Boolean(k.isLocked || k.isManual || (k.id || '').includes('manual') || (k.id || '').includes('custom'));
}

/**
 * Universal Week Number Extractor:
 * Accurately extracts the target week number (1..52) from kwitansi document attributes,
 * receipts reference, evidence number (noBukti), or transaction descriptions.
 */
export function extractWeekNumberFromKwitansi(
  k: KwitansiDocument,
  progressWeeks?: ProjectProgressWeek[],
  schoolYear = '2026'
): number | null {
  if (typeof k.mingguKeRef === 'number' && k.mingguKeRef > 0) {
    return k.mingguKeRef;
  }

  const bukti = (k.noBukti || '').trim();
  const spb = (k.noSpb || '').trim();
  const combinedBukti = `${bukti} ${spb}`;

  // UK/01/2026 is week-based labor wages
  const matchBuktiWeekly = combinedBukti.match(/(?:UK)\/(\d{1,2})\//i);
  if (matchBuktiWeekly) {
    const num = parseInt(matchBuktiWeekly[1], 10);
    if (!isNaN(num) && num > 0 && num <= 52) return num;
  }

  // M1-01/2026, M2-01/2026, M1/..., etc.
  const matchM = combinedBukti.match(/\bM(\d{1,2})[-\/]/i);
  if (matchM) {
    const num = parseInt(matchM[1], 10);
    if (!isNaN(num) && num > 0 && num <= 52) return num;
  }

  // Sequence numbers for materials/alat/smkk: e.g. 11/KW-MAT/2026 -> Week 1 (11/10 = 1), 21/KW-MAT/2026 -> Week 2 (21/10 = 2)
  // Also handles 01/KW-MAT/2026 or 01/KW-SMKK/2026 (Papan nama & SMKK Week 1)
  const matchSeq = combinedBukti.match(/(?:^|\b|SPB-)(\d{1,3})\/(?:KW-MAT|KW-ALAT|KW-SMKK|MAT|ALAT|SMKK)/i);
  if (matchSeq) {
    const seq = parseInt(matchSeq[1], 10);
    if (!isNaN(seq)) {
      if (seq < 10) return 1;
      const wFromSeq = Math.floor(seq / 10);
      if (wFromSeq > 0 && wFromSeq <= 52) return wFromSeq;
    }
  }

  // ID containing -m1- or -w1- or -m1 or -w1 at boundaries
  const matchId = (k.id || '').match(/(?:-m|-w)(\d{1,2})(?:-|_|\b|$)/i);
  if (matchId) {
    const num = parseInt(matchId[1], 10);
    if (!isNaN(num) && num > 0 && num <= 52) return num;
  }

  // Uraian or SPB description containing Minggu Ke-X or Minggu X
  const allText = `${k.uraian || ''} ${k.keteranganSpb || ''}`;
  const matchUraian = allText.match(/Minggu\s*(?:Ke-|\s*)(\d{1,2})\b/i);
  if (matchUraian) {
    const num = parseInt(matchUraian[1], 10);
    if (!isNaN(num) && num > 0 && num <= 52) return num;
  }

  return null;
}
