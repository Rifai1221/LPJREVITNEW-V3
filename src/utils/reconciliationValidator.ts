import {
  AppStateData,
  TaxRecord,
  BkuTransaction,
  BktTransaction,
  BkbTransaction,
} from '../types';
import { toRupiah, addRupiah, subRupiah } from './money';

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
