import {
  BkuTransaction,
  BktTransaction,
  BkbTransaction,
  SchoolMasterData,
  ProjectProgressWeek,
  TransactionFilterOptions,
  KwitansiDocument,
  StoreVendor,
} from '../types';
import { resolveWeekDates, parseTxDateToIso } from '../utils/monthHelper';
import {
  cleanNaturalUraian,
  deriveSpbFromBukti,
  getAutoHealedKwitansiItems,
  getHarmonizedKwitansiNoBukti,
  getHarmonizedKwitansiUraian,
  isFixedNonSplitPayment,
  isMaterialOnlyPurchase,
  renumberMaterialTransactionsChronologically,
} from './autoGeneratorService';
import { planCashFlow } from './cashPlanner';

/**
 * Service Integrasi Penuh BKU (Buku Kas Umum), BKT (Buku Kas Tunai), dan BKB (Buku Kas Bank).
 * Memastikan prinsip akuntansi standar Dinas Pendidikan & Pemerintah:
 * Saldo BKU = Saldo Kas di Bank (BKB) + Saldo Kas Tunai di Bendahara (BKT).
 */

export interface CashReconciliationResult {
  saldoBku: number;
  saldoBank: number;
  saldoTunai: number;
  selisih: number;
  isBalanced: boolean;
  statusText: string;
}

/**
 * Menghasilkan transaksi baseline BKB standar yang terintegrasi dengan Termin 1 & 2 BKU.
 * Tidak merusak atau menghapus transaksi BKB manual yang sudah diisi pengguna.
 * Memberikan alokasi penarikan operasional bertahap yang realistis sehingga saldo bank tetap terjaga positif.
 */
export function generateStandardBkbRecords(
  school: SchoolMasterData,
  progressWeeks: ProjectProgressWeek[] = [],
  bkuWeekLimit: number = 14,
  bkuList: BkuTransaction[] = []
): BkbTransaction[] {
  return syncBkbFromBku(bkuList, school, progressWeeks);
}

/**
 * Synchronize and calibrate BKB records from BKU transactions:
 * 1. Copies BKU penerimaan (Termin 1 & Termin 2) to BKB penerimaan ('PENERIMAAN_TERMIN').
 * 2. Harmonizes BKB non-cash SIPLAH debit records 1-to-1 with BKU SIPLAH transactions.
 * 3. Calculates dynamic cash withdrawals ('TARIK_TUNAI') based on actual cash expenses in BKU:
 *    - Whenever cash in BKT would be insufficient before upcoming cash expense(s), a 'TARIK_TUNAI' debit is added to BKB.
 *    - Withdrawal amount is rounded UP to the nearest Rp 1.000.000.
 *    - Total withdrawals across all stages do not exceed total cash expense needs + small cushion.
 *    - BKT balance is guaranteed NEVER negative on any date.
 */
