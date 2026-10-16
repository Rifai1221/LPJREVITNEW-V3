import React, { useRef } from 'react';
import { Printer, Download, X, Layers, FileText, CheckCircle2 } from 'lucide-react';
import {
  SchoolMasterData,
  RpdItem,
  KwitansiDocument,
  WeeklyWageReport,
  BkuTransaction,
  BktTransaction,
  BkbTransaction,
  TaxRecord,
  ProjectProgressWeek,
  TransactionFilterOptions,
} from '../types';
import { formatRupiah, formatNumber } from '../utils/formatters';
import { terbilangRupiah } from '../utils/terbilang';
import { toRoman, getAhspWageRatesMap } from '../utils/divisionHelper';
import { getAvailableMonthsForSchool, parseTxDateToIso, resolveWeekDates } from '../utils/monthHelper';
import { getBalancedBoronganAttendance } from '../utils/boronganHelper';

import { SkTimTeknisDocument } from './SkTimTeknisDocument';
import {
  BastDocument,
  BapKemajuanFisikDocument,
  BapPembayaranDocument,
} from './BeritaAcaraDocuments';
import {
  normalizeMaterialItems,
  getHarmonizedKwitansiUraian,
  getAutoHealedKwitansiItems,
  getHarmonizedKwitansiNoBukti,
} from '../services/autoGeneratorService';
import { getBkbSaldoAtMonth, getBktSaldoAtMonth } from '../services/cashLedgerIntegrationService';

interface PrintDocumentViewerProps {
  isOpen: boolean;
  onClose: () => void;
  documentType: string; // 'ALL' | 'COVER' | 'RPD' | 'BKU' | 'BKT' | 'BKB' | 'PAJAK' | 'KWITANSI' | 'UPAH' | 'SPB' | 'FAKTUR'
  selectedMonth?: string;
  selectedWeekNum?: number;
  selectedKwitansiId?: string;
  filterOptions?: TransactionFilterOptions;
  school: SchoolMasterData;
  rpdItems: RpdItem[];
  kwitansiList: KwitansiDocument[];
  wageReports: WeeklyWageReport[];
  bkuList: BkuTransaction[];
  bktList: BktTransaction[];
  bkbList: BkbTransaction[];
  taxRecords: TaxRecord[];
  progressWeeks: ProjectProgressWeek[];
  workers?: any[];
  realSchoolData?: any;
}

const StandardKopSurat: React.FC<{ school: SchoolMasterData }> = ({ school }) => {
  const logoH = `${school.logoHeightPx || 65}px`;

  // Composed address line
  const addressLine = school.kopAlamatText || (
    [
      school.alamat,
      school.desa ? `Desa/Kel. ${school.desa}` : '',
      school.kecamatan ? `Kec. ${school.kecamatan}` : '',
      school.kabKota,
      school.provinsi,
      school.kodePos ? `Kode Pos ${school.kodePos}` : '',
    ].filter(Boolean).join(', ') + (school.npsn ? ` • NPSN: ${school.npsn}` : '')
  );

  // Composed contact line
  const contactParts = [
    school.teleponSekolah ? `Telp: ${school.teleponSekolah}` : '',
    school.emailSekolah ? `Pos-el: ${school.emailSekolah}` : '',
    school.websiteSekolah ? `Laman: ${school.websiteSekolah}` : '',
  ].filter(Boolean);
  const contactLine = school.kopKontakText || (contactParts.length > 0 ? contactParts.join(' | ') : '');

  return (
    <div className="pb-2 mb-4 font-sans print-avoid-break print-kop-surat">
      <div className="flex items-center justify-between gap-4">
        {/* Left Logo */}
        <div className="w-20 flex justify-center items-center shrink-0">
          {school.logoLeftUrl && (
            <img
              src={school.logoLeftUrl}
              alt="Logo Kiri"
              style={{ height: logoH }}
              className="w-auto max-w-[80px] object-contain"
            />
          )}
        </div>

        {/* Center Kop Text */}
        <div className="flex-1 text-center space-y-0.5">
          <p className="font-bold text-[11px] uppercase tracking-wider text-slate-900 leading-tight">
            {school.headerPemerintahText || `PEMERINTAH ${school.kabKota?.toUpperCase() || 'KABUPATEN / KOTA'}`}
          </p>
          <p className="font-bold text-[11px] uppercase tracking-wider text-slate-900 leading-tight">
            {school.dinasPendidikan || 'DINAS PENDIDIKAN DAN KEBUDAYAAN'}
          </p>
          {school.cabangDinas && (
            <p className="font-bold text-[10px] uppercase tracking-wider text-slate-800 leading-tight">
              {school.cabangDinas}
            </p>
          )}
          <h2 className="text-base font-black uppercase tracking-wide my-0.5 text-black leading-snug">
            {school.namaSekolah}
          </h2>
          <p className="text-[9.5px] text-slate-700 leading-normal">
            {addressLine}
          </p>
          {contactLine && (
            <p className="text-[9px] text-slate-600 leading-normal">
              {contactLine}
            </p>
          )}
        </div>

        {/* Right Logo */}
        <div className="w-20 flex justify-center items-center shrink-0">
          {school.logoRightUrl && (
            <img
              src={school.logoRightUrl}
              alt="Logo Kanan"
              style={{ height: logoH }}
              className="w-auto max-w-[80px] object-contain"
            />
          )}
        </div>
      </div>
      {/* Garis Ganda Resmi Kedinasan */}
      <div className="pt-2">
        <div className="border-b-[2.5px] border-slate-900" />
        <div className="border-b-[0.75px] border-slate-900 mt-[2px]" />
      </div>
    </div>
  );
};

export type PaperSize = 'A4' | 'F4';
export type PageOrientation = 'portrait' | 'landscape';
export type MarginMode = 'normal' | 'compact' | 'narrow';

