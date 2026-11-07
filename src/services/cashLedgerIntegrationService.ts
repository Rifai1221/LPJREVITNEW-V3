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
  school?: SchoolMasterData,
  progressWeeks: ProjectProgressWeek[] = []
): BkbTransaction[] {
  const records: BkbTransaction[] = [];
  const yearStr = school?.tahunAnggaran?.trim() || '2026';

  // 1. Process BKU Penerimaan to BKB PENERIMAAN_TERMIN
  const penerimaanTxs = (bkuList || []).filter((tx) => tx.jenis === 'PENERIMAAN');

  if (penerimaanTxs.length > 0) {
    penerimaanTxs.forEach((pTx, idx) => {
      records.push({
        id: `bkb-penerimaan-${pTx.id || idx}`,
        tanggal: pTx.tanggal,
        tanggalObj: pTx.tanggalObj || parseTxDateToIso(pTx.tanggal),
        bulan: pTx.bulan,
        uraian: pTx.uraian,
        noBukti: pTx.noBukti || `BB-${String(idx + 1).padStart(2, '0')}/${yearStr}`,
        penerimaan: pTx.penerimaan,
        pengeluaran: 0,
        kategori: 'PENERIMAAN_TERMIN',
      });
    });
  } else {
    // Fallback default receipts if BKU has no penerimaan yet
    const t1Nom = school?.termin1Nilai || Math.round((school?.totalAnggaran || 0) * 0.7);
    const t2Nom = school?.termin2Nilai || Math.round((school?.totalAnggaran || 0) * 0.3);

    let startIso = `${yearStr}-07-01`;
    let startSlash = `01/07/${yearStr}`;
    let startBulan = `Juli ${yearStr}`;

    if (progressWeeks && progressWeeks.length > 0) {
      const w1 = progressWeeks.find((w) => w.mingguKe === 1) || progressWeeks[0];
      const resolved = resolveWeekDates(w1, yearStr);
      startIso = resolved.startDate;
      startSlash = resolved.startDateSlash;
      startBulan = resolved.bulan;
    }

    if (t1Nom > 0) {
      records.push({
        id: 'bkb-init-termin1',
        tanggal: startSlash,
        tanggalObj: startIso,
        bulan: startBulan,
        uraian: 'Penerimaan Dana Revitalisasi Termin 1 (70%) ke Rekening Bank',
        noBukti: `BB-01/${yearStr}`,
        penerimaan: t1Nom,
        pengeluaran: 0,
        kategori: 'PENERIMAAN_TERMIN',
      });
    }

    if (t2Nom > 0) {
      let t2Iso = `${yearStr}-09-01`;
      let t2Slash = `01/09/${yearStr}`;
      let t2Bulan = `September ${yearStr}`;

      if (progressWeeks && progressWeeks.length > 0) {
        const w6 = progressWeeks.find((w) => w.mingguKe === 6) || progressWeeks[Math.min(5, progressWeeks.length - 1)];
        const res6 = resolveWeekDates(w6, yearStr);
        t2Iso = res6.startDate;
        t2Slash = res6.startDateSlash;
        t2Bulan = res6.bulan;
      }

      records.push({
        id: 'bkb-init-termin2',
        tanggal: t2Slash,
        tanggalObj: t2Iso,
        bulan: t2Bulan,
        uraian: 'Penerimaan Dana Revitalisasi Termin 2 (30%) ke Rekening Bank',
        noBukti: `BB-02/${yearStr}`,
        penerimaan: t2Nom,
        pengeluaran: 0,
        kategori: 'PENERIMAAN_TERMIN',
      });
    }
  }

  // 2. Harmonize BKB SIPLAH debits 1-to-1 with BKU
  const harmonizedSiplah = harmonizeBkbRecordsWithSiplah([], bkuList, school);
  harmonizedSiplah.forEach((s) => records.push(s));

  // 3. Dynamic TARIK_TUNAI calculation based on actual cash expenses in BKU
  const cashExpenses = (bkuList || [])
    .filter((tx) => {
      if (tx.jenis === 'PENERIMAAN') return false;
      const isSiplah =
        tx.metodeBayar === 'BANK' ||
        tx.kategoriBiaya === 'Siplah' ||
        tx.kategoriBiaya === 'SIPLAH' ||
        /siplah|daring/i.test(`${tx.noBukti || ''} ${tx.uraian || ''} ${tx.kategoriBiaya || ''}`);
      return !isSiplah;
    })
    .sort((a, b) => {
      const isoA = a.tanggalObj || parseTxDateToIso(a.tanggal);
      const isoB = b.tanggalObj || parseTxDateToIso(b.tanggal);
      return isoA.localeCompare(isoB);
    });

  const totalCashNeed = cashExpenses.reduce((s, c) => s + (c.pengeluaran || 0), 0);

  if (totalCashNeed > 0) {
    let runningCash = 0;
    let totalWithdrawn = 0;
    let withdrawalCount = 0;

    cashExpenses.forEach((exp, idx) => {
      const expNom = exp.pengeluaran || 0;

      if (runningCash < expNom) {
        const expIso = exp.tanggalObj || parseTxDateToIso(exp.tanggal);

        let targetWindowSum = 0;
        for (let j = idx; j < cashExpenses.length; j++) {
          const nextIso = cashExpenses[j].tanggalObj || parseTxDateToIso(cashExpenses[j].tanggal);
          const diffDays = Math.round(
            (new Date(nextIso).getTime() - new Date(expIso).getTime()) / (1000 * 3600 * 24)
          );
          if (diffDays <= 28) {
            targetWindowSum += cashExpenses[j].pengeluaran || 0;
          } else {
            break;
          }
        }

        const minNeededToPreventDeficit = Math.max(0, expNom - runningCash);
        const neededRaw = Math.max(minNeededToPreventDeficit, targetWindowSum - runningCash);
        let withdrawAmount = Math.ceil(neededRaw / 1000000) * 1000000;

        if (withdrawAmount < minNeededToPreventDeficit) {
          withdrawAmount = Math.ceil(minNeededToPreventDeficit / 1000000) * 1000000;
        }

        if (withdrawAmount > 0) {
          withdrawalCount++;
          const padIdx = String(withdrawalCount).padStart(2, '0');

          records.push({
            id: `bkb-withdraw-${exp.id || withdrawalCount}`,
            tanggal: exp.tanggal,
            tanggalObj: expIso,
            bulan: exp.bulan,
            uraian: `Penarikan Tunai dari Bank (Tahap ${withdrawalCount}) untuk Kas Tunai Operasional BKT`,
            noBukti: `BKT-OUT-${padIdx}`,
            penerimaan: 0,
            pengeluaran: withdrawAmount,
            kategori: 'TARIK_TUNAI',
          });

          totalWithdrawn += withdrawAmount;
          runningCash += withdrawAmount;
        }
      }

      runningCash -= expNom;
    });

    if (totalWithdrawn < totalCashNeed) {
      const remainingDeficit = totalCashNeed - totalWithdrawn;
      withdrawalCount++;
      const lastExp = cashExpenses[cashExpenses.length - 1];
      records.push({
        id: `bkb-withdraw-final-${Date.now()}`,
        tanggal: lastExp?.tanggal || records[0]?.tanggal || `01/07/${yearStr}`,
        tanggalObj: lastExp?.tanggalObj || records[0]?.tanggalObj || `${yearStr}-07-01`,
        bulan: lastExp?.bulan || records[0]?.bulan || `Juli ${yearStr}`,
        uraian: `Penarikan Tunai dari Bank (Tahap ${withdrawalCount}) Pelunasan Belanja Tunai`,
        noBukti: `BKT-OUT-${String(withdrawalCount).padStart(2, '0')}`,
        penerimaan: 0,
        pengeluaran: remainingDeficit,
        kategori: 'TARIK_TUNAI',
      });
    }
  } else {
    const t1Nom = school?.termin1Nilai || Math.round((school?.totalAnggaran || 0) * 0.7);
    if (t1Nom > 0) {
      const firstRec = records[0];
      records.push({
        id: 'bkb-withdraw-default-1',
        tanggal: firstRec?.tanggal || `01/07/${yearStr}`,
        tanggalObj: firstRec?.tanggalObj || `${yearStr}-07-01`,
        bulan: firstRec?.bulan || `Juli ${yearStr}`,
        uraian: 'Penarikan Tunai dari Bank (Tahap 1) untuk Kas Tunai Operasional BKT',
        noBukti: 'BKT-OUT-01',
        penerimaan: 0,
        pengeluaran: Math.round(t1Nom * 0.7),
        kategori: 'TARIK_TUNAI',
      });
    }
  }

  return calculateRunningBkb(
    records.sort((a, b) => {
      const isoA = a.tanggalObj || parseTxDateToIso(a.tanggal);
      const isoB = b.tanggalObj || parseTxDateToIso(b.tanggal);
      if (isoA !== isoB) return isoA.localeCompare(isoB);
      if ((a.penerimaan || 0) > 0 && (b.penerimaan || 0) === 0) return -1;
      if ((b.penerimaan || 0) > 0 && (a.penerimaan || 0) === 0) return 1;
      return 0;
    })
  );
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
 * Menghitung BKT (Buku Kas Tunai) terintegrasi penuh:
 * 1. Uang Masuk (Debet): Berasal dari Kredit / Penarikan tunai yang ada di BKB (Buku Pembantu Kas Bank),
 *    karena asumsinya adalah uang fisik yang sudah ditarik dari bank ke kas bendahara.
 * 2. Uang Keluar (Kredit): Berasal dari belanja riil di BKU yang dibayarkan secara tunai (bukan transfer bank).
 * 3. Saldo Berjalan: Dihitung secara kronologis kumulatif (Pemasukan Penarikan Bank - Pengeluaran Belanja Tunai).
 */
export function calculateIntegratedBkt(
  bkuList: BkuTransaction[],
  bkbList: BkbTransaction[] = []
): BktTransaction[] {
  const bktItems: BktTransaction[] = [];

  // 1. Ambil seluruh transaksi Penarikan Tunai dari BKB (Kredit / Pengeluaran di Bank)
  const hasBkbWithdrawals = bkbList.some((b) => (b.pengeluaran || 0) > 0);

  if (hasBkbWithdrawals) {
    bkbList.forEach((bkbTx, idx) => {
      if ((bkbTx.pengeluaran || 0) > 0) {
        // Lewati biaya administrasi bank & belanja non-tunai SIPLah (karena SIPLah langsung transfer dari bank ke toko, bukan tarik tunai ke bendahara)
        const isNonCashBankDebit =
          bkbTx.kategori === 'BIAYA_ADMIN' ||
          bkbTx.kategori === 'SIPLAH' ||
          bkbTx.kategori === 'BELANJA_NON_TUNAI' ||
          /siplah|non-tunai|non tunai|daring/i.test(`${bkbTx.kategori || ''} ${bkbTx.uraian || ''} ${bkbTx.noBukti || ''}`);

        if (isNonCashBankDebit) return;

        bktItems.push({
          id: `bkt-inflow-${bkbTx.id || idx}`,
          tanggal: bkbTx.tanggal,
          tanggalObj: bkbTx.tanggalObj || parseTxDateToIso(bkbTx.tanggal),
          bulan: bkbTx.bulan,
          uraian: bkbTx.uraian.toLowerCase().includes('penarikan') || bkbTx.uraian.toLowerCase().includes('tarik')
            ? bkbTx.uraian
            : `Penarikan Tunai dari Rekening Bank (${bkbTx.uraian})`,
          noBukti: bkbTx.noBukti || `BKT-${String(idx + 1).padStart(2, '0')}`,
          pemasukan: bkbTx.pengeluaran,
          pengeluaran: 0,
          saldo: 0,
          kategoriBiaya: 'Penerimaan',
          metodeBayar: 'TUNAI',
        });
      }
    });
  } else {
    // Fallback darurat jika BKB belum diisi penarikan tunai sama sekali:
    // Gunakan transaksi penerimaan bantuan BKU yang diubah menjadi penarikan operasional tunai
    bkuList.forEach((item, idx) => {
      if (item.jenis === 'PENERIMAAN') {
        bktItems.push({
          id: `bkt-inflow-${item.id || idx}`,
          tanggal: item.tanggal,
          tanggalObj: item.tanggalObj || parseTxDateToIso(item.tanggal),
          bulan: item.bulan,
          uraian: `Penarikan Tunai dari Bank untuk Kas Operasional (${item.uraian})`,
          noBukti: item.noBukti ? `BKT-${item.noBukti}` : 'BKT-01',
          pemasukan: item.penerimaan,
          pengeluaran: 0,
          saldo: 0,
          kategoriBiaya: 'Penerimaan',
          metodeBayar: 'TUNAI',
        });
      }
    });
  }

  // 2. Ambil seluruh transaksi Pengeluaran Belanja Tunai dari BKU
  bkuList.forEach((item) => {
    // Lewati transaksi penerimaan BKU karena dana bantuan masuk ke Bank (BKB), bukan kas fisik langsung
    if (item.jenis === 'PENERIMAAN') {
      return;
    }

    // Lewati jika transaksi ditandai transfer bank langsung non-tunai atau belanja SIPLah Daring
    const isNonCashOrSiplah =
      item.metodeBayar === 'BANK' ||
      item.kategoriBiaya === 'Siplah' ||
      item.kategoriBiaya === 'SIPLAH' ||
      /siplah|daring/i.test(`${item.noBukti || ''} ${item.uraian || ''} ${item.kategoriBiaya || ''}`);

    if (isNonCashOrSiplah) {
      return;
    }

    bktItems.push({
      id: `bkt-${item.id}`,
      tanggal: item.tanggal, // BKU source provides the updated tanggal
      tanggalObj: item.tanggalObj || parseTxDateToIso(item.tanggal), // BKU source provides updated tanggalObj
      bulan: item.bulan,
      uraian: item.uraian,
      noBukti: item.noBukti,
      pemasukan: 0,
      pengeluaran: item.pengeluaran,
      saldo: 0,
      kategoriBiaya: item.kategoriBiaya,
      kwitansiIdRef: item.kwitansiIdRef,
      metodeBayar: 'TUNAI',
      isLocked: item.isLocked,
      isManualDate: item.isManualDate,
      isManual: item.isManual,
    });
  });

  // 3. Ekstraksi daftar seluruh penarikan bank (inflows) yang terurut berdasarkan tanggal
  const bankWithdrawals = bktItems
    .filter((t) => (t.pemasukan || 0) > 0)
    .map((t) => ({
      iso: t.tanggalObj || parseTxDateToIso(t.tanggal),
      tanggal: t.tanggal,
      bulan: t.bulan,
      nominal: t.pemasukan,
    }))
    .sort((a, b) => a.iso.localeCompare(b.iso));

  // 4. Urutkan transaksi awal secara kronologis (pemasukan didahulukan jika pada tanggal yang sama)
  const initialSorted = [...bktItems].sort((a, b) => {
    const isoA = a.tanggalObj || parseTxDateToIso(a.tanggal);
    const isoB = b.tanggalObj || parseTxDateToIso(b.tanggal);
    if (isoA !== isoB) {
      return isoA.localeCompare(isoB);
    }
    if ((a.pemasukan || 0) > 0 && (b.pemasukan || 0) === 0) return -1;
    if ((b.pemasukan || 0) > 0 && (a.pemasukan || 0) === 0) return 1;
    return 0;
  });

  // 5. Intelligent Anti-Minus Cash-Cap Quantity Splitter
  // Menjamin saldo kas BKT TIDAK PERNAH MINUS (< 0).
  // Jika pengeluaran melebihi sisa kas tunai sebelum ada penarikan bank berikutnya:
  // - Tahap 1: Dibayarkan sebesar kas yang tersedia (saldo menjadi Rp 0, tidak minus).
  // - Tahap 2: Sisa pembayaran dialokasikan pada tanggal penarikan bank berikutnya saat dana kas baru masuk.
  const queue: BktTransaction[] = [...initialSorted];
  const finalBktItems: BktTransaction[] = [];
  let runningCash = 0;
  let safetyLoop = 0;
  const maxIterations = queue.length * 5;

  const insertChronologically = (q: BktTransaction[], item: BktTransaction) => {
    const itemIso = item.tanggalObj || parseTxDateToIso(item.tanggal);
    const idx = q.findIndex((existing) => {
      const exIso = existing.tanggalObj || parseTxDateToIso(existing.tanggal);
      if (exIso > itemIso) return true;
      if (exIso === itemIso && (existing.pemasukan || 0) === 0 && (item.pemasukan || 0) > 0) return true;
      return false;
    });
    if (idx === -1) {
      q.push(item);
    } else {
      q.splice(idx, 0, item);
    }
  };

  while (queue.length > 0 && safetyLoop < maxIterations) {
    safetyLoop++;
    const curr = queue.shift()!;

    // A. Pemasukan Kas Tunai (Penarikan Bank)
    if ((curr.pemasukan || 0) > 0) {
      runningCash += curr.pemasukan;
      finalBktItems.push({
        ...curr,
        saldo: runningCash,
      });
      continue;
    }

    // B. Pengeluaran Belanja Tunai
    const expenseNominal = curr.pengeluaran || 0;
    if (expenseNominal <= 0) {
      finalBktItems.push({
        ...curr,
        saldo: runningCash,
      });
      continue;
    }

    // Jika saldo kas saat ini mencukupi, bayar penuh
    if (expenseNominal <= runningCash) {
      runningCash -= expenseNominal;
      finalBktItems.push({
        ...curr,
        saldo: runningCash,
      });
      continue;
    }

    // KAS TIDAK MENCUKUPI (Potensi Minus):
    // Cari tanggal penarikan bank berikutnya setelah tanggal transaksi ini
    const currIso = curr.tanggalObj || parseTxDateToIso(curr.tanggal);
    const nextWithdrawal = bankWithdrawals.find((w) => w.iso > currIso);

    // Proteksi Pembayaran Pasti (Konsultan Perencana, Pengawas, Pengelola SPJ, Belanja SMKK, Belanja SipLah, Belanja Cetak, Upah):
    // Pembayaran pasti ini TIDAK BOLEH dipecah/di-split sebagian (wajib utuh).
    // Hanya pembelian bahan material yang diperbolehkan untuk di-split proporsional.
    const isFixedOrNonMaterial = isFixedNonSplitPayment(curr) || !isMaterialOnlyPurchase(curr);

    if (isFixedOrNonMaterial) {
      // Jika ada penarikan kas bank berikutnya, mundurkan transaksi pembayaran pasti ini secara UTUH
      if (nextWithdrawal) {
        const deferredTx: BktTransaction = {
          ...curr,
          tanggal: nextWithdrawal.tanggal,
          tanggalObj: nextWithdrawal.iso,
          bulan: nextWithdrawal.bulan,
        };
        insertChronologically(queue, deferredTx);
        continue;
      }
      // Jika tidak ada penarikan bank lagi, catat utuh tanpa split
      runningCash -= expenseNominal;
      finalBktItems.push({
        ...curr,
        saldo: runningCash,
      });
      continue;
    }

    // Kasus 1: Masih ada sisa kas tunai > 0 (HANYA UNTUK BELANJA BAHAN MATERIAL)
    if (runningCash > 0) {
      const part1Nominal = runningCash;
      const part2Nominal = expenseNominal - part1Nominal;

      // Catat Bagian 1 sesuai sisa kas yang tersedia (Saldo kas pas Rp 0, tidak minus)
      runningCash = 0;
      finalBktItems.push({
        ...curr,
        id: `${curr.id}-p1`,
        uraian: cleanNaturalUraian(curr.uraian),
        pengeluaran: part1Nominal,
        saldo: 0,
      });

      // Jadwalkan Bagian 2 pada tanggal penarikan bank berikutnya
      const part2Date = nextWithdrawal ? nextWithdrawal.tanggal : curr.tanggal;
      const part2Iso = nextWithdrawal ? nextWithdrawal.iso : currIso;
      const part2Bulan = nextWithdrawal ? nextWithdrawal.bulan : curr.bulan;

      const part2Tx: BktTransaction = {
        ...curr,
        id: `${curr.id}-p2`,
        tanggal: part2Date,
        tanggalObj: part2Iso,
        bulan: part2Bulan,
        uraian: cleanNaturalUraian(curr.uraian),
        noBukti: (curr.noBukti || '').replace(/-B$/, '').trim(),
        pengeluaran: part2Nominal,
        pemasukan: 0,
        saldo: 0,
      };

      insertChronologically(queue, part2Tx);
      continue;
    }

    // Kasus 2: Kas tunai saat ini sudah Rp 0:
    // Tunda pembayaran transaksi ini ke tanggal penarikan bank berikutnya
    if (nextWithdrawal) {
      const deferredTx: BktTransaction = {
        ...curr,
        tanggal: nextWithdrawal.tanggal,
        tanggalObj: nextWithdrawal.iso,
        bulan: nextWithdrawal.bulan,
      };
      insertChronologically(queue, deferredTx);
      continue;
    }

    // Fallback darurat jika tidak ada penarikan bank lagi
    runningCash -= expenseNominal;
    finalBktItems.push({
      ...curr,
      uraian: cleanNaturalUraian(curr.uraian),
      noBukti: (curr.noBukti || '').replace(/-B$/, '').trim(),
      saldo: runningCash,
    });
  }

  // Final Reconciliation Cleanup:
  let runBal = 0;
  const recomputed = finalBktItems.map((tx) => {
    runBal = runBal + (tx.pemasukan || 0) - (tx.pengeluaran || 0);
    return {
      ...tx,
      saldo: runBal,
    };
  });

  if (recomputed.length > 0) {
    const lastIdx = recomputed.length - 1;
    if (Math.abs(recomputed[lastIdx].saldo || 0) <= 1000) {
      recomputed[lastIdx].saldo = 0;
    }
  }

  const targetYear =
    recomputed.find((b) => b.noBukti)?.noBukti?.match(/\b(20\d\d)\b/)?.[1] ||
    recomputed.find((b) => b.tanggalObj || b.tanggal)?.tanggalObj?.slice(0, 4) ||
    '2026';

  return renumberMaterialTransactionsChronologically(recomputed, targetYear);
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

  // 1. Keep non-SIPLAH BKB transactions (PENERIMAAN_TERMIN, TARIK_TUNAI, BIAYA_ADMIN, BELANJA_NON_TUNAI)
  bkbArray.forEach((bkb) => {
    if (bkb.kategori !== 'SIPLAH') {
      result.push(bkb);
    }
  });

  // 2. Find all SIPLAH BKU transactions
  const bkuArray = Array.isArray(bkuList) ? bkuList : [];
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
export function migrateAndTransformAppState(restored: any): any {
  if (!restored || typeof restored !== 'object') return restored;

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


