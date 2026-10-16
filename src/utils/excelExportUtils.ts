import * as XLSX from 'xlsx';
import {
  SchoolMasterData,
  BkuTransaction,
  BktTransaction,
  BkbTransaction,
  KwitansiDocument,
  TaxRecord,
  RpdItem,
  ProjectProgressWeek,
} from '../types';

/**
 * Format angka rupiah untuk tampilan Excel
 */
export function formatRupiahNumber(val: number | undefined | null): number {
  if (!val || isNaN(val)) return 0;
  return Math.round(val);
}

/**
 * Trigger download file blob di browser
 */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 1. Ekspor BKU (Buku Kas Umum) ke file Excel (.xlsx)
 */
export function exportBkuToExcel(
  bkuList: BkuTransaction[],
  school: SchoolMasterData,
  filterLabel = 'Semua Periode'
): void {
  const wb = XLSX.utils.book_new();

  // Header informasi sekolah
  const headerRows = [
    ['BUKU KAS UMUM (BKU)'],
    [`PROGRAM BANTUAN REVITALISASI SATUAN PENDIDIKAN TAHUN ${school.tahunAnggaran || '2026'}`],
    [`SEKOLAH: ${school.namaSekolah} (NPSN: ${school.npsn})`],
    [`KABUPATEN/KOTA: ${school.kabKota || '-'} | PERIODE: ${filterLabel}`],
    [], // Baris kosong
    [
      'No',
      'Tanggal',
      'No Bukti / Referensi',
      'Uraian Transaksi',
      'Penerimaan (Rp)',
      'Pengeluaran (Rp)',
      'Saldo Kumulatif (Rp)',
      'Kategori Biaya',
      'Metode Bayar',
    ],
  ];

  let runningSaldo = 0;
  const dataRows = (bkuList || []).map((tx, idx) => {
    const masuk = tx.penerimaan || 0;
    const keluar = tx.pengeluaran || 0;
    runningSaldo += masuk - keluar;

    return [
      idx + 1,
      tx.tanggal || '-',
      tx.noBukti || '-',
      tx.uraian || '-',
      masuk,
      keluar,
      tx.saldo !== undefined ? tx.saldo : runningSaldo,
      tx.kategoriBiaya || '-',
      tx.metodeBayar || 'TUNAI',
    ];
  });

  const totalMasuk = (bkuList || []).reduce((s, t) => s + (t.penerimaan || 0), 0);
  const totalKeluar = (bkuList || []).reduce((s, t) => s + (t.pengeluaran || 0), 0);

  const footerRows = [
    [],
    ['', '', '', 'TOTAL KUMULATIF', totalMasuk, totalKeluar, totalMasuk - totalKeluar, '', ''],
    [],
    ['', '', 'Mengetahui,', '', '', '', 'Disusun oleh,', '', ''],
    ['', '', 'Kepala Sekolah', '', '', '', 'Bendahara P2SP', '', ''],
    [],
    [],
    ['', '', school.namaKepalaSekolah, '', '', '', school.namaBendahara, '', ''],
    ['', '', `NIP. ${school.nipKepalaSekolah || '-'}`, '', '', '', `NIP. ${school.nipBendahara || '-'}`, '', ''],
  ];

  const allRows = [...headerRows, ...dataRows, ...footerRows];
  const ws = XLSX.utils.aoa_to_sheet(allRows);

  // Atur lebar kolom
  ws['!cols'] = [
    { wch: 6 },  // No
    { wch: 14 }, // Tanggal
    { wch: 22 }, // No Bukti
    { wch: 55 }, // Uraian
    { wch: 18 }, // Penerimaan
    { wch: 18 }, // Pengeluaran
    { wch: 20 }, // Saldo
    { wch: 16 }, // Kategori
    { wch: 12 }, // Metode
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'BKU');

  const filename = `BKU_${school.npsn || 'Sekolah'}_${school.namaSekolah.replace(/\s+/g, '_')}_TA${school.tahunAnggaran || '2026'}.xlsx`;
  XLSX.writeFile(wb, filename);
}

/**
 * 2. Ekspor Seluruh Kwitansi, Bon Toko & SPB ke Excel (.xlsx)
 */
