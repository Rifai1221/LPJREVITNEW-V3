import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  DollarSign,
  Wallet,
  Receipt,
  Users,
  FileCheck2,
  Printer,
  ChevronRight,
  Sparkles,
  Building,
  CheckCircle2,
  Clock,
  Layers,
  FileSpreadsheet,
  Database,
  Cloud,
  RefreshCw,
  HardDrive,
  Check,
  ArrowRight,
  Scale,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ShieldCheck,
  FileText,
  Tag,
  Info,
  X,
} from 'lucide-react';
import {
  SchoolMasterData,
  RpdItem,
  KwitansiDocument,
  WeeklyWageReport,
  ProjectProgressWeek,
  TaxRecord,
  BkbTransaction,
  BktTransaction,
  RealSchoolData,
  StoreVendor,
} from '../types';
import { formatRupiah, formatNumber } from '../utils/formatters';
import { extractWeekNumberFromKwitansi } from '../services/autoGeneratorService';
import {
  calculateProjectSummaryRekap,
  RekapCategoryItem,
} from '../utils/projectSummaryRekapHelper';

interface DashboardProps {
  school: SchoolMasterData;
  rpdItems: RpdItem[];
  kwitansiList: KwitansiDocument[];
  wageReports: WeeklyWageReport[];
  progressWeeks: ProjectProgressWeek[];
  taxRecords: TaxRecord[];
  bkbList?: BkbTransaction[];
  bktList?: BktTransaction[];
  realSchoolData?: RealSchoolData;
  stores?: StoreVendor[];
  onNavigateTab: (tab: string) => void;
  onOpenPrintModal: (docType: string) => void;
  onOpenQuickReceipt: () => void;
  isGoogleConnected?: boolean;
  googleSheetName?: string;
  isSyncing?: boolean;
  lastSyncedText?: string;
  onOpenGoogleSheetsSync?: () => void;
  onAutoBalanceKwitansi?: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  school,
  rpdItems,
  kwitansiList,
  wageReports,
  progressWeeks,
  taxRecords,
  bkbList = [],
  bktList = [],
  realSchoolData,
  stores = [],
  onNavigateTab,
  onOpenPrintModal,
  onOpenQuickReceipt,
  isGoogleConnected = false,
  googleSheetName,
  isSyncing = false,
  lastSyncedText = 'Tersimpan',
  onOpenGoogleSheetsSync,
  onAutoBalanceKwitansi,
}) => {
  const [selectedCategoryDetail, setSelectedCategoryDetail] = useState<RekapCategoryItem | null>(null);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [isSyncingPagu, setIsSyncingPagu] = useState(false);

  const toggleRowExpand = (key: string) => {
    setExpandedRows((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Active week filtering for Dashboard realisasi calculation (Anti-accumulated phantom receipts)
  const activeWeeks = (progressWeeks || []).filter(
    (w) => (w.bobotRealisasi && w.bobotRealisasi > 0) || w.divisions?.some((d) => (d.prestasiMingguIni || 0) > 0)
  );
  const activeWeekNums = new Set(activeWeeks.map((w) => w.mingguKe));
  const hasActiveProgress = activeWeekNums.size > 0;

  const targetYear = school?.tahunAnggaran?.trim() || '2026';

  // Deduplikasi otomatis: jika kwitansi asli SipLah dari toko rekanan sudah ada, jangan pakai kwitansi dummy KW-SIPLAH/01/2026
  const authenticSiplahExists = kwitansiList.some(
    (k) =>
      k.noBukti?.toUpperCase().startsWith('SIPLAH/') &&
      !k.id.startsWith('kw-sync-') &&
      k.noBukti !== `KW-SIPLAH/01/${targetYear}`
  );
  const cleanKwitansiList = authenticSiplahExists
    ? kwitansiList.filter((k) => !(k.id.startsWith('kw-sync-siplah') || k.noBukti === `KW-SIPLAH/01/${targetYear}`))
    : kwitansiList;

  const validKwitansi = hasActiveProgress
    ? cleanKwitansiList.filter((k) => {
        const wNum = extractWeekNumberFromKwitansi(k, progressWeeks, targetYear);
        return wNum === null || activeWeekNums.has(wNum);
      })
    : cleanKwitansiList.filter((k) => k.tipe === 'KONSULTAN' || (k.tipe === 'OPERASIONAL' && !extractWeekNumberFromKwitansi(k, progressWeeks, targetYear)));

  // Calculations
  const totalAnggaran = school.totalAnggaran || 0;
  const totalRealisasi = validKwitansi.reduce((acc, curr) => acc + curr.nominal, 0);
  const sisaAnggaran = totalAnggaran > 0 ? totalAnggaran - totalRealisasi : 0;
  const persentaseKeuangan = totalAnggaran > 0 ? Math.min(100, (totalRealisasi / totalAnggaran) * 100) : 0;

  const latestWeek = progressWeeks && progressWeeks.length > 0
    ? progressWeeks[progressWeeks.length - 1]
    : { bobotRealisasi: 0, bobotRencana: 0, deviasi: 0 };
  const currentFisik = latestWeek.bobotRealisasi || 0;

  const validKwitansiIds = new Set(validKwitansi.map((k) => k.id));
  const validTaxRecords = hasActiveProgress
    ? taxRecords.filter((t) => !t.kwitansiIdRef || validKwitansiIds.has(t.kwitansiIdRef))
    : [];

  const totalPajakPPN = validTaxRecords.reduce((sum, t) => sum + t.ppn11, 0);
  const totalPajakPPh22 = validTaxRecords.reduce((sum, t) => sum + t.pph22, 0);
  const totalPajakPPh23 = validTaxRecords.reduce((sum, t) => sum + t.pph23, 0);
  const totalSemuaPajak = totalPajakPPN + totalPajakPPh22 + totalPajakPPh23;

  const validWageReports = hasActiveProgress
    ? wageReports.filter((w) => activeWeekNums.has(w.mingguKe))
    : [];
  const totalUpahTerbayar = validWageReports.reduce((sum, w) => sum + w.totalUpah, 0);
  const totalKwitansiMaterial = validKwitansi.filter((k) => k.tipe === 'MATERIAL').length;

  // Rekapitulasi 9 Komponen Biaya Proyek (Pagu RAB vs Realisasi Kwitansi & Upah)
  const rekapSummary = useMemo(() => {
    return calculateProjectSummaryRekap(
      school,
      rpdItems,
      validKwitansi,
      validWageReports,
      progressWeeks,
      realSchoolData
    );
  }, [school, rpdItems, validKwitansi, validWageReports, progressWeeks, realSchoolData]);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-br from-blue-900 via-indigo-900 to-slate-900 rounded-2xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden border border-blue-700/40">
        <div className="absolute right-0 top-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 text-blue-200 text-xs font-semibold border border-blue-400/30">
              <Building className="w-3.5 h-3.5" />
              Sistem LPJ Revitalisasi Terintegrasi
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              {school.namaSekolah}
            </h2>
            <p className="text-sm text-slate-300">
              {school.pekerjaan} • {school.kabKota}, {school.provinsi}
            </p>
            <div className="pt-2 flex flex-wrap items-center gap-4 text-xs text-slate-300">
              <span>NPSN: <strong className="text-white">{school.npsn}</strong></span>
              <span>•</span>
              <span>Periode: <strong className="text-white">{school.periodePenggunaan}</strong></span>
              <span>•</span>
              <span>Bendahara: <strong className="text-white">{school.namaBendahara}</strong></span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => onNavigateTab('realdata')}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold px-4 py-2.5 rounded-xl text-xs sm:text-sm shadow-lg shadow-emerald-600/30 transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
              <span>Data Real Sekolah (RAB & AHSP)</span>
            </button>
            <button
              onClick={onOpenQuickReceipt}
              className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-4 py-2.5 rounded-xl text-xs sm:text-sm shadow-lg shadow-blue-600/30 transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Receipt className="w-4 h-4" />
              <span>+ Buat Kwitansi Cepat</span>
            </button>
            <button
              onClick={() => onOpenPrintModal('ALL')}
              className="bg-slate-800/90 hover:bg-slate-800 text-white font-semibold px-4 py-2.5 rounded-xl text-xs sm:text-sm border border-slate-700 shadow transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <Printer className="w-4 h-4 text-emerald-400" />
              <span>Cetak Bundle LPJ</span>
            </button>
          </div>
        </div>
      </div>

      {/* Real-time App & Database Live Connection Status Card */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500/10 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-600 shrink-0">
            <HardDrive className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <h3 className="text-sm font-bold text-slate-900">
                Aplikasi Sedang Berjalan & Terhubung Real-Time
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-1">
              <span className="inline-flex items-center gap-1 text-slate-700">
                <Cloud className="w-3.5 h-3.5 text-blue-500" />
                <span>Cloud Firestore: <strong>Multi-Tenant Aktif</strong></span>
              </span>
              <span>•</span>
              <span className="inline-flex items-center gap-1">
                <FileSpreadsheet className={`w-3.5 h-3.5 ${isGoogleConnected ? 'text-emerald-600' : 'text-amber-500'}`} />
                <span>
                  Database Google Drive:{' '}
                  {isGoogleConnected ? (
                    <strong className="text-emerald-700 font-semibold">{googleSheetName || 'Google Sheets Terhubung (Sinkron Otomatis)'}</strong>
                  ) : (
                    <span className="text-amber-600 font-medium">Belum Terhubung</span>
                  )}
                </span>
              </span>
              <span>•</span>
              <span className="text-slate-400 text-[11px]">
                {isSyncing ? '⏳ Menyinkronkan...' : `Terakhir disimpan: ${lastSyncedText}`}
              </span>
            </div>
          </div>
        </div>

        {onOpenGoogleSheetsSync && (
          <button
            type="button"
            onClick={onOpenGoogleSheetsSync}
            className={`shrink-0 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer border ${
              isGoogleConnected
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100 shadow-xs'
                : 'bg-gradient-to-r from-amber-500 to-emerald-600 hover:from-amber-600 hover:to-emerald-700 text-white border-transparent shadow-md'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>{isGoogleConnected ? 'Kelola Database Google Drive' : '⚡ Hubungkan ke Google Drive Sekarang'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Pagu */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Pagu Bantuan</span>
            <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
              <Wallet className="w-5 h-5" />
            </div>
          </div>
          <p className="mt-2 text-xl font-bold text-slate-900">{formatRupiah(totalAnggaran)}</p>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
            <span>T1 (70%): {formatRupiah(school.termin1Nilai)}</span>
            <span>T2 (30%): {formatRupiah(school.termin2Nilai)}</span>
          </div>
        </div>

        {/* Realisasi Keuangan */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Realisasi Kas</span>
            <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <p className="mt-2 text-xl font-bold text-emerald-700">{formatRupiah(totalRealisasi)}</p>
          <div className="mt-2 flex items-center gap-2">
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all"
                style={{ width: `${persentaseKeuangan}%` }}
              />
            </div>
            <span className="text-xs font-bold text-emerald-700">{formatNumber(persentaseKeuangan, 1)}%</span>
          </div>
        </div>

        {/* Progress Fisik */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Progres Fisik</span>
            <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <p className="mt-2 text-xl font-bold text-indigo-700">{formatNumber(currentFisik, 1)}%</p>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
            <span>Rencana: {formatNumber(latestWeek.bobotRencana, 1)}%</span>
            <span className="text-emerald-600 font-semibold">Deviasi: +{formatNumber(latestWeek.deviasi, 1)}%</span>
          </div>
        </div>

        {/* Pajak Dipungut */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs hover:shadow-md transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Setor Pajak</span>
            <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
              <FileCheck2 className="w-5 h-5" />
            </div>
          </div>
          <p className="mt-2 text-xl font-bold text-amber-700">{formatRupiah(totalSemuaPajak)}</p>
          <div className="mt-2 text-xs text-slate-500 truncate">
            PPN: {formatRupiah(totalPajakPPN, false)} | PPh: {formatRupiah(totalPajakPPh22 + totalPajakPPh23, false)}
          </div>
        </div>
      </div>

      {/* Posisi Rekening Bank (BKB) & Saldo Cash Riil (BKT) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-slate-900 text-white rounded-xl p-4 border border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-slate-400 text-xs uppercase font-bold tracking-wider">
              <Building className="w-4 h-4 text-cyan-400" />
              <span>Saldo Kas di Bank (BKB)</span>
            </div>
            <p className="text-xl font-bold font-mono text-cyan-300 mt-1">
              {formatRupiah(bkbList && bkbList.length > 0 ? bkbList[bkbList.length - 1].saldo || 0 : 0)}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">Uang tersisa di rekening bank sekolah</p>
          </div>
          <span className="px-2.5 py-1 rounded-lg bg-cyan-950 text-cyan-300 border border-cyan-800 text-[10px] font-mono font-bold">
            Rekening Bank
          </span>
        </div>

        <div className="bg-gradient-to-br from-amber-950/90 via-slate-900 to-slate-900 text-white rounded-xl p-4 border border-amber-800/80 shadow-xs flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-amber-300 text-xs uppercase font-bold tracking-wider">
              <Wallet className="w-4 h-4 text-amber-400" />
              <span>Saldo Cash Riil (Kas Tunai Bendahara)</span>
            </div>
            <p className="text-xl font-bold font-mono text-amber-300 mt-1">
              {formatRupiah(bktList && bktList.length > 0 ? bktList[bktList.length - 1].saldo || 0 : 0)}
            </p>
            <p className="text-[11px] text-amber-200/80 mt-0.5">Sisa uang tunai di tangan siap dibelanjakan (diluar bank)</p>
          </div>
          <span className="px-2.5 py-1 rounded-lg bg-amber-900 text-amber-200 border border-amber-600 text-[10px] font-mono font-bold">
            Uang Fisik / Tunai
          </span>
        </div>
      </div>

      {/* Rekapitulasi Komponen Biaya Proyek (Pagu RAB vs Realisasi Kwitansi & Upah) */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 shadow-sm space-y-5">
        {/* Header Section */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700">
                <Scale className="w-4 h-4" />
              </div>
              <h3 className="text-lg font-extrabold text-slate-900 tracking-tight">
                Rekapitulasi Penyaluran Komponen Biaya Proyek (Pagu RAB vs Realisasi Kwitansi)
              </h3>
              {rekapSummary.isFullyBalanced ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  100% Sinkron Pas ke Pagu (Rp 0 Selisih)
                </span>
              ) : rekapSummary.isOverBudget ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 text-xs font-bold">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                  Melebihi Pagu (+Rp {Math.abs(rekapSummary.totalSisa).toLocaleString('id-ID')})
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-300 text-xs font-bold">
                  <Clock className="w-3.5 h-3.5 text-blue-600" />
                  Berjalan Proporsional ({formatNumber(rekapSummary.totalRealisasiPersen, 1)}%)
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Pemantauan sinkronisasi 9 komponen anggaran: Papan Nama Proyek (Cetak), Bahan Material, SMKK, Belanja SipLah, Upah Kerja, Furnitur (Pintu & Jendela), Konsultan Perencana, Pengawas, dan Pengelola SPJ.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {onAutoBalanceKwitansi && (
              <button
                type="button"
                disabled={isSyncingPagu}
                onClick={async () => {
                  setIsSyncingPagu(true);
                  try {
                    await onAutoBalanceKwitansi();
                  } finally {
                    setTimeout(() => setIsSyncingPagu(false), 800);
                  }
                }}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-white text-xs font-bold transition cursor-pointer shadow-sm ${
                  isSyncingPagu
                    ? 'bg-emerald-800 opacity-90 cursor-wait'
                    : 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-600/30 active:scale-95'
                }`}
                title="Sesuaikan dan selaraskan 9 komponen belanja agar tepat sesuai pagu RAB (saldo akhir kas Rp 0 / Nihil)"
              >
                {isSyncingPagu ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-emerald-200" />
                )}
                <span>{isSyncingPagu ? 'Menyinkronkan 9 Komponen...' : '⚡ Sinkronkan & Selaraskan ke Pagu'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onNavigateTab('realdata')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition cursor-pointer"
              title="Lihat rincian data real RAB dan AHSP sekolah"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-slate-600" />
              <span>Data Real RAB</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('kwitansi')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition cursor-pointer"
              title="Buka pengelola kwitansi dan bukti kas"
            >
              <Receipt className="w-3.5 h-3.5 text-slate-600" />
              <span>Kelola Kwitansi</span>
            </button>
          </div>
        </div>

        {/* 4 Summary Mini Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200/80">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Total Pagu Bantuan</span>
            <p className="text-base sm:text-lg font-bold text-slate-900 mt-1">{formatRupiah(rekapSummary.totalPagu)}</p>
            <span className="text-[11px] text-slate-500 font-medium">100.00% Alokasi RAB</span>
          </div>

          <div className="bg-emerald-50/70 rounded-xl p-3.5 border border-emerald-200/80">
            <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider block">Total Disalurkan Riil</span>
            <p className="text-base sm:text-lg font-bold text-emerald-800 mt-1">{formatRupiah(rekapSummary.totalRealisasi)}</p>
            <span className="text-[11px] text-emerald-700 font-bold">{formatNumber(rekapSummary.totalRealisasiPersen, 1)}% dari Total Pagu</span>
          </div>

          <div className="bg-blue-50/70 rounded-xl p-3.5 border border-blue-200/80">
            <span className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider block">Sisa Anggaran Belum Disalurkan</span>
            <p className="text-base sm:text-lg font-bold text-blue-900 mt-1">
              {formatRupiah(Math.max(0, rekapSummary.totalSisa))}
            </p>
            <span className="text-[11px] text-blue-700 font-medium">
              {formatNumber(Math.max(0, 100 - rekapSummary.totalRealisasiPersen), 1)}% Kuota Tersisa
            </span>
          </div>

          <div className={`rounded-xl p-3.5 border ${
            rekapSummary.isFullyBalanced
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : rekapSummary.isOverBudget
              ? 'bg-rose-50 border-rose-300 text-rose-900'
              : 'bg-indigo-50 border-indigo-200 text-indigo-900'
          }`}>
            <span className="text-[11px] font-semibold uppercase tracking-wider block opacity-80">Keseimbangan Anggaran</span>
            <p className="text-base sm:text-lg font-bold mt-1">
              {rekapSummary.isFullyBalanced
                ? 'Rp 0 (Sempurna Nihil)'
                : rekapSummary.isOverBudget
                ? `+Rp ${Math.abs(rekapSummary.totalSisa).toLocaleString('id-ID')}`
                : formatRupiah(rekapSummary.totalSisa)}
            </p>
            <span className="text-[11px] font-bold block">
              {rekapSummary.isFullyBalanced
                ? '✓ Pas & Sinkron 100%'
                : rekapSummary.isOverBudget
                ? '⚠️ Melebihi Batas Pagu'
                : 'Tahap Pelaksanaan Berjalan'}
            </span>
          </div>
        </div>

        {/* Tabel 9 Komponen Biaya */}
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/90 text-slate-700 uppercase text-[11px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-3.5 font-bold w-12 text-center">No</th>
                <th className="py-3 px-3.5 font-bold">Komponen Belanja Proyek</th>
                <th className="py-3 px-3 font-bold text-center">Label / Tag Acuan</th>
                <th className="py-3 px-3.5 font-bold text-right">Pagu RAB (Rp)</th>
                <th className="py-3 px-2.5 font-bold text-center">% Pagu</th>
                <th className="py-3 px-3.5 font-bold text-right">Penyaluran Riil (Rp)</th>
                <th className="py-3 px-3 font-bold text-center">% Penyerapan</th>
                <th className="py-3 px-3.5 font-bold text-right">Sisa Pagu (Rp)</th>
                <th className="py-3 px-3.5 font-bold text-center">Status Sinkronisasi</th>
                <th className="py-3 px-3 font-bold text-center">Rincian</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rekapSummary.categories.map((cat) => {
                const isExpanded = !!expandedRows[cat.key];
                const isOver = cat.sisaPagu < -1000;
                const isExact = Math.abs(cat.sisaPagu) <= 1000 && cat.paguNominal > 0;

                return (
                  <React.Fragment key={cat.key}>
                    <tr
                      className={`hover:bg-slate-50/80 transition ${
                        isOver
                          ? 'bg-rose-50/30'
                          : isExact
                          ? 'bg-emerald-50/20'
                          : ''
                      }`}
                    >
                      <td className="py-3 px-3.5 text-center font-bold text-slate-500">
                        {cat.no}
                      </td>
                      <td className="py-3 px-3.5 font-medium text-slate-900">
                        <div className="flex items-center gap-2">
                          <span className="text-base shrink-0">{cat.icon}</span>
                          <div>
                            <span className="font-bold text-slate-900 block">{cat.title}</span>
                            <span className="text-[10px] text-slate-500">
                              Kode: <strong className="text-slate-700">{cat.shortCode}</strong>
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex flex-col gap-1 items-center">
                          <span className="inline-block px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-semibold whitespace-nowrap">
                            {cat.rabTagLabel}
                          </span>
                          <span className="inline-block px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 text-[9.5px] font-mono whitespace-nowrap">
                            {cat.kwitansiTagLabel}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3.5 text-right font-mono font-bold text-slate-900">
                        {formatRupiah(cat.paguNominal)}
                      </td>
                      <td className="py-3 px-2.5 text-center font-mono font-semibold text-slate-600">
                        {formatNumber(cat.paguPersen, 2)}%
                      </td>
                      <td className="py-3 px-3.5 text-right">
                        <span className="font-mono font-bold text-emerald-700 block">
                          {formatRupiah(cat.realisasiNominal)}
                        </span>
                        <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1 max-w-[90px] ml-auto">
                          <div
                            className={`h-full rounded-full transition-all ${
                              isOver ? 'bg-rose-500' : isExact ? 'bg-emerald-500' : 'bg-blue-600'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(0, cat.realisasiPersen))}%` }}
                          />
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center font-mono font-bold">
                        <span
                          className={`${
                            isOver
                              ? 'text-rose-700'
                              : isExact
                              ? 'text-emerald-700'
                              : 'text-blue-700'
                          }`}
                        >
                          {formatNumber(cat.realisasiPersen, 1)}%
                        </span>
                      </td>
                      <td className="py-3 px-3.5 text-right font-mono font-semibold">
                        <span
                          className={`${
                            isOver
                              ? 'text-rose-600 font-bold'
                              : isExact
                              ? 'text-slate-400'
                              : 'text-slate-700'
                          }`}
                        >
                          {isExact ? 'Rp 0 (Pas)' : formatRupiah(cat.sisaPagu)}
                        </span>
                      </td>
                      <td className="py-3 px-3.5 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] border whitespace-nowrap ${cat.statusBadgeClass}`}
                        >
                          {cat.statusLabel}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            if (cat.kwitansiCount > 0) {
                              setSelectedCategoryDetail(cat);
                            } else {
                              toggleRowExpand(cat.key);
                            }
                          }}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                            cat.kwitansiCount > 0
                              ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                              : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                          }`}
                          title={`Lihat rincian kwitansi ${cat.title}`}
                        >
                          <span>{cat.kwitansiCount} Kwitansi</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>

                    {/* Inline Expand Row jika belum ada kwitansi tapi di-expand */}
                    {isExpanded && cat.kwitansiCount === 0 && (
                      <tr className="bg-slate-50/50">
                        <td colSpan={10} className="py-2.5 px-4 text-xs text-slate-500 italic">
                          Belum ada kwitansi yang diterbitkan untuk komponen {cat.title}. Penyaluran akan tercatat otomatis saat kwitansi berlabel {cat.shortCode} dibuat atau disinkronkan.
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>

            {/* Total Row */}
            <tfoot className="bg-slate-900 text-white font-bold border-t-2 border-slate-800">
              <tr>
                <td colSpan={3} className="py-3 px-4 text-left uppercase tracking-wider text-xs font-bold text-slate-200">
                  TOTAL AKUMULASI 9 KOMPONEN
                </td>
                <td className="py-3 px-3.5 text-right font-mono text-sm text-cyan-300">
                  {formatRupiah(rekapSummary.totalPagu)}
                </td>
                <td className="py-3 px-2.5 text-center font-mono text-xs text-slate-300">
                  {formatNumber(rekapSummary.totalPaguPersen, 1)}%
                </td>
                <td className="py-3 px-3.5 text-right font-mono text-sm text-emerald-300">
                  {formatRupiah(rekapSummary.totalRealisasi)}
                </td>
                <td className="py-3 px-3 text-center font-mono text-xs text-emerald-300">
                  {formatNumber(rekapSummary.totalRealisasiPersen, 1)}%
                </td>
                <td className="py-3 px-3.5 text-right font-mono text-xs text-amber-300">
                  {rekapSummary.isFullyBalanced ? 'Rp 0 (Pas)' : formatRupiah(rekapSummary.totalSisa)}
                </td>
                <td colSpan={2} className="py-3 px-4 text-center">
                  {rekapSummary.isFullyBalanced ? (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 text-xs font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      100% BALANCE (Rp 0 SELISIH)
                    </span>
                  ) : rekapSummary.isOverBudget ? (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-400/40 text-xs font-bold">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                      DEFISIT (+Rp {Math.abs(rekapSummary.totalSisa).toLocaleString('id-ID')})
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/40 text-xs font-bold">
                      TERSEDIA SISA KAS
                    </span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Guardrail & Synchronization Rule Footer */}
        <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200/80 flex items-start gap-2.5 text-xs text-slate-600">
          <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-slate-800">
              Mekanisme Sinkronisasi & Guardrail Anti-Melebihi / Kurang Pagu:
            </p>
            <p className="leading-relaxed text-[11px] text-slate-600">
              • <strong>Biaya Pasti (Perencana, Pengawas, Pengelola SPJ, SMKK, Cetak Papan Nama & SipLah)</strong> dikunci tepat 100% sesuai pagu RAB dan tidak dipecah.
              <br />
              • <strong>Upah Tenaga Kerja</strong> disinkronkan bertahap mengikuti kurva bobot prestasi fisik dan kehadiran HOK absensi mingguan.
              <br />
              • <strong>Bahan Material Bangunan</strong> berfungsi sebagai penyeimbang kas (floating balancer) yang otomatis direkonsiliasi pada minggu akhir proyek agar total seluruh pengeluaran tepat sama dengan Pagu Anggaran Bantuan (Saldo Kas Akhir Rp 0 Nihil).
            </p>
          </div>
        </div>
      </div>

      {/* Modal Detail Rincian Kwitansi per Kategori */}
      {selectedCategoryDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{selectedCategoryDetail.icon}</span>
                <div>
                  <h4 className="text-base font-bold text-white">
                    Rincian Penyaluran: {selectedCategoryDetail.title}
                  </h4>
                  <p className="text-xs text-slate-300">
                    Label RAB: <strong className="text-cyan-300">{selectedCategoryDetail.rabTagLabel}</strong> • Label Kwitansi: <strong className="text-amber-300">{selectedCategoryDetail.kwitansiTagLabel}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCategoryDetail(null)}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Stats Summary */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 grid grid-cols-3 gap-3 text-xs">
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 text-[10px] uppercase font-bold block">Pagu Anggaran</span>
                <span className="text-sm font-bold font-mono text-slate-900">{formatRupiah(selectedCategoryDetail.paguNominal)}</span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-emerald-700 text-[10px] uppercase font-bold block">Total Realisasi</span>
                <span className="text-sm font-bold font-mono text-emerald-800">{formatRupiah(selectedCategoryDetail.realisasiNominal)}</span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 text-[10px] uppercase font-bold block">Status Penyerapan</span>
                <span className="text-sm font-bold text-slate-900">{formatNumber(selectedCategoryDetail.realisasiPersen, 1)}% ({selectedCategoryDetail.kwitansiCount} Kwitansi)</span>
              </div>
            </div>

            {/* Modal List of Receipts */}
            <div className="p-4 overflow-y-auto flex-1 space-y-2.5">
              {selectedCategoryDetail.kwitansiList.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  {selectedCategoryDetail.key === 'UPAH_KERJA' ? (
                    <div>
                      <p className="font-semibold text-slate-700 text-sm">Penyaluran dicatat via Rekapitulasi Daftar Upah Mingguan</p>
                      <p className="mt-1 text-slate-500">Total Upah Terbayar: {formatRupiah(selectedCategoryDetail.realisasiNominal)} disalurkan langsung kepada pekerja sesuai HOK absensi 14 minggu.</p>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCategoryDetail(null);
                          onNavigateTab('upah');
                        }}
                        className="mt-3 px-3 py-1.5 rounded-lg bg-purple-600 text-white font-semibold text-xs hover:bg-purple-500 transition cursor-pointer"
                      >
                        Buka Menu Upah Pekerja
                      </button>
                    </div>
                  ) : (
                    <p>Belum ada kwitansi yang diterbitkan pada kategori ini.</p>
                  )}
                </div>
              ) : (
                selectedCategoryDetail.kwitansiList.map((kw, idx) => (
                  <div
                    key={kw.id || idx}
                    className="p-3 bg-white rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/20 transition flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                          {kw.noBukti}
                        </span>
                        <span className="text-slate-500 text-[11px]">{kw.tanggalFormatted || kw.tanggal}</span>
                        {kw.namaToko && (
                          <span className="font-semibold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                            {kw.namaToko}
                          </span>
                        )}
                      </div>
                      <p className="text-slate-600 leading-relaxed text-[11px] line-clamp-2">
                        {kw.uraian}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-mono font-bold text-sm text-emerald-800 block">
                        {formatRupiah(kw.nominal)}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {kw.items?.length || 0} item barang
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setSelectedCategoryDetail(null);
                  onNavigateTab('kwitansi');
                }}
                className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Buka Selengkapnya di Menu Kwitansi</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedCategoryDetail(null)}
                className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progress & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Real-time Progress Breakdown */}
        <div className="lg:col-span-2 bg-white rounded-xl p-6 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">Status Progres Mingguan & Realisasi Bahan/Upah</h3>
                <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[11px] font-bold">
                  {progressWeeks.length} Minggu Pelaksanaan
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Kwitansi material harian dan upah tergenerasi otomatis sesuai bobot prestasi kerja masing-masing minggu ({progressWeeks.length} Minggu)
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('progress')}
              className="text-xs text-blue-600 hover:text-blue-700 font-semibold inline-flex items-center gap-1 cursor-pointer shrink-0"
            >
              Kelola Bobot <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3 max-h-[580px] overflow-y-auto pr-1">
            {progressWeeks.map((week) => (
              <div key={week.mingguKe} className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50/20 transition">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold">Minggu {week.mingguKe}</span>
                    <span className="text-slate-500 font-medium">{week.periode}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 text-[11px]">Rencana: {week.bobotRencana}%</span>
                    <span className="text-slate-900 font-bold">Realisasi: {week.bobotRealisasi}%</span>
                  </div>
                </div>
                <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mb-2">
                  <div
                    className="bg-blue-600 h-full rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, week.bobotRealisasi)}%` }}
                  />
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {week.keterangan || `Pekerjaan pelaksanaan fisik dan administrasi minggu ke-${week.mingguKe}`}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Right Col: Quick Modules & Print Shortcuts */}
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-xs space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-3">
              Modul Dokumen LPJ Resmi
            </h3>

            <div className="space-y-2">
              <button
                onClick={() => onOpenPrintModal('COVER')}
                className="w-full text-left p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-blue-50/60 hover:border-blue-200 flex items-center justify-between transition group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 text-blue-700 rounded-md">
                    <Building className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800 group-hover:text-blue-700">Dokumen Cover LPJ</p>
                    <p className="text-[11px] text-slate-500">Logo Tut Wuri Handayani & Kop Resmi</p>
                  </div>
                </div>
                <Printer className="w-4 h-4 text-slate-400 group-hover:text-blue-600" />
              </button>

              <button
                onClick={() => onOpenPrintModal('RPD')}
                className="w-full text-left p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-blue-50/60 hover:border-blue-200 flex items-center justify-between transition group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 text-emerald-700 rounded-md">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800 group-hover:text-blue-700">Rencana Penggunaan Dana (RPD)</p>
                    <p className="text-[11px] text-slate-500">Alokasi Termin 70% & 30%</p>
                  </div>
                </div>
                <Printer className="w-4 h-4 text-slate-400 group-hover:text-blue-600" />
              </button>

              <button
                onClick={() => onOpenPrintModal('BKU')}
                className="w-full text-left p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-blue-50/60 hover:border-blue-200 flex items-center justify-between transition group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-100 text-indigo-700 rounded-md">
                    <DollarSign className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800 group-hover:text-blue-700">Buku Kas Umum (BKU)</p>
                    <p className="text-[11px] text-slate-500">Bulanan & Penutupan Kas</p>
                  </div>
                </div>
                <Printer className="w-4 h-4 text-slate-400 group-hover:text-blue-600" />
              </button>

              <button
                onClick={() => onOpenPrintModal('PAJAK')}
                className="w-full text-left p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-blue-50/60 hover:border-blue-200 flex items-center justify-between transition group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-100 text-amber-700 rounded-md">
                    <FileCheck2 className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800 group-hover:text-blue-700">Rekapitulasi Pajak</p>
                    <p className="text-[11px] text-slate-500">PPN 11%, PPh 22, PPh 23</p>
                  </div>
                </div>
                <Printer className="w-4 h-4 text-slate-400 group-hover:text-blue-600" />
              </button>

              <button
                onClick={() => onOpenPrintModal('UPAH')}
                className="w-full text-left p-3 rounded-lg border border-slate-100 bg-slate-50 hover:bg-blue-50/60 hover:border-blue-200 flex items-center justify-between transition group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 text-purple-700 rounded-md">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800 group-hover:text-blue-700">Daftar Upah Kerja Harian</p>
                    <p className="text-[11px] text-slate-500">14 Minggu Absensi & HOK</p>
                  </div>
                </div>
                <Printer className="w-4 h-4 text-slate-400 group-hover:text-blue-600" />
              </button>
            </div>
          </div>

          <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 text-xs text-blue-900">
            <p className="font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-blue-600" /> Terintegrasi Otomatis
            </p>
            <p className="mt-1 text-[11px] text-blue-700 leading-relaxed">
              Setiap perubahan RPD atau bobot mingguan langsung menyinkronkan BKU, BKT, BKB, Kwitansi, SPB, Bon Toko, dan Pajak.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
