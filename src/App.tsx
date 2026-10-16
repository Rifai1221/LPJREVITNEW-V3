import React, { useState, useEffect, useMemo, useRef } from 'react';
import confetti from 'canvas-confetti';
import {
  SchoolMasterData,
  RpdItem,
  WorkerItem,
  StoreVendor,
  WeeklyWageReport,
  KwitansiDocument,
  BkuTransaction,
  BktTransaction,
  BkbTransaction,
  TaxRecord,
  ProjectProgressWeek,
  AppStateData,
} from './types';
import {
  calculateBkuFromTransactions,
  calculateBktFromBku,
  generateTaxesFromKwitansi,
  generateWeeklyTransactionsFromProgressAndRealData,
  generateRealisticMultiWeekTransactions,
  normalizeMaterialItems,
  isPureDirectMaterial,
  healKwitansiList,
  rebalanceAndResyncAllKwitansiToBudget,
  calibrateAllTransactionsToCurrentProgress,
  extractWeekNumberFromKwitansi,
  deduplicateKwitansiList,
  renumberKwitansiChronologically,
  consolidateAndStandardizeReceiptItems,
} from './services/autoGeneratorService';
import {
  generateStandardBkbRecords,
  calculateRunningBkb,
  calculateIntegratedBkt,
  reconcileCashBalances,
} from './services/cashLedgerIntegrationService';
import {
  SchoolTenant,
  DEFAULT_PRESET_TENANTS,
  PRESET_SDN1_MUARA_DUA,
  createSchoolStateForTenant,
} from './data/tenantPresets';
import {
  getAllSchoolTenants,
  getStoredActiveTenantId,
  setStoredActiveTenantId,
  getGlobalActiveTenantId,
  loadSchoolTenantAppState,
  saveSchoolTenantAppState,
  registerNewSchoolTenant,
  deleteSchoolTenant,
  checkIsQuotaExhausted,
} from './services/schoolTenantService';
import { getMonthFromPeriodString, resolveWeekDates } from './utils/monthHelper';
import { syncProgressWeeksWithRealData, calculateSequentialWaterfallRpdItems } from './utils/divisionHelper';
import { firestoreDatabaseId } from './services/firebase';
import { initialProgressWeeks, initialWorkers, initialStores } from './data/initialData';

