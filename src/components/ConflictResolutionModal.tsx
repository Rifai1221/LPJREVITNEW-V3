import React from 'react';
import { AlertTriangle, DownloadCloud, UploadCloud, FileDown, X } from 'lucide-react';
import { AppStateData } from '../types';

interface ConflictResolutionModalProps {
  isOpen: boolean;
  serverRev: number;
  localRev: number;
  serverState?: AppStateData;
  localState: AppStateData;
  onResolveUseCloud: () => void;
  onResolveUseMine: () => void;
  onResolveDownloadBoth: () => void;
  onClose: () => void;
}

export const ConflictResolutionModal: React.FC<ConflictResolutionModalProps> = ({
  isOpen,
  serverRev,
  localRev,
  onResolveUseCloud,
  onResolveUseMine,
  onResolveDownloadBoth,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-amber-500/40 rounded-2xl max-w-lg w-full p-6 text-white shadow-2xl shadow-amber-500/10">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Konflik Sinkronisasi Data</h2>
              <p className="text-xs text-amber-300">
                Data di cloud lebih baru (Revisi Cloud: {serverRev} vs Lokal: {localRev})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed mb-6">
          Dokumen ini telah diubah dan disimpan dari perangkat atau tab browser lain.
          Untuk mencegah data tertimpa secara tidak sengaja, pilih salah satu opsi penyelesaian berikut:
        </p>

        <div className="space-y-3">
          {/* Opsi 1: Pakai cloud */}
          <button
            type="button"
            onClick={onResolveUseCloud}
            className="w-full text-left p-4 rounded-xl bg-slate-800/60 border border-slate-700 hover:bg-slate-800 hover:border-emerald-500/50 transition flex items-start gap-3.5 group cursor-pointer"
          >
            <div className="w-9 h-9 rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
              <DownloadCloud className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-emerald-200">Pakai cloud</span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-400/30">Terbaru</span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Memuat data versi cloud (revisi {serverRev}) dan membuang perubahan lokal di perangkat ini.
              </p>
            </div>
          </button>

          {/* Opsi 2: Pakai milik saya */}
          <button
            type="button"
            onClick={onResolveUseMine}
            className="w-full text-left p-4 rounded-xl bg-slate-800/60 border border-slate-700 hover:bg-slate-800 hover:border-amber-500/50 transition flex items-start gap-3.5 group cursor-pointer"
          >
            <div className="w-9 h-9 rounded-lg bg-amber-600/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <span className="text-sm font-bold text-amber-200">Pakai milik saya</span>
              <p className="text-xs text-slate-400 mt-0.5">
                Mempertahankan data dari perangkat Anda dan menimpa versi cloud.
              </p>
            </div>
          </button>

          {/* Opsi 3: Unduh keduanya */}
          <button
            type="button"
            onClick={onResolveDownloadBoth}
            className="w-full text-left p-4 rounded-xl bg-blue-950/40 border border-blue-500/40 hover:bg-blue-900/50 hover:border-blue-400 transition flex items-start gap-3.5 group cursor-pointer"
          >
            <div className="w-9 h-9 rounded-lg bg-blue-600/30 text-blue-400 border border-blue-500/40 flex items-center justify-center shrink-0 group-hover:scale-105 transition">
              <FileDown className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-blue-200">Unduh keduanya</span>
                <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full border border-blue-400/30">Paling Aman</span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Mengunduh data lokal Anda sebagai file cadangan JSON, lalu memuat versi cloud terbaru.
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
