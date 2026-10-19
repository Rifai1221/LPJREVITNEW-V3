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
import { getAutoHealedKwitansiItems, getHarmonizedKwitansiNoBukti, getHarmonizedKwitansiUraian } from './autoGeneratorService';

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
  bkuWeekLimit: number = 14
): BkbTransaction[] {
  const yearStr = school?.tahunAnggaran?.trim() || '2026';
  const records: BkbTransaction[] = [];

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

  const termin1Amount =
    school?.termin1Nilai ||
    (school?.totalAnggaran ? Math.round(school.totalAnggaran * ((school.termin1Persen || 70) / 100)) : 0);

  if (termin1Amount > 0) {
    // 1. Penerimaan Bank Termin 1
    records.push({
      id: 'bkb-init-termin1',
      tanggal: startSlash,
      tanggalObj: startIso,
      bulan: startBulan,
      uraian: 'Penerimaan Dana Revitalisasi Termin 1 (70%) ke Rekening Bank',
      noBukti: `BB-01/${yearStr}`,
      penerimaan: termin1Amount,
      pengeluaran: 0,
      kategori: 'PENERIMAAN_TERMIN',
    });

    // 2. Penarikan Tunai dari Bank Tahap 1 untuk Kas Tunai (BKT)
    // Sesuai standar tata kelola kas sekolah: Penarikan tunai operasional tahap awal ~60% dari termin 1,
    // menyisakan saldo kas di bank yang sehat (~40%) dan kas tunai fisik bendahara siap pakai.
    const initialWithdrawal = Math.round(termin1Amount * 0.6);
    records.push({
      id: 'bkb-withdraw-termin1',
      tanggal: startSlash,
      tanggalObj: startIso,
      bulan: startBulan,
      uraian: 'Penarikan Tunai dari Bank (Tahap 1) untuk Kas Tunai Operasional BKT',
      noBukti: 'BKT-01',
      penerimaan: 0,
      pengeluaran: initialWithdrawal,
      kategori: 'TARIK_TUNAI',
    });

    // Jika minggu proyek berlanjut (minggu 5 ke atas), ada penarikan tahap 2 dari sisa termin 1
    if (bkuWeekLimit >= 5) {
      let w5Iso = startIso;
      let w5Slash = startSlash;
      let w5Bulan = startBulan;
      if (progressWeeks && progressWeeks.length > 0) {
        const w5 = progressWeeks.find((w) => w.mingguKe === 5) || progressWeeks[Math.min(4, progressWeeks.length - 1)];
        const resW5 = resolveWeekDates(w5, yearStr);
        w5Iso = resW5.startDate;
        w5Slash = resW5.startDateSlash;
        w5Bulan = resW5.bulan;
      }
      const secondWithdrawal = Math.round(termin1Amount * 0.25);
      records.push({
        id: 'bkb-withdraw-termin1-stage2',
        tanggal: w5Slash,
        tanggalObj: w5Iso,
        bulan: w5Bulan,
        uraian: 'Penarikan Tunai dari Bank (Tahap 2) untuk Kas Tunai Operasional BKT',
        noBukti: 'BKT-02',
        penerimaan: 0,
        pengeluaran: secondWithdrawal,
        kategori: 'TARIK_TUNAI',
      });
    }
  }

  // Jika minggu mencapai Termin 2 (misal minggu 8+)
  if (bkuWeekLimit >= 8) {
    let termin2Iso = `${yearStr}-09-01`;
    let termin2Slash = `01/09/${yearStr}`;
    let termin2Bulan = `September ${yearStr}`;

    if (progressWeeks && progressWeeks.length > 0) {
      const w8 = progressWeeks.find((w) => w.mingguKe === 8) || progressWeeks[Math.min(7, progressWeeks.length - 1)];
      const resolved8 = resolveWeekDates(w8, yearStr);
      termin2Iso = resolved8.startDate;
      termin2Slash = resolved8.startDateSlash;
      termin2Bulan = resolved8.bulan;
    }

    const termin2Amount =
      school?.termin2Nilai ||
      (school?.totalAnggaran ? Math.round(school.totalAnggaran * ((school.termin2Persen || 30) / 100)) : 0);

    if (termin2Amount > 0) {
      // 3. Penerimaan Bank Termin 2
      records.push({
        id: 'bkb-init-termin2',
        tanggal: termin2Slash,
        tanggalObj: termin2Iso,
        bulan: termin2Bulan,
        uraian: 'Penerimaan Dana Revitalisasi Termin 2 (30%) ke Rekening Bank',
        noBukti: `BB-02/${yearStr}`,
        penerimaan: termin2Amount,
        pengeluaran: 0,
        kategori: 'PENERIMAAN_TERMIN',
      });

      // 4. Penarikan Tunai Termin 2 dari Bank untuk Kas Tunai
      const withdrawT2 = Math.round(termin2Amount * 0.7);
      records.push({
        id: 'bkb-withdraw-termin2',
        tanggal: termin2Slash,
        tanggalObj: termin2Iso,
        bulan: termin2Bulan,
        uraian: 'Penarikan Tunai dari Bank (Termin 2) untuk Kas Tunai Operasional BKT',
        noBukti: 'BKT-03',
        penerimaan: 0,
        pengeluaran: withdrawT2,
        kategori: 'TARIK_TUNAI',
      });
    }
  }

  return records;
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
        // Lewati biaya administrasi bank langsung jika bukan penarikan tunai
        if (bkbTx.kategori === 'BIAYA_ADMIN') return;

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

    // Lewati jika transaksi ditandai transfer bank langsung non-tunai
    if (item.metodeBayar === 'BANK') {
      return;
    }

    bktItems.push({
      id: `bkt-${item.id}`,
      tanggal: item.tanggal,
      tanggalObj: item.tanggalObj || parseTxDateToIso(item.tanggal),
      bulan: item.bulan,
      uraian: item.uraian,
      noBukti: item.noBukti,
      pemasukan: 0,
      pengeluaran: item.pengeluaran,
      saldo: 0,
      kategoriBiaya: item.kategoriBiaya,
      kwitansiIdRef: item.kwitansiIdRef,
      metodeBayar: 'TUNAI',
    });
  });

  // 3. Urutkan secara kronologis akurat:
  // - Ascending berdasarkan tanggal
  // - Jika pada tanggal yang sama: Pemasukan dari penarikan bank diletakkan LEBIH DAHULU sebelum belanja tunai
  bktItems.sort((a, b) => {
    const isoA = a.tanggalObj || parseTxDateToIso(a.tanggal);
    const isoB = b.tanggalObj || parseTxDateToIso(b.tanggal);
    if (isoA !== isoB) {
      return isoA.localeCompare(isoB);
    }
    // Dahulukan pemasukan tunai
    if (a.pemasukan > 0 && b.pemasukan === 0) return -1;
    if (b.pemasukan > 0 && a.pemasukan === 0) return 1;
    return 0;
  });

  // 4. Hitung saldo kumulatif berjalan (Running Balance)
  let running = 0;
  return bktItems.map((item) => {
    running = running + (item.pemasukan || 0) - (item.pengeluaran || 0);
    return {
      ...item,
      saldo: running,
    };
  });
}

