import React, { useState } from 'react';
import { Store, Check, X, Sparkles, Building2, Link2, PlusCircle, ArrowRight } from 'lucide-react';
import { StoreVendor } from '../types';

interface VendorQuickRegisterModalProps {
  isOpen: boolean;
  unregisteredName: string;
  categoryHint?: 'MATERIAL' | 'PINTU_JENDELA_ALUMINIUM' | 'PERABOT' | 'PERENCANA' | 'PENGAWAS' | 'OPERASIONAL' | 'K3' | 'KONSULTAN' | 'SIPLAH' | 'PERCETAKAN' | 'PENGELOLA_SPJ' | 'UMUM';
  availableStores?: StoreVendor[];
  onClose: () => void;
  onSaveStore: (newStore: StoreVendor) => void;
  onSelectExistingStore?: (selectedStore: StoreVendor) => void;
}

export const VendorQuickRegisterModal: React.FC<VendorQuickRegisterModalProps> = ({
  isOpen,
  unregisteredName,
  categoryHint = 'MATERIAL',
  availableStores = [],
  onClose,
  onSaveStore,
  onSelectExistingStore,
}) => {
  const [activeTab, setActiveTab] = useState<'NEW' | 'EXISTING'>('NEW');

  // New Store Form State
  const [namaToko, setNamaToko] = useState(unregisteredName || '');
  const [pemilikNama, setPemilikNama] = useState('');
  const [pekerjaan, setPekerjaan] = useState('Pemilik Toko');
  const [alamat, setAlamat] = useState('Lokasi Sekolah / Sekitar');
  const [telepon, setTelepon] = useState('');
  const [npwp, setNpwp] = useState('');
  const [kategori, setKategori] = useState<'MATERIAL' | 'PINTU_JENDELA_ALUMINIUM' | 'PERABOT' | 'PERENCANA' | 'PENGAWAS' | 'OPERASIONAL' | 'K3' | 'KONSULTAN' | 'SIPLAH' | 'PERCETAKAN' | 'PENGELOLA_SPJ' | 'UMUM'>(categoryHint);
  const [mitraSiplah, setMitraSiplah] = useState('SipLah Blibli');

  // Existing Store Selection State
  const [selectedStoreId, setSelectedStoreId] = useState<string>(availableStores[0]?.id || '');

  React.useEffect(() => {
    setNamaToko(unregisteredName);
    setKategori(categoryHint);
    if (availableStores && availableStores.length > 0 && !selectedStoreId) {
      setSelectedStoreId(availableStores[0].id);
    }
  }, [unregisteredName, categoryHint, availableStores]);

  if (!isOpen) return null;

  const handleCreateNewSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!namaToko.trim()) return;

    const isSiplah = kategori === 'SIPLAH';

    const newStore: StoreVendor = {
      id: `store-quick-${Date.now()}`,
      namaToko: namaToko.trim().toUpperCase(),
      pemilikNama: pemilikNama.trim() || 'Pemilik Toko',
      pekerjaan: pekerjaan.trim() || 'Pemilik Toko',
      alamat: alamat.trim() || '-',
      telepon: telepon.trim() || undefined,
      npwp: npwp.trim() || undefined,
      kategori,
      isSiplah,
      mitraSiplah: isSiplah ? mitraSiplah : undefined,
    };

    onSaveStore(newStore);
    onClose();
  };

  const handleSelectExistingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStoreId || !onSelectExistingStore) return;
    const store = availableStores.find((s) => s.id === selectedStoreId);
    if (store) {
      onSelectExistingStore(store);
      onClose();
    }
  };

  const selectedStore = availableStores.find((s) => s.id === selectedStoreId);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="bg-emerald-700 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-600 rounded-xl shadow-xs">
              <Store className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-sm">Validasi Toko / Penyedia Transaksi</h3>
              <p className="text-xs text-emerald-100">
                Pilih dari Master Toko yang ada atau Daftarkan Toko Baru
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-emerald-200 hover:text-white p-1.5 rounded-lg hover:bg-emerald-600 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="bg-slate-100 p-1.5 flex gap-1 border-b border-slate-200 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveTab('NEW')}
            className={`flex-1 py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer ${
              activeTab === 'NEW'
                ? 'bg-white text-emerald-800 shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <PlusCircle className="w-4 h-4 text-emerald-600" />
            <span>+ Daftarkan Toko Baru</span>
          </button>

          {availableStores.length > 0 && onSelectExistingStore && (
            <button
              type="button"
              onClick={() => setActiveTab('EXISTING')}
              className={`flex-1 py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer ${
                activeTab === 'EXISTING'
                  ? 'bg-white text-blue-800 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Link2 className="w-4 h-4 text-blue-600" />
              <span>🏢 Pilih Toko dari Master ({availableStores.length})</span>
            </button>
          )}
        </div>

        {/* Mode 1: Register New Store Form */}
        {activeTab === 'NEW' && (
          <form onSubmit={handleCreateNewSubmit} className="p-5 space-y-4 text-xs font-sans">
            <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-[11px] text-emerald-900 font-medium">
              💡 Daftarkan toko baru di bawah ini. Setelah disimpan, toko akan permanen masuk ke Master Data Toko Rekanan & Penyedia SipLah.
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Nama Toko / Perusahaan / Penyedia *
              </label>
              <input
                type="text"
                required
                value={namaToko}
                onChange={(e) => setNamaToko(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 font-bold uppercase"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Kategori Master *</label>
                <select
                  value={kategori}
                  onChange={(e: any) => setKategori(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 font-medium"
                >
                  <option value="MATERIAL">Bahan Bangunan & Material</option>
                  <option value="PINTU_JENDELA_ALUMINIUM">🚪 Jendela & Pintu Aluminium Specialist (Unit Complete)</option>
                  <option value="PERABOT">Mebeler & Perabot</option>
                  <option value="PERCETAKAN">🖨️ Percetakan (Papan Nama, Baliho, Cetak)</option>
                  <option value="PENGELOLA_SPJ">💼 Pengelola SPJ (Administrasi, LPJ)</option>
                  <option value="PERENCANA">📐 Konsultan Perencana Teknis</option>
                  <option value="PENGAWAS">🔍 Konsultan Pengawas Lapangan</option>
                  <option value="OPERASIONAL">📄 Operasional & ATK Lainnya</option>
                  <option value="K3">🪖 Peralatan K3</option>
                  <option value="SIPLAH">🛒 Penyedia SipLah Resmi</option>
                  <option value="UMUM">Penyedia Umum</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Pemilik / Penanggung Jawab</label>
                <input
                  type="text"
                  value={pemilikNama}
                  onChange={(e) => setPemilikNama(e.target.value)}
                  placeholder="Contoh: H. Ahmad"
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {kategori === 'SIPLAH' && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                <span className="font-bold text-amber-900 flex items-center gap-1 text-[11px]">
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  <span>Pengaturan Mitra SipLah</span>
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-semibold text-amber-900 text-[10px] mb-0.5">Mitra SipLah</label>
                    <input
                      type="text"
                      value={mitraSiplah}
                      onChange={(e) => setMitraSiplah(e.target.value)}
                      placeholder="SipLah Blibli / Telkom"
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-amber-300 rounded-lg font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-amber-900 text-[10px] mb-0.5">Jabatan Pemilik</label>
                    <input
                      type="text"
                      value={pekerjaan}
                      onChange={(e) => setPekerjaan(e.target.value)}
                      placeholder="Penyedia SipLah"
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-amber-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Alamat Toko</label>
                <input
                  type="text"
                  value={alamat}
                  onChange={(e) => setAlamat(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">NPWP Toko (Opsional)</label>
                <input
                  type="text"
                  value={npwp}
                  onChange={(e) => setNpwp(e.target.value)}
                  placeholder="01.234.567.8-123.000"
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 font-medium bg-white text-slate-700 border border-slate-300 rounded-xl hover:bg-slate-50 transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-5 py-2 font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md flex items-center gap-1.5 transition cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Simpan ke Master Toko</span>
              </button>
            </div>
          </form>
        )}

        {/* Mode 2: Select Existing Store Dropdown */}
        {activeTab === 'EXISTING' && onSelectExistingStore && (
          <form onSubmit={handleSelectExistingSubmit} className="p-5 space-y-4 text-xs font-sans">
            <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-900 font-medium">
              🔗 Pilih salah satu toko yang <strong>sudah terdaftar di Master Data</strong> di bawah ini untuk dihubungkan ke transaksi ini.
            </div>

            <div>
              <label className="block font-bold text-slate-800 mb-1">
                Pilih Toko / Penyedia Terdaftar dari Dropdown *
              </label>
              <select
                value={selectedStoreId}
                onChange={(e) => setSelectedStoreId(e.target.value)}
                className="w-full p-2.5 text-xs bg-white border-2 border-blue-400 rounded-xl focus:ring-2 focus:ring-blue-600 font-bold text-slate-900"
              >
                {availableStores.map((s) => {
                  const isSiplah = s.kategori === 'SIPLAH' || s.isSiplah;
                  return (
                    <option key={s.id} value={s.id}>
                      {isSiplah ? '🛒 [SIPLAH] ' : '🏢 '}
                      {s.namaToko} — {s.pemilikNama} ({s.kategori})
                    </option>
                  );
                })}
              </select>
            </div>

            {selectedStore && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2 text-slate-700">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-blue-600" />
                    <span>{selectedStore.namaToko}</span>
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    selectedStore.kategori === 'SIPLAH' || selectedStore.isSiplah
                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                      : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                  }`}>
                    {selectedStore.kategori === 'SIPLAH' || selectedStore.isSiplah
                      ? `🛒 SipLah (${selectedStore.mitraSiplah || 'Resmi'})`
                      : `🏢 ${selectedStore.kategori}`}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-slate-200">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Pemilik / Penanggung Jawab:</span>
                    <strong className="text-slate-800">{selectedStore.pemilikNama}</strong> ({selectedStore.pekerjaan || 'Pemilik'})
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Alamat Toko:</span>
                    <span className="text-slate-800 font-medium">{selectedStore.alamat}</span>
                  </div>
                  {selectedStore.npwp && (
                    <div className="col-span-2">
                      <span className="text-slate-400 block text-[10px]">NPWP Toko:</span>
                      <span className="font-mono text-slate-800 font-bold">{selectedStore.npwp}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 font-medium bg-white text-slate-700 border border-slate-300 rounded-xl hover:bg-slate-50 transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-5 py-2 font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md flex items-center gap-1.5 transition cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Hubungkan & Gunakan Toko Ini</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
