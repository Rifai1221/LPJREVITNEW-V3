import {
  KwitansiDocument,
  SchoolMasterData,
  ProjectProgressWeek,
} from '../types';
import { parseTxDateToIso, resolveWeekDates, sanitizeYear } from '../utils/monthHelper';
import { deduplicateKwitansiList } from './generator/kwitansiGenerator';

export interface PlannedTerminDisbursal {
  id: string;
  noBukti: string; // "TRM-01/{tahun}", "TRM-02/{tahun}"
  tanggal: string;
  tanggalObj: string;
  bulan: string;
  uraian: string;
  penerimaan: number;
  terminKe: number;
}

export interface PlannedCashWithdrawal {
  id: string;
  noBukti: string; // "BKT-01", "BKT-02", etc.
  tanggal: string;
  tanggalObj: string;
  bulan: string;
  uraian: string;
  amount: number;
}

export interface PlannedCashFlowResult {
  plannedKwitansiList: KwitansiDocument[];
  termins: PlannedTerminDisbursal[];
  withdrawals: PlannedCashWithdrawal[];
}

function getPriorityRank(kw: KwitansiDocument): number {
  const tipe = (kw.tipe || '').toUpperCase();
  const bukti = (kw.noBukti || '').toUpperCase();
  const uraian = (kw.uraian || '').toLowerCase();

  // Priority 1: Upah
  if (tipe === 'UPAH' || /^UK\//i.test(bukti) || /upah|borongan|daftar hadir/i.test(uraian)) {
    return 1;
  }
  // Priority 2: SMKK / Cetak / Papan Nama
  if (tipe === 'SMKK' || tipe === 'CETAK' || /^CTK\//i.test(bukti) || /kw-smkk/i.test(bukti) || /papan nama|smkk|k3/i.test(uraian)) {
    return 2;
  }
  // Priority 3: Material / Furnitur / Pintu Jendela
  if (tipe === 'MATERIAL' || tipe === 'BAHAN' || tipe === 'PERABOT' || tipe === 'PINTU_JENDELA' || /mat|fur/i.test(bukti) || /bahan|material|semen|pasir|bata/i.test(uraian)) {
    return 3;
  }
  // Priority 4: Management (Konsultan, Pengawas, Pengelola, ADM, Operasional)
  return 4;
}

function isBankPayment(kw: KwitansiDocument): boolean {
  if (kw.metodeBayar === 'BANK') return true;
  if (kw.kategoriBiayaPajak === 'Siplah') return true;
  const bukti = (kw.noBukti || '').toLowerCase();
  const uraian = (kw.uraian || '').toLowerCase();
  if (/siplah|daring|transfer/i.test(`${bukti} ${uraian}`)) return true;
  return false;
}