/**
 * Mendapatkan posisi saldo akhir BKB pada suatu bulan tertentu
 */
export function getBkbSaldoAtMonth(bkbList: BkbTransaction[], monthName: string): number {
  if (!bkbList || bkbList.length === 0) return 0;
  const computed = calculateRunningBkb(bkbList);

  // Cari transaksi terakhir di bulan tersebut
  const inMonth = computed.filter((b) => b.bulan === monthName);
  if (inMonth.length > 0) {
    return inMonth[inMonth.length - 1].saldo || 0;
  }

  // Jika tidak ada di bulan tersebut, cari transaksi terakhir sebelum atau sama dengan bulan itu
  // Fallback ke saldo terakhir keseluruhan jika tidak spesifik
  return computed[computed.length - 1]?.saldo || 0;
}

/**
 * Mendapatkan posisi saldo akhir BKT pada suatu bulan tertentu
 */
export function getBktSaldoAtMonth(bktList: BktTransaction[], monthName: string): number {
  if (!bktList || bktList.length === 0) return 0;
  const inMonth = bktList.filter((b) => b.bulan === monthName);
  if (inMonth.length > 0) {
    return inMonth[inMonth.length - 1].saldo || 0;
  }
  return bktList[bktList.length - 1]?.saldo || 0;
}

/**
 * Melakukan verifikasi rekonsiliasi kas (BKU vs BKB + BKT)
 */
