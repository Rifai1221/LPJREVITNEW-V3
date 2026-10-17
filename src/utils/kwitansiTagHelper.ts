import { RabSubItem, KwitansiDocument } from '../types';

export type StandardTagCode =
  | 'MAT'
  | 'SMKK'
  | 'SipLah'
  | 'FUR'
  | 'CTK'
  | 'KONS-P'
  | 'KONS-W'
  | 'SPJ'
  | 'UPAH';

export interface KwitansiTagDef {
  code: string;
  label: string;
  shortLabel: string;
  categoryLabel: string;
  icon: string;
  description: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  targetKwitansiTipe: KwitansiDocument['tipe'];
  noBuktiPrefix: string;
  targetStoreCategory: string;
  defaultStoreHint: string;
}

export const STANDARD_KWITANSI_TAGS: KwitansiTagDef[] = [
  {
    code: 'MAT',
    label: 'Material (MAT)',
    shortLabel: 'MAT',
    categoryLabel: 'Material / Bahan Bangunan',
    icon: '🧱',
    description: 'Kwitansi Toko Material Bangunan (Semen, Pasir, Bata, Besi, Cat, Keramik, dll.)',
    badgeBg: 'bg-emerald-50 hover:bg-emerald-100',
    badgeText: 'text-emerald-800',
    badgeBorder: 'border-emerald-300',
    targetKwitansiTipe: 'MATERIAL',
    noBuktiPrefix: 'KW-MAT',
    targetStoreCategory: 'MATERIAL',
    defaultStoreHint: 'TB. Sumber Bangunan / Toko Rekanan Material',
  },
  {
    code: 'UPAH',
    label: 'Upah (UPAH)',
    shortLabel: 'UPAH',
    categoryLabel: 'Upah Pekerja',
    icon: '👷',
    description: 'Pembayaran Upah Pekerja / Tukang',
    badgeBg: 'bg-purple-50 hover:bg-purple-100',
    badgeText: 'text-purple-800',
    badgeBorder: 'border-purple-300',
    targetKwitansiTipe: 'UPAH',
    noBuktiPrefix: 'KW-UPAH',
    targetStoreCategory: 'UPAH',
    defaultStoreHint: 'Daftar Upah Pekerja',
  },
  {
    code: 'SMKK',
    label: 'SMKK (SMKK)',
    shortLabel: 'SMKK',
    categoryLabel: 'SMKK & K3 Konstruksi',
    icon: '🦺',
    description: 'Kwitansi Penerapan SMKK / K3 (Helm, Rompi, Sepatu Boot, Kotak P3K, Rambu K3, Tali)',
    badgeBg: 'bg-rose-50 hover:bg-rose-100',
    badgeText: 'text-rose-800',
    badgeBorder: 'border-rose-300',
    targetKwitansiTipe: 'SMKK',
    noBuktiPrefix: 'KW-SMKK',
    targetStoreCategory: 'K3',
    defaultStoreHint: 'Penyedia APD & Keselamatan Kerja',
  },
  {
    code: 'SipLah',
    label: 'Mitra Siplah (SipLah)',
    shortLabel: 'SipLah',
    categoryLabel: 'Belanja Daring Mitra Siplah Kemdikbud',
    icon: '🛒',
    description: 'Kwitansi Belanja Mitra Siplah Kemdikbud (Blibli, Telkom, Eureka, dll.)',
    badgeBg: 'bg-amber-50 hover:bg-amber-100',
    badgeText: 'text-amber-800',
    badgeBorder: 'border-amber-300',
    targetKwitansiTipe: 'MATERIAL',
    noBuktiPrefix: 'KW-SIPLAH',
    targetStoreCategory: 'SIPLAH',
    defaultStoreHint: 'Mitra Siplah Blibli / Telkom',
  },
  {
    code: 'FUR',
    label: 'Jendela&Pintu (FUR)',
    shortLabel: 'FUR',
    categoryLabel: 'Kusen, Pintu, Jendela & Mebel',
    icon: '🚪',
    description: 'Kwitansi Pengadaan & Fabrikasi Pintu, Jendela, Kusen Aluminium / Kayu & Furnitur Jadi',
    badgeBg: 'bg-sky-50 hover:bg-sky-100',
    badgeText: 'text-sky-800',
    badgeBorder: 'border-sky-300',
    targetKwitansiTipe: 'PINTU_JENDELA',
    noBuktiPrefix: 'Fur',
    targetStoreCategory: 'PINTU_JENDELA_ALUMINIUM',
    defaultStoreHint: 'CV. Alumatama Jaya / Bengkel Kusen Aluminium',
  },
  {
    code: 'CTK',
    label: 'Percetakan (CTK)',
    shortLabel: 'CTK',
    categoryLabel: 'Percetakan & Penggandaan',
    icon: '🖨️',
    description: 'Kwitansi Jasa Cetak Papan Nama Proyek, Prasasti, Banner, Penggandaan Dokumen SPJ',
    badgeBg: 'bg-cyan-50 hover:bg-cyan-100',
    badgeText: 'text-cyan-800',
    badgeBorder: 'border-cyan-300',
    targetKwitansiTipe: 'CETAK',
    noBuktiPrefix: 'CTK',
    targetStoreCategory: 'PERCETAKAN',
    defaultStoreHint: 'DEXA PRINTING / CV. Percetakan Grafika',
  },
  {
    code: 'KONS-P',
    label: 'Perencana (KONS-P)',
    shortLabel: 'KONS-P',
    categoryLabel: 'Konsultan Perencana Teknis',
    icon: '📐',
    description: 'Kwitansi Honorarium Jasa Konsultansi Perencanaan Teknis & Gambar Kerja RAB',
    badgeBg: 'bg-violet-50 hover:bg-violet-100',
    badgeText: 'text-violet-800',
    badgeBorder: 'border-violet-300',
    targetKwitansiTipe: 'KONSULTAN',
    noBuktiPrefix: 'KONS-P',
    targetStoreCategory: 'PERENCANA',
    defaultStoreHint: 'Konsultan Perencana Teknis',
  },
  {
    code: 'KONS-W',
    label: 'Pengawas (KONS-W)',
    shortLabel: 'KONS-W',
    categoryLabel: 'Konsultan Pengawas Lapangan',
    icon: '🔍',
    description: 'Kwitansi Honorarium Jasa Konsultansi Pengawasan Teknis Lapangan & Laporan Progres',
    badgeBg: 'bg-purple-50 hover:bg-purple-100',
    badgeText: 'text-purple-800',
    badgeBorder: 'border-purple-300',
    targetKwitansiTipe: 'KONSULTAN',
    noBuktiPrefix: 'KONS-W',
    targetStoreCategory: 'PENGAWAS',
    defaultStoreHint: 'Konsultan Pengawas Lapangan',
  },
  {
    code: 'SPJ',
    label: 'Pengelola (SPJ)',
    shortLabel: 'SPJ',
    categoryLabel: 'Pengelola Administrasi & SPJ',
    icon: '📑',
    description: 'Kwitansi Biaya Pengelolaan Administrasi, Penyusunan SPJ/LPJ & ATK Tim Teknis/P2SP',
    badgeBg: 'bg-indigo-50 hover:bg-indigo-100',
    badgeText: 'text-indigo-800',
    badgeBorder: 'border-indigo-300',
    targetKwitansiTipe: 'OPERASIONAL',
    noBuktiPrefix: 'ADM',
    targetStoreCategory: 'PENGELOLA_SPJ',
    defaultStoreHint: 'Tim Pengelola Administrasi SPJ',
  },
];

