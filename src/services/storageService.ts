import { AppStateData } from '../types';
import {
  initialSchoolData,
  initialWorkers,
  initialStores,
  initialRpdItems,
  initialProgressWeeks,
} from '../data/initialData';
import { DEFAULT_DIVISIONS, renumberDivisions, buildDivisionsFromRealSchoolData } from '../utils/divisionHelper';

const STORAGE_KEY = 'LPJ_REVITALISASI_DATA_V1';

export type { AppStateData };

/**
 * Standardize divisions array for a progress week:
 * Preserves user custom divisions and integrates with RealSchoolData if available.
 */
function standardizeWeekDivisions(existingDivisions: any[] = [], realData?: any): any[] {
  // If user already has divisions defined (customized or from RealSchoolData), preserve them!
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

  // If realData is provided, build directly from realData
  if (realData && realData.divisions && realData.divisions.length > 0) {
    return buildDivisionsFromRealSchoolData(realData);
  }

  // Fallback to DEFAULT_DIVISIONS
  const result = DEFAULT_DIVISIONS.map((def) => ({
    ...def,
    prestasiMingguLalu: 0,
    prestasiMingguIni: 0,
    prestasiSdMingguIni: 0,
  }));

  return renumberDivisions(result);
}

/**
 * Preserves all user-entered data while enforcing valid division structure across redeploys.
 */
export function sanitizeAndFilterDemoState(state: AppStateData): AppStateData {
  if (!state) return state;

  const rawWeeks = Array.isArray(state.progressWeeks) && state.progressWeeks.length > 0
    ? state.progressWeeks
    : initialProgressWeeks;

  const activeFirstStore = state.stores && state.stores.length > 0 ? state.stores[0].namaToko : 'Toko Rekanan Material';

  const normalizedWeeks = rawWeeks.map((w) => ({
    ...w,
    divisions: standardizeWeekDivisions(w.divisions, state.realSchoolData),
  }));

  const targetYear = state.school?.tahunAnggaran?.trim() || '2026';

  return {
    ...state,
    progressWeeks: normalizedWeeks,
    // Auto-heal any material transactions (e.g. kwt/mat, kw-mat, MAT) that falsely got labelled as Honorarium Pengawas or Konsultan
    kwitansiList: (state.kwitansiList || []).map((kw) => {
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
          (!/pengawas|perencana|erwin|dzikri|syahputra/i.test(kw.penerimaNama || '') ? kw.penerimaNama : '') ||
          activeFirstStore;
        return {
          ...kw,
          tipe: 'MATERIAL' as const,
          namaToko: store,
          penerimaNama: store,
          penerimaPekerjaan: 'Penyedia Bahan Bangunan',
          uraian: `Pembayaran Lunas Biaya Pembelian Material/Bahan Dari ${store}, Revitalisasi ${state.school?.namaSekolah || ''}`,
          items:
            kw.items && kw.items.length > 0 && !/jasa\s+konsultansi|pengawasan|honor/i.test(kw.items[0]?.namaBarang || '')
              ? kw.items
              : [{ namaBarang: 'Bahan Bangunan & Material Konstruksi', volume: 1, satuan: 'ls', hargaSatuan: kw.nominal, jumlah: kw.nominal }],
        };
      }
      return kw;
    }),
    wageReports: state.wageReports || [],
    bkbRecords: state.bkbRecords || [],
    manualBkuTransactions: (state.manualBkuTransactions || []).map((tx) => {
      const isMaterialBukti =
        /kwt[\/\-_]?mat|kw[\/\-_]?mat|\bmat\b|mat[\/\-_]|material/i.test(tx.noBukti || '') ||
        tx.kategoriBiaya === 'Konstruksi';
      const hasFalseHonor = /honorarium|pengawas|perencana|konsultan/i.test(tx.uraian || '');

      if (isMaterialBukti && hasFalseHonor) {
        const storeMatch = tx.uraian.match(/\(([^)]+)\)/);
        const storeName = storeMatch && !/erwin|dzikri|syahputra|dprint/i.test(storeMatch[1])
          ? storeMatch[1]
          : activeFirstStore;
        return {
          ...tx,
          kategoriBiaya: 'Konstruksi',
          uraian: `Bayar Bahan Dari ${storeName}`,
        };
      }
      return tx;
    }),
    deletedBkuIds: state.deletedBkuIds || [],
    deletedKwitansiIds: state.deletedKwitansiIds || [],
    manualTaxRecords: state.manualTaxRecords || [],
    deletedTaxIds: state.deletedTaxIds || [],
  };
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

export function loadAppState(): AppStateData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.school && parsed.rpdItems) {
        const cleanState = sanitizeAndFilterDemoState(parsed);
        saveAppState(cleanState);
        return cleanState;
      }
    }
  } catch (err) {
    console.error('Failed to load from storage:', err);
  }
  const defaultData = getDefaultState();
  saveAppState(defaultData);
  return defaultData;
}

export function saveAppState(data: AppStateData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error('Failed to save to storage:', err);
  }
}

export function resetToDefaultState(): AppStateData {
  const defaultData = getDefaultState();
  saveAppState(defaultData);
  return defaultData;
}
