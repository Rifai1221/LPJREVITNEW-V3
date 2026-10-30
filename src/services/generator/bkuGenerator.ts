import {
  BkuTransaction,
  BktTransaction,
  BkbTransaction,
  KwitansiDocument,
  SchoolMasterData,
  StoreVendor,
  ProjectProgressWeek,
  WeeklyWageReport,
} from '../../types';
import { parseTxDateToIso, resolveWeekDates } from '../../utils/monthHelper';
import { generateSecureId } from '../../utils/idAndVoucherHelper';
import { isKwitansiAllowedByProgressBobot } from '../../utils/projectSummaryRekapHelper';
import {
  isFixedNonSplitPayment,
  isMaterialOnlyPurchase,
  cleanNaturalUraian,
  renumberMaterialTransactionsChronologically,
} from './splitTransactionService';
import {
  deduplicateKwitansiList,
} from './kwitansiGenerator';
import { extractWeekNumberFromKwitansi } from './splitTransactionService';

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

export function decomposeRealisticBahanAndUpah(
  uraian: string,
  bahanNominal: number,
  upahNominal: number
): {
  bahanItems: DecomposedItem[];
  upahComponents: DecomposedItem[];
} {
  const lower = uraian.toLowerCase();

  const hasJobScope =
    /pekerjaan|pasang|pemasangan|pengadaan|pembuatan|perbaikan|rehab|renovasi|bongkar|urugan|uruk|galian|cor\b|pengecoran|plesteran|acian|instalasi|pengecatan|pengukuran|bowplank|bouwplank|rangka|penutup|pondasi|struktur|titik|bawah|tebal|\d+\s*cm|\d+\s*mm|campuran|manual/i.test(
      lower
    );

  const isDirectRawMaterial =
    !hasJobScope &&
    /semen|paku|pasir|cat|bata|genteng|spandek|pipa|kabel|keramik|hollow|gypsum|grc|besi|kayu|baut|engsel|kunci|saklar/i.test(lower);

  let materialTemplates: MaterialTemplate[] = [];

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

  if (/urugan|uruk|timbunan|sirtu/i.test(lower)) {
    if (/pasir/i.test(lower)) {
      materialTemplates = [
        { nama: 'Pasir Urug Pilihan / Timbunan Bersih', satuan: 'm³', typicalPrice: 175000, weight: 1.0 },
      ];
    } else {
      materialTemplates = [
        { nama: 'Tanah Urug Sub-grade Pilihan', satuan: 'm³', typicalPrice: 135000, weight: 1.0 },
      ];
    }
  }
  else if (/smkk|k3|keselamatan|apd|helm|rompi|p3k|rambu|tali keselamatan/i.test(lower)) {
    materialTemplates = [
      { nama: 'Helm Pelindung Proyek (Safety Helmet SNI)', satuan: 'Buah', typicalPrice: 85000, weight: 0.35 },
      { nama: 'Rompi Proyek Reflektif K3', satuan: 'Buah', typicalPrice: 65000, weight: 0.25 },
      { nama: 'Kotak & Perlengkapan Obat P3K Lapangan', satuan: 'Set', typicalPrice: 150000, weight: 0.20 },
      { nama: 'Tali Keselamatan / Rambu Peringatan K3', satuan: 'Roll', typicalPrice: 120000, weight: 0.12 },
      { nama: 'Sarung Tangan Kerja & Masker K3', satuan: 'Pack', typicalPrice: 45000, weight: 0.08 },
    ];
  }
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
  }
  else if (/cat|pengecatan|plamir|melamik|politur/i.test(lower)) {
    materialTemplates = [
      { nama: 'Cat Tembok Eksterior/Interior Weatherproof', satuan: 'Pail', typicalPrice: 380000, weight: 0.55 },
      { nama: 'Plamir Tembok / Wall Putty Instan', satuan: 'Zak', typicalPrice: 135000, weight: 0.20 },
      { nama: 'Kuas Roll Cat, Kuas Bulu 3" & Baki Cat', satuan: 'Set', typicalPrice: 85000, weight: 0.10 },
      { nama: 'Kertas Gosok / Amplas No. 120 & 180', satuan: 'Lembar', typicalPrice: 12000, weight: 0.08 },
      { nama: 'Lakban Kertas / Masking Tape Pelindung', satuan: 'Roll', typicalPrice: 18000, weight: 0.07 },
    ];
  }
  else if (/atap|seng|genteng|baja ringan|kuda|jurai|nok|bubungan|talang/i.test(lower)) {
    materialTemplates = [
      { nama: 'Rangka Baja Ringan Canal C75 Standar SNI', satuan: 'Batang', typicalPrice: 115000, weight: 0.40 },
      { nama: 'Atap Spandek Gelombang 0.30mm SNI', satuan: 'Lembar', typicalPrice: 165000, weight: 0.30 },
      { nama: 'Reng Baja Ringan Asimetris U-30', satuan: 'Batang', typicalPrice: 55000, weight: 0.15 },
      { nama: 'Baut Roofing / SDS Fastener Hex Head', satuan: 'Kotak', typicalPrice: 95000, weight: 0.08 },
      { nama: 'Seng Plat Talang / Nok Bubungan 0.3mm', satuan: 'Lembar', typicalPrice: 80000, weight: 0.07 },
    ];
  }
  else if (/plafon|langit|gypsum|grc|akustik|triplek|list plafon/i.test(lower)) {
    materialTemplates = [
      { nama: 'Papan Gypsum / GRC Tebal 9 mm Standar SNI', satuan: 'Lembar', typicalPrice: 85000, weight: 0.45 },
      { nama: 'Rangka Besi Hollow Galvanis 4x4 & 2x4', satuan: 'Batang', typicalPrice: 38000, weight: 0.30 },
      { nama: 'Compound Tepung Gypsum & Kasa Textile Tape', satuan: 'Zak', typicalPrice: 65000, weight: 0.10 },
      { nama: 'List Profil Plafon / Cornice Gypsum', satuan: 'Batang', typicalPrice: 28000, weight: 0.08 },
      { nama: 'Sekrup Fastener Gypsum Hitam 1"', satuan: 'Kotak', typicalPrice: 45000, weight: 0.07 },
    ];
  }
  else if (/keramik|lantai|ubin|granit|homogeneous|tegel|plint/i.test(lower)) {
    materialTemplates = [
      { nama: 'Ubin Keramik Lantai 40x40 / 50x50 SNI', satuan: 'Dus', typicalPrice: 95000, weight: 0.52 },
      { nama: 'Semen Portland (PC) 50 Kg', satuan: 'Zak', typicalPrice: 68000, weight: 0.26 },
      { nama: 'Pasir Pasang Ayak Halus', satuan: 'm³', typicalPrice: 220000, weight: 0.15 },
      { nama: 'Semen Warna Pengisi Nat Keramik (Grouting)', satuan: 'Kg', typicalPrice: 18000, weight: 0.07 },
    ];
  }
  else if (/pintu|jendela|kusen|kaca|ventilasi|boven|jalusi/i.test(lower)) {
    materialTemplates = [
      { nama: 'Kusen & Daun Pintu/Jendela Kayu/Alumunium', satuan: 'Unit', typicalPrice: 850000, weight: 0.65 },
      { nama: 'Kunci Tanam / Handle Silinder Stainless', satuan: 'Set', typicalPrice: 165000, weight: 0.13 },
      { nama: 'Kaca Polos Bening Tebal 5 mm', satuan: 'm²', typicalPrice: 140000, weight: 0.12 },
      { nama: 'Engsel Pintu/Jendela Stainless Steel 4"', satuan: 'Set', typicalPrice: 45000, weight: 0.10 },
    ];
  }
  else if (/listrik|lampu|stop kontak|saklar|kabel|penerangan|titik/i.test(lower)) {
    materialTemplates = [
      { nama: 'Kabel Listrik NYM 2x1.5 mm / 2x2.5 mm Standar SNI', satuan: 'Roll', typicalPrice: 450000, weight: 0.40 },
      { nama: 'Lampu LED Hemat Energi 18W / 24W SNI', satuan: 'Buah', typicalPrice: 65000, weight: 0.28 },
      { nama: 'Saklar Ganda & Tunggal Inbow Standar Broco', satuan: 'Buah', typicalPrice: 28000, weight: 0.12 },
      { nama: 'Stop Kontak Dinding & Box Inbow', satuan: 'Buah', typicalPrice: 28000, weight: 0.12 },
      { nama: 'Pipa Konduit Pelindung Kabel & Klem', satuan: 'Batang', typicalPrice: 15000, weight: 0.08 },
    ];
  }
  else {
    materialTemplates = [
      { nama: 'Semen Portland (PC) 50 Kg', satuan: 'Zak', typicalPrice: 68000, weight: 0.45 },
      { nama: 'Pasir Pasang / Beton Pilihan', satuan: 'm³', typicalPrice: 220000, weight: 0.30 },
      { nama: 'Batu Split / Kerikil Beton (1/2 & 2/3)', satuan: 'm³', typicalPrice: 310000, weight: 0.15 },
      { nama: 'Paku Campuran (5 cm - 10 cm)', satuan: 'Kg', typicalPrice: 21500, weight: 0.10 },
    ];
  }

  const bahanItems: DecomposedItem[] = [];
  let allocatedBahan = 0;

  materialTemplates.forEach((tpl, idx) => {
    const isLast = idx === materialTemplates.length - 1;
    const itemJml = isLast
      ? Math.max(0, bahanNominal - allocatedBahan)
      : Math.round(bahanNominal * tpl.weight);

    allocatedBahan += itemJml;
    if (itemJml <= 0) return;

    const vol = Math.max(1, Math.round(itemJml / tpl.typicalPrice));
    const hargaSatuan = vol > 0 ? Math.round(itemJml / vol) : itemJml;

    bahanItems.push({
      namaBarang: tpl.nama,
      volume: vol,
      satuan: tpl.satuan,
      hargaSatuan,
      jumlah: itemJml,
    });
  });

  const upahComponents: DecomposedItem[] = [];
  if (upahNominal > 0) {
    const tukangJml = Math.round(upahNominal * 0.6);
    const pekerjaJml = upahNominal - tukangJml;

    const tukangVol = Math.max(1, Math.round(tukangJml / 135000));
    const pekerjaVol = Math.max(1, Math.round(pekerjaJml / 110000));

    upahComponents.push({
      namaBarang: 'Tukang Terampil Lapangan',
      volume: tukangVol,
      satuan: 'OH',
      hargaSatuan: Math.round(tukangJml / tukangVol),
      jumlah: tukangJml,
    });
    upahComponents.push({
      namaBarang: 'Pekerja Konstruksi',
      volume: pekerjaVol,
      satuan: 'OH',
      hargaSatuan: Math.round(pekerjaJml / pekerjaVol),
      jumlah: pekerjaJml,
    });
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

    if (normId && seenIds.has(normId)) {
      continue;
    }

    if (kwRef && seenKwitansiRefs.has(kwRef)) {
      continue;
    }

    const isSpecialBukti = normBukti && normBukti !== '-' && normBukti !== 'MANUAL';
    if (isSpecialBukti) {
      if (seenBukti.has(normBukti)) {
        continue;
      }
    }

    if (isSpecialBukti && normNominal > 0) {
      const keyBuktiNom = `${normBukti}|${normNominal}`;
      if (seenNoBuktiNominal.has(keyBuktiNom)) {
        continue;
      }
    }

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
    const week8 = progressWeeks.find((w) => w.mingguKe === 8) || progressWeeks[Math.min(7, progressWeeks.length - 1)];
    const resolved8 = resolveWeekDates(week8, yearStr);
    termin2DateIso = resolved8.startDate;
    termin2DateSlash = resolved8.startDateSlash;
    termin2Bulan = resolved8.bulan;
  }

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

  const activeWeeks = (progressWeeks || [])
    .filter((w) => w.mingguKe <= effLimit)
    .filter((w) => (w.bobotRealisasi && w.bobotRealisasi > 0) || w.divisions?.some((d) => (d.prestasiMingguIni || 0) > 0));

  const activeWeekNums = new Set(activeWeeks.map((w) => w.mingguKe));
  const hasAnyActiveProgress = activeWeekNums.size > 0;

  const cleanSourceKwitansi = deduplicateKwitansiList(kwitansiList);

  cleanSourceKwitansi.forEach((kw) => {
    if (!isKwitansiAllowedByProgressBobot(kw, progressWeeks)) {
      return;
    }
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
    if (kwWeek !== null && kwWeek > effLimit) {
      return;
    }

    if (hasAnyActiveProgress && kwWeek !== null && !activeWeekNums.has(kwWeek)) {
      return;
    }
    if (!hasAnyActiveProgress && (kw.tipe === 'MATERIAL' || kw.tipe === 'UPAH' || kw.tipe === 'PERABOT' || kwWeek !== null)) {
      return;
    }

    if (!kw || (kw.nominal || 0) <= 0) {
      return;
    }

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

  (wageReports || []).forEach((wr) => {
    if (!wr || wr.totalUpah <= 0) return;
    const wNum = wr.mingguKe;
    if (!activeWeekNums.has(wNum)) return;

    const weekPad = String(wNum).padStart(2, '0');
    const ukBukti = `UK/${weekPad}/${yearStr}`;

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
      const paguTotal = school?.totalAnggaran || 0;
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

      const originalDate = new Date(`${wDates.endDate}T00:00:00`);
      const shiftedDate = new Date(originalDate.getTime() + 2 * 86400000);
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

    if (tx.kwitansiIdRef) {
      const linkedKw = cleanSourceKwitansi.find((k) => k.id === tx.kwitansiIdRef);
      if (linkedKw) {
        const kwWeek = extractWeekNumberFromKwitansi(linkedKw, progressWeeks, yearStr);
        if (kwWeek !== null && kwWeek > effLimit) {
          return;
        }
      }
    } else if (tx.tanggal) {
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

  const dedupedResult = deduplicateBkuTransactions(result);

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

      const isFixedOrNonMaterial = isFixedNonSplitPayment(tx) || !isMaterialOnlyPurchase(tx);

      if (isFixedOrNonMaterial) {
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
        continue;
      }

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

  processedBkuList.sort((a, b) => {
    if (a.tanggalObj === b.tanggalObj) {
      if (a.jenis === 'PENERIMAAN' && b.jenis === 'PENGELUARAN') return -1;
      if (a.jenis === 'PENGELUARAN' && b.jenis === 'PENERIMAAN') return 1;
      return 0;
    }
    return a.tanggalObj.localeCompare(b.tanggalObj);
  });

  processedBkuList = renumberMaterialTransactionsChronologically(processedBkuList, yearStr);

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

  let currentSaldo = 0;
  const seenBkuTxIds = new Set<string>();
  const finalUniqueResult: BkuTransaction[] = [];

  processedBkuList.forEach((tx) => {
    if (tx.jenis === 'PENERIMAAN') {
      currentSaldo += tx.penerimaan;
    } else {
      currentSaldo -= tx.pengeluaran;
    }

    let finalId = tx.id || generateSecureId('bku-tx');
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
