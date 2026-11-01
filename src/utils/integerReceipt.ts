import { KwitansiDocument, StoreVendor, RealSchoolData, RabSubItem } from '../types';
import { toRupiah } from './money';

export interface ReceiptItem {
  namaBarang: string;
  volume: number;
  satuan: string;
  hargaSatuan: number;
  jumlah: number;
  isBarangPabrikasi?: boolean;
  tag?: string;
}

export function roundToNearest500(price: number): number {
  if (!price || price <= 0) return 0;
  const rounded = Math.round(price / 500) * 500;
  return rounded > 0 ? rounded : 500;
}

/**
 * Membuat tabel harga tetap per toko (store price table) dari RAB / AHSP / existing items.
 * Harga dasar dibulatkan ke kelipatan Rp500 atau Rp1000.
 */
export function getStorePriceTable(storeName: string, items: { namaBarang: string; hargaSatuan?: number; jumlah?: number; volume?: number }[] = []): Map<string, number> {
  const priceMap = new Map<string, number>();

  items.forEach((it) => {
    if (!it.namaBarang) return;
    const cleanName = it.namaBarang.trim().toLowerCase();
    let price = it.hargaSatuan || 0;
    if (price <= 0 && it.volume && it.volume > 0 && it.jumlah) {
      price = Math.round(it.jumlah / it.volume);
    }
    if (price > 0) {
      const rounded = roundToNearest500(price);
      priceMap.set(cleanName, rounded > 0 ? rounded : 5000);
    }
  });

  return priceMap;
}

/**
 * Mendapatkan harga tetap untuk suatu barang dari tabel toko atau default wajar yang dibulatkan ke Rp500/Rp1000.
 */
export function getCanonicalItemPrice(namaBarang: string, storePriceMap?: Map<string, number>): number {
  const cleanName = (namaBarang || '').trim().toLowerCase();
  if (storePriceMap && storePriceMap.has(cleanName)) {
    return storePriceMap.get(cleanName)!;
  }
  // Default wajar berdasarkan jenis barang
  let basePrice = 50000;
  if (/semen|pc\b|portland/i.test(cleanName)) basePrice = 72000;
  else if (/besi|beton|ulir|polos/i.test(cleanName)) basePrice = 95000;
  else if (/pasir|bata|batu/i.test(cleanName)) basePrice = 250000;
  else if (/cat|sealer|plamir/i.test(cleanName)) basePrice = 85000;
  else if (/kayu|kaso|balok/i.test(cleanName)) basePrice = 45000;
  else if (/keramik|granit/i.test(cleanName)) basePrice = 95000;
  else if (/paku|sekrup|baut/i.test(cleanName)) basePrice = 22000;

  return roundToNearest500(basePrice);
}

/**
 * Konversi satuan ukur desimal/teknis (m3, m2, kg) ke satuan dagang bulat realistis.
 */
export function getRealisticTradeUnit(namaBarang: string, rawSatuan: string): { satuan: string; divisor: number } {
  const name = (namaBarang || '').toLowerCase();
  const sat = (rawSatuan || '').toLowerCase();

  if (/semen|pc\b|portland/i.test(name) || /zak|sak/i.test(sat)) {
    return { satuan: 'Zak', divisor: 50 };
  }
  if (/besi|ulir|polos|hollow|reng|kanal/i.test(name) || /btg|batang/i.test(sat)) {
    return { satuan: 'btg', divisor: 1 };
  }
  if (/pasir|batu|split|kerikil|sirtu|urug/i.test(name) || /m3|m³/i.test(sat)) {
    return { satuan: 'm³', divisor: 1 };
  }
  if (/cat|sealer|pelapis/i.test(name) || /klg|kaleng|pail|drum/i.test(sat)) {
    return { satuan: /pail/i.test(sat) ? 'Pail' : 'kaleng', divisor: 1 };
  }
  if (/paku|sekrup|baut|kawat|bendrat/i.test(name) || /kg|kilogram|ktk|kotak/i.test(sat)) {
    return { satuan: /ktk|kotak/i.test(sat) ? 'Kotak' : 'Kg', divisor: 1 };
  }
  if (/keramik|granit|ubin/i.test(sat) || /keramik|granit/i.test(name)) {
    return { satuan: 'Dus', divisor: 1 };
  }
  if (/pintu|jendela|kusen|unit/i.test(name) || /unit|bh|buah/i.test(sat)) {
    return { satuan: 'unit', divisor: 1 };
  }
  return { satuan: sat || 'ls', divisor: 1 };
}

export interface BuildReceiptResult {
  items: ReceiptItem[];
  nominal: number;
  remainder: number;
}

