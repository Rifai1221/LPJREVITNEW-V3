import React, { useState } from 'react';
import {
  Layers,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Search,
  Filter,
  DollarSign,
  Printer,
  Sparkles,
  FolderSync,
} from 'lucide-react';
import { RpdItem, RpdKategori, StoreVendor, RealSchoolData } from '../types';
import { formatRupiah, formatNumber } from '../utils/formatters';

interface RpdManagerProps {
  items: RpdItem[];
  onUpdateItems: (newItems: RpdItem[]) => void;
  onOpenPrintModal: () => void;
  availableStores?: StoreVendor[];
  realSchoolData?: RealSchoolData;
  onSyncFromRealData?: () => void;
}

export const RpdManager: React.FC<RpdManagerProps> = ({
  items,
  onUpdateItems,
  onOpenPrintModal,
  availableStores = [],
  realSchoolData,
  onSyncFromRealData,
}) => {
  const [activeKategori, setActiveKategori] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<RpdItem>>({});
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newItem, setNewItem] = useState<Partial<RpdItem>>({
    kategori: 'BAHAN_BARU',
    uraian: '',
    volume100: 1,
    volumeTermin1: 0.7,
    volumeTermin2: 0.3,
    satuan: 'bh',
    hargaSatuan: 0,
    defaultToko: 'USAHA FAMILY',
  });

  const categories: { id: string; label: string }[] = [
    { id: 'ALL', label: 'Semua Kategori' },
    { id: 'GAJI_REHAB', label: 'A. Gaji/Upah Rehab' },
    { id: 'GAJI_BARU', label: 'A. Gaji/Upah Ruang Baru' },
    { id: 'PERSIAPAN', label: 'B. Persiapan & K3' },
    { id: 'BAHAN_REHAB', label: 'C. Bahan Rehab' },
    { id: 'BAHAN_BARU', label: 'D. Bahan Ruang Baru' },
    { id: 'PERABOT', label: 'E. Perabot Meja & Kursi' },
    { id: 'KONSULTAN_ADM', label: 'F. Konsultan & Administrasi' },
  ];

  const filteredItems = items.filter((item) => {
    const matchCat = activeKategori === 'ALL' || item.kategori === activeKategori;
    const matchQuery = item.uraian.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.defaultToko && item.defaultToko.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchCat && matchQuery;
  });

  // Calculate totals from RealSchoolData Pagu Anggaran (or fallback to RPD items sum if not set)
  const paguMaster = realSchoolData?.paguAnggaran && realSchoolData.paguAnggaran > 0
    ? realSchoolData.paguAnggaran
    : realSchoolData?.totalNilaiRab && realSchoolData.totalNilaiRab > 0
    ? realSchoolData.totalNilaiRab
    : items.reduce((sum, item) => sum + item.jumlahAnggaran, 0);

  const totalAnggaran100 = paguMaster > 0 ? paguMaster : items.reduce((sum, item) => sum + item.jumlahAnggaran, 0);
  const totalTermin1 = Math.round(totalAnggaran100 * 0.7);
  const totalTermin2 = totalAnggaran100 - totalTermin1; // Exactly 30% without 1 rupiah rounding difference

  const handleStartEdit = (item: RpdItem) => {
    setEditingId(item.id);
    setEditForm({ ...item });
  };

  const handleSaveEdit = () => {
    if (!editingId || !editForm) return;
    const updated = items.map((item) => {
      if (item.id === editingId) {
        const vol100 = Number(editForm.volume100) || 0;
        const volT1 = Number(editForm.volumeTermin1) || 0;
        const volT2 = Number(editForm.volumeTermin2) || 0;
        const harga = Number(editForm.hargaSatuan) || 0;
        return {
          ...item,
          ...editForm,
          volume100: vol100,
          volumeTermin1: volT1,
          volumeTermin2: volT2,
          hargaSatuan: harga,
          jumlahTermin1: Math.round(volT1 * harga),
          jumlahTermin2: Math.round(volT2 * harga),
          jumlahAnggaran: Math.round(vol100 * harga),
        } as RpdItem;
      }
      return item;
    });
    onUpdateItems(updated);
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    if (confirm('Hapus item RPD ini?')) {
      onUpdateItems(items.filter((item) => item.id !== id));
    }
  };

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    const vol100 = Number(newItem.volume100) || 1;
    const volT1 = Number(newItem.volumeTermin1) || (vol100 * 0.7);
    const volT2 = Number(newItem.volumeTermin2) || (vol100 * 0.3);
    const harga = Number(newItem.hargaSatuan) || 0;

    const created: RpdItem = {
      id: `rpd-${Date.now()}`,
      no: items.length + 1,
      kategori: newItem.kategori as RpdKategori,
      uraian: newItem.uraian || 'Item Baru',
      volume100: vol100,
      volumeTermin1: volT1,
      satuan: newItem.satuan || 'Unit',
      volumeTermin2: volT2,
      hargaSatuan: harga,
      jumlahTermin1: Math.round(volT1 * harga),
      jumlahTermin2: Math.round(volT2 * harga),
      jumlahAnggaran: Math.round(vol100 * harga),
      defaultToko: newItem.defaultToko,
    };

    onUpdateItems([...items, created]);
    setIsAddingNew(false);
    setNewItem({
      kategori: 'BAHAN_BARU',
      uraian: '',
      volume100: 1,
      volumeTermin1: 0.7,
      volumeTermin2: 0.3,
      satuan: 'bh',
      hargaSatuan: 0,
      defaultToko: 'USAHA FAMILY',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-600" />
            Rencana Penggunaan Dana (RPD) & Analisa Harga Satuan
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Master RAB belanja bahan, upah tenaga kerja, sewa alat, perabot, dan konsultan dengan pembagian Termin 70% dan 30%.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {onSyncFromRealData && (
            <button
              onClick={onSyncFromRealData}
              title="Tarik seluruh uraian, volume, satuan, dan harga satuan dari Data Real Sekolah"
              className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white px-3.5 py-2 rounded-lg text-xs font-bold shadow-xs transition cursor-pointer"
            >
              <FolderSync className="w-4 h-4 text-emerald-200" />
              <span>Tarik dari Data Real Sekolah</span>
            </button>
          )}
          <button
            onClick={() => setIsAddingNew(true)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Item RAB</span>
          </button>
          <button
            onClick={onOpenPrintModal}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white px-3.5 py-2 rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
          >
            <Printer className="w-4 h-4 text-emerald-400" />
            <span>Cetak RPD</span>
          </button>
        </div>
      </div>

      {/* Sequential Waterfall Engine Banner */}
      <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-emerald-50 border border-blue-200 p-4 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-100 text-blue-700 rounded-xl shrink-0 mt-0.5">
            <Sparkles className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h4 className="font-extrabold text-sm text-blue-950 flex items-center gap-2">
              <span>⚡ Sequential Waterfall Budget Allocation Engine (Berbasis Bobot Progress)</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
                ● Terapkan Otomatis
              </span>
            </h4>
            <p className="text-xs text-blue-800 mt-0.5 leading-relaxed">
              Alokasi dana RPD dihitung secara <strong>kronologis berdasarkan urutan tahapan fisik (Divisi I s/d XII) & Bobot Mingguan</strong>. Pekerjaan tahap awal dialokasikan 100% ke Termin 1 (70%), sedangkan pekerjaan tahap akhir otomatis dialokasikan 100% ke Termin 2 (30%).
            </p>
          </div>
        </div>
        {onSyncFromRealData && (
          <button
            type="button"
            onClick={onSyncFromRealData}
            className="shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            title="Hitung ulang & cocokkan alokasi RPD dengan Bobot Mingguan"
          >
            <FolderSync className="w-4 h-4 text-amber-300" />
            <span>Hitung Ulang Alokasi Waterfall</span>
          </button>
        )}
      </div>

      {/* Summary Totals */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Anggaran (100%)</span>
          <p className="text-lg font-bold text-slate-900 mt-1">{formatRupiah(totalAnggaran100)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Alokasi Termin I (70%)</span>
          <p className="text-lg font-bold text-blue-700 mt-1">{formatRupiah(totalTermin1)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Alokasi Termin II (30%)</span>
          <p className="text-lg font-bold text-indigo-700 mt-1">{formatRupiah(totalTermin2)}</p>
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5 overflow-x-auto">
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveKategori(c.id)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                  activeKategori === c.id
                    ? 'bg-blue-600 text-white shadow-xs font-semibold'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="relative min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari item material / upah..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Add Item Modal / Box */}
      {isAddingNew && (
        <form onSubmit={handleAddItem} className="bg-blue-50/70 p-5 rounded-xl border border-blue-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-blue-200/80 pb-2">
            <h3 className="text-xs font-bold text-blue-900 uppercase">Tambah Item Rencana Penggunaan Dana Baru</h3>
            <button
              type="button"
              onClick={() => setIsAddingNew(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">Kategori</label>
              <select
                value={newItem.kategori}
                onChange={(e) => setNewItem({ ...newItem, kategori: e.target.value as RpdKategori })}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="GAJI_REHAB">A. Gaji/Upah Rehab</option>
                <option value="GAJI_BARU">A. Gaji/Upah Baru</option>
                <option value="PERSIAPAN">B. Persiapan & K3</option>
                <option value="BAHAN_REHAB">C. Bahan Rehab</option>
                <option value="BAHAN_BARU">D. Bahan Baru</option>
                <option value="PERABOT">E. Perabot</option>
                <option value="KONSULTAN_ADM">F. Konsultan/Adm</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">Uraian / Nama Bahan / Upah</label>
              <input
                type="text"
                placeholder="Contoh: Pasir Pasang, Semen PC, Cat Tembok..."
                value={newItem.uraian}
                onChange={(e) => setNewItem({ ...newItem, uraian: e.target.value })}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">Toko / Supplier Default</label>
              <input
                type="text"
                list="available-stores-list"
                placeholder="Pilih atau ketik Toko"
                value={newItem.defaultToko || ''}
                onChange={(e) => setNewItem({ ...newItem, defaultToko: e.target.value })}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
              />
              <datalist id="available-stores-list">
                {availableStores.map((s) => (
                  <option key={s.id} value={s.namaToko}>
                    {s.namaToko} - {s.pemilikNama} ({s.kategori})
                  </option>
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">Volume 100%</label>
              <input
                type="number"
                step="0.01"
                value={newItem.volume100}
                onChange={(e) => {
                  const v = parseFloat(e.target.value) || 0;
                  setNewItem({
                    ...newItem,
                    volume100: v,
                    volumeTermin1: Math.round(v * 0.7 * 100) / 100,
                    volumeTermin2: Math.round(v * 0.3 * 100) / 100,
                  });
                }}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">Satuan</label>
              <input
                type="text"
                value={newItem.satuan}
                onChange={(e) => setNewItem({ ...newItem, satuan: e.target.value })}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                placeholder="Zak, m3, btg, OH, unit..."
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">Harga Satuan (Rp)</label>
              <input
                type="number"
                value={newItem.hargaSatuan}
                onChange={(e) => setNewItem({ ...newItem, hargaSatuan: parseFloat(e.target.value) || 0 })}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-bold"
              />
            </div>

            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1.5 px-3 rounded-lg text-xs shadow-xs cursor-pointer"
              >
                Simpan Item
              </button>
            </div>
          </div>
        </form>
      )}

      {/* RPD Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-800 text-white uppercase text-[10px] tracking-wider border-b border-slate-700">
                <th className="py-3 px-3 w-10 text-center">No</th>
                <th className="py-3 px-4">Uraian Pekerjaan / Material</th>
                <th className="py-3 px-3 text-right">Vol 100%</th>
                <th className="py-3 px-2 text-center">Sat</th>
                <th className="py-3 px-3 text-right">Harga Sat (Rp)</th>
                <th className="py-3 px-3 text-right bg-blue-900/50">Vol T1 (70%)</th>
                <th className="py-3 px-4 text-right bg-blue-900/50">Jumlah T1 (Rp)</th>
                <th className="py-3 px-3 text-right bg-indigo-900/50">Vol T2 (30%)</th>
                <th className="py-3 px-4 text-right bg-indigo-900/50">Jumlah T2 (Rp)</th>
                <th className="py-3 px-4 text-right font-bold">Total (Rp)</th>
                <th className="py-3 px-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.map((item, index) => {
                const isEditing = editingId === item.id;
                return (
                  <tr key={item.id} className="hover:bg-slate-50 transition">
                    <td className="py-2.5 px-3 text-center text-slate-500 font-mono">{index + 1}</td>
                    
                    {/* Uraian */}
                    <td className="py-2.5 px-4 font-medium text-slate-800">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editForm.uraian || ''}
                          onChange={(e) => setEditForm({ ...editForm, uraian: e.target.value })}
                          className="w-full px-2 py-1 border border-blue-400 rounded text-xs"
                        />
                      ) : (
                        <div>
                          <span>{item.uraian}</span>
                          {item.defaultToko && (
                            <span className="ml-2 text-[10px] text-slate-400 font-mono">({item.defaultToko})</span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Vol 100 */}
                    <td className="py-2.5 px-3 text-right text-slate-700">
                      {isEditing ? (
                        <input
                          type="number"
                          step="0.01"
                          value={editForm.volume100}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value) || 0;
                            setEditForm({
                              ...editForm,
                              volume100: v,
                              volumeTermin1: Math.round(v * 0.7 * 100) / 100,
                              volumeTermin2: Math.round(v * 0.3 * 100) / 100,
                            });
                          }}
                          className="w-16 px-1 py-1 border border-blue-400 rounded text-xs text-right"
                        />
                      ) : (
                        formatNumber(item.volume100)
                      )}
                    </td>

                    {/* Satuan */}
                    <td className="py-2.5 px-2 text-center text-slate-500">{item.satuan}</td>

                    {/* Harga Satuan */}
                    <td className="py-2.5 px-3 text-right text-slate-700 font-mono">
                      {isEditing ? (
                        <input
                          type="number"
                          value={editForm.hargaSatuan}
                          onChange={(e) => setEditForm({ ...editForm, hargaSatuan: parseFloat(e.target.value) || 0 })}
                          className="w-24 px-1 py-1 border border-blue-400 rounded text-xs text-right font-mono"
                        />
                      ) : (
                        formatRupiah(item.hargaSatuan, false)
                      )}
                    </td>

                    {/* Vol T1 */}
                    <td className="py-2.5 px-3 text-right text-blue-900 bg-blue-50/30">
                      {formatNumber(item.volumeTermin1)}
                    </td>

                    {/* Jumlah T1 */}
                    <td className="py-2.5 px-4 text-right text-blue-900 bg-blue-50/30 font-mono">
                      {formatRupiah(item.jumlahTermin1, false)}
                    </td>

                    {/* Vol T2 */}
                    <td className="py-2.5 px-3 text-right text-indigo-900 bg-indigo-50/30">
                      {formatNumber(item.volumeTermin2)}
                    </td>

                    {/* Jumlah T2 */}
                    <td className="py-2.5 px-4 text-right text-indigo-900 bg-indigo-50/30 font-mono">
                      {formatRupiah(item.jumlahTermin2, false)}
                    </td>

                    {/* Total */}
                    <td className="py-2.5 px-4 text-right font-bold text-slate-900 font-mono">
                      {formatRupiah(item.jumlahAnggaran, false)}
                    </td>

                    {/* Actions */}
                    <td className="py-2.5 px-3 text-center">
                      {isEditing ? (
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={handleSaveEdit}
                            className="p-1 bg-emerald-600 text-white rounded hover:bg-emerald-700"
                            title="Simpan"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="p-1 bg-slate-300 text-slate-700 rounded hover:bg-slate-400"
                            title="Batal"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleStartEdit(item)}
                            className="p-1 text-slate-400 hover:text-blue-600 rounded hover:bg-blue-50"
                            title="Edit"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50"
                            title="Hapus"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                <td colSpan={5} className="py-3 px-4 text-right uppercase text-xs">Jumlah Total Terfilter:</td>
                <td className="py-3 px-3 text-right bg-blue-100/50">-</td>
                <td className="py-3 px-4 text-right font-mono text-blue-900 bg-blue-100/50">
                  {formatRupiah(filteredItems.reduce((s, i) => s + i.jumlahTermin1, 0))}
                </td>
                <td className="py-3 px-3 text-right bg-indigo-100/50">-</td>
                <td className="py-3 px-4 text-right font-mono text-indigo-900 bg-indigo-100/50">
                  {formatRupiah(filteredItems.reduce((s, i) => s + i.jumlahTermin2, 0))}
                </td>
                <td className="py-3 px-4 text-right font-mono font-extrabold text-slate-900">
                  {formatRupiah(filteredItems.reduce((s, i) => s + i.jumlahAnggaran, 0))}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};
