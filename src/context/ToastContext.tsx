import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  X,
  HelpCircle,
} from 'lucide-react';
import { generateSecureId } from '../utils/idAndVoucherHelper';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}

export interface AlertDialogOptions {
  title?: string;
  message: string;
  onOk?: () => void;
}

interface ToastContextValue {
  toasts: ToastItem[];
  showToast: (type: ToastType, message: string, title?: string, duration?: number) => string;
  success: (message: string, title?: string, duration?: number) => string;
  error: (message: string, title?: string, duration?: number) => string;
  warning: (message: string, title?: string, duration?: number) => string;
  info: (message: string, title?: string, duration?: number) => string;
  dismissToast: (id: string) => void;
  confirm: (options: ConfirmDialogOptions) => void;
  alert: (options: AlertDialogOptions | string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [activeConfirm, setActiveConfirm] = useState<ConfirmDialogOptions | null>(null);
  const [activeAlert, setActiveAlert] = useState<AlertDialogOptions | null>(null);
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const dismissToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (type: ToastType, message: string, title?: string, duration = 4500): string => {
      const id = generateSecureId('toast');
      const newToast: ToastItem = { id, type, title, message, duration };

      setToasts((prev) => [newToast, ...prev].slice(0, 5)); // Keep max 5 visible toasts

      if (duration > 0) {
        const timer = setTimeout(() => {
          dismissToast(id);
        }, duration);
        timersRef.current.set(id, timer);
      }

      return id;
    },
    [dismissToast]
  );

  const success = useCallback(
    (message: string, title?: string, duration?: number) => showToast('success', message, title, duration),
    [showToast]
  );
  const error = useCallback(
    (message: string, title?: string, duration?: number) => showToast('error', message, title, duration),
    [showToast]
  );
  const warning = useCallback(
    (message: string, title?: string, duration?: number) => showToast('warning', message, title, duration),
    [showToast]
  );
  const info = useCallback(
    (message: string, title?: string, duration?: number) => showToast('info', message, title, duration),
    [showToast]
  );

  const confirm = useCallback((options: ConfirmDialogOptions) => {
    setActiveConfirm(options);
  }, []);

  const alert = useCallback((options: AlertDialogOptions | string) => {
    if (typeof options === 'string') {
      setActiveAlert({ message: options });
    } else {
      setActiveAlert(options);
    }
  }, []);

  const handleConfirmAction = async () => {
    if (activeConfirm) {
      const fn = activeConfirm.onConfirm;
      setActiveConfirm(null);
      await fn();
    }
  };

  const handleCancelAction = () => {
    if (activeConfirm?.onCancel) {
      activeConfirm.onCancel();
    }
    setActiveConfirm(null);
  };

  const handleAlertClose = () => {
    if (activeAlert?.onOk) {
      activeAlert.onOk();
    }
    setActiveAlert(null);
  };

  return (
    <ToastContext.Provider
      value={{
        toasts,
        showToast,
        success,
        error,
        warning,
        info,
        dismissToast,
        confirm,
        alert,
      }}
    >
      {children}

      {/* Floating Toast Notification Stack */}
      <div
        aria-live="polite"
        className="fixed top-4 right-4 z-[9999] flex flex-col gap-2.5 max-w-md w-full pointer-events-none px-3"
      >
        {toasts.map((toast) => {
          let bgColor = 'bg-slate-900 border-slate-700 text-white';
          let icon = <Info className="w-5 h-5 text-blue-400 shrink-0" />;

          if (toast.type === 'success') {
            bgColor = 'bg-gradient-to-r from-emerald-950 via-slate-900 to-emerald-950 border-emerald-500/40 text-emerald-100';
            icon = <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />;
          } else if (toast.type === 'error') {
            bgColor = 'bg-gradient-to-r from-rose-950 via-slate-900 to-rose-950 border-rose-500/40 text-rose-100';
            icon = <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />;
          } else if (toast.type === 'warning') {
            bgColor = 'bg-gradient-to-r from-amber-950 via-slate-900 to-amber-950 border-amber-500/40 text-amber-100';
            icon = <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />;
          }

          return (
            <div
              key={toast.id}
              role="status"
              className={`pointer-events-auto p-4 rounded-xl border shadow-2xl backdrop-blur-md flex items-start gap-3 transition-all duration-300 animate-in slide-in-from-top-3 ${bgColor}`}
            >
              {icon}
              <div className="flex-1 min-w-0">
                {toast.title && <h5 className="font-bold text-xs uppercase tracking-wider mb-0.5">{toast.title}</h5>}
                <p className="text-xs leading-relaxed text-slate-200">{toast.message}</p>
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition shrink-0"
                aria-label="Tutup pemberitahuan"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Modern Replacement for window.confirm() */}
      {activeConfirm && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-800">
            <div className="p-5 flex items-start gap-3.5">
              <div
                className={`p-2.5 rounded-xl shrink-0 ${
                  activeConfirm.isDestructive
                    ? 'bg-rose-100 text-rose-600'
                    : 'bg-indigo-100 text-indigo-600'
                }`}
              >
                {activeConfirm.isDestructive ? (
                  <AlertCircle className="w-6 h-6" />
                ) : (
                  <HelpCircle className="w-6 h-6" />
                )}
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm sm:text-base">
                  {activeConfirm.title || 'Konfirmasi Tindakan'}
                </h4>
                <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed">
                  {activeConfirm.message}
                </p>
              </div>
            </div>

            <div className="bg-slate-50 px-5 py-3.5 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={handleCancelAction}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/80 rounded-xl transition cursor-pointer"
              >
                {activeConfirm.cancelText || 'Batal'}
              </button>
              <button
                type="button"
                onClick={handleConfirmAction}
                className={`px-4 py-2 text-xs font-semibold rounded-xl text-white shadow-xs transition cursor-pointer ${
                  activeConfirm.isDestructive
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {activeConfirm.confirmText || 'Lanjutkan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modern Replacement for window.alert() */}
      {activeAlert && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden text-slate-800">
            <div className="p-5 flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-blue-100 text-blue-600 shrink-0">
                <Info className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm sm:text-base">
                  {activeAlert.title || 'Informasi Penting'}
                </h4>
                <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed">
                  {activeAlert.message}
                </p>
              </div>
            </div>

            <div className="bg-slate-50 px-5 py-3.5 border-t border-slate-100 flex items-center justify-end">
              <button
                type="button"
                onClick={handleAlertClose}
                className="px-5 py-2 text-xs font-semibold rounded-xl text-white bg-slate-800 hover:bg-slate-900 shadow-xs transition cursor-pointer"
              >
                Mengerti
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
};

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