export function syncBkbFromBku(
  bkuList: BkuTransaction[],
  arg2?: SchoolMasterData | BkbTransaction[] | any,
  arg3?: ProjectProgressWeek[] | KwitansiDocument[] | any,
  arg4?: KwitansiDocument[] | any
): BkbTransaction[] {
  let school: SchoolMasterData | undefined = undefined;
  let progressWeeks: ProjectProgressWeek[] = [];
  let kwitansiList: KwitansiDocument[] = [];

  if (arg2 && typeof arg2 === 'object' && !Array.isArray(arg2) && ('totalAnggaran' in arg2 || 'namaSekolah' in arg2)) {
    school = arg2 as SchoolMasterData;
    progressWeeks = Array.isArray(arg3) ? arg3 : [];
    kwitansiList = Array.isArray(arg4) ? arg4 : [];
  } else {
    school = arg3 as SchoolMasterData;
    progressWeeks = Array.isArray(arg3) ? arg3 : (Array.isArray(arg4) ? arg4 : []);
    kwitansiList = Array.isArray(arg4) ? arg4 : (Array.isArray(arg3) ? arg3 : []);
  }

  let kws = kwitansiList;
  if (!kws || !Array.isArray(kws) || kws.length === 0) {
    kws = (bkuList || [])
      .filter((tx) => tx.jenis === 'PENGELUARAN' && (tx.pengeluaran || 0) > 0)
      .map((tx) => ({
        id: tx.kwitansiIdRef || tx.id,
        noBukti: tx.noBukti || '-',
        tipe: 'MATERIAL' as const,
        tanggal: tx.tanggal,
        tanggalFormatted: tx.tanggal,
        bulan: tx.bulan,
        uraian: tx.uraian,
        penerimaNama: 'Penyedia',
        penerimaPekerjaan: 'Penyedia',
        penerimaAlamat: '',
        nominal: tx.pengeluaran || 0,
        metodeBayar: tx.metodeBayar || (/siplah/i.test(`${tx.noBukti} ${tx.uraian}`) ? 'BANK' : 'TUNAI'),
        kategoriBiayaPajak: tx.kategoriBiaya,
      }));
  }

  const planResult = planCashFlow(kws, school as any, progressWeeks);
  const termins = planResult.termins;
  const plannedKws = planResult.plannedKwitansiList;
  const withdrawals = planResult.withdrawals;

  const records: BkbTransaction[] = [];

  // 1. Termins (Penerimaan)
  termins.forEach((trm) => {
    records.push({
      id: `bkb-trm-${trm.id}`,
      tanggal: trm.tanggal,
      tanggalObj: trm.tanggalObj,
      bulan: trm.bulan,
      uraian: trm.uraian,
      noBukti: trm.noBukti, // TRM-01/2026, TRM-02/2026
      penerimaan: trm.penerimaan,
      pengeluaran: 0,
      kategori: 'PENERIMAAN_TERMIN',
    });
  });

  // 2. Non-cash SIPLah / bank transfer debits
  plannedKws.forEach((kw) => {
    const isSiplah =
      kw.metodeBayar === 'BANK' ||
      kw.kategoriBiayaPajak === 'Siplah' ||
      /siplah|daring/i.test(`${kw.noBukti || ''} ${kw.uraian || ''}`);
    if (isSiplah) {
      records.push({
        id: `bkb-siplah-${kw.id}`,
        tanggal: kw.tanggal,
        tanggalObj: parseTxDateToIso(kw.tanggal),
        bulan: kw.bulan,
        uraian: kw.uraian.toLowerCase().includes('pembayaran')
          ? kw.uraian
          : `Pembayaran Non-Tunai Belanja SIPLah - ${kw.namaToko || 'Mitra SipLah'}`,
        noBukti: kw.noBukti,
        penerimaan: 0,
        pengeluaran: kw.nominal,
        kategori: 'SIPLAH',
        kwitansiIdRef: kw.id,
      });
    }
  });

  // 3. Cash Withdrawals (TARIK_TUNAI)
  withdrawals.forEach((wth) => {
    records.push({
      id: `bkb-wth-${wth.id}`,
      tanggal: wth.tanggal,
      tanggalObj: wth.tanggalObj,
      bulan: wth.bulan,
      uraian: wth.uraian,
      noBukti: wth.noBukti, // BKT-01, BKT-02, ...
      penerimaan: 0,
      pengeluaran: wth.amount,
      kategori: 'TARIK_TUNAI',
    });
  });

  records.sort((a, b) => {
    const isoA = a.tanggalObj || parseTxDateToIso(a.tanggal);
    const isoB = b.tanggalObj || parseTxDateToIso(b.tanggal);
    if (isoA !== isoB) return isoA.localeCompare(isoB);
    if ((a.penerimaan || 0) > 0 && (b.penerimaan || 0) === 0) return -1;
    if ((b.penerimaan || 0) > 0 && (a.penerimaan || 0) === 0) return 1;
    return 0;
  });

  return calculateRunningBkb(records);
}

/**
 * Menghitung saldo kumulatif berjalan untuk BKB
 */
export function calculateRunningBkb(bkbList: BkbTransaction[]): BkbTransaction[] {
  let running = 0;
  return bkbList.map((tx) => {
    running = running + (tx.penerimaan || 0) - (tx.pengeluaran || 0);
    return {
      ...tx,
      saldo: running,
    };
  });
}

/**
 * Menghitung BKT (Buku Kas Tunai) terintegrasi penuh dari planCashFlow.
 */
