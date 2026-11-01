import {
  BkuTransaction,
  BktTransaction,
  BkbTransaction,
  KwitansiDocument,
  SchoolMasterData,
  StoreVendor,
  ProjectProgressWeek,
  WeeklyWageReport,
  WorkerItem,
  RealSchoolData,
} from '../../types';
import { parseTxDateToIso, resolveWeekDates } from '../../utils/monthHelper';
import { generateSecureId } from '../../utils/idAndVoucherHelper';
import { isKwitansiAllowedByProgressBobot } from '../../utils/projectSummaryRekapHelper';
import {
  isFixedNonSplitPayment,
  isMaterialOnlyPurchase,
  cleanNaturalUraian,
  renumberMaterialTransactionsChronologically,
  extractWeekNumberFromKwitansi,
  alignAndShiftTransactionsForCashflow,
} from './splitTransactionService';
import {
  deduplicateKwitansiList,
  toCommercialPrice,
  consolidateAndStandardizeReceiptItems,
} from './kwitansiGenerator';
import { distributeRupiah } from '../../utils/money';
import { calculateIntegratedBkt } from '../cashLedgerIntegrationService';
import { planCashFlow } from '../cashPlanner';

export function resolveDynamicWageRates(
  schoolData?: RealSchoolData,
  workers?: WorkerItem[]
): { tukangRate: number; pekerjaRate: number } {
  let tukangRate = 0;
  let pekerjaRate = 0;

  if (workers && workers.length > 0) {
    const t = workers.find((w: any) => /tukang|kepala|ahli/i.test(w.role || w.jabatan || w.peran || ''));
    if (t && (t.upahHarian || 0) > 0) tukangRate = t.upahHarian;
    const p = workers.find((w: any) => /pekerja|laden|buruh/i.test(w.role || w.jabatan || w.peran || ''));
    if (p && (p.upahHarian || 0) > 0) pekerjaRate = p.upahHarian;
  }

  if (schoolData?.ahspList && schoolData.ahspList.length > 0) {
    for (const a of schoolData.ahspList) {
      if (!a.komponen) continue;
      for (const k of a.komponen) {
        if (!tukangRate && /tukang/i.test(k.uraian) && k.hargaSatuan > 0) {
          tukangRate = Math.round(k.hargaSatuan);
        }
        if (!pekerjaRate && /pekerja/i.test(k.uraian) && k.hargaSatuan > 0) {
          pekerjaRate = Math.round(k.hargaSatuan);
        }
      }
      if (tukangRate && pekerjaRate) break;
    }
  }

  return {
    tukangRate: toCommercialPrice(tukangRate || 135000),
    pekerjaRate: toCommercialPrice(pekerjaRate || 110000),
  };
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
  upahNominal: number,
  schoolData?: RealSchoolData,
  workers?: WorkerItem[]
): {
  bahanItems: DecomposedItem[];
  upahComponents: DecomposedItem[];
} {
  const lower = uraian.toLowerCase();
  const rates = resolveDynamicWageRates(schoolData, workers);

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
    const vol = Math.max(1, Math.round(bahanNominal / typicalP));
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
          ? (() => {
              const [tukangJml, pekerjaJml] = distributeRupiah(upahNominal, [60, 40]);
              const tVol = Math.max(1, Math.round(tukangJml / rates.tukangRate));
              const pVol = Math.max(1, Math.round(pekerjaJml / rates.pekerjaRate));
              return [
                {
                  namaBarang: 'Tukang Terampil',
                  volume: tVol,
                  satuan: 'OH',
                  hargaSatuan: rates.tukangRate,
                  jumlah: tukangJml,
                },
                {
                  namaBarang: 'Pekerja Lapangan',
                  volume: pVol,
                  satuan: 'OH',
                  hargaSatuan: rates.pekerjaRate,
                  jumlah: pekerjaJml,
                },
              ];
            })()
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
    const tukangRate = rates.tukangRate > 0 ? rates.tukangRate : 130000;
    const pekerjaRate = rates.pekerjaRate > 0 ? rates.pekerjaRate : 110000;

    const tukangVol = Math.max(1, Math.round((upahNominal * 0.6) / tukangRate));
    const pekerjaVol = Math.max(1, Math.round((upahNominal * 0.4) / pekerjaRate));

    const rawUpah = [
      {
        namaBarang: 'Tukang Terampil Lapangan',
        volume: tukangVol,
        satuan: 'OH',
        hargaSatuan: tukangRate,
        jumlah: tukangVol * tukangRate,
      },
      {
        namaBarang: 'Pekerja Konstruksi',
        volume: pekerjaVol,
        satuan: 'OH',
        hargaSatuan: pekerjaRate,
        jumlah: pekerjaVol * pekerjaRate,
      },
    ];

    upahComponents.push(...consolidateAndStandardizeReceiptItems(rawUpah, upahNominal));
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

export interface BkuReconciliationValidation {
  isBalanced: boolean;
  totalBkuPenerimaan: number;
  totalBkuPengeluaran: number;
  totalKwitansi: number;
  totalAnggaran: number;
  selisihPenerimaanVsAnggaran: number;
  selisihPengeluaranVsAnggaran: number;
  selisihPengeluaranVsKwitansi: number;
  message: string;
}

export function validateBkuReconciliation(
  bkuList: BkuTransaction[],
  kwitansiList: KwitansiDocument[],
  school?: SchoolMasterData
): BkuReconciliationValidation {
  const totalAnggaran = school?.totalAnggaran || 0;
  const totalBkuPenerimaan = (bkuList || [])
    .filter((tx) => tx.jenis === 'PENERIMAAN')
    .reduce((sum, tx) => sum + (tx.penerimaan || 0), 0);
  const totalBkuPengeluaran = (bkuList || [])
    .filter((tx) => tx.jenis === 'PENGELUARAN')
    .reduce((sum, tx) => sum + (tx.pengeluaran || 0), 0);
  const totalKwitansi = (kwitansiList || []).reduce((sum, k) => sum + (k.nominal || 0), 0);

  const selisihPenerimaanVsAnggaran = totalBkuPenerimaan - totalAnggaran;
  const selisihPengeluaranVsAnggaran = totalBkuPengeluaran - totalAnggaran;
  const selisihPengeluaranVsKwitansi = totalBkuPengeluaran - totalKwitansi;

  const isBalanced =
    selisihPenerimaanVsAnggaran === 0 &&
    selisihPengeluaranVsAnggaran === 0 &&
    selisihPengeluaranVsKwitansi === 0;

  let message = 'BKU Rekonsiliasi Sempurna';
  if (!isBalanced) {
    const parts: string[] = [];
    if (selisihPenerimaanVsAnggaran !== 0) {
      parts.push(`Penerimaan BKU (Rp ${totalBkuPenerimaan.toLocaleString('id-ID')}) != Anggaran (Rp ${totalAnggaran.toLocaleString('id-ID')})`);
    }
    if (selisihPengeluaranVsAnggaran !== 0) {
      parts.push(`Pengeluaran BKU (Rp ${totalBkuPengeluaran.toLocaleString('id-ID')}) != Anggaran (Rp ${totalAnggaran.toLocaleString('id-ID')})`);
    }
    if (selisihPengeluaranVsKwitansi !== 0) {
      parts.push(`Pengeluaran BKU (Rp ${totalBkuPengeluaran.toLocaleString('id-ID')}) != Total Kwitansi (Rp ${totalKwitansi.toLocaleString('id-ID')})`);
    }
    message = `Selisih Rekonsiliasi BKU Detected: ${parts.join('; ')}`;
  }

  return {
    isBalanced,
    totalBkuPenerimaan,
    totalBkuPengeluaran,
    totalKwitansi,
    totalAnggaran,
    selisihPenerimaanVsAnggaran,
    selisihPengeluaranVsAnggaran,
    selisihPengeluaranVsKwitansi,
    message,
  };
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
  if (Array.isArray(deletedIds) && deletedIds.includes('ALL_BKU')) {
    return [];
  }

  const yearStr = school?.tahunAnggaran?.trim() || '2026';

  // 1. Run planCashFlow to get synchronized kwitansi dates, termins, and withdrawals
  const plannedResult = planCashFlow(kwitansiList, school, progressWeeks, wageReports);
  const plannedKws = plannedResult.plannedKwitansiList;
  const termins = plannedResult.termins;

  const result: BkuTransaction[] = [];

  // 2. Add Penerimaan Termin transactions to BKU
  termins.forEach((trm) => {
    const trmId = trm.id === 'trm-01' ? 'bku-init-1' : 'bku-init-2';
    if (!deletedIds.includes(trmId)) {
      const manualOverride = manualTransactions.find((m) => m.id === trmId);
      if (manualOverride) {
        result.push(manualOverride);
      } else {
        result.push({
          id: trmId,
          tanggal: trm.tanggal,
          tanggalObj: trm.tanggalObj,
          bulan: trm.bulan,
          jenis: 'PENERIMAAN',
          uraian: trm.uraian,
          noBukti: trm.noBukti,
          penerimaan: trm.penerimaan,
          pengeluaran: 0,
        });
      }
    }
  });

  // 3. Add Kwitansi Expenditure transactions to BKU
  plannedKws.forEach((kw) => {
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

    const isSiplahKw =
      kw.kategoriBiayaPajak === 'Siplah' ||
      /siplah|daring/i.test(`${kw.noBukti || ''} ${kw.uraian || ''} ${(kw as any).kategoriBiaya || ''}`) ||
      (kw.items && kw.items.some((i: any) => /siplah/i.test(i.kategoriBiaya || '')));

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
    } else if (/kons-p/i.test(kw.noBukti || '') || (kw.tipe === 'KONSULTAN' && /perencana/i.test(kw.uraian)) || (/perencana/i.test(kw.uraian) && !/dari\s+tb|toko/i.test(kw.uraian))) {
      const recipient = kw.penerimaNama || resolveManagementRecipient('PERENCANA', school, stores);
      bkuUraian = `Bayar Honorarium Jasa Perencana Teknis (${recipient})`;
    } else if (/kons-w/i.test(kw.noBukti || '') || (kw.tipe === 'KONSULTAN' && /pengawas/i.test(kw.uraian)) || (/pengawas/i.test(kw.uraian) && !/dari\s+tb|toko/i.test(kw.uraian))) {
      const recipient = kw.penerimaNama || resolveManagementRecipient('PENGAWAS', school, stores);
      bkuUraian = `Bayar Honorarium Jasa Pengawas Lapangan (${recipient})`;
    } else if (kw.tipe === 'OPERASIONAL' || /adm/i.test(kw.noBukti || '') || /administrasi|pengelolaan/i.test(kw.uraian)) {
      const recipient = kw.penerimaNama || resolveManagementRecipient('PENGELOLA', school, stores);
      bkuUraian = `Bayar Biaya Pengelolaan Administrasi LPJ (${recipient})`;
    }

    const sortDate = parseTxDateToIso(kw.tanggal);

    result.push({
      id: kwBkuId,
      tanggal: kw.tanggal,
      tanggalObj: sortDate,
      bulan: kw.bulan,
      jenis: 'PENGELUARAN',
      uraian: bkuUraian,
      noBukti: kw.noBukti,
      penerimaan: 0,
      pengeluaran: kw.nominal,
      kategoriBiaya: isSiplahKw ? 'Siplah' : kw.kategoriBiayaPajak,
      kwitansiIdRef: kw.id,
      metodeBayar: isSiplahKw ? 'BANK' : (kw.metodeBayar || 'TUNAI'),
    });
  });

  // 4. Include additional manual transactions if any
  manualTransactions.forEach((tx) => {
    if (
      deletedIds.includes(tx.id) ||
      tx.id === 'bku-init-1' ||
      tx.id === 'bku-init-2'
    ) {
      return;
    }
    const isAlreadyRepresented = result.some((r) => r.id === tx.id || (tx.kwitansiIdRef && r.kwitansiIdRef === tx.kwitansiIdRef));
    if (!isAlreadyRepresented) {
      result.push(tx);
    }
  });

  // 5. Deduplicate and sort chronologically
  const dedupedResult = deduplicateBkuTransactions(result);
  dedupedResult.sort((a, b) => {
    if (a.tanggalObj === b.tanggalObj) {
      if (a.jenis === 'PENERIMAAN' && b.jenis === 'PENGELUARAN') return -1;
      if (a.jenis === 'PENGELUARAN' && b.jenis === 'PENERIMAAN') return 1;
      return 0;
    }
    return a.tanggalObj.localeCompare(b.tanggalObj);
  });

  // 6. Renumber material vouchers chronologically
  const renumberedList = renumberMaterialTransactionsChronologically(dedupedResult, yearStr);

  // 7. Compute running balance across all transactions
  let currentSaldo = 0;
  const finalResult: BkuTransaction[] = [];
  const seenIds = new Set<string>();

  renumberedList.forEach((tx) => {
    if (tx.jenis === 'PENERIMAAN') {
      currentSaldo += tx.penerimaan;
    } else {
      currentSaldo -= tx.pengeluaran;
    }

    let finalId = tx.id || generateSecureId('bku-tx');
    if (seenIds.has(finalId)) {
      finalId = `${finalId}-${seenIds.size}`;
    }
    seenIds.add(finalId);

    finalResult.push({
      ...tx,
      uraian: cleanNaturalUraian(tx.uraian || ''),
      noBukti: (tx.noBukti || '').replace(/-B$/, '').trim(),
      id: finalId,
      saldo: currentSaldo,
    });
  });

  return finalResult;
}

export function calculateBktFromBku(
  bkuList: BkuTransaction[],
  bkbList: BkbTransaction[] = [],
  arg3?: KwitansiDocument[] | SchoolMasterData | any,
  arg4?: SchoolMasterData | ProjectProgressWeek[] | any,
  arg5?: ProjectProgressWeek[] | any
): BktTransaction[] {
  return calculateIntegratedBkt(bkuList, bkbList, arg3, arg4, arg5);
}