export function exportKwitansiToExcel(
  kwitansiList: KwitansiDocument[],
  school: SchoolMasterData
): void {
  const wb = XLSX.utils.book_new();

  const headerRows = [
    ['DAFTAR KWITANSI, BUKTI BON PEMBELIAN & SPB'],
    [`REVITALISASI ${school.namaSekolah} - TAHUN ANGGARAN ${school.tahunAnggaran || '2026'}`],
    [],
    [
      'No',
      'No Bukti Kwitansi',
      'No SPB',
      'Tanggal',
      'Bulan',
      'Tipe Pengeluaran',
      'Toko / Rekanan / Penerima',
      'Uraian Pembayaran',
      'Nominal Bruto (Rp)',
      'PPN 11% (Rp)',
      'PPh 22 (Rp)',
      'PPh 23 (Rp)',
      'Jumlah Rincian Barang',
      'Rincian Barang & Satuan',
      'Status Proteksi',
    ],
  ];

  const dataRows = (kwitansiList || []).map((k, idx) => {
    const itemNames = (k.items || [])
      .map((i) => `${i.namaBarang} (${i.volume} ${i.satuan})`)
      .join('; ');

    const isLocked = Boolean(k.isLocked || k.isManual || (k.id || '').includes('manual'));

    return [
      idx + 1,
      k.noBukti || '-',
      k.noSpb || '-',
      k.tanggal || '-',
      k.bulan || '-',
      k.tipe || '-',
      k.namaToko || k.penerimaNama || '-',
      k.uraian || '-',
      k.nominal || 0,
      k.ppnAmount || 0,
      k.pph22Amount || 0,
      k.pph23Amount || 0,
      (k.items || []).length,
      itemNames || '-',
      isLocked ? 'MANUAL TERKUNCI' : 'OTOMATIS GENERATE',
    ];
  });

  const totalNominal = (kwitansiList || []).reduce((s, k) => s + (k.nominal || 0), 0);
  const totalPpn = (kwitansiList || []).reduce((s, k) => s + (k.ppnAmount || 0), 0);
  const totalPph22 = (kwitansiList || []).reduce((s, k) => s + (k.pph22Amount || 0), 0);
  const totalPph23 = (kwitansiList || []).reduce((s, k) => s + (k.pph23Amount || 0), 0);

  const footerRows = [
    [],
    ['', '', '', '', '', '', '', 'TOTAL PENGELUARAN', totalNominal, totalPpn, totalPph22, totalPph23, '', '', ''],
  ];

  const allRows = [...headerRows, ...dataRows, ...footerRows];
  const ws = XLSX.utils.aoa_to_sheet(allRows);

  ws['!cols'] = [
    { wch: 6 },  // No
    { wch: 20 }, // No Bukti
    { wch: 20 }, // No SPB
    { wch: 14 }, // Tanggal
    { wch: 16 }, // Bulan
    { wch: 15 }, // Tipe
    { wch: 30 }, // Toko / Penerima
    { wch: 50 }, // Uraian
    { wch: 18 }, // Nominal
    { wch: 15 }, // PPN
    { wch: 15 }, // PPh 22
    { wch: 15 }, // PPh 23
    { wch: 10 }, // Jml Item
    { wch: 60 }, // Rincian
    { wch: 18 }, // Status
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Kwitansi & Bon');

  const filename = `Kwitansi_${school.npsn || 'Sekolah'}_${school.namaSekolah.replace(/\s+/g, '_')}_TA${school.tahunAnggaran || '2026'}.xlsx`;
  XLSX.writeFile(wb, filename);
}

/**
 * 3. Ekspor Rekapitulasi Pajak (PPN, PPh 22, PPh 23) ke Excel (.xlsx)
 */
export function exportPajakToExcel(
  taxRecords: TaxRecord[],
  school: SchoolMasterData
): void {
  const wb = XLSX.utils.book_new();

  const headerRows = [
    ['BUKU PEMBANTU PAJAK'],
    [`REVITALISASI ${school.namaSekolah} - TAHUN ANGGARAN ${school.tahunAnggaran || '2026'}`],
    [],
    [
      'No',
      'Tanggal Pemotongan',
      'No Bukti Potong / Kwitansi',
      'Uraian Transaksi Belanja',
      'Dasar Pengenaan Pajak / Bruto (Rp)',
      'PPN 11% (Rp)',
      'PPh Pasal 22 (Rp)',
      'PPh Pasal 23 (Rp)',
      'PPh Pasal 21 (Rp)',
      'Total Pajak Terutang (Rp)',
      'Tanggal Setor Bank/Pos',
      'Nomor NTPN / Kode Billing',
      'Status Setor',
    ],
  ];

  const dataRows = (taxRecords || []).map((t, idx) => {
    const dpp = (t.nominalKonstruksi || 0) + (t.nominalPerabot || 0) + (t.nominalPeralatan || 0) + (t.nominalKonsultanAdm || 0);
    const totalPajak = (t.ppn11 || 0) + (t.pph22 || 0) + (t.pph23 || 0);
    const isLunas = t.statusSetor === 'LUNAS' || Boolean(t.ntpn);
    return [
      idx + 1,
      t.tanggal || '-',
      t.noBukti || '-',
      t.keperluan || '-',
      dpp,
      t.ppn11 || 0,
      t.pph22 || 0,
      t.pph23 || 0,
      0, // PPh 21
      totalPajak,
      t.tanggalSetor || t.tanggal || '-',
      t.ntpn || (isLunas ? 'SUDAH DISETOR' : 'BELUM SETOR'),
      isLunas ? 'LUNAS DISETOR' : 'TERUTANG',
    ];
  });

  const totalBruto = (taxRecords || []).reduce((s, t) => s + ((t.nominalKonstruksi || 0) + (t.nominalPerabot || 0) + (t.nominalPeralatan || 0) + (t.nominalKonsultanAdm || 0)), 0);
  const totalPpn = (taxRecords || []).reduce((s, t) => s + (t.ppn11 || 0), 0);
  const totalPph22 = (taxRecords || []).reduce((s, t) => s + (t.pph22 || 0), 0);
  const totalPph23 = (taxRecords || []).reduce((s, t) => s + (t.pph23 || 0), 0);
  const grandTotalPajak = totalPpn + totalPph22 + totalPph23;

  const footerRows = [
    [],
    ['', '', '', 'TOTAL PAJAK', totalBruto, totalPpn, totalPph22, totalPph23, 0, grandTotalPajak, '', '', ''],
  ];

  const allRows = [...headerRows, ...dataRows, ...footerRows];
  const ws = XLSX.utils.aoa_to_sheet(allRows);

  ws['!cols'] = [
    { wch: 6 },  // No
    { wch: 14 }, // Tgl
    { wch: 20 }, // No Bukti
    { wch: 45 }, // Uraian
    { wch: 18 }, // DPP
    { wch: 15 }, // PPN
    { wch: 15 }, // PPh 22
    { wch: 15 }, // PPh 23
    { wch: 15 }, // PPh 21
    { wch: 18 }, // Total Pajak
    { wch: 14 }, // Tgl Setor
    { wch: 22 }, // NTPN
    { wch: 15 }, // Status
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Buku Pajak');

  const filename = `Pajak_${school.npsn || 'Sekolah'}_${school.namaSekolah.replace(/\s+/g, '_')}_TA${school.tahunAnggaran || '2026'}.xlsx`;
  XLSX.writeFile(wb, filename);
}

/**
 * 4. Ekspor BUNDEL LPJ LENGKAP (Multi-Sheet Excel Workbook)
 * Berisi seluruh tabel: BKU, BKT, BKB, Kwitansi, Pajak, RPD, Progres Fisik
 */
export function exportComprehensiveLpjExcel(appState: any): void {
  const school = appState.school as SchoolMasterData;
  const wb = XLSX.utils.book_new();

  // SHEET 1: PROFIL & ANGGARAN
  const profilRows = [
    ['LAPORAN PERTANGGUNGJAWABAN (LPJ) KEUANGAN & FISIK'],
    [`PROGRAM BANTUAN REVITALISASI SATUAN PENDIDIKAN TAHUN ${school.tahunAnggaran || '2026'}`],
    [],
    ['DATA IDENTITAS SEKOLAH & PANITIA P2SP'],
    ['Nama Sekolah', school.namaSekolah],
    ['NPSN', school.npsn],
    ['Alamat', school.alamat],
    ['Desa / Kelurahan', school.desa || '-'],
    ['Kecamatan', school.kecamatan || '-'],
    ['Kabupaten / Kota', school.kabKota || '-'],
    ['Provinsi', school.provinsi || '-'],
    [],
    ['ALOKASI ANGGARAN BANTUAN PEMERINTAH'],
    ['Total Pagu Anggaran', school.totalAnggaran || 0],
    ['Termin 1 (70%)', school.termin1Nilai || Math.round((school.totalAnggaran || 0) * 0.7)],
    ['Termin 2 (30%)', school.termin2Nilai || Math.round((school.totalAnggaran || 0) * 0.3)],
    ['Nama Bank Penyalur', school.namaBank || '-'],
    ['Nomor Rekening', school.nomorRekening || '-'],
    ['Atas Nama Rekening', school.namaRekening || '-'],
    [],
    ['STRUKTUR PANITIA P2SP'],
    ['Kepala Sekolah', school.namaKepalaSekolah, `NIP. ${school.nipKepalaSekolah || '-'}`],
    ['Ketua P2SP', school.namaKetuaP2SP, `NIP. ${school.nipKetuaP2SP || '-'}`],
    ['Sekretaris P2SP', school.namaSekretaris || '-', `NIP. ${school.nipSekretaris || '-'}`],
    ['Bendahara P2SP', school.namaBendahara, `NIP. ${school.nipBendahara || '-'}`],
    ['Perencana Teknis', school.namaPerencana, `NIP. ${school.nipPerencana || '-'}`],
    ['Pengawas Teknis', school.namaPengawas, `NIP. ${school.nipPengawas || '-'}`],
    ['Pelaksana Lapangan', school.namaPelaksana || '-', `NIP. ${school.nipPelaksana || '-'}`],
  ];
  const wsProfil = XLSX.utils.aoa_to_sheet(profilRows);
  wsProfil['!cols'] = [{ wch: 25 }, { wch: 45 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, wsProfil, 'Profil & Pagu');

  // SHEET 2: BKU
  const bkuList = (appState.bkuTransactions || []) as BkuTransaction[];
  let runSaldo = 0;
  const bkuRows = [
    ['BUKU KAS UMUM (BKU)'],
    [`Revitalisasi ${school.namaSekolah} - Tahun Anggaran ${school.tahunAnggaran || '2026'}`],
    [],
    ['No', 'Tanggal', 'No Bukti', 'Uraian Transaksi', 'Penerimaan (Rp)', 'Pengeluaran (Rp)', 'Saldo (Rp)', 'Kategori', 'Metode'],
    ...bkuList.map((tx, idx) => {
      const masuk = tx.penerimaan || 0;
      const keluar = tx.pengeluaran || 0;
      runSaldo += masuk - keluar;
      return [
        idx + 1,
        tx.tanggal,
        tx.noBukti,
        tx.uraian,
        masuk,
        keluar,
        tx.saldo !== undefined ? tx.saldo : runSaldo,
        tx.kategoriBiaya || '-',
        tx.metodeBayar || 'TUNAI',
      ];
    }),
  ];
  const wsBku = XLSX.utils.aoa_to_sheet(bkuRows);
  wsBku['!cols'] = [{ wch: 6 }, { wch: 14 }, { wch: 20 }, { wch: 50 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 15 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsBku, 'BKU');

  // SHEET 3: BKT (Buku Kas Tunai)
  const bktList = (appState.bktTransactions || []) as BktTransaction[];
  let runBkt = 0;
  const bktRows = [
    ['BUKU KAS TUNAI (BKT)'],
    [`Revitalisasi ${school.namaSekolah} - Tahun Anggaran ${school.tahunAnggaran || '2026'}`],
    [],
    ['No', 'Tanggal', 'No Bukti', 'Uraian Transaksi', 'Penerimaan Tunai (Rp)', 'Pengeluaran Tunai (Rp)', 'Saldo Tunai (Rp)'],
    ...bktList.map((tx, idx) => {
      const m = tx.pemasukan || 0;
      const k = tx.pengeluaran || 0;
      runBkt += m - k;
      return [idx + 1, tx.tanggal, tx.noBukti, tx.uraian, m, k, tx.saldo !== undefined ? tx.saldo : runBkt];
    }),
  ];
  const wsBkt = XLSX.utils.aoa_to_sheet(bktRows);
  wsBkt['!cols'] = [{ wch: 6 }, { wch: 14 }, { wch: 20 }, { wch: 50 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsBkt, 'BKT (Tunai)');

  // SHEET 4: BKB (Buku Kas Bank)
  const bkbList = (appState.bkbRecords || []) as BkbTransaction[];
  let runBkb = 0;
  const bkbRows = [
    ['BUKU KAS PEMBANTU BANK (BKB)'],
    [`Revitalisasi ${school.namaSekolah} - Tahun Anggaran ${school.tahunAnggaran || '2026'}`],
    [],
    ['No', 'Tanggal', 'No Bukti', 'Uraian Transaksi Bank', 'Setoran Masuk (Rp)', 'Penarikan / Pajak (Rp)', 'Saldo Bank (Rp)'],
    ...bkbList.map((tx, idx) => {
      const m = tx.penerimaan || 0;
      const k = tx.pengeluaran || 0;
      runBkb += m - k;
      return [idx + 1, tx.tanggal, tx.noBukti, tx.uraian, m, k, tx.saldo !== undefined ? tx.saldo : runBkb];
    }),
  ];
  const wsBkb = XLSX.utils.aoa_to_sheet(bkbRows);
  wsBkb['!cols'] = [{ wch: 6 }, { wch: 14 }, { wch: 20 }, { wch: 50 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsBkb, 'BKB (Bank)');

  // SHEET 5: KWITANSI
  const kwList = (appState.kwitansiList || []) as KwitansiDocument[];
  const kwRows = [
    ['DAFTAR KWITANSI & BON PEMBELIAN'],
    [`Revitalisasi ${school.namaSekolah} - Tahun Anggaran ${school.tahunAnggaran || '2026'}`],
    [],
    ['No', 'No Bukti', 'No SPB', 'Tanggal', 'Toko / Rekanan', 'Uraian Belanja', 'Nominal (Rp)', 'PPN (Rp)', 'PPh 22 (Rp)', 'PPh 23 (Rp)', 'Status Kunci'],
    ...kwList.map((k, idx) => [
      idx + 1,
      k.noBukti,
      k.noSpb || '-',
      k.tanggal,
      k.namaToko || k.penerimaNama,
      k.uraian,
      k.nominal || 0,
      k.ppnAmount || 0,
      k.pph22Amount || 0,
      k.pph23Amount || 0,
      k.isLocked || k.isManual ? 'MANUAL TERKUNCI' : 'AUTO-GENERATE',
    ]),
  ];
  const wsKw = XLSX.utils.aoa_to_sheet(kwRows);
  wsKw['!cols'] = [{ wch: 6 }, { wch: 20 }, { wch: 20 }, { wch: 14 }, { wch: 28 }, { wch: 50 }, { wch: 18 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsKw, 'Daftar Kwitansi');

  // SHEET 6: PAJAK
  const taxList = (appState.taxRecords || []) as TaxRecord[];
  const taxRows = [
    ['REKAPITULASI PEMOTONGAN & PENYETORAN PAJAK'],
    [`Revitalisasi ${school.namaSekolah} - Tahun Anggaran ${school.tahunAnggaran || '2026'}`],
    [],
    ['No', 'Tanggal', 'No Bukti', 'Uraian Belanja', 'DPP (Rp)', 'PPN 11% (Rp)', 'PPh 22 (Rp)', 'PPh 23 (Rp)', 'Total Pajak (Rp)', 'NTPN / Status'],
    ...taxList.map((t, idx) => {
      const dpp = (t.nominalKonstruksi || 0) + (t.nominalPerabot || 0) + (t.nominalPeralatan || 0) + (t.nominalKonsultanAdm || 0);
      const tot = (t.ppn11 || 0) + (t.pph22 || 0) + (t.pph23 || 0);
      const isLunas = t.statusSetor === 'LUNAS' || Boolean(t.ntpn);
      return [
        idx + 1,
        t.tanggal,
        t.noBukti,
        t.keperluan || '-',
        dpp,
        t.ppn11 || 0,
        t.pph22 || 0,
        t.pph23 || 0,
        tot,
        t.ntpn || (isLunas ? 'SUDAH SETOR' : 'TERUTANG'),
      ];
    }),
  ];
  const wsTax = XLSX.utils.aoa_to_sheet(taxRows);
  wsTax['!cols'] = [{ wch: 6 }, { wch: 14 }, { wch: 20 }, { wch: 45 }, { wch: 18 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsTax, 'Pajak');

  // SHEET 7: RPD
  const rpdList = (appState.rpdItems || []) as RpdItem[];
  const rpdRows = [
    ['RENCANA PENGGUNAAN DANA (RPD 100%)'],
    [`Revitalisasi ${school.namaSekolah} - Tahun Anggaran ${school.tahunAnggaran || '2026'}`],
    [],
    ['No', 'Kategori', 'Uraian Pekerjaan / Bahan', 'Volume 100%', 'Satuan', 'Harga Satuan (Rp)', 'Termin 1 (70%)', 'Termin 2 (30%)', 'Jumlah Anggaran (Rp)'],
    ...rpdList.map((r, idx) => [
      idx + 1,
      r.kategori,
      r.uraian,
      r.volume100,
      r.satuan,
      r.hargaSatuan,
      r.jumlahTermin1,
      r.jumlahTermin2,
      r.jumlahAnggaran,
    ]),
  ];
  const wsRpd = XLSX.utils.aoa_to_sheet(rpdRows);
  wsRpd['!cols'] = [{ wch: 6 }, { wch: 16 }, { wch: 40 }, { wch: 12 }, { wch: 10 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, wsRpd, 'RPD');

  // SHEET 8: PROGRES FISIK
  const progList = (appState.progressWeeks || []) as ProjectProgressWeek[];
  const progRows = [
    ['REKAPITULASI LAPORAN KEMAJUAN FISIK MINGGUAN'],
    [`Revitalisasi ${school.namaSekolah} - Tahun Anggaran ${school.tahunAnggaran || '2026'}`],
    [],
    ['Minggu Ke', 'Periode Kalender', 'Rencana Kumulatif (%)', 'Realisasi Kumulatif (%)', 'Deviasi (%)', 'Keterangan Evaluasi Lapangan'],
    ...progList.map((p) => {
      const dev = (p.bobotRealisasi || 0) - (p.bobotRencana || 0);
      return [
        `Minggu ${p.mingguKe}`,
        p.periode,
        p.bobotRencana || 0,
        p.bobotRealisasi || 0,
        Math.round(dev * 100) / 100,
        p.keterangan || (dev >= 0 ? 'Kemajuan fisik sesuai/melebihi target rencana' : 'Deviasi minus, perlu percepatan tenaga kerja'),
      ];
    }),
  ];
  const wsProg = XLSX.utils.aoa_to_sheet(progRows);
  wsProg['!cols'] = [{ wch: 12 }, { wch: 24 }, { wch: 22 }, { wch: 22 }, { wch: 15 }, { wch: 45 }];
  XLSX.utils.book_append_sheet(wb, wsProg, 'Kemajuan Fisik');

  const filename = `BUNDEL_LPJ_LENGKAP_${school.npsn || 'Sekolah'}_${school.namaSekolah.replace(/\s+/g, '_')}_TA${school.tahunAnggaran || '2026'}.xlsx`;
  XLSX.writeFile(wb, filename);
}

/**
 * 5. Ekspor BKU ke file CSV (Kompatibel Excel Indonesia dengan UTF-8 BOM)
 */
export function exportBkuToCsv(
  bkuList: BkuTransaction[],
  school: SchoolMasterData
): void {
  const delimiter = ';'; // Semicolon untuk Excel versi regional Indonesia
  const rows: string[] = [];

  // BOM UTF-8 agar Excel membuka karakter dengan benar
  rows.push('\uFEFF"BUKU KAS UMUM (BKU)"');
  rows.push(`"REVITALISASI ${school.namaSekolah} - TA ${school.tahunAnggaran || '2026'}"`);
  rows.push('');
  rows.push(
    [
      '"No"',
      '"Tanggal"',
      '"No Bukti"',
      '"Uraian Transaksi"',
      '"Penerimaan (Rp)"',
      '"Pengeluaran (Rp)"',
      '"Saldo (Rp)"',
      '"Kategori"',
      '"Metode Bayar"',
    ].join(delimiter)
  );

  let saldo = 0;
  (bkuList || []).forEach((t, i) => {
    const masuk = t.penerimaan || 0;
    const keluar = t.pengeluaran || 0;
    saldo += masuk - keluar;
    rows.push(
      [
        i + 1,
        `"${t.tanggal || ''}"`,
        `"${t.noBukti || ''}"`,
        `"${(t.uraian || '').replace(/"/g, '""')}"`,
        masuk,
        keluar,
        t.saldo !== undefined ? t.saldo : saldo,
        `"${t.kategoriBiaya || ''}"`,
        `"${t.metodeBayar || 'TUNAI'}"`,
      ].join(delimiter)
    );
  });

  const csvContent = rows.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const filename = `BKU_${school.npsn || 'Sekolah'}_${school.namaSekolah.replace(/\s+/g, '_')}.csv`;
  downloadBlob(blob, filename);
}
