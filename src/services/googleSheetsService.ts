import {
  AppStateData,
  SchoolMasterData,
  BkuTransaction,
  BktTransaction,
  BkbTransaction,
  KwitansiDocument,
  TaxRecord,
  RpdItem,
  ProjectProgressWeek,
  StoreVendor,
  WorkerItem,
} from '../types';
import { sanitizeAndFilterDemoState } from './storageService';
import { formatRupiah } from '../utils/formatters';

export interface DriveSpreadsheetFile {
  id: string;
  name: string;
  webViewLink?: string;
  modifiedTime?: string;
}

const CHUNK_SIZE = 30000; // Safe size under Google Sheets 50,000 char per cell limit

/**
 * Search user's Google Drive for existing LPJ Revit spreadsheets
 */
export async function searchSpreadsheetsInDrive(accessToken: string): Promise<DriveSpreadsheetFile[]> {
  const query = encodeURIComponent("name contains '[LPJ REVIT]' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false");
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,webViewLink,modifiedTime)&orderBy=modifiedTime desc&pageSize=30`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('Error listing files from Google Drive:', errorText);
    throw new Error(`Gagal mencari file Google Sheets: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return data.files || [];
}

/**
 * Create a new structured Google Spreadsheet in user's Google Drive
 */
export async function createSpreadsheetInDrive(
  accessToken: string,
  school: SchoolMasterData
): Promise<DriveSpreadsheetFile> {
  const schoolTitle = school.namaSekolah ? school.namaSekolah.trim() : 'Sekolah';
  const npsn = school.npsn ? school.npsn.trim() : 'NPSN';
  const title = `[LPJ REVIT] - ${schoolTitle} (NPSN: ${npsn})`;

  const payload = {
    properties: {
      title,
    },
    sheets: [
      { properties: { title: '_DATABASE_SNAPSHOT' } },
      { properties: { title: 'DATA_SEKOLAH' } },
      { properties: { title: 'BKU_KAS_UMUM' } },
      { properties: { title: 'BKT_KAS_TUNAI' } },
      { properties: { title: 'BKB_KAS_BANK' } },
      { properties: { title: 'KWITANSI_TRANSAKSI' } },
      { properties: { title: 'REKAPITULASI_PAJAK' } },
      { properties: { title: 'RPD_RAB' } },
      { properties: { title: 'PROGRES_MINGGUAN' } },
      { properties: { title: 'DATA_TOKO' } },
      { properties: { title: 'DATA_PEKERJA' } },
    ],
  };

  const res = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('Error creating spreadsheet:', errText);
    throw new Error(`Gagal membuat Spreadsheet di Google Drive: ${res.status}`);
  }

  const result = await res.json();
  return {
    id: result.spreadsheetId,
    name: title,
    webViewLink: result.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${result.spreadsheetId}/edit`,
  };
}

/**
 * Ensure required sheets exist in spreadsheet and have enough rows
 */
async function ensureSheetTabsExist(
  accessToken: string,
  spreadsheetId: string,
  requiredTitles: string[],
  minRowsNeeded = 1000
): Promise<void> {
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties(sheetId,title,gridProperties)`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!metaRes.ok) return;

  const meta = await metaRes.json();
  const existingSheets = meta.sheets || [];
  const existingTitles = new Set(
    existingSheets.map((s: any) => s?.properties?.title).filter(Boolean)
  );

  const requests: any[] = [];

  // Add any missing sheets
  const missing = requiredTitles.filter((t) => !existingTitles.has(t));
  missing.forEach((t) => {
    requests.push({
      addSheet: {
        properties: {
          title: t,
          gridProperties: { rowCount: 2000, columnCount: 15 },
        },
      },
    });
  });

  // Ensure existing sheets have enough rows
  existingSheets.forEach((s: any) => {
    const sheetTitle = s?.properties?.title;
    const currentRows = s?.properties?.gridProperties?.rowCount || 0;
    if (sheetTitle === '_DATABASE_SNAPSHOT' && currentRows < minRowsNeeded) {
      requests.push({
        appendDimension: {
          sheetId: s.properties.sheetId,
          dimension: 'ROWS',
          length: Math.max(500, minRowsNeeded - currentRows + 200),
        },
      });
    }
  });

  if (requests.length === 0) return;

  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  }).catch(() => {});
}