export function getTagDefinition(code: string): KwitansiTagDef {
  const normalized = (code || '').trim();
  const found = STANDARD_KWITANSI_TAGS.find(
    (t) => t.code.toLowerCase() === normalized.toLowerCase()
  );
  if (found) return found;

  // Fallback for custom user-created tag
  return {
    code: normalized,
    label: normalized,
    shortLabel: normalized,
    categoryLabel: 'Tag Khusus',
    icon: '🏷️',
    description: `Tag Khusus ${normalized}`,
    badgeBg: 'bg-slate-50 hover:bg-slate-100',
    badgeText: 'text-slate-800',
    badgeBorder: 'border-slate-300',
    targetKwitansiTipe: 'MATERIAL',
    noBuktiPrefix: 'KW-MAT',
    targetStoreCategory: 'MATERIAL',
    defaultStoreHint: 'Toko Rekanan',
  };
}

export function getItemTags(item: Partial<RabSubItem> | null | undefined): string[] {
  if (!item) return [];
  const list: string[] = [];

  if (Array.isArray(item.tags)) {
    item.tags.forEach((t) => {
      const clean = (t || '').trim();
      if (clean && !list.includes(clean)) list.push(clean);
    });
  }

  // Automatic smart inference if no manual tag is set yet
  if (list.length === 0) {
    const uraian = (item.uraian || '').toLowerCase();
    const katBiaya = item.kategoriBiaya;

    if (item.isBarangPabrikasi || katBiaya === 'PINTU_JENDELA' || /pintu|kusen|jendela|ventilasi|boven/i.test(uraian)) {
      list.push('FUR');
    } else if (katBiaya === 'SMKK' || /smkk|k3|helm|rompi|sepatu boot|p3k|rambu/i.test(uraian)) {
      list.push('SMKK');
    } else if (katBiaya === 'CETAK' || /papan nama|prasasti|banner|baliho/i.test(uraian)) {
      list.push('CTK');
    } else if (katBiaya === 'SIPLAH' || /siplah/i.test(uraian)) {
      list.push('SipLah');
    } else if (katBiaya === 'PERENCANA' || /perencana teknis/i.test(uraian)) {
      list.push('KONS-P');
    } else if (katBiaya === 'PENGAWAS' || /pengawas lapangan/i.test(uraian)) {
      list.push('KONS-W');
    } else if (katBiaya === 'PENGELOLA' || /pengelola.*spj|administrasi lpj/i.test(uraian)) {
      list.push('SPJ');
    } else if (katBiaya === 'BAHAN' || katBiaya === 'UPAH_BAHAN') {
      list.push('MAT');
    }
  }

  return list;
}

