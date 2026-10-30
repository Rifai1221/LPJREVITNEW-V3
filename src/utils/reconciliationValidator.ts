import {
  AppStateData,
  TaxRecord,
  BkuTransaction,
  BktTransaction,
  BkbTransaction,
} from '../types';
import { toRupiah, addRupiah, subRupiah } from './money';
import { calculateAhspSplit } from './ahspHelper';

export interface ReconciliationAlert {
  id: string;
  category: 'KAS_LEDGER' | 'NEGATIVE_BALANCE' | 'TAX_MISMATCH' | 'BUDGET_OVERSPEND';
  severity: 'ERROR' | 'WARNING';
  title: string;
  description: string;
  expectedValue: number;
  actualValue: number;
  difference: number;
  targetTab: string; // Tab to navigate to (e.g. 'bku', 'bkb', 'bkt', 'pajak', 'kwitansi', 'rpd')
  details?: string[];
}

export interface ReconciliationReport {
  isValid: boolean;
  alerts: ReconciliationAlert[];
  totals: {
    bkuBalance: number;
    bkbBalance: number;
    bktBalance: number;
    kwitansiTaxTotal: number;
    taxRecordsTotal: number;
    totalExpenditure: number;
    totalBudget: number;
  };
}

/**
 * Validates financial integrity across all accounting ledgers:
 * 1. BKU Equality: Total Saldo BKU = Saldo BKB (Bank) + Saldo BKT (Tunai)
 * 2. Non-negative Balance: Saldo BKU, BKB, and BKT must never be negative
 * 3. Tax Reconciliation: Sum of taxes in Kwitansi == Sum of taxes in Laporan Pajak
 * 4. Budget Ceiling: Realized expenditures must not exceed RPD / Total Anggaran
 */