export function reconcileCashBalances(
  bkuSaldo: number,
  bkbSaldo: number,
  bktSaldo: number
): CashReconciliationResult {
  const sumSubLedgers = bkbSaldo + bktSaldo;
  const selisih = bkuSaldo - sumSubLedgers;
  const isBalanced = Math.abs(selisih) === 0;

  return {
    saldoBku: bkuSaldo,
    saldoBank: bkbSaldo,
    saldoTunai: bktSaldo,
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

  // 1. Cocokkan ID referensi langsung jika tersedia
  if (tx.kwitansiIdRef) {
    const byRef = kwitansiList.find((k) => k.id === tx.kwitansiIdRef);
    if (byRef) return byRef;
  }

  // 2. Cocokkan prefix ID sistem
  const byPrefixId = kwitansiList.find(
    (k) =>
      tx.id === `bku-kw-${k.id}` ||
      tx.id === `bkt-kw-${k.id}` ||
      tx.id === k.id ||
      k.id.includes(tx.id.replace(/^bku-|^bkt-/, ''))
  );
  if (byPrefixId) return byPrefixId;

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
      if (upahKw) return upahKw;
    }

    const txNom = (tx as any).pengeluaran || (tx as any).pemasukan || 0;
    const upahByDateOrNom = kwitansiList.find(
      (k) =>
        (k.tipe === 'UPAH' || /upah/i.test(k.uraian)) &&
        (k.tanggal === tx.tanggal || Math.abs(k.nominal - txNom) < 2)
    );
    if (upahByDateOrNom) return upahByDateOrNom;
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
    if (mgtKw) return mgtKw;
  }

  // 5. Cocokkan berdasarkan No Bukti (dengan normalisasi karakter dan angka)
  if (tx.noBukti && tx.noBukti !== '-' && tx.noBukti.trim()) {
    const cleanTxBukti = tx.noBukti.trim().toLowerCase();
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
        // Only consider equal if type prefixes align
        const prefixTx = cleanTxBukti.replace(/[\d\/\-_]/g, '');
        const prefixK = cleanKBukti.replace(/[\d\/\-_]/g, '');
        if (prefixTx === prefixK) return true;
      }
      return false;
    });
    if (byNoBukti) return byNoBukti;
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
    if (byStoreAndNom) return byStoreAndNom;

    // Fallback: nominal sama persis dan tanggal sama persis
    const byDateAndNom = kwitansiList.find(
      (k) => Math.abs(k.nominal - txNom) < 2 && k.tanggal === tx.tanggal
    );
    if (byDateAndNom) return byDateAndNom;
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

  const equivKw: Partial<KwitansiDocument> = {
    id: tx.kwitansiIdRef || `kw-syn-${tx.id}`,
    noBukti: tx.noBukti,
    noSpb: `SPB-${tx.noBukti || '01'}`,
    tipe,
    tanggal: tx.tanggal,
    tanggalFormatted: tx.tanggal,
    bulan: tx.bulan,
    uraian: tx.uraian,
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
 * Auto-Transformer & Migration service for backup restoration.
 * Automatically upgrades older backup JSON states to adopt the new BKT/BKB calculation structure
 * and ensures all necessary lists (bkbRecords, kwitansiList, taxRecords, etc.) are present and valid.
 */
export function migrateAndTransformAppState(restored: any): any {
  if (!restored || typeof restored !== 'object') return restored;

  const school = restored.school || {};
  const progressWeeks = restored.progressWeeks || [];
  const bkuWeekLimit = restored.bkuWeekLimit || 14;

  // 1. Ensure bkbRecords exist and are up to date
  let bkbRecords = restored.bkbRecords || [];
  if (!bkbRecords || bkbRecords.length === 0) {
    bkbRecords = generateStandardBkbRecords(school, progressWeeks, bkuWeekLimit);
  }

  // 2. Ensure other key arrays exist
  const bkuTransactions = restored.bkuTransactions || [];
  const kwitansiList = restored.kwitansiList || [];
  const taxRecords = restored.taxRecords || [];
  const rpdItems = restored.rpdItems || [];
  const stores = restored.stores || [];
  const workers = restored.workers || [];
  const wageReports = restored.wageReports || [];

  return {
    ...restored,
    school,
    progressWeeks,
    bkuWeekLimit,
    bkbRecords,
    bkuTransactions,
    kwitansiList,
    taxRecords,
    rpdItems,
    stores,
    workers,
    wageReports,
  };
}


