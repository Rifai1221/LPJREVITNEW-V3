import React from 'react';
import { FileSpreadsheet, X, CheckCircle2, Sparkles } from 'lucide-react';
import { formatNumber } from '../../utils/formatters';

export interface WeeklyExcelUploadPreview {
  message: string;
  summary: {
    weeksCount: number;
    divisionsCount: number;
    totalBobot: number;
    totalRealisasiAkhir: number;
  };
  data: Array<{
    mingguKe: number;
    periode: string;
    bobotRencana: number;
    bobotRealisasi: number;
    deviasi: number;
    divisions?: Array<{
      id: string;
      prestasiMingguIni: number;
    }>;
  }>;
}

interface WeeklyExcelModalProps {
  uploadPreviewData: WeeklyExcelUploadPreview | null;
  onClose: () => void;
  onConfirm: () => void;
}

export const WeeklyExcelModal: React.FC<WeeklyExcelModalProps> = ({
  uploadPreviewData,
  onClose,
  onConfirm,
}) => {
  if (!uploadPreviewData) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-200 bg-gradient-to-r from-emerald-600 via-teal-700 to-indigo-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/20 rounded-xl shadow-inner">
              <FileSpreadsheet className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold">
                Konfirmasi Impor Data Excel Laporan Mingguan & Bobot
              </h3>
              <p className="text-xs text-emerald-100">
                Periksa ringkasan capaian fisik mingguan sebelum diterapkan dan disinkronkan ke seluruh sistem
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition cursor-pointer"
            title="Tutup Pratinjau"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Informational Banner */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-emerald-950">
                {uploadPreviewData.message}
              </p>
              <p className="text-[11px] text-emerald-800 mt-0.5 leading-relaxed">
                Sistem telah mengkalkulasi ulang prestasi kumulatif, realisasi, dan deviasi mingguan. Data ini siap disinkronkan ke Rekapitulasi Bobot, Kwitansi, Bon Toko, Absensi Upah, BKU, BKT, dan BKB.
              </p>
            </div>
          </div>

          {/* Summary Stats Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Total Periode
              </span>
              <span className="text-lg font-black text-slate-900 mt-1 block">
                {uploadPreviewData.summary.weeksCount} Minggu
              </span>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Uraian Pekerjaan
              </span>
              <span className="text-lg font-black text-slate-900 mt-1 block">
                {uploadPreviewData.summary.divisionsCount > 0
                  ? `${uploadPreviewData.summary.divisionsCount} Item`
                  : 'Kurva Jadwal'}
              </span>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Total Bobot Pekerjaan
              </span>
              <span className="text-lg font-black text-emerald-700 mt-1 block">
                {formatNumber(uploadPreviewData.summary.totalBobot, 2, 2)}%
              </span>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 shadow-2xs">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Realisasi Akhir (Kurva)
              </span>
              <span className="text-lg font-black text-blue-700 mt-1 block">
                {formatNumber(uploadPreviewData.summary.totalRealisasiAkhir, 2, 2)}%
              </span>
            </div>
          </div>

          {/* Table of Weekly Progress Results */}
          <div>
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>Pratinjau Jadwal & Bobot Tiap Minggu:</span>
              <span className="text-[11px] font-normal text-slate-500">
                {uploadPreviewData.data.length} Minggu Terdata
              </span>
            </h4>
            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto shadow-2xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200 z-10">
                  <tr>
                    <th className="py-2.5 px-3 border-r border-slate-200 text-center w-16">Minggu</th>
                    <th className="py-2.5 px-3 border-r border-slate-200">Periode Pelaksanaan</th>
                    <th className="py-2.5 px-3 border-r border-slate-200 text-right w-28">Target (%)</th>
                    <th className="py-2.5 px-3 border-r border-slate-200 text-right w-28 bg-emerald-50 text-emerald-950">Minggu Ini (%)</th>
                    <th className="py-2.5 px-3 border-r border-slate-200 text-right w-28 bg-blue-50 text-blue-950">Realisasi (%)</th>
                    <th className="py-2.5 px-3 text-right w-28">Deviasi (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {uploadPreviewData.data.map((w) => {
                    const sumIni = (w.divisions || []).reduce((s, d) => s + (d.prestasiMingguIni || 0), 0);
                    const isDevPos = w.deviasi >= 0;
                    return (
                      <tr key={w.mingguKe} className="hover:bg-slate-50 transition">
                        <td className="py-2 px-3 border-r border-slate-200 text-center font-bold text-slate-800">
                          M{w.mingguKe}
                        </td>
                        <td className="py-2 px-3 border-r border-slate-200 font-medium text-slate-700">
                          {w.periode}
                        </td>
                        <td className="py-2 px-3 border-r border-slate-200 text-right font-mono text-slate-700">
                          {formatNumber(w.bobotRencana, 2, 2)}%
                        </td>
                        <td className="py-2 px-3 border-r border-slate-200 text-right font-mono font-bold text-emerald-700 bg-emerald-50/30">
                          {sumIni > 0 ? `${formatNumber(sumIni, 2, 2)}%` : '-'}
                        </td>
                        <td className="py-2 px-3 border-r border-slate-200 text-right font-mono font-black text-blue-900 bg-blue-50/30">
                          {formatNumber(w.bobotRealisasi, 2, 2)}%
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold">
                          <span className={isDevPos ? 'text-emerald-700' : 'text-rose-700'}>
                            {isDevPos ? `+${formatNumber(w.deviasi, 2, 2)}%` : `${formatNumber(w.deviasi, 2, 2)}%`}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer transition"
          >
            Batal
          </button>

          <button
            type="button"
            onClick={onConfirm}
            className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold shadow-md transition hover:shadow-lg cursor-pointer flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-200" />
            <span>✓ Terapkan Data Excel ke Seluruh Jadwal</span>
          </button>
        </div>
      </div>
    </div>
  );
};
