import React, { useState } from 'react';
import { X, Calculator, Save } from 'lucide-react';
import { RabSubItem, AllocationSplit } from '../types';

interface AllocationSplitModalProps {
  item: RabSubItem;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (split: AllocationSplit) => void;
}

export const AllocationSplitModal: React.FC<AllocationSplitModalProps> = ({
  item,
  isOpen,
  onClose,
  onConfirm,
}) => {
  const totalValue = item.jumlah || 0;
  // Default split based on a hypothetical 60/40 ratio, or we could fetch AHSP data here
  const [materialValue, setMaterialValue] = useState(totalValue * 0.6);
  const [laborValue, setLaborValue] = useState(totalValue * 0.4);

  if (!isOpen) return null;

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
              className="w-full px-3 py-2 rounded-lg border border-emerald-200 text-sm"
            />
          </div>
          
          <div className="p-4 bg-purple-50 rounded-lg">
            <label className="block text-xs font-bold text-purple-800 uppercase mb-1">Nilai Upah (Ke Pekerja)</label>
            <input
              type="number"
              value={laborValue}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0;
                setLaborValue(val);
                setMaterialValue(totalValue - val);
              }}
              className="w-full px-3 py-2 rounded-lg border border-purple-200 text-sm"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">Batal</button>
          <button onClick={handleConfirm} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700">
            <Save className="w-4 h-4" />
            Konfirmasi Alokasi
          </button>
        </div>
      </div>
    </div>
  );
};
