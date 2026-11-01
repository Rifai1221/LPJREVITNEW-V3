import React, { useState, useEffect, useMemo, useRef, useCallback, Suspense, lazy } from 'react';
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
  isReceiptLocked,
  balanceFinalMaterialKwitansiToBudget,
  calculateCumulativeRealizedProgress,
} from './services/autoGeneratorService';
import { deriveRpd } from './utils/rpdFromLedger';
import {
  generateStandardBkbRecords,
  calculateRunningBkb,
  calculateIntegratedBkt,
  reconcileCashBalances,
  migrateAndTransformAppState,
  harmonizeBkbRecordsWithSiplah,
  syncBkbFromBku,
} from './services/cashLedgerIntegrationService';
import {
  SchoolTenant,
  DEFAULT_PRESET_TENANTS,
  PRESET_SDN1_MUARA_DUA,
  createSchoolStateForTenant,
} from './data/tenantPresets';
import {
  getStoredActiveTenantId,
  setStoredActiveTenantId,
  getGlobalActiveTenantId,
  loadSchoolTenantAppState,
  saveSchoolTenantAppState,
  registerNewSchoolTenant,
  checkIsQuotaExhausted,
  startSyncRetryWorker,
  subscribeSyncStatus,
  isTenantPendingSync,
  getStoredTenantRev,
  setCloudAutosaveBlocked,
  mapMembershipsToTenants,
  clearUserTenantCacheAndQueue,
  getPendingSyncCount,
  getGoogleSheetStorageKey,
  CloudSyncStatus,
} from './services/schoolTenantService';
import {
  subscribeUserMemberships,
  updateMembershipLastOpenedAt,
  getUserSchoolPref,
  setUserSchoolPref,
  createSchoolCallable,
  UserMembershipRecord,
} from './services/schoolMembershipService';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { db, auth } from './services/firebase';
import { useCan } from './hooks/useCan';
import { detectDataAnomalies, DataAnomalyProposal } from './services/storageService';
import { ConflictResolutionModal } from './components/ConflictResolutionModal';
import { AnomalyReviewModal } from './components/AnomalyReviewModal';
import { getMonthFromPeriodString, resolveWeekDates } from './utils/monthHelper';
import { syncProgressWeeksWithRealData, calculateSequentialWaterfallRpdItems } from './utils/divisionHelper';
import { firestoreDatabaseId } from './services/firebase';
import { initialProgressWeeks, initialWorkers, initialStores } from './data/initialData';
import { syncAndReconcileAll9CategoriesToBudget } from './utils/projectSummaryRekapHelper';

import { Header } from './components/Header';
import { QuickReceiptModal } from './components/QuickReceiptModal';
import { SchoolTenantPortalModal } from './components/SchoolTenantPortalModal';
import { GoogleSheetsSyncModal } from './components/GoogleSheetsSyncModal';
import { LoginPortal } from './components/LoginPortal';

