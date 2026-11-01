import React, { useState } from 'react';
import {
  ShieldAlert,
  Play,
  CheckCircle,
  AlertTriangle,
  RotateCcw,
  X,
  Server,
  Lock,
  Users,
  Check,
  Database,
} from 'lucide-react';
import {
  migrateLegacySchoolsCallable,
  MigrationCallableResult,
  SchoolMigrationReport,
} from '../services/schoolMembershipService';

interface AdminMigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string | null;
}

export const AdminMigrationModal: React.FC<AdminMigrationModalProps> = ({
  isOpen,
  onClose,
  userEmail,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dryRunResult, setDryRunResult] = useState<MigrationCallableResult | null>(null);
  const [realResult, setRealResult] = useState<MigrationCallableResult | null>(null);
  const [showConfirmRealModal, setShowConfirmRealModal] = useState(false);

  if (!isOpen) return null;

  const handleRunDryRun = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await migrateLegacySchoolsCallable(true);
      setDryRunResult(res);
    } catch (err: any) {
      console.error('DryRun error:', err);
      setError(err?.message || 'Gagal menjalankan simulasi migrasi. Pastikan Anda memiliki hak admin.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunRealMigration = async () => {
    setShowConfirmRealModal(false);
    setIsLoading(true);
    setError(null);
    try {
      const res = await migrateLegacySchoolsCallable(false);
      setRealResult(res);
    } catch (err: any) {
      console.error('Real migration error:', err);
      setError(err?.message || 'Gagal mengeksekusi migrasi sungguhan.');
    } finally {
      setIsLoading(false);
    }
  };

  const renderTable = (reports: SchoolMigrationReport[], isDryRun: boolean) => {
    if (!reports || reports.length === 0) {
      return (
        <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-xl">
          <Database className="w-10 h-10 text-slate-400 mx-auto mb-2" />
          <p className="text-slate-600 font-medium">Tidak ada dokumen sekolah yang memerlukan migrasi.</p>
          <p className="text-xs text-slate-400 mt-1">Semua sekolah sudah menggunakan arsitektur multi-sekolah terbaru.</p>
        </div>
      );
    }

    return (
      <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
              <th className="py-3 px-3">No</th>
              <th className="py-3 px-3">Nama Sekolah</th>
              <th className="py-3 px-3">School ID</th>
              <th className="py-3 px-3 text-center">PIN Dipindahkan</th>
              <th className="py-3 px-3 text-center">Membership Dibuat</th>
              <th className="py-3 px-3 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {reports.map((r, idx) => (
              <tr key={r.schoolId} className="hover:bg-slate-50/80 transition-colors">
                <td className="py-2.5 px-3 font-mono text-slate-400">{idx + 1}</td>
                <td className="py-2.5 px-3 font-medium text-slate-900">{r.namaSekolah}</td>
                <td className="py-2.5 px-3 font-mono text-slate-500">{r.schoolId}</td>
                <td className="py-2.5 px-3 text-center">
                  {r.migratedPin ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded text-[11px]">
                      <Check className="w-3 h-3" /> {isDryRun ? 'Akan Dipindah' : 'Dipindahkan'}
                    </span>
                  ) : (
                    <span className="text-slate-400 font-mono text-[11px]">Sudah Aman</span>
                  )}
                </td>
                <td className="py-2.5 px-3 text-center font-medium">
                  {r.membersBackfilled > 0 ? (
                    <span className="inline-flex items-center gap-1 text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-[11px]">
                      <Users className="w-3 h-3" /> {r.membersBackfilled} Akun
                    </span>
                  ) : (
                    <span className="text-slate-400 text-[11px]">0 (Sudah sinkron)</span>
                  )}
                </td>
                <td className="py-2.5 px-3 text-center">
                  {r.status === 'already-migrated' ? (
                    <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-medium text-[11px]">
                      Selesai
                    </span>
                  ) : (
                    <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-semibold text-[11px]">
                      {isDryRun ? 'Siap Migrasi' : 'Berhasil Migrasi'}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-400">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-white">Panel Migrasi Sekolah Lama (Admin)</h3>
                <span className="bg-amber-500/20 text-amber-300 border border-amber-400/30 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Admin Only
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Memindahkan kredensial PIN ke <code>private/security</code> dan membuat <code>users/{'{uid}'}/memberships</code>.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-800 text-sm">
          {/* Admin Email Notice */}
          <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-blue-600 shrink-0" />
              <span>
                Login sebagai Administrator: <strong>{userEmail || 'Admin Terdaftar'}</strong>
              </span>
            </div>
            <span className="text-[11px] text-blue-700 font-medium">Berdasarkan ADMIN_UIDS</span>
          </div>

          {/* Procedure Warning */}
          <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl text-amber-900 text-xs space-y-1.5">
            <div className="flex items-center gap-2 font-bold text-amber-950">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Urutan Operasi Aman (docs/MIGRASI.md):</span>
            </div>
            <ol className="list-decimal list-inside space-y-1 text-amber-900 pl-1">
              <li>Pastikan Bendahara sudah membackup JSON tiap sekolah via modal Backup/Restore.</li>
              <li>Jalankan <strong>Simulasi (Dry Run)</strong> untuk memverifikasi data yang akan bermutasi.</li>
              <li>Periksa tabel ringkasan per sekolah di bawah.</li>
              <li>Jika hasil simulasi valid, jalankan <strong>Eksekusi Migrasi Sungguhan</strong>.</li>
            </ol>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs flex items-start gap-2.5">
              <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-red-900">Terjadi Kesalahan Migrasi</p>
                <p>{error}</p>
              </div>
            </div>
          )}

          {/* Action Step 1: Dry Run */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-xs flex items-center justify-center">1</span>
                  Langkah 1: Simulasi Tanpa Perubahan (Dry Run)
                </h4>
                <p className="text-xs text-slate-500">Mendeteksi sekolah lama tanpa menulis data ke database.</p>
              </div>
              <button
                type="button"
                onClick={handleRunDryRun}
                disabled={isLoading}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium text-xs rounded-xl shadow-xs transition-colors"
              >
                {isLoading ? (
                  <RotateCcw className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 fill-white" />
                )}
                Jalankan Simulasi (Dry Run)
              </button>
            </div>

            {dryRunResult && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700 px-1">
                  <span>Hasil Simulasi: {dryRunResult.totalSchoolsScanned} Sekolah Dipindai</span>
                  <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Mode Simulasi Aktif (Database Aman)
                  </span>
                </div>
                {renderTable(dryRunResult.summary, true)}
              </div>
            )}
          </div>

          {/* Action Step 2: Real Migration */}
          {dryRunResult && (
            <div className="space-y-3 pt-4 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-900 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-amber-600 text-white text-xs flex items-center justify-center">2</span>
                    Langkah 2: Eksekusi Migrasi Permanen
                  </h4>
                  <p className="text-xs text-slate-500">
                    Memindahkan PIN ke subkoleksi privat dan mendaftarkan memberships anggota ke Firestore.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowConfirmRealModal(true)}
                  disabled={isLoading || Boolean(realResult)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-colors"
                >
                  <Server className="w-4 h-4" />
                  {realResult ? 'Migrasi Selesai' : 'Eksekusi Migrasi Sungguhan'}
                </button>
              </div>

              {realResult && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700 px-1">
                    <span className="text-emerald-700 flex items-center gap-1.5 font-bold">
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                      Migrasi Berhasil Diterapkan ke Database!
                    </span>
                    <span className="text-slate-500">{realResult.summary.length} Sekolah Dimutasi</span>
                  </div>
                  {renderTable(realResult.summary, false)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>Panduan lengkap tersedia di <code>docs/MIGRASI.md</code></span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold rounded-xl transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>

      {/* Confirmation Modal for Real Execution */}
      {showConfirmRealModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-red-200 max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-red-600 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-base">Konfirmasi Eksekusi Migrasi</h4>
                <p className="text-xs text-slate-500">Tindakan ini akan memutasi dokumen sekolah di Firestore.</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200">
              Sistem akan memindahkan field PIN dari root sekolah ke <code>schools/{'{id}'}/private/security</code> dan
              membuat dokumen <code>users/{'{uid}'}/memberships/{'{schoolId}'}</code> untuk semua anggota sekolah lama.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmRealModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleRunRealMigration}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 shadow-xs transition-colors"
              >
                Ya, Eksekusi Sekarang
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
