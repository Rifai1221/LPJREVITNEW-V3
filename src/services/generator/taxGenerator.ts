import { KwitansiDocument, TaxRecord } from '../../types';

export function generateTaxesFromKwitansi(
  kwitansiList: KwitansiDocument[],
  manualTaxRecords: TaxRecord[] = [],
  deletedTaxIds: string[] = []
): TaxRecord[] {
  const result: TaxRecord[] = [];
  const deletedSet = new Set(deletedTaxIds || []);
  const manualMap = new Map((manualTaxRecords || []).map((m) => [m.id, m]));

  // 1. Process from kwitansi
  kwitansiList.forEach((kw) => {
    const taxId = `tax-${kw.id}`;
    if (deletedSet.has(taxId) || deletedSet.has(kw.id)) {
      return;
    }

    // Check if user manually edited/overrode this tax record
    if (manualMap.has(taxId)) {
      result.push(manualMap.get(taxId)!);
      return;
    }

    const isKonsultan = kw.tipe === 'KONSULTAN' || kw.tipe === 'OPERASIONAL';
    const isPerabot = kw.tipe === 'PERABOT';
    const isPeralatan = false;
    const isKonstruksi = kw.tipe === 'MATERIAL' || kw.tipe === 'UPAH';

    const nominalKonstruksi = isKonstruksi ? kw.nominal : 0;
    const nominalPerabot = isPerabot ? kw.nominal : 0;
    const nominalPeralatan = isPeralatan ? kw.nominal : 0;
    const nominalKonsultanAdm = isKonsultan ? kw.nominal : 0;

    let ppn = 0;
    let pph22 = 0;
    let pph23 = 0;

    if (kw.isPpn) {
      ppn = kw.ppnAmount || Math.round((kw.nominal / 1.11) * 0.11);
    }
    if (kw.isPph22) {
      pph22 = kw.pph22Amount || Math.round((kw.nominal / 1.11) * 0.015);
    }
    if (kw.isPph23) {
      pph23 = kw.pph23Amount || Math.round(kw.nominal * 0.02);
    }

    result.push({
      id: taxId,
      noUrut: 0,
      noBukti: kw.noBukti,
      tanggal: kw.tanggal,
      bulan: kw.bulan,
      keperluan: kw.uraian.replace('Pembayaran Lunas Biaya ', 'Bayar ').replace('Pembayaran Lunas ', 'Bayar '),
      nominalKonstruksi,
      nominalPerabot,
      nominalPeralatan,
      nominalKonsultanAdm,
      ppn11: ppn,
      pph22,
      pph23,
      totalPajak: ppn + pph22 + pph23,
      kwitansiIdRef: kw.id,
      namaToko: kw.namaToko || kw.penerimaNama,
      penerimaNama: kw.penerimaNama,
      statusSetor: ppn + pph22 + pph23 > 0 ? 'LUNAS' : undefined,
    });
  });

  // 2. Add manual standalone tax records (not tied to kwitansi)
  manualTaxRecords.forEach((m) => {
    if (!deletedSet.has(m.id) && !result.some((r) => r.id === m.id)) {
      result.push(m);
    }
  });

  return result.map((rec, index) => ({
    ...rec,
    noUrut: index + 1,
  }));
}
