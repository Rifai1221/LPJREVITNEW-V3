import React, { useState, useMemo } from 'react';
import {
  Wallet,
  Printer,
  Calendar,
  Search,
  X,
  Plus,
  Edit3,
  Trash2,
  AlertCircle,
  Filter,
  CalendarRange,
  Clock,
  Layers,
  RotateCcw,
  Store,
  AlertTriangle,
  Eye,
  CheckCircle2,
  CreditCard,
} from 'lucide-react';
import { BktTransaction, BkuTransaction, BkbTransaction, SchoolMasterData, ProjectProgressWeek, TransactionFilterOptions, StoreVendor, KwitansiDocument } from '../types';
import { formatRupiah } from '../utils/formatters';
import { getAvailableMonthsForSchool, resolveWeekDates, parseTxDateToIso } from '../utils/monthHelper';
import { isRegisteredVendor, isSiplahVendor, findMasterStore, isInternalNonVendorTransaction } from '../utils/vendorValidation';
import { VendorQuickRegisterModal } from './VendorQuickRegisterModal';
import { BkuDocumentPreviewModal } from './BkuDocumentPreviewModal';
import { findMatchedKwitansiForTransaction, synthesizeKwitansiFromTransaction } from '../services/cashLedgerIntegrationService';

interface BktManagerProps {
  bktList: BktTransaction[];
  school: SchoolMasterData;
  progressWeeks?: ProjectProgressWeek[];
  stores?: StoreVendor[];
  kwitansiList?: KwitansiDocument[];
  bkuList?: BkuTransaction[];
  bkbList?: BkbTransaction[];
  onOpenPrintModal: (month?: string, filterOptions?: TransactionFilterOptions) => void;
  onAddTransaction?: (tx: Omit<BkuTransaction, 'id'>) => void;
  onUpdateTransaction?: (tx: BkuTransaction) => void;
  onDeleteTransaction?: (tx: BkuTransaction) => void;
  onUpdateStores?: (stores: StoreVendor[]) => void;
  onUpdateKwitansi?: (kw: KwitansiDocument, updatedTx?: Partial<BkuTransaction>) => void;
  onOpenPrintKwitansi?: (kwId: string, mode: 'KWITANSI' | 'FAKTUR' | 'SPB' | 'ALL') => void;
  onCleanDuplicates?: () => void;
  onClearAllBkt?: () => void;
  onBulkDeleteBkt?: (txs: BktTransaction[]) => void;
}