import { Header } from './components/Header';
import { Dashboard } from './components/Dashboard';
import { MasterDataForm } from './components/MasterDataForm';
import { RpdManager } from './components/RpdManager';
import { WeeklyProgressManager } from './components/WeeklyProgressManager';
import { BkuManager } from './components/BkuManager';
import { BktManager } from './components/BktManager';
import { BkbManager } from './components/BkbManager';
import { TaxManager } from './components/TaxManager';
import { KwitansiManager } from './components/KwitansiManager';
import { WageManager } from './components/WageManager';
import { StoreVendorManager } from './components/StoreVendorManager';
import { RealSchoolDataManager } from './components/RealSchoolDataManager';
import { PrintDocumentViewer } from './components/PrintDocumentViewer';
import { QuickReceiptModal } from './components/QuickReceiptModal';
import { BackupRestoreModal } from './components/BackupRestoreModal';
import { SchoolTenantPortalModal } from './components/SchoolTenantPortalModal';
import { GoogleSheetsSyncModal } from './components/GoogleSheetsSyncModal';
import { LoginPortal } from './components/LoginPortal';
import {
  initAuth,
  getAccessToken,
  googleSignIn,
  logoutGoogle,
  GoogleUserProfile,
  getCurrentUser,
  loadPersistentAuthSession,
} from './services/googleAuthService';
import { syncStateToSpreadsheet } from './services/googleSheetsService';
import { CheckCircle2, Database, ShieldAlert, Sparkles, X, Trash2, RefreshCw, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { defaultRealSchoolData } from './data/realSchoolData';
import { RealSchoolData, RpdKategori } from './types';

export default function App() {
  // Multi-Tenant States
  const [tenants, setTenants] = useState<SchoolTenant[]>(DEFAULT_PRESET_TENANTS);
  const [currentTenant, setCurrentTenant] = useState<SchoolTenant>(() => {
    const savedId = getStoredActiveTenantId();
    const found = DEFAULT_PRESET_TENANTS.find((t) => t.id === savedId);
    return found || PRESET_SDN1_MUARA_DUA;
  });
  const [isSchoolPortalOpen, setIsSchoolPortalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedText, setLastSyncedText] = useState('Otomatis');
  const [switchNotification, setSwitchNotification] = useState<string | null>(null);

  // Authentication & Login Mode States
  const [currentUser, setCurrentUser] = useState<GoogleUserProfile | null>(() => getCurrentUser() || loadPersistentAuthSession()?.user || null);
  const [isSigningInGoogle, setIsSigningInGoogle] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    try {
      const active = localStorage.getItem('LPJ_USER_SESSION_ACTIVE');
      return active === 'true' || !!loadPersistentAuthSession();
    } catch {
      return false;
    }
  });

  // Google Sheets & Drive Database States
  const [isGoogleSheetsModalOpen, setIsGoogleSheetsModalOpen] = useState(false);
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [googleSheetName, setGoogleSheetName] = useState<string | undefined>(undefined);
  const [isAutoSyncToGoogleSheets, setIsAutoSyncToGoogleSheets] = useState(() => {
    try {
      return localStorage.getItem('LPJ_AUTO_SYNC_GOOGLE_SHEETS') === 'true';
    } catch {
      return false;
    }
  });

  // App State per Tenant
  const [appState, setAppState] = useState<AppStateData>(() =>
    createSchoolStateForTenant(PRESET_SDN1_MUARA_DUA, 'full')
  );
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [bkuWeekLimit, setBkuWeekLimit] = useState<number>(() => {
    return Number(localStorage.getItem('bkuWeekLimit') || '2');
  });

  // Print modal state
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printDocType, setPrintDocType] = useState<string>('ALL');
  const [printMonth, setPrintMonth] = useState<string | undefined>(undefined);
  const [printWeekNum, setPrintWeekNum] = useState<number | undefined>(undefined);
  const [printKwitansiId, setPrintKwitansiId] = useState<string | undefined>(undefined);
  const [printFilterOptions, setPrintFilterOptions] = useState<any | undefined>(undefined);

  // Quick Receipt modal state
  const [isQuickReceiptOpen, setIsQuickReceiptOpen] = useState(false);

  // Backup & Restore modal state
  const [isBackupRestoreOpen, setIsBackupRestoreOpen] = useState(false);

  // Debounce ref and protection flags
  const saveTimeoutRef = useRef<any>(null);
  const isLoadedRef = useRef(false);
  const isDirtyRef = useRef(false);

  // 1. Initial Load of Tenants and School Data from Cloud Firestore
  // CRITICAL: Prioritizes existing Cloud Firestore documents so data from previous deploys/publishes is never lost!
  useEffect(() => {
    let isMounted = true;

    async function initializeTenantData() {
      try {
        const tenantList = await getAllSchoolTenants();
        if (!isMounted) return;
        setTenants(tenantList);

        // Check global active school pointer from Firestore first, then local storage, then fallback
        let targetTenant: SchoolTenant | undefined;
        const globalActiveId = await getGlobalActiveTenantId();
        if (globalActiveId) {
          targetTenant = tenantList.find((t) => t.id === globalActiveId);
        }

        if (!targetTenant) {
          const savedId = getStoredActiveTenantId();
          targetTenant = tenantList.find((t) => t.id === savedId);
        }

        const activeT = targetTenant || tenantList[0] || PRESET_SDN1_MUARA_DUA;
        setCurrentTenant(activeT);
        setStoredActiveTenantId(activeT.id);

        // Load isolated school state from Firestore
        const loaded = await loadSchoolTenantAppState(activeT);
        if (!isMounted) return;

        // Load 100% raw saved state on initial load/refresh without forced auto-overwrite
        setAppState(loaded.state);
        isLoadedRef.current = true;
        isDirtyRef.current = false; // Initial load is clean, never dirty!
        setIsInitialLoading(false);
        setLastSyncedText(
          loaded.source === 'cloud'
            ? 'Cloud Firestore'
            : loaded.source === 'cache'
            ? 'Memori Offline'
            : 'Template Awal'
        );
      } catch (err) {
        console.error('Initialization error:', err);
        if (isMounted) setIsInitialLoading(false);
      }
    }

    initializeTenantData();

    return () => {
      isMounted = false;
    };
  }, []);

  // Listen to Google Auth & refresh linked spreadsheet name for current active school
  useEffect(() => {
    const unsub = initAuth(
      (user) => {
        setIsGoogleConnected(true);
        if (user) {
          setCurrentUser(user);
        }
        try {
          const saved = localStorage.getItem(`GOOGLE_SHEET_INFO_${currentTenant.id}`);
          if (saved) {
            const parsed = JSON.parse(saved);
            setGoogleSheetName(parsed.name);
          } else {
            setGoogleSheetName(undefined);
          }
        } catch {}
      },
      () => {
        setIsGoogleConnected(false);
        setGoogleSheetName(undefined);
      }
    );
    return () => unsub();
  }, [currentTenant.id]);

  // 2. Real-time Cloud Auto-Save on state change (Debounced to Firestore)
  // CRITICAL: NEVER auto-save unless data has been successfully loaded AND user has explicitly modified it!
  useEffect(() => {
    if (!isLoadedRef.current || !isDirtyRef.current) {
      return;
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    setIsSyncing(true);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const ok = await saveSchoolTenantAppState(currentTenant.id, appState);
        setIsSyncing(false);
        isDirtyRef.current = false;
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} WIB`;
        if (checkIsQuotaExhausted()) {
          setLastSyncedText(`Tersimpan di Memori Lokal ${timeStr}`);
        } else if (ok) {
          setLastSyncedText(`Tersimpan ${timeStr}`);
        } else {
          setLastSyncedText(`Tersimpan Offline ${timeStr}`);
        }

        // Auto-sync to user's Google Spreadsheet if enabled
        if (isAutoSyncToGoogleSheets && isGoogleConnected) {
          try {
            const saved = localStorage.getItem(`GOOGLE_SHEET_INFO_${currentTenant.id}`);
            const token = await getAccessToken();
            if (saved && token) {
              const parsed = JSON.parse(saved);
              if (parsed?.id) {
                syncStateToSpreadsheet(token, parsed.id, appState).catch(() => {});
              }
            }
          } catch {}
        }
      } catch (err) {
        console.warn('Auto-save notice:', err);
        setIsSyncing(false);
        setLastSyncedText('Tersimpan di Memori Lokal');
      }
    }, 1800);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [appState, currentTenant.id, isAutoSyncToGoogleSheets, isGoogleConnected]);

  // Handle switching to a different school database
  const handleSelectTenant = async (targetTenant: SchoolTenant) => {
    if (targetTenant.id === currentTenant.id) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    isDirtyRef.current = false;
    isLoadedRef.current = false;
    setIsSyncing(true);
    setStoredActiveTenantId(targetTenant.id);
    setCurrentTenant(targetTenant);

    try {
      const loaded = await loadSchoolTenantAppState(targetTenant);
      setAppState(loaded.state);
      isLoadedRef.current = true;
      isDirtyRef.current = false;
      setIsSyncing(false);
      setLastSyncedText(
        loaded.source === 'cloud'
          ? 'Cloud Firestore'
          : loaded.source === 'cache'
          ? 'Memori Offline'
          : 'Template Awal'
      );
      setSwitchNotification(`Berhasil beralih ke database ${targetTenant.namaSekolah}. Data terisolasi aman.`);
      setTimeout(() => setSwitchNotification(null), 5000);
    } catch (err) {
      console.error('Error switching tenant:', err);
      setIsSyncing(false);
    }
  };

  // Handle registering a new school
  const handleRegisterNewSchool = async (data: {
    namaSekolah: string;
    npsn: string;
    jenjang: 'TK/PAUD' | 'SD' | 'SMP/MTs' | 'SMA/SMK' | string;
    kabKota: string;
    provinsi: string;
    email: string;
    password?: string;
    templateType: 'full' | 'blank';
  }) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    isDirtyRef.current = false;
    isLoadedRef.current = false;
    setIsSyncing(true);

    try {
      const result = await registerNewSchoolTenant(data);
      setTenants((prev) => [...prev.filter((t) => t.id !== result.tenant.id), result.tenant]);
      setCurrentTenant(result.tenant);
      setStoredActiveTenantId(result.tenant.id);
      setAppState(result.state);
      isLoadedRef.current = true;
      isDirtyRef.current = false;
      setIsSyncing(false);
      setLastSyncedText('Database Baru Tersimpan');
      setSwitchNotification(`Database baru untuk ${result.tenant.namaSekolah} berhasil dibuat & tersimpan aman!`);
      setTimeout(() => setSwitchNotification(null), 6000);

      try {
        confetti({ particleCount: 70, spread: 80, origin: { y: 0.6 } });
      } catch {}
    } catch (err: any) {
      setIsSyncing(false);
      isLoadedRef.current = true;
      throw new Error(`Gagal menyimpan sekolah baru: ${err?.message || 'Koneksi database bermasalah'}`);
    }
  };

  // Delete School Tenant Confirmation Modal State
  const [tenantToDeleteConfirm, setTenantToDeleteConfirm] = useState<SchoolTenant | null>(null);
  const [isDeletingTenantLoading, setIsDeletingTenantLoading] = useState(false);

  // Trigger in-app confirmation modal for deleting school
  const handleDeleteTenant = (tenantToDelete: SchoolTenant) => {
    setTenantToDeleteConfirm(tenantToDelete);
  };

  // Execute permanent deletion of selected school and its database
  const handleConfirmDeleteTenant = async () => {
    if (!tenantToDeleteConfirm) return;
    const tenantToDelete = tenantToDeleteConfirm;
    setIsDeletingTenantLoading(true);

    // 1. Optimistic UI update: Remove the tenant immediately from local state (0ms delay)
    let updatedTenants = tenants.filter((t) => t.id !== tenantToDelete.id);

    // If no tenants left, automatically spawn a clean blank school database
    let nextTenant: SchoolTenant;
    if (updatedTenants.length === 0) {
      nextTenant = {
        id: `sch_${Date.now()}`,
        npsn: '',
        namaSekolah: 'SEKOLAH SAYA (LENGKAPI IDENTITAS)',
        jenjang: 'SD',
        kabKota: '',
        provinsi: '',
        email: '',
        isDemo: false,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
      };
      updatedTenants = [nextTenant];
    } else {
      nextTenant = updatedTenants[0];
    }

    setTenants(updatedTenants);

    // 2. If the active tenant was deleted, switch immediately in UI
    if (tenantToDelete.id === currentTenant.id) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      isDirtyRef.current = false;
      isLoadedRef.current = false;
      setIsSyncing(true);
      setStoredActiveTenantId(nextTenant.id);
      setCurrentTenant(nextTenant);

      try {
        const loaded = await loadSchoolTenantAppState(nextTenant);
        setAppState(loaded.state);
        isLoadedRef.current = true;
        isDirtyRef.current = false;
        setIsSyncing(false);
        setLastSyncedText(
          loaded.source === 'cloud'
            ? 'Cloud Firestore'
            : loaded.source === 'cache'
            ? 'Memori Offline'
            : 'Template Awal'
        );
      } catch (err) {
        console.error('Error switching tenant during delete:', err);
        setIsSyncing(false);
      }
    }

    // 3. Run Firestore & localStorage deletion asynchronously
    try {
      await deleteSchoolTenant(tenantToDelete.id);
    } catch (err) {
      console.warn('Notice on background tenant deletion:', err);
    }

    setIsDeletingTenantLoading(false);
    setTenantToDeleteConfirm(null);
    setSwitchNotification(`Database sekolah "${tenantToDelete.namaSekolah}" berhasil dihapus beserta databasenya dan dihilangkan dari tampilan.`);
    setTimeout(() => setSwitchNotification(null), 5000);
  };

  // Manual save trigger for instant user peace of mind
  const handleManualSaveNow = async () => {
    setIsSyncing(true);
    try {
      const ok = await saveSchoolTenantAppState(currentTenant.id, appState);
      
      // Also sync to Google Sheets if connected
      if (isGoogleConnected) {
        try {
          const saved = localStorage.getItem(`GOOGLE_SHEET_INFO_${currentTenant.id}`);
          const token = await getAccessToken();
          if (saved && token) {
            const parsed = JSON.parse(saved);
            if (parsed?.id) {
              await syncStateToSpreadsheet(token, parsed.id, appState);
            }
          }
        } catch (sheetErr) {
          console.warn('Manual save to Google Sheets warning:', sheetErr);
        }
      }

      setIsSyncing(false);
      isDirtyRef.current = false;
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} WIB`;
      if (checkIsQuotaExhausted()) {
        setLastSyncedText(`Tersimpan di Memori Lokal ${timeStr}`);
        setSwitchNotification(`Data ${currentTenant.namaSekolah} tersimpan aman di memori lokal browser (Batas kuota harian cloud tercapai).`);
      } else if (ok) {
        setLastSyncedText(`Tersimpan ${timeStr}`);
        setSwitchNotification(`Data ${currentTenant.namaSekolah} berhasil disimpan permanen ke Google Cloud Firestore${isGoogleConnected ? ' & Google Sheets' : ''}.`);
      } else {
        setLastSyncedText(`Tersimpan Offline ${timeStr}`);
        setSwitchNotification(`Data tersimpan aman di memori lokal perangkat.`);
      }
      setTimeout(() => setSwitchNotification(null), 4000);
    } catch (err) {
      console.warn('Manual save notice:', err);
      setIsSyncing(false);
      setLastSyncedText('Tersimpan Offline');
    }
  };

  // Restore state from Google Sheets callback
  const handleStateRestoredFromGoogleSheets = async (newState: AppStateData) => {
    isDirtyRef.current = false;
    setAppState(newState);
    await saveSchoolTenantAppState(currentTenant.id, newState);
    setSwitchNotification(`Data LPJ Revit berhasil dipulihkan dari Google Sheets (${currentTenant.namaSekolah})!`);
    setTimeout(() => setSwitchNotification(null), 5000);
  };

  // Derived calculations
  const bkuList = useMemo(() => {
    return calculateBkuFromTransactions(
      appState.kwitansiList,
      appState.school,
      appState.manualBkuTransactions,
      appState.progressWeeks,
      appState.deletedBkuIds || [],
      appState.wageReports || [],
      bkuWeekLimit,
      appState.stores || []
    );
  }, [
    appState.kwitansiList,
    appState.school,
    appState.manualBkuTransactions,
    appState.progressWeeks,
    appState.deletedBkuIds,
    appState.wageReports,
    bkuWeekLimit,
    appState.stores,
  ]);

  const effectiveBkbList = useMemo(() => {
    if (appState.bkbRecords !== undefined) {
      return calculateRunningBkb(appState.bkbRecords);
    }
    const standard = generateStandardBkbRecords(appState.school, appState.progressWeeks, bkuWeekLimit);
    return calculateRunningBkb(standard);
  }, [appState.bkbRecords, appState.school, appState.progressWeeks, bkuWeekLimit]);

  const bktList = useMemo(() => {
    return calculateIntegratedBkt(bkuList);
  }, [bkuList]);

  const cashReconciliation = useMemo(() => {
    const lastBku = bkuList[bkuList.length - 1];
    const saldoBku = lastBku?.saldo || 0;
    const lastBkb = effectiveBkbList[effectiveBkbList.length - 1];
    const saldoBkb = lastBkb?.saldo || 0;
    const lastBkt = bktList[bktList.length - 1];
    const saldoBkt = lastBkt?.saldo || 0;

    return reconcileCashBalances(saldoBku, saldoBkb, saldoBkt);
  }, [bkuList, effectiveBkbList, bktList]);

  const taxRecords = useMemo(() => {
    return generateTaxesFromKwitansi(
      appState.kwitansiList,
      appState.manualTaxRecords || [],
      appState.deletedTaxIds || []
    );
  }, [appState.kwitansiList, appState.manualTaxRecords, appState.deletedTaxIds]);

  // Handlers
  const handleAddManualTax = (tax: Omit<TaxRecord, 'id' | 'noUrut'>) => {
    const newTaxId = `tax-manual-${Date.now()}`;
    const newTax: TaxRecord = {
      ...tax,
      id: newTaxId,
      noUrut: 0,
      isManual: true,
    };
    isDirtyRef.current = true;
    setAppState((prev) => ({
      ...prev,
      manualTaxRecords: [...(prev.manualTaxRecords || []), newTax],
    }));
  };

  const handleUpdateTax = (updatedTax: TaxRecord) => {
    isDirtyRef.current = true;
    setAppState((prev) => {
      const existingManual = prev.manualTaxRecords || [];
      const existsInManual = existingManual.some((m) => m.id === updatedTax.id);

      let newManualList: TaxRecord[];
      if (existsInManual) {
        newManualList = existingManual.map((m) => (m.id === updatedTax.id ? updatedTax : m));
      } else {
        newManualList = [...existingManual, updatedTax];
      }

      // Also if tied to kwitansi, sync tax amounts on kwitansi
      let updatedKwitansi = prev.kwitansiList;
      if (updatedTax.kwitansiIdRef) {
        updatedKwitansi = prev.kwitansiList.map((kw) => {
          if (kw.id === updatedTax.kwitansiIdRef) {
            return {
              ...kw,
              isPpn: updatedTax.ppn11 > 0,
              isPph22: updatedTax.pph22 > 0,
              isPph23: updatedTax.pph23 > 0,
              ppnAmount: updatedTax.ppn11,
              pph22Amount: updatedTax.pph22,
              pph23Amount: updatedTax.pph23,
            };
          }
          return kw;
        });
      }

      return {
        ...prev,
        kwitansiList: updatedKwitansi,
        manualTaxRecords: newManualList,
      };
    });
  };

  const handleDeleteTax = (taxId: string) => {
    isDirtyRef.current = true;
    setAppState((prev) => {
      const updatedManual = (prev.manualTaxRecords || []).filter((m) => m.id !== taxId);
      const updatedDeleted = Array.from(new Set([...(prev.deletedTaxIds || []), taxId]));
      return {
        ...prev,
        manualTaxRecords: updatedManual,
        deletedTaxIds: updatedDeleted,
      };
    });
  };

  const handleBulkDeleteTaxes = (taxesToDelete: TaxRecord[]) => {
    if (!taxesToDelete || taxesToDelete.length === 0) return;
    isDirtyRef.current = true;
    const idsToDelete = new Set(taxesToDelete.map((t) => t.id));
    const kwRefsToReset = new Set(taxesToDelete.map((t) => t.kwitansiIdRef).filter(Boolean));

    setAppState((prev) => {
      const updatedManual = (prev.manualTaxRecords || []).filter((m) => !idsToDelete.has(m.id));
      const updatedDeleted = Array.from(new Set([...(prev.deletedTaxIds || []), ...Array.from(idsToDelete)]));
      const updatedKwitansi = prev.kwitansiList.map((kw) => {
        if (kwRefsToReset.has(kw.id)) {
          return {
            ...kw,
            isPpn: false,
            isPph22: false,
            isPph23: false,
            ppnAmount: 0,
            pph22Amount: 0,
            pph23Amount: 0,
          };
        }
        return kw;
      });

      return {
        ...prev,
        kwitansiList: updatedKwitansi,
        manualTaxRecords: updatedManual,
        deletedTaxIds: updatedDeleted,
      };
    });
    setSwitchNotification(`✅ Berhasil menghapus ${taxesToDelete.length} data pajak secara massal.`);
    setTimeout(() => setSwitchNotification(null), 4000);
  };

  const handleClearAllTaxes = () => {
    isDirtyRef.current = true;
    const allTaxIds = taxRecords.map((t) => t.id);
    setAppState((prev) => {
      const updatedDeleted = Array.from(new Set([...(prev.deletedTaxIds || []), ...allTaxIds]));
      const updatedKwitansi = prev.kwitansiList.map((kw) => ({
        ...kw,
        isPpn: false,
        isPph22: false,
        isPph23: false,
        ppnAmount: 0,
        pph22Amount: 0,
        pph23Amount: 0,
      }));

      return {
        ...prev,
        kwitansiList: updatedKwitansi,
        manualTaxRecords: [],
        deletedTaxIds: updatedDeleted,
      };
    });
    setSwitchNotification('✅ Seluruh data Buku Pembantu Pajak berhasil dihapus.');
    setTimeout(() => setSwitchNotification(null), 4000);
  };

  const handleAddManualBku = (tx: Omit<BkuTransaction, 'id'>, weekNum?: number) => {
    const newTxId = `bku-manual-${Date.now()}`;
    const newTx: BkuTransaction = {
      ...tx,
      id: newTxId,
    };

    // If expenditure, also register corresponding Kwitansi so SPJ, BKU, and Bon Toko remain unified
    let newKw: KwitansiDocument | null = null;
    if (tx.jenis === 'PENGELUARAN' && tx.pengeluaran > 0) {
      const yearStr = appState.school.tahunAnggaran?.trim() || '2026';
      newKw = {
        id: `kw-manual-${Date.now()}`,
        noBukti: tx.noBukti || `MANUAL-${Date.now().toString().slice(-4)}`,
        noSpb: `SPB-${tx.noBukti || Date.now().toString().slice(-4)}`,
        tipe: tx.uraian.toLowerCase().includes('upah') ? 'UPAH' : 'MATERIAL',
        tanggal: tx.tanggal,
        tanggalFormatted: tx.tanggal,
        bulan: tx.bulan,
        uraian: tx.uraian,
        penerimaNama: 'Penerima Manual',
        penerimaPekerjaan: 'Penyedia / Pekerja',
        penerimaAlamat: appState.school.kabKota,
        nominal: tx.pengeluaran,
        items: [{ namaBarang: tx.uraian, volume: 1, satuan: 'Kegiatan', hargaSatuan: tx.pengeluaran, jumlah: tx.pengeluaran }],
        isPpn: false,
        isPph22: false,
        isPph23: false,
        ppnAmount: 0,
        pph22Amount: 0,
        pph23Amount: 0,
        kategoriBiayaPajak: (tx.kategoriBiaya as 'Konstruksi' | 'Perabot' | 'Peralatan' | 'Perencanaan_Pengelolaan') || 'Konstruksi',
        mingguKeRef: weekNum,
      };
      if (newKw) {
        newTx.kwitansiIdRef = newKw.id;
      }
    }

    isDirtyRef.current = true;
    setAppState((prev) => ({
      ...prev,
      kwitansiList: newKw ? [newKw, ...prev.kwitansiList] : prev.kwitansiList,
      manualBkuTransactions: [...(prev.manualBkuTransactions || []), newTx],
    }));
  };

  const handleUpdateBku = (updatedTx: BkuTransaction) => {
    isDirtyRef.current = true;
    setAppState((prev) => {
      // 1. If linked to kwitansi, sync kwitansi
      let updatedKwitansi = prev.kwitansiList;
      if (updatedTx.kwitansiIdRef) {
        updatedKwitansi = prev.kwitansiList.map((kw) => {
          if (kw.id === updatedTx.kwitansiIdRef) {
            return {
              ...kw,
              tanggal: updatedTx.tanggal,
              tanggalFormatted: updatedTx.tanggal,
              bulan: updatedTx.bulan,
              uraian: updatedTx.uraian,
              noBukti: updatedTx.noBukti,
              nominal: updatedTx.pengeluaran || updatedTx.penerimaan,
            };
          }
          return kw;
        });
      }

      // 2. Update or upsert into manualBkuTransactions
      const exists = (prev.manualBkuTransactions || []).some((m) => m.id === updatedTx.id);
      const updatedManual = exists
        ? (prev.manualBkuTransactions || []).map((m) => (m.id === updatedTx.id ? updatedTx : m))
        : [...(prev.manualBkuTransactions || []), updatedTx];

      return {
        ...prev,
        kwitansiList: updatedKwitansi,
        manualBkuTransactions: updatedManual,
      };
    });
  };

  const handleDeleteBku = (txToDelete: BkuTransaction) => {
    isDirtyRef.current = true;
    setAppState((prev) => {
      let updatedKwitansi = prev.kwitansiList;
      if (txToDelete.kwitansiIdRef) {
        updatedKwitansi = prev.kwitansiList.filter((kw) => kw.id !== txToDelete.kwitansiIdRef);
      }

      const updatedManual = (prev.manualBkuTransactions || []).filter((m) => m.id !== txToDelete.id);
      const updatedDeletedIds = Array.from(
        new Set([...(prev.deletedBkuIds || []), txToDelete.id, txToDelete.kwitansiIdRef || ''])
      ).filter(Boolean);

      return {
        ...prev,
        kwitansiList: updatedKwitansi,
        manualBkuTransactions: updatedManual,
        deletedBkuIds: updatedDeletedIds,
      };
    });
  };

  const handleBulkDeleteBku = (txList: BkuTransaction[]) => {
    if (!txList || txList.length === 0) return;
    isDirtyRef.current = true;

    const idsToDelete = new Set<string>();
    const kwRefsToDelete = new Set<string>();

    txList.forEach((t) => {
      if (t.id) {
        idsToDelete.add(t.id);
        const cleanId = t.id.replace(/^bkt-|^bku-/, '');
        idsToDelete.add(cleanId);
        idsToDelete.add(`bku-kw-${cleanId}`);
        idsToDelete.add(`kw-${cleanId}`);
      }
      if (t.kwitansiIdRef) {
        kwRefsToDelete.add(t.kwitansiIdRef);
        const cleanKwRef = t.kwitansiIdRef.replace(/^bku-kw-|^kw-/, '');
        kwRefsToDelete.add(cleanKwRef);
        kwRefsToDelete.add(`kw-${cleanKwRef}`);
        kwRefsToDelete.add(`bku-kw-${cleanKwRef}`);
      }
    });

    setAppState((prev) => {
      const updatedKwitansi = (prev.kwitansiList || []).filter((kw) => {
        if (!kw) return false;
        if (idsToDelete.has(kw.id) || kwRefsToDelete.has(kw.id)) return false;
        if (kw.id && (idsToDelete.has(`kw-${kw.id}`) || kwRefsToDelete.has(`kw-${kw.id}`))) return false;
        if (kw.id && (idsToDelete.has(`bku-kw-${kw.id}`) || kwRefsToDelete.has(`bku-kw-${kw.id}`))) return false;
        return true;
      });

      const updatedManual = (prev.manualBkuTransactions || []).filter((m) => {
        if (!m) return false;
        if (idsToDelete.has(m.id)) return false;
        if (m.kwitansiIdRef && kwRefsToDelete.has(m.kwitansiIdRef)) return false;
        return true;
      });

      const updatedDeleted = Array.from(
        new Set([...(prev.deletedBkuIds || []), ...Array.from(idsToDelete), ...Array.from(kwRefsToDelete)])
      ).filter(Boolean);

      return {
        ...prev,
        kwitansiList: updatedKwitansi,
        manualBkuTransactions: updatedManual,
        deletedBkuIds: updatedDeleted as string[],
      };
    });
    setSwitchNotification(`✅ Berhasil menghapus ${txList.length} transaksi BKU secara massal.`);
    setTimeout(() => setSwitchNotification(null), 4000);
  };

  const handleClearAllBku = () => {
    isDirtyRef.current = true;
    const allCurrentBkuIds = bkuList.map((t) => t.id);
    const allKwRefs = bkuList.map((t) => t.kwitansiIdRef).filter(Boolean) as string[];

    setAppState((prev) => {
      return {
        ...prev,
        kwitansiList: [],
        manualBkuTransactions: [],
        wageReports: [],
        deletedBkuIds: Array.from(
          new Set([
            ...(prev.deletedBkuIds || []),
            ...allCurrentBkuIds,
            ...allKwRefs,
            'ALL_BKU',
            'bku-init-1',
            'bku-init-2',
          ])
        ),
      };
    });
    setSwitchNotification('✅ Seluruh data transaksi Buku Kas Umum (BKU) & kwitansi terkait berhasil dihapus.');
    setTimeout(() => setSwitchNotification(null), 4000);
  };

  const handleBulkDeleteBkt = (bktItems: BktTransaction[]) => {
    if (!bktItems || bktItems.length === 0) return;
    const bkuEquivs: BkuTransaction[] = bktItems.map((bkt) => {
      const cleanId = bkt.id.replace(/^bkt-/, '');
      return {
        id: cleanId,
        tanggal: bkt.tanggal,
        tanggalObj: bkt.tanggalObj || bkt.tanggal,
        bulan: bkt.bulan,
        jenis: (bkt.pemasukan > 0 ? 'PENERIMAAN' : 'PENGELUARAN') as 'PENERIMAAN' | 'PENGELUARAN',
        uraian: bkt.uraian,
        noBukti: bkt.noBukti,
        penerimaan: bkt.pemasukan || 0,
        pengeluaran: bkt.pengeluaran || 0,
        saldo: bkt.saldo,
        kwitansiIdRef: bkt.kwitansiIdRef,
      };
    });
    handleBulkDeleteBku(bkuEquivs);
    setSwitchNotification(`✅ Berhasil menghapus ${bktItems.length} transaksi Kas Tunai (BKT) secara massal.`);
    setTimeout(() => setSwitchNotification(null), 4000);
  };

  const handleClearAllBkt = () => {
    isDirtyRef.current = true;
    const cashTxList: BkuTransaction[] = bktList.map((bkt) => {
      const cleanId = bkt.id.replace(/^bkt-/, '');
      return {
        id: cleanId,
        tanggal: bkt.tanggal,
        tanggalObj: bkt.tanggalObj || bkt.tanggal,
        bulan: bkt.bulan,
        jenis: (bkt.pemasukan > 0 ? 'PENERIMAAN' : 'PENGELUARAN') as 'PENERIMAAN' | 'PENGELUARAN',
        uraian: bkt.uraian,
        noBukti: bkt.noBukti,
        penerimaan: bkt.pemasukan || 0,
        pengeluaran: bkt.pengeluaran || 0,
        saldo: bkt.saldo,
        kwitansiIdRef: bkt.kwitansiIdRef,
      };
    });
    if (cashTxList.length > 0) {
      handleBulkDeleteBku(cashTxList);
    }
    setSwitchNotification('✅ Seluruh data transaksi Buku Kas Tunai (BKT) berhasil dihapus.');
    setTimeout(() => setSwitchNotification(null), 4000);
  };

  const handleUpdateBkuWeekLimit = (limit: number) => {
    setBkuWeekLimit(limit);
    localStorage.setItem('bkuWeekLimit', String(limit));
    setSwitchNotification(`✅ Batas minggu BKU berhasil diubah ke Minggu ${limit}. Seluruh BKU & Saldo disesuaikan.`);
    setTimeout(() => setSwitchNotification(null), 3000);
  };

  // Handlers
  const handleUpdateSchool = (updated: SchoolMasterData) => {
    isDirtyRef.current = true;
    const newYear = updated.tahunAnggaran?.trim() || '2026';

    // Synchronize tenant metadata immediately
    setCurrentTenant((prev) => ({
      ...prev,
      namaSekolah: updated.namaSekolah || prev.namaSekolah,
      npsn: updated.npsn || prev.npsn,
      kabKota: updated.kabKota || prev.kabKota,
      provinsi: updated.provinsi || prev.provinsi,
    }));
    setTenants((prev) =>
      prev.map((t) =>
        t.id === currentTenant.id
          ? {
              ...t,
              namaSekolah: updated.namaSekolah || t.namaSekolah,
              npsn: updated.npsn || t.npsn,
              kabKota: updated.kabKota || t.kabKota,
              provinsi: updated.provinsi || t.provinsi,
            }
          : t
      )
    );

    setAppState((prev) => {
      const updatedKwitansi = healKwitansiList(prev.kwitansiList, newYear, prev.deletedKwitansiIds);
      const updatedWageReports = (prev.wageReports || []).map((wr) => {
        const oldBukti = wr.noBuktiKwitansi;
        const newBukti = oldBukti ? oldBukti.replace(/\/(19\d\d|20\d\d)$/, `/${newYear}`) : oldBukti;
        return {
          ...wr,
          noBuktiKwitansi: newBukti,
        };
      });
      return {
        ...prev,
        school: updated,
        kwitansiList: updatedKwitansi,
        wageReports: updatedWageReports,
      };
    });
  };

  const handleUpdateRpd = (updatedItems: RpdItem[]) => {
    isDirtyRef.current = true;
    setAppState((prev) => ({ ...prev, rpdItems: updatedItems }));
  };

  const handleUpdateProgressWeeks = (updatedWeeks: ProjectProgressWeek[]) => {
    isDirtyRef.current = true;
    // 100% Lock: Updating progress weeks strictly updates progress data without overwriting kwitansi, wage, or BKB
    setAppState((prev) => ({
      ...prev,
      progressWeeks: updatedWeeks,
    }));
  };

  const handleUpdateWorkers = (updatedWorkers: WorkerItem[]) => {
    isDirtyRef.current = true;
    setAppState((prev) => ({ ...prev, workers: updatedWorkers }));
  };

  const handleUpdateStores = (updatedStores: StoreVendor[]) => {
    isDirtyRef.current = true;
    setAppState((prev) => ({ ...prev, stores: updatedStores }));
  };

  const handleUpdateWageReports = (updatedReports: WeeklyWageReport[]) => {
    isDirtyRef.current = true;
    setAppState((prev) => ({ ...prev, wageReports: updatedReports }));
  };

  const handleUpdateKwitansiList = (updatedKwitansi: KwitansiDocument[]) => {
    isDirtyRef.current = true;
    setAppState((prev) => {
      const kwMap = new Map(updatedKwitansi.map((k) => [k.id, k]));

      const updatedManualBku = (prev.manualBkuTransactions || []).map((m) => {
        let kw = (m.kwitansiIdRef && kwMap.get(m.kwitansiIdRef)) ||
                   kwMap.get(m.id) ||
                   kwMap.get(m.id.replace(/^bku-kw-/, '')) ||
                   (m.noBukti ? updatedKwitansi.find((k) => k.noBukti && k.noBukti.trim().toUpperCase() === m.noBukti.trim().toUpperCase()) : undefined);

        if (!kw && ((m.noBukti && m.noBukti.toUpperCase().includes('UK/')) || (m.uraian && m.uraian.toLowerCase().includes('upah')))) {
          const matchW = (m.noBukti || '').match(/UK\/(\d{1,2})\//i) || (m.uraian || '').match(/Minggu\s*(?:Ke-|\s*)(\d{1,2})\b/i);
          if (matchW) {
            const wNum = parseInt(matchW[1], 10);
            kw = updatedKwitansi.find((k) => k.tipe === 'UPAH' && k.mingguKeRef === wNum);
          }
        }

        if (kw) {
          return {
            ...m,
            noBukti: kw.noBukti,
            tanggal: kw.tanggal,
            bulan: kw.bulan || m.bulan,
            uraian: kw.uraian ? (kw.uraian.startsWith('Pembayaran Lunas Biaya ') ? kw.uraian.replace('Pembayaran Lunas Biaya ', 'Bayar ') : kw.uraian) : m.uraian,
            pengeluaran: kw.nominal,
            kategoriBiaya: kw.kategoriBiayaPajak || m.kategoriBiaya,
          };
        }
        return m;
      });

      const updatedManualTaxes = (prev.manualTaxRecords || []).map((t) => {
        if (t.kwitansiIdRef && kwMap.has(t.kwitansiIdRef)) {
          const kw = kwMap.get(t.kwitansiIdRef)!;
          return {
            ...t,
            noBukti: kw.noBukti,
            tanggal: kw.tanggal,
            bulan: kw.bulan || t.bulan,
            namaToko: kw.namaToko || kw.penerimaNama,
            penerimaNama: kw.penerimaNama || t.penerimaNama,
            keperluan: kw.uraian ? kw.uraian.replace(/^Pembayaran Lunas Biaya\s+/i, 'Bayar ').replace(/^Pembayaran Lunas\s+/i, 'Bayar ') : t.keperluan,
            ppn11: kw.isPpn ? (kw.ppnAmount || t.ppn11) : t.ppn11,
            pph22: kw.isPph22 ? (kw.pph22Amount || t.pph22) : t.pph22,
            pph23: kw.isPph23 ? (kw.pph23Amount || t.pph23) : t.pph23,
          };
        }
        return t;
      });

      const updatedBkb = (prev.bkbRecords || []).map((b) => {
        const kw = kwMap.get(b.id) || (b.noBukti ? updatedKwitansi.find((k) => k.noBukti === b.noBukti) : undefined);
        if (kw) {
          return {
            ...b,
            noBukti: kw.noBukti,
            tanggal: kw.tanggal,
            bulan: kw.bulan || b.bulan,
            pengeluaran: b.pengeluaran > 0 ? kw.nominal : b.pengeluaran,
            penerimaan: b.penerimaan > 0 ? kw.nominal : b.penerimaan,
          };
        }
        return b;
      });

      return {
        ...prev,
        kwitansiList: updatedKwitansi,
        manualBkuTransactions: updatedManualBku,
        manualTaxRecords: updatedManualTaxes,
        bkbRecords: updatedBkb,
      };
    });
  };

  const handleUpdateRealData = (newData: RealSchoolData) => {
    isDirtyRef.current = true;
    setAppState((prev) => ({
      ...prev,
      realSchoolData: newData,
    }));
  };

  const handleApplyRealDataToAll = (real: RealSchoolData) => {
    const totalRab = real.divisions.reduce((s, d) => s + d.subTotal, 0);

    // 1. Update School Master Data
    const updatedSchool: SchoolMasterData = {
      ...appState.school,
      namaSekolah: real.namaSekolah,
      pekerjaan: real.kegiatan,
      program: real.satuanPendidikan,
      lokasi: real.lokasi,
      kabKota: real.kabKota,
      provinsi: real.provinsi,
      tahunAnggaran: real.tahunAnggaran,
      totalAnggaran: totalRab,
      termin1Nilai: Math.round(totalRab * (appState.school.termin1Persen / 100)),
      termin2Nilai: Math.round(totalRab * (appState.school.termin2Persen / 100)),
    };

    // 2. Map RAB items into RPD items using Sequential Waterfall Allocation Engine
    const newRpdItems = calculateSequentialWaterfallRpdItems(real, appState.school.termin1Persen || 70);

    // 3. Fully integrate Progress Weeks & Bobot table with Real School Data divisions
    const progressWeeksToUse = syncProgressWeeksWithRealData(appState.progressWeeks, real);

    // 4. Automatically re-generate Kwitansi, Bon Toko, SPB, and Upah for all active progress weeks
    const existingTargetWeeks = Array.from(
      new Set(
        appState.kwitansiList
          .map((k) => k.mingguKeRef)
          .filter((w): w is number => typeof w === 'number' && w > 0)
      )
    ).sort((a, b) => a - b);

    const progressActiveWeeks = progressWeeksToUse
      .filter((pw) => (pw.bobotRealisasi || 0) > 0 || pw.mingguKe === 1 || (pw.divisions || []).some((d) => (d.prestasiMingguIni || 0) > 0))
      .map((pw) => pw.mingguKe);

    const targetWeeksToRegen = Array.from(
      new Set([1, ...existingTargetWeeks, ...progressActiveWeeks])
    ).sort((a, b) => a - b);

    let updatedKwitansi = [...appState.kwitansiList];
    let updatedWageReports = [...appState.wageReports];
    let updatedBkb = [...appState.bkbRecords];

    if (targetWeeksToRegen.length > 0) {
      targetWeeksToRegen.forEach((targetWeek) => {
        const weekObj = progressWeeksToUse.find((w) => w.mingguKe === targetWeek);
        if (!weekObj) return;

        const res = generateWeeklyTransactionsFromProgressAndRealData({
          targetWeek,
          weekObj,
          weeksToUse: progressWeeksToUse,
          school: updatedSchool,
          workers: appState.workers,
          stores: appState.stores || [],
          rpdItems: newRpdItems.length > 0 ? newRpdItems : appState.rpdItems,
          realSchoolData: real,
          existingKwitansi: updatedKwitansi,
          existingWageReports: updatedWageReports,
          existingBkb: updatedBkb,
          splitDays: true,
        });

        updatedKwitansi = res.updatedKwitansi;
        updatedWageReports = res.updatedWageReports;
        updatedBkb = res.updatedBkb;
      });
    }

    // Universal Full Regeneration of ALL existing Kwitansi & Bon Toko across all weeks
    updatedKwitansi = updatedKwitansi.map((kw) => {
      if (kw.tipe === 'MATERIAL') {
        let currentItems = kw.items && kw.items.length > 0 ? kw.items : [
          {
            namaBarang: (kw.uraian || 'Material Bangunan')
              .replace(/^Pembayaran Lunas Biaya Pembelian Material\/Bahan\s*\(/i, '')
              .replace(/\),.*$/i, '')
              .replace(/Pembayaran Lunas Biaya Pembelian Material\s*/i, '')
              .trim(),
            volume: 1,
            satuan: 'ls',
            hargaSatuan: kw.nominal,
            jumlah: kw.nominal,
          },
        ];

        const hasCompositeJob = currentItems.some((it) => !isPureDirectMaterial(it.namaBarang || ''));
        if (hasCompositeJob) {
          const normalized = normalizeMaterialItems(currentItems);
          const consolidated = consolidateAndStandardizeReceiptItems(normalized, kw.nominal);
          const firstNames = consolidated
            .map((i: { namaBarang: string }) => i.namaBarang)
            .slice(0, 3)
            .join(', ');
          return {
            ...kw,
            items: consolidated,
            uraian: `Pembayaran Lunas Biaya Pembelian Material/Bahan (${firstNames}), Untuk Pekerjaan Revitalisasi ${updatedSchool.namaSekolah}, Tahun ${updatedSchool.tahunAnggaran || '2026'}, Daftar Terlampir.`,
          };
        } else if (currentItems && currentItems.length > 0) {
          const consolidated = consolidateAndStandardizeReceiptItems(currentItems, kw.nominal);
          return {
            ...kw,
            items: consolidated,
          };
        }
      }
      return kw;
    });

    const finalCleanKwitansi = healKwitansiList(
      updatedKwitansi,
      updatedSchool.tahunAnggaran || '2026',
      appState.deletedKwitansiIds
    );

    // Synchronize manual transactions by purging any obsolete entries that duplicate the newly generated kwitansi
    const kwBuktiSet = new Set(
      finalCleanKwitansi
        .map((k) => k.noBukti?.trim().toUpperCase())
        .filter((b): b is string => Boolean(b && b !== '-'))
    );
    const seenManualKeys = new Set<string>();
    const cleanManualBku = (appState.manualBkuTransactions || []).filter((tx) => {
      const bkt = tx.noBukti?.trim().toUpperCase();
      if (bkt && bkt !== '-' && bkt !== 'MANUAL' && kwBuktiSet.has(bkt)) return false;
      const key = `${tx.noBukti?.trim()}-${tx.tanggal}-${tx.pengeluaran || tx.penerimaan}-${tx.uraian?.trim()}`;
      if (seenManualKeys.has(key)) return false;
      seenManualKeys.add(key);
      return true;
    });

    isDirtyRef.current = true;
    setAppState((prev) => ({
      ...prev,
      school: updatedSchool,
      realSchoolData: real,
      rpdItems: newRpdItems.length > 0 ? newRpdItems : prev.rpdItems,
      // 100% Fully integrated progressWeeks with Real School Data divisions
      progressWeeks: progressWeeksToUse,
      kwitansiList: finalCleanKwitansi,
      manualBkuTransactions: cleanManualBku,
      wageReports: updatedWageReports,
      bkbRecords: updatedBkb,
    }));

    try {
      confetti({ particleCount: 90, spread: 100, origin: { y: 0.5 } });
    } catch {}
  };

  const handleAddKwitansi = (newKw: KwitansiDocument) => {
    isDirtyRef.current = true;
    const finalKw: KwitansiDocument = {
      ...newKw,
      isManual: true,
      isLocked: newKw.isLocked !== undefined ? newKw.isLocked : true,
    };
    setAppState((prev) => ({
      ...prev,
      kwitansiList: [finalKw, ...prev.kwitansiList],
    }));
    try {
      confetti({ particleCount: 50, spread: 60, origin: { y: 0.8 } });
    } catch {}
  };

  const handleDeleteKwitansi = (id: string) => {
    if (confirm('Hapus kwitansi ini beserta data terkait dari database sekolah ini?')) {
      isDirtyRef.current = true;
      setAppState((prev) => {
        const targetKw = prev.kwitansiList.find((k) => k.id === id);
        const kwNoBukti = targetKw?.noBukti;
        const cleanKwId = id.replace(/^(bku-kw-)+/, '');
        const kwBkuId = `bku-kw-${cleanKwId}`;

        const updatedDeletedKw = Array.from(
          new Set([...(prev.deletedKwitansiIds || []), id, cleanKwId, kwNoBukti || '', kwBkuId].filter(Boolean))
        );
        const updatedDeletedBku = Array.from(
          new Set([...(prev.deletedBkuIds || []), id, cleanKwId, kwBkuId].filter(Boolean))
        );

        return {
          ...prev,
          deletedKwitansiIds: updatedDeletedKw,
          deletedBkuIds: updatedDeletedBku,
          kwitansiList: prev.kwitansiList.filter(
            (k) => k.id !== id && k.id !== cleanKwId && (kwNoBukti ? k.noBukti !== kwNoBukti : true)
          ),
        };
      });
    }
  };

  const handleCleanDuplicates = () => {
    isDirtyRef.current = true;
    const paguTotal = appState.school?.totalAnggaran || 552457000;
    const currentTotalNominal = appState.kwitansiList.reduce((s, k) => s + (k.nominal || 0), 0);

    // If total kwitansi exceeds pagu or has duplicate inflation, run full calibration & deduplication
    if (currentTotalNominal > paguTotal * 1.02) {
      const calRes = calibrateAllTransactionsToCurrentProgress({
        school: appState.school,
        kwitansiList: appState.kwitansiList,
        progressWeeks: appState.progressWeeks,
        workers: appState.workers,
        stores: appState.stores,
        rpdItems: appState.rpdItems,
        realSchoolData: appState.realSchoolData,
        existingBkb: appState.bkbRecords,
        bkuWeekLimit,
      });

      setAppState((prev) => ({
        ...prev,
        kwitansiList: calRes.calibratedKwitansi,
        wageReports: calRes.calibratedWageReports,
        bkbRecords: calRes.calibratedBkb,
      }));

      setSwitchNotification(
        `🧹 Berhasil membersihkan kwitansi ganda & mengkalibrasi ulang total belanja agar pas 100% dengan Pagu Anggaran!`
      );
      setTimeout(() => setSwitchNotification(null), 5000);
      return;
    }

    const originalKwCount = appState.kwitansiList.length;
    const cleanKw = healKwitansiList(
      appState.kwitansiList,
      appState.school?.tahunAnggaran || '2026',
      appState.deletedKwitansiIds
    );
    const removedKwCount = originalKwCount - cleanKw.length;

    // Clean duplicate manual BKU transactions
    const seenBkuKeys = new Set<string>();
    const cleanManualBku = (appState.manualBkuTransactions || []).filter((tx) => {
      const key = `${tx.noBukti?.trim()}-${tx.tanggal}-${tx.pengeluaran || tx.penerimaan}-${tx.uraian?.trim()}`;
      if (seenBkuKeys.has(key)) {
        return false;
      }
      seenBkuKeys.add(key);
      return true;
    });

    const removedManualBkuCount = (appState.manualBkuTransactions || []).length - cleanManualBku.length;

    // CRITICAL: Clean only exact duplicate records in BKB, protecting all unique filled BKB entries!
    const seenBkbKeys = new Set<string>();
    const preservedBkb = (appState.bkbRecords || []).filter((tx) => {
      if (!tx) return false;
      const nom = (tx.penerimaan || 0) + (tx.pengeluaran || 0);
      const key = tx.id ? tx.id : `${tx.noBukti?.trim()}-${tx.tanggal}-${nom}-${tx.uraian?.trim()}`;
      if (seenBkbKeys.has(key)) {
        return false;
      }
      seenBkbKeys.add(key);
      return true;
    });

    const removedBkbCount = (appState.bkbRecords || []).length - preservedBkb.length;
    const totalCleaned = removedKwCount + removedManualBkuCount + removedBkbCount;

    setAppState((prev) => ({
      ...prev,
      kwitansiList: cleanKw,
      manualBkuTransactions: cleanManualBku,
      // CRITICAL: Menu BKB yang sudah diisi TIDAK BOLEH terhapus saat pembersihan data ganda
      bkbRecords: (prev.bkbRecords && prev.bkbRecords.length > 0) ? preservedBkb : (prev.bkbRecords || []),
    }));

    if (totalCleaned > 0) {
      setSwitchNotification(
        `✅ Berhasil membersihkan ${totalCleaned} data ganda. Kwitansi Manual Terkunci (Solusi 3), Menu BKB & BKU tetap 100% utuh dan aman.`
      );
    } else {
      setSwitchNotification(
        `✨ Semua transaksi BKU, Menu BKB & Kwitansi Manual Terkunci sudah rapi dan aman (tidak ada data ganda).`
      );
    }
    setTimeout(() => setSwitchNotification(null), 4000);
  };
  const generateTransactionsForWeeks = (
    targetWeeks: number[],
    splitDays = true,
    overrideWeeks?: ProjectProgressWeek[],
    procurementMode: 'BATCH_CONSTRUCTION' | 'WEEKLY_CONSOLIDATED' = 'BATCH_CONSTRUCTION'
  ) => {
    if (targetWeeks.length === 0) return;
    const weeksToUse = overrideWeeks || appState.progressWeeks;

    // Filter active weeks with real physical progress > 0
    const activeWeeks = weeksToUse.filter(
      (w) => (w.bobotRealisasi && w.bobotRealisasi > 0) || w.divisions?.some((d) => (d.prestasiMingguIni || 0) > 0)
    );
    const activeWeekNums = new Set(activeWeeks.map((w) => w.mingguKe));

    // Target weeks should only include active weeks with real progress
    const validTargetWeeks = targetWeeks.filter((tw) => activeWeekNums.has(tw));
    if (validTargetWeeks.length === 0) {
      handleCalibrateToRealProgress();
      return;
    }

    const yearStr = appState.school?.tahunAnggaran?.trim() || '2026';

    // Auto-Cleansing Sebelum Generation (Cegah Belanja Ganda & Lindungi Kwitansi Manual):
    // Bersihkan transaksi kwitansi auto-generated untuk minggu yang dipilih sebelum generate ulang,
    // sambil tetap mempertahankan kwitansi manual yang diinput oleh pengguna (Solusi 3: Mode Proteksi Kunci).
    const cleanExistingKw = appState.kwitansiList.filter((k) => {
      const isManual = Boolean(
        k.isManual ||
        k.isLocked ||
        (k.id || '').includes('manual') ||
        (k.id || '').includes('custom') ||
        (k.tipe as string) === 'MANUAL'
      );
      if (isManual) return true;
      const wNum = extractWeekNumberFromKwitansi(k, weeksToUse, yearStr);
      if (wNum !== null && validTargetWeeks.includes(wNum)) {
        return false;
      }
      return true;
    });

    const res = generateRealisticMultiWeekTransactions({
      selectedWeekNums: validTargetWeeks,
      weeksToUse,
      school: appState.school,
      workers: appState.workers,
      stores: appState.stores || [],
      rpdItems: appState.rpdItems,
      realSchoolData: appState.realSchoolData,
      existingKwitansi: cleanExistingKw,
      existingWageReports: appState.wageReports.filter((w) => !validTargetWeeks.includes(w.mingguKe)),
      existingBkb: appState.bkbRecords,
      splitDays,
      procurementMode,
    });

    // Anti-Negative Balance: Purge all kwitansis belonging to inactive / zero-progress weeks (PROTECT MANUAL)
    const rawCleanedKwitansi = deduplicateKwitansiList(res.updatedKwitansi).filter((k) => {
      const isManual = Boolean(
        k.isManual ||
        k.isLocked ||
        (k.id || '').includes('manual') ||
        (k.id || '').includes('custom') ||
        (k.tipe as string) === 'MANUAL'
      );
      if (isManual) return true;
      const wNum = extractWeekNumberFromKwitansi(k, weeksToUse, yearStr);
      if (wNum !== null && !activeWeekNums.has(wNum)) {
        return false;
      }
      return true;
    });
    const cleanedKwitansi = renumberKwitansiChronologically(rawCleanedKwitansi, yearStr);

    isDirtyRef.current = true;
    setAppState((prev) => ({
      ...prev,
      progressWeeks: overrideWeeks || prev.progressWeeks,
      kwitansiList: cleanedKwitansi,
      wageReports: res.updatedWageReports.filter((w) => activeWeekNums.has(w.mingguKe)),
      // CRITICAL: Protect user-entered BKB records from being erased
      bkbRecords: (prev.bkbRecords && prev.bkbRecords.length > 0) ? prev.bkbRecords : res.updatedBkb,
      deletedBkuIds: [],
      deletedKwitansiIds: [],
    }));

    const modeLabel =
      procurementMode === 'BATCH_CONSTRUCTION'
        ? 'Pola Partai / Batch Konstruksi Nyata'
        : 'Pola Proporsional Mingguan Rapi';

    setSwitchNotification(
      `✅ Belanja & Upah Borongan berhasil disinkronkan (${modeLabel}): ${res.generatedCount.bahan} Kwitansi Bahan, ${res.generatedCount.upah} Upah Borongan Mingguan, ${res.generatedCount.alat} Alat, ${res.generatedCount.smkk} SMKK/K3.`
    );
    setTimeout(() => setSwitchNotification(null), 5000);

    setTimeout(() => {
      try {
        confetti({ particleCount: 70, spread: 80, origin: { y: 0.6 } });
      } catch {}
    }, 150);
  };

  const handleAutoGenerateFromProgress = (
    targetWeek: number,
    splitDays = true,
    overrideWeeks?: ProjectProgressWeek[]
  ) => {
    generateTransactionsForWeeks([targetWeek], splitDays, overrideWeeks, 'WEEKLY_CONSOLIDATED');
  };

  const handleAutoGenerateDailyAndWeekly = (
    selectedWeeks: number[],
    splitDays: boolean,
    procurementMode?: 'BATCH_CONSTRUCTION' | 'WEEKLY_CONSOLIDATED'
  ) => {
    generateTransactionsForWeeks(selectedWeeks, splitDays, undefined, procurementMode || 'BATCH_CONSTRUCTION');
  };

  const handleAutoGenerateAllWeeks = () => {
    // Collect all weeks that have realisasi > 0 or divisions with progress > 0
    const activeWeeks = appState.progressWeeks
      .filter((w) => (w.bobotRealisasi && w.bobotRealisasi > 0) || w.divisions?.some((d) => (d.prestasiMingguIni || 0) > 0))
      .map((w) => w.mingguKe);

    if (activeWeeks.length === 0) {
      alert('Belum ada bobot kemajuan fisik (> 0%) pada Laporan Mingguan. Silakan input bobot fisik terlebih dahulu.');
      return;
    }

    generateTransactionsForWeeks(activeWeeks, true, undefined, 'BATCH_CONSTRUCTION');
  };

  const handleFullResyncToBudget = () => {
    const existingBkbToPreserve = appState.bkbRecords || [];

    const res = rebalanceAndResyncAllKwitansiToBudget({
      school: appState.school,
      kwitansiList: appState.kwitansiList,
      progressWeeks: appState.progressWeeks,
      workers: appState.workers,
      stores: appState.stores || [],
      rpdItems: appState.rpdItems,
      realSchoolData: appState.realSchoolData,
      existingBkb: existingBkbToPreserve,
    });

    const finalBkb = existingBkbToPreserve.length > 0 ? existingBkbToPreserve : res.rebalancedBkb;

    isDirtyRef.current = true;
    setAppState((prev) => ({
      ...prev,
      kwitansiList: res.rebalancedKwitansi,
      wageReports: res.rebalancedWageReports,
      // CRITICAL: Protect user-entered BKB records from being erased
      bkbRecords: (prev.bkbRecords && prev.bkbRecords.length > 0) ? prev.bkbRecords : finalBkb,
      deletedBkuIds: [],
      deletedKwitansiIds: [],
    }));

    setSwitchNotification(
      `🧹 Berhasil menyeimbangkan BKU & Kwitansi: Dokumen ganda dibersihkan, data Menu BKB (${finalBkb.length} transaksi) tetap utuh aman!`
    );
    setTimeout(() => setSwitchNotification(null), 6000);

    setTimeout(() => {
      try {
        confetti({ particleCount: 70, spread: 80, origin: { y: 0.6 } });
      } catch {}
    }, 150);
  };

  const handleCalibrateToRealProgress = () => {
    const existingBkbToPreserve = appState.bkbRecords || [];

    // Identify latest active week with real physical progress
    const activeWeeks = appState.progressWeeks.filter(
      (w) => (w.bobotRealisasi && w.bobotRealisasi > 0) || w.divisions?.some((d) => (d.prestasiMingguIni || 0) > 0)
    );
    const maxActiveWeek = activeWeeks.length > 0 ? Math.max(...activeWeeks.map((w) => w.mingguKe)) : 1;

    // Synchronize bkuWeekLimit with maxActiveWeek if bkuWeekLimit is behind maxActiveWeek
    const targetLimit = Math.max(maxActiveWeek, bkuWeekLimit || 1);
    if (targetLimit !== bkuWeekLimit) {
      setBkuWeekLimit(targetLimit);
      localStorage.setItem('bkuWeekLimit', String(targetLimit));
    }

    const res = calibrateAllTransactionsToCurrentProgress({
      school: appState.school,
      kwitansiList: appState.kwitansiList,
      progressWeeks: appState.progressWeeks,
      workers: appState.workers,
      stores: appState.stores || [],
      rpdItems: appState.rpdItems,
      realSchoolData: appState.realSchoolData,
      existingBkb: existingBkbToPreserve,
      bkuWeekLimit: targetLimit,
    });

    const finalBkb = existingBkbToPreserve.length > 0 ? existingBkbToPreserve : res.calibratedBkb;

    isDirtyRef.current = true;
    setAppState((prev) => ({
      ...prev,
      kwitansiList: res.calibratedKwitansi,
      wageReports: res.calibratedWageReports,
      // CRITICAL: Protect user-entered BKB records from being erased
      bkbRecords: (prev.bkbRecords && prev.bkbRecords.length > 0) ? prev.bkbRecords : finalBkb,
      // CRITICAL FIX: Reset deleted IDs so newly calibrated transactions show up immediately in BKU after a clear
      deletedBkuIds: [],
      deletedKwitansiIds: [],
    }));

    setSwitchNotification(
      `⚡ Berhasil mengalibrasi BKU dengan progres fisik riil (${res.cumulativeBobot}%). Total Belanja Tercatat: Rp ${res.totalExpenditure.toLocaleString('id-ID')}. Data Menu BKB (${finalBkb.length} transaksi) tetap aman & utuh!`
    );
    setTimeout(() => setSwitchNotification(null), 7000);

    setTimeout(() => {
      try {
        confetti({ particleCount: 85, spread: 90, origin: { y: 0.6 } });
      } catch {}
    }, 150);
  };

  // BKB Handlers
  const handleInitStandardBkb = () => {
    const standard = generateStandardBkbRecords(appState.school, appState.progressWeeks, bkuWeekLimit);
    isDirtyRef.current = true;
    setAppState((prev) => ({
      ...prev,
      bkbRecords: standard,
    }));
    setSwitchNotification('⚡ Buku Kas Bank (BKB) berhasil diinisialisasi & terintegrasi penuh dengan BKU & Kas Tunai!');
    setTimeout(() => setSwitchNotification(null), 5000);
  };

  const handleAddBkbRecord = (tx: Omit<BkbTransaction, 'id'>) => {
    const newTx: BkbTransaction = {
      ...tx,
      id: `bkb-manual-${Date.now()}`,
    };
    isDirtyRef.current = true;
    setAppState((prev) => {
      const currentList = (prev.bkbRecords && prev.bkbRecords.length > 0)
        ? prev.bkbRecords
        : generateStandardBkbRecords(prev.school, prev.progressWeeks, bkuWeekLimit);
      return {
        ...prev,
        bkbRecords: [...currentList, newTx],
      };
    });
  };

  const handleUpdateBkbRecord = (updatedTx: BkbTransaction) => {
    isDirtyRef.current = true;
    setAppState((prev) => ({
      ...prev,
      bkbRecords: (prev.bkbRecords || []).map((b) => (b.id === updatedTx.id ? updatedTx : b)),
    }));
  };

  const handleDeleteBkbRecord = (txToDelete: BkbTransaction) => {
    isDirtyRef.current = true;
    setAppState((prev) => ({
      ...prev,
      bkbRecords: (prev.bkbRecords || []).filter((b) => b.id !== txToDelete.id),
    }));
  };

  const handleBulkDeleteBkb = (recordsToDelete: BkbTransaction[]) => {
    if (!recordsToDelete || recordsToDelete.length === 0) return;
    isDirtyRef.current = true;
    const idsToDelete = new Set(recordsToDelete.map((r) => r.id));
    setAppState((prev) => {
      const currentList = prev.bkbRecords !== undefined ? prev.bkbRecords : effectiveBkbList;
      return {
        ...prev,
        bkbRecords: currentList.filter((b) => !idsToDelete.has(b.id)),
      };
    });
    setSwitchNotification(`✅ Berhasil menghapus ${recordsToDelete.length} transaksi Bank (BKB) secara massal.`);
    setTimeout(() => setSwitchNotification(null), 4000);
  };

  const handleClearAllBkb = () => {
    isDirtyRef.current = true;
    setAppState((prev) => ({
      ...prev,
      bkbRecords: [],
    }));
    setSwitchNotification('✅ Seluruh data Buku Kas Bank (BKB) berhasil dikosongkan.');
    setTimeout(() => setSwitchNotification(null), 4000);
  };

  const handleResetData = () => {
    if (
      confirm(`Kosongkan seluruh data transaksi & pembukuan untuk ${appState.school.namaSekolah || currentTenant.namaSekolah}?

Data yang DIPERTAHANKAN:
- Ringkasan Proyek
- Data Real Sekolah
- Data Master Sekolah
- Upah Tenaga Kerja (Daftar Master Pekerja & Tukang)
- Toko Rekanan & Penyedia

Data yang DIKOSONGKAN:
- RPD, Laporan Mingguan & Bobot, BKU/BKT/BKB, Kwitansi & Absensi Upah.

Lanjutkan pengosongan data transaksi?`)
    ) {
      const cleanProgressWeeks = (appState.progressWeeks || initialProgressWeeks).map((w) => ({
        ...w,
        bobotRealisasi: 0,
        deviasi: Math.round((0 - w.bobotRencana) * 100) / 100,
        divisions: (w.divisions || []).map((d) => ({
          ...d,
          prestasiMingguLalu: 0,
          prestasiMingguIni: 0,
          prestasiSdMingguIni: 0,
        })),
      }));

      const cleanWageReports = (appState.wageReports || []).map((rep) => ({
        ...rep,
        totalUpah: 0,
        attendance: (rep.attendance || []).map((att) => ({
          ...att,
          days: [0, 0, 0, 0, 0, 0, 0] as [number, number, number, number, number, number, number],
          hok: 0,
          totalUpah: 0,
        })),
      }));

      const resetState: AppStateData = {
        school: { ...appState.school },
        realSchoolData: appState.realSchoolData || defaultRealSchoolData,
        workers: appState.workers && appState.workers.length > 0 ? appState.workers : initialWorkers,
        stores: appState.stores && appState.stores.length > 0 ? appState.stores : initialStores,
        rpdItems: [],
        kwitansiList: [],
        manualBkuTransactions: [],
        bkbRecords: [],
        deletedBkuIds: [],
        wageReports: cleanWageReports,
        progressWeeks: cleanProgressWeeks,
      };

      isDirtyRef.current = true;
      setAppState(resetState);
      setSwitchNotification('✅ Seluruh lembar transaksi & pembukuan berhasil dikosongkan. Data Master Sekolah, Data Real, Pekerja/Tukang & Toko Rekanan tetap tersimpan utuh.');
      setTimeout(() => setSwitchNotification(null), 5000);
    }
  };

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(appState, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `LPJ_${currentTenant.npsn}_${appState.school.namaSekolah.replace(/\s+/g, '_')}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportJson = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const parsed = JSON.parse(event.target?.result as string);
            if (parsed.school && parsed.rpdItems) {
              isDirtyRef.current = true;
              setAppState(parsed);
              alert(`Data LPJ untuk ${parsed.school.namaSekolah || currentTenant.namaSekolah} berhasil dipulihkan!`);
            } else {
              alert('Format file JSON tidak sesuai dengan skema LPJ Revitalisasi.');
            }
          } catch (err) {
            alert('Gagal membaca file JSON.');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const handleOpenPrint = (
    docType = 'ALL',
    month?: string,
    week?: number,
    kwId?: string,
    filterOptions?: any
  ) => {
    setPrintDocType(docType);
    setPrintMonth(month);
    setPrintWeekNum(week);
    setPrintKwitansiId(kwId);
    setPrintFilterOptions(filterOptions);
    setIsPrintModalOpen(true);
  };

  const handleLogout = async () => {
    try {
      await logoutGoogle();
    } catch {}
    setIsLoggedIn(false);
    setCurrentUser(null);
    setIsGoogleConnected(false);
    localStorage.removeItem('LPJ_USER_SESSION_ACTIVE');
    setSwitchNotification('Anda telah keluar dari ruang kerja sekolah. Silakan login kembali.');
    setTimeout(() => setSwitchNotification(null), 5000);
  };

  if (isInitialLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white text-center">
        <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center shadow-xl shadow-blue-500/30 mb-4 animate-pulse">
          <Database className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-xl font-bold tracking-tight">Memuat Database Multi-Sekolah...</h2>
        <p className="text-sm text-slate-400 mt-1 max-w-md">
          Menghubungkan ke Google Cloud Firestore ({firestoreDatabaseId}) dan memuat data terisolasi untuk {currentTenant.namaSekolah}...
        </p>
      </div>
    );
  }

  // Authentication & Login Mode Guard
  if (!isLoggedIn) {
    return (
      <>
        <LoginPortal
          tenants={tenants}
          currentTenant={currentTenant}
          onSelectTenant={(targetTenant) => {
            handleSelectTenant(targetTenant);
          }}
          onOpenCreateSchool={() => setIsSchoolPortalOpen(true)}
          onGoogleSignIn={async () => {
            setIsSigningInGoogle(true);
            try {
              const res = await googleSignIn();
              if (res) {
                setCurrentUser(res.user);
                setIsGoogleConnected(true);
                setIsLoggedIn(true);
                localStorage.setItem('LPJ_USER_SESSION_ACTIVE', 'true');
                setSwitchNotification(`Berhasil login dengan ${res.user.displayName || res.user.email} • Google Drive Terhubung Permanen!`);
                setTimeout(() => setSwitchNotification(null), 6000);
              }
            } catch (err: any) {
              alert(`Login Google gagal: ${err?.message || err}`);
            } finally {
              setIsSigningInGoogle(false);
            }
          }}
          isSigningInGoogle={isSigningInGoogle}
          currentUser={currentUser}
          onProceedToDashboard={() => {
            setIsLoggedIn(true);
            localStorage.setItem('LPJ_USER_SESSION_ACTIVE', 'true');
          }}
        />

        {/* Modal School Tenant Portal untuk mendaftarkan sekolah baru */}
        <SchoolTenantPortalModal
          isOpen={isSchoolPortalOpen}
          onClose={() => setIsSchoolPortalOpen(false)}
          currentTenant={currentTenant}
          tenants={tenants}
          onSelectTenant={handleSelectTenant}
          onDeleteTenant={handleDeleteTenant}
          onRegisterSchool={handleRegisterNewSchool}
          cloudDatabaseId={firestoreDatabaseId}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-800">
      {/* Top Header with Multi-Tenant School Switcher */}
      <Header
        school={appState.school}
        currentTenant={currentTenant}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenPrintModal={(type) => handleOpenPrint(type || 'ALL')}
        onReset={handleResetData}
        onExportJson={handleExportJson}
        onImportJson={handleImportJson}
        onOpenBackupRestoreModal={() => setIsBackupRestoreOpen(true)}
        isSyncing={isSyncing}
        lastSyncedText={lastSyncedText}
        onManualSave={handleManualSaveNow}
        onOpenGoogleSheetsSync={() => setIsGoogleSheetsModalOpen(true)}
        isGoogleConnected={isGoogleConnected}
        googleSheetName={googleSheetName}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      {/* Tenant Switch Notification Toast Banner */}
      {switchNotification && (
        <div className="bg-emerald-600 text-white px-4 py-2.5 shadow-md flex items-center justify-between text-xs font-medium animate-in slide-in-from-top duration-200 print:hidden">
          <div className="max-w-7xl mx-auto w-full flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-200 shrink-0" />
              <span>{switchNotification}</span>
            </div>
            <button
              onClick={() => setSwitchNotification(null)}
              className="text-emerald-100 hover:text-white p-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Tab Views */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 print:hidden">
        {activeTab === 'dashboard' && (
          <Dashboard
            school={appState.school}
            rpdItems={appState.rpdItems}
            kwitansiList={appState.kwitansiList}
            wageReports={appState.wageReports}
            progressWeeks={appState.progressWeeks}
            taxRecords={taxRecords}
            bkbList={effectiveBkbList}
            bktList={bktList}
            onNavigateTab={(tab) => setActiveTab(tab)}
            onOpenPrintModal={(type) => handleOpenPrint(type)}
            onOpenQuickReceipt={() => setIsQuickReceiptOpen(true)}
            isGoogleConnected={isGoogleConnected}
            googleSheetName={googleSheetName}
            isSyncing={isSyncing}
            lastSyncedText={lastSyncedText}
            onOpenGoogleSheetsSync={() => setIsGoogleSheetsModalOpen(true)}
          />
        )}

        {activeTab === 'realdata' && (
          <RealSchoolDataManager
            realData={appState.realSchoolData || defaultRealSchoolData}
            school={appState.school}
            stores={appState.stores || []}
            kwitansiList={appState.kwitansiList || []}
            onUpdateRealData={handleUpdateRealData}
            onApplyToAllModules={handleApplyRealDataToAll}
          />
        )}

        {activeTab === 'master' && (
          <MasterDataForm
            school={appState.school}
            onSave={handleUpdateSchool}
            onOpenPrintModal={(doc) => handleOpenPrint(doc)}
            onDeleteSchool={() => handleDeleteTenant(currentTenant)}
          />
        )}

        {activeTab === 'rpd' && (
          <RpdManager
            items={appState.rpdItems}
            onUpdateItems={handleUpdateRpd}
            onOpenPrintModal={() => handleOpenPrint('RPD')}
            availableStores={appState.stores || []}
            realSchoolData={appState.realSchoolData || defaultRealSchoolData}
            onSyncFromRealData={() => {
              handleApplyRealDataToAll(appState.realSchoolData || defaultRealSchoolData);
              setSwitchNotification(
                '✅ Data acuan, harga satuan, dan analisa dari Data Real Sekolah berhasil disinkronkan ke RPD & Progres Mingguan!'
              );
              setTimeout(() => setSwitchNotification(null), 4000);
            }}
          />
        )}

        {activeTab === 'progress' && (
          <WeeklyProgressManager
            progressWeeks={appState.progressWeeks}
            workers={appState.workers}
            rpdItems={appState.rpdItems}
            school={appState.school}
            realSchoolData={appState.realSchoolData || defaultRealSchoolData}
            onUpdateWeeks={handleUpdateProgressWeeks}
            onAutoGenerateFromProgress={handleAutoGenerateFromProgress}
            onAutoGenerateAllWeeks={handleAutoGenerateAllWeeks}
            onOpenPrintModal={(weekNum, docType) => handleOpenPrint(docType || 'PROGRESS', undefined, weekNum)}
            bkuList={bkuList}
            kwitansiList={appState.kwitansiList}
            onAddTransaction={(tx, weekNum) => handleAddManualBku(tx, weekNum)}
            onUpdateTransaction={handleUpdateBku}
            onDeleteTransaction={handleDeleteBku}
            onCalibrateToRealProgress={handleCalibrateToRealProgress}
          />
        )}

        {activeTab === 'bku' && (
          <BkuManager
            bkuList={bkuList}
            school={appState.school}
            progressWeeks={appState.progressWeeks}
            stores={appState.stores || []}
            kwitansiList={appState.kwitansiList}
            bktList={bktList}
            bkbList={effectiveBkbList}
            onOpenPrintModal={(month, filterOpts) =>
              handleOpenPrint('BKU', month, filterOpts?.weekNum, undefined, filterOpts)
            }
            onAddTransaction={handleAddManualBku}
            onUpdateTransaction={handleUpdateBku}
            onDeleteTransaction={handleDeleteBku}
            onUpdateStores={handleUpdateStores}
            onUpdateKwitansi={(updatedKw) => {
              const exists = appState.kwitansiList.some((k) => k.id === updatedKw.id);
              const updated = exists
                ? appState.kwitansiList.map((k) => (k.id === updatedKw.id ? updatedKw : k))
                : [updatedKw, ...appState.kwitansiList];
              handleUpdateKwitansiList(updated);
            }}
            onOpenPrintKwitansi={(kwId, mode) =>
              handleOpenPrint(mode || 'ALL', undefined, undefined, kwId)
            }
            onCalibrateToRealProgress={handleCalibrateToRealProgress}
            onCleanDuplicates={handleCleanDuplicates}
            onClearAllBku={handleClearAllBku}
            onBulkDeleteBku={handleBulkDeleteBku}
            bkuWeekLimit={bkuWeekLimit}
            onChangeBkuWeekLimit={handleUpdateBkuWeekLimit}
          />
        )}

        {activeTab === 'bkt' && (
          <BktManager
            bktList={bktList}
            school={appState.school}
            progressWeeks={appState.progressWeeks}
            stores={appState.stores || []}
            kwitansiList={appState.kwitansiList}
            bkuList={bkuList}
            bkbList={effectiveBkbList}
            onOpenPrintModal={(month, filterOpts) =>
              handleOpenPrint('BKT', month, filterOpts?.weekNum, undefined, filterOpts)
            }
            onAddTransaction={handleAddManualBku}
            onUpdateTransaction={handleUpdateBku}
            onDeleteTransaction={handleDeleteBku}
            onUpdateStores={handleUpdateStores}
            onUpdateKwitansi={(updatedKw) => {
              const exists = appState.kwitansiList.some((k) => k.id === updatedKw.id);
              const updated = exists
                ? appState.kwitansiList.map((k) => (k.id === updatedKw.id ? updatedKw : k))
                : [updatedKw, ...appState.kwitansiList];
              handleUpdateKwitansiList(updated);
            }}
            onOpenPrintKwitansi={(kwId, mode) =>
              handleOpenPrint(mode || 'ALL', undefined, undefined, kwId)
            }
            onCleanDuplicates={handleCleanDuplicates}
            onClearAllBkt={handleClearAllBkt}
            onBulkDeleteBkt={handleBulkDeleteBkt}
          />
        )}

        {activeTab === 'bkb' && (
          <BkbManager
            bkbList={effectiveBkbList}
            school={appState.school}
            progressWeeks={appState.progressWeeks}
            bkuList={bkuList}
            bktList={bktList}
            onOpenPrintModal={(period) => handleOpenPrint('BKB', period)}
            onAddBkbRecord={handleAddBkbRecord}
            onUpdateBkbRecord={handleUpdateBkbRecord}
            onDeleteBkbRecord={handleDeleteBkbRecord}
            onInitStandardBkb={handleInitStandardBkb}
            onClearAllBkb={handleClearAllBkb}
            onBulkDeleteBkb={handleBulkDeleteBkb}
          />
        )}

        {activeTab === 'pajak' && (
          <TaxManager
            taxRecords={taxRecords}
            school={appState.school}
            stores={appState.stores || []}
            onOpenPrintModal={(month) => handleOpenPrint('PAJAK', month)}
            onUpdateStores={handleUpdateStores}
            onAddManualTax={handleAddManualTax}
            onUpdateTax={handleUpdateTax}
            onDeleteTax={handleDeleteTax}
            onClearAllTaxes={handleClearAllTaxes}
            onBulkDeleteTaxes={handleBulkDeleteTaxes}
          />
        )}

        {activeTab === 'kwitansi' && (
          <KwitansiManager
            kwitansiList={appState.kwitansiList}
            school={appState.school}
            progressWeeks={appState.progressWeeks}
            stores={appState.stores || []}
            onOpenPrintKwitansi={(kwId, mode) => handleOpenPrint(mode, undefined, undefined, kwId)}
            onAddNewKwitansi={() => setIsQuickReceiptOpen(true)}
            onDeleteKwitansi={handleDeleteKwitansi}
            onAutoGenerateDailyAndWeekly={handleAutoGenerateDailyAndWeekly}
            onUpdateStores={handleUpdateStores}
            onUpdateKwitansiList={handleUpdateKwitansiList}
            onFullResyncToBudget={handleFullResyncToBudget}
            onCalibrateToRealProgress={handleCalibrateToRealProgress}
            onCleanDuplicates={handleCleanDuplicates}
          />
        )}

        {activeTab === 'upah' && (
          <WageManager
            wageReports={appState.wageReports}
            workers={appState.workers}
            school={appState.school}
            realSchoolData={appState.realSchoolData}
            divisions={appState.realSchoolData?.divisions}
            progressWeeks={appState.progressWeeks}
            kwitansiList={appState.kwitansiList}
            onUpdateWageReports={handleUpdateWageReports}
            onUpdateWorkers={handleUpdateWorkers}
            onUpdateKwitansiList={handleUpdateKwitansiList}
            onOpenPrintModal={(weekNum, mode) => handleOpenPrint(mode || 'UPAH', undefined, weekNum)}
          />
        )}

        {activeTab === 'toko' && (
          <StoreVendorManager
            stores={appState.stores || []}
            onUpdateStores={handleUpdateStores}
            onSelectForKwitansi={() => {
              setActiveTab('kwitansi');
              setIsQuickReceiptOpen(true);
            }}
          />
        )}
      </main>

      {/* Footer with Multi-Tenancy Info */}
      <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-500 print:hidden">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>
            Aplikasi Penyusunan LPJ Revitalisasi Sekolah Terintegrasi • Sesuai Standar Juknis DAK Fisik & Kemendikdasmen RI
          </p>
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
            <span className="font-mono text-[11px] text-slate-600">
              Tenant Aktif: {currentTenant.id} ({currentTenant.namaSekolah})
            </span>
          </div>
        </div>
      </footer>

      {/* Multi-Tenant School Portal Modal */}
      <SchoolTenantPortalModal
        isOpen={isSchoolPortalOpen}
        onClose={() => setIsSchoolPortalOpen(false)}
        currentTenant={currentTenant}
        tenants={tenants}
        onSelectTenant={handleSelectTenant}
        onDeleteTenant={handleDeleteTenant}
        onRegisterSchool={handleRegisterNewSchool}
        cloudDatabaseId={firestoreDatabaseId}
        onLogout={handleLogout}
      />

      {/* Quick Receipt Modal */}
      <QuickReceiptModal
        isOpen={isQuickReceiptOpen}
        onClose={() => setIsQuickReceiptOpen(false)}
        onSave={handleAddKwitansi}
        availableStores={appState.stores || []}
        realSchoolData={appState.realSchoolData}
        school={appState.school}
        progressWeeks={appState.progressWeeks}
      />

      {/* Full Document Printable Viewer Modal */}
      <PrintDocumentViewer
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        documentType={printDocType}
        selectedMonth={printMonth}
        selectedWeekNum={printWeekNum}
        selectedKwitansiId={printKwitansiId}
        filterOptions={printFilterOptions}
        school={appState.school}
        rpdItems={appState.rpdItems}
        kwitansiList={appState.kwitansiList}
        wageReports={appState.wageReports}
        bkuList={bkuList}
        bktList={bktList}
        bkbList={effectiveBkbList}
        taxRecords={taxRecords}
        progressWeeks={appState.progressWeeks}
        workers={appState.workers}
        realSchoolData={appState.realSchoolData}
      />

      {/* Google Sheets & Drive Database Sync Modal */}
      <GoogleSheetsSyncModal
        isOpen={isGoogleSheetsModalOpen}
        onClose={() => setIsGoogleSheetsModalOpen(false)}
        appState={appState}
        currentTenant={currentTenant}
        onStateRestored={handleStateRestoredFromGoogleSheets}
        onAutoSyncChange={(enabled) => {
          setIsAutoSyncToGoogleSheets(enabled);
          try {
            localStorage.setItem('LPJ_AUTO_SYNC_GOOGLE_SHEETS', enabled ? 'true' : 'false');
          } catch {}
        }}
        isAutoSyncEnabled={isAutoSyncToGoogleSheets}
      />

      {/* Manual Backup, Restore & Excel Export Modal */}
      <BackupRestoreModal
        isOpen={isBackupRestoreOpen}
        onClose={() => setIsBackupRestoreOpen(false)}
        appState={appState}
        onRestoreData={(restored) => {
          isDirtyRef.current = true;
          setAppState(restored);
        }}
        currentTenantName={currentTenant.namaSekolah}
      />

      {/* Confirmation Modal: Delete School & Database */}
      {tenantToDeleteConfirm && (
        <div className="fixed inset-0 z-[70] bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-rose-200 max-w-md w-full p-6 text-slate-800 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-3 bg-rose-100 rounded-xl">
                <Trash2 className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Konfirmasi Hapus Sekolah</h3>
                <p className="text-xs text-rose-600 font-semibold">Tindakan ini tidak dapat dibatalkan</p>
              </div>
            </div>

            <div className="bg-rose-50/70 border border-rose-100 rounded-xl p-3.5 text-xs text-slate-700 space-y-1.5">
              <p>
                Anda akan menghapus permanen database sekolah:
              </p>
              <p className="font-bold text-sm text-rose-950 font-sans">
                {tenantToDeleteConfirm.namaSekolah}
              </p>
              <div className="text-[11px] text-slate-600 flex items-center gap-2">
                <span>NPSN: <b className="font-mono">{tenantToDeleteConfirm.npsn || '-'}</b></span>
                <span>•</span>
                <span>{tenantToDeleteConfirm.kabKota || '-'}</span>
              </div>
              <p className="text-[11px] text-rose-700 pt-2 border-t border-rose-200/60 font-medium">
                ⚠️ Seluruh database cloud Firestore, data RPD, analisa AHSP, Kwitansi, Bon Toko, Buku Kas (BKU/BKT/BKB), dan laporan pajak sekolah ini akan dihapus secara permanen dan dihilangkan dari tampilan.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isDeletingTenantLoading}
                onClick={() => setTenantToDeleteConfirm(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeletingTenantLoading}
                onClick={handleConfirmDeleteTenant}
                className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white px-4 py-2 text-xs font-bold rounded-lg shadow-sm transition cursor-pointer"
              >
                {isDeletingTenantLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Menghapus Database...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Ya, Hapus Sekolah & Database</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
