import { AppStateData } from '../types';
import {
  initialSchoolData,
  initialWorkers,
  initialStores,
  initialRpdItems,
  initialProgressWeeks,
} from '../data/initialData';
import { DEFAULT_DIVISIONS, renumberDivisions, buildDivisionsFromRealSchoolData } from '../utils/divisionHelper';
import { logger } from '../utils/logger';

const STORAGE_KEY = 'LPJ_REVITALISASI_DATA_V1';

export type { AppStateData };

export interface DataAnomalyProposal {
  id: string;
  category: 'KWITANSI' | 'BKU' | 'STRUCTURAL';
  title: string;
  description: string;
  targetId: string;
  originalText: string;
  suggestedText: string;
  applyFix: (state: AppStateData) => AppStateData;
}

/**
 * Standardize divisions array for a progress week:
 * Preserves user custom divisions and integrates with RealSchoolData if available.
 */
export function standardizeWeekDivisions(existingDivisions: any[] = [], realData?: any): any[] {
  if (Array.isArray(existingDivisions) && existingDivisions.length >= 3) {
    return existingDivisions.map((d) => ({
      ...d,
      kode: d.kode?.trim() ? d.kode.trim() : 'I',
      prestasiMingguLalu: Number(d.prestasiMingguLalu) || 0,
      prestasiMingguIni: Number(d.prestasiMingguIni) || 0,
      prestasiSdMingguIni: Number(d.prestasiSdMingguIni) || 0,
      bobotTotal: Number(d.bobotTotal) || 0,
    }));
  }

  if (realData && realData.divisions && realData.divisions.length > 0) {
    return buildDivisionsFromRealSchoolData(realData);
  }

  const result = DEFAULT_DIVISIONS.map((def) => ({
    ...def,
    prestasiMingguLalu: 0,
    prestasiMingguIni: 0,
    prestasiSdMingguIni: 0,
  }));

  return renumberDivisions(result);
}

/**
 * Structural sanitization: Ensures state arrays and basic shapes are intact
 * WITHOUT silently altering user transaction titles, receipts, or financial records.
 */
export function sanitizeAndFilterDemoState(state: AppStateData): AppStateData {
  if (!state) return state;

  const rawWeeks = Array.isArray(state.progressWeeks) && state.progressWeeks.length > 0
    ? state.progressWeeks
    : initialProgressWeeks;

  const normalizedWeeks = rawWeeks.map((w) => ({
    ...w,
    divisions: standardizeWeekDivisions(w.divisions, state.realSchoolData),
  }));

  return {
    ...state,
    progressWeeks: normalizedWeeks,
    kwitansiList: Array.isArray(state.kwitansiList) ? state.kwitansiList : [],
    wageReports: Array.isArray(state.wageReports) ? state.wageReports : [],
    bkbRecords: Array.isArray(state.bkbRecords) ? state.bkbRecords : [],
    manualBkuTransactions: Array.isArray(state.manualBkuTransactions) ? state.manualBkuTransactions : [],
    deletedBkuIds: Array.isArray(state.deletedBkuIds) ? state.deletedBkuIds : [],
    deletedKwitansiIds: Array.isArray(state.deletedKwitansiIds) ? state.deletedKwitansiIds : [],
    manualTaxRecords: Array.isArray(state.manualTaxRecords) ? state.manualTaxRecords : [],
    deletedTaxIds: Array.isArray(state.deletedTaxIds) ? state.deletedTaxIds : [],
    stores: Array.isArray(state.stores) ? state.stores : initialStores,
    workers: Array.isArray(state.workers) ? state.workers : initialWorkers,
    rpdItems: Array.isArray(state.rpdItems) ? state.rpdItems : initialRpdItems,
  };
}

/**
 * Explicit Anomaly Detection (Requirement 5)
 * Inspects state for inconsistencies (e.g. material receipt codes tagged with honorarium text)
 * and returns proposals. The application NEVER applies them silently.
 */
