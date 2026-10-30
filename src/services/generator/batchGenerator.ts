import {
  KwitansiDocument,
  WeeklyWageReport,
  BkbTransaction,
  ProjectProgressWeek,
  SchoolMasterData,
  WorkerItem,
  StoreVendor,
  RpdItem,
  RealSchoolData,
  RabDivision,
  RabSubItem,
} from '../../types';
import {
  resolveWeekDates,
  indonesianMonths,
  monthOrderMap,
} from '../../utils/monthHelper';
import { getAhspWageRateForRole } from '../../utils/divisionHelper';
import { calcDppAndPpn, calcPph22, calcPph23 } from '../../utils/money';
import { getFiscalConfig } from '../../data/fiscalTaxParameters';
import {
  isReceiptLocked,
  isFixedNonSplitPayment,
  extractWeekNumberFromKwitansi,
  getDateInWeek,
} from './splitTransactionService';
import {
  summarizeManualKwitansiSpending,
  deduplicateKwitansiList,
  healKwitansiList,
  normalizeMaterialItems,
  getCanonicalMaterialKey,
  EXACT_MEBELER_RAB_ITEMS,
  EXACT_MEBELER_RAB_TOTAL,
  isPreservedUnitItem,
  isPureDirectMaterial,
  consolidateAndStandardizeReceiptItems,
  renumberKwitansiChronologically,
} from './kwitansiGenerator';
import {
  resolveStoreFromItemTags,
  resolveManagementRecipient,
  decomposeRealisticBahanAndUpah,
  calculateCumulativeRealizedProgress,
} from './bkuGenerator';

export interface WeeklyGenerationParams {
  targetWeek: number;
  weekObj: ProjectProgressWeek;
  weeksToUse: ProjectProgressWeek[];
  school: SchoolMasterData;
  workers: WorkerItem[];
  stores: StoreVendor[];
  rpdItems: RpdItem[];
  realSchoolData?: RealSchoolData;
  existingKwitansi: KwitansiDocument[];
  existingWageReports: WeeklyWageReport[];
  existingBkb: BkbTransaction[];
  splitDays?: boolean;
}

export interface WeeklyGenerationResult {
  updatedKwitansi: KwitansiDocument[];
  updatedWageReports: WeeklyWageReport[];
  updatedBkb: BkbTransaction[];
  generatedCount: {
    bahan: number;
    upah: number;
    alat: number;
    smkk: number;
    manajemen: number;
  };
}