export const PrintDocumentViewer: React.FC<PrintDocumentViewerProps> = ({
  isOpen,
  onClose,
  documentType,
  selectedMonth,
  selectedWeekNum,
  selectedKwitansiId,
  filterOptions,
  school,
  rpdItems,
  kwitansiList,
  wageReports,
  bkuList,
  bktList,
  bkbList,
  taxRecords,
  progressWeeks,
  workers,
  realSchoolData,
}) => {
  const [selectedDoc, setSelectedDoc] = React.useState<string>(documentType);

  React.useEffect(() => {
    setSelectedDoc(documentType);
  }, [documentType]);

  const docType = selectedDoc;

  // Paper & Page Print Settings
  const [paperSize, setPaperSize] = React.useState<PaperSize>(() => {
    return (localStorage.getItem('lpj_print_paper_size') as PaperSize) || 'A4';
  });

  const isWideDocument = ['BKU', 'BKT', 'BKB', 'PAJAK', 'PROGRESS', 'RPD'].includes(selectedDoc);

  const [orientation, setOrientation] = React.useState<PageOrientation>(() => {
    const saved = localStorage.getItem('lpj_print_orientation');
    if (saved === 'portrait' || saved === 'landscape') return saved;
    return isWideDocument ? 'landscape' : 'portrait';
  });

  const [marginMode, setMarginMode] = React.useState<MarginMode>(() => {
    return (localStorage.getItem('lpj_print_margin') as MarginMode) || 'normal';
  });

  const [scalePercent, setScalePercent] = React.useState<number>(() => {
    const saved = localStorage.getItem('lpj_print_scale');
    return saved ? parseInt(saved, 10) : 100;
  });

  // Suggest landscape orientation for wide multi-column tables if orientation was not manually locked
  React.useEffect(() => {
    const isWide = ['BKU', 'BKT', 'BKB', 'PAJAK', 'PROGRESS', 'RPD'].includes(selectedDoc);
    const saved = localStorage.getItem('lpj_print_orientation');
    if (!saved) {
      setOrientation(isWide ? 'landscape' : 'portrait');
    }
  }, [selectedDoc]);

  const handlePaperSizeChange = (size: PaperSize) => {
    setPaperSize(size);
    localStorage.setItem('lpj_print_paper_size', size);
  };

  const handleOrientationChange = (ori: PageOrientation) => {
    setOrientation(ori);
    localStorage.setItem('lpj_print_orientation', ori);
  };

  const handleMarginChange = (mode: MarginMode) => {
    setMarginMode(mode);
    localStorage.setItem('lpj_print_margin', mode);
  };

  const handleScaleChange = (scale: number) => {
    setScalePercent(scale);
    localStorage.setItem('lpj_print_scale', String(scale));
  };

  const paperConfigs = {
    A4: {
      portrait: { widthMm: 210, heightMm: 297, name: 'A4', label: 'A4 (210 × 297 mm)', typeLabel: 'Standar ISO A4' },
      landscape: { widthMm: 297, heightMm: 210, name: 'A4 Lanskap', label: 'A4 Lanskap (297 × 210 mm)', typeLabel: 'Standar ISO A4' },
    },
    F4: {
      portrait: { widthMm: 215, heightMm: 330, name: 'F4 / Folio', label: 'F4 / Folio (215 × 330 mm)', typeLabel: 'Folio Dinas Indonesia' },
      landscape: { widthMm: 330, heightMm: 215, name: 'F4 Lanskap', label: 'F4 / Folio Lanskap (330 × 215 mm)', typeLabel: 'Folio Dinas Indonesia' },
    },
  };

  const activeDim = paperConfigs[paperSize][orientation];
  const marginMm = marginMode === 'narrow' ? 5 : marginMode === 'compact' ? 7 : 10;

  const printAreaRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  // Filter Kwitansi for single view if selected
  const activeKwitansi = selectedKwitansiId
    ? kwitansiList.find((k) => k.id === selectedKwitansiId) || kwitansiList[0]
    : kwitansiList[0];

  const months = getAvailableMonthsForSchool(school, [bkuList, bktList, bkbList, kwitansiList, taxRecords]).filter((m) => m !== 'ALL');

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/85 backdrop-blur-xs flex flex-col overflow-hidden">
      {/* Injected Dynamic @page Style for Browser PDF Engine & Physical Print */}
      <style>{`
        @page {
          size: ${activeDim.widthMm}mm ${activeDim.heightMm}mm;
          margin: ${marginMm}mm;
        }
        @media print {
          html, body {
            background: #ffffff !important;
            color: #000000 !important;
            width: 100% !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            font-size: ${scalePercent <= 80 ? '8.5pt' : scalePercent <= 90 ? '9.2pt' : '10pt'} !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print\\:hidden {
            display: none !important;
          }
          .fixed,
          .overflow-hidden,
          .overflow-y-auto {
            position: static !important;
            overflow: visible !important;
            height: auto !important;
            max-height: none !important;
          }
          .print-container {
            max-width: none !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            display: block !important;
            ${scalePercent !== 100 ? `zoom: ${scalePercent / 100};` : ''}
          }
          .page-break {
            display: block !important;
            min-height: auto !important;
            height: auto !important;
            max-height: none !important;
            padding: 0 !important;
            margin: 0 !important;
            break-after: page !important;
            page-break-after: always !important;
            page-break-inside: auto !important;
            break-inside: auto !important;
            box-shadow: none !important;
            border: none !important;
            overflow: visible !important;
          }
          .page-break:last-child {
            break-after: auto !important;
            page-break-after: auto !important;
          }
          table {
            width: 100% !important;
            max-width: 100% !important;
            table-layout: auto !important;
            border-collapse: collapse !important;
            page-break-inside: auto !important;
            break-inside: auto !important;
          }
          thead {
            display: table-header-group !important;
          }
          tfoot {
            display: table-footer-group !important;
          }
          tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-after: auto !important;
          }
          th, td {
            overflow-wrap: break-word !important;
            word-break: break-word !important;
            box-sizing: border-box !important;
          }
          .print-avoid-break,
          .print-signature-block,
          .print-closing-box,
          .print-kop-surat,
          .print-no-split {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>

      {/* Top Modal Controls */}
      <div className="bg-slate-900 text-white p-3 border-b border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3 print:hidden shadow-lg shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-600 rounded-lg shrink-0 shadow-xs">
            <Printer className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-sm text-white flex items-center gap-2">
              <span>Area Cetak & Pratinjau Dokumen LPJ</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-700 font-mono">
                {activeDim.label}
              </span>
            </h3>
            <p className="text-[11px] text-slate-400 truncate">
              Format cetak rapi, presisi, dan bersambung profesional ke halaman berikutnya tanpa terpotong.
            </p>
          </div>
        </div>

        {/* Toolbar Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Document Type Selector */}
          <select
            value={docType}
            onChange={(e) => setSelectedDoc(e.target.value)}
            className="bg-slate-800 hover:bg-slate-700 text-white text-xs border border-slate-700 rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 cursor-pointer max-w-[200px]"
            title="Pilih Dokumen Yang Akan Dicetak"
          >
            <option value="ALL"> Seluruh Dokumen LPJ Lengkap</option>
            <option value="SK_P2SP"> SK Pembentukan Panitia P2SP</option>
            <option value="SK_TIM_TEKNIS"> SK Tim Teknis Pelaksana</option>
            <option value="BAGAN_STRUKTUR"> Bagan Struktur Organisasi P2SP</option>
            <option value="COVER"> Cover LPJ</option>
            <option value="RPD"> Rencana Penggunaan Dana (RPD)</option>
            <option value="BKU"> Buku Kas Umum (BKU)</option>
            <option value="BKT"> Buku Kas Tunai (BKT)</option>
            <option value="BKB"> Buku Kas Bank (BKB)</option>
            <option value="KWITANSI"> Kwitansi Bukti Pembayaran</option>
            <option value="SPB"> Surat Permintaan Bayar (SPB)</option>
            <option value="UPAH"> Laporan Upah Kerja Harian (HOK)</option>
            <option value="BORONGAN"> SPJ Upah Borongan Tenaga Kerja</option>
            <option value="PROGRESS"> Laporan Kemajuan Fisik & Bobot</option>
            <option value="FOTO_PROGRESS"> Dokumentasi Foto Fisik Mingguan</option>
            <option value="BAST"> Berita Acara Serah Terima (BAST 100%)</option>
            <option value="BAP_FISIK"> Berita Acara Pemeriksaan Fisik (70% & 100%)</option>
            <option value="BAP_BAYAR"> Berita Acara Pembayaran Termin</option>
            <option value="PAJAK"> Rekapitulasi Pajak</option>
          </select>

          {/* Paper Size Direct Toggle: A4 vs F4 */}
          <div className="flex items-center bg-slate-800 p-0.5 rounded-lg border border-slate-700">
            <button
              type="button"
              onClick={() => handlePaperSizeChange('A4')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition flex items-center gap-1 cursor-pointer ${
                paperSize === 'A4'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
              }`}
              title="Pilih Kertas A4 (210 x 297 mm)"
            >
              <span>A4</span>
              <span className="text-[10px] opacity-75 font-normal hidden sm:inline">(210×297)</span>
            </button>
            <button
              type="button"
              onClick={() => handlePaperSizeChange('F4')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition flex items-center gap-1 cursor-pointer ${
                paperSize === 'F4'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
              }`}
              title="Pilih Kertas F4 / Folio Standar Dinas (215 x 330 mm)"
            >
              <span>F4 / Folio</span>
              <span className="text-[10px] opacity-75 font-normal hidden sm:inline">(215×330)</span>
            </button>
          </div>

          {/* Orientation Direct Toggle: Portrait vs Landscape */}
          <div className="flex items-center bg-slate-800 p-0.5 rounded-lg border border-slate-700">
            <button
              type="button"
              onClick={() => handleOrientationChange('portrait')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition flex items-center gap-1 cursor-pointer ${
                orientation === 'portrait'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
              }`}
              title="Orientasi Potret (Tegak)"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Potret</span>
            </button>
            <button
              type="button"
              onClick={() => handleOrientationChange('landscape')}
              className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition flex items-center gap-1 cursor-pointer ${
                orientation === 'landscape'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
              }`}
              title="Orientasi Lanskap (Mendatar - Sangat cocok untuk tabel banyak kolom)"
            >
              <FileText className="w-3.5 h-3.5 rotate-90" />
              <span>Lanskap</span>
            </button>
          </div>

          {/* Margin Dropdown */}
          <select
            value={marginMode}
            onChange={(e) => handleMarginChange(e.target.value as MarginMode)}
            className="bg-slate-800 hover:bg-slate-700 text-white text-xs border border-slate-700 rounded-lg px-2 py-1.5 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 cursor-pointer"
            title="Pilih Margin Kertas"
          >
            <option value="normal">Margin Standar (10mm)</option>
            <option value="compact">Margin Kompak (7mm)</option>
            <option value="narrow">Margin Rapat (5mm)</option>
          </select>

          {/* Scale Dropdown */}
          <select
            value={scalePercent}
            onChange={(e) => handleScaleChange(Number(e.target.value))}
            className="bg-slate-800 hover:bg-slate-700 text-white text-xs border border-slate-700 rounded-lg px-2 py-1.5 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 cursor-pointer hidden md:inline-block"
            title="Skala Kerapian Teks / Tabel"
          >
            <option value={100}>Skala 100%</option>
            <option value={90}>Skala 90% (Pas Lebar)</option>
            <option value={80}>Skala 80% (Kompak)</option>
          </select>

          {/* Main Print / PDF Button */}
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-3.5 py-1.5 rounded-lg text-xs shadow-md transition cursor-pointer"
            title="Cetak Fisik atau Simpan sebagai PDF"
          >
            <Printer className="w-4 h-4" />
            <span className="font-bold">Cetak / Simpan PDF</span>
          </button>

          {/* Close Modal Button */}
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
            title="Tutup Pratinjau"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Info Status Bar for Print Precision */}
      <div className="bg-slate-800/90 px-4 py-1.5 border-b border-slate-700/80 text-[11px] text-slate-300 flex items-center justify-between flex-wrap gap-2 print:hidden shrink-0">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 font-medium text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Kertas Aktif: <strong>{activeDim.label}</strong> ({activeDim.typeLabel})
          </span>
          <span className="text-slate-500 hidden sm:inline">•</span>
          <span className="text-slate-400 hidden sm:inline">
            Orientasi: <strong className="text-white">{orientation === 'portrait' ? 'Potret (Tegak)' : 'Lanskap (Mendatar)'}</strong>
          </span>
          <span className="text-slate-500 hidden md:inline">•</span>
          <span className="text-slate-400 hidden md:inline">
            Margin: <strong className="text-white">{marginMm} mm</strong>
          </span>
          {scalePercent !== 100 && (
            <>
              <span className="text-slate-500 hidden md:inline">•</span>
              <span className="text-amber-300 hidden md:inline font-mono">
                Skala: {scalePercent}%
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 text-slate-400 text-[11px]">
          <span>
            💡 <strong>Hasil Cetak:</strong> Pemotongan otomatis rapi per halaman (tanpa terpotong di tengah baris). Di jendela print, pilih <em>"Simpan sebagai PDF"</em>.
          </span>
        </div>
      </div>

      {/* Printable Area Scroll Wrapper */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-400/80 print:p-0 print:bg-white print:overflow-visible flex justify-center">
        <div
          ref={printAreaRef}
          className="print-container bg-white text-slate-900 w-full shadow-2xl print:shadow-none print:max-w-none print:w-full space-y-8 print:space-y-0 transition-all duration-200"
          style={{
            maxWidth: `${activeDim.widthMm}mm`,
          }}
        >
          {/* ========================================================
              1. COVER DOKUMEN LPJ
             ======================================================== */}
          {(docType === 'ALL' || docType === 'COVER') && (
            <div
              className="page-break bg-white p-12 flex flex-col justify-between border border-slate-300 print:border-none"
              style={{ minHeight: `${activeDim.heightMm}mm` }}
            >
              {/* Header Cover */}
              <div className="text-center space-y-4 pt-4">
                {/* Logo Tut Wuri Handayani */}
                <div className="w-28 h-28 mx-auto flex items-center justify-center">
                  <svg viewBox="0 0 100 100" className="w-full h-full text-blue-800">
                    <circle cx="50" cy="50" r="46" fill="#0052cc" stroke="#ffffff" strokeWidth="2" />
                    <circle cx="50" cy="50" r="43" fill="#ffffff" />
                    <circle cx="50" cy="50" r="39" fill="#0052cc" />
                    <path
                      d="M50 16 L57 32 L74 34 L62 46 L65 63 L50 54 L35 63 L38 46 L26 34 L43 32 Z"
                      fill="#ffd700"
                    />
                    <path
                      d="M50 35 L40 55 L60 55 Z"
                      fill="#ffffff"
                    />
                    <circle cx="50" cy="42" r="5" fill="#ffd700" />
                    <text x="50" y="82" textAnchor="middle" fontSize="6.5" fontWeight="bold" fill="#ffffff" letterSpacing="1">
                      TUT WURI HANDAYANI
                    </text>
                  </svg>
                </div>

                <div className="space-y-1 text-slate-900 font-bold uppercase tracking-wider text-xs sm:text-sm font-sans">
                  <p>KEMENTERIAN PENDIDIKAN DASAR DAN MENENGAH</p>
                  <p>DIREKTORAT JENDERAL PENDIDIKAN ANAK USIA DINI,</p>
                  <p>PENDIDIKAN DASAR, DAN PENDIDIKAN MENENGAH</p>
                  <p className="text-[11px] font-normal normal-case text-slate-700">
                    Jalan Jenderal Sudirman, Senayan, Jakarta 10270
                  </p>
                </div>
              </div>

              {/* Title Dokumen */}
              <div className="text-center my-12 space-y-3 font-sans">
                <h3 className="text-base font-extrabold tracking-widest uppercase text-slate-900">
                  DOKUMEN
                </h3>
                <h1 className="text-xl sm:text-2xl font-black uppercase text-slate-900 tracking-tight leading-snug">
                  LAPORAN PERTANGGUNGJAWABAN DANA<br />
                  PROGRAM REVITALISASI SEKOLAH<br />
                  TAHUN {school.tahunAnggaran}
                </h1>
              </div>

              {/* School Info Box */}
              <div className="max-w-md mx-auto w-full my-6 text-xs sm:text-sm font-sans space-y-2 border-t border-b border-slate-400 py-4">
                <div className="grid grid-cols-12 gap-2">
                  <span className="col-span-4 font-bold text-slate-800">NAMA SEKOLAH</span>
                  <span className="col-span-1">:</span>
                  <span className="col-span-7 font-bold text-slate-900">{school.namaSekolah}</span>
                </div>
                <div className="grid grid-cols-12 gap-2">
                  <span className="col-span-4 font-bold text-slate-800">NPSN</span>
                  <span className="col-span-1">:</span>
                  <span className="col-span-7 font-mono font-bold text-slate-900">{school.npsn}</span>
                </div>
                <div className="grid grid-cols-12 gap-2">
                  <span className="col-span-4 font-bold text-slate-800">PEKERJAAN</span>
                  <span className="col-span-1">:</span>
                  <span className="col-span-7 font-semibold text-slate-900">{school.pekerjaan}</span>
                </div>
                <div className="grid grid-cols-12 gap-2">
                  <span className="col-span-4 font-bold text-slate-800">LOKASI</span>
                  <span className="col-span-1">:</span>
                  <span className="col-span-7 font-semibold text-slate-900">{school.kabKota}</span>
                </div>
              </div>

              {/* Footer Cover */}
              <div className="text-center space-y-1 font-sans font-bold uppercase pb-4">
                <p className="text-xs sm:text-sm">{school.dinasPendidikan}</p>
                <p className="text-xs sm:text-sm">{school.kabKota}</p>
                <p className="text-xs sm:text-sm">TAHUN {school.tahunAnggaran}</p>
              </div>
            </div>
          )}

          {/* ========================================================
              2. FORM PENGISIAN MASTER DATA
             ======================================================== */}
          {(docType === 'ALL' || docType === 'COVER') && (
            <div
              className="page-break bg-white p-12 font-sans text-xs space-y-6 border border-slate-300 print:border-none"
              style={{ minHeight: `${activeDim.heightMm}mm` }}
            >
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-900 text-center border-b border-slate-400 pb-2">
                FORM PENGISIAN DATA MASTER KEGIATAN
              </h3>

              <div className="space-y-2.5 max-w-lg mx-auto bg-amber-50/40 p-6 rounded border border-amber-200">
                <div className="grid grid-cols-12 gap-1 py-1 border-b border-amber-100">
                  <span className="col-span-5 font-semibold text-slate-700">Program</span>
                  <span className="col-span-1">:</span>
                  <span className="col-span-6 font-bold text-slate-900">{school.program}</span>
                </div>
                <div className="grid grid-cols-12 gap-1 py-1 border-b border-amber-100">
                  <span className="col-span-5 font-semibold text-slate-700">Pekerjaan</span>
                  <span className="col-span-1">:</span>
                  <span className="col-span-6 font-bold text-slate-900">{school.pekerjaan}</span>
                </div>
                <div className="grid grid-cols-12 gap-1 py-1 border-b border-amber-100">
                  <span className="col-span-5 font-semibold text-slate-700">NPSN</span>
                  <span className="col-span-1">:</span>
                  <span className="col-span-6 font-mono font-bold text-slate-900">{school.npsn}</span>
                </div>
                <div className="grid grid-cols-12 gap-1 py-1 border-b border-amber-100">
                  <span className="col-span-5 font-semibold text-slate-700">Nama Sekolah</span>
                  <span className="col-span-1">:</span>
                  <span className="col-span-6 font-bold text-slate-900">{school.namaSekolah}</span>
                </div>
                <div className="grid grid-cols-12 gap-1 py-1 border-b border-amber-100">
                  <span className="col-span-5 font-semibold text-slate-700">Kab / Kota</span>
                  <span className="col-span-1">:</span>
                  <span className="col-span-6 text-slate-900">{school.kabKota}</span>
                </div>
                <div className="grid grid-cols-12 gap-1 py-1 border-b border-amber-100">
                  <span className="col-span-5 font-semibold text-slate-700">Provinsi</span>
                  <span className="col-span-1">:</span>
                  <span className="col-span-6 text-slate-900">{school.provinsi}</span>
                </div>
                <div className="grid grid-cols-12 gap-1 py-1 border-b border-amber-100">
                  <span className="col-span-5 font-semibold text-slate-700">Nama Kepala Sekolah</span>
                  <span className="col-span-1">:</span>
                  <span className="col-span-6 font-bold text-slate-900">{school.namaKepalaSekolah}</span>
                </div>
                <div className="grid grid-cols-12 gap-1 py-1 border-b border-amber-100">
                  <span className="col-span-5 font-semibold text-slate-700">NIP Kepala Sekolah</span>
                  <span className="col-span-1">:</span>
                  <span className="col-span-6 font-mono text-slate-900">{school.nipKepalaSekolah}</span>
                </div>
                <div className="grid grid-cols-12 gap-1 py-1 border-b border-amber-100">
                  <span className="col-span-5 font-semibold text-slate-700">Perencana Teknis</span>
                  <span className="col-span-1">:</span>
                  <span className="col-span-6 text-slate-900">{school.namaPerencana}</span>
                </div>
                <div className="grid grid-cols-12 gap-1 py-1 border-b border-amber-100">
                  <span className="col-span-5 font-semibold text-slate-700">Pengawas Teknis</span>
                  <span className="col-span-1">:</span>
                  <span className="col-span-6 text-slate-900">{school.namaPengawas}</span>
                </div>
                <div className="grid grid-cols-12 gap-1 py-1 border-b border-amber-100">
                  <span className="col-span-5 font-semibold text-slate-700">Ketua P2SP</span>
                  <span className="col-span-1">:</span>
                  <span className="col-span-6 font-bold text-slate-900">{school.namaKetuaP2SP}</span>
                </div>
                <div className="grid grid-cols-12 gap-1 py-1 border-b border-amber-100">
                  <span className="col-span-5 font-semibold text-slate-700">Bendahara</span>
                  <span className="col-span-1">:</span>
                  <span className="col-span-6 font-bold text-slate-900">{school.namaBendahara}</span>
                </div>
                <div className="grid grid-cols-12 gap-1 py-1 border-b border-amber-100">
                  <span className="col-span-5 font-semibold text-slate-700">Kepala Pelaksana</span>
                  <span className="col-span-1">:</span>
                  <span className="col-span-6 font-bold text-slate-900">{school.namaKepalaPelaksana || school.namaPelaksana}</span>
                </div>
                {school.namaKeamanan && (
                  <div className="grid grid-cols-12 gap-1 py-1 border-b border-amber-100">
                    <span className="col-span-5 font-semibold text-slate-700">Petugas Keamanan</span>
                    <span className="col-span-1">:</span>
                    <span className="col-span-6 font-bold text-slate-900">{school.namaKeamanan}</span>
                  </div>
                )}
                {school.namaFasilitator && (
                  <div className="grid grid-cols-12 gap-1 py-1">
                    <span className="col-span-5 font-semibold text-slate-700">Fasilitator Teknis</span>
                    <span className="col-span-1">:</span>
                    <span className="col-span-6 font-bold text-slate-900">{school.namaFasilitator}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================
              2B. SURAT KEPUTUSAN (SK) PEMBENTUKAN PANITIA P2SP
             ======================================================== */}
          {(docType === 'ALL' || docType === 'SK_P2SP') && (
            <div
              className="page-break bg-white p-10 font-serif text-[11px] leading-relaxed space-y-4 border border-slate-300 print:border-none"
              style={{ minHeight: `${activeDim.heightMm}mm` }}
            >
              {/* Kop Surat */}
              <StandardKopSurat school={school} />

              {/* Judul & Nomor SK */}
              <div className="text-center space-y-1 pt-1">
                <h3 className="font-bold uppercase tracking-wider text-xs underline font-sans">
                  SURAT KEPUTUSAN KEPALA {school.namaSekolah}
                </h3>
                <p className="font-sans text-[10px] font-semibold">
                  NOMOR : {school.nomorSkP2SP || '421.2/028/SK-P2SP/2025'}
                </p>
                <p className="font-bold uppercase text-[10px] pt-0.5">
                  TENTANG
                </p>
                <p className="font-bold uppercase text-[10px] max-w-lg mx-auto font-sans leading-tight">
                  {school.tentangSkP2SP || 'PEMBENTUKAN PANITIA PEMBANGUNAN SATUAN PENDIDIKAN (P2SP) PELAKSANA BANTUAN OPERASIONAL DAK FISIK TAHUN ANGGARAN ' + school.tahunAnggaran}
                </p>
              </div>

              {/* Konsiderans */}
              <div className="space-y-2 text-[10px] leading-normal pt-1">
                <div className="grid grid-cols-12 gap-1">
                  <span className="col-span-2 font-bold font-sans">Menimbang</span>
                  <span className="col-span-1 text-center font-sans">:</span>
                  <div className="col-span-9 space-y-1">
                    <p>a. bahwa dalam rangka peningkatan mutu sarana dan prasarana pendidikan melalui program {school.program} pekerjaan {school.pekerjaan};</p>
                    <p>b. bahwa agar pelaksanaan swakelola pembangunan berjalan tertib, tepat waktu, transparan, akuntabel, dan sesuai Petunjuk Teknis, perlu dibentuk Panitia Pembangunan Satuan Pendidikan (P2SP);</p>
                    <p>c. bahwa nama-nama yang tercantum dalam Lampiran Keputusan ini dipandang cakap dan memenuhi syarat untuk ditetapkan sebagai Panitia P2SP.</p>
                  </div>
                </div>

                <div className="grid grid-cols-12 gap-1">
                  <span className="col-span-2 font-bold font-sans">Mengingat</span>
                  <span className="col-span-1 text-center font-sans">:</span>
                  <div className="col-span-9 space-y-0.5 text-[9.5px]">
                    <p>1. Undang-Undang Nomor 20 Tahun 2003 tentang Sistem Pendidikan Nasional;</p>
                    <p>2. Peraturan Presiden Nomor 16 Tahun 2018 jo. Perpres No. 12 Tahun 2021 tentang Pengadaan Barang/Jasa Pemerintah;</p>
                    <p>3. Permendikbudristek tentang Petunjuk Operasional Pengelolaan DAK Fisik Bidang Pendidikan Tahun {school.tahunAnggaran};</p>
                    <p>4. Dokumen Pelaksanaan Anggaran (DPA) Satuan Pendidikan Tahun Anggaran {school.tahunAnggaran}.</p>
                  </div>
                </div>

                <div className="text-center font-bold uppercase font-sans text-[10px] pt-1 tracking-wider">
                  MEMUTUSKAN :
                </div>

                <div className="grid grid-cols-12 gap-1">
                  <span className="col-span-2 font-bold font-sans">Menetapkan</span>
                  <span className="col-span-1 text-center font-sans">:</span>
                  <div className="col-span-9 space-y-1.5">
                    <p><strong>KESATU : </strong>Membentuk Panitia Pembangunan Satuan Pendidikan (P2SP) pada {school.namaSekolah} Tahun Anggaran {school.tahunAnggaran} dengan susunan personalia sebagaimana tercantum dalam Lampiran Keputusan ini.</p>
                    <p><strong>KEDUA : </strong>Panitia sebagaimana dimaksud Diktum KESATU bertugas merencanakan, melaksanakan, mengawasi, serta mempertanggungjawabkan pelaksanaan fisik dan administrasi keuangan secara swakelola.</p>
                    <p><strong>KETIGA : </strong>Segala biaya yang timbul dibebankan pada Anggaran Bantuan Pemerintah DAK Fisik Tahun Anggaran {school.tahunAnggaran}.</p>
                    <p><strong>KEEMPAT : </strong>Keputusan ini mulai berlaku sejak tanggal ditetapkan.</p>
                  </div>
                </div>
              </div>

              {/* Tanda Tangan */}
              <div className="pt-4 flex justify-end font-sans text-[10px]">
                <div className="text-center w-64 space-y-0.5">
                  <p>Ditetapkan di : {school.kabKota}</p>
                  <p>Pada tanggal : {school.tanggalSkP2SP || '15 Juli 2025'}</p>
                  <p className="font-bold uppercase pt-1">Kepala {school.namaSekolah}</p>
                  <div className="h-14" />
                  <p className="font-bold uppercase underline">{school.namaKepalaSekolah}</p>
                  <p className="font-mono text-[9px]">NIP. {school.nipKepalaSekolah}</p>
                </div>
              </div>

              {/* Lampiran Susunan Personalia */}
              <div className="pt-4 border-t border-black font-sans space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-[9px]">LAMPIRAN : KEPUTUSAN KEPALA {school.namaSekolah}</span>
                  <span className="text-[9px] font-mono">NOMOR : {school.nomorSkP2SP || '421.2/028/SK-P2SP/2025'}</span>
                </div>
                <h4 className="text-center font-bold uppercase text-[10px]">
                  SUSUNAN PERSONALIA PANITIA PEMBANGUNAN SATUAN PENDIDIKAN (P2SP)
                </h4>

                <table className="w-full border-collapse border border-black text-[9px]">
                  <thead>
                    <tr className="bg-slate-100 text-center font-bold">
                      <th className="border border-black p-1 w-6">NO</th>
                      <th className="border border-black p-1 text-left">JABATAN DALAM PANITIA</th>
                      <th className="border border-black p-1 text-left">NAMA LENGKAP</th>
                      <th className="border border-black p-1 text-left">UNSUR / KETERANGAN</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-black p-1.5 text-center font-mono font-bold">1</td>
                      <td className="border border-black p-1.5 font-bold">Penanggung Jawab</td>
                      <td className="border border-black p-1.5 font-bold uppercase">{school.namaKepalaSekolah}</td>
                      <td className="border border-black p-1.5">Kepala Satuan Pendidikan (NIP. {school.nipKepalaSekolah || '-'})</td>
                    </tr>
                    <tr>
                      <td className="border border-black p-1.5 text-center font-mono font-bold">2</td>
                      <td className="border border-black p-1.5 font-bold">Ketua Panitia (P2SP)</td>
                      <td className="border border-black p-1.5 font-bold uppercase">{school.namaKetuaP2SP}</td>
                      <td className="border border-black p-1.5">{school.unsurKetuaP2SP || 'Komite Sekolah'}</td>
                    </tr>
                    <tr>
                      <td className="border border-black p-1.5 text-center font-mono font-bold">3</td>
                      <td className="border border-black p-1.5 font-bold">Sekretaris</td>
                      <td className="border border-black p-1.5 uppercase font-semibold">{school.namaSekretaris || 'SEKRETARIS'}</td>
                      <td className="border border-black p-1.5">{school.jabatanSekretaris || 'Sekretaris P2SP'}</td>
                    </tr>
                    <tr>
                      <td className="border border-black p-1.5 text-center font-mono font-bold">4</td>
                      <td className="border border-black p-1.5 font-bold">Bendahara</td>
                      <td className="border border-black p-1.5 uppercase font-semibold">{school.namaBendahara || 'BENDAHARA'}</td>
                      <td className="border border-black p-1.5">Bendahara P2SP (NIP. {school.nipBendahara || '-'})</td>
                    </tr>
                    <tr>
                      <td className="border border-black p-1.5 text-center font-mono font-bold">5</td>
                      <td className="border border-black p-1.5 font-bold">Kepala Pelaksana</td>
                      <td className="border border-black p-1.5 uppercase font-semibold">{school.namaKepalaPelaksana || school.namaPelaksana || 'KEPALA PELAKSANA'}</td>
                      <td className="border border-black p-1.5">{school.jabatanPelaksana || 'Kepala Pelaksana Lapangan / Mandor Konstruksi'}</td>
                    </tr>
                    <tr>
                      <td className="border border-black p-1.5 text-center font-mono font-bold">6</td>
                      <td className="border border-black p-1.5 font-bold">Petugas Keamanan</td>
                      <td className="border border-black p-1.5 uppercase font-semibold">{school.namaKeamanan || 'PETUGAS KEAMANAN'}</td>
                      <td className="border border-black p-1.5">{school.jabatanKeamanan || 'Petugas Keamanan'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ========================================================
              2B2. SURAT KEPUTUSAN (SK) TIM TEKNIS PELAKSANA
             ======================================================== */}
          {(docType === 'ALL' || docType === 'SK_TIM_TEKNIS') && (
            <SkTimTeknisDocument school={school} />
          )}

          {/* ========================================================
              2C. BAGAN STRUKTUR ORGANISASI PANITIA P2SP
             ======================================================== */}
          {(docType === 'ALL' || docType === 'BAGAN_STRUKTUR') && (
            <div
              className="page-break bg-white p-8 font-sans text-slate-900 space-y-5 border border-slate-300 print:border-none"
              style={{ minHeight: `${activeDim.heightMm}mm` }}
            >
              {/* Header Bagan */}
              <div className="text-center border-b-2 border-black pb-2 space-y-0.5">
                <p className="font-bold text-[10px] uppercase">{school.dinasPendidikan || 'DINAS PENDIDIKAN DAN KEBUDAYAAN'}</p>
                <h3 className="text-sm font-black uppercase tracking-wider text-black">
                  BAGAN STRUKTUR ORGANISASI PANITIA PEMBANGUNAN SATUAN PENDIDIKAN (P2SP)
                </h3>
                <p className="text-[10px] font-bold text-slate-800">
                  {school.namaSekolah} • TAHUN ANGGARAN {school.tahunAnggaran}
                </p>
                <p className="text-[9px] text-slate-600">
                  Pekerjaan: {school.pekerjaan} • SK No: {school.nomorSkP2SP || '421.2/028/SK-P2SP/2025'}
                </p>
              </div>

              {/* Organizational Tree Chart for Print */}
              <div className="flex flex-col items-center pt-2 space-y-1">

                {/* Level 1: PENANGGUNG JAWAB & FASILITATOR TEKNIS */}
                <div className="w-full flex items-center justify-center relative">
                  {/* Wing Kiri: FASILITATOR TEKNIS / PENDAMPING */}
                  <div className="w-48 border border-black p-1.5 text-center rounded bg-slate-50">
                    <span className="font-bold uppercase text-[8.5px] block bg-slate-200 border-b border-black pb-0.5 mb-1 text-black">
                      FASILITATOR TEKNIS
                    </span>
                    <p className="font-bold text-[10px] uppercase">{school.namaFasilitator || 'Fasilitator Teknis'}</p>
                    <p className="text-[8px] text-slate-600">
                      {school.jabatanFasilitator || 'Fasilitator Teknis / Pendamping Dinas'}
                      {school.nipFasilitator ? ` (NIP. ${school.nipFasilitator})` : ''}
                    </p>
                  </div>

                  {/* Horizontal dash arm */}
                  <div className="w-6 h-0.5 bg-black border-t border-dashed border-black" />

                  {/* Node Utama: PENANGGUNG JAWAB */}
                  <div className="w-64 border-2 border-black p-2 text-center rounded bg-slate-100">
                    <span className="font-bold uppercase text-[9px] tracking-wider block bg-black text-white py-0.5 mb-1">
                      PENANGGUNG JAWAB
                    </span>
                    <p className="font-black text-[11px] uppercase">{school.namaKepalaSekolah}</p>
                    <p className="text-[9px] font-mono">NIP. {school.nipKepalaSekolah || '-'}</p>
                    <p className="text-[8.5px] italic text-slate-600">Kepala Satuan Pendidikan {school.namaSekolah}</p>
                  </div>

                  {/* Horizontal dash arm (spacer) */}
                  <div className="w-6 h-0.5 bg-transparent" />
                  <div className="w-48 invisible" />
                </div>

                {/* Vertical Line */}
                <div className="w-0.5 h-6 bg-black" />

                {/* Level 2: KETUA & STAFF WINGS (Sekretaris & Bendahara) */}
                <div className="w-full flex items-center justify-center">
                  {/* Wing Kiri: SEKRETARIS */}
                  <div className="w-48 border border-black p-1.5 text-center rounded bg-slate-50">
                    <span className="font-bold uppercase text-[8.5px] block border-b border-black pb-0.5 mb-1">
                      SEKRETARIS
                    </span>
                    <p className="font-bold text-[10px] uppercase">{school.namaSekretaris || 'SEKRETARIS'}</p>
                    <p className="text-[8px] text-slate-600">{school.jabatanSekretaris || 'Sekretaris P2SP'}</p>
                    <p className="text-[7.5px] text-slate-500 mt-0.5">Administrasi & Notulensi</p>
                  </div>

                  {/* Horizontal dash arm */}
                  <div className="w-6 h-0.5 bg-black border-t border-dashed border-black" />

                  {/* Node Tengah: KETUA P2SP */}
                  <div className="w-64 border-2 border-black p-2 text-center rounded bg-slate-100">
                    <span className="font-bold uppercase text-[9px] tracking-wider block bg-black text-white py-0.5 mb-1">
                      KETUA PANITIA (P2SP)
                    </span>
                    <p className="font-black text-[11px] uppercase">{school.namaKetuaP2SP}</p>
                    <p className="text-[8.5px] font-semibold text-slate-800">{school.jabatanKetuaP2SP || 'Ketua Komite Sekolah'}</p>
                    <p className="text-[8px] text-slate-600">Unsur: {school.unsurKetuaP2SP || 'Komite / Tokoh Masyarakat'}</p>
                  </div>

                  {/* Horizontal dash arm */}
                  <div className="w-6 h-0.5 bg-black border-t border-dashed border-black" />

                  {/* Wing Kanan: BENDAHARA */}
                  <div className="w-48 border border-black p-1.5 text-center rounded bg-slate-50">
                    <span className="font-bold uppercase text-[8.5px] block border-b border-black pb-0.5 mb-1">
                      BENDAHARA
                    </span>
                    <p className="font-bold text-[10px] uppercase">{school.namaBendahara || 'BENDAHARA'}</p>
                    <p className="text-[8px] font-mono text-slate-600">{school.nipBendahara ? 'NIP. ' + school.nipBendahara : 'Bendahara P2SP'}</p>
                    <p className="text-[7.5px] text-slate-500 mt-0.5">Keuangan, BKU & Kwitansi</p>
                  </div>
                </div>

                {/* Vertical Central Line down to Teams */}
                <div className="w-0.5 h-6 bg-black" />

                {/* Horizontal Bar for 3 operational blocks */}
                <div className="w-[88%] h-0.5 bg-black relative">
                  <div className="absolute left-0 top-0 w-0.5 h-4 bg-black" />
                  <div className="absolute left-1/2 -translate-x-1/2 top-0 w-0.5 h-4 bg-black" />
                  <div className="absolute right-0 top-0 w-0.5 h-4 bg-black" />
                </div>

                {/* Level 3: 3 PILAR TEKNIS & OPERASIONAL */}
                <div className="w-full grid grid-cols-3 gap-3 pt-4 text-left">
                  {/* 1. TIM TEKNIS PERENCANA */}
                  <div className="border border-black p-2 rounded bg-slate-50 flex flex-col justify-between">
                    <div>
                      <span className="font-bold uppercase text-[8.5px] block bg-slate-200 text-black px-1 py-0.5 text-center border-b border-black mb-1.5">
                        TIM TEKNIS PERENCANA
                      </span>
                      <div>
                        <span className="text-[7.5px] text-slate-500 uppercase font-bold block">Penanggung Jawab:</span>
                        <p className="font-bold text-[10px] uppercase">{school.namaPerencana}</p>
                        <p className="text-[8px] text-slate-600">{school.jabatanPerencana || 'Arsitek / Tenaga Ahli Perencana Teknis'}</p>
                      </div>
                      <div className="mt-1.5 pt-1 border-t border-slate-200">
                        <span className="text-[7.5px] text-slate-500 uppercase font-bold block">Anggota Tim:</span>
                        <p className="text-[8.5px] font-semibold">{school.anggotaPerencana || 'Rahmat Hidayat, A.Md (Asisten Teknis)'}</p>
                      </div>
                    </div>
                    <div className="mt-2 pt-1 border-t border-slate-300 text-[7.5px] text-slate-600">
                      Tugas: Gambar Denah, RAB/RPD, Kurva S
                    </div>
                  </div>

                  {/* 2. TIM TEKNIS PENGAWAS */}
                  <div className="border border-black p-2 rounded bg-slate-50 flex flex-col justify-between">
                    <div>
                      <span className="font-bold uppercase text-[8.5px] block bg-slate-200 text-black px-1 py-0.5 text-center border-b border-black mb-1.5">
                        TIM TEKNIS PENGAWAS
                      </span>
                      <div>
                        <span className="text-[7.5px] text-slate-500 uppercase font-bold block">Penanggung Jawab:</span>
                        <p className="font-bold text-[10px] uppercase">{school.namaPengawas}</p>
                        <p className="text-[8px] text-slate-600">{school.jabatanPengawas || 'Tenaga Ahli Pengawas Lapangan'}</p>
                      </div>
                      <div className="mt-1.5 pt-1 border-t border-slate-200">
                        <span className="text-[7.5px] text-slate-500 uppercase font-bold block">Anggota Tim:</span>
                        <p className="text-[8.5px] font-semibold">{school.anggotaPengawas || 'H. Mansyur (Unsur Masyarakat / Komite)'}</p>
                      </div>
                    </div>
                    <div className="mt-2 pt-1 border-t border-slate-300 text-[7.5px] text-slate-600">
                      Tugas: Mutu Bahan, Opname Prestasi Fisik Mingguan
                    </div>
                  </div>

                  {/* 3. TIM PELAKSANA LAPANGAN */}
                  <div className="border border-black p-2 rounded bg-slate-50 flex flex-col justify-between">
                    <div>
                      <span className="font-bold uppercase text-[8.5px] block bg-slate-200 text-black px-1 py-0.5 text-center border-b border-black mb-1.5">
                        TIM PELAKSANA LAPANGAN
                      </span>
                      <div>
                        <span className="text-[7.5px] text-slate-500 uppercase font-bold block">Kepala Pelaksana / Mandor:</span>
                        <p className="font-bold text-[10px] uppercase">{school.namaKepalaPelaksana || school.namaPelaksana || 'KEPALA PELAKSANA'}</p>
                        <p className="text-[8px] text-slate-600">{school.jabatanPelaksana || 'Kepala Pelaksana Lapangan / Mandor Konstruksi'}</p>
                      </div>
                      
                      {/* Sub-staff Lapangan */}
                      <div className="mt-1.5 pt-1 border-t border-slate-200 space-y-1 text-[8px]">
                        <div>
                          <span className="font-bold block text-[7.5px] text-slate-500">Petugas Keamanan:</span>
                          <p className="font-semibold text-[8.5px] uppercase">{school.namaKeamanan || 'PETUGAS KEAMANAN'}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          <div>
                            <span className="font-bold block text-[7.5px] text-slate-500">Logistik & Bahan:</span>
                            <p className="font-semibold">{school.namaLogistik || 'Kamaruddin'}</p>
                          </div>
                          <div>
                            <span className="font-bold block text-[7.5px] text-slate-500">Mandor Tukang:</span>
                            <p className="font-semibold">{school.namaMandor || 'Budiman'}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 pt-1 border-t border-slate-300 text-[7.5px] text-slate-600">
                      Tugas: Pekerjaan Fisik, Logistik, Keamanan & Buku Harian
                    </div>
                  </div>
                </div>

              </div>

              {/* Legenda & Tanda Tangan Pengesahan Bagan */}
              <div className="pt-6 grid grid-cols-2 gap-4 text-[9px] border-t border-black">
                <div className="space-y-1">
                  <p className="font-bold">Keterangan Garis Hubungan Kerja:</p>
                  <p>─── : Garis Komando / Pengarahan</p>
                  <p>┄┄┄ : Garis Koordinasi & Konsultasi Teknis</p>
                </div>
                <div className="text-center space-y-0.5">
                  <p>Ditetapkan di: {school.kabKota}, {school.tanggalSkP2SP || '15 Juli 2025'}</p>
                  <p className="font-bold uppercase">Kepala Satuan Pendidikan</p>
                  <div className="h-12" />
                  <p className="font-bold uppercase underline">{school.namaKepalaSekolah}</p>
                  <p className="font-mono text-[8.5px]">NIP. {school.nipKepalaSekolah}</p>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================
              3. RENCANA PENGGUNAAN DANA (RPD)
             ======================================================== */}
          {(docType === 'ALL' || docType === 'RPD') && (
            <div
              className="page-break bg-white p-8 font-sans text-[10px] space-y-4 border border-slate-300 print:border-none"
              style={{ minHeight: `${activeDim.heightMm}mm` }}
            >
              <div className="text-center font-bold uppercase space-y-1">
                <h3 className="text-xs">RENCANA PENGGUNAAN DANA (RPD)</h3>
                <h4 className="text-xs">{school.pekerjaan}</h4>
              </div>

              <div className="space-y-0.5 text-[10px]">
                <p>Nama Satuan Pendidikan : <strong>{school.namaSekolah}</strong></p>
                <p>Alamat : {school.alamat}, {school.kabKota}</p>
                <p>Periode Waktu Penggunaan Dana : {school.periodePenggunaan}</p>
              </div>

              <table className="w-full border-collapse border border-black text-[9px]">
                <thead>
                  <tr className="bg-slate-100 text-center font-bold">
                    <th rowSpan={2} className="border border-black p-1 w-6">NO</th>
                    <th rowSpan={2} className="border border-black p-1 text-left">URAIAN</th>
                    <th rowSpan={2} className="border border-black p-1 w-12">VOLUME 100%</th>
                    <th colSpan={2} className="border border-black p-1">TERMIN (70%)</th>
                    <th colSpan={2} className="border border-black p-1">TERMIN (30%)</th>
                    <th rowSpan={2} className="border border-black p-1">HARGA SATUAN (Rp)</th>
                    <th colSpan={2} className="border border-black p-1">TERMIN JUMLAH</th>
                    <th rowSpan={2} className="border border-black p-1">JUMLAH ANGGARAN (Rp)</th>
                  </tr>
                  <tr className="bg-slate-100 text-center font-bold">
                    <th className="border border-black p-0.5">VOL</th>
                    <th className="border border-black p-0.5">SAT</th>
                    <th className="border border-black p-0.5">VOL</th>
                    <th className="border border-black p-0.5">SAT</th>
                    <th className="border border-black p-0.5">70%</th>
                    <th className="border border-black p-0.5">30%</th>
                  </tr>
                </thead>
                <tbody>
                  {rpdItems.map((it, idx) => (
                    <tr key={it.id}>
                      <td className="border border-black p-1 text-center font-mono">{idx + 1}</td>
                      <td className="border border-black p-1">{it.uraian}</td>
                      <td className="border border-black p-1 text-right">{formatNumber(it.volume100)}</td>
                      <td className="border border-black p-1 text-right">{formatNumber(it.volumeTermin1)}</td>
                      <td className="border border-black p-1 text-center">{it.satuan}</td>
                      <td className="border border-black p-1 text-right">{formatNumber(it.volumeTermin2)}</td>
                      <td className="border border-black p-1 text-center">{it.satuan}</td>
                      <td className="border border-black p-1 text-right font-mono">{formatRupiah(it.hargaSatuan, false)}</td>
                      <td className="border border-black p-1 text-right font-mono">{formatRupiah(it.jumlahTermin1, false)}</td>
                      <td className="border border-black p-1 text-right font-mono">{formatRupiah(it.jumlahTermin2, false)}</td>
                      <td className="border border-black p-1 text-right font-mono font-bold">{formatRupiah(it.jumlahAnggaran, false)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-bold bg-slate-100">
                    <td colSpan={8} className="border border-black p-1 text-right uppercase">JUMLAH TOTAL:</td>
                    <td className="border border-black p-1 text-right font-mono">
                      {formatRupiah(rpdItems.reduce((s, i) => s + i.jumlahTermin1, 0), false)}
                    </td>
                    <td className="border border-black p-1 text-right font-mono">
                      {formatRupiah(rpdItems.reduce((s, i) => s + i.jumlahTermin2, 0), false)}
                    </td>
                    <td className="border border-black p-1 text-right font-mono">
                      {formatRupiah(rpdItems.reduce((s, i) => s + i.jumlahAnggaran, 0), false)}
                    </td>
                  </tr>
                </tfoot>
              </table>

              {/* 4 Signatures */}
              <div className="grid grid-cols-4 gap-2 pt-6 text-center text-[9px] font-sans print-avoid-break print-signature-block">
                <div>
                  <p>Menyetujui,</p>
                  <p className="font-bold">Ketua P2SP</p>
                  <div className="h-12" />
                  <p className="font-bold underline uppercase">{school.namaKetuaP2SP}</p>
                </div>
                <div>
                  <p>&nbsp;</p>
                  <p className="font-bold">Tim Teknis (Perencana)</p>
                  <div className="h-12" />
                  <p className="font-bold underline">{school.namaPerencana}</p>
                </div>
                <div>
                  <p>&nbsp;</p>
                  <p className="font-bold">Tim Teknis (Pengawas)</p>
                  <div className="h-12" />
                  <p className="font-bold underline">{school.namaPengawas}</p>
                </div>
                <div>
                  <p>Mengetahui,</p>
                  <p className="font-bold">Kepala Sekolah</p>
                  <div className="h-12" />
                  <p className="font-bold underline">{school.namaKepalaSekolah}</p>
                  <p>NIP. {school.nipKepalaSekolah}</p>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================
              4. BUKU KAS UMUM (BKU)
             ======================================================== */}
          {(docType === 'ALL' || docType === 'BKU') && (() => {
            // Case A: Custom Filter Active (WEEK or CUSTOM date range)
            if (filterOptions && (filterOptions.filterMode === 'WEEK' || filterOptions.filterMode === 'CUSTOM')) {
              const targetBku = bkuList.filter((b) => {
                const txIso = parseTxDateToIso(b.tanggalObj || b.tanggal, parseInt(school.tahunAnggaran || '2026', 10));
                if (filterOptions.startDate && txIso && txIso < filterOptions.startDate) return false;
                if (filterOptions.endDate && txIso && txIso > filterOptions.endDate) return false;
                return true;
              });

              const totalPenerimaan = targetBku.reduce((s, b) => s + b.penerimaan, 0);
              const totalPengeluaran = targetBku.reduce((s, b) => s + b.pengeluaran, 0);
              const lastBku = targetBku[targetBku.length - 1];
              const saldoPeriode = lastBku?.saldo || (totalPenerimaan - totalPengeluaran);

              const headerSubtitle = filterOptions.filterMode === 'WEEK'
                ? `MINGGU KE-${filterOptions.weekNum || selectedWeekNum || 1} (PERIODE: ${filterOptions.startDate || ''} S.D. ${filterOptions.endDate || ''})`
                : `PERIODE : ${filterOptions.startDate || ''} S.D. ${filterOptions.endDate || ''}`;

              return (
                <div
                  key="bku-custom-filter-sheet"
                  className="page-break bg-white p-8 font-sans text-[10px] space-y-4 border border-slate-300 print:border-none"
                  style={{ minHeight: `${activeDim.heightMm}mm` }}
                >
                  <div className="text-center font-bold uppercase space-y-0.5">
                    <h3 className="text-xs">BUKU KAS UMUM (BKU)</h3>
                    <h4 className="text-xs font-mono">{headerSubtitle}</h4>
                  </div>

                  <div className="space-y-0.5 text-[9px]">
                    <p>NAMA SEKOLAH : <strong>{school.namaSekolah}</strong></p>
                    <p>PEKERJAAN : {school.pekerjaan}</p>
                    <p>LOKASI : {school.lokasi}</p>
                    <p>KOTA / PROPINSI : {school.kabKota} / {school.provinsi}</p>
                  </div>

                  <table className="w-full border-collapse border border-black text-[9px]">
                    <thead>
                      <tr className="bg-slate-100 text-center font-bold">
                        <th colSpan={3} className="border border-black p-1 bg-slate-200">PENERIMAAN</th>
                        <th colSpan={4} className="border border-black p-1 bg-slate-200">PENARIKAN / PENGELUARAN</th>
                        <th rowSpan={2} className="border border-black p-1 w-24">Saldo (Rp)</th>
                      </tr>
                      <tr className="bg-slate-100 text-center font-bold">
                        <th className="border border-black p-1 w-16">Tanggal</th>
                        <th className="border border-black p-1">Uraian</th>
                        <th className="border border-black p-1 w-20">Jumlah (Rp)</th>
                        <th className="border border-black p-1 w-16">Tanggal</th>
                        <th className="border border-black p-1">Uraian</th>
                        <th className="border border-black p-1 w-16">No. Bukti</th>
                        <th className="border border-black p-1 w-20">Jumlah (Rp)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {targetBku.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="border border-black p-4 text-center text-slate-500 italic">
                            Tidak ada transaksi BKU pada periode ini.
                          </td>
                        </tr>
                      ) : (
                        targetBku.map((b) => (
                          <tr key={b.id}>
                            <td className="border border-black p-1 text-center font-mono">
                              {b.jenis === 'PENERIMAAN' ? b.tanggal : '-'}
                            </td>
                            <td className="border border-black p-1">
                              {b.jenis === 'PENERIMAAN' ? b.uraian : '-'}
                            </td>
                            <td className="border border-black p-1 text-right font-mono">
                              {b.penerimaan > 0 ? formatRupiah(b.penerimaan, false) : '-'}
                            </td>
                            <td className="border border-black p-1 text-center font-mono">
                              {b.jenis === 'PENGELUARAN' ? b.tanggal : '-'}
                            </td>
                            <td className="border border-black p-1">
                              {b.jenis === 'PENGELUARAN' ? b.uraian : '-'}
                            </td>
                            <td className="border border-black p-1 text-center font-mono text-[8px]">
                              {b.noBukti || '-'}
                            </td>
                            <td className="border border-black p-1 text-right font-mono">
                              {b.pengeluaran > 0 ? formatRupiah(b.pengeluaran, false) : '-'}
                            </td>
                            <td className="border border-black p-1 text-right font-mono font-bold">
                              {formatRupiah(b.saldo || 0, false)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="font-bold bg-slate-100">
                        <td colSpan={2} className="border border-black p-1 text-right">TOTAL PENERIMAAN:</td>
                        <td className="border border-black p-1 text-right font-mono">{formatRupiah(totalPenerimaan, false)}</td>
                        <td colSpan={3} className="border border-black p-1 text-right">TOTAL PENGELUARAN:</td>
                        <td className="border border-black p-1 text-right font-mono">{formatRupiah(totalPengeluaran, false)}</td>
                        <td className="border border-black p-1 text-right font-mono font-bold">{formatRupiah(saldoPeriode, false)}</td>
                      </tr>
                    </tfoot>
                  </table>

                  {/* Closing Box & Signatures */}
                  {(() => {
                    let bankBal = 0;
                    if (bkbList && bkbList.length > 0) {
                      let r = 0;
                      bkbList.forEach((b) => {
                        r = r + (b.penerimaan || 0) - (b.pengeluaran || 0);
                      });
                      bankBal = Math.max(0, r);
                    }
                    const lastBkt = bktList && bktList.length > 0 ? bktList[bktList.length - 1] : null;
                    const tunaiBal = lastBkt ? (lastBkt.saldo || 0) : Math.max(0, saldoPeriode - bankBal);
                    return (
                      <div className="border border-black p-3 text-[9px] space-y-1 print-avoid-break print-closing-box">
                        <p>Pada hari ini Buku Kas Umum ditutup dengan keadaan/posisi buku sebagai berikut :</p>
                        <div className="grid grid-cols-12 gap-1 font-semibold">
                          <span className="col-span-4">Saldo buku Kas Umum</span>
                          <span className="col-span-1">:</span>
                          <span className="col-span-7 font-mono">{formatRupiah(saldoPeriode)}</span>
                        </div>
                        <div className="grid grid-cols-12 gap-1">
                          <span className="col-span-4">Terdiri dari :</span>
                        </div>
                        <div className="grid grid-cols-12 gap-1 pl-4">
                          <span className="col-span-4">- Saldo BANK</span>
                          <span className="col-span-1">:</span>
                          <span className="col-span-7 font-mono">{formatRupiah(bankBal)}</span>
                        </div>
                        <div className="grid grid-cols-12 gap-1 pl-4">
                          <span className="col-span-4">- Saldo Kas Tunai</span>
                          <span className="col-span-1">:</span>
                          <span className="col-span-7 font-mono">{formatRupiah(tunaiBal)}</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* 3 Signatures */}
                  <div className="grid grid-cols-3 gap-4 pt-6 text-center text-[9px] font-sans print-avoid-break print-signature-block">
                    <div>
                      <p>Menyetujui:</p>
                      <p className="font-bold">Kepala Sekolah</p>
                      <div className="h-12" />
                      <p className="font-bold underline">{school.namaKepalaSekolah}</p>
                      <p>NIP. {school.nipKepalaSekolah}</p>
                    </div>
                    <div>
                      <p>&nbsp;</p>
                      <p className="font-bold">Ketua P2SP</p>
                      <div className="h-12" />
                      <p className="font-bold underline uppercase">{school.namaKetuaP2SP}</p>
                    </div>
                    <div>
                      <p>{school.kabKota}, Periode Penutupan Kas</p>
                      <p className="font-bold">Bendahara</p>
                      <div className="h-12" />
                      <p className="font-bold underline uppercase">{school.namaBendahara}</p>
                      <p>NIP. {school.nipBendahara}</p>
                    </div>
                  </div>
                </div>
              );
            }

            // Case B: Standard Monthly / All Months View
            const targetMonth = filterOptions?.month || selectedMonth;
            return months.map((monthName) => {
              if (targetMonth && targetMonth !== 'ALL' && targetMonth !== monthName) {
                return null;
              }
              const monthlyBku = bkuList.filter((b) => b.bulan === monthName);
              if (monthlyBku.length === 0) return null;

              const totalPenerimaan = monthlyBku.reduce((s, b) => s + b.penerimaan, 0);
              const totalPengeluaran = monthlyBku.reduce((s, b) => s + b.pengeluaran, 0);
              const lastBku = monthlyBku[monthlyBku.length - 1];
              const saldoBulan = lastBku?.saldo || 0;

              return (
                <div
                  key={`bku-${monthName}`}
                  className="page-break bg-white p-8 font-sans text-[10px] space-y-4 border border-slate-300 print:border-none"
                  style={{ minHeight: `${activeDim.heightMm}mm` }}
                >
                  <div className="text-center font-bold uppercase space-y-0.5">
                    <h3 className="text-xs">BUKU KAS UMUM</h3>
                    <h4 className="text-xs font-mono">BULAN : {monthName.toUpperCase()}</h4>
                  </div>

                  <div className="space-y-0.5 text-[9px]">
                    <p>NAMA SEKOLAH : <strong>{school.namaSekolah}</strong></p>
                    <p>PEKERJAAN : {school.pekerjaan}</p>
                    <p>LOKASI : {school.lokasi}</p>
                    <p>KOTA / PROPINSI : {school.kabKota} / {school.provinsi}</p>
                  </div>

                  <table className="w-full border-collapse border border-black text-[9px]">
                    <thead>
                      <tr className="bg-slate-100 text-center font-bold">
                        <th colSpan={3} className="border border-black p-1 bg-slate-200">PENERIMAAN</th>
                        <th colSpan={4} className="border border-black p-1 bg-slate-200">PENARIKAN / PENGELUARAN</th>
                        <th rowSpan={2} className="border border-black p-1 w-24">Saldo (Rp)</th>
                      </tr>
                      <tr className="bg-slate-100 text-center font-bold">
                        <th className="border border-black p-1 w-16">Tanggal</th>
                        <th className="border border-black p-1">Uraian</th>
                        <th className="border border-black p-1 w-20">Jumlah (Rp)</th>
                        <th className="border border-black p-1 w-16">Tanggal</th>
                        <th className="border border-black p-1">Uraian</th>
                        <th className="border border-black p-1 w-16">No. Bukti</th>
                        <th className="border border-black p-1 w-20">Jumlah (Rp)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyBku.map((b) => (
                        <tr key={b.id}>
                          <td className="border border-black p-1 text-center font-mono">
                            {b.jenis === 'PENERIMAAN' ? b.tanggal : '-'}
                          </td>
                          <td className="border border-black p-1">
                            {b.jenis === 'PENERIMAAN' ? b.uraian : '-'}
                          </td>
                          <td className="border border-black p-1 text-right font-mono">
                            {b.penerimaan > 0 ? formatRupiah(b.penerimaan, false) : '-'}
                          </td>
                          <td className="border border-black p-1 text-center font-mono">
                            {b.jenis === 'PENGELUARAN' ? b.tanggal : '-'}
                          </td>
                          <td className="border border-black p-1">
                            {b.jenis === 'PENGELUARAN' ? b.uraian : '-'}
                          </td>
                          <td className="border border-black p-1 text-center font-mono text-[8px]">
                            {b.noBukti || '-'}
                          </td>
                          <td className="border border-black p-1 text-right font-mono">
                            {b.pengeluaran > 0 ? formatRupiah(b.pengeluaran, false) : '-'}
                          </td>
                          <td className="border border-black p-1 text-right font-mono font-bold">
                            {formatRupiah(b.saldo || 0, false)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-bold bg-slate-100">
                        <td colSpan={2} className="border border-black p-1 text-right">DIBULATKAN:</td>
                        <td className="border border-black p-1 text-right font-mono">{formatRupiah(totalPenerimaan, false)}</td>
                        <td colSpan={3} className="border border-black p-1 text-right">TOTAL PENGELUARAN:</td>
                        <td className="border border-black p-1 text-right font-mono">{formatRupiah(totalPengeluaran, false)}</td>
                        <td className="border border-black p-1 text-right font-mono font-bold">{formatRupiah(saldoBulan, false)}</td>
                      </tr>
                    </tfoot>
                  </table>

                  {/* Closing Box & Signatures */}
                  {(() => {
                    const saldoBankBulan = getBkbSaldoAtMonth(bkbList, monthName);
                    const bktBulan = getBktSaldoAtMonth(bktList, monthName);
                    const saldoTunaiBulan = bktBulan !== undefined ? bktBulan : Math.max(0, saldoBulan - saldoBankBulan);
                    return (
                      <div className="border border-black p-3 text-[9px] space-y-1 print-avoid-break print-closing-box">
                        <p>Pada hari ini Buku Kas Umum ditutup dengan keadaan/posisi buku sebagai berikut :</p>
                        <div className="grid grid-cols-12 gap-1 font-semibold">
                          <span className="col-span-4">Saldo buku Kas Umum</span>
                          <span className="col-span-1">:</span>
                          <span className="col-span-7 font-mono">{formatRupiah(saldoBulan)}</span>
                        </div>
                        <div className="grid grid-cols-12 gap-1">
                          <span className="col-span-4">Terdiri dari :</span>
                        </div>
                        <div className="grid grid-cols-12 gap-1 pl-4">
                          <span className="col-span-4">- Saldo BANK</span>
                          <span className="col-span-1">:</span>
                          <span className="col-span-7 font-mono">{formatRupiah(saldoBankBulan)}</span>
                        </div>
                        <div className="grid grid-cols-12 gap-1 pl-4">
                          <span className="col-span-4">- Saldo Kas Tunai</span>
                          <span className="col-span-1">:</span>
                          <span className="col-span-7 font-mono">{formatRupiah(saldoTunaiBulan)}</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* 3 Signatures */}
                  <div className="grid grid-cols-3 gap-4 pt-6 text-center text-[9px] font-sans print-avoid-break print-signature-block">
                    <div>
                      <p>Menyetujui:</p>
                      <p className="font-bold">Kepala Sekolah</p>
                      <div className="h-12" />
                      <p className="font-bold underline">{school.namaKepalaSekolah}</p>
                      <p>NIP. {school.nipKepalaSekolah}</p>
                    </div>
                    <div>
                      <p>&nbsp;</p>
                      <p className="font-bold">Ketua P2SP</p>
                      <div className="h-12" />
                      <p className="font-bold underline uppercase">{school.namaKetuaP2SP}</p>
                    </div>
                    <div>
                      <p>{school.kabKota}, Akhir {monthName}</p>
                      <p className="font-bold">Bendahara</p>
                      <div className="h-12" />
                      <p className="font-bold underline uppercase">{school.namaBendahara}</p>
                      <p>NIP. {school.nipBendahara}</p>
                    </div>
                  </div>
                </div>
              );
            });
          })()}

          {/* ========================================================
              4B. BUKU PEMBANTU KAS TUNAI (BKT)
             ======================================================== */}
          {(docType === 'ALL' || docType === 'BKT') && (() => {
            if (filterOptions && (filterOptions.filterMode === 'WEEK' || filterOptions.filterMode === 'CUSTOM')) {
              const targetBkt = bktList.filter((b) => {
                const txIso = parseTxDateToIso(b.tanggalObj || b.tanggal, parseInt(school.tahunAnggaran || '2026', 10));
                if (filterOptions.startDate && txIso && txIso < filterOptions.startDate) return false;
                if (filterOptions.endDate && txIso && txIso > filterOptions.endDate) return false;
                return true;
              });

              const totalDebet = targetBkt.reduce((s, b) => s + b.pemasukan, 0);
              const totalKredit = targetBkt.reduce((s, b) => s + b.pengeluaran, 0);
              const lastBkt = targetBkt[targetBkt.length - 1];
              const saldoPeriode = lastBkt?.saldo || (totalDebet - totalKredit);

              const headerSubtitle = filterOptions.filterMode === 'WEEK'
                ? `MINGGU KE-${filterOptions.weekNum || selectedWeekNum || 1} (PERIODE: ${filterOptions.startDate || ''} S.D. ${filterOptions.endDate || ''})`
                : `PERIODE : ${filterOptions.startDate || ''} S.D. ${filterOptions.endDate || ''}`;

              return (
                <div
                  key="bkt-custom-filter-sheet"
                  className="page-break bg-white p-8 font-sans text-[10px] space-y-4 border border-slate-300 print:border-none"
                  style={{ minHeight: `${activeDim.heightMm}mm` }}
                >
                  <div className="text-center font-bold uppercase space-y-0.5">
                    <h3 className="text-xs">BUKU PEMBANTU KAS TUNAI (BKT)</h3>
                    <h4 className="text-xs font-mono">{headerSubtitle}</h4>
                  </div>

                  <div className="space-y-0.5 text-[9px]">
                    <p>NAMA SEKOLAH : <strong>{school.namaSekolah}</strong></p>
                    <p>PEKERJAAN : {school.pekerjaan}</p>
                    <p>LOKASI : {school.lokasi}</p>
                    <p>KOTA / PROPINSI : {school.kabKota} / {school.provinsi}</p>
                  </div>

                  <table className="w-full border-collapse border border-black text-[9px]">
                    <thead>
                      <tr className="bg-slate-100 text-center font-bold">
                        <th className="border border-black p-1 w-8">No</th>
                        <th className="border border-black p-1 w-16">Tanggal</th>
                        <th className="border border-black p-1">Uraian Transaksi Kas</th>
                        <th className="border border-black p-1 w-16">No. Bukti</th>
                        <th className="border border-black p-1 w-24">Debet / Masuk (Rp)</th>
                        <th className="border border-black p-1 w-24">Kredit / Keluar (Rp)</th>
                        <th className="border border-black p-1 w-24">Saldo (Rp)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {targetBkt.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="border border-black p-4 text-center text-slate-500 italic">
                            Tidak ada transaksi kas tunai pada periode ini.
                          </td>
                        </tr>
                      ) : (
                        targetBkt.map((b, idx) => (
                          <tr key={b.id}>
                            <td className="border border-black p-1 text-center font-mono">{idx + 1}</td>
                            <td className="border border-black p-1 text-center font-mono">{b.tanggal}</td>
                            <td className="border border-black p-1">{b.uraian}</td>
                            <td className="border border-black p-1 text-center font-mono text-[8px]">{b.noBukti || '-'}</td>
                            <td className="border border-black p-1 text-right font-mono">
                              {b.pemasukan > 0 ? formatRupiah(b.pemasukan, false) : '-'}
                            </td>
                            <td className="border border-black p-1 text-right font-mono">
                              {b.pengeluaran > 0 ? formatRupiah(b.pengeluaran, false) : '-'}
                            </td>
                            <td className="border border-black p-1 text-right font-mono font-bold">
                              {formatRupiah(b.saldo || 0, false)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="font-bold bg-slate-100">
                        <td colSpan={4} className="border border-black p-1 text-right">TOTAL:</td>
                        <td className="border border-black p-1 text-right font-mono">{formatRupiah(totalDebet, false)}</td>
                        <td className="border border-black p-1 text-right font-mono">{formatRupiah(totalKredit, false)}</td>
                        <td className="border border-black p-1 text-right font-mono font-bold">{formatRupiah(saldoPeriode, false)}</td>
                      </tr>
                    </tfoot>
                  </table>

                  {/* Signatures */}
                  <div className="grid grid-cols-3 gap-4 pt-6 text-center text-[9px] font-sans print-avoid-break print-signature-block">
                    <div>
                      <p>Menyetujui:</p>
                      <p className="font-bold">Kepala Sekolah</p>
                      <div className="h-12" />
                      <p className="font-bold underline">{school.namaKepalaSekolah}</p>
                      <p>NIP. {school.nipKepalaSekolah}</p>
                    </div>
                    <div>
                      <p>&nbsp;</p>
                      <p className="font-bold">Ketua P2SP</p>
                      <div className="h-12" />
                      <p className="font-bold underline uppercase">{school.namaKetuaP2SP}</p>
                    </div>
                    <div>
                      <p>{school.kabKota}, Periode Kas</p>
                      <p className="font-bold">Bendahara</p>
                      <div className="h-12" />
                      <p className="font-bold underline uppercase">{school.namaBendahara}</p>
                      <p>NIP. {school.nipBendahara}</p>
                    </div>
                  </div>
                </div>
              );
            }

            const targetMonth = filterOptions?.month || selectedMonth;
            return months.map((monthName) => {
              if (targetMonth && targetMonth !== 'ALL' && targetMonth !== monthName) {
                return null;
              }
              const monthlyBkt = bktList.filter((b) => b.bulan === monthName);
              if (monthlyBkt.length === 0) return null;

              const totalDebet = monthlyBkt.reduce((s, b) => s + b.pemasukan, 0);
              const totalKredit = monthlyBkt.reduce((s, b) => s + b.pengeluaran, 0);
              const lastBkt = monthlyBkt[monthlyBkt.length - 1];
              const saldoBulan = lastBkt?.saldo || 0;

              return (
                <div
                  key={`bkt-${monthName}`}
                  className="page-break bg-white p-8 font-sans text-[10px] space-y-4 border border-slate-300 print:border-none"
                  style={{ minHeight: `${activeDim.heightMm}mm` }}
                >
                  <div className="text-center font-bold uppercase space-y-0.5">
                    <h3 className="text-xs">BUKU PEMBANTU KAS TUNAI (BKT)</h3>
                    <h4 className="text-xs font-mono">BULAN : {monthName.toUpperCase()}</h4>
                  </div>

                  <div className="space-y-0.5 text-[9px]">
                    <p>NAMA SEKOLAH : <strong>{school.namaSekolah}</strong></p>
                    <p>PEKERJAAN : {school.pekerjaan}</p>
                    <p>LOKASI : {school.lokasi}</p>
                    <p>KOTA / PROPINSI : {school.kabKota} / {school.provinsi}</p>
                  </div>

                  <table className="w-full border-collapse border border-black text-[9px]">
                    <thead>
                      <tr className="bg-slate-100 text-center font-bold">
                        <th className="border border-black p-1 w-8">No</th>
                        <th className="border border-black p-1 w-16">Tanggal</th>
                        <th className="border border-black p-1">Uraian Transaksi Kas</th>
                        <th className="border border-black p-1 w-16">No. Bukti</th>
                        <th className="border border-black p-1 w-24">Debet / Masuk (Rp)</th>
                        <th className="border border-black p-1 w-24">Kredit / Keluar (Rp)</th>
                        <th className="border border-black p-1 w-24">Saldo (Rp)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyBkt.map((b, idx) => (
                        <tr key={b.id}>
                          <td className="border border-black p-1 text-center font-mono">{idx + 1}</td>
                          <td className="border border-black p-1 text-center font-mono">{b.tanggal}</td>
                          <td className="border border-black p-1">{b.uraian}</td>
                          <td className="border border-black p-1 text-center font-mono text-[8px]">{b.noBukti || '-'}</td>
                          <td className="border border-black p-1 text-right font-mono">
                            {b.pemasukan > 0 ? formatRupiah(b.pemasukan, false) : '-'}
                          </td>
                          <td className="border border-black p-1 text-right font-mono">
                            {b.pengeluaran > 0 ? formatRupiah(b.pengeluaran, false) : '-'}
                          </td>
                          <td className="border border-black p-1 text-right font-mono font-bold">
                            {formatRupiah(b.saldo || 0, false)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-bold bg-slate-100">
                        <td colSpan={4} className="border border-black p-1 text-right">TOTAL BULAN {monthName.toUpperCase()}:</td>
                        <td className="border border-black p-1 text-right font-mono">{formatRupiah(totalDebet, false)}</td>
                        <td className="border border-black p-1 text-right font-mono">{formatRupiah(totalKredit, false)}</td>
                        <td className="border border-black p-1 text-right font-mono font-bold">{formatRupiah(saldoBulan, false)}</td>
                      </tr>
                    </tfoot>
                  </table>

                  {/* Signatures */}
                  <div className="grid grid-cols-3 gap-4 pt-6 text-center text-[9px] font-sans print-avoid-break print-signature-block">
                    <div>
                      <p>Menyetujui:</p>
                      <p className="font-bold">Kepala Sekolah</p>
                      <div className="h-12" />
                      <p className="font-bold underline">{school.namaKepalaSekolah}</p>
                      <p>NIP. {school.nipKepalaSekolah}</p>
                    </div>
                    <div>
                      <p>&nbsp;</p>
                      <p className="font-bold">Ketua P2SP</p>
                      <div className="h-12" />
                      <p className="font-bold underline uppercase">{school.namaKetuaP2SP}</p>
                    </div>
                    <div>
                      <p>{school.kabKota}, Akhir {monthName}</p>
                      <p className="font-bold">Bendahara</p>
                      <div className="h-12" />
                      <p className="font-bold underline uppercase">{school.namaBendahara}</p>
                      <p>NIP. {school.nipBendahara}</p>
                    </div>
                  </div>
                </div>
              );
            });
          })()}

          {/* ========================================================
              4C. BUKU PEMBANTU KAS BANK (BKB)
             ======================================================== */}
          {(docType === 'ALL' || docType === 'BKB') && (() => {
            const targetPeriod = filterOptions?.month || selectedMonth;
            const periods = targetPeriod && targetPeriod !== 'ALL'
              ? [targetPeriod]
              : Array.from(new Set(bkbList.map((b) => b.bulan || 'ALL'))).filter(Boolean);

            const displayPeriods = periods.length > 0 ? periods : ['ALL'];

            return displayPeriods.map((periodName) => {
              const targetBkb = periodName === 'ALL'
                ? bkbList
                : bkbList.filter((b) => !b.bulan || b.bulan === periodName || b.bulan === 'ALL');

              if (targetBkb.length === 0 && periodName !== 'ALL') return null;

              const totalDebet = targetBkb.reduce((s, b) => s + (b.penerimaan || 0), 0);
              const totalKredit = targetBkb.reduce((s, b) => s + (b.pengeluaran || 0), 0);
              const lastBkb = targetBkb[targetBkb.length - 1];
              const saldoPeriode = lastBkb?.saldo ?? (totalDebet - totalKredit);

              return (
                <div
                  key={`bkb-${periodName}`}
                  className="page-break bg-white p-8 font-sans text-[10px] space-y-4 border border-slate-300 print:border-none"
                  style={{ minHeight: `${activeDim.heightMm}mm` }}
                >
                  <div className="text-center font-bold uppercase space-y-0.5">
                    <h3 className="text-xs">BUKU PEMBANTU KAS BANK (BKB)</h3>
                    <h4 className="text-xs font-mono">{periodName !== 'ALL' ? `PERIODE / BULAN : ${periodName.toUpperCase()}` : 'TAHUN ANGGARAN ' + (school.tahunAnggaran || '2026')}</h4>
                  </div>

                  <div className="space-y-0.5 text-[9px]">
                    <p>NAMA SEKOLAH : <strong>{school.namaSekolah}</strong></p>
                    <p>PEKERJAAN : {school.pekerjaan}</p>
                    <p>NO. REKENING BANK : <span className="font-mono font-bold">{school.nomorRekening || '-'}</span> ({school.namaBank || 'BANK OPERASIONAL'})</p>
                    <p>KOTA / PROPINSI : {school.kabKota} / {school.provinsi}</p>
                  </div>

                  <table className="w-full border-collapse border border-black text-[9px]">
                    <thead>
                      <tr className="bg-slate-100 text-center font-bold">
                        <th className="border border-black p-1 w-8">No</th>
                        <th className="border border-black p-1 w-20">Tanggal</th>
                        <th className="border border-black p-1 text-left">Uraian Transaksi Bank</th>
                        <th className="border border-black p-1 w-20">No. Bukti</th>
                        <th className="border border-black p-1 w-28">Debit / Terima (Rp)</th>
                        <th className="border border-black p-1 w-28">Kredit / Tarik (Rp)</th>
                        <th className="border border-black p-1 w-28">Saldo Bank (Rp)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {targetBkb.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="border border-black p-4 text-center text-slate-500 italic">
                            Tidak ada transaksi kas bank pada periode ini.
                          </td>
                        </tr>
                      ) : (
                        targetBkb.map((b, idx) => (
                          <tr key={b.id || idx}>
                            <td className="border border-black p-1 text-center font-mono">{idx + 1}</td>
                            <td className="border border-black p-1 text-center font-mono">{b.tanggal}</td>
                            <td className="border border-black p-1">{b.uraian}</td>
                            <td className="border border-black p-1 text-center font-mono text-[8px]">{b.noBukti || '-'}</td>
                            <td className="border border-black p-1 text-right font-mono">
                              {b.penerimaan > 0 ? formatRupiah(b.penerimaan, false) : '-'}
                            </td>
                            <td className="border border-black p-1 text-right font-mono">
                              {b.pengeluaran > 0 ? formatRupiah(b.pengeluaran, false) : '-'}
                            </td>
                            <td className="border border-black p-1 text-right font-mono font-bold">
                              {formatRupiah(b.saldo || 0, false)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="font-bold bg-slate-100">
                        <td colSpan={4} className="border border-black p-1 text-right">TOTAL:</td>
                        <td className="border border-black p-1 text-right font-mono">{formatRupiah(totalDebet, false)}</td>
                        <td className="border border-black p-1 text-right font-mono">{formatRupiah(totalKredit, false)}</td>
                        <td className="border border-black p-1 text-right font-mono font-bold">{formatRupiah(saldoPeriode, false)}</td>
                      </tr>
                    </tfoot>
                  </table>

                  {/* Signatures */}
                  <div className="grid grid-cols-3 gap-4 pt-6 text-center text-[9px] font-sans print-avoid-break print-signature-block">
                    <div>
                      <p>Menyetujui:</p>
                      <p className="font-bold">Kepala Sekolah</p>
                      <div className="h-12" />
                      <p className="font-bold underline">{school.namaKepalaSekolah}</p>
                      <p>NIP. {school.nipKepalaSekolah}</p>
                    </div>
                    <div>
                      <p>&nbsp;</p>
                      <p className="font-bold">Ketua P2SP</p>
                      <div className="h-12" />
                      <p className="font-bold underline uppercase">{school.namaKetuaP2SP}</p>
                    </div>
                    <div>
                      <p>{school.kabKota}, {periodName !== 'ALL' ? `Akhir ${periodName}` : 'Periode Kas'}</p>
                      <p className="font-bold">Bendahara</p>
                      <div className="h-12" />
                      <p className="font-bold underline uppercase">{school.namaBendahara}</p>
                      <p>NIP. {school.nipBendahara}</p>
                    </div>
                  </div>
                </div>
              );
            });
          })()}

          {/* ========================================================
              5. REKAPITULASI PAJAK
             ======================================================== */}
          {(docType === 'ALL' || docType === 'PAJAK') && (
            <div
              className="page-break bg-white p-8 font-sans text-[10px] space-y-4 border border-slate-300 print:border-none"
              style={{ minHeight: `${activeDim.heightMm}mm` }}
            >
              <div className="text-center font-bold uppercase space-y-0.5">
                <h3 className="text-xs">REKAPITULASI PENERIMAAN DAN PENYETORAN PAJAK</h3>
                <h4 className="text-xs">{school.pekerjaan}</h4>
                <p className="text-[10px] font-mono">TAHUN ANGGARAN {school.tahunAnggaran}</p>
              </div>

              <table className="w-full border-collapse border border-black text-[9px]">
                <thead>
                  <tr className="bg-slate-100 text-center font-bold">
                    <th rowSpan={2} className="border border-black p-1 w-6">No</th>
                    <th colSpan={2} className="border border-black p-1">Kwitansi</th>
                    <th rowSpan={2} className="border border-black p-1 text-left">Keperluan Pembayaran</th>
                    <th colSpan={4} className="border border-black p-1">Nilai Nominal (Rp)</th>
                    <th colSpan={3} className="border border-black p-1">Pajak Yang Dipungut dan Disetor (Rp)</th>
                  </tr>
                  <tr className="bg-slate-100 text-center font-bold">
                    <th className="border border-black p-0.5 w-14">No</th>
                    <th className="border border-black p-0.5 w-14">Tanggal</th>
                    <th className="border border-black p-0.5">Konstruksi</th>
                    <th className="border border-black p-0.5">Perabot</th>
                    <th className="border border-black p-0.5">Peralatan</th>
                    <th className="border border-black p-0.5">Perencanaan / ADM</th>
                    <th className="border border-black p-0.5">PPN 11%</th>
                    <th className="border border-black p-0.5">PPh Ps 22</th>
                    <th className="border border-black p-0.5">PPh 23</th>
                  </tr>
                </thead>
                <tbody>
                  {taxRecords.map((t, idx) => (
                    <tr key={t.id}>
                      <td className="border border-black p-1 text-center font-mono">{idx + 1}</td>
                      <td className="border border-black p-1 text-center font-mono text-[8px]">{t.noBukti}</td>
                      <td className="border border-black p-1 text-center font-mono text-[8px]">{t.tanggal}</td>
                      <td className="border border-black p-1">{t.keperluan}</td>
                      <td className="border border-black p-1 text-right font-mono">
                        {t.nominalKonstruksi > 0 ? formatRupiah(t.nominalKonstruksi, false) : '-'}
                      </td>
                      <td className="border border-black p-1 text-right font-mono">
                        {t.nominalPerabot > 0 ? formatRupiah(t.nominalPerabot, false) : '-'}
                      </td>
                      <td className="border border-black p-1 text-right font-mono">
                        {t.nominalPeralatan > 0 ? formatRupiah(t.nominalPeralatan, false) : '-'}
                      </td>
                      <td className="border border-black p-1 text-right font-mono">
                        {t.nominalKonsultanAdm > 0 ? formatRupiah(t.nominalKonsultanAdm, false) : '-'}
                      </td>
                      <td className="border border-black p-1 text-right font-mono">
                        {t.ppn11 > 0 ? formatRupiah(t.ppn11, false) : '-'}
                      </td>
                      <td className="border border-black p-1 text-right font-mono">
                        {t.pph22 > 0 ? formatRupiah(t.pph22, false) : '-'}
                      </td>
                      <td className="border border-black p-1 text-right font-mono">
                        {t.pph23 > 0 ? formatRupiah(t.pph23, false) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-bold bg-slate-100">
                    <td colSpan={4} className="border border-black p-1 text-right uppercase">Jumlah Yang Disetor:</td>
                    <td className="border border-black p-1 text-right font-mono">{formatRupiah(taxRecords.reduce((s, t) => s + t.nominalKonstruksi, 0), false)}</td>
                    <td className="border border-black p-1 text-right font-mono">{formatRupiah(taxRecords.reduce((s, t) => s + t.nominalPerabot, 0), false)}</td>
                    <td className="border border-black p-1 text-right font-mono">{formatRupiah(taxRecords.reduce((s, t) => s + t.nominalPeralatan, 0), false)}</td>
                    <td className="border border-black p-1 text-right font-mono">{formatRupiah(taxRecords.reduce((s, t) => s + t.nominalKonsultanAdm, 0), false)}</td>
                    <td className="border border-black p-1 text-right font-mono">{formatRupiah(taxRecords.reduce((s, t) => s + t.ppn11, 0), false)}</td>
                    <td className="border border-black p-1 text-right font-mono">{formatRupiah(taxRecords.reduce((s, t) => s + t.pph22, 0), false)}</td>
                    <td className="border border-black p-1 text-right font-mono">{formatRupiah(taxRecords.reduce((s, t) => s + t.pph23, 0), false)}</td>
                  </tr>
                </tfoot>
              </table>

              <div className="grid grid-cols-3 gap-4 pt-6 text-center text-[9px] font-sans print-avoid-break print-signature-block">
                <div>
                  <p>Menyetujui:</p>
                  <p className="font-bold">Kepala Sekolah</p>
                  <div className="h-12" />
                  <p className="font-bold underline">{school.namaKepalaSekolah}</p>
                  <p>NIP. {school.nipKepalaSekolah}</p>
                </div>
                <div>
                  <p>&nbsp;</p>
                  <p className="font-bold">Ketua P2SP</p>
                  <div className="h-12" />
                  <p className="font-bold underline uppercase">{school.namaKetuaP2SP}</p>
                </div>
                <div>
                  <p>{school.kabKota}, 30 Januari 2026</p>
                  <p className="font-bold">Bendahara</p>
                  <div className="h-12" />
                  <p className="font-bold underline uppercase">{school.namaBendahara}</p>
                  <p>NIP. {school.nipBendahara}</p>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================
              6. KWITANSI, FAKTUR TOKO & SPB
             ======================================================== */}
          {(docType === 'ALL' || docType === 'KWITANSI' || docType === 'FAKTUR' || docType === 'SPB') && (
            <div className="space-y-8">
              {/* If Single Kwitansi mode, show activeKwitansi; if ALL, loop over all kwitansis sorted by date */}
              {(docType === 'ALL'
                ? [...kwitansiList].sort((a, b) => {
                    const isoA = parseTxDateToIso(a.tanggal) || a.tanggal || '';
                    const isoB = parseTxDateToIso(b.tanggal) || b.tanggal || '';
                    const cmp = isoA.localeCompare(isoB);
                    if (cmp !== 0) return cmp;
                    const wA = a.mingguKeRef || 0;
                    const wB = b.mingguKeRef || 0;
                    if (wA !== wB) return wA - wB;
                    return a.noBukti.localeCompare(b.noBukti, undefined, { numeric: true });
                  })
                : [activeKwitansi]
              ).map((kw) => (
                <div key={`kw-doc-group-${kw.id}`} className="space-y-6">
                  {/* KWITANSI RESMI */}
                  {(docType === 'ALL' || docType === 'KWITANSI') && (
                    <div
                      className="page-break bg-white p-10 font-serif text-xs space-y-6 border border-slate-300 print:border-none flex flex-col justify-between"
                      style={{ minHeight: `${activeDim.heightMm}mm` }}
                    >
                      <div className="space-y-4">
                        <div className="flex justify-between items-start border-b border-black pb-2">
                          <div className="font-mono text-xs space-y-0.5">
                            <p>No. : <strong>{getHarmonizedKwitansiNoBukti(kw, school.tahunAnggaran)}</strong></p>
                            <p>Tahun : <strong>{school.tahunAnggaran}</strong></p>
                          </div>
                          <div className="text-right">
                            <h2 className="text-xl font-bold tracking-widest uppercase underline">KWITANSI</h2>
                          </div>
                        </div>

                        <div className="space-y-3 py-4 text-xs">
                          <div className="grid grid-cols-12 gap-2">
                            <span className="col-span-3">Sudah terima dari</span>
                            <span className="col-span-1">:</span>
                            <span className="col-span-8 font-semibold">Bendahara {school.namaSekolah}</span>
                          </div>
                          <div className="grid grid-cols-12 gap-2">
                            <span className="col-span-3">Uang Banyaknya</span>
                            <span className="col-span-1">:</span>
                            <span className="col-span-8 font-bold italic underline bg-slate-50 p-2 border border-slate-200">
                              {terbilangRupiah(kw.nominal)}
                            </span>
                          </div>
                          <div className="grid grid-cols-12 gap-2">
                            <span className="col-span-3">Y a i t u</span>
                            <span className="col-span-1">:</span>
                            <span className="col-span-8 leading-relaxed font-sans font-medium">{getHarmonizedKwitansiUraian(kw)}</span>
                          </div>
                        </div>

                        {/* Rincian Barang / Layanan Terlampir Sesuai Format Cetak Resmi */}
                        {(() => {
                          const printItems = getAutoHealedKwitansiItems(kw);
                          if (!printItems || printItems.length === 0) return null;

                          const isServiceOrLabor =
                            kw.tipe !== 'MATERIAL' &&
                            kw.tipe !== 'PERABOT' &&
                            kw.tipe !== 'SMKK' &&
                            (kw.tipe === 'UPAH' ||
                              kw.tipe === 'KONSULTAN' ||
                              kw.tipe === 'OPERASIONAL' ||
                              /\bupah\b|\btukang\b|\bpekerja\b|\bjasa\b|\bkonsultan\b|\bperencana\b|\bpengawas\b|\bhonor\b|\badministrasi\b|\badm\b/i.test(
                                `${kw.noBukti} ${kw.uraian} ${kw.penerimaPekerjaan} ${kw.penerimaNama}`
                              ));

                          const isMatBukti =
                            kw.tipe === 'MATERIAL' ||
                            /kwt[\/\-_]?mat|kw[\/\-_]?mat|\bmat\b|mat[\/\-_]|material/i.test(kw.noBukti || '');

                          let itemColHeader = 'Rincian Barang';
                          let sectionHeader = 'Rincian Barang Terlampir:';

                          if (!isMatBukti) {
                            if (kw.tipe === 'UPAH' || /upah|harian|borongan/i.test(kw.uraian)) {
                              itemColHeader = 'Daftar Upah / Posisi Tenaga Kerja';
                              sectionHeader = 'Rincian Tenaga Kerja & Upah Terlampir:';
                            } else if (kw.tipe === 'KONSULTAN' || /perencana|pengawas/i.test(kw.uraian)) {
                              itemColHeader = 'Uraian Jasa Konsultansi Teknis';
                              sectionHeader = 'Jenis Layanan / Jasa Terlampir:';
                            } else if (kw.tipe === 'OPERASIONAL' || /administrasi|pengelola/i.test(kw.uraian)) {
                              itemColHeader = 'Uraian Pengelolaan Administrasi & Honorarium';
                              sectionHeader = 'Jenis Layanan / Honorarium Terlampir:';
                            } else if (kw.tipe === 'SMKK' || /smkk|k3/i.test(kw.uraian)) {
                              itemColHeader = 'Rincian Perlengkapan K3 & APD (SMKK)';
                              sectionHeader = 'Rincian Perlengkapan Keselamatan Konstruksi:';
                            }
                          }

                          return (
                            <div className="pt-2 border-t border-slate-300">
                              <p className="font-sans font-bold text-[11px] text-slate-800 mb-1.5">
                                {sectionHeader}
                              </p>
                              <table className="w-full border-collapse border border-black font-sans text-xs">
                                <thead>
                                  <tr className="bg-slate-100 text-center font-bold">
                                    <th className="border border-black p-1.5 w-24">Banyaknya</th>
                                    <th className="border border-black p-1.5 text-left">{itemColHeader}</th>
                                    <th className="border border-black p-1.5 text-right w-32">Harga Satuan</th>
                                    <th className="border border-black p-1.5 text-right w-36">Jumlah</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {printItems.map((it, idx) => {
                                    const displayVol =
                                      kw.tipe === 'UPAH' || it.satuan === 'HOK' || it.satuan === 'Hari' || it.satuan === 'Hr'
                                        ? Math.round(it.volume)
                                        : it.volume;
                                    return (
                                      <tr key={idx}>
                                        <td className="border border-black p-1.5 text-center font-mono font-bold">
                                          {displayVol} {it.satuan}
                                        </td>
                                        <td className="border border-black p-1.5 font-medium">{it.namaBarang}</td>
                                        <td className="border border-black p-1.5 text-right font-mono">
                                          {formatRupiah(it.hargaSatuan, false)}
                                        </td>
                                        <td className="border border-black p-1.5 text-right font-mono font-bold">
                                          {formatRupiah(it.jumlah, false)}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                                <tfoot>
                                  <tr className="font-bold bg-slate-100">
                                    <td colSpan={3} className="border border-black p-1.5 text-right uppercase">
                                      Total:
                                    </td>
                                    <td className="border border-black p-1.5 text-right font-mono font-bold text-blue-900">
                                      {formatRupiah(kw.nominal)}
                                    </td>
                                  </tr>
                                </tfoot>
                              </table>
                            </div>
                          );
                        })()}

                        <div className="pt-2">
                          <div className="inline-block border-2 border-black px-4 py-2 font-mono font-bold text-sm">
                            Jumlah Rp. {formatNumber(kw.nominal)}
                          </div>
                        </div>
                      </div>

                      {/* Signatures Kwitansi */}
                      <div className="grid grid-cols-2 gap-8 text-center text-xs font-sans pt-8 print-avoid-break print-signature-block">
                        <div>
                          <p>Setuju dibayar</p>
                          <p className="font-bold">Kepala Sekolah</p>
                          <p>{school.namaSekolah}</p>
                          <div className="h-16" />
                          <p className="font-bold underline">{school.namaKepalaSekolah}</p>
                          <p>NIP. {school.nipKepalaSekolah}</p>
                        </div>
                        <div>
                          <p>{school.kabKota}, {kw.tanggalFormatted}</p>
                          <p className="font-bold">Yang Menerima</p>
                          <div className="h-16" />
                          <p className="font-bold underline uppercase">{kw.penerimaNama}</p>
                          <p>{kw.penerimaPekerjaan}</p>
                          <p className="text-[11px] text-slate-600">{kw.penerimaAlamat}</p>
                        </div>
                      </div>

                      <div className="text-center font-sans text-xs pt-4 border-t border-slate-300">
                        <p>Lunas dibayar</p>
                        <p className="font-bold">Bendahara</p>
                        <div className="h-12" />
                        <p className="font-bold underline uppercase">{school.namaBendahara}</p>
                        <p>NIP. {school.nipBendahara}</p>
                      </div>
                    </div>
                  )}

                  {/* BON / FAKTUR TOKO */}
                  {kw.namaToko && (docType === 'ALL' || docType === 'FAKTUR') && (
                    <div
                      className="page-break bg-white p-10 font-sans text-xs space-y-6 border border-slate-300 print:border-none flex flex-col justify-between"
                      style={{ minHeight: `${activeDim.heightMm}mm` }}
                    >
                      <div className="space-y-4">
                        <div className="flex justify-between items-start border-b-2 border-black pb-2">
                          <div>
                            <h3 className="font-bold text-base uppercase tracking-wider">{kw.namaToko}</h3>
                            <p className="text-[11px] text-slate-600">Penyedia Bahan Bangunan & Perlengkapan</p>
                            <p className="text-[11px] text-slate-600">{kw.penerimaAlamat}</p>
                          </div>
                          <div className="text-right text-xs">
                            <p>{school.kabKota}, {kw.tanggalFormatted}</p>
                            <p>Kepada Yth: Ketua P2SP</p>
                            <p className="font-semibold">{school.namaSekolah}</p>
                            <p>di {school.kabKota}</p>
                          </div>
                        </div>

                        <div className="text-center">
                          <h4 className="font-bold text-sm uppercase tracking-wider underline">BON / FAKTUR</h4>
                        </div>

                        {(() => {
                          const bonItems = getAutoHealedKwitansiItems(kw);
                          return (
                            <table className="w-full border-collapse border border-black text-xs">
                              <thead>
                                <tr className="bg-slate-100 text-center font-bold">
                                  <th className="border border-black p-2 w-28">Banyaknya</th>
                                  <th className="border border-black p-2 text-left">Nama Barang</th>
                                  <th className="border border-black p-2 text-right w-32">Harga satuan</th>
                                  <th className="border border-black p-2 text-right w-36">Jumlah</th>
                                </tr>
                              </thead>
                              <tbody>
                                {bonItems.map((it, iIdx) => (
                                  <tr key={iIdx}>
                                    <td className="border border-black p-2 text-center font-mono">
                                      {it.volume} {it.satuan}
                                    </td>
                                    <td className="border border-black p-2 font-medium">{it.namaBarang}</td>
                                    <td className="border border-black p-2 text-right font-mono">
                                      {formatRupiah(it.hargaSatuan, false)}
                                    </td>
                                    <td className="border border-black p-2 text-right font-mono font-bold">
                                      {formatRupiah(it.jumlah, false)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="font-bold bg-slate-100">
                                  <td colSpan={3} className="border border-black p-2 text-right uppercase">Jumlah Rp</td>
                                  <td className="border border-black p-2 text-right font-mono font-bold">
                                    {formatRupiah(kw.nominal, false)}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          );
                        })()}
                      </div>

                      <div className="flex justify-end pt-8">
                        <div className="text-center w-60">
                          <p>Hormat kami,</p>
                          <div className="h-16" />
                          <p className="font-bold underline uppercase tracking-wider">{kw.namaToko}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SURAT PESANAN BARANG (SPB) */}
                  {kw.noSpb && (docType === 'ALL' || docType === 'SPB') && (
                    <div
                      className="page-break bg-white p-10 font-sans text-xs space-y-6 border border-slate-300 print:border-none flex flex-col justify-between"
                      style={{ minHeight: `${activeDim.heightMm}mm` }}
                    >
                      <div className="space-y-4">
                        {/* Kop Pemda & Sekolah */}
                        <div className="text-center border-b-2 border-black pb-2 space-y-0.5">
                          <p className="font-bold uppercase text-xs">PEMERINTAH {school.kabKota.toUpperCase()}</p>
                          <p className="font-bold uppercase text-xs">{school.dinasPendidikan.toUpperCase()}</p>
                          <h3 className="font-extrabold uppercase text-sm">{school.namaSekolah}</h3>
                          <p className="text-[10px] text-slate-600">{school.alamat} {school.kabKota}</p>
                        </div>

                        <div className="flex justify-between items-start text-xs pt-2">
                          <div>
                            <p className="font-mono">
                              Nomor : <strong>{getHarmonizedKwitansiNoBukti({ noBukti: kw.noSpb, tanggal: kw.tanggal }, school.tahunAnggaran)}</strong>
                            </p>
                          </div>
                          <div className="text-right">
                            <p>{school.kabKota}, {kw.tanggalFormatted}</p>
                            <p>Kepada Yth :</p>
                            <p className="font-semibold">Pimpinan Toko {kw.namaToko}</p>
                            <p>di - {school.kabKota}</p>
                          </div>
                        </div>

                        <div className="text-center py-2">
                          <h4 className="font-bold text-sm uppercase tracking-wider underline">PESANAN BARANG</h4>
                        </div>

                        {(() => {
                          const spbItems = getAutoHealedKwitansiItems(kw);
                          return (
                            <table className="w-full border-collapse border border-black text-xs">
                              <thead>
                                <tr className="bg-slate-100 text-center font-bold">
                                  <th className="border border-black p-2 w-10">No.</th>
                                  <th className="border border-black p-2 w-28">Banyaknya</th>
                                  <th className="border border-black p-2 text-left">Uraian</th>
                                  <th className="border border-black p-2">Keterangan</th>
                                </tr>
                              </thead>
                              <tbody>
                                {spbItems.map((it, iIdx) => (
                                  <tr key={iIdx}>
                                    <td className="border border-black p-2 text-center font-mono">{iIdx + 1}</td>
                                    <td className="border border-black p-2 text-center font-mono">{it.volume} {it.satuan}</td>
                                    <td className="border border-black p-2 font-medium">{it.namaBarang}</td>
                                    <td className="border border-black p-2 text-center text-slate-600">
                                      {kw.keteranganSpb || `Untuk Keperluan ${school.namaSekolah}`}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          );
                        })()}
                      </div>

                      {/* SPB Signatures */}
                      <div className="grid grid-cols-2 gap-8 text-center text-xs font-sans pt-8 print-avoid-break print-signature-block">
                        <div>
                          <p>Menyetujui,</p>
                          <p className="font-bold">Kepala Sekolah</p>
                          <p>{school.namaSekolah}</p>
                          <div className="h-16" />
                          <p className="font-bold underline">{school.namaKepalaSekolah}</p>
                          <p>NIP. {school.nipKepalaSekolah}</p>
                        </div>
                        <div>
                          <p>&nbsp;</p>
                          <p className="font-bold">Ketua P2SP</p>
                          <div className="h-16" />
                          <p className="font-bold underline uppercase">{school.namaKetuaP2SP}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ========================================================
              7. DAFTAR PEMBAYARAN UPAH HARIAN (HOK)
             ======================================================== */}
          {(docType === 'ALL' || docType === 'UPAH') && (
            <div className="space-y-8">
              {wageReports
                .filter((r) => !selectedWeekNum || r.mingguKe === selectedWeekNum)
                .map((wage) => (
                  <div
                    key={`print-wage-${wage.id}`}
                    className="page-break bg-white p-8 font-sans text-[10px] space-y-4 border border-slate-300 print:border-none flex flex-col justify-between"
                    style={{ minHeight: `${activeDim.heightMm}mm` }}
                  >
                    <div className="space-y-3">
                      <div className="text-center font-bold uppercase space-y-0.5">
                        <h3 className="text-xs">DAFTAR PEMBAYARAN UPAH HARIAN</h3>
                        <p className="text-[11px]">PEKERJAAN {school?.pekerjaan?.toUpperCase() || 'REVITALISASI SEKOLAH'}</p>
                      </div>

                      <div className="flex justify-between text-[10px]">
                        <div>
                          <p>Nama Sekolah : <strong>{school.namaSekolah}</strong></p>
                          <p>NPSN : {school.npsn}</p>
                        </div>
                        <div className="text-right">
                          <p>Bulan : {wage.bulan}</p>
                          <p>Periode : {wage.periodeStart} s/d {wage.periodeEnd}</p>
                        </div>
                      </div>

                      <table className="w-full border-collapse border border-black text-[9px]">
                        <thead>
                          <tr className="bg-slate-100 text-center font-bold">
                            <th rowSpan={2} className="border border-black p-1 w-6">NO</th>
                            <th rowSpan={2} className="border border-black p-1 text-left">Nama</th>
                            <th rowSpan={2} className="border border-black p-1 w-6">Jenis</th>
                            <th colSpan={2} className="border border-black p-0.5">Tempat Tinggal</th>
                            <th rowSpan={2} className="border border-black p-1 w-8">M/T/P</th>
                            <th colSpan={7} className="border border-black p-0.5">Hari Kerja</th>
                            <th rowSpan={2} className="border border-black p-1 w-10">Jumlah HOK</th>
                            <th rowSpan={2} className="border border-black p-1 w-16">Harga Upah</th>
                            <th rowSpan={2} className="border border-black p-1 w-20">Insentif Mingguan</th>
                            <th rowSpan={2} className="border border-black p-1 w-16">Tanda Tangan</th>
                          </tr>
                          <tr className="bg-slate-100 text-center font-bold">
                            <th className="border border-black p-0.5">Luar Desa</th>
                            <th className="border border-black p-0.5">Dalam Desa</th>
                            {['1', '2', '3', '4', '5', '6', '7'].map((d) => (
                              <th key={d} className="border border-black p-0.5 w-4">{d}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {wage.attendance.map((att, idx) => (
                            <tr key={att.workerId}>
                              <td className="border border-black p-1 text-center font-mono">{idx + 1}</td>
                              <td className="border border-black p-1 font-semibold">{att.nama}</td>
                              <td className="border border-black p-1 text-center">{att.jenisKelamin}</td>
                              <td className="border border-black p-1 text-center">{att.domisili === 'Luar Desa' ? '✓' : ''}</td>
                              <td className="border border-black p-1 text-center">{att.domisili === 'Dalam Desa' ? '✓' : ''}</td>
                              <td className="border border-black p-1 text-center font-bold">{att.peran}</td>
                              {att.days.map((d, dIdx) => (
                                <td key={dIdx} className="border border-black p-0.5 text-center font-mono">
                                  {d}
                                </td>
                              ))}
                              <td className="border border-black p-1 text-right font-mono font-bold">{formatNumber(att.hok)}</td>
                              <td className="border border-black p-1 text-right font-mono">{formatRupiah(att.upahHarian, false)}</td>
                              <td className="border border-black p-1 text-right font-mono font-bold">{formatRupiah(att.totalUpah, false)}</td>
                              <td className="border border-black p-1 text-center text-[8px] italic text-slate-500">
                                {idx + 1}. .........
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="font-bold bg-slate-100">
                            <td colSpan={13} className="border border-black p-1 text-right uppercase">Total:</td>
                            <td className="border border-black p-1 text-right font-mono font-bold">
                              {formatRupiah(wage.totalUpah, false)}
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Signatures */}
                    <div className="grid grid-cols-3 gap-4 pt-6 text-center text-[9px] font-sans print-avoid-break print-signature-block">
                      <div>
                        <p>Mengetahui</p>
                        <p className="font-bold">Ketua P2SP</p>
                        <div className="h-12" />
                        <p className="font-bold underline uppercase">{school.namaKetuaP2SP}</p>
                      </div>
                      <div>
                        <p>&nbsp;</p>
                        <p className="font-bold">Ketua Pelaksana</p>
                        <div className="h-12" />
                        <p className="font-bold underline">{school.namaPelaksana}</p>
                      </div>
                      <div>
                        <p>{school.kabKota}, {wage.periodeEnd}</p>
                        <p className="font-bold">Bendahara</p>
                        <div className="h-12" />
                        <p className="font-bold underline uppercase">{school.namaBendahara}</p>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}

          {/* ========================================================
              7B. DOKUMEN SPJ PEMBAYARAN UPAH BORONGAN TENAGA KERJA (OPNAME FISIK)
             ======================================================== */}
          {(docType === 'ALL' || docType === 'BORONGAN') && (
            <div className="space-y-8">
              {wageReports
                .filter((r) => !selectedWeekNum || r.mingguKe === selectedWeekNum)
                .map((wage) => {
                  const boronganUraianText = wage.boronganUraian || `Pekerjaan Konstruksi Fisik & Pasangan (Minggu Ke-${wage.mingguKe})`;
                  const mandorNama = wage.penerimaNama || 'Budiman';
                  const spkNo = wage.boronganNoSpk || `SPK-BOR/${String(wage.mingguKe).padStart(2, '0')}/${school.tahunAnggaran || '2026'}`;
                  const nominalBorongan = wage.boronganTotalUpah || wage.totalUpah || 0;
                  const ahspWageMap = getAhspWageRatesMap(realSchoolData?.ahspList);

                  // Ambil anggota tim pekerja borongan khusus (1 Mandor, 1 KT, 2 Tukang, 3 Pekerja + ekstra jika over-capacity)
                  const boronganAttendance =
                    wage.boronganAttendance &&
                    wage.boronganAttendance.length > 0 &&
                    wage.boronganAttendance.some(
                      (w) =>
                        w.peran === 'P' ||
                        (w.peranLabel || '').toLowerCase().includes('pekerja') ||
                        (w.peranLabel || '').toLowerCase().includes('laden')
                    )
                      ? wage.boronganAttendance
                      : getBalancedBoronganAttendance(nominalBorongan, workers || [], ahspWageMap);

                  return (
                    <div key={`print-borongan-${wage.id}`} className="space-y-8">
                      {/* LEMBAR 1: SURAT PERJANJIAN KERJA (SPK) BORONGAN TENAGA KERJA */}
                      <div
                        className="page-break bg-white p-8 font-sans text-[10.5px] space-y-4 border border-slate-300 print:border-none flex flex-col justify-between"
                        style={{ minHeight: `${activeDim.heightMm}mm` }}
                      >
                        <div className="space-y-3.5">
                          <StandardKopSurat school={school} />

                          <div className="text-center space-y-0.5 pt-1">
                            <h3 className="text-xs font-bold uppercase underline">
                              SURAT PERJANJIAN KERJA (SPK) UPAH BORONGAN TENAGA KERJA
                            </h3>
                            <p className="text-[10px] font-mono text-slate-700">
                              Nomor : {spkNo}
                            </p>
                          </div>

                          <p className="text-justify leading-relaxed">
                            Pada hari ini, <strong>{wage.periodeStart}</strong>, bertempat di <strong>{school.namaSekolah}</strong>, kami yang bertanda tangan di bawah ini:
                          </p>

                          <div className="space-y-1.5 pl-3">
                            <div className="grid grid-cols-12 gap-2">
                              <span className="col-span-1 font-bold">1.</span>
                              <span className="col-span-3 font-semibold">Nama</span>
                              <span className="col-span-8">: <strong>{school.namaKetuaP2SP}</strong></span>
                            </div>
                            <div className="grid grid-cols-12 gap-2">
                              <span className="col-span-1"></span>
                              <span className="col-span-3">Jabatan</span>
                              <span className="col-span-8">: Ketua Tim Panitia Pembangunan Satuan Pendidikan (P2SP)</span>
                            </div>
                            <div className="grid grid-cols-12 gap-2">
                              <span className="col-span-1"></span>
                              <span className="col-span-3">Alamat</span>
                              <span className="col-span-8">: {school.alamat}, {school.kabKota}</span>
                            </div>
                            <p className="text-[9px] italic text-slate-600 pl-6">
                              Selanjutnya disebut sebagai <strong>PIHAK PERTAMA (Pemberi Tugas)</strong>.
                            </p>

                            <div className="grid grid-cols-12 gap-2 pt-1">
                              <span className="col-span-1 font-bold">2.</span>
                              <span className="col-span-3 font-semibold">Nama</span>
                              <span className="col-span-8">: <strong>{mandorNama}</strong></span>
                            </div>
                            <div className="grid grid-cols-12 gap-2">
                              <span className="col-span-1"></span>
                              <span className="col-span-3">Jabatan</span>
                              <span className="col-span-8">: Mandor / Ketua Kelompok Tenaga Kerja Borongan</span>
                            </div>
                            <div className="grid grid-cols-12 gap-2">
                              <span className="col-span-1"></span>
                              <span className="col-span-3">Alamat</span>
                              <span className="col-span-8">: {school.desa || school.lokasi || school.kabKota}</span>
                            </div>
                            <p className="text-[9px] italic text-slate-600 pl-6">
                              Selanjutnya disebut sebagai <strong>PIHAK KEDUA (Penerima Borongan)</strong>.
                            </p>
                          </div>

                          <div className="space-y-2 text-justify leading-relaxed text-[10px] pt-1">
                            <p>
                              <strong>PIHAK PERTAMA</strong> dan <strong>PIHAK KEDUA</strong> sepakat mengikatkan diri dalam Surat Perjanjian Kerja (SPK) Borongan Tenaga Kerja untuk pelaksanaan kegiatan <strong>{school.pekerjaan?.toUpperCase() || 'REVITALISASI SEKOLAH'}</strong> dengan ketentuan sebagai berikut:
                            </p>

                            <div className="space-y-1.5 pl-2">
                              <div>
                                <strong className="block text-[10.5px]">PASAL 1 : RUANG LINGKUP PEKERJAAN</strong>
                                <p className="pl-3">
                                  <strong>PIHAK PERTAMA</strong> menyerahkan pekerjaan borongan tenaga kerja berupa: <strong>{boronganUraianText}</strong> (Periode Minggu Ke-{wage.mingguKe}) kepada <strong>PIHAK KEDUA</strong> yang dikerjakan sesuai spesifikasi teknis dan petunjuk Tim Pengawas Lapangan.
                                </p>
                              </div>

                              <div>
                                <strong className="block text-[10.5px]">PASAL 2 : NILAI BORONGAN & PEMBAYARAN</strong>
                                <p className="pl-3">
                                  Total nilai borongan upah tenaga kerja yang disepakati sebesar <strong>{formatRupiah(nominalBorongan)}</strong> <em>({terbilangRupiah(nominalBorongan)})</em>. Pembayaran dilakukan secara lunas setelah dilakukan opname prestasi fisik lapangan oleh Tim Teknis.
                                </p>
                              </div>

                              <div>
                                <strong className="block text-[10.5px]">PASAL 3 : HAK DAN KEWAJIBAN</strong>
                                <p className="pl-3">
                                  <strong>PIHAK KEDUA</strong> bertanggung jawab penuh memimpin kelompok tukang/pekerja, menjaga kualitas hasil kerja, keselamatan kerja, serta mendistribusikan pembayaran upah kepada seluruh anggota kelompok secara adil dan transparan.
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Signatures */}
                        <div className="grid grid-cols-3 gap-4 pt-3 text-center text-[9.5px] font-sans print-avoid-break print-signature-block">
                          <div>
                            <p>PIHAK KEDUA</p>
                            <p className="font-bold">Mandor / Ketua Kelompok</p>
                            <div className="h-12" />
                            <p className="font-bold underline uppercase">{mandorNama}</p>
                          </div>
                          <div>
                            <p>Mengetahui / Memeriksa</p>
                            <p className="font-bold">Tim Teknis / Pengawas Lapangan</p>
                            <div className="h-12" />
                            <p className="font-bold underline">{school.namaFasilitator || school.namaPelaksana || 'Pengawas Lapangan'}</p>
                          </div>
                          <div>
                            <p>PIHAK PERTAMA</p>
                            <p className="font-bold">Ketua P2SP</p>
                            <div className="h-12" />
                            <p className="font-bold underline uppercase">{school.namaKetuaP2SP}</p>
                          </div>
                        </div>
                      </div>

                      {/* LEMBAR 2: BERITA ACARA PEMBAYARAN & OPNAME FISIK UPAH BORONGAN */}
                      <div
                        className="page-break bg-white p-8 font-sans text-[10.5px] space-y-5 border border-slate-300 print:border-none flex flex-col justify-between"
                        style={{ minHeight: `${activeDim.heightMm}mm` }}
                      >
                        <div className="space-y-4">
                          <StandardKopSurat school={school} />

                          <div className="text-center space-y-1 pt-2">
                            <h3 className="text-xs font-bold uppercase underline">
                              BERITA ACARA PEMBAYARAN UPAH BORONGAN TENAGA KERJA
                            </h3>
                            <p className="text-[10px] font-mono text-slate-700">
                              Nomor : BAP-BOR/{String(wage.mingguKe).padStart(2, '0')}/{school.tahunAnggaran || '2026'}
                            </p>
                          </div>

                          <p className="text-justify leading-relaxed">
                            Pada hari ini, <strong>{wage.periodeEnd}</strong>, bertempat di <strong>{school.namaSekolah}</strong>, kami yang bertanda tangan di bawah ini:
                          </p>

                          <div className="space-y-2 pl-4">
                            <div className="grid grid-cols-12 gap-2">
                              <span className="col-span-1 font-bold">1.</span>
                              <span className="col-span-3 font-semibold">Nama</span>
                              <span className="col-span-8">: <strong>{school.namaKetuaP2SP}</strong></span>
                            </div>
                            <div className="grid grid-cols-12 gap-2">
                              <span className="col-span-1"></span>
                              <span className="col-span-3">Jabatan</span>
                              <span className="col-span-8">: Ketua Tim Panitia Pembangunan Satuan Pendidikan (P2SP)</span>
                            </div>
                            <div className="grid grid-cols-12 gap-2">
                              <span className="col-span-1"></span>
                              <span className="col-span-3">Alamat</span>
                              <span className="col-span-8">: {school.alamat}, {school.kabKota}</span>
                            </div>
                            <p className="text-[9.5px] italic text-slate-600 pl-6">
                              Selanjutnya disebut sebagai <strong>PIHAK PERTAMA (Pemberi Tugas)</strong>.
                            </p>

                            <div className="grid grid-cols-12 gap-2 pt-2">
                              <span className="col-span-1 font-bold">2.</span>
                              <span className="col-span-3 font-semibold">Nama</span>
                              <span className="col-span-8">: <strong>{mandorNama}</strong></span>
                            </div>
                            <div className="grid grid-cols-12 gap-2">
                              <span className="col-span-1"></span>
                              <span className="col-span-3">Jabatan</span>
                              <span className="col-span-8">: Mandor / Ketua Kelompok Tenaga Kerja Borongan</span>
                            </div>
                            <div className="grid grid-cols-12 gap-2">
                              <span className="col-span-1"></span>
                              <span className="col-span-3">Alamat</span>
                              <span className="col-span-8">: {school.desa || school.lokasi || school.kabKota}</span>
                            </div>
                            <p className="text-[9.5px] italic text-slate-600 pl-6">
                              Selanjutnya disebut sebagai <strong>PIHAK KEDUA (Penerima Borongan)</strong>.
                            </p>
                          </div>

                          <div className="space-y-2 text-justify leading-relaxed pt-1">
                            <p>
                              Berdasarkan hasil pemeriksaan dan opname prestasi kemajuan fisik di lapangan untuk pekerjaan <strong>{school.pekerjaan?.toUpperCase() || 'REVITALISASI SEKOLAH'}</strong> pada periode <strong>{wage.periodeStart} s/d {wage.periodeEnd} (Minggu Ke-{wage.mingguKe})</strong>, kedua belah pihak menyatakan sepakat:
                            </p>
                            <ol className="list-decimal pl-6 space-y-1.5">
                              <li>
                                <strong>PIHAK KEDUA</strong> telah menyelesaikan tahapan pekerjaan borongan berupa: <strong>{boronganUraianText}</strong> sesuai dengan spesifikasi teknis dan gambar kerja RAB.
                              </li>
                              <li>
                                Atas hasil opname kemajuan fisik tersebut, <strong>PIHAK PERTAMA</strong> membayarkan upah borongan kepada <strong>PIHAK KEDUA</strong> sebesar:
                                <div className="p-2.5 my-1.5 bg-slate-50 border border-slate-300 font-mono font-bold text-center text-xs">
                                  {formatRupiah(nominalBorongan)}
                                  <div className="text-[9.5px] font-sans font-normal italic text-slate-700 mt-0.5">
                                    (Terbilang: {terbilangRupiah(nominalBorongan)})
                                  </div>
                                </div>
                              </li>
                              <li>
                                <strong>PIHAK KEDUA</strong> bertanggung jawab penuh membagikan dan mendistribusikan upah tersebut kepada seluruh anggota kelompok tukang dan pekerja binaannya.
                              </li>
                            </ol>
                          </div>
                        </div>

                        {/* Signatures */}
                        <div className="grid grid-cols-3 gap-4 pt-4 text-center text-[9.5px] font-sans print-avoid-break print-signature-block">
                          <div>
                            <p>PIHAK KEDUA</p>
                            <p className="font-bold">Mandor / Ketua Kelompok</p>
                            <div className="h-14" />
                            <p className="font-bold underline uppercase">{mandorNama}</p>
                          </div>
                          <div>
                            <p>Mengetahui / Memeriksa</p>
                            <p className="font-bold">Tim Teknis / Pengawas Lapangan</p>
                            <div className="h-14" />
                            <p className="font-bold underline">{school.namaFasilitator || school.namaPelaksana || 'Pengawas Lapangan'}</p>
                          </div>
                          <div>
                            <p>PIHAK PERTAMA</p>
                            <p className="font-bold">Ketua P2SP</p>
                            <div className="h-14" />
                            <p className="font-bold underline uppercase">{school.namaKetuaP2SP}</p>
                          </div>
                        </div>
                      </div>

                      {/* LEMBAR 3: DAFTAR TANDA TERIMA UPAH KELOMPOK TENAGA KERJA BORONGAN */}
                      <div
                        className="page-break bg-white p-8 font-sans text-[10px] space-y-4 border border-slate-300 print:border-none flex flex-col justify-between"
                        style={{ minHeight: `${activeDim.heightMm}mm` }}
                      >
                        <div className="space-y-3">
                          <StandardKopSurat school={school} />

                          <div className="text-center font-bold uppercase space-y-0.5 pt-1">
                            <h3 className="text-xs">DAFTAR TANDA TERIMA PEMBAGIAN UPAH KELOMPOK BORONGAN</h3>
                            <p className="text-[10px] font-normal text-slate-700">
                              PEKERJAAN: {school?.pekerjaan?.toUpperCase() || 'REVITALISASI SEKOLAH'} • MINGGU KE-{wage.mingguKe}
                            </p>
                            <p className="text-[9px] font-mono text-slate-500">
                              Dasar SPK: {spkNo} • Periode: {wage.periodeStart} s/d {wage.periodeEnd}
                            </p>
                          </div>

                          <div className="p-2 bg-slate-50 border border-slate-200 text-[9.5px] flex justify-between items-center">
                            <div>
                              <span>Uraian Pekerjaan Fisik: <strong>{boronganUraianText}</strong></span>
                            </div>
                            <div className="text-right font-mono font-bold">
                              <span>Total Upah: {formatRupiah(nominalBorongan)}</span>
                            </div>
                          </div>

                          <table className="w-full border-collapse border border-black text-[9px]">
                            <thead>
                              <tr className="bg-slate-100 text-center font-bold border border-black">
                                <th className="border border-black p-1 w-7">NO</th>
                                <th className="border border-black p-1 text-left">NAMA ANGGOTA TENAGA KERJA</th>
                                <th className="border border-black p-1 w-28">KATEGORI / PERAN</th>
                                <th className="border border-black p-1 w-20">TEMPAT TINGGAL</th>
                                <th className="border border-black p-1 w-24 text-right">TARIF ACUAN AHSP</th>
                                <th className="border border-black p-1 w-28 text-right">JUMLAH DITERIMA (RP)</th>
                                <th className="border border-black p-1 w-28">TANDA TANGAN</th>
                              </tr>
                            </thead>
                            <tbody>
                              {boronganAttendance.map((att, idx) => (
                                <tr key={att.workerId || idx} className="hover:bg-slate-50">
                                  <td className="border border-black p-1 text-center font-mono">{idx + 1}</td>
                                  <td className="border border-black p-1 font-bold">{att.nama}</td>
                                  <td className="border border-black p-1 text-center">
                                    <span className="font-semibold">
                                      {idx === 0 ? 'Mandor / Ketua Kelompok' : att.peranLabel || att.peran}
                                    </span>
                                  </td>
                                  <td className="border border-black p-1 text-center">{att.domisili || 'Dalam Desa'}</td>
                                  <td className="border border-black p-1 text-right font-mono text-slate-600">
                                    {formatRupiah(att.upahHarian, false)}
                                  </td>
                                  <td className="border border-black p-1 text-right font-mono font-bold">
                                    {formatRupiah(att.totalUpah, false)}
                                  </td>
                                  <td className="border border-black p-1 text-left font-mono text-[8.5px] italic pl-2">
                                    {idx + 1}. ....................
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="font-bold bg-slate-100">
                                <td colSpan={5} className="border border-black p-1.5 text-right uppercase">
                                  TOTAL PENERIMAAN UPAH KELOMPOK BORONGAN:
                                </td>
                                <td className="border border-black p-1.5 text-right font-mono font-bold text-[10px]">
                                  {formatRupiah(nominalBorongan, false)}
                                </td>
                                <td className="border border-black p-1.5 text-center text-[8px] italic font-semibold">
                                  100% LUNAS & DITERIMA
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>

                        {/* Signatures */}
                        <div className="grid grid-cols-3 gap-4 pt-4 text-center text-[9px] font-sans print-avoid-break print-signature-block">
                          <div>
                            <p>Mengetahui,</p>
                            <p className="font-bold">Ketua P2SP</p>
                            <div className="h-12" />
                            <p className="font-bold underline uppercase">{school.namaKetuaP2SP}</p>
                          </div>
                          <div>
                            <p>Lunas Dibayar Oleh,</p>
                            <p className="font-bold">Bendahara P2SP</p>
                            <div className="h-12" />
                            <p className="font-bold underline uppercase">{school.namaBendahara}</p>
                          </div>
                          <div>
                            <p>{school.kabKota}, {wage.periodeEnd}</p>
                            <p className="font-bold">Ketua Kelompok / Mandor</p>
                            <div className="h-12" />
                            <p className="font-bold underline uppercase">{mandorNama}</p>
                          </div>
                        </div>
                      </div>

                      {/* LEMBAR 4: KWITANSI BUKTI PEMBAYARAN LUNAS UPAH BORONGAN */}
                      <div
                        className="page-break bg-white p-8 font-sans text-[10.5px] space-y-6 border border-slate-300 print:border-none flex flex-col justify-between"
                        style={{ minHeight: `${activeDim.heightMm}mm` }}
                      >
                        <div className="space-y-4">
                          <StandardKopSurat school={school} />

                          <div className="flex items-center justify-between border-b-2 border-slate-800 pb-2 pt-2">
                            <div>
                              <h3 className="text-sm font-black tracking-wider uppercase">KWITANSI BUKTI PEMBAYARAN</h3>
                              <p className="text-[10px] text-slate-600 font-mono">
                                No. Bukti: KW-UPAH/{String(wage.mingguKe).padStart(2, '0')}/{school.tahunAnggaran || '2026'}
                              </p>
                            </div>
                            <div className="text-right">
                              <span className="text-[10px] font-bold px-2 py-1 bg-slate-100 border border-slate-300 rounded font-mono">
                                PERIODE: MINGGU KE-{wage.mingguKe}
                              </span>
                            </div>
                          </div>

                          <div className="space-y-3 pt-2 text-[11px]">
                            <div className="grid grid-cols-12 gap-2">
                              <span className="col-span-3 font-bold text-slate-700">Telah Terima Dari</span>
                              <span className="col-span-9 font-semibold">: Bendahara P2SP {school.namaSekolah}</span>
                            </div>

                            <div className="grid grid-cols-12 gap-2">
                              <span className="col-span-3 font-bold text-slate-700">Uang Sejumlah</span>
                              <span className="col-span-9 font-extrabold text-xs font-mono bg-slate-100 p-2 rounded border border-slate-300">
                                {formatRupiah(nominalBorongan)}
                              </span>
                            </div>

                            <div className="grid grid-cols-12 gap-2">
                              <span className="col-span-3 font-bold text-slate-700">Terbilang</span>
                              <span className="col-span-9 font-semibold italic text-slate-800 bg-slate-50 p-2 rounded border border-slate-200">
                                ({terbilangRupiah(nominalBorongan)})
                              </span>
                            </div>

                            <div className="grid grid-cols-12 gap-2">
                              <span className="col-span-3 font-bold text-slate-700">Untuk Pembayaran</span>
                              <span className="col-span-9 leading-relaxed">
                                : Pembayaran Lunas Upah Borongan Tenaga Kerja Minggu Ke-{wage.mingguKe} ({wage.periodeStart} s/d {wage.periodeEnd}) Untuk Pekerjaan <strong>{boronganUraianText}</strong> Kegiatan {school.pekerjaan || 'Revitalisasi Sekolah'} Sesuai SPK No. {spkNo}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Signatures */}
                        <div className="grid grid-cols-3 gap-4 pt-6 text-center text-[9.5px] font-sans print-avoid-break print-signature-block">
                          <div>
                            <p>Setuju Dibayar,</p>
                            <p className="font-bold">Ketua P2SP</p>
                            <div className="h-14" />
                            <p className="font-bold underline uppercase">{school.namaKetuaP2SP}</p>
                          </div>
                          <div>
                            <p>Lunas Dibayar,</p>
                            <p className="font-bold">Bendahara P2SP</p>
                            <div className="h-14" />
                            <p className="font-bold underline uppercase">{school.namaBendahara}</p>
                          </div>
                          <div>
                            <p>{school.kabKota}, {wage.periodeEnd}</p>
                            <p className="font-bold">Penerima Upah (Mandor)</p>
                            <div className="h-14" />
                            <p className="font-bold underline uppercase">{mandorNama}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          {/* ========================================================
              8. REKAPITULASI PROGRES FISIK MINGGUAN (SPREADSHEET FORMAT & FOTO)
             ======================================================== */}
          {(docType === 'ALL' || docType === 'PROGRESS' || docType === 'FOTO_PROGRESS') && (
            <div className="space-y-8">
              {progressWeeks
                .filter((w) => !selectedWeekNum || w.mingguKe === selectedWeekNum)
                .map((week) => {
                  const divisions = week.divisions || [];
                  const savedDec = typeof window !== 'undefined' ? localStorage.getItem('lpj_progress_decimal_precision') : null;
                  const decPlaces = savedDec === '3' ? 3 : 2;

                  const fisikDivs = divisions.filter((d) => d.kategori === 'FISIK');
                  const manDivs = divisions.filter((d) => d.kategori === 'MANAJEMEN');
                  const totBobot = divisions.reduce((s, d) => s + (Number(d.bobotTotal) || 0), 0);
                  const cappedTotBobot = Math.abs(totBobot - 100) <= 0.05 ? 100 : Math.min(100, Math.round(totBobot * 1000) / 1000);
                  const totLalu =
                    week.customTotalMingguLalu !== undefined && week.customTotalMingguLalu !== null
                      ? week.customTotalMingguLalu
                      : divisions.reduce((s, d) => s + d.prestasiMingguLalu, 0);

                  const totIni =
                    week.customTotalMingguIni !== undefined && week.customTotalMingguIni !== null
                      ? week.customTotalMingguIni
                      : divisions.reduce((s, d) => s + d.prestasiMingguIni, 0);

                  const calculatedTotSd = Math.min(100, Math.round((totLalu + totIni) * 1000) / 1000);
                  const totSdIni =
                    week.customTotalSdMingguIni !== undefined && week.customTotalSdMingguIni !== null
                      ? week.customTotalSdMingguIni
                      : calculatedTotSd;

                  const activeRealisasi = week.bobotRealisasi !== undefined && week.bobotRealisasi !== null ? week.bobotRealisasi : totSdIni;
                  const dev = Math.round((activeRealisasi - week.bobotRencana) * 1000) / 1000;
                  const isFaster = dev >= 0;

                  return (
                    <div key={`week-block-${week.mingguKe}`} className="space-y-8">
                      {/* 8A. Tabel Rekapitulasi Progres Fisik (hanya jika bukan mode cetak HANYA FOTO) */}
                      {docType !== 'FOTO_PROGRESS' && (
                        <div
                          key={`print-prog-${week.mingguKe}`}
                          className="page-break bg-white p-8 font-sans text-[10px] space-y-4 border border-slate-300 print:border-none flex flex-col justify-between"
                          style={{ minHeight: `${activeDim.heightMm}mm` }}
                        >
                          <div className="space-y-3">
                            <div className="text-center font-bold uppercase space-y-0.5">
                              <h3 className="text-xs">REKAPITULASI</h3>
                              <h4 className="text-[11px]">{school?.program?.toUpperCase() || ''}</h4>
                              <h4 className="text-[11px]">{school?.pekerjaan?.toUpperCase() || ''}</h4>
                              <h4 className="text-xs font-bold">{school?.namaSekolah || ''}</h4>
                              <p className="text-[10px] font-normal">{(school?.kabKota || '').toUpperCase()} PROPINSI {(school?.provinsi || '').toUpperCase()}</p>
                              <p className="text-[9px] font-mono text-slate-600">PERIODE : {week.periode.toUpperCase()} (MINGGU KE-{week.mingguKe})</p>
                            </div>

                            <table className="w-full border-collapse border border-black text-[9px]">
                              <thead>
                                <tr className="bg-[#0070c0] text-white font-bold text-center text-[9px] border border-black">
                                  <th className="border border-black p-1 w-8">NO.</th>
                                  <th className="border border-black p-1 text-left">URAIAN PEKERJAAN</th>
                                  <th className="border border-black p-1 w-16">BOBOT %</th>
                                  <th className="border border-black p-1 w-20">PRESTASI MINGGU LALU BOBOT %</th>
                                  <th className="border border-black p-1 w-20">PRESTASI MINGGU INI BOBOT %</th>
                                  <th className="border border-black p-1 w-20">PRESTASI S.D MINGGU INI BOBOT %</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr className="bg-slate-100 font-bold">
                                  <td className="border border-black p-1 text-center"></td>
                                  <td colSpan={5} className="border border-black p-1">REKAPITULASI:</td>
                                </tr>
                                <tr className="bg-slate-50 font-bold">
                                  <td className="border border-black p-1 text-center"></td>
                                  <td colSpan={5} className="border border-black p-1">PEKERJAAN FISIK</td>
                                </tr>
                                {fisikDivs.map((d, idx) => (
                                  <tr key={d.id}>
                                    <td className="border border-black p-1 text-center font-bold">{d.kode || toRoman(idx + 1)}</td>
                                    <td className="border border-black p-1">{d.uraian}</td>
                                    <td className="border border-black p-1 text-right font-mono">{formatNumber(d.bobotTotal, decPlaces, decPlaces)}</td>
                                    <td className="border border-black p-1 text-right font-mono">{d.prestasiMingguLalu > 0 ? formatNumber(d.prestasiMingguLalu, decPlaces, decPlaces) : ''}</td>
                                    <td className="border border-black p-1 text-right font-mono font-bold">{d.prestasiMingguIni > 0 ? formatNumber(d.prestasiMingguIni, decPlaces, decPlaces) : ''}</td>
                                    <td className="border border-black p-1 text-right font-mono font-bold">{d.prestasiSdMingguIni > 0 ? formatNumber(d.prestasiSdMingguIni, decPlaces, decPlaces) : ''}</td>
                                  </tr>
                                ))}
                                <tr className="bg-slate-50 font-bold">
                                  <td className="border border-black p-1 text-center"></td>
                                  <td colSpan={5} className="border border-black p-1">RINCIAN BIAYA MANAJEMEN</td>
                                </tr>
                                {manDivs.map((d, idx) => (
                                  <tr key={d.id}>
                                    <td className="border border-black p-1 text-center font-bold">{d.kode || toRoman(idx + 1)}</td>
                                    <td className="border border-black p-1">{d.uraian}</td>
                                    <td className="border border-black p-1 text-right font-mono">{formatNumber(d.bobotTotal, decPlaces, decPlaces)}</td>
                                    <td className="border border-black p-1 text-right font-mono">{d.prestasiMingguLalu > 0 ? formatNumber(d.prestasiMingguLalu, decPlaces, decPlaces) : ''}</td>
                                    <td className="border border-black p-1 text-right font-mono font-bold">{d.prestasiMingguIni > 0 ? formatNumber(d.prestasiMingguIni, decPlaces, decPlaces) : ''}</td>
                                    <td className="border border-black p-1 text-right font-mono font-bold">{d.prestasiSdMingguIni > 0 ? formatNumber(d.prestasiSdMingguIni, decPlaces, decPlaces) : ''}</td>
                                  </tr>
                                ))}
                                <tr className="bg-slate-100 font-bold">
                                  <td className="border border-black p-1 text-center"></td>
                                  <td className="border border-black p-1 text-right uppercase">TOTAL</td>
                                  <td className="border border-black p-1 text-right font-mono font-bold">{formatNumber(cappedTotBobot, decPlaces, decPlaces)}%</td>
                                  <td className="border border-black p-1 text-right font-mono">{totLalu > 0 ? formatNumber(totLalu, decPlaces, decPlaces) : ''}</td>
                                  <td className="border border-black p-1 text-right font-mono font-bold">{totIni > 0 ? formatNumber(totIni, decPlaces, decPlaces) : ''}</td>
                                  <td className="border border-black p-1 text-right font-mono font-bold">{formatNumber(totSdIni, decPlaces, decPlaces)}</td>
                                </tr>
                              </tbody>
                            </table>

                            {/* Bottom notes */}
                            <div className="border border-black p-2.5 text-[9px] space-y-1 font-sans">
                              <p className="font-bold">KETERANGAN</p>
                              <div className="grid grid-cols-12 gap-1 font-semibold">
                                <span className="col-span-5">PRESTASI PELAKSANAAN (REALISASI)</span>
                                <span className="col-span-1">:</span>
                                <span className="col-span-6 font-mono font-bold">{formatNumber(activeRealisasi, decPlaces, decPlaces)} %</span>
                              </div>
                              <div className="grid grid-cols-12 gap-1">
                                <span className="col-span-5">PRESTASI YANG DIRENCANAKAN (TARGET)</span>
                                <span className="col-span-1">:</span>
                                <span className="col-span-6 font-mono font-bold">{formatNumber(week.bobotRencana, decPlaces, decPlaces)} %</span>
                              </div>
                              <div className="grid grid-cols-12 gap-1">
                                <span className="col-span-5">{isFaster ? 'LEBIH CEPAT DARI RENCANA' : 'TERLAMBAT DARI RENCANA'}</span>
                                <span className="col-span-1">:</span>
                                <span className="col-span-6 font-mono font-bold">{isFaster ? `+${formatNumber(dev, decPlaces, decPlaces)}` : formatNumber(dev, decPlaces, decPlaces)} %</span>
                              </div>
                              <div className="grid grid-cols-12 gap-1 pt-1 border-t border-slate-300">
                                <span className="col-span-5">RENCANA WAKTU PELAKSANAAN</span>
                                <span className="col-span-1">:</span>
                                <span className="col-span-6 font-mono">
                                  {week.rencanaWaktuHK ?? progressWeeks.length * 7} HK ({week.rencanaWaktuMinggu ?? progressWeeks.length} Minggu)
                                </span>
                              </div>
                              <div className="grid grid-cols-12 gap-1">
                                <span className="col-span-5">WAKTU YANG SUDAH DILAKSANAKAN</span>
                                <span className="col-span-1">:</span>
                                <span className="col-span-6 font-mono">
                                  {week.waktuTerlaksanaHK ?? week.mingguKe * 7} HK
                                </span>
                              </div>
                              <div className="grid grid-cols-12 gap-1">
                                <span className="col-span-5">SISA WAKTU PELAKSANAAN</span>
                                <span className="col-span-1">:</span>
                                <span className="col-span-6 font-mono font-bold">
                                  {week.sisaWaktuHK ?? Math.max(0, (week.rencanaWaktuHK ?? progressWeeks.length * 7) - (week.waktuTerlaksanaHK ?? week.mingguKe * 7))} HK
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Signatures */}
                          <div className="grid grid-cols-3 gap-4 pt-6 text-center text-[9px] font-sans print-avoid-break print-signature-block">
                            <div>
                              <p>Mengetahui,</p>
                              <p className="font-bold">Kepala Sekolah</p>
                              <div className="h-12" />
                              <p className="font-bold underline">{school.namaKepalaSekolah}</p>
                              <p>NIP. {school.nipKepalaSekolah}</p>
                            </div>
                            <div>
                              <p>&nbsp;</p>
                              <p className="font-bold">Tim Teknis (Pengawas)</p>
                              <div className="h-12" />
                              <p className="font-bold underline">{school.namaPengawas}</p>
                            </div>
                            <div>
                              <p>{school.kabKota}, {week.periode.split(' - ')[1] || 'Januari 2026'}</p>
                              <p className="font-bold">Ketua P2SP</p>
                              <div className="h-12" />
                              <p className="font-bold underline uppercase">{school.namaKetuaP2SP}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 8B. LEMBAR DOKUMENTASI FOTO FISIK MINGGUAN */}
                      {week.photos && week.photos.length > 0 ? (
                        <div
                          key={`print-prog-photo-${week.mingguKe}`}
                          className="page-break bg-white p-8 font-sans text-[10px] space-y-4 border border-slate-300 print:border-none flex flex-col justify-between"
                          style={{ minHeight: `${activeDim.heightMm}mm` }}
                        >
                          <div className="space-y-4">
                            <div className="text-center font-bold uppercase space-y-0.5 border-b-2 border-black pb-2">
                              <h3 className="text-xs tracking-wider">LEMBAR DOKUMENTASI KEMAJUAN FISIK MINGGUAN</h3>
                              <h4 className="text-[11px]">{school?.program?.toUpperCase() || 'REVITALISASI SEKOLAH'}</h4>
                              <h4 className="text-[11px]">{school?.pekerjaan?.toUpperCase() || ''}</h4>
                              <h4 className="text-xs font-bold">{school?.namaSekolah || ''}</h4>
                              <p className="text-[10px] font-normal">
                                {(school?.kabKota || '').toUpperCase()} PROPINSI {(school?.provinsi || '').toUpperCase()} - TAHUN ANGGARAN {school?.tahunAnggaran || '2025'}
                              </p>
                            </div>

                            <div className="border border-black p-2.5 text-[9px] bg-slate-50/50 space-y-1">
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <span className="text-slate-600">Periode Pekerjaan: </span>
                                  <strong className="font-mono font-bold">Minggu Ke-{week.mingguKe} ({week.periode})</strong>
                                </div>
                                <div className="text-right">
                                  <span className="text-slate-600">Realisasi Fisik s.d Minggu Ini: </span>
                                  <strong className="font-mono font-bold text-slate-900">{formatNumber(totSdIni, 2)}%</strong>
                                  <span className="text-slate-500 font-mono text-[8px] ml-1">
                                    (Rencana: {formatNumber(week.bobotRencana, 2)}% | {isFaster ? `+${formatNumber(dev, 2)}` : formatNumber(dev, 2)}%)
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Photo Cards Grid */}
                            <div className={`grid gap-4 pt-1 ${
                              week.photos.length === 1
                                ? 'grid-cols-1 max-w-xl mx-auto'
                                : 'grid-cols-2'
                            }`}>
                              {week.photos.map((photo, pIdx) => (
                                <div
                                  key={photo.id || pIdx}
                                  className="border border-black flex flex-col bg-white overflow-hidden shadow-2xs"
                                >
                                  <div className={`w-full overflow-hidden bg-slate-100 flex items-center justify-center ${
                                    week.photos!.length === 1 ? 'h-80' : week.photos!.length <= 2 ? 'h-64' : 'h-48'
                                  }`}>
                                    <img
                                      src={photo.url}
                                      alt={photo.caption}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                  <div className="border-t border-black p-2 bg-slate-50 text-center">
                                    <div className="text-[10px] font-bold text-slate-900 font-mono tracking-wide">
                                      Prestasi Fisik: {formatNumber(totSdIni, 2)}%
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Signatures */}
                          <div className="grid grid-cols-3 gap-4 pt-6 text-center text-[9px] font-sans border-t border-slate-300 print-avoid-break print-signature-block">
                            <div>
                              <p>Mengetahui,</p>
                              <p className="font-bold">Kepala Sekolah</p>
                              <div className="h-12" />
                              <p className="font-bold underline">{school.namaKepalaSekolah}</p>
                              <p>NIP. {school.nipKepalaSekolah}</p>
                            </div>
                            <div>
                              <p>&nbsp;</p>
                              <p className="font-bold">Tim Teknis (Pengawas)</p>
                              <div className="h-12" />
                              <p className="font-bold underline">{school.namaPengawas}</p>
                            </div>
                            <div>
                              <p>{school.kabKota}, {week.periode.split(' - ')[1] || 'Januari 2026'}</p>
                              <p className="font-bold">Ketua P2SP</p>
                              <div className="h-12" />
                              <p className="font-bold underline uppercase">{school.namaKetuaP2SP}</p>
                            </div>
                          </div>
                        </div>
                      ) : docType === 'FOTO_PROGRESS' ? (
                        <div
                          key={`empty-photo-${week.mingguKe}`}
                          className="page-break bg-white p-8 font-sans text-xs flex flex-col items-center justify-center text-center text-slate-500 border border-slate-200 print:border-none space-y-2"
                          style={{ minHeight: `${activeDim.heightMm}mm` }}
                        >
                          <p className="font-bold text-slate-700">
                            Belum ada foto progres yang diunggah untuk Minggu Ke-{week.mingguKe} ({week.periode})
                          </p>
                          <p className="text-[11px] text-slate-400 max-w-sm">
                            Silakan buka menu "Laporan Mingguan & Bobot" dan klik tombol "Upload Foto Progres" untuk menambahkan dokumentasi.
                          </p>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
            </div>
          )}

          {/* ========================================================
              9. BERITA ACARA SERAH TERIMA HASIL PEKERJAAN (BAST 100%)
             ======================================================== */}
          {(docType === 'ALL' || docType === 'BAST') && (
            <BastDocument
              school={school}
              progressWeeks={progressWeeks}
              realSchoolData={realSchoolData}
              activeDim={activeDim}
            />
          )}

          {/* ========================================================
              10. BERITA ACARA PEMERIKSAAN KEMAJUAN FISIK (70% & 100%)
             ======================================================== */}
          {(docType === 'ALL' || docType === 'BAP_FISIK') && (
            <BapKemajuanFisikDocument
              school={school}
              progressWeeks={progressWeeks}
              realSchoolData={realSchoolData}
              activeDim={activeDim}
            />
          )}

          {/* ========================================================
              11. BERITA ACARA PEMBAYARAN TERMIN (BAP BAYAR)
             ======================================================== */}
          {(docType === 'ALL' || docType === 'BAP_BAYAR') && (
            <BapPembayaranDocument
              school={school}
              progressWeeks={progressWeeks}
              realSchoolData={realSchoolData}
              activeDim={activeDim}
            />
          )}
        </div>
      </div>
    </div>
  );
};
