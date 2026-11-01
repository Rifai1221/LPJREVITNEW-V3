import { KwitansiDocument, WeeklyWageReport, BkuTransaction, RealSchoolData, SchoolMasterData, RpdItem, RpdKategori } from '../types';
import { realSchoolData as defaultRealSchoolData } from '../data/realSchoolData';
import { parseTxDateToIso } from './monthHelper';

export function deriveRpd(
  kwitansiList: KwitansiDocument[] = [],
  wageReports: WeeklyWageReport[] = [],
  bkuList: BkuTransaction[] = [],
  realSchoolData?: RealSchoolData,
  school?: SchoolMasterData
): RpdItem[] {
  const rab = realSchoolData || defaultRealSchoolData;
  const totalAnggaran = school?.totalAnggaran || rab.totalNilaiRab || 500000000;

  const yearStr = school?.tahunAnggaran || '2026';
  let t2Iso = `${yearStr}-09-01`;
  const schoolAny = school as any;
  if (schoolAny?.tanggalTermin2 || schoolAny?.termin2Tanggal) {
    const parsed = parseTxDateToIso(schoolAny.tanggalTermin2 || schoolAny.termin2Tanggal);
    if (parsed) t2Iso = parsed;
  }

  const itemMap = new Map<string, {
    uraian: string;
    kategori: RpdKategori;
    satuan: string;
    hargaSatuan: number;
    volT1: number;
    nomT1: number;
    volT2: number;
    nomT2: number;
  }>();

  function mapKategori(kat?: string): RpdKategori {
    const k = (kat || '').toUpperCase();
    if (/upah|gaji/i.test(k)) return 'GAJI_REHAB';
    if (/siplah|perabot|mebel/i.test(k)) return 'PERABOT';
    if (/smkk|k3|persiapan/i.test(k)) return 'PERSIAPAN';
    if (/konsultant|pengawas|perencana|pengelola|adm/i.test(k)) return 'KONSULTAN_ADM';
    return 'BAHAN_REHAB';
  }

  if (rab && rab.divisions) {
    rab.divisions.forEach((div) => {
      div.items.forEach((it) => {
        const key = it.uraian.trim().toLowerCase();
        if (!itemMap.has(key)) {
          itemMap.set(key, {
            uraian: it.uraian,
            kategori: mapKategori(it.kategoriBiaya),
            satuan: it.satuan || 'unit',
            hargaSatuan: it.hargaSatuan || 100000,
            volT1: 0,
            nomT1: 0,
            volT2: 0,
            nomT2: 0,
          });
        }
      });
    });
  }

  kwitansiList.forEach((kw) => {
    const kwIso = parseTxDateToIso(kw.tanggal || '') || `${yearStr}-07-01`;
    const isT2 = kwIso >= t2Iso;
    const nominal = kw.nominal || 0;

    if (kw.items && kw.items.length > 0) {
      kw.items.forEach((it) => {
        const key = (it.namaBarang || 'Bahan Material').trim().toLowerCase();
        let entry = itemMap.get(key);
        if (!entry) {
          entry = {
            uraian: it.namaBarang || 'Bahan Material',
            kategori: mapKategori(kw.tipe),
            satuan: it.satuan || 'unit',
            hargaSatuan: it.hargaSatuan || (it.volume ? it.jumlah / it.volume : nominal),
            volT1: 0,
            nomT1: 0,
            volT2: 0,
            nomT2: 0,
          };
          itemMap.set(key, entry);
        }
        const vol = it.volume || 1;
        const amt = it.jumlah || nominal;
        if (isT2) {
          entry.volT2 += vol;
          entry.nomT2 += amt;
        } else {
          entry.volT1 += vol;
          entry.nomT1 += amt;
        }
      });
    } else {
      const key = (kw.uraian || kw.tipe || 'pengeluaran').trim().toLowerCase();
      let entry = itemMap.get(key);
      if (!entry) {
        entry = {
          uraian: kw.uraian || 'Pengeluaran Kegiatan',
          kategori: mapKategori(kw.tipe),
          satuan: 'Ls',
          hargaSatuan: nominal,
          volT1: 0,
          nomT1: 0,
          volT2: 0,
          nomT2: 0,
        };
        itemMap.set(key, entry);
      }
      if (isT2) {
        entry.volT2 += 1;
        entry.nomT2 += nominal;
      } else {
        entry.volT1 += 1;
        entry.nomT1 += nominal;
      }
    }
  });

  wageReports.forEach((wr) => {
    const wrIso = parseTxDateToIso(wr.tanggalKwitansi || '') || `${yearStr}-07-01`;
    const isT2 = wrIso >= t2Iso;
    const totalUpah = wr.totalUpah || 0;
    const key = 'upah tukang & pekerja lapangan';
    let entry = itemMap.get(key);
    if (!entry) {
      entry = {
        uraian: 'Upah Tukang & Pekerja Lapangan',
        kategori: 'GAJI_REHAB',
        satuan: 'HOK',
        hargaSatuan: 125000,
        volT1: 0,
        nomT1: 0,
        volT2: 0,
        nomT2: 0,
      };
      itemMap.set(key, entry);
    }
    const hok = wr.attendance?.reduce((s, a) => s + (a.hok || 0), 0) || Math.round(totalUpah / 125000);
    if (isT2) {
      entry.volT2 += hok > 0 ? hok : 1;
      entry.nomT2 += totalUpah;
    } else {
      entry.volT1 += hok > 0 ? hok : 1;
      entry.nomT1 += totalUpah;
    }
  });

  const rawList = Array.from(itemMap.values());
  const result: RpdItem[] = rawList.map((entry, idx) => {
    const vol100 = entry.volT1 + entry.volT2 || 1;
    const jumlahAnggaran = entry.nomT1 + entry.nomT2;
    const hargaSatuan = entry.hargaSatuan > 0 ? entry.hargaSatuan : Math.round(jumlahAnggaran / vol100);

    return {
      id: `rpd-derive-${idx + 1}`,
      no: idx + 1,
      kategori: entry.kategori,
      uraian: entry.uraian,
      volume100: vol100,
      volumeTermin1: entry.volT1,
      satuan: entry.satuan,
      volumeTermin2: entry.volT2,
      hargaSatuan: hargaSatuan,
      jumlahTermin1: entry.nomT1,
      jumlahTermin2: entry.nomT2,
      jumlahAnggaran: jumlahAnggaran,
    };
  });

  if (result.length === 0) {
    return [
      {
        id: 'rpd-def-1',
        no: 1,
        kategori: 'BAHAN_REHAB',
        uraian: 'Belanja Bahan Material Bangunan Utama',
        volume100: 1,
        volumeTermin1: 0.7,
        satuan: 'Ls',
        volumeTermin2: 0.3,
        hargaSatuan: totalAnggaran,
        jumlahTermin1: Math.round(totalAnggaran * 0.7),
        jumlahTermin2: Math.round(totalAnggaran * 0.3),
        jumlahAnggaran: totalAnggaran,
      },
    ];
  }

  const sumAnggaran = result.reduce((s, i) => s + i.jumlahAnggaran, 0);
  if (sumAnggaran > 0 && sumAnggaran !== totalAnggaran) {
    const scale = totalAnggaran / sumAnggaran;
    let running = 0;
    result.forEach((item, idx) => {
      if (idx === result.length - 1) {
        item.jumlahAnggaran = Math.max(0, totalAnggaran - running);
        item.jumlahTermin1 = Math.round(item.jumlahAnggaran * 0.7);
        item.jumlahTermin2 = item.jumlahAnggaran - item.jumlahTermin1;
      } else {
        item.jumlahAnggaran = Math.round(item.jumlahAnggaran * scale);
        item.jumlahTermin1 = Math.round(item.jumlahAnggaran * 0.7);
        item.jumlahTermin2 = item.jumlahAnggaran - item.jumlahTermin1;
        running += item.jumlahAnggaran;
      }
    });
  }

  return result;
}
