import React, { useState } from 'react';
import {
  Store,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Search,
  Phone,
  MapPin,
  Building,
  FileText,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { StoreVendor } from '../types';

interface StoreVendorManagerProps {
  stores: StoreVendor[];
  onUpdateStores: (stores: StoreVendor[]) => void;
  onSelectForKwitansi?: (store: StoreVendor) => void;
}

export const StoreVendorManager: React.FC<StoreVendorManagerProps> = ({
  stores,
  onUpdateStores,
  onSelectForKwitansi,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedKategori, setSelectedKategori] = useState<string>('ALL');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // New Store Form State
  const [formNamaToko, setFormNamaToko] = useState('');
  const [formPemilikNama, setFormPemilikNama] = useState('');
  const [formPekerjaan, setFormPekerjaan] = useState('Pemilik Toko');
  const [formAlamat, setFormAlamat] = useState('');
  const [formTelepon, setFormTelepon] = useState('');
  const [formNpwp, setFormNpwp] = useState('');
  const [formKategori, setFormKategori] = useState<'MATERIAL' | 'PINTU_JENDELA_ALUMINIUM' | 'PERABOT' | 'PERENCANA' | 'PENGAWAS' | 'OPERASIONAL' | 'K3' | 'KONSULTAN' | 'SIPLAH' | 'PERCETAKAN' | 'PENGELOLA_SPJ' | 'UMUM'>('MATERIAL');
  const [formMitraSiplah, setFormMitraSiplah] = useState('SipLah Blibli / Telkom');
  const [formNoMitraSiplah, setFormNoMitraSiplah] = useState('');

  const filteredStores = stores.filter((s) => {
    const matchCat = selectedKategori === 'ALL' || s.kategori === selectedKategori || (selectedKategori === 'SIPLAH' && (s.kategori === 'SIPLAH' || s.isSiplah));
    const matchSearch =
      s.namaToko.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.pemilikNama.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.alamat.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.pekerjaan && s.pekerjaan.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (s.mitraSiplah && s.mitraSiplah.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchCat && matchSearch;
  });

  const handleResetForm = () => {
    setFormNamaToko('');
    setFormPemilikNama('');
    setFormPekerjaan('Pemilik Toko');
    setFormAlamat('');
    setFormTelepon('');
    setFormNpwp('');
    setFormKategori('MATERIAL');
    setFormMitraSiplah('SipLah Blibli / Telkom');
    setFormNoMitraSiplah('');
    setEditingId(null);
    setIsAdding(false);
  };

  const handleStartEdit = (store: StoreVendor) => {
    setEditingId(store.id);
    setFormNamaToko(store.namaToko);
    setFormPemilikNama(store.pemilikNama);
    setFormPekerjaan(store.pekerjaan || 'Pemilik Toko');
    setFormAlamat(store.alamat);
    setFormTelepon(store.telepon || '');
    setFormNpwp(store.npwp || '');
    setFormKategori(store.kategori || 'MATERIAL');
    setFormMitraSiplah(store.mitraSiplah || 'SipLah Blibli / Telkom');
    setFormNoMitraSiplah(store.noMitraSiplah || '');
    setIsAdding(true);
  };

  // Helper to add sample SipLah vendor if needed
  const handleAddSampleSiplahStores = () => {
    const sampleSiplahStores: StoreVendor[] = [
      {
        id: `siplah-${Date.now()}-1`,
        namaToko: 'UD. SIPLAH MEDIA EDUKASI',
        pemilikNama: 'T. Rahmad Hidayat',
        pekerjaan: 'Mitra Penyedia SipLah Resmi',
        alamat: 'Jl. Samudera No. 45, Lhokseumawe',
        telepon: '0812-6900-8899',
        npwp: '01.888.777.6-123.000',
        kategori: 'SIPLAH',
        isSiplah: true,
        mitraSiplah: 'SipLah Blibli',
        noMitraSiplah: 'SIPLAH-BLI-2026-091',
      },
      {
        id: `siplah-${Date.now()}-2`,
        namaToko: 'CV. SIPLAH SARANA BANGUN',
        pemilikNama: 'M. Faisal Abrar',
        pekerjaan: 'Penyedia Bahan & Perabot SipLah',
        alamat: 'Jl. Merdeka No. 88, Lhokseumawe',
        telepon: '0852-7788-9900',
        npwp: '02.999.555.4-123.000',
        kategori: 'SIPLAH',
        isSiplah: true,
        mitraSiplah: 'SipLah Telkom',
        noMitraSiplah: 'SIPLAH-TLK-2026-042',
      },
    ];

    const updated = [...stores, ...sampleSiplahStores];
    onUpdateStores(updated);
    setSelectedKategori('SIPLAH');
  };

  const handleAddSamplePintuJendelaStores = () => {
    const samplePintuJendelaStores: StoreVendor[] = [
      {
        id: `pj-alum-${Date.now()}-1`,
        namaToko: 'CV. ALUMATAMA JAYA',
        pemilikNama: 'Ir. Bambang Sugiarto',
        pekerjaan: 'Spesialis Pintu & Jendela Aluminium Complete',
        alamat: 'Jl. Industri Aluminium No. 12, Lhokseumawe',
        telepon: '0812-7788-3344',
        npwp: '02.456.789.1-123.000',
        kategori: 'PINTU_JENDELA_ALUMINIUM',
      },
      {
        id: `pj-alum-${Date.now()}-2`,
        namaToko: 'BENGKEL KARYA ALUMINIUM & GLASS',
        pemilikNama: 'Ahmad Zulkarnain',
        pekerjaan: 'Fabrikasi & Pemasangan Pintu/Jendela Aluminium',
        alamat: 'Jl. Pemuda No. 56, Lhokseumawe',
        telepon: '0852-6677-8899',
        npwp: '03.789.123.4-123.000',
        kategori: 'PINTU_JENDELA_ALUMINIUM',
      },
    ];

    const updated = [...stores, ...samplePintuJendelaStores];
    onUpdateStores(updated);
    setSelectedKategori('PINTU_JENDELA_ALUMINIUM');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNamaToko.trim()) return;

    const isSiplahCat = formKategori === 'SIPLAH';

    if (editingId) {
      // Edit existing
      const updated = stores.map((s) =>
        s.id === editingId
          ? {
              ...s,
              namaToko: formNamaToko.trim().toUpperCase(),
              pemilikNama: formPemilikNama.trim() || 'Pemilik Toko',
              pekerjaan: formPekerjaan.trim() || 'Pemilik Toko',
              alamat: formAlamat.trim() || '-',
              telepon: formTelepon.trim() || undefined,
              npwp: formNpwp.trim() || undefined,
              kategori: formKategori,
              isSiplah: isSiplahCat,
              mitraSiplah: isSiplahCat ? formMitraSiplah.trim() : undefined,
              noMitraSiplah: isSiplahCat ? formNoMitraSiplah.trim() : undefined,
            }
          : s
      );
      onUpdateStores(updated);
    } else {
      // Create new
      const newStore: StoreVendor = {
        id: `store-${Date.now()}`,
        namaToko: formNamaToko.trim().toUpperCase(),
        pemilikNama: formPemilikNama.trim() || 'Pemilik Toko',
        pekerjaan: formPekerjaan.trim() || 'Pemilik Toko',
        alamat: formAlamat.trim() || '-',
        telepon: formTelepon.trim() || undefined,
        npwp: formNpwp.trim() || undefined,
        kategori: formKategori,
        isSiplah: isSiplahCat,
        mitraSiplah: isSiplahCat ? formMitraSiplah.trim() : undefined,
        noMitraSiplah: isSiplahCat ? formNoMitraSiplah.trim() : undefined,
      };
      onUpdateStores([...stores, newStore]);
    }

    handleResetForm();
  };

  const handleDelete = (id: string, nama: string) => {
    if (confirm(`Hapus toko/penyedia "${nama}" dari daftar rekanan sekolah?`)) {
      onUpdateStores(stores.filter((s) => s.id !== id));
      if (editingId === id) handleResetForm();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-500/20">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Daftar Toko Rekanan & Penyedia Barang/Jasa
              </h2>
              <p className="text-xs text-slate-500">
                Kelola daftar toko bahan bangunan, pengrajin perabot, percetakan, dan konsultan yang terintegrasi langsung dengan Kwitansi, Bon Toko, SPB, dan RPD.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            handleResetForm();
            setIsAdding(!isAdding);
          }}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
        >
          {isAdding ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          <span>{isAdding ? 'Tutup Formulir' : '+ Tambah Toko / Rekanan'}</span>
        </button>
      </div>

      {/* Add / Edit Store Form */}
      {isAdding && (
        <form
          onSubmit={handleSubmit}
          className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-5 shadow-xs space-y-4 animate-in fade-in"
        >
          <div className="flex items-center justify-between border-b border-emerald-200 pb-2">
            <h3 className="text-xs font-bold uppercase text-emerald-900 flex items-center gap-1.5">
              <Store className="w-4 h-4 text-emerald-700" />
              <span>{editingId ? 'Edit Data Toko / Rekanan' : 'Pendaftaran Toko Rekanan Baru'}</span>
            </h3>
            <button
              type="button"
              onClick={handleResetForm}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Nama Toko / Perusahaan / UD *
              </label>
              <input
                type="text"
                required
                value={formNamaToko}
                onChange={(e) => setFormNamaToko(e.target.value)}
                placeholder="Contoh: TOKO BERKAH ABADI"
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none uppercase font-semibold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Kategori Penyedia *
              </label>
              <select
                value={formKategori}
                onChange={(e: any) => setFormKategori(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none font-medium"
              >
                <option value="MATERIAL">Bahan Bangunan & Material Konstruksi</option>
                <option value="PINTU_JENDELA_ALUMINIUM">🚪 Jendela & Pintu Aluminium Specialist (Unit Complete)</option>
                <option value="PERABOT">Mebeler & Perabot Ruang Kelas</option>
                <option value="PERCETAKAN">🖨️ Percetakan (Papan Nama Proyek, Baliho & Cetak Dokumen)</option>
                <option value="PENGELOLA_SPJ">💼 Pengelola SPJ (Administrasi, LPJ & Honor Tim SPJ)</option>
                <option value="PERENCANA">📐 Konsultan Perencana Teknis / Arsitek</option>
                <option value="PENGAWAS">🔍 Konsultan Pengawas Lapangan / Supervisi</option>
                <option value="OPERASIONAL">📄 Operasional & ATK Lainnya</option>
                <option value="K3">🪖 Peralatan K3 & Keselamatan Kerja</option>
                <option value="SIPLAH">🛒 Penyedia SipLah (Mitra Resmi Kemendikbud)</option>
                <option value="UMUM">Penyedia Umum Lainnya</option>
              </select>
            </div>

            {formKategori === 'SIPLAH' && (
              <>
                <div>
                  <label className="block text-xs font-bold text-emerald-900 mb-1">
                    Mitra Marketplace SipLah *
                  </label>
                  <input
                    type="text"
                    value={formMitraSiplah}
                    onChange={(e) => setFormMitraSiplah(e.target.value)}
                    placeholder="Contoh: SipLah Blibli / SipLah Telkom / Eureka"
                    className="w-full px-3 py-1.5 text-xs bg-emerald-50/50 border border-emerald-300 rounded-lg focus:ring-2 focus:ring-emerald-500 font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-emerald-900 mb-1">
                    No. Mitra / ID Transaksi SipLah
                  </label>
                  <input
                    type="text"
                    value={formNoMitraSiplah}
                    onChange={(e) => setFormNoMitraSiplah(e.target.value)}
                    placeholder="Contoh: SIPLAH-2026-9812"
                    className="w-full px-3 py-1.5 text-xs bg-emerald-50/50 border border-emerald-300 rounded-lg focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Nama Pemilik / Direktur / Penanggung Jawab *
              </label>
              <input
                type="text"
                required
                value={formPemilikNama}
                onChange={(e) => setFormPemilikNama(e.target.value)}
                placeholder="Contoh: H. Ahmad Subandi"
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Jabatan / Pekerjaan (Pada Bon & Kwitansi)
              </label>
              <input
                type="text"
                value={formPekerjaan}
                onChange={(e) => setFormPekerjaan(e.target.value)}
                placeholder="Contoh: Pemilik Toko / Direktur"
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Alamat Toko / Domisili *
              </label>
              <input
                type="text"
                required
                value={formAlamat}
                onChange={(e) => setFormAlamat(e.target.value)}
                placeholder="Contoh: Jl. Merdeka No. 12, Kota Lhokseumawe"
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                No. HP / Telepon Toko
              </label>
              <input
                type="text"
                value={formTelepon}
                onChange={(e) => setFormTelepon(e.target.value)}
                placeholder="Contoh: 0812-3456-7890"
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Nomor NPWP Toko (Opsional untuk Faktur Pajak)
              </label>
              <input
                type="text"
                value={formNpwp}
                onChange={(e) => setFormNpwp(e.target.value)}
                placeholder="Contoh: 01.234.567.8-123.000"
                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:outline-none font-mono"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-emerald-200">
            <button
              type="button"
              onClick={handleResetForm}
              className="px-4 py-1.5 text-xs font-medium bg-white text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-5 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm transition flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>{editingId ? 'Simpan Perubahan' : 'Daftarkan Toko'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'ALL', label: `Semua Toko (${stores.length})` },
            { id: 'PINTU_JENDELA_ALUMINIUM', label: '🚪 Pintu & Jendela Aluminium' },
            { id: 'PERCETAKAN', label: '🖨️ Percetakan' },
            { id: 'PENGELOLA_SPJ', label: '💼 Pengelola SPJ' },
            { id: 'SIPLAH', label: '🛒 SipLah' },
            { id: 'MATERIAL', label: '📦 Material Bangunan' },
            { id: 'PERABOT', label: '🪑 Perabot' },
            { id: 'PERENCANA', label: '📐 Perencana' },
            { id: 'PENGAWAS', label: '🔍 Pengawas' },
            { id: 'OPERASIONAL', label: '📄 Operasional' },
            { id: 'K3', label: '🪖 Peralatan K3' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedKategori(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                selectedKategori === tab.id
                  ? 'bg-emerald-600 text-white shadow-xs font-semibold'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
          {selectedKategori === 'PINTU_JENDELA_ALUMINIUM' && stores.filter((s) => s.kategori === 'PINTU_JENDELA_ALUMINIUM').length === 0 && (
            <button
              type="button"
              onClick={handleAddSamplePintuJendelaStores}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition flex items-center gap-1 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>+ Buat Contoh Toko Aluminium (CV. ALUMATAMA JAYA)</span>
            </button>
          )}
          {selectedKategori === 'SIPLAH' && stores.filter((s) => s.kategori === 'SIPLAH' || s.isSiplah).length === 0 && (
            <button
              type="button"
              onClick={handleAddSampleSiplahStores}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold shadow-xs transition flex items-center gap-1 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>+ Buat Contoh Penyedia SipLah</span>
            </button>
          )}
        </div>

        <div className="relative min-w-[220px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Cari toko, pemilik, alamat..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Stores Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredStores.map((store) => (
          <div
            key={store.id}
            className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs hover:border-emerald-300 hover:shadow-sm transition flex flex-col justify-between group"
          >
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-xs">
                    <Store className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-slate-900 group-hover:text-emerald-700 transition">
                      {store.namaToko}
                    </h4>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                      store.kategori === 'PERCETAKAN'
                        ? 'bg-cyan-100 text-cyan-900 border-cyan-300 font-bold'
                        : store.kategori === 'PENGELOLA_SPJ'
                        ? 'bg-amber-100 text-amber-900 border-amber-300 font-bold'
                        : store.kategori === 'SIPLAH' || store.isSiplah
                        ? 'bg-orange-100 text-orange-900 border-orange-300 font-bold'
                        : store.kategori === 'PERENCANA'
                        ? 'bg-purple-100 text-purple-900 border-purple-300 font-bold'
                        : store.kategori === 'PENGAWAS'
                        ? 'bg-indigo-100 text-indigo-900 border-indigo-300 font-bold'
                        : store.kategori === 'OPERASIONAL'
                        ? 'bg-blue-100 text-blue-900 border-blue-300 font-bold'
                        : store.kategori === 'K3'
                        ? 'bg-rose-100 text-rose-900 border-rose-300 font-bold'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}>
                      {store.kategori === 'PERCETAKAN'
                        ? '🖨️ Percetakan'
                        : store.kategori === 'PENGELOLA_SPJ'
                        ? '💼 Pengelola SPJ'
                        : store.kategori === 'SIPLAH' || store.isSiplah
                        ? `🛒 SipLah (${store.mitraSiplah || 'Resmi'})`
                        : store.kategori === 'MATERIAL'
                        ? '📦 Material Bangunan'
                        : store.kategori === 'PERABOT'
                        ? '🪑 Perabot Mebeler'
                        : store.kategori === 'PERENCANA'
                        ? '📐 Konsultan Perencana'
                        : store.kategori === 'PENGAWAS'
                        ? '🔍 Konsultan Pengawas'
                        : store.kategori === 'OPERASIONAL'
                        ? '📄 Operasional & Adm'
                        : store.kategori === 'K3'
                        ? '🪖 Peralatan K3'
                        : store.kategori === 'KONSULTAN'
                        ? 'Konsultan / Ahli'
                        : 'Penyedia Umum'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleStartEdit(store)}
                    title="Ubah Data Toko"
                    className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(store.id, store.namaToko)}
                    title="Hapus Toko"
                    className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 text-xs space-y-1.5 text-slate-600">
                <div className="flex items-start gap-1.5">
                  <span className="text-slate-400 font-medium w-16 shrink-0">Pemilik:</span>
                  <span className="font-semibold text-slate-800">{store.pemilikNama}</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-slate-400 font-medium w-16 shrink-0">Jabatan:</span>
                  <span className="text-slate-700">{store.pekerjaan || 'Pemilik Toko'}</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <span className="text-slate-400 font-medium w-16 shrink-0">Alamat:</span>
                  <span className="text-slate-700 leading-snug">{store.alamat}</span>
                </div>
                {store.telepon && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 font-medium w-16 shrink-0">Telepon:</span>
                    <span className="font-mono text-slate-700">{store.telepon}</span>
                  </div>
                )}
                {store.npwp && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 font-medium w-16 shrink-0">NPWP:</span>
                    <span className="font-mono text-[11px] text-slate-700 bg-slate-50 px-1 py-0.5 rounded border border-slate-200">
                      {store.npwp}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
              <span className="font-mono">ID: {store.id}</span>
              <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-medium border border-emerald-200 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Siap Dipakai di Kwitansi
              </span>
            </div>
          </div>
        ))}
      </div>

      {filteredStores.length === 0 && (
        <div className="text-center py-10 bg-white rounded-xl border border-slate-200">
          <Store className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-xs font-bold text-slate-600">Tidak ada toko rekanan yang sesuai kriteria.</p>
          <p className="text-[11px] text-slate-400 mt-1">
            Klik tombol "+ Tambah Toko / Rekanan" di atas untuk menambahkan toko baru.
          </p>
        </div>
      )}
    </div>
  );
};
