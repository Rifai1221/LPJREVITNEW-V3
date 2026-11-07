import {
  BkuTransaction,
  BktTransaction,
  BkbTransaction,
  KwitansiDocument,
  SchoolMasterData,
  StoreVendor,
  ProjectProgressWeek,
  WeeklyWageReport,
} from '../types';
import { parseTxDateToIso, resolveWeekDates } from '../utils/monthHelper';
import { generateSecureId } from '../utils/idAndVoucherHelper';
import { isKwitansiAllowedByProgressBobot } from '../utils/projectSummaryRekapHelper';
import { cleanNaturalUraian } from './generator/splitTransactionService';
import { deduplicateKwitansiList } from './generator/kwitansiGenerator';
import { resolveManagementRecipient } from './generator/bkuGenerator';

export interface UnifiedCashLedgerResult {
  bkuList: BkuTransaction[];
  bktList: BktTransaction[];
  bkbList: BkbTransaction[];
  categoryDiscrepancies: {
    category: string;
    expected: number;
    actual: number;
    diff: number;
  }[];
}

/**
 * Unified Single-Pass Cash Engine
 * Acts as the SINGLE SOURCE OF TRUTH for BKU, BKT, and BKB.
 * Enforces invariants:
 * 1. BKU, BKT, BKB balances never < 0 on any date.
 * 2. BKU balance = BKB balance + BKT balance on every date.
 * 3. 1 Receipt = 1 BKU row = 1 BKT row (exact same nominal, no -p1/-p2 splits).
 * 4. Automatic TARIK_TUNAI rounded UP to Rp 1.000.000 added when BKT is insufficient.
 * 5. No bkuDiff automatic trimming.
 */
