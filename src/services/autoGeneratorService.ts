import {
  BkuTransaction,
  BktTransaction,
  BkbTransaction,
  KwitansiDocument,
  TaxRecord,
  SchoolMasterData,
  RpdItem,
  ProjectProgressWeek,
  WorkerItem,
  StoreVendor,
  WeeklyWageReport,
  RealSchoolData,
  RabDivision,
  RabSubItem,
} from '../types';
import { resolveWeekDates, parseTxDateToIso, indonesianMonths, monthOrderMap } from '../utils/monthHelper';
import { getAhspWageRateForRole } from '../utils/divisionHelper';

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
 * Memecah kwitansi material jika melebihi kas yang tersedia, 
 * dengan tetap memprioritaskan cadangan upah tukang.
 */
export function splitMaterialPurchases(
  kw: KwitansiDocument,
  availableCash: number,
  laborReserve: number
): KwitansiDocument[] {
  const netAvailableForMaterial = Math.max(0, availableCash - laborReserve);
  
  // Jika cukup, tidak perlu pecah
  if (kw.nominal <= netAvailableForMaterial || kw.tipe !== 'MATERIAL') {
    return [kw];
  }

  // Pecah proporsional
  const ratio = netAvailableForMaterial / kw.nominal;
  const kw1Nominal = Math.floor(kw.nominal * ratio);
  const kw2Nominal = kw.nominal - kw1Nominal;

  const kw1Items = kw.items.map(item => ({...item, volume: item.volume * ratio, jumlah: item.jumlah * ratio}));
  const kw2Items = kw.items.map(item => ({...item, volume: item.volume * (1 - ratio), jumlah: item.jumlah * (1 - ratio)}));

  return [
    { ...kw, id: `${kw.id}-part1`, nominal: kw1Nominal, items: kw1Items },
    { ...kw, id: `${kw.id}-part2`, nominal: kw2Nominal, items: kw2Items, tanggal: 'DITUNDA_SAMPAI_KAS_ADA' }
  ];
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

    // Kusen, Pintu & Jendela Aluminium (Fur)
    const isFur = /fur\/|pintu|jendela|kusen|aluminium/i.test(combined);
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

  // Match the transaction date directly with the weekly progress dates range (100% accurate fallback)
  if (k.tanggal && progressWeeks && progressWeeks.length > 0) {
    const txIso = parseTxDateToIso(k.tanggal, parseInt(schoolYear, 10));
    if (txIso) {
      const matchW = progressWeeks.find((w) => {
        const res = resolveWeekDates(w, schoolYear);
        return txIso >= res.startDate && txIso <= res.endDate;
      });
      if (matchW) return matchW.mingguKe;
    }
  }

  return null;
}

/**
 * Smart Commercial Material Rounding with Unit-Price Reconciliation:
 * Mengubah banyaknya volume bahan menjadi bulat/wajar seperti pembelian riil di toko material
 * tanpa mengubah nominal total (jumlah Rp) sedikitpun agar 100% klop dengan RAB/Realisasi.
 */
/**
 * Smart Commercial Material Rounding & Aggregation:
 * 1. Mengubah banyaknya volume bahan menjadi bulat/wajar seperti pembelian riil di toko material (Zak, m³, btg, lbr, dll).
 * 2. Melakukan AGREGASI / PENGGABUNGAN barang sejenis dalam kwitansi yang sama, sehingga tidak ada barang yang muncul berulang kali dengan harga satuan berbeda.
 * 3. Menghitung harga satuan rata-rata tertimbang (harmonized price) secara presisi sehingga total nominal tetap 100% klop dengan RAB.
 */
/**
 * Unit Preservation Engine (BPK & Inspektorat SPJ Standard):
 * Detects whether an item represents an intact prefabricated / assembled unit
 * (such as Doors, Windows, Frames, Louvers, Ventilations, or Furniture)
 * whose unit is 'unit', 'set', 'bh', 'buah', or 'ls' and MUST NOT be decomposed into sub-components.
 */
export function isPreservedUnitItem(nama: string, satuan?: string, isBarangPabrikasi?: boolean): boolean {
  if (isBarangPabrikasi === true) return true;
  const n = (nama || '').toLowerCase().trim();
  const s = (satuan || '').toLowerCase().trim();
  if (!n) return false;

  // Explicit check for tag or prefix
  if (/\[pabrikasi\]|\[barang jadi\]|pabrikasi/i.test(n)) return true;

  // Explicit check for opening assemblies & fabricated items: Kusen, Pintu, Jendela, Boven, Ventilasi, Jalusi, Rolling Door, Partisi, Perabot
  const isOpeningOrAssembly =
    /pintu|kusen|kosen|jendela|ventilasi|boven|jalusi|rolling door|folding gate|\bpj\d*|\bj\d*|\bv\d*|meubilair|perabot|kursi|meja|rak\s|loker|karpet|papan kreasi/i.test(n);

  if (isOpeningOrAssembly) {
    const isUnitOrSet = /^(unit|set|bh|buah|paket|ls)$/i.test(s);
    const isRawMeasure = /^(m3|m³|m2|m²|kg|meter|m\'|zak|btg)$/i.test(s);
    return isUnitOrSet || !isRawMeasure;
  }

  return false;
}

/**
 * Universal Detector for Pure Direct Retail Materials:
 * Identifies if a line item is already a physical single commercial store material
 * (e.g. Semen, Pasir, Paku, Besi, Cat, Bata, Kayu, Keramik) or a composite scope/trade that
 * needs decomposition into physical store materials.
 */
export function isPureDirectMaterial(name: string, satuan?: string, isBarangPabrikasi?: boolean): boolean {
  if (isBarangPabrikasi === true) return true;
  const n = (name || '').toLowerCase().trim();
  if (!n) return true;

  // Preserved unit assemblies (Kusen, Pintu, Jendela, Meja, Kursi) must NOT be broken down into retail parts:
  if (isPreservedUnitItem(n, satuan, isBarangPabrikasi)) {
    return true;
  }

  // SMKK / APD / K3 equipment items are pure retail goods and must NEVER be decomposed into cement/sand/gravel:
  if (/helm|rompi|sepatu boot|sarung tangan|p3k|rambu|k3|smkk|safety|masker|kacamata safety|earplug|tali keselamatan|body harness|pelindung|penerapan smkk/i.test(n)) {
    return true;
  }

  // If it starts with or contains job verbs or trade scopes, it's definitely NOT a pure single material:
  if (/pekerjaan|pasang|pemasangan|pengadaan|pembuatan|perbaikan|rehab|renovasi|bongkar|cor\b|pengecoran|plesteran|acian|urugan|uruk|galian|instalasi|pengecatan|pengukuran|bowplank|bouwplank|finishing|pembersihan|pondasi|aanstamping|tebal|\d+\s*cm|\d+\s*mm|bawah|campuran|manual/i.test(n)) {
    return false;
  }
  // Composite trades
  if (/rangka atap|penutup atap|struktur|kuda-kuda|kuda kuda|titik lampu|titik saklar|titik stop|sanitasi|saluran air/i.test(n)) {
    return false;
  }
  // Otherwise check if it matches standard physical single retail materials:
  return /semen|pasir|batu\b|split|kerikil|sirtu|bata\b|hebel|batako|besi\b|kawat|bendrat|paku\b|baut|sekrup|amplas|kertas gosok|lem\b|seal|sealant|lakban|thinner|tiner|cat\b|plamir|kuas|roll\b|hollow|gypsum|grc|kalsiboard|spandek|genteng|asbes|seng\b|nok\b|talang|reng\b|kanal\b|kabel|lampu|saklar|stop kontak|steker|fitting|pipa\b|kran\b|knee\b|socket|teflon|keramik|granit|ubin|grout|oker|engsel|grendel|kunci|handle|hak angin|kaca\b|papan\b|kaso\b|balok\b|triplek|plywood|multiplek|dolken|bambu|meja|kursi|whiteboard/i.test(n);
}

export function normalizeMaterialItems<T extends { namaBarang: string; volume: number; satuan: string; hargaSatuan: number; jumlah: number }>(
  rawItems: T[]
): T[] {
  if (!rawItems || rawItems.length === 0) return [];

  // 0. Universal Auto-Decompose any composite / non-pure-material items into physical store materials
  const expandedItems: T[] = [];
  rawItems.forEach((item) => {
    const rawName = (item.namaBarang || '').trim();
    const rawJml = item.jumlah || 0;

    const isPab = (item as any).isBarangPabrikasi;

    // UNIT PRESERVATION: Do not decompose doors, windows, frames, or tagged pabrikasi items
    if (isPab || isPreservedUnitItem(rawName, item.satuan, isPab)) {
      expandedItems.push({
        ...item,
        satuan: item.satuan || 'unit',
      });
      return;
    }

    const isCompositeJob = !isPureDirectMaterial(rawName, item.satuan, isPab);

    if (isCompositeJob && rawJml >= 25000) {
      const decomposed = decomposeRealisticBahanAndUpah(rawName, rawJml, 0);
      if (decomposed.bahanItems.length > 0) {
        decomposed.bahanItems.forEach((bi) => {
          expandedItems.push({
            ...item,
            namaBarang: bi.namaBarang,
            volume: bi.volume,
            satuan: bi.satuan,
            hargaSatuan: bi.hargaSatuan,
            jumlah: bi.jumlah,
          } as T);
        });
        return;
      }
    }
    expandedItems.push(item);
  });

  // 1. Standarisasi nama dan konversi satuan komersial dasar
  const preProcessed = expandedItems.map((item) => {
    const rawVol = item.volume || 0;
    const rawJml = item.jumlah || 0;
    const rawSatuan = (item.satuan || '').toLowerCase().trim();
    const rawName = (item.namaBarang || '').trim();
    const isPab = (item as any).isBarangPabrikasi;

    // Preserve unit items as-is
    if (isPab || isPreservedUnitItem(rawName, item.satuan, isPab)) {
      return {
        ...item,
        satuan: item.satuan || 'unit',
      };
    }

    let convertedVol = rawVol;
    let convertedSatuan = item.satuan || 'unit';
    let convertedPrice = item.hargaSatuan || 0;

    // Semen Kg -> Zak (1 Zak = 50 kg)
    const isSemen = /semen|pc\b|portland/i.test(rawName);
    const isBesi = /besi|beton|polos|ulir|hollow|wiremesh/i.test(rawName);
    const isKayu = /kayu|kaso|balok|reng|papan|tiang/i.test(rawName);
    const isBataRingan = /bata ringan|hebel|celcon|aerated/i.test(rawName);
    const isBatako = /batako/i.test(rawName);
    const isBataMerah = /bata merah/i.test(rawName);
    const isKerikil = /kerikil|split|batu pecah|koral/i.test(rawName);
    const isPasir = /pasir|batu belah|batu kali|sirtu|tanah urug/i.test(rawName);

    if (isSemen) {
      convertedSatuan = 'Zak';
      let volKg = rawVol;
      if (rawVol <= 15 && /zak|sak/i.test(rawSatuan)) {
        volKg = rawVol * 50;
      }
      convertedVol = Math.max(1, Math.round(volKg / 50));
      if (convertedPrice > 0 && convertedPrice <= 5000) {
        convertedPrice = Math.round(convertedPrice * 50);
      }
    } else if (isBataRingan) {
      // 1 m3 Bata Ringan Hebel (tebal 10cm) ≈ 83.33 buah (@ Rp 8.500 - 10.500/bh)
      convertedSatuan = 'bh';
      if (/m3|m³/i.test(rawSatuan) || rawVol < 100) {
        convertedVol = Math.max(1, Math.round((rawVol || 1) * 83.33));
      }
      if (convertedPrice > 20000) {
        convertedPrice = Math.round(convertedPrice / 83.33);
      }
      if (convertedPrice <= 0 || convertedPrice > 25000) {
        convertedPrice = 9500;
      }
    } else if (isBatako) {
      convertedSatuan = 'bh';
      if (/m3|m³|m2|m²/i.test(rawSatuan) || rawVol < 100) {
        convertedVol = Math.max(1, Math.round((rawVol || 1) * 12.5));
      }
      if (convertedPrice <= 0 || convertedPrice > 15000) {
        convertedPrice = 3500;
      }
    } else if (isBataMerah) {
      convertedSatuan = 'bh';
      if (/m3|m³|m2|m²/i.test(rawSatuan) || rawVol < 200) {
        convertedVol = Math.max(1, Math.round((rawVol || 1) * 70));
      }
      if (convertedPrice <= 0 || convertedPrice > 5000) {
        convertedPrice = 950;
      }
    } else if (isBesi && (rawVol > 10 || /kg|kilogram/i.test(rawSatuan))) {
      convertedSatuan = 'btg';
      convertedVol = Math.max(1, Math.round(rawVol / 7.4));
      if (convertedPrice > 0 && convertedPrice <= 25000) {
        convertedPrice = Math.round(convertedPrice * 7.4);
      }
    } else if (isKayu && (/m3|m³|m2|m²|lbr|lembar/i.test(rawSatuan) || rawVol < 1)) {
      convertedSatuan = 'btg';
      convertedVol = Math.max(1, Math.round(rawVol < 1 ? Math.max(1, rawVol * 25) : rawVol));
    } else if (isKerikil || isPasir) {
      convertedSatuan = 'm³';
      // Normalize absurd volumes (like 86016 m3) using realistic unit market prices
      const stdPrice = isKerikil ? 310000 : (/pasir/i.test(rawName) ? 250000 : 220000);
      if (rawVol > 200 || (rawJml > 0 && rawVol > 0 && (rawJml / rawVol) < 50000)) {
        convertedVol = rawJml > 0 ? Math.max(1, Math.round(rawJml / stdPrice)) : 1;
        convertedPrice = rawJml > 0 ? Math.round(rawJml / convertedVol) : stdPrice;
      } else {
        convertedVol = Math.max(1, Math.round(rawVol));
      }
    }

    return {
      ...item,
      namaBarang: rawName,
      volume: convertedVol,
      satuan: convertedSatuan,
      hargaSatuan: convertedPrice || (convertedVol > 0 ? Math.round(rawJml / convertedVol) : 0),
      jumlah: isSemen && convertedPrice > 0 ? convertedVol * convertedPrice : rawJml,
    };
  });

  // 2. Kelompokkan barang sejenis (Grouping by normalized name and unit)
  const groupMap = new Map<string, { items: typeof preProcessed; namaBarang: string; satuan: string }>();

  preProcessed.forEach((item) => {
    const info = getCanonicalReceiptItemInfo(item.namaBarang, item.satuan);
    const key = info.key;

    const existing = groupMap.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      groupMap.set(key, {
        items: [item],
        namaBarang: info.name,
        satuan: info.unit,
      });
    }
  });

  // 3. Gabungkan volume, nominal, dan hitung harga satuan seragam
  const result: T[] = [];

  groupMap.forEach((group) => {
    const totalRawVol = group.items.reduce((s, it) => s + it.volume, 0);
    const totalRawJml = group.items.reduce((s, it) => s + it.jumlah, 0);
    const sampleItem = group.items[0];
    const rawSatuan = (group.satuan || '').toLowerCase().trim();
    const rawName = group.namaBarang.toLowerCase();

    let realisticVolume: number;
    let realisticSatuan = group.satuan;

    // A. Semen (Zak Utuh & Harga per Zak AHSP x 50)
    if (/semen|pc\b|portland/i.test(rawName)) {
      realisticSatuan = 'Zak';
      const samplePrice = sampleItem.hargaSatuan || 0;
      let hargaPerZak = samplePrice <= 5000 && samplePrice > 0 ? Math.round(samplePrice * 50) : Math.round(samplePrice);
      if (hargaPerZak <= 0 && totalRawVol > 0 && totalRawJml > 0) {
        const estUnitP = totalRawJml / totalRawVol;
        hargaPerZak = estUnitP <= 5000 ? Math.round(estUnitP * 50) : Math.round(estUnitP);
      }
      if (hargaPerZak <= 0) hargaPerZak = 72500;

      // Compute whole integer Zak count
      const rawZakSum = group.items.reduce((s, it) => {
        const v = it.volume || 0;
        return s + (v > 15 ? v / 50 : v);
      }, 0);
      realisticVolume = Math.max(1, Math.round(rawZakSum));

      const finalZakTotal = realisticVolume * hargaPerZak;

      let cleanBarangName = group.namaBarang.replace(/\s*\(?50\s*kg\)?/gi, '').trim();
      if (!/pcc|padang|gresik|holcim|tiga roda|dynamix/i.test(cleanBarangName)) {
        cleanBarangName = `${cleanBarangName} PCC (@ 50 Kg)`;
      }

      result.push({
        ...sampleItem,
        namaBarang: cleanBarangName,
        volume: realisticVolume,
        satuan: 'Zak',
        hargaSatuan: hargaPerZak,
        jumlah: finalZakTotal,
      });
      return;
    }

    // B. Besi Beton / Wiremesh / Hollow (Kg -> Batang Utuh)
    if (/besi|beton|polos|ulir|hollow|wiremesh/i.test(rawName)) {
      const samplePrice = sampleItem.hargaSatuan || 0;
      let hargaPerBtg = samplePrice <= 25000 && samplePrice > 0 ? Math.round(samplePrice * 7.4) : Math.round(samplePrice);
      if (hargaPerBtg <= 0) hargaPerBtg = 95000;

      const rawBtgSum = group.items.reduce((s, it) => {
        const v = it.volume || 0;
        return s + (v > 10 ? v / 7.4 : v);
      }, 0);
      realisticVolume = Math.max(1, Math.round(rawBtgSum));
      const finalBesiTotal = realisticVolume * hargaPerBtg;

      let cleanBesiName = group.namaBarang;
      if (!/batang|btg|12m|12 meter/i.test(cleanBesiName)) {
        cleanBesiName = `${cleanBesiName} (12 Meter)`;
      }

      result.push({
        ...sampleItem,
        namaBarang: cleanBesiName,
        volume: realisticVolume,
        satuan: 'btg',
        hargaSatuan: hargaPerBtg,
        jumlah: finalBesiTotal,
      });
      return;
    }

    // C. Kayu Kaso / Balok / Reng (m3/lbr -> Batang Utuh)
    if (/kayu|kaso|balok|reng|tiang/i.test(rawName)) {
      const samplePrice = sampleItem.hargaSatuan || 0;
      let hargaPerBtg = samplePrice <= 100000 && samplePrice > 0 ? Math.round(samplePrice) : Math.round(totalRawJml / Math.max(1, Math.round(totalRawVol)));
      if (hargaPerBtg <= 0 || hargaPerBtg > 200000) hargaPerBtg = 38500;

      realisticVolume = Math.max(1, Math.round(totalRawVol < 1 ? Math.max(1, totalRawVol * 25) : totalRawVol));
      const finalKayuTotal = realisticVolume * hargaPerBtg;

      let cleanKayuName = group.namaBarang;
      if (!/batang|btg|4m|4 meter/i.test(cleanKayuName)) {
        cleanKayuName = `${cleanKayuName} (4 Meter)`;
      }

      result.push({
        ...sampleItem,
        namaBarang: cleanKayuName,
        volume: realisticVolume,
        satuan: 'btg',
        hargaSatuan: hargaPerBtg,
        jumlah: finalKayuTotal,
      });
      return;
    }

    // D. Bata Ringan Hebel (m3 -> bh @ Rp 8.500 - 10.500)
    if (/bata ringan|hebel|celcon|aerated/i.test(rawName)) {
      let unitP = sampleItem.hargaSatuan || 0;
      if (unitP <= 0 || unitP < 5000 || unitP > 25000) unitP = 9500;
      let finalVol = Math.max(1, Math.round(totalRawJml / unitP));
      let reconciledPrice = Math.round((totalRawJml / finalVol) * 100) / 100;
      result.push({
        ...sampleItem,
        namaBarang: group.namaBarang,
        volume: finalVol,
        satuan: 'bh',
        hargaSatuan: reconciledPrice,
        jumlah: totalRawJml,
      });
      return;
    }

    // E. Batako & Bata Merah -> bh
    if (/batako/i.test(rawName)) {
      let unitP = sampleItem.hargaSatuan > 0 && sampleItem.hargaSatuan <= 15000 ? sampleItem.hargaSatuan : 3500;
      let finalVol = Math.max(1, Math.round(totalRawJml / unitP));
      let reconciledPrice = Math.round((totalRawJml / finalVol) * 100) / 100;
      result.push({
        ...sampleItem,
        namaBarang: group.namaBarang,
        volume: finalVol,
        satuan: 'bh',
        hargaSatuan: reconciledPrice,
        jumlah: totalRawJml,
      });
      return;
    }
    if (/bata merah/i.test(rawName)) {
      let unitP = sampleItem.hargaSatuan > 0 && sampleItem.hargaSatuan <= 3500 ? sampleItem.hargaSatuan : 950;
      let finalVol = Math.max(1, Math.round(totalRawJml / unitP));
      let reconciledPrice = Math.round((totalRawJml / finalVol) * 100) / 100;
      result.push({
        ...sampleItem,
        namaBarang: group.namaBarang,
        volume: finalVol,
        satuan: 'bh',
        hargaSatuan: reconciledPrice,
        jumlah: totalRawJml,
      });
      return;
    }

    // F. Kerikil / Split / Batu Pecah (m3 dengan harga pasar wajar Rp 280k - 360k / m3)
    if (/kerikil|split|batu pecah|koral/i.test(rawName)) {
      const samplePrice = sampleItem.hargaSatuan || 0;
      const stdPrice = samplePrice >= 150000 && samplePrice <= 500000 ? samplePrice : 310000;
      let finalVol = Math.max(1, Math.round(totalRawJml / stdPrice));
      if (totalRawVol > 0 && totalRawVol <= 300 && (totalRawJml / totalRawVol) >= 150000) {
        finalVol = Math.round(totalRawVol);
      }
      if (finalVol <= 0) finalVol = 1;
      let reconciledPrice = Math.round((totalRawJml / finalVol) * 100) / 100;
      result.push({
        ...sampleItem,
        namaBarang: group.namaBarang,
        volume: finalVol,
        satuan: 'm³',
        hargaSatuan: reconciledPrice,
        jumlah: totalRawJml,
      });
      return;
    }

    // G. Pasir / Batu Belah / Sirtu (m3)
    if (/pasir|batu belah|batu kali|tanah urug|sirtu/i.test(rawName)) {
      const samplePrice = sampleItem.hargaSatuan || 0;
      const isPasir = /pasir/i.test(rawName);
      const isSirtu = /sirtu|urug/i.test(rawName);
      const stdPrice = samplePrice >= 100000 && samplePrice <= 450000
        ? samplePrice
        : isPasir ? 250000 : isSirtu ? 180000 : 260000;
      let finalVol = Math.max(1, Math.round(totalRawJml / stdPrice));
      if (totalRawVol > 0 && totalRawVol <= 300 && (totalRawJml / totalRawVol) >= 80000) {
        finalVol = Math.round(totalRawVol);
      }
      if (finalVol <= 0) finalVol = 1;
      let reconciledPrice = Math.round((totalRawJml / finalVol) * 100) / 100;
      result.push({
        ...sampleItem,
        namaBarang: group.namaBarang,
        volume: finalVol,
        satuan: 'm³',
        hargaSatuan: reconciledPrice,
        jumlah: totalRawJml,
      });
      return;
    }

    // H. Pasir, Batu, Tanah umum (m³)
    else if (/pasir|batu|tanah|sirtu|agregat|kerikil/i.test(rawName) && /m3|m³|m2|m²/i.test(rawSatuan)) {
      realisticVolume = Math.max(1, Math.round(totalRawVol));
      realisticSatuan = /m3|m³/i.test(rawSatuan) ? 'm³' : 'm²';
    }
    // C. Unit diskrit: lembar, batang, buah, dus, klg, set, roll, unit, rit, dll.
    else if (
      /lbr|lembar|btg|batang|zak|sak|buah|bh|dus|box|kotak|ktk|unit|set|roll|rol|klg|kaleng|pail|drum|rit/i.test(rawSatuan) ||
      /triplek|multiplex|papan|kaso|balok|besi|helm|rompi|sepatu|sarung tangan|p3k|rambu|tali/i.test(rawName)
    ) {
      if (totalRawVol <= 0.05) {
        realisticVolume = 1;
      } else if (totalRawVol < 1) {
        realisticVolume = 1;
        if (/m3|m³/.test(rawSatuan) && /kayu|balok|kaso|tiang/i.test(rawName)) {
          realisticSatuan = 'btg';
        }
      } else {
        realisticVolume = Math.max(1, Math.round(totalRawVol));
      }
    }
    // D. Berat / Volume (Kg, Liter)
    else if (/kg|liter|ltr/i.test(rawSatuan)) {
      if (totalRawVol < 0.5) {
        realisticVolume = 1;
        if (/cat/i.test(rawName)) realisticSatuan = 'klg';
        else if (/paku/i.test(rawName)) realisticSatuan = 'kg';
      } else {
        realisticVolume = Math.max(1, Math.round(totalRawVol));
      }
    }
    // E. Kubikasi / Meter persegi
    else if (/m3|m³|m2|m²|m\b/i.test(rawSatuan)) {
      realisticVolume = Math.max(1, Math.round(totalRawVol));
    }
    // F. Default fallback
    else {
      realisticVolume = totalRawVol < 1 ? 1 : Math.round(totalRawVol);
    }

    // Price Balancing: Reconcile hargaSatuan agar realisticVolume * hargaSatuan = totalRawJml
    const reconciledHargaSatuan = Math.max(1, Math.round((totalRawJml / realisticVolume) * 100) / 100);

    result.push({
      ...sampleItem,
      namaBarang: group.namaBarang,
      volume: realisticVolume,
      satuan: realisticSatuan,
      hargaSatuan: reconciledHargaSatuan,
      jumlah: totalRawJml, // TOTAL NOMINAL PERSIS SAMA DENGAN RAB!
    });
  });

  return consolidateAndStandardizeReceiptItems(result);
}

/**
 * Harmonizes Kwitansi Uraian:
 * Ensures the parentheses inside kw.uraian accurately reflect real physical store materials
 * without showing raw composite job sub-titles.
 */
export function getHarmonizedKwitansiUraian(kw: {
  tipe?: string;
  noBukti?: string;
  uraian: string;
  namaToko?: string;
  penerimaNama?: string;
  items?: Array<{ namaBarang: string; volume: number; satuan: string; hargaSatuan: number; jumlah: number }>;
}): string {
  if (!kw || !kw.uraian) return '';
  if ((kw as any).isManual || isReceiptLocked(kw as any)) return kw.uraian;
  const isMaterial =
    kw.tipe === 'MATERIAL' ||
    /kwt[\/\-_]?mat|kw[\/\-_]?mat|\bmat\b|mat[\/\-_]|material/i.test(kw.noBukti || '');

  let uraian = kw.uraian;
  // If noBukti is material (kwt/mat, kw-mat, MAT), but uraian mistakenly contains honorarium/pengawas/perencana, auto-correct it
  if (isMaterial && /honorarium|pengawas|perencana/i.test(uraian)) {
    const store =
      kw.namaToko ||
      (!/pengawas|perencana|erwin|dzikri/i.test(kw.penerimaNama || '') ? kw.penerimaNama : '') ||
      'Toko Rekanan Material';
    uraian = `Pembayaran Lunas Biaya Pembelian Material/Bahan Dari ${store}`;
  }

  if (!isMaterial || !kw.items || kw.items.length === 0) {
    return uraian;
  }
  const displayItems = normalizeMaterialItems(kw.items);
  if (displayItems.length === 0) return uraian;

  const topNames = displayItems.map((it) => it.namaBarang).slice(0, 3).join(', ');
  if (/\([^)]*\)/.test(uraian)) {
    return uraian.replace(/\([^)]*\)/, `(${topNames})`);
  }
  return uraian;
}

export const DEFAULT_SMKK_ITEMS: Array<{
  namaBarang: string;
  volume: number;
  satuan: string;
  hargaSatuan: number;
  jumlah: number;
}> = [
  { namaBarang: 'Penerapan SMKK - Tali keselamatan', volume: 1, satuan: 'roll', hargaSatuan: 550206, jumlah: 550206 },
  { namaBarang: 'Penerapan SMKK - Peralatan P3K', volume: 1, satuan: 'set', hargaSatuan: 2500000, jumlah: 2500000 },
  { namaBarang: 'Penerapan SMKK - Rambu-Rambu dan Pengendalian Resiko K3', volume: 1, satuan: 'set', hargaSatuan: 912302, jumlah: 912302 },
  { namaBarang: 'Penerapan SMKK - Helm kepala', volume: 10, satuan: 'buah', hargaSatuan: 83431, jumlah: 834310 },
  { namaBarang: 'Penerapan SMKK - Rompi', volume: 10, satuan: 'buah', hargaSatuan: 88852, jumlah: 888520 },
  { namaBarang: 'Penerapan SMKK - Sepatu boot', volume: 10, satuan: 'buah', hargaSatuan: 134195, jumlah: 1341950 },
  { namaBarang: 'Penerapan SMKK - Sarung tangan', volume: 10, satuan: 'buah', hargaSatuan: 59763, jumlah: 597630 },
];

/**
 * Generate realistic safety/K3 equipment items perfectly summing to the exact nominal
 */
export function getRealisticSmkkItemsForNominal(nominal: number): Array<{
  namaBarang: string;
  volume: number;
  satuan: string;
  hargaSatuan: number;
  jumlah: number;
}> {
  if (nominal <= 0) return DEFAULT_SMKK_ITEMS;

  const smkkTemplates = [
    { namaBarang: 'Penerapan SMKK - Helm Pelindung Proyek (Safety Helmet SNI)', satuan: 'buah', typicalPrice: 85000, weight: 0.35 },
    { namaBarang: 'Penerapan SMKK - Rompi Proyek Reflektif K3', satuan: 'buah', typicalPrice: 65000, weight: 0.25 },
    { namaBarang: 'Penerapan SMKK - Kotak & Perlengkapan Obat P3K Lapangan', satuan: 'set', typicalPrice: 150000, weight: 0.20 },
    { namaBarang: 'Penerapan SMKK - Tali Keselamatan / Rambu Peringatan K3', satuan: 'roll', typicalPrice: 120000, weight: 0.12 },
    { namaBarang: 'Penerapan SMKK - Sarung Tangan Kerja & Masker K3', satuan: 'pack', typicalPrice: 45000, weight: 0.08 },
  ];

  let allocated = 0;
  return smkkTemplates.map((tpl, idx) => {
    const isLast = idx === smkkTemplates.length - 1;
    const subJml = isLast ? Math.max(0, nominal - allocated) : Math.round(nominal * tpl.weight);
    allocated += subJml;
    const vol = Math.max(1, Math.round(subJml / tpl.typicalPrice));
    const unitPrice = vol > 0 ? Math.round(subJml / vol) : subJml;
    return {
      namaBarang: tpl.namaBarang,
      volume: vol,
      satuan: tpl.satuan,
      hargaSatuan: unitPrice,
      jumlah: subJml,
    };
  });
}

/**
 * Reconstitutes door/window components into clean intact unit items matching RAB & AHSP.
 */
export function getReconstitutedKusenPintuUnitItems<
  T extends { namaBarang: string; volume: number; satuan: string; hargaSatuan: number; jumlah: number }
>(rawItems: T[], targetNom?: number): T[] {
  const hasDoor = rawItems.some((it) => /daun pintu|kusen.*4|p1j1|pj1\b|pintu/i.test(it.namaBarang));
  const hasWindow = rawItems.some((it) => /daun jendela|kusen.*3|\bj1\b|jendela/i.test(it.namaBarang));

  const items: { namaBarang: string; volume: number; satuan: string; hargaSatuan: number; jumlah: number }[] = [];

  // Exact unit prices from real AHSP:
  // PJ1 Bahan: Rp 3.536.096,50 per unit (2 unit = Rp 7.072.193)
  // J1 Bahan: Rp 3.873.765 per unit (10 unit = Rp 38.737.650)
  const pj1BahanPrice = 3536096.5;
  const j1BahanPrice = 3873765;

  if (hasDoor && hasWindow) {
    items.push({
      namaBarang: 'Pasang Pintu Utama (PJ1)',
      volume: 2,
      satuan: 'unit',
      hargaSatuan: pj1BahanPrice,
      jumlah: Math.round(2 * pj1BahanPrice),
    });
    items.push({
      namaBarang: 'Pasang Jendela Alumunium (J1)',
      volume: 10,
      satuan: 'unit',
      hargaSatuan: j1BahanPrice,
      jumlah: Math.round(10 * j1BahanPrice),
    });
  } else if (hasDoor) {
    const vol = 2;
    const jml = targetNom && targetNom > 0 ? targetNom : Math.round(vol * pj1BahanPrice);
    const harga = Math.round(jml / vol);
    items.push({
      namaBarang: 'Pasang Pintu Utama (PJ1)',
      volume: vol,
      satuan: 'unit',
      hargaSatuan: harga,
      jumlah: jml,
    });
  } else if (hasWindow) {
    const vol = 10;
    const jml = targetNom && targetNom > 0 ? targetNom : Math.round(vol * j1BahanPrice);
    const harga = Math.round(jml / vol);
    items.push({
      namaBarang: 'Pasang Jendela Alumunium (J1)',
      volume: vol,
      satuan: 'unit',
      hargaSatuan: harga,
      jumlah: jml,
    });
  } else {
    items.push({
      namaBarang: 'Kusen & Pintu Jendela Lengkap (PJ1 & J1)',
      volume: 1,
      satuan: 'Set',
      hargaSatuan: targetNom || 45809843,
      jumlah: targetNom || 45809843,
    });
  }

  // Exact nominal reconciliation if targetNom is specified
  if (targetNom && targetNom > 0 && items.length > 0) {
    const sum = items.reduce((s, it) => s + it.jumlah, 0);
    const diff = targetNom - sum;
    if (diff !== 0) {
      const last = items[items.length - 1];
      last.jumlah += diff;
      last.hargaSatuan = Math.round(last.jumlah / last.volume);
    }
  }

  return items as unknown as T[];
}

/**
 * TRILOGI SOLUSI (1, 2, 3):
 * Helper untuk normalisasi kata kunci item belanja & material untuk pencocokan kuota RAB.
 */
export function getCanonicalMaterialKey(name: string): string {
  if (!name) return '';
  const clean = name
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (/semen\s*(pc|portland|gresik|padang|holcim|tiga\s*roda|dynamix)?\b/i.test(clean) || /portland\s*cement/i.test(clean)) {
    return 'semen_pc';
  }
  if (/pasir\s*(pasang|cor|beton)?\b/i.test(clean)) {
    return 'pasir_pasang';
  }
  if (/pasir\s*(urug|timbun)\b/i.test(clean)) {
    return 'pasir_urug';
  }
  if (/bata\s*(ringan|hebel|celcon)\b/i.test(clean)) {
    return 'bata_ringan';
  }
  if (/bata\s*merah\b/i.test(clean)) {
    return 'bata_merah';
  }
  if (/batu\s*(belah|kali)\b/i.test(clean)) {
    return 'batu_belah';
  }
  if (/kerikil|split|batu\s*pecah/i.test(clean)) {
    return 'kerikil_split';
  }
  if (/keramik\s*40\s*x?\s*40/i.test(clean)) {
    return 'keramik_40x40';
  }
  if (/keramik\s*20\s*x?\s*25/i.test(clean)) {
    return 'keramik_20x25';
  }
  if (/cat\s*(tembok|dinding)\b/i.test(clean)) {
    return 'cat_tembok';
  }
  if (/cat\s*(kayu|besi|minyak)\b/i.test(clean)) {
    return 'cat_minyak';
  }
  if (/plamir|plamir\s*tembok/i.test(clean)) {
    return 'plamir';
  }
  if (/besi\s*beton\s*(polos|ulir)?\s*(d|dia|diameter)?\s*10/i.test(clean)) {
    return 'besi_d10';
  }
  if (/besi\s*beton\s*(polos|ulir)?\s*(d|dia|diameter)?\s*8/i.test(clean)) {
    return 'besi_d8';
  }
  if (/besi\s*beton\s*(polos|ulir)?\s*(d|dia|diameter)?\s*6/i.test(clean)) {
    return 'besi_d6';
  }
  if (/kursi\s*siswa\b/i.test(clean)) {
    return 'kursi_siswa';
  }
  if (/meja\s*setengah\s*lingkaran\b/i.test(clean)) {
    return 'meja_setengah_lingkaran';
  }
  if (/rak\s*mainan\b/i.test(clean)) {
    return 'rak_mainan';
  }
  if (/loker\b/i.test(clean)) {
    return 'loker';
  }
  if (/rak\s*buku\b/i.test(clean)) {
    return 'rak_buku';
  }
  if (/karpet\b/i.test(clean)) {
    return 'karpet';
  }
  if (/papan\s*kreasi\b/i.test(clean)) {
    return 'papan_kreasi';
  }
  if (/rak\s*sepatu\b/i.test(clean)) {
    return 'rak_sepatu';
  }
  if (/papan\s*nama\b/i.test(clean)) {
    return 'papan_nama';
  }
  return clean.split(' ').slice(0, 3).join('_');
}

export interface ManualKwitansiSpendingSummary {
  spentByRabId: Map<string, number>;
  spentByCanonicalName: Map<string, number>;
  fullyAbsorbedRabIds: Set<string>;
  spentMeubeler: Map<string, number>;
  hasManualSmkk: boolean;
  hasManualPapanNama: boolean;
  lockedKwitansi: KwitansiDocument[];
  totalManualNominal: number;
}

/**
 * Solusi 1 & 2: Membaca seluruh kwitansi manual yang telah diinput & ditandai oleh pengguna
 * untuk menghitung kuota RAB yang telah diserap sebelum mesin Auto-Generate berjalan.
 */
export function summarizeManualKwitansiSpending(
  kwitansiList: KwitansiDocument[],
  _realSchoolData?: RealSchoolData
): ManualKwitansiSpendingSummary {
  const spentByRabId = new Map<string, number>();
  const spentByCanonicalName = new Map<string, number>();
  const fullyAbsorbedRabIds = new Set<string>();
  const spentMeubeler = new Map<string, number>();
  let hasManualSmkk = false;
  let hasManualPapanNama = false;
  const lockedKwitansi: KwitansiDocument[] = [];
  let totalManualNominal = 0;

  (kwitansiList || []).forEach((k) => {
    const isManualOrLocked = isReceiptLocked(k);
    if (!isManualOrLocked) return;

    lockedKwitansi.push(k);
    totalManualNominal += k.nominal || 0;

    const noBuktiStr = (k.noBukti || '').toLowerCase();
    const uraianStr = (k.uraian || '').toLowerCase();

    if (/papan nama/i.test(`${noBuktiStr} ${uraianStr}`)) {
      hasManualPapanNama = true;
    }
    if (k.tipe === 'SMKK' || /smkk|k3|keselamatan kerja|apd/i.test(`${noBuktiStr} ${uraianStr}`)) {
      hasManualSmkk = true;
    }

    (k.items || []).forEach((it) => {
      const vol = it.volume || 1;
      const cKey = getCanonicalMaterialKey(it.namaBarang);

      if (it.rabItemIdRef) {
        spentByRabId.set(it.rabItemIdRef, (spentByRabId.get(it.rabItemIdRef) || 0) + vol);
        if (it.isManualDibelanjakan) {
          fullyAbsorbedRabIds.add(it.rabItemIdRef);
        }
      }

      spentByCanonicalName.set(cKey, (spentByCanonicalName.get(cKey) || 0) + vol);

      if (/kursi_siswa|meja_setengah_lingkaran|rak_mainan|loker|rak_buku|karpet|papan_kreasi|rak_sepatu/.test(cKey)) {
        spentMeubeler.set(cKey, (spentMeubeler.get(cKey) || 0) + vol);
      }
    });

    if (k.linkedRabItemIds && k.linkedRabItemIds.length > 0) {
      k.linkedRabItemIds.forEach((id) => fullyAbsorbedRabIds.add(id));
    }
  });

  return {
    spentByRabId,
    spentByCanonicalName,
    fullyAbsorbedRabIds,
    spentMeubeler,
    hasManualSmkk,
    hasManualPapanNama,
    lockedKwitansi,
    totalManualNominal,
  };
}