function addDaysToIso(isoDate: string, days: number): string {
  if (!isoDate || !isoDate.includes('-')) return isoDate;
  const [y, m, d] = isoDate.split('-').map((v) => parseInt(v, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const ry = dt.getUTCFullYear();
  const rm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const rd = String(dt.getUTCDate()).padStart(2, '0');
  return `${ry}-${rm}-${rd}`;
}

function isoToSlashDate(isoDate: string): string {
  if (!isoDate || !isoDate.includes('-')) return isoDate || '01/07/2026';
  const [y, m, d] = isoDate.split('-');
  return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
}

function isoToBulan(isoDate: string): string {
  if (!isoDate || !isoDate.includes('-')) return 'Juli 2026';
  const [y, m] = isoDate.split('-');
  const monthNames = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  const mIdx = Math.max(0, Math.min(11, parseInt(m, 10) - 1));
  return `${monthNames[mIdx]} ${y}`;
}

/**
 * Murni menghitung jadwal final per kwitansi (tanggalBayar) dan jadwal penarikan bank.
 * Algoritma chronologis per hari:
 * a. Penerimaan termin masuk ke BANK pada tanggal cair.
 * b. Belanja non-tunai (SIPLah) mengurangi bank langsung. Belanja tunai mengurangi BKT.
 * c. Sebelum belanja tunai, bila saldo BKT < nominal, lakukan penarikan tunai dari bank sebesar kebutuhan.
 * d. Bila bank + BKT tetap tidak cukup, kwitansi DIGESER UTUH ke hari/minggu berikutnya.
 * e. Urutan prioritas bila dana terbatas: upah > SMKK/cetak > material > manajemen.
 */
export function planCashFlow(
  kwitansiList: KwitansiDocument[],
  school: SchoolMasterData,
  progressWeeks: ProjectProgressWeek[] = [],
  wageReports: any[] = []
): PlannedCashFlowResult {
  const yearStr = String(sanitizeYear(school?.tahunAnggaran, 2026));
  const totalAnggaran = school?.totalAnggaran || 0;
  const schoolAny = school as any;

  // 1. Tentukan Tanggal & Nominal Termin 1 & Termin 2
  const t1Nom = school?.termin1Nilai || Math.round(totalAnggaran * ((school?.termin1Persen || 70) / 100));
  const t2Nom = school?.termin2Nilai || Math.round(totalAnggaran * ((school?.termin2Persen || 30) / 100));

  let t1Iso = `${yearStr}-07-01`;
  if (schoolAny?.termin1Tanggal) {
    const parsed = parseTxDateToIso(schoolAny.termin1Tanggal);
    if (parsed) t1Iso = parsed;
  } else if (progressWeeks && progressWeeks.length > 0) {
    const w1 = progressWeeks.find((w) => w.mingguKe === 1) || progressWeeks[0];
    const res1 = resolveWeekDates(w1, yearStr);
    if (res1.startDate) t1Iso = res1.startDate;
  }

  let t2Iso = `${yearStr}-09-01`;
  if (schoolAny?.tanggalTermin2 || schoolAny?.termin2Tanggal) {
    const parsed = parseTxDateToIso(schoolAny.tanggalTermin2 || schoolAny.termin2Tanggal || '');
    if (parsed) t2Iso = parsed;
  } else if (progressWeeks && progressWeeks.length > 0) {
    const t1Threshold = school?.termin1Persen || 70;
    const progressMatch = progressWeeks.find((w) => {
      const prog = w.cumulativeProgress ?? (w as any).progressKumulatif ?? w.bobotRealisasi ?? 0;
      return prog >= t1Threshold;
    });

    if (progressMatch) {
      const resProg = resolveWeekDates(progressMatch, yearStr);
      if (resProg.startDate) t2Iso = resProg.startDate;
    } else {
      const lastActiveW = [...progressWeeks].reverse().find(
        (w) => (w.bobotRealisasi && w.bobotRealisasi > 0) || w.divisions?.some((d) => (d.prestasiMingguIni || 0) > 0)
      ) || progressWeeks[progressWeeks.length - 1];
      if (lastActiveW) {
        const resLast = resolveWeekDates(lastActiveW, yearStr);
        if (resLast.startDate) t2Iso = resLast.startDate;
      }
    }
  }

  if (t2Iso < t1Iso) {
    t2Iso = addDaysToIso(t1Iso, 30);
  }

  const termins: PlannedTerminDisbursal[] = [
    {
      id: 'trm-01',
      noBukti: `TRM-01/${yearStr}`,
      tanggal: isoToSlashDate(t1Iso),
      tanggalObj: t1Iso,
      bulan: isoToBulan(t1Iso),
      uraian: `Penerimaan Dana Transfer Kas Bank (Termin 1 - ${school?.termin1Persen || 70}%)`,
      penerimaan: t1Nom,
      terminKe: 1,
    },
  ];

  if (t2Nom > 0) {
    termins.push({
      id: 'trm-02',
      noBukti: `TRM-02/${yearStr}`,
      tanggal: isoToSlashDate(t2Iso),
      tanggalObj: t2Iso,
      bulan: isoToBulan(t2Iso),
      uraian: `Penerimaan Dana Transfer Kas Bank (Termin 2 - ${school?.termin2Persen || 30}%)`,
      penerimaan: t2Nom,
      terminKe: 2,
    });
  }

  // 2. Persiapkan Antrian Kwitansi
  const cleanKws = [...(kwitansiList || []).map((k) => ({ ...k }))];

  if (Array.isArray(wageReports) && wageReports.length > 0) {
    wageReports.forEach((wr) => {
      if (!wr || wr.totalUpah <= 0) return;
      const wNum = wr.mingguKe;
      const padNum = String(wNum).padStart(2, '0');
      const ukBukti = `UK/${padNum}/${yearStr}`;

      const alreadyExists = cleanKws.some((k) => {
        const b = (k.noBukti || '').toUpperCase().trim();
        const u = (k.uraian || '').toLowerCase();
        return (
          k.id === `kw-upah-m${wNum}` ||
          b === ukBukti.toUpperCase() ||
          b === `UK/${wNum}/${yearStr}`.toUpperCase() ||
          (k.tipe === 'UPAH' && (k.mingguKeRef === wNum || u.includes(`minggu ke-${wNum}`)))
        );
      });

      if (!alreadyExists) {
        const matchW = (progressWeeks || []).find((w) => w.mingguKe === wNum);
        const wDates = matchW
          ? resolveWeekDates(matchW, yearStr)
          : { endDateSlash: `12/07/${yearStr}`, endDate: `${yearStr}-07-12`, bulan: `Juli ${yearStr}` };

        cleanKws.push({
          id: `kw-upah-m${wNum}`,
          noBukti: ukBukti,
          noSpb: `SPB-${ukBukti}`,
          tipe: 'UPAH',
          tanggal: wDates.endDateSlash,
          tanggalFormatted: wDates.endDateSlash,
          bulan: wDates.bulan,
          uraian: `Bayar Upah Borongan Pekerja Fisik Minggu Ke-${wNum}`,
          penerimaNama: (school as any)?.namaMandor || (school as any)?.namaPelaksana || 'Mandor',
          penerimaPekerjaan: 'Kepala Tukang / Mandor',
          penerimaAlamat: school?.kabKota || '',
          nominal: wr.totalUpah,
          metodeBayar: 'TUNAI',
          mingguKeRef: wNum,
          items: [],
          isPpn: false,
          isPph22: false,
          isPph23: false,
          ppnAmount: 0,
          pph22Amount: 0,
          pph23Amount: 0,
        } as unknown as KwitansiDocument);
      }
    });
  }

  interface QueueItem {
    kw: KwitansiDocument;
    candIso: string;
    priority: number;
    isBank: boolean;
  }

  const queue: QueueItem[] = cleanKws.map((kw) => {
    let candIso = parseTxDateToIso(kw.tanggal || t1Iso);
    if (!candIso || candIso < t1Iso) candIso = t1Iso;
    return {
      kw,
      candIso,
      priority: getPriorityRank(kw),
      isBank: isBankPayment(kw),
    };
  });

  const sortQueue = (q: QueueItem[]) => {
    q.sort((a, b) => {
      if (a.candIso !== b.candIso) return a.candIso.localeCompare(b.candIso);
      if (a.priority !== b.priority) return a.priority - b.priority;
      return (a.kw.id || '').localeCompare(b.kw.id || '');
    });
  };

  sortQueue(queue);

  // 3. Simulation Accounts
  let bankBalance = 0;
  let bktBalance = 0;
  const terminsCredited = new Set<string>();
  const withdrawals: PlannedCashWithdrawal[] = [];
  const plannedKwitansiList: KwitansiDocument[] = [];

  const creditTerminsUpToDate = (currentIso: string) => {
    for (const trm of termins) {
      if (!terminsCredited.has(trm.id) && trm.tanggalObj <= currentIso) {
        bankBalance += trm.penerimaan;
        terminsCredited.add(trm.id);
      }
    }
  };

  let maxIterations = queue.length * 100 + 500;
  let iter = 0;

  while (queue.length > 0 && iter < maxIterations) {
    iter++;
    const item = queue.shift()!;
    let D = item.candIso;

    creditTerminsUpToDate(D);

    const nom = Math.round(item.kw.nominal || 0);

    if (item.isBank) {
      // Non-cash expense: deducts Bank directly
      if (bankBalance >= nom) {
        bankBalance -= nom;
        const finalSlash = isoToSlashDate(D);
        const finalBulan = isoToBulan(D);
        plannedKwitansiList.push({
          ...item.kw,
          tanggal: finalSlash,
          tanggalFormatted: finalSlash,
          bulan: finalBulan,
        });
      } else {
        // Shift IN FULL
        let nextD = addDaysToIso(D, 1);
        if (!terminsCredited.has('trm-02') && D < t2Iso) {
          nextD = t2Iso;
        }
        item.candIso = nextD;
        queue.push(item);
        sortQueue(queue);
      }
    } else {
      // Cash expense: deducts BKT (Cash in hand)
      if (bktBalance < nom) {
        if (bankBalance + bktBalance >= nom) {
          // Bank + BKT is sufficient: withdraw exact required cash from Bank
          const withdrawNeeded = nom - bktBalance;
          const withdrawActual = Math.min(bankBalance, withdrawNeeded);

          if (withdrawActual > 0) {
            bankBalance -= withdrawActual;
            bktBalance += withdrawActual;

            const wSeq = withdrawals.length + 1;
            const wBukti = `BKT-${String(wSeq).padStart(2, '0')}`;
            withdrawals.push({
              id: `wth-${wSeq}-${D}`,
              noBukti: wBukti,
              tanggal: isoToSlashDate(D),
              tanggalObj: D,
              bulan: isoToBulan(D),
              uraian: 'Penarikan Tunai dari Bank untuk Kas Operasional Proyek',
              amount: withdrawActual,
            });
          }
        } else {
          // Bank + BKT insufficient: Shift Kwitansi IN FULL (UTUH) without partial withdrawal
          let nextD = addDaysToIso(D, 1);
          if (!terminsCredited.has('trm-02') && D < t2Iso) {
            nextD = t2Iso;
          }
          item.candIso = nextD;
          queue.push(item);
          sortQueue(queue);
          continue;
        }
      }

      if (bktBalance >= nom) {
        bktBalance -= nom;
        const finalSlash = isoToSlashDate(D);
        const finalBulan = isoToBulan(D);
        plannedKwitansiList.push({
          ...item.kw,
          tanggal: finalSlash,
          tanggalFormatted: finalSlash,
          bulan: finalBulan,
        });
      } else {
        let nextD = addDaysToIso(D, 1);
        if (!terminsCredited.has('trm-02') && D < t2Iso) {
          nextD = t2Iso;
        }
        item.candIso = nextD;
        queue.push(item);
        sortQueue(queue);
      }
    }
  }

  // Ensure all termins are credited even if iteration ends early
  for (const trm of termins) {
    if (!terminsCredited.has(trm.id)) {
      bankBalance += trm.penerimaan;
      terminsCredited.add(trm.id);
    }
  }

  // 4. Update mingguKeRef for planned kwitansi to match the new tanggal
  const finalPlannedKwList = plannedKwitansiList.map((kw) => {
    const isoDate = parseTxDateToIso(kw.tanggal || t1Iso);
    let matchedWeek = kw.mingguKeRef;

    if (progressWeeks && progressWeeks.length > 0) {
      const foundW = progressWeeks.find((w) => {
        const res = resolveWeekDates(w, yearStr);
        return isoDate >= res.startDate && isoDate <= res.endDate;
      });
      if (foundW) {
        matchedWeek = foundW.mingguKe;
      }
    }

    return {
      ...kw,
      mingguKeRef: matchedWeek,
    };
  });

  return {
    plannedKwitansiList: finalPlannedKwList,
    termins,
    withdrawals,
  };
}
