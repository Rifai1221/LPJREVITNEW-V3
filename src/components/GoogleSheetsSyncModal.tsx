import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Cloud,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Plus,
  LogIn,
  LogOut,
  X,
  FileCheck,
  FolderOpen,
  ArrowDownToLine,
  ArrowUpFromLine,
  ShieldCheck,
  Info,
  Copy,
  Check,
} from 'lucide-react';
import { AppStateData } from '../types';
import { SchoolTenant } from '../data/tenantPresets';
import {
  googleSignIn,
  signInWithGis,
  logoutGoogle,
  getAccessToken,
  getCurrentUser,
  initAuth,
  GoogleUserProfile,
} from '../services/googleAuthService';
import {
  searchSpreadsheetsInDrive,
  createSpreadsheetInDrive,
  syncStateToSpreadsheet,
  loadStateFromSpreadsheet,
  DriveSpreadsheetFile,
} from '../services/googleSheetsService';

interface GoogleSheetsSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  appState: AppStateData;
  currentTenant: SchoolTenant;
  onStateRestored: (newState: AppStateData) => void;
  onAutoSyncChange?: (enabled: boolean) => void;
  isAutoSyncEnabled?: boolean;
}

export const GoogleSheetsSyncModal: React.FC<GoogleSheetsSyncModalProps> = ({
  isOpen,
  onClose,
  appState,
  currentTenant,
  onStateRestored,
  onAutoSyncChange,
  isAutoSyncEnabled = false,
}) => {
  const [currentUser, setCurrentUser] = useState<GoogleUserProfile | null>(getCurrentUser());
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isSyncingPush, setIsSyncingPush] = useState(false);
  const [isSyncingPull, setIsSyncingPull] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [copiedDomain, setCopiedDomain] = useState(false);

  const [connectedSpreadsheet, setConnectedSpreadsheet] = useState<DriveSpreadsheetFile | null>(null);
  const [availableSpreadsheets, setAvailableSpreadsheets] = useState<DriveSpreadsheetFile[]>([]);
  const [lastSyncText, setLastSyncText] = useState<string>('');
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Destructive confirmation state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    actionType: 'PUSH' | 'PULL';
  }>({
    isOpen: false,
    title: '',
    description: '',
    actionType: 'PUSH',
  });

  const tenantStorageKey = `GOOGLE_SHEET_INFO_${currentTenant.id}`;

  // Load cached spreadsheet info for current school
  useEffect(() => {
    try {
      const saved = localStorage.getItem(tenantStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        setConnectedSpreadsheet(parsed);
      } else {
        setConnectedSpreadsheet(null);
      }
      const savedTime = localStorage.getItem(`${tenantStorageKey}_TIME`);
      if (savedTime) setLastSyncText(savedTime);
    } catch {}
  }, [currentTenant.id, tenantStorageKey]);

  // Listen to auth state
  useEffect(() => {
    const unsub = initAuth(
      (user) => {
        setCurrentUser(user);
      },
      () => {
        setCurrentUser(null);
      }
    );
    return () => unsub();
  }, []);

  // When user is authenticated or modal opens, refresh Drive files
  useEffect(() => {
    if (isOpen && currentUser) {
      handleSearchDriveFiles();
    }
  }, [isOpen, currentUser]);

  const showNotification = (type: 'success' | 'error' | 'info', text: string) => {
    setNotification({ type, text });
    setTimeout(() => {
      setNotification((prev) => (prev?.text === text ? null : prev));
    }, 6000);
  };

  const handleSearchDriveFiles = async () => {
    const token = await getAccessToken();
    if (!token) return;

    setIsLoadingFiles(true);
    try {
      const files = await searchSpreadsheetsInDrive(token);
      setAvailableSpreadsheets(files);

      // If no spreadsheet is currently linked, check if there is an exact match for this school
      if (!connectedSpreadsheet && files.length > 0) {
        const schoolNameClean = (appState.school.namaSekolah || '').toLowerCase();
        const npsnClean = (appState.school.npsn || '').toLowerCase();
        const matchingFile = files.find(
          (f) =>
            (npsnClean && f.name.toLowerCase().includes(npsnClean)) ||
            (schoolNameClean && f.name.toLowerCase().includes(schoolNameClean))
        );
        if (matchingFile) {
          handleSelectSpreadsheet(matchingFile);
        }
      }
    } catch (err: any) {
      console.warn('Gagal membaca daftar file dari Drive:', err);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleLogin = async (mode: 'auto' | 'gis' = 'auto') => {
    setIsSigningIn(true);
    try {
      const result = mode === 'gis' ? await signInWithGis() : await googleSignIn();
      if (result) {
        setCurrentUser(result.user);
        showNotification('success', `Berhasil masuk sebagai ${result.user.displayName || result.user.email}`);
        // Fetch files right after sign-in
        const files = await searchSpreadsheetsInDrive(result.accessToken);
        setAvailableSpreadsheets(files);
      }
    } catch (err: any) {
      showNotification('error', err.message || 'Gagal masuk dengan akun Google.');
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleLogout = async () => {
    await logoutGoogle();
    setCurrentUser(null);
    showNotification('info', 'Anda telah keluar dari akun Google.');
  };

  const handleSelectSpreadsheet = (file: DriveSpreadsheetFile) => {
    setConnectedSpreadsheet(file);
    try {
      localStorage.setItem(tenantStorageKey, JSON.stringify(file));
    } catch {}
    showNotification('success', `Spreadsheet "${file.name}" terhubung ke sekolah ini.`);
  };

  const handleCreateNewSpreadsheet = async () => {
    const token = await getAccessToken();
    if (!token) {
      showNotification('error', 'Silakan masuk dengan Google terlebih dahulu.');
      return;
    }

    setIsCreatingNew(true);
    try {
      const newFile = await createSpreadsheetInDrive(token, appState.school);
      setConnectedSpreadsheet(newFile);
      try {
        localStorage.setItem(tenantStorageKey, JSON.stringify(newFile));
      } catch {}
      setAvailableSpreadsheets((prev) => [newFile, ...prev]);

      // Automatically push initial state into the fresh sheet
      const syncRes = await syncStateToSpreadsheet(token, newFile.id, appState);
      setLastSyncText(syncRes.updatedAt);
      try {
        localStorage.setItem(`${tenantStorageKey}_TIME`, syncRes.updatedAt);
      } catch {}

      showNotification('success', `Spreadsheet baru "${newFile.name}" berhasil dibuat dan diisi data LPJ di Google Drive Anda!`);
    } catch (err: any) {
      showNotification('error', err.message || 'Gagal membuat spreadsheet baru di Drive.');
    } finally {
      setIsCreatingNew(false);
    }
  };

  // Trigger Push with User Confirmation
  const promptPushSync = () => {
    if (!connectedSpreadsheet) {
      showNotification('error', 'Silakan pilih atau buat spreadsheet terlebih dahulu.');
      return;
    }
    setConfirmDialog({
      isOpen: true,
      title: 'Simpan ke Google Sheets?',
      description: `Data transaksi BKU, BKT, BKB, Pajak, Kwitansi, Toko, dan RPD saat ini akan disimpan dan disinkronkan ke spreadsheet "${connectedSpreadsheet.name}". Apakah Anda yakin ingin melanjutkan?`,
      actionType: 'PUSH',
    });
  };

  // Trigger Pull with User Confirmation
  const promptPullSync = () => {
    if (!connectedSpreadsheet) {
      showNotification('error', 'Silakan hubungkan spreadsheet terlebih dahulu.');
      return;
    }
    setConfirmDialog({
      isOpen: true,
      title: 'Pulihkan Data dari Google Sheets?',
      description: `Aplikasi akan mengambil data terbaru dari spreadsheet "${connectedSpreadsheet.name}" di Google Drive Anda. Setiap perubahan yang belum disimpan di sesi ini akan digantikan oleh data dari Google Sheets. Lanjutkan?`,
      actionType: 'PULL',
    });
  };

  const executeConfirmedAction = async () => {
    const action = confirmDialog.actionType;
    setConfirmDialog((prev) => ({ ...prev, isOpen: false }));

    const token = await getAccessToken();
    if (!token) {
      showNotification('error', 'Sesi Google telah kedaluwarsa. Silakan masuk kembali.');
      return;
    }

    if (!connectedSpreadsheet) return;

    if (action === 'PUSH') {
      setIsSyncingPush(true);
      try {
        const res = await syncStateToSpreadsheet(token, connectedSpreadsheet.id, appState);
        setLastSyncText(res.updatedAt);
        try {
          localStorage.setItem(`${tenantStorageKey}_TIME`, res.updatedAt);
        } catch {}
        showNotification('success', `Data berhasil disimpan ke Google Sheets pada ${res.updatedAt}!`);
      } catch (err: any) {
        showNotification('error', err.message || 'Gagal menyimpan ke Google Sheets.');
      } finally {
        setIsSyncingPush(false);
      }
    } else if (action === 'PULL') {
      setIsSyncingPull(true);
      try {
        const loaded = await loadStateFromSpreadsheet(token, connectedSpreadsheet.id);
        onStateRestored(loaded.state);
        setLastSyncText(loaded.syncedAt);
        try {
          localStorage.setItem(`${tenantStorageKey}_TIME`, loaded.syncedAt);
        } catch {}
        showNotification('success', `Data berhasil dipulihkan dari Google Sheets (${loaded.syncedAt})!`);
      } catch (err: any) {
        showNotification('error', err.message || 'Gagal memulihkan data dari Google Sheets.');
      } finally {
        setIsSyncingPull(false);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden my-8">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-800 via-teal-900 to-slate-900 px-6 py-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center shadow-inner">
              <FileSpreadsheet className="w-6 h-6 text-emerald-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white tracking-tight">
                  Integrasi Google Sheets & Drive
                </h3>
                <span className="text-[10px] bg-emerald-400/20 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded-full font-semibold">
                  Database Nyata
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Simpan seluruh data LPJ Revit secara permanen di akun Google Drive pribadi Anda
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notification banner */}
        {notification && (
          <div
            className={`px-6 py-3 text-xs flex items-center gap-2 font-medium border-b ${
              notification.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : notification.type === 'error'
                ? 'bg-rose-50 text-rose-800 border-rose-200'
                : 'bg-blue-50 text-blue-800 border-blue-200'
            }`}
          >
            {notification.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
            {notification.type === 'error' && <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />}
            {notification.type === 'info' && <Info className="w-4 h-4 text-blue-600 shrink-0" />}
            <span>{notification.text}</span>
          </div>
        )}

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          
          {/* STEP 1: Google Account Authentication */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                {currentUser ? (
                  <>
                    {currentUser.photoURL ? (
                      <img
                        src={currentUser.photoURL}
                        alt="Avatar"
                        className="w-10 h-10 rounded-full border border-slate-300 shadow-xs"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center shadow-xs">
                        {(currentUser.displayName || currentUser.email || 'U')[0].toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">
                          {currentUser.displayName || 'Pengguna Google'}
                        </span>
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3 text-emerald-600" /> Terhubung
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">{currentUser.email}</p>
                    </div>
                  </>
                ) : (
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">Akun Google Drive</h4>
                    <p className="text-xs text-slate-500">
                      Masuk untuk menghubungkan Google Sheets dan Google Drive Anda
                    </p>
                  </div>
                )}
              </div>

              <div>
                {currentUser ? (
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-1.5 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-3 py-1.5 rounded-lg border border-rose-200 transition font-medium cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Keluar Akun
                  </button>
                ) : (
                  <div className="flex flex-col items-end">
                    {/* Official Google Sign-In Button */}
                    <button
                      className="gsi-material-button shadow-xs"
                      onClick={() => handleLogin('auto')}
                      disabled={isSigningIn}
                    >
                      <div className="gsi-material-button-state"></div>
                      <div className="gsi-material-button-content-wrapper">
                        <div className="gsi-material-button-icon">
                          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: 'block' }}>
                            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                          </svg>
                        </div>
                        <span className="gsi-material-button-contents">
                          {isSigningIn ? 'Menghubungkan...' : 'Sign in with Google'}
                        </span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleLogin('gis')}
                      disabled={isSigningIn}
                      className="mt-1.5 text-[11px] text-teal-700 hover:text-teal-900 underline font-medium cursor-pointer"
                    >
                      Atau Masuk Langsung via Google Token (Alternatif Cepat)
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* STEP 2: Active School Context */}
          <div className="border border-slate-200 rounded-xl p-4 bg-white">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Sekolah Aktif
              </span>
              <span className="text-xs font-mono font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                NPSN: {currentTenant.npsn || appState.school.npsn}
              </span>
            </div>
            <h4 className="text-base font-bold text-slate-900">
              {appState.school.namaSekolah || currentTenant.namaSekolah}
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              {appState.school.kabKota || currentTenant.kabKota} • TA {appState.school.tahunAnggaran || '2025'}
            </p>
          </div>

          {/* STEP 3: Connected Google Spreadsheet */}
          {currentUser ? (
            <div className="border border-emerald-200 bg-emerald-50/50 rounded-xl p-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold text-emerald-800 uppercase tracking-wider">
                      Spreadsheet Terhubung
                    </span>
                    {connectedSpreadsheet ? (
                      <div>
                        <h5 className="text-sm font-bold text-slate-900 break-all">
                          {connectedSpreadsheet.name}
                        </h5>
                        <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap">
                          {lastSyncText && (
                            <span className="flex items-center gap-1 text-emerald-700 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Sinkron: {lastSyncText}
                            </span>
                          )}
                          <a
                            href={
                              connectedSpreadsheet.webViewLink ||
                              `https://docs.google.com/spreadsheets/d/${connectedSpreadsheet.id}/edit`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 font-semibold underline flex items-center gap-1"
                          >
                            Buka di Google Sheets <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-1">
                        <p className="text-xs text-slate-600">
                          Belum ada Spreadsheet yang dipilih untuk sekolah ini di Google Drive.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCreateNewSpreadsheet}
                    disabled={isCreatingNew}
                    className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold px-3 py-2 rounded-lg shadow-xs transition disabled:opacity-50 cursor-pointer"
                  >
                    {isCreatingNew ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    <span>Buat Spreadsheet Baru</span>
                  </button>
                </div>
              </div>

              {/* Action buttons: Push to Sheets / Pull from Sheets */}
              {connectedSpreadsheet && (
                <div className="pt-3 border-t border-emerald-200/80 flex flex-wrap gap-2.5">
                  <button
                    onClick={promptPushSync}
                    disabled={isSyncingPush || isSyncingPull}
                    className="flex-1 min-w-[200px] flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-sm transition cursor-pointer"
                  >
                    {isSyncingPush ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Menyimpan ke Google Sheets...</span>
                      </>
                    ) : (
                      <>
                        <ArrowUpFromLine className="w-4 h-4" />
                        <span>Simpan ke Google Sheets (Push)</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={promptPullSync}
                    disabled={isSyncingPush || isSyncingPull}
                    className="flex-1 min-w-[200px] flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-sm transition cursor-pointer"
                  >
                    {isSyncingPull ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Memulihkan dari Google Sheets...</span>
                      </>
                    ) : (
                      <>
                        <ArrowDownToLine className="w-4 h-4 text-emerald-400" />
                        <span>Pulihkan dari Spreadsheet (Pull)</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Auto sync toggle option */}
              {onAutoSyncChange && (
                <div className="pt-2 flex items-center justify-between text-xs text-slate-700">
                  <span className="font-medium">
                    Sinkron otomatis ke Google Sheets saat ada perubahan data
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isAutoSyncEnabled}
                      onChange={(e) => onAutoSyncChange(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>
              )}
            </div>
          ) : (
            /* Not logged in info banner */
            <div className="space-y-3">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 text-amber-900">
                <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-bold">Mengapa Menggunakan Google Sheets sebagai Database?</p>
                  <p className="text-amber-800 leading-relaxed">
                    Dengan menghubungkan Google Drive, data LPJ Revit tidak akan pernah hilang meskipun browser Anda ditutup, aplikasi di-redeploy, atau link baru dibuka. Semua data tersimpan aman di akun Google Anda dan dapat dibuka kapan saja di Google Sheets!
                  </p>
                </div>
              </div>

              {/* Exact Domain Copy Helper for Firebase Console */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">
                    Domain Aplikasi Anda Saat Ini:
                  </span>
                  <span className="font-mono text-slate-900 font-bold text-xs truncate block select-all">
                    {typeof window !== 'undefined' ? window.location.hostname : 'run.app'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      navigator.clipboard.writeText(window.location.hostname);
                      setCopiedDomain(true);
                      setTimeout(() => setCopiedDomain(false), 3000);
                    }
                  }}
                  className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-slate-700 font-semibold text-xs flex items-center gap-1.5 shrink-0 transition cursor-pointer shadow-xs"
                >
                  {copiedDomain ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-600" />}
                  <span>{copiedDomain ? 'Tersalin!' : 'Salin Domain Lengkap'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Available Spreadsheets in Drive */}
          {currentUser && (
            <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-slate-600" />
                  <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Daftar Spreadsheet LPJ di Google Drive Anda
                  </h5>
                </div>
                <button
                  onClick={handleSearchDriveFiles}
                  disabled={isLoadingFiles}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoadingFiles ? 'animate-spin' : ''}`} />
                  Segarkan
                </button>
              </div>

              {isLoadingFiles ? (
                <div className="py-6 text-center text-xs text-slate-500">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto text-slate-400 mb-2" />
                  Mencari file spreadsheet di Google Drive...
                </div>
              ) : availableSpreadsheets.length > 0 ? (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {availableSpreadsheets.map((f) => {
                    const isSelected = connectedSpreadsheet?.id === f.id;
                    return (
                      <div
                        key={f.id}
                        className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-2 transition ${
                          isSelected
                            ? 'bg-emerald-50 border-emerald-300 ring-1 ring-emerald-300'
                            : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <div className="truncate flex-1">
                          <p className="font-bold text-slate-900 truncate">{f.name}</p>
                          <p className="text-[10px] text-slate-500">
                            Diperbarui:{' '}
                            {f.modifiedTime ? new Date(f.modifiedTime).toLocaleString('id-ID') : '-'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isSelected ? (
                            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Dipilih
                            </span>
                          ) : (
                            <button
                              onClick={() => handleSelectSpreadsheet(f)}
                              className="px-2.5 py-1 bg-white hover:bg-emerald-600 hover:text-white text-slate-700 border border-slate-300 rounded font-semibold text-[11px] transition cursor-pointer"
                            >
                              Gunakan Ini
                            </button>
                          )}
                          <a
                            href={f.webViewLink || `https://docs.google.com/spreadsheets/d/${f.id}/edit`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 text-slate-400 hover:text-blue-600"
                            title="Buka Spreadsheet di Tab Baru"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-4 text-center text-xs text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                  Belum ada file spreadsheet LPJ Revit di Google Drive Anda.
                  <div className="mt-2">
                    <button
                      onClick={handleCreateNewSpreadsheet}
                      disabled={isCreatingNew}
                      className="inline-flex items-center gap-1.5 text-emerald-700 hover:text-emerald-800 font-bold underline"
                    >
                      <Plus className="w-3.5 h-3.5" /> Buat sekarang di Google Drive
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Structure Information Card */}
          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-xs text-slate-600 space-y-2">
            <h5 className="font-bold text-slate-800 flex items-center gap-1.5">
              <FileCheck className="w-4 h-4 text-emerald-600" />
              Tab Spreadsheet yang Disinkronkan:
            </h5>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
              <span className="bg-white p-1.5 rounded border border-slate-200">1. Data Sekolah</span>
              <span className="bg-white p-1.5 rounded border border-slate-200">2. BKU (Kas Umum)</span>
              <span className="bg-white p-1.5 rounded border border-slate-200">3. BKT (Kas Tunai)</span>
              <span className="bg-white p-1.5 rounded border border-slate-200">4. BKB (Buku Bank)</span>
              <span className="bg-white p-1.5 rounded border border-slate-200">5. Kwitansi & Bon</span>
              <span className="bg-white p-1.5 rounded border border-slate-200">6. Rekap Pajak</span>
              <span className="bg-white p-1.5 rounded border border-slate-200">7. RPD & AHSP</span>
              <span className="bg-white p-1.5 rounded border border-slate-200">8. Progres Mingguan</span>
              <span className="bg-white p-1.5 rounded border border-slate-200">9. Toko Rekanan</span>
              <span className="bg-white p-1.5 rounded border border-slate-200">10. Tenaga Kerja</span>
              <span className="bg-emerald-50 text-emerald-800 p-1.5 rounded border border-emerald-300 font-semibold col-span-2 sm:col-span-1">
                11. Snapshot JSON 100% Utuh
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-between">
          <p className="text-[11px] text-slate-500">
            {connectedSpreadsheet ? 'Database terhubung ke Google Drive' : 'Login untuk mengaktifkan database Drive'}
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>

      {/* Explicit User Confirmation Dialog (MANDATORY per Workspace Skill) */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  confirmDialog.actionType === 'PULL' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                {confirmDialog.actionType === 'PULL' ? (
                  <ArrowDownToLine className="w-5 h-5" />
                ) : (
                  <ArrowUpFromLine className="w-5 h-5" />
                )}
              </div>
              <h4 className="text-base font-bold text-slate-900">{confirmDialog.title}</h4>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {confirmDialog.description}
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
              >
                Batal
              </button>
              <button
                onClick={executeConfirmedAction}
                className={`px-4 py-2 rounded-xl text-xs font-bold text-white transition shadow-sm cursor-pointer ${
                  confirmDialog.actionType === 'PULL'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {confirmDialog.actionType === 'PULL' ? 'Ya, Pulihkan Sekarang' : 'Ya, Simpan ke Sheets'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