export function calculateIntegratedBkt(
  bkuList: BkuTransaction[],
  bkbList: BkbTransaction[] = [],
  arg3?: KwitansiDocument[] | SchoolMasterData | any,
  arg4?: SchoolMasterData | ProjectProgressWeek[] | any,
  arg5?: ProjectProgressWeek[] | any
): BktTransaction[] {
  let kwitansiList: KwitansiDocument[] = [];
  let school: SchoolMasterData | undefined = undefined;
  let progressWeeks: ProjectProgressWeek[] = [];

  if (arg3 && typeof arg3 === 'object' && !Array.isArray(arg3) && ('totalAnggaran' in arg3 || 'namaSekolah' in arg3)) {
    school = arg3 as SchoolMasterData;
    progressWeeks = Array.isArray(arg4) ? arg4 : [];
    kwitansiList = [];
  } else if (Array.isArray(arg3)) {
    kwitansiList = arg3;
    school = arg4 as SchoolMasterData;
    progressWeeks = arg5 || [];
  }

  let kws = kwitansiList;
  if (!kws || !Array.isArray(kws) || kws.length === 0) {
    kws = (bkuList || [])
      .filter((tx) => tx.jenis === 'PENGELUARAN' && (tx.pengeluaran || 0) > 0)
      .map((tx) => ({
        id: tx.kwitansiIdRef || tx.id,
        noBukti: tx.noBukti || '-',
        tipe: 'MATERIAL' as const,
        tanggal: tx.tanggal,
        tanggalFormatted: tx.tanggal,
        bulan: tx.bulan,
        uraian: tx.uraian,
        penerimaNama: 'Penyedia',
        penerimaPekerjaan: 'Penyedia',
        penerimaAlamat: '',
        nominal: tx.pengeluaran || 0,
        metodeBayar: tx.metodeBayar || (/siplah/i.test(`${tx.noBukti} ${tx.uraian}`) ? 'BANK' : 'TUNAI'),
        kategoriBiayaPajak: tx.kategoriBiaya,
      }));
  }

  const planResult = planCashFlow(kws, school as any, progressWeeks);
  const plannedKws = planResult.plannedKwitansiList;
  const withdrawals = planResult.withdrawals;

  const bktItems: BktTransaction[] = [];

  // 1. Pemasukan Kas Tunai dari Penarikan Bank (withdrawals)
  withdrawals.forEach((wth) => {
    bktItems.push({
      id: `bkt-inflow-${wth.id}`,
      tanggal: wth.tanggal,
      tanggalObj: wth.tanggalObj,
      bulan: wth.bulan,
      uraian: wth.uraian,
      noBukti: wth.noBukti, // BKT-01, BKT-02, ...
      pemasukan: wth.amount,
      pengeluaran: 0,
      saldo: 0,
      kategoriBiaya: 'Penerimaan',
      metodeBayar: 'TUNAI',
    });
  });

  // 2. Pengeluaran Belanja Tunai dari Kwitansi Tunai
  plannedKws.forEach((kw) => {
    const isBank =
      kw.metodeBayar === 'BANK' ||
      kw.kategoriBiayaPajak === 'Siplah' ||
      /siplah|daring/i.test(`${kw.noBukti || ''} ${kw.uraian || ''}`);

    if (!isBank) {
      bktItems.push({
        id: `bkt-kw-${kw.id}`,
        tanggal: kw.tanggal,
        tanggalObj: parseTxDateToIso(kw.tanggal),
        bulan: kw.bulan,
        uraian: kw.uraian,
        noBukti: kw.noBukti,
        pemasukan: 0,
        pengeluaran: kw.nominal,
        saldo: 0,
        kategoriBiaya: kw.kategoriBiayaPajak,
        kwitansiIdRef: kw.id,
        metodeBayar: 'TUNAI',
      });
    }
  });

  // 3. Chronological sort (Pemasukan before Pengeluaran on same date)
  bktItems.sort((a, b) => {
    const isoA = a.tanggalObj || parseTxDateToIso(a.tanggal);
    const isoB = b.tanggalObj || parseTxDateToIso(b.tanggal);
    if (isoA !== isoB) return isoA.localeCompare(isoB);
    if ((a.pemasukan || 0) > 0 && (b.pemasukan || 0) === 0) return -1;
    if ((b.pemasukan || 0) > 0 && (a.pemasukan || 0) === 0) return 1;
    return 0;
  });

  // 4. Compute running balance
  let runningCash = 0;
  const finalBktItems = bktItems.map((tx) => {
    runningCash = runningCash + (tx.pemasukan || 0) - (tx.pengeluaran || 0);
    return {
      ...tx,
      saldo: runningCash,
    };
  });

  return finalBktItems;
}

/**
 * Mendapatkan posisi saldo akhir BKB pada suatu bulan tertentu
 */
export function getBkbSaldoAtMonth(bkbList: BkbTransaction[], monthName: string): number {
  if (!bkbList || bkbList.length === 0) return 0;
  const computed = calculateRunningBkb(bkbList);

  // Cari transaksi terakhir di bulan tersebut
  const inMonth = computed.filter((b) => b.bulan === monthName);
  let rawVal = 0;
  if (inMonth.length > 0) {
    rawVal = inMonth[inMonth.length - 1].saldo || 0;
  } else {
    rawVal = computed[computed.length - 1]?.saldo || 0;
  }
  return Math.abs(rawVal) <= 1000 ? 0 : rawVal;
}

/**
 * Mendapatkan posisi saldo akhir BKT pada suatu bulan tertentu
 */
export function getBktSaldoAtMonth(bktList: BktTransaction[], monthName: string): number {
  if (!bktList || bktList.length === 0) return 0;
  const inMonth = bktList.filter((b) => b.bulan === monthName);
  let rawVal = 0;
  if (inMonth.length > 0) {
    rawVal = inMonth[inMonth.length - 1].saldo || 0;
  } else {
    rawVal = bktList[bktList.length - 1]?.saldo || 0;
  }
  return Math.abs(rawVal) <= 1000 ? 0 : rawVal;
}

/**
 * Melakukan verifikasi rekonsiliasi kas (BKU vs BKB + BKT)
 * Menerapkan prinsip akuntansi presisi integer rupiah:
 * Saldo BKU harus tepat sama dengan Saldo Bank (BKB) + Saldo Kas Tunai (BKT).
 */
