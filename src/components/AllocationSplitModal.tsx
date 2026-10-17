import React, { useState } from 'react';
import { X, Calculator, Save, RefreshCw } from 'lucide-react';
import { RabSubItem, AllocationSplit } from '../types';
import { formatRupiah } from '../utils/formatters';

interface AllocationSplitModalProps {
  item: RabSubItem;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (split: AllocationSplit) => void;
  initialMaterial?: number;
  initialLabor?: number;
}

export const AllocationSplitModal: React.FC<AllocationSplitModalProps> = ({
  item,
  isOpen,
  onClose,
  onConfirm,
  initialMaterial,
  initialLabor,
}) => {
  const totalValue = item.jumlah || 0;
  // Use passed initial values or default
  const [materialValue, setMaterialValue] = useState(initialMaterial ?? (totalValue * 0.6));
  const [laborValue, setLaborValue] = useState(initialLabor ?? (totalValue * 0.4));

  if (!isOpen) return null;

  const handleApplyRatio = () => {
    if (initialMaterial !== undefined && initialLabor !== undefined) {
      setMaterialValue(initialMaterial);
      setLaborValue(initialLabor);
    }
  };

  const handleConfirm = () => {
    onConfirm({
      materialValue,
      laborValue,
      isConfirmed: true,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-800">Alokasi Terkonfirmasi (Virtual Split)</h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>
        
        <p className="text-sm text-slate-600 mb-4">Pekerjaan: <strong>{item.uraian}</strong></p>
        
        <div className="space-y-4">
          <div className="p-4 bg-emerald-50 rounded-lg">
            <label className="block text-xs font-bold text-emerald-800 uppercase mb-1">Nilai Material (MAT)</label>
            <input
              type="number"
              value={materialValue}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                setMaterialValue(val);
                setLaborValue(totalValue - val);
              }}
              className="w-full px-3 py-2 rounded-lg border border-emerald-200 text-sm font-mono font-bold"
            />
          </div>
          
          <div className="p-4 bg-purple-50 rounded-lg">
            <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-purple-800 uppercase">Nilai Upah (Ke Pekerja)</label>
                {initialLabor !== undefined && (
                    <span className="text-[10px] text-purple-600 font-bold bg-purple-100 px-1.5 py-0.5 rounded">
                        Referensi AHSP: {formatRupiah(initialLabor)}
                    </span>
                )}
            </div>
            <input
              type="number"
              value={laborValue}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                setLaborValue(val);
                setMaterialValue(totalValue - val);
              }}
              className="w-full px-3 py-2 rounded-lg border border-purple-200 text-sm font-mono font-bold"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={handleApplyRatio} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-amber-100 text-amber-800 hover:bg-amber-200">
            <RefreshCw className="w-4 h-4" />
            Terapkan Rasio AHSP
          </button>
          <button onClick={handleConfirm} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700">
            <Save className="w-4 h-4" />
            Konfirmasi Alokasi
          </button>
        </div>
      </div>
    </div>
  );
};