export function buildReceiptItems(
  plannedItems: Array<{ namaBarang: string; volume?: number; hargaSatuan?: number; jumlah?: number; satuan?: string; tag?: string }>,
  storePriceMap?: Map<string, number>,
  targetNominal: number = 0,
  carryForwardRemainder: number = 0
): BuildReceiptResult {
  if (!plannedItems || plannedItems.length === 0) {
    return {
      items: [{ namaBarang: 'Bahan Material Bangunan', volume: 1, satuan: 'ls', hargaSatuan: targetNominal, jumlah: targetNominal }],
      nominal: targetNominal,
      remainder: 0,
    };
  }

  const adjustedTarget = Math.max(1000, targetNominal + carryForwardRemainder);
  const rawBuilt: ReceiptItem[] = [];
  const seenNames = new Set<string>();

  const totalPlannedVal = plannedItems.reduce((s, it) => s + (it.jumlah || (it.volume || 1) * (it.hargaSatuan || 50000)), 0);

  plannedItems.forEach((it, idx) => {
    const rawName = (it.namaBarang || 'Bahan Material').trim();
    let uniqueName = rawName;
    let counter = 1;
    while (seenNames.has(uniqueName.toLowerCase())) {
      counter++;
      uniqueName = `${rawName} (${counter})`;
    }
    seenNames.add(uniqueName.toLowerCase());

    const fixedPrice = (it.hargaSatuan && it.hargaSatuan > 0)
      ? Math.round(it.hargaSatuan)
      : getCanonicalItemPrice(uniqueName, storePriceMap);
    const itemShare = totalPlannedVal > 0 ? adjustedTarget * ((it.jumlah || (it.volume || 1) * (it.hargaSatuan || 50000)) / totalPlannedVal) : adjustedTarget / plannedItems.length;

    let vol = Math.max(1, Math.round(itemShare / fixedPrice));
    if (idx === plannedItems.length - 1 && rawBuilt.length === 0) {
      vol = Math.max(1, Math.round(adjustedTarget / fixedPrice));
    }

    const trade = getRealisticTradeUnit(uniqueName, it.satuan || '');
    const subtotal = vol * fixedPrice;

    rawBuilt.push({
      namaBarang: uniqueName,
      volume: vol,
      satuan: trade.satuan,
      hargaSatuan: fixedPrice,
      jumlah: subtotal,
      tag: it.tag,
    });
  });

  const sumJumlah = rawBuilt.reduce((s, it) => s + it.jumlah, 0);
  const remainder = targetNominal - sumJumlah;

  return {
    items: rawBuilt,
    nominal: sumJumlah,
    remainder,
  };
}

export function applyFinalReceiptAbsorber(
  items: ReceiptItem[],
  targetNominal: number,
  isLastInCategory: boolean
): { items: ReceiptItem[]; nominal: number } {
  if (!isLastInCategory || !items || items.length === 0) {
    const nom = items.reduce((s, it) => s + it.jumlah, 0);
    return { items, nominal: nom };
  }

  const currentSum = items.reduce((s, it) => s + it.jumlah, 0);
  const diff = targetNominal - currentSum;

  if (diff === 0) {
    return { items, nominal: currentSum };
  }

  let absorbed = false;
  const updatedItems = items.map((it) => ({ ...it }));

  if (Math.abs(diff) < 200000) {
    for (const it of updatedItems) {
      if (it.hargaSatuan <= 0 || /ongkos angkut|pengiriman/i.test(it.namaBarang)) continue;
      const deltaVol = Math.round(diff / it.hargaSatuan);
      if (deltaVol !== 0 && it.volume + deltaVol > 0) {
        const newVol = it.volume + deltaVol;
        const newJml = newVol * it.hargaSatuan;
        const newDiff = targetNominal - (currentSum - it.jumlah + newJml);
        if (Math.abs(newDiff) === 0) {
          it.volume = newVol;
          it.jumlah = newJml;
          absorbed = true;
          break;
        }
      }
    }
  }

  if (!absorbed && diff !== 0) {
    const existingOngkos = updatedItems.find((it) => /ongkos angkut|pengiriman/i.test(it.namaBarang));
    if (existingOngkos) {
      existingOngkos.jumlah += diff;
      existingOngkos.hargaSatuan = existingOngkos.jumlah;
      existingOngkos.volume = 1;
    } else {
      updatedItems.push({
        namaBarang: 'Ongkos Angkut / Pengiriman Material Proyek',
        volume: 1,
        satuan: 'Ls',
        hargaSatuan: diff,
        jumlah: diff,
      });
    }
  }

  const finalNom = updatedItems.reduce((s, it) => s + it.jumlah, 0);
  return { items: updatedItems, nominal: finalNom };
}
