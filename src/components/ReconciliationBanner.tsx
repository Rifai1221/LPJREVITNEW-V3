import React, { useState, useMemo } from 'react';
import { AlertCircle, ShieldAlert, ArrowRight, Scale, X, Search, CheckCircle2, RefreshCw } from 'lucide-react';
import { ReconciliationAlert } from '../utils/reconciliationValidator';
import { AppStateData } from '../types';
import { auditWageMaterial, WageMaterialAuditReport } from '../utils/wageMaterialAuditor';

interface ReconciliationBannerProps {
  alerts: ReconciliationAlert[];
  onNavigateTab: (tab: string) => void;
  appState?: AppStateData;
  onSyncBkbFromBku?: () => void;
}

export const ReconciliationBanner: React.FC<ReconciliationBannerProps> = ({
  alerts,
  onNavigateTab,
  appState,
  onSyncBkbFromBku,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [auditSearch, setAuditSearch] = useState('');

  const activeAlerts = alerts.filter((a) => !dismissedIds.includes(a.id));

  const auditReport: WageMaterialAuditReport | null = useMemo(() => {
    if (!appState || !isAuditModalOpen) return null;
    return auditWageMaterial(appState);
  }, [appState, isAuditModalOpen]);

  const filteredAuditItems = useMemo(() => {
    if (!auditReport) return [];
    if (!auditSearch.trim()) return auditReport.items;
    const q = auditSearch.toLowerCase();
    return auditReport.items.filter(
      (it) => it.uraian.toLowerCase().includes(q) || it.divisionCode.toLowerCase().includes(q)
    );
  }, [auditReport, auditSearch]);

  const handleOpenAudit = () => {
    if (appState) {
      auditWageMaterial(appState);
    }
    setIsAuditModalOpen(true);
  };

  if (activeAlerts.length === 0 && !isAuditModalOpen) return null;

  return (
    <>
      {activeAlerts.length > 0 && (
        <div className="mb-6 rounded-2xl bg-gradient-to-r from-rose-950/90 via-red-950/80 to-rose-950/90 border border-rose-500/50 p-4 shadow-xl text-white animate-in slide-in-from-top-2 duration-300">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center shrink-0 mt-0.5">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm sm:text-base text-rose-100">
                    Peringatan Validasi Rekonsiliasi Keuangan
                  </span>
                  <span className="text-[11px] font-semibold bg-rose-500/30 text-rose-200 px-2.5 py-0.5 rounded-full border border-rose-400/40">
                    {activeAlerts.length} Perlu Penyelarasan
                  </span>
                </div>
                <p className="text-xs text-rose-200/80 mt-1">
                  Sistem mendeteksi ketidaksesuaian pembukuan keuangan (BKU/BKB/BKT/Pajak/Upah). Klik pada peringatan di bawah untuk menuju data terkait.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {onSyncBkbFromBku && (
                <button
                  type="button"
                  onClick={onSyncBkbFromBku}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/30 hover:bg-emerald-500/40 text-emerald-100 border border-emerald-400/40 text-xs font-bold cursor-pointer transition shadow-xs"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-emerald-300 animate-spin-hover" />
                  <span>Sinkronkan BKB dari BKU</span>
                </button>
              )}
              {appState && (
                <button
                  type="button"
                  onClick={handleOpenAudit}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/30 hover:bg-amber-500/40 text-amber-200 border border-amber-400/40 text-xs font-semibold cursor-pointer transition shadow-xs"
                >
                  <Scale className="w-3.5 h-3.5 text-amber-300" />
                  <span>Audit Upah/Bahan</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="text-xs text-rose-300 hover:text-white underline cursor-pointer shrink-0 font-semibold px-2 py-1"
              >
                {isExpanded ? 'Tutup Rincian' : 'Lihat Semua Rincian'}
              </button>
            </div>
          </div>

          {/* Primary Alert (always visible) */}
          <div className="mt-3.5 space-y-2.5">
            {(isExpanded ? activeAlerts : [activeAlerts[0]]).map((alert) => (
              <div
                key={alert.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-black/40 border border-rose-500/30 hover:border-rose-400/60 transition group cursor-pointer"
                onClick={() => onNavigateTab(alert.targetTab)}
              >
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <span className="font-bold text-rose-100 group-hover:text-white transition">
                      {alert.title}
                    </span>
                    <p className="text-rose-200/70 mt-0.5 leading-relaxed">{alert.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-xs transition group-hover:scale-105">
                    <span>Periksa di Tab {alert.targetTab.toUpperCase()}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal Audit Upah & Bahan */}
      {isAuditModalOpen && auditReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden text-slate-800 animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center justify-center">
                  <Scale className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base sm:text-lg">Audit Per-Item RAB: Upah vs Material</h3>
                  <p className="text-xs text-slate-300">
                    Pelacakan nominal RAB ke realisasi kwitansi toko material & upah kerja pekerja
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAuditModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Metric Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50 border-b border-slate-200 text-xs">
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-slate-500">Pagu Total RAB</span>
                <p className="text-sm font-bold text-slate-800 mt-0.5">
                  Rp {auditReport.totalRab.toLocaleString('id-ID')}
                </p>
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-slate-500">Pagu Material vs Realisasi</span>
                <p className="text-xs font-bold text-slate-800 mt-0.5">
                  Rp {auditReport.totalPorsiMaterial.toLocaleString('id-ID')}
                </p>
                <span className={`text-[11px] font-semibold ${auditReport.selisihTotalMaterial === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  Real: Rp {auditReport.totalRealisasiMaterial.toLocaleString('id-ID')}
                </span>
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-slate-500">Pagu Upah vs Realisasi</span>
                <p className="text-xs font-bold text-slate-800 mt-0.5">
                  Rp {auditReport.totalPorsiUpah.toLocaleString('id-ID')}
                </p>
                <span className={`text-[11px] font-semibold ${auditReport.selisihTotalUpah === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  Real: Rp {auditReport.totalRealisasiUpah.toLocaleString('id-ID')}
                </span>
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-slate-500">Status Keseimbangan</span>
                <div className="flex items-center gap-1.5 mt-1 font-bold text-xs">
                  {auditReport.selisihTotalUpah === 0 && auditReport.selisihTotalMaterial === 0 ? (
                    <span className="text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" /> 100% Presisi
                    </span>
                  ) : (
                    <span className="text-amber-600">
                      Selisih Rp {Math.abs(auditReport.selisihTotalUpah).toLocaleString('id-ID')}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Search Bar */}
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2 bg-white">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                placeholder="Cari uraian item pekerjaan atau divisi..."
                className="w-full text-xs text-slate-800 bg-transparent focus:outline-hidden"
              />
            </div>

            {/* Table Content */}
            <div className="flex-1 overflow-auto p-4">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-[11px] bg-slate-50 uppercase tracking-wider sticky top-0">
                    <th className="py-2.5 px-3">Divisi</th>
                    <th className="py-2.5 px-3">Uraian Item RAB</th>
                    <th className="py-2.5 px-3 text-right">RAB (Rp)</th>
                    <th className="py-2.5 px-3 text-right">Porsi Mat</th>
                    <th className="py-2.5 px-3 text-right">Porsi Upah</th>
                    <th className="py-2.5 px-3 text-right">Real Mat</th>
                    <th className="py-2.5 px-3 text-right">Real Upah</th>
                    <th className="py-2.5 px-3 text-right">Selisih</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAuditItems.map((row) => (
                    <tr key={row.itemId} className="hover:bg-slate-50 transition">
                      <td className="py-2.5 px-3 font-semibold text-slate-600 whitespace-nowrap">
                        {row.divisionCode}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-800">
                        {row.uraian}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-slate-900 whitespace-nowrap">
                        Rp {row.jumlahRab.toLocaleString('id-ID')}
                      </td>
                      <td className="py-2.5 px-3 text-right text-emerald-700 whitespace-nowrap">
                        Rp {row.porsiMaterial.toLocaleString('id-ID')}
                      </td>
                      <td className="py-2.5 px-3 text-right text-purple-700 whitespace-nowrap">
                        Rp {row.porsiUpah.toLocaleString('id-ID')}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-700 whitespace-nowrap">
                        Rp {row.realisasiMaterial.toLocaleString('id-ID')}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-700 whitespace-nowrap">
                        Rp {row.realisasiUpah.toLocaleString('id-ID')}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold whitespace-nowrap">
                        {row.totalDiscrepancy === 0 ? (
                          <span className="text-emerald-600">Rp 0</span>
                        ) : (
                          <span className="text-amber-600">
                            ± Rp {row.totalDiscrepancy.toLocaleString('id-ID')}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredAuditItems.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        Tidak ada item RAB yang cocok dengan pencarian.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
              <span>Menampilkan {filteredAuditItems.length} item RAB (Diurutkan dari selisih terbesar)</span>
              <button
                type="button"
                onClick={() => setIsAuditModalOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-medium cursor-pointer transition"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
