import React, { useState } from 'react';
import { AlertCircle, Check, X, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { DataAnomalyProposal } from '../services/storageService';

interface AnomalyReviewModalProps {
  isOpen: boolean;
  proposals: DataAnomalyProposal[];
  onApplySelected: (selectedIds: string[]) => void;
  onClose: () => void;
}

export const AnomalyReviewModal: React.FC<AnomalyReviewModalProps> = ({
  isOpen,
  proposals,
  onApplySelected,
  onClose,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>(() => proposals.map((p) => p.id));

  if (!isOpen) return null;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleApply = () => {
    onApplySelected(selectedIds);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full p-6 text-white shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-4 pb-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Tinjau Usulan Perbaikan Konsistensi Data</h2>
              <p className="text-xs text-slate-400">
                Ditemukan {proposals.length} ketidaksesuaian data yang diusulkan untuk diselaraskan.
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

        <p className="text-xs text-slate-300 mb-4 shrink-0">
          Sesuai standar audit LPJ, sistem <strong>tidak pernah mengubah data pembukuan Anda secara diam-diam</strong>.
          Pilih usulan perbaikan yang ingin Anda terapkan di bawah ini:
        </p>

        {/* Proposals List */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {proposals.map((item) => {
            const isSelected = selectedIds.includes(item.id);
            return (
              <div
                key={item.id}
                onClick={() => toggleSelect(item.id)}
                className={`p-3.5 rounded-xl border transition cursor-pointer ${
                  isSelected
                    ? 'bg-blue-950/40 border-blue-500/50 text-white'
                    : 'bg-slate-800/40 border-slate-700/60 text-slate-300 opacity-70'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}}
                    className="mt-0.5 rounded text-blue-600 focus:ring-0 shrink-0 cursor-pointer"
                  />
                  <div className="flex-1 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">{item.title}</span>
                      <span className="text-[10px] bg-slate-700 px-2 py-0.5 rounded text-slate-300 font-mono">
                        {item.category}
                      </span>
                    </div>
                    <p className="text-slate-400">{item.description}</p>
                    <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800 space-y-1 font-mono text-[11px]">
                      <div className="text-rose-400 truncate">
                        <span className="text-slate-500">Teks Semula: </span>
                        {item.originalText || '(kosong)'}
                      </div>
                      <div className="text-emerald-400 truncate">
                        <span className="text-slate-500">Usulan Perbaikan: </span>
                        {item.suggestedText}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition"
          >
            Abaikan Semua
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedIds(proposals.map((p) => p.id))}
              className="px-3 py-2 text-xs text-blue-400 hover:text-blue-300 font-medium transition"
            >
              Pilih Semua
            </button>
            <button
              onClick={handleApply}
              disabled={selectedIds.length === 0}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs transition flex items-center gap-2 cursor-pointer shadow-lg shadow-blue-600/30"
            >
              <Check className="w-4 h-4" />
              <span>Terapkan ({selectedIds.length}) Perbaikan</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
