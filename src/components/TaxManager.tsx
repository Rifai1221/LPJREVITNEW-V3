import React, { useState } from 'react';
import {
  FileCheck2,
  Printer,
  Search,
  X,
  Store,
  AlertTriangle,
  Plus,
  Edit2,
  Trash2,
  Calculator,
  Save,
  CheckCircle2,
  Building,
  Calendar,
  FileText,
  BadgeCheck,
} from 'lucide-react';
import { TaxRecord, SchoolMasterData, StoreVendor } from '../types';
import { formatRupiah } from '../utils/formatters';
import { getAvailableMonthsForSchool, getMonthFromPeriodString } from '../utils/monthHelper';
import { isRegisteredVendor, isSiplahVendor, findMasterStore, isInternalNonVendorTransaction } from '../utils/vendorValidation';
import { VendorQuickRegisterModal } from './VendorQuickRegisterModal';

interface TaxManagerProps {
  taxRecords: TaxRecord[];
  school: SchoolMasterData;
  stores?: StoreVendor[];
  onOpenPrintModal: (month?: string) => void;
  onUpdateStores?: (stores: StoreVendor[]) => void;
  onAddManualTax?: (tax: Omit<TaxRecord, 'id' | 'noUrut'>) => void;
  onUpdateTax?: (tax: TaxRecord) => void;
  onDeleteTax?: (id: string) => void;
  onClearAllTaxes?: () => void;
  onBulkDeleteTaxes?: (taxes: TaxRecord[]) => void;
}