export function generateWeeklyTransactionsFromProgressAndRealData({
  targetWeek,
  weekObj,
  weeksToUse,
  school,
  workers = [],
  stores = [],
  rpdItems = [],
  realSchoolData,
  existingKwitansi,
  existingWageReports,
  existingBkb,
  splitDays = true,
}: WeeklyGenerationParams): WeeklyGenerationResult {
  const yearStr = school?.tahunAnggaran?.trim() || '2026';
  const weekDates = resolveWeekDates(weekObj, yearStr);
  const bulan = weekDates.bulan;
  const dateEndStr = weekDates.endDateSlash;
  const formattedDateEnd = weekDates.endDateFormatted;
  const formattedDateStart = weekDates.startDateFormatted;

  const cleanExistingKwitansi = existingKwitansi.filter((k) => {
    const isManualOrLocked = isReceiptLocked(k);
    if (isManualOrLocked) return true;
    return extractWeekNumberFromKwitansi(k, weeksToUse, yearStr) !== targetWeek;
  });
  const newKwitansiList: KwitansiDocument[] = [...cleanExistingKwitansi];
  const updatedWageReports: WeeklyWageReport[] = existingWageReports.filter(
    (w) => w.mingguKe !== targetWeek
  );
  const updatedBkb: BkbTransaction[] = [...existingBkb];

  const generatedCount = {
    bahan: 0,
    upah: 0,
    alat: 0,
    smkk: 0,
    manajemen: 0,
  };

  const manualSummary = summarizeManualKwitansiSpending(existingKwitansi, realSchoolData);

  const totalDivPrestasi = (weekObj.divisions || []).reduce((s, d) => s + (d.prestasiMingguIni || 0), 0);
  const hasRealProgress = (weekObj.bobotRealisasi && weekObj.bobotRealisasi > 0) || totalDivPrestasi > 0;

  if (!hasRealProgress) {
    return {
      updatedKwitansi: deduplicateKwitansiList(cleanExistingKwitansi),
      updatedWageReports,
      updatedBkb,
      generatedCount,
    };
  }

  const hasExistingPapanNama = manualSummary.hasManualPapanNama || existingKwitansi.some(
    (k) => /papan nama/i.test(`${k.noBukti} ${k.uraian}`)
  );
  const hasExistingSmkk = manualSummary.hasManualSmkk || existingKwitansi.some(
    (k) => k.tipe === 'SMKK' || /smkk|k3/i.test(`${k.noBukti} ${k.uraian}`) || /kw-smkk/i.test(k.noBukti || '')
  );

  const hasTermin1Bkb = updatedBkb.some((b) => b.noBukti === 'KREDIT-T1' || b.id === 'bkb-init-termin1');
  const termin1Amount = school?.termin1Nilai || (school?.totalAnggaran ? Math.round(school.totalAnggaran * 0.7) : 0);
  if (!hasTermin1Bkb && termin1Amount > 0 && weeksToUse.length > 0) {
    const w1 = weeksToUse[0];
    const w1Dates = resolveWeekDates(w1, yearStr);
    updatedBkb.unshift({
      id: 'bkb-init-termin1',
      tanggal: w1Dates.startDateSlash,
      tanggalObj: w1Dates.startDate,
      bulan: w1Dates.bulan,
      uraian: 'Penerimaan Dana Revitalisasi Termin 1 (70%) ke Rekening Bank',
      noBukti: 'KREDIT-T1',
      penerimaan: termin1Amount,
      pengeluaran: 0,
    });
  }

  const activeDivisions = (weekObj.divisions || []).filter((d) => (d.prestasiMingguIni || 0) > 0);

  const defaultMaterialStore = stores.find((s) => s.kategori === 'MATERIAL') || stores[0] || {
    id: 's-def-mat',
    namaToko: 'Penyedia Bahan Material',
    pemilikNama: 'Penyedia Toko Rekanan',
    pekerjaan: 'Penyedia Bahan Bangunan',
    alamat: school.kabKota || 'Kota/Kabupaten Setempat',
    telepon: '-',
    kategori: 'MATERIAL',
  };

  const defaultPerabotStore = stores.find((s) => s.kategori === 'PERABOT') || defaultMaterialStore;

  const defaultPercetakanStore = stores.find(
    (s) => s.kategori === 'PERCETAKAN' || /percetakan|printing|dexa|cetak/i.test(`${s.namaToko} ${s.pekerjaan || ''}`)
  ) || defaultMaterialStore;

  let totalWageAmountForWeek = 0;
  let activeDivisionDescriptions: string[] = [];
  const weeklyAhspUpahComponents: { namaBarang: string; volume: number; satuan: string; hargaSatuan: number; jumlah: number }[] = [];
  const weeklyAllBahanItems: {
    namaBarang: string;
    volume: number;
    satuan: string;
    hargaSatuan: number;
    jumlah: number;
    isPerabot?: boolean;
    divisionName?: string;
    tags?: string[];
    kategoriBiaya?: string;
  }[] = [];
  const weeklyAllAlatItems: {
    namaBarang: string;
    volume: number;
    satuan: string;
    hargaSatuan: number;
    jumlah: number;
    divisionName?: string;
  }[] = [];

  const isWeek1OrHasPersiapan = targetWeek === 1 && !hasExistingSmkk && !hasExistingPapanNama && (
    activeDivisions.some((d) => d.kode.toUpperCase() === 'I' || /persiapan/i.test(d.uraian)) ||
    activeDivisions.length > 0
  );

  if (isWeek1OrHasPersiapan) {
    const papanRabItem = realSchoolData?.divisions?.flatMap((d) => d.items).find((i) => /papan nama/i.test(i.uraian));
    const papanNominal = papanRabItem ? Math.round(papanRabItem.volume * papanRabItem.hargaSatuan) : 1099800;

    const kwPapanBukti = `CTK/01/${yearStr}`;
    const spbPapanBukti = `SPB-CTK/01/${yearStr}`;
    const isTaxablePapan = papanNominal >= 2000000;

    const papanItems = [
      {
        namaBarang: `Pembuatan & Cetak Papan Nama Proyek Revitalisasi ${school?.namaSekolah || 'Sekolah'} (Bahan MMT / Akrilik & Frame Kayu Complete)`,
        volume: 1,
        satuan: 'unit',
        hargaSatuan: papanNominal,
        jumlah: papanNominal,
      },
    ];

    const kwPapanDoc: KwitansiDocument = {
      id: `kw-ctk-m1-papan-${Date.now()}`,
      noBukti: kwPapanBukti,
      noSpb: spbPapanBukti,
      tipe: 'OPERASIONAL',
      tanggal: weekDates.startDateSlash,
      tanggalFormatted: weekDates.startDateFormatted,
      bulan: weekDates.bulan,
      uraian: `Pembayaran Lunas Biaya Pembuatan & Cetak Papan Nama Proyek Revitalisasi ${school.namaSekolah}, Tahun ${yearStr}, Rincian Terlampir.`,
      penerimaNama: defaultPercetakanStore.pemilikNama || 'Pemilik Percetakan',
      penerimaPekerjaan: `Pemilik ${defaultPercetakanStore.namaToko}`,
      penerimaAlamat: defaultPercetakanStore.alamat || school.kabKota,
      namaToko: defaultPercetakanStore.namaToko,
      items: papanItems,
      nominal: papanNominal,
      isPpn: isTaxablePapan,
      isPph22: isTaxablePapan,
      isPph23: false,
      ppnAmount: isTaxablePapan ? Math.round((papanNominal / 1.11) * 0.11) : 0,
      pph22Amount: isTaxablePapan ? Math.round((papanNominal / 1.11) * 0.015) : 0,
      pph23Amount: 0,
      kategoriBiayaPajak: 'Perencanaan_Pengelolaan',
      keteranganSpb: `Surat Perintah Bayar Biaya Cetak Papan Nama Proyek (${weekDates.startDateFormatted})`,
      mingguKeRef: 1,
    };

    const existIdx = newKwitansiList.findIndex((k) => k.noBukti === kwPapanBukti || /papan nama/i.test(k.uraian));
    if (existIdx >= 0) {
      newKwitansiList[existIdx] = kwPapanDoc;
    } else {
      newKwitansiList.push(kwPapanDoc);
    }
    generatedCount.manajemen++;

    const realDivI = realSchoolData?.divisions?.find((d) => d.kode.toUpperCase() === 'I' || /persiapan/i.test(d.uraian));
    const smkkRabs = (realDivI?.items || []).filter(
      (it) => it.kategoriBiaya === 'SMKK' || /smkk|k3|helm|rompi|sepatu boot|sepatu safety|p3k|rambu/i.test(it.uraian)
    );

    const smkkRawItems = smkkRabs.length > 0 ? smkkRabs.map((it) => ({
      namaBarang: it.uraian,
      volume: it.volume,
      satuan: it.satuan,
      hargaSatuan: it.hargaSatuan,
      jumlah: Math.round(it.volume * it.hargaSatuan),
    })) : [
      { namaBarang: 'Penerapan SMKK - Helm kepala', volume: 10, satuan: 'buah', hargaSatuan: 83431, jumlah: 834310 },
      { namaBarang: 'Penerapan SMKK - Rompi', volume: 10, satuan: 'buah', hargaSatuan: 88852, jumlah: 888520 },
      { namaBarang: 'Penerapan SMKK - Sepatu boot', volume: 10, satuan: 'buah', hargaSatuan: 134195, jumlah: 1341950 },
      { namaBarang: 'Penerapan SMKK - Sarung tangan', volume: 10, satuan: 'buah', hargaSatuan: 59763, jumlah: 597630 },
      { namaBarang: 'Penerapan SMKK - Peralatan P3K', volume: 1, satuan: 'set', hargaSatuan: 2500000, jumlah: 2500000 },
      { namaBarang: 'Penerapan SMKK - Rambu-Rambu dan Pengendalian Resiko K3', volume: 1, satuan: 'set', hargaSatuan: 912302, jumlah: 912302 },
      { namaBarang: 'Penerapan SMKK - Tali keselamatan', volume: 1, satuan: 'roll', hargaSatuan: 550206, jumlah: 550206 },
    ];

    const smkkNominal = smkkRawItems.reduce((s, it) => s + it.jumlah, 0);
    const kwSmkkBukti = `01/KW-SMKK/${yearStr}`;
    const spbSmkkBukti = `SPB-01/SMKK/${yearStr}`;
    const isTaxableSmkk = smkkNominal >= 2000000;

    const kwSmkkDoc: KwitansiDocument = {
      id: `kw-smkk-m1-${Date.now()}`,
      noBukti: kwSmkkBukti,
      noSpb: spbSmkkBukti,
      tipe: 'OPERASIONAL',
      tanggal: weekDates.startDateSlash,
      tanggalFormatted: weekDates.startDateFormatted,
      bulan: weekDates.bulan,
      uraian: `Pembayaran Lunas Pengadaan Perlengkapan SMKK & K3 Lapangan (${smkkRawItems.map((i) => i.namaBarang.replace('Penerapan SMKK - ', '')).slice(0, 4).join(', ')}), Revitalisasi ${school.namaSekolah}, Tahun ${yearStr}, Rincian Terlampir.`,
      penerimaNama: defaultMaterialStore.pemilikNama || 'Penyedia SMKK',
      penerimaPekerjaan: `Penyedia APD & Keselamatan Kerja`,
      penerimaAlamat: defaultMaterialStore.alamat || school.kabKota,
      namaToko: defaultMaterialStore.namaToko,
      items: smkkRawItems,
      nominal: smkkNominal,
      isPpn: isTaxableSmkk,
      isPph22: isTaxableSmkk,
      isPph23: false,
      ppnAmount: isTaxableSmkk ? Math.round((smkkNominal / 1.11) * 0.11) : 0,
      pph22Amount: isTaxableSmkk ? Math.round((smkkNominal / 1.11) * 0.015) : 0,
      pph23Amount: 0,
      kategoriBiayaPajak: 'Peralatan',
      keteranganSpb: `Surat Perintah Bayar Pengadaan SMKK & K3 Minggu Ke-1 (${weekDates.startDateFormatted})`,
      mingguKeRef: 1,
    };

    const existSmkkIdx = newKwitansiList.findIndex((k) => k.noBukti === kwSmkkBukti);
    if (existSmkkIdx >= 0) {
      newKwitansiList[existSmkkIdx] = kwSmkkDoc;
    } else {
      newKwitansiList.push(kwSmkkDoc);
    }
    generatedCount.smkk++;
  }

  activeDivisions.forEach((div) => {
    activeDivisionDescriptions.push(div.uraian);
    const progressRatio = div.bobotTotal > 0 ? Math.min(1, Math.max(0, div.prestasiMingguIni / div.bobotTotal)) : 0;
    if (progressRatio <= 0) return;
    const divCode = div.kode.toUpperCase();

    const isMeubilairDiv = /mebel|meubilair|meubeler|perabot|XII/i.test(`${div.kode} ${div.uraian}`);
    const realDiv = realSchoolData?.divisions?.find((rd: RabDivision) => {
      const rdCode = rd.kode.toUpperCase();
      if (rdCode === divCode) return true;
      const rdUraian = rd.uraian.toLowerCase();
      const dUraian = div.uraian.toLowerCase();
      if (rdUraian.includes(dUraian) || dUraian.includes(rdUraian)) return true;
      if (isMeubilairDiv && /mebel|meubilair|meubeler|perabot|XII/i.test(`${rd.kode} ${rd.uraian}`)) return true;
      return false;
    });

    const bahanItems: { namaBarang: string; volume: number; satuan: string; hargaSatuan: number; jumlah: number; isBarangPabrikasi?: boolean }[] = [];
    const alatItems: { namaBarang: string; volume: number; satuan: string; hargaSatuan: number; jumlah: number }[] = [];
    let divUpahTotal = 0;

    if (realDiv && realDiv.items && realDiv.items.length > 0) {
      realDiv.items.forEach((it: RabSubItem) => {
        const isPapanNamaItem = /papan nama/i.test(it.uraian);
        const isSmkkItem = it.kategoriBiaya === 'SMKK' || /smkk|k3|helm|rompi|sepatu boot|sepatu safety|p3k|rambu|tali keselamatan/i.test(it.uraian);
        if (isPapanNamaItem || isSmkkItem) {
          return;
        }

        if (it.statusBelanja === 'SUDAH_DIBELANJAKAN_MANDIRI' || manualSummary.fullyAbsorbedRabIds.has(it.id)) {
          return;
        }

        const normKey = getCanonicalMaterialKey(it.uraian);
        const manualSpent = Math.max(
          manualSummary.spentByRabId.get(it.id) || 0,
          manualSummary.spentByCanonicalName.get(normKey) || 0
        );
        const remainingRabVol = Math.max(0, it.volume - manualSpent);
        if (remainingRabVol <= 0) {
          return;
        }

        const isFullAbsorption = progressRatio >= 0.95;
        let execRabVol = isFullAbsorption
          ? remainingRabVol
          : Math.round(remainingRabVol * progressRatio * 1000) / 1000;

        if (execRabVol <= 0 && progressRatio > 0 && (it.isBarangPabrikasi || (it.tags && it.tags.some((t) => /siplah|fur/i.test(t))) || isMeubilairDiv)) {
          execRabVol = Math.max(1, Math.min(remainingRabVol, 1));
        }
        if (execRabVol <= 0) return;
        const execRabJml = Math.round(execRabVol * it.hargaSatuan);
        if (execRabJml <= 0) return;

        if (it.statusBelanja === 'DIALIHKAN') {
          if (it.targetReallokasi === 'UPAH') {
            divUpahTotal += execRabJml;
            const reallocatedUpah = decomposeRealisticBahanAndUpah(div.uraian || it.uraian, 0, execRabJml);
            if (reallocatedUpah.upahComponents.length > 0) {
              weeklyAhspUpahComponents.push(...reallocatedUpah.upahComponents);
            }
          } else {
            const reallocatedBahan = decomposeRealisticBahanAndUpah(div.uraian || it.uraian, execRabJml, 0);
            bahanItems.push(...reallocatedBahan.bahanItems);
          }
          return;
        }

        const ahspMatch = (realSchoolData?.ahspList || []).find((ah) => {
          if (it.ahspIdRef && ah.id === it.ahspIdRef) return true;
          const lowerAh = (ah.namaPekerjaan || '').toLowerCase().trim();
          const lowerRab = it.uraian.toLowerCase().trim();
          if (lowerAh === lowerRab || lowerAh.includes(lowerRab) || lowerRab.includes(lowerAh)) return true;

          if (/bowplank|bouwplank|pengukuran|utzet/i.test(lowerRab) && /bowplank|bouwplank|pengukuran|utzet/i.test(lowerAh)) return true;
          if (/papan nama/i.test(lowerRab) && /papan nama/i.test(lowerAh)) return true;
          if (/air kerja|listrik/i.test(lowerRab) && /air kerja|listrik/i.test(lowerAh)) return true;
          if (/galian/i.test(lowerRab) && /galian/i.test(lowerAh)) return true;
          if (/urugan pasir/i.test(lowerRab) && /urugan pasir/i.test(lowerAh)) return true;
          if (/pondasi|batu kali/i.test(lowerRab) && /pondasi|batu kali/i.test(lowerAh)) return true;
          if (/beton/i.test(lowerRab) && /beton/i.test(lowerAh)) return true;
          if (/bata/i.test(lowerRab) && /bata/i.test(lowerAh)) return true;
          if (/plesteran/i.test(lowerRab) && /plesteran/i.test(lowerAh)) return true;
          if (/keramik/i.test(lowerRab) && /keramik/i.test(lowerAh)) return true;
          if (/plafon|gypsum/i.test(lowerRab) && /plafon|gypsum|langit/i.test(lowerAh)) return true;
          if (/atap|spandek|baja ringan/i.test(lowerRab) && /atap|spandek|baja ringan/i.test(lowerAh)) return true;
          if (/cat|pengecatan/i.test(lowerRab) && /cat|pengecatan/i.test(lowerAh)) return true;
          if (/pintu|jendela|kusen/i.test(lowerRab) && /pintu|jendela|kusen/i.test(lowerAh)) return true;
          if (/listrik|lampu/i.test(lowerRab) && /listrik|lampu/i.test(lowerAh)) return true;
          if (/sanitasi|kloset|pipa/i.test(lowerRab) && /sanitasi|kloset|pipa/i.test(lowerAh)) return true;

          const keywords = lowerRab
            .replace(/[^a-zA-Z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter((w) => w.length > 3 && !/pekerjaan|pasang|pemasangan|pengadaan/i.test(w));
          return keywords.length > 0 && keywords.some((kw) => lowerAh.includes(kw));
        });

        const isPreserved =
          (it.tags && it.tags.some((t) => t.toUpperCase() === 'FUR')) ||
          it.isBarangPabrikasi ||
          isPreservedUnitItem(it.uraian, it.satuan, it.isBarangPabrikasi);
        if (isPreserved) {
          let unitBahanPrice = it.hargaSatuan;
          if (!unitBahanPrice || unitBahanPrice <= 0) {
            if (ahspMatch && ahspMatch.komponen && ahspMatch.komponen.length > 0) {
              const compBahanList = ahspMatch.komponen.filter(
                (c) => c.kategori !== 'UPAH' && !/tukang|pekerja|mandor/i.test(c.uraian) && c.kategori !== 'ALAT' && !/molen|sewa|scaffolding/i.test(c.uraian)
              );
              const totalBahanInAhsp = compBahanList.reduce(
                (s, c) => s + ((c.hargaSatuan || 0) * (c.koefisien || 1)),
                0
              );
              if (totalBahanInAhsp > 0) {
                unitBahanPrice = totalBahanInAhsp;
              }
            }
          }

          if (ahspMatch && ahspMatch.komponen && ahspMatch.komponen.length > 0) {
            const compUpahList = ahspMatch.komponen.filter((c) => c.kategori === 'UPAH' || /tukang|pekerja|mandor/i.test(c.uraian));
            compUpahList.forEach((cu) => {
              const uVol = Math.round((cu.koefisien || 1) * execRabVol * 1000) / 1000;
              const uJml = Math.round(uVol * (cu.hargaSatuan || 174748));
              if (uJml > 0) {
                divUpahTotal += uJml;
                weeklyAhspUpahComponents.push({
                  namaBarang: cu.uraian,
                  volume: uVol,
                  satuan: cu.satuan || 'Hr',
                  hargaSatuan: cu.hargaSatuan || 174748,
                  jumlah: uJml,
                });
              }
            });
          }

          const bahanJml = Math.round(execRabVol * unitBahanPrice);
          if (bahanJml > 0) {
            bahanItems.push({
              namaBarang: it.uraian,
              volume: execRabVol,
              satuan: it.satuan || 'unit',
              hargaSatuan: unitBahanPrice,
              jumlah: bahanJml,
              isBarangPabrikasi: true,
              tags: it.tags,
              kategoriBiaya: it.kategoriBiaya,
            } as any);
          }
        } else if (ahspMatch && ahspMatch.komponen && ahspMatch.komponen.length > 0) {
          ahspMatch.komponen.forEach((comp) => {
            const compVol = Math.round((comp.koefisien || 1) * execRabVol * 1000) / 1000;
            if (compVol <= 0) return;
            const compJml = Math.round(compVol * (comp.hargaSatuan || 10000));
            if (compJml <= 0) return;
            const isUpah = comp.kategori === 'UPAH' || /tukang|pekerja|mandor/i.test(comp.uraian);
            const isAlat = comp.kategori === 'ALAT' || /molen|sewa|scaffolding|perancah|gerobak|pompa|genset|generator/i.test(comp.uraian);

            if (it.kategoriBiaya === 'BAHAN' && (isUpah || isAlat)) return;
            if (it.kategoriBiaya === 'UPAH' && !isUpah) return;
            if (it.kategoriBiaya === 'ALAT' && !isAlat) return;

            if (isUpah) {
              divUpahTotal += compJml;
              weeklyAhspUpahComponents.push({
                namaBarang: comp.uraian,
                volume: compVol,
                satuan: comp.satuan || 'Hr',
                hargaSatuan: comp.hargaSatuan || 174748,
                jumlah: compJml,
              });
            } else if (isAlat) {
              alatItems.push({
                namaBarang: comp.uraian,
                volume: compVol,
                satuan: comp.satuan || 'set',
                hargaSatuan: comp.hargaSatuan || 50000,
                jumlah: compJml,
              });
            } else {
              bahanItems.push({
                namaBarang: comp.uraian,
                volume: compVol,
                satuan: comp.satuan || 'unit',
                hargaSatuan: comp.hargaSatuan || 50000,
                jumlah: compJml,
              });
            }
          });
        } else {
          const isUpahBahan =
            it.kategoriBiaya === 'UPAH_BAHAN' ||
            (it.kategoriBiaya as string) === 'UPAH&BAHAN' ||
            /upah.*bahan|bahan.*upah/i.test(it.kategoriBiaya || '');

          const cat = isUpahBahan
            ? 'UPAH_BAHAN'
            : it.kategoriBiaya || (
                /upah|gaji|pekerja|tukang|mandor/i.test(it.uraian) ? 'UPAH' :
                /alat|sewa|molen|scaffolding|perancah|gerobak/i.test(it.uraian) ? 'ALAT' :
                /smkk|k3|helm|rompi|sepatu|p3k|rambu|papan nama/i.test(it.uraian) ? 'SMKK' :
                'BAHAN'
              );

          if (cat === 'UPAH_BAHAN') {
            const bahanNominal = Math.round(execRabJml * 0.65);
            const upahNominal = execRabJml - bahanNominal;

            const decomposed = decomposeRealisticBahanAndUpah(it.uraian, bahanNominal, upahNominal);
            bahanItems.push(...decomposed.bahanItems);

            divUpahTotal += upahNominal;
            weeklyAhspUpahComponents.push(...decomposed.upahComponents);
          } else if (cat === 'UPAH') {
            divUpahTotal += execRabJml;
            const decomposedUpah = decomposeRealisticBahanAndUpah(it.uraian, 0, execRabJml);
            if (decomposedUpah.upahComponents.length > 0) {
              weeklyAhspUpahComponents.push(...decomposedUpah.upahComponents);
            } else {
              weeklyAhspUpahComponents.push({
                namaBarang: it.uraian,
                volume: execRabVol,
                satuan: it.satuan,
                hargaSatuan: it.hargaSatuan,
                jumlah: execRabJml,
              });
            }
          } else if (cat === 'ALAT') {
            alatItems.push({
              namaBarang: it.uraian,
              volume: execRabVol,
              satuan: it.satuan,
              hargaSatuan: it.hargaSatuan,
              jumlah: execRabJml,
            });
          } else if (cat === 'SMKK' || cat === 'LAINNYA') {
          } else {
            const isCompositeJob = !isPureDirectMaterial(it.uraian);
            if (isCompositeJob && execRabJml >= 25000) {
              const decomposedBahan = decomposeRealisticBahanAndUpah(it.uraian, execRabJml, 0);
              bahanItems.push(...decomposedBahan.bahanItems);
            } else {
              bahanItems.push({
                namaBarang: it.uraian,
                volume: execRabVol,
                satuan: it.satuan,
                hargaSatuan: it.hargaSatuan,
                jumlah: execRabJml,
              });
            }
          }
        }
      });

      totalWageAmountForWeek += divUpahTotal;

      const isPerabot = div.kode === 'XII' || /perabot|mebeler|meja|kursi/i.test(div.uraian);
      bahanItems.forEach((bi) => {
        weeklyAllBahanItems.push({
          ...bi,
          isPerabot,
          divisionName: div.uraian,
        });
      });
      alatItems.forEach((ai) => {
        weeklyAllAlatItems.push({
          ...ai,
          divisionName: div.uraian,
        });
      });
    } else {
      const matchedRpd = rpdItems.filter(
        (it) =>
          !/papan nama|smkk|k3|helm|rompi/i.test(it.uraian) &&
          (it.uraian.toLowerCase().includes(div.uraian.toLowerCase()) ||
          div.uraian.toLowerCase().includes(it.uraian.toLowerCase()) ||
          it.kategori === 'BAHAN_BARU' ||
          it.kategori === 'BAHAN_REHAB')
      );

      const rpdCandidates = matchedRpd.slice(0, 3);
      if (rpdCandidates.length > 0) {
        const rawTokoItems = rpdCandidates.map((it) => {
          const volProp = Math.max(0.1, Math.round(progressRatio * it.volume100 * 100) / 100);
          return {
            namaBarang: it.uraian,
            volume: volProp,
            satuan: it.satuan,
            hargaSatuan: it.hargaSatuan,
            jumlah: Math.round(volProp * it.hargaSatuan),
          };
        });

        const isPerabot = div.kode === 'XII' || /perabot|mebeler|meja|kursi/i.test(div.uraian);
        rawTokoItems.forEach((ti) => {
          weeklyAllBahanItems.push({
            ...ti,
            isPerabot,
            divisionName: div.uraian,
          });
        });
      }
    }

    if (div.kategori === 'MANAJEMEN' || /perencana|pengawas|administrasi/i.test(div.uraian)) {
      return;
    }
  });

  const isSiplahItem = (i: typeof weeklyAllBahanItems[0]) =>
    (i.tags && i.tags.some((t) => /siplah/i.test(t))) ||
    (i as any).kategoriBiaya === 'SIPLAH' ||
    /siplah/i.test(i.namaBarang);

  const isCetakItem = (i: typeof weeklyAllBahanItems[0]) =>
    (i.tags && i.tags.some((t) => /ctk|cetak/i.test(t))) ||
    (i as any).kategoriBiaya === 'CETAK' ||
    /papan nama|prasasti|banner/i.test(i.namaBarang);

  const isPintuJendelaItem = (i: typeof weeklyAllBahanItems[0]) =>
    (i.tags && i.tags.some((t) => /fur/i.test(t))) ||
    (i as any).kategoriBiaya === 'PINTU_JENDELA' ||
    /pintu|jendela|alumunium|aluminium/i.test(i.namaBarang) ||
    /kayu.*kaca.*besi|pintu.*jendela|kusen/i.test(i.divisionName || '');

  const siplahMaterials = weeklyAllBahanItems.filter(isSiplahItem);
  const cetakMaterials = weeklyAllBahanItems.filter((i) => !isSiplahItem(i) && isCetakItem(i));
  const pintuJendelaMaterials = weeklyAllBahanItems.filter((i) => !isSiplahItem(i) && !isCetakItem(i) && isPintuJendelaItem(i));
  const perabotMaterials = weeklyAllBahanItems.filter((i) => !isSiplahItem(i) && !isCetakItem(i) && !isPintuJendelaItem(i) && i.isPerabot);
  const generalMaterials = weeklyAllBahanItems.filter((i) => !isSiplahItem(i) && !isCetakItem(i) && !isPintuJendelaItem(i) && !i.isPerabot);

  if (siplahMaterials.length > 0) {
    const defaultSiplahStore = stores.find(
      (s) => s.kategori === 'SIPLAH' || /siplah/i.test(`${s.namaToko} ${s.pekerjaan || ''}`)
    ) || {
      id: 's-def-siplah',
      namaToko: 'Toko Mitra SipLah Online',
      pemilikNama: 'Mitra Penyedia SipLah',
      pekerjaan: 'Penyedia Barang/Jasa Mitra SipLah',
      alamat: 'Platform Mitra SipLah / ' + (school.kabKota || 'Kota/Kabupaten Setempat'),
      telepon: '0812-9900-1122',
      npwp: '01.234.567.8-901.000',
      kategori: 'SIPLAH' as const,
    };

    const storeGroups = new Map<string, { store: ReturnType<typeof resolveStoreFromItemTags>; items: any[] }>();
    for (const item of siplahMaterials) {
      const store = resolveStoreFromItemTags(item, stores, defaultSiplahStore, school.kabKota);
      const key = store.namaToko;
      if (!storeGroups.has(key)) {
        storeGroups.set(key, { store, items: [] });
      }
      storeGroups.get(key)!.items.push(item);
    }

    let storeIdx = 0;
    for (const [storeName, group] of storeGroups.entries()) {
      const normalizedSiplah = consolidateAndStandardizeReceiptItems(group.items);
      const totalSiplahNominal = normalizedSiplah.reduce((s, it) => s + it.jumlah, 0);

      if (totalSiplahNominal > 0) {
        const dateInfo = getDateInWeek(weekDates.startDate, 1);
        const padW = String(targetWeek).padStart(2, '0');
        const seqSuffix = storeGroups.size > 1 ? `-${storeIdx + 1}` : '';
        const kwBukti = `SipLah/${padW}${seqSuffix}/${yearStr}`;
        const spbBukti = `SPB-SipLah/${padW}${seqSuffix}/${yearStr}`;
        const isTaxable = totalSiplahNominal >= 2000000;

        const siplahDoc: KwitansiDocument = {
          id: `kw-siplah-m${targetWeek}-${storeIdx}-${Date.now()}`,
          noBukti: kwBukti,
          noSpb: spbBukti,
          tipe: 'OPERASIONAL',
          tanggal: dateInfo.dateSlash,
          tanggalFormatted: dateInfo.dateFormatted,
          bulan: dateInfo.bulan,
          uraian: `Pembayaran Lunas Belanja Barang via ${group.store.namaToko} Awal Minggu Ke-${targetWeek} (${normalizedSiplah.map((i) => i.namaBarang).slice(0, 3).join(', ')}), Mengacu Bobot Fisik Bangunan Revitalisasi ${school.namaSekolah}, Tahun ${yearStr}.`,
          penerimaNama: group.store.pemilikNama || 'Mitra SipLah',
          penerimaPekerjaan: `Mitra Penyedia ${group.store.namaToko}`,
          penerimaAlamat: group.store.alamat || school.kabKota,
          namaToko: group.store.namaToko,
          items: normalizedSiplah,
          nominal: totalSiplahNominal,
          isPpn: isTaxable,
          isPph22: isTaxable,
          isPph23: false,
          ppnAmount: isTaxable ? Math.round((totalSiplahNominal / 1.11) * 0.11 * 100) / 100 : 0,
          pph22Amount: isTaxable ? Math.round((totalSiplahNominal / 1.11) * 0.015 * 100) / 100 : 0,
          pph23Amount: 0,
          kategoriBiayaPajak: 'Siplah',
          keteranganSpb: `Surat Perintah Bayar Belanja ${group.store.namaToko} Awal Minggu Ke-${targetWeek} (${dateInfo.dateFormatted})`,
          mingguKeRef: targetWeek,
        };

        const existingIdx = newKwitansiList.findIndex((k) => k.noBukti === kwBukti);
        if (existingIdx >= 0) {
          newKwitansiList[existingIdx] = siplahDoc;
        } else {
          newKwitansiList.push(siplahDoc);
        }
        generatedCount.bahan++;
        storeIdx++;
      }
    }
  }

  if (pintuJendelaMaterials.length > 0) {
    const normalizedPJ = consolidateAndStandardizeReceiptItems(pintuJendelaMaterials);
    const totalPJNominal = normalizedPJ.reduce((s, it) => s + it.jumlah, 0);

    if (totalPJNominal > 0) {
      const pjDateInfo = getDateInWeek(weekDates.startDate, 1);
      const padW = String(targetWeek).padStart(2, '0');
      const kwPJBukti = `Fur/${padW}/${yearStr}`;
      const spbPJBukti = `SPB-Fur/${padW}/${yearStr}`;
      const isTaxable = totalPJNominal >= 2000000;
      const ppn = isTaxable ? Math.round((totalPJNominal / 1.11) * 0.11 * 100) / 100 : 0;
      const pph22 = isTaxable ? Math.round((totalPJNominal / 1.11) * 0.015 * 100) / 100 : 0;

      const defaultPJStore = stores.find(
        (s) => s.kategori === 'PINTU_JENDELA_ALUMINIUM' || /alumunium|aluminium|pintu|jendela/i.test(`${s.namaToko} ${s.pekerjaan || ''}`)
      ) || {
        id: 's-def-alum',
        namaToko: 'CV. ALUMATAMA JAYA',
        pemilikNama: 'Ir. Bambang Sugiarto',
        pekerjaan: 'Spesialis Pintu & Jendela Aluminium',
        alamat: 'Jl. Industri Aluminium No. 12, ' + (school.kabKota || 'Kota/Kabupaten Setempat'),
        telepon: '0812-7788-3344',
        npwp: '02.456.789.1-123.000',
        kategori: 'PINTU_JENDELA_ALUMINIUM' as const,
      };

      const pjDoc: KwitansiDocument = {
        id: `kw-fur-m${targetWeek}-${Date.now()}`,
        noBukti: kwPJBukti,
        noSpb: spbPJBukti,
        tipe: 'PINTU_JENDELA',
        tanggal: pjDateInfo.dateSlash,
        tanggalFormatted: pjDateInfo.dateFormatted,
        bulan: pjDateInfo.bulan,
        uraian: `Pembayaran Lunas Pengadaan & Pemasangan Pintu dan Jendela Aluminium Complete Awal Minggu Ke-${targetWeek} (${normalizedPJ.map((i) => i.namaBarang).slice(0, 3).join(', ')}), Mengacu Bobot Fisik Bangunan Revitalisasi ${school.namaSekolah}, Tahun ${yearStr}.`,
        penerimaNama: defaultPJStore.pemilikNama || 'Ir. Bambang Sugiarto',
        penerimaPekerjaan: `Pemilik ${defaultPJStore.namaToko}`,
        penerimaAlamat: defaultPJStore.alamat || school.kabKota,
        namaToko: defaultPJStore.namaToko,
        items: normalizedPJ,
        nominal: totalPJNominal,
        isPpn: isTaxable,
        isPph22: isTaxable,
        isPph23: false,
        ppnAmount: ppn,
        pph22Amount: pph22,
        pph23Amount: 0,
        kategoriBiayaPajak: 'Konstruksi',
        keteranganSpb: `Surat Perintah Bayar Pengadaan Pintu & Jendela Aluminium Awal Minggu Ke-${targetWeek} (${pjDateInfo.dateFormatted})`,
        mingguKeRef: targetWeek,
      };

      const existingPJIdx = newKwitansiList.findIndex((k) => k.noBukti === kwPJBukti);
      if (existingPJIdx >= 0) {
        newKwitansiList[existingPJIdx] = pjDoc;
      } else {
        newKwitansiList.push(pjDoc);
      }
      generatedCount.bahan++;
    }
  }

  if (generalMaterials.length > 0) {
    const normalizedMatItems = normalizeMaterialItems(generalMaterials);
    const totalMatNominal = normalizedMatItems.reduce((s, it) => s + it.jumlah, 0);

    if (totalMatNominal > 0) {
      const shouldSplit = splitDays && normalizedMatItems.length > 3 && totalMatNominal >= 12000000;
      const chunks = shouldSplit
        ? [
            normalizedMatItems.slice(0, Math.ceil(normalizedMatItems.length / 2)),
            normalizedMatItems.slice(Math.ceil(normalizedMatItems.length / 2)),
          ]
        : [normalizedMatItems];

      chunks.forEach((chunkItems, cIdx) => {
        const chunkNominal = chunkItems.reduce((s, it) => s + it.jumlah, 0);
        if (chunkNominal <= 0) return;

        const dayOffset = shouldSplit ? (cIdx === 0 ? 0 : 1) : 0;
        const matDateInfo = getDateInWeek(weekDates.startDate, dayOffset);
        const seqNo = targetWeek * 10 + cIdx + 1;
        const kwMatBukti = `${String(seqNo).padStart(2, '0')}/KW-MAT/${yearStr}`;
        const spbBukti = `SPB-${String(seqNo).padStart(2, '0')}/MAT/${yearStr}`;

        const isTaxable = chunkNominal >= 2000000;
        const ppn = isTaxable ? Math.round((chunkNominal / 1.11) * 0.11 * 100) / 100 : 0;
        const pph22 = isTaxable ? Math.round((chunkNominal / 1.11) * 0.015 * 100) / 100 : 0;

        const topMatNames = chunkItems.map((i) => i.namaBarang).slice(0, 3).join(', ');
        const matStore = (chunkItems.length > 0
          ? resolveStoreFromItemTags(chunkItems[0], stores, defaultMaterialStore, school.kabKota)
          : defaultMaterialStore) || defaultMaterialStore;

        const matKwDoc: KwitansiDocument = {
          id: `kw-mat-m${targetWeek}-${cIdx}-${Date.now()}`,
          noBukti: kwMatBukti,
          noSpb: spbBukti,
          tipe: 'MATERIAL',
          tanggal: matDateInfo.dateSlash,
          tanggalFormatted: matDateInfo.dateFormatted,
          bulan: matDateInfo.bulan,
          uraian: `Pembayaran Lunas Biaya Pembelian Material/Bahan Awal Minggu Ke-${targetWeek} (${topMatNames}), Mengacu Bobot Fisik Bangunan Revitalisasi ${school.namaSekolah}, Tahun ${yearStr}, Daftar Terlampir.`,
          penerimaNama: matStore.pemilikNama || 'Pemilik Toko Rekanan',
          penerimaPekerjaan: `Pemilik ${matStore.namaToko}`,
          penerimaAlamat: matStore.alamat || school.kabKota,
          namaToko: matStore.namaToko,
          items: consolidateAndStandardizeReceiptItems(chunkItems, chunkNominal),
          nominal: chunkNominal,
          isPpn: isTaxable,
          isPph22: isTaxable,
          isPph23: false,
          ppnAmount: ppn,
          pph22Amount: pph22,
          pph23Amount: 0,
          kategoriBiayaPajak: 'Konstruksi',
          keteranganSpb: `Surat Perintah Bayar Pembelian Bahan Material Awal Minggu Ke-${targetWeek} (${matDateInfo.dateFormatted})`,
          mingguKeRef: targetWeek,
        };

        const existingIdx = newKwitansiList.findIndex((k) => k.noBukti === kwMatBukti);
        if (existingIdx >= 0) {
          newKwitansiList[existingIdx] = matKwDoc;
        } else {
          newKwitansiList.push(matKwDoc);
        }
        generatedCount.bahan++;
      });
    }
  }

  if (cetakMaterials.length > 0) {
    const normalizedCetak = normalizeMaterialItems(cetakMaterials);
    const totalCetakNominal = normalizedCetak.reduce((s, it) => s + it.jumlah, 0);
    if (totalCetakNominal > 0) {
      const cetakDateInfo = getDateInWeek(weekDates.startDate, 1);
      const padW = String(targetWeek).padStart(2, '0');
      const kwCetakBukti = `CTK/${padW}/${yearStr}`;
      const spbBukti = `SPB-CTK/${padW}/${yearStr}`;
      const isTaxable = totalCetakNominal >= 2000000;

      const cetakDoc: KwitansiDocument = {
        id: `kw-cetak-m${targetWeek}-${Date.now()}`,
        noBukti: kwCetakBukti,
        noSpb: spbBukti,
        tipe: 'OPERASIONAL',
        tanggal: cetakDateInfo.dateSlash,
        tanggalFormatted: cetakDateInfo.dateFormatted,
        bulan: cetakDateInfo.bulan,
        uraian: `Pembayaran Lunas Pengadaan & Cetak Papan Nama / Prasasti / Buku SPJ Awal Minggu Ke-${targetWeek} (${normalizedCetak.map((i) => i.namaBarang).slice(0, 3).join(', ')}), Revitalisasi ${school.namaSekolah}, Tahun ${yearStr}.`,
        penerimaNama: defaultPercetakanStore.pemilikNama || 'Pemilik CV Percetakan',
        penerimaPekerjaan: `Pemilik ${defaultPercetakanStore.namaToko}`,
        penerimaAlamat: defaultPercetakanStore.alamat || school.kabKota,
        namaToko: defaultPercetakanStore.namaToko,
        items: consolidateAndStandardizeReceiptItems(normalizedCetak, totalCetakNominal),
        nominal: totalCetakNominal,
        isPpn: isTaxable,
        isPph22: isTaxable,
        isPph23: false,
        ppnAmount: isTaxable ? Math.round((totalCetakNominal / 1.11) * 0.11 * 100) / 100 : 0,
        pph22Amount: isTaxable ? Math.round((totalCetakNominal / 1.11) * 0.015 * 100) / 100 : 0,
        pph23Amount: 0,
        kategoriBiayaPajak: 'Percetakan',
        keteranganSpb: `Surat Perintah Bayar Pengadaan & Cetak Dokumen Awal Minggu Ke-${targetWeek} (${cetakDateInfo.dateFormatted})`,
        mingguKeRef: targetWeek,
      };

      const existingIdx = newKwitansiList.findIndex((k) => k.noBukti === kwCetakBukti);
      if (existingIdx >= 0) {
        newKwitansiList[existingIdx] = cetakDoc;
      } else {
        newKwitansiList.push(cetakDoc);
      }
      generatedCount.bahan++;
    }
  }

  if (perabotMaterials.length > 0) {
    const pStoreGroups = new Map<string, { store: ReturnType<typeof resolveStoreFromItemTags>; items: any[] }>();
    for (const item of perabotMaterials) {
      const store = resolveStoreFromItemTags(item, stores, defaultPerabotStore, school.kabKota);
      const key = store.namaToko;
      if (!pStoreGroups.has(key)) {
        pStoreGroups.set(key, { store, items: [] });
      }
      pStoreGroups.get(key)!.items.push(item);
    }

    let pStoreIdx = 0;
    for (const [pStoreName, pGroup] of pStoreGroups.entries()) {
      const normalizedPerabot = normalizeMaterialItems(pGroup.items);
      const totalPerabotNominal = normalizedPerabot.reduce((s, it) => s + it.jumlah, 0);
      if (totalPerabotNominal > 0) {
        const perabotDateInfo = getDateInWeek(weekDates.startDate, 1);
        const seqNo = targetWeek * 10 + 5 + pStoreIdx;
        const seqSuffix = pStoreGroups.size > 1 ? `-${pStoreIdx + 1}` : '';
        const kwPerabotBukti = `${String(seqNo).padStart(2, '0')}${seqSuffix}/KW-MAT/${yearStr}`;
        const spbBukti = `SPB-${String(seqNo).padStart(2, '0')}${seqSuffix}/MAT/${yearStr}`;
        const isTaxable = totalPerabotNominal >= 2000000;

        const perabotDoc: KwitansiDocument = {
          id: `kw-perabot-m${targetWeek}-${pStoreIdx}-${Date.now()}`,
          noBukti: kwPerabotBukti,
          noSpb: spbBukti,
          tipe: 'PERABOT',
          tanggal: perabotDateInfo.dateSlash,
          tanggalFormatted: perabotDateInfo.dateFormatted,
          bulan: perabotDateInfo.bulan,
          uraian: `Pembayaran Lunas Pengadaan Perabot / Meubilair via ${pGroup.store.namaToko} Awal Minggu Ke-${targetWeek} (${normalizedPerabot.map((i) => i.namaBarang).slice(0, 3).join(', ')}), Revitalisasi ${school.namaSekolah}, Tahun ${yearStr}.`,
          penerimaNama: pGroup.store.pemilikNama || 'Pemilik Toko Mebel',
          penerimaPekerjaan: pGroup.store.pekerjaan || `Pemilik ${pGroup.store.namaToko}`,
          penerimaAlamat: pGroup.store.alamat || school.kabKota,
          namaToko: pGroup.store.namaToko,
          items: consolidateAndStandardizeReceiptItems(normalizedPerabot, totalPerabotNominal),
          nominal: totalPerabotNominal,
          isPpn: isTaxable,
          isPph22: isTaxable,
          isPph23: false,
          ppnAmount: isTaxable ? Math.round((totalPerabotNominal / 1.11) * 0.11 * 100) / 100 : 0,
          pph22Amount: isTaxable ? Math.round((totalPerabotNominal / 1.11) * 0.015 * 100) / 100 : 0,
          pph23Amount: 0,
          kategoriBiayaPajak: 'Perabot',
          keteranganSpb: `Surat Perintah Bayar Pengadaan Perabot Awal Minggu Ke-${targetWeek} (${perabotDateInfo.dateFormatted})`,
          mingguKeRef: targetWeek,
        };

        const existingIdx = newKwitansiList.findIndex((k) => k.noBukti === kwPerabotBukti);
        if (existingIdx >= 0) {
          newKwitansiList[existingIdx] = perabotDoc;
        } else {
          newKwitansiList.push(perabotDoc);
        }
        generatedCount.bahan++;
        pStoreIdx++;
      }
    }
  }

  if (weeklyAllAlatItems.length > 0) {
    const normalizedAlat = normalizeMaterialItems(weeklyAllAlatItems);
    const totalAlatNominal = normalizedAlat.reduce((s, it) => s + it.jumlah, 0);
    if (totalAlatNominal > 0) {
      const alatDateInfo = getDateInWeek(weekDates.startDate, 0);
      const seqAlat = targetWeek * 10 + 7;
      const kwAlatBukti = `${String(seqAlat).padStart(2, '0')}/KW-ALAT/${yearStr}`;
      const spbBukti = `SPB-${String(seqAlat).padStart(2, '0')}/ALAT/${yearStr}`;
      const pph23 = Math.round(totalAlatNominal * 0.02 * 100) / 100;

      const alatDoc: KwitansiDocument = {
        id: `kw-alat-m${targetWeek}-${Date.now()}`,
        noBukti: kwAlatBukti,
        noSpb: spbBukti,
        tipe: 'OPERASIONAL',
        tanggal: alatDateInfo.dateSlash,
        tanggalFormatted: alatDateInfo.dateFormatted,
        bulan: alatDateInfo.bulan,
        uraian: `Pembayaran Lunas Biaya Sewa/Pengadaan Alat Bantu Kerja Awal Minggu Ke-${targetWeek} (${normalizedAlat.map((i) => i.namaBarang).join(', ')}), Mengacu Bobot Fisik Revitalisasi ${school.namaSekolah}, Tahun ${yearStr}.`,
        penerimaNama: defaultMaterialStore.pemilikNama || 'Penyedia Sewa Alat',
        penerimaPekerjaan: `Penyedia Alat & Perlengkapan`,
        penerimaAlamat: defaultMaterialStore.alamat || school.kabKota,
        namaToko: defaultMaterialStore.namaToko,
        items: normalizedAlat,
        nominal: totalAlatNominal,
        isPpn: false,
        isPph22: false,
        isPph23: true,
        ppnAmount: 0,
        pph22Amount: 0,
        pph23Amount: pph23,
        kategoriBiayaPajak: 'Peralatan',
        keteranganSpb: `Surat Perintah Bayar Sewa Alat Bantu Kerja Awal Minggu Ke-${targetWeek} (${alatDateInfo.dateFormatted})`,
        mingguKeRef: targetWeek,
      };

      const existAlatIdx = newKwitansiList.findIndex((k) => k.noBukti === kwAlatBukti);
      if (existAlatIdx >= 0) {
        newKwitansiList[existAlatIdx] = alatDoc;
      } else {
        newKwitansiList.push(alatDoc);
      }
      generatedCount.alat++;
    }
  }

  const activeWorkersList: WorkerItem[] = workers && workers.length > 0 ? workers : [
    {
      id: 'w-def-1',
      nama: school.namaMandor || 'Mandor Proyek',
      jenisKelamin: 'L' as const,
      domisili: 'Dalam Desa' as const,
      peran: 'MANDOR',
      peranLabel: 'Mandor',
      upahHarian: 150000,
    },
    {
      id: 'w-def-2',
      nama: 'Tukang Ahli',
      jenisKelamin: 'L' as const,
      domisili: 'Dalam Desa' as const,
      peran: 'KEPALA_TUKANG',
      peranLabel: 'Kepala Tukang',
      upahHarian: 130000,
    },
    {
      id: 'w-def-3',
      nama: 'Pekerja Lapangan 1',
      jenisKelamin: 'L' as const,
      domisili: 'Dalam Desa' as const,
      peran: 'PEKERJA',
      peranLabel: 'Pekerja',
      upahHarian: 110000,
    },
    {
      id: 'w-def-4',
      nama: 'Pekerja Lapangan 2',
      jenisKelamin: 'L' as const,
      domisili: 'Dalam Desa' as const,
      peran: 'PEKERJA',
      peranLabel: 'Pekerja',
      upahHarian: 110000,
    },
  ];

  const hasPhysicalExecution = activeDivisions.some((d) => !/perencana|pengawas|administrasi|pengelolaan/i.test(d.uraian));
  if (totalWageAmountForWeek === 0 && hasPhysicalExecution) {
    const totalPhysicalExecJml = activeDivisions.reduce((sum, d) => {
      if (/perencana|pengawas|administrasi|pengelolaan/i.test(d.uraian)) return sum;
      return sum + Math.round((school.totalAnggaran || 500000000) * ((d.prestasiMingguIni || 0) / 100));
    }, 0);
    totalWageAmountForWeek = Math.round(totalPhysicalExecJml * 0.35);
  }

  const targetWage = totalWageAmountForWeek;
  let remainingWageBudget = targetWage;
  const sequentialAttendance: any[] = [];

  for (let i = 0; i < activeWorkersList.length; i++) {
    if (remainingWageBudget <= 0) break;

    const w = activeWorkersList[i];
    const safeDomisili: 'Dalam Desa' | 'Luar Desa' = w.domisili === 'Luar Desa' ? 'Luar Desa' : 'Dalam Desa';
    const exactRate = getAhspWageRateForRole(w.peran, w.peranLabel, realSchoolData?.ahspList, w.upahHarian);
    const isLastWorker = i === activeWorkersList.length - 1;

    let assignedHok = 0;
    let assignedTotal = 0;
    let assignedDailyRate = exactRate;

    if (isLastWorker || remainingWageBudget < exactRate * 2) {
      assignedTotal = remainingWageBudget;
      let calculatedHok = Math.round(assignedTotal / exactRate);
      assignedHok = Math.min(7, Math.max(1, calculatedHok));
      assignedDailyRate = Math.round((assignedTotal / assignedHok) * 100) / 100;
      remainingWageBudget = 0;
    } else {
      const maxHokPossible = Math.min(7, Math.max(1, Math.floor(remainingWageBudget / exactRate)));
      assignedHok = maxHokPossible;
      assignedTotal = Math.round(assignedHok * exactRate);
      remainingWageBudget -= assignedTotal;
    }

    const days: [number, number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0, 0];
    for (let d = 0; d < Math.min(7, assignedHok); d++) {
      days[d] = 1;
    }

    sequentialAttendance.push({
      workerId: w.id,
      nama: w.nama,
      jenisKelamin: w.jenisKelamin,
      domisili: safeDomisili,
      peran: w.peran,
      peranLabel: w.peranLabel,
      days,
      hok: assignedHok,
      upahHarian: assignedDailyRate,
      totalUpah: assignedTotal,
    });
  }

  if (remainingWageBudget > 0 && sequentialAttendance.length > 0) {
    const lastIdx = sequentialAttendance.length - 1;
    sequentialAttendance[lastIdx].totalUpah += remainingWageBudget;
    sequentialAttendance[lastIdx].upahHarian = Math.round((sequentialAttendance[lastIdx].totalUpah / (sequentialAttendance[lastIdx].hok || 1)) * 100) / 100;
  }

  const totCalculatedUpah = sequentialAttendance.reduce((s, a) => s + a.totalUpah, 0);

  const wageDocId = `wage-rep-m${targetWeek}`;
  const wageIdx = updatedWageReports.findIndex((r) => r.mingguKe === targetWeek);

  const mandorWorker =
    (workers || []).find(
      (w) =>
        (w.kategoriPenugasan === 'BORONGAN' || !w.kategoriPenugasan || w.kategoriPenugasan === 'SEMUA') &&
        (w.peran === 'MANDOR' || /mandor/i.test(w.peran) || /mandor/i.test(w.peranLabel || '') || /mandor/i.test(w.nama))
    ) ||
    (workers || []).find(
      (w) => w.peran === 'MANDOR' || /mandor/i.test(w.peran) || /mandor/i.test(w.peranLabel || '') || /mandor/i.test(w.nama) || w.peran === 'KT'
    ) ||
    workers?.[0];
  const defaultMandorNama = mandorWorker?.nama || school?.namaMandor || activeWorkersList[0]?.nama || 'Budiman (Mandor)';
  const defaultMandorJabatan = mandorWorker?.peranLabel || 'Mandor / Ketua Kelompok';

  const wageReportDoc: WeeklyWageReport = {
    id: wageDocId,
    mingguKe: targetWeek,
    bulan,
    periodeStart: formattedDateStart,
    periodeEnd: formattedDateEnd,
    tanggalKwitansi: formattedDateEnd,
    noBuktiKwitansi: `UK/${targetWeek < 10 ? '0' + targetWeek : targetWeek}/${yearStr}`,
    penerimaNama: defaultMandorNama,
    penerimaJabatan: defaultMandorJabatan,
    attendance: sequentialAttendance,
    totalUpah: totCalculatedUpah,
    bobotMingguIni: weekObj.bobotRealisasi || 0,
    bobotKumulatif: weekObj.bobotRealisasi || 0,
  };

  if (wageIdx >= 0) {
    updatedWageReports[wageIdx] = wageReportDoc;
  } else {
    updatedWageReports.push(wageReportDoc);
  }

  const kwUpahBukti = `UK/${targetWeek < 10 ? '0' + targetWeek : targetWeek}/${yearStr}`;
  const upahKwIdx = newKwitansiList.findIndex((k) => (k.tipe === 'UPAH' && k.mingguKeRef === targetWeek) || k.noBukti === kwUpahBukti);
  const upahKwDoc: KwitansiDocument = {
    id: upahKwIdx >= 0 ? newKwitansiList[upahKwIdx].id : `kw-wage-m${targetWeek}-${Date.now()}`,
    noBukti: kwUpahBukti,
    noSpb: `SPB-UPAH/${targetWeek < 10 ? '0' + targetWeek : targetWeek}/${yearStr}`,
    tipe: 'UPAH',
    tanggal: dateEndStr,
    tanggalFormatted: formattedDateEnd,
    bulan: bulan,
    uraian: `Pembayaran Lunas Biaya Upah Borongan Pekerja Fisik Minggu Ke-${targetWeek} (${formattedDateStart} s.d ${formattedDateEnd}), Sesuai Prestasi Kemajuan Fisik Revitalisasi ${school.namaSekolah}, Tahun ${yearStr}, Daftar Terlampir.`,
    penerimaNama: defaultMandorNama,
    penerimaPekerjaan: defaultMandorJabatan,
    penerimaAlamat: school.kabKota,
    nominal: totCalculatedUpah,
    items: (() => {
      if (weeklyAhspUpahComponents.length > 0) {
        const groupedUpah = new Map<string, { volume: number; satuan: string; hargaSatuan: number; jumlah: number }>();
        weeklyAhspUpahComponents.forEach((c) => {
          const existing = groupedUpah.get(c.namaBarang);
          if (existing) {
            existing.volume = Math.round((existing.volume + c.volume) * 100) / 100;
            existing.jumlah += c.jumlah;
          } else {
            groupedUpah.set(c.namaBarang, {
              volume: c.volume,
              satuan: 'HOK',
              hargaSatuan: c.hargaSatuan,
              jumlah: c.jumlah,
            });
          }
        });

        const rawList = Array.from(groupedUpah.entries()).map(([nama, data]) => ({
          namaBarang: nama,
          volume: data.volume,
          satuan: 'HOK',
          hargaSatuan: data.hargaSatuan,
          jumlah: data.jumlah,
        }));

        const rawTotal = rawList.reduce((s, it) => s + it.jumlah, 0);
        if (rawTotal > 0 && totCalculatedUpah > 0) {
          let runningSum = 0;
          return rawList.map((it, idx) => {
            if (idx === rawList.length - 1) {
              const lastJml = totCalculatedUpah - runningSum;
              let integerHok = Math.round(lastJml / it.hargaSatuan);
              if (integerHok < 1) integerHok = 1;
              const roundedUnitPrice = Math.round(lastJml / integerHok);
              return {
                ...it,
                volume: integerHok,
                satuan: 'HOK',
                hargaSatuan: roundedUnitPrice,
                jumlah: lastJml,
              };
            }
            const scaledJml = Math.round((it.jumlah / rawTotal) * totCalculatedUpah);
            runningSum += scaledJml;
            let integerHok = Math.round(scaledJml / it.hargaSatuan);
            if (integerHok < 1) integerHok = 1;
            const roundedUnitPrice = Math.round(scaledJml / integerHok);
            return {
              ...it,
              volume: integerHok,
              satuan: 'HOK',
              hargaSatuan: roundedUnitPrice,
              jumlah: scaledJml,
            };
          });
        }
        return rawList;
      }

      const detectedSpecialties: { peranLabel: string; tarif: number; hokRatio: number }[] = [];
      const divNames = activeDivisions.map((d) => (d.uraian || '').toLowerCase()).join(' ');

      if (/galian|tanah|urugan|pondasi/i.test(divNames)) {
        detectedSpecialties.push({ peranLabel: 'Tukang Gali', tarif: 150000, hokRatio: 0.35 });
        detectedSpecialties.push({ peranLabel: 'Tukang Batu', tarif: 150000, hokRatio: 0.35 });
        detectedSpecialties.push({ peranLabel: 'Pekerja Lapangan', tarif: 120000, hokRatio: 0.30 });
      } else if (/pasangan|dinding|bata|plesteran/i.test(divNames)) {
        detectedSpecialties.push({ peranLabel: 'Kepala Tukang Batu', tarif: 180000, hokRatio: 0.25 });
        detectedSpecialties.push({ peranLabel: 'Tukang Batu', tarif: 150000, hokRatio: 0.45 });
        detectedSpecialties.push({ peranLabel: 'Pekerja Pengaduk & Angkut', tarif: 120000, hokRatio: 0.30 });
      } else if (/beton|sloof|kolom|balok|dak/i.test(divNames)) {
        detectedSpecialties.push({ peranLabel: 'Tukang Besi & Cor', tarif: 150000, hokRatio: 0.40 });
        detectedSpecialties.push({ peranLabel: 'Tukang Batu / Cor', tarif: 150000, hokRatio: 0.30 });
        detectedSpecialties.push({ peranLabel: 'Pekerja Lapangan', tarif: 120000, hokRatio: 0.30 });
      } else if (/kayu|kusen|pintu|jendela/i.test(divNames)) {
        detectedSpecialties.push({ peranLabel: 'Kepala Tukang Kayu', tarif: 180000, hokRatio: 0.25 });
        detectedSpecialties.push({ peranLabel: 'Tukang Kayu', tarif: 150000, hokRatio: 0.50 });
        detectedSpecialties.push({ peranLabel: 'Pekerja Pembantu', tarif: 120000, hokRatio: 0.25 });
      } else if (/atap|kuda-kuda|spandek|baja/i.test(divNames)) {
        detectedSpecialties.push({ peranLabel: 'Tukang Rangka Baja & Atap', tarif: 160000, hokRatio: 0.55 });
        detectedSpecialties.push({ peranLabel: 'Pekerja Lapangan', tarif: 120000, hokRatio: 0.45 });
      } else if (/langit|plafon|gypsum|pvc/i.test(divNames)) {
        detectedSpecialties.push({ peranLabel: 'Tukang Plafon & Gypsum', tarif: 150000, hokRatio: 0.55 });
        detectedSpecialties.push({ peranLabel: 'Pekerja Lapangan', tarif: 120000, hokRatio: 0.45 });
      } else if (/lantai|keramik|granit/i.test(divNames)) {
        detectedSpecialties.push({ peranLabel: 'Tukang Pasang Keramik', tarif: 150000, hokRatio: 0.60 });
        detectedSpecialties.push({ peranLabel: 'Pekerja Pemotong & Pengaduk', tarif: 120000, hokRatio: 0.40 });
      } else if (/cat|finishing|pengecatan/i.test(divNames)) {
        detectedSpecialties.push({ peranLabel: 'Tukang Cat & Finishing', tarif: 150000, hokRatio: 0.60 });
        detectedSpecialties.push({ peranLabel: 'Pekerja Pengamplas', tarif: 120000, hokRatio: 0.40 });
      } else if (/listrik|instalasi/i.test(divNames)) {
        detectedSpecialties.push({ peranLabel: 'Tukang Listrik & Instalatur', tarif: 160000, hokRatio: 0.70 });
        detectedSpecialties.push({ peranLabel: 'Pekerja Pembantu', tarif: 120000, hokRatio: 0.30 });
      } else if (/sanitasi|pipa|plambing|wc/i.test(divNames)) {
        detectedSpecialties.push({ peranLabel: 'Tukang Pipa & Plambing', tarif: 150000, hokRatio: 0.65 });
        detectedSpecialties.push({ peranLabel: 'Pekerja Galian Pipa', tarif: 120000, hokRatio: 0.35 });
      }

      if (detectedSpecialties.length > 0 && totCalculatedUpah > 0) {
        let runningSum = 0;
        return detectedSpecialties.map((spec, sIdx) => {
          if (sIdx === detectedSpecialties.length - 1) {
            const lastJml = totCalculatedUpah - runningSum;
            let integerHok = Math.round(lastJml / spec.tarif);
            if (integerHok < 1) integerHok = 1;
            const unitPrice = Math.round(lastJml / integerHok);
            return {
              namaBarang: `Upah ${spec.peranLabel}`,
              volume: integerHok,
              satuan: 'HOK',
              hargaSatuan: unitPrice,
              jumlah: lastJml,
            };
          }
          const sNominal = Math.round(totCalculatedUpah * spec.hokRatio);
          runningSum += sNominal;
          let integerHok = Math.round(sNominal / spec.tarif);
          if (integerHok < 1) integerHok = 1;
          const unitPrice = Math.round(sNominal / integerHok);
          return {
            namaBarang: `Upah ${spec.peranLabel}`,
            volume: integerHok,
            satuan: 'HOK',
            hargaSatuan: unitPrice,
            jumlah: sNominal,
          };
        });
      }

      return sequentialAttendance.map((att: any) => ({
        namaBarang: `Upah ${att.peranLabel} (${att.nama})`,
        volume: att.hok,
        satuan: 'HOK',
        hargaSatuan: att.upahHarian,
        jumlah: att.totalUpah,
      }));
    })(),
    isPpn: false,
    isPph22: false,
    isPph23: false,
    ppnAmount: 0,
    pph22Amount: 0,
    pph23Amount: 0,
    kategoriBiayaPajak: 'Konstruksi',
    keteranganSpb: `Surat Perintah Bayar Upah Borongan Pekerja Fisik Minggu Ke-${targetWeek} (${formattedDateStart} s.d ${formattedDateEnd}) Sesuai Laporan Progres Fisik`,
    mingguKeRef: targetWeek,
  };

  if (totCalculatedUpah > 0) {
    for (let i = newKwitansiList.length - 1; i >= 0; i--) {
      const k = newKwitansiList[i];
      const wNum = extractWeekNumberFromKwitansi(k, weeksToUse, yearStr);
      if (wNum === targetWeek && (k.tipe === 'UPAH' || /uk\//i.test(k.noBukti || '') || /upah borongan|upah tukang|daftar hadir/i.test(k.uraian || ''))) {
        newKwitansiList.splice(i, 1);
      }
    }
    newKwitansiList.push(upahKwDoc);
    generatedCount.upah++;
  }

  const finalizedKwitansi = newKwitansiList.map((kw) => {
    if (kw.items && kw.items.length > 0 && kw.tipe !== 'UPAH') {
      return {
        ...kw,
        items: normalizeMaterialItems(kw.items),
      };
    }
    return kw;
  });

  return {
    updatedKwitansi: renumberKwitansiChronologically(deduplicateKwitansiList(finalizedKwitansi), yearStr),
    updatedWageReports,
    updatedBkb,
    generatedCount,
  };
}

export interface MultiWeekGenerationParams {
  selectedWeekNums: number[];
  weeksToUse: ProjectProgressWeek[];
  school: SchoolMasterData;
  workers: WorkerItem[];
  stores: StoreVendor[];
  rpdItems: RpdItem[];
  realSchoolData?: RealSchoolData;
  existingKwitansi: KwitansiDocument[];
  existingWageReports: WeeklyWageReport[];
  existingBkb: BkbTransaction[];
  splitDays?: boolean;
  procurementMode?: 'BATCH_CONSTRUCTION' | 'WEEKLY_CONSOLIDATED';
}

export interface MultiWeekGenerationResult {
  updatedKwitansi: KwitansiDocument[];
  updatedWageReports: WeeklyWageReport[];
  updatedBkb: BkbTransaction[];
  generatedCount: {
    bahan: number;
    upah: number;
    alat: number;
    smkk: number;
    manajemen: number;
  };
}

export function generateMonthlyManagementTransactions({
  weeksToUse,
  activeWeeks,
  school,
  stores = [],
  realSchoolData,
  existingKwitansi = [],
}: {
  weeksToUse: ProjectProgressWeek[];
  activeWeeks: ProjectProgressWeek[];
  school: SchoolMasterData;
  stores?: StoreVendor[];
  realSchoolData?: RealSchoolData;
  existingKwitansi?: KwitansiDocument[];
}): {
  managementKwitansi: KwitansiDocument[];
  generatedCount: number;
} {
  const yearStr = school?.tahunAnggaran?.trim() || '2026';
  const paguTotal = school?.totalAnggaran || 0;

  if (!weeksToUse || weeksToUse.length === 0 || !activeWeeks || activeWeeks.length === 0) {
    return { managementKwitansi: [], generatedCount: 0 };
  }

  const firstWeek = weeksToUse[0] || activeWeeks[0];
  const lastWeek = weeksToUse[weeksToUse.length - 1] || activeWeeks[activeWeeks.length - 1];
  const lastResolved = resolveWeekDates(lastWeek || { mingguKe: 14 }, yearStr);

  let finalProjectEndDate = lastResolved.endDate;
  if (school?.periodePenggunaan) {
    const match = school.periodePenggunaan.match(/(?:sampai|s\.d\.?|s\/d|-)\s*(\d{1,2})\s+([a-zA-Z]+|\d{1,2})\s+(\d{4})/i);
    if (match) {
      const day = match[1].padStart(2, '0');
      const monthPart = match[2];
      const year = match[3];
      const monthNum = monthOrderMap[monthPart.toLowerCase()] || parseInt(monthPart, 10);
      if (monthNum >= 1 && monthNum <= 12) {
        finalProjectEndDate = `${year}-${String(monthNum).padStart(2, '0')}-${day}`;
      }
    }
  }

  const [finalYearStr, finalMonthStr, finalDayStr] = finalProjectEndDate.split('-');
  const finalYear = parseInt(finalYearStr, 10) || parseInt(yearStr, 10) || 2026;
  const finalMonthNum = parseInt(finalMonthStr, 10) || 10;
  const finalMonthName = indonesianMonths[finalMonthNum - 1] || 'Oktober';
  const finalMonthKey = `${finalMonthName} ${finalYear}`;

  const divP = realSchoolData?.divisions?.find((d) => /perencana/i.test(d.uraian));
  const divW = realSchoolData?.divisions?.find((d) => /pengawas/i.test(d.uraian));
  const divA = realSchoolData?.divisions?.find((d) => /pengelolaan|administrasi/i.test(d.uraian));

  const bobotP = divP?.bobotPersen || (divP && divP.subTotal > 0 ? (divP.subTotal / paguTotal) * 100 : 2.23);
  const bobotW = divW?.bobotPersen || (divW && divW.subTotal > 0 ? (divW.subTotal / paguTotal) * 100 : 2.74);
  const bobotA = divA?.bobotPersen || (divA && divA.subTotal > 0 ? (divA.subTotal / paguTotal) * 100 : 3.23);

  const budgetP = divP?.subTotal || Math.round((paguTotal * bobotP) / 100);
  const budgetW = divW?.subTotal || Math.round((paguTotal * bobotW) / 100);
  const budgetA = divA?.subTotal || Math.round((paguTotal * bobotA) / 100);

  const monthWeeksMap = new Map<string, ProjectProgressWeek[]>();
  weeksToUse.forEach((w) => {
    const wDates = resolveWeekDates(w, yearStr);
    const mKey = wDates.bulan;
    if (!monthWeeksMap.has(mKey)) {
      monthWeeksMap.set(mKey, []);
    }
    monthWeeksMap.get(mKey)!.push(w);
  });

  const sortedMonthKeys = Array.from(monthWeeksMap.keys()).sort((a, b) => {
    const [mA, yA] = a.split(' ');
    const [mB, yB] = b.split(' ');
    const scoreA = (parseInt(yA, 10) || 2026) * 100 + (monthOrderMap[mA.toLowerCase()] || 1);
    const scoreB = (parseInt(yB, 10) || 2026) * 100 + (monthOrderMap[mB.toLowerCase()] || 1);
    return scoreA - scoreB;
  });

  const activeSet = new Set(activeWeeks.map((w) => w.mingguKe));
  const activeMonthKeys = sortedMonthKeys.filter((mKey) => {
    const mWeeks = monthWeeksMap.get(mKey) || [];
    return mWeeks.some((w) => {
      if (!activeSet.has(w.mingguKe)) return false;
      const divSum = (w.divisions || []).reduce((s, d) => s + (d.prestasiMingguIni || 0), 0);
      return (w.bobotRealisasi && w.bobotRealisasi > 0) || divSum > 0 || (w.mingguKe === 1 && activeSet.has(1));
    });
  });

  if (activeMonthKeys.length === 0) {
    return { managementKwitansi: [], generatedCount: 0 };
  }

  const managementKwitansi: KwitansiDocument[] = [];
  let paidSoFarP = 0;
  let paidSoFarW = 0;
  let paidSoFarA = 0;

  const defaultPengelolaSpjStore = (stores || []).find(
    (s) => s.kategori === 'PENGELOLA_SPJ' || /pengelola.*spj|pengelola spj/i.test(`${s.namaToko} ${s.pekerjaan || ''}`)
  );

  activeMonthKeys.forEach((mKey, mIdx) => {
    const mWeeks = monthWeeksMap.get(mKey) || [];
    const isFinalMonth = mKey === finalMonthKey || mIdx === activeMonthKeys.length - 1;

    let dateSlash: string;
    let dateFormatted: string;
    let bulan = mKey;

    if (isFinalMonth) {
      const [fYear, fMonth, fDay] = finalProjectEndDate.split('-');
      const dayNum = parseInt(fDay, 10) || 15;
      const fMNum = parseInt(fMonth, 10) || 10;
      const monthLabel = indonesianMonths[fMNum - 1] || 'Oktober';
      dateSlash = `${String(dayNum).padStart(2, '0')}/${String(fMNum).padStart(2, '0')}/${fYear}`;
      dateFormatted = `${dayNum} ${monthLabel} ${fYear}`;
      bulan = `${monthLabel} ${fYear}`;
    } else {
      const [mName, yStr] = mKey.split(' ');
      const mNum = monthOrderMap[mName.toLowerCase()] || 7;
      const yNum = parseInt(yStr, 10) || 2026;
      const lastDay = new Date(yNum, mNum, 0).getDate();
      const pDay = String(lastDay).padStart(2, '0');
      const pMon = String(mNum).padStart(2, '0');
      dateSlash = `${pDay}/${pMon}/${yNum}`;
      dateFormatted = `${lastDay} ${indonesianMonths[mNum - 1]} ${yNum}`;
      bulan = mKey;
    }

    let mProgP = 0;
    let mProgW = 0;
    let mProgA = 0;

    mWeeks.forEach((w) => {
      const dP = w.divisions?.find((d) => d.id === 'div-m1' || /perencana/i.test(d.uraian));
      const dW = w.divisions?.find((d) => d.id === 'div-m2' || /pengawas/i.test(d.uraian));
      const dA = w.divisions?.find((d) => d.id === 'div-m3' || /pengelolaan|administrasi/i.test(d.uraian));

      mProgP += (dP?.prestasiMingguIni || 0);
      mProgW += (dW?.prestasiMingguIni || 0);
      mProgA += (dA?.prestasiMingguIni || 0);
    });

    const mFisikSum = mWeeks.reduce((acc, w) => acc + (w.bobotRealisasi || 0), 0);
    if (mProgP === 0 && mFisikSum > 0 && paidSoFarP < budgetP) {
      mProgP = Math.round(((mFisikSum / 100) * bobotP) * 1000) / 1000;
    }
    if (mProgW === 0 && mFisikSum > 0 && paidSoFarW < budgetW) {
      mProgW = Math.round(((mFisikSum / 100) * bobotW) * 1000) / 1000;
    }
    if (mProgA === 0 && mFisikSum > 0 && paidSoFarA < budgetA) {
      mProgA = Math.round(((mFisikSum / 100) * bobotA) * 1000) / 1000;
    }

    let nomP = 0;
    if (isFinalMonth) {
      nomP = Math.max(0, budgetP - paidSoFarP);
    } else if (mProgP > 0 && bobotP > 0) {
      nomP = Math.round((budgetP * mProgP) / bobotP);
      nomP = Math.min(nomP, Math.max(0, budgetP - paidSoFarP));
    }

    let nomW = 0;
    if (isFinalMonth) {
      nomW = Math.max(0, budgetW - paidSoFarW);
    } else if (mProgW > 0 && bobotW > 0) {
      nomW = Math.round((budgetW * mProgW) / bobotW);
      nomW = Math.min(nomW, Math.max(0, budgetW - paidSoFarW));
    }

    let nomA = 0;
    if (isFinalMonth) {
      nomA = Math.max(0, budgetA - paidSoFarA);
    } else if (mProgA > 0 && bobotA > 0) {
      nomA = Math.round((budgetA * mProgA) / bobotA);
      nomA = Math.min(nomA, Math.max(0, budgetA - paidSoFarA));
    }

    paidSoFarP += nomP;
    paidSoFarW += nomW;
    paidSoFarA += nomA;

    const minW = Math.min(...mWeeks.map((w) => w.mingguKe));
    const maxW = Math.max(...mWeeks.map((w) => w.mingguKe));
    const weekSpanText = minW === maxW ? `Minggu Ke-${minW}` : `Minggu Ke-${minW} s.d ${maxW}`;
    const mSeq = mIdx + 1;
    const padM = String(mSeq).padStart(2, '0');

    if (nomP > 0) {
      const pph23P = Math.round(nomP * 0.02 * 100) / 100;
      managementKwitansi.push({
        id: `kw-kons-p-m${mSeq}-${Date.now()}`,
        noBukti: `KONS-P/${padM}/${yearStr}`,
        noSpb: `SPB-KONS-P/${padM}/${yearStr}`,
        tipe: 'KONSULTAN',
        tanggal: dateSlash,
        tanggalFormatted: dateFormatted,
        bulan,
        uraian: isFinalMonth
          ? `Pembayaran Lunas (Pelunasan Akhir) Honorarium Jasa Konsultan Perencana Teknis per Tanggal Akhir Proyek (${dateFormatted}), Revitalisasi ${school.namaSekolah}`
          : `Pembayaran Lunas Honorarium Jasa Konsultan Perencana Teknis Bulan ${bulan} (${weekSpanText}), Revitalisasi ${school.namaSekolah}`,
        penerimaNama: resolveManagementRecipient('PERENCANA', school, stores),
        penerimaPekerjaan: 'Konsultan Perencana Teknis',
        penerimaAlamat: school.kabKota,
        nominal: nomP,
        items: [
          {
            namaBarang: isFinalMonth
              ? 'Honorarium Jasa Konsultansi Perencanaan Teknis & Dokumen Laporan Akhir (Pelunasan Akhir Proyek)'
              : `Honorarium Jasa Konsultansi Perencanaan Teknis (Akumulasi Progres ${weekSpanText})`,
            volume: 1,
            satuan: 'Bulan',
            hargaSatuan: nomP,
            jumlah: nomP,
          },
        ],
        isPpn: false,
        isPph22: false,
        isPph23: true,
        ppnAmount: 0,
        pph22Amount: 0,
        pph23Amount: pph23P,
        kategoriBiayaPajak: 'Perencanaan_Pengelolaan',
        keteranganSpb: `Surat Perintah Bayar Honorarium Konsultan Perencana (${dateFormatted})`,
        mingguKeRef: maxW,
      });
    }

    if (nomW > 0) {
      const pph23W = Math.round(nomW * 0.02 * 100) / 100;
      managementKwitansi.push({
        id: `kw-kons-w-m${mSeq}-${Date.now()}`,
        noBukti: `KONS-W/${padM}/${yearStr}`,
        noSpb: `SPB-KONS-W/${padM}/${yearStr}`,
        tipe: 'KONSULTAN',
        tanggal: dateSlash,
        tanggalFormatted: dateFormatted,
        bulan,
        uraian: isFinalMonth
          ? `Pembayaran Lunas (Pelunasan Akhir) Honorarium Jasa Konsultan Pengawas Lapangan per Tanggal Akhir Proyek (${dateFormatted}), Revitalisasi ${school.namaSekolah}`
          : `Pembayaran Lunas Honorarium Jasa Konsultan Pengawas Lapangan Bulan ${bulan} (${weekSpanText}), Revitalisasi ${school.namaSekolah}`,
        penerimaNama: resolveManagementRecipient('PENGAWAS', school, stores),
        penerimaPekerjaan: 'Konsultan Pengawas Lapangan',
        penerimaAlamat: school.kabKota,
        nominal: nomW,
        items: [
          {
            namaBarang: isFinalMonth
              ? 'Honorarium Jasa Konsultansi Pengawasan Teknis Lapangan (Pelunasan Akhir Proyek)'
              : `Honorarium Jasa Konsultansi Pengawasan Teknis Lapangan (Akumulasi Progres ${weekSpanText})`,
            volume: 1,
            satuan: 'Bulan',
            hargaSatuan: nomW,
            jumlah: nomW,
          },
        ],
        isPpn: false,
        isPph22: false,
        isPph23: true,
        ppnAmount: 0,
        pph22Amount: 0,
        pph23Amount: pph23W,
        kategoriBiayaPajak: 'Perencanaan_Pengelolaan',
        keteranganSpb: `Surat Perintah Bayar Honorarium Konsultan Pengawas (${dateFormatted})`,
        mingguKeRef: maxW,
      });
    }

    if (nomA > 0) {
      managementKwitansi.push({
        id: `kw-adm-m${mSeq}-${Date.now()}`,
        noBukti: `ADM/${padM}/${yearStr}`,
        noSpb: `SPB-ADM/${padM}/${yearStr}`,
        tipe: 'OPERASIONAL',
        tanggal: dateSlash,
        tanggalFormatted: dateFormatted,
        bulan,
        uraian: isFinalMonth
          ? `Pembayaran Lunas (Pelunasan Akhir) Biaya Pengelolaan Administrasi SPJ & LPJ Kegiatan per Tanggal Akhir Proyek (${dateFormatted}), Revitalisasi ${school.namaSekolah}`
          : `Pembayaran Lunas Biaya Pengelolaan Administrasi SPJ & LPJ Kegiatan Bulan ${bulan} (${weekSpanText}), Revitalisasi ${school.namaSekolah}`,
        penerimaNama: resolveManagementRecipient('PENGELOLA', school, stores),
        penerimaPekerjaan: defaultPengelolaSpjStore ? defaultPengelolaSpjStore.pekerjaan || 'Pengelola SPJ' : 'Pengelola SPJ',
        penerimaAlamat: school.kabKota,
        namaToko: defaultPengelolaSpjStore ? defaultPengelolaSpjStore.namaToko : undefined,
        nominal: nomA,
        items: [
          {
            namaBarang: isFinalMonth
              ? 'Biaya Pengelolaan Administrasi, Penyusunan Dokumen SPJ & LPJ Final (Pelunasan Akhir Proyek)'
              : `Biaya Pengelolaan Administrasi, Penyusunan Dokumen SPJ & ATK (Akumulasi Progres ${weekSpanText})`,
            volume: 1,
            satuan: 'Bulan',
            hargaSatuan: nomA,
            jumlah: nomA,
          },
        ],
        isPpn: false,
        isPph22: false,
        isPph23: false,
        ppnAmount: 0,
        pph22Amount: 0,
        pph23Amount: 0,
        kategoriBiayaPajak: 'Perencanaan_Pengelolaan',
        keteranganSpb: `Surat Perintah Bayar Biaya Pengelolaan Administrasi (${dateFormatted})`,
        mingguKeRef: maxW,
      });
    }
  });

  return {
    managementKwitansi,
    generatedCount: managementKwitansi.length,
  };
}

export function generateRealisticMultiWeekTransactions({
  selectedWeekNums,
  weeksToUse,
  school,
  workers = [],
  stores = [],
  rpdItems = [],
  realSchoolData,
  existingKwitansi,
  existingWageReports,
  existingBkb,
  splitDays = true,
  procurementMode = 'BATCH_CONSTRUCTION',
}: MultiWeekGenerationParams): MultiWeekGenerationResult {
  const yearStr = school?.tahunAnggaran?.trim() || '2026';
  const selectedSet = new Set(selectedWeekNums);

  if (procurementMode === 'WEEKLY_CONSOLIDATED') {
    let currentKwitansi = [...existingKwitansi.filter((k) => {
      const isManualOrLocked = isReceiptLocked(k);
      if (isManualOrLocked) return true;
      const isMgmt =
        k.tipe === 'KONSULTAN' ||
        /kons-p|kons-w|perencana|pengawas/i.test(`${k.noBukti} ${k.uraian}`) ||
        (k.tipe === 'OPERASIONAL' && /\badm\b|pengelola|spj/i.test(`${k.noBukti} ${k.uraian}`));
      return !isMgmt;
    })];
    let currentWageReports = [...existingWageReports];
    let currentBkb = [...existingBkb];
    const generatedCount = { bahan: 0, upah: 0, alat: 0, smkk: 0, manajemen: 0 };

    const sortedWeeks = [...selectedWeekNums].sort((a, b) => a - b);
    sortedWeeks.forEach((targetWeek) => {
      const weekObj = weeksToUse.find((w) => w.mingguKe === targetWeek);
      if (!weekObj) return;
      const res = generateWeeklyTransactionsFromProgressAndRealData({
        targetWeek,
        weekObj,
        weeksToUse,
        school,
        workers,
        stores,
        rpdItems,
        realSchoolData,
        existingKwitansi: currentKwitansi,
        existingWageReports: currentWageReports,
        existingBkb: currentBkb,
        splitDays,
      });
      currentKwitansi = res.updatedKwitansi;
      currentWageReports = res.updatedWageReports;
      currentBkb = res.updatedBkb;
      generatedCount.bahan += res.generatedCount.bahan;
      generatedCount.upah += res.generatedCount.upah;
      generatedCount.alat += res.generatedCount.alat;
      generatedCount.smkk += res.generatedCount.smkk;
      generatedCount.manajemen += res.generatedCount.manajemen;
    });

    const activeWeeksForConsolidated = sortedWeeks
      .map((num) => weeksToUse.find((w) => w.mingguKe === num))
      .filter(Boolean) as ProjectProgressWeek[];

    const monthlyMgmtRes = generateMonthlyManagementTransactions({
      weeksToUse,
      activeWeeks: activeWeeksForConsolidated,
      school,
      stores,
      realSchoolData,
      existingKwitansi: currentKwitansi,
    });

    monthlyMgmtRes.managementKwitansi.forEach((kw) => {
      currentKwitansi.push(kw);
      generatedCount.manajemen++;
    });

    return {
      updatedKwitansi: renumberKwitansiChronologically(deduplicateKwitansiList(currentKwitansi), yearStr),
      updatedWageReports: currentWageReports,
      updatedBkb: currentBkb,
      generatedCount,
    };
  }

  const activeWeeks = weeksToUse
    .filter((w) => {
      if (!selectedSet.has(w.mingguKe)) return false;
      const divSum = (w.divisions || []).reduce((s, d) => s + (d.prestasiMingguIni || 0), 0);
      return (w.bobotRealisasi && w.bobotRealisasi > 0) || divSum > 0 || w.mingguKe === 1;
    })
    .sort((a, b) => a.mingguKe - b.mingguKe);

  const cleanExistingKwitansi = existingKwitansi.filter((k) => {
    const isManualOrLocked = isReceiptLocked(k);
    if (isManualOrLocked) return true;
    const isMgmt =
      k.tipe === 'KONSULTAN' ||
      /kons-p|kons-w|perencana|pengawas/i.test(`${k.noBukti} ${k.uraian}`) ||
      (k.tipe === 'OPERASIONAL' && /\badm\b|pengelola|spj/i.test(`${k.noBukti} ${k.uraian}`));
    if (isMgmt) return false;
    const wNum = extractWeekNumberFromKwitansi(k, weeksToUse, yearStr);
    return wNum === null || !selectedSet.has(wNum);
  });

  const newKwitansiList: KwitansiDocument[] = [...cleanExistingKwitansi];
  const updatedWageReports: WeeklyWageReport[] = existingWageReports.filter(
    (w) => !selectedSet.has(w.mingguKe)
  );
  const updatedBkb: BkbTransaction[] = [...existingBkb];

  const generatedCount = {
    bahan: 0,
    upah: 0,
    alat: 0,
    smkk: 0,
    manajemen: 0,
  };

  const manualSummary = summarizeManualKwitansiSpending(existingKwitansi, realSchoolData);

  if (activeWeeks.length === 0) {
    return {
      updatedKwitansi: deduplicateKwitansiList(cleanExistingKwitansi),
      updatedWageReports,
      updatedBkb,
      generatedCount,
    };
  }

  const hasTermin1Bkb = updatedBkb.some((b) => b.noBukti === 'KREDIT-T1' || b.id === 'bkb-init-termin1');
  const termin1Amount = school?.termin1Nilai || (school?.totalAnggaran ? Math.round(school.totalAnggaran * 0.7) : 0);
  if (!hasTermin1Bkb && termin1Amount > 0 && weeksToUse.length > 0) {
    const w1 = weeksToUse[0];
    const w1Dates = resolveWeekDates(w1, yearStr);
    updatedBkb.unshift({
      id: 'bkb-init-termin1',
      tanggal: w1Dates.startDateSlash,
      tanggalObj: w1Dates.startDate,
      bulan: w1Dates.bulan,
      uraian: 'Penerimaan Dana Revitalisasi Termin 1 (70%) ke Rekening Bank',
      noBukti: 'KREDIT-T1',
      penerimaan: termin1Amount,
      pengeluaran: 0,
    });
  }

  const defaultMaterialStore = stores.find((s) => s.kategori === 'MATERIAL') || stores[0] || {
    id: 's-def-mat',
    namaToko: 'Penyedia Bahan Material',
    pemilikNama: 'Penyedia Toko Rekanan',
    pekerjaan: 'Penyedia Bahan Bangunan',
    alamat: school.kabKota || 'Kota/Kabupaten Setempat',
    telepon: '-',
    kategori: 'MATERIAL',
  };
  const defaultPerabotStore = stores.find((s) => s.kategori === 'PERABOT') || defaultMaterialStore;

  const defaultPercetakanStore = stores.find(
    (s) => s.kategori === 'PERCETAKAN' || /percetakan|printing|dexa|cetak/i.test(`${s.namaToko} ${s.pekerjaan || ''}`)
  ) || defaultMaterialStore;

  activeWeeks.forEach((weekObj) => {
    const resSingle = generateWeeklyTransactionsFromProgressAndRealData({
      targetWeek: weekObj.mingguKe,
      weekObj,
      weeksToUse,
      school,
      workers,
      stores,
      rpdItems,
      realSchoolData,
      existingKwitansi: [],
      existingWageReports: [],
      existingBkb: [],
      splitDays: false,
    });

    resSingle.updatedKwitansi.forEach((kw) => {
      if (kw.tipe === 'UPAH') {
        newKwitansiList.push(kw);
        generatedCount.upah++;
      }
    });

    resSingle.updatedWageReports.forEach((wr) => {
      updatedWageReports.push(wr);
    });
  });

  const monthlyMgmtRes = generateMonthlyManagementTransactions({
    weeksToUse,
    activeWeeks,
    school,
    stores,
    realSchoolData,
    existingKwitansi,
  });

  monthlyMgmtRes.managementKwitansi.forEach((kw) => {
    newKwitansiList.push(kw);
    generatedCount.manajemen++;
  });

  if (selectedSet.has(1)) {
    const w1 = weeksToUse.find((w) => w.mingguKe === 1) || activeWeeks[0];
    const w1Dates = resolveWeekDates(w1, yearStr);

    const hasPapan = manualSummary.hasManualPapanNama || newKwitansiList.some((k) => /papan nama/i.test(`${k.noBukti} ${k.uraian}`));
    const hasSmkk = manualSummary.hasManualSmkk || newKwitansiList.some((k) => k.tipe === 'SMKK' || /smkk|k3/i.test(`${k.noBukti} ${k.uraian}`) || /kw-smkk/i.test(k.noBukti || ''));

    if (!hasPapan) {
      const papanRabItem = realSchoolData?.divisions?.flatMap((d) => d.items).find((i) => /papan nama/i.test(i.uraian));
      const papanNominal = papanRabItem ? Math.round(papanRabItem.volume * papanRabItem.hargaSatuan) : 1099800;

      const kwPapanBukti = `CTK/01/${yearStr}`;
      const spbPapanBukti = `SPB-CTK/01/${yearStr}`;
      const isTaxablePapan = papanNominal >= 2000000;

      const papanItems = [
        {
          namaBarang: `Pembuatan & Cetak Papan Nama Proyek Revitalisasi ${school.namaSekolah} (Bahan MMT / Akrilik & Frame Kayu Complete)`,
          volume: 1,
          satuan: 'unit',
          hargaSatuan: papanNominal,
          jumlah: papanNominal,
        },
      ];

      newKwitansiList.push({
        id: `kw-ctk-m1-papan-${Date.now()}`,
        noBukti: kwPapanBukti,
        noSpb: spbPapanBukti,
        tipe: 'CETAK',
        tanggal: w1Dates.startDateSlash,
        tanggalFormatted: w1Dates.startDateFormatted,
        bulan: w1Dates.bulan,
        uraian: `Pembayaran Lunas Biaya Pembuatan & Cetak Papan Nama Proyek Revitalisasi ${school.namaSekolah}, Tahun ${yearStr}, Rincian Terlampir.`,
        penerimaNama: defaultPercetakanStore.pemilikNama || 'Pemilik Percetakan',
        penerimaPekerjaan: `Pemilik ${defaultPercetakanStore.namaToko}`,
        penerimaAlamat: defaultPercetakanStore.alamat || school.kabKota,
        namaToko: defaultPercetakanStore.namaToko,
        items: papanItems,
        nominal: papanNominal,
        isPpn: isTaxablePapan,
        isPph22: isTaxablePapan,
        isPph23: false,
        ppnAmount: isTaxablePapan ? Math.round((papanNominal / 1.11) * 0.11) : 0,
        pph22Amount: isTaxablePapan ? Math.round((papanNominal / 1.11) * 0.015) : 0,
        pph23Amount: 0,
        kategoriBiayaPajak: 'Perencanaan_Pengelolaan',
        keteranganSpb: `Surat Perintah Bayar Biaya Cetak Papan Nama Proyek (${w1Dates.startDateFormatted})`,
        mingguKeRef: 1,
      });
      generatedCount.manajemen++;
    }

    if (!hasSmkk) {
      const realDivI = realSchoolData?.divisions?.find((d) => d.kode.toUpperCase() === 'I' || /persiapan/i.test(d.uraian));
      const smkkRabs = (realDivI?.items || []).filter(
        (it) => it.kategoriBiaya === 'SMKK' || /smkk|k3|helm|rompi|sepatu boot|sepatu safety|p3k|rambu/i.test(it.uraian)
      );
      const smkkRawItems = smkkRabs.length > 0 ? smkkRabs.map((it) => ({
        namaBarang: it.uraian,
        volume: it.volume,
        satuan: it.satuan,
        hargaSatuan: it.hargaSatuan,
        jumlah: Math.round(it.volume * it.hargaSatuan),
      })) : [
        { namaBarang: 'Penerapan SMKK - Helm kepala', volume: 10, satuan: 'buah', hargaSatuan: 83431, jumlah: 834310 },
        { namaBarang: 'Penerapan SMKK - Rompi', volume: 10, satuan: 'buah', hargaSatuan: 88852, jumlah: 888520 },
        { namaBarang: 'Penerapan SMKK - Sepatu boot', volume: 10, satuan: 'buah', hargaSatuan: 134195, jumlah: 1341950 },
        { namaBarang: 'Penerapan SMKK - Sarung tangan', volume: 10, satuan: 'buah', hargaSatuan: 59763, jumlah: 597630 },
        { namaBarang: 'Penerapan SMKK - Peralatan P3K', volume: 1, satuan: 'set', hargaSatuan: 2500000, jumlah: 2500000 },
        { namaBarang: 'Penerapan SMKK - Rambu-Rambu dan Pengendalian Resiko K3', volume: 1, satuan: 'set', hargaSatuan: 912302, jumlah: 912302 },
        { namaBarang: 'Penerapan SMKK - Tali keselamatan', volume: 1, satuan: 'roll', hargaSatuan: 550206, jumlah: 550206 },
      ];
      const smkkNominal = smkkRawItems.reduce((s, it) => s + it.jumlah, 0);

      newKwitansiList.push({
        id: `kw-smkk-m1-${Date.now()}`,
        noBukti: `01/KW-SMKK/${yearStr}`,
        noSpb: `SPB-01/SMKK/${yearStr}`,
        tipe: 'OPERASIONAL',
        tanggal: w1Dates.startDateSlash,
        tanggalFormatted: w1Dates.startDateFormatted,
        bulan: w1Dates.bulan,
        uraian: `Pembayaran Lunas Pengadaan Perlengkapan SMKK & K3 Lapangan (${smkkRawItems.map((i) => i.namaBarang.replace('Penerapan SMKK - ', '')).slice(0, 4).join(', ')}), Revitalisasi ${school.namaSekolah}, Tahun ${yearStr}, Rincian Terlampir.`,
        penerimaNama: defaultMaterialStore.pemilikNama || 'Penyedia SMKK',
        penerimaPekerjaan: 'Penyedia APD & Keselamatan Kerja',
        penerimaAlamat: defaultMaterialStore.alamat || school.kabKota,
        namaToko: defaultMaterialStore.namaToko,
        items: smkkRawItems,
        nominal: smkkNominal,
        isPpn: smkkNominal >= 2000000,
        isPph22: smkkNominal >= 2000000,
        isPph23: false,
        ppnAmount: smkkNominal >= 2000000 ? Math.round((smkkNominal / 1.11) * 0.11) : 0,
        pph22Amount: smkkNominal >= 2000000 ? Math.round((smkkNominal / 1.11) * 0.015) : 0,
        pph23Amount: 0,
        kategoriBiayaPajak: 'Peralatan',
        keteranganSpb: `Surat Perintah Bayar Pengadaan SMKK & K3 Minggu Ke-1 (${w1Dates.startDateFormatted})`,
        mingguKeRef: 1,
      });
      generatedCount.smkk++;
    }
  }

  const BATCH_SPECS = [
    {
      id: 'BATCH_1',
      title: 'Pondasi & Struktur Bawah',
      category: 'MATERIAL' as const,
      matcher: (kode: string, uraian: string) =>
        /tanah|galian|urugan|pondasi|batu kali|batu belah|aanstamping|sloof|beton bawah/i.test(uraian) ||
        kode === 'II' || kode === 'III',
    },
    {
      id: 'BATCH_2',
      title: 'Pasangan Dinding, Struktur Atas & Plesteran',
      category: 'MATERIAL' as const,
      matcher: (kode: string, uraian: string) =>
        (/dinding|bata|hebel|batako|plesteran|acian|kolom|ring balok|balok praktis/i.test(uraian) ||
        kode === 'IV') && !/pintu|kusen|jendela|kaca/i.test(uraian),
    },
    {
      id: 'BATCH_3',
      title: 'Rangka Atap, Penutup Atap & Plafon',
      category: 'MATERIAL' as const,
      matcher: (kode: string, uraian: string) =>
        /atap|kuda-kuda|baja ringan|spandek|genteng|nok|talang|plafon|langit/i.test(uraian) ||
        kode === 'VI' || kode === 'VII',
    },
    {
      id: 'BATCH_KUSEN',
      title: 'Fabrikasi & Pengadaan Kusen, Pintu & Jendela',
      category: 'KUSEN' as const,
      matcher: (kode: string, uraian: string) =>
        /pintu|kusen|kosen|jendela|ventilasi|boven|kayu.*kaca|kaca.*besi/i.test(uraian) ||
        kode === 'V',
    },
    {
      id: 'BATCH_4',
      title: 'Finishing, Lantai Keramik, Cat & MEP/Sanitasi',
      category: 'MATERIAL' as const,
      matcher: (kode: string, uraian: string) =>
        /cat|finishing|keramik|granit|lantai|listrik|lampu|sanitasi|pipa|kloset/i.test(uraian) ||
        kode === 'VIII' || kode === 'IX' || kode === 'X',
    },
    {
      id: 'BATCH_5',
      title: 'Pengadaan Meubilair / Perabot',
      category: 'PERABOT' as const,
      matcher: (kode: string, uraian: string) =>
        /perabot|mebel|meubilair|meubeler|kursi|meja|lemari|rak|loker|furnitur|ruang kelas/i.test(uraian) || kode === 'XII' || kode === 'XIII',
    },
  ];

  BATCH_SPECS.forEach((batch, bIdx) => {
    const matchingDivMap = new Map<string, { kode: string; uraian: string; bobotTotal: number; cumPrestasi: number }>();
    let earliestActiveWeek: number | null = null;

    activeWeeks.forEach((w) => {
      (w.divisions || []).forEach((d) => {
        if (d.kategori === 'MANAJEMEN' || /perencana|pengawas|administrasi/i.test(d.uraian)) return;
        if (batch.matcher(d.kode, d.uraian)) {
          const divPrestasi = d.prestasiMingguIni || 0;
          if (divPrestasi > 0) {
            if (earliestActiveWeek === null || w.mingguKe < earliestActiveWeek) {
              earliestActiveWeek = w.mingguKe;
            }
          }
          const prev = matchingDivMap.get(d.id || d.kode);
          if (prev) {
            prev.cumPrestasi += divPrestasi;
          } else {
            matchingDivMap.set(d.id || d.kode, {
              kode: d.kode,
              uraian: d.uraian,
              bobotTotal: d.bobotTotal,
              cumPrestasi: divPrestasi,
            });
          }
        }
      });
    });

    if (earliestActiveWeek === null || matchingDivMap.size === 0) return;

    const batchBahanItems: { namaBarang: string; volume: number; satuan: string; hargaSatuan: number; jumlah: number; isBarangPabrikasi?: boolean; tags?: string[]; kategoriBiaya?: string }[] = [];
    const batchAlatItems: { namaBarang: string; volume: number; satuan: string; hargaSatuan: number; jumlah: number }[] = [];

    matchingDivMap.forEach((divData) => {
      const progressRatio = divData.bobotTotal > 0 ? Math.min(1, Math.max(0, divData.cumPrestasi / divData.bobotTotal)) : 0;
      if (progressRatio <= 0) return;

      const divCode = divData.kode.toUpperCase();
      const isMeubilairBatch = batch.category === 'PERABOT' || /perabot|mebel|meubilair|meubeler|XII/i.test(`${divData.kode} ${divData.uraian}`);
      const realDiv = realSchoolData?.divisions?.find((rd) => {
        const rdCode = rd.kode.toUpperCase();
        if (rdCode === divCode) return true;
        const rdUraian = rd.uraian.toLowerCase();
        const dUraian = divData.uraian.toLowerCase();
        if (rdUraian.includes(dUraian) || dUraian.includes(rdUraian)) return true;
        if (isMeubilairBatch && /perabot|mebel|meubilair|meubeler|XII/i.test(`${rd.kode} ${rd.uraian}`)) return true;
        return false;
      });

      if (realDiv && realDiv.items && realDiv.items.length > 0) {
        realDiv.items.forEach((it) => {
          if (/papan nama|smkk|k3|helm|rompi|sepatu boot|sepatu safety|p3k/i.test(it.uraian)) return;

          if (it.statusBelanja === 'SUDAH_DIBELANJAKAN_MANDIRI' || manualSummary.fullyAbsorbedRabIds.has(it.id)) {
            return;
          }

          const normKey = getCanonicalMaterialKey(it.uraian);
          const manualSpent = Math.max(
            manualSummary.spentByRabId.get(it.id) || 0,
            manualSummary.spentByCanonicalName.get(normKey) || 0
          );
          const remainingRabVol = Math.max(0, it.volume - manualSpent);
          if (remainingRabVol <= 0) {
            return;
          }

          const isFullAbsorption = progressRatio >= 0.95;
          let execVol = isFullAbsorption
            ? remainingRabVol
            : Math.round(remainingRabVol * progressRatio * 1000) / 1000;

          if (execVol <= 0 && progressRatio > 0 && (it.isBarangPabrikasi || (it.tags && it.tags.some((t) => /siplah|fur/i.test(t))) || isMeubilairBatch)) {
            execVol = Math.max(1, Math.min(remainingRabVol, 1));
          }
          if (execVol <= 0) return;
          const execJml = Math.round(execVol * it.hargaSatuan);
          if (execJml <= 0) return;

          if (it.statusBelanja === 'DIALIHKAN') {
            if (it.targetReallokasi !== 'UPAH') {
              const dec = decomposeRealisticBahanAndUpah(divData.uraian || it.uraian, execJml, 0);
              batchBahanItems.push(...dec.bahanItems);
            }
            return;
          }

          const ahspMatch = (realSchoolData?.ahspList || []).find((ah) => {
            if (it.ahspIdRef && ah.id === it.ahspIdRef) return true;
            const lAh = (ah.namaPekerjaan || '').toLowerCase().trim();
            const lRab = it.uraian.toLowerCase().trim();
            return lAh === lRab || lAh.includes(lRab) || lRab.includes(lAh);
          });

          const isPreserved =
            (it.tags && it.tags.some((t) => t.toUpperCase() === 'FUR')) ||
            it.isBarangPabrikasi ||
            isPreservedUnitItem(it.uraian, it.satuan, it.isBarangPabrikasi);
          if (isPreserved) {
            let unitBahanPrice = it.hargaSatuan;
            if (!unitBahanPrice || unitBahanPrice <= 0) {
              if (ahspMatch && ahspMatch.komponen && ahspMatch.komponen.length > 0) {
                const compBahanList = ahspMatch.komponen.filter(
                  (c) => c.kategori !== 'UPAH' && !/tukang|pekerja|mandor/i.test(c.uraian) && c.kategori !== 'ALAT' && !/molen|sewa|scaffolding/i.test(c.uraian)
                );
                const totalBahanInAhsp = compBahanList.reduce(
                  (s, c) => s + ((c.hargaSatuan || 0) * (c.koefisien || 1)),
                  0
                );
                if (totalBahanInAhsp > 0) {
                  unitBahanPrice = totalBahanInAhsp;
                }
              }
            }
            batchBahanItems.push({
              namaBarang: it.uraian,
              volume: execVol,
              satuan: it.satuan || 'unit',
              hargaSatuan: unitBahanPrice,
              jumlah: Math.round(execVol * unitBahanPrice),
              isBarangPabrikasi: true,
              tags: it.tags,
              kategoriBiaya: it.kategoriBiaya,
            } as any);
            return;
          }

          if (ahspMatch && ahspMatch.komponen && ahspMatch.komponen.length > 0) {
            ahspMatch.komponen.forEach((comp) => {
              const compVol = Math.round((comp.koefisien || 1) * execVol * 1000) / 1000;
              if (compVol <= 0) return;
              const compJml = Math.round(compVol * (comp.hargaSatuan || 10000));
              if (compJml <= 0) return;

              const isUpah = comp.kategori === 'UPAH' || /tukang|pekerja|mandor/i.test(comp.uraian);
              const isAlat = comp.kategori === 'ALAT' || /molen|sewa|scaffolding|perancah/i.test(comp.uraian);

              if (!isUpah && !isAlat) {
                batchBahanItems.push({
                  namaBarang: comp.uraian,
                  volume: compVol,
                  satuan: comp.satuan || 'unit',
                  hargaSatuan: comp.hargaSatuan || 50000,
                  jumlah: compJml,
                });
              } else if (isAlat) {
                batchAlatItems.push({
                  namaBarang: comp.uraian,
                  volume: compVol,
                  satuan: comp.satuan || 'set',
                  hargaSatuan: comp.hargaSatuan || 50000,
                  jumlah: compJml,
                });
              }
            });
          } else {
            const isUpahBahan = /upah.*bahan|bahan.*upah/i.test(it.kategoriBiaya || '');
            if (isUpahBahan) {
              const bahanNom = Math.round(execJml * 0.65);
              const dec = decomposeRealisticBahanAndUpah(it.uraian, bahanNom, 0);
              batchBahanItems.push(...dec.bahanItems);
            } else if (it.kategoriBiaya === 'ALAT') {
              batchAlatItems.push({
                namaBarang: it.uraian,
                volume: execVol,
                satuan: it.satuan,
                hargaSatuan: it.hargaSatuan,
                jumlah: execJml,
              });
            } else if (it.kategoriBiaya !== 'UPAH' && it.kategoriBiaya !== 'SMKK') {
              const isComp = !isPureDirectMaterial(it.uraian, it.satuan);
              if (isComp && execJml >= 25000) {
                const dec = decomposeRealisticBahanAndUpah(it.uraian, execJml, 0);
                batchBahanItems.push(...dec.bahanItems);
              } else {
                batchBahanItems.push({
                  namaBarang: it.uraian,
                  volume: execVol,
                  satuan: it.satuan,
                  hargaSatuan: it.hargaSatuan,
                  jumlah: execJml,
                });
              }
            }
          }
        });
      } else {
        const matchedRpd = rpdItems.filter(
          (it) =>
            !/papan nama|smkk|k3/i.test(it.uraian) &&
            (it.uraian.toLowerCase().includes(divData.uraian.toLowerCase()) ||
            divData.uraian.toLowerCase().includes(it.uraian.toLowerCase()) ||
            it.kategori === 'BAHAN_BARU')
        );
        matchedRpd.slice(0, 3).forEach((it) => {
          const volProp = Math.max(0.1, Math.round(progressRatio * it.volume100 * 100) / 100);
          batchBahanItems.push({
            namaBarang: it.uraian,
            volume: volProp,
            satuan: it.satuan,
            hargaSatuan: it.hargaSatuan,
            jumlah: Math.round(volProp * it.hargaSatuan),
          });
        });
      }
    });

    if (batchBahanItems.length === 0 && batchAlatItems.length === 0) return;

    const dropWeek = weeksToUse.find((w) => w.mingguKe === earliestActiveWeek) || activeWeeks[0];
    const dropDates = resolveWeekDates(dropWeek, yearStr);
    const isKusen = (batch as any).category === 'KUSEN' || /kusen|pintu|jendela/i.test(batch.title);
    const isPerabot = batch.category === 'PERABOT';
    const kusenStore = stores.find(
      (s) => /zami|kayu|mebel|kusen|alum|bengkel/i.test(`${s.namaToko} ${s.pekerjaan || ''}`) || s.kategori === 'PERABOT'
    ) || defaultMaterialStore;
    const targetStore = isKusen ? kusenStore : (isPerabot ? defaultPerabotStore : defaultMaterialStore);

    if (batchBahanItems.length > 0) {
      const siplahBatchItems = batchBahanItems.filter(
        (i) =>
          (i.tags && i.tags.some((t) => /siplah/i.test(t))) ||
          (i as any).kategoriBiaya === 'SIPLAH' ||
          /siplah/i.test(i.namaBarang)
      );

      const regularBatchItems = batchBahanItems.filter(
        (i) =>
          !((i.tags && i.tags.some((t) => /siplah/i.test(t))) ||
          (i as any).kategoriBiaya === 'SIPLAH' ||
          /siplah/i.test(i.namaBarang))
      );

      if (siplahBatchItems.length > 0) {
        const defaultSiplahStore = stores.find(
          (s) => s.kategori === 'SIPLAH' || /siplah/i.test(`${s.namaToko} ${s.pekerjaan || ''}`)
        ) || {
          id: 's-def-siplah',
          namaToko: 'Toko Mitra SipLah Online',
          pemilikNama: 'Mitra Penyedia SipLah',
          pekerjaan: 'Penyedia Barang/Jasa Mitra SipLah',
          alamat: 'Platform Mitra SipLah / ' + (school?.kabKota || 'Kota/Kabupaten Setempat'),
          telepon: '0812-9900-1122',
          npwp: '01.234.567.8-901.000',
          kategori: 'SIPLAH' as const,
        };

        const storeGroups = new Map<string, { store: ReturnType<typeof resolveStoreFromItemTags>; items: any[] }>();
        for (const item of siplahBatchItems) {
          const store = resolveStoreFromItemTags(item, stores, defaultSiplahStore, school?.kabKota);
          const key = store.namaToko;
          if (!storeGroups.has(key)) {
            storeGroups.set(key, { store, items: [] });
          }
          storeGroups.get(key)!.items.push(item);
        }

        let storeIdx = 0;
        for (const [storeName, group] of storeGroups.entries()) {
          const normalizedSiplah = normalizeMaterialItems(group.items);
          const totalSiplahNominal = normalizedSiplah.reduce((s, it) => s + it.jumlah, 0);

          if (totalSiplahNominal > 0) {
            const dateInfo = getDateInWeek(dropDates.startDate, 1);
            const seqNo = (earliestActiveWeek || 1) * 10 + bIdx * 2 + storeIdx + 1;
            const seqSuffix = storeGroups.size > 1 ? `-${storeIdx + 1}` : '';
            const kwBukti = `SipLah/${String(seqNo).padStart(2, '0')}${seqSuffix}/${yearStr}`;
            const spbBukti = `SPB-SipLah/${String(seqNo).padStart(2, '0')}${seqSuffix}/${yearStr}`;
            const fiscal = getFiscalConfig(school || {});
            const isTaxable = totalSiplahNominal >= fiscal.taxExemptionThreshold;
            const { dpp: siplahDpp, ppn: siplahPpn } = calcDppAndPpn(totalSiplahNominal, fiscal.ppnRatePercent);
            const ppn = isTaxable ? siplahPpn : 0;
            const pph22 = isTaxable ? calcPph22(siplahDpp, fiscal.pph22RatePercent) : 0;

            const topNames = normalizedSiplah.map((i) => i.namaBarang).slice(0, 3).join(', ');
            newKwitansiList.push({
              id: `kw-batch-siplah-m${earliestActiveWeek}-${bIdx}-${storeIdx}-${Date.now()}`,
              noBukti: kwBukti,
              noSpb: spbBukti,
              tipe: 'OPERASIONAL',
              tanggal: dateInfo.dateSlash,
              tanggalFormatted: dateInfo.dateFormatted,
              bulan: dateInfo.bulan,
              uraian: `Pembayaran Lunas Belanja Barang via ${group.store.namaToko} Awal Pekan (${topNames}), Tahap ${batch.title} Revitalisasi ${school?.namaSekolah || 'Sekolah'}, Tahun ${yearStr}.`,
              penerimaNama: group.store.pemilikNama || 'Mitra SipLah',
              penerimaPekerjaan: `Mitra Penyedia ${group.store.namaToko}`,
              penerimaAlamat: group.store.alamat || school?.kabKota || '',
              namaToko: group.store.namaToko,
              items: consolidateAndStandardizeReceiptItems(normalizedSiplah, totalSiplahNominal),
              nominal: totalSiplahNominal,
              isPpn: isTaxable,
              isPph22: isTaxable,
              isPph23: false,
              ppnAmount: ppn,
              pph22Amount: pph22,
              pph23Amount: 0,
              kategoriBiayaPajak: 'Siplah',
              keteranganSpb: `Surat Perintah Bayar Belanja ${group.store.namaToko} Awal Pekan Tahap ${batch.title} (${dateInfo.dateFormatted})`,
              mingguKeRef: earliestActiveWeek || 1,
            });
            generatedCount.bahan++;
            storeIdx++;
          }
        }
      }

      if (regularBatchItems.length > 0) {
        const normalizedItems = normalizeMaterialItems(regularBatchItems);
        const totalBatchNominal = normalizedItems.reduce((s, it) => s + it.jumlah, 0);

        if (totalBatchNominal > 0) {
          const shouldSplit = splitDays && normalizedItems.length > 3 && totalBatchNominal >= 15000000;
          const chunks = shouldSplit
            ? [
                normalizedItems.slice(0, Math.ceil(normalizedItems.length / 2)),
                normalizedItems.slice(Math.ceil(normalizedItems.length / 2)),
              ]
            : [normalizedItems];

          chunks.forEach((chunkItems, cIdx) => {
            const chunkNominal = chunkItems.reduce((s, it) => s + it.jumlah, 0);
            if (chunkNominal <= 0) return;

            const dayOffset = shouldSplit ? (cIdx === 0 ? 0 : 1) : 0;
            const dateInfo = getDateInWeek(dropDates.startDate, dayOffset);
            const seqNo = (earliestActiveWeek || 1) * 10 + bIdx * 2 + cIdx + 1;
            const kwBukti = isKusen
              ? `Fur/${String(seqNo).padStart(2, '0')}/${yearStr}`
              : `${String(seqNo).padStart(2, '0')}/KW-MAT/${yearStr}`;
            const spbBukti = isKusen
              ? `SPB-Fur/${String(seqNo).padStart(2, '0')}/${yearStr}`
              : `SPB-${String(seqNo).padStart(2, '0')}/MAT/${yearStr}`;

            const isTaxable = chunkNominal >= 2000000;
            const ppn = isTaxable ? Math.round((chunkNominal / 1.11) * 0.11 * 100) / 100 : 0;
            const pph22 = isTaxable ? Math.round((chunkNominal / 1.11) * 0.015 * 100) / 100 : 0;

            const topNames = chunkItems.map((i) => i.namaBarang).slice(0, 3).join(', ');
            const resolvedChunkStore = chunkItems.length > 0
              ? resolveStoreFromItemTags(chunkItems[0], stores, targetStore, school?.kabKota)
              : targetStore;
            const finalStore = (resolvedChunkStore && resolvedChunkStore.namaToko)
              ? resolvedChunkStore
              : targetStore;

            newKwitansiList.push({
              id: `kw-batch-m${earliestActiveWeek}-${bIdx}-${cIdx}-${Date.now()}`,
              noBukti: kwBukti,
              noSpb: spbBukti,
              tipe: isKusen ? 'PINTU_JENDELA' : (isPerabot ? 'PERABOT' : 'MATERIAL'),
              tanggal: dateInfo.dateSlash,
              tanggalFormatted: dateInfo.dateFormatted,
              bulan: dateInfo.bulan,
              uraian: isKusen
                ? `Pembayaran Lunas Pengadaan & Fabrikasi Kusen, Pintu & Jendela (${topNames}), Tahap Awal Pekan Revitalisasi ${school?.namaSekolah || 'Sekolah'}, Tahun ${yearStr}, Rincian Terlampir.`
                : `Pembayaran Lunas Biaya Pembelian Material/Bahan Awal Pekan (${topNames}), Tahap ${batch.title} Mengacu Bobot Fisik Bangunan Revitalisasi ${school?.namaSekolah || 'Sekolah'}, Tahun ${yearStr}, Daftar Terlampir.`,
              penerimaNama: finalStore.pemilikNama || 'Pemilik Toko Rekanan',
              penerimaPekerjaan: isKusen ? (finalStore.pekerjaan || 'Pengrajin Kusen & Pintu Aluminium') : `Pemilik ${finalStore.namaToko}`,
              penerimaAlamat: finalStore.alamat || school?.kabKota || '',
              namaToko: finalStore.namaToko,
              items: consolidateAndStandardizeReceiptItems(chunkItems, chunkNominal),
              nominal: chunkNominal,
              isPpn: isTaxable,
              isPph22: isTaxable,
              isPph23: false,
              ppnAmount: ppn,
              pph22Amount: pph22,
              pph23Amount: 0,
              kategoriBiayaPajak: isPerabot ? 'Perabot' : 'Konstruksi',
              keteranganSpb: `Surat Perintah Bayar Pembelian Bahan Material Awal Pekan Tahap ${batch.title} (${dateInfo.dateFormatted})`,
              mingguKeRef: earliestActiveWeek || 1,
            });
            generatedCount.bahan++;
          });
        }
      }
    }

    if (batchAlatItems.length > 0) {
      const normalizedAlat = normalizeMaterialItems(batchAlatItems);
      const alatNominal = normalizedAlat.reduce((s, it) => s + it.jumlah, 0);
      if (alatNominal > 0) {
        const dateInfo = getDateInWeek(dropDates.startDate, 0);
        const seqNo = (earliestActiveWeek || 1) * 10 + bIdx + 7;
        const kwAlatBukti = `${String(seqNo).padStart(2, '0')}/KW-ALAT/${yearStr}`;
        const spbBukti = `SPB-${String(seqNo).padStart(2, '0')}/ALAT/${yearStr}`;

        newKwitansiList.push({
          id: `kw-alat-batch-m${earliestActiveWeek}-${bIdx}-${Date.now()}`,
          noBukti: kwAlatBukti,
          noSpb: spbBukti,
          tipe: 'OPERASIONAL',
          tanggal: dateInfo.dateSlash,
          tanggalFormatted: dateInfo.dateFormatted,
          bulan: dateInfo.bulan,
          uraian: `Pembayaran Lunas Biaya Sewa/Pengadaan Alat Bantu Kerja Awal Pekan (${normalizedAlat.map((i) => i.namaBarang).join(', ')}), Tahap ${batch.title} Revitalisasi ${school.namaSekolah}, Tahun ${yearStr}.`,
          penerimaNama: defaultMaterialStore.pemilikNama || 'Penyedia Sewa Alat',
          penerimaPekerjaan: 'Penyedia Alat & Perlengkapan',
          penerimaAlamat: defaultMaterialStore.alamat || school.kabKota,
          namaToko: defaultMaterialStore.namaToko,
          items: normalizedAlat,
          nominal: alatNominal,
          isPpn: false,
          isPph22: false,
          isPph23: true,
          ppnAmount: 0,
          pph22Amount: 0,
          pph23Amount: calcPph23(alatNominal, 2),
          kategoriBiayaPajak: 'Peralatan',
          keteranganSpb: `Surat Perintah Bayar Sewa Alat Tahap ${batch.title} (${dateInfo.dateFormatted})`,
          mingguKeRef: earliestActiveWeek || 1,
        });
        generatedCount.alat++;
      }
    }
  });

  return {
    updatedKwitansi: renumberKwitansiChronologically(deduplicateKwitansiList(newKwitansiList), yearStr),
    updatedWageReports,
    updatedBkb,
    generatedCount,
  };
}

export function balanceFinalMaterialKwitansiToBudget(
  kwitansiList: KwitansiDocument[],
  paguTotal: number,
  targetRatio: number = 1.0
): { balancedKwitansi: KwitansiDocument[]; adjustedAmount: number } {
  if (!kwitansiList || kwitansiList.length === 0 || !paguTotal || paguTotal <= 0) {
    return { balancedKwitansi: kwitansiList, adjustedAmount: 0 };
  }

  const targetBudget = Math.round(paguTotal * targetRatio);
  const currentTotal = kwitansiList.reduce((s, k) => s + (k.nominal || 0), 0);
  const diff = currentTotal - targetBudget;

  if (diff <= 0) {
    return { balancedKwitansi: kwitansiList, adjustedAmount: 0 };
  }

  const candidateIndices: number[] = [];
  kwitansiList.forEach((k, idx) => {
    const isManual = isReceiptLocked(k);
    const isFixed = isFixedNonSplitPayment(k);
    if (k.tipe === 'MATERIAL' && !isFixed && !isManual && (k.nominal || 0) > 0) {
      candidateIndices.push(idx);
    }
  });

  if (candidateIndices.length === 0) {
    return { balancedKwitansi: kwitansiList, adjustedAmount: 0 };
  }

  const resultList = [...kwitansiList];
  let remainingDiff = diff;

  for (let i = candidateIndices.length - 1; i >= 0 && remainingDiff > 0; i--) {
    const kwIdx = candidateIndices[i];
    const kw = resultList[kwIdx];
    const deduct = Math.min(kw.nominal, remainingDiff);
    const newNominal = Math.max(0, kw.nominal - deduct);

    const items = [...(kw.items || [])];
    if (items.length > 0) {
      const sortedItemIndices = items
        .map((item, idx) => ({ idx, jumlah: item.jumlah || 0 }))
        .sort((a, b) => b.jumlah - a.jumlah);

      let itemDeductRemaining = deduct;
      for (const itemMeta of sortedItemIndices) {
        if (itemDeductRemaining <= 0) break;
        const curItem = items[itemMeta.idx];
        const curDeduct = Math.min(curItem.jumlah || 0, itemDeductRemaining);
        const newJml = Math.max(0, (curItem.jumlah || 0) - curDeduct);
        const newVol = curItem.hargaSatuan > 0 ? Math.round((newJml / curItem.hargaSatuan) * 100) / 100 : curItem.volume;
        items[itemMeta.idx] = {
          ...curItem,
          jumlah: newJml,
          volume: newVol > 0 ? newVol : 1,
        };
        itemDeductRemaining -= curDeduct;
      }
    }

    const isPpn = Boolean(kw.isPpn);
    const isPph22 = Boolean(kw.isPph22);
    const ppnAmount = isPpn ? Math.round((newNominal * 11) / 111) : 0;
    const pph22Amount = isPph22 ? Math.round((newNominal * 1.5) / 100) : 0;

    resultList[kwIdx] = {
      ...kw,
      nominal: newNominal,
      items,
      ppnAmount,
      pph22Amount,
    };

    remainingDiff -= deduct;
  }

  const adjustedAmount = diff - remainingDiff;
  return { balancedKwitansi: resultList, adjustedAmount };
}

export function calibrateAllTransactionsToCurrentProgress(params: {
  school: SchoolMasterData;
  kwitansiList: KwitansiDocument[];
  progressWeeks: ProjectProgressWeek[];
  workers?: any[];
  stores?: StoreVendor[];
  rpdItems?: any[];
  realSchoolData?: any;
  existingBkb?: BkbTransaction[];
  bkuWeekLimit?: number;
}): {
  calibratedKwitansi: KwitansiDocument[];
  calibratedWageReports: WeeklyWageReport[];
  calibratedBkb: BkbTransaction[];
  cumulativeBobot: number;
  totalExpenditure: number;
  activeWeeksCount: number;
} {
  const {
    school,
    kwitansiList,
    progressWeeks,
    workers = [],
    stores = [],
    rpdItems = [],
    realSchoolData,
    existingBkb = [],
    bkuWeekLimit,
  } = params;
  const targetYear = school?.tahunAnggaran?.trim() || '2026';
  const paguTotal = school?.totalAnggaran || 0;

  const effLimit = bkuWeekLimit && bkuWeekLimit > 0 ? bkuWeekLimit : Math.max(...progressWeeks.map((w) => w.mingguKe), 1);

  const activeWeeks = progressWeeks.filter((w) => {
    if (w.mingguKe > effLimit) return false;
    const totalDivPrestasi = (w.divisions || []).reduce((ds, d) => ds + (d.prestasiMingguIni || 0), 0);
    return totalDivPrestasi > 0.0001 || (w.bobotRealisasi && w.bobotRealisasi > 0);
  });

  const activeWeekNums = new Set(activeWeeks.map((w) => w.mingguKe));
  const cumulativeBobot = calculateCumulativeRealizedProgress(progressWeeks, effLimit);

  if (activeWeeks.length === 0) {
    return {
      calibratedKwitansi: [],
      calibratedWageReports: [],
      calibratedBkb: existingBkb,
      cumulativeBobot: 0,
      totalExpenditure: 0,
      activeWeeksCount: 0,
    };
  }

  const preservedBase = kwitansiList.filter((k) => {
    const isAutoId = (k.id || '').startsWith('kw-') || (k.id || '').startsWith('bku-') || (k.id || '').includes('mgt-');
    if (!isAutoId || (k.id || '').includes('manual')) {
      return true;
    }
    return false;
  });

  const healedPreserved = healKwitansiList(preservedBase, targetYear);

  let currentKwitansi: KwitansiDocument[] = [...healedPreserved];
  let currentWageReports: WeeklyWageReport[] = [];
  let currentBkb: BkbTransaction[] = existingBkb && existingBkb.length > 0 ? [...existingBkb] : [];

  const multiRes = generateRealisticMultiWeekTransactions({
    selectedWeekNums: activeWeeks.map((w) => w.mingguKe),
    weeksToUse: progressWeeks,
    school,
    workers,
    stores,
    rpdItems,
    realSchoolData,
    existingKwitansi: currentKwitansi,
    existingWageReports: currentWageReports,
    existingBkb: currentBkb,
    splitDays: true,
    procurementMode: 'BATCH_CONSTRUCTION',
  });

  currentKwitansi = multiRes.updatedKwitansi;
  currentWageReports = multiRes.updatedWageReports;
  currentBkb = multiRes.updatedBkb;

  const papanRabItem = realSchoolData?.divisions?.flatMap((d: any) => d.items).find((i: any) => /papan nama/i.test(i.uraian));
  const exactPapanNominal = papanRabItem ? Math.round(papanRabItem.volume * papanRabItem.hargaSatuan) : 1099800;

  const realDivI = realSchoolData?.divisions?.find((d: any) => d.kode?.toUpperCase() === 'I' || /persiapan/i.test(d.uraian));
  const smkkRabs = (realDivI?.items || []).filter(
    (it: any) => it.kategoriBiaya === 'SMKK' || /smkk|k3|helm|rompi|sepatu boot|sepatu safety|p3k|rambu/i.test(it.uraian)
  );
  const exactSmkkNominal = smkkRabs.length > 0
    ? smkkRabs.reduce((acc: number, it: any) => acc + Math.round((it.volume || 1) * (it.hargaSatuan || 0)), 0)
    : 0;

  const isFixedLumpSumItem = (k: KwitansiDocument) => {
    const isManualOrLocked = isReceiptLocked(k);
    if (isManualOrLocked) return true;

    const bukti = (k.noBukti || '').toUpperCase();
    const uraian = (k.uraian || '').toLowerCase();
    const tipe = (k.tipe || '').toUpperCase();
    const isSiplahOrMeub =
      /siplah/i.test(bukti) ||
      /siplah/i.test(uraian) ||
      /mebel|meubilair|meubeler|perabot/i.test(uraian) ||
      (k.items && k.items.some((i: any) => /kursi siswa|meja setengah|rak mainan|loker|rak buku|papan kreasi|rak sepatu/i.test(i.namaBarang || '')));
    const isManagement =
      tipe === 'KONSULTAN' ||
      /kons-p|kons-w/i.test(bukti) ||
      /adm|pengelola|spj/i.test(bukti) ||
      /perencana|pengawas|biaya pengelolaan/i.test(uraian);
    return (
      tipe === 'CETAK' ||
      /^CTK\//i.test(bukti) ||
      /papan nama/i.test(uraian) ||
      tipe === 'SMKK' ||
      /KW-SMKK/i.test(bukti) ||
      /smkk|k3|keselamatan kerja|apd/i.test(uraian) ||
      isSiplahOrMeub ||
      isManagement
    );
  };

  const fixedPreparationKw: KwitansiDocument[] = [];
  currentKwitansi.forEach((k) => {
    if (isFixedLumpSumItem(k)) {
      const isManualOrLocked = isReceiptLocked(k);
      if (isManualOrLocked) {
        fixedPreparationKw.push(k);
        return;
      }

      const isPapan = (k.tipe || '').toUpperCase() === 'CETAK' || /^CTK\//i.test(k.noBukti || '') || /papan nama/i.test(k.uraian || '');
      const isSiplahOrMeub =
        /siplah/i.test(k.noBukti || '') ||
        /siplah|mebel|meubilair|meubeler|perabot/i.test(k.uraian || '') ||
        (k.items && k.items.some((i: any) => /kursi siswa|meja setengah|rak mainan|loker|rak buku|papan kreasi|rak sepatu/i.test(i.namaBarang || '')));
      const isManagement =
        (k.tipe || '').toUpperCase() === 'KONSULTAN' ||
        /kons-p|kons-w/i.test(k.noBukti || '') ||
        /adm|pengelola|spj/i.test(k.noBukti || '') ||
        /perencana|pengawas|biaya pengelolaan/i.test(k.uraian || '');

      if (isPapan) {
        const pItems = [
          {
            namaBarang: `Pembuatan & Cetak Papan Nama Proyek Revitalisasi ${school.namaSekolah} (Bahan MMT / Akrilik & Frame Kayu Complete)`,
            volume: 1,
            satuan: 'unit',
            hargaSatuan: exactPapanNominal,
            jumlah: exactPapanNominal,
          },
        ];
        fixedPreparationKw.push({
          ...k,
          tipe: 'CETAK',
          nominal: exactPapanNominal,
          items: pItems,
        });
      } else if (isSiplahOrMeub) {
        const hasExistingItems = k.items && k.items.length > 0;
        const finalItems = hasExistingItems ? k.items : (EXACT_MEBELER_RAB_ITEMS as any);
        const itemSum = finalItems.reduce((s: number, it: any) => s + (it.jumlah || 0), 0);
        const finalNominal = (hasExistingItems && itemSum > 0)
          ? itemSum
          : (k.nominal && k.nominal > 0 ? k.nominal : EXACT_MEBELER_RAB_TOTAL);
        const topNames = finalItems.map((i: any) => i.namaBarang).slice(0, 3).join(', ');
        const storeName = k.namaToko || 'Toko Mitra SipLah Online';
        fixedPreparationKw.push({
          ...k,
          tipe: 'OPERASIONAL',
          nominal: finalNominal,
          items: finalItems,
          namaToko: storeName,
          penerimaPekerjaan: k.penerimaPekerjaan || `Mitra Penyedia ${storeName}`,
          uraian: `Pembayaran Lunas Belanja Barang via ${storeName} (${topNames || 'Meubilair / Perabot'}), Tahap Pengadaan Meubilair / Perabot Revitalisasi ${school.namaSekolah}, Tahun ${targetYear}.`,
        });
      } else if (isManagement) {
        fixedPreparationKw.push(k);
      } else {
        const sNominal = exactSmkkNominal > 0 ? exactSmkkNominal : k.nominal;
        fixedPreparationKw.push({
          ...k,
          nominal: sNominal,
        });
      }
    }
  });

  const activeWeeklyKw = currentKwitansi.filter((k) => {
    if (isFixedLumpSumItem(k)) return false;
    const kwWeek = extractWeekNumberFromKwitansi(k, progressWeeks, targetYear);
    return kwWeek !== null && activeWeekNums.has(kwWeek);
  });

  const nonWeeklyPreserved = currentKwitansi.filter((k) => {
    if (isFixedLumpSumItem(k)) return false;
    const kwWeek = extractWeekNumberFromKwitansi(k, progressWeeks, targetYear);
    if (kwWeek !== null && activeWeekNums.has(kwWeek)) return false;
    const isKons = k.tipe === 'KONSULTAN' || /kons-p|kons-w|perencana|pengawas/i.test(`${k.noBukti} ${k.uraian}`);
    const isAdm = k.tipe === 'OPERASIONAL' || /\badm\b|pengelola/i.test(`${k.noBukti} ${k.uraian}`);
    return isKons || isAdm;
  });

  const targetConstructionTotal = Math.round((paguTotal * cumulativeBobot) / 100);
  const sumFixedPrep = fixedPreparationKw.reduce((s, k) => s + (k.nominal || 0), 0);
  const remainingTargetConstruction = Math.max(0, targetConstructionTotal - sumFixedPrep);

  const sumConstructionRaw = activeWeeklyKw.reduce((s, k) => s + (k.nominal || 0), 0);

  let scaledActiveKw: KwitansiDocument[] = [];
  if (sumConstructionRaw > 0 && remainingTargetConstruction > 0) {
    const scaleFactor = remainingTargetConstruction / sumConstructionRaw;
    let runningSum = 0;

    scaledActiveKw = activeWeeklyKw.map((kw, idx) => {
      if (idx === activeWeeklyKw.length - 1) {
        const lastNominal = Math.max(0, remainingTargetConstruction - runningSum);
        const itemScale = kw.nominal > 0 ? lastNominal / kw.nominal : scaleFactor;
        const scaledItems = (kw.items || []).map((it) => {
          const newVol = Math.max(1, Math.round((it.volume || 1) * itemScale));
          const newJml = Math.round(newVol * (it.hargaSatuan || 1));
          return { ...it, volume: newVol, jumlah: newJml };
        });
        const newNom = scaledItems.length > 0 ? scaledItems.reduce((s, i) => s + i.jumlah, 0) : lastNominal;
        return { ...kw, items: scaledItems, nominal: newNom > 0 ? newNom : lastNominal };
      }

      const scaledNominal = Math.round((kw.nominal || 0) * scaleFactor);
      runningSum += scaledNominal;
      const scaledItems = (kw.items || []).map((it) => {
        const newVol = Math.max(1, Math.round((it.volume || 1) * scaleFactor));
        const newJml = Math.round(newVol * (it.hargaSatuan || 1));
        return { ...it, volume: newVol, jumlah: newJml };
      });
      const newNom = scaledItems.length > 0 ? scaledItems.reduce((s, i) => s + i.jumlah, 0) : scaledNominal;
      return { ...kw, items: scaledItems, nominal: newNom > 0 ? newNom : scaledNominal };
    });
  } else {
    scaledActiveKw = activeWeeklyKw;
  }

  const finalizedKwitansi = renumberKwitansiChronologically(
    deduplicateKwitansiList([...scaledActiveKw, ...fixedPreparationKw, ...nonWeeklyPreserved]),
    targetYear
  );

  let balancedKwitansi = finalizedKwitansi;
  const targetBudget = Math.round((paguTotal * Math.min(100, cumulativeBobot)) / 100);
  const currentFinalExp = finalizedKwitansi.reduce((s, k) => s + (k.nominal || 0), 0);
  if (currentFinalExp > targetBudget) {
    const balRes = balanceFinalMaterialKwitansiToBudget(
      finalizedKwitansi,
      paguTotal,
      cumulativeBobot >= 99.9 ? 1.0 : cumulativeBobot / 100
    );
    balancedKwitansi = balRes.balancedKwitansi;
  }

  const totalExpenditure = balancedKwitansi.reduce((s, k) => s + (k.nominal || 0), 0);

  return {
    calibratedKwitansi: balancedKwitansi,
    calibratedWageReports: currentWageReports.filter((w) => activeWeekNums.has(w.mingguKe)),
    calibratedBkb: (currentBkb && currentBkb.length > 0) ? currentBkb : (existingBkb || []),
    cumulativeBobot: Math.round(cumulativeBobot * 100) / 100,
    totalExpenditure,
    activeWeeksCount: activeWeeks.length,
  };
}

export function rebalanceAndResyncAllKwitansiToBudget(params: {
  school: SchoolMasterData;
  kwitansiList: KwitansiDocument[];
  progressWeeks: ProjectProgressWeek[];
  workers?: any[];
  stores?: StoreVendor[];
  rpdItems?: any[];
  realSchoolData?: any;
  existingBkb?: BkbTransaction[];
}): {
  rebalancedKwitansi: KwitansiDocument[];
  rebalancedWageReports: WeeklyWageReport[];
  rebalancedBkb: BkbTransaction[];
} {
  const result = calibrateAllTransactionsToCurrentProgress(params);
  return {
    rebalancedKwitansi: result.calibratedKwitansi,
    rebalancedWageReports: result.calibratedWageReports,
    rebalancedBkb: result.calibratedBkb,
  };
}

export function alignKwitansiToOptionB({
  kwitansiList,
  totalAnggaran,
  progressWeeks,
}: {
  kwitansiList: KwitansiDocument[];
  totalAnggaran: number;
  progressWeeks?: ProjectProgressWeek[];
}): {
  alignedKwitansi: KwitansiDocument[];
  adjustedPerencana: number;
  adjustedPengawas: number;
  adjustedPengelola: number;
  adjustedMaterial: number;
} {
  if (!kwitansiList || kwitansiList.length === 0 || !totalAnggaran || totalAnggaran <= 0) {
    return {
      alignedKwitansi: kwitansiList || [],
      adjustedPerencana: 0,
      adjustedPengawas: 0,
      adjustedPengelola: 0,
      adjustedMaterial: 0,
    };
  }

  const targetP = 1.75;
  const targetW = 2.16;
  const targetA = 2.54;

  const targetBudgetP = Math.round((totalAnggaran * targetP) / 100);
  const targetBudgetW = Math.round((totalAnggaran * targetW) / 100);
  const targetBudgetA = Math.round((totalAnggaran * targetA) / 100);

  const isPerencana = (k: KwitansiDocument) => {
    const c = `${k.noBukti || ''} ${k.uraian || ''} ${k.penerimaPekerjaan || ''} ${k.namaToko || ''}`.toLowerCase();
    return ((k.tipe === 'KONSULTAN' || /kons-p/i.test(c)) && /perencana|perencanaan/i.test(c)) || (/kons-p/i.test(c) && !/pengawas/i.test(c));
  };

  const isPengawas = (k: KwitansiDocument) => {
    const c = `${k.noBukti || ''} ${k.uraian || ''} ${k.penerimaPekerjaan || ''} ${k.namaToko || ''}`.toLowerCase();
    return ((k.tipe === 'KONSULTAN' || /kons-w/i.test(c)) && /pengawas|pengawasan/i.test(c)) || (/kons-w/i.test(c) && !/perencana/i.test(c));
  };

  const isPengelola = (k: KwitansiDocument) => {
    const c = `${k.noBukti || ''} ${k.uraian || ''} ${k.penerimaPekerjaan || ''} ${k.namaToko || ''}`.toLowerCase();
    return (
      (/pengelola|spj|administrasi|lpj|tim\s*teknis|tim\s*pelaksana|p2sp|cetak|percetakan|papan\s*nama|banner|penggandaan|\bctk\b/i.test(c) ||
        k.tipe === 'OPERASIONAL' ||
        k.tipe === 'CETAK') &&
      !isPerencana(k) &&
      !isPengawas(k)
    );
  };

  const isMaterial = (k: KwitansiDocument) => {
    if (isPerencana(k) || isPengawas(k) || isPengelola(k)) return false;
    const c = `${k.noBukti || ''} ${k.uraian || ''}`.toLowerCase();
    if (k.tipe === 'UPAH' || /^uk\/|upah/i.test(c)) return false;
    if (k.tipe === 'SMKK' || /smkk|k3/i.test(c)) return false;
    if ((k.tipe as string) === 'SIPLAH' || /siplah/i.test(c)) return false;
    if (k.tipe === 'PINTU_JENDELA' || k.tipe === 'PERABOT' || /^fur\//i.test(c) || /pintu|jendela|kusen|mebel|perabot/i.test(c)) return false;
    return true;
  };

  const resultList = kwitansiList.map((k) => ({
    ...k,
    items: (k.items || []).map((it) => ({ ...it })),
  }));

  const scaleGroup = (
    predicate: (k: KwitansiDocument) => boolean,
    targetBudget: number
  ): number => {
    const matchingIndices: number[] = [];
    resultList.forEach((k, idx) => {
      if (predicate(k)) matchingIndices.push(idx);
    });

    if (matchingIndices.length === 0) return 0;

    const currentSum = matchingIndices.reduce((sum, idx) => sum + (resultList[idx].nominal || 0), 0);
    if (currentSum <= 0) return 0;

    let runningAllocated = 0;
    matchingIndices.forEach((kwIdx, i) => {
      const kw = resultList[kwIdx];
      let newNom: number;
      if (i === matchingIndices.length - 1) {
        newNom = Math.max(0, targetBudget - runningAllocated);
      } else {
        newNom = Math.round(targetBudget * ((kw.nominal || 0) / currentSum));
        runningAllocated += newNom;
      }

      const items = (kw.items || []).map((it, itIdx) => {
        if (itIdx === 0) {
          return { ...it, hargaSatuan: newNom, jumlah: newNom };
        }
        return { ...it, hargaSatuan: 0, jumlah: 0 };
      });

      resultList[kwIdx] = {
        ...kw,
        nominal: newNom,
        items,
      };
    });

    return currentSum - targetBudget;
  };

  const diffP = scaleGroup(isPerencana, targetBudgetP);
  const diffW = scaleGroup(isPengawas, targetBudgetW);
  const diffA = scaleGroup(isPengelola, targetBudgetA);

  const totalFreedUp = diffP + diffW + diffA;

  let adjustedMaterial = 0;
  if (totalFreedUp > 0) {
    const matIndices: number[] = [];
    resultList.forEach((k, idx) => {
      if (isMaterial(k) && !isReceiptLocked(k)) {
        matIndices.push(idx);
      }
    });

    if (matIndices.length > 0) {
      const targetMatIdx = matIndices[matIndices.length - 1];
      const targetKw = resultList[targetMatIdx];
      const newNom = (targetKw.nominal || 0) + totalFreedUp;

      const items = (targetKw.items || []).map((it, itIdx) => {
        if (itIdx === 0) {
          const newJml = (it.jumlah || 0) + totalFreedUp;
          const newVol = it.hargaSatuan > 0 ? Math.round((newJml / it.hargaSatuan) * 100) / 100 : it.volume;
          return {
            ...it,
            jumlah: newJml,
            volume: newVol > 0 ? newVol : 1,
          };
        }
        return { ...it };
      });

      const isPpn = Boolean(targetKw.isPpn);
      const isPph22 = Boolean(targetKw.isPph22);
      const { dpp: targetDpp, ppn: targetPpn } = calcDppAndPpn(newNom, 11);
      const ppnAmount = isPpn ? targetPpn : 0;
      const pph22Amount = isPph22 ? calcPph22(targetDpp, 1.5) : 0;

      resultList[targetMatIdx] = {
        ...targetKw,
        nominal: newNom,
        items,
        ppnAmount,
        pph22Amount,
      };
      adjustedMaterial = totalFreedUp;
    }
  }

  return {
    alignedKwitansi: resultList,
    adjustedPerencana: diffP,
    adjustedPengawas: diffW,
    adjustedPengelola: diffA,
    adjustedMaterial,
  };
}
