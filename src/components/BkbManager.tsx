import React, { useState, useMemo } from 'react';
import { CreditCard, Printer, Search, X, Plus, Edit3, Trash2, Calendar, AlertCircle, CheckCircle2, Wallet, Sparkles } from 'lucide-react';
import { BkbTransaction, BkuTransaction, BktTransaction, SchoolMasterData, ProjectProgressWeek } from '../types';
import { formatRupiah } from '../utils/formatters';
import { getAvailableMonthsForSchool, resolveWeekDates } from '../utils/monthHelper';

interface BkbManagerProps {
  bkbList: BkbTransaction[];
  school: SchoolMasterData;
  progressWeeks?: ProjectProgressWeek[];
  bkuList?: BkuTransaction[];
  bktList?: BktTransaction[];
  onOpenPrintModal: (period?: string) => void;
  onAddBkbRecord?: (record: Omit<BkbTransaction, 'id'>) => void;
  onUpdateBkbRecord?: (record: BkbTransaction) => void;
  onDeleteBkbRecord?: (record: BkbTransaction) => void;
  onInitStandardBkb?: () => void;
  onClearAllBkb?: () => void;
  onBulkDeleteBkb?: (records: BkbTransaction[]) => void;
}

export const BkbManager: React.FC<BkbManagerProps> = ({
  bkbList,
  school,
  progressWeeks,
  bkuList = [],
  bktList = [],
  onOpenPrintModal,
  onAddBkbRecord,
  onUpdateBkbRecord,
  onDeleteBkbRecord,
  onInitStandardBkb,
  onClearAllBkb,
  onBulkDeleteBkb,
}) => {
  const [selectedTxIds, setSelectedTxIds] = useState<Set<string>>(new Set());
  const [selectedPeriod, setSelectedPeriod] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal states for manual input & editing
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<BkbTransaction | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Determine starting date strictly from Laporan Mingguan & Bobot
  const schoolYear = school?.tahunAnggaran?.trim() || '2026';
  const minStartDateInfo = useMemo(() => {
    if (progressWeeks && progressWeeks.length > 0) {
      const w1 = progressWeeks.find((w) => w.mingguKe === 1) || progressWeeks[0];
      return resolveWeekDates(w1, schoolYear);
    }
    return {
      startDate: `${schoolYear}-07-01`,
      startDateFormatted: `01 Juli ${schoolYear}`,
      startDateSlash: `01/07/${schoolYear}`,
    };
  }, [progressWeeks, schoolYear]);

  // Form states
  const [formData, setFormData] = useState({
    tanggal: minStartDateInfo.startDate,
    jenis: 'KREDIT' as 'DEBIT' | 'KREDIT', // DEBIT = Penerimaan Bank, KREDIT = Penarikan/Pengeluaran Bank
    uraian: '',
    noBukti: '',
    nominal: 0,
  });

  const months = getAvailableMonthsForSchool(school, [bkbList]);
  const activeSelectedPeriod = (selectedPeriod === 'ALL' || months.includes(selectedPeriod)) ? selectedPeriod : 'ALL';

  // Calculate running bank balance
  let currentSaldo = 0;
  const computedList = bkbList.map((tx) => {
    currentSaldo = currentSaldo + tx.penerimaan - tx.pengeluaran;
    return {
      ...tx,
      saldo: currentSaldo,
    };
  });

  const filtered = computedList.filter((tx) => {
    const matchPeriod = activeSelectedPeriod === 'ALL' || tx.bulan === activeSelectedPeriod;
    const matchSearch =
      tx.uraian.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tx.noBukti.toLowerCase().includes(searchQuery.toLowerCase());
    return matchPeriod && matchSearch;
  });

  const totalPenerimaan = filtered.reduce((s, t) => s + t.penerimaan, 0);
  const totalPengeluaran = filtered.reduce((s, t) => s + t.pengeluaran, 0);
  const finalSaldo = filtered[filtered.length - 1]?.saldo || 0;

  // Handlers
  const handleOpenAdd = () => {
    setEditingTx(null);
    setFormError(null);
    setFormData({
      tanggal: minStartDateInfo.startDate,
      jenis: 'KREDIT',
      uraian: '',
      noBukti: `BB-${String(bkbList.length + 1).padStart(2, '0')}/${schoolYear}`,
      nominal: 0,
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (tx: BkbTransaction) => {
    setEditingTx(tx);
    setFormError(null);

    let dateInput = minStartDateInfo.startDate;
    if (tx.tanggalObj && tx.tanggalObj.includes('-')) {
      dateInput = tx.tanggalObj;
    } else if (tx.tanggal.includes('/')) {
      const [d, m, y] = tx.tanggal.split('/');
      dateInput = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    setFormData({
      tanggal: dateInput,
      jenis: tx.penerimaan > 0 ? 'DEBIT' : 'KREDIT',
      uraian: tx.uraian,
      noBukti: tx.noBukti === '-' ? '' : tx.noBukti,
      nominal: tx.penerimaan > 0 ? tx.penerimaan : tx.pengeluaran,
    });
    setIsModalOpen(true);
  };

  const handleSaveTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.uraian.trim()) {
      setFormError('Uraian transaksi bank tidak boleh kosong.');
      return;
    }

    if (!formData.nominal || formData.nominal <= 0) {
      setFormError('Nominal transaksi harus lebih dari Rp 0.');
      return;
    }

    // Tanggal mulai pencatatan jangan kurang dari tanggal yang di-input dari Laporan Mingguan & Bobot
    if (formData.tanggal < minStartDateInfo.startDate) {
      setFormError(
        `Tanggal transaksi bank (${formData.tanggal}) tidak boleh kurang dari tanggal mulai Laporan Mingguan & Bobot (${minStartDateInfo.startDateFormatted}).`
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
      if (onUpdateBkbRecord) {
        onUpdateBkbRecord({
          ...editingTx,
          tanggal: displayTanggal,
          tanggalObj: formData.tanggal,
          bulan: bulanStr,
          uraian: formData.uraian.trim(),
          noBukti: formData.noBukti.trim() || '-',
          penerimaan: formData.jenis === 'DEBIT' ? formData.nominal : 0,
          pengeluaran: formData.jenis === 'KREDIT' ? formData.nominal : 0,
        });
      }
    } else {
      if (onAddBkbRecord) {
        onAddBkbRecord({
          tanggal: displayTanggal,
          tanggalObj: formData.tanggal,
          bulan: bulanStr,
          uraian: formData.uraian.trim(),
          noBukti: formData.noBukti.trim() || '-',
          penerimaan: formData.jenis === 'DEBIT' ? formData.nominal : 0,
          pengeluaran: formData.jenis === 'KREDIT' ? formData.nominal : 0,
        });
      }
    }

    setIsModalOpen(false);
  };

  const handleDelete = (tx: BkbTransaction) => {
    const nominalStr = formatRupiah(tx.penerimaan > 0 ? tx.penerimaan : tx.pengeluaran);
    if (
      confirm(
        `Apakah Anda yakin ingin MENGHAPUS transaksi ini dari Buku Bank?\n\nTanggal: ${tx.tanggal}\nUraian: "${tx.uraian}"\nNominal: ${nominalStr}`
      )
    ) {
      if (onDeleteBkbRecord) {
        onDeleteBkbRecord(tx);
      }
    }
  };

  const handleToggleSelectAll = (filteredItems: BkbTransaction[]) => {
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
    const selectedList = bkbList.filter((t) => selectedTxIds.has(t.id));
    if (
      confirm(
        `Apakah Anda yakin ingin MENGHAPUS ${selectedTxIds.size} transaksi Bank terpilih secara massal?\n\nTindakan ini tidak dapat dibatalkan.`
      )
    ) {
      if (onBulkDeleteBkb) {
        onBulkDeleteBkb(selectedList);
      } else if (onDeleteBkbRecord) {
        selectedList.forEach((tx) => onDeleteBkbRecord(tx));
      }
      setSelectedTxIds(new Set());
    }
  };

  const handleConfirmClearAll = () => {
    if (
      confirm(
        `⚠️ KONFIRMASI HAPUS SELURUH DATA BKB:\n\nApakah Anda yakin ingin MENGHAPUS SELURUH data Buku Kas Bank (${bkbList.length} transaksi)?\n\nSeluruh data transaksi rekening bank akan dikosongkan.`
      )
    ) {
      if (onClearAllBkb) {
        onClearAllBkb();
      } else if (onBulkDeleteBkb) {
        onBulkDeleteBkb(bkbList);
      }
      setSelectedTxIds(new Set());
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-indigo-600" />
            Buku Bank (BKB) Rekening Sekolah
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Rekening: <strong className="text-slate-800">{school.namaBank} - {school.nomorRekening}</strong> a.n. {school.namaRekening}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {bkbList.length === 0 && onInitStandardBkb && (
            <button
              onClick={onInitStandardBkb}
              className="flex items-center gap-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-3.5 py-2 rounded-lg text-xs font-bold shadow-xs transition cursor-pointer"
              title="Buat Transaksi Standar BKB Terintegrasi dengan Termin 1 & 2 BKU"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>⚡ Buat Transaksi Standar BKB</span>
            </button>
          )}

          {bkbList.length > 0 && (
            <button
              onClick={handleConfirmClearAll}
              className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white px-3.5 py-2 rounded-lg text-xs font-bold shadow-xs transition cursor-pointer"
              title="Hapus seluruh data transaksi Buku Bank (BKB)"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Hapus Semua BKB</span>
            </button>
          )}

          <button
            onClick={() => onOpenPrintModal(selectedPeriod === 'ALL' ? undefined : selectedPeriod)}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white px-3.5 py-2 rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
          >
            <Printer className="w-4 h-4 text-emerald-400" />
            <span>Cetak Buku Bank</span>
          </button>
        </div>
      </div>

      {/* BULK ACTION BAR */}
      {selectedTxIds.size > 0 && (
        <div className="bg-rose-900 text-white p-3.5 rounded-xl shadow-lg flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in duration-200 border border-rose-700">
          <div className="flex items-center gap-3">
            <span className="bg-white/20 text-white px-2.5 py-1 rounded-lg text-xs font-mono font-bold">
              {selectedTxIds.size} Transaksi Bank Dipilih
            </span>
            <span className="text-xs text-rose-100 font-medium hidden sm:inline">
              Pilih transaksi yang ingin dihapus secara massal dari Buku Kas Bank
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

      {/* Status Integrasi Penuh Bank - BKU - BKT */}
      <div className="bg-slate-900 text-white rounded-xl p-4 border border-slate-800 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg border border-indigo-500/30">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div>
            <span className="font-bold text-slate-200 block">
              Buku Kas Bank (BKB) Terintegrasi Penuh dengan BKU & Kas Tunai (BKT)
            </span>
            <span className="text-[11px] text-slate-400">
              Penerimaan bantuan pemerintah masuk ke rekening bank ini. Penarikan tunai dari rekening ini otomatis mengalir ke BKT dan diakui di BKU.
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded-lg border border-slate-700 text-emerald-400 font-mono font-bold text-[11px] shrink-0">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>Status: Terhubung & Klop</span>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Cari transaksi bank / rekening..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        {searchQuery !== '' && (
          <button
            onClick={() => setSearchQuery('')}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 transition cursor-pointer shadow-xs"
            title="Bersihkan Pencarian"
          >
            <X className="w-3.5 h-3.5 text-rose-600" />
            <span>Bersihkan</span>
          </button>
        )}
      </div>

      {/* Summary KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Debit / Penerimaan Bank</span>
          <p className="text-lg font-bold text-blue-700 mt-1">{formatRupiah(totalPenerimaan)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Kredit / Penarikan Bank</span>
          <p className="text-lg font-bold text-rose-700 mt-1">{formatRupiah(totalPengeluaran)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Sisa Saldo Rekening</span>
          <p className="text-lg font-bold text-emerald-700 mt-1">{formatRupiah(finalSaldo)}</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider">
              BUKU KAS PEMBANTU BANK (BKB) {selectedPeriod !== 'ALL' && `- ${selectedPeriod.toUpperCase()}`}
            </h3>
            <p className="text-[11px] text-slate-400">{school.namaSekolah} • Rekening: {school.nomorRekening}</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenAdd}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-xs transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Input Transaksi Bank</span>
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
                    checked={filtered.length > 0 && selectedTxIds.size >= filtered.length}
                    onChange={() => handleToggleSelectAll(filtered)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    title="Pilih Semua Transaksi Bank Tampil"
                  />
                </th>
                <th className="py-2.5 px-3 w-10 text-center">No</th>
                <th className="py-2.5 px-3">Tanggal</th>
                <th className="py-2.5 px-4">Uraian Transaksi Bank</th>
                <th className="py-2.5 px-3 text-center">No. Bukti</th>
                <th className="py-2.5 px-4 text-right text-blue-900 bg-blue-50/50">Debit / Penerimaan (Rp)</th>
                <th className="py-2.5 px-4 text-right text-rose-900 bg-rose-50/50">Kredit / Penarikan (Rp)</th>
                <th className="py-2.5 px-4 text-right font-bold">Saldo Bank (Rp)</th>
                <th className="py-2.5 px-3 text-center w-24">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    Tidak ada transaksi Buku Bank pada filter saat ini.
                  </td>
                </tr>
              ) : (
                filtered.map((tx, idx) => (
                  <tr key={tx.id} className={`hover:bg-slate-50 transition ${selectedTxIds.has(tx.id) ? 'bg-indigo-50/60' : ''}`}>
                    <td className="py-2.5 px-2 text-center">
                      <input
                        type="checkbox"
                        checked={selectedTxIds.has(tx.id)}
                        onChange={() => handleToggleSelectTx(tx.id)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                    </td>
                    <td className="py-2.5 px-3 text-center text-slate-500 font-mono">{idx + 1}</td>
                    <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap font-mono">{tx.tanggal}</td>
                    <td className="py-2.5 px-4 font-medium text-slate-900">{tx.uraian}</td>
                    <td className="py-2.5 px-3 text-center font-mono text-[11px] text-slate-600 bg-slate-50 rounded">
                      {tx.noBukti || '-'}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-blue-700 bg-blue-50/30">
                      {tx.penerimaan > 0 ? formatRupiah(tx.penerimaan, false) : '-'}
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
                          onClick={() => handleOpenEdit(tx)}
                          className="p-1 rounded bg-amber-50 hover:bg-amber-100 text-amber-700 hover:text-amber-900 border border-amber-200 transition cursor-pointer"
                          title="Edit Transaksi Bank"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(tx)}
                          className="p-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-600 hover:text-rose-800 border border-rose-200 transition cursor-pointer"
                          title="Hapus Transaksi Bank"
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
                <td colSpan={4} className="py-3 px-4 text-right uppercase text-xs">Jumlah Total:</td>
                <td className="py-3 px-4 text-right font-mono text-blue-900 bg-blue-100/50">
                  {formatRupiah(totalPenerimaan, false)}
                </td>
                <td className="py-3 px-4 text-right font-mono text-rose-900 bg-rose-100/50">
                  {formatRupiah(totalPengeluaran, false)}
                </td>
                <td className="py-3 px-4 text-right font-mono font-extrabold text-emerald-900">
                  {formatRupiah(finalSaldo, false)}
                </td>
                <td className="py-3 px-3"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Modal for Input Manual & Edit Transaksi Bank */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-indigo-400" />
                  <span>{editingTx ? 'Edit Transaksi Buku Bank' : 'Input Transaksi Bank Manual'}</span>
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Buku Kas Pembantu Bank (BKB) • {school.namaSekolah}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveTransaction} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Tanggal Constraint Info Banner */}
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-900 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-indigo-950">
                  <Calendar className="w-4 h-4 text-indigo-600" />
                  <span>Aturan Tanggal Sesuai Juknis DAK:</span>
                </div>
                <p className="text-[11px] text-indigo-800">
                  Tanggal mulai pencatatan tidak boleh kurang dari tanggal awal Laporan Mingguan & Bobot (minimal: <strong>{minStartDateInfo.startDateFormatted}</strong>).
                </p>
              </div>

              {/* Jenis Transaksi Bank */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Jenis Transaksi Bank:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, jenis: 'DEBIT' })}
                    className={`py-2 px-3 rounded-lg text-xs font-bold border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      formData.jenis === 'DEBIT'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>Debit (Penerimaan Bank / Termin)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, jenis: 'KREDIT' })}
                    className={`py-2 px-3 rounded-lg text-xs font-bold border transition cursor-pointer flex items-center justify-center gap-1.5 ${
                      formData.jenis === 'KREDIT'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>Kredit (Penarikan Tunai Kas)</span>
                  </button>
                </div>
              </div>

              {/* Tanggal & No Bukti */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tanggal Transaksi Bank <span className="text-rose-500">*</span>:
                  </label>
                  <input
                    type="date"
                    min={minStartDateInfo.startDate}
                    value={formData.tanggal}
                    onChange={(e) => setFormData({ ...formData, tanggal: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-hidden font-mono font-bold"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nomor Bukti Bank:
                  </label>
                  <input
                    type="text"
                    placeholder="misal: TARIK-M01 atau BB-01"
                    value={formData.noBukti}
                    onChange={(e) => setFormData({ ...formData, noBukti: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-hidden font-mono"
                  />
                </div>
              </div>

              {/* Uraian Transaksi Bank */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Uraian Transaksi Bank <span className="text-rose-500">*</span>:
                </label>
                <textarea
                  rows={2}
                  placeholder="misal: Penarikan Tunai Kas Operasional & Upah Fisik Minggu Ke-1"
                  value={formData.uraian}
                  onChange={(e) => setFormData({ ...formData, uraian: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                  required
                />
              </div>

              {/* Nominal Transaksi Bank */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nominal Transaksi (Rp) <span className="text-rose-500">*</span>:
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0"
                  value={formData.nominal || ''}
                  onChange={(e) => setFormData({ ...formData, nominal: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 text-sm font-bold border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-hidden font-mono"
                  required
                />
                <p className="text-xs text-slate-500 mt-1 font-mono">
                  Terbilang format rupiah: <strong className="text-emerald-700">{formatRupiah(formData.nominal)}</strong>
                </p>
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition cursor-pointer"
                >
                  {editingTx ? 'Simpan Perubahan' : 'Simpan Transaksi Bank'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

