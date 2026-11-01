import React, { useState, useEffect } from 'react';
import {
  Building2,
  Lock,
  ArrowRight,
  School,
  KeyRound,
  UserCheck,
  Search,
  CheckCircle2,
  RefreshCw,
  PlusCircle,
  Sparkles,
  Mail,
  UserPlus,
  LogIn,
  AlertCircle,
  Shield,
} from 'lucide-react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { auth } from '../services/firebase';
import { SchoolTenant } from '../data/tenantPresets';
import { GoogleUserProfile } from '../services/googleAuthService';
import {
  UserMembershipRecord,
  searchSchoolsCallable,
  joinSchoolCallable,
  createSchoolCallable,
  SearchedSchoolItem,
} from '../services/schoolMembershipService';
import { useToast } from '../context/ToastContext';

interface LoginPortalProps {
  memberships: UserMembershipRecord[];
  onSelectTenant: (tenant: SchoolTenant) => void;
  onOpenCreateSchool: () => void;
  onGoogleSignIn: () => Promise<void>;
  isSigningInGoogle: boolean;
  currentUser: GoogleUserProfile | null;
  onProceedToDashboard: (targetTenant?: SchoolTenant) => void;
  onCreateDemoSchool?: () => Promise<void>;
  isCreatingDemo?: boolean;
}