export function reconcileCashBalances(
  bkuSaldo: number,
  bkbSaldo: number,
  bktSaldo: number
): CashReconciliationResult {
  const normBku = Math.round(Number(bkuSaldo) || 0);
  const normBkb = Math.round(Number(bkbSaldo) || 0);
  const normBkt = Math.round(Number(bktSaldo) || 0);

  const sumSubLedgers = normBkb + normBkt;
  const selisih = normBku - sumSubLedgers;
  const isBalanced = selisih === 0;

  return {
    saldoBku: normBku,
    saldoBank: normBkb,
    saldoTunai: normBkt,
    selisih,
    isBalanced,
    statusText: isBalanced
      ? 'Seimbang & Terintegrasi Penuh (BKU = Bank + Tunai)'
      : `Terdapat Selisih Rp ${Math.abs(selisih).toLocaleString('id-ID')}`,
  };
}

/**
 * Mencari KwitansiDocument yang berpasangan secara tepat dan akurat dengan transaksi BKU atau BKT.
 * Memastikan tidak ada ketidaksesuaian antara nomor bukti, nama toko/rekanan, uraian, dan rincian barang.
 */
export function findMatchedKwitansiForTransaction(
  tx: BkuTransaction | BktTransaction | null,
  kwitansiList: KwitansiDocument[],
  stores?: StoreVendor[],
  school?: SchoolMasterData
): KwitansiDocument | null {
  if (!tx || !kwitansiList || kwitansiList.length === 0) return null;

  const isSplit =
    tx.id.includes('-p1') ||
    tx.id.includes('-p2') ||
    (tx as any).isSplit;

  const baseTxId = tx.id.replace(/-p[12]$/, '');
  const cleanTxBuktiNorm = (tx.noBukti || '').replace(/-B$/, '').trim();

  // Helper to wrap the final matched kwitansi with scaled volume if split
  const wrapResult = (k: KwitansiDocument | null): KwitansiDocument | null => {
    if (!k) return null;
    const resolvedBukti = tx.noBukti && tx.noBukti !== '-' ? tx.noBukti.replace(/-B$/, '').trim() : k.noBukti;
    const resolvedSpb = deriveSpbFromBukti(resolvedBukti, k.noSpb);
    const cleanUraian = cleanNaturalUraian(tx.uraian || k.uraian);

    if (!isSplit) {
      if (resolvedBukti && resolvedBukti !== k.noBukti) {
        return {
          ...k,
          noBukti: resolvedBukti,
          noSpb: resolvedSpb,
          uraian: cleanUraian,
        };
      }
      return {
        ...k,
        uraian: cleanUraian,
      };
    }

    const txNom = (tx as any).pengeluaran || (tx as any).pemasukan || k.nominal;
    if (Math.abs(txNom - k.nominal) < 2) {
      return {
        ...k,
        noBukti: resolvedBukti,
        noSpb: resolvedSpb,
        uraian: cleanUraian,
      };
    }

    const ratio = k.nominal > 0 ? txNom / k.nominal : 1;
    const scaledItems = (k.items || []).map((it) => {
      const vol = Math.max(1, Math.round(it.volume * ratio));
      return {
        ...it,
        volume: vol,
        jumlah: Math.round(vol * it.hargaSatuan),
      };
    });

    return {
      ...k,
      id: `${k.id}-${tx.id.includes('-p2') ? 'p2' : 'p1'}`,
      nominal: txNom,
      tanggal: tx.tanggal,
      tanggalFormatted: tx.tanggal,
      bulan: tx.bulan,
      uraian: cleanUraian,
      noBukti: resolvedBukti,
      noSpb: resolvedSpb,
      items: scaledItems,
    };
  };

  // 1. Cocokkan ID referensi langsung jika tersedia
  if (tx.kwitansiIdRef) {
    const refId = tx.kwitansiIdRef;
    const byRef = kwitansiList.find((k) => k.id === refId || k.id === refId.replace(/-p[12]$/, ''));
    if (byRef) return wrapResult(byRef);
  }

  // 2. Cocokkan prefix ID sistem
  const byPrefixId = kwitansiList.find(
    (k) =>
      tx.id === `bku-kw-${k.id}` ||
      tx.id === `bkt-kw-${k.id}` ||
      baseTxId === `bku-kw-${k.id}` ||
      baseTxId === `bkt-kw-${k.id}` ||
      tx.id === k.id ||
      baseTxId === k.id ||
      k.id.includes(baseTxId.replace(/^bku-|^bkt-/, ''))
  );
  if (byPrefixId) return wrapResult(byPrefixId);

  // 3. Cocokkan Transaksi Upah Tenaga Kerja / Mandor
  const isTxUpah = /upah|tukang|pekerja|mandor|borongan/i.test(`${tx.noBukti} ${tx.uraian}`);
  if (isTxUpah) {
    const matchW =
      tx.uraian.match(/minggu\s*(?:ke[- ])?\s*(\d+)/i) ||
      tx.noBukti?.match(/uk\/0*(\d+)/i) ||
      tx.id.match(/wage-w?(\d+)/i);
    const wNum = matchW ? parseInt(matchW[1], 10) : null;

    if (wNum !== null) {
      const upahKw = kwitansiList.find(
        (k) =>
          (k.tipe === 'UPAH' || /upah/i.test(k.uraian)) &&
          (k.mingguKeRef === wNum ||
            k.noBukti?.toLowerCase().includes(`uk/${String(wNum).padStart(2, '0')}`) ||
            k.noBukti?.toLowerCase().includes(`uk/${wNum}/`) ||
            k.uraian.toLowerCase().includes(`minggu ke-${wNum}`) ||
            k.id.includes(`wage-m${wNum}`) ||
            k.id.includes(`upah-w${wNum}`) ||
            k.id.includes(`wage-w${wNum}`))
      );
      if (upahKw) return wrapResult(upahKw);
    }

    const txNom = (tx as any).pengeluaran || (tx as any).pemasukan || 0;
    const upahByDateOrNom = kwitansiList.find(
      (k) =>
        (k.tipe === 'UPAH' || /upah/i.test(k.uraian)) &&
        (k.tanggal === tx.tanggal || Math.abs(k.nominal - txNom) < 2)
    );
    if (upahByDateOrNom) return wrapResult(upahByDateOrNom);
  }

  // 4. Cocokkan Konsultan & Manajemen LPJ
  const isTxPerencana = /perencana/i.test(`${tx.noBukti} ${tx.uraian}`);
  const isTxPengawas = /pengawas/i.test(`${tx.noBukti} ${tx.uraian}`);
  const isTxAdm = /administrasi|pengelolaan|\badm\b/i.test(`${tx.noBukti} ${tx.uraian}`);

  if (isTxPerencana || isTxPengawas || isTxAdm) {
    const matchW =
      tx.uraian.match(/minggu\s*(?:ke[- ])?\s*(\d+)/i) ||
      tx.noBukti?.match(/(?:kons-p|kons-w|adm)\/0*(\d+)/i) ||
      tx.id.match(/mgt-(?:p|w|adm)-w?(\d+)/i);
    const wNum = matchW ? parseInt(matchW[1], 10) : null;

    const mgtKw = kwitansiList.find((k) => {
      if (isTxPerencana && !/perencana/i.test(`${k.noBukti} ${k.uraian}`)) return false;
      if (isTxPengawas && !/pengawas/i.test(`${k.noBukti} ${k.uraian}`)) return false;
      if (isTxAdm && !/administrasi|pengelolaan|\badm\b/i.test(`${k.noBukti} ${k.uraian}`)) return false;
      if (wNum !== null && (k.mingguKeRef === wNum || k.noBukti?.includes(`/${String(wNum).padStart(2, '0')}/`))) {
        return true;
      }
      if (k.tanggal === tx.tanggal) return true;
      return false;
    });
    if (mgtKw) return wrapResult(mgtKw);
  }

  // 5. Cocokkan berdasarkan No Bukti (dengan normalisasi karakter dan angka)
  if (tx.noBukti && tx.noBukti !== '-' && tx.noBukti.trim()) {
    const cleanTxBukti = cleanTxBuktiNorm.toLowerCase();
    const isTxMat = /kwt[\/\-_]?mat|kw[\/\-_]?mat|\bmat\b|mat[\/\-_]|material/i.test(cleanTxBukti);
    const isTxKons = /kons|perencana|pengawas/i.test(cleanTxBukti);
    const isTxUpah = /uk\b|upah/i.test(cleanTxBukti);

    const byNoBukti = kwitansiList.find((k) => {
      if (!k.noBukti) return false;
      const cleanKBukti = k.noBukti.trim().toLowerCase();
      if (cleanKBukti === cleanTxBukti) return true;

      // DO NOT match across incompatible types! (e.g. kwt/mat cannot match KONS-W / Pengawas or UK)
      const isKMat = /kwt[\/\-_]?mat|kw[\/\-_]?mat|\bmat\b|mat[\/\-_]|material/i.test(cleanKBukti) || k.tipe === 'MATERIAL';
      const isKKons = /kons|perencana|pengawas/i.test(cleanKBukti) || k.tipe === 'KONSULTAN';
      const isKUpah = /uk\b|upah/i.test(cleanKBukti) || k.tipe === 'UPAH';

      if (isTxMat && (isKKons || isKUpah)) return false;
      if (isTxKons && (isKMat || isKUpah)) return false;
      if (isTxUpah && (isKMat || isKKons)) return false;

      const numTx = cleanTxBukti.replace(/\D/g, '');
      const numK = cleanKBukti.replace(/\D/g, '');
      if (numTx && numK && parseInt(numTx, 10) === parseInt(numK, 10) && numTx.length <= 4 && numK.length <= 4) {
        const prefixTx = cleanTxBukti.replace(/[\d\/\-_]/g, '');
        const prefixK = cleanKBukti.replace(/[\d\/\-_]/g, '');
        if (prefixTx === prefixK) return true;
      }
      return false;
    });
    if (byNoBukti) return wrapResult(byNoBukti);
  }

  // 6. Cocokkan Toko & Nominal Pembelian Material / SMKK
  const txNom = (tx as any).pengeluaran || (tx as any).pemasukan || 0;
  if (txNom > 0) {
    let storeNameInTx = '';
    if (stores && stores.length > 0) {
      for (const s of stores) {
        if (s.namaToko && tx.uraian.toLowerCase().includes(s.namaToko.toLowerCase())) {
          storeNameInTx = s.namaToko;
          break;
        }
      }
    }

    const byStoreAndNom = kwitansiList.find((k) => {
      const sameNom = Math.abs(k.nominal - txNom) < 2;
      if (!sameNom) return false;
      if (
        storeNameInTx &&
        (k.namaToko?.toLowerCase().includes(storeNameInTx.toLowerCase()) ||
          k.penerimaNama?.toLowerCase().includes(storeNameInTx.toLowerCase()))
      ) {
        return true;
      }
      if (k.tanggal === tx.tanggal) return true;
      return false;
    });
    if (byStoreAndNom) return wrapResult(byStoreAndNom);

    // Fallback: nominal sama persis dan tanggal sama persis
    const byDateAndNom = kwitansiList.find(
      (k) => Math.abs(k.nominal - txNom) < 2 && k.tanggal === tx.tanggal
    );
    if (byDateAndNom) return wrapResult(byDateAndNom);
  }

  return null;
}

