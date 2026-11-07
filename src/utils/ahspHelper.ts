import { RabSubItem, AhspItem } from '../types';
import { toRupiah, distributeRupiah } from './money';

// Shared fallback constant ratio (60% material, 40% labor)
export const DEFAULT_MATERIAL_LABOR_RATIO = { material: 0.6, labor: 0.4 };

/**
 * Resolves an AHSP item strictly by ID / ahspIdRef / kodeAhsp.
 * No loose keyword matching.
 */
export function resolveAhsp(
  item: Partial<RabSubItem> | null | undefined,
  ahspList: AhspItem[] = []
): AhspItem | undefined {
  if (!item || !ahspList || ahspList.length === 0) return undefined;
  if (item.ahspIdRef) {
    const foundById = ahspList.find((a) => a.id === item.ahspIdRef);
    if (foundById) return foundById;
    const foundByKodeRef = ahspList.find((a) => a.kodePekerjaan === item.ahspIdRef);
    if (foundByKodeRef) return foundByKodeRef;
  }
  if (item.kodeAhsp) {
    const foundByKode = ahspList.find((a) => a.kodePekerjaan === item.kodeAhsp || a.id === item.kodeAhsp);
    if (foundByKode) return foundByKode;
  }
  return undefined;
}

/**
 * Single source of truth for splitting any RAB item into Material and Labor portions.
 * Priority:
 * 1. Confirmed item.allocationSplit
 * 2. Strict resolveAhsp(item, ahspList) match
 * 3. Pure category: UPAH -> 100% labor; BAHAN/SMKK/CETAK/SIPLAH/etc. -> 100% material
 * 4. Fallback for composite UPAH_BAHAN without AHSP: DEFAULT_MATERIAL_LABOR_RATIO (60/40), marked with isEstimation: true
 */
export function getItemMaterialLaborSplit(
  item: Partial<RabSubItem> | null | undefined,
  ahspList: AhspItem[] = []
): { material: number; labor: number; isEstimation?: boolean } {
  if (!item) return { material: 0, labor: 0 };
  const total = toRupiah(item.jumlah);
  if (total <= 0) return { material: 0, labor: 0 };

  // a. Confirmed allocationSplit
  if (item.allocationSplit && item.allocationSplit.isConfirmed) {
    const rawMat = toRupiah(item.allocationSplit.materialValue);
    const rawLab = toRupiah(item.allocationSplit.laborValue);
    if (rawMat + rawLab > 0) {
      const split = distributeRupiah(total, [rawMat, rawLab]);
      return { material: split[0], labor: split[1] };
    }
  }

  // b. Strict AHSP match via resolveAhsp
  const ahsp = resolveAhsp(item, ahspList);
  if (ahsp && Array.isArray(ahsp.komponen) && ahsp.komponen.length > 0) {
    let matTotal = 0;
    let labTotal = 0;
    ahsp.komponen.forEach((c) => {
      const cVal = toRupiah(c.totalHarga) || Math.round(toRupiah(c.hargaSatuan) * (c.koefisien || 1));
      const isLabor = c.kategori === 'UPAH' || /tukang|pekerja|mandor/i.test(c.uraian);
      if (isLabor) {
        labTotal += cVal;
      } else {
        matTotal += cVal;
      }
    });

    if (matTotal + labTotal > 0) {
      const split = distributeRupiah(total, [matTotal, labTotal]);
      return { material: split[0], labor: split[1] };
    }
  }

  // c. Pure categories vs Composite
  const tags = (item.tags || []).map((t) => t.toUpperCase());
  const kat = String(item.kategoriBiaya || '').toUpperCase().trim();
  const u = (item.uraian || '').toLowerCase();

  const isUpahBahan =
    kat === 'UPAH_BAHAN' ||
    kat === 'UPAH & BAHAN' ||
    kat === 'UPAH&BAHAN' ||
    (tags.includes('MAT') && tags.includes('UPAH')) ||
    /upah.*bahan|bahan.*upah/i.test(u);

  if (!isUpahBahan) {
    if (tags.includes('UPAH') || kat === 'UPAH') {
      return { material: 0, labor: total };
    }
    return { material: total, labor: 0 };
  }

  // d. Fallback for UPAH_BAHAN without AHSP: DEFAULT_MATERIAL_LABOR_RATIO (60/40)
  const split = distributeRupiah(total, [
    DEFAULT_MATERIAL_LABOR_RATIO.material,
    DEFAULT_MATERIAL_LABOR_RATIO.labor,
  ]);
  return { material: split[0], labor: split[1], isEstimation: true };
}

export const calculateAhspSplit = (
  item: RabSubItem,
  ahspList: AhspItem[]
): { materialValue: number; laborValue: number; isEstimation?: boolean } => {
  const split = getItemMaterialLaborSplit(item, ahspList);
  return {
    materialValue: split.material,
    laborValue: split.labor,
    isEstimation: split.isEstimation,
  };
};