const Dashboard = lazy(() => import('./components/Dashboard').then((m) => ({ default: m.Dashboard })));
const MasterDataForm = lazy(() => import('./components/MasterDataForm').then((m) => ({ default: m.MasterDataForm })));
const RpdManager = lazy(() => import('./components/RpdManager').then((m) => ({ default: m.RpdManager })));
const WeeklyProgressManager = lazy(() => import('./components/WeeklyProgressManager').then((m) => ({ default: m.WeeklyProgressManager })));
const BkuManager = lazy(() => import('./components/BkuManager').then((m) => ({ default: m.BkuManager })));
const BktManager = lazy(() => import('./components/BktManager').then((m) => ({ default: m.BktManager })));
const BkbManager = lazy(() => import('./components/BkbManager').then((m) => ({ default: m.BkbManager })));
const TaxManager = lazy(() => import('./components/TaxManager').then((m) => ({ default: m.TaxManager })));
const KwitansiManager = lazy(() => import('./components/KwitansiManager').then((m) => ({ default: m.KwitansiManager })));
const WageManager = lazy(() => import('./components/WageManager').then((m) => ({ default: m.WageManager })));
const StoreVendorManager = lazy(() => import('./components/StoreVendorManager').then((m) => ({ default: m.StoreVendorManager })));
const RealSchoolDataManager = lazy(() => import('./components/RealSchoolDataManager').then((m) => ({ default: m.RealSchoolDataManager })));
const PrintDocumentViewer = lazy(() => import('./components/PrintDocumentViewer').then((m) => ({ default: m.PrintDocumentViewer })));
const BackupRestoreModal = lazy(() => import('./components/BackupRestoreModal').then((m) => ({ default: m.BackupRestoreModal })));
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
import {
  LocalUserSession,
  getLocalUserSession,
  clearLocalUserSession,
  setLocalUserSession,
  setSchoolPin,
} from './utils/authHelper';
import { CheckCircle2, Database, ShieldAlert, Sparkles, X, Trash2, RefreshCw, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { defaultRealSchoolData } from './data/realSchoolData';
import { RealSchoolData, RpdKategori } from './types';
import { validateFinancialReconciliation } from './utils/reconciliationValidator';
import { ReconciliationBanner } from './components/ReconciliationBanner';
import { decryptJsonData } from './utils/cryptoHelper';
import { useToast } from './context/ToastContext';

export default function App() {
  // Multi-Tenant & User Memberships States (Requirement 1 & 2)
  const [memberships, setMemberships] = useState<UserMembershipRecord[]>([]);
  const tenants = useMemo(() => mapMembershipsToTenants(memberships), [memberships]);
  const [currentTenant, setCurrentTenant] = useState<SchoolTenant>(() => {
    const savedId = getStoredActiveTenantId();
    return {
      id: savedId || 'sch_loading',
      namaSekolah: 'MEMUAT SEKOLAH...',
      npsn: '',
      jenjang: 'SD',
      kabKota: '',
      provinsi: '',
      email: '',
      isDemo: false,
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
    };
  });
  const currentTenantRef = useRef(currentTenant);
  useEffect(() => {
    currentTenantRef.current = currentTenant;
  }, [currentTenant]);

  const membershipsRef = useRef(memberships);
  useEffect(() => {
    membershipsRef.current = memberships;
  }, [memberships]);

  const [isSchoolPortalOpen, setIsSchoolPortalOpen] = useState(false);
  const [schoolPortalInitialTab, setSchoolPortalInitialTab] = useState<'switch' | 'join' | 'create' | 'members' | 'pin'>('switch');
  const [isSwitchingOverlay, setIsSwitchingOverlay] = useState(false);
  const [switchingTargetName, setSwitchingTargetName] = useState('');
  const switchRequestId = useRef(0);
  const [hasLegacyNeedsMigration, setHasLegacyNeedsMigration] = useState(false);
  const [isCreatingDemo, setIsCreatingDemo] = useState(false);

  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedText, setLastSyncedText] = useState('Otomatis');
  const toast = useToast();
  const setSwitchNotification = useCallback((msg: string | null) => {
    if (!msg) return;
    if (msg.includes('❌') || msg.toLowerCase().includes('gagal') || msg.toLowerCase().includes('error')) {
      toast.error(msg);
    } else if (msg.includes('⚠️') || msg.toLowerCase().includes('peringatan') || msg.toLowerCase().includes('perhatian')) {
      toast.warning(msg);
    } else {
      toast.success(msg);
    }
  }, [toast]);

  // Authentication & Dual Login Mode States
  const [localSession, setLocalSession] = useState<LocalUserSession | null>(() => getLocalUserSession());
  const [currentUser, setCurrentUser] = useState<GoogleUserProfile | null>(() => getCurrentUser() || null);
  const [isSigningInGoogle, setIsSigningInGoogle] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    try {
      const active = localStorage.getItem('LPJ_USER_SESSION_ACTIVE');
      return active === 'true' || !!getLocalUserSession();
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

  // App State per Tenant with Monotonic Change Counter (Requirement 2)
  const [appState, _setAppState] = useState<AppStateData>(() =>
    createSchoolStateForTenant(PRESET_SDN1_MUARA_DUA, 'full')
  );
  const changeCounterRef = useRef(0);
  const savedCounterRef = useRef(0);
  const isLoadedRef = useRef(false);
  const isDirtyRef = useRef(false);

  // Status and Modal States (Requirement 1, 3, 5)
  const [cloudStatus, setCloudStatus] = useState<CloudSyncStatus>('ok');
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [conflictState, setConflictState] = useState<{
    isOpen: boolean;
    serverRev: number;
    localRev: number;
    serverState?: AppStateData;
  }>({
    isOpen: false,
    serverRev: 1,
    localRev: 1,
  });
  const [anomalies, setAnomalies] = useState<DataAnomalyProposal[]>([]);
  const [isAnomalyModalOpen, setIsAnomalyModalOpen] = useState(false);
  const [isCloudAutosaveBlocked, setIsCloudAutosaveBlocked] = useState(false);

  // Wrapped setAppState tracking monotonic change counter
  const setAppState = React.useCallback((action: React.SetStateAction<AppStateData>) => {
    changeCounterRef.current += 1;
    isDirtyRef.current = true;
    _setAppState(action);
  }, []);

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

  // Listen to background sync retry queue worker (Requirement 1 & 6)
  useEffect(() => {
    startSyncRetryWorker();
    const unsub = subscribeSyncStatus((count) => {
      setPendingSyncCount(count);
      if (count > 0) {
        setCloudStatus('failed');
      }
    });
    return () => unsub();
  }, []);

  // 1. Listen to Firebase Auth state with Auto-Guest Sign In
  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        setIsLoggedIn(true);
        setCurrentUser({
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName || (user.isAnonymous ? 'Pengguna Tamu' : user.email) || 'Pengguna',
          photoURL: user.photoURL || null,
        });
        localStorage.setItem('LPJ_USER_SESSION_ACTIVE', 'true');
      } else {
        // Auto-Guest Mode: Automatically sign in anonymously when no user is signed in
        signInAnonymously(auth).catch((err) => {
          console.warn('Notice auto-guest sign in:', err);
          setIsLoggedIn(true);
          setIsInitialLoading(false);
        });
      }
    });
    return () => unsubAuth();
  }, []);

  // 2. Listen to User Memberships when logged in (Requirement 1 & 2)
  useEffect(() => {
    if (!currentUser?.uid) {
      setMemberships([]);
      return;
    }

    const unsubMem = subscribeUserMemberships(currentUser.uid, async (mList) => {
      setMemberships(mList);

      if (mList.length === 0) {
        setHasLegacyNeedsMigration(false);
        // Auto-register default initial tenant for Auto-Guest user if zero memberships exist
        try {
          const defaultTenant = PRESET_SDN1_MUARA_DUA;
          const initialState = createSchoolStateForTenant(defaultTenant, 'full');

          await setDoc(
            doc(db, 'users', currentUser.uid, 'memberships', defaultTenant.id),
            {
              schoolId: defaultTenant.id,
              namaSekolah: defaultTenant.namaSekolah,
              npsn: defaultTenant.npsn,
              jenjang: defaultTenant.jenjang,
              kabKota: defaultTenant.kabKota,
              role: 'BENDAHARA',
              lastOpenedAt: serverTimestamp(),
            },
            { merge: true }
          );

          setCurrentTenant(defaultTenant);
          setStoredActiveTenantId(defaultTenant.id);
          _setAppState(initialState);
          isLoadedRef.current = true;
          isDirtyRef.current = false;
          setIsInitialLoading(false);
        } catch (err) {
          console.warn('Notice auto-provisioning initial tenant for guest:', err);
          setCurrentTenant(PRESET_SDN1_MUARA_DUA);
          _setAppState(createSchoolStateForTenant(PRESET_SDN1_MUARA_DUA, 'full'));
          isLoadedRef.current = true;
          setIsInitialLoading(false);
        }
        return;
      }

      setHasLegacyNeedsMigration(false);

      // Determine active school: user's pref if still member, else top membership (newest opened)
      const savedPrefId = await getUserSchoolPref(currentUser.uid);
      const targetMem = mList.find((m) => m.schoolId === savedPrefId) || mList[0];

      if (targetMem) {
        const tenantObj: SchoolTenant = {
          id: targetMem.schoolId,
          namaSekolah: targetMem.namaSekolah,
          npsn: targetMem.npsn,
          jenjang: (targetMem.jenjang || 'SD') as any,
          kabKota: targetMem.kabKota || '-',
          provinsi: '-',
          email: '-',
          isDemo: false,
          createdAt: typeof targetMem.lastOpenedAt === 'string' ? targetMem.lastOpenedAt : new Date().toISOString(),
          lastLogin: typeof targetMem.lastOpenedAt === 'string' ? targetMem.lastOpenedAt : new Date().toISOString(),
        };

        if (!isLoadedRef.current || currentTenantRef.current.id !== tenantObj.id) {
          setCurrentTenant(tenantObj);
          setStoredActiveTenantId(tenantObj.id);

          try {
            const loaded = await loadSchoolTenantAppState(tenantObj);
            _setAppState(loaded.state);
            isLoadedRef.current = true;
            isDirtyRef.current = false;
            savedCounterRef.current = changeCounterRef.current;
            setIsInitialLoading(false);
            setIsCloudAutosaveBlocked(Boolean(loaded.isCloudAutosaveBlocked));
            setCloudStatus(loaded.source === 'cloud' ? 'ok' : 'failed');
            setLastSyncedText(
              loaded.source === 'cloud'
                ? 'Cloud Firestore'
                : loaded.source === 'cache'
                ? 'Memori Offline'
                : 'Template Awal'
            );
            const detected = detectDataAnomalies(loaded.state);
            setAnomalies(detected);
          } catch (err) {
            console.error('Initial load error:', err);
            setIsInitialLoading(false);
          }
        }
      }
    });

    return () => unsubMem();
  }, [currentUser?.uid]);

  // Listen to Google Auth & refresh linked spreadsheet name for current active school
  useEffect(() => {
    const unsub = initAuth(
      (user) => {
        setIsGoogleConnected(true);
        if (user) {
          setCurrentUser(user);
        }
        try {
          const key = getGoogleSheetStorageKey(currentTenant.id, currentUser?.uid);
          const saved = localStorage.getItem(key);
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
  }, [currentTenant.id, currentUser?.uid]);

  // 3. Real-time Cloud Auto-Save on state change with Counter Concurrency Guard (Requirement 1, 2, 4, 5)
  // CRITICAL: NEVER auto-save unless data has been successfully loaded AND user has explicitly modified it!
  useEffect(() => {
    if (!isLoadedRef.current || !isDirtyRef.current) {
      return;
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    setIsSyncing(true);
    const tenantIdAtClosure = currentTenant.id;
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const versionAtStart = changeCounterRef.current;
        const currentRev = getStoredTenantRev(tenantIdAtClosure, currentUser?.uid);
        const res = await saveSchoolTenantAppState(tenantIdAtClosure, appState, currentRev, currentUser?.uid);

        setIsSyncing(false);
        setCloudStatus(res.cloud);

        // Check for concurrency conflict (Requirement 3 & 5)
        if (res.error === 'CONCURRENCY_CONFLICT') {
          setConflictState({
            isOpen: true,
            serverRev: res.rev || currentRev + 1,
            localRev: currentRev,
            serverState: res.serverState,
          });
        }

        // Only mark clean if no new changes happened while save was executing
        if (changeCounterRef.current === versionAtStart) {
          isDirtyRef.current = false;
          savedCounterRef.current = versionAtStart;
        }

        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} WIB`;
        if (res.cloud === 'ok') {
          setLastSyncedText(`${timeStr}`);
        } else if (res.cloud === 'quota') {
          setLastSyncedText(`Batas Kuota Cloud ${timeStr}`);
        } else {
          setLastSyncedText(`Perangkat Lokal ${timeStr}`);
        }

        // Auto-sync to user's Google Spreadsheet if enabled
        if (isAutoSyncToGoogleSheets && isGoogleConnected) {
          try {
            const key = getGoogleSheetStorageKey(tenantIdAtClosure, currentUser?.uid);
            const saved = localStorage.getItem(key);
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
        setCloudStatus('failed');
        setLastSyncedText('Perangkat Lokal');
      }
    }, 1800);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [appState, currentTenant.id, isAutoSyncToGoogleSheets, isGoogleConnected, currentUser?.uid]);

  // 4. Safe School Switch Protocol (Requirement 3: Atomic Flush, Token, Isolation, and State Reset)
  const switchSchool = async (targetTenant: SchoolTenant) => {
    if (targetTenant.id === currentTenantRef.current.id) return;

    const oldTenantId = currentTenantRef.current.id;
    const oldStateSnapshot = appState;
    const requestId = ++switchRequestId.current;

    setIsSwitchingOverlay(true);
    setSwitchingTargetName(targetTenant.namaSekolah);

    try {
      // Step B: FLUSH old state if dirty
      if (isDirtyRef.current) {
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
          saveTimeoutRef.current = null;
        }
        const currentRev = getStoredTenantRev(oldTenantId, currentUser?.uid);
        try {
          const saveRes = await saveSchoolTenantAppState(oldTenantId, oldStateSnapshot, currentRev, currentUser?.uid);
          if (saveRes.cloud !== 'ok') {
            const proceed = confirm(
              `Penyimpanan cloud untuk ${currentTenantRef.current.namaSekolah} tertunda (tersimpan aman di memori perangkat ini). Tetap berpindah ke ${targetTenant.namaSekolah}?`
            );
            if (!proceed) {
              setIsSwitchingOverlay(false);
              return;
            }
          }
        } catch (err: any) {
          console.warn('Flush error before switch:', err);
        }
      }

      // Step D: Verify target school membership
      if (currentUser?.uid) {
        const isMember = membershipsRef.current.some((m) => m.schoolId === targetTenant.id);
        if (!isMember) {
          try {
            const memDoc = await getDoc(doc(db, 'schools', targetTenant.id, 'members', currentUser.uid));
            if (!memDoc.exists()) {
              toast.error(`Akses Ditolak: Anda bukan anggota dari ${targetTenant.namaSekolah}.`);
              setIsSwitchingOverlay(false);
              return;
            }
          } catch {
            toast.error(`Akses Ditolak: Anda bukan anggota dari ${targetTenant.namaSekolah}.`);
            setIsSwitchingOverlay(false);
            return;
          }
        }
      }

      // Step E: Reset ALL tenant-derived state before setting new state
      isDirtyRef.current = false;
      isLoadedRef.current = false;
      setAnomalies([]);
      setConflictState({ isOpen: false, serverRev: 1, localRev: 1 });
      setCloudStatus('ok');
      setIsCloudAutosaveBlocked(false);
      setGoogleSheetName(undefined);
      _setAppState(createSchoolStateForTenant(targetTenant, 'blank'));
      setCurrentTenant(targetTenant);
      setStoredActiveTenantId(targetTenant.id);

      // Load data for target tenant
      const loaded = await loadSchoolTenantAppState(targetTenant);

      // Step C: Stale switch request ignored if a newer request arrived
      if (switchRequestId.current !== requestId) {
        console.warn(`[App] Stale switch request ${requestId} ignored; current is ${switchRequestId.current}`);
        return;
      }

      _setAppState(loaded.state);
      isLoadedRef.current = true;
      isDirtyRef.current = false;
      savedCounterRef.current = changeCounterRef.current;
      setIsCloudAutosaveBlocked(Boolean(loaded.isCloudAutosaveBlocked));
      setCloudStatus(loaded.source === 'cloud' ? 'ok' : 'failed');
      setLastSyncedText(
        loaded.source === 'cloud'
          ? 'Cloud Firestore'
          : loaded.source === 'cache'
          ? 'Memori Offline'
          : 'Template Awal'
      );

      // Reload Google Sheet connection for new tenant
      try {
        const key = getGoogleSheetStorageKey(targetTenant.id, currentUser?.uid);
        const savedSheet = localStorage.getItem(key);
        if (savedSheet) {
          const parsed = JSON.parse(savedSheet);
          setGoogleSheetName(parsed.name);
        }
      } catch {}

      // Detect anomalies non-destructively for switched tenant
      const detected = detectDataAnomalies(loaded.state);
      setAnomalies(detected);

      // Step F: Update lastOpenedAt & prefs/school
      if (currentUser?.uid) {
        updateMembershipLastOpenedAt(currentUser.uid, targetTenant.id);
        setUserSchoolPref(currentUser.uid, targetTenant.id);
      }

      toast.success(`Berhasil beralih ke database ${targetTenant.namaSekolah}.`);
    } catch (err: any) {
      console.error('Error in switchSchool:', err);
      toast.error(`Gagal beralih ke ${targetTenant.namaSekolah}: ${err?.message || err}`);
    } finally {
      setIsSwitchingOverlay(false);
    }
  };

  // Handle registering a new school
  const handleRegisterNewSchool = async (data: {
    namaSekolah: string;
    npsn: string;
    jenjang: 'TK/PAUD' | 'SD' | 'SMP/MTs' | 'SMA/SMK' | string;
    kabKota: string;
    provinsi: string;
    email?: string;
    pin: string;
    templateType: 'full' | 'blank';
  }) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    try {
      const result = await registerNewSchoolTenant(data);

      // Perform instant optimistic switch to new school (no blocking remote fetch delay!)
      isDirtyRef.current = false;
      setAnomalies([]);
      setConflictState({ isOpen: false, serverRev: 1, localRev: 1 });
      setCloudStatus('ok');
      setIsCloudAutosaveBlocked(false);
      setGoogleSheetName(undefined);

      _setAppState(result.state);
      setCurrentTenant(result.tenant);
      setStoredActiveTenantId(result.tenant.id);
      isLoadedRef.current = true;
      savedCounterRef.current = changeCounterRef.current;

      if (currentUser?.uid) {
        updateMembershipLastOpenedAt(currentUser.uid, result.tenant.id);
        setUserSchoolPref(currentUser.uid, result.tenant.id);
      }

      setIsSyncing(false);
      setLastSyncedText('Database Baru Tersimpan');
      setSwitchNotification(`Database baru untuk ${result.tenant.namaSekolah} berhasil dibuat & tersimpan!`);
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

  // Create Demo School Handler (Requirement 2)
  const handleCreateDemoSchool = async () => {
    setIsCreatingDemo(true);
    try {
      const demoNpsn = `1010${Math.floor(1000 + Math.random() * 9000)}`;
      const demoResult = await registerNewSchoolTenant({
        namaSekolah: 'SDN 1 MUARA DUA (CONTOH SIMULASI)',
        npsn: demoNpsn,
        jenjang: 'SD',
        kabKota: 'Kota Lhokseumawe',
        provinsi: 'Prov. Aceh',
        email: 'demo@revitalisasi.sch.id',
        pin: '123456',
        templateType: 'full',
      });
      await switchSchool(demoResult.tenant);
      toast.success('Sekolah contoh berhasil dibuat dengan data simulasi 100% lengkap!');
    } catch (err: any) {
      toast.error('Gagal membuat sekolah contoh: ' + (err?.message || err));
    } finally {
      setIsCreatingDemo(false);
    }
  };

  // Manual save trigger for instant user peace of mind
  const handleManualSaveNow = async () => {
    setIsSyncing(true);
    try {
      const versionAtStart = changeCounterRef.current;
      const currentRev = getStoredTenantRev(currentTenant.id, currentUser?.uid);
      const res = await saveSchoolTenantAppState(currentTenant.id, appState, currentRev, currentUser?.uid);

      setCloudStatus(res.cloud);

      if (res.error === 'CONCURRENCY_CONFLICT') {
        setConflictState({
          isOpen: true,
          serverRev: res.rev || currentRev + 1,
          localRev: currentRev,
          serverState: res.serverState,
        });
      }

      if (changeCounterRef.current === versionAtStart) {
        isDirtyRef.current = false;
        savedCounterRef.current = versionAtStart;
      }

      // Also sync to Google Sheets if connected
      if (isGoogleConnected) {
        try {
          const key = getGoogleSheetStorageKey(currentTenant.id, currentUser?.uid);
          const saved = localStorage.getItem(key);
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

      setCloudStatus(res.cloud);

      if (res.error === 'CONCURRENCY_CONFLICT') {
        setConflictState({
          isOpen: true,
          serverRev: res.rev || currentRev + 1,
          localRev: currentRev,
          serverState: res.serverState,
        });
      }

      if (changeCounterRef.current === versionAtStart) {
        isDirtyRef.current = false;
        savedCounterRef.current = versionAtStart;
      }
      
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
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} WIB`;
      if (res.cloud === 'ok') {
        setLastSyncedText(`${timeStr}`);
        setSwitchNotification(`Data ${currentTenant.namaSekolah} berhasil disimpan permanen ke Google Cloud Firestore${isGoogleConnected ? ' & Google Sheets' : ''}.`);
      } else if (res.cloud === 'quota') {
        setLastSyncedText(`Batas Kuota Cloud ${timeStr}`);
        setSwitchNotification(`Data ${currentTenant.namaSekolah} tersimpan aman di IndexedDB lokal browser (Batas kuota harian cloud tercapai).`);
      } else {
        setLastSyncedText(`Perangkat Lokal ${timeStr}`);
        setSwitchNotification(`Data ${currentTenant.namaSekolah} tersimpan di memori perangkat ini dan akan dicoba sinkron ulang otomatis.`);
      }
    } catch (err) {
      console.warn('Manual save error:', err);
      setIsSyncing(false);
      setCloudStatus('failed');
      setLastSyncedText('Perangkat Lokal');
    }
  };

  // Concurrency Conflict Resolution Handlers (Requirement 3)
  const handleResolveConflictMerge = async () => {
    if (!conflictState.serverState) {
      setConflictState((prev) => ({ ...prev, isOpen: false }));
      return;
    }
    const server = conflictState.serverState;
    const serverKwMap = new Map((server.kwitansiList || []).map((k) => [k.id, k]));
    const mergedKw = [...(server.kwitansiList || [])];
    (appState.kwitansiList || []).forEach((localK) => {
      if (!serverKwMap.has(localK.id)) {
        mergedKw.push(localK);
      }
    });

    const serverBkuMap = new Map((server.manualBkuTransactions || []).map((b) => [b.id, b]));
    const mergedBku = [...(server.manualBkuTransactions || [])];
    (appState.manualBkuTransactions || []).forEach((localB) => {
      if (!serverBkuMap.has(localB.id)) {
        mergedBku.push(localB);
      }
    });

    const mergedState: AppStateData = {
      ...server,
      school: appState.school || server.school,
      kwitansiList: mergedKw,
      manualBkuTransactions: mergedBku,
      progressWeeks: appState.progressWeeks?.length ? appState.progressWeeks : server.progressWeeks,
      wageReports: appState.wageReports?.length ? appState.wageReports : server.wageReports,
    };

    const nextRev = Math.max(conflictState.serverRev, conflictState.localRev) + 1;
    _setAppState(mergedState);
    setConflictState({ isOpen: false, serverRev: nextRev, localRev: nextRev });
    await saveSchoolTenantAppState(currentTenant.id, mergedState, nextRev - 1, currentUser?.uid);
    setCloudStatus('ok');
    setSwitchNotification('Data berhasil digabungkan dengan versi cloud secara aman.');
    setTimeout(() => setSwitchNotification(null), 5000);
  };

  const handleResolveConflictUseMine = async () => {
    const nextRev = Math.max(conflictState.serverRev, conflictState.localRev) + 1;
    setConflictState((prev) => ({ ...prev, isOpen: false }));
    await saveSchoolTenantAppState(currentTenant.id, appState, nextRev - 1, currentUser?.uid);
    setCloudStatus('ok');
    setSwitchNotification('Data lokal berhasil menimpa revisi di cloud.');
    setTimeout(() => setSwitchNotification(null), 5000);
  };

  const handleResolveConflictUseCloud = () => {
    if (conflictState.serverState) {
      _setAppState(conflictState.serverState);
      isDirtyRef.current = false;
      savedCounterRef.current = changeCounterRef.current;
    }
    setConflictState((prev) => ({ ...prev, isOpen: false }));
    setCloudStatus('ok');
    setSwitchNotification('Data terbaru dari cloud berhasil dimuat.');
    setTimeout(() => setSwitchNotification(null), 5000);
  };

  const handleResolveConflictDownloadBoth = () => {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const cleanSchoolName = (appState.school?.namaSekolah || 'Sekolah').replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `Backup_LPJ_Lokal_${cleanSchoolName}_${dateStr}.json`;
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(appState, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', filename);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();

    if (conflictState.serverState) {
      _setAppState(conflictState.serverState);
      isDirtyRef.current = false;
      savedCounterRef.current = changeCounterRef.current;
    }
    setConflictState((prev) => ({ ...prev, isOpen: false }));
    setCloudStatus('ok');
    setSwitchNotification(`Cadangan lokal diunduh (${filename}) dan data cloud berhasil dimuat.`);
    setTimeout(() => setSwitchNotification(null), 5000);
  };

  // Data Anomaly Resolution Handler (Requirement 5)
  const handleApplyAnomalies = (selectedIds: string[]) => {
    let nextState = appState;
    anomalies
      .filter((a) => selectedIds.includes(a.id))
      .forEach((a) => {
        nextState = a.applyFix(nextState);
      });
    setAppState(nextState);
    setAnomalies((prev) => prev.filter((a) => !selectedIds.includes(a.id)));
    setSwitchNotification('Perbaikan konsistensi data pembukuan berhasil diterapkan.');
    setTimeout(() => setSwitchNotification(null), 5000);
  };

  // Restore state from Google Sheets callback
  const handleStateRestoredFromGoogleSheets = async (newState: AppStateData) => {
    isDirtyRef.current = false;
    const migrated = migrateAndTransformAppState(newState);
    setAppState(migrated);
    await saveSchoolTenantAppState(currentTenant.id, migrated);
    setSwitchNotification(`Data LPJ Revit berhasil dipulihkan dari Google Sheets (${currentTenant.namaSekolah})!`);
    setTimeout(() => setSwitchNotification(null), 5000);
  };

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
    if (appState.bkbRecords && appState.bkbRecords.length > 0) {
      const harmonized = harmonizeBkbRecordsWithSiplah(appState.bkbRecords, bkuList, appState.school);
      return calculateRunningBkb(harmonized);
    }
    return generateStandardBkbRecords(appState.school, appState.progressWeeks, bkuWeekLimit, bkuList);
  }, [appState.bkbRecords, appState.school, appState.progressWeeks, bkuWeekLimit, bkuList]);

  const bktList = useMemo(() => {
    return calculateIntegratedBkt(bkuList, effectiveBkbList);
  }, [bkuList, effectiveBkbList]);

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

  const reconciliationReport = useMemo(() => {
    return validateFinancialReconciliation(
      appState,
      bkuList,
      bktList,
      effectiveBkbList,
      taxRecords
    );
  }, [appState, bkuList, bktList, effectiveBkbList, taxRecords]);

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
    
    // Define Immutable Anchor ID: Strip prefixes and ensure uniform bku- format
    const baseId = updatedTx.id.replace(/^(bkt-|bku-|kw-|bku-kw-)+/g, '');
    const anchorId = `bku-${baseId}`;
    const cleanBukti = (updatedTx.noBukti || '').trim().toUpperCase();

    setAppState((prev) => {
      let matchedKwId = updatedTx.kwitansiIdRef;

      // 1. Update KwitansiList linked by ID, kwitansiIdRef, or noBukti
      const updatedKwitansi = prev.kwitansiList.map((kw) => {
        const kwBukti = (kw.noBukti || '').trim().toUpperCase();
        const isMatch =
          (matchedKwId && kw.id === matchedKwId) ||
          kw.id === baseId ||
          kw.id === `kw-${baseId}` ||
          (cleanBukti && cleanBukti !== '-' && kwBukti === cleanBukti);

        if (isMatch) {
          if (!matchedKwId) matchedKwId = kw.id;
          return {
            ...kw,
            tanggal: updatedTx.tanggal,
            tanggalFormatted: updatedTx.tanggal,
            tanggalObj: updatedTx.tanggalObj,
            bulan: updatedTx.bulan,
            uraian: updatedTx.uraian,
            noBukti: updatedTx.noBukti,
            nominal: updatedTx.pengeluaran || updatedTx.penerimaan || kw.nominal,
            isLocked: true,
            isManual: true,
            isManualDate: true,
          };
        }
        return kw;
      });

      // 2. Prepare locked manual BKU transaction
      const manualItem: BkuTransaction = {
        ...updatedTx,
        id: anchorId,
        kwitansiIdRef: matchedKwId || updatedTx.kwitansiIdRef,
        isLocked: true,
        isManual: true,
        isManualDate: true,
      };

      // 3. Update or upsert manual transactions using the same Immutable Anchor ID or noBukti
      const existingManual = prev.manualBkuTransactions || [];
      const matchManualIndex = existingManual.findIndex((m) => {
        const mBukti = (m.noBukti || '').trim().toUpperCase();
        return (
          m.id === anchorId ||
          m.id === updatedTx.id ||
          (matchedKwId && m.kwitansiIdRef === matchedKwId) ||
          (cleanBukti && cleanBukti !== '-' && mBukti === cleanBukti)
        );
      });

      let updatedManual: BkuTransaction[];
      if (matchManualIndex >= 0) {
        updatedManual = [...existingManual];
        updatedManual[matchManualIndex] = manualItem;
      } else {
        updatedManual = [...existingManual, manualItem];
      }

      // 4. If transaction is also present in BKB (Bank), sync it too
      const updatedBkb = (prev.bkbRecords || []).map((b) => {
        const bBukti = (b.noBukti || '').trim().toUpperCase();
        if (
          b.id === baseId ||
          b.id === updatedTx.id ||
          (cleanBukti && cleanBukti !== '-' && bBukti === cleanBukti)
        ) {
          return {
            ...b,
            tanggal: updatedTx.tanggal,
            tanggalObj: updatedTx.tanggalObj,
            bulan: updatedTx.bulan,
            uraian: updatedTx.uraian,
            noBukti: updatedTx.noBukti,
          };
        }
        return b;
      });

      return {
        ...prev,
        kwitansiList: updatedKwitansi,
        manualBkuTransactions: updatedManual,
        bkbRecords: updatedBkb,
      };
    });

    // 5. Force Immediate persistence to Cloud / Local
    handleManualSaveNow();
  };

  const handleDeleteBku = (txToDelete: BkuTransaction) => {
    isDirtyRef.current = true;
    setAppState((prev) => {
      const rawId = txToDelete.id || '';
      const cleanId = rawId.replace(/^bkt-/, '').replace(/^bku-/, '').replace(/-p[12]$/, '');
      const refId = (txToDelete.kwitansiIdRef || '').replace(/-p[12]$/, '');

      // Case 1: Deleting from BKT specifically (metodeBayar === 'BANK')
      // Convert payment method on Kwitansi to 'BANK' (Non-Tunai) so it disappears from BKT
      // while remaining 100% intact in BKU (Kas Umum) and BKB (Kas Bank).
      if (txToDelete.metodeBayar === 'BANK' && (txToDelete.kwitansiIdRef || refId)) {
        const targetKwId = txToDelete.kwitansiIdRef || refId;
        const updatedKwList = (prev.kwitansiList || []).map((kw) => {
          if (kw.id === targetKwId || kw.id === refId || kw.id === cleanId) {
            return {
              ...kw,
              metodeBayar: 'BANK' as const,
              kategoriBiayaPajak: 'Siplah' as const,
            };
          }
          return kw;
        });

        return {
          ...prev,
          kwitansiList: updatedKwList,
        };
      }

      // Case 2: Permanent deletion from BKU or Master
      let updatedKwitansi = prev.kwitansiList;
      if (txToDelete.kwitansiIdRef || refId || cleanId) {
        updatedKwitansi = prev.kwitansiList.filter(
          (kw) =>
            kw.id !== txToDelete.kwitansiIdRef &&
            kw.id !== refId &&
            kw.id !== cleanId &&
            kw.id !== `kw-${cleanId}` &&
            kw.id.replace(/-p[12]$/, '') !== refId
        );
      }

      const updatedManual = (prev.manualBkuTransactions || []).filter((m) => {
        if (!m) return false;
        const mClean = m.id.replace(/^bku-/, '').replace(/^kw-/, '').replace(/-p[12]$/, '');
        if (m.id === rawId || m.id === cleanId || mClean === cleanId) return false;
        if (refId && (m.kwitansiIdRef === refId || m.kwitansiIdRef === txToDelete.kwitansiIdRef)) return false;
        return true;
      });

      const isBkbInflow = rawId.includes('inflow-') || rawId.includes('bkb-');
      let updatedBkb = prev.bkbRecords;
      if (isBkbInflow) {
        const bkbIdToDel = rawId.replace(/^bkt-inflow-/, '');
        updatedBkb = (prev.bkbRecords || []).filter((b) => b.id !== bkbIdToDel && b.id !== rawId);
      }

      const updatedDeletedIds = Array.from(
        new Set([
          ...(prev.deletedBkuIds || []),
          rawId,
          cleanId,
          `bku-${cleanId}`,
          `bku-kw-${cleanId}`,
          `kw-${cleanId}`,
          txToDelete.kwitansiIdRef || '',
          refId,
          `kw-${refId}`,
          `bku-kw-${refId}`,
        ])
      ).filter(Boolean);

      return {
        ...prev,
        kwitansiList: updatedKwitansi,
        manualBkuTransactions: updatedManual,
        bkbRecords: updatedBkb,
        deletedBkuIds: updatedDeletedIds as string[],
      };
    });

    handleManualSaveNow();
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
    const allCurrentBkuIds = bkuList.map((t: BkuTransaction) => t.id);
    const allKwRefs = bkuList.map((t: BkuTransaction) => t.kwitansiIdRef).filter(Boolean) as string[];

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

  const handleSyncBkbFromBku = useCallback(() => {
    isDirtyRef.current = true;
    setAppState((prev) => {
      const activeBku = prev.manualBkuTransactions && prev.manualBkuTransactions.length > 0
        ? prev.manualBkuTransactions
        : bkuList;

      const synchronizedBkb = syncBkbFromBku(activeBku, prev.school, prev.progressWeeks);

      return {
        ...prev,
        bkbRecords: synchronizedBkb,
      };
    });

    setSwitchNotification('✅ Pembukuan BKB dan BKT berhasil disinkronkan dari BKU. Selisih kas = Rp 0.');
    setTimeout(() => setSwitchNotification(null), 5000);
  }, [bkuList]);

  // Handlers
  const handleUpdateSchool = (updated: SchoolMasterData) => {
    isDirtyRef.current = true;
    const newYear = updated.tahunAnggaran?.trim() || '2026';

    if (updated.pinAkses) {
      setSchoolPin(currentTenant.id, updated.pinAkses, updated.npsn);
    }

    // Synchronize tenant metadata immediately
    setCurrentTenant((prev) => ({
      ...prev,
      namaSekolah: updated.namaSekolah || prev.namaSekolah,
      npsn: updated.npsn || prev.npsn,
      kabKota: updated.kabKota || prev.kabKota,
      provinsi: updated.provinsi || prev.provinsi,
    }));

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

    const res = generateRealisticMultiWeekTransactions({
      selectedWeekNums: targetWeeksToRegen,
      weeksToUse: progressWeeksToUse,
      school: updatedSchool,
      workers: appState.workers,
      stores: appState.stores || [],
      rpdItems: newRpdItems.length > 0 ? newRpdItems : appState.rpdItems,
      realSchoolData: real,
      existingKwitansi: appState.kwitansiList.filter((k) => !isReceiptLocked(k)),
      existingWageReports: appState.wageReports.filter((w) => !targetWeeksToRegen.includes(w.mingguKe)),
      existingBkb: appState.bkbRecords,
      splitDays: true,
      procurementMode: 'BATCH_CONSTRUCTION',
    });

    let updatedKwitansi = deduplicateKwitansiList(res.updatedKwitansi);
    let updatedWageReports = res.updatedWageReports;
    let updatedBkb = res.updatedBkb;

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

  const handleAutoBalanceOptionA = () => {
    const { updatedKwitansiList, updatedWageReports, messages, totalReconciledNominal } =
      syncAndReconcileAll9CategoriesToBudget({
        school: appState.school,
        rpdItems: appState.rpdItems,
        kwitansiList: appState.kwitansiList,
        wageReports: appState.wageReports,
        progressWeeks: appState.progressWeeks,
        realSchoolData: appState.realSchoolData,
        stores: appState.stores,
        workers: appState.workers,
      });

    isDirtyRef.current = true;
    setAppState((prev) => {
      const kwMap = new Map(updatedKwitansiList.map((k) => [k.id, k]));
      const kwNoBuktiMap = new Map(
        updatedKwitansiList.map((k) => [(k.noBukti || '').trim().toUpperCase(), k])
      );

      const updatedManualBku = (prev.manualBkuTransactions || []).map((m) => {
        const kw =
          (m.kwitansiIdRef && kwMap.get(m.kwitansiIdRef)) ||
          kwMap.get(m.id) ||
          (m.noBukti ? kwNoBuktiMap.get(m.noBukti.trim().toUpperCase()) : undefined);

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

      const harmonizedBkb = harmonizeBkbRecordsWithSiplah(prev.bkbRecords || [], bkuList, prev.school);

      return {
        ...prev,
        kwitansiList: updatedKwitansiList,
        manualBkuTransactions: updatedManualBku,
        wageReports: updatedWageReports.length > 0 ? updatedWageReports : prev.wageReports,
        bkbRecords: harmonizedBkb,
      };
    });

    const paguTotal = appState.school?.totalAnggaran || 0;
    const diff = paguTotal - totalReconciledNominal;
    const msg = Math.abs(diff) <= 1000
      ? `⚡ Sinkronisasi 9 Komponen Berhasil! Seluruh komponen anggaran (Papan Nama, Material, SMKK, SipLah, Upah, Furnitur, Perencana, Pengawas, SPJ) kini 100% tepat pas sesuai pagu RAB (Rp ${paguTotal.toLocaleString('id-ID')}). Saldo kas Rp 0 (Nihil / Pas)!`
      : `⚡ Penyelarasan Berhasil Dijalankan: Total penyerapan diselaraskan menjadi Rp ${totalReconciledNominal.toLocaleString('id-ID')} (${messages.length} item disinkronkan).`;

    setSwitchNotification(msg);
    setTimeout(() => setSwitchNotification(null), 7000);
    try {
      confetti({ particleCount: 90, spread: 90, origin: { y: 0.5 } });
    } catch {}
  };

  // Transparent Budget Variance tracking (Requirement 1)
  const budgetVarianceInfo = useMemo(() => {
    if (!appState.kwitansiList || appState.kwitansiList.length === 0) {
      return { totalNominal: 0, pagu: 0, selisih: 0, isOver: false, offendingKwitansi: [] };
    }
    const paguTotal = appState.school?.totalAnggaran || (appState.rpdItems || []).reduce((acc, r) => acc + (r.jumlahAnggaran || 0), 0) || 0;
    const totalNominal = appState.kwitansiList.reduce((s, k) => s + (k.nominal || 0), 0);
    const selisih = totalNominal - paguTotal;
    const isOver = selisih > 0 && paguTotal > 0;
    const offendingKwitansi = isOver ? [...appState.kwitansiList].sort((a, b) => (b.nominal || 0) - (a.nominal || 0)).slice(0, 5) : [];
    return { totalNominal, pagu: paguTotal, selisih, isOver, offendingKwitansi };
  }, [appState.kwitansiList, appState.school, appState.rpdItems]);

  const derivedRpdItems = useMemo(() => {
    return deriveRpd(
      appState.kwitansiList,
      appState.wageReports,
      appState.bkuTransactions || [],
      appState.realSchoolData,
      appState.school
    );
  }, [appState.kwitansiList, appState.wageReports, appState.bkuTransactions, appState.realSchoolData, appState.school]);

  const handleCleanDuplicates = () => {
    isDirtyRef.current = true;
    const paguTotal = appState.school?.totalAnggaran || (appState.rpdItems || []).reduce((acc, r) => acc + (r.jumlahAnggaran || 0), 0) || 0;
    const currentTotalNominal = appState.kwitansiList.reduce((s, k) => s + (k.nominal || 0), 0);

    // If total kwitansi exceeds pagu, run full calibration & deduplication
    if (currentTotalNominal > paguTotal) {
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

      let finalKw = calRes.calibratedKwitansi;
      let finalWage = calRes.calibratedWageReports;

      const sync9Res = syncAndReconcileAll9CategoriesToBudget({
        school: appState.school,
        rpdItems: appState.rpdItems,
        kwitansiList: calRes.calibratedKwitansi,
        wageReports: calRes.calibratedWageReports,
        progressWeeks: appState.progressWeeks,
        realSchoolData: appState.realSchoolData,
        stores: appState.stores,
        workers: appState.workers,
      });
      finalKw = sync9Res.updatedKwitansiList;
      if (sync9Res.updatedWageReports.length > 0) {
        finalWage = sync9Res.updatedWageReports;
      }

      setAppState((prev) => ({
        ...prev,
        kwitansiList: finalKw,
        wageReports: finalWage,
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
      const isManagement =
        k.tipe === 'KONSULTAN' ||
        /kons-p|kons-w|perencana|pengawas/i.test(`${k.noBukti} ${k.uraian}`) ||
        (k.tipe === 'OPERASIONAL' && /\badm\b|pengelola|spj/i.test(`${k.noBukti} ${k.uraian}`));
      if (isManagement) {
        return false;
      }
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
      toast.warning('Belum ada bobot kemajuan fisik (> 0%) pada Laporan Mingguan. Silakan input bobot fisik terlebih dahulu.');
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

    let finalKwitansi = res.rebalancedKwitansi;
    let finalWageReports = res.rebalancedWageReports;

    const sync9Res = syncAndReconcileAll9CategoriesToBudget({
      school: appState.school,
      rpdItems: appState.rpdItems,
      kwitansiList: res.rebalancedKwitansi,
      wageReports: res.rebalancedWageReports,
      progressWeeks: appState.progressWeeks,
      realSchoolData: appState.realSchoolData,
      stores: appState.stores,
      workers: appState.workers,
    });
    finalKwitansi = sync9Res.updatedKwitansiList;
    if (sync9Res.updatedWageReports.length > 0) {
      finalWageReports = sync9Res.updatedWageReports;
    }

    isDirtyRef.current = true;
    setAppState((prev) => {
      const kwMap = new Map(finalKwitansi.map((k) => [k.id, k]));
      const kwNoBuktiMap = new Map(
        finalKwitansi.map((k) => [(k.noBukti || '').trim().toUpperCase(), k])
      );

      const updatedManualBku = (prev.manualBkuTransactions || []).map((m) => {
        const kw =
          (m.kwitansiIdRef && kwMap.get(m.kwitansiIdRef)) ||
          kwMap.get(m.id) ||
          (m.noBukti ? kwNoBuktiMap.get(m.noBukti.trim().toUpperCase()) : undefined);

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

      return {
        ...prev,
        kwitansiList: finalKwitansi,
        manualBkuTransactions: updatedManualBku,
        wageReports: finalWageReports,
        // CRITICAL: Protect user-entered BKB records from being erased
        bkbRecords: (prev.bkbRecords && prev.bkbRecords.length > 0) ? prev.bkbRecords : finalBkb,
        deletedBkuIds: [],
        deletedKwitansiIds: [],
      };
    });

    setSwitchNotification(
      `🧹 Berhasil menyeimbangkan BKU & Kwitansi: Dokumen ganda dibersihkan, 9 komponen selaras pas pagu, data Menu BKB (${finalBkb.length} transaksi) tetap utuh aman!`
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

    let finalKwitansi = res.calibratedKwitansi;
    let finalWageReports = res.calibratedWageReports;

    // Integrasi penuh dengan 9 Komponen Anggaran:
    // Jika progres fisik mencapai 100% atau tahap akhir, selaraskan langsung kwitansi tepat ke 9 Pagu RAB
    if (res.cumulativeBobot >= 99.9 || targetLimit >= maxActiveWeek) {
      const sync9Res = syncAndReconcileAll9CategoriesToBudget({
        school: appState.school,
        rpdItems: appState.rpdItems,
        kwitansiList: res.calibratedKwitansi,
        wageReports: res.calibratedWageReports,
        progressWeeks: appState.progressWeeks,
        realSchoolData: appState.realSchoolData,
        stores: appState.stores,
        workers: appState.workers,
      });
      finalKwitansi = sync9Res.updatedKwitansiList;
      if (sync9Res.updatedWageReports.length > 0) {
        finalWageReports = sync9Res.updatedWageReports;
      }
    }

    isDirtyRef.current = true;
    setAppState((prev) => {
      const kwMap = new Map(finalKwitansi.map((k) => [k.id, k]));
      const kwNoBuktiMap = new Map(
        finalKwitansi.map((k) => [(k.noBukti || '').trim().toUpperCase(), k])
      );

      const updatedManualBku = (prev.manualBkuTransactions || []).map((m) => {
        const kw =
          (m.kwitansiIdRef && kwMap.get(m.kwitansiIdRef)) ||
          kwMap.get(m.id) ||
          (m.noBukti ? kwNoBuktiMap.get(m.noBukti.trim().toUpperCase()) : undefined);

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

      return {
        ...prev,
        kwitansiList: finalKwitansi,
        manualBkuTransactions: updatedManualBku,
        wageReports: finalWageReports,
        // CRITICAL: Protect user-entered BKB records from being erased
        bkbRecords: (prev.bkbRecords && prev.bkbRecords.length > 0) ? prev.bkbRecords : finalBkb,
        // CRITICAL FIX: Reset deleted IDs so newly calibrated transactions show up immediately in BKU after a clear
        deletedBkuIds: [],
        deletedKwitansiIds: [],
      };
    });

    setSwitchNotification(
      `⚡ Berhasil mengalibrasi BKU dengan progres fisik riil (${res.cumulativeBobot}%). 9 Komponen Anggaran sinkron pas pagu, saldo kas nihil Rp 0!`
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
    setAppState((prev) => {
      const currentList = (prev.bkbRecords && prev.bkbRecords.length > 0)
        ? prev.bkbRecords
        : effectiveBkbList;
      return {
        ...prev,
        bkbRecords: currentList.map((b: BkbTransaction) =>
          b.id === updatedTx.id || (b.noBukti && b.noBukti !== '-' && b.noBukti === updatedTx.noBukti)
            ? updatedTx
            : b
        ),
      };
    });
  };

  const handleDeleteBkbRecord = (txToDelete: BkbTransaction) => {
    isDirtyRef.current = true;
    setAppState((prev) => {
      const currentList = (prev.bkbRecords && prev.bkbRecords.length > 0)
        ? prev.bkbRecords
        : effectiveBkbList;
      return {
        ...prev,
        bkbRecords: currentList.filter(
          (b: BkbTransaction) =>
            b.id !== txToDelete.id &&
            (b.noBukti === '-' || b.noBukti !== txToDelete.noBukti)
        ),
      };
    });
  };

  const handleBulkDeleteBkb = (recordsToDelete: BkbTransaction[]) => {
    if (!recordsToDelete || recordsToDelete.length === 0) return;
    isDirtyRef.current = true;
    const idsToDelete = new Set(recordsToDelete.map((r) => r.id));
    setAppState((prev) => {
      const currentList = prev.bkbRecords !== undefined ? prev.bkbRecords : effectiveBkbList;
      return {
        ...prev,
        bkbRecords: currentList.filter((b: BkbTransaction) => !idsToDelete.has(b.id)),
      };
    });
    setSwitchNotification(`✅ Berhasil menghapus ${recordsToDelete.length} transaksi Bank (BKB) secara massal.`);
    setTimeout(() => setSwitchNotification(null), 4000);
  };

  const handleUpdateBkuWeekLimit = (limit: number) => {
    setBkuWeekLimit(limit);
    localStorage.setItem('bkuWeekLimit', String(limit));
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
    input.accept = '.json,application/json';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            const rawText = (event.target?.result as string) || '';
            let parsed: any;
            if (rawText.startsWith('ENC_AES_') || rawText.startsWith('ENC_LGT_')) {
              const pwd = prompt('File ini terenkripsi. Masukkan kata sandi enkripsi:');
              if (!pwd) return;
              parsed = await decryptJsonData(rawText.trim(), pwd.trim());
            } else {
              parsed = JSON.parse(rawText);
            }

            if (
              parsed &&
              (parsed.school ||
                parsed.kwitansiList ||
                parsed.bkuTransactions ||
                parsed.manualBkuTransactions ||
                parsed.rpdItems)
            ) {
              isDirtyRef.current = true;
              const migrated = migrateAndTransformAppState(parsed);
              setAppState(migrated);
              toast.success(
                `Data LPJ untuk ${
                  migrated.school?.namaSekolah || currentTenant.namaSekolah
                } berhasil dipulihkan!`
              );
            } else {
              toast.error('Format file JSON tidak sesuai dengan skema LPJ Revitalisasi.');
            }
          } catch (err: any) {
            toast.error(`Gagal membaca file JSON: ${err?.message || err}`);
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
    const pendingCount = getPendingSyncCount(currentUser?.uid);
    if (pendingCount > 0) {
      const confirmLogout = confirm(
        `Perhatian: Masih ada ${pendingCount} antrean sinkronisasi yang belum tersimpan di cloud. Jika Anda keluar sekarang, data tetap aman di memori perangkat ini. Tetap keluar?`
      );
      if (!confirmLogout) return;
    }

    if (currentUser?.uid) {
      await clearUserTenantCacheAndQueue(currentUser.uid);
    }

    try {
      await logoutGoogle();
    } catch {}
    setIsLoggedIn(false);
    setCurrentUser(null);
    setLocalSession(null);
    clearLocalUserSession();
    setIsGoogleConnected(false);
    localStorage.removeItem('LPJ_USER_SESSION_ACTIVE');
    toast.info('Anda telah keluar dari akun.');
  };

  if (isInitialLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white text-center">
        <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center shadow-xl shadow-blue-500/30 mb-4 animate-pulse">
          <Database className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-xl font-bold tracking-tight">Memuat Database Multi-Sekolah...</h2>
        <p className="text-sm text-slate-400 mt-1 max-w-md">
          Menghubungkan ke Google Cloud Firestore ({firestoreDatabaseId}) dan memuat data keanggotaan sekolah...
        </p>
      </div>
    );
  }

  // Authentication & Login Mode Guard
  if (!isLoggedIn) {
    return (
      <>
        <LoginPortal
          memberships={memberships}
          onSelectTenant={(targetTenant) => {
            switchSchool(targetTenant);
          }}
          onOpenCreateSchool={() => {
            setSchoolPortalInitialTab('create');
            setIsSchoolPortalOpen(true);
          }}
          onGoogleSignIn={async () => {
            setIsSigningInGoogle(true);
            try {
              const res = await googleSignIn();
              if (res) {
                setCurrentUser(res.user);
                setIsGoogleConnected(true);
                setIsLoggedIn(true);
                localStorage.setItem('LPJ_USER_SESSION_ACTIVE', 'true');
                toast.success(`Selamat datang, ${res.user.displayName || res.user.email}!`);
              }
            } catch (err: any) {
              toast.error(`Login Google gagal: ${err?.message || err}`);
            } finally {
              setIsSigningInGoogle(false);
            }
          }}
          isSigningInGoogle={isSigningInGoogle}
          currentUser={currentUser}
          onProceedToDashboard={(targetTenant) => {
            if (targetTenant) {
              switchSchool(targetTenant);
            }
            setIsLoggedIn(true);
            localStorage.setItem('LPJ_USER_SESSION_ACTIVE', 'true');
          }}
          onCreateDemoSchool={handleCreateDemoSchool}
          isCreatingDemo={isCreatingDemo}
        />

        {/* Modal School Tenant Portal untuk mendaftarkan sekolah baru */}
        <SchoolTenantPortalModal
          isOpen={isSchoolPortalOpen}
          onClose={() => setIsSchoolPortalOpen(false)}
          currentTenant={currentTenant}
          memberships={memberships}
          onSelectSchool={switchSchool}
          onRegisterSchool={handleRegisterNewSchool}
          onCreateDemoSchool={handleCreateDemoSchool}
          onLogout={handleLogout}
          initialTab={schoolPortalInitialTab}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-800">
      {/* Top Header with Multi-Tenant School Switcher (Requirement 2 & 8) */}
      <Header
        school={appState.school}
        currentTenant={currentTenant}
        memberships={memberships}
        onSelectSchool={switchSchool}
        onOpenSchoolPortal={(tab) => {
          setSchoolPortalInitialTab(tab || 'switch');
          setIsSchoolPortalOpen(true);
        }}
        onCreateDemoSchool={handleCreateDemoSchool}
        isCreatingDemo={isCreatingDemo}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenPrintModal={(type) => handleOpenPrint(type || 'ALL')}
        onReset={handleResetData}
        onExportJson={handleExportJson}
        onImportJson={handleImportJson}
        onOpenBackupRestoreModal={() => setIsBackupRestoreOpen(true)}
        isSyncing={isSyncing}
        lastSyncedText={lastSyncedText}
        cloudStatus={cloudStatus}
        pendingSyncCount={pendingSyncCount}
        onOpenAnomalyReview={() => setIsAnomalyModalOpen(true)}
        anomalyCount={anomalies.length}
        onManualSave={handleManualSaveNow}
        onOpenGoogleSheetsSync={() => setIsGoogleSheetsModalOpen(true)}
        isGoogleConnected={isGoogleConnected}
        googleSheetName={googleSheetName}
        currentUser={currentUser}
        localSession={localSession}
        onLogout={handleLogout}
      />

      {/* Main Tab Views with key={currentTenant.id} to ensure total state isolation (Requirement 3e) */}
      <main key={currentTenant.id} className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 print:hidden">
        {/* Switching School Blocking Overlay (Requirement 3a) */}
        {isSwitchingOverlay && (
          <div className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-white text-center">
            <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center shadow-xl shadow-blue-500/30 mb-4 animate-spin">
              <RefreshCw className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-base font-bold">Menyimpan & Berpindah Sekolah...</h3>
            <p className="text-xs text-slate-300 mt-1 max-w-sm">
              Memastikan seluruh pembukuan disimpan dan memuat data terisolasi untuk <b>{switchingTargetName}</b>...
            </p>
          </div>
        )}

        {/* Legacy Data Migration Warning Banner (Requirement 9) */}
        {hasLegacyNeedsMigration && (
          <div className="mb-4 bg-amber-600 border border-amber-700 text-white p-4 rounded-xl shadow-md flex items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center gap-2.5 text-xs font-bold">
              <AlertTriangle className="w-5 h-5 shrink-0 text-amber-100" />
              <span>Data sekolah Anda perlu dimigrasi ke akun multi-sekolah. Silakan hubungi admin untuk menjalankan migrasi data sekolah Anda.</span>
            </div>
          </div>
        )}
        {/* Banner Merah Safety Cloud Load Failure */}
        {isCloudAutosaveBlocked && (
          <div className="mb-4 bg-rose-600 border border-rose-700 text-white p-4 rounded-xl shadow-md flex items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center gap-2.5 text-xs font-bold">
              <AlertTriangle className="w-5 h-5 shrink-0 text-amber-200" />
              <span>Data cloud gagal dimuat. Penyimpanan ke cloud dinonaktifkan agar data lama tidak tertimpa. Muat ulang atau pulihkan dari cadangan.</span>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-3 py-1.5 bg-white text-rose-700 hover:bg-rose-50 text-xs font-extrabold rounded-lg shadow-xs transition shrink-0 cursor-pointer"
            >
              Muat Ulang
            </button>
          </div>
        )}

        {/* Real-time Reconciliation Validation Alert Banner */}
        <ReconciliationBanner
          alerts={reconciliationReport.alerts}
          onNavigateTab={(tab) => setActiveTab(tab)}
          appState={appState}
          onSyncBkbFromBku={handleSyncBkbFromBku}
        />

        <Suspense
          fallback={
            <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3 bg-white rounded-2xl border border-slate-200 shadow-xs">
              <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
              <p className="text-xs font-semibold text-slate-700">Memuat Modul...</p>
            </div>
          }
        >

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
            realSchoolData={appState.realSchoolData}
            stores={appState.stores}
            onNavigateTab={(tab) => setActiveTab(tab)}
            onOpenPrintModal={(type) => handleOpenPrint(type)}
            onOpenQuickReceipt={() => setIsQuickReceiptOpen(true)}
            isGoogleConnected={isGoogleConnected}
            googleSheetName={googleSheetName}
            isSyncing={isSyncing}
            lastSyncedText={lastSyncedText}
            onOpenGoogleSheetsSync={() => setIsGoogleSheetsModalOpen(true)}
            onAutoBalanceKwitansi={handleAutoBalanceOptionA}
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
            currentTenant={currentTenant}
            onSave={handleUpdateSchool}
            onOpenPrintModal={(doc) => handleOpenPrint(doc)}
            onDeleteSchool={() => {
              setSchoolPortalInitialTab('pin');
              setIsSchoolPortalOpen(true);
            }}
          />
        )}

        {activeTab === 'rpd' && (
          <RpdManager
            items={appState.rpdItems}
            derivedRealizationItems={derivedRpdItems}
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
            onAutoBalanceKwitansi={handleAutoBalanceOptionA}
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
            onSyncBkbFromBku={handleSyncBkbFromBku}
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
            onAutoBalanceKwitansi={handleAutoBalanceOptionA}
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
        </Suspense>
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
        memberships={memberships}
        onSelectSchool={switchSchool}
        onRegisterSchool={handleRegisterNewSchool}
        onCreateDemoSchool={handleCreateDemoSchool}
        onLogout={handleLogout}
        initialTab={schoolPortalInitialTab}
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
          const migrated = migrateAndTransformAppState(restored);
          setAppState(migrated);
        }}
        currentTenantName={currentTenant.namaSekolah}
      />


      {/* Concurrency Conflict Resolution Modal (Requirement 3) */}
      <ConflictResolutionModal
        isOpen={conflictState.isOpen}
        serverRev={conflictState.serverRev}
        localRev={conflictState.localRev}
        serverState={conflictState.serverState}
        localState={appState}
        onResolveUseCloud={handleResolveConflictUseCloud}
        onResolveUseMine={handleResolveConflictUseMine}
        onResolveDownloadBoth={handleResolveConflictDownloadBoth}
        onClose={() => setConflictState((prev) => ({ ...prev, isOpen: false }))}
      />

      {/* Data Anomaly Review & Fix Modal (Requirement 5) */}
      <AnomalyReviewModal
        isOpen={isAnomalyModalOpen}
        proposals={anomalies}
        onApplySelected={handleApplyAnomalies}
        onClose={() => setIsAnomalyModalOpen(false)}
      />
    </div>
  );
}