export const EXACT_MEBELER_RAB_ITEMS = [
  { namaBarang: 'Kursi Siswa', volume: 36, satuan: 'bh', hargaSatuan: 362500, jumlah: 13050000, isBarangPabrikasi: true, tags: ['SipLah'], kategoriBiaya: 'SIPLAH' },
  { namaBarang: 'Meja Setengah Lingkaran', volume: 6, satuan: 'bh', hargaSatuan: 750000, jumlah: 4500000, isBarangPabrikasi: true, tags: ['SipLah'], kategoriBiaya: 'SIPLAH' },
  { namaBarang: 'Rak Mainan', volume: 8, satuan: 'bh', hargaSatuan: 1300000, jumlah: 10400000, isBarangPabrikasi: true, tags: ['SipLah'], kategoriBiaya: 'SIPLAH' },
  { namaBarang: 'Loker', volume: 2, satuan: 'bh', hargaSatuan: 1750000, jumlah: 3500000, isBarangPabrikasi: true, tags: ['SipLah'], kategoriBiaya: 'SIPLAH' },
  { namaBarang: 'Rak Buku uk. 60x120 cm', volume: 2, satuan: 'bh', hargaSatuan: 1500000, jumlah: 3000000, isBarangPabrikasi: true, tags: ['SipLah'], kategoriBiaya: 'SIPLAH' },
  { namaBarang: 'Karpet', volume: 2, satuan: 'bh', hargaSatuan: 500000, jumlah: 1000000, isBarangPabrikasi: true, tags: ['SipLah'], kategoriBiaya: 'SIPLAH' },
  { namaBarang: 'Papan Kreasi', volume: 4, satuan: 'bh', hargaSatuan: 687500, jumlah: 2750000, isBarangPabrikasi: true, tags: ['SipLah'], kategoriBiaya: 'SIPLAH' },
  { namaBarang: 'Rak Sepatu', volume: 2, satuan: 'bh', hargaSatuan: 1952500, jumlah: 3905000, isBarangPabrikasi: true, tags: ['SipLah'], kategoriBiaya: 'SIPLAH' },
];
export const EXACT_MEBELER_RAB_TOTAL = 42105000;

/**
 * Universal Auto-Healer for Kwitansi Items:
 * 1. Restores SMKK kwitansi with safety equipment items.
 * 2. Restores Kusen, Pintu, & Jendela as intact complete Units matching RAB/AHSP instead of broken retail parts.
 * 3. Restores Konsultan Perencana, Pengawas, and Pengelola Administrasi LPJ with clean professional services/honorarium items instead of store materials.
 * 4. Normalizes composite materials for pure MATERIAL transactions.
 */
export function getAutoHealedKwitansiItems<
  T extends { namaBarang: string; volume: number; satuan: string; hargaSatuan: number; jumlah: number }
>(
  kw: {
    noBukti?: string;
    tipe?: string;
    uraian?: string;
    nominal?: number;
    penerimaPekerjaan?: string;
    penerimaNama?: string;
    items?: T[];
  } | null | undefined
): T[] {
  if (!kw) return [];

  // Solusi 3: Mode Proteksi Kunci (Locked Manual Receipt)
  // Kwitansi manual, terkunci, atau kwitansi yang sudah memiliki rincian barang dipertahankan
  const isManual = Boolean((kw as any).isManual);
  const isLocked = isReceiptLocked(kw as any);
  if ((isManual || isLocked || (kw.items && kw.items.length > 0)) && kw.items && kw.items.length > 0) {
    return kw.items;
  }

  const noBuktiStr = (kw.noBukti || '').toLowerCase();
  const uraianStr = (kw.uraian || '').toLowerCase();
  const perStr = (kw.penerimaPekerjaan || '').toLowerCase();
  const storeStr = ((kw as any).namaToko || '').toLowerCase();
  const combined = `${noBuktiStr} ${uraianStr} ${perStr} ${(kw.penerimaNama || '').toLowerCase()} ${storeStr}`;
  const nom = kw.nominal || 0;

  // 0. UPAH TUKANG / TENAGA KERJA (Protected: Never convert into store materials!)
  if (kw.tipe === 'UPAH' || /^uk[\/\-_]/i.test(noBuktiStr) || /daftar hadir|upah tukang|upah borongan/i.test(uraianStr)) {
    if (kw.items && kw.items.length > 0) {
      return kw.items;
    }
    return [
      {
        namaBarang: 'Upah Tukang & Pekerja Lapangan (Sesuai Daftar Hadir & Penerimaan Upah)',
        volume: 1,
        satuan: 'Ls',
        hargaSatuan: nom,
        jumlah: nom,
      },
    ] as unknown as T[];
  }

  // 1. KONSULTAN PERENCANA TEKNIS (KONS-P)
  const isPerencana =
    /kons-p/i.test(noBuktiStr) ||
    (kw.tipe === 'KONSULTAN' && /perencana/i.test(combined)) ||
    (/perencana/i.test(uraianStr) && !/tb\.|toko material|pembelian bahan/i.test(combined));

  if (isPerencana) {
    return [
      {
        namaBarang: 'Jasa Konsultansi Perencanaan Teknis & Penyusunan Dokumen RAB / Gambar Kerja',
        volume: 1,
        satuan: 'Ls',
        hargaSatuan: nom,
        jumlah: nom,
      },
    ] as unknown as T[];
  }

  // 2. KONSULTAN PENGAWAS LAPANGAN (KONS-W)
  const isPengawas =
    /kons-w/i.test(noBuktiStr) ||
    (kw.tipe === 'KONSULTAN' && /pengawas/i.test(combined)) ||
    (/pengawas/i.test(uraianStr) && !/tb\.|toko material|pembelian bahan/i.test(combined));

  if (isPengawas) {
    return [
      {
        namaBarang: 'Jasa Konsultansi Pengawasan Teknis Lapangan & Laporan Kemajuan Pekerjaan',
        volume: 1,
        satuan: 'Ls',
        hargaSatuan: nom,
        jumlah: nom,
      },
    ] as unknown as T[];
  }

  // 3. MITRA SIPLAH / MEBELER
  const isSiplah =
    /siplah/i.test(noBuktiStr) ||
    /siplah/i.test(uraianStr) ||
    /siplah/i.test(storeStr) ||
    /mebel|meubilair|meubeler|perabot/i.test(uraianStr) ||
    (kw.items && kw.items.some((i: any) => (i.tags && i.tags.some((t: string) => /siplah/i.test(t))) || i.kategoriBiaya === 'SIPLAH' || i.tag === 'SIPLAH' || /kursi siswa|meja setengah|rak mainan|loker|rak buku|papan kreasi|rak sepatu/i.test(i.namaBarang || '')));

  if (isSiplah && kw.items && kw.items.length > 0) {
    // Preserve items (supporting items split across multiple partner stores)
    return consolidateAndStandardizeReceiptItems(kw.items, nom) as unknown as T[];
  }

  // 4. PENGELOLA SPJ & ADMINISTRASI LPJ (ADM / SPJ)
  const isPengelolaAdm =
    kw.tipe === 'OPERASIONAL' ||
    /\badm\b|kw[\/\-_]?adm|kw[\/\-_]?spj/i.test(noBuktiStr) ||
    /pengelola.*(spj|administrasi|lpj)|administrasi lpj|biaya pengelolaan/i.test(uraianStr) ||
    /pengelola spj/i.test(combined);

  if (isPengelolaAdm) {
    return [
      {
        namaBarang: 'Honorarium Biaya Pengelolaan Administrasi SPJ & Pelaporan Kegiatan',
        volume: 1,
        satuan: 'Keg',
        hargaSatuan: nom,
        jumlah: nom,
      },
    ] as unknown as T[];
  }

  // 5. PERCETAKAN & PAPAN NAMA (CTK)
  const isCetak =
    kw.tipe === 'CETAK' ||
    /ctk/i.test(noBuktiStr) ||
    /papan nama|banner|baliho|cetak spanduk|percetakan|diprint|dexa printing/i.test(combined);

  if (isCetak) {
    if (kw.items && kw.items.length > 0 && !kw.items.some((it) => /semen|pasir|split|paku/i.test(it.namaBarang))) {
      return consolidateAndStandardizeReceiptItems(kw.items, nom) as unknown as T[];
    }
    return [
      {
        namaBarang: 'Pembuatan & Cetak Papan Nama Proyek Revitalisasi Sekolah (Bahan MMT / Akrilik & Frame)',
        volume: 1,
        satuan: 'Unit',
        hargaSatuan: nom || 1099800,
        jumlah: nom || 1099800,
      },
    ] as unknown as T[];
  }

  // 6. SMKK / K3 LAPANGAN
  const isSmkk =
    (/smkk/i.test(noBuktiStr) ||
    /smkk|k3|keselamatan kerja|apd/i.test(uraianStr) ||
    kw.tipe === 'SMKK') &&
    !/pengelola|administrasi|spj/i.test(uraianStr) && 
    (kw as any).kategoriBiayaPajak !== 'Perencanaan_Pengelolaan';

  if (isSmkk) {
    const isCorrupted =
      !kw.items ||
      kw.items.length === 0 ||
      kw.items.some((it) => /semen|pasir|split|kaso|batu|paku campuran/i.test(it.namaBarang));

    if (isCorrupted || (nom > 0 && Math.abs((kw.items || []).reduce((s, i) => s + (i.jumlah || 0), 0) - nom) > 10)) {
      if (nom > 0) {
        return getRealisticSmkkItemsForNominal(nom) as unknown as T[];
      }
      return DEFAULT_SMKK_ITEMS as unknown as T[];
    }
    return consolidateAndStandardizeReceiptItems(kw.items || [], nom) as unknown as T[];
  }

  // 7. PINTU & JENDELA / KUSEN / FURNITUR JADI (FUR)
  const isPintuJendelaKw =
    kw.tipe === 'PINTU_JENDELA' ||
    /fur[\/\-_]|kw[\/\-_]?fur|kw[\/\-_]?kusen|kw[\/\-_]?alum/i.test(noBuktiStr) ||
    /kusen|daun pintu|jendela alum|pintu utama|p1j1|pj1\b|j1\b|ventilasi.*boven/i.test(uraianStr) ||
    (kw.items && kw.items.length > 0 && kw.items.some((it) => isPreservedUnitItem(it.namaBarang, it.satuan)));

  if (isPintuJendelaKw) {
    if (kw.items && kw.items.length > 0) {
      const hasDecomposedAhsp = kw.items.some((it) =>
        /kusen alumunium\s*4|kusen alumunium\s*3|daun pintu panel|daun jendela alumunium|engsel pintu stainless|kunci pintu tanam/i.test(it.namaBarang)
      );
      if (hasDecomposedAhsp) {
        return getReconstitutedKusenPintuUnitItems(kw.items, nom) as unknown as T[];
      }
      return consolidateAndStandardizeReceiptItems(kw.items, nom) as unknown as T[];
    }
  }

  // 8. MATERIAL TOKO BANGUNAN (MAT)
  const isMaterialKw =
    kw.tipe === 'MATERIAL' ||
    kw.tipe === 'PERABOT' ||
    /kwt[\/\-_]?mat|kw[\/\-_]?mat|\bmat\b|mat[\/\-_]|material/i.test(noBuktiStr) ||
    /bahan|material|semen|pasir|bata|keramik|besi|cat|toko|tb\./i.test(uraianStr);

  if (isMaterialKw) {
    if (kw.items && kw.items.length > 0 && !/jasa\s+konsultansi|pengawasan|honor/i.test(kw.items[0]?.namaBarang || '')) {
      const hasDecomposedPintu = kw.items.some((it) =>
        /kusen alumunium\s*4|kusen alumunium\s*3|daun pintu panel|daun jendela alumunium/i.test(it.namaBarang)
      );
      if (hasDecomposedPintu) {
        return getReconstitutedKusenPintuUnitItems(kw.items, nom) as unknown as T[];
      }
      return consolidateAndStandardizeReceiptItems(normalizeMaterialItems(kw.items), nom) as unknown as T[];
    }
    const dec = decomposeRealisticBahanAndUpah(kw.uraian || 'Pembelian Bahan Bangunan', nom, 0);
    return consolidateAndStandardizeReceiptItems(normalizeMaterialItems(dec.bahanItems as unknown as T[]), nom) as unknown as T[];
  }

  if (kw.items && kw.items.length > 0) {
    return consolidateAndStandardizeReceiptItems(kw.items, nom) as unknown as T[];
  }

  return [];
}

/**
 * Canonical Resolver for Kwitansi / Material Items (BPK & Inspektorat SPJ Standard):
 * Identifies the standard retail trade category of an item, resolves variations in descriptions
 * (such as chopped suffixes, different brand spellings, or duplicate entries), and standardizes units.
 */