export const LoginPortal: React.FC<LoginPortalProps> = ({
  memberships,
  onSelectTenant,
  onOpenCreateSchool,
  onGoogleSignIn,
  isSigningInGoogle,
  currentUser,
  onProceedToDashboard,
  onCreateDemoSchool,
  isCreatingDemo = false,
}) => {
  const toast = useToast();
  const [firebaseUser, setFirebaseUser] = useState(auth.currentUser);

  // Email/Password state
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  // Zero-membership onboarding state: 'choice' | 'search' | 'create'
  const [onboardView, setOnboardView] = useState<'choice' | 'search' | 'create'>('choice');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchedSchoolItem[]>([]);
  const [selectedTargetSchool, setSelectedTargetSchool] = useState<SearchedSchoolItem | null>(null);
  const [joinPin, setJoinPin] = useState('');
  const [joinRole, setJoinRole] = useState<'KEPALA_SEKOLAH' | 'TIM_TEKNIS' | 'FASILITATOR'>('TIM_TEKNIS');
  const [joinDisplayName, setJoinDisplayName] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  // Create school in onboarding
  const [createNamaSekolah, setCreateNamaSekolah] = useState('');
  const [createNpsn, setCreateNpsn] = useState('');
  const [createJenjang, setCreateJenjang] = useState<'SD' | 'SMP/MTs' | 'SMA/SMK' | string>('SD');
  const [createKabKota, setCreateKabKota] = useState('');
  const [createProvinsi, setCreateProvinsi] = useState('Prov. Aceh');
  const [createPin, setCreatePin] = useState('');
  const [createConfirmPin, setCreateConfirmPin] = useState('');
  const [isCreatingSchool, setIsCreatingSchool] = useState(false);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      setFirebaseUser(user);
    });
    return () => unsub();
  }, []);

  // When logged in and memberships >= 1, automatically proceed to dashboard
  useEffect(() => {
    if (firebaseUser && memberships.length > 0) {
      const topSchool = memberships[0];
      const targetTenant: SchoolTenant = {
        id: topSchool.schoolId,
        namaSekolah: topSchool.namaSekolah,
        npsn: topSchool.npsn,
        jenjang: (topSchool.jenjang || 'SD') as any,
        kabKota: topSchool.kabKota || '-',
        provinsi: '-',
        email: '-',
        isDemo: false,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
      };
      onProceedToDashboard(targetTenant);
    }
  }, [firebaseUser, memberships]);

  // Handle Email Auth
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsAuthLoading(true);

    try {
      if (isRegisterMode) {
        await createUserWithEmailAndPassword(auth, authEmail.trim(), authPassword);
        toast.success('Pendaftaran akun berhasil!');
      } else {
        await signInWithEmailAndPassword(auth, authEmail.trim(), authPassword);
        toast.success('Login berhasil!');
      }
    } catch (err: any) {
      console.error('Firebase Auth error:', err);
      let msg = err?.message || 'Gagal autentikasi.';
      if (err?.code === 'auth/operation-not-allowed') {
        msg = 'Opsi login Email/Password belum diaktifkan di Firebase Console. Gunakan tombol "Masuk Tanpa Login (Akses Instan)" di bawah ini.';
      } else if (
        err?.code === 'auth/user-not-found' ||
        err?.code === 'auth/wrong-password' ||
        err?.code === 'auth/invalid-credential'
      ) {
        msg = 'Email atau password salah. Silakan periksa kembali.';
      } else if (err?.code === 'auth/email-already-in-use') {
        msg = 'Email sudah terdaftar. Silakan masuk menggunakan password Anda.';
      } else if (err?.code === 'auth/weak-password') {
        msg = 'Password terlalu lemah (minimal 6 karakter).';
      } else if (err?.code === 'auth/invalid-email') {
        msg = 'Format alamat email tidak valid.';
      }
      setAuthError(msg);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleGuestDirectAccess = () => {
    toast.success('Masuk sebagai Pengguna Tamu (Akses Instan) berhasil!');
    onProceedToDashboard();
  };

  // Handle Search for Onboarding
  const handleSearchOnboard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || searchQuery.trim().length < 3) {
      toast.warning('Ketik minimal 3 karakter untuk mencari sekolah.');
      return;
    }
    setIsSearching(true);
    try {
      const res = await searchSchoolsCallable(searchQuery.trim());
      setSearchResults(res);
      if (res.length === 0) {
        toast.info('Tidak ada sekolah yang cocok.');
      }
    } catch (err: any) {
      toast.error('Gagal mencari sekolah: ' + (err?.message || err));
    } finally {
      setIsSearching(false);
    }
  };

  // Handle Join in Onboarding
  const handleJoinOnboard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTargetSchool) return;
    if (!joinPin.trim() || joinPin.trim().length < 6) {
      toast.warning('Masukkan PIN sekolah minimal 6 digit.');
      return;
    }

    setIsJoining(true);
    try {
      const joined = await joinSchoolCallable({
        schoolId: selectedTargetSchool.id,
        pin: joinPin.trim(),
        role: joinRole,
        displayName: joinDisplayName.trim() || firebaseUser?.displayName || 'Anggota',
      });

      toast.success(`Berhasil bergabung ke ${joined.namaSekolah}!`);
      onProceedToDashboard({
        id: joined.schoolId,
        namaSekolah: joined.namaSekolah,
        npsn: selectedTargetSchool.npsn,
        jenjang: (selectedTargetSchool.jenjang || 'SD') as any,
        kabKota: selectedTargetSchool.kabKota || '-',
        provinsi: selectedTargetSchool.provinsi || '-',
        email: '-',
        isDemo: false,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
      });
    } catch (err: any) {
      toast.error('Gagal bergabung: ' + (err?.message || 'PIN salah atau akses ditolak.'));
    } finally {
      setIsJoining(false);
    }
  };

  // Handle Create in Onboarding
  const handleCreateOnboard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createNamaSekolah.trim()) {
      toast.warning('Nama sekolah wajib diisi.');
      return;
    }
    if (!createNpsn.trim() || createNpsn.trim().length < 8) {
      toast.warning('NPSN minimal 8 digit angka.');
      return;
    }
    if (createPin.length < 6 || !/^\d{6,}$/.test(createPin)) {
      toast.warning('PIN baru harus berupa angka minimal 6 digit.');
      return;
    }
    if (createPin !== createConfirmPin) {
      toast.warning('Konfirmasi PIN tidak cocok.');
      return;
    }

    setIsCreatingSchool(true);
    try {
      const created = await createSchoolCallable({
        namaSekolah: createNamaSekolah.trim(),
        npsn: createNpsn.trim(),
        jenjang: createJenjang,
        kabKota: createKabKota.trim(),
        provinsi: createProvinsi.trim(),
        pin: createPin.trim(),
      });

      toast.success(`Sekolah ${created.namaSekolah} berhasil dibuat!`);
      onProceedToDashboard({
        id: created.schoolId,
        namaSekolah: created.namaSekolah,
        npsn: created.npsn,
        jenjang: createJenjang as any,
        kabKota: createKabKota.trim(),
        provinsi: createProvinsi.trim(),
        email: '-',
        isDemo: false,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
      });
    } catch (err: any) {
      toast.error('Gagal membuat sekolah: ' + (err?.message || err));
    } finally {
      setIsCreatingSchool(false);
    }
  };

  // Sign out
  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setFirebaseUser(null);
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  // VIEW 2: User is Authenticated, but has 0 memberships (Onboarding Screen)
  if (firebaseUser && memberships.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white p-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center mx-auto mb-3 shadow-inner">
              <School className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-xl font-black tracking-tight">Selamat Datang di LPJ Revit!</h2>
            <p className="text-xs text-blue-100 mt-1">
              Akun: <b className="text-white">{firebaseUser.email || firebaseUser.displayName}</b>
            </p>
          </div>

          <div className="p-6">
            {onboardView === 'choice' && (
              <div className="space-y-4">
                <div className="text-center space-y-1">
                  <h3 className="text-sm font-bold text-slate-800">
                    Anda belum terdaftar di sekolah revitalisasi mana pun.
                  </h3>
                  <p className="text-xs text-slate-500">
                    Pilih salah satu opsi di bawah untuk memulai:
                  </p>
                </div>

                <div className="grid gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setOnboardView('search')}
                    className="p-4 rounded-2xl border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50/50 text-left transition flex items-center justify-between group cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                        <Search className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900 group-hover:text-blue-700">
                          Gabung ke Sekolah yang Sudah Ada
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Masukkan PIN dari Bendahara / Kepala Sekolah
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setOnboardView('create')}
                    className="p-4 rounded-2xl border-2 border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/50 text-left transition flex items-center justify-between group cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                        <PlusCircle className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900 group-hover:text-emerald-700">
                          Daftarkan Sekolah Baru
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Daftarkan sekolah Anda dan mulai pembukuan sebagai Bendahara
                        </p>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 transition" />
                  </button>

                  {onCreateDemoSchool && (
                    <button
                      type="button"
                      disabled={isCreatingDemo}
                      onClick={onCreateDemoSchool}
                      className="p-4 rounded-2xl border border-amber-200 bg-amber-50/60 hover:bg-amber-100/70 text-left transition flex items-center justify-between group cursor-pointer disabled:opacity-50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-200 text-amber-900 flex items-center justify-center font-bold">
                          {isCreatingDemo ? (
                            <RefreshCw className="w-5 h-5 animate-spin text-amber-700" />
                          ) : (
                            <Sparkles className="w-5 h-5 text-amber-700" />
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-amber-950">
                            {isCreatingDemo ? 'Sedang Menyiapkan...' : 'Buat Sekolah Contoh (Template Lengkap)'}
                          </p>
                          <p className="text-[11px] text-amber-800">
                            Langsung coba fitur LPJ dengan data simulasi 100% lengkap
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-amber-600" />
                    </button>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-100 flex justify-center">
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1 cursor-pointer"
                  >
                    <span>Ganti Akun / Logout</span>
                  </button>
                </div>
              </div>
            )}

            {/* Sub-view: Search & Join */}
            {onboardView === 'search' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setOnboardView('choice')}
                    className="text-xs font-bold text-blue-600 hover:underline cursor-pointer"
                  >
                    &larr; Kembali
                  </button>
                  <span className="text-xs font-bold text-slate-700">Gabung Sekolah</span>
                </div>

                <form onSubmit={handleSearchOnboard} className="flex gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Nama sekolah atau NPSN..."
                    className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                  <button
                    type="submit"
                    disabled={isSearching}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                  >
                    {isSearching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    <span>Cari</span>
                  </button>
                </form>

                {searchResults.length > 0 && (
                  <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-40 overflow-y-auto">
                    {searchResults.map((s) => (
                      <div
                        key={s.id}
                        onClick={() => setSelectedTargetSchool(s)}
                        className={`p-2.5 text-xs flex items-center justify-between cursor-pointer transition ${
                          selectedTargetSchool?.id === s.id ? 'bg-blue-50 border-l-4 border-blue-600' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div>
                          <p className="font-bold text-slate-900">{s.namaSekolah}</p>
                          <p className="text-[10px] text-slate-500 font-mono">NPSN: {s.npsn}</p>
                        </div>
                        <span className="text-blue-600 font-semibold text-[11px]">
                          {selectedTargetSchool?.id === s.id ? 'Dipilih' : 'Pilih'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {selectedTargetSchool && (
                  <form onSubmit={handleJoinOnboard} className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2.5">
                    <p className="text-xs font-bold text-slate-800">Sekolah: {selectedTargetSchool.namaSekolah}</p>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Peran Anda:</label>
                      <select
                        value={joinRole}
                        onChange={(e) => setJoinRole(e.target.value as any)}
                        className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="TIM_TEKNIS">Tim Teknis / Pelaksana</option>
                        <option value="KEPALA_SEKOLAH">Kepala Sekolah</option>
                        <option value="FASILITATOR">Fasilitator / Tamu</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">PIN Sekolah (6 digit):</label>
                      <input
                        type="password"
                        required
                        value={joinPin}
                        onChange={(e) => setJoinPin(e.target.value.replace(/\D/g, ''))}
                        placeholder="PIN sekolah..."
                        className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-mono"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isJoining}
                      className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {isJoining ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      <span>Bergabung Sekarang</span>
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* Sub-view: Create */}
            {onboardView === 'create' && (
              <form onSubmit={handleCreateOnboard} className="space-y-3">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setOnboardView('choice')}
                    className="text-xs font-bold text-blue-600 hover:underline cursor-pointer"
                  >
                    &larr; Kembali
                  </button>
                  <span className="text-xs font-bold text-slate-700">Daftarkan Sekolah Baru</span>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Nama Sekolah: *</label>
                  <input
                    type="text"
                    required
                    value={createNamaSekolah}
                    onChange={(e) => setCreateNamaSekolah(e.target.value)}
                    placeholder="SDN 1 MUARA DUA"
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg uppercase"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">NPSN: *</label>
                    <input
                      type="text"
                      required
                      value={createNpsn}
                      onChange={(e) => setCreateNpsn(e.target.value.replace(/\D/g, ''))}
                      placeholder="10105685"
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Kab/Kota: *</label>
                    <input
                      type="text"
                      required
                      value={createKabKota}
                      onChange={(e) => setCreateKabKota(e.target.value)}
                      placeholder="Kota Lhokseumawe"
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">PIN Baru: *</label>
                    <input
                      type="password"
                      required
                      value={createPin}
                      onChange={(e) => setCreatePin(e.target.value.replace(/\D/g, ''))}
                      placeholder="Min 6 angka"
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">Konfirmasi PIN: *</label>
                    <input
                      type="password"
                      required
                      value={createConfirmPin}
                      onChange={(e) => setCreateConfirmPin(e.target.value.replace(/\D/g, ''))}
                      placeholder="Ketik ulang"
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg font-mono"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isCreatingSchool}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                >
                  {isCreatingSchool ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <PlusCircle className="w-3.5 h-3.5" />}
                  <span>Daftarkan & Masuk</span>
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  // VIEW 1: Unauthenticated User (Firebase Auth Login / Register)
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white p-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center mx-auto mb-3 shadow-inner">
            <Building2 className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-xl font-black tracking-tight">LPJ Revitalisasi Sekolah</h2>
          <p className="text-xs text-blue-100 mt-1 font-medium">
            Sistem Multi-Sekolah Terintegrasi • DAK Fisik & Kemendikdasmen RI
          </p>
        </div>

        <div className="p-6 space-y-4">
          {authError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          {/* Instant Guest / Direct Access Button */}
          <button
            type="button"
            onClick={handleGuestDirectAccess}
            className="w-full py-3 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
            <span>⚡ Masuk Tanpa Login (Akses Instan & Langsung)</span>
          </button>

          {/* Google Sign In Button */}
          <button
            type="button"
            onClick={onGoogleSignIn}
            disabled={isSigningInGoogle}
            className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 text-slate-700 border-2 border-slate-200 hover:border-blue-400 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2.5 shadow-xs cursor-pointer disabled:opacity-50"
          >
            {isSigningInGoogle ? (
              <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
            ) : (
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
            )}
            <span>{isSigningInGoogle ? 'Menghubungkan...' : 'Masuk dengan Akun Google'}</span>
          </button>

          <div className="relative flex items-center justify-center">
            <div className="border-t border-slate-200 w-full"></div>
            <span className="bg-white px-3 text-[11px] font-semibold text-slate-400 absolute">
              atau gunakan Email & Password
            </span>
          </div>

          {/* Email / Password Form */}
          <form onSubmit={handleEmailAuth} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Alamat Email:</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="bendahara@sekolah.sch.id"
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Kata Sandi:</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="password"
                  required
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="Minimal 6 karakter"
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isAuthLoading}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
            >
              {isAuthLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : isRegisterMode ? (
                <UserPlus className="w-4 h-4" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              <span>{isAuthLoading ? 'Memproses...' : isRegisterMode ? 'Daftar Akun Baru' : 'Masuk ke Aplikasi'}</span>
            </button>
          </form>

          {/* Toggle Register / Login */}
          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => {
                setIsRegisterMode(!isRegisterMode);
                setAuthError(null);
              }}
              className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
            >
              {isRegisterMode ? 'Sudah punya akun? Masuk di sini' : 'Belum punya akun? Buat akun baru'}
            </button>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] text-slate-600 space-y-1">
            <div className="flex items-center gap-1.5 font-bold text-slate-800">
              <Shield className="w-3.5 h-3.5 text-blue-600" />
              <span>Satu Akun untuk Semua Sekolah</span>
            </div>
            <p>
              Setelah masuk, Anda dapat langsung memilih sekolah binaan atau bergabung ke sekolah baru tanpa harus logout.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
