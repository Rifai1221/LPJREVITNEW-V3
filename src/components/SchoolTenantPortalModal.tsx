import React, { useState } from 'react';
import {
  Building2,
  ShieldCheck,
  PlusCircle,
  Database,
  CheckCircle2,
  Search,
  ExternalLink,
  Layers,
  Sparkles,
  School,
  Lock,
  ArrowRight,
  Info,
  X,
  Server,
  CloudCheck,
  Trash2,
  LogOut,
} from 'lucide-react';
import { SchoolTenant } from '../data/tenantPresets';

interface SchoolTenantPortalModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTenant: SchoolTenant;
  tenants: SchoolTenant[];
  onSelectTenant: (tenant: SchoolTenant) => void;
  onDeleteTenant?: (tenant: SchoolTenant) => void;
  onRegisterSchool: (data: {
    namaSekolah: string;
    npsn: string;
    jenjang: 'TK/PAUD' | 'SD' | 'SMP/MTs' | 'SMA/SMK' | string;
    kabKota: string;
    provinsi: string;
    email: string;
    password?: string;
    templateType: 'full' | 'blank';
  }) => Promise<void>;
  cloudDatabaseId: string;
  onLogout?: () => void;
}

export const SchoolTenantPortalModal: React.FC<SchoolTenantPortalModalProps> = ({
  isOpen,
  onClose,
  currentTenant,
  tenants,
  onSelectTenant,
  onDeleteTenant,
  onRegisterSchool,
  cloudDatabaseId,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<'switch' | 'register' | 'architecture'>('switch');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Register Form State
  const [namaSekolah, setNamaSekolah] = useState('');
  const [npsn, setNpsn] = useState('');
  const [jenjang, setJenjang] = useState<'TK/PAUD' | 'SD' | 'SMP/MTs' | 'SMA/SMK' | string>('TK/PAUD');
  const [kabKota, setKabKota] = useState('');
  const [provinsi, setProvinsi] = useState('Prov. Aceh');
  const [email, setEmail] = useState('');
  const [templateType, setTemplateType] = useState<'full' | 'blank'>('full');

  // Demo visibility filter state - default to TRUE (clean production)
  const [hideDemo, setHideDemo] = useState<boolean>(() => {
    try {
      const val = localStorage.getItem('LPJ_HIDE_DEMO_DATA');
      if (val === 'false') return false;
      return true; // Default hide demo
    } catch {
      return true;
    }
  });

  const handleToggleHideDemo = (val: boolean) => {
    setHideDemo(val);
    try {
      localStorage.setItem('LPJ_HIDE_DEMO_DATA', val ? 'true' : 'false');
    } catch {}
    // Reload list
    window.location.reload();
  };

  if (!isOpen) return null;

  const filteredTenants = tenants.filter((t) => {
    if (hideDemo && t.isDemo) return false;
    return (
      t.namaSekolah.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.npsn.includes(searchQuery) ||
      t.kabKota.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!namaSekolah.trim()) {
      setErrorMsg('Nama sekolah wajib diisi.');
      return;
    }
    if (!npsn.trim() || npsn.trim().length < 8) {
      setErrorMsg('NPSN minimal 8 digit angka.');
      return;
    }
    if (!kabKota.trim()) {
      setErrorMsg('Kabupaten/Kota wajib diisi.');
      return;
    }

    try {
      setIsSubmitting(true);
      await onRegisterSchool({
        namaSekolah,
        npsn,
        jenjang,
        kabKota,
        provinsi,
        email: email || `${npsn}@sekolah.id`,
        templateType,
      });
      setIsSubmitting(false);
      onClose();
    } catch (err: any) {
      setIsSubmitting(false);
      setErrorMsg(err.message || 'Gagal mendaftarkan sekolah baru.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header Bar */}
        <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white p-5 flex items-start justify-between border-b border-blue-900/50">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30 text-white">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold">Portal Database Multi-Sekolah</h2>
                <span className="text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Cloud Firestore Aktif
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Arsitektur Terisolasi: Setiap sekolah memiliki ruang penyimpanan mandiri tanpa tercampur
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Active School Badge */}
        <div className="bg-blue-50 border-b border-blue-100 px-5 py-2.5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-slate-700">
            <span className="text-slate-500 font-medium">Sekolah Sedang Aktif:</span>
            <span className="font-bold text-blue-900 flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-blue-600" />
              {currentTenant.namaSekolah}
            </span>
            <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[11px] font-mono">
              NPSN: {currentTenant.npsn}
            </span>
          </div>
          <div className="text-slate-500 text-[11px] hidden sm:block">
            Wilayah: {currentTenant.kabKota}
          </div>
        </div>

        {/* Tabs Bar */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-5 pt-3 gap-2">
          <button
            onClick={() => setActiveTab('switch')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition border-b-2 flex items-center gap-2 ${
              activeTab === 'switch'
                ? 'bg-white border-blue-600 text-blue-600 shadow-sm'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <School className="w-4 h-4" />
            Pilih Database Sekolah ({tenants.length})
          </button>
          <button
            onClick={() => setActiveTab('register')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition border-b-2 flex items-center gap-2 ${
              activeTab === 'register'
                ? 'bg-white border-blue-600 text-blue-600 shadow-sm'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <PlusCircle className="w-4 h-4" />
            Daftarkan Sekolah Baru
          </button>
          <button
            onClick={() => setActiveTab('architecture')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition border-b-2 flex items-center gap-2 ${
              activeTab === 'architecture'
                ? 'bg-white border-blue-600 text-blue-600 shadow-sm'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Struktur Keamanan & Isolasi
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex-1 bg-slate-50/50">
          
          {/* TAB 1: SWITCH TENANT */}
          {activeTab === 'switch' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Cari nama sekolah, NPSN, atau kota..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
                <button
                  onClick={() => setActiveTab('register')}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3.5 py-2 rounded-lg font-medium flex items-center gap-1.5 shadow-sm transition whitespace-nowrap cursor-pointer"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  Tambah Sekolah
                </button>
              </div>

              {/* Mode Publish & Demo Filter Bar */}
              <div className="bg-slate-100/80 border border-slate-200 rounded-lg px-3 py-2 flex items-center justify-between text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-700">Filter Data Mode:</span>
                  <span className="text-[11px] text-slate-500">
                    {hideDemo ? 'Mode Live (Data Contoh/Demo Disembunyikan)' : 'Mode Pengembangan (Data Contoh Ditampilkan)'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleHideDemo(!hideDemo)}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold border transition cursor-pointer ${
                    hideDemo
                      ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {hideDemo ? '✓ Demo Disembunyikan (Aktifkan Demo)' : 'Sembunyikan Data Demo'}
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {filteredTenants.map((tenant) => {
                  const isActive = tenant.id === currentTenant.id;
                  return (
                    <div
                      key={tenant.id}
                      className={`p-4 rounded-xl border transition-all ${
                        isActive
                          ? 'bg-blue-50/90 border-blue-400 shadow-sm ring-1 ring-blue-400/40'
                          : 'bg-white border-slate-200 hover:border-blue-300 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div
                            className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm ${
                              isActive
                                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            <Building2 className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-bold text-sm text-slate-900">
                                {tenant.namaSekolah}
                              </h3>
                              <span className="text-[10px] font-semibold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                                {tenant.jenjang}
                              </span>
                              {tenant.isDemo && (
                                <span className="text-[10px] font-medium bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200">
                                  Contoh Resmi
                                </span>
                              )}
                              {isActive && (
                                <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  Database Aktif
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap">
                              <span>NPSN: <b className="font-mono text-slate-700">{tenant.npsn}</b></span>
                              <span>•</span>
                              <span>{tenant.kabKota}, {tenant.provinsi}</span>
                            </div>
                            <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1 font-mono">
                              <Lock className="w-3 h-3 text-emerald-600" />
                              ID Koleksi Cloud: <span className="text-slate-600">schools/{tenant.id}/lpj_data</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {isActive ? (
                            <button
                              disabled
                              className="text-xs bg-emerald-600 text-white font-medium px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 opacity-90 cursor-default"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Sedang Digunakan
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                onSelectTenant(tenant);
                                onClose();
                              }}
                              className="text-xs bg-slate-900 hover:bg-blue-600 text-white font-medium px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                            >
                              Masuk Database Ini
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {onDeleteTenant && (
                            <button
                              onClick={() => onDeleteTenant(tenant)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-lg transition cursor-pointer"
                              title={`Hapus database ${tenant.namaSekolah}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {filteredTenants.length === 0 && (
                <div className="text-center py-8 bg-white rounded-xl border border-slate-200">
                  <p className="text-xs text-slate-500">Tidak ada sekolah yang cocok dengan pencarian.</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: REGISTER NEW SCHOOL */}
          {activeTab === 'register' && (
            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 text-xs text-blue-800 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Pembuatan Ruang Database Sekolah Baru</p>
                  <p className="text-blue-700 mt-0.5">
                    Ketika Anda mendaftarkan sekolah baru, sistem secara otomatis membuat koleksi dokumen tersendiri di Google Cloud Firestore. Data tidak akan terlihat atau bercampur dengan sekolah lain.
                  </p>
                </div>
              </div>

              {errorMsg && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3 rounded-lg">
                  {errorMsg}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nama Satuan Pendidikan / Sekolah *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: SMP NEGERI 5 LHOKSEUMAWE"
                    value={namaSekolah}
                    onChange={(e) => setNamaSekolah(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none uppercase"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nomor Pokok Sekolah Nasional (NPSN) *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={8}
                    placeholder="Contoh: 10108899"
                    value={npsn}
                    onChange={(e) => setNpsn(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Jenjang Satuan Pendidikan *
                  </label>
                  <select
                    value={jenjang}
                    onChange={(e: any) => setJenjang(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="TK/PAUD">TK/PAUD</option>
                    <option value="SD">SD</option>
                    <option value="SMP/MTs">SMP/MTs</option>
                    <option value="SMA/SMK">SMA/SMK</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Kabupaten / Kota *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Kota Lhokseumawe"
                    value={kabKota}
                    onChange={(e) => setKabKota(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Provinsi *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Prov. Aceh"
                    value={provinsi}
                    onChange={(e) => setProvinsi(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Email Resmi Sekolah / Penanggung Jawab LPJ
                  </label>
                  <input
                    type="email"
                    placeholder="Contoh: smpn5lhokseumawe@sekolah.id"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Template Awal LPJ
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label
                      className={`p-3 rounded-lg border cursor-pointer flex items-start gap-2.5 transition ${
                        templateType === 'full'
                          ? 'border-blue-500 bg-blue-50/70 ring-1 ring-blue-500'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="templateType"
                        checked={templateType === 'full'}
                        onChange={() => setTemplateType('full')}
                        className="mt-0.5 text-blue-600"
                      />
                      <div>
                        <p className="text-xs font-bold text-slate-900">
                          Template Revitalisasi Standar (Rekomendasi)
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Telah dilengkapi struktur RPD, contoh uraian kwitansi, dan master panitia siap edit.
                        </p>
                      </div>
                    </label>

                    <label
                      className={`p-3 rounded-lg border cursor-pointer flex items-start gap-2.5 transition ${
                        templateType === 'blank'
                          ? 'border-blue-500 bg-blue-50/70 ring-1 ring-blue-500'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="templateType"
                        checked={templateType === 'blank'}
                        onChange={() => setTemplateType('blank')}
                        className="mt-0.5 text-blue-600"
                      />
                      <div>
                        <p className="text-xs font-bold text-slate-900">
                          Format Bersih Kosong
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Mulai dari nol (tanpa daftar barang/kwitansi bawaan).
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setActiveTab('switch')}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 bg-slate-100 rounded-lg hover:bg-slate-200 transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-md transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>Menyiapkan Ruang Cloud Database...</>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      Buat Database Sekolah Baru
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: ARCHITECTURE & SECURITY */}
          {activeTab === 'architecture' && (
            <div className="space-y-4">
              <div className="bg-white p-4 rounded-xl border border-slate-200">
                <h3 className="font-bold text-sm text-slate-900 mb-2 flex items-center gap-2">
                  <Server className="w-4 h-4 text-blue-600" />
                  Bagaimana Data Antar-Sekolah Dipisahkan Secara Aman (Opsi A)
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Aplikasi ini mengimplementasikan konsep <b>Multi-Tenancy Data Isolation</b> berbasis <b>Google Cloud Firestore</b>. Setiap sekolah diperlakukan sebagai satu entitas penyewa (*Tenant*) mandiri dengan jalur penyimpanan (*Path Hierarchy*) tersendiri:
                </p>

                {/* Visual Tree */}
                <div className="mt-4 bg-slate-900 text-slate-200 p-4 rounded-xl font-mono text-xs overflow-x-auto">
                  <div className="text-emerald-400 font-bold mb-2">// Cloud Firestore: {cloudDatabaseId}</div>
                  <div className="text-slate-400">root/</div>
                  <div className="pl-4 text-blue-400">├── schools/</div>
                  <div className="pl-8 text-amber-300">├── sch_10105685/ (SDN 1 Muara Dua)</div>
                  <div className="pl-12 text-slate-300">└── lpj_data/current <span className="text-emerald-400">→ [BKU, BKT, Kwitansi, RPD, Upah SDN 1]</span></div>
                  <div className="pl-8 text-amber-300">├── sch_10101234/ (SMPN 2 Banda Aceh)</div>
                  <div className="pl-12 text-slate-300">└── lpj_data/current <span className="text-emerald-400">→ [BKU, BKT, Kwitansi, RPD, Upah SMPN 2]</span></div>
                  <div className="pl-8 text-purple-300">└── sch_&lt;NPSN_ANDA&gt;/ (Sekolah Baru)</div>
                  <div className="pl-12 text-slate-300">└── lpj_data/current <span className="text-emerald-400">→ [Database Terisolasi Milik Sekolah Anda]</span></div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <h4 className="font-bold text-xs text-slate-800">1. Data Tidak Tercampur</h4>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Setiap mutasi kas, kwitansi, atau perubahan panitia hanya disimpan di bawah ID sekolah yang sedang aktif.
                  </p>
                </div>

                <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-2">
                    <Database className="w-4 h-4" />
                  </div>
                  <h4 className="font-bold text-xs text-slate-800">2. Penyimpanan Cloud Real-Time</h4>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Setiap ketikan data otomatis tersinkronisasi ke Google Cloud Firestore tanpa perlu klik simpan manual.
                  </p>
                </div>

                <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center mb-2">
                    <Layers className="w-4 h-4" />
                  </div>
                  <h4 className="font-bold text-xs text-slate-800">3. Mudah Ganti Sekolah</h4>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Pengawas Dinas atau staf yayasan dapat berpindah profil sekolah kapan saja secara instan untuk verifikasi.
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="bg-slate-100 border-t border-slate-200 px-5 py-3 flex items-center justify-between text-xs text-slate-500 flex-wrap gap-2">
          <div className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-emerald-600" />
            <span>Multi-Tenant Data Encryption & Firestore Rules Enforced</span>
          </div>
          <div className="flex items-center gap-2">
            {onLogout && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onLogout();
                }}
                className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer"
                title="Keluar dari sekolah saat ini dan kembali ke Portal Login"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-600" />
                <span>Keluar ke Portal Login</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-medium transition cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
