import { RabSubItem, AhspItem } from '../types';

export const calculateAhspSplit = (
  item: RabSubItem,
  ahspList: AhspItem[]
): { materialValue: number; laborValue: number } => {
  const ahsp = ahspList.find((a) => a.id === item.ahspIdRef);
  
  if (!ahsp || !ahsp.komponen || ahsp.komponen.length === 0) {
    // Fallback: Use 60/40 if AHSP not found
    return {
      materialValue: item.jumlah * 0.6,
      laborValue: item.jumlah * 0.4,
    };
  }

  let materialTotal = 0;
  let laborTotal = 0;

  ahsp.komponen.forEach((komp) => {
    // Categories for material: BAHAN, PINTU_JENDELA, ALAT, SMKK, CETAK, SIPLAH
    // Categories for labor: UPAH
    if (komp.kategori === 'UPAH') {
      laborTotal += komp.totalHarga;
    } else {
      materialTotal += komp.totalHarga;
    }
  });

  const totalAhsp = materialTotal + laborTotal;
  if (totalAhsp === 0) {
    return {
      materialValue: item.jumlah * 0.6,
      laborValue: item.jumlah * 0.4,
    };
  }

  const materialRatio = materialTotal / totalAhsp;
  const laborRatio = laborTotal / totalAhsp;

  return {
    materialValue: item.jumlah * materialRatio,
    laborValue: item.jumlah * laborRatio,
  };
};
