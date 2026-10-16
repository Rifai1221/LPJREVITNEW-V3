import React from 'react';
import {
  Building2,
  FileText,
  Printer,
  RotateCcw,
  Download,
  Upload,
  Sparkles,
  BookOpen,
  Database,
  Cloud,
  CloudCheck,
  RefreshCw,
  ChevronDown,
  Users,
  FileSpreadsheet,
  LogOut,
  HardDrive,
} from 'lucide-react';
import { SchoolMasterData } from '../types';
import { SchoolTenant } from '../data/tenantPresets';
import { GoogleUserProfile } from '../services/googleAuthService';

interface HeaderProps {
  school: SchoolMasterData;
  currentTenant: SchoolTenant;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenPrintModal: (docType?: string) => void;
  onReset: () => void;
  onExportJson: () => void;
  onImportJson: () => void;
  onOpenBackupRestoreModal?: () => void;
  onOpenSchoolPortal?: () => void;
  isSyncing: boolean;
  lastSyncedText: string;
  onManualSave?: () => void;
  onOpenGoogleSheetsSync?: () => void;
  isGoogleConnected?: boolean;
  googleSheetName?: string;
  currentUser?: GoogleUserProfile | null;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  school,
  currentTenant,
  activeTab,
  setActiveTab,
  onOpenPrintModal,
  onReset,
  onExportJson,
  onImportJson,
  onOpenBackupRestoreModal,
  onOpenSchoolPortal,
  isSyncing,
  lastSyncedText,
  onManualSave,
  onOpenGoogleSheetsSync,
  isGoogleConnected = false,
  googleSheetName,
  currentUser,
  onLogout,
}) => {
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
      {/* Top bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex flex-wrap items-center justify-between gap-3">
        
        {/* School Identity */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center font-bold text-lg shadow-lg shadow-blue-500/20 text-white shrink-0">
            <Building2 className="w-5 h-5" />
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-sm sm:text-base font-bold tracking-tight text-white">
                {school.namaSekolah}
              </h1>

              <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded font-mono font-medium border border-blue-400/30">
                NPSN: {currentTenant.npsn || school.npsn}
              </span>
            </div>

            {/* Sub-info: City, Year, and Real-time Cloud Status */}
            <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap mt-0.5">
              <span>{school.kabKota} • TA {school.tahunAnggaran}</span>
              <span>•</span>
              
              {/* App Running Status Indicator */}
              <div
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-[11px] text-emerald-300 font-medium"
                title="Aplikasi sedang berjalan aktif dan responsif di server"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span>Aplikasi Berjalan Normal</span>
              </div>

              <span>•</span>

              {/* Cloud Sync Status Indicator */}
              <div
                className="flex items-center gap-1 text-[11px] text-blue-300"
                title="Data tersimpan di Google Cloud Firestore (Multi-Tenant)"
              >
                {isSyncing ? (
                  <>
                    <RefreshCw className="w-3 h-3 text-amber-400 animate-spin" />
                    <span className="text-amber-300">Menyimpan ke Cloud...</span>
                  </>
                ) : (
                  <>
                    <Database className="w-3 h-3 text-blue-400" />
                    <span className="text-blue-300 font-medium">Cloud Terhubung</span>
                    <span className="text-slate-400 text-[10px]">({lastSyncedText})</span>
                  </>
                )}
              </div>

              {onOpenGoogleSheetsSync && (
                <>
                  <span>•</span>
                  <button
                    onClick={onOpenGoogleSheetsSync}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition cursor-pointer border ${
                      isGoogleConnected
                        ? 'bg-emerald-900/60 text-emerald-200 border-emerald-500/60 shadow-xs shadow-emerald-500/20'
                        : 'bg-amber-900/40 text-amber-300 border-amber-500/40 hover:bg-amber-900/60'
                    }`}
                    title={
                      isGoogleConnected
                        ? `Database Google Drive Aktif: ${googleSheetName || 'Spreadsheet Terhubung'}`
                        : 'Klik untuk menghubungkan database Google Drive pribadi Anda'
                    }
                  >
                    <FileSpreadsheet className={`w-3.5 h-3.5 ${isGoogleConnected ? 'text-emerald-400' : 'text-amber-400'}`} />
                    <span>
                      {isGoogleConnected ? (
                        <>
                          <span className="font-bold text-emerald-300">Google Drive:</span>{' '}
                          <span className="text-white truncate max-w-[150px] inline-block align-bottom">{googleSheetName || 'Terhubung'}</span>
                        </>
                      ) : (
                        'Hubungkan Google Drive'
                      )}
                    </span>
                    {isGoogleConnected && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    )}
                  </button>
                </>
              )}
            </div>
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
              <span>Google Sheets</span>
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



          {/* Tombol Keluar Sekolah / Logout (Selalu Terlihat) */}
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              title="Keluar dari sekolah ini dan kembali ke Portal Login"
              className="flex items-center gap-1.5 bg-rose-600/90 hover:bg-rose-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm border border-rose-500/40 transition cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Keluar Sekolah</span>
            </button>
          )}

          {/* User Account Chip (Google Drive) */}
          {currentUser && (
            <div
              className="flex items-center gap-2 bg-slate-800/90 border border-slate-700/80 px-2.5 py-1.5 rounded-lg"
              title={`Google Drive Terhubung: ${currentUser.email}`}
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

          <button
            onClick={onImportJson}
            title="Pulihkan data sekolah ini dari JSON"
            className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-700 transition cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Restore</span>
          </button>

          <button
            onClick={onReset}
            title="Reset ulang formulir sekolah ini"
            className="flex items-center gap-1 bg-slate-800 hover:bg-rose-900/50 hover:text-rose-300 text-slate-300 px-2 py-1.5 rounded-lg text-xs font-medium border border-slate-700 transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Reset</span>
          </button>
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