export const TaxManager: React.FC<TaxManagerProps> = ({
  taxRecords,
  school,
  stores = [],
  onOpenPrintModal,
  onUpdateStores,
  onAddManualTax,
  onUpdateTax,
  onDeleteTax,
  onClearAllTaxes,
  onBulkDeleteTaxes,
}) => {
  const [selectedTaxIds, setSelectedTaxIds] = useState<Set<string>>(new Set());
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'TAX_ONLY' | 'LUNAS'>('ALL');

  // Quick Register Modal State
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [unregisteredName, setUnregisteredName] = useState('');

  // Tax Form Modal State (Input Manual / Edit)
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingTaxId, setEditingTaxId] = useState<string | null>(null);
  const [formData, setFormData] = useState<{
    noBukti: string;
    tanggal: string;
    bulan: string;
    keperluan: string;
    kategori: 'Konstruksi' | 'Perabot' | 'Peralatan' | 'Perencanaan_Pengelolaan';
    nominalBelanja: number;
    ppn11: number;
    pph22: number;
    pph23: number;
    ntpn: string;
    tanggalSetor: string;
    statusSetor: 'LUNAS' | 'BELUM_SETOR';
    kwitansiIdRef?: string;
  }>({
    noBukti: '',
    tanggal: '06/07/2026',
    bulan: 'Juli 2026',
    keperluan: '',
    kategori: 'Konstruksi',
    nominalBelanja: 0,
    ppn11: 0,
    pph22: 0,
    pph23: 0,
    ntpn: '',
    tanggalSetor: '',
    statusSetor: 'LUNAS',
  });

  // Delete Confirm Modal State
  const [deleteTargetTax, setDeleteTargetTax] = useState<TaxRecord | null>(null);

  const months = getAvailableMonthsForSchool(school, [taxRecords]);
  const activeSelectedMonth = (selectedMonth === 'ALL' || months.includes(selectedMonth)) ? selectedMonth : 'ALL';

  const filtered = taxRecords.filter((t) => {
    const matchMonth = activeSelectedMonth === 'ALL' || t.bulan === activeSelectedMonth;
    const matchSearch =
      t.keperluan.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.noBukti.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.ntpn && t.ntpn.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchStatus =
      filterStatus === 'ALL'
        ? true
        : filterStatus === 'TAX_ONLY'
        ? t.totalPajak > 0
        : t.statusSetor === 'LUNAS' || t.totalPajak > 0;
    return matchMonth && matchSearch && matchStatus;
  });

  const totalKonstruksi = filtered.reduce((s, t) => s + (t.nominalKonstruksi || 0), 0);
  const totalPerabot = filtered.reduce((s, t) => s + (t.nominalPerabot || 0), 0);
  const totalPeralatan = filtered.reduce((s, t) => s + (t.nominalPeralatan || 0), 0);
  const totalKonsultan = filtered.reduce((s, t) => s + (t.nominalKonsultanAdm || 0), 0);
  const totalPPN = filtered.reduce((s, t) => s + (t.ppn11 || 0), 0);
  const totalPPh22 = filtered.reduce((s, t) => s + (t.pph22 || 0), 0);
  const totalPPh23 = filtered.reduce((s, t) => s + (t.pph23 || 0), 0);
  const totalPajakKeseluruhan = totalPPN + totalPPh22 + totalPPh23;

  // Open Add Modal
  const handleOpenAdd = () => {
    const defaultDate = `06/07/${school?.tahunAnggaran || '2026'}`;
    setEditingTaxId(null);
    setFormData({
      noBukti: `PAJAK-SETOR-${Date.now().toString().slice(-4)}`,
      tanggal: defaultDate,
      bulan: getMonthFromPeriodString(defaultDate),
      keperluan: 'Penyetoran Pajak Belanja Material / Jasa',
      kategori: 'Konstruksi',
      nominalBelanja: 0,
      ppn11: 0,
      pph22: 0,
      pph23: 0,
      ntpn: '',
      tanggalSetor: defaultDate,
      statusSetor: 'LUNAS',
    });
    setIsFormModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (rec: TaxRecord) => {
    setEditingTaxId(rec.id);
    const nominal =
      rec.nominalKonstruksi ||
      rec.nominalPerabot ||
      rec.nominalPeralatan ||
      rec.nominalKonsultanAdm ||
      (rec.ppn11 ? Math.round(rec.ppn11 / 0.11) : 0);

    let detectedCat: 'Konstruksi' | 'Perabot' | 'Peralatan' | 'Perencanaan_Pengelolaan' = 'Konstruksi';
    if (rec.nominalPerabot > 0) detectedCat = 'Perabot';
    else if (rec.nominalPeralatan > 0) detectedCat = 'Peralatan';
    else if (rec.nominalKonsultanAdm > 0) detectedCat = 'Perencanaan_Pengelolaan';

    setFormData({
      noBukti: rec.noBukti || '',
      tanggal: rec.tanggal || '06/07/2026',
      bulan: rec.bulan || getMonthFromPeriodString(rec.tanggal),
      keperluan: rec.keperluan || '',
      kategori: rec.kategori || detectedCat,
      nominalBelanja: nominal,
      ppn11: rec.ppn11 || 0,
      pph22: rec.pph22 || 0,
      pph23: rec.pph23 || 0,
      ntpn: rec.ntpn || '',
      tanggalSetor: rec.tanggalSetor || rec.tanggal || '',
      statusSetor: rec.statusSetor || (rec.totalPajak > 0 ? 'LUNAS' : 'BELUM_SETOR'),
      kwitansiIdRef: rec.kwitansiIdRef,
    });
    setIsFormModalOpen(true);
  };

  // Submit Add / Edit
  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    const totPajak = (Number(formData.ppn11) || 0) + (Number(formData.pph22) || 0) + (Number(formData.pph23) || 0);

    const nominalKonstruksi = formData.kategori === 'Konstruksi' ? Number(formData.nominalBelanja) || 0 : 0;
    const nominalPerabot = formData.kategori === 'Perabot' ? Number(formData.nominalBelanja) || 0 : 0;
    const nominalPeralatan = formData.kategori === 'Peralatan' ? Number(formData.nominalBelanja) || 0 : 0;
    const nominalKonsultanAdm = formData.kategori === 'Perencanaan_Pengelolaan' ? Number(formData.nominalBelanja) || 0 : 0;

    if (editingTaxId) {
      if (onUpdateTax) {
        onUpdateTax({
          id: editingTaxId,
          noUrut: 0,
          noBukti: formData.noBukti.trim(),
          tanggal: formData.tanggal.trim(),
          bulan: formData.bulan || getMonthFromPeriodString(formData.tanggal),
          keperluan: formData.keperluan.trim(),
          nominalKonstruksi,
          nominalPerabot,
          nominalPeralatan,
          nominalKonsultanAdm,
          ppn11: Number(formData.ppn11) || 0,
          pph22: Number(formData.pph22) || 0,
          pph23: Number(formData.pph23) || 0,
          totalPajak: totPajak,
          isManual: true,
          kategori: formData.kategori,
          ntpn: formData.ntpn.trim(),
          tanggalSetor: formData.tanggalSetor.trim() || formData.tanggal.trim(),
          statusSetor: formData.statusSetor,
          kwitansiIdRef: formData.kwitansiIdRef,
        });
      }
    } else {
      if (onAddManualTax) {
        onAddManualTax({
          noBukti: formData.noBukti.trim(),
          tanggal: formData.tanggal.trim(),
          bulan: formData.bulan || getMonthFromPeriodString(formData.tanggal),
          keperluan: formData.keperluan.trim(),
          nominalKonstruksi,
          nominalPerabot,
          nominalPeralatan,
          nominalKonsultanAdm,
          ppn11: Number(formData.ppn11) || 0,
          pph22: Number(formData.pph22) || 0,
          pph23: Number(formData.pph23) || 0,
          totalPajak: totPajak,
          isManual: true,
          kategori: formData.kategori,
          ntpn: formData.ntpn.trim(),
          tanggalSetor: formData.tanggalSetor.trim() || formData.tanggal.trim(),
          statusSetor: formData.statusSetor,
        });
      }
    }

    setIsFormModalOpen(false);
  };

  // Auto calculate helpers
  const handleCalcPpn = () => {
    const nom = Number(formData.nominalBelanja) || 0;
    if (nom > 0) {
      // DPP = nom / 1.11, PPN 11% = DPP * 0.11
      const calculated = Math.round((nom / 1.11) * 0.11);
      setFormData((prev) => ({ ...prev, ppn11: calculated }));
    }
  };

  const handleCalcPph22 = () => {
    const nom = Number(formData.nominalBelanja) || 0;
    if (nom > 0) {
      // PPh 22 = (nom / 1.11) * 1.5%
      const calculated = Math.round((nom / 1.11) * 0.015);
      setFormData((prev) => ({ ...prev, pph22: calculated }));
    }
  };

  const handleCalcPph23 = () => {
    const nom = Number(formData.nominalBelanja) || 0;
    if (nom > 0) {
      // Jasa PPh 23 = 2% dari nilai bruto jasa
      const calculated = Math.round(nom * 0.02);
      setFormData((prev) => ({ ...prev, pph23: calculated }));
    }
  };

  const handleToggleSelectAll = (filteredItems: TaxRecord[]) => {
    if (selectedTaxIds.size >= filteredItems.length && filteredItems.length > 0) {
      setSelectedTaxIds(new Set());
    } else {
      setSelectedTaxIds(new Set(filteredItems.map((t) => t.id)));
    }
  };

  const handleToggleSelectTx = (id: string) => {
    const next = new Set(selectedTaxIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedTaxIds(next);
  };

  const handleBulkDeleteSelected = () => {
    if (selectedTaxIds.size === 0) return;
    const selectedList = taxRecords.filter((t) => selectedTaxIds.has(t.id));
    if (
      confirm(
        `Apakah Anda yakin ingin MENGHAPUS ${selectedTaxIds.size} data pajak terpilih secara massal?\n\nTindakan ini tidak dapat dibatalkan.`
      )
    ) {
      if (onBulkDeleteTaxes) {
        onBulkDeleteTaxes(selectedList);
      } else if (onDeleteTax) {
        selectedList.forEach((t) => onDeleteTax(t.id));
      }
      setSelectedTaxIds(new Set());
    }
  };

  const handleConfirmClearAll = () => {
    if (
      confirm(
        `⚠️ KONFIRMASI HAPUS SELURUH DATA PAJAK:\n\nApakah Anda yakin ingin MENGHAPUS SELURUH data pemotongan dan penyetoran pajak (${taxRecords.length} data)?\n\nSeluruh rincian data pajak akan dikosongkan.`
      )
    ) {
      if (onClearAllTaxes) {
        onClearAllTaxes();
      } else if (onBulkDeleteTaxes) {
        onBulkDeleteTaxes(taxRecords);
      }
      setSelectedTaxIds(new Set());
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 uppercase">
              Buku Pembantu Pajak (SSP / NTPN)
            </span>
            <span className="text-xs text-slate-500">Rekapitulasi Pemotongan & Penyetoran Pajak</span>
          </div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <FileCheck2 className="w-5 h-5 text-amber-600" />
            <span>Laporan Perpajakan Revitalisasi (PPN 11%, PPh 22, PPh 23)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Laporan pemotongan pajak atas belanja bahan material, perabot, peralatan, dan jasa konsultan. Anda dapat menginput transaksi setoran pajak manual, mengedit nominal, maupun menghapus data pajak sesuai bukti NTPN riil.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onAddManualTax && (
            <button
              type="button"
              onClick={handleOpenAdd}
              className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-3.5 py-2 rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Input Pajak Manual</span>
            </button>
          )}

          {taxRecords.length > 0 && (
            <button
              type="button"
              onClick={handleConfirmClearAll}
              className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow-xs transition cursor-pointer"
              title="Hapus seluruh data pemotongan dan penyetoran pajak"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Hapus Semua Pajak</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onOpenPrintModal(selectedMonth === 'ALL' ? undefined : selectedMonth)}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white px-3.5 py-2 rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer"
          >
            <Printer className="w-4 h-4 text-emerald-400" />
            <span>Cetak Rekap Pajak {selectedMonth !== 'ALL' ? selectedMonth : 'Total'}</span>
          </button>
        </div>
      </div>

      {/* BULK ACTION BAR */}
      {selectedTaxIds.size > 0 && (
        <div className="bg-rose-900 text-white p-3.5 rounded-2xl shadow-lg flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in duration-200 border border-rose-700">
          <div className="flex items-center gap-3">
            <span className="bg-white/20 text-white px-2.5 py-1 rounded-lg text-xs font-mono font-bold">
              {selectedTaxIds.size} Data Pajak Dipilih
            </span>
            <span className="text-xs text-rose-100 font-medium hidden sm:inline">
              Pilih data perpajakan yang ingin dihapus secara massal
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleBulkDeleteSelected}
              className="flex items-center gap-1.5 bg-white text-rose-700 hover:bg-rose-50 px-4 py-1.5 rounded-lg text-xs font-black shadow-sm transition cursor-pointer"
            >
              <Trash2 className="w-4 h-4 text-rose-600" />
              <span>Hapus Terpilih ({selectedTaxIds.size} Data)</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedTaxIds(new Set())}
              className="text-xs font-bold text-rose-200 hover:text-white px-2.5 py-1 rounded cursor-pointer"
            >
              Batal Pilihan
            </button>
          </div>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari transaksi pajak, nomor bukti, NTPN..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500"
            />
          </div>
          {searchQuery !== '' && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition cursor-pointer shadow-2xs"
            >
              <X className="w-3.5 h-3.5 text-rose-600" />
              <span>Reset</span>
            </button>
          )}
        </div>

        {/* Month & Status Filter */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-slate-600 font-medium">Bulan:</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent font-bold text-slate-800 focus:outline-hidden cursor-pointer"
            >
              <option value="ALL">Semua Bulan</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg">
            <button
              type="button"
              onClick={() => setFilterStatus('ALL')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                filterStatus === 'ALL' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Semua ({taxRecords.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('TAX_ONLY')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                filterStatus === 'TAX_ONLY' ? 'bg-white text-amber-800 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Ada Pajak ({taxRecords.filter((t) => t.totalPajak > 0).length})
            </button>
          </div>
        </div>
      </div>

      {/* KPI Tax Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">PPN 11% (Barang)</span>
            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-900 rounded text-[10px] font-bold">Material/Alat</span>
          </div>
          <p className="text-lg font-bold text-amber-700 mt-1">{formatRupiah(totalPPN)}</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">PPh Ps 22 (1.5%)</span>
            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-900 rounded text-[10px] font-bold">Pengadaan Barang</span>
          </div>
          <p className="text-lg font-bold text-blue-700 mt-1">{formatRupiah(totalPPh22)}</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">PPh 23 (2% / Jasa)</span>
            <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-900 rounded text-[10px] font-bold">Konsultan/Adm</span>
          </div>
          <p className="text-lg font-bold text-indigo-700 mt-1">{formatRupiah(totalPPh23)}</p>
        </div>

        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 p-4 rounded-2xl border border-emerald-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">Total Pajak Disetor</span>
            <BadgeCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-lg font-bold text-emerald-800 mt-1">{formatRupiah(totalPajakKeseluruhan)}</p>
        </div>
      </div>

      {/* Tax Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-800 text-white uppercase text-[10px] tracking-wider border-b border-slate-700 text-center">
                <th rowSpan={2} className="py-2.5 px-2 w-8">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selectedTaxIds.size >= filtered.length}
                    onChange={() => handleToggleSelectAll(filtered)}
                    className="rounded border-slate-600 text-amber-500 focus:ring-amber-400 cursor-pointer"
                    title="Pilih Semua Data Pajak Tampil"
                  />
                </th>
                <th rowSpan={2} className="py-2.5 px-2 w-8">No</th>
                <th colSpan={2} className="py-2 px-3 border-b border-slate-700">Kwitansi / Bukti</th>
                <th rowSpan={2} className="py-2.5 px-4 text-left min-w-[200px]">Keperluan Pembayaran</th>
                <th colSpan={4} className="py-2 px-3 border-b border-slate-700 bg-slate-850">Nilai Nominal Belanja (Rp)</th>
                <th colSpan={3} className="py-2 px-3 border-b border-slate-700 bg-amber-950/60">Pajak Dipungut & Disetor (Rp)</th>
                <th rowSpan={2} className="py-2.5 px-3 text-center w-28 bg-slate-850">Status / Aksi</th>
              </tr>
              <tr className="bg-slate-750 text-slate-200 text-[10px] uppercase tracking-wider border-b border-slate-700">
                <th className="py-2 px-2">No Bukti</th>
                <th className="py-2 px-2">Tanggal</th>
                <th className="py-2 px-3 text-right">Konstruksi</th>
                <th className="py-2 px-3 text-right">Perabot</th>
                <th className="py-2 px-3 text-right">Peralatan</th>
                <th className="py-2 px-3 text-right">Perencanaan/ADM</th>
                <th className="py-2 px-3 text-right text-amber-300">PPN 11%</th>
                <th className="py-2 px-3 text-right text-blue-300">PPh 22</th>
                <th className="py-2 px-3 text-right text-indigo-300">PPh 23</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-8 text-center text-slate-400">
                    Tidak ada transaksi pajak yang sesuai dengan filter pencarian.
                  </td>
                </tr>
              ) : (
                filtered.map((t, idx) => {
                  const hasTax = (t.totalPajak || 0) > 0;
                  return (
                    <tr key={t.id} className={`hover:bg-slate-50 transition text-slate-800 ${selectedTaxIds.has(t.id) ? 'bg-amber-50/60' : ''}`}>
                      <td className="py-2.5 px-2 text-center">
                        <input
                          type="checkbox"
                          checked={selectedTaxIds.has(t.id)}
                          onChange={() => handleToggleSelectTx(t.id)}
                          className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                        />
                      </td>
                      <td className="py-2.5 px-2 text-center text-slate-500 font-mono">{idx + 1}</td>
                      <td className="py-2.5 px-2 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <span>{t.noBukti}</span>
                          {t.isManual && (
                            <span className="px-1 py-0.2 rounded bg-amber-100 text-amber-800 text-[9px] font-bold">
                              Manual
                            </span>
                          )}
                        </div>
                        {t.ntpn && (
                          <div className="text-[9px] font-mono text-emerald-700">
                            NTPN: {t.ntpn}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-2 font-mono text-slate-600 whitespace-nowrap">{t.tanggal}</td>
                      <td className="py-2.5 px-4 font-medium text-slate-900">
                        <div className="flex flex-col gap-1">
                          <span>{t.keperluan}</span>
                          {!isInternalNonVendorTransaction(t.keperluan) && (() => {
                            const matchedStore = findMasterStore(t.keperluan, stores);
                            if (matchedStore) {
                              const isSiplah = matchedStore.kategori === 'SIPLAH' || matchedStore.isSiplah;
                              return (
                                <span
                                  className={`text-[10px] w-fit px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                                    isSiplah
                                      ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                      : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  }`}
                                >
                                  <Store className="w-3 h-3" />
                                  <span>{isSiplah ? `🛒 SipLah: ${matchedStore.namaToko}` : `🏢 Master Toko: ${matchedStore.namaToko}`}</span>
                                </span>
                              );
                            }
                            return (
                              <div className="flex items-center gap-1.5 text-[10px]">
                                <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-900 border border-rose-300 font-bold flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3 text-rose-600" />
                                  <span>⚠️ Toko Belum Terdaftar</span>
                                </span>
                                {onUpdateStores && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setUnregisteredName(t.keperluan);
                                      setRegisterModalOpen(true);
                                    }}
                                    className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-md shadow-2xs cursor-pointer"
                                  >
                                    + Daftarkan
                                  </button>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </td>

                      {/* Nominal breakdown */}
                      <td className="py-2.5 px-3 text-right font-mono">
                        {t.nominalKonstruksi > 0 ? formatRupiah(t.nominalKonstruksi, false) : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        {t.nominalPerabot > 0 ? formatRupiah(t.nominalPerabot, false) : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        {t.nominalPeralatan > 0 ? formatRupiah(t.nominalPeralatan, false) : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        {t.nominalKonsultanAdm > 0 ? formatRupiah(t.nominalKonsultanAdm, false) : '-'}
                      </td>

                      {/* Taxes */}
                      <td className={`py-2.5 px-3 text-right font-mono ${t.ppn11 > 0 ? 'text-amber-800 font-bold bg-amber-50/40' : 'text-slate-400'}`}>
                        {t.ppn11 > 0 ? formatRupiah(t.ppn11, false) : '-'}
                      </td>
                      <td className={`py-2.5 px-3 text-right font-mono ${t.pph22 > 0 ? 'text-blue-800 font-bold bg-blue-50/40' : 'text-slate-400'}`}>
                        {t.pph22 > 0 ? formatRupiah(t.pph22, false) : '-'}
                      </td>
                      <td className={`py-2.5 px-3 text-right font-mono ${t.pph23 > 0 ? 'text-indigo-800 font-bold bg-indigo-50/40' : 'text-slate-400'}`}>
                        {t.pph23 > 0 ? formatRupiah(t.pph23, false) : '-'}
                      </td>

                      {/* Action buttons */}
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {onUpdateTax && (
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(t)}
                              className="p-1 rounded bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-700 transition cursor-pointer shadow-2xs"
                              title="Edit Pajak"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {onDeleteTax && (
                            <button
                              type="button"
                              onClick={() => setDeleteTargetTax(t)}
                              className="p-1 rounded bg-slate-100 hover:bg-rose-100 text-slate-600 hover:text-rose-700 transition cursor-pointer shadow-2xs"
                              title="Hapus Pajak"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                <td colSpan={4} className="py-3 px-4 text-right uppercase text-xs">
                  Jumlah Pajak Yang Disetor:
                </td>
                <td className="py-3 px-3 text-right font-mono">{formatRupiah(totalKonstruksi, false)}</td>
                <td className="py-3 px-3 text-right font-mono">{formatRupiah(totalPerabot, false)}</td>
                <td className="py-3 px-3 text-right font-mono">{formatRupiah(totalPeralatan, false)}</td>
                <td className="py-3 px-3 text-right font-mono">{formatRupiah(totalKonsultan, false)}</td>
                <td className="py-3 px-3 text-right font-mono text-amber-900 bg-amber-100/70">{formatRupiah(totalPPN, false)}</td>
                <td className="py-3 px-3 text-right font-mono text-blue-900 bg-blue-100/70">{formatRupiah(totalPPh22, false)}</td>
                <td className="py-3 px-3 text-right font-mono text-indigo-900 bg-indigo-100/70">{formatRupiah(totalPPh23, false)}</td>
                <td className="py-3 px-3 text-center font-mono text-emerald-800 bg-emerald-50 text-[11px]">
                  {formatRupiah(totalPajakKeseluruhan, false)}
                </td>
              </tr>
              <tr className="bg-slate-800 text-white font-extrabold text-xs">
                <td colSpan={8} className="py-3 px-4 text-right uppercase tracking-wider">
                  TOTAL SEMUA PAJAK YANG DISETORKAN (PPN + PPh 22 + PPh 23):
                </td>
                <td colSpan={4} className="py-3 px-4 text-right font-mono text-amber-300 text-sm">
                  {formatRupiah(totalPajakKeseluruhan)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* FORM MODAL (Input Pajak Manual & Edit) */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-xl overflow-hidden my-8">
            <div className="bg-gradient-to-r from-amber-600 to-amber-700 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <FileCheck2 className="w-5 h-5 text-amber-200" />
                <h3 className="font-bold text-base">
                  {editingTaxId ? '✏️ Edit Transaksi & Penyetoran Pajak' : '➕ Input Transaksi Pajak Manual'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsFormModalOpen(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitForm} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nomor Bukti / Kwitansi</label>
                  <input
                    type="text"
                    required
                    value={formData.noBukti}
                    onChange={(e) => setFormData({ ...formData, noBukti: e.target.value })}
                    placeholder="Contoh: 01/KW-MAT/2026 atau NTPN-01"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tanggal Transaksi (DD/MM/YYYY)</label>
                  <input
                    type="text"
                    required
                    value={formData.tanggal}
                    onChange={(e) => {
                      const tgl = e.target.value;
                      setFormData({
                        ...formData,
                        tanggal: tgl,
                        bulan: getMonthFromPeriodString(tgl),
                      });
                    }}
                    placeholder="06/07/2026"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Keperluan Pembayaran / Uraian Belanja</label>
                <input
                  type="text"
                  required
                  value={formData.keperluan}
                  onChange={(e) => setFormData({ ...formData, keperluan: e.target.value })}
                  placeholder="Contoh: Bayar Pembelian Semen & Pasir / Honor Konsultan"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Pos Kategori Belanja</label>
                  <select
                    value={formData.kategori}
                    onChange={(e) => setFormData({ ...formData, kategori: e.target.value as any })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 font-semibold"
                  >
                    <option value="Konstruksi">🏗️ Konstruksi (Bahan/Fisik)</option>
                    <option value="Perabot">🪑 Perabot (Meja/Kursi)</option>
                    <option value="Peralatan">🔌 Peralatan (Elektronik/Alat)</option>
                    <option value="Perencanaan_Pengelolaan">📋 Perencanaan / Manajemen LPJ</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nilai Belanja Bruto / DPP (Rp)</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.nominalBelanja || ''}
                    onChange={(e) => setFormData({ ...formData, nominalBelanja: Number(e.target.value) || 0 })}
                    placeholder="0"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 font-mono font-bold"
                  />
                </div>
              </div>

              {/* Pajak Inputs with Auto Calculate buttons */}
              <div className="bg-amber-50/60 p-4 rounded-xl border border-amber-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                    <Calculator className="w-4 h-4 text-amber-700" />
                    Rincian Pemotongan & Penyetoran Pajak
                  </span>
                  <span className="text-[10px] text-amber-700">Klik tombol hitung untuk estimasi otomatis</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* PPN 11% */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold text-amber-950">PPN 11%</label>
                      <button
                        type="button"
                        onClick={handleCalcPpn}
                        className="text-[10px] px-1.5 py-0.5 bg-amber-200 hover:bg-amber-300 text-amber-900 rounded font-bold transition cursor-pointer"
                      >
                        ⚡ 11%
                      </button>
                    </div>
                    <input
                      type="number"
                      min="0"
                      value={formData.ppn11 || ''}
                      onChange={(e) => setFormData({ ...formData, ppn11: Number(e.target.value) || 0 })}
                      className="w-full px-2.5 py-1.5 text-xs border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 font-mono font-bold bg-white"
                      placeholder="0"
                    />
                  </div>

                  {/* PPh 22 (1.5%) */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold text-blue-950">PPh 22 (1.5%)</label>
                      <button
                        type="button"
                        onClick={handleCalcPph22}
                        className="text-[10px] px-1.5 py-0.5 bg-blue-200 hover:bg-blue-300 text-blue-900 rounded font-bold transition cursor-pointer"
                      >
                        ⚡ 1.5%
                      </button>
                    </div>
                    <input
                      type="number"
                      min="0"
                      value={formData.pph22 || ''}
                      onChange={(e) => setFormData({ ...formData, pph22: Number(e.target.value) || 0 })}
                      className="w-full px-2.5 py-1.5 text-xs border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono font-bold bg-white"
                      placeholder="0"
                    />
                  </div>

                  {/* PPh 23 (2%) */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold text-indigo-950">PPh 23 (2%)</label>
                      <button
                        type="button"
                        onClick={handleCalcPph23}
                        className="text-[10px] px-1.5 py-0.5 bg-indigo-200 hover:bg-indigo-300 text-indigo-900 rounded font-bold transition cursor-pointer"
                      >
                        ⚡ 2%
                      </button>
                    </div>
                    <input
                      type="number"
                      min="0"
                      value={formData.pph23 || ''}
                      onChange={(e) => setFormData({ ...formData, pph23: Number(e.target.value) || 0 })}
                      className="w-full px-2.5 py-1.5 text-xs border border-indigo-300 rounded-lg focus:ring-2 focus:ring-indigo-500 font-mono font-bold bg-white"
                      placeholder="0"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-amber-200 flex justify-between items-center text-xs font-bold text-amber-950">
                  <span>Total Pajak Disetorkan:</span>
                  <span className="font-mono text-sm text-emerald-700">
                    {formatRupiah((Number(formData.ppn11) || 0) + (Number(formData.pph22) || 0) + (Number(formData.pph23) || 0))}
                  </span>
                </div>
              </div>

              {/* Bukti Setor NTPN */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nomor NTPN / Kode Billing</label>
                  <input
                    type="text"
                    value={formData.ntpn}
                    onChange={(e) => setFormData({ ...formData, ntpn: e.target.value })}
                    placeholder="Contoh: 1234567890ABCDEF"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tanggal Setor ke Kas Negara</label>
                  <input
                    type="text"
                    value={formData.tanggalSetor}
                    onChange={(e) => setFormData({ ...formData, tanggalSetor: e.target.value })}
                    placeholder="06/07/2026"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-xs transition cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{editingTaxId ? 'Simpan Perubahan' : 'Tambah Transaksi Pajak'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteTargetTax && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-3 bg-rose-100 rounded-xl">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">Konfirmasi Hapus Data Pajak</h3>
                <p className="text-xs text-slate-500">Tindakan ini akan menghapus catatan pajak terpilih.</p>
              </div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
              <p>
                <strong>No Bukti:</strong> {deleteTargetTax.noBukti}
              </p>
              <p>
                <strong>Keperluan:</strong> {deleteTargetTax.keperluan}
              </p>
              <p>
                <strong>Total Pajak:</strong> {formatRupiah(deleteTargetTax.totalPajak)}
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTargetTax(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDeleteTax && deleteTargetTax) {
                    onDeleteTax(deleteTargetTax.id);
                  }
                  setDeleteTargetTax(null);
                }}
                className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-xs transition cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Ya, Hapus Pajak</span>
              </button>
            </div>
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
          onSelectExistingStore={() => {
            // Store linked successfully
          }}
        />
      )}
    </div>
  );
};
