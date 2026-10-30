import { RabSubItem, AhspItem } from '../types';
import { toRupiah, distributeRupiah } from './money';

// Shared fallback constant ratio (60% material, 40% labor)
export const DEFAULT_MATERIAL_LABOR_RATIO = { material: 0.6, labor: 0.4 };

export const calculateAhspSplit = (
  item: RabSubItem,
  ahspList: AhspItem[]
): { materialValue: number; laborValue: number } => {
  const itemJumlah = toRupiah(item.jumlah);
  const ahsp = ahspList.find((a) => a.id === item.ahspIdRef);
  
  if (!ahsp || !ahsp.komponen || ahsp.komponen.length === 0) {
    const split = distributeRupiah(itemJumlah, [DEFAULT_MATERIAL_LABOR_RATIO.material, DEFAULT_MATERIAL_LABOR_RATIO.labor]);
    return {
      materialValue: split[0],
      laborValue: split[1],
    };
  }

  let materialTotal = 0;
  let laborTotal = 0;

  ahsp.komponen.forEach((komp) => {
    const compTotal = toRupiah(komp.totalHarga);
    if (komp.kategori === 'UPAH') {
      laborTotal += compTotal;
    } else {
      materialTotal += compTotal;
    }
  });

  const totalAhsp = materialTotal + laborTotal;
  if (totalAhsp === 0) {
    const split = distributeRupiah(itemJumlah, [DEFAULT_MATERIAL_LABOR_RATIO.material, DEFAULT_MATERIAL_LABOR_RATIO.labor]);
    return {
      materialValue: split[0],
      laborValue: split[1],
    };
  }

  const split = distributeRupiah(itemJumlah, [materialTotal, laborTotal]);
  return {
    materialValue: split[0],
    laborValue: split[1],
  };
};
