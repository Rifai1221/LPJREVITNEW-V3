import { RealSchoolData, RabDivision, RabSubItem, AhspItem, AhspKomponen, ProjectProgressWeek, DivisionProgressItem, SchoolMasterData } from '../types';
import { DEFAULT_DIVISIONS, renumberDivisions, recalculateAllWeeksProgress, toRoman } from './divisionHelper';
import { formatWeekPeriodString } from './monthHelper';
import { isPreservedUnitItem } from '../services/autoGeneratorService';
import { generateSecureId } from './idAndVoucherHelper';

async function getXLSX() {
  return await import('xlsx');
}

/**
 * Generate and download Excel Template for Real School Data
 * (Rekapitulasi Biaya, Rincian RAB Lengkap, AHSP Analisa Harga Satuan, & Identitas Sekolah)
 */
export async function downloadRealDataExcelTemplate(currentData?: RealSchoolData) {
  const XLSX = await getXLSX();
  const wb = XLSX.utils.book_new();

  // 1. Sheet 1: Identitas Sekolah
  const schoolIdentitasData = [
    [
      'Nama Sekolah',
      'Satuan Pendidikan',
      'Kegiatan / Pekerjaan',
      'Lokasi',
      'Kab/Kota',
      'Provinsi',
      'Tahun Anggaran',
      'Luas Bangunan (m2)',
    ],
    [
      currentData?.namaSekolah || 'SD NEGERI 1 BANDA ACEH',
      currentData?.satuanPendidikan || 'SD',
      currentData?.kegiatan || 'Rehabilitasi Ruang Kelas Rusak Sedang/Berat',
      currentData?.lokasi || 'Jl. Pendidikan No. 12',
      currentData?.kabKota || 'Kota Banda Aceh',
      currentData?.provinsi || 'Aceh',
      currentData?.tahunAnggaran || '2025',
      currentData?.luasBangunanM2 || 120,
    ],
  ];
  const wsIdentitas = XLSX.utils.aoa_to_sheet(schoolIdentitasData);
  // Set column widths
  wsIdentitas['!cols'] = [
    { wch: 30 },
    { wch: 20 },
    { wch: 45 },
    { wch: 30 },
    { wch: 20 },
    { wch: 15 },
    { wch: 15 },
    { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, wsIdentitas, 'Identitas_Sekolah');

  // 2. Sheet 2: Rekapitulasi & Rincian RAB Lengkap
  const rabRows: any[][] = [
    [
      'Kode Divisi',
      'Uraian Divisi / Pekerjaan',
      'Volume',
      'Satuan',
      'Harga Satuan (Rp)',
      'Kategori Biaya',
    ],
  ];

  if (currentData && currentData.divisions && currentData.divisions.length > 0) {
    currentData.divisions.forEach((div) => {
      // Division Header row
      rabRows.push([div.kode, div.uraian, '', '', '', '']);
      // Division items
      div.items.forEach((it) => {
        rabRows.push([
          div.kode,
          it.uraian,
          it.volume,
          it.satuan,
          it.hargaSatuan,
          it.kategoriBiaya || 'BAHAN',
        ]);
      });
    });
  } else {
    // Standard template default sample
    const sampleDivs = [
      {
        kode: 'I',
        uraian: 'PEKERJAAN PERSIAPAN / K3 / MANAJEMEN',
        items: [
          { uraian: 'Pembersihan Lapangan dan Perataan', volume: 120, satuan: 'm²', hargaSatuan: 18500, kat: 'SMKK' },
          { uraian: 'Pemasangan Bowplank / Pengukuran', volume: 48, satuan: 'm1', hargaSatuan: 42000, kat: 'SMKK' },
          { uraian: 'Papan Nama Proyek & Dokumentasi', volume: 1, satuan: 'Ls', hargaSatuan: 750000, kat: 'SMKK' },
        ],
      },
      {
        kode: 'II',
        uraian: 'PEKERJAAN PONDASI DAN STRUKTUR BETON',
        items: [
          { uraian: 'Galian Tanah Pondasi Footplat', volume: 18.5, satuan: 'm³', hargaSatuan: 85000, kat: 'UPAH' },
          { uraian: 'Urugan Pasir Bawah Pondasi t=10cm', volume: 3.2, satuan: 'm³', hargaSatuan: 220000, kat: 'BAHAN' },
          { uraian: 'Pekerjaan Beton Sloof 15/20 cm K-225', volume: 4.8, satuan: 'm³', hargaSatuan: 3850000, kat: 'BAHAN' },
          { uraian: 'Pekerjaan Kolom Praktis 12/12 cm', volume: 3.6, satuan: 'm³', hargaSatuan: 4200000, kat: 'BAHAN' },
        ],
      },
      {
        kode: 'III',
        uraian: 'PEKERJAAN DINDING, PLESTERAN & KERAMIK',
        items: [
          { uraian: 'Pasangan Dinding Bata Merah 1:4', volume: 145, satuan: 'm²', hargaSatuan: 135000, kat: 'BAHAN' },
          { uraian: 'Plesteran Dinding Halus 1:4 t=15mm', volume: 290, satuan: 'm²', hargaSatuan: 68000, kat: 'BAHAN' },
          { uraian: 'Acian Dinding Dalam & Luar', volume: 290, satuan: 'm²', hargaSatuan: 38000, kat: 'BAHAN' },
          { uraian: 'Pasangan Keramik Lantai 40x40 cm Polos', volume: 108, satuan: 'm²', hargaSatuan: 185000, kat: 'BAHAN' },
        ],
      },
      {
        kode: 'IV',
        uraian: 'PEKERJAAN ATAP, PLAFOND & FINISHING',
        items: [
          { uraian: 'Rangka Atap Baja Ringan C75.75', volume: 140, satuan: 'm²', hargaSatuan: 195000, kat: 'BAHAN' },
          { uraian: 'Penutup Atap Seng Gelombang Warna', volume: 140, satuan: 'm²', hargaSatuan: 125000, kat: 'BAHAN' },
          { uraian: 'Rangka & Plafond Gypsum Board 9mm', volume: 120, satuan: 'm²', hargaSatuan: 110000, kat: 'BAHAN' },
          { uraian: 'Pengecatan Tembok Interior & Eksterior', volume: 290, satuan: 'm²', hargaSatuan: 32000, kat: 'BAHAN' },
        ],
      },
    ];

    sampleDivs.forEach((div) => {
      rabRows.push([div.kode, div.uraian, '', '', '', '']);
      div.items.forEach((it) => {
        rabRows.push([div.kode, it.uraian, it.volume, it.satuan, it.hargaSatuan, it.kat]);
      });
    });
  }

  const wsRab = XLSX.utils.aoa_to_sheet(rabRows);
  wsRab['!cols'] = [
    { wch: 15 },
    { wch: 45 },
    { wch: 12 },
    { wch: 10 },
    { wch: 20 },
    { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(wb, wsRab, 'Rekapitulasi_dan_RAB');

  // 3. Sheet 3: AHSP Analisa Harga Satuan Pekerjaan
  const ahspRows: any[][] = [
    [
      'Kode Pekerjaan AHSP',
      'Nama Pekerjaan AHSP',
      'Satuan AHSP',
      'Kategori Komponen',
      'Uraian Komponen',
      'Koefisien',
      'Satuan Komponen',
      'Harga Satuan Komponen (Rp)',
    ],
  ];

  if (currentData && currentData.ahspList && currentData.ahspList.length > 0) {
    currentData.ahspList.forEach((ah) => {
      if (ah.komponen && ah.komponen.length > 0) {
        ah.komponen.forEach((k) => {
          ahspRows.push([
            ah.kodePekerjaan,
            ah.namaPekerjaan,
            ah.satuan,
            k.kategori,
            k.uraian,
            k.koefisien,
            k.satuan,
            k.hargaSatuan,
          ]);
        });
      } else {
        ahspRows.push([ah.kodePekerjaan, ah.namaPekerjaan, ah.satuan, '', '', '', '', '']);
      }
    });
  } else {
    // Sample AHSP rows
    const sampleAhsp = [
      {
        kode: 'A.2.2.1.1',
        nama: '1 m² Pembersihan Lapangan dan Perataan',
        satuan: 'm²',
        komponen: [
          { kat: 'UPAH', uraian: 'Pekerja', koef: 0.100, sat: 'OH', harga: 110000 },
          { kat: 'UPAH', uraian: 'Mandor', koef: 0.050, sat: 'OH', harga: 150000 },
        ],
      },
      {
        kode: 'A.3.2.1.2',
        nama: '1 m³ Galian Tanah Biasa Sedalam 1 Meter',
        satuan: 'm³',
        komponen: [
          { kat: 'UPAH', uraian: 'Pekerja', koef: 0.750, sat: 'OH', harga: 110000 },
          { kat: 'UPAH', uraian: 'Mandor', koef: 0.025, sat: 'OH', harga: 150000 },
          { kat: 'ALAT', uraian: 'Cangkul & Sekop', koef: 0.010, sat: 'Ls', harga: 50000 },
        ],
      },
      {
        kode: 'A.4.1.1.1',
        nama: '1 m³ Membuat Beton Mutu f\'c = 19.3 MPa (K-225)',
        satuan: 'm³',
        komponen: [
          { kat: 'BAHAN', uraian: 'Semen Portland (40 kg)', koef: 9.275, sat: 'Zak', harga: 72000 },
          { kat: 'BAHAN', uraian: 'Pasir Beton / Pasir Cor', koef: 0.520, sat: 'm³', harga: 220000 },
          { kat: 'BAHAN', uraian: 'Kerikil / Batu Spilit 2/3', koef: 0.780, sat: 'm³', harga: 280000 },
          { kat: 'UPAH', uraian: 'Pekerja', koef: 1.650, sat: 'OH', harga: 110000 },
          { kat: 'UPAH', uraian: 'Tukang Batu', koef: 0.275, sat: 'OH', harga: 135000 },
          { kat: 'UPAH', uraian: 'Kepala Tukang', koef: 0.028, sat: 'OH', harga: 150000 },
          { kat: 'UPAH', uraian: 'Mandor', koef: 0.083, sat: 'OH', harga: 150000 },
        ],
      },
    ];

    sampleAhsp.forEach((a) => {
      a.komponen.forEach((k) => {
        ahspRows.push([a.kode, a.nama, a.satuan, k.kat, k.uraian, k.koef, k.sat, k.harga]);
      });
    });
  }

  const wsAhsp = XLSX.utils.aoa_to_sheet(ahspRows);
  wsAhsp['!cols'] = [
    { wch: 18 },
    { wch: 45 },
    { wch: 10 },
    { wch: 18 },
    { wch: 35 },
    { wch: 12 },
    { wch: 12 },
    { wch: 22 },
  ];
  XLSX.utils.book_append_sheet(wb, wsAhsp, 'AHSP_Analisa_Harga_Satuan');

  // Trigger download
  const fileName = `Template_Data_Real_Sekolah_RAB_AHSP_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

/**
 * Parse uploaded Excel file and update RealSchoolData state
 */
export async function parseRealDataExcelFile(file: File): Promise<{
  success: boolean;
  data?: Partial<RealSchoolData>;
  message: string;
  summary?: {
    divisionsCount: number;
    rabItemsCount: number;
    ahspCount: number;
  };
}> {
  try {
    const XLSX = await getXLSX();
    const arrayBuffer = await file.arrayBuffer();
    const wb = XLSX.read(arrayBuffer, { type: 'array' });

    if (!wb.SheetNames || wb.SheetNames.length === 0) {
      return { success: false, message: 'File Excel kosong atau format tidak valid.' };
    }

    const updatedData: Partial<RealSchoolData> = {};
    let divisionsCount = 0;
    let rabItemsCount = 0;
    let ahspCount = 0;

    // 1. Check Sheet Identitas
    const identitasSheetName = wb.SheetNames.find(
      (s) => s.toLowerCase().includes('identitas') || s.toLowerCase().includes('sekolah')
    );
    if (identitasSheetName) {
      const sheet = wb.Sheets[identitasSheetName];
      const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });
      if (rows && rows.length >= 2) {
        const dataRow = rows[1];
        if (dataRow) {
          if (dataRow[0]) updatedData.namaSekolah = String(dataRow[0]).trim();
          if (dataRow[1]) updatedData.satuanPendidikan = String(dataRow[1]).trim();
          if (dataRow[2]) updatedData.kegiatan = String(dataRow[2]).trim();
          if (dataRow[3]) updatedData.lokasi = String(dataRow[3]).trim();
          if (dataRow[4]) updatedData.kabKota = String(dataRow[4]).trim();
          if (dataRow[5]) updatedData.provinsi = String(dataRow[5]).trim();
          if (dataRow[6]) updatedData.tahunAnggaran = String(dataRow[6]).trim();
          if (dataRow[7]) updatedData.luasBangunanM2 = parseFloat(dataRow[7]) || 120;
        }
      }
    }

    // 2. Check Sheet Rekapitulasi & RAB
    const rabSheetName = wb.SheetNames.find(
      (s) =>
        s.toLowerCase().includes('rab') ||
        s.toLowerCase().includes('rekap') ||
        s.toLowerCase().includes('rincian')
    ) || wb.SheetNames[0]; // fallback to 1st sheet if matching RAB name not found

    if (rabSheetName && wb.Sheets[rabSheetName]) {
      const sheet = wb.Sheets[rabSheetName];
      const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

      if (rows && rows.length > 1) {
        const divisionsMap: Map<string, RabDivision> = new Map();
        let currentDivKode = 'I';
        let currentDivUraian = 'DIVISI UMUM';

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;

          const col0 = row[0] !== undefined ? String(row[0]).trim() : '';
          const col1 = row[1] !== undefined ? String(row[1]).trim() : '';
          const col2 = row[2] !== undefined ? parseFloat(row[2]) || 0 : 0;
          const col3 = row[3] !== undefined ? String(row[3]).trim() : 'm²';
          const col4 = row[4] !== undefined ? parseFloat(row[4]) || 0 : 0;
          const col5 = row[5] !== undefined ? String(row[5]).toUpperCase().trim() : 'BAHAN';

          if (!col0 && !col1) continue;

          // Check if this row is a Division Header (e.g. col0 is Roman/Div code and col2/col4 are empty)
          const isDivisionHeader = col0 && col1 && (!col2 || col2 === 0) && (!col4 || col4 === 0);

          if (isDivisionHeader) {
            currentDivKode = col0.toUpperCase();
            currentDivUraian = col1.toUpperCase();

            if (!divisionsMap.has(currentDivKode)) {
              divisionsMap.set(currentDivKode, {
                id: `div-imp-${Date.now()}-${currentDivKode}`,
                kode: currentDivKode,
                uraian: currentDivUraian,
                subTotal: 0,
                bobotPersen: 0,
                items: [],
              });
            }
          } else {
            // It's a sub-item row
            const targetDivKode = col0 ? col0.toUpperCase() : currentDivKode;
            const itemUraian = col1 || col0;

            if (!itemUraian) continue;

            if (!divisionsMap.has(targetDivKode)) {
              divisionsMap.set(targetDivKode, {
                id: `div-imp-${Date.now()}-${targetDivKode}`,
                kode: targetDivKode,
                uraian: col0 ? `PEKERJAAN DIVISI ${targetDivKode}` : currentDivUraian,
                subTotal: 0,
                bobotPersen: 0,
                items: [],
              });
            }

            const targetDiv = divisionsMap.get(targetDivKode)!;
            const volume = Math.max(0, col2);
            const hargaSatuan = Math.max(0, col4);
            const jumlah = Math.round(volume * hargaSatuan * 100) / 100;

            let katBiaya: 'BAHAN' | 'UPAH' | 'ALAT' | 'SMKK' | 'UPAH_BAHAN' | 'LAINNYA' = 'BAHAN';
            if ((col5.includes('UPAH') && col5.includes('BAHAN')) || col5.includes('UPAH&BAHAN') || col5.includes('UPAH & BAHAN')) katBiaya = 'UPAH_BAHAN';
            else if (col5.includes('UPAH') || col5.includes('GAJI')) katBiaya = 'UPAH';
            else if (col5.includes('ALAT') || col5.includes('SEWA')) katBiaya = 'ALAT';
            else if (col5.includes('SMKK') || col5.includes('K3') || col5.includes('PERSIAPAN')) katBiaya = 'SMKK';
            else if (col5.includes('LAIN')) katBiaya = 'LAINNYA';

            const isPabrikasi =
              col5.includes('PABRIKASI') ||
              col5.includes('PABRIK') ||
              isPreservedUnitItem(itemUraian, col3);

            const newItem: RabSubItem = {
              id: generateSecureId('item-imp'),
              uraian: itemUraian,
              volume,
              satuan: col3 || 'm²',
              hargaSatuan,
              jumlah,
              kategoriBiaya: katBiaya,
              isBarangPabrikasi: isPabrikasi ? true : undefined,
            };

            targetDiv.items.push(newItem);
            targetDiv.subTotal += jumlah;
            rabItemsCount++;
          }
        }

        const parsedDivisions = Array.from(divisionsMap.values());
        divisionsCount = parsedDivisions.length;

        // Calculate total RAB and weights
        const totalRab = parsedDivisions.reduce((s, d) => s + d.subTotal, 0);
        const rebalancedDivisions = parsedDivisions.map((d) => ({
          ...d,
          bobotPersen: totalRab > 0 ? parseFloat(((d.subTotal / totalRab) * 100).toFixed(2)) : 0,
        }));

        updatedData.divisions = rebalancedDivisions;
        updatedData.totalNilaiRab = totalRab;
      }
    }

    // 3. Check Sheet AHSP Analisa Harga Satuan
    const ahspSheetName = wb.SheetNames.find(
      (s) => s.toLowerCase().includes('ahsp') || s.toLowerCase().includes('analisa')
    );

    if (ahspSheetName && wb.Sheets[ahspSheetName]) {
      const sheet = wb.Sheets[ahspSheetName];
      const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

      if (rows && rows.length > 1) {
        const ahspMap: Map<string, AhspItem> = new Map();

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;

          const kodeAhsp = row[0] ? String(row[0]).trim() : '';
          const namaAhsp = row[1] ? String(row[1]).trim() : '';
          const satuanAhsp = row[2] ? String(row[2]).trim() : 'm²';
          const katKomponen = row[3] ? String(row[3]).toUpperCase().trim() : 'BAHAN';
          const uraianKomp = row[4] ? String(row[4]).trim() : '';
          const koef = row[5] !== undefined ? parseFloat(row[5]) || 0 : 0;
          const satKomp = row[6] ? String(row[6]).trim() : 'OH';
          const hargaKomp = row[7] !== undefined ? parseFloat(row[7]) || 0 : 0;

          if (!kodeAhsp && !namaAhsp) continue;

          const ahspKey = kodeAhsp || namaAhsp;
          if (!ahspMap.has(ahspKey)) {
            ahspMap.set(ahspKey, {
              id: generateSecureId('ahsp-imp'),
              kodePekerjaan: kodeAhsp || 'AHSP-IMP',
              namaPekerjaan: namaAhsp || 'Pekerjaan Analisa',
              satuan: satuanAhsp,
              totalHargaSatuan: 0,
              komponen: [],
            });
          }

          const ahspObj = ahspMap.get(ahspKey)!;

          if (uraianKomp) {
            let kKat: 'BAHAN' | 'UPAH' | 'ALAT' = 'BAHAN';
            if (katKomponen.includes('UPAH') || katKomponen.includes('PEKERJA')) kKat = 'UPAH';
            else if (katKomponen.includes('ALAT')) kKat = 'ALAT';

            const totalKompHarga = Math.round(koef * hargaKomp);

            const komponenObj: AhspKomponen = {
              id: generateSecureId('komp-imp'),
              kategori: kKat,
              uraian: uraianKomp,
              koefisien: koef,
              satuan: satKomp,
              hargaSatuan: hargaKomp,
              totalHarga: totalKompHarga,
            };

            ahspObj.komponen.push(komponenObj);
            ahspObj.totalHargaSatuan += totalKompHarga;
          }
        }

        const parsedAhspList = Array.from(ahspMap.values());
        ahspCount = parsedAhspList.length;
        updatedData.ahspList = parsedAhspList;
      }
    }

    return {
      success: true,
      data: updatedData,
      message: 'File Excel berhasil diproses.',
      summary: {
        divisionsCount,
        rabItemsCount,
        ahspCount,
      },
    };
  } catch (err: any) {
    console.error('Error reading Excel file:', err);
    return {
      success: false,
      message: `Gagal membaca file Excel: ${err?.message || 'Format tidak valid'}`,
    };
  }
}

/**
 * Generate and download Excel Template for Weekly Progress & Weights (Matriks Kurva S & Jadwal Mingguan)
 * Memungkinkan pengguna mengisi bobot beberapa minggu sekaligus dalam satu file Excel
 */
export async function downloadWeeklyProgressExcelTemplate(
  progressWeeks: ProjectProgressWeek[],
  school?: SchoolMasterData
) {
  const XLSX = await getXLSX();
  const wb = XLSX.utils.book_new();

  const sortedWeeks = [...(progressWeeks && progressWeeks.length > 0 ? progressWeeks : [])].sort(
    (a, b) => a.mingguKe - b.mingguKe
  );

  // If no weeks exist, create default 14 weeks
  const activeWeeks: ProjectProgressWeek[] =
    sortedWeeks.length > 0
      ? sortedWeeks
      : Array.from({ length: 14 }, (_, i) => ({
          mingguKe: i + 1,
          periode: `Minggu ${i + 1}`,
          startDate: '',
          endDate: '',
          bobotRencana: Math.min(100, (i + 1) * 7.14),
          bobotRealisasi: 0,
          deviasi: 0,
          keterangan: `Pelaksanaan pekerjaan minggu ke-${i + 1}`,
          itemPekerjaan: [],
          divisions: DEFAULT_DIVISIONS.map((d) => ({
            ...d,
            prestasiMingguLalu: 0,
            prestasiMingguIni: 0,
            prestasiSdMingguIni: 0,
          })),
        }));

  // Resolve base divisions
  const baseDivs =
    activeWeeks[0]?.divisions && activeWeeks[0].divisions.length > 0
      ? activeWeeks[0].divisions
      : DEFAULT_DIVISIONS.map((d) => ({
          ...d,
          prestasiMingguLalu: 0,
          prestasiMingguIni: 0,
          prestasiSdMingguIni: 0,
        }));

  const divisions = renumberDivisions(baseDivs);

  // 1. SHEET 1: MATRIKS_BOBOT_MINGGUAN (Kurva S Matrix)
  const matrixRows: any[][] = [
    ['REKAPITULASI LAPORAN MINGGUAN & BOBOT KEMAJUAN PEKERJAAN (KURVA S)'],
    [
      'Nama Satuan Pendidikan:',
      school?.namaSekolah || 'SD NEGERI 1 BANDA ACEH',
      '',
      'Tahun Anggaran:',
      school?.tahunAnggaran || '2026',
    ],
    [
      'Kegiatan / Pekerjaan:',
      school?.pekerjaan || school?.program || 'Rehabilitasi Ruang Kelas Rusak Sedang/Berat',
      '',
      'Total Pagu Anggaran (Rp):',
      school?.totalAnggaran || 0,
    ],
    [],
    [
      'PETUNJUK PENGISIAN:',
      'Masukkan persentase capaian fisik murni yang dikerjakan pada minggu bersangkutan pada kolom "Minggu 1 (%)", "Minggu 2 (%)", dst. Sistem otomatis menghitung akumulasi prestasi lalu, prestasi s.d minggu ini, realisasi total, dan deviasi saat diunggah.',
    ],
    [
      'TARGET',
      '',
      'TARGET RENCANA KUMULATIF (%)',
      '',
      ...activeWeeks.map((w) => w.bobotRencana ?? 0),
    ],
    [
      'PERIODE',
      '',
      'PERIODE TANGGAL',
      '',
      ...activeWeeks.map((w) => w.periode || `Minggu ${w.mingguKe}`),
    ],
    [
      'START_DATE',
      '',
      'TANGGAL MULAI (YYYY-MM-DD)',
      '',
      ...activeWeeks.map((w) => w.startDate || ''),
    ],
    [
      'END_DATE',
      '',
      'TANGGAL SELESAI (YYYY-MM-DD)',
      '',
      ...activeWeeks.map((w) => w.endDate || ''),
    ],
    [
      'Kode',
      'Kategori',
      'Uraian Pekerjaan',
      'Bobot Total (%)',
      ...activeWeeks.map((w) => `Minggu ${w.mingguKe} (%)`),
    ],
  ];

  // Add Division Rows
  divisions.forEach((div) => {
    const rowValues = [
      div.kode,
      div.kategori,
      div.uraian,
      div.bobotTotal,
      ...activeWeeks.map((w) => {
        const matched = w.divisions?.find(
          (d) =>
            d.id === div.id ||
            (d.kode === div.kode && d.kategori === div.kategori) ||
            d.uraian.trim().toUpperCase() === div.uraian.trim().toUpperCase()
        );
        return matched?.prestasiMingguIni ?? 0;
      }),
    ];
    matrixRows.push(rowValues);
  });

  // Summary Rows at the bottom of the table
  const totalBobotAll = divisions.reduce((s, d) => s + (Number(d.bobotTotal) || 0), 0);
  matrixRows.push([
    '',
    '',
    'TOTAL PRESTASI MINGGU INI (%)',
    Math.round(totalBobotAll * 1000) / 1000,
    ...activeWeeks.map((w) => {
      const sumIni = (w.divisions || []).reduce((s, d) => s + (Number(d.prestasiMingguIni) || 0), 0);
      return Math.round(sumIni * 1000) / 1000;
    }),
  ]);

  matrixRows.push([
    '',
    '',
    'TOTAL REALISASI S.D MINGGU INI (%)',
    '',
    ...activeWeeks.map((w) => w.bobotRealisasi ?? 0),
  ]);

  matrixRows.push([
    '',
    '',
    'TARGET RENCANA KUMULATIF (%)',
    '',
    ...activeWeeks.map((w) => w.bobotRencana ?? 0),
  ]);

  matrixRows.push([
    '',
    '',
    'DEVIASI (+ Cepat / - Terlambat %)',
    '',
    ...activeWeeks.map((w) => w.deviasi ?? 0),
  ]);

  const wsMatrix = XLSX.utils.aoa_to_sheet(matrixRows);
  wsMatrix['!cols'] = [
    { wch: 10 },
    { wch: 15 },
    { wch: 45 },
    { wch: 18 },
    ...activeWeeks.map(() => ({ wch: 16 })),
  ];
  XLSX.utils.book_append_sheet(wb, wsMatrix, 'Matriks_Bobot_Mingguan');

  // 2. SHEET 2: JADWAL_DAN_TARGET_MINGGUAN
  const scheduleRows: any[][] = [
    [
      'Minggu Ke',
      'Tanggal Mulai (YYYY-MM-DD)',
      'Tanggal Selesai (YYYY-MM-DD)',
      'Periode Kerja',
      'Target Rencana Kumulatif (%)',
      'Realisasi Kumulatif (%)',
      'Keterangan Pelaksanaan Pekerjaan',
    ],
  ];

  activeWeeks.forEach((w) => {
    scheduleRows.push([
      w.mingguKe,
      w.startDate || '',
      w.endDate || '',
      w.periode || `Minggu ${w.mingguKe}`,
      w.bobotRencana ?? 0,
      w.bobotRealisasi ?? 0,
      w.keterangan || `Pelaksanaan pekerjaan minggu ke-${w.mingguKe}`,
    ]);
  });

  const wsSchedule = XLSX.utils.aoa_to_sheet(scheduleRows);
  wsSchedule['!cols'] = [
    { wch: 12 },
    { wch: 25 },
    { wch: 25 },
    { wch: 25 },
    { wch: 25 },
    { wch: 22 },
    { wch: 50 },
  ];
  XLSX.utils.book_append_sheet(wb, wsSchedule, 'Jadwal_dan_Target_Mingguan');

  // 3. SHEET 3: PETUNJUK_PENGISIAN
  const guideRows: any[][] = [
    ['PANDUAN PENGISIAN EXCEL LAPORAN MINGGUAN & BOBOT'],
    [],
    ['No', 'Bagian / Fitur', 'Penjelasan & Aturan Pengisian'],
    [
      '1',
      'Sheet Matriks_Bobot_Mingguan',
      'Sheet utama untuk mengisi persentase kemajuan pekerjaan (prestasi mingguan) untuk beberapa minggu sekaligus.',
    ],
    [
      '2',
      'Kolom Bobot Total (%)',
      'Menentukan porsi bobot rencana per uraian pekerjaan. Total akumulasi bobot dari seluruh pekerjaan harus tepat 100,00%.',
    ],
    [
      '3',
      'Kolom Minggu 1 (%) s/d Minggu N (%)',
      'Diisi dengan persentase fisik yang dikerjakan murni pada minggu tersebut (Prestasi Minggu Ini).',
    ],
    [
      '4',
      'Baris TARGET RENCANA KUMULATIF (%)',
      'Dapat diedit untuk menentukan kurva target rencana pekerjaan per minggu.',
    ],
    [
      '5',
      'Baris PERIODE / TANGGAL MULAI / SELESAI',
      'Digunakan untuk menentukan rentang tanggal tiap minggu secara otomatis terintegrasi ke seluruh SPJ dan Kwitansi.',
    ],
    [
      '6',
      'Menambah Minggu Baru',
      'Anda dapat menambahkan kolom minggu berikutnya di sebelah kanan (misal Minggu 15, Minggu 16, dst) jika pekerjaan memerlukan waktu lebih panjang.',
    ],
    [
      '7',
      'Kalkulasi Otomatis',
      'Saat diunggah ke aplikasi, sistem LPJ otomatis mengkalkulasi Prestasi Minggu Lalu, Prestasi s.d Minggu Ini, Deviasi, serta menyinkronkannya ke SPB, Bon Toko, Absensi Upah Harian, BKU, BKT, dan BKB.',
    ],
  ];

  const wsGuide = XLSX.utils.aoa_to_sheet(guideRows);
  wsGuide['!cols'] = [{ wch: 6 }, { wch: 32 }, { wch: 75 }];
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Petunjuk_Pengisian');

  const fileName = `Template_Laporan_Mingguan_dan_Bobot_${
    school?.namaSekolah ? school.namaSekolah.replace(/\s+/g, '_') : 'Sekolah'
  }_${new Date().toISOString().slice(0, 10)}.xlsx`;

  XLSX.writeFile(wb, fileName);
}

/**
 * Parse uploaded Weekly Progress Excel file and return updated ProjectProgressWeek[]
 */
export async function parseWeeklyProgressExcelFile(
  file: File,
  currentWeeks: ProjectProgressWeek[]
): Promise<{
  success: boolean;
  data?: ProjectProgressWeek[];
  message: string;
  summary?: {
    weeksCount: number;
    divisionsCount: number;
    totalRealisasiAkhir: number;
    totalBobot: number;
  };
}> {
  try {
    const XLSX = await getXLSX();
    const arrayBuffer = await file.arrayBuffer();
    const wb = XLSX.read(arrayBuffer, { type: 'array' });

    if (!wb.SheetNames || wb.SheetNames.length === 0) {
      return { success: false, message: 'File Excel kosong atau format tidak valid.' };
    }

    // 1. Identify primary matrix sheet
    const matrixSheetName =
      wb.SheetNames.find(
        (s) =>
          s.toLowerCase().includes('matriks') ||
          s.toLowerCase().includes('bobot') ||
          s.toLowerCase().includes('progres') ||
          s.toLowerCase().includes('progress') ||
          s.toLowerCase().includes('mingguan') ||
          s.toLowerCase().includes('rekap')
      ) || wb.SheetNames[0];

    const sheet = wb.Sheets[matrixSheetName];
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 });

    if (!rows || rows.length === 0) {
      return { success: false, message: 'Lembar kerja (sheet) pada file Excel tidak memiliki data.' };
    }

    // Metadata dictionaries per week
    const targetRencanaMap: Record<number, number> = {};
    const periodeMap: Record<number, string> = {};
    const startDateMap: Record<number, string> = {};
    const endDateMap: Record<number, string> = {};
    const keteranganMap: Record<number, string> = {};

    // 2. Check Sheet 2 (Jadwal / Target) if present for metadata
    const scheduleSheetName = wb.SheetNames.find(
      (s) =>
        s.toLowerCase().includes('jadwal') ||
        s.toLowerCase().includes('target') ||
        s.toLowerCase().includes('periode')
    );

    if (scheduleSheetName && wb.Sheets[scheduleSheetName]) {
      const sRows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[scheduleSheetName], { header: 1 });
      for (let r = 1; r < sRows.length; r++) {
        const row = sRows[r];
        if (!row || row.length === 0) continue;
        const wNum = parseInt(String(row[0] || '').replace(/\D/g, ''), 10);
        if (!isNaN(wNum) && wNum > 0) {
          if (row[1]) startDateMap[wNum] = String(row[1]).trim();
          if (row[2]) endDateMap[wNum] = String(row[2]).trim();
          if (row[3]) periodeMap[wNum] = String(row[3]).trim();
          const rVal = parseFloat(row[4]);
          if (!isNaN(rVal)) targetRencanaMap[wNum] = rVal;
          if (row[6]) keteranganMap[wNum] = String(row[6]).trim();
        }
      }
    }

    // 3. Find Table Header in Matrix Sheet
    let headerRowIndex = -1;
    let kodeCol = 0;
    let katCol = 1;
    let uraianCol = 2;
    let bobotCol = 3;
    let weekCols: { colIndex: number; weekNum: number }[] = [];

    for (let r = 0; r < Math.min(30, rows.length); r++) {
      const row = rows[r];
      if (!row || !Array.isArray(row)) continue;

      const hasUraian = row.some((c) => {
        const s = String(c || '').toLowerCase();
        return s.includes('uraian') || s.includes('pekerjaan');
      });
      const hasBobot = row.some((c) => {
        const s = String(c || '').toLowerCase();
        return s.includes('bobot');
      });

      if (hasUraian || hasBobot) {
        headerRowIndex = r;
        row.forEach((cellVal, cIdx) => {
          const str = String(cellVal || '').toLowerCase().trim();
          if (str.includes('kode') || str === 'no' || str === 'no.') kodeCol = cIdx;
          else if (str.includes('kategori')) katCol = cIdx;
          else if (str.includes('uraian') || str.includes('pekerjaan')) uraianCol = cIdx;
          else if (str.includes('bobot')) bobotCol = cIdx;

          // Detect week column (e.g. "Minggu 1 (%)", "M1", "Minggu 1", "W1", "M 1", etc.)
          const matchMinggu =
            str.match(/minggu\s*(\d+)/i) ||
            str.match(/^m\s*(\d+)/i) ||
            str.match(/^w\s*(\d+)/i);
          if (matchMinggu) {
            const wNum = parseInt(matchMinggu[1], 10);
            if (!isNaN(wNum) && wNum > 0 && !weekCols.some((wc) => wc.weekNum === wNum)) {
              weekCols.push({ colIndex: cIdx, weekNum: wNum });
            }
          }
        });
        break;
      }
    }

    // Fallback: If no explicit "Minggu X" header was found, check if columns after bobotCol are numbers (1, 2, 3...)
    if (weekCols.length === 0 && headerRowIndex >= 0) {
      const headerRow = rows[headerRowIndex];
      headerRow.forEach((cellVal, cIdx) => {
        if (cIdx > bobotCol) {
          const num = parseInt(String(cellVal).trim(), 10);
          if (!isNaN(num) && num > 0 && num <= 52 && !weekCols.some((wc) => wc.weekNum === num)) {
            weekCols.push({ colIndex: cIdx, weekNum: num });
          }
        }
      });
    }

    // 4. Scan metadata rows in Matrix Sheet (Target, Periode, Tanggal)
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (!row || !Array.isArray(row)) continue;
      const combinedRowLead = row
        .slice(0, 5)
        .map((c) => String(c || '').toUpperCase())
        .join(' ');

      if (combinedRowLead.includes('TARGET') && combinedRowLead.includes('RENCANA')) {
        weekCols.forEach(({ colIndex, weekNum }) => {
          const val = parseFloat(row[colIndex]);
          if (!isNaN(val)) targetRencanaMap[weekNum] = val;
        });
      } else if (combinedRowLead.includes('PERIODE')) {
        weekCols.forEach(({ colIndex, weekNum }) => {
          const val = String(row[colIndex] || '').trim();
          if (val) periodeMap[weekNum] = val;
        });
      } else if (combinedRowLead.includes('START') || combinedRowLead.includes('TANGGAL MULAI')) {
        weekCols.forEach(({ colIndex, weekNum }) => {
          const val = String(row[colIndex] || '').trim();
          if (val) startDateMap[weekNum] = val;
        });
      } else if (combinedRowLead.includes('END') || combinedRowLead.includes('TANGGAL SELESAI')) {
        weekCols.forEach(({ colIndex, weekNum }) => {
          const val = String(row[colIndex] || '').trim();
          if (val) endDateMap[weekNum] = val;
        });
      }
    }

    // Sort week columns by week number
    weekCols.sort((a, b) => a.weekNum - b.weekNum);

    // 5. Parse Division Items
    interface ParsedDivision {
      id?: string;
      kode: string;
      kategori: 'FISIK' | 'MANAJEMEN';
      uraian: string;
      bobotTotal: number;
      weeklyPrestasi: Record<number, number>;
    }

    const parsedDivisions: ParsedDivision[] = [];

    if (headerRowIndex >= 0 && weekCols.length > 0) {
      for (let r = headerRowIndex + 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || !Array.isArray(row) || row.length === 0) continue;

        const uraianRaw = row[uraianCol] !== undefined ? String(row[uraianCol]).trim() : '';
        if (!uraianRaw) continue;

        const uraianUpper = uraianRaw.toUpperCase();

        // Skip non-item summary/header rows
        if (
          uraianUpper.startsWith('TOTAL') ||
          uraianUpper.startsWith('JUMLAH') ||
          uraianUpper.startsWith('TARGET') ||
          uraianUpper.startsWith('DEVIASI') ||
          uraianUpper.startsWith('PETUNJUK') ||
          uraianUpper.startsWith('KETERANGAN')
        ) {
          continue;
        }

        const kodeRaw = row[kodeCol] !== undefined ? String(row[kodeCol]).trim() : '';
        const katRaw = row[katCol] !== undefined ? String(row[katCol]).toUpperCase().trim() : '';
        const isManajemen =
          katRaw.includes('MANAJEMEN') ||
          katRaw.includes('ADM') ||
          uraianUpper.includes('BIAYA PERENCANAAN') ||
          uraianUpper.includes('BIAYA PENGAWASAN') ||
          uraianUpper.includes('BIAYA PENGELOLAAN');

        const kategori: 'FISIK' | 'MANAJEMEN' = isManajemen ? 'MANAJEMEN' : 'FISIK';
        const bobotVal = parseFloat(row[bobotCol]) || 0;
        const weeklyPrestasi: Record<number, number> = {};

        weekCols.forEach(({ colIndex, weekNum }) => {
          const cellVal = row[colIndex];
          const numVal = parseFloat(cellVal);
          weeklyPrestasi[weekNum] = !isNaN(numVal) ? Math.max(0, numVal) : 0;
        });

        parsedDivisions.push({
          kode: kodeRaw,
          kategori,
          uraian: uraianUpper,
          bobotTotal: Math.max(0, Math.round(bobotVal * 1000) / 1000),
          weeklyPrestasi,
        });
      }
    }

    // If no division matrix rows were detected, check if there is an alternative flat weekly schedule
    if (parsedDivisions.length === 0) {
      // Check if Sheet 1 or Sheet 2 has columns like [Minggu, Realisasi, Target]
      const targetSheet = sheet;
      const flatRows = XLSX.utils.sheet_to_json<any[]>(targetSheet, { header: 1 });
      const weeklyProgressMap: Record<number, { realisasi: number; rencana?: number; periode?: string }> = {};

      for (let r = 1; r < flatRows.length; r++) {
        const row = flatRows[r];
        if (!row || row.length === 0) continue;
        const wNum = parseInt(String(row[0] || '').replace(/\D/g, ''), 10);
        if (!isNaN(wNum) && wNum > 0) {
          const col1Num = parseFloat(row[1]);
          const col2Num = parseFloat(row[2]);
          const col4Num = parseFloat(row[4]);
          const col5Num = parseFloat(row[5]);

          const realisasiVal = !isNaN(col5Num) ? col5Num : !isNaN(col1Num) ? col1Num : 0;
          const rencanaVal = !isNaN(col4Num) ? col4Num : !isNaN(col2Num) ? col2Num : undefined;

          weeklyProgressMap[wNum] = {
            realisasi: realisasiVal,
            rencana: rencanaVal,
            periode: row[3] ? String(row[3]).trim() : undefined,
          };
        }
      }

      if (Object.keys(weeklyProgressMap).length > 0) {
        const updatedFromFlat = currentWeeks.map((w) => {
          const parsed = weeklyProgressMap[w.mingguKe];
          if (parsed) {
            return {
              ...w,
              bobotRealisasi: parsed.realisasi,
              bobotRencana: parsed.rencana !== undefined ? parsed.rencana : w.bobotRencana,
              periode: parsed.periode || w.periode,
              deviasi:
                Math.round(
                  (parsed.realisasi - (parsed.rencana !== undefined ? parsed.rencana : w.bobotRencana)) * 1000
                ) / 1000,
            };
          }
          return w;
        });

        return {
          success: true,
          data: updatedFromFlat,
          message: 'Berhasil mengimpor ringkasan bobot mingguan dari Excel.',
          summary: {
            weeksCount: updatedFromFlat.length,
            divisionsCount: 0,
            totalRealisasiAkhir: updatedFromFlat[updatedFromFlat.length - 1]?.bobotRealisasi || 0,
            totalBobot: 100,
          },
        };
      }

      return {
        success: false,
        message:
          'Format kolom Excel tidak dikenali. Pastikan file memiliki kolom Uraian Pekerjaan, Bobot Total (%), dan kolom Minggu 1 s/d Minggu N, atau gunakan tombol "Download Template Excel" terlebih dahulu.',
      };
    }

    // 6. Build updated ProjectProgressWeek array
    const maxWeekNum = Math.max(
      ...weekCols.map((w) => w.weekNum),
      currentWeeks.length,
      parsedDivisions.length > 0 ? 1 : 0
    );

    const baseTemplateDivisions = renumberDivisions(
      parsedDivisions.map((pd, idx) => ({
        id: `div-imp-${Date.now()}-${idx}`,
        kode: pd.kode,
        kategori: pd.kategori,
        uraian: pd.uraian,
        bobotTotal: pd.bobotTotal,
        prestasiMingguLalu: 0,
        prestasiMingguIni: 0,
        prestasiSdMingguIni: 0,
        materialRef: [pd.uraian],
      }))
    );

    const builtWeeks: ProjectProgressWeek[] = [];

    for (let w = 1; w <= maxWeekNum; w++) {
      const existingWeek = currentWeeks.find((cw) => cw.mingguKe === w);

      // Construct divisions for this week
      const weekDivisions: DivisionProgressItem[] = baseTemplateDivisions.map((baseD, dIdx) => {
        const parsedD = parsedDivisions[dIdx];
        const thisWeekPrestasiIni = parsedD?.weeklyPrestasi[w] ?? 0;

        return {
          ...baseD,
          prestasiMingguLalu: 0, // will be cascaded by recalculateAllWeeksProgress
          prestasiMingguIni: thisWeekPrestasiIni,
          prestasiSdMingguIni: 0,
        };
      });

      const sDate = startDateMap[w] || existingWeek?.startDate;
      const eDate = endDateMap[w] || existingWeek?.endDate;
      let peri = periodeMap[w] || existingWeek?.periode;

      if (!peri && sDate && eDate) {
        peri = formatWeekPeriodString(sDate, eDate);
      } else if (!peri) {
        peri = `Minggu ${w}`;
      }

      const rencana =
        targetRencanaMap[w] !== undefined
          ? targetRencanaMap[w]
          : existingWeek?.bobotRencana !== undefined
          ? existingWeek.bobotRencana
          : Math.min(100, Math.round(((w / maxWeekNum) * 100 * 100) / 100));

      const ket =
        keteranganMap[w] ||
        existingWeek?.keterangan ||
        `Pelaksanaan pekerjaan fisik dan administrasi minggu ke-${w}`;

      builtWeeks.push({
        mingguKe: w,
        periode: peri,
        startDate: sDate,
        endDate: eDate,
        bobotRencana: rencana,
        bobotRealisasi: 0, // will be computed in recalculateAllWeeksProgress
        deviasi: 0,
        keterangan: ket,
        itemPekerjaan: existingWeek?.itemPekerjaan || [],
        rencanaWaktuHK: existingWeek?.rencanaWaktuHK || maxWeekNum * 7,
        rencanaWaktuMinggu: existingWeek?.rencanaWaktuMinggu || maxWeekNum,
        waktuTerlaksanaHK: existingWeek?.waktuTerlaksanaHK || w * 7,
        waktuTerlaksanaMinggu: existingWeek?.waktuTerlaksanaMinggu || w,
        sisaWaktuHK: Math.max(0, (existingWeek?.rencanaWaktuHK || maxWeekNum * 7) - w * 7),
        sisaWaktuMinggu: Math.max(0, (existingWeek?.rencanaWaktuMinggu || maxWeekNum) - w),
        divisions: weekDivisions,
        photos: existingWeek?.photos || [],
      });
    }

    // 7. Cascade and recalculate progress for all weeks
    const finalRecalculatedWeeks = recalculateAllWeeksProgress(builtWeeks);

    const totalBobotSum = Math.round(baseTemplateDivisions.reduce((s, d) => s + d.bobotTotal, 0) * 1000) / 1000;
    const finalWeek = finalRecalculatedWeeks[finalRecalculatedWeeks.length - 1];

    return {
      success: true,
      data: finalRecalculatedWeeks,
      message: `File Excel berhasil diproses! Sebanyak ${finalRecalculatedWeeks.length} minggu dan ${baseTemplateDivisions.length} uraian pekerjaan berhasil dimuat.`,
      summary: {
        weeksCount: finalRecalculatedWeeks.length,
        divisionsCount: baseTemplateDivisions.length,
        totalRealisasiAkhir: finalWeek?.bobotRealisasi || 0,
        totalBobot: totalBobotSum,
      },
    };
  } catch (err: any) {
    console.error('Error parsing weekly progress Excel file:', err);
    return {
      success: false,
      message: `Gagal membaca file Excel: ${err?.message || 'Format tidak valid'}`,
    };
  }
}