export function getCanonicalReceiptItemInfo(
  rawName: string,
  rawSatuan?: string
): { key: string; name: string; unit: string } {
  const n = (rawName || '').trim();
  const s = (rawSatuan || 'unit').trim();
  const lower = n.toLowerCase();

  // 1. Semen
  if (/semen.*(warna|nat|grout)|\boker\b/i.test(lower)) {
    return { key: 'CAT_SEMEN_WARNA', name: 'Semen Warna Pengisi Nat Keramik (Grouting)', unit: 'Zak' };
  }
  if (/semen|pc\b|portland/i.test(lower)) {
    return { key: 'CAT_SEMEN_PC', name: 'Semen Portland (PC) PCC (@ 50 Kg)', unit: 'Zak' };
  }

  // 2. Pasir & Agregat
  if (/pasir/i.test(lower) && !/kertas|amplas/i.test(lower)) {
    return { key: 'CAT_PASIR', name: 'Pasir Pasang / Beton Pilihan', unit: 'm³' };
  }
  if (/kerikil|split|batu pecah|koral/i.test(lower)) {
    return { key: 'CAT_KERIKIL', name: 'Batu Split / Kerikil Beton (1/2 & 2/3)', unit: 'm³' };
  }
  if (/batu kali|batu belah/i.test(lower)) {
    return { key: 'CAT_BATU_KALI', name: 'Batu Kali / Batu Belah Pondasi', unit: 'm³' };
  }

  // 3. Dinding / Bata
  if (/bata ringan|hebel/i.test(lower)) {
    return { key: 'CAT_HEBEL', name: 'Bata Ringan Hebel (Tebal 10 cm)', unit: 'bh' };
  }
  if (/bata merah|bata\b/i.test(lower)) {
    return { key: 'CAT_BATA_MERAH', name: 'Batu Bata Merah Standar SNI', unit: 'bh' };
  }

  // 4. Kayu & Paku
  if (/kayu.*kaso|kaso/i.test(lower)) {
    return { key: 'CAT_KAYU_KASO', name: 'Kayu Kaso 5/7 cm (4 Meter)', unit: 'btg' };
  }
  if (/kayu.*balok|balok/i.test(lower) && !/ring balok|sloof/i.test(lower)) {
    return { key: 'CAT_KAYU_BALOK', name: 'Kayu Balok 6/12 cm (4 Meter)', unit: 'btg' };
  }
  if (/paku/i.test(lower)) {
    return { key: 'CAT_PAKU', name: 'Paku Campuran (5 cm - 10 cm)', unit: 'Kg' };
  }

  // 5. Besi & Baja
  if (/kawat|bendrat/i.test(lower)) {
    return { key: 'CAT_KAWAT_BENDRAT', name: 'Kawat Bendrat Beton SNI', unit: 'Kg' };
  }
  if (/besi.*(beton|polos|ulir)|pembesian/i.test(lower)) {
    return { key: 'CAT_BESI_BETON', name: 'Besi Beton Polos / Ulir SNI (12 Meter)', unit: 'btg' };
  }

  // 6. Plafon & Hollow
  if (/hollow|rangka.*besi.*(hollow|galvanis)|besi.*hollow/i.test(lower)) {
    return { key: 'CAT_HOLLOW_PLAFON', name: 'Rangka Besi Hollow Galvanis 4x4 & 2x4 (4 Meter)', unit: 'btg' };
  }
  if (/gypsum|grc|kalsiboard/i.test(lower) && !/list|sekrup|compound|tepung/i.test(lower)) {
    return { key: 'CAT_GYPSUM_BOARD', name: 'Papan Gypsum Tebal 9 mm Standar SNI', unit: 'Lembar' };
  }
  if (/list.*(profil|plafon|gypsum)|cornice/i.test(lower)) {
    return { key: 'CAT_LIST_GYPSUM', name: 'List Profil Plafon / Cornice Gypsum', unit: 'Batang' };
  }
  if (/compound|tepung gypsum|kasa.*tape/i.test(lower)) {
    return { key: 'CAT_COMPOUND_GYPSUM', name: 'Compound Tepung Gypsum & Kasa Textile Tape', unit: 'Zak' };
  }
  if (/sekrup.*gypsum|fastener.*gypsum/i.test(lower)) {
    return { key: 'CAT_SEKRUP_GYPSUM', name: 'Sekrup Fastener Gypsum Hitam 1"', unit: 'Kotak' };
  }

  // 7. Keramik
  if (/keramik|granit|ubin/i.test(lower)) {
    return { key: 'CAT_KERAMIK', name: 'Ubin Keramik Lantai 40x40 / 60x60 Standar SNI', unit: 'Dus' };
  }

  // 8. Cat & Finishing
  if (/cat dasar|alkali/i.test(lower)) {
    return { key: 'CAT_CAT_DASAR', name: 'Cat Dasar / Sealer Tembok Alkali Resisting', unit: 'Kg' };
  }
  if (/cat.*(tembok|interior|eksterior|weatherproof|plafon)/i.test(lower) || /^cat\b/i.test(lower)) {
    return { key: 'CAT_CAT_TEMBOK', name: 'Cat Tembok Berkualitas (Interior & Eksterior)', unit: 'Pail' };
  }
  if (/plamir|putty/i.test(lower)) {
    return { key: 'CAT_PLAMIR', name: 'Plamir Tembok / Wall Putty Instan', unit: 'Zak' };
  }
  if (/kuas|rol.*cat|baki cat/i.test(lower)) {
    return { key: 'CAT_KUAS_CAT', name: 'Kuas Roll Cat, Kuas Bulu 3" & Baki Cat', unit: 'Set' };
  }
  if (/amplas|kertas gosok/i.test(lower)) {
    return { key: 'CAT_AMPLAS', name: 'Kertas Gosok / Amplas No. 120 & 180 SNI', unit: 'Lembar' };
  }
  if (/lakban|masking tape/i.test(lower)) {
    return { key: 'CAT_LAKBAN', name: 'Lakban Kertas / Masking Tape Pelindung', unit: 'Roll' };
  }

  // 9. Elektrikal
  if (/kabel.*(nym|listrik)/i.test(lower) || /^kabel\b/i.test(lower)) {
    return { key: 'CAT_KABEL_NYM', name: 'Kabel Listrik NYM 2x1.5 mm / 2x2.5 mm SNI', unit: 'Roll' };
  }
  if (/lampu/i.test(lower)) {
    return { key: 'CAT_LAMPU_LED', name: 'Lampu LED Hemat Energi (Standar SNI)', unit: 'Buah' };
  }
  if (/saklar/i.test(lower)) {
    return { key: 'CAT_SAKLAR', name: 'Saklar Lampu Inbow (Standar SNI)', unit: 'Buah' };
  }
  if (/stop kontak/i.test(lower)) {
    return { key: 'CAT_STOP_KONTAK', name: 'Stop Kontak Dinding & Box Inbow (SNI)', unit: 'Buah' };
  }
  if (/conduit|konduit|pipa.*(kabel|listrik)/i.test(lower)) {
    return { key: 'CAT_CONDUIT', name: 'Pipa Konduit Pelindung Kabel & Klem', unit: 'Batang' };
  }

  // 10. Atap
  if (/spandek|galvalum|zincalume/i.test(lower)) {
    return { key: 'CAT_ATAP_SPANDEK', name: 'Atap Spandek Galvalum 0,35 SNI', unit: 'Lembar' };
  }
  if (/baja ringan|kanal c|profil c/i.test(lower)) {
    return { key: 'CAT_BAJA_RINGAN', name: 'Rangka Baja Ringan Profil C 0.75 SNI', unit: 'Batang' };
  }
  if (/bubungan|nok/i.test(lower)) {
    return { key: 'CAT_NOK_ATAP', name: 'Bubungan Atap / Nok Galvalum SNI', unit: 'Batang' };
  }
  if (/lisplank/i.test(lower)) {
    return { key: 'CAT_LISPLANK', name: 'Lisplank Kayu / GRC Profil Standar SNI', unit: 'Batang' };
  }

  // 11. Pintu & Jendela (Pabrikasi / Utuh)
  if (/pintu utama|pj1\b/i.test(lower)) {
    return { key: 'PAB_PJ1', name: 'Pasang Pintu Utama (PJ1)', unit: 'unit' };
  }
  if (/jendela alum|j1\b/i.test(lower)) {
    return { key: 'PAB_J1', name: 'Pasang Jendela Alumunium (J1)', unit: 'unit' };
  }
  if (/daun pintu/i.test(lower)) {
    return { key: 'PAB_DAUN_PINTU', name: 'Daun Pintu Aluminium Panel Complete', unit: 'unit' };
  }
  if (/daun jendela/i.test(lower)) {
    return { key: 'PAB_DAUN_JENDELA', name: 'Daun Jendela Aluminium Complete', unit: 'unit' };
  }
  if (/kusen.*(pintu|jendela)|pintu.*jendela.*complete/i.test(lower)) {
    return { key: 'PAB_KUSEN_COMPLETE', name: 'Kusen & Daun Pintu/Jendela Aluminium Complete', unit: 'Unit' };
  }

  // 12. Mebeler / Perabot (Pabrikasi / Utuh)
  if (/kursi siswa|kursi murid/i.test(lower)) {
    return { key: 'MEB_KURSI_SISWA', name: 'Kursi Siswa', unit: 'bh' };
  }
  if (/meja setengah lingkaran|meja siswa/i.test(lower)) {
    return { key: 'MEB_MEJA_LINGKARAN', name: 'Meja Setengah Lingkaran', unit: 'bh' };
  }
  if (/rak mainan/i.test(lower)) {
    return { key: 'MEB_RAK_MAINAN', name: 'Rak Mainan', unit: 'bh' };
  }
  if (/loker/i.test(lower)) {
    return { key: 'MEB_LOKER', name: 'Loker', unit: 'bh' };
  }
  if (/rak buku/i.test(lower)) {
    return { key: 'MEB_RAK_BUKU', name: 'Rak Buku uk. 60x120 cm', unit: 'bh' };
  }
  if (/karpet/i.test(lower)) {
    return { key: 'MEB_KARPET', name: 'Karpet', unit: 'bh' };
  }
  if (/papan kreasi/i.test(lower)) {
    return { key: 'MEB_PAPAN_KREASI', name: 'Papan Kreasi', unit: 'bh' };
  }
  if (/rak sepatu/i.test(lower)) {
    return { key: 'MEB_RAK_SEPATU', name: 'Rak Sepatu', unit: 'bh' };
  }

  // 13. Perlengkapan SMKK / K3
  if (/helm.*(kepala|k3|proyek)|helm/i.test(lower)) {
    return { key: 'SMKK_HELM', name: 'Penerapan SMKK - Helm kepala (SNI)', unit: 'buah' };
  }
  if (/rompi/i.test(lower)) {
    return { key: 'SMKK_ROMPI', name: 'Penerapan SMKK - Rompi Scotlight K3', unit: 'buah' };
  }
  if (/sepatu.*(boot|safety)|boot/i.test(lower)) {
    return { key: 'SMKK_SEPATU', name: 'Penerapan SMKK - Sepatu boot K3', unit: 'buah' };
  }
  if (/sarung.*tangan/i.test(lower)) {
    return { key: 'SMKK_SARUNG_TANGAN', name: 'Penerapan SMKK - Sarung tangan safety', unit: 'buah' };
  }
  if (/p3k|kotak.*obat/i.test(lower)) {
    return { key: 'SMKK_P3K', name: 'Penerapan SMKK - Peralatan Kotak P3K Lengkap', unit: 'set' };
  }
  if (/rambu|pengendalian.*resiko/i.test(lower)) {
    return { key: 'SMKK_RAMBU', name: 'Penerapan SMKK - Rambu-Rambu dan Pengendalian Resiko K3', unit: 'set' };
  }
  if (/tali.*keselamatan|safety.*rope/i.test(lower)) {
    return { key: 'SMKK_TALI', name: 'Penerapan SMKK - Tali keselamatan', unit: 'roll' };
  }

  // 14. Cetak / Percetakan
  if (/papan nama/i.test(lower)) {
    return { key: 'CTK_PAPAN_NAMA', name: 'Pembuatan & Cetak Papan Nama Proyek (Bahan MMT/Akrilik & Frame)', unit: 'Unit' };
  }
  if (/prasasti/i.test(lower)) {
    return { key: 'CTK_PRASASTI', name: 'Pembuatan & Pahat Prasasti Peresmian Gedung (Bahan Marmer/Granit)', unit: 'Buah' };
  }
  if (/banner|spanduk|baliho/i.test(lower)) {
    return { key: 'CTK_BANNER', name: 'Cetak Banner / Spanduk Informasi Proyek Revitalisasi', unit: 'Lembar' };
  }
  if (/buku.*(laporan|spj|lpj)|penggandaan|jilid/i.test(lower)) {
    return { key: 'CTK_LAPORAN', name: 'Penggandaan & Penjilidan Buku Dokumen Laporan Pertanggungjawaban (SPJ/LPJ)', unit: 'Buku' };
  }

  // Fallback: Pembersihan nama dan standardisasi satuan
  let cleanName = n
    .replace(/^(pasang|pemasangan|pengadaan|pas\.|pekerjaan)\s+/i, '')
    .replace(/\(\d+\s*(meter|m|cm|mm|kg|liter)\)/gi, '')
    .replace(/\(@\s*\d*\s*kg\)/gi, '')
    .replace(/\(@.*$/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  let cleanUnit = s.trim();
  if (/buah|bh\./i.test(cleanUnit)) cleanUnit = 'bh';
  else if (/lembar|lbr\./i.test(cleanUnit)) cleanUnit = 'Lbr';
  else if (/batang|btg\./i.test(cleanUnit)) cleanUnit = 'btg';

  // Standardize core base key to group similar goods with minor spelling differences
  const simplifiedBase = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizedKey = `CUSTOM:${simplifiedBase}|${cleanUnit.toLowerCase()}`;
  return { key: normalizedKey, name: cleanName || n, unit: cleanUnit || s };
}

/**
 * 4-Pillar Audit-Proof Material Invoice Item Standardizer (BPK / Inspektorat Standard):
 * 1. Pilar 1 (Strict Item Merging): Merges duplicate & similar items in a single invoice into 1 clean row.
 * 2. Pilar 2 (Market Price Rounding): Rounds unit prices to clean market multiples (Rp 100 / Rp 500 / Rp 1.000). No fractional decimals!
 * 3. Pilar 3 (Trade Suffix & Unit Cleaning): Cleans broken suffixes and fixes invalid units.
 * 4. Pilar 4 (Complete Units for Fabricated / Preserved Goods): Preserves Doors, Windows, and Furniture as complete Units / Sets.
 */
export function consolidateAndStandardizeReceiptItems<
  T extends { namaBarang: string; volume: number; satuan: string; hargaSatuan: number; jumlah: number }
>(rawItems: T[], kwNominal?: number): T[] {
  if (!Array.isArray(rawItems) || rawItems.length === 0) return [];

  // Check if rawItems contains decomposed AHSP components of doors/windows
  const hasDecomposedPintu = rawItems.some((it) =>
    /kusen alumunium\s*4|kusen alumunium\s*3|daun pintu panel|daun jendela alumunium/i.test(it.namaBarang)
  );
  if (hasDecomposedPintu) {
    return getReconstitutedKusenPintuUnitItems(rawItems, kwNominal);
  }

  // Step 1 & 2: Map each item to its canonical key and merge duplicates & similar goods
  const map = new Map<
    string,
    {
      namaBarang: string;
      satuan: string;
      totalVol: number;
      totalJml: number;
      isBarangPabrikasi?: boolean;
    }
  >();

  rawItems.forEach((it) => {
    const info = getCanonicalReceiptItemInfo(it.namaBarang, it.satuan);
    const existing = map.get(info.key);
    const itemVol = Math.max(0.01, Number(it.volume) || 1);
    const itemJml = Math.max(0, Number(it.jumlah) || 0);

    if (existing) {
      existing.totalVol += itemVol;
      existing.totalJml += itemJml;
      if ((it as any).isBarangPabrikasi) existing.isBarangPabrikasi = true;
    } else {
      map.set(info.key, {
        namaBarang: info.name,
        satuan: info.unit,
        totalVol: itemVol,
        totalJml: itemJml,
        isBarangPabrikasi: (it as any).isBarangPabrikasi,
      });
    }
  });

  // Step 3: Compute clean volume, rounded market price, and clean line total
  const consolidatedList = Array.from(map.values()).map((entry) => {
    const finalVol = entry.satuan === 'm³' || entry.satuan === 'm²'
      ? Math.max(1, Math.round(entry.totalVol * 100) / 100)
      : Math.max(1, Math.round(entry.totalVol));

    const rawHarga = finalVol > 0 ? entry.totalJml / finalVol : entry.totalJml;

    let roundedHarga = rawHarga;
    if (rawHarga >= 10000) {
      if (rawHarga % 500 === 0) {
        roundedHarga = rawHarga;
      } else if (rawHarga >= 100000) {
        roundedHarga = Math.round(rawHarga / 500) * 500;
      } else {
        roundedHarga = Math.round(rawHarga / 500) * 500;
      }
    } else if (rawHarga >= 1000) {
      roundedHarga = Math.round(rawHarga / 100) * 100;
    } else {
      roundedHarga = Math.round(rawHarga * 100) / 100;
    }
    if (roundedHarga <= 0) roundedHarga = Math.round(rawHarga);

    const calcJml = Math.round(finalVol * roundedHarga);

    return {
      namaBarang: entry.namaBarang,
      volume: finalVol,
      satuan: entry.satuan,
      hargaSatuan: roundedHarga,
      jumlah: calcJml,
      isBarangPabrikasi: entry.isBarangPabrikasi,
    } as unknown as T;
  });

  // Step 4: If target kwNominal is specified, ensure sum of items matches kwNominal exactly
  if (kwNominal && kwNominal > 0 && consolidatedList.length > 0) {
    const currentSum = consolidatedList.reduce((s, i) => s + i.jumlah, 0);
    const diff = kwNominal - currentSum;

    if (diff !== 0) {
      const lastIdx = consolidatedList.length - 1;
      const last = consolidatedList[lastIdx];
      const newLastJml = Math.max(1, last.jumlah + diff);
      const newLastVol = last.volume;
      const newLastHarga = Math.round((newLastJml / newLastVol) * 100) / 100;

      consolidatedList[lastIdx] = {
        ...last,
        hargaSatuan: newLastHarga > 0 ? newLastHarga : last.hargaSatuan,
        jumlah: newLastJml,
      };
    }
  }

  return consolidatedList;
}

/**
 * Harmonizes Kwitansi or SPB number by making sure the trailing year matches
 * either the school fiscal year (tahunAnggaran) or transaction date year.
 */
export function getHarmonizedKwitansiNoBukti(
  kw?: { noBukti?: string; tanggal?: string },
  targetYear?: string
): string {
  if (!kw?.noBukti) return '';
  let effYear = targetYear?.trim();
  if (!effYear && kw.tanggal) {
    const match = kw.tanggal.match(/\b(20\d\d|19\d\d)\b/);
    if (match) effYear = match[1];
  }
  if (!effYear) effYear = '2026';
  return kw.noBukti.replace(/\/(19\d\d|20\d\d)$/, `/${effYear}`);
}

/**
 * Removes duplicate kwitansi documents based on unique signature:
 * - noBukti + nominal
 * - noBukti + tanggal
 * - recipient/store + tanggal + nominal + tipe + mingguRef
 * Keeps the first occurrence and discards duplicate copies.
 */
export function deduplicateKwitansiList<
  K extends {
    id?: string;
    noBukti?: string;
    noSpb?: string;
    tanggal?: string;
    nominal?: number;
    tipe?: string;
    namaToko?: string;
    penerimaNama?: string;
    uraian?: string;
    mingguKeRef?: number;
    items?: any[];
  }
>(list: K[]): K[] {
  if (!Array.isArray(list)) return [];
  const seenKeys = new Set<string>();
  const seenNoBukti = new Set<string>();
  const seenUpahWeek = new Set<number>();
  const result: K[] = [];

  for (const item of list) {
    const normId = (item.id || '').trim();
    const normNoBukti = (item.noBukti || '').trim().toUpperCase();
    const normTanggal = (item.tanggal || '').trim();
    const normNominal = Math.round(item.nominal || 0);
    const normTipe = (item.tipe || '').trim().toUpperCase();
    const normStore = (item.namaToko || item.penerimaNama || '').trim().toLowerCase();
    const normUraian = (item.uraian || '').trim().toLowerCase();
    const normWeek = item.mingguKeRef || 0;

    const isManualOrLocked = isReceiptLocked(item as any);

    const keyUraianNom = `UR:${normUraian}|NOM:${normNominal}|W:${normWeek}|STORE:${normStore}`;
    const keyStoreDateNom = `STORE:${normStore}|TGL:${normTanggal}|NOM:${normNominal}`;

    let isDuplicate = false;

    // Signature 0: Exact ID
    if (normId && seenKeys.has(`ID:${normId}`)) {
      isDuplicate = true;
    }

    // Solusi 3: Mode Proteksi Kunci (Locked Manual Receipt)
    // Kwitansi manual & terkunci diprioritaskan utama dan tidak boleh dibuang oleh filter duplikat
    if (!isDuplicate && !isManualOrLocked) {
      // Signature 1: Exact No Bukti
      if (normNoBukti && seenNoBukti.has(normNoBukti)) {
        isDuplicate = true;
      }

      // Signature 2: Single Upah payment per week
      if (!isDuplicate && normTipe === 'UPAH' && normWeek > 0) {
        if (seenUpahWeek.has(normWeek)) {
          isDuplicate = true;
        }
      }

      // Signature 3: Duplicate Uraian + Nominal + Week
      if (!isDuplicate && normNominal > 0 && seenKeys.has(keyUraianNom)) {
        isDuplicate = true;
      }

      // Signature 4: Duplicate Store + Date + Nominal
      if (!isDuplicate && normNominal > 0 && normStore && seenKeys.has(keyStoreDateNom)) {
        isDuplicate = true;
      }
    }

    if (!isDuplicate) {
      if (normId) seenKeys.add(`ID:${normId}`);
      if (normNoBukti) seenNoBukti.add(normNoBukti);
      if (normTipe === 'UPAH' && normWeek > 0) seenUpahWeek.add(normWeek);
      if (normNominal > 0) {
        seenKeys.add(keyUraianNom);
        if (normStore) seenKeys.add(keyStoreDateNom);
      }
      result.push(item);
    }
  }

  return result;
}

/**
 * Heals an entire list of Kwitansi documents, ensuring SMKK items are permanently restored,
 * trailing year matches active tahunAnggaran, and any duplicate documents are removed.
 */
export function healKwitansiList<
  K extends {
    id?: string;
    noBukti?: string;
    noSpb?: string;
    tipe?: string;
    uraian?: string;
    nominal?: number;
    tanggal?: string;
    namaToko?: string;
    penerimaNama?: string;
    mingguKeRef?: number;
    penerimaPekerjaan?: string;
    kategoriBiayaPajak?: any;
    items?: any[];
  }
>(list: K[], targetYear?: string, deletedKwitansiIds?: string[]): K[] {
  if (!Array.isArray(list)) return [];
  const deletedSet = new Set(deletedKwitansiIds || []);
  const activeList = list.filter((k) => {
    if (!k) return false;
    if (k.id && deletedSet.has(k.id)) return false;
    if (k.noBukti && deletedSet.has(k.noBukti)) return false;
    return true;
  });

  const processed = activeList.map((kw) => {
    let updatedKw = { ...kw };

    let effYear = targetYear?.trim();
    if (!effYear && updatedKw.tanggal) {
      const match = updatedKw.tanggal.match(/\b(20\d\d|19\d\d)\b/);
      if (match) effYear = match[1];
    }
    if (!effYear) effYear = '2026';

    if (updatedKw.noBukti && /\/(19\d\d|20\d\d)$/.test(updatedKw.noBukti)) {
      updatedKw.noBukti = updatedKw.noBukti.replace(/\/(19\d\d|20\d\d)$/, `/${effYear}`);
    }

    if (updatedKw.noSpb && /\/(19\d\d|20\d\d)$/.test(updatedKw.noSpb)) {
      updatedKw.noSpb = updatedKw.noSpb.replace(/\/(19\d\d|20\d\d)$/, `/${effYear}`);
    }

    if (updatedKw.uraian && /Tahun\s+(19\d\d|20\d\d)/i.test(updatedKw.uraian)) {
      updatedKw.uraian = updatedKw.uraian.replace(/Tahun\s+(19\d\d|20\d\d)/gi, `Tahun ${effYear}`);
    }

    // Solusi 3: Mode Proteksi Kunci (Locked Manual Receipt)
    // Jangan ubah item, nominal, atau struktur kwitansi manual yang telah diinput pengguna
    const isManualOrLocked = isReceiptLocked(updatedKw as any);

    if (isManualOrLocked) {
      return updatedKw;
    }

    const isSmkk =
      /smkk/i.test(updatedKw.noBukti || '') ||
      /smkk|k3|keselamatan kerja|apd/i.test(updatedKw.uraian || '') ||
      updatedKw.tipe === 'SMKK';

    if (isSmkk) {
      const isCorrupted =
        !updatedKw.items ||
        updatedKw.items.length === 0 ||
        updatedKw.items.some((it) => /semen|pasir|split|kaso|batu|paku campuran/i.test(it.namaBarang));

      if (isCorrupted) {
        const smkkItems = updatedKw.nominal && updatedKw.nominal > 0
          ? getRealisticSmkkItemsForNominal(updatedKw.nominal)
          : DEFAULT_SMKK_ITEMS;
        updatedKw = {
          ...updatedKw,
          items: smkkItems as any,
          penerimaPekerjaan: 'Penyedia APD & Keselamatan Kerja',
        };
      }
    }

    // Fixed Item Exemption: Papan Nama Proyek (Code CTK/01/xx, 100% exact RAB nominal 1.099.800)
    const isPapan =
      (updatedKw.tipe || '').toUpperCase() === 'CETAK' ||
      /^CTK\//i.test(updatedKw.noBukti || '') ||
      /papan nama/i.test(updatedKw.uraian || '');

    if (isPapan) {
      const fixedNom = 1099800;
      if (updatedKw.nominal === 722724 || (updatedKw.nominal && updatedKw.nominal < 1000000)) {
        updatedKw.nominal = fixedNom;
      }
      updatedKw.tipe = 'CETAK';
      if (!updatedKw.noBukti || !/^CTK\//i.test(updatedKw.noBukti)) {
        updatedKw.noBukti = `CTK/01/${effYear}`;
        updatedKw.noSpb = `SPB-CTK/01/${effYear}`;
      }
      if (
        !updatedKw.items ||
        updatedKw.items.length === 0 ||
        updatedKw.items.some((i) => /semen|pasir|kaso|batu/i.test(i.namaBarang))
      ) {
        const targetNom = updatedKw.nominal || fixedNom;
        updatedKw.items = [
          {
            namaBarang: `Pembuatan & Cetak Papan Nama Proyek (Bahan MMT / Akrilik & Frame Kayu Complete)`,
            volume: 1,
            satuan: 'unit',
            hargaSatuan: targetNom,
            jumlah: targetNom,
          },
        ] as any;
      }
    }

    // 7. SIPLAH TAG RECOGNITION & AUTOMATIC TRANSFORM
    const hasSiplahItems =
      updatedKw.items &&
      updatedKw.items.length > 0 &&
      updatedKw.items.some(
        (it: any) =>
          (it.tags && it.tags.some((t: string) => /siplah/i.test(t))) ||
          it.kategoriBiaya === 'SIPLAH' ||
          it.tag === 'SIPLAH' ||
          /siplah/i.test(it.namaBarang || '')
      );

    const isSiplahKw =
      hasSiplahItems ||
      /siplah/i.test(updatedKw.noBukti || '') ||
      /siplah/i.test(updatedKw.uraian || '');

    if (isSiplahKw && updatedKw.items && updatedKw.items.length > 0) {
      updatedKw.tipe = 'OPERASIONAL';
      updatedKw.kategoriBiayaPajak = 'Siplah';
      const seqMatch = (updatedKw.noBukti || '').match(/\b(\d+)\b/);
      const seqNum = seqMatch ? seqMatch[1].padStart(2, '0') : '01';
      if (!/siplah/i.test(updatedKw.noBukti || '')) {
        updatedKw.noBukti = `SipLah/${seqNum}/${effYear}`;
        updatedKw.noSpb = `SPB-SipLah/${seqNum}/${effYear}`;
      }
      if (!updatedKw.namaToko) {
        updatedKw.namaToko = 'Toko Mitra SipLah Online';
        updatedKw.penerimaNama = 'Mitra Penyedia SipLah';
        updatedKw.penerimaPekerjaan = 'Mitra Penyedia Toko Mitra SipLah Online';
      } else {
        if (!updatedKw.penerimaPekerjaan) {
          updatedKw.penerimaPekerjaan = `Mitra Penyedia ${updatedKw.namaToko}`;
        }
      }
      const isMebeler = updatedKw.items.some((i: any) => /kursi|meja|rak|loker|karpet|papan kreasi/i.test(i.namaBarang || '')) || /mebel|meubilair|meubeler|perabot/i.test(updatedKw.uraian || '');
      if (isMebeler) {
        if (!updatedKw.items || updatedKw.items.length === 0) {
          updatedKw.items = EXACT_MEBELER_RAB_ITEMS as any;
          updatedKw.nominal = EXACT_MEBELER_RAB_TOTAL;
        } else {
          const itemSum = updatedKw.items.reduce((s: number, it: any) => s + (it.jumlah || 0), 0);
          if (itemSum > 0 && (!updatedKw.nominal || updatedKw.nominal === EXACT_MEBELER_RAB_TOTAL)) {
            updatedKw.nominal = itemSum;
          }
        }
        const topNames = (updatedKw.items || []).map((i: any) => i.namaBarang).slice(0, 3).join(', ');
        updatedKw.uraian = `Pembayaran Lunas Belanja Barang via ${updatedKw.namaToko || 'Mitra SipLah'} (${topNames || 'Meubilair / Perabot'}), Tahap Pengadaan Meubilair / Perabot Revitalisasi Sekolah, Tahun ${effYear}.`;
      } else {
        const topNames = updatedKw.items.map((i: any) => i.namaBarang).slice(0, 3).join(', ');
        if (!/pembayaran lunas belanja/i.test(updatedKw.uraian || '')) {
          updatedKw.uraian = `Pembayaran Lunas Belanja Barang via ${updatedKw.namaToko || 'Mitra SipLah'} (${topNames}), Revitalisasi Sekolah, Tahun ${effYear}.`;
        }
      }
    }

    // Always heal items for consulting, management, and clean material
    updatedKw.items = getAutoHealedKwitansiItems(updatedKw) as any;

    return updatedKw;
  });

  const deduped = deduplicateKwitansiList(processed);
  return renumberKwitansiChronologically(deduped, targetYear || '2026') as any;
}

/**
 * Strict Chronological Sequential Renumbering Engine:
 * Ensures all receipts of the same category (KW-MAT, KW-ALAT, KW-SMKK, UK, ADM, KONS-P, KONS-W)
 * are numbered in strict ascending chronological order:
 * Earlier date = smaller sequential number, Later date = larger sequential number.
 * No gaps, no reversed numbering.
 */
export function renumberKwitansiChronologically<
  K extends {
    id?: string;
    noBukti?: string;
    noSpb?: string;
    tipe?: string;
    uraian?: string;
    nominal?: number;
    tanggal?: string;
    namaToko?: string;
    penerimaNama?: string;
    mingguKeRef?: number;
    items?: any[];
  }
>(list: K[], yearStr = '2026'): K[] {
  if (!Array.isArray(list) || list.length === 0) return [];

  const safeYear = yearStr?.trim() || '2026';

  // Categorize
  const siplahList: K[] = [];
  const matList: K[] = [];
  const furList: K[] = [];
  const ctkList: K[] = [];
  const alatList: K[] = [];
  const smkkList: K[] = [];
  const upahList: K[] = [];
  const konsPList: K[] = [];
  const konsWList: K[] = [];
  const admList: K[] = [];
  const others: K[] = [];

  list.forEach((kw) => {
    const bukti = (kw.noBukti || '').toUpperCase().trim();
    const tipe = (kw.tipe || '').toUpperCase().trim();
    const uraian = (kw.uraian || '').toLowerCase();
    const store = (kw.namaToko || '').toLowerCase();

    const hasSiplahTag =
      (kw.items && kw.items.some((i: any) => (i.tags && i.tags.some((t: string) => /siplah/i.test(t))) || i.kategoriBiaya === 'SIPLAH' || i.tag === 'SIPLAH')) ||
      (kw as any).kategoriBiayaPajak === 'Siplah';

    if (
      hasSiplahTag ||
      /^SIPLAH\//i.test(bukti) ||
      /siplah/i.test(uraian) ||
      /siplah/i.test(store)
    ) {
      siplahList.push(kw);
    } else if (
      tipe === 'CETAK' ||
      /^CTK\//i.test(bukti) ||
      /papan nama|banner|baliho|cetak spanduk|cetak dokumen/i.test(uraian) ||
      /percetakan|printing|diprint|dexa/i.test(store)
    ) {
      ctkList.push(kw);
    } else if (
      tipe === 'PINTU_JENDELA' ||
      tipe === 'PINTU_JENDELA_ALUMINIUM' ||
      /^FUR\//i.test(bukti) ||
      /alumunium|aluminium/i.test(uraian) ||
      /alumunium|aluminium/i.test(store) ||
      (/pintu|jendela/i.test(uraian) && !/engsel|kunci/i.test(uraian))
    ) {
      furList.push(kw);
    } else if (tipe === 'UPAH' || /^UK\//i.test(bukti) || /upah borongan|upah tukang|daftar hadir/i.test(uraian)) {
      upahList.push(kw);
    } else if (/^KONS-P\//i.test(bukti) || (tipe === 'KONSULTAN' && /perencana/i.test(uraian))) {
      konsPList.push(kw);
    } else if (/^KONS-W\//i.test(bukti) || (tipe === 'KONSULTAN' && /pengawas/i.test(uraian))) {
      konsWList.push(kw);
    } else if (/^ADM\//i.test(bukti) || (tipe === 'OPERASIONAL' && /administrasi|pengelolaan|\badm\b/i.test(uraian))) {
      admList.push(kw);
    } else if (tipe === 'SMKK' || /KW-SMKK|SPB-.*SMKK/i.test(bukti) || /smkk|k3|helm|rompi/i.test(uraian)) {
      smkkList.push(kw);
    } else if (/KW-ALAT|SPB-.*ALAT/i.test(bukti) || /sewa.*alat|alat bantu|pompa|genset/i.test(uraian)) {
      alatList.push(kw);
    } else if (
      tipe === 'MATERIAL' ||
      tipe === 'PERABOT' ||
      /KW-MAT|SPB-.*MAT/i.test(bukti) ||
      Boolean(kw.namaToko) ||
      /bahan|material|semen|pasir|bata|keramik|besi|cat/i.test(uraian)
    ) {
      matList.push(kw);
    } else {
      others.push(kw);
    }
  });

  const sortChronologically = (arr: K[]) => {
    return [...arr].sort((a, b) => {
      const isoA = parseTxDateToIso(a.tanggal, parseInt(safeYear, 10)) || a.tanggal || '';
      const isoB = parseTxDateToIso(b.tanggal, parseInt(safeYear, 10)) || b.tanggal || '';
      const dateCmp = isoA.localeCompare(isoB);
      if (dateCmp !== 0) return dateCmp;
      const wA = a.mingguKeRef || 0;
      const wB = b.mingguKeRef || 0;
      if (wA !== wB) return wA - wB;
      return (a.id || '').localeCompare(b.id || '');
    });
  };

  // 0. Renumber Mitra SipLah chronologically (SipLah/01/2026, SipLah/02/2026, ...)
  const sortedSiplah = sortChronologically(siplahList);
  const renumberedSiplah = sortedSiplah.map((kw, idx) => {
    const seq = idx + 1;
    const padSeq = String(seq).padStart(2, '0');
    return {
      ...kw,
      tipe: 'OPERASIONAL',
      kategoriBiayaPajak: 'Siplah',
      noBukti: `SipLah/${padSeq}/${safeYear}`,
      noSpb: `SPB-SipLah/${padSeq}/${safeYear}`,
    };
  });

  // 1. Renumber Material chronologically (01/KW-MAT/2026, 02/KW-MAT/2026, ...)
  const sortedMat = sortChronologically(matList);
  const renumberedMat = sortedMat.map((kw, idx) => {
    const seq = idx + 1;
    const padSeq = String(seq).padStart(2, '0');
    return {
      ...kw,
      noBukti: `${padSeq}/KW-MAT/${safeYear}`,
      noSpb: `SPB-${padSeq}/MAT/${safeYear}`,
    };
  });

  // 1b. Renumber Cetak / Percetakan (CTK/01/2026, CTK/02/2026, ...)
  const sortedCtk = sortChronologically(ctkList);
  const renumberedCtk = sortedCtk.map((kw, idx) => {
    const seq = idx + 1;
    const padSeq = String(seq).padStart(2, '0');
    return {
      ...kw,
      noBukti: `CTK/${padSeq}/${safeYear}`,
      noSpb: `SPB-CTK/${padSeq}/${safeYear}`,
    };
  });

  // 1c. Renumber Pintu & Jendela Aluminium (Fur/01/2026, Fur/02/2026, ...)
  const sortedFur = sortChronologically(furList);
  const renumberedFur = sortedFur.map((kw, idx) => {
    const seq = idx + 1;
    const padSeq = String(seq).padStart(2, '0');
    return {
      ...kw,
      tipe: 'PINTU_JENDELA',
      noBukti: `Fur/${padSeq}/${safeYear}`,
      noSpb: `SPB-Fur/${padSeq}/${safeYear}`,
    };
  });

  // 2. Renumber Alat chronologically (01/KW-ALAT/2026, 02/KW-ALAT/2026, ...)
  const sortedAlat = sortChronologically(alatList);
  const renumberedAlat = sortedAlat.map((kw, idx) => {
    const seq = idx + 1;
    const padSeq = String(seq).padStart(2, '0');
    return {
      ...kw,
      noBukti: `${padSeq}/KW-ALAT/${safeYear}`,
      noSpb: `SPB-${padSeq}/ALAT/${safeYear}`,
    };
  });

  // 3. Renumber SMKK chronologically (01/KW-SMKK/2026, 02/KW-SMKK/2026, ...)
  const sortedSmkk = sortChronologically(smkkList);
  const renumberedSmkk = sortedSmkk.map((kw, idx) => {
    const seq = idx + 1;
    const padSeq = String(seq).padStart(2, '0');
    return {
      ...kw,
      noBukti: `${padSeq}/KW-SMKK/${safeYear}`,
      noSpb: `SPB-${padSeq}/SMKK/${safeYear}`,
    };
  });

  // 4. Renumber Upah (UK/01/2026, UK/02/2026, ...)
  const sortedUpah = sortChronologically(upahList);
  const renumberedUpah = sortedUpah.map((kw) => {
    const wNum = kw.mingguKeRef || 1;
    const padW = String(wNum).padStart(2, '0');
    return {
      ...kw,
      noBukti: `UK/${padW}/${safeYear}`,
      noSpb: `SPB-UK/${padW}/${safeYear}`,
    };
  });

  // 5. Renumber Konsultan Perencana
  // 5. Renumber Konsultan Perencana (Monthly sequence)
  const sortedKonsP = sortChronologically(konsPList);
  const renumberedKonsP = sortedKonsP.map((kw, idx) => {
    const padM = String(idx + 1).padStart(2, '0');
    return {
      ...kw,
      noBukti: `KONS-P/${padM}/${safeYear}`,
      noSpb: `SPB-KONS-P/${padM}/${safeYear}`,
    };
  });

  // 6. Renumber Konsultan Pengawas (Monthly sequence)
  const sortedKonsW = sortChronologically(konsWList);
  const renumberedKonsW = sortedKonsW.map((kw, idx) => {
    const padM = String(idx + 1).padStart(2, '0');
    return {
      ...kw,
      noBukti: `KONS-W/${padM}/${safeYear}`,
      noSpb: `SPB-KONS-W/${padM}/${safeYear}`,
    };
  });

  // 7. Renumber Administrasi / Pengelola SPJ (Monthly sequence)
  const sortedAdm = sortChronologically(admList);
  const renumberedAdm = sortedAdm.map((kw, idx) => {
    const padM = String(idx + 1).padStart(2, '0');
    return {
      ...kw,
      noBukti: `ADM/${padM}/${safeYear}`,
      noSpb: `SPB-ADM/${padM}/${safeYear}`,
    };
  });

  const combined = [
    ...renumberedSiplah,
    ...renumberedMat,
    ...renumberedCtk,
    ...renumberedFur,
    ...renumberedAlat,
    ...renumberedSmkk,
    ...renumberedUpah,
    ...renumberedKonsP,
    ...renumberedKonsW,
    ...renumberedAdm,
    ...others,
  ];

  return sortChronologically(combined);
}

export interface DecomposedItem {
  namaBarang: string;
  volume: number;
  satuan: string;
  hargaSatuan: number;
  jumlah: number;
}

interface MaterialTemplate {
  nama: string;
  satuan: string;
  typicalPrice: number;
  weight: number;
}

/**
 * Intelligent Material Decomposition Engine:
 * Transforms job-level titles (especially for UPAH_BAHAN or items without direct AHSP)
 * into realistic, commercial store materials with exact nominal conservation.
 */
export function decomposeRealisticBahanAndUpah(
  uraian: string,
  bahanNominal: number,
  upahNominal: number
): {
  bahanItems: DecomposedItem[];
  upahComponents: DecomposedItem[];
} {
  const lower = uraian.toLowerCase();

  // A raw item is ONLY a direct single material if it has NO job scope, trade or spec words:
  const hasJobScope =
    /pekerjaan|pasang|pemasangan|pengadaan|pembuatan|perbaikan|rehab|renovasi|bongkar|urugan|uruk|galian|cor\b|pengecoran|plesteran|acian|instalasi|pengecatan|pengukuran|bowplank|bouwplank|rangka|penutup|pondasi|struktur|titik|bawah|tebal|\d+\s*cm|\d+\s*mm|campuran|manual/i.test(
      lower
    );

  const isDirectRawMaterial =
    !hasJobScope &&
    /semen|paku|pasir|cat|bata|genteng|spandek|pipa|kabel|keramik|hollow|gypsum|grc|besi|kayu|baut|engsel|kunci|saklar/i.test(lower);

  let materialTemplates: MaterialTemplate[] = [];
  let upahRoleTukang = 'Tukang Terampil Lapangan';
  let upahRolePekerja = 'Pekerja Konstruksi';

  if (isDirectRawMaterial) {
    const typicalP = /semen/i.test(lower) ? 68000 : /pasir/i.test(lower) ? 220000 : /cat/i.test(lower) ? 350000 : 50000;
    const vol = Math.max(1, Math.round((bahanNominal / typicalP) * 10) / 10);
    return {
      bahanItems: [
        {
          namaBarang: uraian,
          volume: vol,
          satuan: /semen/i.test(lower) ? 'Zak' : /pasir/i.test(lower) ? 'm³' : /cat/i.test(lower) ? 'Galon' : 'Unit',
          hargaSatuan: Math.round(bahanNominal / vol),
          jumlah: bahanNominal,
        },
      ],
      upahComponents:
        upahNominal > 0
          ? [
              {
                namaBarang: 'Tukang Terampil',
                volume: Math.max(1, Math.round((upahNominal * 0.6) / 135000)),
                satuan: 'OH',
                hargaSatuan: 135000,
                jumlah: Math.round(upahNominal * 0.6),
              },
              {
                namaBarang: 'Pekerja Lapangan',
                volume: Math.max(1, Math.round((upahNominal * 0.4) / 110000)),
                satuan: 'OH',
                hargaSatuan: 110000,
                jumlah: upahNominal - Math.round(upahNominal * 0.6),
              },
            ]
          : [],
    };
  }

  // 0. Urugan Pasir / Tanah / Timbunan / Sirtu
  if (/urugan|uruk|timbunan|sirtu/i.test(lower)) {
    if (/pasir/i.test(lower)) {
      materialTemplates = [
        { nama: 'Pasir Urug Pilihan / Timbunan Bersih', satuan: 'm³', typicalPrice: 175000, weight: 1.0 },
      ];
      upahRoleTukang = 'Pekerja Perata Pasir Urug';
      upahRolePekerja = 'Pekerja Langsir & Pemadatan';
    } else {
      materialTemplates = [
        { nama: 'Tanah Urug Sub-grade Pilihan', satuan: 'm³', typicalPrice: 135000, weight: 1.0 },
      ];
      upahRoleTukang = 'Pekerja Perata Tanah Urug';
      upahRolePekerja = 'Pekerja Langsir & Pemadatan';
    }
  }
  // 0A. SMKK / K3 Lapangan / Keselamatan Kerja & APD
  else if (/smkk|k3|keselamatan|apd|helm|rompi|p3k|rambu|tali keselamatan/i.test(lower)) {
    materialTemplates = [
      { nama: 'Helm Pelindung Proyek (Safety Helmet SNI)', satuan: 'Buah', typicalPrice: 85000, weight: 0.35 },
      { nama: 'Rompi Proyek Reflektif K3', satuan: 'Buah', typicalPrice: 65000, weight: 0.25 },
      { nama: 'Kotak & Perlengkapan Obat P3K Lapangan', satuan: 'Set', typicalPrice: 150000, weight: 0.20 },
      { nama: 'Tali Keselamatan / Rambu Peringatan K3', satuan: 'Roll', typicalPrice: 120000, weight: 0.12 },
      { nama: 'Sarung Tangan Kerja & Masker K3', satuan: 'Pack', typicalPrice: 45000, weight: 0.08 },
    ];
    upahRoleTukang = 'Petugas K3 Lapangan';
    upahRolePekerja = 'Pekerja K3';
  }
  // 0B. Pondasi Batu Kali / Aanstamping / Batu Belah
  else if (/batu kali|pondasi batu|pasangan batu|aanstamping|batu kosong|batu belah/i.test(lower)) {
    if (/aanstamping|batu kosong/i.test(lower)) {
      materialTemplates = [
        { nama: 'Batu Kali Belah 15/20 cm', satuan: 'm³', typicalPrice: 280000, weight: 0.75 },
        { nama: 'Pasir Urug Alas Aanstamping', satuan: 'm³', typicalPrice: 175000, weight: 0.25 },
      ];
    } else {
      materialTemplates = [
        { nama: 'Batu Kali Belah 15/20 cm', satuan: 'm³', typicalPrice: 280000, weight: 0.50 },
        { nama: 'Semen Portland (PC) 50 Kg', satuan: 'Zak', typicalPrice: 68000, weight: 0.32 },
        { nama: 'Pasir Pasang Ayak Bersih', satuan: 'm³', typicalPrice: 220000, weight: 0.18 },
      ];
    }
    upahRoleTukang = 'Tukang Batu Pondasi';
    upahRolePekerja = 'Pekerja Adukan & Langsir';
  }
  // 1. Pengecatan
  else if (/cat|pengecatan|plamir|melamik|politur/i.test(lower)) {
    materialTemplates = [
      { nama: 'Cat Tembok Eksterior/Interior Weatherproof', satuan: 'Pail', typicalPrice: 380000, weight: 0.55 },
      { nama: 'Plamir Tembok / Wall Putty Instan', satuan: 'Zak', typicalPrice: 135000, weight: 0.20 },
      { nama: 'Kuas Roll Cat, Kuas Bulu 3" & Baki Cat', satuan: 'Set', typicalPrice: 85000, weight: 0.10 },
      { nama: 'Kertas Gosok / Amplas No. 120 & 180', satuan: 'Lembar', typicalPrice: 12000, weight: 0.08 },
      { nama: 'Lakban Kertas / Masking Tape Pelindung', satuan: 'Roll', typicalPrice: 18000, weight: 0.07 },
    ];
    upahRoleTukang = 'Tukang Cat & Finishing';
    upahRolePekerja = 'Pekerja Pengecatan';
  }
  // 2. Atap / Seng / Baja Ringan
  else if (/atap|seng|genteng|baja ringan|kuda|jurai|nok|bubungan|talang/i.test(lower)) {
    materialTemplates = [
      { nama: 'Rangka Baja Ringan Canal C75 Standar SNI', satuan: 'Batang', typicalPrice: 115000, weight: 0.40 },
      { nama: 'Atap Spandek Gelombang 0.30mm SNI', satuan: 'Lembar', typicalPrice: 165000, weight: 0.30 },
      { nama: 'Reng Baja Ringan Asimetris U-30', satuan: 'Batang', typicalPrice: 55000, weight: 0.15 },
      { nama: 'Baut Roofing / SDS Fastener Hex Head', satuan: 'Kotak', typicalPrice: 95000, weight: 0.08 },
      { nama: 'Seng Plat Talang / Nok Bubungan 0.3mm', satuan: 'Lembar', typicalPrice: 80000, weight: 0.07 },
    ];
    upahRoleTukang = 'Tukang Pasang Rangka Atap';
    upahRolePekerja = 'Pekerja Lapangan';
  }
  // 3. Plafon / Gypsum / GRC
  else if (/plafon|langit|gypsum|grc|akustik|triplek|list plafon/i.test(lower)) {
    materialTemplates = [
      { nama: 'Papan Gypsum / GRC Tebal 9 mm Standar SNI', satuan: 'Lembar', typicalPrice: 85000, weight: 0.45 },
      { nama: 'Rangka Besi Hollow Galvanis 4x4 & 2x4', satuan: 'Batang', typicalPrice: 38000, weight: 0.30 },
      { nama: 'Compound Tepung Gypsum & Kasa Textile Tape', satuan: 'Zak', typicalPrice: 65000, weight: 0.10 },
      { nama: 'List Profil Plafon / Cornice Gypsum', satuan: 'Batang', typicalPrice: 28000, weight: 0.08 },
      { nama: 'Sekrup Fastener Gypsum Hitam 1"', satuan: 'Kotak', typicalPrice: 45000, weight: 0.07 },
    ];
    upahRoleTukang = 'Tukang Plafon Gypsum';
    upahRolePekerja = 'Pekerja Pasang Plafon';
  }
  // 4. Keramik / Lantai
  else if (/keramik|lantai|ubin|granit|homogeneous|tegel|plint/i.test(lower)) {
    materialTemplates = [
      { nama: 'Ubin Keramik Lantai 40x40 / 50x50 SNI', satuan: 'Dus', typicalPrice: 95000, weight: 0.52 },
      { nama: 'Semen Portland (PC) 50 Kg', satuan: 'Zak', typicalPrice: 68000, weight: 0.26 },
      { nama: 'Pasir Pasang Ayak Halus', satuan: 'm³', typicalPrice: 220000, weight: 0.15 },
      { nama: 'Semen Warna Pengisi Nat Keramik (Grouting)', satuan: 'Kg', typicalPrice: 18000, weight: 0.07 },
    ];
    upahRoleTukang = 'Tukang Pasang Keramik';
    upahRolePekerja = 'Pekerja Adukan & Langsir';
  }
  // 5. Pintu / Jendela / Kusen / Kaca
  else if (/pintu|jendela|kusen|kaca|ventilasi|boven|jalusi/i.test(lower)) {
    materialTemplates = [
      { nama: 'Kusen & Daun Pintu/Jendela Kayu/Alumunium', satuan: 'Unit', typicalPrice: 850000, weight: 0.65 },
      { nama: 'Kunci Tanam / Handle Silinder Stainless', satuan: 'Set', typicalPrice: 165000, weight: 0.13 },
      { nama: 'Kaca Polos Bening Tebal 5 mm', satuan: 'm²', typicalPrice: 140000, weight: 0.12 },
      { nama: 'Engsel Pintu/Jendela Stainless Steel 4"', satuan: 'Set', typicalPrice: 45000, weight: 0.10 },
    ];
    upahRoleTukang = 'Tukang Kayu / Kusen';
    upahRolePekerja = 'Pekerja Pembantu Tukang';
  }
  // 6. Listrik / Lampu
  else if (/listrik|lampu|stop kontak|saklar|kabel|penerangan|titik/i.test(lower)) {
    materialTemplates = [
      { nama: 'Kabel Listrik NYM 2x1.5 mm / 2x2.5 mm Standar SNI', satuan: 'Roll', typicalPrice: 450000, weight: 0.40 },
      { nama: 'Lampu LED Hemat Energi 18W / 24W SNI', satuan: 'Buah', typicalPrice: 65000, weight: 0.28 },
      { nama: 'Saklar Ganda & Tunggal Inbow Standar Broco', satuan: 'Buah', typicalPrice: 28000, weight: 0.12 },
      { nama: 'Stop Kontak Dinding & Box Inbow', satuan: 'Buah', typicalPrice: 28000, weight: 0.12 },
      { nama: 'Pipa Konduit Pelindung Kabel & Klem', satuan: 'Batang', typicalPrice: 15000, weight: 0.08 },
    ];
    upahRoleTukang = 'Tukang Instalasi Listrik';
    upahRolePekerja = 'Pekerja Pembantu Listrik';
  }
  // 7. Sanitasi / Kloset / Pipa / Toilet / Saluran
  else if (/sanitasi|toilet|kloset|wc|pipa|saluran|air bersih|drainase|kran|wastafel|septictank|floor drain/i.test(lower)) {
    materialTemplates = [
      { nama: 'Kloset Jongkok Porselen Putih Standar SNI', satuan: 'Unit', typicalPrice: 280000, weight: 0.38 },
      { nama: 'Pipa PVC AW 3" & 1/2" Air Bersih/Kotor', satuan: 'Batang', typicalPrice: 95000, weight: 0.32 },
      { nama: 'Kran Air Stainless Steel & Sambungan Knee/Socket', satuan: 'Buah', typicalPrice: 45000, weight: 0.16 },
      { nama: 'Lem Pipa PVC, Seal Tape & Floor Drain Stainless', satuan: 'Set', typicalPrice: 35000, weight: 0.14 },
    ];
    upahRoleTukang = 'Tukang Pipa & Sanitasi';
    upahRolePekerja = 'Pekerja Galian & Saluran';
  }
  // 8. Cor Beton / Pondasi / Kolom / Balok / Sloof / Ringbalk
  else if (/beton|cor|pondasi|kolom|balok|sloof|ringbalk|pembesian|begisting|plat/i.test(lower)) {
    materialTemplates = [
      { nama: 'Besi Beton Ulir / Polos Standar SNI', satuan: 'Batang', typicalPrice: 95000, weight: 0.42 },
      { nama: 'Semen Portland (PC) 50 Kg', satuan: 'Zak', typicalPrice: 68000, weight: 0.28 },
      { nama: 'Pasir Beton Ayak Bersih', satuan: 'm³', typicalPrice: 240000, weight: 0.14 },
      { nama: 'Batu Split / Kerikil Beton 2/3', satuan: 'm³', typicalPrice: 260000, weight: 0.10 },
      { nama: 'Kawat Ikat Beton / Bendrat & Paku', satuan: 'Kg', typicalPrice: 28000, weight: 0.06 },
    ];
    upahRoleTukang = 'Tukang Besi & Cor Beton';
    upahRolePekerja = 'Pekerja Adukan & Cor';
  }
  // 9. Dinding / Bata / Plesteran / Acian
  else if (/dinding|bata|batako|hebel|plesteran|acian/i.test(lower)) {
    const isOnlyPlester = /plesteran|acian/i.test(lower) && !/bata|batako|hebel/i.test(lower);
    if (isOnlyPlester) {
      materialTemplates = [
        { nama: 'Semen Portland (PC) 50 Kg', satuan: 'Zak', typicalPrice: 68000, weight: 0.65 },
        { nama: 'Pasir Pasang Ayak Halus', satuan: 'm³', typicalPrice: 220000, weight: 0.35 },
      ];
    } else {
      materialTemplates = [
        { nama: 'Bata Merah Bakar Standar Konstruksi', satuan: 'Buah', typicalPrice: 900, weight: 0.45 },
        { nama: 'Semen Portland (PC) 50 Kg', satuan: 'Zak', typicalPrice: 68000, weight: 0.32 },
        { nama: 'Pasir Pasang Ayak Bersih', satuan: 'm³', typicalPrice: 220000, weight: 0.23 },
      ];
    }
    upahRoleTukang = 'Tukang Batu & Plester';
    upahRolePekerja = 'Pekerja Adukan Semen';
  }
  // 10. Persiapan / Bouwplank / Pengukuran / Pagar
  else if (/persiapan|bouwplank|bowplank|pengukuran|pembersihan|pagar/i.test(lower)) {
    materialTemplates = [
      { nama: 'Kayu Kaso 5/7 cm Meranti / Sengon', satuan: 'Batang', typicalPrice: 35000, weight: 0.50 },
      { nama: 'Kayu Papan 3/20 cm Standar Bekisting', satuan: 'Lembar', typicalPrice: 45000, weight: 0.30 },
      { nama: 'Paku Campuran 5 cm - 10 cm', satuan: 'Kg', typicalPrice: 25000, weight: 0.20 },
    ];
    upahRoleTukang = 'Tukang Kayu Persiapan';
    upahRolePekerja = 'Pekerja Pembersihan Lapangan';
  }
  // 11. Perabot / Meja / Kursi / Whiteboard / Mebeler
  else if (/meja|kursi|lemari|whiteboard|perabot|mebeler/i.test(lower)) {
    materialTemplates = [
      { nama: 'Meja Siswa / Guru Rangka Besi & Kayu Solid', satuan: 'Unit', typicalPrice: 450000, weight: 0.50 },
      { nama: 'Kursi Siswa / Guru Rangka Besi Dudukan Kayu', satuan: 'Unit', typicalPrice: 280000, weight: 0.40 },
      { nama: 'Papan Tulis Whiteboard Magnetik & Aksesoris', satuan: 'Set', typicalPrice: 350000, weight: 0.10 },
    ];
    upahRoleTukang = 'Tukang Perakitan Mebeler';
    upahRolePekerja = 'Pekerja Langsir Perabot';
  }
  // 12. Fallback Umum
  else {
    materialTemplates = [
      { nama: 'Semen Portland (PC) 50 Kg', satuan: 'Zak', typicalPrice: 68000, weight: 0.45 },
      { nama: 'Pasir Pasang Pilihan', satuan: 'm³', typicalPrice: 220000, weight: 0.25 },
      { nama: 'Kayu Kaso 5/7 cm', satuan: 'Batang', typicalPrice: 35000, weight: 0.20 },
      { nama: 'Paku Campuran 5 cm - 10 cm', satuan: 'Kg', typicalPrice: 25000, weight: 0.10 },
    ];
    upahRoleTukang = 'Tukang Terampil';
    upahRolePekerja = 'Pekerja Lapangan';
  }

  // Decompose Bahan
  const bahanItems: DecomposedItem[] = [];
  let allocatedBahanNominal = 0;

  materialTemplates.forEach((tpl, idx) => {
    const isLast = idx === materialTemplates.length - 1;
    const subJml = isLast ? bahanNominal - allocatedBahanNominal : Math.round(bahanNominal * tpl.weight);
    allocatedBahanNominal += subJml;

    if (subJml <= 0) return;

    let subVol = Math.max(1, Math.round((subJml / tpl.typicalPrice) * 10) / 10);
    if (/zak|buah|dus|set|batang|lembar|pail|unit|roll|kotak/i.test(tpl.satuan)) {
      subVol = Math.max(1, Math.round(subVol));
    }
    const hargaSatuan = Math.round(subJml / subVol);

    bahanItems.push({
      namaBarang: tpl.nama,
      volume: subVol,
      satuan: tpl.satuan,
      hargaSatuan: hargaSatuan,
      jumlah: subJml,
    });
  });

  // Decompose Upah
  const upahComponents: DecomposedItem[] = [];
  if (upahNominal > 0) {
    const tukangNominal = Math.round(upahNominal * 0.62);
    const pekerjaNominal = upahNominal - tukangNominal;

    const rateTukang = 135000;
    const ratePekerja = 110000;

    const volTukang = Math.max(0.5, Math.round((tukangNominal / rateTukang) * 10) / 10);
    const volPekerja = Math.max(0.5, Math.round((pekerjaNominal / ratePekerja) * 10) / 10);

    upahComponents.push({
      namaBarang: upahRoleTukang,
      volume: volTukang,
      satuan: 'OH',
      hargaSatuan: Math.round(tukangNominal / volTukang),
      jumlah: tukangNominal,
    });

    if (pekerjaNominal > 0) {
      upahComponents.push({
        namaBarang: upahRolePekerja,
        volume: volPekerja,
        satuan: 'OH',
        hargaSatuan: Math.round(pekerjaNominal / volPekerja),
        jumlah: pekerjaNominal,
      });
    }
  }

  return { bahanItems, upahComponents };
}


export function resolveManagementRecipient(
  type: 'PERENCANA' | 'PENGAWAS' | 'PENGELOLA',
  school?: SchoolMasterData,
  stores: StoreVendor[] = []
): string {
  if (type === 'PERENCANA') {
    const store = (stores || []).find(
      (s) =>
        s.kategori === 'PERENCANA' ||
        s.kategori === 'KONSULTAN' ||
        /perencana/i.test(`${s.namaToko} ${s.pemilikNama} ${s.pekerjaan || ''}`)
    );
    if (store) {
      return store.pemilikNama || store.namaToko;
    }
    const schoolName = school?.namaPerencana?.trim();
    return schoolName || 'Konsultan Perencana';
  }

  if (type === 'PENGAWAS') {
    const store = (stores || []).find(
      (s) =>
        s.kategori === 'PENGAWAS' ||
        /pengawas/i.test(`${s.namaToko} ${s.pemilikNama} ${s.pekerjaan || ''}`)
    );
    if (store) {
      return store.pemilikNama || store.namaToko;
    }
    const schoolName = school?.namaPengawas?.trim();
    return schoolName || 'Pengawas Lapangan';
  }

  // PENGELOLA SPJ
  const store = (stores || []).find(
    (s) =>
      s.kategori === 'PENGELOLA_SPJ' ||
      s.kategori === 'OPERASIONAL' ||
      /administrasi|pengelola|spj/i.test(`${s.namaToko} ${s.pemilikNama} ${s.pekerjaan || ''}`)
  );
  if (store) {
    return store.pemilikNama || store.namaToko;
  }
  const schoolName = school?.namaBendahara?.trim() || school?.namaKetuaP2SP?.trim();
  return schoolName || 'Pengelola SPJ';
}

/**
 * Universal Store Resolver from Item Tags:
 * Intelligently prioritizes actual partner store/vendor tags (e.g. "N&N STATIONARY", "TB. JAYA SEMPURNA")
 * over platform tags ("SipLah") or generic action tags ("BAYAR BAHAN DARI").
 */
export function resolveStoreFromItemTags(
  item: { tags?: string[]; namaBarang?: string; uraian?: string; kategoriBiaya?: string } | null | undefined,
  stores: StoreVendor[] = [],
  fallbackStore?: Partial<StoreVendor>,
  kabKota: string = ''
): {
  id: string;
  namaToko: string;
  pemilikNama: string;
  pekerjaan: string;
  alamat: string;
  telepon: string;
  npwp: string;
  kategori: any;
} {
  const itemTags: string[] = Array.isArray(item?.tags) ? item.tags : [];

  const isGenericPlatformOrAction = (t: string) =>
    /^(siplah|kemdikbud|mitra|bayar\s+bahan.*|belanja.*|pembelian.*|material|bahan)$/i.test((t || '').trim());

  // 1. First Priority: Exact or clean match with Master Toko on non-generic tags
  for (const rawTag of itemTags) {
    const cleanTag = (rawTag || '').trim();
    if (!cleanTag || isGenericPlatformOrAction(cleanTag)) continue;

    const tagLower = cleanTag.toLowerCase();
    const matched = (stores || []).find((s) => {
      const sNama = (s.namaToko || '').trim().toLowerCase();
      const sId = (s.id || '').trim().toLowerCase();
      const sPemilik = (s.pemilikNama || '').trim().toLowerCase();

      return (
        sNama === tagLower ||
        sId === tagLower ||
        sPemilik === tagLower ||
        sNama.includes(tagLower) ||
        tagLower.includes(sNama) ||
        (sPemilik && (sPemilik.includes(tagLower) || tagLower.includes(sPemilik)))
      );
    });

    if (matched) {
      return {
        id: matched.id,
        namaToko: matched.namaToko,
        pemilikNama: matched.pemilikNama || 'Pemilik Toko',
        pekerjaan: matched.pekerjaan || `Penyedia ${matched.namaToko}`,
        alamat: matched.alamat || kabKota || '',
        telepon: matched.telepon || '',
        npwp: matched.npwp || '',
        kategori: matched.kategori || 'SIPLAH',
      };
    }
  }

  // 2. Second Priority: Match category from non-generic tags
  for (const rawTag of itemTags) {
    const cleanTag = (rawTag || '').trim();
    if (!cleanTag || isGenericPlatformOrAction(cleanTag)) continue;

    const tagLower = cleanTag.toLowerCase();
    const matchedCat = (stores || []).find(
      (s) => s.kategori && s.kategori.toLowerCase() === tagLower
    );
    if (matchedCat) {
      return {
        id: matchedCat.id,
        namaToko: matchedCat.namaToko,
        pemilikNama: matchedCat.pemilikNama || 'Pemilik Toko',
        pekerjaan: matchedCat.pekerjaan || `Penyedia ${matchedCat.namaToko}`,
        alamat: matchedCat.alamat || kabKota || '',
        telepon: matchedCat.telepon || '',
        npwp: matchedCat.npwp || '',
        kategori: matchedCat.kategori || 'SIPLAH',
      };
    }
  }

  // 3. Third Priority: If custom store tag provided (e.g. "N&N STATIONARY"), use it directly
  for (const rawTag of itemTags) {
    const cleanTag = (rawTag || '').trim();
    if (!cleanTag || isGenericPlatformOrAction(cleanTag)) continue;
    return {
      id: `custom-store-${cleanTag.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      namaToko: cleanTag,
      pemilikNama: `Penyedia ${cleanTag}`,
      pekerjaan: `Penyedia ${cleanTag}`,
      alamat: kabKota || 'Kota/Kabupaten Setempat',
      telepon: '',
      npwp: '',
      kategori: 'SIPLAH',
    };
  }

  // 4. Default Fallback
  const def = fallbackStore || {};
  return {
    id: def.id || 's-default',
    namaToko: def.namaToko || 'Toko Rekanan',
    pemilikNama: def.pemilikNama || 'Pemilik Toko',
    pekerjaan: def.pekerjaan || `Penyedia ${def.namaToko || 'Toko Rekanan'}`,
    alamat: def.alamat || kabKota || '',
    telepon: def.telepon || '',
    npwp: def.npwp || '',
    kategori: def.kategori || 'SIPLAH',
  };
}

export function deduplicateBkuTransactions(transactions: BkuTransaction[]): BkuTransaction[] {
  if (!Array.isArray(transactions)) return [];
  const seenIds = new Set<string>();
  const seenBukti = new Set<string>();
  const seenNoBuktiNominal = new Set<string>();
  const seenKwitansiRefs = new Set<string>();
  const seenSignature = new Set<string>();
  const deduped: BkuTransaction[] = [];

  for (const tx of transactions) {
    if (!tx) continue;
    const normId = (tx.id || '').trim();
    const normBukti = (tx.noBukti || '').trim().toUpperCase();
    const normNominal = Math.round((tx.pengeluaran || 0) + (tx.penerimaan || 0));
    const normTanggal = (tx.tanggal || '').trim();
    const normUraian = (tx.uraian || '').trim().toLowerCase();
    const kwRef = (tx.kwitansiIdRef || '').trim();

    // 1. Exact ID
    if (normId && seenIds.has(normId)) {
      continue;
    }

    // 2. Exact Kwitansi Ref
    if (kwRef && seenKwitansiRefs.has(kwRef)) {
      continue;
    }

    // 3. Exact No Bukti (Non-generic proof numbers)
    const isSpecialBukti = normBukti && normBukti !== '-' && normBukti !== 'MANUAL';
    if (isSpecialBukti) {
      if (seenBukti.has(normBukti)) {
        continue;
      }
    }

    // 4. Exact No Bukti + Nominal
    if (isSpecialBukti && normNominal > 0) {
      const keyBuktiNom = `${normBukti}|${normNominal}`;
      if (seenNoBuktiNominal.has(keyBuktiNom)) {
        continue;
      }
    }

    // 5. Exact Uraian + Tanggal + Nominal + Jenis
    if (normNominal > 0) {
      const sigKey = `${normTanggal}|${normUraian}|${normNominal}|${tx.jenis}`;
      if (seenSignature.has(sigKey)) {
        continue;
      }
    }

    if (normId) seenIds.add(normId);
    if (kwRef) seenKwitansiRefs.add(kwRef);
    if (isSpecialBukti) seenBukti.add(normBukti);
    if (isSpecialBukti && normNominal > 0) seenNoBuktiNominal.add(`${normBukti}|${normNominal}`);
    if (normNominal > 0) seenSignature.add(`${normTanggal}|${normUraian}|${normNominal}|${tx.jenis}`);

    deduped.push(tx);
  }

  return deduped;
}

export function calculateBkuFromTransactions(
  kwitansiList: KwitansiDocument[],
  school: SchoolMasterData,
  manualTransactions: BkuTransaction[] = [],
  progressWeeks: ProjectProgressWeek[] = [],
  deletedIds: string[] = [],
  wageReports: WeeklyWageReport[] = [],
  bkuWeekLimit?: number,
  stores: StoreVendor[] = [],
  bkbList: BkbTransaction[] = []
): BkuTransaction[] {
  if (deletedIds.includes('ALL_BKU')) {
    return [];
  }

  const result: BkuTransaction[] = [];
  const yearStr = school?.tahunAnggaran?.trim() || '2026';
  const effLimit = bkuWeekLimit || 14;

  // Determine starting date strictly from Laporan Mingguan & Bobot input
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

  // Determine Termin 2 date from mid-project week (e.g. week 8)
  let termin2DateIso = `${yearStr}-09-01`;
  let termin2DateSlash = `01/09/${yearStr}`;
  let termin2Bulan = `September ${yearStr}`;

  if (progressWeeks && progressWeeks.length > 0) {
    const week8 = progressWeeks.find((w) => w.mingguKe === 8) || progressWeeks[Math.min(7, progressWeeks.length - 1)];
    const resolved8 = resolveWeekDates(week8, yearStr);
    termin2DateIso = resolved8.startDate;
    termin2DateSlash = resolved8.startDateSlash;
    termin2Bulan = resolved8.bulan;
  }

  // 1. Initial Deposit / Penarikan Termin 1 (70%)
  const manualInit1 = manualTransactions.find((m) => m.id === 'bku-init-1');
  const termin1Amount = school?.termin1Nilai || (school?.totalAnggaran ? Math.round(school.totalAnggaran * ((school.termin1Persen || 70) / 100)) : 0);

  if (!deletedIds.includes('bku-init-1')) {
    if (manualInit1) {
      result.push(manualInit1);
    } else if (termin1Amount > 0 && (kwitansiList.length > 0 || manualTransactions.length > 0)) {
      result.push({
        id: 'bku-init-1',
        tanggal: startProjectDateSlash,
        tanggalObj: startProjectDateIso,
        bulan: startProjectBulan,
        jenis: 'PENERIMAAN',
        uraian: 'Penarikan dari Bank (Termin 1 - 70%)',
        noBukti: 'BKT-01',
        penerimaan: termin1Amount,
        pengeluaran: 0,
      });
    }
  }

  // 2. Map all Kwitansi into BKU rows
  const activeWeeks = (progressWeeks || [])
    .filter((w) => w.mingguKe <= effLimit)
    .filter((w) => (w.bobotRealisasi && w.bobotRealisasi > 0) || w.divisions?.some((d) => (d.prestasiMingguIni || 0) > 0));

  const activeWeekNums = new Set(activeWeeks.map((w) => w.mingguKe));
  const hasAnyActiveProgress = activeWeekNums.size > 0;

  // Ensure clean, deduplicated input kwitansis to prevent any duplicate document in BKU
  const cleanSourceKwitansi = deduplicateKwitansiList(kwitansiList);

  cleanSourceKwitansi.forEach((kw) => {
    const cleanKwId = (kw.id || '').replace(/^(bku-kw-)+/, '');
    const kwBkuId = `bku-kw-${cleanKwId}`;
    if (
      deletedIds.includes(kw.id) ||
      deletedIds.includes(cleanKwId) ||
      deletedIds.includes(kwBkuId) ||
      (kw.noBukti && deletedIds.includes(kw.noBukti))
    ) {
      return;
    }

    const kwWeek = extractWeekNumberFromKwitansi(kw, progressWeeks, yearStr);
    // STRICT ISOLATION: Anything beyond the week limit is excluded!
    if (kwWeek !== null && kwWeek > effLimit) {
      return;
    }

    // STRICT ANTI-NEGATIVE BALANCE:
    if (hasAnyActiveProgress && kwWeek !== null && !activeWeekNums.has(kwWeek)) {
      return;
    }
    if (!hasAnyActiveProgress && (kw.tipe === 'MATERIAL' || kw.tipe === 'UPAH' || kw.tipe === 'PERABOT' || kwWeek !== null)) {
      return;
    }

    // Check if user manually edited this transaction in BKU or BKT
    const cleanKwBukti = (kw.noBukti || '').trim().toUpperCase();
    const manualKwOverride = manualTransactions.find((m) => {
      const mBukti = (m.noBukti || '').trim().toUpperCase();
      return (
        m.id === kwBkuId ||
        m.id === `bku-${cleanKwId}` ||
        m.id === kw.id ||
        m.kwitansiIdRef === kw.id ||
        (cleanKwBukti && cleanKwBukti !== '-' && mBukti === cleanKwBukti)
      );
    });
    if (manualKwOverride) {
      result.push({
        ...manualKwOverride,
        id: kwBkuId,
        tanggal: manualKwOverride.tanggal || kw.tanggal,
        tanggalObj: manualKwOverride.tanggalObj || parseTxDateToIso(manualKwOverride.tanggal || kw.tanggal, parseInt(yearStr, 10)),
        bulan: manualKwOverride.bulan || kw.bulan,
        uraian: manualKwOverride.uraian || kw.uraian,
        noBukti: manualKwOverride.noBukti || kw.noBukti,
        pengeluaran: manualKwOverride.pengeluaran || kw.nominal,
        kwitansiIdRef: kw.id,
        metodeBayar: manualKwOverride.metodeBayar || kw.metodeBayar || (/siplah/i.test(`${manualKwOverride.noBukti || kw.noBukti || ''} ${manualKwOverride.uraian || kw.uraian || ''}`) ? 'BANK' : 'TUNAI'),
        isLocked: true,
        isManualDate: true,
      });
      return;
    }

    // Determine sortable date format YYYY-MM-DD and display DD/MM/YYYY
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

    const isKwDateManuallyLocked = Boolean(kw.isLocked || kw.isManualDate);

    // Enforce business rules on payment dates ONLY if not manually locked
    if (!isKwDateManuallyLocked && kw.mingguKeRef && progressWeeks && progressWeeks.length > 0) {
      const matchW = progressWeeks.find((w) => w.mingguKe === kw.mingguKeRef);
      if (matchW) {
        const resolvedW = resolveWeekDates(matchW, yearStr);
        const isStrictAkhirMingguPayment =
          kw.tipe === 'UPAH' ||
          /uk\//i.test(kw.noBukti || '') ||
          /upah tukang|upah pekerja|daftar hadir/i.test(kw.uraian);

        if (isStrictAkhirMingguPayment) {
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

    let bkuUraian = kw.uraian;
    const isMaterialKw =
      kw.tipe === 'MATERIAL' ||
      /kwt[\/\-_]?mat|kw[\/\-_]?mat|\bmat\b|mat[\/\-_]|material/i.test(kw.noBukti || '') ||
      Boolean(kw.namaToko) ||
      /bahan|material|semen|pasir|bata|keramik|besi|cat|toko|tb\./i.test(kw.uraian);

    if (kw.tipe === 'UPAH' || /uk\//i.test(kw.noBukti || '')) {
      bkuUraian = kw.uraian.replace('Pembayaran Lunas Biaya ', 'Bayar ');
    } else if (isMaterialKw) {
      const storeName =
        kw.namaToko ||
        (!/pengawas|perencana/i.test(kw.penerimaNama || '') ? kw.penerimaNama : '') ||
        'Toko Rekanan';
      bkuUraian = `Bayar Bahan Dari ${storeName}`;
    } else if (/kons-p/i.test(kw.noBukti || '') || (kw.tipe === 'KONSULTAN' && /perencana/i.test(kw.uraian)) || (/perencana/i.test(kw.uraian) && !/dari\s+tb|toko/i.test(kw.uraian))) {
      const recipient = kw.penerimaNama || resolveManagementRecipient('PERENCANA', school, stores);
      bkuUraian = `Bayar Honorarium Jasa Perencana Teknis (${recipient})`;
    } else if (/kons-w/i.test(kw.noBukti || '') || (kw.tipe === 'KONSULTAN' && /pengawas/i.test(kw.uraian)) || (/pengawas/i.test(kw.uraian) && !/dari\s+tb|toko/i.test(kw.uraian))) {
      const recipient = kw.penerimaNama || resolveManagementRecipient('PENGAWAS', school, stores);
      bkuUraian = `Bayar Honorarium Jasa Pengawas Lapangan (${recipient})`;
    } else if (kw.tipe === 'OPERASIONAL' || /adm/i.test(kw.noBukti || '') || /administrasi|pengelolaan/i.test(kw.uraian)) {
      const recipient = kw.penerimaNama || resolveManagementRecipient('PENGELOLA', school, stores);
      bkuUraian = `Bayar Biaya Pengelolaan Administrasi LPJ (${recipient})`;
    } else {
      bkuUraian = `Bayar Bahan Dari ${kw.namaToko || kw.penerimaNama || 'Penyedia'}`;
    }

    let finalPengeluaran = kw.nominal;
    // Always preserve exact kw.nominal so BKU total spend matches Kwitansi list sum 100%
    result.push({
      id: kwBkuId,
      tanggal: displayTanggal,
      tanggalObj: sortDate,
      bulan: kw.bulan || startProjectBulan,
      jenis: 'PENGELUARAN',
      uraian: bkuUraian,
      noBukti: kw.noBukti,
      penerimaan: 0,
      pengeluaran: finalPengeluaran,
      kategoriBiaya: kw.kategoriBiayaPajak,
      kwitansiIdRef: kw.id,
      metodeBayar: kw.metodeBayar || (/siplah/i.test(`${kw.noBukti || ''} ${bkuUraian}`) ? 'BANK' : 'TUNAI'),
    });
  });

  // 2b. Map WeeklyWageReports into BKU if not already represented in kwitansiList / result (Strictly Active Weeks Only & Capped at 35%)
  (wageReports || []).forEach((wr) => {
    if (!wr || wr.totalUpah <= 0) return;
    const wNum = wr.mingguKe;
    if (!activeWeekNums.has(wNum)) return;

    const weekPad = String(wNum).padStart(2, '0');
    const ukBukti = `UK/${weekPad}/${yearStr}`;

    // STRICT CHECK: If an upah transaction for this week is already represented in result or kwitansiList, DO NOT duplicate!
    const alreadyHasUpah = result.some((r) => {
      const rBukti = (r.noBukti || '').toUpperCase().trim();
      if (rBukti === ukBukti.toUpperCase() || rBukti === `UK/${wNum}/${yearStr}`.toUpperCase()) return true;
      if (/uk\//i.test(rBukti) && (rBukti.includes(`/${weekPad}/`) || rBukti.includes(`/${wNum}/`))) return true;
      if (/upah/i.test(r.uraian || '') && (rBukti.includes(`/${weekPad}/`) || rBukti.includes(`/${wNum}/`))) return true;
      if (r.kwitansiIdRef) {
        const linked = cleanSourceKwitansi.find((k) => k.id === r.kwitansiIdRef);
        if (linked && (linked.tipe === 'UPAH' || /uk\//i.test(linked.noBukti || ''))) {
          const wK = extractWeekNumberFromKwitansi(linked, progressWeeks, yearStr);
          if (wK === wNum) return true;
        }
      }
      return false;
    });

    if (!alreadyHasUpah) {
      const matchW = activeWeeks.find((w) => w.mingguKe === wNum);
      const weekDivSum = (matchW?.divisions || []).reduce((s, d) => s + (d.prestasiMingguIni || 0), 0);
      const weekBobot = weekDivSum;
      const paguTotal = school?.totalAnggaran || 552457000;
      const weekIncrementalBudget = Math.round((paguTotal * weekBobot) / 100);
      const maxWageCap = Math.round(weekIncrementalBudget * 0.35);
      const cappedUpah = maxWageCap > 0 ? Math.min(wr.totalUpah, maxWageCap) : wr.totalUpah;

      const wDates = matchW
        ? resolveWeekDates(matchW, yearStr)
        : { endDate: `${yearStr}-07-12`, endDateSlash: `12/07/${yearStr}`, bulan: startProjectBulan };

      const bkuUpahId = `bku-wage-w${wNum}`;
      if (deletedIds.includes(bkuUpahId)) return;

      const manualWageOverride = manualTransactions.find((m) => {
        const mBukti = (m.noBukti || '').trim().toUpperCase();
        return (
          m.id === bkuUpahId ||
          m.kwitansiIdRef === `kw-upah-m${wNum}` ||
          (mBukti && (mBukti === ukBukti.toUpperCase() || mBukti === `UK/${wNum}/${yearStr}`.toUpperCase()))
        );
      });

      if (manualWageOverride) {
        result.push({
          ...manualWageOverride,
          id: bkuUpahId,
          noBukti: ukBukti,
          pengeluaran: manualWageOverride.pengeluaran || cappedUpah,
          isLocked: true,
          isManualDate: true,
        });
        return;
      }

      // Apply 2-day date shift to align with bank cash availability
      const originalDate = new Date(`${wDates.endDate}T00:00:00`);
      const shiftedDate = new Date(originalDate.getTime() + 2 * 86400000); // Shift 2 days
      const d = String(shiftedDate.getDate()).padStart(2, '0');
      const m = String(shiftedDate.getMonth() + 1).padStart(2, '0');
      const y = shiftedDate.getFullYear();
      const displayTanggal = `${d}/${m}/${y}`;
      const isoTanggal = `${y}-${m}-${d}`;

      result.push({
        id: bkuUpahId,
        tanggal: displayTanggal,
        tanggalObj: isoTanggal,
        bulan: wDates.bulan || startProjectBulan,
        jenis: 'PENGELUARAN',
        uraian: `Bayar Upah Borongan Pekerja Fisik Minggu Ke-${wNum} (Periode ${wDates.endDateSlash.split('/')[0]} ${wDates.bulan.split(' ')[0]})`,
        noBukti: ukBukti,
        penerimaan: 0,
        pengeluaran: cappedUpah,
        kategoriBiaya: 'Konstruksi',
        kwitansiIdRef: `kw-upah-m${wNum}`,
      });
    }
  });

  // 2c. Management BKU entries (Perencana, Pengawas, Pengelola SPJ) are now monthly receipts
  // and are already populated chronologically from kwitansiList above on their exact payment dates.

  // 3. Add Termin 2 bank withdrawal
  const manualInit2 = manualTransactions.find((m) => m.id === 'bku-init-2');
  const termin2Amount = school?.termin2Nilai || (school?.totalAnggaran ? Math.round(school.totalAnggaran * ((school.termin2Persen || 30) / 100)) : 0);

  if (!deletedIds.includes('bku-init-2')) {
    if (manualInit2) {
      result.push(manualInit2);
    } else if (
      (effLimit >= 6 || calculateCumulativeRealizedProgress(progressWeeks, effLimit) >= 60) &&
      termin2Amount > 0
    ) {
      result.push({
        id: 'bku-init-2',
        tanggal: termin2DateSlash,
        tanggalObj: termin2DateIso,
        bulan: termin2Bulan,
        jenis: 'PENERIMAAN',
        uraian: 'Penarikan dari Bank (Termin 2 - 30%)',
        noBukti: 'BKT-02',
        penerimaan: termin2Amount,
        pengeluaran: 0,
      });
    }
  }

  // 4. Merge other manual transactions with strict deduplication against existing result
  manualTransactions.forEach((tx) => {
    if (
      deletedIds.includes(tx.id) ||
      tx.id === 'bku-init-1' ||
      tx.id === 'bku-init-2'
    ) {
      return;
    }

    const txBukti = (tx.noBukti || '').trim().toUpperCase();
    const txNominal = Math.round((tx.pengeluaran || 0) + (tx.penerimaan || 0));
    const txUraian = (tx.uraian || '').trim().toLowerCase();

    // Check if tx is already represented in result by ID, kwitansi ref, noBukti, or signature
    const isAlreadyRepresented = result.some((r) => {
      if (r.id === tx.id) return true;
      if (tx.kwitansiIdRef && (r.kwitansiIdRef === tx.kwitansiIdRef || r.id === tx.kwitansiIdRef || r.id === `bku-kw-${tx.kwitansiIdRef.replace(/^(bku-kw-)+/, '')}`)) {
        return true;
      }
      const rBukti = (r.noBukti || '').trim().toUpperCase();
      if (txBukti && rBukti && txBukti !== '-' && txBukti !== 'MANUAL' && rBukti === txBukti) {
        return true;
      }
      const rNominal = Math.round((r.pengeluaran || 0) + (r.penerimaan || 0));
      if (txNominal > 0 && rNominal === txNominal && r.tanggal === tx.tanggal && (r.uraian || '').trim().toLowerCase() === txUraian) {
        return true;
      }
      return false;
    });

    if (isAlreadyRepresented) {
      return;
    }

    // Filter by week limit if linked to a kwitansi
    if (tx.kwitansiIdRef) {
      const linkedKw = cleanSourceKwitansi.find((k) => k.id === tx.kwitansiIdRef);
      if (linkedKw) {
        const kwWeek = extractWeekNumberFromKwitansi(linkedKw, progressWeeks, yearStr);
        if (kwWeek !== null && kwWeek > effLimit) {
          return;
        }
      }
    } else if (tx.tanggal) {
      // Find matching week by transaction date
      const txIso = parseTxDateToIso(tx.tanggalObj || tx.tanggal, parseInt(yearStr, 10));
      if (txIso) {
        const matchW = progressWeeks.find((w) => {
          const res = resolveWeekDates(w, yearStr);
          return txIso >= res.startDate && txIso <= res.endDate;
        });
        if (matchW && matchW.mingguKe > effLimit) {
          return;
        }
      }
    }

    result.push(tx);
  });

  // 5. Ironclad Deduplication pass: Guarantee zero duplicate transactions in BKU, BKT, Rekap & Cetak
  const dedupedResult = deduplicateBkuTransactions(result);

  // 5b. Anti-Minus Cash Splitter (Sinkronisasi dengan Kas Bank BKB):
  // Jika transaksi belanja tunai melebihi sisa kas penarikan bank pada tanggal tersebut,
  // sistem memecah transaksi menjadi:
  // - Tahap 1: Dibayar sesuai kas yang tersedia (saldo tidak minus).
  // - Tahap 2: Sisa pembayaran dialokasikan pada tanggal penarikan bank berikutnya setelah kas masuk.
  let processedBkuList = dedupedResult;
  const bankCashInflows = (bkbList || [])
    .filter((b) => (b.pengeluaran || 0) > 0 && b.kategori !== 'BIAYA_ADMIN')
    .map((b) => ({
      iso: b.tanggalObj || parseTxDateToIso(b.tanggal),
      tanggal: b.tanggal,
      bulan: b.bulan,
      nominal: b.pengeluaran,
    }))
    .sort((a, b) => a.iso.localeCompare(b.iso));

  if (bankCashInflows.length > 0) {
    const queue = [...dedupedResult].sort((a, b) => {
      const isoA = a.tanggalObj || parseTxDateToIso(a.tanggal);
      const isoB = b.tanggalObj || parseTxDateToIso(b.tanggal);
      if (isoA !== isoB) return isoA.localeCompare(isoB);
      if (a.jenis === 'PENERIMAAN' && b.jenis === 'PENGELUARAN') return -1;
      if (a.jenis === 'PENGELUARAN' && b.jenis === 'PENERIMAAN') return 1;
      return 0;
    });

    const splitBkuList: BkuTransaction[] = [];
    let cashOnHand = 0;
    let nextInflowIdx = 0;

    const insertBkuChronologically = (q: BkuTransaction[], item: BkuTransaction) => {
      const itemIso = item.tanggalObj || parseTxDateToIso(item.tanggal);
      const idx = q.findIndex((ex) => {
        const exIso = ex.tanggalObj || parseTxDateToIso(ex.tanggal);
        if (exIso > itemIso) return true;
        if (exIso === itemIso && ex.jenis === 'PENGELUARAN' && item.jenis === 'PENERIMAAN') return true;
        return false;
      });
      if (idx === -1) q.push(item);
      else q.splice(idx, 0, item);
    };

    let safety = 0;
    const maxIters = queue.length * 4;

    while (queue.length > 0 && safety < maxIters) {
      safety++;
      const tx = queue.shift()!;
      const txIso = tx.tanggalObj || parseTxDateToIso(tx.tanggal);

      while (nextInflowIdx < bankCashInflows.length && bankCashInflows[nextInflowIdx].iso <= txIso) {
        cashOnHand += bankCashInflows[nextInflowIdx].nominal;
        nextInflowIdx++;
      }

      if (tx.jenis === 'PENERIMAAN') {
        splitBkuList.push(tx);
        continue;
      }

      const expenseNominal = tx.pengeluaran || 0;
      if (expenseNominal <= 0 || tx.metodeBayar === 'BANK') {
        splitBkuList.push(tx);
        continue;
      }

      if (expenseNominal <= cashOnHand) {
        cashOnHand -= expenseNominal;
        splitBkuList.push(tx);
        continue;
      }

      const nextBank = bankCashInflows.find((b) => b.iso > txIso);

      // Proteksi Pembayaran Pasti (Konsultan Perencana, Pengawas, Pengelola SPJ, Belanja SMKK, Belanja SipLah, Belanja Cetak, Upah):
      // Pembayaran pasti ini TIDAK BOLEH di-split sebagian (wajib utuh).
      // Hanya pembelian bahan material yang diperbolehkan untuk di-split proporsional.
      const isFixedOrNonMaterial = isFixedNonSplitPayment(tx) || !isMaterialOnlyPurchase(tx);

      if (isFixedOrNonMaterial) {
        // Jika ada penarikan kas bank berikutnya, undurkan transaksi pembayaran pasti ini secara UTUH
        if (nextBank) {
          const deferredTx: BkuTransaction = {
            ...tx,
            tanggal: nextBank.tanggal,
            tanggalObj: nextBank.iso,
            bulan: nextBank.bulan,
          };
          insertBkuChronologically(queue, deferredTx);
          continue;
        }
        // Jika tidak ada penarikan bank berikutnya, tetap catat utuh tanpa split
        cashOnHand -= expenseNominal;
        splitBkuList.push(tx);
        continue;
      }

      // HANYA UNTUK BELANJA BAHAN MATERIAL: Lakukan split jika ada sisa kas tunai > 0
      if (cashOnHand > 0) {
        const part1Nominal = cashOnHand;
        const part2Nominal = expenseNominal - part1Nominal;
        cashOnHand = 0;

        splitBkuList.push({
          ...tx,
          id: `${tx.id}-p1`,
          uraian: cleanNaturalUraian(tx.uraian),
          pengeluaran: part1Nominal,
        });

        const part2Date = nextBank ? nextBank.tanggal : tx.tanggal;
        const part2Iso = nextBank ? nextBank.iso : txIso;
        const part2Bulan = nextBank ? nextBank.bulan : tx.bulan;

        const part2Tx: BkuTransaction = {
          ...tx,
          id: `${tx.id}-p2`,
          tanggal: part2Date,
          tanggalObj: part2Iso,
          bulan: part2Bulan,
          uraian: cleanNaturalUraian(tx.uraian),
          noBukti: (tx.noBukti || '').replace(/-B$/, '').trim(),
          pengeluaran: part2Nominal,
          penerimaan: 0,
        };

        insertBkuChronologically(queue, part2Tx);
        continue;
      }

      if (nextBank) {
        const deferredTx: BkuTransaction = {
          ...tx,
          tanggal: nextBank.tanggal,
          tanggalObj: nextBank.iso,
          bulan: nextBank.bulan,
        };
        insertBkuChronologically(queue, deferredTx);
        continue;
      }

      cashOnHand -= expenseNominal;
      splitBkuList.push(tx);
    }

    processedBkuList = splitBkuList;
  }

  // Sort chronologically
  processedBkuList.sort((a, b) => {
    if (a.tanggalObj === b.tanggalObj) {
      if (a.jenis === 'PENERIMAAN' && b.jenis === 'PENGELUARAN') return -1;
      if (a.jenis === 'PENGELUARAN' && b.jenis === 'PENERIMAAN') return 1;
      return 0;
    }
    return a.tanggalObj.localeCompare(b.tanggalObj);
  });

  // Strict Chronological Sequential Renumbering for Material Receipts in BKU:
  // Seluruh belanja material yang terpecah maupun yang utuh diberi nomor berurutan secara otomatis
  // (01/KW-MAT/2026, 02/KW-MAT/2026, 03/KW-MAT/2026, ...) tanpa akhiran -B dan tanpa tanda khusus.
  processedBkuList = renumberMaterialTransactionsChronologically(processedBkuList, yearStr);

  // Opsi A Safeguard: Jika bobot mencapai 100% atau periode akhir, selaraskan pengeluaran belanja material terakhir
  // agar total pengeluaran BKU tepat sama dengan total penerimaan (saldo kas BKU & BKT pas Rp 0 / Nihil).
  const totalBkuPenerimaan = processedBkuList.filter((tx) => tx.jenis === 'PENERIMAAN').reduce((s, tx) => s + (tx.penerimaan || 0), 0);
  const totalBkuPengeluaran = processedBkuList.filter((tx) => tx.jenis === 'PENGELUARAN').reduce((s, tx) => s + (tx.pengeluaran || 0), 0);
  const bkuDiff = totalBkuPengeluaran - totalBkuPenerimaan;

  if (totalBkuPenerimaan > 0 && bkuDiff > 0 && (effLimit >= 14 || calculateCumulativeRealizedProgress(progressWeeks, effLimit) >= 99.9)) {
    for (let i = processedBkuList.length - 1; i >= 0; i--) {
      const tx = processedBkuList[i];
      if (tx.jenis === 'PENGELUARAN' && !tx.isLocked && !isFixedNonSplitPayment(tx) && isMaterialOnlyPurchase(tx)) {
        const deduct = Math.min(tx.pengeluaran, bkuDiff);
        processedBkuList[i] = {
          ...tx,
          pengeluaran: tx.pengeluaran - deduct,
        };
        break;
      }
    }
  }

  // Compute running balance & guarantee 100% unique React IDs
  let currentSaldo = 0;
  const seenBkuTxIds = new Set<string>();
  const finalUniqueResult: BkuTransaction[] = [];

  processedBkuList.forEach((tx) => {
    if (tx.jenis === 'PENERIMAAN') {
      currentSaldo += tx.penerimaan;
    } else {
      currentSaldo -= tx.pengeluaran;
    }

    let finalId = tx.id || `bku-tx-${Math.random()}`;
    if (seenBkuTxIds.has(finalId)) {
      finalId = `${finalId}-${seenBkuTxIds.size}`;
    }
    seenBkuTxIds.add(finalId);

    finalUniqueResult.push({
      ...tx,
      uraian: cleanNaturalUraian(tx.uraian || ''),
      noBukti: (tx.noBukti || '').replace(/-B$/, '').trim(),
      id: finalId,
      saldo: currentSaldo,
    });
  });

  return finalUniqueResult;
}

export function calculateBktFromBku(
  bkuList: BkuTransaction[],
  bkbList: BkbTransaction[] = []
): BktTransaction[] {
  const bktItems: BktTransaction[] = [];
  const hasBkbWithdrawals = bkbList.some((b) => (b.pengeluaran || 0) > 0);

  if (hasBkbWithdrawals) {
    bkbList.forEach((bkbTx, idx) => {
      if ((bkbTx.pengeluaran || 0) > 0) {
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

  bkuList.forEach((item) => {
    if (item.jenis === 'PENERIMAAN' || item.metodeBayar === 'BANK') return;
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

  bktItems.sort((a, b) => {
    const isoA = a.tanggalObj || parseTxDateToIso(a.tanggal);
    const isoB = b.tanggalObj || parseTxDateToIso(b.tanggal);
    if (isoA !== isoB) return isoA.localeCompare(isoB);
    if (a.pemasukan > 0 && b.pemasukan === 0) return -1;
    if (b.pemasukan > 0 && a.pemasukan === 0) return 1;
    return 0;
  });

  let running = 0;
  return bktItems.map((item) => {
    running = running + (item.pemasukan || 0) - (item.pengeluaran || 0);
    return {
      ...item,
      saldo: running,
    };
  });
}

export function generateTaxesFromKwitansi(
  kwitansiList: KwitansiDocument[],
  manualTaxRecords: TaxRecord[] = [],
  deletedTaxIds: string[] = []
): TaxRecord[] {
  const result: TaxRecord[] = [];
  const deletedSet = new Set(deletedTaxIds || []);
  const manualMap = new Map((manualTaxRecords || []).map((m) => [m.id, m]));

  // 1. Process from kwitansi
  kwitansiList.forEach((kw) => {
    const taxId = `tax-${kw.id}`;
    if (deletedSet.has(taxId) || deletedSet.has(kw.id)) {
      return;
    }

    // Check if user manually edited/overrode this tax record
    if (manualMap.has(taxId)) {
      result.push(manualMap.get(taxId)!);
      return;
    }

    const isKonsultan = kw.tipe === 'KONSULTAN' || kw.tipe === 'OPERASIONAL';
    const isPerabot = kw.tipe === 'PERABOT';
    const isPeralatan = false;
    const isKonstruksi = kw.tipe === 'MATERIAL' || kw.tipe === 'UPAH';

    const nominalKonstruksi = isKonstruksi ? kw.nominal : 0;
    const nominalPerabot = isPerabot ? kw.nominal : 0;
    const nominalPeralatan = isPeralatan ? kw.nominal : 0;
    const nominalKonsultanAdm = isKonsultan ? kw.nominal : 0;

    let ppn = 0;
    let pph22 = 0;
    let pph23 = 0;

    if (kw.isPpn) {
      ppn = kw.ppnAmount || Math.round((kw.nominal / 1.11) * 0.11);
    }
    if (kw.isPph22) {
      pph22 = kw.pph22Amount || Math.round((kw.nominal / 1.11) * 0.015);
    }
    if (kw.isPph23) {
      pph23 = kw.pph23Amount || Math.round(kw.nominal * 0.02);
    }

    result.push({
      id: taxId,
      noUrut: 0,
      noBukti: kw.noBukti,
      tanggal: kw.tanggal,
      bulan: kw.bulan,
      keperluan: kw.uraian.replace('Pembayaran Lunas Biaya ', 'Bayar ').replace('Pembayaran Lunas ', 'Bayar '),
      nominalKonstruksi,
      nominalPerabot,
      nominalPeralatan,
      nominalKonsultanAdm,
      ppn11: ppn,
      pph22,
      pph23,
      totalPajak: ppn + pph22 + pph23,
      kwitansiIdRef: kw.id,
      namaToko: kw.namaToko || kw.penerimaNama,
      penerimaNama: kw.penerimaNama,
      statusSetor: ppn + pph22 + pph23 > 0 ? 'LUNAS' : undefined,
    });
  });

  // 2. Add manual standalone tax records (not tied to kwitansi)
  manualTaxRecords.forEach((m) => {
    if (!deletedSet.has(m.id) && !result.some((r) => r.id === m.id)) {
      result.push(m);
    }
  });

  // 3. Sort chronologically by date
  result.sort((a, b) => {
    const isoA = parseTxDateToIso(a.tanggal) || a.tanggal || '';
    const isoB = parseTxDateToIso(b.tanggal) || b.tanggal || '';
    return isoA.localeCompare(isoB);
  });

  // 4. Assign clean sequential noUrut (1, 2, 3...)
  return result.map((t, idx) => ({
    ...t,
    noUrut: idx + 1,
  }));
}

export interface WeeklyGenerationParams {
  targetWeek: number;
  weekObj: ProjectProgressWeek;
  weeksToUse: ProjectProgressWeek[];
  school: SchoolMasterData;
  workers: WorkerItem[];
  stores: StoreVendor[];
  rpdItems: RpdItem[];
  realSchoolData?: RealSchoolData;
  existingKwitansi: KwitansiDocument[];
  existingWageReports: WeeklyWageReport[];
  existingBkb: BkbTransaction[];
  splitDays?: boolean;
}

export interface WeeklyGenerationResult {
  updatedKwitansi: KwitansiDocument[];
  updatedWageReports: WeeklyWageReport[];
  updatedBkb: BkbTransaction[];
  generatedCount: {
    bahan: number;
    upah: number;
    alat: number;
    smkk: number;
    manajemen: number;
  };
}

export function generateWeeklyTransactionsFromProgressAndRealData({
  targetWeek,
  weekObj,
  weeksToUse,
  school,
  workers = [],
  stores = [],
  rpdItems = [],
  realSchoolData,
  existingKwitansi,
  existingWageReports,
  existingBkb,
  splitDays = true,
}: WeeklyGenerationParams): WeeklyGenerationResult {
  const yearStr = school?.tahunAnggaran?.trim() || '2026';
  const weekDates = resolveWeekDates(weekObj, yearStr);
  const bulan = weekDates.bulan;
  const dateEndStr = weekDates.endDateSlash;
  const formattedDateEnd = weekDates.endDateFormatted;
  const formattedDateStart = weekDates.startDateFormatted;

  // 1. Clean previous auto-generated kwitansi for this targetWeek, but protect manual & locked kwitansis!
  const cleanExistingKwitansi = existingKwitansi.filter((k) => {
    const isManualOrLocked = isReceiptLocked(k);
    if (isManualOrLocked) return true;
    return extractWeekNumberFromKwitansi(k, weeksToUse, yearStr) !== targetWeek;
  });
  const newKwitansiList: KwitansiDocument[] = [...cleanExistingKwitansi];
  const updatedWageReports: WeeklyWageReport[] = existingWageReports.filter(
    (w) => w.mingguKe !== targetWeek
  );
  const updatedBkb: BkbTransaction[] = [...existingBkb];

  const generatedCount = {
    bahan: 0,
    upah: 0,
    alat: 0,
    smkk: 0,
    manajemen: 0,
  };

  // Solusi 1 & 2: Smart Budget Absorption & Item Linking Engine
  const manualSummary = summarizeManualKwitansiSpending(existingKwitansi, realSchoolData);

  // STRICT ZERO-PROGRESS CHECK:
  // If physical progress for this week is 0% (or no active division progress), DO NOT generate any labor/materials!
  const totalDivPrestasi = (weekObj.divisions || []).reduce((s, d) => s + (d.prestasiMingguIni || 0), 0);
  const hasRealProgress = (weekObj.bobotRealisasi && weekObj.bobotRealisasi > 0) || totalDivPrestasi > 0;

  if (!hasRealProgress) {
    return {
      updatedKwitansi: deduplicateKwitansiList(cleanExistingKwitansi),
      updatedWageReports,
      updatedBkb,
      generatedCount,
    };
  }

  // Check if SMKK or Papan Nama already exists anywhere in existing kwitansi list or manual input
  const hasExistingPapanNama = manualSummary.hasManualPapanNama || existingKwitansi.some(
    (k) => /papan nama/i.test(`${k.noBukti} ${k.uraian}`)
  );
  const hasExistingSmkk = manualSummary.hasManualSmkk || existingKwitansi.some(
    (k) => k.tipe === 'SMKK' || /smkk|k3/i.test(`${k.noBukti} ${k.uraian}`) || /kw-smkk/i.test(k.noBukti || '')
  );

  // 1. Initial Deposit in BKB (Termin 1) if not existing yet and budget > 0
  const hasTermin1Bkb = updatedBkb.some((b) => b.noBukti === 'KREDIT-T1' || b.id === 'bkb-init-termin1');
  const termin1Amount = school?.termin1Nilai || (school?.totalAnggaran ? Math.round(school.totalAnggaran * 0.7) : 0);
  if (!hasTermin1Bkb && termin1Amount > 0 && weeksToUse.length > 0) {
    const w1 = weeksToUse[0];
    const w1Dates = resolveWeekDates(w1, yearStr);
    updatedBkb.unshift({
      id: 'bkb-init-termin1',
      tanggal: w1Dates.startDateSlash,
      tanggalObj: w1Dates.startDate,
      bulan: w1Dates.bulan,
      uraian: 'Penerimaan Dana Revitalisasi Termin 1 (70%) ke Rekening Bank',
      noBukti: 'KREDIT-T1',
      penerimaan: termin1Amount,
      pengeluaran: 0,
    });
  }

  // Find active divisions for this week
  const activeDivisions = (weekObj.divisions || []).filter((d) => (d.prestasiMingguIni || 0) > 0);

  // Prepare fallback store
  const defaultMaterialStore = stores.find((s) => s.kategori === 'MATERIAL') || stores[0] || {
    id: 's-def-mat',
    namaToko: 'Penyedia Bahan Material',
    pemilikNama: 'Penyedia Toko Rekanan',
    pekerjaan: 'Penyedia Bahan Bangunan',
    alamat: school.kabKota || 'Kota/Kabupaten Setempat',
    telepon: '-',
    kategori: 'MATERIAL',
  };

  const defaultPerabotStore = stores.find((s) => s.kategori === 'PERABOT') || defaultMaterialStore;

  const defaultPercetakanStore = stores.find(
    (s) => s.kategori === 'PERCETAKAN' || /percetakan|printing|dexa|cetak/i.test(`${s.namaToko} ${s.pekerjaan || ''}`)
  ) || defaultMaterialStore;

  const defaultPengelolaSpjStore = stores.find(
    (s) => s.kategori === 'PENGELOLA_SPJ' || /pengelola.*spj|pengelola spj/i.test(`${s.namaToko} ${s.pekerjaan || ''}`)
  );

  let totalWageAmountForWeek = 0;
  let activeDivisionDescriptions: string[] = [];
  const weeklyAhspUpahComponents: { namaBarang: string; volume: number; satuan: string; hargaSatuan: number; jumlah: number }[] = [];
  const weeklyAllBahanItems: {
    namaBarang: string;
    volume: number;
    satuan: string;
    hargaSatuan: number;
    jumlah: number;
    isPerabot?: boolean;
    divisionName?: string;
    tags?: string[];
    kategoriBiaya?: string;
  }[] = [];
  const weeklyAllAlatItems: {
    namaBarang: string;
    volume: number;
    satuan: string;
    hargaSatuan: number;
    jumlah: number;
    divisionName?: string;
  }[] = [];

  // PRIORITY RULE FOR WEEK 1:
  // "ketika laporan mingguan & bobot di input di minggu pertama bagian persiapan itu akan memprioritaskan AHSP Pasang papan nama proyek dan pembelian SMKK karna itu harus terlebih dahulu dilaksanakan sebelum kegiatan lain."
  let week1PapanNamaGenerated = false;
  let week1SmkkGenerated = false;

  const isWeek1OrHasPersiapan = targetWeek === 1 && !hasExistingSmkk && !hasExistingPapanNama && (
    activeDivisions.some((d) => d.kode.toUpperCase() === 'I' || /persiapan/i.test(d.uraian)) ||
    activeDivisions.length > 0
  );

  if (isWeek1OrHasPersiapan) {
    // 1. Prioritize Cetak Papan Nama Proyek (Code: CTK/01/xx, Exact RAB Nominal)
    const papanRabItem = realSchoolData?.divisions?.flatMap((d) => d.items).find((i) => /papan nama/i.test(i.uraian));
    const papanNominal = papanRabItem ? Math.round(papanRabItem.volume * papanRabItem.hargaSatuan) : 1099800;

    const kwPapanBukti = `CTK/01/${yearStr}`;
    const spbPapanBukti = `SPB-CTK/01/${yearStr}`;
    const isTaxablePapan = papanNominal >= 2000000;

    const papanItems = [
      {
        namaBarang: `Pembuatan & Cetak Papan Nama Proyek Revitalisasi ${school?.namaSekolah || 'Sekolah'} (Bahan MMT / Akrilik & Frame Kayu Complete)`,
        volume: 1,
        satuan: 'unit',
        hargaSatuan: papanNominal,
        jumlah: papanNominal,
      },
    ];

    const kwPapanDoc: KwitansiDocument = {
      id: `kw-ctk-m1-papan-${Date.now()}`,
      noBukti: kwPapanBukti,
      noSpb: spbPapanBukti,
      tipe: 'OPERASIONAL',
      tanggal: weekDates.startDateSlash, // Senin / Hari pertama minggu ke-1
      tanggalFormatted: weekDates.startDateFormatted,
      bulan: weekDates.bulan,
      uraian: `Pembayaran Lunas Biaya Pembuatan & Cetak Papan Nama Proyek Revitalisasi ${school.namaSekolah}, Tahun ${yearStr}, Rincian Terlampir.`,
      penerimaNama: defaultPercetakanStore.pemilikNama || 'Pemilik Percetakan',
      penerimaPekerjaan: `Pemilik ${defaultPercetakanStore.namaToko}`,
      penerimaAlamat: defaultPercetakanStore.alamat || school.kabKota,
      namaToko: defaultPercetakanStore.namaToko,
      items: papanItems,
      nominal: papanNominal,
      isPpn: isTaxablePapan,
      isPph22: isTaxablePapan,
      isPph23: false,
      ppnAmount: isTaxablePapan ? Math.round((papanNominal / 1.11) * 0.11) : 0,
      pph22Amount: isTaxablePapan ? Math.round((papanNominal / 1.11) * 0.015) : 0,
      pph23Amount: 0,
      kategoriBiayaPajak: 'Perencanaan_Pengelolaan',
      keteranganSpb: `Surat Perintah Bayar Biaya Cetak Papan Nama Proyek (${weekDates.startDateFormatted})`,
      mingguKeRef: 1,
    };

    const existIdx = newKwitansiList.findIndex((k) => k.noBukti === kwPapanBukti || /papan nama/i.test(k.uraian));
    if (existIdx >= 0) {
      newKwitansiList[existIdx] = kwPapanDoc;
    } else {
      newKwitansiList.push(kwPapanDoc);
    }
    generatedCount.manajemen++;
    week1PapanNamaGenerated = true;

    // 2. Prioritize Pengadaan Perlengkapan SMKK & K3 Lapangan (Dibuatkan di Hari ke-1 Proyek)
    const realDivI = realSchoolData?.divisions?.find((d) => d.kode.toUpperCase() === 'I' || /persiapan/i.test(d.uraian));
    const smkkRabs = (realDivI?.items || []).filter(
      (it) => it.kategoriBiaya === 'SMKK' || /smkk|k3|helm|rompi|sepatu boot|sepatu safety|p3k|rambu/i.test(it.uraian)
    );

    const smkkRawItems = smkkRabs.length > 0 ? smkkRabs.map((it) => ({
      namaBarang: it.uraian,
      volume: it.volume,
      satuan: it.satuan,
      hargaSatuan: it.hargaSatuan,
      jumlah: Math.round(it.volume * it.hargaSatuan),
    })) : [
      { namaBarang: 'Penerapan SMKK - Helm kepala', volume: 10, satuan: 'buah', hargaSatuan: 83431, jumlah: 834310 },
      { namaBarang: 'Penerapan SMKK - Rompi', volume: 10, satuan: 'buah', hargaSatuan: 88852, jumlah: 888520 },
      { namaBarang: 'Penerapan SMKK - Sepatu boot', volume: 10, satuan: 'buah', hargaSatuan: 134195, jumlah: 1341950 },
      { namaBarang: 'Penerapan SMKK - Sarung tangan', volume: 10, satuan: 'buah', hargaSatuan: 59763, jumlah: 597630 },
      { namaBarang: 'Penerapan SMKK - Peralatan P3K', volume: 1, satuan: 'set', hargaSatuan: 2500000, jumlah: 2500000 },
      { namaBarang: 'Penerapan SMKK - Rambu-Rambu dan Pengendalian Resiko K3', volume: 1, satuan: 'set', hargaSatuan: 912302, jumlah: 912302 },
      { namaBarang: 'Penerapan SMKK - Tali keselamatan', volume: 1, satuan: 'roll', hargaSatuan: 550206, jumlah: 550206 },
    ];

    const smkkNominal = smkkRawItems.reduce((s, it) => s + it.jumlah, 0);
    const kwSmkkBukti = `01/KW-SMKK/${yearStr}`;
    const spbSmkkBukti = `SPB-01/SMKK/${yearStr}`;
    const isTaxableSmkk = smkkNominal >= 2000000;

    const kwSmkkDoc: KwitansiDocument = {
      id: `kw-smkk-m1-${Date.now()}`,
      noBukti: kwSmkkBukti,
      noSpb: spbSmkkBukti,
      tipe: 'OPERASIONAL',
      tanggal: weekDates.startDateSlash, // Senin / Hari pertama minggu ke-1
      tanggalFormatted: weekDates.startDateFormatted,
      bulan: weekDates.bulan,
      uraian: `Pembayaran Lunas Pengadaan Perlengkapan SMKK & K3 Lapangan (${smkkRawItems.map((i) => i.namaBarang.replace('Penerapan SMKK - ', '')).slice(0, 4).join(', ')}), Revitalisasi ${school.namaSekolah}, Tahun ${yearStr}, Rincian Terlampir.`,
      penerimaNama: defaultMaterialStore.pemilikNama || 'Penyedia SMKK',
      penerimaPekerjaan: `Penyedia APD & Keselamatan Kerja`,
      penerimaAlamat: defaultMaterialStore.alamat || school.kabKota,
      namaToko: defaultMaterialStore.namaToko,
      items: smkkRawItems,
      nominal: smkkNominal,
      isPpn: isTaxableSmkk,
      isPph22: isTaxableSmkk,
      isPph23: false,
      ppnAmount: isTaxableSmkk ? Math.round((smkkNominal / 1.11) * 0.11) : 0,
      pph22Amount: isTaxableSmkk ? Math.round((smkkNominal / 1.11) * 0.015) : 0,
      pph23Amount: 0,
      kategoriBiayaPajak: 'Peralatan',
      keteranganSpb: `Surat Perintah Bayar Pengadaan SMKK & K3 Minggu Ke-1 (${weekDates.startDateFormatted})`,
      mingguKeRef: 1,
    };

    const existSmkkIdx = newKwitansiList.findIndex((k) => k.noBukti === kwSmkkBukti);
    if (existSmkkIdx >= 0) {
      newKwitansiList[existSmkkIdx] = kwSmkkDoc;
    } else {
      newKwitansiList.push(kwSmkkDoc);
    }
    generatedCount.smkk++;
    week1SmkkGenerated = true;
  }

  // Iterate each active division
  activeDivisions.forEach((div, dIdx) => {
    activeDivisionDescriptions.push(div.uraian);
    const progressRatio = div.bobotTotal > 0 ? Math.min(1, Math.max(0, div.prestasiMingguIni / div.bobotTotal)) : 0;
    if (progressRatio <= 0) return;
    const divCode = div.kode.toUpperCase();

    // Find real division in RealSchoolData or AHSP list
    const isMeubilairDiv = /mebel|meubilair|meubeler|perabot|XII/i.test(`${div.kode} ${div.uraian}`);
    const realDiv = realSchoolData?.divisions?.find((rd: RabDivision) => {
      const rdCode = rd.kode.toUpperCase();
      if (rdCode === divCode) return true;
      const rdUraian = rd.uraian.toLowerCase();
      const dUraian = div.uraian.toLowerCase();
      if (rdUraian.includes(dUraian) || dUraian.includes(rdUraian)) return true;
      if (isMeubilairDiv && /mebel|meubilair|meubeler|perabot|XII/i.test(`${rd.kode} ${rd.uraian}`)) return true;
      return false;
    });

    // Group items strictly derived from RAB & validated AHSP breakdowns
    const bahanItems: { namaBarang: string; volume: number; satuan: string; hargaSatuan: number; jumlah: number; isBarangPabrikasi?: boolean }[] = [];
    const alatItems: { namaBarang: string; volume: number; satuan: string; hargaSatuan: number; jumlah: number }[] = [];
    let divUpahTotal = 0;

    if (realDiv && realDiv.items && realDiv.items.length > 0) {
      realDiv.items.forEach((it: RabSubItem) => {
        // ATURAN STRICT: Papan Nama Proyek & SMKK HANYA dibuat 1 kali diawal (Minggu 1) dan TIDAK BOLEH dipecah ke minggu lainnya
        const isPapanNamaItem = /papan nama/i.test(it.uraian);
        const isSmkkItem = it.kategoriBiaya === 'SMKK' || /smkk|k3|helm|rompi|sepatu boot|sepatu safety|p3k|rambu|tali keselamatan/i.test(it.uraian);
        if (isPapanNamaItem || isSmkkItem) {
          return;
        }

        // Solusi 2: Skip jika item RAB secara eksplisit ditandai "SUDAH_DIBELANJAKAN_MANDIRI"
        if (it.statusBelanja === 'SUDAH_DIBELANJAKAN_MANDIRI' || manualSummary.fullyAbsorbedRabIds.has(it.id)) {
          return;
        }

        // Solusi 1: Sistem Pengurang Kuota RAB Otomatis (Smart Budget Absorption)
        const normKey = getCanonicalMaterialKey(it.uraian);
        const manualSpent = Math.max(
          manualSummary.spentByRabId.get(it.id) || 0,
          manualSummary.spentByCanonicalName.get(normKey) || 0
        );
        const remainingRabVol = Math.max(0, it.volume - manualSpent);
        if (remainingRabVol <= 0) {
          return; // 100% kuota terserap oleh kwitansi manual
        }

        const isFullAbsorption = progressRatio >= 0.95;
        let execRabVol = isFullAbsorption
          ? remainingRabVol
          : Math.round(remainingRabVol * progressRatio * 1000) / 1000;

        if (execRabVol <= 0 && progressRatio > 0 && (it.isBarangPabrikasi || (it.tags && it.tags.some((t) => /siplah|fur/i.test(t))) || isMeubilairDiv)) {
          execRabVol = Math.max(1, Math.min(remainingRabVol, 1));
        }
        if (execRabVol <= 0) return;
        const execRabJml = Math.round(execRabVol * it.hargaSatuan);
        if (execRabJml <= 0) return;

        // BUDGET ABSORPTION & REALLOCATION ENGINE:
        // Jika item ini diset "DIALIHKAN" (tidak boleh dibelanjakan langsung, misal larangan belanja air kerja/listrik),
        // anggarannya otomatis dialihkan dan diserap 100% ke belanja bahan konstruksi atau upah fisik utama.
        if (it.statusBelanja === 'DIALIHKAN') {
          if (it.targetReallokasi === 'UPAH') {
            divUpahTotal += execRabJml;
            const reallocatedUpah = decomposeRealisticBahanAndUpah(div.uraian || it.uraian, 0, execRabJml);
            if (reallocatedUpah.upahComponents.length > 0) {
              weeklyAhspUpahComponents.push(...reallocatedUpah.upahComponents);
            }
          } else {
            // Default: Diserap proporsional ke belanja bahan fisik toko (semen, pasir, bata, cat, besi)
            const reallocatedBahan = decomposeRealisticBahanAndUpah(div.uraian || it.uraian, execRabJml, 0);
            bahanItems.push(...reallocatedBahan.bahanItems);
          }
          return;
        }

        // Search for matching AHSP breakdown for this RAB item (Prioritize explicit ahspIdRef)
        const ahspMatch = (realSchoolData?.ahspList || []).find((ah) => {
          if (it.ahspIdRef && ah.id === it.ahspIdRef) return true;
          const lowerAh = (ah.namaPekerjaan || '').toLowerCase().trim();
          const lowerRab = it.uraian.toLowerCase().trim();
          if (lowerAh === lowerRab || lowerAh.includes(lowerRab) || lowerRab.includes(lowerAh)) return true;

          // Special smart alias mappings for standard construction trades:
          if (/bowplank|bouwplank|pengukuran|utzet/i.test(lowerRab) && /bowplank|bouwplank|pengukuran|utzet/i.test(lowerAh)) return true;
          if (/papan nama/i.test(lowerRab) && /papan nama/i.test(lowerAh)) return true;
          if (/air kerja|listrik/i.test(lowerRab) && /air kerja|listrik/i.test(lowerAh)) return true;
          if (/galian/i.test(lowerRab) && /galian/i.test(lowerAh)) return true;
          if (/urugan pasir/i.test(lowerRab) && /urugan pasir/i.test(lowerAh)) return true;
          if (/pondasi|batu kali/i.test(lowerRab) && /pondasi|batu kali/i.test(lowerAh)) return true;
          if (/beton/i.test(lowerRab) && /beton/i.test(lowerAh)) return true;
          if (/bata/i.test(lowerRab) && /bata/i.test(lowerAh)) return true;
          if (/plesteran/i.test(lowerRab) && /plesteran/i.test(lowerAh)) return true;
          if (/keramik/i.test(lowerRab) && /keramik/i.test(lowerAh)) return true;
          if (/plafon|gypsum/i.test(lowerRab) && /plafon|gypsum|langit/i.test(lowerAh)) return true;
          if (/atap|spandek|baja ringan/i.test(lowerRab) && /atap|spandek|baja ringan/i.test(lowerAh)) return true;
          if (/cat|pengecatan/i.test(lowerRab) && /cat|pengecatan/i.test(lowerAh)) return true;
          if (/pintu|jendela|kusen/i.test(lowerRab) && /pintu|jendela|kusen/i.test(lowerAh)) return true;
          if (/listrik|lampu/i.test(lowerRab) && /listrik|lampu/i.test(lowerAh)) return true;
          if (/sanitasi|kloset|pipa/i.test(lowerRab) && /sanitasi|kloset|pipa/i.test(lowerAh)) return true;

          const keywords = lowerRab
            .replace(/[^a-zA-Z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter((w) => w.length > 3 && !/pekerjaan|pasang|pemasangan|pengadaan/i.test(w));
          return keywords.length > 0 && keywords.some((kw) => lowerAh.includes(kw));
        });

        const isPreserved =
          (it.tags && it.tags.some((t) => t.toUpperCase() === 'FUR')) ||
          it.isBarangPabrikasi ||
          isPreservedUnitItem(it.uraian, it.satuan, it.isBarangPabrikasi);
        if (isPreserved) {
          // UNIT PRESERVATION ENGINE:
          // Keep intact as a single complete unit matching RAB/AHSP instead of breaking into retail aluminium m', kaca m2, sekrup, dll.
          let unitBahanPrice = it.hargaSatuan;
          if (!unitBahanPrice || unitBahanPrice <= 0) {
            if (ahspMatch && ahspMatch.komponen && ahspMatch.komponen.length > 0) {
              const compBahanList = ahspMatch.komponen.filter(
                (c) => c.kategori !== 'UPAH' && !/tukang|pekerja|mandor/i.test(c.uraian) && c.kategori !== 'ALAT' && !/molen|sewa|scaffolding/i.test(c.uraian)
              );
              const totalBahanInAhsp = compBahanList.reduce(
                (s, c) => s + ((c.hargaSatuan || 0) * (c.koefisien || 1)),
                0
              );
              if (totalBahanInAhsp > 0) {
                unitBahanPrice = totalBahanInAhsp;
              }
            }
          }

          // Allocate any labor upah components to weekly wages:
          if (ahspMatch && ahspMatch.komponen && ahspMatch.komponen.length > 0) {
            const compUpahList = ahspMatch.komponen.filter((c) => c.kategori === 'UPAH' || /tukang|pekerja|mandor/i.test(c.uraian));
            compUpahList.forEach((cu) => {
              const uVol = Math.round((cu.koefisien || 1) * execRabVol * 1000) / 1000;
              const uJml = Math.round(uVol * (cu.hargaSatuan || 174748));
              if (uJml > 0) {
                divUpahTotal += uJml;
                weeklyAhspUpahComponents.push({
                  namaBarang: cu.uraian,
                  volume: uVol,
                  satuan: cu.satuan || 'Hr',
                  hargaSatuan: cu.hargaSatuan || 174748,
                  jumlah: uJml,
                });
              }
            });
          }

          const bahanJml = Math.round(execRabVol * unitBahanPrice);
          if (bahanJml > 0) {
            bahanItems.push({
              namaBarang: it.uraian,
              volume: execRabVol,
              satuan: it.satuan || 'unit',
              hargaSatuan: unitBahanPrice,
              jumlah: bahanJml,
              isBarangPabrikasi: true,
              tags: it.tags,
              kategoriBiaya: it.kategoriBiaya,
            } as any);
          }
        } else if (ahspMatch && ahspMatch.komponen && ahspMatch.komponen.length > 0) {
          ahspMatch.komponen.forEach((comp) => {
            const compVol = Math.round((comp.koefisien || 1) * execRabVol * 1000) / 1000;
            if (compVol <= 0) return;
            const compJml = Math.round(compVol * (comp.hargaSatuan || 10000));
            if (compJml <= 0) return;
            const isUpah = comp.kategori === 'UPAH' || /tukang|pekerja|mandor/i.test(comp.uraian);
            const isAlat = comp.kategori === 'ALAT' || /molen|sewa|scaffolding|perancah|gerobak|pompa|genset|generator/i.test(comp.uraian);

            // If user explicitly specified single category, honor it:
            if (it.kategoriBiaya === 'BAHAN' && (isUpah || isAlat)) return;
            if (it.kategoriBiaya === 'UPAH' && !isUpah) return;
            if (it.kategoriBiaya === 'ALAT' && !isAlat) return;

            if (isUpah) {
              divUpahTotal += compJml;
              weeklyAhspUpahComponents.push({
                namaBarang: comp.uraian,
                volume: compVol,
                satuan: comp.satuan || 'Hr',
                hargaSatuan: comp.hargaSatuan || 174748,
                jumlah: compJml,
              });
            } else if (isAlat) {
              alatItems.push({
                namaBarang: comp.uraian,
                volume: compVol,
                satuan: comp.satuan || 'set',
                hargaSatuan: comp.hargaSatuan || 50000,
                jumlah: compJml,
              });
            } else {
              bahanItems.push({
                namaBarang: comp.uraian,
                volume: compVol,
                satuan: comp.satuan || 'unit',
                hargaSatuan: comp.hargaSatuan || 50000,
                jumlah: compJml,
              });
            }
          });
        } else {
          // Direct RAB SubItem (No AHSP match or direct decomposition)
          const isUpahBahan =
            it.kategoriBiaya === 'UPAH_BAHAN' ||
            (it.kategoriBiaya as string) === 'UPAH&BAHAN' ||
            /upah.*bahan|bahan.*upah/i.test(it.kategoriBiaya || '');

          const cat = isUpahBahan
            ? 'UPAH_BAHAN'
            : it.kategoriBiaya || (
                /upah|gaji|pekerja|tukang|mandor/i.test(it.uraian) ? 'UPAH' :
                /alat|sewa|molen|scaffolding|perancah|gerobak/i.test(it.uraian) ? 'ALAT' :
                /smkk|k3|helm|rompi|sepatu|p3k|rambu|papan nama/i.test(it.uraian) ? 'SMKK' :
                'BAHAN'
              );

          if (cat === 'UPAH_BAHAN') {
            const bahanNominal = Math.round(execRabJml * 0.65);
            const upahNominal = execRabJml - bahanNominal;

            const decomposed = decomposeRealisticBahanAndUpah(it.uraian, bahanNominal, upahNominal);
            bahanItems.push(...decomposed.bahanItems);

            divUpahTotal += upahNominal;
            weeklyAhspUpahComponents.push(...decomposed.upahComponents);
          } else if (cat === 'UPAH') {
            divUpahTotal += execRabJml;
            const decomposedUpah = decomposeRealisticBahanAndUpah(it.uraian, 0, execRabJml);
            if (decomposedUpah.upahComponents.length > 0) {
              weeklyAhspUpahComponents.push(...decomposedUpah.upahComponents);
            } else {
              weeklyAhspUpahComponents.push({
                namaBarang: it.uraian,
                volume: execRabVol,
                satuan: it.satuan,
                hargaSatuan: it.hargaSatuan,
                jumlah: execRabJml,
              });
            }
          } else if (cat === 'ALAT') {
            alatItems.push({
              namaBarang: it.uraian,
              volume: execRabVol,
              satuan: it.satuan,
              hargaSatuan: it.hargaSatuan,
              jumlah: execRabJml,
            });
          } else if (cat === 'SMKK' || cat === 'LAINNYA') {
            // Handled at project initiation
          } else {
            const isCompositeJob = !isPureDirectMaterial(it.uraian);
            if (isCompositeJob && execRabJml >= 25000) {
              const decomposedBahan = decomposeRealisticBahanAndUpah(it.uraian, execRabJml, 0);
              bahanItems.push(...decomposedBahan.bahanItems);
            } else {
              bahanItems.push({
                namaBarang: it.uraian,
                volume: execRabVol,
                satuan: it.satuan,
                hargaSatuan: it.hargaSatuan,
                jumlah: execRabJml,
              });
            }
          }
        }
      });

      totalWageAmountForWeek += divUpahTotal;

      // Accumulate materials & tools into weekly totals for unified consolidation
      const isPerabot = div.kode === 'XII' || /perabot|mebeler|meja|kursi/i.test(div.uraian);
      bahanItems.forEach((bi) => {
        weeklyAllBahanItems.push({
          ...bi,
          isPerabot,
          divisionName: div.uraian,
        });
      });
      alatItems.forEach((ai) => {
        weeklyAllAlatItems.push({
          ...ai,
          divisionName: div.uraian,
        });
      });
    } else {
      // Fallback: Use RPD items if RealSchoolData division not available
      const matchedRpd = rpdItems.filter(
        (it) =>
          !/papan nama|smkk|k3|helm|rompi/i.test(it.uraian) &&
          (it.uraian.toLowerCase().includes(div.uraian.toLowerCase()) ||
          div.uraian.toLowerCase().includes(it.uraian.toLowerCase()) ||
          it.kategori === 'BAHAN_BARU' ||
          it.kategori === 'BAHAN_REHAB')
      );

      const rpdCandidates = matchedRpd.slice(0, 3);
      if (rpdCandidates.length > 0) {
        const rawTokoItems = rpdCandidates.map((it) => {
          const volProp = Math.max(0.1, Math.round(progressRatio * it.volume100 * 100) / 100);
          return {
            namaBarang: it.uraian,
            volume: volProp,
            satuan: it.satuan,
            hargaSatuan: it.hargaSatuan,
            jumlah: Math.round(volProp * it.hargaSatuan),
          };
        });

        const isPerabot = div.kode === 'XII' || /perabot|mebeler|meja|kursi/i.test(div.uraian);
        rawTokoItems.forEach((ti) => {
          weeklyAllBahanItems.push({
            ...ti,
            isPerabot,
            divisionName: div.uraian,
          });
        });
      }
    }

    // 5. Handle MANAJEMEN / KONSULTAN divisions
    // Honorarium Perencana, Pengawas & Pengelola SPJ dialihkan ke pembayaran bulanan (setiap akhir bulan & akhir proyek)
    if (div.kategori === 'MANAJEMEN' || /perencana|pengawas|administrasi/i.test(div.uraian)) {
      // Management receipts are now generated exclusively on a monthly basis via generateMonthlyManagementTransactions
      return;
    }
  });

  // 5b. CONSOLIDATED WEEKLY MATERIAL, SIPLAH, CETAK, PINTU/JENDELA & PERABOT INVOICES
  const isSiplahItem = (i: typeof weeklyAllBahanItems[0]) =>
    (i.tags && i.tags.some((t) => /siplah/i.test(t))) ||
    (i as any).kategoriBiaya === 'SIPLAH' ||
    /siplah/i.test(i.namaBarang);

  const isCetakItem = (i: typeof weeklyAllBahanItems[0]) =>
    (i.tags && i.tags.some((t) => /ctk|cetak/i.test(t))) ||
    (i as any).kategoriBiaya === 'CETAK' ||
    /papan nama|prasasti|banner/i.test(i.namaBarang);

  const isPintuJendelaItem = (i: typeof weeklyAllBahanItems[0]) =>
    (i.tags && i.tags.some((t) => /fur/i.test(t))) ||
    (i as any).kategoriBiaya === 'PINTU_JENDELA' ||
    /pintu|jendela|alumunium|aluminium/i.test(i.namaBarang) ||
    /kayu.*kaca.*besi|pintu.*jendela|kusen/i.test(i.divisionName || '');

  const siplahMaterials = weeklyAllBahanItems.filter(isSiplahItem);
  const cetakMaterials = weeklyAllBahanItems.filter((i) => !isSiplahItem(i) && isCetakItem(i));
  const pintuJendelaMaterials = weeklyAllBahanItems.filter((i) => !isSiplahItem(i) && !isCetakItem(i) && isPintuJendelaItem(i));
  const perabotMaterials = weeklyAllBahanItems.filter((i) => !isSiplahItem(i) && !isCetakItem(i) && !isPintuJendelaItem(i) && i.isPerabot);
  const generalMaterials = weeklyAllBahanItems.filter((i) => !isSiplahItem(i) && !isCetakItem(i) && !isPintuJendelaItem(i) && !i.isPerabot);

  // Mitra SipLah Complete Goods Receipt (Code: SipLah/xx/xx)
  if (siplahMaterials.length > 0) {
    const defaultSiplahStore = stores.find(
      (s) => s.kategori === 'SIPLAH' || /siplah/i.test(`${s.namaToko} ${s.pekerjaan || ''}`)
    ) || {
      id: 's-def-siplah',
      namaToko: 'Toko Mitra SipLah Online',
      pemilikNama: 'Mitra Penyedia SipLah',
      pekerjaan: 'Penyedia Barang/Jasa Mitra SipLah',
      alamat: 'Platform Mitra SipLah / ' + (school.kabKota || 'Kota/Kabupaten Setempat'),
      telepon: '0812-9900-1122',
      npwp: '01.234.567.8-901.000',
      kategori: 'SIPLAH' as const,
    };

    const storeGroups = new Map<string, { store: ReturnType<typeof resolveStoreFromItemTags>; items: any[] }>();
    for (const item of siplahMaterials) {
      const store = resolveStoreFromItemTags(item, stores, defaultSiplahStore, school.kabKota);
      const key = store.namaToko;
      if (!storeGroups.has(key)) {
        storeGroups.set(key, { store, items: [] });
      }
      storeGroups.get(key)!.items.push(item);
    }

    let storeIdx = 0;
    for (const [storeName, group] of storeGroups.entries()) {
      const normalizedSiplah = consolidateAndStandardizeReceiptItems(group.items);
      const totalSiplahNominal = normalizedSiplah.reduce((s, it) => s + it.jumlah, 0);

      if (totalSiplahNominal > 0) {
        // Pembelian/Pemesanan material SipLah dilakukan di awal minggu (Selasa)
        const dateInfo = getDateInWeek(weekDates.startDate, 1);
        const padW = String(targetWeek).padStart(2, '0');
        const seqSuffix = storeGroups.size > 1 ? `-${storeIdx + 1}` : '';
        const kwBukti = `SipLah/${padW}${seqSuffix}/${yearStr}`;
        const spbBukti = `SPB-SipLah/${padW}${seqSuffix}/${yearStr}`;
        const isTaxable = totalSiplahNominal >= 2000000;

        const siplahDoc: KwitansiDocument = {
          id: `kw-siplah-m${targetWeek}-${storeIdx}-${Date.now()}`,
          noBukti: kwBukti,
          noSpb: spbBukti,
          tipe: 'OPERASIONAL',
          tanggal: dateInfo.dateSlash,
          tanggalFormatted: dateInfo.dateFormatted,
          bulan: dateInfo.bulan,
          uraian: `Pembayaran Lunas Belanja Barang via ${group.store.namaToko} Awal Minggu Ke-${targetWeek} (${normalizedSiplah.map((i) => i.namaBarang).slice(0, 3).join(', ')}), Mengacu Bobot Fisik Bangunan Revitalisasi ${school.namaSekolah}, Tahun ${yearStr}.`,
          penerimaNama: group.store.pemilikNama || 'Mitra SipLah',
          penerimaPekerjaan: `Mitra Penyedia ${group.store.namaToko}`,
          penerimaAlamat: group.store.alamat || school.kabKota,
          namaToko: group.store.namaToko,
          items: normalizedSiplah,
          nominal: totalSiplahNominal,
          isPpn: isTaxable,
          isPph22: isTaxable,
          isPph23: false,
          ppnAmount: isTaxable ? Math.round((totalSiplahNominal / 1.11) * 0.11 * 100) / 100 : 0,
          pph22Amount: isTaxable ? Math.round((totalSiplahNominal / 1.11) * 0.015 * 100) / 100 : 0,
          pph23Amount: 0,
          kategoriBiayaPajak: 'Siplah',
          keteranganSpb: `Surat Perintah Bayar Belanja ${group.store.namaToko} Awal Minggu Ke-${targetWeek} (${dateInfo.dateFormatted})`,
          mingguKeRef: targetWeek,
        };

        const existingIdx = newKwitansiList.findIndex((k) => k.noBukti === kwBukti);
        if (existingIdx >= 0) {
          newKwitansiList[existingIdx] = siplahDoc;
        } else {
          newKwitansiList.push(siplahDoc);
        }
        generatedCount.bahan++;
        storeIdx++;
      }
    }
  }

  // Pintu & Jendela Aluminium Complete Units Receipt (Code: Fur/xx/xx) - Awal Minggu (Selasa)
  if (pintuJendelaMaterials.length > 0) {
    const normalizedPJ = consolidateAndStandardizeReceiptItems(pintuJendelaMaterials);
    const totalPJNominal = normalizedPJ.reduce((s, it) => s + it.jumlah, 0);

    if (totalPJNominal > 0) {
      const pjDateInfo = getDateInWeek(weekDates.startDate, 1); // Selasa (Awal Pekan)
      const padW = String(targetWeek).padStart(2, '0');
      const kwPJBukti = `Fur/${padW}/${yearStr}`;
      const spbPJBukti = `SPB-Fur/${padW}/${yearStr}`;
      const isTaxable = totalPJNominal >= 2000000;
      const ppn = isTaxable ? Math.round((totalPJNominal / 1.11) * 0.11 * 100) / 100 : 0;
      const pph22 = isTaxable ? Math.round((totalPJNominal / 1.11) * 0.015 * 100) / 100 : 0;

      const defaultPJStore = stores.find(
        (s) => s.kategori === 'PINTU_JENDELA_ALUMINIUM' || /alumunium|aluminium|pintu|jendela/i.test(`${s.namaToko} ${s.pekerjaan || ''}`)
      ) || {
        id: 's-def-alum',
        namaToko: 'CV. ALUMATAMA JAYA',
        pemilikNama: 'Ir. Bambang Sugiarto',
        pekerjaan: 'Spesialis Pintu & Jendela Aluminium',
        alamat: 'Jl. Industri Aluminium No. 12, ' + (school.kabKota || 'Kota/Kabupaten Setempat'),
        telepon: '0812-7788-3344',
        npwp: '02.456.789.1-123.000',
        kategori: 'PINTU_JENDELA_ALUMINIUM' as const,
      };

      const pjDoc: KwitansiDocument = {
        id: `kw-fur-m${targetWeek}-${Date.now()}`,
        noBukti: kwPJBukti,
        noSpb: spbPJBukti,
        tipe: 'PINTU_JENDELA',
        tanggal: pjDateInfo.dateSlash,
        tanggalFormatted: pjDateInfo.dateFormatted,
        bulan: pjDateInfo.bulan,
        uraian: `Pembayaran Lunas Pengadaan & Pemasangan Pintu dan Jendela Aluminium Complete Awal Minggu Ke-${targetWeek} (${normalizedPJ.map((i) => i.namaBarang).slice(0, 3).join(', ')}), Mengacu Bobot Fisik Bangunan Revitalisasi ${school.namaSekolah}, Tahun ${yearStr}.`,
        penerimaNama: defaultPJStore.pemilikNama || 'Ir. Bambang Sugiarto',
        penerimaPekerjaan: `Pemilik ${defaultPJStore.namaToko}`,
        penerimaAlamat: defaultPJStore.alamat || school.kabKota,
        namaToko: defaultPJStore.namaToko,
        items: normalizedPJ,
        nominal: totalPJNominal,
        isPpn: isTaxable,
        isPph22: isTaxable,
        isPph23: false,
        ppnAmount: ppn,
        pph22Amount: pph22,
        pph23Amount: 0,
        kategoriBiayaPajak: 'Konstruksi',
        keteranganSpb: `Surat Perintah Bayar Pengadaan Pintu & Jendela Aluminium Awal Minggu Ke-${targetWeek} (${pjDateInfo.dateFormatted})`,
        mingguKeRef: targetWeek,
      };

      const existingPJIdx = newKwitansiList.findIndex((k) => k.noBukti === kwPJBukti);
      if (existingPJIdx >= 0) {
        newKwitansiList[existingPJIdx] = pjDoc;
      } else {
        newKwitansiList.push(pjDoc);
      }
      generatedCount.bahan++;
    }
  }

  if (generalMaterials.length > 0) {
    const normalizedMatItems = normalizeMaterialItems(generalMaterials);
    const totalMatNominal = normalizedMatItems.reduce((s, it) => s + it.jumlah, 0);

    if (totalMatNominal > 0) {
      // METODE PEMBELIAN BAHAN MATERIAL AWAL HARI SETIAP MINGGUNYA:
      // Material dibelanjakan di hari awal setiap minggu (Senin & Selasa)
      // agar bahan tersedia di lokasi saat para tukang bekerja sepanjang minggu berjalan.
      const shouldSplit = splitDays && normalizedMatItems.length > 3 && totalMatNominal >= 12000000;
      const chunks = shouldSplit
        ? [
            normalizedMatItems.slice(0, Math.ceil(normalizedMatItems.length / 2)),
            normalizedMatItems.slice(Math.ceil(normalizedMatItems.length / 2)),
          ]
        : [normalizedMatItems];

      chunks.forEach((chunkItems, cIdx) => {
        const chunkNominal = chunkItems.reduce((s, it) => s + it.jumlah, 0);
        if (chunkNominal <= 0) return;

        // Hari Awal Minggu: Senin (offset 0) atau Selasa (offset 1 jika split delivery)
        const dayOffset = shouldSplit ? (cIdx === 0 ? 0 : 1) : 0;
        const matDateInfo = getDateInWeek(weekDates.startDate, dayOffset);
        const seqNo = targetWeek * 10 + cIdx + 1;
        const kwMatBukti = `${String(seqNo).padStart(2, '0')}/KW-MAT/${yearStr}`;
        const spbBukti = `SPB-${String(seqNo).padStart(2, '0')}/MAT/${yearStr}`;

        const isTaxable = chunkNominal >= 2000000;
        const ppn = isTaxable ? Math.round((chunkNominal / 1.11) * 0.11 * 100) / 100 : 0;
        const pph22 = isTaxable ? Math.round((chunkNominal / 1.11) * 0.015 * 100) / 100 : 0;

        const topMatNames = chunkItems.map((i) => i.namaBarang).slice(0, 3).join(', ');
        const matStore = (chunkItems.length > 0
          ? resolveStoreFromItemTags(chunkItems[0], stores, defaultMaterialStore, school.kabKota)
          : defaultMaterialStore) || defaultMaterialStore;

        const matKwDoc: KwitansiDocument = {
          id: `kw-mat-m${targetWeek}-${cIdx}-${Date.now()}`,
          noBukti: kwMatBukti,
          noSpb: spbBukti,
          tipe: 'MATERIAL',
          tanggal: matDateInfo.dateSlash,
          tanggalFormatted: matDateInfo.dateFormatted,
          bulan: matDateInfo.bulan,
          uraian: `Pembayaran Lunas Biaya Pembelian Material/Bahan Awal Minggu Ke-${targetWeek} (${topMatNames}), Mengacu Bobot Fisik Bangunan Revitalisasi ${school.namaSekolah}, Tahun ${yearStr}, Daftar Terlampir.`,
          penerimaNama: matStore.pemilikNama || 'Pemilik Toko Rekanan',
          penerimaPekerjaan: `Pemilik ${matStore.namaToko}`,
          penerimaAlamat: matStore.alamat || school.kabKota,
          namaToko: matStore.namaToko,
          items: consolidateAndStandardizeReceiptItems(chunkItems, chunkNominal),
          nominal: chunkNominal,
          isPpn: isTaxable,
          isPph22: isTaxable,
          isPph23: false,
          ppnAmount: ppn,
          pph22Amount: pph22,
          pph23Amount: 0,
          kategoriBiayaPajak: 'Konstruksi',
          keteranganSpb: `Surat Perintah Bayar Pembelian Bahan Material Awal Minggu Ke-${targetWeek} (${matDateInfo.dateFormatted})`,
          mingguKeRef: targetWeek,
        };

        const existingIdx = newKwitansiList.findIndex((k) => k.noBukti === kwMatBukti);
        if (existingIdx >= 0) {
          newKwitansiList[existingIdx] = matKwDoc;
        } else {
          newKwitansiList.push(matKwDoc);
        }
        generatedCount.bahan++;
      });
    }
  }

  // Percetakan / Cetak Dokumen
  if (cetakMaterials.length > 0) {
    const normalizedCetak = normalizeMaterialItems(cetakMaterials);
    const totalCetakNominal = normalizedCetak.reduce((s, it) => s + it.jumlah, 0);
    if (totalCetakNominal > 0) {
      const cetakDateInfo = getDateInWeek(weekDates.startDate, 1); // Selasa (Awal Pekan)
      const padW = String(targetWeek).padStart(2, '0');
      const kwCetakBukti = `CTK/${padW}/${yearStr}`;
      const spbBukti = `SPB-CTK/${padW}/${yearStr}`;
      const isTaxable = totalCetakNominal >= 2000000;

      const cetakDoc: KwitansiDocument = {
        id: `kw-cetak-m${targetWeek}-${Date.now()}`,
        noBukti: kwCetakBukti,
        noSpb: spbBukti,
        tipe: 'OPERASIONAL',
        tanggal: cetakDateInfo.dateSlash,
        tanggalFormatted: cetakDateInfo.dateFormatted,
        bulan: cetakDateInfo.bulan,
        uraian: `Pembayaran Lunas Pengadaan & Cetak Papan Nama / Prasasti / Buku SPJ Awal Minggu Ke-${targetWeek} (${normalizedCetak.map((i) => i.namaBarang).slice(0, 3).join(', ')}), Revitalisasi ${school.namaSekolah}, Tahun ${yearStr}.`,
        penerimaNama: defaultPercetakanStore.pemilikNama || 'Pemilik CV Percetakan',
        penerimaPekerjaan: `Pemilik ${defaultPercetakanStore.namaToko}`,
        penerimaAlamat: defaultPercetakanStore.alamat || school.kabKota,
        namaToko: defaultPercetakanStore.namaToko,
        items: consolidateAndStandardizeReceiptItems(normalizedCetak, totalCetakNominal),
        nominal: totalCetakNominal,
        isPpn: isTaxable,
        isPph22: isTaxable,
        isPph23: false,
        ppnAmount: isTaxable ? Math.round((totalCetakNominal / 1.11) * 0.11 * 100) / 100 : 0,
        pph22Amount: isTaxable ? Math.round((totalCetakNominal / 1.11) * 0.015 * 100) / 100 : 0,
        pph23Amount: 0,
        kategoriBiayaPajak: 'Percetakan',
        keteranganSpb: `Surat Perintah Bayar Pengadaan & Cetak Dokumen Awal Minggu Ke-${targetWeek} (${cetakDateInfo.dateFormatted})`,
        mingguKeRef: targetWeek,
      };

      const existingIdx = newKwitansiList.findIndex((k) => k.noBukti === kwCetakBukti);
      if (existingIdx >= 0) {
        newKwitansiList[existingIdx] = cetakDoc;
      } else {
        newKwitansiList.push(cetakDoc);
      }
      generatedCount.bahan++;
    }
  }

  // Perabot
  if (perabotMaterials.length > 0) {
    const pStoreGroups = new Map<string, { store: ReturnType<typeof resolveStoreFromItemTags>; items: any[] }>();
    for (const item of perabotMaterials) {
      const store = resolveStoreFromItemTags(item, stores, defaultPerabotStore, school.kabKota);
      const key = store.namaToko;
      if (!pStoreGroups.has(key)) {
        pStoreGroups.set(key, { store, items: [] });
      }
      pStoreGroups.get(key)!.items.push(item);
    }

    let pStoreIdx = 0;
    for (const [pStoreName, pGroup] of pStoreGroups.entries()) {
      const normalizedPerabot = normalizeMaterialItems(pGroup.items);
      const totalPerabotNominal = normalizedPerabot.reduce((s, it) => s + it.jumlah, 0);
      if (totalPerabotNominal > 0) {
        const perabotDateInfo = getDateInWeek(weekDates.startDate, 1); // Selasa (Awal Pekan)
        const seqNo = targetWeek * 10 + 5 + pStoreIdx;
        const seqSuffix = pStoreGroups.size > 1 ? `-${pStoreIdx + 1}` : '';
        const kwPerabotBukti = `${String(seqNo).padStart(2, '0')}${seqSuffix}/KW-MAT/${yearStr}`;
        const spbBukti = `SPB-${String(seqNo).padStart(2, '0')}${seqSuffix}/MAT/${yearStr}`;
        const isTaxable = totalPerabotNominal >= 2000000;

        const perabotDoc: KwitansiDocument = {
          id: `kw-perabot-m${targetWeek}-${pStoreIdx}-${Date.now()}`,
          noBukti: kwPerabotBukti,
          noSpb: spbBukti,
          tipe: 'PERABOT',
          tanggal: perabotDateInfo.dateSlash,
          tanggalFormatted: perabotDateInfo.dateFormatted,
          bulan: perabotDateInfo.bulan,
          uraian: `Pembayaran Lunas Pengadaan Perabot / Meubilair via ${pGroup.store.namaToko} Awal Minggu Ke-${targetWeek} (${normalizedPerabot.map((i) => i.namaBarang).slice(0, 3).join(', ')}), Revitalisasi ${school.namaSekolah}, Tahun ${yearStr}.`,
          penerimaNama: pGroup.store.pemilikNama || 'Pemilik Toko Mebel',
          penerimaPekerjaan: pGroup.store.pekerjaan || `Pemilik ${pGroup.store.namaToko}`,
          penerimaAlamat: pGroup.store.alamat || school.kabKota,
          namaToko: pGroup.store.namaToko,
          items: consolidateAndStandardizeReceiptItems(normalizedPerabot, totalPerabotNominal),
          nominal: totalPerabotNominal,
          isPpn: isTaxable,
          isPph22: isTaxable,
          isPph23: false,
          ppnAmount: isTaxable ? Math.round((totalPerabotNominal / 1.11) * 0.11 * 100) / 100 : 0,
          pph22Amount: isTaxable ? Math.round((totalPerabotNominal / 1.11) * 0.015 * 100) / 100 : 0,
          pph23Amount: 0,
          kategoriBiayaPajak: 'Perabot',
          keteranganSpb: `Surat Perintah Bayar Pengadaan Perabot Awal Minggu Ke-${targetWeek} (${perabotDateInfo.dateFormatted})`,
          mingguKeRef: targetWeek,
        };

        const existingIdx = newKwitansiList.findIndex((k) => k.noBukti === kwPerabotBukti);
        if (existingIdx >= 0) {
          newKwitansiList[existingIdx] = perabotDoc;
        } else {
          newKwitansiList.push(perabotDoc);
        }
        generatedCount.bahan++;
        pStoreIdx++;
      }
    }
  }

  // Alat Bantu Kerja (Sewa Molen, Perancah/Scaffolding) - Disewa di awal minggu (Senin) sebelum pekerjaan dimulai
  if (weeklyAllAlatItems.length > 0) {
    const normalizedAlat = normalizeMaterialItems(weeklyAllAlatItems);
    const totalAlatNominal = normalizedAlat.reduce((s, it) => s + it.jumlah, 0);
    if (totalAlatNominal > 0) {
      const alatDateInfo = getDateInWeek(weekDates.startDate, 0); // Senin (Awal Pekan)
      const seqAlat = targetWeek * 10 + 7;
      const kwAlatBukti = `${String(seqAlat).padStart(2, '0')}/KW-ALAT/${yearStr}`;
      const spbBukti = `SPB-${String(seqAlat).padStart(2, '0')}/ALAT/${yearStr}`;
      const pph23 = Math.round(totalAlatNominal * 0.02 * 100) / 100;

      const alatDoc: KwitansiDocument = {
        id: `kw-alat-m${targetWeek}-${Date.now()}`,
        noBukti: kwAlatBukti,
        noSpb: spbBukti,
        tipe: 'OPERASIONAL',
        tanggal: alatDateInfo.dateSlash,
        tanggalFormatted: alatDateInfo.dateFormatted,
        bulan: alatDateInfo.bulan,
        uraian: `Pembayaran Lunas Biaya Sewa/Pengadaan Alat Bantu Kerja Awal Minggu Ke-${targetWeek} (${normalizedAlat.map((i) => i.namaBarang).join(', ')}), Mengacu Bobot Fisik Revitalisasi ${school.namaSekolah}, Tahun ${yearStr}.`,
        penerimaNama: defaultMaterialStore.pemilikNama || 'Penyedia Sewa Alat',
        penerimaPekerjaan: `Penyedia Alat & Perlengkapan`,
        penerimaAlamat: defaultMaterialStore.alamat || school.kabKota,
        namaToko: defaultMaterialStore.namaToko,
        items: normalizedAlat,
        nominal: totalAlatNominal,
        isPpn: false,
        isPph22: false,
        isPph23: true,
        ppnAmount: 0,
        pph22Amount: 0,
        pph23Amount: pph23,
        kategoriBiayaPajak: 'Peralatan',
        keteranganSpb: `Surat Perintah Bayar Sewa Alat Bantu Kerja Awal Minggu Ke-${targetWeek} (${alatDateInfo.dateFormatted})`,
        mingguKeRef: targetWeek,
      };

      const existAlatIdx = newKwitansiList.findIndex((k) => k.noBukti === kwAlatBukti);
      if (existAlatIdx >= 0) {
        newKwitansiList[existAlatIdx] = alatDoc;
      } else {
        newKwitansiList.push(alatDoc);
      }
      generatedCount.alat++;
    }
  }

  // 6. Process UPAH & Weekly Wage Report with Full-Capacity Sequential Core Worker Allocation
  const activeWorkersList: WorkerItem[] = workers && workers.length > 0 ? workers : [
    {
      id: 'w-def-1',
      nama: school.namaMandor || 'Mandor Proyek',
      jenisKelamin: 'L' as const,
      domisili: 'Dalam Desa' as const,
      peran: 'MANDOR',
      peranLabel: 'Mandor',
      upahHarian: 150000,
    },
    {
      id: 'w-def-2',
      nama: 'Tukang Ahli',
      jenisKelamin: 'L' as const,
      domisili: 'Dalam Desa' as const,
      peran: 'KEPALA_TUKANG',
      peranLabel: 'Kepala Tukang',
      upahHarian: 130000,
    },
    {
      id: 'w-def-3',
      nama: 'Pekerja Lapangan 1',
      jenisKelamin: 'L' as const,
      domisili: 'Dalam Desa' as const,
      peran: 'PEKERJA',
      peranLabel: 'Pekerja',
      upahHarian: 110000,
    },
    {
      id: 'w-def-4',
      nama: 'Pekerja Lapangan 2',
      jenisKelamin: 'L' as const,
      domisili: 'Dalam Desa' as const,
      peran: 'PEKERJA',
      peranLabel: 'Pekerja',
      upahHarian: 110000,
    },
  ];

  // Worker wages:
  // If no upah components from AHSP, estimate labor at ~35% of executed physical works
  const hasPhysicalExecution = activeDivisions.some((d) => !/perencana|pengawas|administrasi|pengelolaan/i.test(d.uraian));
  if (totalWageAmountForWeek === 0 && hasPhysicalExecution) {
    const totalPhysicalExecJml = activeDivisions.reduce((sum, d) => {
      if (/perencana|pengawas|administrasi|pengelolaan/i.test(d.uraian)) return sum;
      return sum + Math.round((school.totalAnggaran || 500000000) * ((d.prestasiMingguIni || 0) / 100));
    }, 0);
    totalWageAmountForWeek = Math.round(totalPhysicalExecJml * 0.35);
  }

  const targetWage = totalWageAmountForWeek;
  let remainingWageBudget = targetWage;
  const sequentialAttendance: any[] = [];

  for (let i = 0; i < activeWorkersList.length; i++) {
    if (remainingWageBudget <= 0) break;

    const w = activeWorkersList[i];
    const safeDomisili: 'Dalam Desa' | 'Luar Desa' = w.domisili === 'Luar Desa' ? 'Luar Desa' : 'Dalam Desa';
    const exactRate = getAhspWageRateForRole(w.peran, w.peranLabel, realSchoolData?.ahspList, w.upahHarian);
    const isLastWorker = i === activeWorkersList.length - 1;

    let assignedHok = 0;
    let assignedTotal = 0;
    let assignedDailyRate = exactRate;

    if (isLastWorker || remainingWageBudget < exactRate * 2) {
      assignedTotal = remainingWageBudget;
      let calculatedHok = Math.round(assignedTotal / exactRate);
      assignedHok = Math.min(7, Math.max(1, calculatedHok));
      assignedDailyRate = Math.round((assignedTotal / assignedHok) * 100) / 100;
      remainingWageBudget = 0;
    } else {
      const maxHokPossible = Math.min(7, Math.max(1, Math.floor(remainingWageBudget / exactRate)));
      assignedHok = maxHokPossible;
      assignedTotal = Math.round(assignedHok * exactRate);
      remainingWageBudget -= assignedTotal;
    }

    const days: [number, number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0, 0];
    for (let d = 0; d < Math.min(7, assignedHok); d++) {
      days[d] = 1;
    }

    sequentialAttendance.push({
      workerId: w.id,
      nama: w.nama,
      jenisKelamin: w.jenisKelamin,
      domisili: safeDomisili,
      peran: w.peran,
      peranLabel: w.peranLabel,
      days,
      hok: assignedHok,
      upahHarian: assignedDailyRate,
      totalUpah: assignedTotal,
    });
  }

  // Sisa selisih terakhir diserap tepat
  if (remainingWageBudget > 0 && sequentialAttendance.length > 0) {
    const lastIdx = sequentialAttendance.length - 1;
    sequentialAttendance[lastIdx].totalUpah += remainingWageBudget;
    sequentialAttendance[lastIdx].upahHarian = Math.round((sequentialAttendance[lastIdx].totalUpah / (sequentialAttendance[lastIdx].hok || 1)) * 100) / 100;
  }

  const totCalculatedUpah = sequentialAttendance.reduce((s, a) => s + a.totalUpah, 0);

  const wageDocId = `wage-rep-m${targetWeek}`;
  const wageIdx = updatedWageReports.findIndex((r) => r.mingguKe === targetWeek);

  const mandorWorker =
    (workers || []).find(
      (w) =>
        (w.kategoriPenugasan === 'BORONGAN' || !w.kategoriPenugasan || w.kategoriPenugasan === 'SEMUA') &&
        (w.peran === 'MANDOR' || /mandor/i.test(w.peran) || /mandor/i.test(w.peranLabel || '') || /mandor/i.test(w.nama))
    ) ||
    (workers || []).find(
      (w) => w.peran === 'MANDOR' || /mandor/i.test(w.peran) || /mandor/i.test(w.peranLabel || '') || /mandor/i.test(w.nama) || w.peran === 'KT'
    ) ||
    workers?.[0];
  const defaultMandorNama = mandorWorker?.nama || school?.namaMandor || activeWorkersList[0]?.nama || 'Budiman (Mandor)';
  const defaultMandorJabatan = mandorWorker?.peranLabel || 'Mandor / Ketua Kelompok';

  const wageReportDoc: WeeklyWageReport = {
    id: wageDocId,
    mingguKe: targetWeek,
    bulan,
    periodeStart: formattedDateStart,
    periodeEnd: formattedDateEnd,
    tanggalKwitansi: formattedDateEnd,
    noBuktiKwitansi: `UK/${targetWeek < 10 ? '0' + targetWeek : targetWeek}/${yearStr}`,
    penerimaNama: defaultMandorNama,
    penerimaJabatan: defaultMandorJabatan,
    attendance: sequentialAttendance,
    totalUpah: totCalculatedUpah,
    bobotMingguIni: weekObj.bobotRealisasi || 0,
    bobotKumulatif: weekObj.bobotRealisasi || 0,
  };

  if (wageIdx >= 0) {
    updatedWageReports[wageIdx] = wageReportDoc;
  } else {
    updatedWageReports.push(wageReportDoc);
  }

  // Generate or update Kwitansi Upah Tukang
  const kwUpahBukti = `UK/${targetWeek < 10 ? '0' + targetWeek : targetWeek}/${yearStr}`;
  const upahKwIdx = newKwitansiList.findIndex((k) => (k.tipe === 'UPAH' && k.mingguKeRef === targetWeek) || k.noBukti === kwUpahBukti);
  const upahKwDoc: KwitansiDocument = {
    id: upahKwIdx >= 0 ? newKwitansiList[upahKwIdx].id : `kw-wage-m${targetWeek}-${Date.now()}`,
    noBukti: kwUpahBukti,
    noSpb: `SPB-UPAH/${targetWeek < 10 ? '0' + targetWeek : targetWeek}/${yearStr}`,
    tipe: 'UPAH',
    tanggal: dateEndStr, // Dibayar setiap tanggal akhir minggu
    tanggalFormatted: formattedDateEnd,
    bulan: bulan,
    uraian: `Pembayaran Lunas Biaya Upah Borongan Pekerja Fisik Minggu Ke-${targetWeek} (${formattedDateStart} s.d ${formattedDateEnd}), Sesuai Prestasi Kemajuan Fisik Revitalisasi ${school.namaSekolah}, Tahun ${yearStr}, Daftar Terlampir.`,
    penerimaNama: defaultMandorNama,
    penerimaPekerjaan: defaultMandorJabatan,
    penerimaAlamat: school.kabKota,
    nominal: totCalculatedUpah,
    items: (() => {
      // 1. Prioritize AHSP UPAH components from active division (Tukang Kayu, Tukang Cat, Pekerja, Tukang Batu, dll.)
      if (weeklyAhspUpahComponents.length > 0) {
        const groupedUpah = new Map<string, { volume: number; satuan: string; hargaSatuan: number; jumlah: number }>();
        weeklyAhspUpahComponents.forEach((c) => {
          const existing = groupedUpah.get(c.namaBarang);
          if (existing) {
            existing.volume = Math.round((existing.volume + c.volume) * 100) / 100;
            existing.jumlah += c.jumlah;
          } else {
            groupedUpah.set(c.namaBarang, {
              volume: c.volume,
              satuan: 'HOK',
              hargaSatuan: c.hargaSatuan,
              jumlah: c.jumlah,
            });
          }
        });

        const rawList = Array.from(groupedUpah.entries()).map(([nama, data]) => ({
          namaBarang: nama,
          volume: data.volume,
          satuan: 'HOK',
          hargaSatuan: data.hargaSatuan,
          jumlah: data.jumlah,
        }));

        const rawTotal = rawList.reduce((s, it) => s + it.jumlah, 0);
        if (rawTotal > 0 && totCalculatedUpah > 0) {
          // REALISTIC INTEGER HOK BALANCING (Absensi Bulat Tanpa Pecahan Koma)
          // Menghitung HOK bulat riil (5-7 HOK per orang/minggu) dengan tarif resmi AHSP/RAB
          // Total nominal tetap 100% klop persis dengan totCalculatedUpah tanpa selisih 1 rupiah pun
          let runningSum = 0;
          return rawList.map((it, idx) => {
            if (idx === rawList.length - 1) {
              const lastJml = totCalculatedUpah - runningSum;
              // Dihitung HOK bulat (atau setengah hari 0.5 jika diperlukan), minimal 1 HOK
              let integerHok = Math.round(lastJml / it.hargaSatuan);
              if (integerHok < 1) integerHok = 1;
              const roundedUnitPrice = Math.round(lastJml / integerHok);
              return {
                ...it,
                volume: integerHok,
                satuan: 'HOK',
                hargaSatuan: roundedUnitPrice,
                jumlah: lastJml,
              };
            }
            const scaledJml = Math.round((it.jumlah / rawTotal) * totCalculatedUpah);
            runningSum += scaledJml;
            let integerHok = Math.round(scaledJml / it.hargaSatuan);
            if (integerHok < 1) integerHok = 1;
            const roundedUnitPrice = Math.round(scaledJml / integerHok);
            return {
              ...it,
              volume: integerHok,
              satuan: 'HOK',
              hargaSatuan: roundedUnitPrice,
              jumlah: scaledJml,
            };
          });
        }
        return rawList;
      }

      // 2. Intelligent Auto-Generation of Specialized Worker Roles from Active Divisions
      // Jika belum ada tenaga khusus di master atau data ahsp spesifik, buatkan otomatis
      // (Tukang Kayu, Tukang Cat, Pekerja, Tukang Pipa, Tukang Listrik, Tukang Gali, Tukang Batu)
      const detectedSpecialties: { peranLabel: string; tarif: number; hokRatio: number }[] = [];
      const divNames = activeDivisions.map((d) => (d.uraian || '').toLowerCase()).join(' ');

      if (/galian|tanah|urugan|pondasi/i.test(divNames)) {
        detectedSpecialties.push({ peranLabel: 'Tukang Gali', tarif: 150000, hokRatio: 0.35 });
        detectedSpecialties.push({ peranLabel: 'Tukang Batu', tarif: 150000, hokRatio: 0.35 });
        detectedSpecialties.push({ peranLabel: 'Pekerja Lapangan', tarif: 120000, hokRatio: 0.30 });
      } else if (/pasangan|dinding|bata|plesteran/i.test(divNames)) {
        detectedSpecialties.push({ peranLabel: 'Kepala Tukang Batu', tarif: 180000, hokRatio: 0.25 });
        detectedSpecialties.push({ peranLabel: 'Tukang Batu', tarif: 150000, hokRatio: 0.45 });
        detectedSpecialties.push({ peranLabel: 'Pekerja Pengaduk & Angkut', tarif: 120000, hokRatio: 0.30 });
      } else if (/beton|sloof|kolom|balok|dak/i.test(divNames)) {
        detectedSpecialties.push({ peranLabel: 'Tukang Besi & Cor', tarif: 150000, hokRatio: 0.40 });
        detectedSpecialties.push({ peranLabel: 'Tukang Batu / Cor', tarif: 150000, hokRatio: 0.30 });
        detectedSpecialties.push({ peranLabel: 'Pekerja Lapangan', tarif: 120000, hokRatio: 0.30 });
      } else if (/kayu|kusen|pintu|jendela/i.test(divNames)) {
        detectedSpecialties.push({ peranLabel: 'Kepala Tukang Kayu', tarif: 180000, hokRatio: 0.25 });
        detectedSpecialties.push({ peranLabel: 'Tukang Kayu', tarif: 150000, hokRatio: 0.50 });
        detectedSpecialties.push({ peranLabel: 'Pekerja Pembantu', tarif: 120000, hokRatio: 0.25 });
      } else if (/atap|kuda-kuda|spandek|baja/i.test(divNames)) {
        detectedSpecialties.push({ peranLabel: 'Tukang Rangka Baja & Atap', tarif: 160000, hokRatio: 0.55 });
        detectedSpecialties.push({ peranLabel: 'Pekerja Lapangan', tarif: 120000, hokRatio: 0.45 });
      } else if (/langit|plafon|gypsum|pvc/i.test(divNames)) {
        detectedSpecialties.push({ peranLabel: 'Tukang Plafon & Gypsum', tarif: 150000, hokRatio: 0.55 });
        detectedSpecialties.push({ peranLabel: 'Pekerja Lapangan', tarif: 120000, hokRatio: 0.45 });
      } else if (/lantai|keramik|granit/i.test(divNames)) {
        detectedSpecialties.push({ peranLabel: 'Tukang Pasang Keramik', tarif: 150000, hokRatio: 0.60 });
        detectedSpecialties.push({ peranLabel: 'Pekerja Pemotong & Pengaduk', tarif: 120000, hokRatio: 0.40 });
      } else if (/cat|finishing|pengecatan/i.test(divNames)) {
        detectedSpecialties.push({ peranLabel: 'Tukang Cat & Finishing', tarif: 150000, hokRatio: 0.60 });
        detectedSpecialties.push({ peranLabel: 'Pekerja Pengamplas', tarif: 120000, hokRatio: 0.40 });
      } else if (/listrik|instalasi/i.test(divNames)) {
        detectedSpecialties.push({ peranLabel: 'Tukang Listrik & Instalatur', tarif: 160000, hokRatio: 0.70 });
        detectedSpecialties.push({ peranLabel: 'Pekerja Pembantu', tarif: 120000, hokRatio: 0.30 });
      } else if (/sanitasi|pipa|plambing|wc/i.test(divNames)) {
        detectedSpecialties.push({ peranLabel: 'Tukang Pipa & Plambing', tarif: 150000, hokRatio: 0.65 });
        detectedSpecialties.push({ peranLabel: 'Pekerja Galian Pipa', tarif: 120000, hokRatio: 0.35 });
      }

      if (detectedSpecialties.length > 0 && totCalculatedUpah > 0) {
        let runningSum = 0;
        return detectedSpecialties.map((spec, sIdx) => {
          if (sIdx === detectedSpecialties.length - 1) {
            const lastJml = totCalculatedUpah - runningSum;
            let integerHok = Math.round(lastJml / spec.tarif);
            if (integerHok < 1) integerHok = 1;
            const unitPrice = Math.round(lastJml / integerHok);
            return {
              namaBarang: `Upah ${spec.peranLabel}`,
              volume: integerHok,
              satuan: 'HOK',
              hargaSatuan: unitPrice,
              jumlah: lastJml,
            };
          }
          const sNominal = Math.round(totCalculatedUpah * spec.hokRatio);
          runningSum += sNominal;
          let integerHok = Math.round(sNominal / spec.tarif);
          if (integerHok < 1) integerHok = 1;
          const unitPrice = Math.round(sNominal / integerHok);
          return {
            namaBarang: `Upah ${spec.peranLabel}`,
            volume: integerHok,
            satuan: 'HOK',
            hargaSatuan: unitPrice,
            jumlah: sNominal,
          };
        });
      }

      // 3. Fallback: Detailed worker role attendance list (Mandor, Kepala Tukang, Pekerja)
      return sequentialAttendance.map((att: any) => ({
        namaBarang: `Upah ${att.peranLabel} (${att.nama})`,
        volume: att.hok,
        satuan: 'HOK',
        hargaSatuan: att.upahHarian,
        jumlah: att.totalUpah,
      }));
    })(),
    isPpn: false,
    isPph22: false,
    isPph23: false,
    ppnAmount: 0,
    pph22Amount: 0,
    pph23Amount: 0,
    kategoriBiayaPajak: 'Konstruksi',
    keteranganSpb: `Surat Perintah Bayar Upah Borongan Pekerja Fisik Minggu Ke-${targetWeek} (${formattedDateStart} s.d ${formattedDateEnd}) Sesuai Laporan Progres Fisik`,
    mingguKeRef: targetWeek,
  };

  if (totCalculatedUpah > 0) {
    // Strictly purge any existing upah kwitansi for targetWeek to prevent ANY duplicates
    for (let i = newKwitansiList.length - 1; i >= 0; i--) {
      const k = newKwitansiList[i];
      const wNum = extractWeekNumberFromKwitansi(k, weeksToUse, yearStr);
      if (wNum === targetWeek && (k.tipe === 'UPAH' || /uk\//i.test(k.noBukti || '') || /upah borongan|upah tukang|daftar hadir/i.test(k.uraian || ''))) {
        newKwitansiList.splice(i, 1);
      }
    }
    newKwitansiList.push(upahKwDoc);
    generatedCount.upah++;
  }

  const finalizedKwitansi = newKwitansiList.map((kw) => {
    if (kw.items && kw.items.length > 0 && kw.tipe !== 'UPAH') {
      return {
        ...kw,
        items: normalizeMaterialItems(kw.items),
      };
    }
    return kw;
  });

  return {
    updatedKwitansi: renumberKwitansiChronologically(deduplicateKwitansiList(finalizedKwitansi), yearStr),
    updatedWageReports,
    updatedBkb,
    generatedCount,
  };
}

export interface MultiWeekGenerationParams {
  selectedWeekNums: number[];
  weeksToUse: ProjectProgressWeek[];
  school: SchoolMasterData;
  workers: WorkerItem[];
  stores: StoreVendor[];
  rpdItems: RpdItem[];
  realSchoolData?: RealSchoolData;
  existingKwitansi: KwitansiDocument[];
  existingWageReports: WeeklyWageReport[];
  existingBkb: BkbTransaction[];
  splitDays?: boolean;
  procurementMode?: 'BATCH_CONSTRUCTION' | 'WEEKLY_CONSOLIDATED';
}

export interface MultiWeekGenerationResult {
  updatedKwitansi: KwitansiDocument[];
  updatedWageReports: WeeklyWageReport[];
  updatedBkb: BkbTransaction[];
  generatedCount: {
    bahan: number;
    upah: number;
    alat: number;
    smkk: number;
    manajemen: number;
  };
}

/**
 * Monthly Management & Consultant Kwitansi Generator:
 * Generates Kwitansi for:
 * 1. Konsultan Perencana Teknis (KONS-P)
 * 2. Konsultan Pengawas Lapangan (KONS-W)
 * 3. Tim Pengelola Administrasi SPJ & LPJ (ADM)
 * 
 * Sesuai aturan:
 * - Pembayaran dilakukan setiap akhir bulan kalender (e.g. 31 Juli, 31 Agustus, 30 September).
 * - Khusus bulan terakhir, tanggal pembayaran tepat pada tanggal berakhirnya pekerjaan / serah terima proyek.
 * - Nilai nominal mengikuti akumulasi bobot/prestasi mingguan dari minggu-minggu yang berjalan di bulan bersangkutan.
 * - Pada bulan terakhir / penyelesaian akhir, seluruh sisa pagu anggaran dilunaskan 100% klop dengan RAB.
 */
export function generateMonthlyManagementTransactions({
  weeksToUse,
  activeWeeks,
  school,
  stores = [],
  realSchoolData,
  existingKwitansi = [],
}: {
  weeksToUse: ProjectProgressWeek[];
  activeWeeks: ProjectProgressWeek[];
  school: SchoolMasterData;
  stores?: StoreVendor[];
  realSchoolData?: RealSchoolData;
  existingKwitansi?: KwitansiDocument[];
}): {
  managementKwitansi: KwitansiDocument[];
  generatedCount: number;
} {
  const yearStr = school?.tahunAnggaran?.trim() || '2026';
  const paguTotal = school?.totalAnggaran || 552457000;

  if (!weeksToUse || weeksToUse.length === 0 || !activeWeeks || activeWeeks.length === 0) {
    return { managementKwitansi: [], generatedCount: 0 };
  }

  // 1. Identify Project End Date
  const firstWeek = weeksToUse[0] || activeWeeks[0];
  const lastWeek = weeksToUse[weeksToUse.length - 1] || activeWeeks[activeWeeks.length - 1];
  const lastResolved = resolveWeekDates(lastWeek || { mingguKe: 14 }, yearStr);

  let finalProjectEndDate = lastResolved.endDate; // e.g. "2026-10-15" or "2026-10-06"
  if (school?.periodePenggunaan) {
    const match = school.periodePenggunaan.match(/(?:sampai|s\.d\.?|s\/d|-)\s*(\d{1,2})\s+([a-zA-Z]+|\d{1,2})\s+(\d{4})/i);
    if (match) {
      const day = match[1].padStart(2, '0');
      const monthPart = match[2];
      const year = match[3];
      const monthNum = monthOrderMap[monthPart.toLowerCase()] || parseInt(monthPart, 10);
      if (monthNum >= 1 && monthNum <= 12) {
        finalProjectEndDate = `${year}-${String(monthNum).padStart(2, '0')}-${day}`;
      }
    }
  }

  const [finalYearStr, finalMonthStr, finalDayStr] = finalProjectEndDate.split('-');
  const finalYear = parseInt(finalYearStr, 10) || parseInt(yearStr, 10) || 2026;
  const finalMonthNum = parseInt(finalMonthStr, 10) || 10;
  const finalMonthName = indonesianMonths[finalMonthNum - 1] || 'Oktober';
  const finalMonthKey = `${finalMonthName} ${finalYear}`;

  // 2. Budget & Weight per Role from RealSchoolData or Defaults
  const divP = realSchoolData?.divisions?.find((d) => /perencana/i.test(d.uraian));
  const divW = realSchoolData?.divisions?.find((d) => /pengawas/i.test(d.uraian));
  const divA = realSchoolData?.divisions?.find((d) => /pengelolaan|administrasi/i.test(d.uraian));

  const bobotP = divP?.bobotPersen || (divP && divP.subTotal > 0 ? (divP.subTotal / paguTotal) * 100 : 2.23);
  const bobotW = divW?.bobotPersen || (divW && divW.subTotal > 0 ? (divW.subTotal / paguTotal) * 100 : 2.74);
  const bobotA = divA?.bobotPersen || (divA && divA.subTotal > 0 ? (divA.subTotal / paguTotal) * 100 : 3.23);

  const budgetP = divP?.subTotal || Math.round((paguTotal * bobotP) / 100);
  const budgetW = divW?.subTotal || Math.round((paguTotal * bobotW) / 100);
  const budgetA = divA?.subTotal || Math.round((paguTotal * bobotA) / 100);

  // 3. Map weeks by month
  const monthWeeksMap = new Map<string, ProjectProgressWeek[]>();
  weeksToUse.forEach((w) => {
    const wDates = resolveWeekDates(w, yearStr);
    const mKey = wDates.bulan; // e.g. "Juli 2026"
    if (!monthWeeksMap.has(mKey)) {
      monthWeeksMap.set(mKey, []);
    }
    monthWeeksMap.get(mKey)!.push(w);
  });

  const sortedMonthKeys = Array.from(monthWeeksMap.keys()).sort((a, b) => {
    const [mA, yA] = a.split(' ');
    const [mB, yB] = b.split(' ');
    const scoreA = (parseInt(yA, 10) || 2026) * 100 + (monthOrderMap[mA.toLowerCase()] || 1);
    const scoreB = (parseInt(yB, 10) || 2026) * 100 + (monthOrderMap[mB.toLowerCase()] || 1);
    return scoreA - scoreB;
  });

  const activeSet = new Set(activeWeeks.map((w) => w.mingguKe));
  const activeMonthKeys = sortedMonthKeys.filter((mKey) => {
    const mWeeks = monthWeeksMap.get(mKey) || [];
    return mWeeks.some((w) => {
      if (!activeSet.has(w.mingguKe)) return false;
      const divSum = (w.divisions || []).reduce((s, d) => s + (d.prestasiMingguIni || 0), 0);
      return (w.bobotRealisasi && w.bobotRealisasi > 0) || divSum > 0 || (w.mingguKe === 1 && activeSet.has(1));
    });
  });

  if (activeMonthKeys.length === 0) {
    return { managementKwitansi: [], generatedCount: 0 };
  }

  const managementKwitansi: KwitansiDocument[] = [];
  let paidSoFarP = 0;
  let paidSoFarW = 0;
  let paidSoFarA = 0;

  const defaultPengelolaSpjStore = (stores || []).find(
    (s) => s.kategori === 'PENGELOLA_SPJ' || /pengelola.*spj|pengelola spj/i.test(`${s.namaToko} ${s.pekerjaan || ''}`)
  );

  activeMonthKeys.forEach((mKey, mIdx) => {
    const mWeeks = monthWeeksMap.get(mKey) || [];
    const isFinalMonth = mKey === finalMonthKey || mIdx === activeMonthKeys.length - 1;

    let dateSlash: string;
    let dateFormatted: string;
    let bulan = mKey;

    if (isFinalMonth) {
      // Khusus bulan terakhir: tepat pada tanggal berakhirnya pekerjaan proyek
      const [fYear, fMonth, fDay] = finalProjectEndDate.split('-');
      const dayNum = parseInt(fDay, 10) || 15;
      const fMNum = parseInt(fMonth, 10) || 10;
      const monthLabel = indonesianMonths[fMNum - 1] || 'Oktober';
      dateSlash = `${String(dayNum).padStart(2, '0')}/${String(fMNum).padStart(2, '0')}/${fYear}`;
      dateFormatted = `${dayNum} ${monthLabel} ${fYear}`;
      bulan = `${monthLabel} ${fYear}`;
    } else {
      // Setiap akhir bulan: tanggal terakhir di bulan bersangkutan (e.g. 31 Juli, 31 Agustus, 30 September)
      const [mName, yStr] = mKey.split(' ');
      const mNum = monthOrderMap[mName.toLowerCase()] || 7;
      const yNum = parseInt(yStr, 10) || 2026;
      const lastDay = new Date(yNum, mNum, 0).getDate();
      const pDay = String(lastDay).padStart(2, '0');
      const pMon = String(mNum).padStart(2, '0');
      dateSlash = `${pDay}/${pMon}/${yNum}`;
      dateFormatted = `${lastDay} ${indonesianMonths[mNum - 1]} ${yNum}`;
      bulan = mKey;
    }

    // Akumulasi bobot mingguan dari minggu-minggu di bulan bersangkutan
    let mProgP = 0;
    let mProgW = 0;
    let mProgA = 0;

    mWeeks.forEach((w) => {
      const dP = w.divisions?.find((d) => d.id === 'div-m1' || /perencana/i.test(d.uraian));
      const dW = w.divisions?.find((d) => d.id === 'div-m2' || /pengawas/i.test(d.uraian));
      const dA = w.divisions?.find((d) => d.id === 'div-m3' || /pengelolaan|administrasi/i.test(d.uraian));

      mProgP += (dP?.prestasiMingguIni || 0);
      mProgW += (dW?.prestasiMingguIni || 0);
      mProgA += (dA?.prestasiMingguIni || 0);
    });

    const mFisikSum = mWeeks.reduce((acc, w) => acc + (w.bobotRealisasi || 0), 0);
    if (mProgP === 0 && mFisikSum > 0 && paidSoFarP < budgetP) {
      mProgP = Math.round(((mFisikSum / 100) * bobotP) * 1000) / 1000;
    }
    if (mProgW === 0 && mFisikSum > 0 && paidSoFarW < budgetW) {
      mProgW = Math.round(((mFisikSum / 100) * bobotW) * 1000) / 1000;
    }
    if (mProgA === 0 && mFisikSum > 0 && paidSoFarA < budgetA) {
      mProgA = Math.round(((mFisikSum / 100) * bobotA) * 1000) / 1000;
    }

    // Kalkulasi nominal (Pelunasan 100% pada bulan terakhir)
    let nomP = 0;
    if (isFinalMonth) {
      nomP = Math.max(0, budgetP - paidSoFarP);
    } else if (mProgP > 0 && bobotP > 0) {
      nomP = Math.round((budgetP * mProgP) / bobotP);
      nomP = Math.min(nomP, Math.max(0, budgetP - paidSoFarP));
    }

    let nomW = 0;
    if (isFinalMonth) {
      nomW = Math.max(0, budgetW - paidSoFarW);
    } else if (mProgW > 0 && bobotW > 0) {
      nomW = Math.round((budgetW * mProgW) / bobotW);
      nomW = Math.min(nomW, Math.max(0, budgetW - paidSoFarW));
    }

    let nomA = 0;
    if (isFinalMonth) {
      nomA = Math.max(0, budgetA - paidSoFarA);
    } else if (mProgA > 0 && bobotA > 0) {
      nomA = Math.round((budgetA * mProgA) / bobotA);
      nomA = Math.min(nomA, Math.max(0, budgetA - paidSoFarA));
    }

    paidSoFarP += nomP;
    paidSoFarW += nomW;
    paidSoFarA += nomA;

    const minW = Math.min(...mWeeks.map((w) => w.mingguKe));
    const maxW = Math.max(...mWeeks.map((w) => w.mingguKe));
    const weekSpanText = minW === maxW ? `Minggu Ke-${minW}` : `Minggu Ke-${minW} s.d ${maxW}`;
    const mSeq = mIdx + 1;
    const padM = String(mSeq).padStart(2, '0');

    // 1. Perencana
    if (nomP > 0) {
      const pph23P = Math.round(nomP * 0.02 * 100) / 100;
      managementKwitansi.push({
        id: `kw-kons-p-m${mSeq}-${Date.now()}`,
        noBukti: `KONS-P/${padM}/${yearStr}`,
        noSpb: `SPB-KONS-P/${padM}/${yearStr}`,
        tipe: 'KONSULTAN',
        tanggal: dateSlash,
        tanggalFormatted: dateFormatted,
        bulan,
        uraian: isFinalMonth
          ? `Pembayaran Lunas (Pelunasan Akhir) Honorarium Jasa Konsultan Perencana Teknis per Tanggal Akhir Proyek (${dateFormatted}), Revitalisasi ${school.namaSekolah}`
          : `Pembayaran Lunas Honorarium Jasa Konsultan Perencana Teknis Bulan ${bulan} (${weekSpanText}), Revitalisasi ${school.namaSekolah}`,
        penerimaNama: resolveManagementRecipient('PERENCANA', school, stores),
        penerimaPekerjaan: 'Konsultan Perencana Teknis',
        penerimaAlamat: school.kabKota,
        nominal: nomP,
        items: [
          {
            namaBarang: isFinalMonth
              ? 'Honorarium Jasa Konsultansi Perencanaan Teknis & Dokumen Laporan Akhir (Pelunasan Akhir Proyek)'
              : `Honorarium Jasa Konsultansi Perencanaan Teknis (Akumulasi Progres ${weekSpanText})`,
            volume: 1,
            satuan: 'Bulan',
            hargaSatuan: nomP,
            jumlah: nomP,
          },
        ],
        isPpn: false,
        isPph22: false,
        isPph23: true,
        ppnAmount: 0,
        pph22Amount: 0,
        pph23Amount: pph23P,
        kategoriBiayaPajak: 'Perencanaan_Pengelolaan',
        keteranganSpb: `Surat Perintah Bayar Honorarium Konsultan Perencana (${dateFormatted})`,
        mingguKeRef: maxW,
      });
    }

    // 2. Pengawas
    if (nomW > 0) {
      const pph23W = Math.round(nomW * 0.02 * 100) / 100;
      managementKwitansi.push({
        id: `kw-kons-w-m${mSeq}-${Date.now()}`,
        noBukti: `KONS-W/${padM}/${yearStr}`,
        noSpb: `SPB-KONS-W/${padM}/${yearStr}`,
        tipe: 'KONSULTAN',
        tanggal: dateSlash,
        tanggalFormatted: dateFormatted,
        bulan,
        uraian: isFinalMonth
          ? `Pembayaran Lunas (Pelunasan Akhir) Honorarium Jasa Konsultan Pengawas Lapangan per Tanggal Akhir Proyek (${dateFormatted}), Revitalisasi ${school.namaSekolah}`
          : `Pembayaran Lunas Honorarium Jasa Konsultan Pengawas Lapangan Bulan ${bulan} (${weekSpanText}), Revitalisasi ${school.namaSekolah}`,
        penerimaNama: resolveManagementRecipient('PENGAWAS', school, stores),
        penerimaPekerjaan: 'Konsultan Pengawas Lapangan',
        penerimaAlamat: school.kabKota,
        nominal: nomW,
        items: [
          {
            namaBarang: isFinalMonth
              ? 'Honorarium Jasa Konsultansi Pengawasan Teknis Lapangan (Pelunasan Akhir Proyek)'
              : `Honorarium Jasa Konsultansi Pengawasan Teknis Lapangan (Akumulasi Progres ${weekSpanText})`,
            volume: 1,
            satuan: 'Bulan',
            hargaSatuan: nomW,
            jumlah: nomW,
          },
        ],
        isPpn: false,
        isPph22: false,
        isPph23: true,
        ppnAmount: 0,
        pph22Amount: 0,
        pph23Amount: pph23W,
        kategoriBiayaPajak: 'Perencanaan_Pengelolaan',
        keteranganSpb: `Surat Perintah Bayar Honorarium Konsultan Pengawas (${dateFormatted})`,
        mingguKeRef: maxW,
      });
    }

    // 3. Pengelola SPJ
    if (nomA > 0) {
      managementKwitansi.push({
        id: `kw-adm-m${mSeq}-${Date.now()}`,
        noBukti: `ADM/${padM}/${yearStr}`,
        noSpb: `SPB-ADM/${padM}/${yearStr}`,
        tipe: 'OPERASIONAL',
        tanggal: dateSlash,
        tanggalFormatted: dateFormatted,
        bulan,
        uraian: isFinalMonth
          ? `Pembayaran Lunas (Pelunasan Akhir) Biaya Pengelolaan Administrasi SPJ & LPJ Kegiatan per Tanggal Akhir Proyek (${dateFormatted}), Revitalisasi ${school.namaSekolah}`
          : `Pembayaran Lunas Biaya Pengelolaan Administrasi SPJ & LPJ Kegiatan Bulan ${bulan} (${weekSpanText}), Revitalisasi ${school.namaSekolah}`,
        penerimaNama: resolveManagementRecipient('PENGELOLA', school, stores),
        penerimaPekerjaan: defaultPengelolaSpjStore ? defaultPengelolaSpjStore.pekerjaan || 'Pengelola SPJ' : 'Pengelola SPJ',
        penerimaAlamat: school.kabKota,
        namaToko: defaultPengelolaSpjStore ? defaultPengelolaSpjStore.namaToko : undefined,
        nominal: nomA,
        items: [
          {
            namaBarang: isFinalMonth
              ? 'Biaya Pengelolaan Administrasi, Penyusunan Dokumen SPJ & LPJ Final (Pelunasan Akhir Proyek)'
              : `Biaya Pengelolaan Administrasi, Penyusunan Dokumen SPJ & ATK (Akumulasi Progres ${weekSpanText})`,
            volume: 1,
            satuan: 'Bulan',
            hargaSatuan: nomA,
            jumlah: nomA,
          },
        ],
        isPpn: false,
        isPph22: false,
        isPph23: false,
        ppnAmount: 0,
        pph22Amount: 0,
        pph23Amount: 0,
        kategoriBiayaPajak: 'Perencanaan_Pengelolaan',
        keteranganSpb: `Surat Perintah Bayar Biaya Pengelolaan Administrasi (${dateFormatted})`,
        mingguKeRef: maxW,
      });
    }
  });

  return {
    managementKwitansi,
    generatedCount: managementKwitansi.length,
  };
}

/**
 * Intelligent Multi-Week Procurement & Wage Generator:
 * Solves the "mencicil nanggung" problem by allowing procurement by realistic construction batches
 * while keeping labor wages 100% weekly aligned with weekly progress inputs.
 */
export function generateRealisticMultiWeekTransactions({
  selectedWeekNums,
  weeksToUse,
  school,
  workers = [],
  stores = [],
  rpdItems = [],
  realSchoolData,
  existingKwitansi,
  existingWageReports,
  existingBkb,
  splitDays = true,
  procurementMode = 'BATCH_CONSTRUCTION',
}: MultiWeekGenerationParams): MultiWeekGenerationResult {
  const yearStr = school?.tahunAnggaran?.trim() || '2026';
  const selectedSet = new Set(selectedWeekNums);

  // If user selected WEEKLY_CONSOLIDATED mode, run per-week consolidated generator
  if (procurementMode === 'WEEKLY_CONSOLIDATED') {
    // Clean up old auto-generated management kwitansi to allow fresh monthly generation
    let currentKwitansi = [...existingKwitansi.filter((k) => {
      const isManualOrLocked = isReceiptLocked(k);
      if (isManualOrLocked) return true;
      const isMgmt =
        k.tipe === 'KONSULTAN' ||
        /kons-p|kons-w|perencana|pengawas/i.test(`${k.noBukti} ${k.uraian}`) ||
        (k.tipe === 'OPERASIONAL' && /\badm\b|pengelola|spj/i.test(`${k.noBukti} ${k.uraian}`));
      return !isMgmt;
    })];
    let currentWageReports = [...existingWageReports];
    let currentBkb = [...existingBkb];
    const generatedCount = { bahan: 0, upah: 0, alat: 0, smkk: 0, manajemen: 0 };

    const sortedWeeks = [...selectedWeekNums].sort((a, b) => a - b);
    sortedWeeks.forEach((targetWeek) => {
      const weekObj = weeksToUse.find((w) => w.mingguKe === targetWeek);
      if (!weekObj) return;
      const res = generateWeeklyTransactionsFromProgressAndRealData({
        targetWeek,
        weekObj,
        weeksToUse,
        school,
        workers,
        stores,
        rpdItems,
        realSchoolData,
        existingKwitansi: currentKwitansi,
        existingWageReports: currentWageReports,
        existingBkb: currentBkb,
        splitDays,
      });
      currentKwitansi = res.updatedKwitansi;
      currentWageReports = res.updatedWageReports;
      currentBkb = res.updatedBkb;
      generatedCount.bahan += res.generatedCount.bahan;
      generatedCount.upah += res.generatedCount.upah;
      generatedCount.alat += res.generatedCount.alat;
      generatedCount.smkk += res.generatedCount.smkk;
      generatedCount.manajemen += res.generatedCount.manajemen;
    });

    // Add monthly management kwitansi (Perencana, Pengawas, Pengelola SPJ)
    const activeWeeksForConsolidated = sortedWeeks
      .map((num) => weeksToUse.find((w) => w.mingguKe === num))
      .filter(Boolean) as ProjectProgressWeek[];

    const monthlyMgmtRes = generateMonthlyManagementTransactions({
      weeksToUse,
      activeWeeks: activeWeeksForConsolidated,
      school,
      stores,
      realSchoolData,
      existingKwitansi: currentKwitansi,
    });

    monthlyMgmtRes.managementKwitansi.forEach((kw) => {
      currentKwitansi.push(kw);
      generatedCount.manajemen++;
    });

    return {
      updatedKwitansi: renumberKwitansiChronologically(deduplicateKwitansiList(currentKwitansi), yearStr),
      updatedWageReports: currentWageReports,
      updatedBkb: currentBkb,
      generatedCount,
    };
  }

  // BATCH_CONSTRUCTION MODE (Alami & Rekomendasi Utama Panitia Nyata):
  // 1. Progres fisik per minggu tetap murni menggerakkan Upah Tukang & Absensi mingguan.
  // 2. Pembelian Material dikelompokkan ke dalam partai/batch wajar toko (dropping per fase pekerjaan)
  //    pada awal minggu mulainya fase tersebut, sehingga panitia tidak terlihat mencicil/nanggung.
  const activeWeeks = weeksToUse
    .filter((w) => {
      if (!selectedSet.has(w.mingguKe)) return false;
      const divSum = (w.divisions || []).reduce((s, d) => s + (d.prestasiMingguIni || 0), 0);
      return (w.bobotRealisasi && w.bobotRealisasi > 0) || divSum > 0 || w.mingguKe === 1;
    })
    .sort((a, b) => a.mingguKe - b.mingguKe);

  // Solusi 3: Mode Proteksi Kunci (Locked Manual Receipt)
  // Kwitansi manual & terkunci dipertahankan seutuhnya dan tidak boleh dibersihkan saat generate ulang
  const cleanExistingKwitansi = existingKwitansi.filter((k) => {
    const isManualOrLocked = isReceiptLocked(k);
    if (isManualOrLocked) return true;
    const isMgmt =
      k.tipe === 'KONSULTAN' ||
      /kons-p|kons-w|perencana|pengawas/i.test(`${k.noBukti} ${k.uraian}`) ||
      (k.tipe === 'OPERASIONAL' && /\badm\b|pengelola|spj/i.test(`${k.noBukti} ${k.uraian}`));
    if (isMgmt) return false;
    const wNum = extractWeekNumberFromKwitansi(k, weeksToUse, yearStr);
    return wNum === null || !selectedSet.has(wNum);
  });

  const newKwitansiList: KwitansiDocument[] = [...cleanExistingKwitansi];
  const updatedWageReports: WeeklyWageReport[] = existingWageReports.filter(
    (w) => !selectedSet.has(w.mingguKe)
  );
  const updatedBkb: BkbTransaction[] = [...existingBkb];

  const generatedCount = {
    bahan: 0,
    upah: 0,
    alat: 0,
    smkk: 0,
    manajemen: 0,
  };

  // Solusi 1 & 2: Smart Budget Absorption & Item Linking Engine
  const manualSummary = summarizeManualKwitansiSpending(existingKwitansi, realSchoolData);

  if (activeWeeks.length === 0) {
    return {
      updatedKwitansi: deduplicateKwitansiList(cleanExistingKwitansi),
      updatedWageReports,
      updatedBkb,
      generatedCount,
    };
  }

  // Initial Deposit in BKB (Termin 1)
  const hasTermin1Bkb = updatedBkb.some((b) => b.noBukti === 'KREDIT-T1' || b.id === 'bkb-init-termin1');
  const termin1Amount = school?.termin1Nilai || (school?.totalAnggaran ? Math.round(school.totalAnggaran * 0.7) : 0);
  if (!hasTermin1Bkb && termin1Amount > 0 && weeksToUse.length > 0) {
    const w1 = weeksToUse[0];
    const w1Dates = resolveWeekDates(w1, yearStr);
    updatedBkb.unshift({
      id: 'bkb-init-termin1',
      tanggal: w1Dates.startDateSlash,
      tanggalObj: w1Dates.startDate,
      bulan: w1Dates.bulan,
      uraian: 'Penerimaan Dana Revitalisasi Termin 1 (70%) ke Rekening Bank',
      noBukti: 'KREDIT-T1',
      penerimaan: termin1Amount,
      pengeluaran: 0,
    });
  }

  const defaultMaterialStore = stores.find((s) => s.kategori === 'MATERIAL') || stores[0] || {
    id: 's-def-mat',
    namaToko: 'Penyedia Bahan Material',
    pemilikNama: 'Penyedia Toko Rekanan',
    pekerjaan: 'Penyedia Bahan Bangunan',
    alamat: school.kabKota || 'Kota/Kabupaten Setempat',
    telepon: '-',
    kategori: 'MATERIAL',
  };
  const defaultPerabotStore = stores.find((s) => s.kategori === 'PERABOT') || defaultMaterialStore;

  const defaultPercetakanStore = stores.find(
    (s) => s.kategori === 'PERCETAKAN' || /percetakan|printing|dexa|cetak/i.test(`${s.namaToko} ${s.pekerjaan || ''}`)
  ) || defaultMaterialStore;

  // A. Generate WEEKLY LABOR WAGES (UK) for EACH ACTIVE WEEK
  activeWeeks.forEach((weekObj) => {
    const resSingle = generateWeeklyTransactionsFromProgressAndRealData({
      targetWeek: weekObj.mingguKe,
      weekObj,
      weeksToUse,
      school,
      workers,
      stores,
      rpdItems,
      realSchoolData,
      existingKwitansi: [],
      existingWageReports: [],
      existingBkb: [],
      splitDays: false,
    });

    resSingle.updatedKwitansi.forEach((kw) => {
      if (kw.tipe === 'UPAH') {
        newKwitansiList.push(kw);
        generatedCount.upah++;
      }
    });

    resSingle.updatedWageReports.forEach((wr) => {
      updatedWageReports.push(wr);
    });
  });

  // A2. Generate MONTHLY MANAGEMENT & CONSULTANT KWITANSI (KONS-P, KONS-W, ADM/SPJ)
  // Dibayarkan setiap akhir bulan kalender, dan khusus bulan terakhir tepat pada tanggal berakhirnya pekerjaan.
  // Nominal mengikuti alur akumulasi bobot mingguan di setiap bulan bersangkutan.
  const monthlyMgmtRes = generateMonthlyManagementTransactions({
    weeksToUse,
    activeWeeks,
    school,
    stores,
    realSchoolData,
    existingKwitansi,
  });

  monthlyMgmtRes.managementKwitansi.forEach((kw) => {
    newKwitansiList.push(kw);
    generatedCount.manajemen++;
  });

  // B. Generate INITIAL PREPARATION (Papan Nama Proyek & SMKK) at Week 1
  if (selectedSet.has(1)) {
    const w1 = weeksToUse.find((w) => w.mingguKe === 1) || activeWeeks[0];
    const w1Dates = resolveWeekDates(w1, yearStr);

    const hasPapan = manualSummary.hasManualPapanNama || newKwitansiList.some((k) => /papan nama/i.test(`${k.noBukti} ${k.uraian}`));
    const hasSmkk = manualSummary.hasManualSmkk || newKwitansiList.some((k) => k.tipe === 'SMKK' || /smkk|k3/i.test(`${k.noBukti} ${k.uraian}`) || /kw-smkk/i.test(k.noBukti || ''));

    // Papan Nama (Cetak Papan Nama Proyek Code: CTK/01/xx, 100% Exact RAB Nominal: 1.099.800)
    if (!hasPapan) {
      const papanRabItem = realSchoolData?.divisions?.flatMap((d) => d.items).find((i) => /papan nama/i.test(i.uraian));
      const papanNominal = papanRabItem ? Math.round(papanRabItem.volume * papanRabItem.hargaSatuan) : 1099800;

      const kwPapanBukti = `CTK/01/${yearStr}`;
      const spbPapanBukti = `SPB-CTK/01/${yearStr}`;
      const isTaxablePapan = papanNominal >= 2000000;

      const papanItems = [
        {
          namaBarang: `Pembuatan & Cetak Papan Nama Proyek Revitalisasi ${school.namaSekolah} (Bahan MMT / Akrilik & Frame Kayu Complete)`,
          volume: 1,
          satuan: 'unit',
          hargaSatuan: papanNominal,
          jumlah: papanNominal,
        },
      ];

      newKwitansiList.push({
        id: `kw-ctk-m1-papan-${Date.now()}`,
        noBukti: kwPapanBukti,
        noSpb: spbPapanBukti,
        tipe: 'CETAK',
        tanggal: w1Dates.startDateSlash,
        tanggalFormatted: w1Dates.startDateFormatted,
        bulan: w1Dates.bulan,
        uraian: `Pembayaran Lunas Biaya Pembuatan & Cetak Papan Nama Proyek Revitalisasi ${school.namaSekolah}, Tahun ${yearStr}, Rincian Terlampir.`,
        penerimaNama: defaultPercetakanStore.pemilikNama || 'Pemilik Percetakan',
        penerimaPekerjaan: `Pemilik ${defaultPercetakanStore.namaToko}`,
        penerimaAlamat: defaultPercetakanStore.alamat || school.kabKota,
        namaToko: defaultPercetakanStore.namaToko,
        items: papanItems,
        nominal: papanNominal,
        isPpn: isTaxablePapan,
        isPph22: isTaxablePapan,
        isPph23: false,
        ppnAmount: isTaxablePapan ? Math.round((papanNominal / 1.11) * 0.11) : 0,
        pph22Amount: isTaxablePapan ? Math.round((papanNominal / 1.11) * 0.015) : 0,
        pph23Amount: 0,
        kategoriBiayaPajak: 'Perencanaan_Pengelolaan',
        keteranganSpb: `Surat Perintah Bayar Biaya Cetak Papan Nama Proyek (${w1Dates.startDateFormatted})`,
        mingguKeRef: 1,
      });
      generatedCount.manajemen++;
    }

    // SMKK / APD
    if (!hasSmkk) {
      const realDivI = realSchoolData?.divisions?.find((d) => d.kode.toUpperCase() === 'I' || /persiapan/i.test(d.uraian));
      const smkkRabs = (realDivI?.items || []).filter(
        (it) => it.kategoriBiaya === 'SMKK' || /smkk|k3|helm|rompi|sepatu boot|sepatu safety|p3k|rambu/i.test(it.uraian)
      );
      const smkkRawItems = smkkRabs.length > 0 ? smkkRabs.map((it) => ({
        namaBarang: it.uraian,
        volume: it.volume,
        satuan: it.satuan,
        hargaSatuan: it.hargaSatuan,
        jumlah: Math.round(it.volume * it.hargaSatuan),
      })) : [
        { namaBarang: 'Penerapan SMKK - Helm kepala', volume: 10, satuan: 'buah', hargaSatuan: 83431, jumlah: 834310 },
        { namaBarang: 'Penerapan SMKK - Rompi', volume: 10, satuan: 'buah', hargaSatuan: 88852, jumlah: 888520 },
        { namaBarang: 'Penerapan SMKK - Sepatu boot', volume: 10, satuan: 'buah', hargaSatuan: 134195, jumlah: 1341950 },
        { namaBarang: 'Penerapan SMKK - Sarung tangan', volume: 10, satuan: 'buah', hargaSatuan: 59763, jumlah: 597630 },
        { namaBarang: 'Penerapan SMKK - Peralatan P3K', volume: 1, satuan: 'set', hargaSatuan: 2500000, jumlah: 2500000 },
        { namaBarang: 'Penerapan SMKK - Rambu-Rambu dan Pengendalian Resiko K3', volume: 1, satuan: 'set', hargaSatuan: 912302, jumlah: 912302 },
        { namaBarang: 'Penerapan SMKK - Tali keselamatan', volume: 1, satuan: 'roll', hargaSatuan: 550206, jumlah: 550206 },
      ];
      const smkkNominal = smkkRawItems.reduce((s, it) => s + it.jumlah, 0);

      newKwitansiList.push({
        id: `kw-smkk-m1-${Date.now()}`,
        noBukti: `01/KW-SMKK/${yearStr}`,
        noSpb: `SPB-01/SMKK/${yearStr}`,
        tipe: 'OPERASIONAL',
        tanggal: w1Dates.startDateSlash,
        tanggalFormatted: w1Dates.startDateFormatted,
        bulan: w1Dates.bulan,
        uraian: `Pembayaran Lunas Pengadaan Perlengkapan SMKK & K3 Lapangan (${smkkRawItems.map((i) => i.namaBarang.replace('Penerapan SMKK - ', '')).slice(0, 4).join(', ')}), Revitalisasi ${school.namaSekolah}, Tahun ${yearStr}, Rincian Terlampir.`,
        penerimaNama: defaultMaterialStore.pemilikNama || 'Penyedia SMKK',
        penerimaPekerjaan: 'Penyedia APD & Keselamatan Kerja',
        penerimaAlamat: defaultMaterialStore.alamat || school.kabKota,
        namaToko: defaultMaterialStore.namaToko,
        items: smkkRawItems,
        nominal: smkkNominal,
        isPpn: smkkNominal >= 2000000,
        isPph22: smkkNominal >= 2000000,
        isPph23: false,
        ppnAmount: smkkNominal >= 2000000 ? Math.round((smkkNominal / 1.11) * 0.11) : 0,
        pph22Amount: smkkNominal >= 2000000 ? Math.round((smkkNominal / 1.11) * 0.015) : 0,
        pph23Amount: 0,
        kategoriBiayaPajak: 'Peralatan',
        keteranganSpb: `Surat Perintah Bayar Pengadaan SMKK & K3 Minggu Ke-1 (${w1Dates.startDateFormatted})`,
        mingguKeRef: 1,
      });
      generatedCount.smkk++;
    }
  }

  // C. CONSTRUCTION PHASE BATCH PROCUREMENT (Dropping per Tahapan Konstruksi Nyata)
  const BATCH_SPECS = [
    {
      id: 'BATCH_1',
      title: 'Pondasi & Struktur Bawah',
      category: 'MATERIAL' as const,
      matcher: (kode: string, uraian: string) =>
        /tanah|galian|urugan|pondasi|batu kali|batu belah|aanstamping|sloof|beton bawah/i.test(uraian) ||
        kode === 'II' || kode === 'III',
    },
    {
      id: 'BATCH_2',
      title: 'Pasangan Dinding, Struktur Atas & Plesteran',
      category: 'MATERIAL' as const,
      matcher: (kode: string, uraian: string) =>
        (/dinding|bata|hebel|batako|plesteran|acian|kolom|ring balok|balok praktis/i.test(uraian) ||
        kode === 'IV') && !/pintu|kusen|jendela|kaca/i.test(uraian),
    },
    {
      id: 'BATCH_3',
      title: 'Rangka Atap, Penutup Atap & Plafon',
      category: 'MATERIAL' as const,
      matcher: (kode: string, uraian: string) =>
        /atap|kuda-kuda|baja ringan|spandek|genteng|nok|talang|plafon|langit/i.test(uraian) ||
        kode === 'VI' || kode === 'VII',
    },
    {
      id: 'BATCH_KUSEN',
      title: 'Fabrikasi & Pengadaan Kusen, Pintu & Jendela',
      category: 'KUSEN' as const,
      matcher: (kode: string, uraian: string) =>
        /pintu|kusen|kosen|jendela|ventilasi|boven|kayu.*kaca|kaca.*besi/i.test(uraian) ||
        kode === 'V',
    },
    {
      id: 'BATCH_4',
      title: 'Finishing, Lantai Keramik, Cat & MEP/Sanitasi',
      category: 'MATERIAL' as const,
      matcher: (kode: string, uraian: string) =>
        /cat|finishing|keramik|granit|lantai|listrik|lampu|sanitasi|pipa|kloset/i.test(uraian) ||
        kode === 'VIII' || kode === 'IX' || kode === 'X',
    },
    {
      id: 'BATCH_5',
      title: 'Pengadaan Meubilair / Perabot',
      category: 'PERABOT' as const,
      matcher: (kode: string, uraian: string) =>
        /perabot|mebel|meubilair|meubeler|kursi|meja|lemari|rak|loker|furnitur|ruang kelas/i.test(uraian) || kode === 'XII' || kode === 'XIII',
    },
  ];

  BATCH_SPECS.forEach((batch, bIdx) => {
    const matchingDivMap = new Map<string, { kode: string; uraian: string; bobotTotal: number; cumPrestasi: number }>();
    let earliestActiveWeek: number | null = null;

    activeWeeks.forEach((w) => {
      (w.divisions || []).forEach((d) => {
        if (d.kategori === 'MANAJEMEN' || /perencana|pengawas|administrasi/i.test(d.uraian)) return;
        if (batch.matcher(d.kode, d.uraian)) {
          const divPrestasi = d.prestasiMingguIni || 0;
          if (divPrestasi > 0) {
            if (earliestActiveWeek === null || w.mingguKe < earliestActiveWeek) {
              earliestActiveWeek = w.mingguKe;
            }
          }
          const prev = matchingDivMap.get(d.id || d.kode);
          if (prev) {
            prev.cumPrestasi += divPrestasi;
          } else {
            matchingDivMap.set(d.id || d.kode, {
              kode: d.kode,
              uraian: d.uraian,
              bobotTotal: d.bobotTotal,
              cumPrestasi: divPrestasi,
            });
          }
        }
      });
    });

    if (earliestActiveWeek === null || matchingDivMap.size === 0) return;

    const batchBahanItems: { namaBarang: string; volume: number; satuan: string; hargaSatuan: number; jumlah: number; isBarangPabrikasi?: boolean; tags?: string[]; kategoriBiaya?: string }[] = [];
    const batchAlatItems: { namaBarang: string; volume: number; satuan: string; hargaSatuan: number; jumlah: number }[] = [];

    matchingDivMap.forEach((divData) => {
      const progressRatio = divData.bobotTotal > 0 ? Math.min(1, Math.max(0, divData.cumPrestasi / divData.bobotTotal)) : 0;
      if (progressRatio <= 0) return;

      const divCode = divData.kode.toUpperCase();
      const isMeubilairBatch = batch.category === 'PERABOT' || /perabot|mebel|meubilair|meubeler|XII/i.test(`${divData.kode} ${divData.uraian}`);
      const realDiv = realSchoolData?.divisions?.find((rd) => {
        const rdCode = rd.kode.toUpperCase();
        if (rdCode === divCode) return true;
        const rdUraian = rd.uraian.toLowerCase();
        const dUraian = divData.uraian.toLowerCase();
        if (rdUraian.includes(dUraian) || dUraian.includes(rdUraian)) return true;
        if (isMeubilairBatch && /perabot|mebel|meubilair|meubeler|XII/i.test(`${rd.kode} ${rd.uraian}`)) return true;
        return false;
      });

      if (realDiv && realDiv.items && realDiv.items.length > 0) {
        realDiv.items.forEach((it) => {
          if (/papan nama|smkk|k3|helm|rompi|sepatu boot|sepatu safety|p3k/i.test(it.uraian)) return;

          // Solusi 2: Penanda Tagging / Tautan Item RAB (Skip jika sudah dibelanjakan mandiri)
          if (it.statusBelanja === 'SUDAH_DIBELANJAKAN_MANDIRI' || manualSummary.fullyAbsorbedRabIds.has(it.id)) {
            return;
          }

          // Solusi 1: Sistem Pengurang Kuota RAB Otomatis (Smart Budget Absorption)
          const normKey = getCanonicalMaterialKey(it.uraian);
          const manualSpent = Math.max(
            manualSummary.spentByRabId.get(it.id) || 0,
            manualSummary.spentByCanonicalName.get(normKey) || 0
          );
          const remainingRabVol = Math.max(0, it.volume - manualSpent);
          if (remainingRabVol <= 0) {
            return; // 100% kuota terserap oleh kwitansi manual
          }

          const isFullAbsorption = progressRatio >= 0.95;
          let execVol = isFullAbsorption
            ? remainingRabVol
            : Math.round(remainingRabVol * progressRatio * 1000) / 1000;

          if (execVol <= 0 && progressRatio > 0 && (it.isBarangPabrikasi || (it.tags && it.tags.some((t) => /siplah|fur/i.test(t))) || isMeubilairBatch)) {
            execVol = Math.max(1, Math.min(remainingRabVol, 1));
          }
          if (execVol <= 0) return;
          const execJml = Math.round(execVol * it.hargaSatuan);
          if (execJml <= 0) return;

          if (it.statusBelanja === 'DIALIHKAN') {
            if (it.targetReallokasi !== 'UPAH') {
              const dec = decomposeRealisticBahanAndUpah(divData.uraian || it.uraian, execJml, 0);
              batchBahanItems.push(...dec.bahanItems);
            }
            return;
          }

          const ahspMatch = (realSchoolData?.ahspList || []).find((ah) => {
            if (it.ahspIdRef && ah.id === it.ahspIdRef) return true;
            const lAh = (ah.namaPekerjaan || '').toLowerCase().trim();
            const lRab = it.uraian.toLowerCase().trim();
            return lAh === lRab || lAh.includes(lRab) || lRab.includes(lAh);
          });

          // UNIT PRESERVATION ENGINE:
          // Kusen, Pintu, Jendela, Meja, Kursi with unit/set/buah or isBarangPabrikasi must NOT be broken into retail profile aluminium m', kaca m2, sekrup, engsel, etc.
          const isPreserved =
            (it.tags && it.tags.some((t) => t.toUpperCase() === 'FUR')) ||
            it.isBarangPabrikasi ||
            isPreservedUnitItem(it.uraian, it.satuan, it.isBarangPabrikasi);
          if (isPreserved) {
            let unitBahanPrice = it.hargaSatuan;
            if (!unitBahanPrice || unitBahanPrice <= 0) {
              if (ahspMatch && ahspMatch.komponen && ahspMatch.komponen.length > 0) {
                const compBahanList = ahspMatch.komponen.filter(
                  (c) => c.kategori !== 'UPAH' && !/tukang|pekerja|mandor/i.test(c.uraian) && c.kategori !== 'ALAT' && !/molen|sewa|scaffolding/i.test(c.uraian)
                );
                const totalBahanInAhsp = compBahanList.reduce(
                  (s, c) => s + ((c.hargaSatuan || 0) * (c.koefisien || 1)),
                  0
                );
                if (totalBahanInAhsp > 0) {
                  unitBahanPrice = totalBahanInAhsp;
                }
              }
            }
            batchBahanItems.push({
              namaBarang: it.uraian,
              volume: execVol,
              satuan: it.satuan || 'unit',
              hargaSatuan: unitBahanPrice,
              jumlah: Math.round(execVol * unitBahanPrice),
              isBarangPabrikasi: true,
              tags: it.tags,
              kategoriBiaya: it.kategoriBiaya,
            } as any);
            return;
          }

          if (ahspMatch && ahspMatch.komponen && ahspMatch.komponen.length > 0) {
            ahspMatch.komponen.forEach((comp) => {
              const compVol = Math.round((comp.koefisien || 1) * execVol * 1000) / 1000;
              if (compVol <= 0) return;
              const compJml = Math.round(compVol * (comp.hargaSatuan || 10000));
              if (compJml <= 0) return;

              const isUpah = comp.kategori === 'UPAH' || /tukang|pekerja|mandor/i.test(comp.uraian);
              const isAlat = comp.kategori === 'ALAT' || /molen|sewa|scaffolding|perancah/i.test(comp.uraian);

              if (!isUpah && !isAlat) {
                batchBahanItems.push({
                  namaBarang: comp.uraian,
                  volume: compVol,
                  satuan: comp.satuan || 'unit',
                  hargaSatuan: comp.hargaSatuan || 50000,
                  jumlah: compJml,
                });
              } else if (isAlat) {
                batchAlatItems.push({
                  namaBarang: comp.uraian,
                  volume: compVol,
                  satuan: comp.satuan || 'set',
                  hargaSatuan: comp.hargaSatuan || 50000,
                  jumlah: compJml,
                });
              }
            });
          } else {
            const isUpahBahan = /upah.*bahan|bahan.*upah/i.test(it.kategoriBiaya || '');
            if (isUpahBahan) {
              const bahanNom = Math.round(execJml * 0.65);
              const dec = decomposeRealisticBahanAndUpah(it.uraian, bahanNom, 0);
              batchBahanItems.push(...dec.bahanItems);
            } else if (it.kategoriBiaya === 'ALAT') {
              batchAlatItems.push({
                namaBarang: it.uraian,
                volume: execVol,
                satuan: it.satuan,
                hargaSatuan: it.hargaSatuan,
                jumlah: execJml,
              });
            } else if (it.kategoriBiaya !== 'UPAH' && it.kategoriBiaya !== 'SMKK') {
              const isComp = !isPureDirectMaterial(it.uraian, it.satuan);
              if (isComp && execJml >= 25000) {
                const dec = decomposeRealisticBahanAndUpah(it.uraian, execJml, 0);
                batchBahanItems.push(...dec.bahanItems);
              } else {
                batchBahanItems.push({
                  namaBarang: it.uraian,
                  volume: execVol,
                  satuan: it.satuan,
                  hargaSatuan: it.hargaSatuan,
                  jumlah: execJml,
                });
              }
            }
          }
        });
      } else {
        const matchedRpd = rpdItems.filter(
          (it) =>
            !/papan nama|smkk|k3/i.test(it.uraian) &&
            (it.uraian.toLowerCase().includes(divData.uraian.toLowerCase()) ||
            divData.uraian.toLowerCase().includes(it.uraian.toLowerCase()) ||
            it.kategori === 'BAHAN_BARU')
        );
        matchedRpd.slice(0, 3).forEach((it) => {
          const volProp = Math.max(0.1, Math.round(progressRatio * it.volume100 * 100) / 100);
          batchBahanItems.push({
            namaBarang: it.uraian,
            volume: volProp,
            satuan: it.satuan,
            hargaSatuan: it.hargaSatuan,
            jumlah: Math.round(volProp * it.hargaSatuan),
          });
        });
      }
    });

    if (batchBahanItems.length === 0 && batchAlatItems.length === 0) return;

    const dropWeek = weeksToUse.find((w) => w.mingguKe === earliestActiveWeek) || activeWeeks[0];
    const dropDates = resolveWeekDates(dropWeek, yearStr);
    const isKusen = (batch as any).category === 'KUSEN' || /kusen|pintu|jendela/i.test(batch.title);
    const isPerabot = batch.category === 'PERABOT';
    const kusenStore = stores.find(
      (s) => /zami|kayu|mebel|kusen|alum|bengkel/i.test(`${s.namaToko} ${s.pekerjaan || ''}`) || s.kategori === 'PERABOT'
    ) || defaultMaterialStore;
    const targetStore = isKusen ? kusenStore : (isPerabot ? defaultPerabotStore : defaultMaterialStore);

    if (batchBahanItems.length > 0) {
      const siplahBatchItems = batchBahanItems.filter(
        (i) =>
          (i.tags && i.tags.some((t) => /siplah/i.test(t))) ||
          (i as any).kategoriBiaya === 'SIPLAH' ||
          /siplah/i.test(i.namaBarang)
      );

      const regularBatchItems = batchBahanItems.filter(
        (i) =>
          !((i.tags && i.tags.some((t) => /siplah/i.test(t))) ||
          (i as any).kategoriBiaya === 'SIPLAH' ||
          /siplah/i.test(i.namaBarang))
      );

      // Handle SipLah Tagged Items in Batch Mode
      if (siplahBatchItems.length > 0) {
        const defaultSiplahStore = stores.find(
          (s) => s.kategori === 'SIPLAH' || /siplah/i.test(`${s.namaToko} ${s.pekerjaan || ''}`)
        ) || {
          id: 's-def-siplah',
          namaToko: 'Toko Mitra SipLah Online',
          pemilikNama: 'Mitra Penyedia SipLah',
          pekerjaan: 'Penyedia Barang/Jasa Mitra SipLah',
          alamat: 'Platform Mitra SipLah / ' + (school?.kabKota || 'Kota/Kabupaten Setempat'),
          telepon: '0812-9900-1122',
          npwp: '01.234.567.8-901.000',
          kategori: 'SIPLAH' as const,
        };

        const storeGroups = new Map<string, { store: ReturnType<typeof resolveStoreFromItemTags>; items: any[] }>();
        for (const item of siplahBatchItems) {
          const store = resolveStoreFromItemTags(item, stores, defaultSiplahStore, school?.kabKota);
          const key = store.namaToko;
          if (!storeGroups.has(key)) {
            storeGroups.set(key, { store, items: [] });
          }
          storeGroups.get(key)!.items.push(item);
        }

        let storeIdx = 0;
        for (const [storeName, group] of storeGroups.entries()) {
          const normalizedSiplah = normalizeMaterialItems(group.items);
          const totalSiplahNominal = normalizedSiplah.reduce((s, it) => s + it.jumlah, 0);

          if (totalSiplahNominal > 0) {
            const dateInfo = getDateInWeek(dropDates.startDate, 1); // Selasa (Awal Pekan)
            const seqNo = (earliestActiveWeek || 1) * 10 + bIdx * 2 + storeIdx + 1;
            const seqSuffix = storeGroups.size > 1 ? `-${storeIdx + 1}` : '';
            const kwBukti = `SipLah/${String(seqNo).padStart(2, '0')}${seqSuffix}/${yearStr}`;
            const spbBukti = `SPB-SipLah/${String(seqNo).padStart(2, '0')}${seqSuffix}/${yearStr}`;
            const isTaxable = totalSiplahNominal >= 2000000;
            const ppn = isTaxable ? Math.round((totalSiplahNominal / 1.11) * 0.11 * 100) / 100 : 0;
            const pph22 = isTaxable ? Math.round((totalSiplahNominal / 1.11) * 0.015 * 100) / 100 : 0;

            const topNames = normalizedSiplah.map((i) => i.namaBarang).slice(0, 3).join(', ');
            newKwitansiList.push({
              id: `kw-batch-siplah-m${earliestActiveWeek}-${bIdx}-${storeIdx}-${Date.now()}`,
              noBukti: kwBukti,
              noSpb: spbBukti,
              tipe: 'OPERASIONAL',
              tanggal: dateInfo.dateSlash,
              tanggalFormatted: dateInfo.dateFormatted,
              bulan: dateInfo.bulan,
              uraian: `Pembayaran Lunas Belanja Barang via ${group.store.namaToko} Awal Pekan (${topNames}), Tahap ${batch.title} Revitalisasi ${school?.namaSekolah || 'Sekolah'}, Tahun ${yearStr}.`,
              penerimaNama: group.store.pemilikNama || 'Mitra SipLah',
              penerimaPekerjaan: `Mitra Penyedia ${group.store.namaToko}`,
              penerimaAlamat: group.store.alamat || school?.kabKota || '',
              namaToko: group.store.namaToko,
              items: consolidateAndStandardizeReceiptItems(normalizedSiplah, totalSiplahNominal),
              nominal: totalSiplahNominal,
              isPpn: isTaxable,
              isPph22: isTaxable,
              isPph23: false,
              ppnAmount: ppn,
              pph22Amount: pph22,
              pph23Amount: 0,
              kategoriBiayaPajak: 'Siplah',
              keteranganSpb: `Surat Perintah Bayar Belanja ${group.store.namaToko} Awal Pekan Tahap ${batch.title} (${dateInfo.dateFormatted})`,
              mingguKeRef: earliestActiveWeek || 1,
            });
            generatedCount.bahan++;
            storeIdx++;
          }
        }
      }

      // Handle Regular Non-SipLah Batch Items
      if (regularBatchItems.length > 0) {
        const normalizedItems = normalizeMaterialItems(regularBatchItems);
        const totalBatchNominal = normalizedItems.reduce((s, it) => s + it.jumlah, 0);

        if (totalBatchNominal > 0) {
          const shouldSplit = splitDays && normalizedItems.length > 3 && totalBatchNominal >= 15000000;
          const chunks = shouldSplit
            ? [
                normalizedItems.slice(0, Math.ceil(normalizedItems.length / 2)),
                normalizedItems.slice(Math.ceil(normalizedItems.length / 2)),
              ]
            : [normalizedItems];

          chunks.forEach((chunkItems, cIdx) => {
            const chunkNominal = chunkItems.reduce((s, it) => s + it.jumlah, 0);
            if (chunkNominal <= 0) return;

            // METODE PEMBELIAN BAHAN MATERIAL AWAL HARI SETIAP MINGGUNYA:
            // Dilakukan pada awal minggu dimulainya fase/minggu berjalan (Senin: offset 0, atau Selasa: offset 1)
            const dayOffset = shouldSplit ? (cIdx === 0 ? 0 : 1) : 0;
            const dateInfo = getDateInWeek(dropDates.startDate, dayOffset);
            const seqNo = (earliestActiveWeek || 1) * 10 + bIdx * 2 + cIdx + 1;
            const kwBukti = isKusen
              ? `Fur/${String(seqNo).padStart(2, '0')}/${yearStr}`
              : `${String(seqNo).padStart(2, '0')}/KW-MAT/${yearStr}`;
            const spbBukti = isKusen
              ? `SPB-Fur/${String(seqNo).padStart(2, '0')}/${yearStr}`
              : `SPB-${String(seqNo).padStart(2, '0')}/MAT/${yearStr}`;

            const isTaxable = chunkNominal >= 2000000;
            const ppn = isTaxable ? Math.round((chunkNominal / 1.11) * 0.11 * 100) / 100 : 0;
            const pph22 = isTaxable ? Math.round((chunkNominal / 1.11) * 0.015 * 100) / 100 : 0;

            const topNames = chunkItems.map((i) => i.namaBarang).slice(0, 3).join(', ');
            const resolvedChunkStore = chunkItems.length > 0
              ? resolveStoreFromItemTags(chunkItems[0], stores, targetStore, school?.kabKota)
              : targetStore;
            const finalStore = (resolvedChunkStore && resolvedChunkStore.namaToko)
              ? resolvedChunkStore
              : targetStore;

            newKwitansiList.push({
              id: `kw-batch-m${earliestActiveWeek}-${bIdx}-${cIdx}-${Date.now()}`,
              noBukti: kwBukti,
              noSpb: spbBukti,
              tipe: isKusen ? 'PINTU_JENDELA' : (isPerabot ? 'PERABOT' : 'MATERIAL'),
              tanggal: dateInfo.dateSlash,
              tanggalFormatted: dateInfo.dateFormatted,
              bulan: dateInfo.bulan,
              uraian: isKusen
                ? `Pembayaran Lunas Pengadaan & Fabrikasi Kusen, Pintu & Jendela (${topNames}), Tahap Awal Pekan Revitalisasi ${school?.namaSekolah || 'Sekolah'}, Tahun ${yearStr}, Rincian Terlampir.`
                : `Pembayaran Lunas Biaya Pembelian Material/Bahan Awal Pekan (${topNames}), Tahap ${batch.title} Mengacu Bobot Fisik Bangunan Revitalisasi ${school?.namaSekolah || 'Sekolah'}, Tahun ${yearStr}, Daftar Terlampir.`,
              penerimaNama: finalStore.pemilikNama || 'Pemilik Toko Rekanan',
              penerimaPekerjaan: isKusen ? (finalStore.pekerjaan || 'Pengrajin Kusen & Pintu Aluminium') : `Pemilik ${finalStore.namaToko}`,
              penerimaAlamat: finalStore.alamat || school?.kabKota || '',
              namaToko: finalStore.namaToko,
              items: consolidateAndStandardizeReceiptItems(chunkItems, chunkNominal),
              nominal: chunkNominal,
              isPpn: isTaxable,
              isPph22: isTaxable,
              isPph23: false,
              ppnAmount: ppn,
              pph22Amount: pph22,
              pph23Amount: 0,
              kategoriBiayaPajak: isPerabot ? 'Perabot' : 'Konstruksi',
              keteranganSpb: `Surat Perintah Bayar Pembelian Bahan Material Awal Pekan Tahap ${batch.title} (${dateInfo.dateFormatted})`,
              mingguKeRef: earliestActiveWeek || 1,
            });
            generatedCount.bahan++;
          });
        }
      }
    }

    if (batchAlatItems.length > 0) {
      const normalizedAlat = normalizeMaterialItems(batchAlatItems);
      const alatNominal = normalizedAlat.reduce((s, it) => s + it.jumlah, 0);
      if (alatNominal > 0) {
        const dateInfo = getDateInWeek(dropDates.startDate, 0); // Senin (Awal Pekan)
        const seqNo = (earliestActiveWeek || 1) * 10 + bIdx + 7;
        const kwAlatBukti = `${String(seqNo).padStart(2, '0')}/KW-ALAT/${yearStr}`;
        const spbBukti = `SPB-${String(seqNo).padStart(2, '0')}/ALAT/${yearStr}`;

        newKwitansiList.push({
          id: `kw-alat-batch-m${earliestActiveWeek}-${bIdx}-${Date.now()}`,
          noBukti: kwAlatBukti,
          noSpb: spbBukti,
          tipe: 'OPERASIONAL',
          tanggal: dateInfo.dateSlash,
          tanggalFormatted: dateInfo.dateFormatted,
          bulan: dateInfo.bulan,
          uraian: `Pembayaran Lunas Biaya Sewa/Pengadaan Alat Bantu Kerja Awal Pekan (${normalizedAlat.map((i) => i.namaBarang).join(', ')}), Tahap ${batch.title} Revitalisasi ${school.namaSekolah}, Tahun ${yearStr}.`,
          penerimaNama: defaultMaterialStore.pemilikNama || 'Penyedia Sewa Alat',
          penerimaPekerjaan: 'Penyedia Alat & Perlengkapan',
          penerimaAlamat: defaultMaterialStore.alamat || school.kabKota,
          namaToko: defaultMaterialStore.namaToko,
          items: normalizedAlat,
          nominal: alatNominal,
          isPpn: false,
          isPph22: false,
          isPph23: true,
          ppnAmount: 0,
          pph22Amount: 0,
          pph23Amount: Math.round(alatNominal * 0.02 * 100) / 100,
          kategoriBiayaPajak: 'Peralatan',
          keteranganSpb: `Surat Perintah Bayar Sewa Alat Tahap ${batch.title} (${dateInfo.dateFormatted})`,
          mingguKeRef: earliestActiveWeek || 1,
        });
        generatedCount.alat++;
      }
    }
  });

  return {
    updatedKwitansi: renumberKwitansiChronologically(deduplicateKwitansiList(newKwitansiList), yearStr),
    updatedWageReports,
    updatedBkb,
    generatedCount,
  };
}

/**
 * Strict Progress Calibration Engine (Anti-Negative Balance):
 * Synchronizes all Kwitansis, Wage Reports, and BKU to match the current real progress.
 *
 * Rules:
 * 1. ONLY generate transactions for weeks where bobotRealisasi > 0 (or divisions have prestasiMingguIni > 0).
 * 2. Any week with 0% progress MUST HAVE ZERO material/wage kwitansi (purged completely).
 * 3. Material volumes are strictly proportional: (prestasiMingguIni / bobotTotal) * volume.
 * 4. Upah is paid strictly via Weekly Piece-Rate (Borongan Mingguan), exactly 1 UK receipt per active week.
 * 5. Cumulative expenditure is strictly capped by cumulative progress %:
 *    Cumulative Expenditure <= (Cumulative Bobot / 100) * Pagu Anggaran + Initial Prep/Consulting.
 * 6. Guarantees that at 22.2% progress, total expenditure is ~Rp 120M - Rp 135M, and cash balance is strongly POSITIVE!
 */
/**
 * Universal Cumulative Realized Progress Calculator:
 * Calculates exact cumulative progress % matching the latest active week in progressWeeks
 */
export function calculateCumulativeRealizedProgress(
  progressWeeks: ProjectProgressWeek[] = [],
  weekLimit?: number
): number {
  if (!progressWeeks || progressWeeks.length === 0) return 0;

  const maxAvailableWeek = Math.max(...progressWeeks.map((w) => w.mingguKe), 1);
  const effLimit = weekLimit && weekLimit > 0 ? weekLimit : maxAvailableWeek;

  const weeksToLimit = progressWeeks.filter((w) => w.mingguKe <= effLimit);
  if (weeksToLimit.length === 0) return 0;

  const activeWeeks = weeksToLimit.filter(
    (w) =>
      (w.bobotRealisasi && w.bobotRealisasi > 0) ||
      w.divisions?.some((d) => (d.prestasiMingguIni || 0) > 0 || (d.prestasiSdMingguIni || 0) > 0)
  );

  if (activeWeeks.length === 0) return 0;

  const lastActiveWeek = activeWeeks[activeWeeks.length - 1];
  const lastWeekBobot = lastActiveWeek?.bobotRealisasi || 0;
  let divSdTotal = 0;
  if (lastActiveWeek?.divisions && lastActiveWeek.divisions.length > 0) {
    divSdTotal = lastActiveWeek.divisions.reduce((s, d) => s + (d.prestasiSdMingguIni || 0), 0);
  }

  const finalBobot = Math.max(lastWeekBobot, divSdTotal);
  return Math.round(finalBobot * 100) / 100;
}

/**
 * Opsi A: Menyelaraskan kwitansi belanja bahan material terakhir terhadap pagu anggaran
 * agar total pengeluaran kwitansi tepat sama dengan target anggaran (saldo BKU/BKT Rp 0 / Nihil).
 * Hanya memotong belanja bahan material (tidak memotong upah tukang, perencana, pengawas, pengelola, SMKK, cetak, siplah).
 */
export function balanceFinalMaterialKwitansiToBudget(
  kwitansiList: KwitansiDocument[],
  paguTotal: number,
  targetRatio: number = 1.0
): { balancedKwitansi: KwitansiDocument[]; adjustedAmount: number } {
  if (!kwitansiList || kwitansiList.length === 0 || !paguTotal || paguTotal <= 0) {
    return { balancedKwitansi: kwitansiList, adjustedAmount: 0 };
  }

  const targetBudget = Math.round(paguTotal * targetRatio);
  const currentTotal = kwitansiList.reduce((s, k) => s + (k.nominal || 0), 0);
  const diff = currentTotal - targetBudget;

  if (diff <= 0) {
    return { balancedKwitansi: kwitansiList, adjustedAmount: 0 };
  }

  // Cari seluruh kwitansi belanja bahan material yang bukan manual/locked dan bukan pembayaran pasti
  const candidateIndices: number[] = [];
  kwitansiList.forEach((k, idx) => {
    const isManual = isReceiptLocked(k);
    const isFixed = isFixedNonSplitPayment(k);
    if (k.tipe === 'MATERIAL' && !isFixed && !isManual && (k.nominal || 0) > 0) {
      candidateIndices.push(idx);
    }
  });

  if (candidateIndices.length === 0) {
    return { balancedKwitansi: kwitansiList, adjustedAmount: 0 };
  }

  const resultList = [...kwitansiList];
  let remainingDiff = diff;

  // Mundur dari kwitansi material paling akhir (minggu terakhir)
  for (let i = candidateIndices.length - 1; i >= 0 && remainingDiff > 0; i--) {
    const kwIdx = candidateIndices[i];
    const kw = resultList[kwIdx];
    const deduct = Math.min(kw.nominal, remainingDiff);
    const newNominal = Math.max(0, kw.nominal - deduct);

    const items = [...(kw.items || [])];
    if (items.length > 0) {
      const sortedItemIndices = items
        .map((item, idx) => ({ idx, jumlah: item.jumlah || 0 }))
        .sort((a, b) => b.jumlah - a.jumlah);

      let itemDeductRemaining = deduct;
      for (const itemMeta of sortedItemIndices) {
        if (itemDeductRemaining <= 0) break;
        const curItem = items[itemMeta.idx];
        const curDeduct = Math.min(curItem.jumlah || 0, itemDeductRemaining);
        const newJml = Math.max(0, (curItem.jumlah || 0) - curDeduct);
        const newVol = curItem.hargaSatuan > 0 ? Math.round((newJml / curItem.hargaSatuan) * 100) / 100 : curItem.volume;
        items[itemMeta.idx] = {
          ...curItem,
          jumlah: newJml,
          volume: newVol > 0 ? newVol : 1,
        };
        itemDeductRemaining -= curDeduct;
      }
    }

    const isPpn = Boolean(kw.isPpn);
    const isPph22 = Boolean(kw.isPph22);
    const ppnAmount = isPpn ? Math.round((newNominal * 11) / 111) : 0;
    const pph22Amount = isPph22 ? Math.round((newNominal * 1.5) / 100) : 0;

    resultList[kwIdx] = {
      ...kw,
      nominal: newNominal,
      items,
      ppnAmount,
      pph22Amount,
    };

    remainingDiff -= deduct;
  }

  const adjustedAmount = diff - remainingDiff;
  return { balancedKwitansi: resultList, adjustedAmount };
}

export function calibrateAllTransactionsToCurrentProgress(params: {
  school: SchoolMasterData;
  kwitansiList: KwitansiDocument[];
  progressWeeks: ProjectProgressWeek[];
  workers?: any[];
  stores?: StoreVendor[];
  rpdItems?: any[];
  realSchoolData?: any;
  existingBkb?: BkbTransaction[];
  bkuWeekLimit?: number;
}): {
  calibratedKwitansi: KwitansiDocument[];
  calibratedWageReports: WeeklyWageReport[];
  calibratedBkb: BkbTransaction[];
  cumulativeBobot: number;
  totalExpenditure: number;
  activeWeeksCount: number;
} {
  const {
    school,
    kwitansiList,
    progressWeeks,
    workers = [],
    stores = [],
    rpdItems = [],
    realSchoolData,
    existingBkb = [],
    bkuWeekLimit,
  } = params;
  const targetYear = school?.tahunAnggaran?.trim() || '2026';
  const paguTotal = school?.totalAnggaran || 552457000;

  const effLimit = bkuWeekLimit && bkuWeekLimit > 0 ? bkuWeekLimit : Math.max(...progressWeeks.map((w) => w.mingguKe), 1);

  // 1. Identify all active weeks up to effLimit that actually have physical progress
  const activeWeeks = progressWeeks.filter((w) => {
    if (w.mingguKe > effLimit) return false;
    const totalDivPrestasi = (w.divisions || []).reduce((ds, d) => ds + (d.prestasiMingguIni || 0), 0);
    return totalDivPrestasi > 0.0001 || (w.bobotRealisasi && w.bobotRealisasi > 0);
  });

  const activeWeekNums = new Set(activeWeeks.map((w) => w.mingguKe));
  const cumulativeBobot = calculateCumulativeRealizedProgress(progressWeeks, effLimit);

  // If NO active progress at all (0% across all weeks):
  if (activeWeeks.length === 0) {
    return {
      calibratedKwitansi: [],
      calibratedWageReports: [],
      calibratedBkb: existingBkb, // MUST PRESERVE USER-FILLED BKB!
      cumulativeBobot: 0,
      totalExpenditure: 0,
      activeWeeksCount: 0,
    };
  }

  // 2. Only preserve manual user-created kwitansi or baseline non-weekly contracts
  // Auto-generated weekly transactions will be cleanly and freshly regenerated in Step 3
  const preservedBase = kwitansiList.filter((k) => {
    const isAutoId = (k.id || '').startsWith('kw-') || (k.id || '').startsWith('bku-') || (k.id || '').includes('mgt-');
    if (!isAutoId || (k.id || '').includes('manual')) {
      return true;
    }
    return false;
  });

  const healedPreserved = healKwitansiList(preservedBase, targetYear);

  let currentKwitansi: KwitansiDocument[] = [...healedPreserved];
  let currentWageReports: WeeklyWageReport[] = [];
  // CRITICAL RULE: PRESERVE ALL USER-ENTERED BKB RECORDS!
  // Menu BKB yang sudah diisi TIDAK BOLEH terhapus saat kalibrasi maupun pembersihan data ganda
  let currentBkb: BkbTransaction[] = existingBkb && existingBkb.length > 0 ? [...existingBkb] : [];

  // 3. Generate for active weeks using realistic batch construction procurement
  const multiRes = generateRealisticMultiWeekTransactions({
    selectedWeekNums: activeWeeks.map((w) => w.mingguKe),
    weeksToUse: progressWeeks,
    school,
    workers,
    stores,
    rpdItems,
    realSchoolData,
    existingKwitansi: currentKwitansi,
    existingWageReports: currentWageReports,
    existingBkb: currentBkb,
    splitDays: true,
    procurementMode: 'BATCH_CONSTRUCTION',
  });

  currentKwitansi = multiRes.updatedKwitansi;
  currentWageReports = multiRes.updatedWageReports;
  currentBkb = multiRes.updatedBkb;

  // 4. Cumulative Construction Progress Scaling:
  // PROTEKSI & KUNCI NOMINAL FIXED ITEM (Papan Nama Proyek & SMKK Exemption):
  // Biaya persiapan Cetak Papan Nama Proyek (CTK/01/xx) dan SMKK (K3) adalah pengeluaran pasti (fixed lump sum)
  // yang harus dikunci sesuai nilai RAB/AHSP (Papan Nama = 1.099.800) dan TIDAK BOLEH dipotong/diskalakan oleh bobot progres mingguan.
  const papanRabItem = realSchoolData?.divisions?.flatMap((d: any) => d.items).find((i: any) => /papan nama/i.test(i.uraian));
  const exactPapanNominal = papanRabItem ? Math.round(papanRabItem.volume * papanRabItem.hargaSatuan) : 1099800;

  const realDivI = realSchoolData?.divisions?.find((d: any) => d.kode?.toUpperCase() === 'I' || /persiapan/i.test(d.uraian));
  const smkkRabs = (realDivI?.items || []).filter(
    (it: any) => it.kategoriBiaya === 'SMKK' || /smkk|k3|helm|rompi|sepatu boot|sepatu safety|p3k|rambu/i.test(it.uraian)
  );
  const exactSmkkNominal = smkkRabs.length > 0
    ? smkkRabs.reduce((acc: number, it: any) => acc + Math.round((it.volume || 1) * (it.hargaSatuan || 0)), 0)
    : 0;

  const isFixedLumpSumItem = (k: KwitansiDocument) => {
    // Solusi 3: Mode Proteksi Kunci (Locked Manual Receipt)
    const isManualOrLocked = isReceiptLocked(k);
    if (isManualOrLocked) return true;

    const bukti = (k.noBukti || '').toUpperCase();
    const uraian = (k.uraian || '').toLowerCase();
    const tipe = (k.tipe || '').toUpperCase();
    const isSiplahOrMeub =
      /siplah/i.test(bukti) ||
      /siplah/i.test(uraian) ||
      /mebel|meubilair|meubeler|perabot/i.test(uraian) ||
      (k.items && k.items.some((i: any) => /kursi siswa|meja setengah|rak mainan|loker|rak buku|papan kreasi|rak sepatu/i.test(i.namaBarang || '')));
    const isManagement =
      tipe === 'KONSULTAN' ||
      /kons-p|kons-w/i.test(bukti) ||
      /adm|pengelola|spj/i.test(bukti) ||
      /perencana|pengawas|biaya pengelolaan/i.test(uraian);
    return (
      tipe === 'CETAK' ||
      /^CTK\//i.test(bukti) ||
      /papan nama/i.test(uraian) ||
      tipe === 'SMKK' ||
      /KW-SMKK/i.test(bukti) ||
      /smkk|k3|keselamatan kerja|apd/i.test(uraian) ||
      isSiplahOrMeub ||
      isManagement
    );
  };

  // Fixed preparation items that are 100% locked to their exact RAB nominal
  const fixedPreparationKw: KwitansiDocument[] = [];
  currentKwitansi.forEach((k) => {
    if (isFixedLumpSumItem(k)) {
      const isManualOrLocked = isReceiptLocked(k);
      if (isManualOrLocked) {
        // Solusi 3: Mode Proteksi Kunci (Locked Manual Receipt)
        // Kwitansi manual terkunci dipertahankan 100% utuh tanpa diubah atau dipotong
        fixedPreparationKw.push(k);
        return;
      }

      const isPapan = (k.tipe || '').toUpperCase() === 'CETAK' || /^CTK\//i.test(k.noBukti || '') || /papan nama/i.test(k.uraian || '');
      const isSiplahOrMeub =
        /siplah/i.test(k.noBukti || '') ||
        /siplah|mebel|meubilair|meubeler|perabot/i.test(k.uraian || '') ||
        (k.items && k.items.some((i: any) => /kursi siswa|meja setengah|rak mainan|loker|rak buku|papan kreasi|rak sepatu/i.test(i.namaBarang || '')));
      const isManagement =
        (k.tipe || '').toUpperCase() === 'KONSULTAN' ||
        /kons-p|kons-w/i.test(k.noBukti || '') ||
        /adm|pengelola|spj/i.test(k.noBukti || '') ||
        /perencana|pengawas|biaya pengelolaan/i.test(k.uraian || '');

      if (isPapan) {
        const pItems = [
          {
            namaBarang: `Pembuatan & Cetak Papan Nama Proyek Revitalisasi ${school.namaSekolah} (Bahan MMT / Akrilik & Frame Kayu Complete)`,
            volume: 1,
            satuan: 'unit',
            hargaSatuan: exactPapanNominal,
            jumlah: exactPapanNominal,
          },
        ];
        fixedPreparationKw.push({
          ...k,
          tipe: 'CETAK',
          nominal: exactPapanNominal,
          items: pItems,
        });
      } else if (isSiplahOrMeub) {
        const hasExistingItems = k.items && k.items.length > 0;
        const finalItems = hasExistingItems ? k.items : (EXACT_MEBELER_RAB_ITEMS as any);
        const itemSum = finalItems.reduce((s: number, it: any) => s + (it.jumlah || 0), 0);
        const finalNominal = (hasExistingItems && itemSum > 0)
          ? itemSum
          : (k.nominal && k.nominal > 0 ? k.nominal : EXACT_MEBELER_RAB_TOTAL);
        const topNames = finalItems.map((i: any) => i.namaBarang).slice(0, 3).join(', ');
        const storeName = k.namaToko || 'Toko Mitra SipLah Online';
        fixedPreparationKw.push({
          ...k,
          tipe: 'OPERASIONAL',
          nominal: finalNominal,
          items: finalItems,
          namaToko: storeName,
          penerimaPekerjaan: k.penerimaPekerjaan || `Mitra Penyedia ${storeName}`,
          uraian: `Pembayaran Lunas Belanja Barang via ${storeName} (${topNames || 'Meubilair / Perabot'}), Tahap Pengadaan Meubilair / Perabot Revitalisasi ${school.namaSekolah}, Tahun ${targetYear}.`,
        });
      } else if (isManagement) {
        fixedPreparationKw.push(k);
      } else {
        // SMKK
        const sNominal = exactSmkkNominal > 0 ? exactSmkkNominal : k.nominal;
        fixedPreparationKw.push({
          ...k,
          nominal: sNominal,
        });
      }
    }
  });

  // Separate variable construction kwitansis across active weeks (EXCLUDING fixed items)
  const activeWeeklyKw = currentKwitansi.filter((k) => {
    if (isFixedLumpSumItem(k)) return false; // EXEMPT from scaling!
    const kwWeek = extractWeekNumberFromKwitansi(k, progressWeeks, targetYear);
    return kwWeek !== null && activeWeekNums.has(kwWeek);
  });

  const nonWeeklyPreserved = currentKwitansi.filter((k) => {
    if (isFixedLumpSumItem(k)) return false;
    const kwWeek = extractWeekNumberFromKwitansi(k, progressWeeks, targetYear);
    if (kwWeek !== null && activeWeekNums.has(kwWeek)) return false;
    const isKons = k.tipe === 'KONSULTAN' || /kons-p|kons-w|perencana|pengawas/i.test(`${k.noBukti} ${k.uraian}`);
    const isAdm = k.tipe === 'OPERASIONAL' || /\badm\b|pengelola/i.test(`${k.noBukti} ${k.uraian}`);
    return isKons || isAdm;
  });

  const targetConstructionTotal = Math.round((paguTotal * cumulativeBobot) / 100);
  const sumFixedPrep = fixedPreparationKw.reduce((s, k) => s + (k.nominal || 0), 0);
  const remainingTargetConstruction = Math.max(0, targetConstructionTotal - sumFixedPrep);

  const sumConstructionRaw = activeWeeklyKw.reduce((s, k) => s + (k.nominal || 0), 0);

  let scaledActiveKw: KwitansiDocument[] = [];
  if (sumConstructionRaw > 0 && remainingTargetConstruction > 0) {
    const scaleFactor = remainingTargetConstruction / sumConstructionRaw;
    let runningSum = 0;

    scaledActiveKw = activeWeeklyKw.map((kw, idx) => {
      if (idx === activeWeeklyKw.length - 1) {
        const lastNominal = Math.max(0, remainingTargetConstruction - runningSum);
        const itemScale = kw.nominal > 0 ? lastNominal / kw.nominal : scaleFactor;
        const scaledItems = (kw.items || []).map((it) => {
          const newVol = Math.max(1, Math.round((it.volume || 1) * itemScale));
          const newJml = Math.round(newVol * (it.hargaSatuan || 1));
          return { ...it, volume: newVol, jumlah: newJml };
        });
        const newNom = scaledItems.length > 0 ? scaledItems.reduce((s, i) => s + i.jumlah, 0) : lastNominal;
        return { ...kw, items: scaledItems, nominal: newNom > 0 ? newNom : lastNominal };
      }

      const scaledNominal = Math.round((kw.nominal || 0) * scaleFactor);
      runningSum += scaledNominal;
      const scaledItems = (kw.items || []).map((it) => {
        const newVol = Math.max(1, Math.round((it.volume || 1) * scaleFactor));
        const newJml = Math.round(newVol * (it.hargaSatuan || 1));
        return { ...it, volume: newVol, jumlah: newJml };
      });
      const newNom = scaledItems.length > 0 ? scaledItems.reduce((s, i) => s + i.jumlah, 0) : scaledNominal;
      return { ...kw, items: scaledItems, nominal: newNom > 0 ? newNom : scaledNominal };
    });
  } else {
    scaledActiveKw = activeWeeklyKw;
  }

  const finalizedKwitansi = renumberKwitansiChronologically(
    deduplicateKwitansiList([...scaledActiveKw, ...fixedPreparationKw, ...nonWeeklyPreserved]),
    targetYear
  );

  // Opsi A: Sesuaikan belanja bahan material terakhir agar pengeluaran pas dengan pagu anggaran (saldo BKU/BKT Rp 0)
  let balancedKwitansi = finalizedKwitansi;
  const targetBudget = Math.round((paguTotal * Math.min(100, cumulativeBobot)) / 100);
  const currentFinalExp = finalizedKwitansi.reduce((s, k) => s + (k.nominal || 0), 0);
  if (currentFinalExp > targetBudget) {
    const balRes = balanceFinalMaterialKwitansiToBudget(
      finalizedKwitansi,
      paguTotal,
      cumulativeBobot >= 99.9 ? 1.0 : cumulativeBobot / 100
    );
    balancedKwitansi = balRes.balancedKwitansi;
  }

  const totalExpenditure = balancedKwitansi.reduce((s, k) => s + (k.nominal || 0), 0);

  return {
    calibratedKwitansi: balancedKwitansi,
    calibratedWageReports: currentWageReports.filter((w) => activeWeekNums.has(w.mingguKe)),
    calibratedBkb: (currentBkb && currentBkb.length > 0) ? currentBkb : (existingBkb || []),
    cumulativeBobot: Math.round(cumulativeBobot * 100) / 100,
    totalExpenditure,
    activeWeeksCount: activeWeeks.length,
  };
}

/**
 * Complete Reset & Rebalancing Engine:
 * Purges all accumulated/duplicate material & wage kwitansis and cleanly rebuilds
 * all weekly expenditures to perfectly match active progress.
 */
export function rebalanceAndResyncAllKwitansiToBudget(params: {
  school: SchoolMasterData;
  kwitansiList: KwitansiDocument[];
  progressWeeks: ProjectProgressWeek[];
  workers?: any[];
  stores?: StoreVendor[];
  rpdItems?: any[];
  realSchoolData?: any;
  existingBkb?: BkbTransaction[];
}): {
  rebalancedKwitansi: KwitansiDocument[];
  rebalancedWageReports: WeeklyWageReport[];
  rebalancedBkb: BkbTransaction[];
} {
  const result = calibrateAllTransactionsToCurrentProgress(params);
  return {
    rebalancedKwitansi: result.calibratedKwitansi,
    rebalancedWageReports: result.calibratedWageReports,
    rebalancedBkb: result.calibratedBkb,
  };
}

/**
 * Opsi B: Menyelaraskan seluruh realisasi persentase konsultan perencana (1,75%),
 * konsultan pengawas (2,16%), dan pengelola SPJ (2,54%) agar sama persis dengan
 * bobot rencana awal di Laporan Mingguan & Bobot.
 * Kelebihan belanja dialihkan ke belanja bahan material pokok, sehingga total belanja
 * tetap tepat 100% klop dengan Pagu (Rp 552.457.000) dan saldo kas BKU & BKT Nihil (Rp 0).
 */
export function alignKwitansiToOptionB({
  kwitansiList,
  totalAnggaran,
  progressWeeks,
}: {
  kwitansiList: KwitansiDocument[];
  totalAnggaran: number;
  progressWeeks?: ProjectProgressWeek[];
}): {
  alignedKwitansi: KwitansiDocument[];
  adjustedPerencana: number;
  adjustedPengawas: number;
  adjustedPengelola: number;
  adjustedMaterial: number;
} {
  if (!kwitansiList || kwitansiList.length === 0 || !totalAnggaran || totalAnggaran <= 0) {
    return {
      alignedKwitansi: kwitansiList || [],
      adjustedPerencana: 0,
      adjustedPengawas: 0,
      adjustedPengelola: 0,
      adjustedMaterial: 0,
    };
  }

  // Dinamis ambil bobot dari Laporan Mingguan jika tersedia, default: 1.75%, 2.16%, 2.54%
  const firstWeekDivs = progressWeeks?.[0]?.divisions || [];
  const divP = firstWeekDivs.find((d) => d.id === 'div-m1' || /perencana/i.test(d.uraian));
  const divW = firstWeekDivs.find((d) => d.id === 'div-m2' || /pengawas/i.test(d.uraian));
  const divA = firstWeekDivs.find((d) => d.id === 'div-m3' || /pengelolaan|administrasi/i.test(d.uraian));

  // Target persentase Opsi B: Perencana 1,75%, Pengawas 2,16%, Pengelola 2,54% (persis seperti di Laporan Mingguan & Bobot)
  const targetP = 1.75;
  const targetW = 2.16;
  const targetA = 2.54;

  const targetBudgetP = Math.round((totalAnggaran * targetP) / 100);
  const targetBudgetW = Math.round((totalAnggaran * targetW) / 100);
  const targetBudgetA = Math.round((totalAnggaran * targetA) / 100);

  const isPerencana = (k: KwitansiDocument) => {
    const c = `${k.noBukti || ''} ${k.uraian || ''} ${k.penerimaPekerjaan || ''} ${k.namaToko || ''}`.toLowerCase();
    return ((k.tipe === 'KONSULTAN' || /kons-p/i.test(c)) && /perencana|perencanaan/i.test(c)) || (/kons-p/i.test(c) && !/pengawas/i.test(c));
  };

  const isPengawas = (k: KwitansiDocument) => {
    const c = `${k.noBukti || ''} ${k.uraian || ''} ${k.penerimaPekerjaan || ''} ${k.namaToko || ''}`.toLowerCase();
    return ((k.tipe === 'KONSULTAN' || /kons-w/i.test(c)) && /pengawas|pengawasan/i.test(c)) || (/kons-w/i.test(c) && !/perencana/i.test(c));
  };

  const isPengelola = (k: KwitansiDocument) => {
    const c = `${k.noBukti || ''} ${k.uraian || ''} ${k.penerimaPekerjaan || ''} ${k.namaToko || ''}`.toLowerCase();
    return (
      (/pengelola|spj|administrasi|lpj|tim\s*teknis|tim\s*pelaksana|p2sp|cetak|percetakan|papan\s*nama|banner|penggandaan|\bctk\b/i.test(c) ||
        k.tipe === 'OPERASIONAL' ||
        k.tipe === 'CETAK') &&
      !isPerencana(k) &&
      !isPengawas(k)
    );
  };

  const isMaterial = (k: KwitansiDocument) => {
    if (isPerencana(k) || isPengawas(k) || isPengelola(k)) return false;
    const c = `${k.noBukti || ''} ${k.uraian || ''}`.toLowerCase();
    if (k.tipe === 'UPAH' || /^uk\/|upah/i.test(c)) return false;
    if (k.tipe === 'SMKK' || /smkk|k3/i.test(c)) return false;
    if ((k.tipe as string) === 'SIPLAH' || /siplah/i.test(c)) return false;
    if (k.tipe === 'PINTU_JENDELA' || k.tipe === 'PERABOT' || /^fur\//i.test(c) || /pintu|jendela|kusen|mebel|perabot/i.test(c)) return false;
    return true;
  };

  const resultList = kwitansiList.map((k) => ({
    ...k,
    items: (k.items || []).map((it) => ({ ...it })),
  }));

  // Helper scale group
  const scaleGroup = (
    predicate: (k: KwitansiDocument) => boolean,
    targetBudget: number
  ): number => {
    const matchingIndices: number[] = [];
    resultList.forEach((k, idx) => {
      if (predicate(k)) matchingIndices.push(idx);
    });

    if (matchingIndices.length === 0) return 0;

    const currentSum = matchingIndices.reduce((sum, idx) => sum + (resultList[idx].nominal || 0), 0);
    if (currentSum <= 0) return 0;

    let runningAllocated = 0;
    matchingIndices.forEach((kwIdx, i) => {
      const kw = resultList[kwIdx];
      let newNom: number;
      if (i === matchingIndices.length - 1) {
        newNom = Math.max(0, targetBudget - runningAllocated);
      } else {
        newNom = Math.round(targetBudget * ((kw.nominal || 0) / currentSum));
        runningAllocated += newNom;
      }

      const items = (kw.items || []).map((it, itIdx) => {
        if (itIdx === 0) {
          return { ...it, hargaSatuan: newNom, jumlah: newNom };
        }
        return { ...it, hargaSatuan: 0, jumlah: 0 };
      });

      resultList[kwIdx] = {
        ...kw,
        nominal: newNom,
        items,
      };
    });

    return currentSum - targetBudget;
  };

  const diffP = scaleGroup(isPerencana, targetBudgetP);
  const diffW = scaleGroup(isPengawas, targetBudgetW);
  const diffA = scaleGroup(isPengelola, targetBudgetA);

  const totalFreedUp = diffP + diffW + diffA;

  // Add freed up budget into candidate material receipt
  let adjustedMaterial = 0;
  if (totalFreedUp > 0) {
    const matIndices: number[] = [];
    resultList.forEach((k, idx) => {
      if (isMaterial(k) && !isReceiptLocked(k)) {
        matIndices.push(idx);
      }
    });

    if (matIndices.length > 0) {
      const targetMatIdx = matIndices[matIndices.length - 1];
      const targetKw = resultList[targetMatIdx];
      const newNom = (targetKw.nominal || 0) + totalFreedUp;

      const items = (targetKw.items || []).map((it, itIdx) => {
        if (itIdx === 0) {
          const newJml = (it.jumlah || 0) + totalFreedUp;
          const newVol = it.hargaSatuan > 0 ? Math.round((newJml / it.hargaSatuan) * 100) / 100 : it.volume;
          return {
            ...it,
            jumlah: newJml,
            volume: newVol > 0 ? newVol : 1,
          };
        }
        return { ...it };
      });

      const isPpn = Boolean(targetKw.isPpn);
      const isPph22 = Boolean(targetKw.isPph22);
      const ppnAmount = isPpn ? Math.round((newNom * 11) / 111) : 0;
      const pph22Amount = isPph22 ? Math.round((newNom * 1.5) / 100) : 0;

      resultList[targetMatIdx] = {
        ...targetKw,
        nominal: newNom,
        items,
        ppnAmount,
        pph22Amount,
      };
      adjustedMaterial = totalFreedUp;
    }
  }

  return {
    alignedKwitansi: resultList,
    adjustedPerencana: diffP,
    adjustedPengawas: diffW,
    adjustedPengelola: diffA,
    adjustedMaterial,
  };
}
