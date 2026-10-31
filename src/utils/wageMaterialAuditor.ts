import { AppStateData } from '../types';
import { toRupiah } from './money';
import { getItemMaterialLaborSplit } from './ahspHelper';
import { classifyKwitansiCategory } from './projectSummaryRekapHelper';

export interface RabItemWageMaterialAudit {
  divisionCode: string;
  divisionUraian: string;
  itemId: string;
  uraian: string;
  jumlahRab: number;
  porsiMaterial: number;
  porsiUpah: number;
  realisasiMaterial: number;
  realisasiUpah: number;
  selisihMaterial: number;
  selisihUpah: number;
  totalDiscrepancy: number;
}

export interface WageMaterialAuditReport {
  items: RabItemWageMaterialAudit[];
  totalRab: number;
  totalPorsiMaterial: number;
  totalPorsiUpah: number;
  totalRealisasiMaterial: number;
  totalRealisasiUpah: number;
  selisihTotalMaterial: number;
  selisihTotalUpah: number;
}

/**
 * Audits RAB items against realized kwitansi for Labor and Material balances.
 * Prints structured console.table summary and returns items sorted by largest discrepancy.
 */
export function auditWageMaterial(appState: AppStateData): WageMaterialAuditReport {
  const ahspList = appState.realSchoolData?.ahspList || [];
  const divisions = appState.realSchoolData?.divisions || [];
  const kwitansiList = appState.kwitansiList || [];

  let totalRab = 0;
  let totalPorsiMaterial = 0;
  let totalPorsiUpah = 0;

  // Track realized totals by category
  let totalRealisasiMaterial = 0;
  let totalRealisasiUpah = 0;

  kwitansiList.forEach((kw) => {
    const cat = classifyKwitansiCategory(kw);
    const nom = toRupiah(kw.nominal);
    if (cat === 'UPAH_KERJA' || kw.tipe === 'UPAH') {
      totalRealisasiUpah += nom;
    } else if (cat === 'BAHAN_MATERIAL' || kw.tipe === 'MATERIAL') {
      totalRealisasiMaterial += nom;
    }
  });

  // Map item realizations based on item occurrences inside kwitansi documents
  const realizedMatByItemName = new Map<string, number>();
  const realizedWageByItemName = new Map<string, number>();

  kwitansiList.forEach((kw) => {
    const isWage = kw.tipe === 'UPAH' || classifyKwitansiCategory(kw) === 'UPAH_KERJA';
    (kw.items || []).forEach((it) => {
      const cleanName = (it.namaBarang || '').toLowerCase().trim();
      const amt = toRupiah(it.jumlah);
      if (isWage) {
        realizedWageByItemName.set(cleanName, (realizedWageByItemName.get(cleanName) || 0) + amt);
      } else {
        realizedMatByItemName.set(cleanName, (realizedMatByItemName.get(cleanName) || 0) + amt);
      }
    });
  });

  const auditItems: RabItemWageMaterialAudit[] = [];

  divisions.forEach((div) => {
    (div.items || []).forEach((it) => {
      const rabJml = toRupiah(it.jumlah);
      totalRab += rabJml;

      const split = getItemMaterialLaborSplit(it, ahspList);
      totalPorsiMaterial += split.material;
      totalPorsiUpah += split.labor;

      const lowerUraian = (it.uraian || '').toLowerCase().trim();

      // Find direct or partial matched realization from kwitansi items
      let itemRealizedMat = realizedMatByItemName.get(lowerUraian) || 0;
      let itemRealizedUpah = realizedWageByItemName.get(lowerUraian) || 0;

      // If no exact item match, check if this is a manufactured item or directly named
      if (itemRealizedMat === 0) {
        kwitansiList.forEach((kw) => {
          if (kw.tipe !== 'UPAH' && classifyKwitansiCategory(kw) !== 'UPAH_KERJA') {
            (kw.items || []).forEach((kwi) => {
              const kwiName = (kwi.namaBarang || '').toLowerCase();
              if (kwiName.includes(lowerUraian) || lowerUraian.includes(kwiName)) {
                itemRealizedMat += toRupiah(kwi.jumlah);
              }
            });
          }
        });
      }

      const selisihMat = itemRealizedMat - split.material;
      const selisihUp = itemRealizedUpah - split.labor;
      const totalDisc = Math.abs(selisihMat) + Math.abs(selisihUp);

      auditItems.push({
        divisionCode: div.kode,
        divisionUraian: div.uraian,
        itemId: it.id,
        uraian: it.uraian,
        jumlahRab: rabJml,
        porsiMaterial: split.material,
        porsiUpah: split.labor,
        realisasiMaterial: itemRealizedMat,
        realisasiUpah: itemRealizedUpah,
        selisihMaterial: selisihMat,
        selisihUpah: selisihUp,
        totalDiscrepancy: totalDisc,
      });
    });
  });

  // Sort by highest total discrepancy first
  auditItems.sort((a, b) => b.totalDiscrepancy - a.totalDiscrepancy);

  const report: WageMaterialAuditReport = {
    items: auditItems,
    totalRab,
    totalPorsiMaterial,
    totalPorsiUpah,
    totalRealisasiMaterial,
    totalRealisasiUpah,
    selisihTotalMaterial: totalRealisasiMaterial - totalPorsiMaterial,
    selisihTotalUpah: totalRealisasiUpah - totalPorsiUpah,
  };

  // Structured console output
  console.group('🔍 [AUDIT UPAH & BAHAN RAB VS KWITANSI]');
  console.log(`Total Nilai RAB: Rp ${totalRab.toLocaleString('id-ID')}`);
  console.log(`Pagu Material: Rp ${totalPorsiMaterial.toLocaleString('id-ID')} | Realisasi: Rp ${totalRealisasiMaterial.toLocaleString('id-ID')} (Selisih: Rp ${report.selisihTotalMaterial.toLocaleString('id-ID')})`);
  console.log(`Pagu Upah: Rp ${totalPorsiUpah.toLocaleString('id-ID')} | Realisasi: Rp ${totalRealisasiUpah.toLocaleString('id-ID')} (Selisih: Rp ${report.selisihTotalUpah.toLocaleString('id-ID')})`);
  console.table(
    auditItems.slice(0, 15).map((row) => ({
      Divisi: row.divisionCode,
      Uraian: row.uraian.slice(0, 35),
      'RAB (Rp)': row.jumlahRab,
      'Porsi Mat': row.porsiMaterial,
      'Porsi Upah': row.porsiUpah,
      'Real Mat': row.realisasiMaterial,
      'Real Upah': row.realisasiUpah,
      'Selisih Total': row.totalDiscrepancy,
    }))
  );
  console.groupEnd();

  return report;
}
