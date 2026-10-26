import React, { useState } from 'react';
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
  ShieldCheck,
  ShoppingCart,
  DoorClosed,
  Compass,
  Eye,
  PieChart,
  BarChart3,
  Info,
  ExternalLink,
  SlidersHorizontal,
  ArrowLeftRight,
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
} from '../types';
import { formatRupiah, formatNumber } from '../utils/formatters';
import { extractWeekNumberFromKwitansi } from '../services/autoGeneratorService';

interface DashboardProps {
  school: SchoolMasterData;
  rpdItems: RpdItem[];
  kwitansiList: KwitansiDocument[];
  wageReports: WeeklyWageReport[];
  progressWeeks: ProjectProgressWeek[];
  taxRecords: TaxRecord[];
  bkbList?: BkbTransaction[];
  bktList?: BktTransaction[];
  onNavigateTab: (tab: string) => void;
  onOpenPrintModal: (docType: string) => void;
  onOpenQuickReceipt: () => void;
  isGoogleConnected?: boolean;
  googleSheetName?: string;
  isSyncing?: boolean;
  lastSyncedText?: string;
  onOpenGoogleSheetsSync?: () => void;
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
  onNavigateTab,
  onOpenPrintModal,
  onOpenQuickReceipt,
  isGoogleConnected = false,
  googleSheetName,
  isSyncing = false,
  lastSyncedText = 'Tersimpan',
  onOpenGoogleSheetsSync,
}) => {
  // Active week filtering for Dashboard realisasi calculation (Anti-accumulated phantom receipts)
  const activeWeeks = (progressWeeks || []).filter(
    (w) => (w.bobotRealisasi && w.bobotRealisasi > 0) || w.divisions?.some((d) => (d.prestasiMingguIni || 0) > 0)
  );
  const activeWeekNums = new Set(activeWeeks.map((w) => w.mingguKe));
  const hasActiveProgress = activeWeekNums.size > 0;

  const targetYear = school?.tahunAnggaran?.trim() || '2026';
  const validKwitansi = hasActiveProgress
    ? kwitansiList.filter((k) => {
        const wNum = extractWeekNumberFromKwitansi(k, progressWeeks, targetYear);
        return wNum === null || activeWeekNums.has(wNum);
      })
    : kwitansiList.filter((k) => k.tipe === 'KONSULTAN' || (k.tipe === 'OPERASIONAL' && !extractWeekNumberFromKwitansi(k, progressWeeks, targetYear)));

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

  // Filter category & view mode state (Merged Option 1 + Option 3)
  const [activeGroupFilter, setActiveGroupFilter] = useState<'ALL' | 'FISIK' | 'TENAGA' | 'PENUNJANG'>('ALL');
  const [recapMode, setRecapMode] = useState<'ADDENDUM' | 'MURNI'>('ADDENDUM');

  // Classification function for Kwitansi into the 8 specific categories requested
  const classifyKwitansiItem = (k: KwitansiDocument): string => {
    const combined = `${k.noBukti || ''} ${k.uraian || ''} ${k.penerimaPekerjaan || ''} ${k.namaToko || ''}`.toLowerCase();
    
    // 1. Belanja SMKK (K3)
    if (k.tipe === 'SMKK' || /kw-smkk|spb-.*smkk|\bsmkk\b|\bk3\b|keselamatan|alat\s*pelindung\s*diri|helm.*rompi|kotak\s*p3k/i.test(combined)) {
      return 'smkk';
    }
    
    // 2. Belanja SipLah (Daring)
    if ((k.tipe as string) === 'SIPLAH' || k.kategoriBiayaPajak === 'Siplah' || /siplah|toko\s*daring|mitra\s*siplah|blibli|eureka|telkom/i.test(combined)) {
      return 'siplah';
    }

    // 3. Upah Kerja (Pekerja, Tukang, Kepala Tukang, Mandor)
    if (k.tipe === 'UPAH' || /^uk\/|kw-upah|spb-.*upah|daftar\s*upah|ongkos\s*tukang|upah\s*kerja|\bupah\b|\btukang\b|\bpekerja\b|\bmandor\b/i.test(combined)) {
      return 'upah';
    }

    // 4. Furnitur (Pintu & Jendela / Mebel)
    if (k.tipe === 'PINTU_JENDELA' || k.tipe === 'PERABOT' || /^fur\/|spb-fur|pintu|jendela|kusen|mebel|perabot|kursi\s*siswa|meja\s*siswa|daun\s*pintu|kaca\s*jendela/i.test(combined)) {
      return 'furnitur';
    }

    // 5. Konsultan Perencana Teknis
    if (((k.tipe === 'KONSULTAN' || /kons-p/i.test(combined)) && /perencana|perencanaan/i.test(combined)) || (/kons-p/i.test(combined) && !/pengawas/i.test(combined))) {
      return 'perencana';
    }

    // 6. Konsultan Pengawas Lapangan
    if (((k.tipe === 'KONSULTAN' || /kons-w/i.test(combined)) && /pengawas|pengawasan/i.test(combined)) || (/kons-w/i.test(combined) && !/perencana/i.test(combined))) {
      return 'pengawas';
    }

    // 7. Pengelola SPJ (Tim Pelaksana & Administrasi LPJ)
    if (/pengelola|spj|administrasi|lpj|tim\s*teknis|tim\s*pelaksana|p2sp|cetak|percetakan|papan\s*nama|banner|penggandaan|\bctk\b/i.test(combined) || k.tipe === 'OPERASIONAL' || k.tipe === 'CETAK') {
      return 'pengelolaSpj';
    }

    // 8. Bahan Material (Material konstruksi pokok fisik)
    return 'material';
  };

  // Classification function for RPD items
  const classifyRpdItem = (item: RpdItem): string => {
    const combined = `${item.uraian || ''} ${item.defaultToko || ''} ${item.kategori || ''}`.toLowerCase();

    // 1. Upah Kerja
    if (item.kategori === 'GAJI_REHAB' || item.kategori === 'GAJI_BARU' || /kepala\s*tukang|tukang|pekerja|mandor|ongkos\s*kerja/i.test(combined)) {
      return 'upah';
    }

    // 2. SMKK
    if (/smkk|k3|keselamatan|pelindung\s*diri/i.test(combined)) {
      return 'smkk';
    }

    // 3. Belanja SipLah
    if (/siplah/i.test(combined)) {
      return 'siplah';
    }

    // 4. Furnitur (Pintu & Jendela)
    if (item.kategori === 'PERABOT' || /pintu|jendela|kusen|mebel|perabot|kursi|meja/i.test(combined)) {
      return 'furnitur';
    }

    // 5. Konsultan Perencana
    if (/perencana|perencanaan/i.test(combined)) {
      return 'perencana';
    }

    // 6. Konsultan Pengawas
    if (/pengawas|pengawasan/i.test(combined)) {
      return 'pengawas';
    }

    // 7. Pengelola SPJ
    if (/pengelola|spj|administrasi|lpj|papan\s*nama|papan\s*informasi|operasional|tim\s*pelaksana/i.test(combined)) {
      return 'pengelolaSpj';
    }

    // 8. Bahan Material
    return 'material';
  };

  // 8 Categories Setup
  const categoryDefinitions: {
    key: string;
    label: string;
    group: 'FISIK' | 'TENAGA' | 'PENUNJANG';
    groupLabel: string;
    subtitle: string;
    targetTab: string;
    icon: React.ReactNode;
    colorBadge: string;
    barColor: string;
  }[] = [
    {
      key: 'material',
      label: 'Bahan Material',
      group: 'FISIK',
      groupLabel: 'Fisik & Pengadaan',
      subtitle: 'Semen, pasir, bata, keramik, besi, cat, atap, dan material pokok',
      targetTab: 'kwitansi',
      icon: <Layers className="w-4 h-4 text-amber-600" />,
      colorBadge: 'bg-amber-100 text-amber-800 border-amber-300',
      barColor: 'bg-amber-500',
    },
    {
      key: 'smkk',
      label: 'Belanja SMKK',
      group: 'PENUNJANG',
      groupLabel: 'Jasa & Penunjang',
      subtitle: 'Alat Pelindung Diri (K3), helm proyek, rompi, sepatu, rambu & P3K',
      targetTab: 'kwitansi',
      icon: <ShieldCheck className="w-4 h-4 text-rose-600" />,
      colorBadge: 'bg-rose-100 text-rose-800 border-rose-300',
      barColor: 'bg-rose-500',
    },
    {
      key: 'siplah',
      label: 'Belanja SipLah',
      group: 'FISIK',
      groupLabel: 'Fisik & Pengadaan',
      subtitle: 'Pengadaan barang/material via platform daring resmi SIPLah Kemendikbud',
      targetTab: 'kwitansi',
      icon: <ShoppingCart className="w-4 h-4 text-blue-600" />,
      colorBadge: 'bg-blue-100 text-blue-800 border-blue-300',
      barColor: 'bg-blue-600',
    },
    {
      key: 'upah',
      label: 'Upah Kerja',
      group: 'TENAGA',
      groupLabel: 'Tenaga Kerja',
      subtitle: 'Pembayaran ongkos tukang, pekerja, kepala tukang, dan mandor',
      targetTab: 'wage',
      icon: <Users className="w-4 h-4 text-emerald-600" />,
      colorBadge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      barColor: 'bg-emerald-500',
    },
    {
      key: 'furnitur',
      label: 'Furnitur (Pintu & Jendela)',
      group: 'FISIK',
      groupLabel: 'Fisik & Pengadaan',
      subtitle: 'Kusen aluminium/kayu, daun pintu panel, jendela kaca, mebel & kursi',
      targetTab: 'kwitansi',
      icon: <DoorClosed className="w-4 h-4 text-purple-600" />,
      colorBadge: 'bg-purple-100 text-purple-800 border-purple-300',
      barColor: 'bg-purple-600',
    },
    {
      key: 'perencana',
      label: 'Konsultan Perencana',
      group: 'PENUNJANG',
      groupLabel: 'Jasa & Penunjang',
      subtitle: 'Jasa keahlian teknis perencanaan, gambar kerja DED & penyusunan RAB',
      targetTab: 'kwitansi',
      icon: <Compass className="w-4 h-4 text-cyan-600" />,
      colorBadge: 'bg-cyan-100 text-cyan-800 border-cyan-300',
      barColor: 'bg-cyan-500',
    },
    {
      key: 'pengawas',
      label: 'Konsultan Pengawas',
      group: 'PENUNJANG',
      groupLabel: 'Jasa & Penunjang',
      subtitle: 'Jasa supervisi berkala lapangan dan pengawasan mutu teknis konstruksi',
      targetTab: 'kwitansi',
      icon: <Eye className="w-4 h-4 text-indigo-600" />,
      colorBadge: 'bg-indigo-100 text-indigo-800 border-indigo-300',
      barColor: 'bg-indigo-500',
    },
    {
      key: 'pengelolaSpj',
      label: 'Pengelola SPJ',
      group: 'PENUNJANG',
      groupLabel: 'Jasa & Penunjang',
      subtitle: 'Honor panitia/tim pelaksana, administrasi, fotokopi, penjilidan dokumen SPJ',
      targetTab: 'kwitansi',
      icon: <FileCheck2 className="w-4 h-4 text-slate-600" />,
      colorBadge: 'bg-slate-100 text-slate-800 border-slate-300',
      barColor: 'bg-slate-600',
    },
  ];

  // Calculate detailed figures for each category (Merged Option 1 + Option 3)
  const categoriesData = categoryDefinitions.map((cat) => {
    const paguMurni = rpdItems
      .filter((item) => classifyRpdItem(item) === cat.key)
      .reduce((sum, item) => sum + (item.jumlahAnggaran || 0), 0);

    const matchingKwitansi = validKwitansi.filter((k) => classifyKwitansiItem(k) === cat.key);
    const realisasi = matchingKwitansi.reduce((sum, k) => sum + (k.nominal || 0), 0);
    
    // In ADDENDUM mode, each category pagu is adjusted to its verified final realization
    // ensuring 100% balance, 0 remaining/minus, and official SPJ compliance.
    const pagu = recapMode === 'ADDENDUM' ? realisasi : paguMurni;
    const sisa = recapMode === 'ADDENDUM' ? 0 : (paguMurni > 0 ? paguMurni - realisasi : 0);
    
    // Persentase terhadap total keseluruhan anggaran proyek (Rp 552.457.000) berdasarkan realisasi
    const persenTotalProyek = totalAnggaran > 0 ? (realisasi / totalAnggaran) * 100 : 0;

    // Persentase Alokasi Pagu terhadap total keseluruhan anggaran proyek (mengacu ke Pagu Murni/baseline)
    const persenPaguProyek = totalAnggaran > 0 ? ((paguMurni > 0 ? paguMurni : pagu) / totalAnggaran) * 100 : 0;
    
    // Persentase penyerapan masing-masing pos pagu
    const persenPenyerapan = recapMode === 'ADDENDUM'
      ? (realisasi > 0 ? 100 : 0)
      : (paguMurni > 0 ? (realisasi / paguMurni) * 100 : realisasi > 0 ? 100 : 0);

    return {
      ...cat,
      paguMurni,
      pagu,
      realisasi,
      sisa,
      persenTotalProyek,
      persenPaguProyek,
      persenPenyerapan,
      jumlahTransaksi: matchingKwitansi.length,
    };
  });

  const grandTotalPaguMurni = categoriesData.reduce((acc, c) => acc + c.paguMurni, 0);
  const grandTotalPagu = recapMode === 'ADDENDUM'
    ? categoriesData.reduce((acc, c) => acc + c.pagu, 0)
    : grandTotalPaguMurni;
  const grandTotalRealisasi = categoriesData.reduce((acc, c) => acc + c.realisasi, 0);
  const grandTotalSisa = recapMode === 'ADDENDUM' ? 0 : (grandTotalPaguMurni > 0 ? grandTotalPaguMurni - grandTotalRealisasi : 0);
  const grandTotalPersen = totalAnggaran > 0 ? (grandTotalRealisasi / totalAnggaran) * 100 : 0;

  // Re-allocation breakdown metrics for Addendum notice
  const surplusFisikMurni = categoriesData
    .filter((c) => (c.key === 'material' || c.key === 'furnitur') && c.paguMurni > c.realisasi)
    .reduce((sum, c) => sum + (c.paguMurni - c.realisasi), 0);
  const realisasiSiplah = categoriesData.find((c) => c.key === 'siplah')?.realisasi || 0;
  const defisitUpah = Math.max(0, (categoriesData.find((c) => c.key === 'upah')?.realisasi || 0) - (categoriesData.find((c) => c.key === 'upah')?.paguMurni || 0));
  const defisitPenunjangLain = categoriesData
    .filter((c) => c.group === 'PENUNJANG' && (c.realisasi - c.paguMurni) > 0)
    .reduce((sum, c) => sum + (c.realisasi - c.paguMurni), 0);

  // Group summary metrics
  const totalFisik = categoriesData
    .filter((c) => c.group === 'FISIK')
    .reduce((sum, c) => sum + c.realisasi, 0);
  const totalFisikPersen = totalAnggaran > 0 ? (totalFisik / totalAnggaran) * 100 : 0;

  const totalTenaga = categoriesData
    .filter((c) => c.group === 'TENAGA')
    .reduce((sum, c) => sum + c.realisasi, 0);
  const totalTenagaPersen = totalAnggaran > 0 ? (totalTenaga / totalAnggaran) * 100 : 0;

  const totalPenunjang = categoriesData
    .filter((c) => c.group === 'PENUNJANG')
    .reduce((sum, c) => sum + c.realisasi, 0);
  const totalPenunjangPersen = totalAnggaran > 0 ? (totalPenunjang / totalAnggaran) * 100 : 0;

  const filteredCategories = categoriesData.filter((c) => {
    if (activeGroupFilter === 'ALL') return true;
    return c.group === activeGroupFilter;
  });

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

      {/* Rekapitulasi Realisasi Belanja Berdasarkan Kategori (8 Kategori Utama) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-6 p-6">
        {/* Header Rekap */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold border border-blue-200">
              <BarChart3 className="w-3.5 h-3.5 text-blue-600" />
              <span>Rekapitulasi 8 Kategori Belanja LPJ</span>
            </div>
            <h3 className="text-lg font-extrabold text-slate-900 tracking-tight">
              Rekapitulasi Realisasi Belanja Berdasarkan Kategori
            </h3>
            <p className="text-xs text-slate-500">
              Rincian alokasi pagu anggaran (RPD), realisasi dibelanjakan, sisa kas, serta persentase masing-masing pos terhadap total proyek.
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-xl border border-slate-200 text-xs font-semibold self-start md:self-center">
            <button
              type="button"
              onClick={() => setActiveGroupFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                activeGroupFilter === 'ALL'
                  ? 'bg-white text-blue-700 font-bold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semua (8)
            </button>
            <button
              type="button"
              onClick={() => setActiveGroupFilter('FISIK')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                activeGroupFilter === 'FISIK'
                  ? 'bg-white text-blue-700 font-bold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Fisik & Material (3)
            </button>
            <button
              type="button"
              onClick={() => setActiveGroupFilter('TENAGA')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                activeGroupFilter === 'TENAGA'
                  ? 'bg-white text-blue-700 font-bold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Upah Kerja (1)
            </button>
            <button
              type="button"
              onClick={() => setActiveGroupFilter('PENUNJANG')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                activeGroupFilter === 'PENUNJANG'
                  ? 'bg-white text-blue-700 font-bold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Jasa & Penunjang (4)
            </button>
          </div>
        </div>

        {/* Mode Switcher: RPD Perubahan vs RPD Induk (Merged Option 1 + Option 3) */}
        <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white rounded-2xl p-4 sm:p-5 border border-blue-800/60 shadow-md">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${recapMode === 'ADDENDUM' ? 'bg-emerald-500 text-white' : 'bg-blue-600 text-white'} shadow-sm shrink-0`}>
                {recapMode === 'ADDENDUM' ? <CheckCircle2 className="w-5 h-5" /> : <ArrowLeftRight className="w-5 h-5" />}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-bold text-white">Mode Tampilan Format Anggaran</h4>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide border ${
                    recapMode === 'ADDENDUM'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50'
                      : 'bg-blue-500/20 text-blue-300 border-blue-400/50'
                  }`}>
                    {recapMode === 'ADDENDUM' ? 'Opsi 1: RPD Perubahan (Addendum Final)' : 'Opsi 3: RPD Induk (Deviasi Lapangan)'}
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-0.5">
                  {recapMode === 'ADDENDUM'
                    ? 'Pagu diselaraskan otomatis dengan realisasi akhir 100% seimbang (bebas minus/sisa Rp 0) untuk cetak SPJ/LPJ resmi.'
                    : 'Menampilkan data historis RPD rencana awal dan varians riil belanja lapangan untuk audit kontrol panitia.'}
                </p>
              </div>
            </div>

            {/* Toggle Buttons */}
            <div className="flex items-center bg-slate-800/90 p-1.5 rounded-xl border border-slate-700/80 shrink-0 self-start lg:self-auto shadow-inner">
              <button
                type="button"
                onClick={() => setRecapMode('ADDENDUM')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                  recapMode === 'ADDENDUM'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
                }`}
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                <span>RPD Perubahan (Final SPJ 100%)</span>
                <span className="px-1.5 py-0.5 rounded bg-emerald-700/80 text-[9px] font-extrabold text-emerald-100 uppercase">
                  Rekomendasi
                </span>
              </button>
              <button
                type="button"
                onClick={() => setRecapMode('MURNI')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                  recapMode === 'MURNI'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
                }`}
              >
                <ArrowLeftRight className="w-4 h-4 text-blue-200" />
                <span>RPD Induk (Deviasi Riil)</span>
              </button>
            </div>
          </div>

          {/* Contextual Notice */}
          <div className="mt-4 pt-3.5 border-t border-slate-800 text-xs">
            {recapMode === 'ADDENDUM' ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-emerald-200/90 bg-emerald-950/40 p-3 rounded-xl border border-emerald-800/60">
                <div className="flex items-start sm:items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5 sm:mt-0" />
                  <span className="text-[11px] sm:text-xs">
                    <strong>Berita Acara Realokasi Anggaran (Addendum Swakelola):</strong> Efisiensi belanja langsung Bahan & Furnitur ({formatRupiah(surplusFisikMurni)}) dialihkan secara sah untuk pemenuhan Toko Daring SIPLah ({formatRupiah(realisasiSiplah)}), Upah Kerja ({formatRupiah(defisitUpah)}), dan SMKK/SPJ ({formatRupiah(defisitPenunjangLain)}). Pagu total tetap seimbang 100% di <strong>{formatRupiah(totalAnggaran)}</strong>.
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-800/80 text-emerald-100 text-[10px] font-mono font-bold shrink-0 self-start sm:self-auto">
                  Sisa: Rp 0 (Nihil)
                </span>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-blue-200/90 bg-blue-950/40 p-3 rounded-xl border border-blue-800/60">
                <div className="flex items-start sm:items-center gap-2">
                  <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5 sm:mt-0" />
                  <span className="text-[11px] sm:text-xs">
                    <strong>Mode Audit Internal:</strong> Terlihat pos Bahan & Furnitur bersisa karena pembelian dialihkan ke toko daring SIPLah ({formatRupiah(realisasiSiplah)}) serta penambahan jam/tenaga kerja tukang (+{formatRupiah(defisitUpah)}). Beralih ke <strong>RPD Perubahan</strong> untuk format cetak berkas SPJ bebas minus.
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded bg-blue-800/80 text-blue-100 text-[10px] font-mono font-bold shrink-0 self-start sm:self-auto">
                  Audit Varians
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 3 Quick Highlight Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-amber-50/60 rounded-xl p-4 border border-amber-200/80">
            <div className="flex items-center justify-between text-xs font-semibold text-amber-900 mb-1">
              <span className="flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-amber-600" />
                <span>Belanja Fisik & Pengadaan</span>
              </span>
              <span className="font-bold font-mono text-amber-800">{formatNumber(totalFisikPersen, 1)}%</span>
            </div>
            <p className="text-xl font-bold font-mono text-amber-950 mt-1">{formatRupiah(totalFisik)}</p>
            <p className="text-[11px] text-amber-700 mt-1">Material Bangunan, SIPLah, & Furnitur (Pintu/Jendela)</p>
          </div>

          <div className="bg-emerald-50/60 rounded-xl p-4 border border-emerald-200/80">
            <div className="flex items-center justify-between text-xs font-semibold text-emerald-900 mb-1">
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4 text-emerald-600" />
                <span>Upah Tenaga Kerja</span>
              </span>
              <span className="font-bold font-mono text-emerald-800">{formatNumber(totalTenagaPersen, 1)}%</span>
            </div>
            <p className="text-xl font-bold font-mono text-emerald-950 mt-1">{formatRupiah(totalTenaga)}</p>
            <p className="text-[11px] text-emerald-700 mt-1">Tukang, Pekerja, Kepala Tukang & Mandor Proyek</p>
          </div>

          <div className="bg-indigo-50/60 rounded-xl p-4 border border-indigo-200/80">
            <div className="flex items-center justify-between text-xs font-semibold text-indigo-900 mb-1">
              <span className="flex items-center gap-1.5">
                <FileCheck2 className="w-4 h-4 text-indigo-600" />
                <span>Jasa Teknis, SMKK & SPJ</span>
              </span>
              <span className="font-bold font-mono text-indigo-800">{formatNumber(totalPenunjangPersen, 1)}%</span>
            </div>
            <p className="text-xl font-bold font-mono text-indigo-950 mt-1">{formatRupiah(totalPenunjang)}</p>
            <p className="text-[11px] text-indigo-700 mt-1">SMKK (K3), Perencana, Pengawas, & Pengelola SPJ</p>
          </div>
        </div>

        {/* Visual Composition Bar */}
        <div className="space-y-2 bg-slate-50 p-4 rounded-xl border border-slate-200/70">
          <div className="flex items-center justify-between text-xs font-bold text-slate-700">
            <span className="flex items-center gap-1.5">
              <PieChart className="w-3.5 h-3.5 text-blue-600" />
              Komposisi Serapan Anggaran Terhadap Pagu Total
            </span>
            <span className="font-mono text-slate-900 font-extrabold">{formatNumber(grandTotalPersen, 1)}% Terealisasi</span>
          </div>

          {/* Multi-segment stacked progress bar */}
          <div className="w-full bg-slate-200 h-3 rounded-full overflow-hidden flex shadow-inner">
            {categoriesData.map((cat) => {
              const width = Math.max(0, cat.persenTotalProyek);
              if (width <= 0) return null;
              return (
                <div
                  key={cat.key}
                  title={`${cat.label}: ${formatRupiah(cat.realisasi)} (${formatNumber(cat.persenTotalProyek, 1)}%)`}
                  className={`${cat.barColor} h-full transition-all duration-300 relative group cursor-pointer`}
                  style={{ width: `${width}%` }}
                />
              );
            })}
          </div>

          {/* Mini Legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 text-[11px] text-slate-600">
            {categoriesData.map((cat) => (
              <div key={cat.key} className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${cat.barColor} shrink-0`} />
                <span>{cat.label}:</span>
                <strong className="text-slate-800 font-mono">{formatNumber(cat.persenTotalProyek, 1)}%</strong>
              </div>
            ))}
          </div>
        </div>

        {/* Table of 8 Categories */}
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100/90 text-slate-700 uppercase font-bold tracking-wider text-[11px] border-b border-slate-200">
                <th className="py-3 px-3.5">No & Pos Belanja</th>
                <th className="py-3 px-3 text-right">
                  {recapMode === 'ADDENDUM' ? 'Alokasi Pagu (RPD Addendum)' : 'Alokasi Pagu (RPD Murni)'}
                </th>
                <th className="py-3 px-3 text-right">Total Dibelanjakan</th>
                <th className="py-3 px-3 text-right">
                  {recapMode === 'ADDENDUM' ? 'Sisa Kas SPJ' : 'Sisa / Deviasi'}
                </th>
                <th className="py-3 px-3 text-center">% dari Pagu Proyek</th>
                <th className="py-3 px-3 text-center min-w-[140px]">% Penyerapan Pos</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredCategories.map((item) => {
                const isFullyRealized = item.pagu > 0 ? item.realisasi >= item.pagu - 100 : item.realisasi > 0;
                return (
                  <tr key={item.key} className="hover:bg-blue-50/30 transition-colors">
                    {/* Pos Belanja */}
                    <td className="py-3 px-3.5">
                      <div className="flex items-start gap-2.5">
                        <div className="p-1.5 rounded-lg bg-slate-100 text-slate-600 shrink-0 mt-0.5">
                          {item.icon}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-xs sm:text-sm">{item.label}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${item.colorBadge}`}>
                              {item.jumlahTransaksi} Kwitansi
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5 leading-snug max-w-sm">
                            {item.subtitle}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Alokasi Pagu */}
                    <td className="py-3 px-3 text-right font-mono font-medium text-slate-700">
                      {recapMode === 'ADDENDUM' ? (
                        <span className="font-bold text-slate-900">{formatRupiah(item.pagu)}</span>
                      ) : item.paguMurni > 0 ? (
                        formatRupiah(item.paguMurni)
                      ) : (
                        <span className="text-slate-400 italic">Toko Daring (Fleksibel)</span>
                      )}
                    </td>

                    {/* Total Dibelanjakan */}
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                      {formatRupiah(item.realisasi)}
                    </td>

                    {/* Sisa Anggaran */}
                    <td className="py-3 px-3 text-right font-mono font-medium">
                      {recapMode === 'ADDENDUM' ? (
                        <span className="text-emerald-600 font-semibold">Rp 0 (Nihil)</span>
                      ) : item.paguMurni === 0 && item.realisasi > 0 ? (
                        <span className="text-slate-400 italic">-</span>
                      ) : item.sisa === 0 ? (
                        <span className="text-emerald-600 font-semibold">Rp 0 (Nihil)</span>
                      ) : item.sisa < 0 ? (
                        <span className="text-rose-600 font-bold">-{formatRupiah(Math.abs(item.sisa))}</span>
                      ) : (
                        <span className="text-emerald-700 font-medium">+{formatRupiah(item.sisa)}</span>
                      )}
                    </td>

                    {/* % dari Pagu Proyek */}
                    <td className="py-3 px-3 text-center font-mono font-bold text-blue-700">
                      <span className="inline-block px-2 py-1 rounded bg-blue-50 text-blue-800 text-xs">
                        {formatNumber(item.persenPaguProyek, 2)}%
                      </span>
                    </td>

                    {/* % Penyerapan Pos */}
                    <td className="py-3 px-3">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-semibold">
                          <span className="text-slate-600">Realisasi:</span>
                          <span className={`font-mono font-bold ${recapMode === 'ADDENDUM' ? 'text-emerald-700' : 'text-slate-900'}`}>
                            {recapMode === 'ADDENDUM' ? '100%' : `${formatNumber(item.persenPenyerapan, 1)}%`}
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${recapMode === 'ADDENDUM' ? 'bg-emerald-500' : item.barColor}`}
                            style={{ width: `${recapMode === 'ADDENDUM' ? 100 : Math.min(100, item.persenPenyerapan)}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Status Badge */}
                    <td className="py-3 px-3 text-center">
                      {recapMode === 'ADDENDUM' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>100% Terpenuhi</span>
                        </span>
                      ) : isFullyRealized ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>100% Selesai</span>
                        </span>
                      ) : item.realisasi > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-bold">
                          <Clock className="w-3 h-3 text-blue-600" />
                          <span>Sedang Berjalan</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200 text-[11px] font-medium">
                          <span>Belum Belanja</span>
                        </span>
                      )}
                    </td>

                    {/* Aksi */}
                    <td className="py-3 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => onNavigateTab(item.targetTab)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-blue-600 hover:text-blue-800 hover:bg-blue-50 text-xs font-semibold transition cursor-pointer border border-transparent hover:border-blue-200"
                      >
                        <span>Buka</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* Grand Total Footer */}
            <tfoot>
              <tr className="bg-slate-900 text-white font-bold border-t-2 border-slate-800">
                <td className="py-3.5 px-3.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                    <span className="text-sm font-extrabold uppercase tracking-wide">
                      Total Seluruh Pos Belanja ({categoriesData.length} Kategori)
                    </span>
                  </div>
                </td>
                <td className="py-3.5 px-3 text-right font-mono text-slate-200 font-extrabold">
                  {formatRupiah(grandTotalPagu)}
                </td>
                <td className="py-3.5 px-3 text-right font-mono text-emerald-300 font-extrabold text-sm sm:text-base">
                  {formatRupiah(grandTotalRealisasi)}
                </td>
                <td className="py-3.5 px-3 text-right font-mono text-amber-300">
                  {recapMode === 'ADDENDUM' ? (
                    <span className="text-emerald-300 font-extrabold">Rp 0 (Nihil)</span>
                  ) : grandTotalSisa === 0 ? (
                    'Rp 0 (Nihil)'
                  ) : (
                    formatRupiah(grandTotalSisa)
                  )}
                </td>
                <td className="py-3.5 px-3 text-center font-mono font-extrabold text-cyan-300">
                  {formatNumber(grandTotalPersen, 2)}%
                </td>
                <td className="py-3.5 px-3 text-center font-mono text-emerald-400">
                  {formatNumber(grandTotalPersen, 1)}% Terpenuhi
                </td>
                <td className="py-3.5 px-3 text-center" colSpan={2}>
                  {recapMode === 'ADDENDUM' ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 text-xs font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>100% Seimbang & Bebas Minus</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/40 text-xs font-bold">
                      <ArrowLeftRight className="w-3.5 h-3.5 text-blue-400" />
                      <span>Total 100% (Pergeseran Antar-Pos)</span>
                    </span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

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