export function detectDataAnomalies(state: AppStateData): DataAnomalyProposal[] {
  if (!state) return [];
  const proposals: DataAnomalyProposal[] = [];
  const activeFirstStore = state.stores && state.stores.length > 0 ? state.stores[0].namaToko : 'Toko Rekanan Material';

  // 1. Check Kwitansi anomalies
  (state.kwitansiList || []).forEach((kw) => {
    const isMaterialBukti =
      /kwt[\/\-_]?mat|kw[\/\-_]?mat|\bmat\b|mat[\/\-_]|material/i.test(kw.noBukti || '') ||
      kw.tipe === 'MATERIAL';
    const hasFalseHonor =
      /honorarium|pengawas|perencana|konsultan/i.test(kw.uraian || '') ||
      kw.tipe === 'KONSULTAN' ||
      /pengawas/i.test(kw.penerimaNama || '') ||
      /pengawas/i.test(kw.penerimaPekerjaan || '');

    if (isMaterialBukti && hasFalseHonor) {
      const store =
        kw.namaToko ||
        (!/pengawas|perencana|konsultan/i.test(kw.penerimaNama || '') ? kw.penerimaNama : '') ||
        activeFirstStore;
      const suggestedUraian = `Pembayaran Lunas Biaya Pembelian Material/Bahan Dari ${store}, Revitalisasi ${state.school?.namaSekolah || ''}`;

      proposals.push({
        id: `anomaly_kw_${kw.id}`,
        category: 'KWITANSI',
        title: `Kwitansi ${kw.noBukti || kw.id} Terdeteksi Tertulis Honorarium`,
        description: `Kwitansi memiliki kode bukti material (${kw.noBukti}) namun rincian uraian tertulis honorarium/konsultan.`,
        targetId: kw.id,
        originalText: kw.uraian || '',
        suggestedText: suggestedUraian,
        applyFix: (currentState: AppStateData) => {
          return {
            ...currentState,
            kwitansiList: (currentState.kwitansiList || []).map((k) => {
              if (k.id !== kw.id) return k;
              return {
                ...k,
                tipe: 'MATERIAL' as const,
                namaToko: store,
                penerimaNama: store,
                penerimaPekerjaan: 'Penyedia Bahan Bangunan',
                uraian: suggestedUraian,
                items:
                  k.items && k.items.length > 0 && !/jasa\s+konsultansi|pengawasan|honor/i.test(k.items[0]?.namaBarang || '')
                    ? k.items
                    : [{ namaBarang: 'Bahan Bangunan & Material Konstruksi', volume: 1, satuan: 'ls', hargaSatuan: k.nominal, jumlah: k.nominal }],
              };
            }),
          };
        },
      });
    }
  });

  // 2. Check BKU anomalies
  (state.manualBkuTransactions || []).forEach((tx) => {
    const isMaterialBukti =
      /kwt[\/\-_]?mat|kw[\/\-_]?mat|\bmat\b|mat[\/\-_]|material/i.test(tx.noBukti || '') ||
      tx.kategoriBiaya === 'Konstruksi';
    const hasFalseHonor = /honorarium|pengawas|perencana|konsultan/i.test(tx.uraian || '');

    if (isMaterialBukti && hasFalseHonor) {
      const storeMatch = tx.uraian.match(/\(([^)]+)\)/);
      const storeName = storeMatch && !/konsultan|pengawas|perencana/i.test(storeMatch[1])
        ? storeMatch[1]
        : activeFirstStore;
      const suggestedUraian = `Bayar Bahan Dari ${storeName}`;

      proposals.push({
        id: `anomaly_bku_${tx.id}`,
        category: 'BKU',
        title: `Transaksi BKU ${tx.noBukti || tx.id} Tidak Konsisten`,
        description: `No. Bukti material (${tx.noBukti}) dikategorikan konstruksi namun uraian menyebut honorarium/konsultan.`,
        targetId: tx.id,
        originalText: tx.uraian || '',
        suggestedText: suggestedUraian,
        applyFix: (currentState: AppStateData) => {
          return {
            ...currentState,
            manualBkuTransactions: (currentState.manualBkuTransactions || []).map((t) => {
              if (t.id !== tx.id) return t;
              return {
                ...t,
                kategoriBiaya: 'Konstruksi',
                uraian: suggestedUraian,
              };
            }),
          };
        },
      });
    }
  });

  return proposals;
}

export function getDefaultState(): AppStateData {
  return {
    school: initialSchoolData,
    rpdItems: initialRpdItems,
    workers: initialWorkers,
    stores: initialStores,
    progressWeeks: initialProgressWeeks,
    kwitansiList: [],
    wageReports: [],
    bkbRecords: [],
    manualBkuTransactions: [],
    deletedBkuIds: [],
    deletedKwitansiIds: [],
    manualTaxRecords: [],
    deletedTaxIds: [],
  };
}

/**
 * Load app state from local storage.
 * Note: Never silently triggers saveAppState during load.
 */
export function loadAppState(): AppStateData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.school && parsed.rpdItems) {
        return sanitizeAndFilterDemoState(parsed);
      }
    }
  } catch (err) {
    logger.error('StorageService', 'Failed to load from storage', err);
  }
  return getDefaultState();
}

export function saveAppState(data: AppStateData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    logger.error('StorageService', 'Failed to save to storage', err);
  }
}

export function resetToDefaultState(): AppStateData {
  const defaultData = getDefaultState();
  saveAppState(defaultData);
  return defaultData;
}
