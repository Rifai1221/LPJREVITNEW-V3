import React, { useState } from 'react';
import { AlertCircle, ChevronRight, X, ShieldAlert, ArrowRight } from 'lucide-react';
import { ReconciliationAlert } from '../utils/reconciliationValidator';

interface ReconciliationBannerProps {
  alerts: ReconciliationAlert[];
  onNavigateTab: (tab: string) => void;
}

export const ReconciliationBanner: React.FC<ReconciliationBannerProps> = ({
  alerts,
  onNavigateTab,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  const activeAlerts = alerts.filter((a) => !dismissedIds.includes(a.id));
  if (activeAlerts.length === 0) return null;

  return (
    <div className="mb-6 rounded-2xl bg-gradient-to-r from-rose-950/90 via-red-950/80 to-rose-950/90 border border-rose-500/50 p-4 shadow-xl text-white animate-in slide-in-from-top-2 duration-300">
      <div className="flex items-start justify-between gap-4">
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
              Sistem mendeteksi ketidaksesuaian pembukuan keuangan (BKU/BKB/BKT/Pajak). Klik pada peringatan di bawah untuk langsung menuju data penyebab.
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs text-rose-300 hover:text-white underline cursor-pointer shrink-0 mt-1 font-semibold"
        >
          {isExpanded ? 'Tutup Rincian' : 'Lihat Semua Rincian'}
        </button>
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
  );
};