/**
 * Menghasilkan objek KwitansiDocument yang valid, realistis, dan tersinkron
 * ketika transaksi BKU belum memiliki kwitansi di kwitansiList (misal: entri manual baru).
 */
export function synthesizeKwitansiFromTransaction(
  tx: BkuTransaction,
  school: SchoolMasterData,
  stores: StoreVendor[] = []
): KwitansiDocument {
  const nom = tx.pengeluaran || tx.penerimaan || 0;
  const isMatBukti =
    /kwt[\/\-_]?mat|kw[\/\-_]?mat|\bmat\b|mat[\/\-_]|material/i.test(tx.noBukti || '') ||
    /bayar\s+bahan|pembelian\s+material|toko|tb\./i.test(tx.uraian) ||
    tx.kategoriBiaya === 'Konstruksi';
  const isUpah = !isMatBukti && /upah|tukang|pekerja|mandor/i.test(`${tx.noBukti} ${tx.uraian}`);
  const isPerencana = !isMatBukti && (/kons-p/i.test(tx.noBukti || '') || (/perencana/i.test(tx.uraian) && !/dari\s+tb|toko/i.test(tx.uraian)));
  const isPengawas = !isMatBukti && (/kons-w/i.test(tx.noBukti || '') || (/pengawas/i.test(tx.uraian) && !/dari\s+tb|toko/i.test(tx.uraian)));
  const isAdm = !isMatBukti && /administrasi|pengelolaan|\badm\b/i.test(`${tx.noBukti} ${tx.uraian}`);
  const isSmkk = !isMatBukti && /smkk|k3|keselamatan/i.test(`${tx.noBukti} ${tx.uraian}`);

  let matchedStore: StoreVendor | undefined = undefined;
  for (const s of stores) {
    if (s.namaToko && tx.uraian.toLowerCase().includes(s.namaToko.toLowerCase())) {
      matchedStore = s;
      break;
    }
  }

  let tipe: KwitansiDocument['tipe'] = 'MATERIAL';
  let namaToko = matchedStore?.namaToko || '';
  let penerimaNama = matchedStore?.pemilikNama || 'Penyedia Barang';
  let penerimaPekerjaan =
    matchedStore?.kategori === 'SIPLAH' ? 'Penyedia Bahan (SipLah)' : 'Penyedia Bahan Bangunan';
  let penerimaAlamat = matchedStore?.alamat || school.kabKota;

  if (isUpah) {
    tipe = 'UPAH';
    namaToko = '';
    penerimaNama = school.namaMandor || school.namaPelaksana || 'Kepala Tukang / Mandor';
    penerimaPekerjaan = 'Kepala Tukang / Mandor';
    penerimaAlamat = school.kabKota;
  } else if (isPerencana) {
    tipe = 'KONSULTAN';
    const storePer = (stores || []).find((s) => s.kategori === 'PERENCANA' || s.kategori === 'KONSULTAN' || /perencana/i.test(`${s.namaToko} ${s.pemilikNama}`));
    namaToko = storePer?.namaToko || '';
    penerimaNama = storePer?.pemilikNama || storePer?.namaToko || (!/dzikri|zulfahmi/i.test(school.namaPerencana || '') ? school.namaPerencana : '') || 'Konsultan Perencana';
    penerimaPekerjaan = 'Perencana Teknis';
    penerimaAlamat = school.kabKota;
  } else if (isPengawas) {
    tipe = 'KONSULTAN';
    const storePeng = (stores || []).find((s) => s.kategori === 'PENGAWAS' || /pengawas/i.test(`${s.namaToko} ${s.pemilikNama}`));
    namaToko = storePeng?.namaToko || '';
    penerimaNama = storePeng?.pemilikNama || storePeng?.namaToko || (!/erwin|aris/i.test(school.namaPengawas || '') ? school.namaPengawas : '') || 'Pengawas Lapangan';
    penerimaPekerjaan = 'Pengawas Lapangan';
    penerimaAlamat = school.kabKota;
  } else if (isAdm) {
    tipe = 'OPERASIONAL';
    const storeAdm = (stores || []).find((s) => s.kategori === 'OPERASIONAL' || /administrasi|pengelola/i.test(`${s.namaToko} ${s.pemilikNama}`));
    namaToko = storeAdm?.namaToko || '';
    penerimaNama = storeAdm?.pemilikNama || storeAdm?.namaToko || (!/hani|irwan/i.test(school.namaBendahara || '') ? school.namaBendahara : '') || 'Pengelola Administrasi LPJ';
    penerimaPekerjaan = 'Pengelola Administrasi LPJ';
    penerimaAlamat = school.kabKota;
  } else if (isSmkk) {
    tipe = 'SMKK';
    const storeSmkk = (stores || []).find((s) => s.kategori === 'K3' || /smkk|safety|mitra/i.test(`${s.namaToko} ${s.pemilikNama}`));
    namaToko = storeSmkk?.namaToko || matchedStore?.namaToko || 'Penyedia APD / SMKK';
    penerimaNama = storeSmkk?.pemilikNama || matchedStore?.pemilikNama || 'Penyedia APD';
    penerimaPekerjaan = 'Penyedia APD & Keselamatan Konstruksi';
    penerimaAlamat = school.kabKota;
  } else if (!matchedStore) {
    const tokoMatch = tx.uraian.match(
      /(?:dari|toko|tb\.)\s+([A-Za-z0-9\.\s\-]+?)(?:\s+tgl|\s+minggu|\s*\()/i
    );
    if (tokoMatch && tokoMatch[1]) {
      namaToko = tokoMatch[1].trim();
      penerimaNama = `Pimpinan ${namaToko}`;
    } else {
      namaToko = 'TB. REKANAN MATERIAL';
      penerimaNama = 'H. RAHMAT HIDAYAT';
    }
  }

  const cleanBukti = (tx.noBukti || '').replace(/-B$/, '').trim();
  const cleanUraian = cleanNaturalUraian(tx.uraian);

  const equivKw: Partial<KwitansiDocument> = {
    id: tx.kwitansiIdRef || `kw-syn-${tx.id}`,
    noBukti: cleanBukti,
    noSpb: deriveSpbFromBukti(cleanBukti, `SPB-${cleanBukti || '01'}`),
    tipe,
    tanggal: tx.tanggal,
    tanggalFormatted: tx.tanggal,
    bulan: tx.bulan,
    uraian: cleanUraian,
    namaToko,
    penerimaNama,
    penerimaPekerjaan,
    penerimaAlamat,
    nominal: nom,
  };

  const healed = getAutoHealedKwitansiItems(equivKw as any);
  equivKw.items =
    healed && healed.length > 0
      ? healed
      : [
          {
            namaBarang: tx.uraian,
            volume: 1,
            satuan: 'ls',
            hargaSatuan: nom,
            jumlah: nom,
          },
        ];

  return equivKw as KwitansiDocument;
}

/**
 * Harmonize BKB records with SIPLah:
 * Ensures non-cash SIPLah transactions are recorded in BKB as non-cash debit (kategori: 'SIPLAH')
 * with clear descriptions ('Pembayaran Non-Tunai Belanja SIPLah - HANIMO' & 'Pembayaran Non-Tunai Belanja SIPLah - N&N STATIONARY').
 * Also ensures they are not mistakenly labeled as 'Penarikan' so they never bleed into BKT.
 */
export function harmonizeBkbRecordsWithSiplah(
  bkbRecords: BkbTransaction[],
  bkuList: BkuTransaction[] = [],
  school?: SchoolMasterData
): BkbTransaction[] {
  const result: BkbTransaction[] = [];
  const bkbArray = Array.isArray(bkbRecords) ? bkbRecords : [];

  const bkuArray = Array.isArray(bkuList) ? bkuList : [];
  if (bkuArray.length === 0) {
    return bkbArray;
  }

  // 1. Keep non-SIPLAH BKB transactions (PENERIMAAN_TERMIN, TARIK_TUNAI, BIAYA_ADMIN, BELANJA_NON_TUNAI)
  bkbArray.forEach((bkb) => {
    if (bkb.kategori !== 'SIPLAH') {
      result.push(bkb);
    }
  });

  // 2. Find all SIPLAH BKU transactions
  const siplahBkuTxs = bkuArray.filter((tx) => {
    if (tx.jenis === 'PENERIMAAN') return false;
    return (
      tx.metodeBayar === 'BANK' ||
      tx.kategoriBiaya === 'Siplah' ||
      tx.kategoriBiaya === 'SIPLAH' ||
      /siplah|daring/i.test(`${tx.noBukti || ''} ${tx.uraian || ''} ${tx.kategoriBiaya || ''}`)
    );
  });

  // 3. For each SIPLAH BKU transaction, ensure exactly ONE BKB debit row of category 'SIPLAH'
  const yearStr = school?.tahunAnggaran?.trim() || '2026';
  siplahBkuTxs.forEach((bkuTx, idx) => {
    const existingBkb = bkbArray.find(
      (b) =>
        b.kategori === 'SIPLAH' &&
        ((bkuTx.kwitansiIdRef && b.kwitansiIdRef === bkuTx.kwitansiIdRef) ||
          (bkuTx.noBukti && b.noBukti === bkuTx.noBukti) ||
          b.id === `bkb-siplah-${bkuTx.id}` ||
          (b.tanggal === bkuTx.tanggal && Math.abs(b.pengeluaran - bkuTx.pengeluaran) < 2))
    );

    const padIdx = String(idx + 1).padStart(2, '0');
    const storeNameMatch = bkuTx.uraian.match(/(?:toko|mitra|via|dari)\s+([A-Za-z0-9\.\&\s\-]+)/i);
    const vendorLabel = storeNameMatch ? storeNameMatch[1].trim() : 'SipLah Online';

    const siplahBkbRow: BkbTransaction = {
      id: existingBkb?.id || `bkb-siplah-${bkuTx.id || idx}`,
      tanggal: bkuTx.tanggal,
      tanggalObj: bkuTx.tanggalObj || parseTxDateToIso(bkuTx.tanggal),
      bulan: bkuTx.bulan,
      uraian: bkuTx.uraian.toLowerCase().includes('pembayaran')
        ? bkuTx.uraian
        : `Pembayaran Non-Tunai Belanja SIPLah - ${vendorLabel}`,
      noBukti: bkuTx.noBukti || `SipLah/${padIdx}/${yearStr}`,
      penerimaan: 0,
      pengeluaran: bkuTx.pengeluaran,
      kategori: 'SIPLAH',
      kwitansiIdRef: bkuTx.kwitansiIdRef,
    };

    result.push(siplahBkbRow);
  });

  return result.sort((a, b) => {
    const isoA = a.tanggalObj || parseTxDateToIso(a.tanggal);
    const isoB = b.tanggalObj || parseTxDateToIso(b.tanggal);
    if (isoA !== isoB) return isoA.localeCompare(isoB);
    if ((a.penerimaan || 0) > 0 && (b.penerimaan || 0) === 0) return -1;
    if ((b.penerimaan || 0) > 0 && (a.penerimaan || 0) === 0) return 1;
    return 0;
  });
}

/**
 * Auto-Transformer & Migration service for backup restoration.
 * Automatically upgrades older backup JSON states to adopt the new BKT/BKB calculation structure
 * and ensures all necessary lists (bkbRecords, kwitansiList, taxRecords, etc.) are present and valid.
 */
function convertNumbersDeep(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'number') return obj;
  if (typeof obj === 'string') {
    if (/^-?\d+(\.\d+)?$/.test(obj.trim())) {
      const num = Number(obj);
      if (!isNaN(num)) return num;
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(convertNumbersDeep);
  }
  if (typeof obj === 'object') {
    const res: any = {};
    for (const key of Object.keys(obj)) {
      res[key] = convertNumbersDeep(obj[key]);
    }
    return res;
  }
  return obj;
}

export function migrateAndTransformAppState(restoredInput: any): any {
  if (!restoredInput || typeof restoredInput !== 'object') return restoredInput;
  const restored = convertNumbersDeep(restoredInput);

  const school = restored.school || {};
  const progressWeeks = Array.isArray(restored.progressWeeks) ? restored.progressWeeks : [];
  const bkuWeekLimit = restored.bkuWeekLimit || 14;

  const bkuTransactions = Array.isArray(restored.bkuTransactions)
    ? restored.bkuTransactions
    : Array.isArray(restored.manualBkuTransactions)
    ? restored.manualBkuTransactions
    : [];
  const kwitansiList = Array.isArray(restored.kwitansiList) ? restored.kwitansiList : [];
  const taxRecords = Array.isArray(restored.taxRecords)
    ? restored.taxRecords
    : Array.isArray(restored.manualTaxRecords)
    ? restored.manualTaxRecords
    : [];
  const rpdItems = Array.isArray(restored.rpdItems) ? restored.rpdItems : [];
  const stores = Array.isArray(restored.stores) ? restored.stores : [];
  const workers = Array.isArray(restored.workers) ? restored.workers : [];
  const wageReports = Array.isArray(restored.wageReports) ? restored.wageReports : [];

  // 1. Ensure bkbRecords exist and are up to date
  let bkbRecords = Array.isArray(restored.bkbRecords) ? restored.bkbRecords : [];
  if (!bkbRecords || bkbRecords.length === 0) {
    bkbRecords = generateStandardBkbRecords(school, progressWeeks, bkuWeekLimit, bkuTransactions);
  } else {
    bkbRecords = harmonizeBkbRecordsWithSiplah(bkbRecords, bkuTransactions, school);
  }

  return {
    ...restored,
    school,
    progressWeeks,
    bkuWeekLimit,
    bkbRecords,
    bkuTransactions,
    manualBkuTransactions: restored.manualBkuTransactions || bkuTransactions,
    kwitansiList,
    taxRecords,
    manualTaxRecords: restored.manualTaxRecords || taxRecords,
    rpdItems,
    stores,
    workers,
    wageReports,
  };
}


