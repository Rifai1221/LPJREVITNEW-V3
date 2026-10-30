import React, { useState, useEffect } from 'react';
import {
  Building2,
  FileSpreadsheet,
  Lock,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  School,
  KeyRound,
  UserCheck,
  Eye,
  EyeOff,
  AlertCircle,
  Search,
  Check,
  Info,
  LogOut,
  Mail,
  UserPlus,
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
  USER_ROLES,
  UserRole,
  verifySchoolPinSecure,
  isSchoolPinConfigured,
  setLocalUserSession,
  LocalUserSession,
} from '../utils/authHelper';
import {
  updateSchoolPinHash,
  upsertSchoolMember,
} from '../services/schoolTenantService';

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
  // Step 1: Firebase Auth User state
  const [firebaseUser, setFirebaseUser] = useState(auth.currentUser);

  // Email/Password states
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  // Step 2: School and Role selection
  const [selectedTenantId, setSelectedTenantId] = useState<string>(currentTenant.id);
  const [schoolSearchQuery, setSchoolSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<UserRole>('BENDAHARA');
  const [officerName, setOfficerName] = useState('');

  // Step 3: PIN Verification & Reset
  const [pinInput, setPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [isPinSubmitting, setIsPinSubmitting] = useState(false);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      setFirebaseUser(user);
    });
    return () => unsub();
  }, []);

  const selectedTenant = tenants.find((t) => t.id === selectedTenantId) || currentTenant;
  const isPinConfigured = isSchoolPinConfigured(selectedTenant);
  const isMandatoryReset = !isPinConfigured || Boolean(selectedTenant.mustResetPin);

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

  // Handle Email/Password Login or Register
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsAuthLoading(true);

    try {
      if (isRegisterMode) {
        await createUserWithEmailAndPassword(auth, authEmail.trim(), authPassword);
      } else {
        await signInWithEmailAndPassword(auth, authEmail.trim(), authPassword);
      }
    } catch (err: any) {
      console.error('Firebase Auth error:', err);
      let msg = err?.message || 'Gagal autentikasi.';
      if (err?.code === 'auth/user-not-found' || err?.code === 'auth/wrong-password' || err?.code === 'auth/invalid-credential') {
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

  // Sign out from primary Firebase Auth
  const handleSignOutPrimary = async () => {
    try {
      await signOut(auth);
      setFirebaseUser(null);
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  // Handle Step 2 & 3: PIN Verification or First-Time Mandatory Reset
  const handleSubmitPinStep = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    setIsPinSubmitting(true);

    try {
      const activeUid = firebaseUser?.uid;
      if (!activeUid) {
        setPinError('Sesi autentikasi utama kadaluwarsa. Silakan masuk kembali.');
        setIsPinSubmitting(false);
        return;
      }

      // Case A: Mandatory PIN creation on first login or missing hash
      if (isMandatoryReset) {
        const cleanPin = pinInput.trim();
        const cleanConfirm = confirmPinInput.trim();

        if (cleanPin.length < 6 || !/^\d{6,}$/.test(cleanPin)) {
          setPinError('PIN baru harus berupa minimal 6 digit angka.');
          setIsPinSubmitting(false);
          return;
        }

        if (cleanPin !== cleanConfirm) {
          setPinError('Konfirmasi PIN tidak cocok. Pastikan kedua PIN sama.');
          setIsPinSubmitting(false);
          return;
        }

        // Store salted PBKDF2/SHA-256 hash in school doc
        await updateSchoolPinHash(selectedTenant.id, cleanPin);
        selectedTenant.mustResetPin = false;
      } else {
        // Case B: Verify against existing salted hash in school doc
        const verification = await verifySchoolPinSecure(pinInput, selectedTenant);
        if (!verification.isValid) {
          setPinError(verification.reason || 'PIN yang dimasukkan salah.');
          setIsPinSubmitting(false);
          return;
        }
      }

      // Step C: Update server-side member document (Zero-Trust RBAC in Firestore)
      const roleObj = USER_ROLES.find((r) => r.id === selectedRole);
      const finalOfficerName = officerName.trim() || roleObj?.title || 'Petugas Sekolah';

      await upsertSchoolMember(selectedTenant.id, {
        uid: activeUid,
        role: selectedRole,
        email: firebaseUser?.email || '',
        displayName: finalOfficerName,
      });

      // Step D: Create session and proceed
      const session: LocalUserSession = {
        authMode: firebaseUser?.providerData?.[0]?.providerId === 'google.com' ? 'google' : 'mandiri',
        role: selectedRole,
        roleLabel: roleObj?.title || 'Bendahara Revitalisasi',
        officerName: finalOfficerName,
        schoolId: selectedTenant.id,
        schoolName: selectedTenant.namaSekolah,
        loginAt: new Date().toISOString(),
        uid: activeUid,
        email: firebaseUser?.email || undefined,
      };

      setLocalUserSession(session);
      onSelectTenant(selectedTenant);
      onProceedToDashboard(session);
    } catch (err: any) {
      console.error('PIN submit error:', err);
      setPinError(`Terjadi kesalahan: ${err?.message || err}`);
    } finally {
      setIsPinSubmitting(false);
    }
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
                  Firebase Auth & RBAC
                </span>
              </h1>
              <p className="text-[11px] text-slate-400">
                Sistem BKU, BKT, BKB, Pajak, Kwitansi, SPB, Bon Toko & Progres Mingguan Terproteksi
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
        {/* Title */}
        <div className="text-center max-w-2xl mx-auto mb-8">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-300 border border-blue-500/20 mb-3">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
            <span>Autentikasi Bertingkat • Identitas Utama & PIN Kriptografis</span>
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Masuk ke Ruang Kerja LPJ Sekolah
          </h2>
          <p className="text-sm text-slate-400 mt-2">
            Login dengan identitas akun resmi Anda, kemudian pilih sekolah dan masukkan PIN keamanan sekolah Anda.
          </p>
        </div>

        {/* STEP 1: If user is not authenticated with Firebase Auth */}
        {!firebaseUser ? (
          <div className="max-w-md mx-auto bg-slate-900/90 backdrop-blur-md rounded-2xl border border-slate-800 p-6 sm:p-8 shadow-2xl space-y-6 animate-in fade-in duration-300">
            <div className="text-center">
              <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wider block">
                Langkah 1 • Identitas Utama
              </span>
              <h3 className="text-lg font-bold text-white mt-1">
                Masuk Akun Petugas
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Gunakan Akun Google resmi atau Email & Password Anda
              </p>
            </div>

            {/* Google Sign In Button */}
            <div>
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
                <span>{isSigningInGoogle ? 'Menghubungkan...' : 'Lanjut dengan Akun Google'}</span>
              </button>
            </div>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-slate-800"></div>
              <span className="flex-shrink mx-4 text-[10px] text-slate-500 uppercase tracking-widest font-semibold">
                Atau Email & Password
              </span>
              <div className="flex-grow border-t border-slate-800"></div>
            </div>

            {/* Email & Password Form */}
            <form onSubmit={handleEmailAuth} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Alamat Email:
                </label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    placeholder="nama@sekolah.id"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className="w-full bg-slate-950/70 border border-slate-800 focus:border-blue-500 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 outline-none transition"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Password:
                </label>
                <div className="relative">
                  <Lock className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    placeholder="Minimal 6 karakter"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    className="w-full bg-slate-950/70 border border-slate-800 focus:border-blue-500 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 outline-none transition"
                  />
                </div>
              </div>

              {authError && (
                <div className="flex items-center gap-1.5 text-rose-400 text-[11px] bg-rose-950/40 p-2.5 rounded-lg border border-rose-800/40">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isAuthLoading}
                className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs shadow-md shadow-blue-600/30 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                {isAuthLoading ? (
                  <span>Memproses...</span>
                ) : isRegisterMode ? (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>Daftarkan Akun Baru</span>
                  </>
                ) : (
                  <>
                    <ArrowRight className="w-4 h-4" />
                    <span>Masuk dengan Email</span>
                  </>
                )}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setIsRegisterMode(!isRegisterMode);
                    setAuthError(null);
                  }}
                  className="text-[11px] text-blue-400 hover:text-blue-300 underline cursor-pointer"
                >
                  {isRegisterMode
                    ? 'Sudah punya akun? Masuk di sini'
                    : 'Belum punya akun? Buat akun baru'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          /* STEP 2 & 3: When authenticated with Firebase Auth */
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Authenticated User Badge */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center font-bold text-blue-300">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white">
                      {firebaseUser.displayName || firebaseUser.email}
                    </span>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-medium px-2 py-0.5 rounded border border-emerald-500/30">
                      Terautentikasi
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono">
                    UID: {firebaseUser.uid} • {firebaseUser.email || 'Google Auth'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleSignOutPrimary}
                className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 px-3 py-1.5 rounded-lg border border-slate-800 transition cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Ganti Akun</span>
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Step 2: Pilih Ruang Kerja Sekolah (5 cols) */}
              <div className="lg:col-span-5 bg-slate-900/80 backdrop-blur-md rounded-2xl border border-slate-800 p-5 shadow-xl space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wider block">
                      Langkah 2
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
                            setPinInput('');
                            setConfirmPinInput('');
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

              {/* Step 3: Peran Petugas & PIN Kriptografis (7 cols) */}
              <div className="lg:col-span-7 bg-slate-900/80 backdrop-blur-md rounded-2xl border border-slate-800 p-6 shadow-xl space-y-6">
                <div>
                  <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider block">
                    Langkah 3 • Verifikasi Ruang Kerja & Peran
                  </span>
                  <h3 className="text-base font-bold text-white flex items-center gap-2 mt-0.5">
                    <UserCheck className="w-4 h-4 text-indigo-400" />
                    <span>Identitas Peran & PIN Keamanan Sekolah</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Sekolah aktif:{' '}
                    <strong className="text-blue-300">{selectedTenant.namaSekolah}</strong>
                  </p>
                </div>

                <form onSubmit={handleSubmitPinStep} className="space-y-5">
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

                  {/* Kondisi A: Wajib Atur PIN Baru pada Login Pertama */}
                  {isMandatoryReset ? (
                    <div className="bg-amber-950/40 border border-amber-500/40 rounded-xl p-4 space-y-3">
                      <div className="flex items-center gap-2 text-amber-300 text-xs font-bold">
                        <KeyRound className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>Kewajiban Pengaturan PIN Baru Sekolah (6 Digit)</span>
                      </div>
                      <p className="text-[11px] text-amber-200/80 leading-relaxed">
                        Demi perlindungan data revitalisasi, sekolah ini belum memiliki PIN terdaftar atau diwajibkan memperbarui PIN. Silakan tentukan 6 digit PIN baru yang akan disimpan terenkripsi (salted hash PBKDF2).
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                            PIN Baru (6 Digit):
                          </label>
                          <input
                            type={showPin ? 'text' : 'password'}
                            maxLength={8}
                            placeholder="6 Digit Angka"
                            value={pinInput}
                            onChange={(e) => {
                              setPinInput(e.target.value);
                              setPinError(null);
                            }}
                            className="w-full bg-slate-950 border border-amber-500/40 focus:border-amber-400 rounded-lg px-3 py-2 text-xs font-mono tracking-widest text-white outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                            Konfirmasi PIN:
                          </label>
                          <input
                            type={showPin ? 'text' : 'password'}
                            maxLength={8}
                            placeholder="Ulangi 6 Digit"
                            value={confirmPinInput}
                            onChange={(e) => {
                              setConfirmPinInput(e.target.value);
                              setPinError(null);
                            }}
                            className="w-full bg-slate-950 border border-amber-500/40 focus:border-amber-400 rounded-lg px-3 py-2 text-xs font-mono tracking-widest text-white outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Kondisi B: Verifikasi PIN yang sudah terdaftar */
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5 text-amber-400" />
                          <span>PIN Keamanan Sekolah (6 Digit):</span>
                        </label>
                        <span className="text-[10px] bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 px-2 py-0.5 rounded font-mono">
                          Salted Hash Aktif
                        </span>
                      </div>

                      <div className="relative">
                        <input
                          type={showPin ? 'text' : 'password'}
                          placeholder="Masukkan PIN keamanan sekolah..."
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
                    </div>
                  )}

                  {pinError && (
                    <div className="flex items-center gap-1.5 text-rose-400 text-[11px] bg-rose-950/40 p-2.5 rounded-lg border border-rose-800/40">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{pinError}</span>
                    </div>
                  )}

                  {/* Tombol Masuk */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={isPinSubmitting}
                      className="w-full py-3.5 px-5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white font-bold text-xs sm:text-sm shadow-lg shadow-blue-500/25 transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {isPinSubmitting ? (
                        <span>Memverifikasi Otorisasi...</span>
                      ) : (
                        <>
                          <span>
                            {isMandatoryReset
                              ? `Simpan PIN & Buka LPJ ${selectedTenant.namaSekolah}`
                              : `Buka Ruang Kerja LPJ ${selectedTenant.namaSekolah}`}
                          </span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800/80 bg-slate-900/60 backdrop-blur-md px-6 py-3 text-center text-xs text-slate-500">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>&copy; 2026 LPJ Revit Cloud • Revitalisasi Satuan Pendidikan</span>
          <span>Zero-Trust Architecture • Firebase Auth & Server-Side RBAC Enforced</span>
        </div>
      </footer>
    </div>
  );
};
