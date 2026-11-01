import React, { useEffect, useState } from 'react';
import {
  Printer,
  RotateCcw,
  Download,
  Upload,
  RefreshCw,
  FileSpreadsheet,
  LogOut,
  HardDrive,
  CheckCircle2,
  AlertTriangle,
  Cloud,
} from 'lucide-react';
import { SchoolMasterData } from '../types';
import { SchoolTenant } from '../data/tenantPresets';
import { GoogleUserProfile } from '../services/googleAuthService';
import { LocalUserSession } from '../utils/authHelper';
import { useCan } from '../hooks/useCan';
import { UserMembershipRecord } from '../services/schoolMembershipService';
import { SchoolSwitcher, getSchoolColorTheme } from './SchoolSwitcher';

interface HeaderProps {
  school: SchoolMasterData;
  currentTenant: SchoolTenant;
  memberships: UserMembershipRecord[];
  onSelectSchool: (tenant: SchoolTenant) => void;
  onOpenSchoolPortal: (initialTab?: 'switch' | 'join' | 'create' | 'members' | 'pin') => void;
  onCreateDemoSchool?: () => void;
  isCreatingDemo?: boolean;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenPrintModal: (docType?: string) => void;
  onReset: () => void;
  onExportJson: () => void;
  onImportJson: () => void;
  onOpenBackupRestoreModal?: () => void;
  isSyncing: boolean;
  lastSyncedText: string;
  cloudStatus?: 'ok' | 'failed' | 'quota' | 'skipped' | 'pending';
  pendingSyncCount?: number;
  onOpenAnomalyReview?: () => void;
  anomalyCount?: number;
  onManualSave?: () => void;
  onOpenGoogleSheetsSync?: () => void;
  isGoogleConnected?: boolean;
  googleSheetName?: string;
  currentUser?: GoogleUserProfile | null;
  localSession?: LocalUserSession | null;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  school,
  currentTenant,
  memberships,
  onSelectSchool,
  onOpenSchoolPortal,
  onCreateDemoSchool,
  isCreatingDemo = false,
  activeTab,
  setActiveTab,
  onOpenPrintModal,
  onReset,
  onExportJson,
  onImportJson,
  onOpenBackupRestoreModal,
  isSyncing,
  lastSyncedText,
  cloudStatus = 'ok',
  pendingSyncCount = 0,
  onOpenAnomalyReview,
  anomalyCount = 0,
  onManualSave,
  onOpenGoogleSheetsSync,
  isGoogleConnected = false,
  googleSheetName,
  currentUser,
  onLogout,
}) => {
  const { can, role: serverRole } = useCan(currentTenant.id);
  const canImport = can('import:data');
  const theme = getSchoolColorTheme(currentTenant.id);

  // Multi-tab cross-synchronization listener (Requirement 8)
  const [otherTabChangedTenantId, setOtherTabChangedTenantId] = useState<string | null>(null);

  useEffect(() => {
    // 1. BroadcastChannel listener
    let bc: BroadcastChannel | null = null;
    try {
      if (typeof window !== 'undefined' && window.BroadcastChannel) {
        bc = new BroadcastChannel('LPJ_TENANT_CHANNEL');
        bc.onmessage = (event) => {
          if (event.data?.type === 'ACTIVE_TENANT_CHANGED' && event.data.tenantId !== currentTenant.id) {
            setOtherTabChangedTenantId(event.data.tenantId);
          }
        };
      }
    } catch {}

    // 2. Storage event listener fallback
    const handleStorageEvent = (event: StorageEvent) => {
      if (event.key === 'ACTIVE_SCHOOL_TENANT_ID_V1' && event.newValue && event.newValue !== currentTenant.id) {
        setOtherTabChangedTenantId(event.newValue);
      }
    };
    window.addEventListener('storage', handleStorageEvent);

    return () => {
      if (bc) bc.close();
      window.removeEventListener('storage', handleStorageEvent);
    };
  }, [currentTenant.id]);

  const tabs = [
    { id: 'dashboard', label: 'Ringkasan Proyek' },
    { id: 'realdata', label: 'Data Real Sekolah' },
    { id: 'master', label: 'Data Master Sekolah' },
    { id: 'rpd', label: 'RPD & Analisa Satuan' },
    { id: 'progress', label: 'Laporan Mingguan & Bobot' },
    { id: 'bku', label: 'BKU (Kas Umum)' },
    { id: 'bkt', label: 'BKT (Kas Tunai)' },
    { id: 'bkb', label: 'BKB (Buku Bank)' },
    { id: 'pajak', label: 'Laporan Pajak' },
    { id: 'kwitansi', label: 'Kwitansi, Bon & SPB' },
    { id: 'upah', label: 'Upah Tenaga Kerja' },
    { id: 'toko', label: 'Toko Rekanan & Penyedia' },
  ];

  return (
    <header className="bg-slate-900 text-white border-b border-slate-800 shadow-md sticky top-0 z-40 print:hidden">
      {/* Other Tab Switched Confirmation Bar (Requirement 8) */}
      {otherTabChangedTenantId && (
        <div className="bg-gradient-to-r from-amber-600 to-orange-600 text-white px-4 py-2 text-xs flex items-center justify-between gap-3 shadow-md animate-in slide-in-from-top duration-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-200" />
            <span>
              Sekolah aktif telah diganti di tab browser lain. Beralih sekarang agar pembukuan tidak tertukar?
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                const targetMembership = memberships.find((m) => m.schoolId === otherTabChangedTenantId);
                if (targetMembership) {
                  onSelectSchool({
                    id: targetMembership.schoolId,
                    namaSekolah: targetMembership.namaSekolah,
                    npsn: targetMembership.npsn,
                    jenjang: (targetMembership.jenjang || 'SD') as any,
                    kabKota: targetMembership.kabKota || '-',
                    provinsi: '-',
                    email: '-',
                    isDemo: false,
                    createdAt: new Date().toISOString(),
                    lastLogin: new Date().toISOString(),
                  });
                } else {
                  window.location.reload();
                }
                setOtherTabChangedTenantId(null);
              }}
              className="px-3 py-1 bg-white text-slate-900 font-bold rounded-lg hover:bg-amber-50 transition cursor-pointer shadow-xs"
            >
              Beralih Sekarang
            </button>
            <button
              type="button"
              onClick={() => setOtherTabChangedTenantId(null)}
              className="px-2 py-1 text-white/80 hover:text-white font-semibold cursor-pointer"
            >
              Abaikan
            </button>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex flex-wrap items-center justify-between gap-3">
        {/* School Identity with Interactive Switcher Dropdown (Requirement 2 & 8) */}
        <div className="flex items-center gap-3">
          <SchoolSwitcher
            currentTenant={currentTenant}
            memberships={memberships}
            onSelectSchool={onSelectSchool}
            onOpenJoinOrCreate={(tab) => onOpenSchoolPortal(tab)}
            onCreateDemoSchool={onCreateDemoSchool}
            isCreatingDemo={isCreatingDemo}
            currentRole={serverRole}
          />

          {/* Sub-info: City, Year, and Real-time Cloud Status */}
          <div className="hidden lg:flex items-center gap-2 text-xs text-slate-400 flex-wrap">
            <span>TA {school.tahunAnggaran || 2026}</span>
            <span>•</span>

            {/* Cloud Sync Status Indicator */}
            <div className="flex items-center gap-1.5 text-[11px]">
              {isSyncing ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-950/80 border border-amber-500/40 text-amber-300 font-medium">
                  <RefreshCw className="w-3 h-3 text-amber-400 animate-spin" />
                  <span>Menyinkronkan ke Cloud...</span>
                </span>
              ) : cloudStatus === 'ok' && pendingSyncCount === 0 ? (
                <div
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-medium"
                  title="Data berhasil disinkronkan penuh ke Google Cloud Firestore"
                >
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span>Tersimpan di cloud</span>
                  <span className="text-slate-400 text-[10px]">({lastSyncedText})</span>
                </div>
              ) : cloudStatus === 'quota' ? (
                <div
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-950/80 border border-rose-500/40 text-rose-300 font-medium"
                  title="Batas kuota harian Firestore tercapai; data disimpan aman di IndexedDB lokal perangkat"
                >
                  <HardDrive className="w-3 h-3 text-rose-400" />
                  <span>Hanya tersimpan di perangkat ini (Batas Kuota)</span>
                </div>
              ) : (
                <div
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-950/90 border border-amber-500/50 text-amber-300 font-medium animate-pulse"
                  title="Data tersimpan di perangkat lokal. Menunggu koneksi cloud untuk sinkronisasi otomatis..."
                >
                  <HardDrive className="w-3 h-3 text-amber-400" />
                  <span>
                    Hanya tersimpan di perangkat ini
                    {pendingSyncCount > 0 ? ` (${pendingSyncCount} antrean)` : ' (Belum tersinkron)'}
                  </span>
                </div>
              )}
            </div>

            {/* Data Anomaly Detection Notification Badge */}
            {anomalyCount > 0 && onOpenAnomalyReview && (
              <>
                <span>•</span>
                <button
                  onClick={onOpenAnomalyReview}
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-400/40 hover:bg-amber-500/30 transition cursor-pointer"
                  title="Klik untuk meninjau usulan perbaikan data pembukuan yang tidak konsisten"
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <span>{anomalyCount} Usulan Penyelarasan</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Google Sheets / Spreadsheet Database Button */}
          {onOpenGoogleSheetsSync && (
            <button
              onClick={onOpenGoogleSheetsSync}
              title="Sinkronkan database LPJ Revit langsung ke Google Sheets & Google Drive"
              className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xs border border-emerald-400/40 transition cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-200" />
              <span className="hidden sm:inline">Google Sheets</span>
              {isGoogleConnected && (
                <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse"></span>
              )}
            </button>
          )}

          {onManualSave && (
            <button
              onClick={onManualSave}
              disabled={isSyncing}
              title="Simpan permanen data sekolah saat ini ke Cloud Firestore"
              className="flex items-center gap-1.5 bg-emerald-700/80 hover:bg-emerald-600 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xs border border-emerald-500/40 transition cursor-pointer"
            >
              {isSyncing ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Cloud className="w-3.5 h-3.5 text-emerald-300" />
              )}
              <span className="hidden sm:inline">{isSyncing ? 'Menyimpan...' : 'Simpan Cloud'}</span>
            </button>
          )}

          {/* User Account / Sign Out */}
          {currentUser && (
            <div
              className="flex items-center gap-2 bg-slate-800/90 border border-slate-700/80 px-2.5 py-1.5 rounded-lg"
              title={`Akun Pengguna: ${currentUser.email}`}
            >
              {currentUser.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt={currentUser.displayName || 'Akun'}
                  className="w-5 h-5 rounded-full border border-emerald-400/50 shrink-0"
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-blue-600 text-[10px] font-bold flex items-center justify-center text-white shrink-0">
                  {(currentUser.displayName || currentUser.email || 'U')[0].toUpperCase()}
                </div>
              )}
              <span className="text-xs text-slate-200 font-medium max-w-[110px] truncate hidden xl:inline">
                {currentUser.displayName || currentUser.email}
              </span>
            </div>
          )}

          {/* Tombol Logout Akun */}
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              title="Keluar dari akun dan kembali ke halaman login"
              className="flex items-center gap-1.5 bg-rose-600/90 hover:bg-rose-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm border border-rose-500/40 transition cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          )}

          <button
            onClick={() => onOpenPrintModal('ALL')}
            className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-md transition-all cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Cetak Dokumen LPJ</span>
            <span className="sm:hidden">Cetak</span>
          </button>

          {onOpenBackupRestoreModal && (
            <button
              onClick={onOpenBackupRestoreModal}
              title="Cadangkan database ke JSON, pulihkan data, atau ekspor BKU ke Microsoft Excel (.xlsx)"
              className="flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
            >
              <HardDrive className="w-3.5 h-3.5 text-blue-200" />
              <span>Backup & Excel</span>
            </button>
          )}

          <button
            onClick={onExportJson}
            title="Cadangkan data sekolah ini ke file JSON"
            className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-700 transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Backup</span>
          </button>

          {canImport && (
            <button
              onClick={onImportJson}
              title="Pulihkan data sekolah ini dari JSON"
              className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-700 transition cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Restore</span>
            </button>
          )}

          {canImport && (
            <button
              onClick={onReset}
              title="Reset ulang formulir sekolah ini"
              className="flex items-center gap-1 bg-slate-800 hover:bg-rose-900/50 hover:text-rose-300 text-slate-300 px-2 py-1.5 rounded-lg text-xs font-medium border border-slate-700 transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Navigation tabs */}
      <div className="bg-slate-950 border-t border-slate-800/80 overflow-x-auto scrollbar-thin">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-1 min-w-max py-1.5">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