export function validateFinancialReconciliation(
  appState: AppStateData,
  bkuList: BkuTransaction[],
  bktList: BktTransaction[],
  bkbList: BkbTransaction[],
  taxRecords: TaxRecord[]
): ReconciliationReport {
  const alerts: ReconciliationAlert[] = [];

  // 1. Calculate End Balances
  const lastBku = bkuList.length > 0 ? bkuList[bkuList.length - 1] : null;
  const bkuBalance = toRupiah(lastBku?.saldo);

  const lastBkb = bkbList.length > 0 ? bkbList[bkbList.length - 1] : null;
  const bkbBalance = toRupiah(lastBkb?.saldo);

  const lastBkt = bktList.length > 0 ? bktList[bktList.length - 1] : null;
  const bktBalance = toRupiah(lastBkt?.saldo);

  const combinedBankAndCash = addRupiah(bkbBalance, bktBalance);

  // Check 1: BKU == BKB + BKT
  if (bkuBalance !== combinedBankAndCash) {
    const diff = subRupiah(bkuBalance, combinedBankAndCash);
    alerts.push({
      id: 'alert_bku_bkb_bkt_inequality',
      category: 'KAS_LEDGER',
      severity: 'ERROR',
      title: 'Ketidaksesuaian Saldo Kas (BKU ≠ BKB + BKT)',
      description: `Saldo Kas Umum BKU (Rp ${bkuBalance.toLocaleString('id-ID')}) tidak sama dengan gabungan Saldo Bank BKB + Kas Tunai BKT (Rp ${combinedBankAndCash.toLocaleString('id-ID')}). Terdapat selisih Rp ${Math.abs(diff).toLocaleString('id-ID')}.`,
      expectedValue: combinedBankAndCash,
      actualValue: bkuBalance,
      difference: diff,
      targetTab: 'bku',
      details: [
        `Saldo Akhir BKU: Rp ${bkuBalance.toLocaleString('id-ID')}`,
        `Saldo Akhir BKB (Bank): Rp ${bkbBalance.toLocaleString('id-ID')}`,
        `Saldo Akhir BKT (Kas Tunai): Rp ${bktBalance.toLocaleString('id-ID')}`,
      ],
    });
  }

  // Check 2: Non-negative Cash Balance
  const negativeBkuTx = bkuList.find((b) => (b.saldo || 0) < 0);
  if (negativeBkuTx) {
    alerts.push({
      id: 'alert_negative_bku_balance',
      category: 'NEGATIVE_BALANCE',
      severity: 'ERROR',
      title: 'Saldo Kas BKU Minus (Defisit Kas)',
      description: `Terdeteksi saldo kas minus sebesar Rp ${toRupiah(negativeBkuTx.saldo).toLocaleString('id-ID')} pada transaksi "${negativeBkuTx.uraian}" (${negativeBkuTx.tanggal}). Pengeluaran tidak boleh mendahului penarikan dana kas.`,
      expectedValue: 0,
      actualValue: toRupiah(negativeBkuTx.saldo),
      difference: Math.abs(toRupiah(negativeBkuTx.saldo)),
      targetTab: 'bku',
      details: [`No. Bukti: ${negativeBkuTx.noBukti || '-'}`, `Tanggal: ${negativeBkuTx.tanggal}`],
    });
  }

  const negativeBktTx = bktList.find((b) => (b.saldo || 0) < 0);
  if (negativeBktTx) {
    alerts.push({
      id: 'alert_negative_bkt_balance',
      category: 'NEGATIVE_BALANCE',
      severity: 'ERROR',
      title: 'Saldo Kas Tunai BKT Minus',
      description: `Saldo kas tunai di brankas minus sebesar Rp ${toRupiah(negativeBktTx.saldo).toLocaleString('id-ID')} pada tanggal ${negativeBktTx.tanggal}. Penarikan tunai dari bank belum mencukupi belanja tunai.`,
      expectedValue: 0,
      actualValue: toRupiah(negativeBktTx.saldo),
      difference: Math.abs(toRupiah(negativeBktTx.saldo)),
      targetTab: 'bkt',
      details: [`Uraian: ${negativeBktTx.uraian}`],
    });
  }

  // Check 3: Tax Reconciliation (Rekap Pajak vs Kwitansi)
  const kwitansiTaxTotal = (appState.kwitansiList || []).reduce((acc, kw) => {
    const ppn = toRupiah(kw.ppnAmount);
    const pph22 = toRupiah(kw.pph22Amount);
    const pph23 = toRupiah(kw.pph23Amount);
    return acc + ppn + pph22 + pph23;
  }, 0);

  const taxRecordsTotal = (taxRecords || []).reduce((acc, t) => {
    const ppn = toRupiah(t.ppn11);
    const pph22 = toRupiah(t.pph22);
    const pph23 = toRupiah(t.pph23);
    return acc + ppn + pph22 + pph23;
  }, 0);

  if (kwitansiTaxTotal !== taxRecordsTotal) {
    const diff = subRupiah(kwitansiTaxTotal, taxRecordsTotal);
    alerts.push({
      id: 'alert_tax_mismatch',
      category: 'TAX_MISMATCH',
      severity: 'ERROR',
      title: 'Selisih Rekonsiliasi Pajak (Kwitansi vs Buku Pajak)',
      description: `Total potongan pajak pada daftar kwitansi (Rp ${kwitansiTaxTotal.toLocaleString('id-ID')}) berbeda dengan total di Buku Pajak (Rp ${taxRecordsTotal.toLocaleString('id-ID')}). Selisih: Rp ${Math.abs(diff).toLocaleString('id-ID')}.`,
      expectedValue: kwitansiTaxTotal,
      actualValue: taxRecordsTotal,
      difference: diff,
      targetTab: 'pajak',
    });
  }

  // Check 4: Budget Ceiling (Realisasi Belanja vs Pagu Total)
  const totalBudget = toRupiah(appState.school?.totalAnggaran);
  const totalExpenditure = (appState.kwitansiList || []).reduce(
    (sum, k) => sum + toRupiah(k.nominal),
    0
  );

  if (totalBudget > 0 && totalExpenditure > totalBudget) {
    const overspend = subRupiah(totalExpenditure, totalBudget);
    alerts.push({
      id: 'alert_budget_overspend',
      category: 'BUDGET_OVERSPEND',
      severity: 'ERROR',
      title: 'Realisasi Melebihi Pagu Anggaran',
      description: `Total realisasi belanja kwitansi (Rp ${totalExpenditure.toLocaleString('id-ID')}) melampaui Pagu Anggaran (Rp ${totalBudget.toLocaleString('id-ID')}) sebesar Rp ${overspend.toLocaleString('id-ID')}.`,
      expectedValue: totalBudget,
      actualValue: totalExpenditure,
      difference: overspend,
      targetTab: 'kwitansi',
    });
  }

  // Check 5: Per-category Kwitansi vs RAB Pagu, Item sum vs Nominal, and Per-kwitansi Tax checks
  const categoryMap: Record<string, number> = {
    BAHAN: 0,
    UPAH: 0,
    SMKK: 0,
    SIPLAH: 0,
    CETAK: 0,
    FURNITUR: 0,
    KONSULTAN: 0,
    PENGAWAS: 0,
    PENGELOLA: 0,
  };

  if (appState.realSchoolData?.divisions) {
    appState.realSchoolData.divisions.forEach((div: any) => {
      (div.items || []).forEach((it: any) => {
        const amt = toRupiah(it.jumlah);
        const tags = (it.tags || []).map((t: string) => t.toUpperCase());
        const kat = (it.kategoriBiaya || '').toUpperCase();
        const u = (it.uraian || '').toLowerCase();

        const isUpahBahan = kat === 'UPAH_BAHAN' || kat === 'UPAH & BAHAN' || (tags.includes('MAT') && tags.includes('UPAH')) || /upah.*bahan|bahan.*upah/i.test(u);

        if (isUpahBahan) {
          const split = it.allocationSplit && it.allocationSplit.isConfirmed
            ? { materialValue: toRupiah(it.allocationSplit.materialValue), laborValue: toRupiah(it.allocationSplit.laborValue) }
            : calculateAhspSplit(it, appState.realSchoolData?.ahspList || []);
          categoryMap.BAHAN += split.materialValue;
          categoryMap.UPAH += split.laborValue;
        } else if (tags.includes('CTK') || kat === 'CETAK' || /papan\s*nama|prasasti/i.test(u)) {
          categoryMap.CETAK += amt;
        } else if (tags.includes('SMKK') || kat === 'SMKK' || /smkk|k3|helm/i.test(u)) {
          categoryMap.SMKK += amt;
        } else if (tags.includes('SIPLAH') || kat === 'SIPLAH' || /siplah/i.test(u)) {
          categoryMap.SIPLAH += amt;
        } else if (tags.includes('KONS-P') || kat === 'PERENCANA' || /perencana/i.test(u)) {
          categoryMap.KONSULTAN += amt;
        } else if (tags.includes('KONS-W') || kat === 'PENGAWAS' || /pengawas/i.test(u)) {
          categoryMap.PENGAWAS += amt;
        } else if (tags.includes('SPJ') || kat === 'PENGELOLA' || /spj|administrasi/i.test(u)) {
          categoryMap.PENGELOLA += amt;
        } else if (tags.includes('FUR') || kat === 'PINTU_JENDELA' || it.isBarangPabrikasi || /pintu|jendela|mebeler|kursi|meja/i.test(u)) {
          categoryMap.FURNITUR += amt;
        } else if (tags.includes('UPAH') || kat === 'UPAH') {
          categoryMap.UPAH += amt;
        } else {
          categoryMap.BAHAN += amt;
        }
      });
    });
  }

  // Ensure total sum matches total RAB exactly via distributeRupiah check / normalization if needed
  const totalRabNominal = toRupiah(appState.realSchoolData?.totalNilaiRab || appState.school?.totalAnggaran);
  const sumCatPagu = Object.values(categoryMap).reduce((s, v) => s + v, 0);
  if (totalRabNominal > 0 && sumCatPagu > 0 && sumCatPagu !== totalRabNominal) {
    const diff = totalRabNominal - sumCatPagu;
    categoryMap.BAHAN += diff; // absorb into BAHAN bucket
  }

  const kwCategoryMap: Record<string, number> = {
    BAHAN: 0,
    UPAH: 0,
    SMKK: 0,
    SIPLAH: 0,
    CETAK: 0,
    FURNITUR: 0,
    KONSULTAN: 0,
    PENGAWAS: 0,
    PENGELOLA: 0,
  };

  const categoryKwDetails: Record<string, Array<{ noBukti: string; toko: string; nominal: number }>> = {
    BAHAN: [],
    UPAH: [],
    SMKK: [],
    SIPLAH: [],
    CETAK: [],
    FURNITUR: [],
    KONSULTAN: [],
    PENGAWAS: [],
    PENGELOLA: [],
  };

  (appState.kwitansiList || []).forEach((kw) => {
    const nom = toRupiah(kw.nominal);
    const tipe = (kw.tipe || '').toUpperCase();
    const bukti = (kw.noBukti || '').toUpperCase();
    const uraian = (kw.uraian || '').toLowerCase();
    const toko = kw.namaToko || kw.penerimaNama || 'Kasir/Penyedia';

    // Check (b) kwitansi nominal == sum items with item name detail
    const itemsSum = (kw.items || []).reduce((s, it) => s + toRupiah(it.jumlah), 0);
    if (itemsSum > 0 && itemsSum !== nom) {
      const mismatchedItems = (kw.items || []).map((it) => it.namaBarang).join(', ');
      alerts.push({
        id: `alert_kw_items_mismatch_${kw.id}`,
        category: 'BUDGET_OVERSPEND',
        severity: 'WARNING',
        title: `Selisih Jumlah Item Kwitansi (${kw.noBukti})`,
        description: `Nominal kwitansi Rp ${nom.toLocaleString('id-ID')} berbeda dengan total jumlah item Rp ${itemsSum.toLocaleString('id-ID')} pada item: ${mismatchedItems}.`,
        expectedValue: nom,
        actualValue: itemsSum,
        difference: subRupiah(nom, itemsSum),
        targetTab: 'kwitansi',
      });
    }

    let assignedCat = 'BAHAN';
    if (tipe === 'UPAH' || /^UK\//i.test(bukti)) {
      assignedCat = 'UPAH';
    } else if (tipe === 'PERABOT' || /^FUR\//i.test(bukti) || /pintu|jendela|mebeler/i.test(uraian)) {
      assignedCat = 'FURNITUR';
    } else if (tipe === 'CETAK' || /^CTK\//i.test(bukti) || /papan nama/i.test(uraian)) {
      assignedCat = 'CETAK';
    } else if (tipe === 'SMKK' || /SMKK/i.test(bukti) || /smkk|k3/i.test(uraian)) {
      assignedCat = 'SMKK';
    } else if (/SIPLAH/i.test(bukti) || /siplah/i.test(uraian)) {
      assignedCat = 'SIPLAH';
    } else if (/KONS-P/i.test(bukti) || /perencana/i.test(uraian)) {
      assignedCat = 'KONSULTAN';
    } else if (/KONS-W/i.test(bukti) || /pengawas/i.test(uraian)) {
      assignedCat = 'PENGAWAS';
    } else if (/ADM/i.test(bukti) || /pengelola/i.test(uraian)) {
      assignedCat = 'PENGELOLA';
    }

    kwCategoryMap[assignedCat] += nom;
    categoryKwDetails[assignedCat].push({ noBukti: kw.noBukti || '-', toko, nominal: nom });
  });

  // Check (a) & (3) & (4) kwitansi per category vs pagu RAB per category with duplicate details
  Object.keys(categoryMap).forEach((cat) => {
    const pagu = categoryMap[cat];
    const real = kwCategoryMap[cat];
    const detailsList = categoryKwDetails[cat] || [];

    if (pagu > 0 && real > pagu) {
      const diff = subRupiah(real, pagu);
      const isFixedCat = cat !== 'BAHAN' && cat !== 'UPAH';
      const detailStrs = detailsList.map((d) => `${d.noBukti} (${d.toko}): Rp ${d.nominal.toLocaleString('id-ID')}`);

      alerts.push({
        id: `alert_cat_overspend_${cat}`,
        category: 'BUDGET_OVERSPEND',
        severity: 'WARNING',
        title: isFixedCat ? `Kemungkinan Kwitansi Ganda Kategori ${cat}` : `Realisasi Kategori ${cat} Melampaui Pagu`,
        description: isFixedCat
          ? `Total realisasi kwitansi ${cat} (Rp ${real.toLocaleString('id-ID')}) melebihi pagu (Rp ${pagu.toLocaleString('id-ID')}). Kemungkinan terdapat duplikasi kwitansi dengan toko atau nominal yang sama.`
          : `Realisasi kwitansi kategori ${cat} (Rp ${real.toLocaleString('id-ID')}) melebihi pagu RAB (Rp ${pagu.toLocaleString('id-ID')}) sebesar Rp ${diff.toLocaleString('id-ID')}.`,
        expectedValue: pagu,
        actualValue: real,
        difference: diff,
        targetTab: 'kwitansi',
        details: detailStrs,
      });
    }
  });

  // Check (d) Per-kwitansi tax check vs Tax Records
  const taxMap = new Map((taxRecords || []).map((t) => [t.kwitansiIdRef, t]));
  (appState.kwitansiList || []).forEach((kw) => {
    const matchingTax = taxMap.get(kw.id);
    if (matchingTax) {
      const kwTax = toRupiah(kw.ppnAmount) + toRupiah(kw.pph22Amount) + toRupiah(kw.pph23Amount);
      const recTax = toRupiah(matchingTax.totalPajak);
      if (kwTax !== recTax) {
        alerts.push({
          id: `alert_tax_kw_mismatch_${kw.id}`,
          category: 'TAX_MISMATCH',
          severity: 'WARNING',
          title: `Selisih Pajak Kwitansi (${kw.noBukti})`,
          description: `Pajak pada kwitansi (Rp ${kwTax.toLocaleString('id-ID')}) berbeda dengan Buku Pajak (Rp ${recTax.toLocaleString('id-ID')}).`,
          expectedValue: kwTax,
          actualValue: recTax,
          difference: subRupiah(kwTax, recTax),
          targetTab: 'pajak',
        });
      }
    }
  });

  return {
    isValid: alerts.length === 0,
    alerts,
    totals: {
      bkuBalance,
      bkbBalance,
      bktBalance,
      kwitansiTaxTotal,
      taxRecordsTotal,
      totalExpenditure,
      totalBudget,
    },
  };
}
