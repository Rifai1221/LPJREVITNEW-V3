import {
  KwitansiDocument,
  RealSchoolData,
  ProjectProgressWeek,
} from '../../types';
import { parseTxDateToIso } from '../../utils/monthHelper';
import {
  isReceiptLocked,
  splitMaterialPurchases,
} from './splitTransactionService';

export function isPreservedUnitItem(nama: string, satuan?: string, isBarangPabrikasi?: boolean): boolean {
  if (isBarangPabrikasi === true) return true;
  const n = (nama || '').toLowerCase().trim();
  const s = (satuan || '').toLowerCase().trim();
  if (!n) return false;

  if (/\[pabrikasi\]|\[barang jadi\]|pabrikasi/i.test(n)) return true;

  const isOpeningOrAssembly =
    /pintu|kusen|kosen|jendela|ventilasi|boven|jalusi|rolling door|folding gate|\bpj\d*|\bj\d*|\bv\d*|meubilair|perabot|kursi|meja|rak\s|loker|karpet|papan kreasi/i.test(n);

  if (isOpeningOrAssembly) {
    const isUnitOrSet = /^(unit|set|bh|buah|paket|ls)$/i.test(s);
    const isRawMeasure = /^(m3|m³|m2|m²|kg|meter|m\'|zak|btg)$/i.test(s);
    return isUnitOrSet || !isRawMeasure;
  }

  return false;
}

export function isPureDirectMaterial(name: string, satuan?: string, isBarangPabrikasi?: boolean): boolean {
  if (isBarangPabrikasi === true) return true;
  const n = (name || '').toLowerCase().trim();
  if (!n) return true;

  if (isPreservedUnitItem(n, satuan, isBarangPabrikasi)) {
    return true;
  }

  if (/helm|rompi|sepatu boot|sarung tangan|p3k|rambu|k3|smkk|safety|masker|kacamata safety|earplug|tali keselamatan|body harness|pelindung|penerapan smkk/i.test(n)) {
    return true;
  }

  if (/pekerjaan|pasang|pemasangan|pengadaan|pembuatan|perbaikan|rehab|renovasi|bongkar|cor\b|pengecoran|plesteran|acian|urugan|uruk|galian|instalasi|pengecatan|pengukuran|bowplank|bouwplank|finishing|pembersihan|pondasi|aanstamping|tebal|\d+\s*cm|\d+\s*mm|bawah|campuran|manual/i.test(n)) {
    return false;
  }
  if (/rangka atap|penutup atap|struktur|kuda-kuda|kuda kuda|titik lampu|titik saklar|titik stop|sanitasi|saluran air/i.test(n)) {
    return false;
  }
  return /semen|pasir|batu\b|split|kerikil|sirtu|bata\b|hebel|batako|besi\b|kawat|bendrat|paku\b|baut|sekrup|amplas|kertas gosok|lem\b|seal|sealant|lakban|thinner|tiner|cat\b|plamir|kuas|roll\b|hollow|gypsum|grc|kalsiboard|spandek|genteng|asbes|seng\b|nok\b|talang|reng\b|kanal\b|kabel|lampu|saklar|stop kontak|steker|fitting|pipa\b|kran\b|knee\b|socket|teflon|keramik|granit|ubin|grout|oker|engsel|grendel|kunci|handle|hak angin|kaca\b|papan\b|kaso\b|balok\b|triplek|plywood|multiplek|dolken|bambu|meja|kursi|whiteboard/i.test(n);
}

export function normalizeMaterialItems<T extends { namaBarang: string; volume: number; satuan: string; hargaSatuan: number; jumlah: number }>(
  rawItems: T[]
): T[] {
  if (!rawItems || rawItems.length === 0) return [];

  const expandedItems: T[] = [];
  rawItems.forEach((item) => {
    const rawName = (item.namaBarang || '').trim();
    const isPab = (item as any).isBarangPabrikasi;

    if (isPab || isPreservedUnitItem(rawName, item.satuan, isPab)) {
      expandedItems.push({
        ...item,
        satuan: item.satuan || 'unit',
      });
      return;
    }

    expandedItems.push(item);
  });

  const preProcessed = expandedItems.map((item) => {
    const rawVol = item.volume || 0;
    const rawJml = item.jumlah || 0;
    const rawSatuan = (item.satuan || '').toLowerCase().trim();
    const rawName = (item.namaBarang || '').trim();
    const isPab = (item as any).isBarangPabrikasi;

    if (isPab || isPreservedUnitItem(rawName, item.satuan, isPab)) {
      return {
        ...item,
        satuan: item.satuan || 'unit',
      };
    }

    let convertedVol = rawVol;
    let convertedSatuan = item.satuan || 'unit';
    let convertedPrice = item.hargaSatuan || 0;

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

  const result: T[] = [];

  groupMap.forEach((group) => {
    const totalRawVol = group.items.reduce((s, it) => s + it.volume, 0);
    const totalRawJml = group.items.reduce((s, it) => s + it.jumlah, 0);
    const sampleItem = group.items[0];
    const rawSatuan = (group.satuan || '').toLowerCase().trim();
    const rawName = group.namaBarang.toLowerCase();

    let realisticVolume: number;
    let realisticSatuan = group.satuan;

    if (/semen|pc\b|portland/i.test(rawName)) {
      realisticSatuan = 'Zak';
      const samplePrice = sampleItem.hargaSatuan || 0;
      let hargaPerZak = samplePrice <= 5000 && samplePrice > 0 ? Math.round(samplePrice * 50) : Math.round(samplePrice);
      if (hargaPerZak <= 0 && totalRawVol > 0 && totalRawJml > 0) {
        const estUnitP = totalRawJml / totalRawVol;
        hargaPerZak = estUnitP <= 5000 ? Math.round(estUnitP * 50) : Math.round(estUnitP);
      }
      if (hargaPerZak <= 0) hargaPerZak = 72500;

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

    if (/bata ringan|hebel|celcon|aerated/i.test(rawName)) {
      let unitP = sampleItem.hargaSatuan || 0;
      if (unitP <= 0 || unitP < 5000 || unitP > 25000) unitP = 9500;
      let finalVol = Math.max(1, Math.round(totalRawVol > 0 && totalRawVol < 500 ? totalRawVol : (totalRawJml / unitP)));
      result.push({
        ...sampleItem,
        namaBarang: group.namaBarang,
        volume: finalVol,
        satuan: 'bh',
        hargaSatuan: unitP,
        jumlah: finalVol * unitP,
      });
      return;
    }

    if (/batako/i.test(rawName)) {
      let unitP = sampleItem.hargaSatuan > 0 && sampleItem.hargaSatuan <= 15000 ? sampleItem.hargaSatuan : 3500;
      let finalVol = Math.max(1, Math.round(totalRawVol > 0 && totalRawVol < 1000 ? totalRawVol : (totalRawJml / unitP)));
      result.push({
        ...sampleItem,
        namaBarang: group.namaBarang,
        volume: finalVol,
        satuan: 'bh',
        hargaSatuan: unitP,
        jumlah: finalVol * unitP,
      });
      return;
    }
    if (/bata merah/i.test(rawName)) {
      let unitP = sampleItem.hargaSatuan > 0 && sampleItem.hargaSatuan <= 3500 ? sampleItem.hargaSatuan : 950;
      let finalVol = Math.max(1, Math.round(totalRawVol > 0 && totalRawVol < 2000 ? totalRawVol : (totalRawJml / unitP)));
      result.push({
        ...sampleItem,
        namaBarang: group.namaBarang,
        volume: finalVol,
        satuan: 'bh',
        hargaSatuan: unitP,
        jumlah: finalVol * unitP,
      });
      return;
    }

    if (/kerikil|split|batu pecah|koral/i.test(rawName)) {
      const samplePrice = sampleItem.hargaSatuan || 0;
      const stdPrice = samplePrice >= 150000 && samplePrice <= 500000 ? samplePrice : 310000;
      let finalVol = Math.max(1, Math.round(totalRawVol > 0 && totalRawVol <= 300 ? totalRawVol : (totalRawJml / stdPrice)));
      result.push({
        ...sampleItem,
        namaBarang: group.namaBarang,
        volume: finalVol,
        satuan: 'm³',
        hargaSatuan: stdPrice,
        jumlah: finalVol * stdPrice,
      });
      return;
    }

    if (/pasir|batu belah|batu kali|tanah urug|sirtu/i.test(rawName)) {
      const samplePrice = sampleItem.hargaSatuan || 0;
      const isPasir = /pasir/i.test(rawName);
      const isSirtu = /sirtu|urug/i.test(rawName);
      const stdPrice = samplePrice >= 100000 && samplePrice <= 450000
        ? samplePrice
        : isPasir ? 250000 : isSirtu ? 180000 : 260000;
      let finalVol = Math.max(1, Math.round(totalRawVol > 0 && totalRawVol <= 300 ? totalRawVol : (totalRawJml / stdPrice)));
      result.push({
        ...sampleItem,
        namaBarang: group.namaBarang,
        volume: finalVol,
        satuan: 'm³',
        hargaSatuan: stdPrice,
        jumlah: finalVol * stdPrice,
      });
      return;
    }

    else if (/pasir|batu|tanah|sirtu|agregat|kerikil/i.test(rawName) && /m3|m³|m2|m²/i.test(rawSatuan)) {
      realisticVolume = Math.max(1, Math.round(totalRawVol));
      realisticSatuan = /m3|m³/i.test(rawSatuan) ? 'm³' : 'm²';
    }
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
    else if (/kg|liter|ltr/i.test(rawSatuan)) {
      if (totalRawVol < 0.5) {
        realisticVolume = 1;
        if (/cat/i.test(rawName)) realisticSatuan = 'klg';
        else if (/paku/i.test(rawName)) realisticSatuan = 'kg';
      } else {
        realisticVolume = Math.max(1, Math.round(totalRawVol));
      }
    }
    else if (/m3|m³|m2|m²|m\b/i.test(rawSatuan)) {
      realisticVolume = Math.max(1, Math.round(totalRawVol));
    }
    else {
      realisticVolume = totalRawVol < 1 ? 1 : Math.round(totalRawVol);
    }

    let unitPrice = 25000;
    if (/paku|kawat|bendrat/i.test(rawName)) {
      unitPrice = /kawat|bendrat/i.test(rawName) ? 24000 : 21500;
      if (!/kg/i.test(realisticSatuan)) realisticSatuan = 'Kg';
    } else if (/keramik|granit|ubin/i.test(rawName)) {
      unitPrice = 95000;
      if (!/dus|box/i.test(realisticSatuan)) realisticSatuan = 'Dus';
    } else if (/cat|sealer|alkali/i.test(rawName)) {
      unitPrice = 75000;
    } else if (/gypsum|grc|kalsiboard/i.test(rawName)) {
      unitPrice = 65000;
      if (!/lembar|lbr/i.test(realisticSatuan)) realisticSatuan = 'Lembar';
    } else if (/hollow/i.test(rawName)) {
      unitPrice = 55000;
      if (!/btg|batang/i.test(realisticSatuan)) realisticSatuan = 'btg';
    } else if (sampleItem.hargaSatuan > 0 && sampleItem.hargaSatuan <= 150000) {
      unitPrice = sampleItem.hargaSatuan;
    }

    const finalJumlah = realisticVolume * unitPrice;

    result.push({
      ...sampleItem,
      namaBarang: group.namaBarang,
      volume: realisticVolume,
      satuan: realisticSatuan,
      hargaSatuan: unitPrice,
      jumlah: finalJumlah,
    });
  });

  return consolidateAndStandardizeReceiptItems(result);
}

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

export function getReconstitutedKusenPintuUnitItems<
  T extends { namaBarang: string; volume: number; satuan: string; hargaSatuan: number; jumlah: number }
>(rawItems: T[], targetNom?: number): T[] {
  const hasDoor = rawItems.some((it) => /daun pintu|kusen.*4|p1j1|pj1\b|pintu/i.test(it.namaBarang));
  const hasWindow = rawItems.some((it) => /daun jendela|kusen.*3|\bj1\b|jendela/i.test(it.namaBarang));

  const items: { namaBarang: string; volume: number; satuan: string; hargaSatuan: number; jumlah: number }[] = [];

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
export const EXACT_MEBELER_RAB_TOTAL = EXACT_MEBELER_RAB_ITEMS.reduce((sum, item) => sum + (item.jumlah || 0), 0);

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

  const isSiplah =
    /siplah/i.test(noBuktiStr) ||
    /siplah/i.test(uraianStr) ||
    /siplah/i.test(storeStr) ||
    /mebel|meubilair|meubeler|perabot/i.test(uraianStr) ||
    (kw.items && kw.items.some((i: any) => (i.tags && i.tags.some((t: string) => /siplah/i.test(t))) || i.kategoriBiaya === 'SIPLAH' || i.tag === 'SIPLAH' || /kursi siswa|meja setengah|rak mainan|loker|rak buku|papan kreasi|rak sepatu/i.test(i.namaBarang || '')));

  if (isSiplah && kw.items && kw.items.length > 0) {
    return consolidateAndStandardizeReceiptItems(kw.items, nom) as unknown as T[];
  }

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

  const hasMebelerOrMat = /mebeler|mebel|perabot|kursi|meja|rak|loker|karpet|semen|pasir|bata|batu|keramik|paku|besi/i.test(uraianStr) || (kw.items && kw.items.some((it) => /mebeler|mebel|perabot|kursi|meja|rak|loker|karpet|semen|pasir|bata|batu|keramik|paku|besi/i.test(it.namaBarang || '')));
  const isPintuJendelaKw =
    !hasMebelerOrMat && (
      kw.tipe === 'PINTU_JENDELA' ||
      /fur[\/\-_]|kw[\/\-_]?fur|kw[\/\-_]?kusen|kw[\/\-_]?alum/i.test(noBuktiStr) ||
      /kusen|daun pintu|jendela alum|pintu utama|p1j1|pj1\b|j1\b|ventilasi.*boven/i.test(uraianStr) ||
      (kw.items && kw.items.length > 0 && kw.items.some((it) => isPreservedUnitItem(it.namaBarang, it.satuan)))
    );

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
  }

  if (kw.items && kw.items.length > 0) {
    return consolidateAndStandardizeReceiptItems(kw.items, nom) as unknown as T[];
  }

  return [];
}

export function getCanonicalReceiptItemInfo(
  rawName: string,
  rawSatuan?: string
): { key: string; name: string; unit: string } {
  const n = (rawName || '').trim();
  const s = (rawSatuan || 'unit').trim();
  const lower = n.toLowerCase();

  if (/semen.*(warna|nat|grout)|\boker\b/i.test(lower)) {
    return { key: 'CAT_SEMEN_WARNA', name: 'Semen Warna Pengisi Nat Keramik (Grouting)', unit: 'Zak' };
  }
  if (/semen|pc\b|portland/i.test(lower)) {
    return { key: 'CAT_SEMEN_PC', name: 'Semen Portland (PC) PCC (@ 50 Kg)', unit: 'Zak' };
  }

  if (/pasir/i.test(lower) && !/kertas|amplas/i.test(lower)) {
    return { key: 'CAT_PASIR', name: 'Pasir Pasang / Beton Pilihan', unit: 'm³' };
  }
  if (/kerikil|split|batu pecah|koral/i.test(lower)) {
    return { key: 'CAT_KERIKIL', name: 'Batu Split / Kerikil Beton (1/2 & 2/3)', unit: 'm³' };
  }
  if (/batu kali|batu belah/i.test(lower)) {
    return { key: 'CAT_BATU_KALI', name: 'Batu Kali / Batu Belah Pondasi', unit: 'm³' };
  }

  if (/bata ringan|hebel/i.test(lower)) {
    return { key: 'CAT_HEBEL', name: 'Bata Ringan Hebel (Tebal 10 cm)', unit: 'bh' };
  }
  if (/bata merah|bata\b/i.test(lower)) {
    return { key: 'CAT_BATA_MERAH', name: 'Batu Bata Merah Standar SNI', unit: 'bh' };
  }

  if (/kayu.*kaso|kaso/i.test(lower)) {
    return { key: 'CAT_KAYU_KASO', name: 'Kayu Kaso 5/7 cm (4 Meter)', unit: 'btg' };
  }
  if (/kayu.*balok|balok/i.test(lower) && !/ring balok|sloof/i.test(lower)) {
    return { key: 'CAT_KAYU_BALOK', name: 'Kayu Balok 6/12 cm (4 Meter)', unit: 'btg' };
  }
  if (/paku/i.test(lower)) {
    return { key: 'CAT_PAKU', name: 'Paku Campuran (5 cm - 10 cm)', unit: 'Kg' };
  }

  if (/kawat|bendrat/i.test(lower)) {
    return { key: 'CAT_KAWAT_BENDRAT', name: 'Kawat Bendrat Beton SNI', unit: 'Kg' };
  }
  if (/besi.*(beton|polos|ulir)|pembesian/i.test(lower)) {
    return { key: 'CAT_BESI_BETON', name: 'Besi Beton Polos / Ulir SNI (12 Meter)', unit: 'btg' };
  }

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

  if (/keramik|granit|ubin/i.test(lower)) {
    return { key: 'CAT_KERAMIK', name: 'Ubin Keramik Lantai 40x40 / 60x60 Standar SNI', unit: 'Dus' };
  }

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

  const simplifiedBase = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizedKey = `CUSTOM:${simplifiedBase}|${cleanUnit.toLowerCase()}`;
  return { key: normalizedKey, name: cleanName || n, unit: cleanUnit || s };
}

export function consolidateAndStandardizeReceiptItems<
  T extends { namaBarang: string; volume: number; satuan: string; hargaSatuan: number; jumlah: number }
>(rawItems: T[], kwNominal?: number): T[] {
  if (!Array.isArray(rawItems) || rawItems.length === 0) return [];

  const hasDecomposedPintu = rawItems.some((it) =>
    /kusen alumunium\s*4|kusen alumunium\s*3|daun pintu panel|daun jendela alumunium/i.test(it.namaBarang)
  );
  if (hasDecomposedPintu) {
    return getReconstitutedKusenPintuUnitItems(rawItems, kwNominal);
  }

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

    if (normId && seenKeys.has(`ID:${normId}`)) {
      isDuplicate = true;
    }

    if (!isDuplicate && !isManualOrLocked) {
      if (normNoBukti && seenNoBukti.has(normNoBukti)) {
        isDuplicate = true;
      }

      if (!isDuplicate && normTipe === 'UPAH' && normWeek > 0) {
        if (seenUpahWeek.has(normWeek)) {
          isDuplicate = true;
        }
      }

      if (!isDuplicate && normNominal > 0 && seenKeys.has(keyUraianNom)) {
        isDuplicate = true;
      }

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

    updatedKw.items = getAutoHealedKwitansiItems(updatedKw) as any;

    return updatedKw;
  });

  const deduped = deduplicateKwitansiList(processed);
  return renumberKwitansiChronologically(deduped, targetYear || '2026') as any;
}

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
      (tipe === 'PINTU_JENDELA' ||
      tipe === 'PINTU_JENDELA_ALUMINIUM' ||
      /^FUR\//i.test(bukti) ||
      (/pintu|jendela|kusen|aluminium/i.test(uraian) && !/engsel|kunci/i.test(uraian))) &&
      !/mebeler|mebel|perabot|kursi|meja|rak|loker|karpet|semen|pasir|bata|batu|keramik|paku|besi/i.test(uraian) &&
      !kw.items?.some((i: any) => /mebeler|mebel|perabot|kursi|meja|rak|loker|karpet|semen|pasir|bata|batu|keramik|paku|besi/i.test(i.namaBarang || ''))
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

  const sortedKonsP = sortChronologically(konsPList);
  const renumberedKonsP = sortedKonsP.map((kw, idx) => {
    const padM = String(idx + 1).padStart(2, '0');
    return {
      ...kw,
      noBukti: `KONS-P/${padM}/${safeYear}`,
      noSpb: `SPB-KONS-P/${padM}/${safeYear}`,
    };
  });

  const sortedKonsW = sortChronologically(konsWList);
  const renumberedKonsW = sortedKonsW.map((kw, idx) => {
    const padM = String(idx + 1).padStart(2, '0');
    return {
      ...kw,
      noBukti: `KONS-W/${padM}/${safeYear}`,
      noSpb: `SPB-KONS-W/${padM}/${safeYear}`,
    };
  });

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
