import { StoreVendor } from '../types';

/**
 * Standardize name for comparison (strips punctuation, extra spaces, lowercases)
 */
export function normalizeVendorName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if recipient / transaction is an internal non-vendor transaction
 * (e.g. Labor / Wages, Mandor, Tukang, Worker, Tax Payment, Bank Transfer, Kas Keluar/Masuk, Bunga, Admin)
 */
export function isInternalNonVendorTransaction(
  recipientOrStoreName: string,
  uraian: string = ''
): boolean {
  if (!recipientOrStoreName && !uraian) return true;

  const text = `${recipientOrStoreName || ''} ${uraian || ''}`.toLowerCase();

  const internalKeywords = [
    'upah tukang',
    'pekerja',
    'mandor',
    'kepala tukang',
    'gaji',
    'hok',
    'honor p2sp',
    'kas keluar',
    'kas masuk',
    'tarik tunai bank',
    'setor pajak',
    'ppn disetor',
    'pph disetor',
    'bunga bank',
    'biaya admin bank',
    'pembukaan rekening',
    'pencairan dana',
    'dana bantuan',
    'panitia p2sp',
  ];

  return internalKeywords.some((kw) => text.includes(kw));
}

/**
 * Find matched Store/Vendor in Master Stores list
 */
export function findMasterStore(
  vendorOrStoreName: string,
  stores: StoreVendor[] = []
): StoreVendor | null {
  if (!vendorOrStoreName || !stores || stores.length === 0) return null;

  const targetNorm = normalizeVendorName(vendorOrStoreName);
  if (!targetNorm) return null;

  for (const store of stores) {
    const storeNameNorm = normalizeVendorName(store.namaToko);
    const ownerNameNorm = normalizeVendorName(store.pemilikNama);

    if (
      storeNameNorm === targetNorm ||
      ownerNameNorm === targetNorm ||
      (targetNorm.length > 3 && (storeNameNorm.includes(targetNorm) || targetNorm.includes(storeNameNorm)))
    ) {
      return store;
    }
  }

  return null;
}

/**
 * Check if store is registered in Master Stores
 */
export function isRegisteredVendor(
  vendorOrStoreName: string,
  stores: StoreVendor[] = []
): boolean {
  if (isInternalNonVendorTransaction(vendorOrStoreName)) return true;
  return findMasterStore(vendorOrStoreName, stores) !== null;
}

/**
 * Check if store is a SipLah vendor
 */
export function isSiplahVendor(
  vendorOrStoreName: string,
  stores: StoreVendor[] = []
): boolean {
  const store = findMasterStore(vendorOrStoreName, stores);
  if (!store) return false;
  return store.kategori === 'SIPLAH' || Boolean(store.isSiplah);
}
