import React, { useState, useEffect } from 'react';
import {
  Building2,
  FileSpreadsheet,
  Lock,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Database,
  Cloud,
  School,
  Sparkles,
  HelpCircle,
  ExternalLink,
  KeyRound,
  UserCheck,
  Eye,
  EyeOff,
  AlertCircle,
  Users,
  Search,
  Check,
  Info,
} from 'lucide-react';
import { SchoolTenant } from '../data/tenantPresets';
import { GoogleUserProfile } from '../services/googleAuthService';
import {
  USER_ROLES,
  UserRole,
  verifySchoolPin,
  getSchoolPin,
  setLocalUserSession,
  LocalUserSession,
} from '../utils/authHelper';

interface LoginPortalProps {
  tenants: SchoolTenant[];
  currentTenant: SchoolTenant;
  onSelectTenant: (tenant: SchoolTenant) => void;
  onOpenCreateSchool: () => void;
  onGoogleSignIn: () => Promise<void>;
  isSigningInGoogle: boolean;
  currentUser: GoogleUserProfile | null;
  onProceedToDashboard: (sessionData?: LocalUserSession) => void;
}

export const LoginPortal: React.FC<LoginPortalProps> = ({
  tenants,
  currentTenant,
  onSelectTenant,
  onOpenCreateSchool,
  onGoogleSignIn,
  isSigningInGoogle,
  currentUser,
  onProceedToDashboard,
}) => {
  // Dual Login Mode: 'mandiri' (PIN & Role) vs 'google' (Google OAuth)
  const [authTab, setAuthTab] = useState<'mandiri' | 'google'>('mandiri');

  // School selection
  const [selectedTenantId, setSelectedTenantId] = useState<string>(currentTenant.id);
  const [schoolSearchQuery, setSchoolSearchQuery] = useState('');

  // Mode Mandiri States
  const [selectedRole, setSelectedRole] = useState<UserRole>('BENDAHARA');
  const [officerName, setOfficerName] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  const selectedTenant = tenants.find((t) => t.id === selectedTenantId) || currentTenant;

  // Filtered tenants list
  const filteredTenants = tenants.filter((t) => {
    if (!schoolSearchQuery.trim()) return true;
    const q = schoolSearchQuery.toLowerCase();
    return (
      t.namaSekolah.toLowerCase().includes(q) ||
      (t.npsn && t.npsn.includes(q)) ||
      (t.kabKota && t.kabKota.toLowerCase().includes(q))
    );
  });

  // Handle Login Mandiri with PIN validation
  const handleLoginMandiri = (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);

    // Verify PIN against stored/preset or universal fallback
    const verification = verifySchoolPin(
      selectedTenant.id,
      pinInput,
      selectedTenant.npsn,
      selectedTenant.pin
    );

    if (!verification.isValid) {
      setPinError(verification.reason || 'PIN tidak valid. Gunakan PIN default 123456');
      return;
    }

    // Role label
    const roleObj = USER_ROLES.find((r) => r.id === selectedRole);
    const finalOfficerName = officerName.trim() || roleObj?.title || 'Petugas Sekolah';

    // Save session
    const session: LocalUserSession = {
      authMode: 'mandiri',
      role: selectedRole,
      roleLabel: roleObj?.title || 'Bendahara Revitalisasi',
      officerName: finalOfficerName,
      schoolId: selectedTenant.id,
      schoolName: selectedTenant.namaSekolah,
      loginAt: new Date().toISOString(),
    };

    setLocalUserSession(session);
    onSelectTenant(selectedTenant);
    onProceedToDashboard(session);
  };

  // Quick fill default PIN
  const handleUseDefaultPin = () => {
    setPinInput('123456');
    setPinError(null);
  };

  // Quick select and proceed from Google tab
  const handleProceedGoogle = () => {
    const session: LocalUserSession = {
      authMode: 'google',
      role: 'BENDAHARA',
      roleLabel: 'Akun Google Terverifikasi',
      officerName: currentUser?.displayName || currentUser?.email || 'Pengguna Google',
      schoolId: selectedTenant.id,
      schoolName: selectedTenant.namaSekolah,
      loginAt: new Date().toISOString(),
    };

    setLocalUserSession(session);
    onSelectTenant(selectedTenant);
    onProceedToDashboard(session);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-blue-600 selection:text-white">
      {/* Background ambient lighting */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 -right-40 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl"></div>
      </div>

      {/* Top Header Brand */}
      <header className="relative z-10 border-b border-slate-800/80 bg-slate-900/70 backdrop-blur-md px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span>LPJ REVITALISASI SATUAN PENDIDIKAN</span>
                <span className="text-[10px] bg-blue-500/20 text-blue-300 font-mono px-2 py-0.5 rounded border border-blue-400/30">
                  Dual-Auth Portal
                </span>
              </h1>
              <p className="text-[11px] text-slate-400">
                Sistem BKU, BKT, BKB, Pajak, Kwitansi, SPB, Bon Toko & Progres Mingguan Standar Kemendikbudristek
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-[11px] text-emerald-300 font-medium shadow-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Sistem Siap Operasi</span>
            </span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="relative z-10 max-w-5xl mx-auto px-4 py-8 w-full">
        {/* Title & Dual-Login Switcher */}
        <div className="text-center max-w-2xl mx-auto mb-8">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-300 border border-blue-500/20 mb-3">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
            <span>Dual Login System • Fleksibel & Bebas Gangguan Akses</span>
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Masuk ke Ruang Kerja LPJ Sekolah
          </h2>
          <p className="text-sm text-slate-400 mt-2">
            Pilih metode login yang paling sesuai untuk Anda. Gunakan <strong>Login Mandiri / PIN</strong> agar langsung bekerja tanpa hambatan otorisasi, atau <strong>Google Login</strong> untuk sinkronisasi Google Sheets.
          </p>

          {/* Dual Login Tabs */}
          <div className="mt-6 inline-flex p-1 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl">
            <button
              type="button"
              onClick={() => setAuthTab('mandiri')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                authTab === 'mandiri'
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <KeyRound className="w-4 h-4 text-amber-300" />
              <span>Login Mandiri / PIN Sekolah</span>
              <span className="text-[10px] bg-amber-400/20 text-amber-300 px-1.5 py-0.5 rounded font-mono font-medium">
                Rekomendasi
              </span>
            </button>

            <button
              type="button"
              onClick={() => setAuthTab('google')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                authTab === 'google'
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-300" />
              <span>Login dengan Google</span>
              {currentUser && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              )}
            </button>
          </div>
        </div>

        {/* Tab 1: Login Mandiri / PIN Sekolah (Paling Handal & Rekomendasi) */}
        {authTab === 'mandiri' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-in fade-in duration-300">
            {/* Step 1: Pilih Ruang Kerja Sekolah (5 cols) */}
            <div className="lg:col-span-5 bg-slate-900/80 backdrop-blur-md rounded-2xl border border-slate-800 p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wider block">
                    Langkah 1
                  </span>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2 mt-0.5">
                    <School className="w-4 h-4 text-blue-400" />
                    <span>Pilih Sekolah Anda</span>
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={onOpenCreateSchool}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 px-2.5 py-1 rounded-lg border border-blue-500/20 transition cursor-pointer"
                >
                  <span>+ Sekolah Baru</span>
                </button>
              </div>

              {/* Search filter */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari nama sekolah / NPSN / Kota..."
                  value={schoolSearchQuery}
                  onChange={(e) => setSchoolSearchQuery(e.target.value)}
                  className="w-full bg-slate-950/70 border border-slate-800 focus:border-blue-500 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 outline-none transition"
                />
              </div>

              {/* School Cards List */}
              <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                {filteredTenants.length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-slate-800 text-center text-xs text-slate-400">
                    Sekolah tidak ditemukan.
                  </div>
                ) : (
                  filteredTenants.map((t) => {
                    const isSelected = t.id === selectedTenantId;
                    return (
                      <div
                        key={t.id}
                        onClick={() => {
                          setSelectedTenantId(t.id);
                          onSelectTenant(t);
                          setPinError(null);
                        }}
                        className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between gap-3 ${
                          isSelected
                            ? 'bg-blue-950/50 border-blue-500 shadow-md shadow-blue-500/10'
                            : 'bg-slate-950/40 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/60'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 overflow-hidden">
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                              isSelected
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            <Building2 className="w-4 h-4" />
                          </div>
                          <div className="overflow-hidden">
                            <h4 className="text-xs font-bold text-white truncate">
                              {t.namaSekolah}
                            </h4>
                            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 flex-wrap mt-0.5">
                              <span className="font-mono text-blue-300">NPSN: {t.npsn || '-'}</span>
                              <span>•</span>
                              <span>{t.kabKota || 'Indonesia'}</span>
                            </div>
                          </div>
                        </div>

                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
                            <Check className="w-3 h-3 stroke-[3]" />
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                <span>Total Sekolah Terdaftar:</span>
                <span className="font-mono font-bold text-white">{tenants.length} Unit</span>
              </div>
            </div>

            {/* Step 2 & 3: Peran, PIN & Masuk Ruang Kerja (7 cols) */}
            <div className="lg:col-span-7 bg-slate-900/80 backdrop-blur-md rounded-2xl border border-slate-800 p-6 shadow-xl space-y-6">
              <div>
                <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider block">
                  Langkah 2 • Otorisasi Petugas
                </span>
                <h3 className="text-base font-bold text-white flex items-center gap-2 mt-0.5">
                  <UserCheck className="w-4 h-4 text-indigo-400" />
                  <span>Identitas & PIN Keamanan Ruang Kerja</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Sekolah aktif terpilih:{' '}
                  <strong className="text-blue-300">{selectedTenant.namaSekolah}</strong>
                </p>
              </div>

              <form onSubmit={handleLoginMandiri} className="space-y-5">
                {/* Pilihan Peran */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-300">
                    Pilih Peran Jabatan Anda:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {USER_ROLES.map((role) => {
                      const isSelected = selectedRole === role.id;
                      return (
                        <button
                          key={role.id}
                          type="button"
                          onClick={() => setSelectedRole(role.id)}
                          className={`p-3 rounded-xl border text-left transition flex items-start gap-2.5 cursor-pointer ${
                            isSelected
                              ? 'bg-indigo-950/60 border-indigo-500 shadow-md shadow-indigo-500/10'
                              : 'bg-slate-950/40 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <span className="text-xl shrink-0">{role.icon}</span>
                          <div className="overflow-hidden">
                            <span className="text-xs font-bold text-white block">
                              {role.title}
                            </span>
                            <span className="text-[10px] text-slate-400 line-clamp-1 block mt-0.5">
                              {role.desc}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Input Nama Petugas */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-300">
                    Nama Petugas (Opsional):
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Budi Santoso, S.Pd (atau kosongkan)"
                    value={officerName}
                    onChange={(e) => setOfficerName(e.target.value)}
                    className="w-full bg-slate-950/70 border border-slate-800 focus:border-indigo-500 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 outline-none transition"
                  />
                </div>

                {/* Input PIN Keamanan Sekolah */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-amber-400" />
                      <span>PIN Keamanan Sekolah:</span>
                    </label>
                    {getSchoolPin(selectedTenant.id, selectedTenant.npsn, selectedTenant.pin) === '123456' ? (
                      <button
                        type="button"
                        onClick={handleUseDefaultPin}
                        className="text-[11px] text-amber-400 hover:text-amber-300 underline font-medium cursor-pointer"
                      >
                        Pakai PIN Bawaan (123456)
                      </button>
                    ) : (
                      <span className="text-[10px] bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 px-2 py-0.5 rounded font-mono">
                        PIN Kustom Aktif
                      </span>
                    )}
                  </div>

                  <div className="relative">
                    <input
                      type={showPin ? 'text' : 'password'}
                      placeholder={
                        getSchoolPin(selectedTenant.id, selectedTenant.npsn, selectedTenant.pin) !== '123456'
                          ? 'Masukkan PIN baru yang telah disimpan...'
                          : 'Masukkan PIN (Default: 123456)'
                      }
                      value={pinInput}
                      onChange={(e) => {
                        setPinInput(e.target.value);
                        setPinError(null);
                      }}
                      className={`w-full bg-slate-950/70 border rounded-xl pl-4 pr-11 py-2.5 text-xs text-white placeholder-slate-500 outline-none transition font-mono tracking-wider ${
                        pinError ? 'border-rose-500 focus:border-rose-400' : 'border-slate-800 focus:border-indigo-500'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
                    >
                      {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {pinError && (
                    <div className="flex items-center gap-1.5 text-rose-400 text-[11px] mt-1 bg-rose-950/40 p-2 rounded-lg border border-rose-800/40">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{pinError}</span>
                    </div>
                  )}

                  <div className="flex items-start gap-2 bg-slate-950/50 p-2.5 rounded-xl border border-slate-800/80 text-[11px] text-slate-400">
                    <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                    <span>
                      {getSchoolPin(selectedTenant.id, selectedTenant.npsn, selectedTenant.pin) !== '123456' ? (
                        <>Sekolah ini menggunakan PIN kustom yang telah Anda ubah di menu <strong>Data Master Sekolah</strong>. Masukkan PIN baru Anda untuk membuka ruang kerja.</>
                      ) : (
                        <>Untuk awal, Anda dapat langsung menggunakan PIN bawaan <strong>123456</strong> atau 4 digit terakhir NPSN (<strong>{selectedTenant.npsn ? selectedTenant.npsn.slice(-4) : '...'}</strong>). Anda dapat mengubah PIN di Data Master Sekolah.</>
                      )}
                    </span>
                  </div>
                </div>

                {/* Tombol Eksekusi Masuk */}
                <div className="pt-2">
                  <button
                    type="submit"
                    className="w-full py-3.5 px-5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs sm:text-sm shadow-lg shadow-blue-500/25 transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Buka Dashboard LPJ {selectedTenant.namaSekolah}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Tab 2: Login dengan Akun Google (Google Drive & Sheets Sync) */}
        {authTab === 'google' && (
          <div className="max-w-3xl mx-auto bg-slate-900/80 backdrop-blur-md rounded-2xl border border-slate-800 p-6 sm:p-8 shadow-xl space-y-6 animate-in fade-in duration-300">
            <div className="text-center max-w-lg mx-auto">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto mb-3 text-emerald-400">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">
                Koneksi Google Drive & Sinkronisasi Spreadsheet
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Hubungkan akun Google pribadi Anda agar seluruh pembukuan LPJ otomatis tersimpan di Google Drive pribadi Anda dalam format spreadsheet.
              </p>
            </div>

            {/* Google Warning / Origin Mismatch Guidance */}
            <div className="bg-amber-950/30 border border-amber-500/30 rounded-xl p-4 text-xs text-amber-200/90 space-y-2">
              <div className="flex items-center gap-2 font-bold text-amber-300">
                <HelpCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Petunjuk Error Otorisasi (origin_mismatch):</span>
              </div>
              <p className="text-[11px] leading-relaxed text-amber-200/80">
                Jika saat mengklik tombol login di bawah Google menampilkan jendela bertuliskan <em>"Error 400: origin_mismatch"</em>, hal tersebut wajar terjadi karena domain URL publish aplikasi Anda belum didaftarkan di Google Cloud Console.
              </p>
              <div className="pt-2 border-t border-amber-800/40 flex items-center justify-between flex-wrap gap-2 text-[11px]">
                <span className="font-semibold text-white">
                  Ingin langsung bekerja tanpa perlu konfigurasi Google?
                </span>
                <button
                  type="button"
                  onClick={() => setAuthTab('mandiri')}
                  className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/40 rounded-lg font-bold cursor-pointer transition"
                >
                  Gunakan Login Mandiri / PIN ➜
                </button>
              </div>
            </div>

            {/* Google Auth Status Box */}
            {currentUser ? (
              <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    {currentUser.photoURL ? (
                      <img
                        src={currentUser.photoURL}
                        alt={currentUser.displayName || 'User'}
                        className="w-12 h-12 rounded-full border border-emerald-400/50 shadow-md"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-base shadow-md">
                        {(currentUser.displayName || currentUser.email || 'U')[0].toUpperCase()}
                      </div>
                    )}
                    <div>
                      <h4 className="text-sm font-bold text-white">
                        {currentUser.displayName || 'Akun Google Terhubung'}
                      </h4>
                      <p className="text-xs text-emerald-300 font-mono">
                        {currentUser.email}
                      </p>
                    </div>
                  </div>

                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-900/60 text-emerald-300 border border-emerald-500/40 text-xs font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Terverifikasi Google</span>
                  </span>
                </div>

                <div className="pt-3 border-t border-emerald-800/40 flex items-center justify-between flex-wrap gap-3">
                  <div className="text-xs text-slate-300">
                    Sekolah Aktif:{' '}
                    <strong className="text-white">{selectedTenant.namaSekolah}</strong>
                  </div>

                  <button
                    type="button"
                    onClick={handleProceedGoogle}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 transition cursor-pointer"
                  >
                    <span>Lanjut ke Dashboard dengan Akun Ini</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-center max-w-sm mx-auto">
                <button
                  type="button"
                  onClick={onGoogleSignIn}
                  disabled={isSigningInGoogle}
                  className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs rounded-xl shadow-md transition disabled:opacity-50 cursor-pointer"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>{isSigningInGoogle ? 'Menghubungkan ke Google...' : 'Masuk dengan Akun Google'}</span>
                </button>
                <p className="text-[11px] text-slate-500">
                  Akan membuka jendela login Google resmi untuk otorisasi akses Google Drive pribadi.
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800/80 bg-slate-900/60 backdrop-blur-md px-6 py-3 text-center text-xs text-slate-500">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>&copy; 2026 LPJ Revit Cloud • Revitalisasi Satuan Pendidikan</span>
          <span>Google Drive Cloud Database Engine & Offline IndexedDB Safe</span>
        </div>
      </footer>
    </div>
  );
};
