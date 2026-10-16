import React, { useState } from 'react';
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
} from 'lucide-react';
import { SchoolTenant } from '../data/tenantPresets';
import { GoogleUserProfile } from '../services/googleAuthService';

interface LoginPortalProps {
  tenants: SchoolTenant[];
  currentTenant: SchoolTenant;
  onSelectTenant: (tenant: SchoolTenant) => void;
  onOpenCreateSchool: () => void;
  onGoogleSignIn: () => Promise<void>;
  isSigningInGoogle: boolean;
  currentUser: GoogleUserProfile | null;
  onProceedToDashboard: () => void;
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
  const [selectedTenantId, setSelectedTenantId] = useState<string>(currentTenant.id);

  const handleSelectAndEnter = (tenant: SchoolTenant) => {
    setSelectedTenantId(tenant.id);
    onSelectTenant(tenant);
    onProceedToDashboard();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-blue-600 selection:text-white">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl"></div>
        <div className="absolute top-1/3 -right-40 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl"></div>
      </div>

      {/* Top Brand Bar */}
      <header className="relative z-10 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                <span>LPJ REVITALISASI SEKOLAH</span>
                <span className="text-[10px] bg-blue-500/20 text-blue-300 font-mono px-2 py-0.5 rounded border border-blue-400/30">
                  Cloud Portal
                </span>
              </h1>
              <p className="text-[11px] text-slate-400">
                Sistem Pertanggungjawaban Bantuan Pemerintah Revitalisasi Satuan Pendidikan
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-[11px] text-emerald-300 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Sistem Siap Operasi</span>
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-5xl mx-auto px-4 py-8 sm:py-12 w-full">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-300 border border-blue-500/20 mb-3">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
            <span>Multi-Tenant & Google Drive Dedicated Database</span>
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Selamat Datang di Portal LPJ Revit
          </h2>
          <p className="text-sm text-slate-400 mt-2">
            Pilih ruang kerja sekolah Anda atau masuk dengan akun Google untuk sinkronisasi database Google Spreadsheet secara permanen tanpa terputus.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Kolom Kiri: Akun Google & Status Koneksi */}
          <div className="lg:col-span-5 bg-slate-900/80 backdrop-blur-md rounded-2xl border border-slate-800 p-6 shadow-xl space-y-6">
            <div>
              <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wider block mb-1">
                Langkah 1 • Autentikasi Cloud
              </span>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span>Koneksi Google Drive (Database)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Setiap sekolah memiliki file database Google Spreadsheet mandiri yang tersinkronisasi otomatis ke Google Drive Anda.
              </p>
            </div>

            {currentUser ? (
              <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-3">
                  {currentUser.photoURL ? (
                    <img
                      src={currentUser.photoURL}
                      alt={currentUser.displayName || 'User'}
                      className="w-10 h-10 rounded-full border border-emerald-400/50"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold text-sm">
                      {(currentUser.displayName || currentUser.email || 'U')[0].toUpperCase()}
                    </div>
                  )}
                  <div className="overflow-hidden">
                    <p className="text-xs font-bold text-white truncate">
                      {currentUser.displayName || 'Akun Google Terhubung'}
                    </p>
                    <p className="text-[11px] text-emerald-300 font-mono truncate">
                      {currentUser.email}
                    </p>
                  </div>
                </div>

                <div className="pt-2 border-t border-emerald-800/40 flex items-center justify-between text-[11px] text-emerald-300">
                  <span className="flex items-center gap-1.5 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Tersambung Permanen (Auto-Restore)</span>
                  </span>
                  <span className="text-[10px] text-slate-400">Aktif</span>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
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
                  <span>{isSigningInGoogle ? 'Menghubungkan...' : 'Masuk dengan Akun Google'}</span>
                </button>
                <p className="text-[11px] text-slate-500 text-center">
                  Menghubungkan akun Google Drive pribadi Anda untuk penyimpanan aman tak terbatas.
                </p>
              </div>
            )}

            {/* Keunggulan mode permanen */}
            <div className="bg-slate-950/60 rounded-xl p-3.5 border border-slate-800 text-xs space-y-2">
              <span className="font-semibold text-slate-300 block text-[11px]">Keamanan & Fitur Otomatis:</span>
              <ul className="space-y-1.5 text-slate-400 text-[11px]">
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Sesi login tersimpan aman (tidak lepas saat refresh).</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Masing-masing sekolah otomatis dibuatkan Google Spreadsheet terpisah.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>Pencadangan ganda: Cloud Firestore & Google Drive.</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Kolom Kanan: Pemilihan Ruang Kerja Sekolah */}
          <div className="lg:col-span-7 bg-slate-900/80 backdrop-blur-md rounded-2xl border border-slate-800 p-6 shadow-xl space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider block mb-1">
                  Langkah 2 • Ruang Kerja Sekolah
                </span>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <School className="w-4 h-4 text-indigo-400" />
                  <span>Pilih Sekolah yang Dikelola</span>
                </h3>
              </div>

              <button
                type="button"
                onClick={onOpenCreateSchool}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs transition cursor-pointer"
              >
                <span>+ Daftarkan Sekolah Baru</span>
              </button>
            </div>

            {/* List Ruang Kerja Sekolah Terdaftar */}
            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
              {tenants.map((tenant) => {
                const isSelected = tenant.id === selectedTenantId;
                const sheetInfoRaw = localStorage.getItem(`GOOGLE_SHEET_INFO_${tenant.id}`);
                const hasSheet = !!sheetInfoRaw;

                return (
                  <div
                    key={tenant.id}
                    onClick={() => setSelectedTenantId(tenant.id)}
                    className={`p-4 rounded-xl border transition cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-blue-950/40 border-blue-500/80 shadow-md shadow-blue-500/10'
                        : 'bg-slate-950/40 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60'
                    }`}
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm shrink-0 ${
                          isSelected
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div className="overflow-hidden">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-xs sm:text-sm font-bold text-white truncate">
                            {tenant.namaSekolah}
                          </h4>
                          {tenant.isDemo && (
                            <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded font-medium">
                              Template
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400 flex-wrap mt-0.5">
                          <span>NPSN: {tenant.npsn || '-'}</span>
                          <span>•</span>
                          <span>{tenant.kabKota || 'Indonesia'}</span>
                          <span>•</span>
                          <span className="font-mono text-emerald-400 font-semibold">
                            {tenant.jenjang || 'Satuan Pendidikan'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      {hasSheet && (
                        <span
                          className="hidden sm:inline-flex items-center gap-1 text-[10px] bg-emerald-950/60 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded font-mono"
                          title="Sudah memiliki file spreadsheet Google Drive mandiri"
                        >
                          <FileSpreadsheet className="w-3 h-3 text-emerald-400" />
                          <span>GDrive Ready</span>
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectAndEnter(tenant);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                          isSelected
                            ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-xs'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                        }`}
                      >
                        <span>Buka</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Tombol Masuk Workspace Utama */}
            <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Sekolah Aktif:{' '}
                <strong className="text-white">
                  {tenants.find((t) => t.id === selectedTenantId)?.namaSekolah || currentTenant.namaSekolah}
                </strong>
              </span>

              <button
                type="button"
                onClick={() => {
                  const target = tenants.find((t) => t.id === selectedTenantId) || currentTenant;
                  handleSelectAndEnter(target);
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-blue-500/20 transition cursor-pointer"
              >
                <span>Masuk ke Dashboard LPJ</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
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