export function hasItemTag(item: Partial<RabSubItem> | null | undefined, tagCode: string): boolean {
  if (!item) return false;
  const tags = getItemTags(item);
  return tags.some((t) => t.toLowerCase() === tagCode.toLowerCase());
}

export function addTagToItem(currentTags: string[] | undefined, tagToAdd: string): string[] {
  const clean = (tagToAdd || '').trim();
  if (!clean) return currentTags || [];
  const existing = currentTags || [];
  if (existing.some((t) => t.toLowerCase() === clean.toLowerCase())) {
    return existing;
  }
  return [...existing, clean];
}

export function removeTagFromItem(currentTags: string[] | undefined, tagToRemove: string): string[] {
  if (!currentTags) return [];
  const clean = (tagToRemove || '').trim().toLowerCase();
  return currentTags.filter((t) => (t || '').trim().toLowerCase() !== clean);
}

/**
 * Checks if an AHSP Component is a Labor (Upah) Component.
 * RULE: Labor/Upah in AHSP MUST NEVER be tagged for store kwitansi!
 * Wages must always be paid via Weekly Wage Reports & UK receipt.
 */
export function isAhspLaborComponent(uraian: string, kategori?: string): boolean {
  if (kategori === 'UPAH') return true;
  if (kategori === 'UPAH_BAHAN') return false;
  const n = (uraian || '').toLowerCase();
  return /pekerja|tukang|kepala tukang|mandor|operator alat|sopir|kenek/i.test(n) &&
    !/sewa|perancah|scaffolding|alat bantu/i.test(n);
}
