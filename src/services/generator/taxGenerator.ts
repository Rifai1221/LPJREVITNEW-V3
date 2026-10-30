import { KwitansiDocument, TaxRecord } from '../../types';
import { toRupiah, calcDppAndPpn, calcPph22, calcPph23 } from '../../utils/money';

/**
 * Generates Tax Records dynamically from current Kwitansi list.
 * Unifies all tax calculations using calcDppAndPpn, calcPph22, and calcPph23 from src/utils/money.ts.
 */
export function generateTaxesFromKwitansi(
  kwitansiList: KwitansiDocument[],
  manualTaxRecords: TaxRecord[] = [],
  deletedTaxIds: string[] = []
): TaxRecord[] {
  const result: TaxRecord[] = [];
  const deletedSet = new Set(deletedTaxIds || []);
  const manualMap = new Map((manualTaxRecords || []).map((m) => [m.id, m]));

  // 1. Process from kwitansi
  (kwitansiList || []).forEach((kw) => {
    const taxId = `tax-${kw.id}`;
    if (deletedSet.has(taxId) || deletedSet.has(kw.id)) {
      return;
    }

    // Check if user manually edited/overrode this tax record
    if (manualMap.has(taxId)) {
      result.push(manualMap.get(taxId)!);
      return;
    }

    const nominal = toRupiah(kw.nominal);
    const isKonsultan = kw.tipe === 'KONSULTAN' || kw.tipe === 'OPERASIONAL';
    const isPerabot = kw.tipe === 'PERABOT';
    const isPeralatan = false;
    const isKonstruksi = kw.tipe === 'MATERIAL' || kw.tipe === 'UPAH';

    const nominalKonstruksi = isKonstruksi ? nominal : 0;
    const nominalPerabot = isPerabot ? nominal : 0;
    const nominalPeralatan = isPeralatan ? nominal : 0;
    const nominalKonsultanAdm = isKonsultan ? nominal : 0;

    let ppn = 0;
    let pph22 = 0;
    let pph23 = 0;

    if (kw.isPpn) {
      const { ppn: calcPpn } = calcDppAndPpn(nominal, 11);
      ppn = toRupiah(kw.ppnAmount) > 0 ? toRupiah(kw.ppnAmount) : calcPpn;
    }
    if (kw.isPph22) {
      const { dpp } = calcDppAndPpn(nominal, 11);
      const calcPph22Val = calcPph22(dpp, 1.5);
      pph22 = toRupiah(kw.pph22Amount) > 0 ? toRupiah(kw.pph22Amount) : calcPph22Val;
    }
    if (kw.isPph23) {
      const calcPph23Val = calcPph23(nominal, 2.0);
      pph23 = toRupiah(kw.pph23Amount) > 0 ? toRupiah(kw.pph23Amount) : calcPph23Val;
    }

    const totalPajak = ppn + pph22 + pph23;

    result.push({
      id: taxId,
      noUrut: 0,
      noBukti: kw.noBukti,
      tanggal: kw.tanggal,
      bulan: kw.bulan,
      keperluan: (kw.uraian || '').replace('Pembayaran Lunas Biaya ', 'Bayar ').replace('Pembayaran Lunas ', 'Bayar '),
      nominalKonstruksi,
      nominalPerabot,
      nominalPeralatan,
      nominalKonsultanAdm,
      ppn11: ppn,
      pph22,
      pph23,
      totalPajak,
      kwitansiIdRef: kw.id,
      namaToko: kw.namaToko || kw.penerimaNama,
      penerimaNama: kw.penerimaNama,
      statusSetor: totalPajak > 0 ? 'LUNAS' : undefined,
    });
  });

  // 2. Add manual standalone tax records (not tied to kwitansi)
  (manualTaxRecords || []).forEach((m) => {
    if (!deletedSet.has(m.id) && !result.some((r) => r.id === m.id)) {
      result.push(m);
    }
  });

  return result.map((rec, index) => ({
    ...rec,
    noUrut: index + 1,
  }));
}