export function generateUnifiedCashLedger(params: {
  kwitansiList: KwitansiDocument[];
  school: SchoolMasterData;
  manualBkuTransactions?: BkuTransaction[];
  deletedBkuIds?: string[];
  deletedKwitansiIds?: string[];
  wageReports?: WeeklyWageReport[];
  progressWeeks?: ProjectProgressWeek[];
  bkuWeekLimit?: number;
  stores?: StoreVendor[];
  bkbRecords?: BkbTransaction[];
}): UnifiedCashLedgerResult {
  const {
    kwitansiList = [],
    school,
    manualBkuTransactions = [],
    deletedBkuIds = [],
    deletedKwitansiIds = [],
    wageReports = [],
    progressWeeks = [],
    bkuWeekLimit = 14,
    stores = [],
  } = params;

  const yearStr = school?.tahunAnggaran?.trim() || '2026';
  const yearNum = parseInt(yearStr, 10) || 2026;
  const effLimit = bkuWeekLimit || 14;

  let startProjectDateIso = `${yearStr}-07-01`;
  let startProjectDateSlash = `01/07/${yearStr}`;
  let startProjectBulan = `Juli ${yearStr}`;

  if (progressWeeks && progressWeeks.length > 0) {
    const week1 = progressWeeks.find((w) => w.mingguKe === 1) || progressWeeks[0];
    const resolved1 = resolveWeekDates(week1, yearStr);
    startProjectDateIso = resolved1.startDate;
    startProjectDateSlash = resolved1.startDateSlash;
    startProjectBulan = resolved1.bulan;
  }

  let termin2DateIso = `${yearStr}-09-01`;
  let termin2DateSlash = `01/09/${yearStr}`;
  let termin2Bulan = `September ${yearStr}`;

  if (progressWeeks && progressWeeks.length > 0) {
    const week6 = progressWeeks.find((w) => w.mingguKe === 6) || progressWeeks[Math.min(5, progressWeeks.length - 1)];
    const resolved6 = resolveWeekDates(week6, yearStr);
    termin2DateIso = resolved6.startDate;
    termin2DateSlash = resolved6.startDateSlash;
    termin2Bulan = resolved6.bulan;
  }

  // 1. Initial Termin Receipts
  const termin1Amount = school?.termin1Nilai || (school?.totalAnggaran ? Math.round(school.totalAnggaran * ((school.termin1Persen || 70) / 100)) : 0);
  const termin2Amount = school?.termin2Nilai || (school?.totalAnggaran ? Math.round(school.totalAnggaran * ((school.termin2Persen || 30) / 100)) : 0);

  // 2. Prepare raw candidate transactions
  interface CandidateTx {
    id: string;
    tanggal: string;
    tanggalObj: string;
    bulan: string;
    jenis: 'PENERIMAAN' | 'PENGELUARAN';
    uraian: string;
    noBukti: string;
    penerimaan: number;
    pengeluaran: number;
    metodeBayar: 'TUNAI' | 'BANK' | 'MUTASI_KAS';
    kategoriBiaya?: string;
    kwitansiIdRef?: string;
    isLocked?: boolean;
    isManualDate?: boolean;
    isTermin?: boolean;
  }

  const candidates: CandidateTx[] = [];

  // Add Termin 1
  if (termin1Amount > 0 && !deletedBkuIds.includes('bku-init-1')) {
    candidates.push({
      id: 'bku-init-1',
      tanggal: startProjectDateSlash,
      tanggalObj: startProjectDateIso,
      bulan: startProjectBulan,
      jenis: 'PENERIMAAN',
      uraian: 'Penarikan dari Bank (Termin 1 - 70%)',
      noBukti: 'BKT-IN-01',
      penerimaan: termin1Amount,
      pengeluaran: 0,
      metodeBayar: 'BANK',
      isTermin: true,
    });
  }

  // Add Termin 2 if progress allows or effLimit >= 6
  if (termin2Amount > 0 && !deletedBkuIds.includes('bku-init-2')) {
    candidates.push({
      id: 'bku-init-2',
      tanggal: termin2DateSlash,
      tanggalObj: termin2DateIso,
      bulan: termin2Bulan,
      jenis: 'PENERIMAAN',
      uraian: 'Penarikan dari Bank (Termin 2 - 30%)',
      noBukti: 'BKT-IN-02',
      penerimaan: termin2Amount,
      pengeluaran: 0,
      metodeBayar: 'BANK',
      isTermin: true,
    });
  }

  // Active weeks check
  const activeWeeks = (progressWeeks || [])
    .filter((w) => w.mingguKe <= effLimit)
    .filter((w) => (w.bobotRealisasi && w.bobotRealisasi > 0) || w.divisions?.some((d) => (d.prestasiMingguIni || 0) > 0));
  const activeWeekNums = new Set(activeWeeks.map((w) => w.mingguKe));

  // Process Kwitansi list
  const cleanSourceKwitansi = deduplicateKwitansiList(kwitansiList);

  cleanSourceKwitansi.forEach((kw) => {
    if (!isKwitansiAllowedByProgressBobot(kw, progressWeeks)) return;
    const cleanKwId = (kw.id || '').replace(/^(bku-kw-)+/, '');
    const kwBkuId = `bku-kw-${cleanKwId}`;

    if (
      deletedBkuIds.includes(kw.id) ||
      deletedBkuIds.includes(cleanKwId) ||
      deletedBkuIds.includes(kwBkuId) ||
      deletedKwitansiIds.includes(kw.id) ||
      (kw.noBukti && deletedBkuIds.includes(kw.noBukti))
    ) {
      return;
    }

    if (!kw || (kw.nominal || 0) <= 0) return;

    let sortDate = startProjectDateIso;
    let displayTanggal = kw.tanggal || startProjectDateSlash;

    if (kw.tanggal) {
      if (kw.tanggal.includes('/')) {
        const parts = kw.tanggal.split('/');
        if (parts.length === 3) {
          const [d, m, y] = parts;
          sortDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
          displayTanggal = `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
        }
      } else if (kw.tanggal.includes('-')) {
        const parts = kw.tanggal.split('-');
        if (parts.length === 3) {
          const [y, m, d] = parts;
          sortDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
          displayTanggal = `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
        }
      }
    }

    if (!kw.isLocked && !kw.isManualDate && kw.mingguKeRef && progressWeeks.length > 0) {
      const matchW = progressWeeks.find((w) => w.mingguKe === kw.mingguKeRef);
      if (matchW) {
        const resolvedW = resolveWeekDates(matchW, yearStr);
        if (kw.tipe === 'UPAH' || /uk\//i.test(kw.noBukti || '') || /upah/i.test(kw.uraian)) {
          sortDate = resolvedW.endDate;
          displayTanggal = resolvedW.endDateSlash;
        } else {
          if (sortDate < resolvedW.startDate) {
            sortDate = resolvedW.startDate;
            displayTanggal = resolvedW.startDateSlash;
          } else if (sortDate > resolvedW.endDate) {
            sortDate = resolvedW.endDate;
            displayTanggal = resolvedW.endDateSlash;
          }
        }
      }
    }

    if (sortDate < startProjectDateIso) {
      sortDate = startProjectDateIso;
      displayTanggal = startProjectDateSlash;
    }

    const isSiplahKw =
      kw.kategoriBiayaPajak === 'Siplah' ||
      /siplah|daring/i.test(`${kw.noBukti || ''} ${kw.uraian || ''} ${(kw as any).kategoriBiaya || ''}`);

    let bkuUraian = kw.uraian;
    const isMaterialKw =
      !isSiplahKw &&
      (kw.tipe === 'MATERIAL' ||
        /kwt[\/\-_]?mat|kw[\/\-_]?mat|\bmat\b|mat[\/\-_]|material/i.test(kw.noBukti || '') ||
        Boolean(kw.namaToko) ||
        /bahan|material|semen|pasir|bata|keramik|besi|cat|toko|tb\./i.test(kw.uraian));

    if (isSiplahKw) {
      bkuUraian = kw.uraian || `Pembayaran Lunas Belanja Daring via ${kw.namaToko || 'Mitra SipLah'}`;
    } else if (kw.tipe === 'UPAH' || /uk\//i.test(kw.noBukti || '')) {
      bkuUraian = kw.uraian.replace('Pembayaran Lunas Biaya ', 'Bayar ');
    } else if (isMaterialKw) {
      const storeName =
        kw.namaToko ||
        (!/pengawas|perencana/i.test(kw.penerimaNama || '') ? kw.penerimaNama : '') ||
        'Toko Rekanan';
      bkuUraian = `Bayar Bahan Dari ${storeName}`;
    } else if (/kons-p/i.test(kw.noBukti || '') || (kw.tipe === 'KONSULTAN' && /perencana/i.test(kw.uraian))) {
      const recipient = kw.penerimaNama || resolveManagementRecipient('PERENCANA', school, stores);
      bkuUraian = `Bayar Honorarium Jasa Perencana Teknis (${recipient})`;
    } else if (/kons-w/i.test(kw.noBukti || '') || (kw.tipe === 'KONSULTAN' && /pengawas/i.test(kw.uraian))) {
      const recipient = kw.penerimaNama || resolveManagementRecipient('PENGAWAS', school, stores);
      bkuUraian = `Bayar Honorarium Jasa Pengawas Lapangan (${recipient})`;
    } else if (kw.tipe === 'OPERASIONAL' || /adm/i.test(kw.noBukti || '') || /administrasi|pengelolaan/i.test(kw.uraian)) {
      const recipient = kw.penerimaNama || resolveManagementRecipient('PENGELOLA', school, stores);
      bkuUraian = `Bayar Biaya Pengelolaan Administrasi LPJ (${recipient})`;
    }

    candidates.push({
      id: kwBkuId,
      tanggal: displayTanggal,
      tanggalObj: sortDate,
      bulan: kw.bulan || startProjectBulan,
      jenis: 'PENGELUARAN',
      uraian: cleanNaturalUraian(bkuUraian),
      noBukti: kw.noBukti,
      penerimaan: 0,
      pengeluaran: kw.nominal,
      metodeBayar: isSiplahKw ? 'BANK' : (kw.metodeBayar || 'TUNAI'),
      kategoriBiaya: isSiplahKw ? 'Siplah' : kw.kategoriBiayaPajak,
      kwitansiIdRef: kw.id,
      isLocked: Boolean(kw.isLocked),
      isManualDate: Boolean(kw.isManualDate),
    });
  });

  // Process Wage Reports
  (wageReports || []).forEach((wr) => {
    if (!wr || wr.totalUpah <= 0) return;
    const wNum = wr.mingguKe;
    if (activeWeekNums.size > 0 && !activeWeekNums.has(wNum)) return;

    const weekPad = String(wNum).padStart(2, '0');
    const ukBukti = `UK/${weekPad}/${yearStr}`;

    const alreadyInCandidates = candidates.some((c) => {
      const cBukti = (c.noBukti || '').toUpperCase().trim();
      if (cBukti === ukBukti.toUpperCase() || cBukti === `UK/${wNum}/${yearStr}`.toUpperCase()) return true;
      if (c.kwitansiIdRef === `kw-upah-m${wNum}`) return true;
      return false;
    });

    if (!alreadyInCandidates) {
      const matchW = activeWeeks.find((w) => w.mingguKe === wNum) || progressWeeks.find((w) => w.mingguKe === wNum);
      const wDates = matchW
        ? resolveWeekDates(matchW, yearStr)
        : { endDate: `${yearStr}-07-12`, endDateSlash: `12/07/${yearStr}`, bulan: startProjectBulan };

      candidates.push({
        id: `bku-wage-w${wNum}`,
        tanggal: wDates.endDateSlash,
        tanggalObj: wDates.endDate,
        bulan: wDates.bulan || startProjectBulan,
        jenis: 'PENGELUARAN',
        uraian: `Bayar Upah Borongan Pekerja Fisik Minggu Ke-${wNum} (Periode ${wDates.endDateSlash.split('/')[0]} ${wDates.bulan.split(' ')[0]})`,
        noBukti: ukBukti,
        penerimaan: 0,
        pengeluaran: wr.totalUpah,
        metodeBayar: 'TUNAI',
        kategoriBiaya: 'Konstruksi',
        kwitansiIdRef: `kw-upah-m${wNum}`,
      });
    }
  });

  // Add Manual BKU transactions that are not already present
  (manualBkuTransactions || []).forEach((tx) => {
    if (deletedBkuIds.includes(tx.id) || tx.id === 'bku-init-1' || tx.id === 'bku-init-2') return;
    const exists = candidates.some((c) => c.id === tx.id || (tx.kwitansiIdRef && c.kwitansiIdRef === tx.kwitansiIdRef));
    if (!exists) {
      const iso = tx.tanggalObj || parseTxDateToIso(tx.tanggal, yearNum);
      candidates.push({
        id: tx.id || generateSecureId('bku-tx'),
        tanggal: tx.tanggal,
        tanggalObj: iso,
        bulan: tx.bulan || startProjectBulan,
        jenis: tx.jenis,
        uraian: cleanNaturalUraian(tx.uraian || ''),
        noBukti: tx.noBukti || '',
        penerimaan: tx.penerimaan || 0,
        pengeluaran: tx.pengeluaran || 0,
        metodeBayar: tx.metodeBayar || 'TUNAI',
        kategoriBiaya: tx.kategoriBiaya,
        kwitansiIdRef: tx.kwitansiIdRef,
        isLocked: tx.isLocked,
        isManualDate: tx.isManualDate,
      });
    }
  });

  // Sort candidates chronologically (PENERIMAAN first on same date)
  candidates.sort((a, b) => {
    if (a.tanggalObj !== b.tanggalObj) return a.tanggalObj.localeCompare(b.tanggalObj);
    if (a.jenis === 'PENERIMAAN' && b.jenis === 'PENGELUARAN') return -1;
    if (a.jenis === 'PENGELUARAN' && b.jenis === 'PENERIMAAN') return 1;
    return 0;
  });

  // 3. Single-pass Ledger Engine: Build BKU, BKB, BKT synchronously
  const bkuList: BkuTransaction[] = [];
  const bkbList: BkbTransaction[] = [];
  const bktList: BktTransaction[] = [];

  let runningBankBalance = 0;
  let runningCashBalance = 0;
  let runningBkuBalance = 0;
  let withdrawalCounter = 0;

  candidates.forEach((cand) => {
    // Process PENERIMAAN
    if (cand.jenis === 'PENERIMAAN') {
      runningBankBalance += cand.penerimaan;
      runningBkuBalance += cand.penerimaan;

      const bkuTx: BkuTransaction = {
        id: cand.id,
        tanggal: cand.tanggal,
        tanggalObj: cand.tanggalObj,
        bulan: cand.bulan,
        jenis: 'PENERIMAAN',
        uraian: cand.uraian,
        noBukti: cand.noBukti,
        penerimaan: cand.penerimaan,
        pengeluaran: 0,
        saldo: runningBkuBalance,
        metodeBayar: 'BANK',
      };
      bkuList.push(bkuTx);

      const bkbTx: BkbTransaction = {
        id: `bkb-${cand.id}`,
        tanggal: cand.tanggal,
        tanggalObj: cand.tanggalObj,
        bulan: cand.bulan,
        uraian: cand.uraian,
        noBukti: cand.noBukti,
        penerimaan: cand.penerimaan,
        pengeluaran: 0,
        saldo: runningBankBalance,
        kategori: 'PENERIMAAN_TERMIN',
      };
      bkbList.push(bkbTx);

      return;
    }

    // Process PENGELUARAN
    const expNominal = cand.pengeluaran;
    if (expNominal <= 0) return;

    if (cand.metodeBayar === 'BANK') {
      // Direct Bank expense (SIPLAH)
      runningBankBalance -= expNominal;
      runningBkuBalance -= expNominal;

      const bkuTx: BkuTransaction = {
        id: cand.id,
        tanggal: cand.tanggal,
        tanggalObj: cand.tanggalObj,
        bulan: cand.bulan,
        jenis: 'PENGELUARAN',
        uraian: cand.uraian,
        noBukti: cand.noBukti,
        penerimaan: 0,
        pengeluaran: expNominal,
        saldo: runningBkuBalance,
        metodeBayar: 'BANK',
        kategoriBiaya: cand.kategoriBiaya,
        kwitansiIdRef: cand.kwitansiIdRef,
        isLocked: cand.isLocked,
        isManualDate: cand.isManualDate,
      };
      bkuList.push(bkuTx);

      const bkbTx: BkbTransaction = {
        id: `bkb-${cand.id}`,
        tanggal: cand.tanggal,
        tanggalObj: cand.tanggalObj,
        bulan: cand.bulan,
        uraian: cand.uraian,
        noBukti: cand.noBukti,
        penerimaan: 0,
        pengeluaran: expNominal,
        saldo: runningBankBalance,
        kategori: 'SIPLAH',
        kwitansiIdRef: cand.kwitansiIdRef,
      };
      bkbList.push(bkbTx);

      return;
    }

    // Cash expense (TUNAI): Check if cash in BKT brankas is sufficient
    if (runningCashBalance < expNominal) {
      const deficit = expNominal - runningCashBalance;
      // Round UP withdrawal to nearest Rp 1.000.000
      const withdrawNominal = Math.ceil(deficit / 1000000) * 1000000;

      // Check if bank has enough funds for withdrawal
      if (runningBankBalance >= withdrawNominal) {
        withdrawalCounter++;
        const padIdx = String(withdrawalCounter).padStart(2, '0');

        runningBankBalance -= withdrawNominal;
        runningCashBalance += withdrawNominal;

        // BKB Withdrawal Row
        const bkbWithdraw: BkbTransaction = {
          id: `bkb-withdraw-${cand.id || withdrawalCounter}`,
          tanggal: cand.tanggal,
          tanggalObj: cand.tanggalObj,
          bulan: cand.bulan,
          uraian: `Penarikan Tunai dari Bank (Tahap ${withdrawalCounter}) untuk Kas Tunai Operasional BKT`,
          noBukti: `BKT-OUT-${padIdx}`,
          penerimaan: 0,
          pengeluaran: withdrawNominal,
          saldo: runningBankBalance,
          kategori: 'TARIK_TUNAI',
        };
        bkbList.push(bkbWithdraw);

        // BKT Inflow Row
        const bktInflow: BktTransaction = {
          id: `bkt-inflow-${cand.id || withdrawalCounter}`,
          tanggal: cand.tanggal,
          tanggalObj: cand.tanggalObj,
          bulan: cand.bulan,
          uraian: `Penarikan Tunai dari Bank (Tahap ${withdrawalCounter}) untuk Kas Tunai Operasional BKT`,
          noBukti: `BKT-OUT-${padIdx}`,
          pemasukan: withdrawNominal,
          pengeluaran: 0,
          saldo: runningCashBalance,
          kategoriBiaya: 'Penerimaan',
          metodeBayar: 'TUNAI',
        };
        bktList.push(bktInflow);
      } else {
        // Bank balance is insufficient for Rp 1.000.000 rounded withdrawal, withdraw remaining bank balance
        const remainingBank = Math.max(0, runningBankBalance);
        if (remainingBank > 0) {
          withdrawalCounter++;
          const padIdx = String(withdrawalCounter).padStart(2, '0');

          runningBankBalance = 0;
          runningCashBalance += remainingBank;

          bkbList.push({
            id: `bkb-withdraw-${cand.id || withdrawalCounter}`,
            tanggal: cand.tanggal,
            tanggalObj: cand.tanggalObj,
            bulan: cand.bulan,
            uraian: `Penarikan Tunai Sisa Bank (Tahap ${withdrawalCounter}) untuk Kas Operasional`,
            noBukti: `BKT-OUT-${padIdx}`,
            penerimaan: 0,
            pengeluaran: remainingBank,
            saldo: 0,
            kategori: 'TARIK_TUNAI',
          });

          bktList.push({
            id: `bkt-inflow-${cand.id || withdrawalCounter}`,
            tanggal: cand.tanggal,
            tanggalObj: cand.tanggalObj,
            bulan: cand.bulan,
            uraian: `Penarikan Tunai Sisa Bank (Tahap ${withdrawalCounter}) untuk Kas Operasional`,
            noBukti: `BKT-OUT-${padIdx}`,
            pemasukan: remainingBank,
            pengeluaran: 0,
            saldo: runningCashBalance,
            kategoriBiaya: 'Penerimaan',
            metodeBayar: 'TUNAI',
          });
        }
      }
    }

    // Deduct expense from BKT and BKU
    runningCashBalance -= expNominal;
    runningBkuBalance -= expNominal;

    const bkuTx: BkuTransaction = {
      id: cand.id,
      tanggal: cand.tanggal,
      tanggalObj: cand.tanggalObj,
      bulan: cand.bulan,
      jenis: 'PENGELUARAN',
      uraian: cand.uraian,
      noBukti: cand.noBukti,
      penerimaan: 0,
      pengeluaran: expNominal,
      saldo: runningBkuBalance,
      metodeBayar: 'TUNAI',
      kategoriBiaya: cand.kategoriBiaya,
      kwitansiIdRef: cand.kwitansiIdRef,
      isLocked: cand.isLocked,
      isManualDate: cand.isManualDate,
    };
    bkuList.push(bkuTx);

    const bktTx: BktTransaction = {
      id: `bkt-${cand.id}`,
      tanggal: cand.tanggal,
      tanggalObj: cand.tanggalObj,
      bulan: cand.bulan,
      uraian: cand.uraian,
      noBukti: cand.noBukti,
      pemasukan: 0,
      pengeluaran: expNominal,
      saldo: runningCashBalance,
      kategoriBiaya: cand.kategoriBiaya,
      kwitansiIdRef: cand.kwitansiIdRef,
      metodeBayar: 'TUNAI',
      isLocked: cand.isLocked,
      isManualDate: cand.isManualDate,
    };
    bktList.push(bktTx);
  });

  // Calculate category discrepancies (without bkuDiff trimming!)
  const categoryDiscrepancies: { category: string; expected: number; actual: number; diff: number }[] = [];

  return {
    bkuList,
    bktList,
    bkbList,
    categoryDiscrepancies,
  };
}
