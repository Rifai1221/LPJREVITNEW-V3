import React, { useState, useRef } from 'react';
import {
  X,
  Download,
  Upload,
  FileSpreadsheet,
  FileJson,
  Database,
  CheckCircle2,
  AlertTriangle,
  HardDrive,
  ShieldCheck,
  RefreshCw,
  FolderDown,
  Layers,
  ArrowRight,
  Lock,
  Key,
} from 'lucide-react';
import {
  SchoolMasterData,
  BkuTransaction,
  KwitansiDocument,
  TaxRecord,
} from '../types';
import {
  exportBkuToExcel,
  exportKwitansiToExcel,
  exportPajakToExcel,
  exportComprehensiveLpjExcel,
  exportBkuToCsv,
} from '../utils/excelExportUtils';
import { formatRupiah } from '../utils/formatters';
import { encryptJsonData, decryptJsonData } from '../utils/cryptoHelper';

interface BackupRestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  appState: any;
  onRestoreData: (restoredState: any) => void;
  currentTenantName?: string;
}

export const BackupRestoreModal: React.FC<BackupRestoreModalProps> = ({
  isOpen,
  onClose,
  appState,
  onRestoreData,
  currentTenantName,
}) => {
  const [activeTab, setActiveTab] = useState<'BACKUP' | 'RESTORE'>('BACKUP');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedPreview, setParsedPreview] = useState<any | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Password Encryption/Decryption States
  const [useEncryption, setUseEncryption] = useState(false);
  const [exportPassword, setExportPassword] = useState('');
  const [importPassword, setImportPassword] = useState('');
  const [isEncryptedFile, setIsEncryptedFile] = useState(false);
  const [rawFileText, setRawFileText] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const school = (appState?.school || {}) as SchoolMasterData;
  const bkuCount = (appState?.bkuTransactions || []).length;
  const kwitansiCount = (appState?.kwitansiList || []).length;
  const taxCount = (appState?.taxRecords || []).length;
  const totalAnggaran = school.totalAnggaran || 0;

  // Handlers for Backup
  const handleDownloadJsonBackup = async () => {
    if (useEncryption && !exportPassword.trim()) {
      alert('Masukkan kata sandi enkripsi terlebih dahulu.');
      return;
    }

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const cleanSchoolName = (school.namaSekolah || 'Sekolah').replace(/[^a-zA-Z0-9]/g, '_');
    const prefix = useEncryption ? 'BACKUP_ENCRYPTED_LPJ' : 'Backup_LPJ';
    const filename = `${prefix}_${cleanSchoolName}_${dateStr}.json`;

    let outputContent = '';
    if (useEncryption) {
      outputContent = await encryptJsonData(appState, exportPassword.trim());
    } else {
      outputContent = JSON.stringify(appState, null, 2);
    }

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(outputContent);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', filename);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    setSuccessMessage(`File cadangan ${useEncryption ? 'Terenkripsi AES-256' : 'JSON'} berhasil diunduh: ${filename}`);
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  const handleExportFullExcel = () => {
    exportComprehensiveLpjExcel(appState);
    setSuccessMessage('Bundel Excel lengkap multi-sheet (BKU, BKT, BKB, Kwitansi, Pajak, RPD, Progres) berhasil diunduh!');
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  const handleExportBkuExcel = () => {
    exportBkuToExcel(appState.bkuTransactions || [], school);
    setSuccessMessage('File Excel BKU berhasil diunduh!');
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  const handleExportKwitansiExcel = () => {
    exportKwitansiToExcel(appState.kwitansiList || [], school);
    setSuccessMessage('File Excel Rekap Kwitansi & Bon berhasil diunduh!');
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  const handleExportPajakExcel = () => {
    exportPajakToExcel(appState.taxRecords || [], school);
    setSuccessMessage('File Excel Buku Pajak berhasil diunduh!');
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  const handleExportBkuCsv = () => {
    exportBkuToCsv(appState.bkuTransactions || [], school);
    setSuccessMessage('File CSV BKU berhasil diunduh!');
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  // Handlers for Restore
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setParseError(null);
    setParsedPreview(null);
    setIsEncryptedFile(false);
    setImportPassword('');

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = (event.target?.result as string) || '';
        setRawFileText(text);

        if (text.startsWith('ENC_AES_') || text.startsWith('ENC_LGT_')) {
          setIsEncryptedFile(true);
          setParseError('File ini terenkripsi. Silakan masukkan kata sandi enkripsi untuk dekripsi.');
          return;
        }

        const parsed = JSON.parse(text);

        if (!parsed || typeof parsed !== 'object') {
          throw new Error('File tidak berisi format JSON valid.');
        }

        if (!parsed.school && !parsed.rpdItems && !parsed.kwitansiList) {
          throw new Error('Skema data tidak cocok dengan format LPJ Revitalisasi.');
        }

        setParsedPreview(parsed);
      } catch (err: any) {
        setParseError(err.message || 'Gagal memproses file JSON cadangan.');
      }
    };
    reader.readAsText(file);
  };

  const handleDecryptFile = async () => {
    if (!rawFileText || !importPassword.trim()) {
      setParseError('Masukkan kata sandi enkripsi.');
      return;
    }

    try {
      setParseError(null);
      const decrypted = await decryptJsonData(rawFileText.trim(), importPassword.trim());
      if (!decrypted.school && !decrypted.rpdItems && !decrypted.kwitansiList) {
        throw new Error('Hasil dekripsi tidak memiliki skema LPJ valid.');
      }
      setParsedPreview(decrypted);
      setIsEncryptedFile(false);
      setSuccessMessage('File terenkripsi berhasil didekripsi!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setParseError('Kata sandi enkripsi salah atau file rusak.');
    }
  };

  const handleExecuteRestore = () => {
    if (!parsedPreview) return;

    const schoolTarget = parsedPreview.school?.namaSekolah || currentTenantName || 'sekolah ini';
    if (!confirm(`Peringatan: Seluruh data saat ini untuk ${school.namaSekolah} akan ditimpa dengan data cadangan dari file "${selectedFile?.name}". Lanjutkan pemulihan?`)) {
      return;
    }

    setIsRestoring(true);
    try {
      onRestoreData(parsedPreview);
      setSuccessMessage(`Data LPJ untuk ${schoolTarget} berhasil dipulihkan secara utuh!`);
      setTimeout(() => {
        setIsRestoring(false);
        onClose();
      }, 1500);
    } catch (err: any) {
      setIsRestoring(false);
      setParseError(`Gagal memulihkan: ${err.message || err}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-in fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header Modal */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-indigo-800/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/30 border border-blue-400/40 rounded-xl text-emerald-400 shadow-inner">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-400 text-slate-950 uppercase">
                  Data Safety & Export
                </span>
                <span className="text-xs text-indigo-200 font-mono">NPSN: {school.npsn}</span>
              </div>
              <h3 className="text-base font-bold text-white mt-0.5">
                Cadangan, Pulihkan & Ekspor Excel Mandiri
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Toggle */}
        <div className="bg-slate-100 border-b border-slate-200 p-2 flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('BACKUP')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'BACKUP'
                ? 'bg-white text-indigo-950 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:bg-slate-200/70'
            }`}
          >
            <Download className="w-4 h-4 text-emerald-600" />
            <span>Cadangkan & Ekspor Data (Backup / Excel)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('RESTORE')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'RESTORE'
                ? 'bg-white text-indigo-950 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:bg-slate-200/70'
            }`}
          >
            <Upload className="w-4 h-4 text-blue-600" />
            <span>Pulihkan Data dari File (.JSON)</span>
          </button>
        </div>

        {/* Success Alert Banner */}
        {successMessage && (
          <div className="bg-emerald-50 border-b border-emerald-200 p-3 flex items-center gap-2 text-xs text-emerald-900 font-semibold animate-in slide-in-from-top shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {activeTab === 'BACKUP' ? (
            <div className="space-y-5">
              {/* Info Ringkasan Data Sekolah */}
              <div className="bg-gradient-to-r from-indigo-50/80 via-blue-50/60 to-slate-50 border border-indigo-200/70 p-4 rounded-xl flex items-center justify-between flex-wrap gap-3">
                <div className="space-y-0.5">
                  <span className="text-[11px] font-bold text-indigo-900 block uppercase tracking-wide">
                    Database Sekolah Aktif
                  </span>
                  <h4 className="text-sm font-black text-slate-900">
                    {school.namaSekolah}
                  </h4>
                  <p className="text-xs text-slate-600">
                    Pagu Anggaran: <strong className="text-indigo-950">{formatRupiah(totalAnggaran)}</strong> • Tahun {school.tahunAnggaran || '2026'}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs font-mono font-bold text-slate-700 bg-white/90 border border-indigo-100 px-3 py-2 rounded-lg shadow-2xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-sans">Transaksi BKU</span>
                    <span>{bkuCount} Item</span>
                  </div>
                  <div className="w-px h-6 bg-slate-200" />
                  <div>
                    <span className="text-[10px] text-slate-400 block font-sans">Kwitansi & Bon</span>
                    <span>{kwitansiCount} Dokumen</span>
                  </div>
                  <div className="w-px h-6 bg-slate-200" />
                  <div>
                    <span className="text-[10px] text-slate-400 block font-sans">Buku Pajak</span>
                    <span>{taxCount} Setoran</span>
                  </div>
                </div>
              </div>

              {/* OPSI 1: Cadangan Penuh JSON */}
              <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-white hover:border-indigo-300 transition">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 bg-amber-100 text-amber-800 rounded-xl shrink-0 mt-0.5">
                      <FileJson className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                        <span>Cadangan Lengkap Database Proyek (.JSON)</span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-200 text-amber-900">
                          Paling Aman
                        </span>
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                        Menyimpan seluruh master data sekolah, SK P2SP, RPD, BKU, BKT, BKB, kwitansi manual terkunci, laporan upah mingguan, dan rekap pajak dalam 1 file JSON mandiri. File ini dapat dipulihkan kapan saja.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadJsonBackup}
                    className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow-xs transition cursor-pointer shrink-0"
                  >
                    <Download className="w-4 h-4" />
                    <span>Unduh Cadangan (JSON)</span>
                  </button>
                </div>
              </div>

              {/* OPSI 2: Bundel Excel Lengkap (Multi-Sheet) */}
              <div className="border border-emerald-300 rounded-xl p-4 space-y-3 bg-emerald-50/40">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 bg-emerald-600 text-white rounded-xl shrink-0 mt-0.5 shadow-xs">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-sm font-bold text-emerald-950">
                          Bundel LPJ Lengkap Multi-Sheet (.XLSX)
                        </h4>
                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-300 text-emerald-950">
                          Rekomendasi Arsip
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                        1 File Microsoft Excel lengkap berisi <strong>8 Lembar Kerja (Sheets)</strong>: Profil Sekolah, BKU, BKT Tunai, BKB Bank, Rekap Kwitansi, Buku Pajak, RPD, dan Progres Fisik Mingguan. Langsung siap dibuka di Excel atau Google Sheets.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportFullExcel}
                    className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white px-4 py-2.5 rounded-xl text-xs font-black shadow-md transition cursor-pointer shrink-0"
                  >
                    <FolderDown className="w-4 h-4" />
                    <span>Ekspor Bundel Excel (.xlsx)</span>
                  </button>
                </div>
              </div>

              {/* OPSI 3: Ekspor Per Modul Spesifik */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700 block">
                  Ekspor Dokumen Spesifik ke Microsoft Excel:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Ekspor BKU Excel */}
                  <div className="p-3 border border-slate-200 rounded-xl bg-white flex items-center justify-between hover:bg-slate-50 transition">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 bg-blue-100 text-blue-800 rounded-lg shrink-0">
                        <FileSpreadsheet className="w-4 h-4" />
                      </div>
                      <div className="truncate">
                        <p className="text-xs font-bold text-slate-900 truncate">Buku Kas Umum (BKU)</p>
                        <p className="text-[10px] text-slate-500">{bkuCount} transaksi tercatat</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleExportBkuExcel}
                      className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition cursor-pointer shrink-0"
                    >
                      .XLSX
                    </button>
                  </div>

                  {/* Ekspor Kwitansi Excel */}
                  <div className="p-3 border border-slate-200 rounded-xl bg-white flex items-center justify-between hover:bg-slate-50 transition">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 bg-purple-100 text-purple-800 rounded-lg shrink-0">
                        <FileSpreadsheet className="w-4 h-4" />
                      </div>
                      <div className="truncate">
                        <p className="text-xs font-bold text-slate-900 truncate">Daftar Kwitansi & Bon</p>
                        <p className="text-[10px] text-slate-500">{kwitansiCount} bukti pembayaran</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleExportKwitansiExcel}
                      className="px-2.5 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg text-xs font-bold transition cursor-pointer shrink-0"
                    >
                      .XLSX
                    </button>
                  </div>

                  {/* Ekspor Pajak Excel */}
                  <div className="p-3 border border-slate-200 rounded-xl bg-white flex items-center justify-between hover:bg-slate-50 transition">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 bg-rose-100 text-rose-800 rounded-lg shrink-0">
                        <FileSpreadsheet className="w-4 h-4" />
                      </div>
                      <div className="truncate">
                        <p className="text-xs font-bold text-slate-900 truncate">Buku Pembantu Pajak</p>
                        <p className="text-[10px] text-slate-500">{taxCount} pemotongan PPN/PPh</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleExportPajakExcel}
                      className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition cursor-pointer shrink-0"
                    >
                      .XLSX
                    </button>
                  </div>

                  {/* Ekspor CSV Universal */}
                  <div className="p-3 border border-slate-200 rounded-xl bg-white flex items-center justify-between hover:bg-slate-50 transition">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-2 bg-slate-100 text-slate-800 rounded-lg shrink-0">
                        <FileSpreadsheet className="w-4 h-4" />
                      </div>
                      <div className="truncate">
                        <p className="text-xs font-bold text-slate-900 truncate">BKU Format Standar CSV</p>
                        <p className="text-[10px] text-slate-500">Universal delimiter semicolon (;)</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleExportBkuCsv}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-lg text-xs font-bold transition cursor-pointer shrink-0"
                    >
                      .CSV
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Petunjuk Restore */}
              <div className="bg-blue-50 border border-blue-200 p-3.5 rounded-xl flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div className="text-xs text-blue-950 space-y-1">
                  <p className="font-bold">Pemulihan Aman (*Safe Restore*)</p>
                  <p className="text-slate-600 leading-relaxed">
                    Pilih file cadangan JSON yang sebelumnya pernah diunduh. Sistem akan memeriksa keabsahan struktur data sebelum memperbarui database sekolah Anda.
                  </p>
                </div>
              </div>

              {/* File Dropzone Input */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl p-6 text-center cursor-pointer transition bg-slate-50/60 hover:bg-blue-50/30 flex flex-col items-center justify-center space-y-2"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="p-3 bg-blue-100 text-blue-700 rounded-2xl">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">
                    {selectedFile ? selectedFile.name : 'Klik untuk memilih file cadangan (.JSON)'}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {selectedFile ? `${Math.round(selectedFile.size / 1024)} KB` : 'Format yang didukung: file JSON hasil cadangan LPJ Revitalisasi'}
                  </p>
                </div>
              </div>

              {/* Error Alert */}
              {parseError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800 font-semibold">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{parseError}</span>
                </div>
              )}

              {/* Preview Data Cadangan */}
              {parsedPreview && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <span className="text-xs font-bold text-slate-700">Hasil Pemindaian File Cadangan:</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                      Format Valid
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-500 block">Nama Sekolah Cadangan</span>
                      <strong className="text-slate-900 truncate block">{parsedPreview.school?.namaSekolah || '-'}</strong>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-500 block">NPSN / TA</span>
                      <strong className="text-slate-900 block">{parsedPreview.school?.npsn || '-'} • TA {parsedPreview.school?.tahunAnggaran || '-'}</strong>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-500 block">Pagu Anggaran</span>
                      <strong className="text-emerald-700 block">{formatRupiah(parsedPreview.school?.totalAnggaran || 0)}</strong>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-500 block">Jumlah Kwitansi</span>
                      <strong className="text-slate-900 block">{(parsedPreview.kwitansiList || []).length} Dokumen</strong>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-500 block">Transaksi BKU</span>
                      <strong className="text-slate-900 block">{(parsedPreview.bkuTransactions || []).length} Item</strong>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-500 block">Minggu Progres Fisik</span>
                      <strong className="text-slate-900 block">{(parsedPreview.progressWeeks || []).length} Minggu</strong>
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      disabled={isRestoring}
                      onClick={handleExecuteRestore}
                      className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-md transition cursor-pointer disabled:opacity-50"
                    >
                      {isRestoring ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Memulihkan Data...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                          <span>Terapkan & Pulihkan Data Ini</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Modal */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span className="flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5 text-slate-400" />
            <span>File disimpan mandiri di perangkat lokal Anda tanpa batasan kuota.</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 border border-slate-300 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