export const BktManager: React.FC<BktManagerProps> = ({
  bktList,
  school,
  progressWeeks = [],
  stores = [],
  kwitansiList = [],
  bkuList = [],
  bkbList = [],
  onOpenPrintModal,
  onAddTransaction,
  onUpdateTransaction,
  onDeleteTransaction,
  onUpdateStores,
  onUpdateKwitansi,
  onOpenPrintKwitansi,
  onCleanDuplicates,
  onClearAllBkt,
  onBulkDeleteBkt,
}) => {
  // Selection State for Bulk Delete
  const [selectedTxIds, setSelectedTxIds] = useState<Set<string>>(new Set());
  // Filter Mode: 'ALL' | 'MONTH' | 'WEEK' | 'CUSTOM'
  const [filterMode, setFilterMode] = useState<'ALL' | 'MONTH' | 'WEEK' | 'CUSTOM'>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');
  const [selectedWeekNum, setSelectedWeekNum] = useState<number>(1);
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  // Document Preview Modal State
  const [previewTx, setPreviewTx] = useState<BkuTransaction | null>(null);
  const [previewKw, setPreviewKw] = useState<KwitansiDocument | null>(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);

  const handleOpenPreview = (bkt: BktTransaction) => {
    const bkuEquiv: BkuTransaction = {
      id: bkt.id,
      tanggal: bkt.tanggal,
      tanggalObj: bkt.tanggalObj,
      bulan: bkt.bulan,
      jenis: bkt.pemasukan > 0 ? 'PENERIMAAN' : 'PENGELUARAN',
      uraian: bkt.uraian,
      noBukti: bkt.noBukti,
      penerimaan: bkt.pemasukan || 0,
      pengeluaran: bkt.pengeluaran || 0,
      saldo: bkt.saldo,
      kategoriBiaya: bkt.kategoriBiaya,
      kwitansiIdRef: bkt.kwitansiIdRef,
    };
    let matchedKw = findMatchedKwitansiForTransaction(bkuEquiv, kwitansiList || [], stores, school);
    if (!matchedKw) {
      matchedKw = synthesizeKwitansiFromTransaction(bkuEquiv, school, stores);
    }
    setPreviewTx(bkuEquiv);
    setPreviewKw(matchedKw);
    setPreviewModalOpen(true);
  };

  // Quick Register Modal State
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [unregisteredName, setUnregisteredName] = useState('');
  const [unregisteredTxId, setUnregisteredTxId] = useState<string | null>(null);

  // Modal states for manual input & editing
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<BktTransaction | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  const schoolYear = school?.tahunAnggaran?.trim() || '2026';

  // Determine starting date strictly from Laporan Mingguan & Bobot
  const minStartDateInfo = useMemo(() => {
    if (progressWeeks && progressWeeks.length > 0) {
      const w1 = progressWeeks.find((w) => w.mingguKe === 1) || progressWeeks[0];
      return resolveWeekDates(w1, schoolYear);
    }
    return {
      startDate: `${schoolYear}-07-01`,
      startDateFormatted: `01 Juli ${schoolYear}`,
      startDateSlash: `01/07/${schoolYear}`,
      endDate: `${schoolYear}-10-31`,
    };
  }, [progressWeeks, schoolYear]);

  // Available weeks list with formatted dates
  const weekOptions = useMemo(() => {
    return progressWeeks.map((w) => {
      const resolved = resolveWeekDates(w, schoolYear);
      return {
        mingguKe: w.mingguKe,
        startDate: resolved.startDate,
        endDate: resolved.endDate,
        periodeText: resolved.periodeText,
        bulan: resolved.bulan,
      };
    });
  }, [progressWeeks, schoolYear]);

  // Available months
  const months = useMemo(() => {
    return getAvailableMonthsForSchool(school, [bktList]);
  }, [school, bktList]);

  // Active Week Date Range
  const activeWeekInfo = useMemo(() => {
    return weekOptions.find((w) => w.mingguKe === selectedWeekNum) || weekOptions[0] || null;
  }, [weekOptions, selectedWeekNum]);

  // Form states
  const [formData, setFormData] = useState({
    tanggal: minStartDateInfo.startDate,
    jenis: 'PENGELUARAN' as 'PENERIMAAN' | 'PENGELUARAN',
    uraian: '',
    noBukti: '',
    nominal: 0,
    kategoriBiaya: 'Konstruksi',
  });

  // Filter Transactions Engine
  const filteredBkt = useMemo(() => {
    return bktList.filter((tx) => {
      const txIso = parseTxDateToIso(tx.tanggalObj || tx.tanggal, parseInt(schoolYear, 10));

      if (filterMode === 'MONTH') {
        if (selectedMonth !== 'ALL' && tx.bulan !== selectedMonth) {
          return false;
        }
      } else if (filterMode === 'WEEK') {
        if (activeWeekInfo) {
          if (txIso) {
            if (txIso < activeWeekInfo.startDate || txIso > activeWeekInfo.endDate) {
              return false;
            }
          } else if (tx.bulan && !tx.bulan.toLowerCase().includes(activeWeekInfo.bulan.toLowerCase())) {
            return false;
          }
        }
      } else if (filterMode === 'CUSTOM') {
        if (customStartDate && txIso && txIso < customStartDate) {
          return false;
        }
        if (customEndDate && txIso && txIso > customEndDate) {
          return false;
        }
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchUraian = tx.uraian.toLowerCase().includes(q);
        const matchBukti = tx.noBukti.toLowerCase().includes(q);
        const matchTanggal = tx.tanggal.includes(q);
        if (!matchUraian && !matchBukti && !matchTanggal) {
          return false;
        }
      }

      return true;
    });
  }, [bktList, filterMode, selectedMonth, selectedWeekNum, activeWeekInfo, customStartDate, customEndDate, searchQuery, schoolYear]);

  const totalDebet = useMemo(() => filteredBkt.reduce((sum, tx) => sum + tx.pemasukan, 0), [filteredBkt]);
  const totalKredit = useMemo(() => filteredBkt.reduce((sum, tx) => sum + tx.pengeluaran, 0), [filteredBkt]);
  const lastItem = filteredBkt[filteredBkt.length - 1];
  const saldoAkhir = useMemo(() => {
    if (!lastItem) return 0;
    const raw = lastItem.saldo !== undefined && lastItem.saldo !== null ? lastItem.saldo : totalDebet - totalKredit;
    if (Math.abs(raw) < 1) return 0;
    return Math.max(0, raw);
  }, [lastItem, totalDebet, totalKredit]);

  // Active filter readable description label
  const activeFilterLabel = useMemo(() => {
    if (filterMode === 'ALL') {
      return 'Semua Transaksi (Lengkap)';
    }
    if (filterMode === 'MONTH') {
      return selectedMonth === 'ALL' ? 'Semua Bulan' : `Bulan ${selectedMonth}`;
    }
    if (filterMode === 'WEEK') {
      return activeWeekInfo
        ? `Minggu Ke-${activeWeekInfo.mingguKe} (${activeWeekInfo.periodeText})`
        : `Minggu Ke-${selectedWeekNum}`;
    }
    if (filterMode === 'CUSTOM') {
      if (customStartDate && customEndDate) {
        return `Rentang ${customStartDate} s/d ${customEndDate}`;
      }
      if (customStartDate) {
        return `Mulai Tanggal ${customStartDate}`;
      }
      if (customEndDate) {
        return `Sampai Tanggal ${customEndDate}`;
      }
      return 'Rentang Tanggal Khusus';
    }
    return 'Semua';
  }, [filterMode, selectedMonth, selectedWeekNum, activeWeekInfo, customStartDate, customEndDate]);

  // Handlers
  const handleOpenAdd = () => {
    setEditingTx(null);
    setFormError(null);
    setSelectedStoreId('');
    setFormData({
      tanggal: minStartDateInfo.startDate,
      jenis: 'PENGELUARAN',
      uraian: '',
      noBukti: `BKT-${String(bktList.length + 1).padStart(2, '0')}/${schoolYear}`,
      nominal: 0,
      kategoriBiaya: 'Konstruksi',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (tx: BktTransaction) => {
    setEditingTx(tx);
    setFormError(null);

    let dateInput = minStartDateInfo.startDate;
    if (tx.tanggalObj && tx.tanggalObj.includes('-')) {
      dateInput = tx.tanggalObj;
    } else if (tx.tanggal.includes('/')) {
      const [d, m, y] = tx.tanggal.split('/');
      dateInput = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    // Try to auto-match store from transaction uraian or linked kwitansi
    let matchedStore = (stores || []).find(
      (s) => s.namaToko && tx.uraian.toLowerCase().includes(s.namaToko.toLowerCase())
    );
    if (!matchedStore && tx.kwitansiIdRef && kwitansiList) {
      const linkedKw = kwitansiList.find((k) => k.id === tx.kwitansiIdRef || k.noBukti === tx.noBukti);
      if (linkedKw) {
        matchedStore = (stores || []).find(
          (s) =>
            s.namaToko &&
            (s.namaToko.toLowerCase() === linkedKw.namaToko?.toLowerCase() ||
              s.pemilikNama?.toLowerCase() === linkedKw.penerimaNama?.toLowerCase())
        );
      }
    }
    setSelectedStoreId(matchedStore ? matchedStore.id : '');

    setFormData({
      tanggal: dateInput,
      jenis: tx.pemasukan > 0 ? 'PENERIMAAN' : 'PENGELUARAN',
      uraian: tx.uraian,
      noBukti: tx.noBukti === '-' ? '' : tx.noBukti,
      nominal: tx.pemasukan > 0 ? tx.pemasukan : tx.pengeluaran,
      kategoriBiaya: 'Konstruksi',
    });
    setIsModalOpen(true);
  };

  const handleSelectStore = (storeId: string) => {
    setSelectedStoreId(storeId);
    if (!storeId) return;
    const store = (stores || []).find((s) => s.id === storeId);
    if (!store) return;

    let newUraian = formData.uraian;
    const storeName = store.namaToko || store.pemilikNama;
    const isMaterialStore = store.kategori === 'MATERIAL' || !store.kategori;
    const isMaterialNoBukti = /kwt[\/\-_]?mat|kw[\/\-_]?mat|\bmat\b|mat[\/\-_]|material/i.test(formData.noBukti || '');
    let targetKat = formData.kategoriBiaya;

    if (isMaterialStore || isMaterialNoBukti) {
      if (targetKat === 'Perencanaan_Pengelolaan') {
        targetKat = 'Konstruksi';
      }
    }

    if (!newUraian || /bayar\s+bahan|pembelian|bayar\s+meubelair|bayar\s+peralatan|bayar\s+apd|bayar\s+honorarium|bayar/i.test(newUraian)) {
      if (targetKat === 'Perabot') {
        newUraian = `Bayar Meubelair Dari ${storeName}`;
      } else if (targetKat === 'Peralatan') {
        newUraian = `Bayar Peralatan Dari ${storeName}`;
      } else if (targetKat === 'SMKK') {
        newUraian = `Bayar APD / SMKK Dari ${storeName}`;
      } else if (targetKat === 'Perencanaan_Pengelolaan' && !isMaterialStore && !isMaterialNoBukti) {
        newUraian = `Bayar Honorarium / Jasa Dari ${store.pemilikNama || storeName}`;
      } else {
        newUraian = `Bayar Bahan Dari ${storeName}`;
      }
    } else {
      if (/dari/i.test(newUraian)) {
        newUraian = newUraian.replace(/dari\s+.*$/i, `Dari ${storeName}`);
      } else {
        newUraian = `${newUraian} (Penyedia: ${storeName})`;
      }
    }

    setFormData((prev) => ({ ...prev, uraian: newUraian, kategoriBiaya: targetKat }));
  };

  const handleSaveTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.uraian.trim()) {
      setFormError('Uraian transaksi tidak boleh kosong.');
      return;
    }

    if (!formData.nominal || formData.nominal <= 0) {
      setFormError('Nominal transaksi harus lebih dari Rp 0.');
      return;
    }

    if (formData.tanggal < minStartDateInfo.startDate) {
      setFormError(
        `Tanggal transaksi kas (${formData.tanggal}) tidak boleh kurang dari tanggal mulai Laporan Mingguan & Bobot (${minStartDateInfo.startDateFormatted}).`
      );
      return;
    }

    const [y, m, d] = formData.tanggal.split('-');
    const indMonths = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    const bulanStr = `${indMonths[parseInt(m, 10) - 1]} ${y}`;
    const displayTanggal = `${d}/${m}/${y}`;

    if (editingTx) {
      if (onUpdateTransaction) {
        onUpdateTransaction({
          id: editingTx.id,
          tanggal: displayTanggal,
          tanggalObj: formData.tanggal,
          bulan: bulanStr,
          jenis: formData.jenis,
          uraian: formData.uraian.trim(),
          noBukti: formData.noBukti.trim() || '-',
          penerimaan: formData.jenis === 'PENERIMAAN' ? formData.nominal : 0,
          pengeluaran: formData.jenis === 'PENGELUARAN' ? formData.nominal : 0,
          kategoriBiaya: formData.kategoriBiaya,
          kwitansiIdRef: editingTx.kwitansiIdRef,
          isManualDate: true,
          isLocked: true,
          isManual: true,
        });
      }
    } else {
      if (onAddTransaction) {
        onAddTransaction({
          tanggal: displayTanggal,
          tanggalObj: formData.tanggal,
          bulan: bulanStr,
          jenis: formData.jenis,
          uraian: formData.uraian.trim(),
          noBukti: formData.noBukti.trim() || '-',
          penerimaan: formData.jenis === 'PENERIMAAN' ? formData.nominal : 0,
          pengeluaran: formData.jenis === 'PENGELUARAN' ? formData.nominal : 0,
          kategoriBiaya: formData.kategoriBiaya,
        });
      }
    }

    setIsModalOpen(false);
  };

  const handleDelete = (tx: BktTransaction) => {
    const nominal = tx.pemasukan > 0 ? tx.pemasukan : tx.pengeluaran;
    if (
      confirm(
        `Apakah Anda yakin ingin MENGHAPUS transaksi ini dari Buku Kas Tunai?\n\nTanggal: ${tx.tanggal}\nUraian: "${tx.uraian}"\nNominal: ${formatRupiah(nominal)}`
      )
    ) {
      if (onDeleteTransaction) {
        onDeleteTransaction({
          id: tx.id,
          tanggal: tx.tanggal,
          tanggalObj: tx.tanggalObj || tx.tanggal,
          bulan: tx.bulan,
          jenis: tx.pemasukan > 0 ? 'PENERIMAAN' : 'PENGELUARAN',
          uraian: tx.uraian,
          noBukti: tx.noBukti,
          penerimaan: tx.pemasukan,
          pengeluaran: tx.pengeluaran,
          kwitansiIdRef: tx.kwitansiIdRef,
          metodeBayar: 'BANK',
        });
      }
    }
  };

  const handleToggleSelectAll = (filteredItems: BktTransaction[]) => {
    if (selectedTxIds.size >= filteredItems.length && filteredItems.length > 0) {
      setSelectedTxIds(new Set());
    } else {
      setSelectedTxIds(new Set(filteredItems.map((t) => t.id)));
    }
  };

  const handleToggleSelectTx = (id: string) => {
    const next = new Set(selectedTxIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedTxIds(next);
  };

  const handleBulkDeleteSelected = () => {
    if (selectedTxIds.size === 0) return;
    const selectedList = bktList.filter((t) => selectedTxIds.has(t.id));
    if (
      confirm(
        `Apakah Anda yakin ingin MENGHAPUS ${selectedTxIds.size} transaksi Kas Tunai terpilih secara massal?\n\nTindakan ini tidak dapat dibatalkan.`
      )
    ) {
      if (onBulkDeleteBkt) {
        onBulkDeleteBkt(selectedList);
      } else if (onDeleteTransaction) {
        selectedList.forEach((tx) =>
          onDeleteTransaction({
            id: tx.id,
            tanggal: tx.tanggal,
            tanggalObj: tx.tanggalObj || tx.tanggal,
            bulan: tx.bulan,
            jenis: tx.pemasukan > 0 ? 'PENERIMAAN' : 'PENGELUARAN',
            uraian: tx.uraian,
            noBukti: tx.noBukti,
            penerimaan: tx.pemasukan,
            pengeluaran: tx.pengeluaran,
          })
        );
      }
      setSelectedTxIds(new Set());
    }
  };

  const handleConfirmClearAll = () => {
    if (
      confirm(
        `⚠️ KONFIRMASI HAPUS SELURUH DATA BKT:\n\nApakah Anda yakin ingin MENGHAPUS SELURUH data Buku Kas Tunai (${bktList.length} transaksi)?\n\nSeluruh data transaksi kas tunai akan dikosongkan.`
      )
    ) {
      if (onClearAllBkt) {
        onClearAllBkt();
      } else if (onBulkDeleteBkt) {
        onBulkDeleteBkt(bktList);
      }
      setSelectedTxIds(new Set());
    }
  };

  const handleApplyQuickPreset = (preset: '7D' | '14D' | '30D' | 'ALL_PROJECT') => {
    setFilterMode('CUSTOM');
    const now = new Date();
    const endIso = now.toISOString().split('T')[0];

    if (preset === '7D') {
      const start = new Date(now.getTime() - 7 * 86400000);
      setCustomStartDate(start.toISOString().split('T')[0]);
      setCustomEndDate(endIso);
    } else if (preset === '14D') {
      const start = new Date(now.getTime() - 14 * 86400000);
      setCustomStartDate(start.toISOString().split('T')[0]);
      setCustomEndDate(endIso);
    } else if (preset === '30D') {
      const start = new Date(now.getTime() - 30 * 86400000);
      setCustomStartDate(start.toISOString().split('T')[0]);
      setCustomEndDate(endIso);
    } else if (preset === 'ALL_PROJECT') {
      if (weekOptions.length > 0) {
        setCustomStartDate(weekOptions[0].startDate);
        setCustomEndDate(weekOptions[weekOptions.length - 1].endDate);
      } else {
        setCustomStartDate(`${schoolYear}-07-01`);
        setCustomEndDate(`${schoolYear}-10-31`);
      }
    }
  };

  const handleResetFilter = () => {
    setFilterMode('ALL');
    setSelectedMonth('ALL');
    setSelectedWeekNum(1);
    setCustomStartDate('');
    setCustomEndDate('');
    setSearchQuery('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-emerald-600" />
            Buku Pembantu Kas Tunai (BKT)
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Mencatat transaksi fisik kas tunai yang ditarik dari rekening bank dan dibayarkan secara riil di lapangan.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {bktList.length > 0 && (
            <button
              type="button"
              onClick={handleConfirmClearAll}
              className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white px-3.5 py-2 rounded-lg text-xs font-bold shadow-xs transition cursor-pointer"
              title="Hapus seluruh data transaksi Buku Kas Tunai (BKT)"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Hapus Semua BKT</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onOpenPrintModal(selectedMonth === 'ALL' ? undefined : selectedMonth)}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
          >
            <Printer className="w-4 h-4 text-emerald-400" />
            <span>Cetak BKT ({activeFilterLabel})</span>
          </button>
        </div>
      </div>

      {/* BULK ACTION BAR */}
      {selectedTxIds.size > 0 && (
        <div className="bg-rose-900 text-white p-3.5 rounded-xl shadow-lg flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in duration-200 border border-rose-700">
          <div className="flex items-center gap-3">
            <span className="bg-white/20 text-white px-2.5 py-1 rounded-lg text-xs font-mono font-bold">
              {selectedTxIds.size} Transaksi Kas Tunai Dipilih
            </span>
            <span className="text-xs text-rose-100 font-medium hidden sm:inline">
              Pilih transaksi yang ingin dihapus secara massal dari Buku Kas Tunai
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleBulkDeleteSelected}
              className="flex items-center gap-1.5 bg-white text-rose-700 hover:bg-rose-50 px-4 py-1.5 rounded-lg text-xs font-black shadow-sm transition cursor-pointer"
            >
              <Trash2 className="w-4 h-4 text-rose-600" />
              <span>Hapus Terpilih ({selectedTxIds.size} Data)</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedTxIds(new Set())}
              className="text-xs font-bold text-rose-200 hover:text-white px-2.5 py-1 rounded cursor-pointer"
            >
              Batal Pilihan
            </button>
          </div>
        </div>
      )}

      {/* FILTER PANEL UTAMA (Mingguan, Bulanan, Rentang Tanggal) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-emerald-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
              PILIHAN FILTER KAS TUNAI :
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setFilterMode('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                filterMode === 'ALL' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Semua</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setFilterMode('MONTH');
                if (selectedMonth === 'ALL' && months.length > 1) {
                  setSelectedMonth(months[1]);
                }
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                filterMode === 'MONTH' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Bulanan</span>
            </button>

            <button
              type="button"
              onClick={() => setFilterMode('WEEK')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                filterMode === 'WEEK' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Mingguan</span>
            </button>

            <button
              type="button"
              onClick={() => setFilterMode('CUSTOM')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                filterMode === 'CUSTOM' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CalendarRange className="w-3.5 h-3.5" />
              <span>Rentang Tanggal</span>
            </button>
          </div>
        </div>

        {/* Dynamic Controls */}
        {filterMode === 'MONTH' && (
          <div className="flex flex-wrap items-center gap-2 pt-1 animate-fade-in">
            <span className="text-xs font-semibold text-slate-700 mr-1">Pilih Bulan:</span>
            {months.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setSelectedMonth(m)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  selectedMonth === m
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {m === 'ALL' ? 'Semua Bulan' : m}
              </button>
            ))}
          </div>
        )}

        {filterMode === 'WEEK' && (
          <div className="space-y-2 pt-1 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">
                Pilih Periode Minggu Kerja:
              </span>
              {activeWeekInfo && (
                <span className="text-xs font-bold text-emerald-700 font-mono bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  {activeWeekInfo.periodeText} ({activeWeekInfo.startDate} s.d. {activeWeekInfo.endDate})
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1 bg-slate-50 rounded-xl border border-slate-200">
              {weekOptions.map((w) => (
                <button
                  key={w.mingguKe}
                  type="button"
                  onClick={() => setSelectedWeekNum(w.mingguKe)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                    selectedWeekNum === w.mingguKe
                      ? 'bg-emerald-600 text-white font-bold shadow-2xs'
                      : 'bg-white hover:bg-slate-200 text-slate-700 border border-slate-200'
                  }`}
                >
                  <span>M{w.mingguKe}</span>
                  <span className={`text-[10px] ${selectedWeekNum === w.mingguKe ? 'text-emerald-100' : 'text-slate-500'}`}>
                    ({w.periodeText})
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {filterMode === 'CUSTOM' && (
          <div className="space-y-3 pt-1 animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 items-end">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Dari Tanggal:</label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Sampai Tanggal:</label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500 font-mono"
                />
              </div>

              <div className="sm:col-span-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold text-slate-500 w-full mb-0.5">Pilihan Cepat:</span>
                <button
                  type="button"
                  onClick={() => handleApplyQuickPreset('7D')}
                  className="px-2.5 py-1 text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-medium transition cursor-pointer"
                >
                  7 Hari
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyQuickPreset('14D')}
                  className="px-2.5 py-1 text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-medium transition cursor-pointer"
                >
                  14 Hari
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyQuickPreset('30D')}
                  className="px-2.5 py-1 text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md font-medium transition cursor-pointer"
                >
                  30 Hari
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyQuickPreset('ALL_PROJECT')}
                  className="px-2.5 py-1 text-[11px] bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-md font-medium border border-emerald-200 transition cursor-pointer"
                >
                  Sepanjang Proyek
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Search & Reset */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="relative flex-1 w-full max-w-md">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari transaksi kas tunai..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-slate-50 focus:bg-white"
            />
          </div>

          {(filterMode !== 'ALL' || searchQuery !== '') && (
            <button
              type="button"
              onClick={handleResetFilter}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Filter</span>
            </button>
          )}
        </div>

        {/* Badge */}
        <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
            <span className="font-semibold text-slate-700">Filter Aktif:</span>
            <strong className="text-emerald-900 font-bold bg-white px-2.5 py-0.5 rounded border border-emerald-200 shadow-2xs">
              {activeFilterLabel}
            </strong>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-slate-600">
            <span>Ditemukan: <strong className="text-slate-900 font-bold">{filteredBkt.length}</strong> transaksi</span>
            <span>•</span>
            <span className="text-emerald-800 font-bold">Saldo: {formatRupiah(saldoAkhir)}</span>
          </div>
        </div>
      </div>

      {/* Status Integrasi Penuh Kas Tunai - Bank - BKU */}
      <div className="bg-slate-900 text-white rounded-xl p-4 border border-slate-800 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg border border-emerald-500/30">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <span className="font-bold text-slate-200 block">
              Buku Kas Tunai (BKT) Terintegrasi Penuh dengan Bank (BKB) & BKU
            </span>
            <span className="text-[11px] text-slate-400">
              Penerimaan tunai bersumber dari penarikan rekening bank (BKB). Seluruh belanja tunai otomatis termutasi dan klop dengan Buku Kas Umum (BKU).
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded-lg border border-slate-700 text-emerald-400 font-mono font-bold text-[11px] shrink-0">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Status: Terhubung & Klop</span>
        </div>
      </div>

      {/* Summary KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Penarikan Tunai (Debet)</span>
          <p className="text-lg font-bold text-emerald-700 mt-1">{formatRupiah(totalDebet)}</p>
          <span className="text-[10px] text-slate-400 block mt-0.5">Uang tunai diambil dari bank</span>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Pembayaran Tunai (Kredit)</span>
          <p className="text-lg font-bold text-rose-700 mt-1">{formatRupiah(totalKredit)}</p>
          <span className="text-[10px] text-slate-400 block mt-0.5">Pengeluaran belanja BKT</span>
        </div>
        <div className={`p-4 rounded-xl border shadow-xs ${
          saldoAkhir === 0
            ? 'bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-300'
            : 'bg-gradient-to-br from-amber-50 to-emerald-50 border-amber-300'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-[11px] font-extrabold uppercase tracking-wider ${
              saldoAkhir === 0 ? 'text-emerald-950' : 'text-amber-900'
            }`}>
              Saldo Cash Riil (Sisa Tunai)
            </span>
            <span className="bg-emerald-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-2xs">Fisik di Tangan</span>
          </div>
          <p className={`text-lg font-black mt-1 ${
            saldoAkhir === 0 ? 'text-emerald-800' : 'text-amber-900'
          }`}>{formatRupiah(saldoAkhir)}</p>
          <span className="text-[10px] font-medium text-slate-600 block mt-0.5">Uang tunai bendahara siap pakai (diluar bank)</span>
        </div>
      </div>

      {/* BKT Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
              <span>BUKU PEMBANTU KAS TUNAI (BKT)</span>
              <span className="text-emerald-400 font-mono">• {activeFilterLabel}</span>
            </h3>
            <p className="text-[11px] text-slate-400">{school.namaSekolah} • {school.pekerjaan}</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenAdd}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-xs transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Input Kas Tunai Manual</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-800 uppercase text-[10px] tracking-wider border-b border-slate-200">
                <th className="py-2.5 px-2 text-center w-8">
                  <input
                    type="checkbox"
                    checked={filteredBkt.length > 0 && selectedTxIds.size >= filteredBkt.length}
                    onChange={() => handleToggleSelectAll(filteredBkt)}
                    className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    title="Pilih Semua Transaksi Tampil"
                  />
                </th>
                <th className="py-2.5 px-3 w-10 text-center">No</th>
                <th className="py-2.5 px-3">Tanggal</th>
                <th className="py-2.5 px-4">Uraian Transaksi Kas</th>
                <th className="py-2.5 px-3 text-center">No. Bukti</th>
                <th className="py-2.5 px-4 text-right text-emerald-900 bg-emerald-50/50">Debet / Masuk (Rp)</th>
                <th className="py-2.5 px-4 text-right text-rose-900 bg-rose-50/50">Kredit / Keluar (Rp)</th>
                <th className="py-2.5 px-4 text-right font-bold">Saldo (Rp)</th>
                <th className="py-2.5 px-3 text-center w-24">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredBkt.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center space-y-1">
                      <AlertCircle className="w-6 h-6 text-slate-300" />
                      <p className="font-semibold text-slate-600">Tidak ada transaksi kas tunai pada filter ini.</p>
                      <p className="text-[11px] text-slate-400">Coba ubah opsi filter di atas.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredBkt.map((tx, idx) => (
                  <tr key={tx.id} className={`hover:bg-slate-50 transition ${selectedTxIds.has(tx.id) ? 'bg-emerald-50/60' : ''}`}>
                    <td className="py-2.5 px-2 text-center">
                      <input
                        type="checkbox"
                        checked={selectedTxIds.has(tx.id)}
                        onChange={() => handleToggleSelectTx(tx.id)}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                    </td>
                    <td className="py-2.5 px-3 text-center text-slate-500 font-mono">{idx + 1}</td>
                    <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap font-mono">{tx.tanggal}</td>
                    <td className="py-2.5 px-4 font-medium text-slate-900">
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenPreview(tx)}
                          className="text-left font-semibold text-slate-900 hover:text-emerald-700 transition flex items-center justify-between gap-2 group/preview cursor-pointer"
                          title="Klik untuk Pratinjau Dokumen Kwitansi, Bon & SPB"
                        >
                          <span className="group-hover/preview:underline flex-1">{tx.uraian}</span>
                          <span className="opacity-0 group-hover/preview:opacity-100 transition px-1.5 py-0.5 rounded text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold flex items-center gap-1 shrink-0">
                            <Eye className="w-3 h-3 text-emerald-600" />
                            <span>Preview</span>
                          </span>
                        </button>
                        {tx.pengeluaran > 0 && !isInternalNonVendorTransaction(tx.uraian) && (() => {
                          const matchedStore = findMasterStore(tx.uraian, stores);
                          if (matchedStore) {
                            const isSiplah = matchedStore.kategori === 'SIPLAH' || matchedStore.isSiplah;
                            return (
                              <div className="flex items-center gap-1 text-[10px]">
                                <span className={`px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                                  isSiplah ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                }`}>
                                  <Store className="w-3 h-3" />
                                  <span>{isSiplah ? `🛒 SipLah: ${matchedStore.namaToko}` : `🏢 Master: ${matchedStore.namaToko}`}</span>
                                </span>
                              </div>
                            );
                          }
                          return (
                            <div className="flex items-center gap-1.5 text-[10px]">
                              <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-900 border border-rose-300 font-bold flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 text-rose-600" />
                                <span>⚠️ Belum Terdaftar di Master</span>
                              </span>
                              {onUpdateStores && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setUnregisteredName(tx.uraian);
                                    setUnregisteredTxId(tx.id);
                                    setRegisterModalOpen(true);
                                  }}
                                  className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-md shadow-2xs cursor-pointer flex items-center gap-1"
                                >
                                  <span>+ Daftarkan / Pilih Toko</span>
                                </button>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </td>
                    <td
                      onClick={() => handleOpenPreview(tx)}
                      className="py-2.5 px-3 text-center font-mono text-[11px] text-slate-700 bg-slate-50/80 rounded hover:bg-emerald-100 hover:text-emerald-800 transition cursor-pointer font-bold"
                      title="Klik untuk Pratinjau Dokumen Kwitansi, Bon & SPB"
                    >
                      {tx.noBukti || '-'}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-emerald-700 bg-emerald-50/30">
                      {tx.pemasukan > 0 ? formatRupiah(tx.pemasukan, false) : '-'}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-rose-700 bg-rose-50/30">
                      {tx.pengeluaran > 0 ? formatRupiah(tx.pengeluaran, false) : '-'}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">
                      {formatRupiah(tx.saldo || 0, false)}
                    </td>
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleOpenPreview(tx)}
                          className="p-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 hover:text-emerald-900 border border-emerald-200 transition cursor-pointer"
                          title="Pratinjau Dokumen (Kwitansi, Bon, SPB)"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(tx)}
                          className="p-1 rounded bg-amber-50 hover:bg-amber-100 text-amber-700 hover:text-amber-900 border border-amber-200 transition cursor-pointer"
                          title="Edit Transaksi BKT"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(tx)}
                          className="p-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-600 hover:text-rose-800 border border-rose-200 transition cursor-pointer"
                          title="Hapus Transaksi BKT"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                <td colSpan={4} className="py-3 px-4 text-right uppercase text-xs">
                  Total Filter ({activeFilterLabel}):
                </td>
                <td className="py-3 px-4 text-right font-mono text-emerald-900 bg-emerald-100/50">
                  {formatRupiah(totalDebet, false)}
                </td>
                <td className="py-3 px-4 text-right font-mono text-rose-900 bg-rose-100/50">
                  {formatRupiah(totalKredit, false)}
                </td>
                <td className="py-3 px-4 text-right font-mono font-extrabold text-blue-900">
                  {formatRupiah(saldoAkhir, false)}
                </td>
                <td className="py-3 px-3"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Modal for Input Manual & Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-emerald-400" />
                  <span>{editingTx ? 'Edit Transaksi Kas Tunai' : 'Input Transaksi Kas Tunai'}</span>
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTransaction} className="p-6 space-y-4 text-xs">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex items-center gap-2 font-medium">
                  <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tanggal Transaksi</label>
                  <input
                    type="date"
                    min={minStartDateInfo.startDate}
                    value={formData.tanggal}
                    onChange={(e) => setFormData({ ...formData, tanggal: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-slate-50 focus:bg-white font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Jenis Kas Tunai</label>
                  <select
                    value={formData.jenis}
                    onChange={(e) => setFormData({ ...formData, jenis: e.target.value as 'PENERIMAAN' | 'PENGELUARAN' })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-slate-50 focus:bg-white font-semibold"
                  >
                    <option value="PENGELUARAN">PENGELUARAN (Kredit)</option>
                    <option value="PENERIMAAN">PENERIMAAN / PENARIKAN (Debet)</option>
                  </select>
                </div>
              </div>

              {/* Dropdown Toko Rekanan / Penyedia */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1 flex items-center justify-between">
                  <span>Pilih Toko Rekanan / Penyedia (Opsional)</span>
                  <span className="text-[10px] text-emerald-600 font-medium">Otomatiskan Uraian & Rekanan</span>
                </label>
                <select
                  value={selectedStoreId}
                  onChange={(e) => handleSelectStore(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-slate-50 focus:bg-white text-xs font-medium"
                >
                  <option value="">-- Tanpa Penyedia Khusus / Manual --</option>
                  {(stores || []).map((s) => (
                    <option key={s.id} value={s.id}>
                      🏬 {s.namaToko} ({s.pemilikNama || 'Pemilik'} - {s.pekerjaan || s.kategori})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Uraian Transaksi</label>
                <textarea
                  rows={2}
                  value={formData.uraian}
                  onChange={(e) => setFormData({ ...formData, uraian: e.target.value })}
                  placeholder="Contoh: Pembayaran upah tukang minggu ke-2"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-slate-50 focus:bg-white"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nomor Bukti</label>
                  <input
                    type="text"
                    value={formData.noBukti}
                    onChange={(e) => {
                      const val = e.target.value;
                      const isMat = /kwt[\/\-_]?mat|kw[\/\-_]?mat|\bmat\b|mat[\/\-_]|material/i.test(val);
                      let nextUraian = formData.uraian;
                      let nextKat = formData.kategoriBiaya;
                      if (isMat) {
                        if (nextKat === 'Perencanaan_Pengelolaan') nextKat = 'Konstruksi';
                        if (/honorarium|pengawas|perencana/i.test(nextUraian)) {
                          const store = selectedStoreId ? stores.find((s) => s.id === selectedStoreId)?.namaToko : '';
                          nextUraian = store ? `Bayar Bahan Dari ${store}` : 'Bayar Bahan Bangunan Material';
                        }
                      }
                      setFormData({ ...formData, noBukti: val, kategoriBiaya: nextKat, uraian: nextUraian });
                    }}
                    placeholder="Contoh: BKT-01"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-slate-50 focus:bg-white font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nominal (Rp)</label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={formData.nominal || ''}
                    onChange={(e) => setFormData({ ...formData, nominal: Number(e.target.value) || 0 })}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 bg-slate-50 focus:bg-white font-mono font-bold"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-xs transition cursor-pointer"
                >
                  {editingTx ? 'Simpan Perubahan' : 'Simpan ke BKT'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Register / Select Existing Store Modal */}
      {onUpdateStores && (
        <VendorQuickRegisterModal
          isOpen={registerModalOpen}
          unregisteredName={unregisteredName}
          availableStores={stores}
          onClose={() => setRegisterModalOpen(false)}
          onSaveStore={(newStore) => {
            onUpdateStores([...stores, newStore]);
          }}
          onSelectExistingStore={(selectedStore) => {
            if (unregisteredTxId && onUpdateTransaction) {
              const target = bktList.find((t) => t.id === unregisteredTxId);
              if (target) {
                let updatedUraian = target.uraian;
                if (updatedUraian.includes('(') && updatedUraian.includes(')')) {
                  updatedUraian = updatedUraian.replace(/\(([^)]+)\)/, `(${selectedStore.namaToko})`);
                } else {
                  updatedUraian = `${target.uraian} (${selectedStore.namaToko})`;
                }
                onUpdateTransaction({
                  id: target.id,
                  tanggal: target.tanggal,
                  tanggalObj: target.tanggalObj,
                  bulan: target.bulan,
                  jenis: target.pemasukan > 0 ? 'PENERIMAAN' : 'PENGELUARAN',
                  uraian: updatedUraian,
                  noBukti: target.noBukti,
                  penerimaan: target.pemasukan || 0,
                  pengeluaran: target.pengeluaran || 0,
                  saldo: target.saldo,
                });
              }
            }
          }}
        />
      )}

      {/* Live Kwitansi, Bon & SPB Preview and Quick Edit Modal */}
      <BkuDocumentPreviewModal
        isOpen={previewModalOpen}
        onClose={() => setPreviewModalOpen(false)}
        transaction={previewTx}
        kwitansi={previewKw}
        school={school}
        stores={stores}
        onSaveKwitansi={(updatedKw, updatedTx) => {
          if (onUpdateKwitansi) {
            onUpdateKwitansi(updatedKw, updatedTx);
          }
          if (previewTx && onUpdateTransaction && updatedTx) {
            onUpdateTransaction({
              ...previewTx,
              ...updatedTx,
            });
          }
          // Update local preview state
          setPreviewKw(updatedKw);
          if (previewTx && updatedTx) {
            setPreviewTx({
              ...previewTx,
              ...updatedTx,
            });
          }
        }}
        onPrintDocument={(docType, kwId) => {
          if (onOpenPrintKwitansi && kwId) {
            onOpenPrintKwitansi(kwId, docType);
          } else {
            onOpenPrintModal(undefined);
          }
        }}
      />
    </div>
  );
};