/**
 * Save & sync entire AppStateData into Google Spreadsheet with 100% fidelity & human readable tabs
 */
export async function syncStateToSpreadsheet(
  accessToken: string,
  spreadsheetId: string,
  appState: AppStateData
): Promise<{ success: boolean; updatedAt: string }> {
  const requiredSheets = [
    '_DATABASE_SNAPSHOT',
    'DATA_SEKOLAH',
    'BKU_KAS_UMUM',
    'BKT_KAS_TUNAI',
    'BKB_KAS_BANK',
    'KWITANSI_TRANSAKSI',
    'REKAPITULASI_PAJAK',
    'RPD_RAB',
    'PROGRES_MINGGUAN',
    'DATA_TOKO',
    'DATA_PEKERJA',
  ];

  const nowStr = new Date().toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'medium' });
  const jsonStr = JSON.stringify(appState);
  
  // Split JSON into safe chunks
  const chunks: string[] = [];
  for (let i = 0; i < jsonStr.length; i += CHUNK_SIZE) {
    chunks.push(jsonStr.substring(i, i + CHUNK_SIZE));
  }

  // 1. _DATABASE_SNAPSHOT values
  const snapshotValues: any[][] = [
    ['PARAMETER', 'NILAI', 'DESKRIPSI SISTEM'],
    ['APP_IDENTIFIER', 'LPJ_REVIT_V2', 'Sistem LPJ Revitalisasi Sekolah Terpadu'],
    ['NPSN', appState.school.npsn || '', appState.school.namaSekolah || ''],
    ['WAKTU_SINKRON', nowStr, 'Waktu sinkronisasi terakhir'],
    ['JUMLAH_CHUNK', String(chunks.length), 'Jumlah segmen JSON database'],
    ['TOTAL_KARAKTER', String(jsonStr.length), 'Ukuran total database'],
  ];
  chunks.forEach((chunk, idx) => {
    snapshotValues.push([`CHUNK_${idx}`, chunk, `Segmen data ke-${idx + 1}`]);
  });

  await ensureSheetTabsExist(accessToken, spreadsheetId, requiredSheets, snapshotValues.length + 50);

  // 2. DATA_SEKOLAH
  const sch = appState.school;
  const dataSekolahValues: any[][] = [
    ['PROFIL SEKOLAH & DATA PROYEK REVITALISASI', ''],
    ['Nama Sekolah', sch.namaSekolah || ''],
    ['NPSN', sch.npsn || ''],
    ['Alamat Lengkap', sch.alamat || ''],
    ['Kecamatan / Kab-Kota', sch.kabKota || ''],
    ['Provinsi', sch.provinsi || ''],
    ['Tahun Anggaran', String(sch.tahunAnggaran || '2025')],
    ['Nama Kepala Sekolah', sch.namaKepalaSekolah || ''],
    ['NIP Kepala Sekolah', sch.nipKepalaSekolah || ''],
    ['Nama Bendahara', sch.namaBendahara || ''],
    ['NIP Bendahara', sch.nipBendahara || ''],
    ['Nama Ketua P2SP', sch.namaKetuaP2SP || ''],
    ['Nomor Rekening Sekolah', sch.nomorRekening || ''],
    ['Nama Bank', sch.namaBank || ''],
    ['Total Bantuan / Anggaran (Rp)', formatRupiah(sch.totalAnggaran || 0)],
    ['Terakhir Diperbarui', nowStr],
  ];

  // 3. BKU_KAS_UMUM
  const bkuRows = (appState.manualBkuTransactions || [])
    .filter((tx) => !appState.deletedBkuIds?.includes(tx.id))
    .sort((a, b) => new Date(a.tanggal).getTime() - new Date(b.tanggal).getTime());

  const bkuValues: any[][] = [
    ['BUKU KAS UMUM (BKU) - REKAP TRANSAKSI KEUANGAN', '', '', '', '', '', ''],
    ['No', 'Tanggal', 'No Bukti', 'Uraian Transaksi', 'Penerimaan (Rp)', 'Pengeluaran (Rp)', 'Saldo (Rp)', 'Jenis'],
  ];
  let runningSaldo = 0;
  bkuRows.forEach((tx, idx) => {
    const masuk = Number(tx.penerimaan || 0);
    const keluar = Number(tx.pengeluaran || 0);
    runningSaldo += masuk - keluar;
    bkuValues.push([
      idx + 1,
      tx.tanggal || '',
      tx.noBukti || '',
      tx.uraian || '',
      masuk > 0 ? masuk : '',
      keluar > 0 ? keluar : '',
      runningSaldo,
      tx.jenis || '',
    ]);
  });

  // 4. BKT_KAS_TUNAI
  const bktValues: any[][] = [
    ['BUKU PEMBANTU KAS TUNAI (BKT)', '', '', '', '', '', ''],
    ['No', 'Tanggal', 'No Bukti', 'Uraian Transaksi', 'Penerimaan (Rp)', 'Pengeluaran (Rp)', 'Saldo Tunai (Rp)'],
  ];
  let bktSaldo = 0;
  bkuRows
    .filter((tx) => tx.metodeBayar === 'TUNAI' || (!tx.metodeBayar && !tx.noBukti?.toLowerCase().includes('bank')))
    .forEach((tx, idx) => {
      const masuk = Number(tx.penerimaan || 0);
      const keluar = Number(tx.pengeluaran || 0);
      bktSaldo += masuk - keluar;
      bktValues.push([
        idx + 1,
        tx.tanggal || '',
        tx.noBukti || '',
        tx.uraian || '',
        masuk > 0 ? masuk : '',
        keluar > 0 ? keluar : '',
        bktSaldo,
      ]);
    });

  // 5. BKB_KAS_BANK
  const bkbValues: any[][] = [
    ['BUKU PEMBANTU BANK (BKB)', '', '', '', '', '', ''],
    ['No', 'Tanggal', 'No Bukti', 'Uraian Transaksi', 'Penerimaan (Rp)', 'Pengeluaran (Rp)', 'Saldo Bank (Rp)'],
  ];
  let bkbSaldo = 0;
  (appState.bkbRecords || []).forEach((rec, idx) => {
    const masuk = Number(rec.penerimaan || 0);
    const keluar = Number(rec.pengeluaran || 0);
    bkbSaldo += masuk - keluar;
    bkbValues.push([
      idx + 1,
      rec.tanggal || '',
      rec.noBukti || '',
      rec.uraian || '',
      masuk > 0 ? masuk : '',
      keluar > 0 ? keluar : '',
      bkbSaldo,
    ]);
  });

  // 6. KWITANSI_TRANSAKSI
  const kwList = (appState.kwitansiList || [])
    .filter((k) => !appState.deletedKwitansiIds?.includes(k.id))
    .sort((a, b) => new Date(a.tanggal).getTime() - new Date(b.tanggal).getTime());

  const kwValues: any[][] = [
    ['DAFTAR KWITANSI, BON & SPB', '', '', '', '', '', ''],
    ['No', 'No Bukti', 'Tanggal', 'Penerima / Toko', 'Uraian Pembayaran', 'Total Nilai (Rp)', 'Tipe', 'Rincian Barang'],
  ];
  kwList.forEach((kw, idx) => {
    const itemsDesc = (kw.items || []).map((it) => `${it.namaBarang} (${it.volume} ${it.satuan})`).join('; ');
    kwValues.push([
      idx + 1,
      kw.noBukti || '',
      kw.tanggal || '',
      kw.penerimaNama || kw.namaToko || '',
      kw.uraian || '',
      Number(kw.nominal || 0),
      kw.tipe || 'MATERIAL',
      itemsDesc,
    ]);
  });

  // 7. REKAPITULASI_PAJAK
  const taxList = (appState.manualTaxRecords || []).filter((t) => !appState.deletedTaxIds?.includes(t.id));
  const taxValues: any[][] = [
    ['REKAPITULASI PERPAJAKAN', '', '', '', '', '', '', ''],
    ['No', 'Tanggal', 'No Bukti', 'Keperluan Transaksi', 'PPh 22 (Rp)', 'PPh 23 (Rp)', 'PPN 11% (Rp)', 'Total Pajak (Rp)'],
  ];
  taxList.forEach((tx, idx) => {
    taxValues.push([
      idx + 1,
      tx.tanggal || '',
      tx.noBukti || '',
      tx.keperluan || '',
      Number(tx.pph22 || 0) || '',
      Number(tx.pph23 || 0) || '',
      Number(tx.ppn11 || 0) || '',
      Number(tx.totalPajak || 0) || '',
    ]);
  });

  // 8. RPD_RAB
  const rpdValues: any[][] = [
    ['RENCANA PENGGUNAAN DANA (RPD / RAB)', '', '', '', '', '', ''],
    ['No', 'No Urut', 'Uraian Pekerjaan / Material', 'Volume', 'Satuan', 'Harga Satuan (Rp)', 'Total Biaya (Rp)', 'Kategori'],
  ];
  (appState.rpdItems || []).forEach((rpd, idx) => {
    rpdValues.push([
      idx + 1,
      rpd.no || '',
      rpd.uraian || '',
      Number(rpd.volume100 || 0),
      rpd.satuan || '',
      Number(rpd.hargaSatuan || 0),
      Number(rpd.jumlahAnggaran || 0),
      rpd.kategori || '',
    ]);
  });

  // 9. PROGRES_MINGGUAN
  const progValues: any[][] = [
    ['LAPORAN PROGRES FISIK MINGGUAN', '', '', '', ''],
    ['Minggu Ke', 'Periode', 'Bobot Rencana (%)', 'Bobot Realisasi (%)', 'Deviasi (%)'],
  ];
  (appState.progressWeeks || []).forEach((pw) => {
    progValues.push([
      `Minggu ${pw.mingguKe}`,
      pw.periode || '',
      Number(pw.bobotRencana || 0),
      Number(pw.bobotRealisasi || 0),
      Number(pw.deviasi || 0),
    ]);
  });

  // 10. DATA_TOKO
  const storeValues: any[][] = [
    ['DATA TOKO & REKANAN PENYEDIA', '', '', '', '', ''],
    ['No', 'Nama Toko', 'Nama Pemilik', 'Alamat', 'NPWP', 'No Kontak'],
  ];
  (appState.stores || []).forEach((st, idx) => {
    storeValues.push([
      idx + 1,
      st.namaToko || '',
      st.pemilikNama || '',
      st.alamat || '',
      st.npwp || '',
      st.telepon || '',
    ]);
  });

  // 11. DATA_PEKERJA
  const workerValues: any[][] = [
    ['DATA TENAGA KERJA / TUKANG', '', '', '', ''],
    ['No', 'Nama Pekerja', 'Kategori Peran', 'Upah Harian (Rp)', 'Domisili'],
  ];
  (appState.workers || []).forEach((wk, idx) => {
    workerValues.push([
      idx + 1,
      wk.nama || '',
      wk.peran || '',
      Number(wk.upahHarian || 0),
      wk.domisili || '',
    ]);
  });

  // Batch clear and batch update
  const rangesToClear = [
    '_DATABASE_SNAPSHOT!A:C',
    'DATA_SEKOLAH!A:B',
    'BKU_KAS_UMUM!A:I',
    'BKT_KAS_TUNAI!A:G',
    'BKB_KAS_BANK!A:G',
    'KWITANSI_TRANSAKSI!A:H',
    'REKAPITULASI_PAJAK!A:I',
    'RPD_RAB!A:H',
    'PROGRES_MINGGUAN!A:E',
    'DATA_TOKO!A:F',
    'DATA_PEKERJA!A:E',
  ];

  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchClear`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ranges: rangesToClear }),
  }).catch(() => {});

  const updatePayload = {
    valueInputOption: 'USER_ENTERED',
    data: [
      { range: `_DATABASE_SNAPSHOT!A1:C${snapshotValues.length}`, values: snapshotValues },
      { range: `DATA_SEKOLAH!A1:B${dataSekolahValues.length}`, values: dataSekolahValues },
      { range: `BKU_KAS_UMUM!A1:H${bkuValues.length}`, values: bkuValues },
      { range: `BKT_KAS_TUNAI!A1:G${bktValues.length}`, values: bktValues },
      { range: `BKB_KAS_BANK!A1:G${bkbValues.length}`, values: bkbValues },
      { range: `KWITANSI_TRANSAKSI!A1:H${kwValues.length}`, values: kwValues },
      { range: `REKAPITULASI_PAJAK!A1:H${taxValues.length}`, values: taxValues },
      { range: `RPD_RAB!A1:H${rpdValues.length}`, values: rpdValues },
      { range: `PROGRES_MINGGUAN!A1:E${progValues.length}`, values: progValues },
      { range: `DATA_TOKO!A1:F${storeValues.length}`, values: storeValues },
      { range: `DATA_PEKERJA!A1:E${workerValues.length}`, values: workerValues },
    ],
  };

  const updateRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updatePayload),
  });

  if (!updateRes.ok) {
    const errText = await updateRes.text();
    console.error('Error writing spreadsheet data:', errText);
    throw new Error(`Gagal menyimpan data ke Google Sheets: ${updateRes.status}`);
  }

  return { success: true, updatedAt: nowStr };
}

/**
 * Load & restore complete AppStateData from Google Spreadsheet
 */
export async function loadStateFromSpreadsheet(
  accessToken: string,
  spreadsheetId: string
): Promise<{ state: AppStateData; syncedAt: string }> {
  // Read ALL chunks from _DATABASE_SNAPSHOT (unlimited rows using A:C)
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/_DATABASE_SNAPSHOT!A:C`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Gagal membaca data dari Google Sheets: ${res.status}`);
  }

  const result = await res.json();
  const rows: any[][] = result.values || [];

  if (rows.length < 5) {
    throw new Error('Spreadsheet tidak berisi snapshot database LPJ Revit yang valid.');
  }

  let syncedAt = '';
  let expectedChunks = 0;
  const chunkMap: { [idx: number]: string } = {};

  for (const row of rows) {
    const key = String(row[0] || '').trim();
    const val = String(row[1] || '');

    if (key === 'WAKTU_SINKRON') {
      syncedAt = val;
    } else if (key === 'JUMLAH_CHUNK') {
      expectedChunks = parseInt(val, 10) || 0;
    } else if (key.startsWith('CHUNK_')) {
      const idx = parseInt(key.replace('CHUNK_', ''), 10);
      if (!isNaN(idx)) {
        chunkMap[idx] = val;
      }
    }
  }

  const sortedChunkIndices = Object.keys(chunkMap)
    .map(Number)
    .sort((a, b) => a - b);

  if (sortedChunkIndices.length === 0) {
    throw new Error('Tidak ditemukan data JSON snapshot di tab _DATABASE_SNAPSHOT.');
  }

  if (expectedChunks > 0 && sortedChunkIndices.length < expectedChunks) {
    throw new Error(`Data di Google Sheets belum lengkap: terbaca ${sortedChunkIndices.length} dari ${expectedChunks} segmen.`);
  }

  const fullJson = sortedChunkIndices.map((i) => chunkMap[i]).join('');
  let parsed: any;
  try {
    parsed = JSON.parse(fullJson);
  } catch (e: any) {
    throw new Error(`Format data JSON di Google Sheets rusak atau tidak lengkap: ${e.message}`);
  }

  const cleanState = sanitizeAndFilterDemoState(parsed);
  return {
    state: cleanState,
    syncedAt: syncedAt || 'Baru saja',
  };
}
