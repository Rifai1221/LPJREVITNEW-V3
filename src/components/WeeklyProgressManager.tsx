import React, { useState, useMemo, useEffect } from 'react';
import {
  TrendingUp,
  Sparkles,
  Calendar,
  CheckCircle,
  Plus,
  ArrowRight,
  Printer,
  FileSpreadsheet,
  AlertCircle,
  Building,
  Layers,
  Receipt,
  FileText,
  Users,
  Sliders,
  RotateCcw,
  Wand2,
  Edit3,
  Trash2,
  Check,
  X,
  Camera,
  CheckCircle2,
  DollarSign,
  Clock,
  AlertTriangle,
  Download,
  Upload,
} from 'lucide-react';
import {
  ProjectProgressWeek,
  DivisionProgressItem,
  WorkerItem,
  RpdItem,
  SchoolMasterData,
  ProgressPhotoItem,
  BkuTransaction,
  KwitansiDocument,
  RealSchoolData,
} from '../types';
import { formatNumber, formatRupiah } from '../utils/formatters';
import { DEFAULT_DIVISIONS, toRoman, renumberDivisions, recalculateAllWeeksProgress, syncProgressWeeksWithRealData } from '../utils/divisionHelper';
import { resolveWeekDates, formatWeekPeriodString, sanitizeYear } from '../utils/monthHelper';
import { calculateCumulativeRealizedProgress } from '../services/autoGeneratorService';
import { downloadWeeklyProgressExcelTemplate, parseWeeklyProgressExcelFile } from '../utils/excelHelper';
import { WeeklyPhotoDocumentation } from './WeeklyPhotoDocumentation';

interface WeeklyProgressManagerProps {
  progressWeeks: ProjectProgressWeek[];
  workers: WorkerItem[];
  rpdItems: RpdItem[];
  school: SchoolMasterData;
  realSchoolData?: RealSchoolData;
  onUpdateWeeks: (weeks: ProjectProgressWeek[]) => void;
  onAutoGenerateFromProgress: (targetWeek: number, splitDays?: boolean, overrideWeeks?: ProjectProgressWeek[]) => void;
  onAutoGenerateAllWeeks?: () => void;
  onOpenPrintModal: (weekNum?: number, docType?: string) => void;
  bkuList?: BkuTransaction[];
  kwitansiList?: KwitansiDocument[];
  onAddTransaction?: (tx: Omit<BkuTransaction, 'id'>, weekNum?: number) => void;
  onUpdateTransaction?: (tx: BkuTransaction) => void;
  onDeleteTransaction?: (tx: BkuTransaction) => void;
  onCalibrateToRealProgress?: () => void;
}

export const WeeklyProgressManager: React.FC<WeeklyProgressManagerProps> = ({
  progressWeeks,
  workers,
  rpdItems,
  school,
  realSchoolData,
  onUpdateWeeks,
  onAutoGenerateFromProgress,
  onAutoGenerateAllWeeks,
  onOpenPrintModal,
  bkuList,
  kwitansiList,
  onAddTransaction,
  onUpdateTransaction,
  onDeleteTransaction,
  onCalibrateToRealProgress,
}) => {
  const [selectedWeekNum, setSelectedWeekNum] = useState<number>(1);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);
  const [isEditingBobotMaster, setIsEditingBobotMaster] = useState<boolean>(false);

  // User decimal precision toggle (2 digits or 3 digits behind comma)
  const [decimalPrecision, setDecimalPrecision] = useState<2 | 3>(() => {
    try {
      const saved = localStorage.getItem('lpj_progress_decimal_precision');
      return saved === '3' ? 3 : 2;
    } catch {
      return 2;
    }
  });

  const handleToggleDecimalPrecision = (precision: 2 | 3) => {
    setDecimalPrecision(precision);
    try {
      localStorage.setItem('lpj_progress_decimal_precision', precision.toString());
    } catch {}
  };

  const formatProg = (val: number | null | undefined): string => {
    if (val === null || val === undefined || isNaN(val)) return '0';
    return formatNumber(val, decimalPrecision, decimalPrecision);
  };

  // States for adding and editing division items
  const [addingCategory, setAddingCategory] = useState<'FISIK' | 'MANAJEMEN' | null>(null);
  const [newUraianText, setNewUraianText] = useState<string>('');
  const [newBobotText, setNewBobotText] = useState<string>('0.00');

  const [editingUraianId, setEditingUraianId] = useState<string | null>(null);
  const [editingUraianText, setEditingUraianText] = useState<string>('');

  const [editingKodeId, setEditingKodeId] = useState<string | null>(null);
  const [editingKodeText, setEditingKodeText] = useState<string>('');

  const [confirmDeleteDivision, setConfirmDeleteDivision] = useState<DivisionProgressItem | null>(null);

  // States for manual adjustment of Realisasi and Target
  const [customRealisasiStr, setCustomRealisasiStr] = useState<Record<number, string>>({});
  const [customTargetStr, setCustomTargetStr] = useState<Record<number, string>>({});

  // States for manual override of Table Footer Totals (Minggu Lalu & Minggu Ini)
  const [isEditingTotalFooter, setIsEditingTotalFooter] = useState<boolean>(false);
  const [customTotalMingguLaluStr, setCustomTotalMingguLaluStr] = useState<Record<number, string>>({});
  const [customTotalMingguIniStr, setCustomTotalMingguIniStr] = useState<Record<number, string>>({});

  // States for manual input, edit, and delete of week transactions
  const [isTxModalOpen, setIsTxModalOpen] = useState<boolean>(false);
  const [editingTx, setEditingTx] = useState<BkuTransaction | null>(null);
  const [txFormError, setTxFormError] = useState<string | null>(null);
  const [confirmDeleteTx, setConfirmDeleteTx] = useState<BkuTransaction | null>(null);

  // States for manual date range customization per week
  const [isEditingDates, setIsEditingDates] = useState<boolean>(false);
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  // Excel multi-week progress upload & download states
  const excelFileInputRef = React.useRef<HTMLInputElement>(null);
  const [isUploadingExcel, setIsUploadingExcel] = useState<boolean>(false);
  const [uploadExcelError, setUploadExcelError] = useState<string | null>(null);
  const [uploadPreviewData, setUploadPreviewData] = useState<{
    data: ProjectProgressWeek[];
    summary: {
      weeksCount: number;
      divisionsCount: number;
      totalRealisasiAkhir: number;
      totalBobot: number;
    };
    message: string;
  } | null>(null);

  const handleExcelFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingExcel(true);
    setUploadExcelError(null);

    try {
      const res = await parseWeeklyProgressExcelFile(file, progressWeeks);
      if (res.success && res.data) {
        setUploadPreviewData({
          data: res.data,
          summary: res.summary || {
            weeksCount: res.data.length,
            divisionsCount: res.data[0]?.divisions?.length || 0,
            totalRealisasiAkhir: res.data[res.data.length - 1]?.bobotRealisasi || 0,
            totalBobot: 100,
          },
          message: res.message,
        });
      } else {
        setUploadExcelError(res.message);
      }
    } catch (err: any) {
      setUploadExcelError(
        `Terjadi kesalahan saat memproses file Excel: ${err?.message || 'Format tidak valid'}`
      );
    } finally {
      setIsUploadingExcel(false);
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const handleConfirmApplyExcelData = () => {
    if (!uploadPreviewData) return;
    const finalWeeks = uploadPreviewData.data;
    onUpdateWeeks(finalWeeks);
    const wCount = finalWeeks.length;
    setUploadPreviewData(null);
    setSyncSuccessMsg(
      `Berhasil! Data progres dari file Excel untuk ${wCount} minggu berhasil diterapkan & disinkronkan ke seluruh sistem.`
    );
    setTimeout(() => setSyncSuccessMsg(null), 5000);
  };

  const currentWeek =
    progressWeeks.find((w) => w.mingguKe === selectedWeekNum) || progressWeeks[0] || { mingguKe: 1 };

  const schoolYear = school?.tahunAnggaran?.trim() || '2026';
  const weekResolved = resolveWeekDates(currentWeek, schoolYear);

  // Synchronize date input fields when selected week changes
  useEffect(() => {
    setCustomStartDate(currentWeek.startDate || weekResolved.startDate);
    setCustomEndDate(currentWeek.endDate || weekResolved.endDate);
  }, [selectedWeekNum, currentWeek.startDate, currentWeek.endDate, weekResolved.startDate, weekResolved.endDate]);

  // Handler to save manually adjusted week dates with optional cascading to subsequent weeks
  const handleSaveWeekDate = (cascadeToNext = false) => {
    const sDate = customStartDate || weekResolved.startDate;
    const eDate = customEndDate || weekResolved.endDate;
    if (!sDate || !eDate) return;

    const formattedPeriode = formatWeekPeriodString(sDate, eDate);

    let updatedAllWeeks = progressWeeks.map((w) => {
      if (w.mingguKe === selectedWeekNum) {
        return {
          ...w,
          startDate: sDate,
          endDate: eDate,
          periode: formattedPeriode,
        };
      }
      return w;
    });

    if (cascadeToNext) {
      let prevEndDate = new Date(`${eDate}T00:00:00`);
      updatedAllWeeks = updatedAllWeeks.map((w) => {
        if (w.mingguKe > selectedWeekNum) {
          const nextStart = new Date(prevEndDate.getTime() + 1 * 86400000);
          const nextEnd = new Date(nextStart.getTime() + 6 * 86400000);
          const nextStartIso = nextStart.toISOString().split('T')[0];
          const nextEndIso = nextEnd.toISOString().split('T')[0];
          const nextPeriode = formatWeekPeriodString(nextStartIso, nextEndIso);
          prevEndDate = nextEnd;
          return {
            ...w,
            startDate: nextStartIso,
            endDate: nextEndIso,
            periode: nextPeriode,
          };
        }
        return w;
      });
    }

    onUpdateWeeks(updatedAllWeeks);
    setIsEditingDates(false);
    setSyncSuccessMsg(
      cascadeToNext
        ? `Rentang tanggal Minggu ${selectedWeekNum} (${formattedPeriode}) dan seluruh minggu berikutnya berhasil diperbarui & disinkronkan ke seluruh sistem!`
        : `Rentang tanggal Minggu ${selectedWeekNum} (${formattedPeriode}) berhasil diperbarui & disinkronkan ke seluruh sistem!`
    );
    setTimeout(() => setSyncSuccessMsg(null), 5000);
  };

  // Handler to reset week dates back to defaults
  const handleResetWeekDateToDefault = () => {
    const yearNum = sanitizeYear(schoolYear, 2026);
    const baseDate = new Date(`${yearNum}-07-01T00:00:00`);
    const sDate = new Date(baseDate.getTime() + (selectedWeekNum - 1) * 7 * 86400000);
    const eDate = new Date(sDate.getTime() + 6 * 86400000);
    const sIso = sDate.toISOString().split('T')[0];
    const eIso = eDate.toISOString().split('T')[0];
    const defPeriode = formatWeekPeriodString(sIso, eIso);

    const updatedAllWeeks = progressWeeks.map((w) => {
      if (w.mingguKe === selectedWeekNum) {
        return {
          ...w,
          startDate: sIso,
          endDate: eIso,
          periode: defPeriode,
        };
      }
      return w;
    });

    setCustomStartDate(sIso);
    setCustomEndDate(eIso);
    onUpdateWeeks(updatedAllWeeks);
    setSyncSuccessMsg(`Rentang tanggal Minggu ${selectedWeekNum} berhasil dikembalikan ke default: ${defPeriode}`);
    setTimeout(() => setSyncSuccessMsg(null), 4000);
  };

  // State & handler for deleting weeks
  const [confirmDeleteWeekNum, setConfirmDeleteWeekNum] = useState<number | null>(null);

  const handleDeleteWeek = (weekNumToDelete: number) => {
    if (progressWeeks.length <= 1) {
      alert('Minimal harus ada 1 periode minggu kerja.');
      return;
    }
    const targetWeek = progressWeeks.find((w) => w.mingguKe === weekNumToDelete);
    const updatedWeeks = progressWeeks
      .filter((w) => w.mingguKe !== weekNumToDelete)
      .map((w, idx) => ({
        ...w,
        mingguKe: idx + 1,
      }));

    onUpdateWeeks(updatedWeeks);
    setConfirmDeleteWeekNum(null);
    const nextActive = Math.min(selectedWeekNum, updatedWeeks.length);
    setSelectedWeekNum(nextActive);
    setSyncSuccessMsg(`Minggu ke-${weekNumToDelete} (${targetWeek?.periode || ''}) berhasil dihapus. Total durasi sekarang ${updatedWeeks.length} minggu.`);
    setTimeout(() => setSyncSuccessMsg(null), 5000);
  };

  // State & handlers for editing Waktu Pelaksanaan Pekerjaan (HK & Minggu)
  const [isEditingWaktu, setIsEditingWaktu] = useState<boolean>(false);
  const [formRencanaHK, setFormRencanaHK] = useState<number>(progressWeeks.length * 7);
  const [formRencanaMinggu, setFormRencanaMinggu] = useState<number>(progressWeeks.length);
  const [formTerlaksanaHK, setFormTerlaksanaHK] = useState<number>(currentWeek.mingguKe * 7);
  const [formTerlaksanaMinggu, setFormTerlaksanaMinggu] = useState<number>(currentWeek.mingguKe);
  const [formSisaHK, setFormSisaHK] = useState<number>(Math.max(0, progressWeeks.length * 7 - currentWeek.mingguKe * 7));
  const [formSisaMinggu, setFormSisaMinggu] = useState<number>(Math.max(0, progressWeeks.length - currentWeek.mingguKe));
  const [applyRencanaToAll, setApplyRencanaToAll] = useState<boolean>(true);

  // Sync execution time inputs when selected week or total weeks change
  useEffect(() => {
    const defRencanaHK = currentWeek.rencanaWaktuHK ?? (progressWeeks.length * 7);
    const defRencanaM = currentWeek.rencanaWaktuMinggu ?? progressWeeks.length;
    const defTerlaksanaHK = currentWeek.waktuTerlaksanaHK ?? (currentWeek.mingguKe * 7);
    const defTerlaksanaM = currentWeek.waktuTerlaksanaMinggu ?? currentWeek.mingguKe;
    const defSisaHK = currentWeek.sisaWaktuHK ?? Math.max(0, defRencanaHK - defTerlaksanaHK);
    const defSisaM = currentWeek.sisaWaktuMinggu ?? Math.max(0, defRencanaM - defTerlaksanaM);

    setFormRencanaHK(defRencanaHK);
    setFormRencanaMinggu(defRencanaM);
    setFormTerlaksanaHK(defTerlaksanaHK);
    setFormTerlaksanaMinggu(defTerlaksanaM);
    setFormSisaHK(defSisaHK);
    setFormSisaMinggu(defSisaM);
  }, [
    selectedWeekNum,
    currentWeek.mingguKe,
    progressWeeks.length,
    currentWeek.rencanaWaktuHK,
    currentWeek.waktuTerlaksanaHK,
    currentWeek.sisaWaktuHK,
    currentWeek.rencanaWaktuMinggu,
    currentWeek.waktuTerlaksanaMinggu,
    currentWeek.sisaWaktuMinggu,
  ]);

  const handleAutoCalcSisaWaktu = () => {
    const sHK = Math.max(0, formRencanaHK - formTerlaksanaHK);
    const sM = Math.max(0, formRencanaMinggu - formTerlaksanaMinggu);
    setFormSisaHK(sHK);
    setFormSisaMinggu(sM);
  };

  const handleSaveWaktuPelaksanaan = () => {
    const updatedAllWeeks = progressWeeks.map((w) => {
      if (w.mingguKe === selectedWeekNum) {
        return {
          ...w,
          rencanaWaktuHK: formRencanaHK,
          rencanaWaktuMinggu: formRencanaMinggu,
          waktuTerlaksanaHK: formTerlaksanaHK,
          waktuTerlaksanaMinggu: formTerlaksanaMinggu,
          sisaWaktuHK: formSisaHK,
          sisaWaktuMinggu: formSisaMinggu,
        };
      }
      if (applyRencanaToAll) {
        const weekTerlaksanaHK = w.waktuTerlaksanaHK ?? (w.mingguKe * 7);
        const weekTerlaksanaM = w.waktuTerlaksanaMinggu ?? w.mingguKe;
        return {
          ...w,
          rencanaWaktuHK: formRencanaHK,
          rencanaWaktuMinggu: formRencanaMinggu,
          sisaWaktuHK: Math.max(0, formRencanaHK - weekTerlaksanaHK),
          sisaWaktuMinggu: Math.max(0, formRencanaMinggu - weekTerlaksanaM),
        };
      }
      return w;
    });

    onUpdateWeeks(updatedAllWeeks);
    setIsEditingWaktu(false);
    setSyncSuccessMsg(`Waktu pelaksanaan pekerjaan Minggu ${selectedWeekNum} berhasil disimpan & disinkronkan ke seluruh dokumen cetak!`);
    setTimeout(() => setSyncSuccessMsg(null), 5000);
  };

  const handleResetWaktuToDefault = () => {
    const defRencanaHK = progressWeeks.length * 7;
    const defRencanaM = progressWeeks.length;
    const defTerlaksanaHK = currentWeek.mingguKe * 7;
    const defTerlaksanaM = currentWeek.mingguKe;
    const defSisaHK = Math.max(0, defRencanaHK - defTerlaksanaHK);
    const defSisaM = Math.max(0, defRencanaM - defTerlaksanaM);

    setFormRencanaHK(defRencanaHK);
    setFormRencanaMinggu(defRencanaM);
    setFormTerlaksanaHK(defTerlaksanaHK);
    setFormTerlaksanaMinggu(defTerlaksanaM);
    setFormSisaHK(defSisaHK);
    setFormSisaMinggu(defSisaM);

    const updatedAllWeeks = progressWeeks.map((w) => {
      if (w.mingguKe === selectedWeekNum) {
        return {
          ...w,
          rencanaWaktuHK: defRencanaHK,
          rencanaWaktuMinggu: defRencanaM,
          waktuTerlaksanaHK: defTerlaksanaHK,
          waktuTerlaksanaMinggu: defTerlaksanaM,
          sisaWaktuHK: defSisaHK,
          sisaWaktuMinggu: defSisaM,
        };
      }
      return w;
    });

    onUpdateWeeks(updatedAllWeeks);
    setSyncSuccessMsg(`Waktu pelaksanaan dikembalikan ke kalkulasi standar: ${defRencanaHK} HK (${defRencanaM} Minggu)`);
    setTimeout(() => setSyncSuccessMsg(null), 4000);
  };

  const [txFormData, setTxFormData] = useState({
    tanggal: weekResolved.startDate,
    jenis: 'PENGELUARAN' as 'PENERIMAAN' | 'PENGELUARAN',
    uraian: '',
    noBukti: '',
    nominal: 0,
    kategoriBiaya: 'Konstruksi',
  });

  // Filter transactions belonging to selectedWeekNum
  const currentWeekTransactions = useMemo(() => {
    if (!bkuList) return [];
    return bkuList.filter((tx) => {
      // 1. Linked kwitansi with mingguKeRef
      if (tx.kwitansiIdRef && kwitansiList) {
        const linkedKw = kwitansiList.find((k) => k.id === tx.kwitansiIdRef);
        if (linkedKw?.mingguKeRef === selectedWeekNum) return true;
      }
      // 2. Proof number matches week
      const padWeek = selectedWeekNum < 10 ? `0${selectedWeekNum}` : `${selectedWeekNum}`;
      if (
        tx.noBukti.includes(`/UK/${padWeek}/`) ||
        tx.noBukti.includes(`UK/${padWeek}/`) ||
        tx.noBukti.includes(`M${selectedWeekNum}-`) ||
        tx.noBukti.includes(`TARIK-M${selectedWeekNum}`)
      ) {
        return true;
      }
      // 3. Description mentions week
      const lowUraian = tx.uraian.toLowerCase();
      if (
        lowUraian.includes(`minggu ke-${selectedWeekNum}`) ||
        lowUraian.includes(`minggu ${selectedWeekNum} `) ||
        lowUraian.includes(`minggu ${selectedWeekNum}(`) ||
        lowUraian.includes(`minggu ${selectedWeekNum},`) ||
        lowUraian.includes(`minggu ${selectedWeekNum} (${weekResolved.startDateFormatted}`)
      ) {
        return true;
      }
      // 4. Initial Termin 1 in Week 1
      if (selectedWeekNum === 1 && (tx.id === 'bku-init-1' || tx.noBukti === 'BKT-01')) {
        return true;
      }
      // 5. Initial Termin 2 in Week 8
      if (selectedWeekNum === 8 && (tx.id === 'bku-init-2' || tx.noBukti === 'BKT-02')) {
        return true;
      }
      // 6. Transaction date falls between week startDate and endDate
      if (tx.tanggalObj && tx.tanggalObj >= weekResolved.startDate && tx.tanggalObj <= weekResolved.endDate) {
        return true;
      }
      return false;
    });
  }, [bkuList, kwitansiList, selectedWeekNum, weekResolved]);

  const totalPengeluaranWeek = useMemo(() => {
    return currentWeekTransactions
      .filter((t) => t.jenis === 'PENGELUARAN')
      .reduce((s, t) => s + t.pengeluaran, 0);
  }, [currentWeekTransactions]);

  const totalPenerimaanWeek = useMemo(() => {
    return currentWeekTransactions
      .filter((t) => t.jenis === 'PENERIMAAN')
      .reduce((s, t) => s + t.penerimaan, 0);
  }, [currentWeekTransactions]);

  // Automatically ensure weeks progress is properly cascaded if needed
  useEffect(() => {
    if (progressWeeks && progressWeeks.length > 1) {
      const needsRecalc = progressWeeks.some((w, idx) => {
        if (idx === 0) return false;
        const prev = progressWeeks[idx - 1];
        if (!w.divisions || !prev.divisions) return false;
        return w.divisions.some((d) => {
          if (d.isManualMingguLalu) return false;
          const prevD = prev.divisions?.find(
            (pd) => pd.id === d.id || (pd.kode === d.kode && pd.kategori === d.kategori)
          );
          return prevD && (Number(prevD.prestasiSdMingguIni) || 0) > 0 && (Number(d.prestasiMingguLalu) || 0) === 0;
        });
      });

      if (needsRecalc) {
        const recalculated = recalculateAllWeeksProgress(progressWeeks);
        onUpdateWeeks(recalculated);
      }
    }
  }, [progressWeeks, onUpdateWeeks]);

  // Construct divisions for current week: automatically cascade prestasiMingguLalu from previous week if not manual
  const rawDivisions: DivisionProgressItem[] = useMemo(() => {
    const prevWeek = selectedWeekNum > 1 ? progressWeeks.find((w) => w.mingguKe === selectedWeekNum - 1) : null;
    const baseDivs =
      currentWeek.divisions && currentWeek.divisions.length > 0
        ? currentWeek.divisions
        : DEFAULT_DIVISIONS.map((d) => ({
            ...d,
            prestasiMingguLalu: 0,
            prestasiMingguIni: 0,
            prestasiSdMingguIni: 0,
          }));

    return baseDivs.map((d) => {
      let mingguLalu = Number(d.prestasiMingguLalu) || 0;
      if (prevWeek && !d.isManualMingguLalu) {
        const matchedPrev = prevWeek.divisions?.find(
          (pd) => pd.id === d.id || (pd.kode === d.kode && pd.kategori === d.kategori)
        );
        if (matchedPrev) {
          mingguLalu = Number(matchedPrev.prestasiSdMingguIni) || 0;
        }
      }
      const ini = Number(d.prestasiMingguIni) || 0;
      const sdIni = Math.min(
        d.bobotTotal,
        Math.round((mingguLalu + ini) * 1000) / 1000
      );
      return {
        ...d,
        prestasiMingguLalu: Math.round(mingguLalu * 1000) / 1000,
        prestasiSdMingguIni: sdIni,
      };
    });
  }, [currentWeek.divisions, selectedWeekNum, progressWeeks]);

  // Automatically enforce Roman numeral numbering according to work category (FISIK or MANAJEMEN)
  const divisions = renumberDivisions(rawDivisions);

  const fisikDivisions = divisions.filter((d) => d.kategori === 'FISIK');
  const manajemenDivisions = divisions.filter((d) => d.kategori === 'MANAJEMEN');

  // Compute column totals automatically
  const rawTotalBobot = divisions.reduce((s, d) => s + (Number(d.bobotTotal) || 0), 0);
  const roundedRawTotalBobot = Math.round(rawTotalBobot * 1000) / 1000;
  // Toleransi pembulatan desimal Excel (±0.05% diakui pas 100,00% sesuai akumulasi tabel dinas/teknis)
  const isBobotWithinExcelTolerance = Math.abs(roundedRawTotalBobot - 100) <= 0.05;
  const isBobotBalanced = Math.abs(roundedRawTotalBobot - 100) < 0.0001 || isBobotWithinExcelTolerance;
  // Tetap terkunci di 100,00% jika berada dalam toleransi pembulatan Excel
  const cappedTotalBobot = isBobotWithinExcelTolerance ? 100 : Math.min(100, roundedRawTotalBobot);

  const rawTotalMingguLalu = divisions.reduce((s, d) => s + d.prestasiMingguLalu, 0);
  const rawTotalMingguIni = divisions.reduce((s, d) => s + d.prestasiMingguIni, 0);

  // Allow manual override for totals (e.g. to match Excel internal rounding discrepancy)
  const totalMingguLalu =
    currentWeek.customTotalMingguLalu !== undefined && currentWeek.customTotalMingguLalu !== null
      ? currentWeek.customTotalMingguLalu
      : rawTotalMingguLalu;

  const totalMingguIni =
    currentWeek.customTotalMingguIni !== undefined && currentWeek.customTotalMingguIni !== null
      ? currentWeek.customTotalMingguIni
      : rawTotalMingguIni;

  const rawTotalSdMingguIni = Math.min(100, Math.round((totalMingguLalu + totalMingguIni) * 1000) / 1000);
  const totalSdMingguIni =
    currentWeek.customTotalSdMingguIni !== undefined && currentWeek.customTotalSdMingguIni !== null
      ? currentWeek.customTotalSdMingguIni
      : rawTotalSdMingguIni;

  const currentTotalRealizedBobot = useMemo(() => {
    return calculateCumulativeRealizedProgress(progressWeeks, selectedWeekNum);
  }, [progressWeeks, selectedWeekNum]);

  const totalKwitansiExpenditure = useMemo(() => {
    return (kwitansiList || []).reduce((s, k) => s + (k.nominal || 0), 0);
  }, [kwitansiList]);

  const paguSekolah = school?.totalAnggaran || 552457000;
  const isExpenditureImbalanced = useMemo(() => {
    if (currentTotalRealizedBobot <= 0) return totalKwitansiExpenditure > 0;
    const maxAllowed = Math.round(paguSekolah * (currentTotalRealizedBobot / 100) * 1.35) + 35000000;
    return totalKwitansiExpenditure > maxAllowed;
  }, [currentTotalRealizedBobot, totalKwitansiExpenditure, paguSekolah]);

  // Handler for manual override of Total Minggu Lalu
  const handleCustomTotalMingguLaluChange = (valStr: string) => {
    setCustomTotalMingguLaluStr((prev) => ({ ...prev, [selectedWeekNum]: valStr }));
    const val = parseFloat(valStr);
    const newTotLalu = isNaN(val) ? 0 : Math.max(0, Math.round(val * 1000) / 1000);
    const newTotSd = Math.min(100, Math.round((newTotLalu + totalMingguIni) * 1000) / 1000);

    const updatedAllWeeks = progressWeeks.map((w) => {
      if (w.mingguKe === selectedWeekNum) {
        return {
          ...w,
          customTotalMingguLalu: newTotLalu,
          customTotalSdMingguIni: newTotSd,
          bobotRealisasi: newTotSd,
          deviasi: Math.round((newTotSd - (w.bobotRencana || 0)) * 1000) / 1000,
        };
      }
      return w;
    });
    onUpdateWeeks(updatedAllWeeks);
  };

  const handleResetTotalMingguLalu = () => {
    setCustomTotalMingguLaluStr((prev) => {
      const copy = { ...prev };
      delete copy[selectedWeekNum];
      return copy;
    });
    const updatedAllWeeks = progressWeeks.map((w) => {
      if (w.mingguKe === selectedWeekNum) {
        const copy = { ...w };
        delete copy.customTotalMingguLalu;
        const newTotSd = Math.min(100, Math.round((rawTotalMingguLalu + totalMingguIni) * 1000) / 1000);
        copy.customTotalSdMingguIni = newTotSd;
        copy.bobotRealisasi = newTotSd;
        copy.deviasi = Math.round((newTotSd - (w.bobotRencana || 0)) * 1000) / 1000;
        return copy;
      }
      return w;
    });
    onUpdateWeeks(updatedAllWeeks);
  };

  // Handler for manual override of Total Minggu Ini
  const handleCustomTotalMingguIniChange = (valStr: string) => {
    setCustomTotalMingguIniStr((prev) => ({ ...prev, [selectedWeekNum]: valStr }));
    const val = parseFloat(valStr);
    const newTotIni = isNaN(val) ? 0 : Math.max(0, Math.round(val * 1000) / 1000);
    const newTotSd = Math.min(100, Math.round((totalMingguLalu + newTotIni) * 1000) / 1000);

    const updatedAllWeeks = progressWeeks.map((w) => {
      if (w.mingguKe === selectedWeekNum) {
        return {
          ...w,
          customTotalMingguIni: newTotIni,
          customTotalSdMingguIni: newTotSd,
          bobotRealisasi: newTotSd,
          deviasi: Math.round((newTotSd - (w.bobotRencana || 0)) * 1000) / 1000,
        };
      }
      return w;
    });
    onUpdateWeeks(updatedAllWeeks);
  };

  const handleResetTotalMingguIni = () => {
    setCustomTotalMingguIniStr((prev) => {
      const copy = { ...prev };
      delete copy[selectedWeekNum];
      return copy;
    });
    const updatedAllWeeks = progressWeeks.map((w) => {
      if (w.mingguKe === selectedWeekNum) {
        const copy = { ...w };
        delete copy.customTotalMingguIni;
        const newTotSd = Math.min(100, Math.round((totalMingguLalu + rawTotalMingguIni) * 1000) / 1000);
        copy.customTotalSdMingguIni = newTotSd;
        copy.bobotRealisasi = newTotSd;
        copy.deviasi = Math.round((newTotSd - (w.bobotRencana || 0)) * 1000) / 1000;
        return copy;
      }
      return w;
    });
    onUpdateWeeks(updatedAllWeeks);
  };

  // Handler for manual override of Total s.d Minggu Ini
  const handleCustomTotalSdMingguIniChange = (valStr: string) => {
    const val = parseFloat(valStr);
    const newTotSd = isNaN(val) ? 0 : Math.max(0, Math.min(100, Math.round(val * 1000) / 1000));
    const updatedAllWeeks = progressWeeks.map((w) => {
      if (w.mingguKe === selectedWeekNum) {
        return {
          ...w,
          customTotalSdMingguIni: newTotSd,
          bobotRealisasi: newTotSd,
          deviasi: Math.round((newTotSd - (w.bobotRencana || 0)) * 1000) / 1000,
        };
      }
      return w;
    });
    onUpdateWeeks(updatedAllWeeks);
  };

  const handleResetTotalSdMingguIni = () => {
    const updatedAllWeeks = progressWeeks.map((w) => {
      if (w.mingguKe === selectedWeekNum) {
        const copy = { ...w };
        delete copy.customTotalSdMingguIni;
        const calc = Math.min(100, Math.round((totalMingguLalu + totalMingguIni) * 1000) / 1000);
        copy.bobotRealisasi = calc;
        copy.deviasi = Math.round((calc - (w.bobotRencana || 0)) * 1000) / 1000;
        return copy;
      }
      return w;
    });
    onUpdateWeeks(updatedAllWeeks);
  };

  // Active Realisasi & Target: user can adjust either manually or use table calculations
  const activeRealisasi =
    currentWeek.bobotRealisasi !== undefined && currentWeek.bobotRealisasi !== null
      ? currentWeek.bobotRealisasi
      : totalSdMingguIni;
  const activeTarget =
    currentWeek.bobotRencana !== undefined && currentWeek.bobotRencana !== null
      ? currentWeek.bobotRencana
      : 0;

  // LEBIH CEPAT DARI RENCANA / TERLAMBAT DARI RENCANA (Menghitung Otomatis Real-Time)
  const deviasi = Math.round((activeRealisasi - activeTarget) * 1000) / 1000;
  const isFaster = deviasi >= 0;

  // Handler to adjust PRESTASI PELAKSANAAN (REALISASI) manually
  const handleManualRealisasiChange = (valStr: string) => {
    setCustomRealisasiStr((prev) => ({ ...prev, [selectedWeekNum]: valStr }));
    const val = parseFloat(valStr);
    const newRealisasi = isNaN(val) ? 0 : Math.max(0, Math.min(100, Math.round(val * 1000) / 1000));
    const newDev = Math.round((newRealisasi - activeTarget) * 1000) / 1000;

    const updatedAllWeeks = progressWeeks.map((w) => {
      if (w.mingguKe === selectedWeekNum) {
        return {
          ...w,
          bobotRealisasi: newRealisasi,
          deviasi: newDev,
        };
      }
      return w;
    });

    onUpdateWeeks(updatedAllWeeks);
  };

  // Reset Realisasi back to table divisions sum
  const handleResetRealisasiToTable = () => {
    setCustomRealisasiStr((prev) => {
      const copy = { ...prev };
      delete copy[selectedWeekNum];
      return copy;
    });
    const newDev = Math.round((totalSdMingguIni - activeTarget) * 1000) / 1000;

    const updatedAllWeeks = progressWeeks.map((w) => {
      if (w.mingguKe === selectedWeekNum) {
        return {
          ...w,
          bobotRealisasi: totalSdMingguIni,
          deviasi: newDev,
        };
      }
      return w;
    });

    onUpdateWeeks(updatedAllWeeks);
  };

  // Handler to adjust PRESTASI YANG DIRENCANAKAN (TARGET) manually
  const handleManualTargetChange = (valStr: string) => {
    setCustomTargetStr((prev) => ({ ...prev, [selectedWeekNum]: valStr }));
    const val = parseFloat(valStr);
    const newTarget = isNaN(val) ? 0 : Math.max(0, Math.min(100, Math.round(val * 1000) / 1000));
    const newDev = Math.round((activeRealisasi - newTarget) * 1000) / 1000;

    const updatedAllWeeks = progressWeeks.map((w) => {
      if (w.mingguKe === selectedWeekNum) {
        return {
          ...w,
          bobotRencana: newTarget,
          deviasi: newDev,
        };
      }
      return w;
    });

    onUpdateWeeks(updatedAllWeeks);
  };

  // Handler to adjust Bobot % of any division row
  const handleBobotTotalChange = (divisionId: string, valueStr: string) => {
    const val = parseFloat(valueStr);
    const newBobot = isNaN(val) ? 0 : Math.max(0, Math.round(val * 1000) / 1000);

    const updatedAllWeeks = progressWeeks.map((w) => {
      const currentDivs = w.divisions && w.divisions.length > 0 ? w.divisions : divisions;
      const updatedDivs = currentDivs.map((d) => {
        if (d.id === divisionId) {
          const sdIni = Math.min(newBobot, d.prestasiSdMingguIni);
          return {
            ...d,
            bobotTotal: newBobot,
            prestasiSdMingguIni: sdIni,
          };
        }
        return d;
      });
      return {
        ...w,
        divisions: updatedDivs,
      };
    });

    onUpdateWeeks(updatedAllWeeks);
  };

  // Add new division to either FISIK or MANAJEMEN category
  const handleAddDivision = (kategori: 'FISIK' | 'MANAJEMEN') => {
    if (!newUraianText.trim()) return;

    const newId = `div-${kategori.toLowerCase()}-${Date.now()}`;
    const newBobot = Math.max(0, Math.round((parseFloat(newBobotText) || 0) * 1000) / 1000);
    const uraianUpper = newUraianText.trim().toUpperCase();

    const updatedAllWeeks = progressWeeks.map((w) => {
      const currentDivs = w.divisions && w.divisions.length > 0 ? w.divisions : divisions;
      const fisik = currentDivs.filter((d) => d.kategori === 'FISIK');
      const manajemen = currentDivs.filter((d) => d.kategori === 'MANAJEMEN');

      const newItem: DivisionProgressItem = {
        id: newId,
        kode: '', // will be automatically set by renumberDivisions
        kategori,
        uraian: uraianUpper,
        bobotTotal: newBobot,
        prestasiMingguLalu: 0,
        prestasiMingguIni: 0,
        prestasiSdMingguIni: 0,
        materialRef: [uraianUpper],
      };

      const combined =
        kategori === 'FISIK'
          ? [...fisik, newItem, ...manajemen]
          : [...fisik, ...manajemen, newItem];

      const renumbered = renumberDivisions(combined);
      const newTotalSdIni = Math.min(
        100,
        Math.round(renumbered.reduce((s, d) => s + d.prestasiSdMingguIni, 0) * 1000) / 1000
      );

      return {
        ...w,
        bobotRealisasi: newTotalSdIni,
        deviasi: Math.round((newTotalSdIni - w.bobotRencana) * 100) / 100,
        divisions: renumbered,
      };
    });

    onUpdateWeeks(updatedAllWeeks);
    const nextRoman = toRoman(
      kategori === 'FISIK' ? fisikDivisions.length + 1 : manajemenDivisions.length + 1
    );
    setAddingCategory(null);
    setNewUraianText('');
    setNewBobotText('0.00');
    setSyncSuccessMsg(
      `Uraian pekerjaan "${uraianUpper}" berhasil ditambahkan dengan nomor Romawi otomatis: ${nextRoman}.`
    );
    setTimeout(() => setSyncSuccessMsg(null), 4000);
  };

  // Delete division from all weeks and renumber remaining items with Roman numerals
  const handleDeleteDivision = (divisionId: string) => {
    const itemToDelete = divisions.find((d) => d.id === divisionId);

    const updatedAllWeeks = progressWeeks.map((w) => {
      const currentDivs = w.divisions && w.divisions.length > 0 ? w.divisions : divisions;
      const filtered = currentDivs.filter((d) => d.id !== divisionId);
      const renumbered = renumberDivisions(filtered);
      const newTotalSdIni = Math.min(
        100,
        Math.round(renumbered.reduce((s, d) => s + d.prestasiSdMingguIni, 0) * 100) / 100
      );

      return {
        ...w,
        bobotRealisasi: newTotalSdIni,
        deviasi: Math.round((newTotalSdIni - w.bobotRencana) * 100) / 100,
        divisions: renumbered,
      };
    });

    onUpdateWeeks(updatedAllWeeks);
    setConfirmDeleteDivision(null);
    setSyncSuccessMsg(
      `Uraian pekerjaan "${itemToDelete?.uraian || ''}" berhasil dihapus. Nomor Romawi untuk pekerjaan lainnya telah otomatis diurutkan kembali.`
    );
    setTimeout(() => setSyncSuccessMsg(null), 4000);
  };

  // Save renamed division uraian across all weeks
  const handleSaveRename = (divisionId: string) => {
    if (!editingUraianText.trim()) return;
    const uraianUpper = editingUraianText.trim().toUpperCase();

    const updatedAllWeeks = progressWeeks.map((w) => {
      const currentDivs = w.divisions && w.divisions.length > 0 ? w.divisions : divisions;
      const updated = currentDivs.map((d) => {
        if (d.id === divisionId) {
          return { ...d, uraian: uraianUpper };
        }
        return d;
      });
      return {
        ...w,
        divisions: updated,
      };
    });

    onUpdateWeeks(updatedAllWeeks);
    setEditingUraianId(null);
    setEditingUraianText('');
    setSyncSuccessMsg(`Nama uraian pekerjaan berhasil diubah menjadi "${uraianUpper}".`);
    setTimeout(() => setSyncSuccessMsg(null), 3000);
  };

  // Save manually edited Roman numeral (item.kode) across all weeks
  const handleSaveKode = (divisionId: string) => {
    if (!editingKodeText.trim()) return;
    const newKode = editingKodeText.trim().toUpperCase();

    const updatedAllWeeks = progressWeeks.map((w) => {
      const currentDivs = w.divisions && w.divisions.length > 0 ? w.divisions : divisions;
      const updated = currentDivs.map((d) => {
        if (d.id === divisionId) {
          return { ...d, kode: newKode };
        }
        return d;
      });
      return {
        ...w,
        divisions: updated,
      };
    });

    onUpdateWeeks(updatedAllWeeks);
    setEditingKodeId(null);
    setEditingKodeText('');
    setSyncSuccessMsg(`Nomor Romawi berhasil diubah menjadi "${newKode}".`);
    setTimeout(() => setSyncSuccessMsg(null), 3000);
  };

  // Reset Roman numerals back to standard sequential (I, II, III...)
  const handleResetAutoRoman = () => {
    const updatedAllWeeks = progressWeeks.map((w) => {
      const currentDivs = w.divisions && w.divisions.length > 0 ? w.divisions : divisions;
      const renumbered = renumberDivisions(
        currentDivs.map((d) => ({ ...d, kode: '' }))
      );
      return {
        ...w,
        divisions: renumbered,
      };
    });
    onUpdateWeeks(updatedAllWeeks);
    setSyncSuccessMsg('Nomor Romawi berhasil diurutkan kembali secara otomatis.');
    setTimeout(() => setSyncSuccessMsg(null), 3000);
  };

  // 100% Full Integration: Synchronize division items and weights directly from Data Real Sekolah (RAB)
  const handleSyncFromRealSchoolData = () => {
    if (!realSchoolData || !realSchoolData.divisions || realSchoolData.divisions.length === 0) {
      alert('Data Real Sekolah belum memiliki divisi pekerjaan. Silakan lengkapi divisi di menu Data Real Sekolah terlebih dahulu.');
      return;
    }

    const synced = syncProgressWeeksWithRealData(progressWeeks, realSchoolData);
    onUpdateWeeks(synced);
    setSyncSuccessMsg(
      `Berhasil! Seluruh uraian pekerjaan dan bobot mingguan telah terintegrasi 100% dengan Data Real Sekolah (${realSchoolData.divisions.length} divisi RAB).`
    );
    setTimeout(() => setSyncSuccessMsg(null), 5000);
  };

  // Helper to automatically balance surplus / deficit to exact 100,00%
  const handleAutoBalanceBobot = () => {
    const diff = Math.round((100 - roundedRawTotalBobot) * 1000) / 1000;
    if (Math.abs(diff) < 0.0001) {
      setSyncSuccessMsg('Total Bobot sudah tepat 100%!');
      setTimeout(() => setSyncSuccessMsg(null), 3000);
      return;
    }

    // Adjust on the last division (e.g. BIAYA PENGELOLAAN)
    const updatedAllWeeks = progressWeeks.map((w) => {
      const currentDivs = w.divisions && w.divisions.length > 0 ? w.divisions : divisions;
      const targetDiv = currentDivs[currentDivs.length - 1];
      if (!targetDiv) return w;
      const newTargetBobot = Math.max(0, Math.round((targetDiv.bobotTotal + diff) * 1000) / 1000);

      const updatedDivs = currentDivs.map((d, idx) => {
        if (idx === currentDivs.length - 1) {
          return {
            ...d,
            bobotTotal: newTargetBobot,
            prestasiSdMingguIni: Math.min(newTargetBobot, d.prestasiSdMingguIni),
          };
        }
        return d;
      });

      return {
        ...w,
        divisions: updatedDivs,
      };
    });

    onUpdateWeeks(updatedAllWeeks);
    setSyncSuccessMsg(`Total Bobot berhasil diseimbangkan tepat 100% (penyesuaian ${diff > 0 ? '+' : ''}${formatProg(diff)}% pada ${divisions[divisions.length - 1]?.uraian || 'divisi terakhir'}).`);
    setTimeout(() => setSyncSuccessMsg(null), 4000);
  };

  // Reset to default divisions
  const handleResetBobotDefault = () => {
    const defaultInitialized = DEFAULT_DIVISIONS.map((d) => ({
      ...d,
      prestasiMingguLalu: 0,
      prestasiMingguIni: 0,
      prestasiSdMingguIni: 0,
    }));
    const renumbered = renumberDivisions(defaultInitialized);

    const updatedAllWeeks = progressWeeks.map((w) => {
      return {
        ...w,
        divisions: renumbered,
      };
    });
    onUpdateWeeks(updatedAllWeeks);
    setSyncSuccessMsg('Daftar uraian pekerjaan dan bobot berhasil dikembalikan ke standar awal.');
    setTimeout(() => setSyncSuccessMsg(null), 4000);
  };

  const handlePrestasiChange = (divisionId: string, valueStr: string) => {
    const val = parseFloat(valueStr) || 0;

    // Calculate this week's updated divisions
    const updatedDivisions = divisions.map((d) => {
      if (d.id === divisionId) {
        const sdIni = Math.min(d.bobotTotal, Math.round(((Number(d.prestasiMingguLalu) || 0) + val) * 1000) / 1000);
        return {
          ...d,
          prestasiMingguIni: val,
          prestasiSdMingguIni: sdIni,
        };
      }
      return d;
    });

    const updatedAllWeeks = progressWeeks.map((w) => {
      if (w.mingguKe === selectedWeekNum) {
        return {
          ...w,
          divisions: updatedDivisions,
        };
      }
      return w;
    });

    const finalWeeks = recalculateAllWeeksProgress(updatedAllWeeks);
    onUpdateWeeks(finalWeeks);
  };

  const handlePrestasiMingguLaluChange = (divisionId: string, valueStr: string) => {
    const isCleared = valueStr.trim() === '';
    const val = parseFloat(valueStr) || 0;

    // Calculate this week's updated divisions with adjusted prestasiMingguLalu
    const updatedDivisions = divisions.map((d) => {
      if (d.id === divisionId) {
        return {
          ...d,
          isManualMingguLalu: !isCleared,
          prestasiMingguLalu: isCleared ? 0 : val,
        };
      }
      return d;
    });

    const updatedAllWeeks = progressWeeks.map((w) => {
      if (w.mingguKe === selectedWeekNum) {
        return {
          ...w,
          divisions: updatedDivisions,
        };
      }
      return w;
    });

    const finalWeeks = recalculateAllWeeksProgress(updatedAllWeeks);
    onUpdateWeeks(finalWeeks);
  };

  const handleResetManualMingguLalu = (divisionId: string) => {
    const updatedDivisions = divisions.map((d) => {
      if (d.id === divisionId) {
        return {
          ...d,
          isManualMingguLalu: false,
        };
      }
      return d;
    });

    const updatedAllWeeks = progressWeeks.map((w) => {
      if (w.mingguKe === selectedWeekNum) {
        return {
          ...w,
          divisions: updatedDivisions,
        };
      }
      return w;
    });

    const finalWeeks = recalculateAllWeeksProgress(updatedAllWeeks);
    onUpdateWeeks(finalWeeks);
  };

  const handleApplyAndSync = () => {
    onAutoGenerateFromProgress(selectedWeekNum);
    setSyncSuccessMsg(`Berhasil! Data Minggu ke-${selectedWeekNum} telah disinkronkan ke Absensi 7 Hari, Kwitansi Upah, Bon/Faktur Toko, SPB, BKU, BKT, BKB, dan Pajak.`);
    setTimeout(() => setSyncSuccessMsg(null), 5000);
  };

  const handleUpdatePhotosForCurrentWeek = (updatedPhotos: ProgressPhotoItem[]) => {
    const updatedAllWeeks = progressWeeks.map((w) => {
      if (w.mingguKe === selectedWeekNum) {
        return {
          ...w,
          photos: updatedPhotos,
        };
      }
      return w;
    });
    onUpdateWeeks(updatedAllWeeks);
  };

  // Weekly Date Range Handlers
  const handleStartDateChange = (newStartIso: string) => {
    if (!newStartIso) return;
    const sDate = new Date(`${newStartIso}T00:00:00`);
    const eDate = new Date(sDate.getTime() + 6 * 86400000);
    const newEndIso = eDate.toISOString().split('T')[0];

    const indShort = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const sParts = newStartIso.split('-');
    const eParts = newEndIso.split('-');
    const sDay = sParts[2];
    const eDay = eParts[2];
    const sMonth = indShort[parseInt(sParts[1], 10) - 1];
    const eMonth = indShort[parseInt(eParts[1], 10) - 1];
    const year = sParts[0];

    const formattedPeriode = `${sDay} ${sMonth} - ${eDay} ${eMonth} ${year}`;

    const updated = progressWeeks.map((w) => {
      if (w.mingguKe === selectedWeekNum) {
        return {
          ...w,
          startDate: newStartIso,
          endDate: newEndIso,
          periode: formattedPeriode,
        };
      }
      return w;
    });
    onUpdateWeeks(updated);
  };

  const handleEndDateChange = (newEndIso: string) => {
    if (!newEndIso) return;
    const sIso = weekResolved.startDate;
    const indShort = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const sParts = sIso.split('-');
    const eParts = newEndIso.split('-');
    const sDay = sParts[2];
    const eDay = eParts[2];
    const sMonth = indShort[parseInt(sParts[1], 10) - 1];
    const eMonth = indShort[parseInt(eParts[1], 10) - 1];
    const year = eParts[0];

    const formattedPeriode = `${sDay} ${sMonth} - ${eDay} ${eMonth} ${year}`;

    const updated = progressWeeks.map((w) => {
      if (w.mingguKe === selectedWeekNum) {
        return {
          ...w,
          startDate: sIso,
          endDate: newEndIso,
          periode: formattedPeriode,
        };
      }
      return w;
    });
    onUpdateWeeks(updated);
  };

  const handlePeriodeTextChange = (text: string) => {
    const updated = progressWeeks.map((w) => {
      if (w.mingguKe === selectedWeekNum) {
        return { ...w, periode: text };
      }
      return w;
    });
    onUpdateWeeks(updated);
  };

  const handleOpenAddTx = () => {
    setEditingTx(null);
    setTxFormError(null);
    const seq = currentWeekTransactions.length + 1;
    setTxFormData({
      tanggal: weekResolved.startDate,
      jenis: 'PENGELUARAN',
      uraian: `Belanja Material Tambahan Minggu Ke-${selectedWeekNum}`,
      noBukti: `M${selectedWeekNum}-${String(seq).padStart(2, '0')}/${schoolYear}`,
      nominal: 0,
      kategoriBiaya: 'Konstruksi',
    });
    setIsTxModalOpen(true);
  };

  const handleOpenEditTx = (tx: BkuTransaction) => {
    setEditingTx(tx);
    setTxFormError(null);

    let dateInput = weekResolved.startDate;
    if (tx.tanggalObj && tx.tanggalObj.includes('-')) {
      dateInput = tx.tanggalObj;
    } else if (tx.tanggal && tx.tanggal.includes('/')) {
      const [d, m, y] = tx.tanggal.split('/');
      dateInput = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    setTxFormData({
      tanggal: dateInput,
      jenis: tx.jenis,
      uraian: tx.uraian,
      noBukti: tx.noBukti === '-' ? '' : tx.noBukti,
      nominal: tx.jenis === 'PENERIMAAN' ? tx.penerimaan : tx.pengeluaran,
      kategoriBiaya: tx.kategoriBiaya || 'Konstruksi',
    });
    setIsTxModalOpen(true);
  };

  const handleSaveTx = (e: React.FormEvent) => {
    e.preventDefault();
    setTxFormError(null);

    if (!txFormData.uraian.trim()) {
      setTxFormError('Uraian transaksi tidak boleh kosong.');
      return;
    }

    if (!txFormData.nominal || txFormData.nominal <= 0) {
      setTxFormError('Nominal transaksi harus lebih dari Rp 0.');
      return;
    }

    // Tanggal mulai pencatatan jangan kurang dari tanggal yang di-input dari Laporan Mingguan & Bobot
    if (txFormData.tanggal < weekResolved.startDate) {
      setTxFormError(
        `Tanggal transaksi (${txFormData.tanggal}) tidak boleh kurang dari tanggal mulai Minggu Ke-${selectedWeekNum} (${weekResolved.startDateFormatted}).`
      );
      return;
    }

    const [y, m, d] = txFormData.tanggal.split('-');
    const indMonths = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    const bulanStr = `${indMonths[parseInt(m, 10) - 1]} ${y}`;
    const displayTanggal = `${d}/${m}/${y}`;

    if (editingTx) {
      if (onUpdateTransaction) {
        onUpdateTransaction({
          ...editingTx,
          tanggal: displayTanggal,
          tanggalObj: txFormData.tanggal,
          bulan: bulanStr,
          jenis: txFormData.jenis,
          uraian: txFormData.uraian.trim(),
          noBukti: txFormData.noBukti.trim() || '-',
          penerimaan: txFormData.jenis === 'PENERIMAAN' ? txFormData.nominal : 0,
          pengeluaran: txFormData.jenis === 'PENGELUARAN' ? txFormData.nominal : 0,
          kategoriBiaya: txFormData.kategoriBiaya,
        });
      }
    } else {
      if (onAddTransaction) {
        onAddTransaction({
          tanggal: displayTanggal,
          tanggalObj: txFormData.tanggal,
          bulan: bulanStr,
          jenis: txFormData.jenis,
          uraian: txFormData.uraian.trim(),
          noBukti: txFormData.noBukti.trim() || '-',
          penerimaan: txFormData.jenis === 'PENERIMAAN' ? txFormData.nominal : 0,
          pengeluaran: txFormData.jenis === 'PENGELUARAN' ? txFormData.nominal : 0,
          kategoriBiaya: txFormData.kategoriBiaya,
        }, selectedWeekNum);
      }
    }

    setIsTxModalOpen(false);
  };

  const handleConfirmDeleteTx = () => {
    if (confirmDeleteTx && onDeleteTransaction) {
      onDeleteTransaction(confirmDeleteTx);
      setConfirmDeleteTx(null);
    }
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Top Banner */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            Laporan Mingguan & Rekapitulasi Bobot Fisik Bangunan
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Format resmi sesuai standar Dinas Pendidikan. Anda dapat menyesuaikan <strong>BOBOT %</strong> per pekerjaan dan input <strong>Prestasi Minggu Ini (%)</strong>. Total otomatis dihitung dan maksimal 100,00%.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Add Buttons */}
          <button
            type="button"
            onClick={() => {
              setAddingCategory('FISIK');
              setNewUraianText('');
              setNewBobotText('0.00');
            }}
            className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 px-3 py-2 rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
            title="Tambah uraian pekerjaan fisik baru"
          >
            <Plus className="w-3.5 h-3.5 text-blue-600" />
            <span>+ Pekerjaan Fisik</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setAddingCategory('MANAJEMEN');
              setNewUraianText('');
              setNewBobotText('0.00');
            }}
            className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 px-3 py-2 rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
            title="Tambah rincian biaya manajemen baru"
          >
            <Plus className="w-3.5 h-3.5 text-indigo-600" />
            <span>+ Biaya Manajemen</span>
          </button>

          {/* Toggle Decimal Places (2 vs 3 Digit Desimal) */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-300 text-xs shadow-2xs">
            <span className="text-[11px] font-bold text-slate-600 px-2 py-1 flex items-center gap-1">
              Desimal:
            </span>
            <button
              type="button"
              onClick={() => handleToggleDecimalPrecision(2)}
              className={`px-2.5 py-1 rounded-md font-bold text-xs transition cursor-pointer ${
                decimalPrecision === 2
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
              }`}
              title="Tampilkan 2 angka di belakang koma (contoh: 2,66%)"
            >
              2 Digit (0,00)
            </button>
            <button
              type="button"
              onClick={() => handleToggleDecimalPrecision(3)}
              className={`px-2.5 py-1 rounded-md font-bold text-xs transition cursor-pointer ${
                decimalPrecision === 3
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
              }`}
              title="Tampilkan 3 angka di belakang koma (contoh: 2,658%)"
            >
              3 Digit (0,000)
            </button>
          </div>

          {/* Button to toggle Adjust Bobot % */}
          <button
            type="button"
            onClick={() => setIsEditingBobotMaster(!isEditingBobotMaster)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer ${
              isEditingBobotMaster
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300'
            }`}
          >
            <Sliders className="w-4 h-4 text-amber-500" />
            <span>{isEditingBobotMaster ? 'Kunci Nilai Bobot %' : 'Sesuaikan Bobot %'}</span>
          </button>

          {/* Button to toggle Adjust Total Row */}
          <button
            type="button"
            onClick={() => setIsEditingTotalFooter(!isEditingTotalFooter)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer ${
              isEditingTotalFooter
                ? 'bg-blue-700 hover:bg-blue-800 text-white'
                : 'bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-300'
            }`}
            title="Klik untuk menyesuaikan angka total di baris paling bawah secara langsung agar 100% klop dengan hasil cetak Excel"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>{isEditingTotalFooter ? 'Kunci Angka Total' : 'Sesuaikan Total'}</span>
          </button>

          {isEditingBobotMaster && !isBobotBalanced && (
            <button
              type="button"
              onClick={handleAutoBalanceBobot}
              title="Sesuaikan selisih otomatis agar pas 100,00%"
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span>Seimbangkan 100,00%</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleApplyAndSync}
            className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white px-3.5 py-2 rounded-lg text-xs font-bold shadow-xs transition cursor-pointer"
            title="Sinkronkan otomatis progres minggu ini ke Kwitansi, SPB, Bon Toko, Upah, BKU, BKT, dan BKB"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>Sinkronkan ke SPJ & Kas</span>
          </button>

          {onCalibrateToRealProgress && (
            <button
              type="button"
              onClick={onCalibrateToRealProgress}
              className="flex items-center gap-1.5 bg-gradient-to-r from-teal-600 to-indigo-600 hover:from-teal-700 hover:to-indigo-700 text-white px-3.5 py-2 rounded-lg text-xs font-bold shadow-xs transition cursor-pointer"
              title="Kalibrasi belanja bahan & upah borongan mingguan agar sinkron murni dengan progres fisik riil (cegah saldo minus)"
            >
              <Wand2 className="w-3.5 h-3.5 text-amber-300" />
              <span>⚡ Kalibrasi Belanja ({calculateCumulativeRealizedProgress(progressWeeks)}%)</span>
            </button>
          )}

          {/* Download Template Excel */}
          <button
            type="button"
            onClick={() => downloadWeeklyProgressExcelTemplate(progressWeeks, school)}
            className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 px-3 py-2 rounded-lg text-xs font-bold shadow-xs transition cursor-pointer"
            title="Download Template Excel Kurva S & Rekapitulasi Bobot Progres Mingguan"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            <span>Download Template Excel</span>
          </button>

          {/* Upload Data Excel */}
          <button
            type="button"
            onClick={() => {
              setUploadExcelError(null);
              excelFileInputRef.current?.click();
            }}
            disabled={isUploadingExcel}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-lg text-xs font-bold shadow-xs transition cursor-pointer disabled:opacity-50"
            title="Upload file Excel laporan mingguan & bobot untuk mengisi beberapa minggu sekaligus"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{isUploadingExcel ? 'Membaca Excel...' : 'Upload Data Excel'}</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenPrintModal(selectedWeekNum)}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white px-3.5 py-2 rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
          >
            <Printer className="w-4 h-4 text-emerald-400" />
            <span>Cetak Rekap Minggu {selectedWeekNum}</span>
          </button>

          {/* Tombol Cetak Berita Acara BAST 100% */}
          <button
            type="button"
            onClick={() => onOpenPrintModal(undefined, 'BAST')}
            className="flex items-center gap-1.5 bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-800 hover:to-indigo-800 text-white px-3.5 py-2 rounded-lg text-xs font-bold shadow-xs transition cursor-pointer"
            title="Cetak Berita Acara Serah Terima Pekerjaan (BAST 100%)"
          >
            <FileText className="w-4 h-4 text-amber-300" />
            <span>📜 Cetak BAST 100%</span>
          </button>

          {/* Tombol Cetak BAP Kemajuan Fisik */}
          <button
            type="button"
            onClick={() => onOpenPrintModal(undefined, 'BAP_FISIK')}
            className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-700 to-teal-800 hover:from-emerald-800 hover:to-teal-900 text-white px-3.5 py-2 rounded-lg text-xs font-bold shadow-xs transition cursor-pointer"
            title="Cetak Berita Acara Pemeriksaan Kemajuan Fisik (Termin 1 / 70% & Termin 2 / 100%)"
          >
            <FileText className="w-4 h-4 text-emerald-200" />
            <span>📋 BAP Fisik (70% & 100%)</span>
          </button>
        </div>
      </div>

      {/* Hidden file input for Excel upload */}
      <input
        type="file"
        ref={excelFileInputRef}
        onChange={handleExcelFileUpload}
        accept=".xlsx, .xls"
        className="hidden"
      />

      {/* Dedicated Excel Multi-Week Management Card */}
      <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-blue-50 p-4 rounded-xl border border-emerald-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white flex items-center justify-center shrink-0 shadow-xs">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">
                Isi Bobot & Progres Mingguan Sekaligus via File Excel
              </h3>
              <span className="text-[10px] bg-emerald-200/90 text-emerald-900 font-extrabold px-2 py-0.5 rounded-full">
                Multi-Minggu Sekaligus
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
              Memudahkan Anda mengisi kurva target rencana dan capaian fisik untuk beberapa minggu sekaligus. Unduh template Excel yang sudah terisi data uraian pekerjaan sekolah, edit di Excel, lalu unggah kembali untuk sinkronisasi otomatis ke seluruh sistem SPJ.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => downloadWeeklyProgressExcelTemplate(progressWeeks, school)}
            className="flex items-center gap-1.5 bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 px-3.5 py-2 rounded-lg text-xs font-bold shadow-xs transition cursor-pointer"
            title="Download Template Excel yang siap diedit"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            <span>Download Template Excel</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setUploadExcelError(null);
              excelFileInputRef.current?.click();
            }}
            disabled={isUploadingExcel}
            className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-xs transition cursor-pointer disabled:opacity-50"
            title="Upload file Excel yang telah diisi bobotnya"
          >
            <Upload className="w-4 h-4" />
            <span>{isUploadingExcel ? 'Memproses File...' : 'Upload Data Excel'}</span>
          </button>
        </div>
      </div>

      {/* Upload Error Banner */}
      {uploadExcelError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-900 px-4 py-3 rounded-xl flex items-center justify-between gap-3 shadow-xs animate-fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
            <span className="text-xs font-semibold">{uploadExcelError}</span>
          </div>
          <button
            type="button"
            onClick={() => setUploadExcelError(null)}
            className="text-rose-700 hover:text-rose-900 p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Success Notification Banner */}
      {syncSuccessMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 rounded-xl flex items-center justify-between gap-3 shadow-xs animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span className="text-xs font-semibold">{syncSuccessMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSyncSuccessMsg(null)}
            className="text-emerald-700 hover:text-emerald-900 p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Week Selector Tabs */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
            Pilih Periode Minggu Kerja ({progressWeeks.length} Minggu):
          </span>
          <button
            type="button"
            onClick={() => setIsEditingDates(!isEditingDates)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer border ${
              isEditingDates
                ? 'bg-blue-600 text-white border-blue-700 shadow-xs ring-2 ring-blue-400/40'
                : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200'
            }`}
            title="Klik untuk mengatur rentang tanggal minggu ini secara manual"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Aktif: Minggu {currentWeek.mingguKe} ({currentWeek.periode || weekResolved.periodeText})</span>
            <Edit3 className={`w-3 h-3 ml-0.5 ${isEditingDates ? 'text-white' : 'text-blue-500'}`} />
          </button>
        </div>

        {/* Inline Date Range Editor Panel */}
        {isEditingDates && (
          <div className="p-3.5 bg-gradient-to-r from-blue-50/90 via-indigo-50/70 to-slate-50 rounded-xl border border-blue-200 space-y-3 animate-fade-in shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-blue-200/70 pb-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                  M{currentWeek.mingguKe}
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">
                    Atur Rentang Tanggal Manual: Minggu Ke-{currentWeek.mingguKe}
                  </h4>
                  <p className="text-[11px] text-slate-600">
                    Perubahan tanggal otomatis terintegrasi ke Rekap Mingguan, BKU, BKT, BKB, Kwitansi, Absensi Upah, dan Dokumen Cetak SPJ.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEditingDates(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-md self-end sm:self-auto cursor-pointer"
                title="Tutup panel pengaturan tanggal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 items-end">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  📅 Tanggal Mulai (Awal Minggu):
                </label>
                <input
                  type="date"
                  value={customStartDate || weekResolved.startDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  📅 Tanggal Selesai (Akhir Minggu):
                </label>
                <input
                  type="date"
                  value={customEndDate || weekResolved.endDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  🔍 Format Periode Terintegrasi:
                </label>
                <div className="px-3 py-1.5 bg-white border border-blue-200 rounded-lg text-xs font-bold text-blue-900 flex items-center justify-between shadow-2xs">
                  <span>
                    {formatWeekPeriodString(customStartDate || weekResolved.startDate, customEndDate || weekResolved.endDate) || currentWeek.periode}
                  </span>
                  <span className="text-[10px] text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded font-bold">
                    {weekResolved.bulan}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-blue-200/50">
              <button
                type="button"
                onClick={handleResetWeekDateToDefault}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-red-700 transition cursor-pointer"
                title="Kembalikan tanggal minggu ini ke hitungan jadwal baku standar"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset ke Tanggal Standar</span>
              </button>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSaveWeekDate(false)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs transition cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Simpan Minggu Ini Saja</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveWeekDate(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition cursor-pointer"
                  title="Otomatis memperbarui seluruh minggu setelahnya (+7 hari berurutan)"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>⚡ Simpan & Urutkan Minggu Berikutnya (+7 Hari)</span>
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5 items-center">
          {progressWeeks.map((w) => {
            const isSelected = selectedWeekNum === w.mingguKe;
            const hasPhotos = Boolean(w.photos && w.photos.length > 0);
            return (
              <div key={w.mingguKe} className="relative group inline-flex items-center">
                <button
                  type="button"
                  onClick={() => setSelectedWeekNum(w.mingguKe)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-blue-600 text-white font-bold shadow-xs pr-7'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 pr-7'
                  }`}
                >
                  <span>M{w.mingguKe}</span>
                  <span className="text-[10px] opacity-80">({w.bobotRealisasi}%)</span>
                  {hasPhotos && (
                    <span
                      title={`${w.photos!.length} Foto dokumentasi tersimpan`}
                      className={`text-[10px] flex items-center gap-0.5 px-1.5 py-0.5 rounded font-bold ${
                        isSelected ? 'bg-blue-900 text-amber-300' : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      <Camera className="w-2.5 h-2.5" />
                      <span>{w.photos!.length}</span>
                    </span>
                  )}
                </button>
                {progressWeeks.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteWeekNum(w.mingguKe);
                    }}
                    title={`Hapus Minggu Ke-${w.mingguKe}`}
                    className={`absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded transition cursor-pointer ${
                      isSelected
                        ? 'text-white/70 hover:text-white hover:bg-blue-700'
                        : 'text-slate-400 hover:text-rose-600 hover:bg-rose-100'
                    }`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}

          {/* Quick button to add next week up to 30 weeks if needed */}
          <button
            type="button"
            onClick={() => {
              const nextWeekNum = progressWeeks.length + 1;
              const lastWeek = progressWeeks[progressWeeks.length - 1];
              const resolvedLast = resolveWeekDates(lastWeek, schoolYear);
              const lastEndDate = resolvedLast.endDate ? new Date(`${resolvedLast.endDate}T00:00:00`) : new Date();
              const newStartDate = new Date(lastEndDate.getTime() + 1 * 86400000);
              const newEndDate = new Date(newStartDate.getTime() + 6 * 86400000);

              const sIso = newStartDate.toISOString().split('T')[0];
              const eIso = newEndDate.toISOString().split('T')[0];
              const sParts = sIso.split('-');
              const eParts = eIso.split('-');
              const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
              const sFormatted = `${sParts[2]} ${shortMonths[parseInt(sParts[1], 10) - 1]}`;
              const eFormatted = `${eParts[2]} ${shortMonths[parseInt(eParts[1], 10) - 1]} ${eParts[0]}`;

              const defaultDivs = (lastWeek?.divisions || DEFAULT_DIVISIONS.map((d) => ({
                ...d,
                prestasiMingguLalu: 0,
                prestasiMingguIni: 0,
                prestasiSdMingguIni: 0,
              }))).map((d) => ({
                ...d,
                prestasiMingguLalu: d.prestasiSdMingguIni || 0,
                prestasiMingguIni: 0,
                prestasiSdMingguIni: d.prestasiSdMingguIni || 0,
              }));

              const newWeek: ProjectProgressWeek = {
                mingguKe: nextWeekNum,
                periode: `${sFormatted} - ${eFormatted}`,
                bobotRencana: Math.min(100, (lastWeek?.bobotRencana || 0) + 2.5),
                bobotRealisasi: lastWeek?.bobotRealisasi || 0,
                deviasi: Math.round(((lastWeek?.bobotRealisasi || 0) - Math.min(100, (lastWeek?.bobotRencana || 0) + 2.5)) * 100) / 100,
                keterangan: `Pelaksanaan lanjutan pekerjaan fisik dan administrasi minggu ke-${nextWeekNum}`,
                itemPekerjaan: [],
                rencanaWaktuHK: nextWeekNum * 7,
                rencanaWaktuMinggu: nextWeekNum,
                waktuTerlaksanaHK: nextWeekNum * 7,
                waktuTerlaksanaMinggu: nextWeekNum,
                sisaWaktuHK: 0,
                sisaWaktuMinggu: 0,
                divisions: defaultDivs,
              };

              const updated = [...progressWeeks, newWeek];
              onUpdateWeeks(updated);
              setSelectedWeekNum(nextWeekNum);
              setSyncSuccessMsg(`Minggu ke-${nextWeekNum} berhasil ditambahkan! Total durasi sekarang ${updated.length} minggu.`);
              setTimeout(() => setSyncSuccessMsg(null), 4000);
            }}
            className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 transition cursor-pointer flex items-center gap-1"
            title="Tambah periode minggu berikutnya (hingga 30 minggu)"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-600" />
            <span>+ Tambah Minggu {progressWeeks.length + 1}</span>
          </button>

          {/* Delete Active Week Button */}
          {progressWeeks.length > 1 && (
            <button
              type="button"
              onClick={() => setConfirmDeleteWeekNum(selectedWeekNum)}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition cursor-pointer flex items-center gap-1 ml-auto"
              title={`Hapus Minggu Ke-${selectedWeekNum} dari jadwal kerja`}
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              <span>Hapus Minggu {selectedWeekNum}</span>
            </button>
          )}
        </div>

        {/* Confirmation Modal / Alert for Deleting Week */}
        {confirmDeleteWeekNum !== null && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-3 shadow-xs animate-fade-in">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-rose-100 text-rose-700 rounded-lg shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-rose-950">
                  Konfirmasi Hapus Minggu Ke-{confirmDeleteWeekNum}?
                </h4>
                <p className="text-[11px] text-rose-800 mt-0.5 leading-relaxed">
                  Minggu ke-{confirmDeleteWeekNum} (
                  <strong className="font-semibold">
                    {progressWeeks.find((w) => w.mingguKe === confirmDeleteWeekNum)?.periode || ''}
                  </strong>
                  ) beserta seluruh data transaksi dan dokumentasi fotonya akan dihapus. Nomor minggu setelahnya akan otomatis disesuaikan secara berurutan (Total durasi menjadi {progressWeeks.length - 1} minggu).
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-rose-200/80">
              <button
                type="button"
                onClick={() => setConfirmDeleteWeekNum(null)}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-lg text-xs font-medium cursor-pointer transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => handleDeleteWeek(confirmDeleteWeekNum)}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shadow-xs transition cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Ya, Hapus Minggu Ke-{confirmDeleteWeekNum}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Success alert message if any */}
      {syncSuccessMsg && (
        <div className="p-3 bg-emerald-100/90 border border-emerald-300 rounded-lg text-xs font-semibold text-emerald-950 flex items-center justify-between gap-2.5 shadow-xs animate-fade-in print:hidden">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{syncSuccessMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSyncSuccessMsg(null)}
            className="text-emerald-700 hover:text-emerald-900 p-0.5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Table: REKAPITULASI & PENCATATAN OTOMATIS TRANSAKSI (Div 4) */}
      <div className="bg-white rounded-2xl border border-slate-300 shadow-md ring-1 ring-slate-900/5 overflow-hidden">
        {/* Document Header Table Header */}
        <div className="p-6 text-center border-b border-slate-200 bg-slate-50/70 space-y-1">
          <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-900">
            REKAPITULASI LAPORAN PROGRES FISIK MINGGUAN
          </h3>
          <h4 className="text-xs font-bold uppercase text-slate-800">
            {school?.pekerjaan?.toUpperCase() || 'REVITALISASI SEKOLAH'}
          </h4>
          <h4 className="text-xs font-bold uppercase text-blue-900">
            {school?.namaSekolah || ''}
          </h4>
          <p className="text-[11px] font-semibold text-slate-600 uppercase">
            {school?.kabKota || ''} {school?.provinsi || ''} • PERIODE: {currentWeek.periode}
          </p>
        </div>

        {/* Integration and Roman Numeral Toolbar */}
        <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSyncFromRealSchoolData}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold shadow-xs transition cursor-pointer"
              title="Sinkronkan uraian pekerjaan dan bobot langsung dari menu Data Real Sekolah (RAB)"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Integrasikan Uraian dari Data Real Sekolah</span>
            </button>

            <button
              type="button"
              onClick={handleResetAutoRoman}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-medium transition cursor-pointer"
              title="Urutkan kembali seluruh nomor Romawi (I, II, III...) secara otomatis"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>Reset Romawi Otomatis</span>
            </button>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-600">
            <span className="italic">💡 Klik langsung pada angka Romawi (kolom ROMAWI) untuk mengedit manual.</span>
          </div>
        </div>

        {/* Edit Bobot Mode Banner */}
        {isEditingBobotMaster && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-950">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <div>
                <p className="font-bold">Mode Penyesuaian Bobot Pekerjaan Aktif</p>
                <p className="text-[11px] text-amber-800">
                  Anda dapat langsung mengubah persentase pada kolom <strong>BOBOT %</strong> di bawah sesuai dokumen RAB. Total otomatis dihitung dan maksimal 100,00%.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!isBobotBalanced && (
                <button
                  type="button"
                  onClick={handleAutoBalanceBobot}
                  className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-xs transition cursor-pointer"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>Seimbangkan Jadi 100,00%</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleResetBobotDefault}
                className="flex items-center gap-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 px-2.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer"
              >
                <RotateCcw className="w-3 h-3 text-slate-500" />
                <span>Reset Standar</span>
              </button>
              <button
                type="button"
                onClick={() => setIsEditingBobotMaster(false)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold shadow-xs transition cursor-pointer"
              >
                Kunci & Selesai
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#0070c0] text-white font-bold text-center text-[11px] border border-slate-800">
                <th className="py-3 px-2 border border-slate-700 w-16" title="Nomor Romawi (dapat diedit manual per baris)">
                  <div className="flex flex-col items-center justify-center">
                    <span>ROMAWI</span>
                    <span className="text-[8px] font-normal text-blue-200">(Edit Manual)</span>
                  </div>
                </th>
                <th className="py-3 px-4 border border-slate-700 text-left">URAIAN PEKERJAAN</th>
                <th className={`py-3 px-3 border border-slate-700 w-32 ${isEditingBobotMaster ? 'bg-[#005a9e]' : ''}`}>
                  <div className="flex flex-col items-center justify-center gap-0.5">
                    <div className="flex items-center gap-1">
                      <span>BOBOT %</span>
                      <button
                        type="button"
                        onClick={() => setIsEditingBobotMaster(!isEditingBobotMaster)}
                        title={isEditingBobotMaster ? 'Kunci nilai bobot' : 'Klik untuk menyesuaikan kolom Bobot %'}
                        className="p-0.5 text-amber-300 hover:text-white transition rounded cursor-pointer"
                      >
                        <Sliders className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <span className="text-[9px] font-normal text-blue-200">
                      {isEditingBobotMaster ? '(Bisa Diedit)' : '(Bisa Disesuaikan)'}
                    </span>
                  </div>
                </th>
                <th className="py-3 px-3 border border-slate-700 w-32 bg-[#005a9e]">
                  <div className="flex flex-col items-center justify-center gap-0.5">
                    <span>PRESTASI MINGGU LALU BOBOT %</span>
                    <span className="text-[9px] font-normal text-amber-200">(Bisa Disesuaikan)</span>
                  </div>
                </th>
                <th className="py-3 px-3 border border-slate-700 w-32 bg-blue-700">PRESTASI MINGGU INI BOBOT % (INPUT)</th>
                <th className="py-3 px-3 border border-slate-700 w-32">PRESTASI S.D MINGGU INI BOBOT %</th>
              </tr>
            </thead>
            <tbody className="text-slate-900">
              {/* Row: REKAPITULASI Header */}
              <tr className="bg-slate-100 font-extrabold border-b border-slate-300">
                <td className="py-2 px-3 border border-slate-300 text-center"></td>
                <td colSpan={5} className="py-2 px-4 border border-slate-300 tracking-wider">
                  R E K A P I T U L A S I :
                </td>
              </tr>

              {/* Category: PEKERJAAN FISIK */}
              <tr className="bg-slate-100 font-bold border-b border-slate-300 text-blue-950">
                <td className="py-2.5 px-3 border border-slate-300 text-center font-bold text-slate-700">A.</td>
                <td className="py-2.5 px-4 border border-slate-300">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-extrabold tracking-wide text-xs">PEKERJAAN FISIK</span>
                    <button
                      type="button"
                      onClick={() => {
                        setAddingCategory('FISIK');
                        setNewUraianText('');
                        setNewBobotText('0.00');
                      }}
                      className="inline-flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded-md text-[11px] font-semibold shadow-xs transition cursor-pointer"
                      title="Tambah uraian pekerjaan fisik baru secara manual"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tambah Pekerjaan Fisik</span>
                    </button>
                  </div>
                </td>
                <td colSpan={4} className="py-2.5 px-3 border border-slate-300 text-slate-500 text-[10px] text-right font-medium">
                  {fisikDivisions.length} Jenis Pekerjaan (I s/d {toRoman(fisikDivisions.length)})
                </td>
              </tr>

              {/* Fisik Items (Auto Roman Numerals I, II, III...) */}
              {fisikDivisions.map((item) => (
                <tr key={item.id} className="hover:bg-blue-50/40 transition border-b border-slate-200 group">
                  <td className="py-2 px-1.5 border border-slate-300 text-center font-bold text-slate-800 bg-slate-50/40 relative group/kode">
                    {editingKodeId === item.id ? (
                      <div className="flex items-center justify-center gap-1">
                        <input
                          type="text"
                          autoFocus
                          value={editingKodeText}
                          onChange={(e) => setEditingKodeText(e.target.value.toUpperCase())}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveKode(item.id);
                            if (e.key === 'Escape') setEditingKodeId(null);
                          }}
                          className="w-14 px-1 py-0.5 text-xs text-center font-bold uppercase bg-white border-2 border-blue-500 rounded focus:outline-hidden"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveKode(item.id)}
                          className="p-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded cursor-pointer"
                          title="Simpan nomor Romawi"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingKodeId(null)}
                          className="p-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded cursor-pointer"
                          title="Batal"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={() => {
                          setEditingKodeId(item.id);
                          setEditingKodeText(item.kode || '');
                        }}
                        className="flex items-center justify-center gap-1 cursor-pointer hover:text-blue-700 hover:bg-blue-100/60 rounded px-1.5 py-1 transition"
                        title="Klik untuk mengedit manual nomor Romawi ini"
                      >
                        <span>{item.kode}</span>
                        <Edit3 className="w-2.5 h-2.5 text-slate-400 opacity-0 group-hover/kode:opacity-100 transition" />
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-4 border border-slate-300 font-medium text-slate-900">
                    {editingUraianId === item.id ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          autoFocus
                          value={editingUraianText}
                          onChange={(e) => setEditingUraianText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRename(item.id);
                            if (e.key === 'Escape') setEditingUraianId(null);
                          }}
                          className="flex-1 px-2.5 py-1 text-xs uppercase font-medium bg-white border border-blue-400 rounded focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveRename(item.id)}
                          className="p-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded cursor-pointer"
                          title="Simpan perubahan nama"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingUraianId(null)}
                          className="p-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded cursor-pointer"
                          title="Batal"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <span className="break-words">{item.uraian}</span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingUraianId(item.id);
                              setEditingUraianText(item.uraian);
                            }}
                            className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded cursor-pointer transition"
                            title="Ubah teks uraian pekerjaan"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteDivision(item)}
                            className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer transition"
                            title="Hapus uraian pekerjaan ini (nomor Romawi akan berurutan kembali otomatis)"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </td>
                  <td className={`py-1.5 px-2 border border-slate-300 text-right ${isEditingBobotMaster ? 'bg-amber-50/60' : ''}`}>
                    {isEditingBobotMaster ? (
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          max="100"
                          value={item.bobotTotal}
                          onChange={(e) => handleBobotTotalChange(item.id, e.target.value)}
                          className="w-24 text-right font-mono font-bold text-amber-950 px-2 py-1 bg-white border border-amber-400 rounded focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                        />
                        <span className="text-[10px] text-amber-700 font-semibold">%</span>
                      </div>
                    ) : (
                      <div
                        onClick={() => setIsEditingBobotMaster(true)}
                        className="group flex items-center justify-end gap-1 cursor-pointer hover:text-amber-800 transition py-0.5"
                        title="Klik untuk menyesuaikan bobot pekerjaan ini"
                      >
                        <span className="font-mono font-semibold text-slate-800 group-hover:text-amber-800">
                          {formatProg(item.bobotTotal)}%
                        </span>
                        <Edit3 className="w-3 h-3 text-slate-400 group-hover:text-amber-600 opacity-0 group-hover:opacity-100 transition" />
                      </div>
                    )}
                  </td>
                  <td className="py-1.5 px-2 border border-slate-300 text-right bg-amber-50/40">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        max={item.bobotTotal}
                        value={item.prestasiMingguLalu === 0 ? '' : item.prestasiMingguLalu}
                        onChange={(e) => handlePrestasiMingguLaluChange(item.id, e.target.value)}
                        placeholder={decimalPrecision === 3 ? '0,000' : '0,00'}
                        className={`w-full text-right font-mono font-medium px-2 py-1 bg-white border rounded focus:ring-2 focus:ring-amber-500 focus:outline-hidden transition ${
                          item.isManualMingguLalu
                            ? 'border-amber-500 text-amber-950 font-bold bg-amber-50/60 shadow-xs'
                            : 'border-amber-300 text-slate-800'
                        }`}
                        title={
                          item.isManualMingguLalu
                            ? 'Nilai diinput manual. Klik tombol "Auto" di samping untuk kembali ke hitungan otomatis minggu sebelumnya.'
                            : selectedWeekNum > 1
                            ? 'Otomatis dihitung dari akumulasi s.d minggu sebelumnya. Anda dapat mengedit nilai ini secara manual jika diperlukan.'
                            : 'Prestasi minggu lalu (Bobot %)'
                        }
                      />
                      {item.isManualMingguLalu && (
                        <button
                          type="button"
                          onClick={() => handleResetManualMingguLalu(item.id)}
                          title="Kembalikan ke hitungan otomatis dari minggu sebelumnya"
                          className="text-[10px] font-bold text-amber-900 bg-amber-200 hover:bg-amber-300 active:scale-95 px-1.5 py-1 rounded cursor-pointer transition shadow-xs shrink-0"
                        >
                          Auto
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="py-1.5 px-2 border border-slate-300 text-right bg-blue-50/60">
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      max={item.bobotTotal}
                      value={item.prestasiMingguIni === 0 ? '' : item.prestasiMingguIni}
                      onChange={(e) => handlePrestasiChange(item.id, e.target.value)}
                      placeholder={decimalPrecision === 3 ? '0,000' : '0,00'}
                      className="w-full text-right font-mono font-bold text-blue-900 px-2 py-1 bg-white border border-blue-300 rounded focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    />
                  </td>
                  <td className="py-2 px-3 border border-slate-300 text-right font-mono font-bold text-slate-900">
                    {item.prestasiSdMingguIni > 0 ? formatProg(item.prestasiSdMingguIni) : ''}
                  </td>
                </tr>
              ))}

              {/* Inline Add Row for PEKERJAAN FISIK */}
              {addingCategory === 'FISIK' && (
                <tr className="bg-blue-50/90 border-2 border-blue-400 animate-fade-in">
                  <td className="py-2 px-3 border border-blue-300 text-center font-bold text-blue-700 bg-blue-100/50">
                    <span className="text-xs">{toRoman(fisikDivisions.length + 1)}</span>
                    <span className="block text-[8px] font-normal text-blue-500">(Auto)</span>
                  </td>
                  <td className="py-2 px-4 border border-blue-300">
                    <div className="flex flex-col gap-1">
                      <input
                        type="text"
                        autoFocus
                        placeholder="Ketik uraian pekerjaan fisik baru..."
                        value={newUraianText}
                        onChange={(e) => setNewUraianText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddDivision('FISIK');
                          if (e.key === 'Escape') setAddingCategory(null);
                        }}
                        className="w-full px-2.5 py-1 text-xs uppercase font-medium bg-white border border-blue-400 rounded focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
                      />
                      <span className="text-[10px] text-blue-700">
                        Nomor romawi otomatis: <strong>{toRoman(fisikDivisions.length + 1)}</strong> • Tekan Enter untuk simpan
                      </span>
                    </div>
                  </td>
                  <td className="py-2 px-2 border border-blue-300 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        placeholder="0.00"
                        value={newBobotText}
                        onChange={(e) => setNewBobotText(e.target.value)}
                        className="w-20 text-right font-mono font-bold text-blue-950 px-2 py-1 bg-white border border-blue-400 rounded focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
                      />
                      <span className="text-[10px] text-blue-700 font-semibold">%</span>
                    </div>
                  </td>
                  <td colSpan={3} className="py-2 px-3 border border-blue-300">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleAddDivision('FISIK')}
                        disabled={!newUraianText.trim()}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-xs transition cursor-pointer ${
                          newUraianText.trim() ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-300 cursor-not-allowed'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Simpan</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddingCategory(null)}
                        className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-medium cursor-pointer transition"
                      >
                        Batal
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {/* Category: RINCIAN BIAYA MANAJEMEN */}
              <tr className="bg-slate-100 font-bold border-b border-slate-300 text-indigo-950">
                <td className="py-2.5 px-3 border border-slate-300 text-center font-bold text-slate-700">B.</td>
                <td className="py-2.5 px-4 border border-slate-300">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-extrabold tracking-wide text-xs">RINCIAN BIAYA MANAJEMEN</span>
                    <button
                      type="button"
                      onClick={() => {
                        setAddingCategory('MANAJEMEN');
                        setNewUraianText('');
                        setNewBobotText('0.00');
                      }}
                      className="inline-flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded-md text-[11px] font-semibold shadow-xs transition cursor-pointer"
                      title="Tambah rincian biaya manajemen baru secara manual"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Tambah Biaya Manajemen</span>
                    </button>
                  </div>
                </td>
                <td colSpan={4} className="py-2.5 px-3 border border-slate-300 text-slate-500 text-[10px] text-right font-medium">
                  {manajemenDivisions.length} Jenis Biaya (I s/d {toRoman(manajemenDivisions.length)})
                </td>
              </tr>

              {/* Manajemen Items (Auto Roman Numerals I, II, III...) */}
              {manajemenDivisions.map((item) => (
                <tr key={item.id} className="hover:bg-indigo-50/40 transition border-b border-slate-200 group">
                  <td className="py-2 px-1.5 border border-slate-300 text-center font-bold text-slate-800 bg-slate-50/40 relative group/kode">
                    {editingKodeId === item.id ? (
                      <div className="flex items-center justify-center gap-1">
                        <input
                          type="text"
                          autoFocus
                          value={editingKodeText}
                          onChange={(e) => setEditingKodeText(e.target.value.toUpperCase())}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveKode(item.id);
                            if (e.key === 'Escape') setEditingKodeId(null);
                          }}
                          className="w-14 px-1 py-0.5 text-xs text-center font-bold uppercase bg-white border-2 border-indigo-500 rounded focus:outline-hidden"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveKode(item.id)}
                          className="p-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded cursor-pointer"
                          title="Simpan nomor Romawi"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingKodeId(null)}
                          className="p-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded cursor-pointer"
                          title="Batal"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div
                        onClick={() => {
                          setEditingKodeId(item.id);
                          setEditingKodeText(item.kode || '');
                        }}
                        className="flex items-center justify-center gap-1 cursor-pointer hover:text-indigo-700 hover:bg-indigo-100/60 rounded px-1.5 py-1 transition"
                        title="Klik untuk mengedit manual nomor Romawi ini"
                      >
                        <span>{item.kode}</span>
                        <Edit3 className="w-2.5 h-2.5 text-slate-400 opacity-0 group-hover/kode:opacity-100 transition" />
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-4 border border-slate-300 font-medium text-slate-900">
                    {editingUraianId === item.id ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          autoFocus
                          value={editingUraianText}
                          onChange={(e) => setEditingUraianText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRename(item.id);
                            if (e.key === 'Escape') setEditingUraianId(null);
                          }}
                          className="flex-1 px-2.5 py-1 text-xs uppercase font-medium bg-white border border-indigo-400 rounded focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveRename(item.id)}
                          className="p-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded cursor-pointer"
                          title="Simpan perubahan nama"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingUraianId(null)}
                          className="p-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded cursor-pointer"
                          title="Batal"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <span className="break-words">{item.uraian}</span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingUraianId(item.id);
                              setEditingUraianText(item.uraian);
                            }}
                            className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded cursor-pointer transition"
                            title="Ubah teks rincian biaya"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteDivision(item)}
                            className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer transition"
                            title="Hapus rincian biaya ini (nomor Romawi akan berurutan kembali otomatis)"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </td>
                  <td className={`py-1.5 px-2 border border-slate-300 text-right ${isEditingBobotMaster ? 'bg-amber-50/60' : ''}`}>
                    {isEditingBobotMaster ? (
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          max="100"
                          value={item.bobotTotal}
                          onChange={(e) => handleBobotTotalChange(item.id, e.target.value)}
                          className="w-24 text-right font-mono font-bold text-amber-950 px-2 py-1 bg-white border border-amber-400 rounded focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                        />
                        <span className="text-[10px] text-amber-700 font-semibold">%</span>
                      </div>
                    ) : (
                      <div
                        onClick={() => setIsEditingBobotMaster(true)}
                        className="group flex items-center justify-end gap-1 cursor-pointer hover:text-amber-800 transition py-0.5"
                        title="Klik untuk menyesuaikan bobot pekerjaan ini"
                      >
                        <span className="font-mono font-semibold text-slate-800 group-hover:text-amber-800">
                          {formatProg(item.bobotTotal)}%
                        </span>
                        <Edit3 className="w-3 h-3 text-slate-400 group-hover:text-amber-600 opacity-0 group-hover:opacity-100 transition" />
                      </div>
                    )}
                  </td>
                  <td className="py-1.5 px-2 border border-slate-300 text-right bg-amber-50/40">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        max={item.bobotTotal}
                        value={item.prestasiMingguLalu === 0 ? '' : item.prestasiMingguLalu}
                        onChange={(e) => handlePrestasiMingguLaluChange(item.id, e.target.value)}
                        placeholder={decimalPrecision === 3 ? '0,000' : '0,00'}
                        className={`w-full text-right font-mono font-medium px-2 py-1 bg-white border rounded focus:ring-2 focus:ring-amber-500 focus:outline-hidden transition ${
                          item.isManualMingguLalu
                            ? 'border-amber-500 text-amber-950 font-bold bg-amber-50/60 shadow-xs'
                            : 'border-amber-300 text-slate-800'
                        }`}
                        title={
                          item.isManualMingguLalu
                            ? 'Nilai diinput manual. Klik tombol "Auto" di samping untuk kembali ke hitungan otomatis minggu sebelumnya.'
                            : selectedWeekNum > 1
                            ? 'Otomatis dihitung dari akumulasi s.d minggu sebelumnya. Anda dapat mengedit nilai ini secara manual jika diperlukan.'
                            : 'Prestasi minggu lalu (Bobot %)'
                        }
                      />
                      {item.isManualMingguLalu && (
                        <button
                          type="button"
                          onClick={() => handleResetManualMingguLalu(item.id)}
                          title="Kembalikan ke hitungan otomatis dari minggu sebelumnya"
                          className="text-[10px] font-bold text-amber-900 bg-amber-200 hover:bg-amber-300 active:scale-95 px-1.5 py-1 rounded cursor-pointer transition shadow-xs shrink-0"
                        >
                          Auto
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="py-1.5 px-2 border border-slate-300 text-right bg-blue-50/60">
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      max={item.bobotTotal}
                      value={item.prestasiMingguIni === 0 ? '' : item.prestasiMingguIni}
                      onChange={(e) => handlePrestasiChange(item.id, e.target.value)}
                      placeholder={decimalPrecision === 3 ? '0,000' : '0,00'}
                      className="w-full text-right font-mono font-bold text-indigo-900 px-2 py-1 bg-white border border-indigo-300 rounded focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
                    />
                  </td>
                  <td className="py-2 px-3 border border-slate-300 text-right font-mono font-bold text-slate-900">
                    {item.prestasiSdMingguIni > 0 ? formatProg(item.prestasiSdMingguIni) : ''}
                  </td>
                </tr>
              ))}

              {/* Inline Add Row for RINCIAN BIAYA MANAJEMEN */}
              {addingCategory === 'MANAJEMEN' && (
                <tr className="bg-indigo-50/90 border-2 border-indigo-400 animate-fade-in">
                  <td className="py-2 px-3 border border-indigo-300 text-center font-bold text-indigo-700 bg-indigo-100/50">
                    <span className="text-xs">{toRoman(manajemenDivisions.length + 1)}</span>
                    <span className="block text-[8px] font-normal text-indigo-500">(Auto)</span>
                  </td>
                  <td className="py-2 px-4 border border-indigo-300">
                    <div className="flex flex-col gap-1">
                      <input
                        type="text"
                        autoFocus
                        placeholder="Ketik rincian biaya manajemen baru..."
                        value={newUraianText}
                        onChange={(e) => setNewUraianText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddDivision('MANAJEMEN');
                          if (e.key === 'Escape') setAddingCategory(null);
                        }}
                        className="w-full px-2.5 py-1 text-xs uppercase font-medium bg-white border border-indigo-400 rounded focus:ring-2 focus:ring-indigo-600 focus:outline-hidden"
                      />
                      <span className="text-[10px] text-indigo-700">
                        Nomor romawi otomatis: <strong>{toRoman(manajemenDivisions.length + 1)}</strong> • Tekan Enter untuk simpan
                      </span>
                    </div>
                  </td>
                  <td className="py-2 px-2 border border-indigo-300 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        placeholder="0.00"
                        value={newBobotText}
                        onChange={(e) => setNewBobotText(e.target.value)}
                        className="w-20 text-right font-mono font-bold text-indigo-950 px-2 py-1 bg-white border border-indigo-400 rounded focus:ring-2 focus:ring-indigo-600 focus:outline-hidden"
                      />
                      <span className="text-[10px] text-indigo-700 font-semibold">%</span>
                    </div>
                  </td>
                  <td colSpan={3} className="py-2 px-3 border border-indigo-300">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleAddDivision('MANAJEMEN')}
                        disabled={!newUraianText.trim()}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-xs transition cursor-pointer ${
                          newUraianText.trim() ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-slate-300 cursor-not-allowed'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Simpan</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddingCategory(null)}
                        className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-medium cursor-pointer transition"
                      >
                        Batal
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {/* TOTAL ROW - OTOMATIS TERHITUNG NAMUN TETAP MAKSIMAL DI 100,00% */}
              <tr className="bg-slate-100 font-black border-t-2 border-slate-400 text-slate-950">
                <td className="py-3 px-3 border border-slate-300 text-center"></td>
                <td className="py-3 px-4 border border-slate-300 text-right uppercase tracking-wider font-bold">
                  TOTAL
                </td>
                <td className="py-3 px-3 border border-slate-300 text-right font-mono bg-slate-50">
                  <div className="flex flex-col items-end">
                    <span className="text-sm font-extrabold text-blue-950">
                      {formatProg(cappedTotalBobot)}%
                    </span>
                    {isBobotBalanced ? (
                      <span className="text-[9px] font-bold text-emerald-700 mt-0.5">
                        ✓ Pas {decimalPrecision === 3 ? '100,000%' : '100,00%'}
                      </span>
                    ) : roundedRawTotalBobot > 100 ? (
                      <div className="flex flex-col items-end mt-0.5">
                        <span className="text-[9px] font-semibold text-amber-800 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded leading-tight">
                          Maksimal {decimalPrecision === 3 ? '100,000%' : '100,00%'} (Input: {formatProg(roundedRawTotalBobot)}%)
                        </span>
                        <button
                          type="button"
                          onClick={handleAutoBalanceBobot}
                          className="text-[9px] text-blue-700 hover:text-blue-900 underline font-semibold mt-0.5 cursor-pointer"
                        >
                          Seimbangkan ke 100%
                        </button>
                      </div>
                    ) : (
                      <span className="text-[9px] font-medium text-slate-500 mt-0.5">
                        (Sisa: {formatProg(100 - roundedRawTotalBobot)}%)
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-3 px-3 border border-slate-300 text-right font-mono text-slate-700 bg-amber-50/20">
                  <div className="flex flex-col items-end gap-1">
                    {isEditingTotalFooter ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step={decimalPrecision === 3 ? '0.001' : '0.01'}
                          min="0"
                          max="100"
                          value={
                            customTotalMingguLaluStr[selectedWeekNum] !== undefined
                              ? customTotalMingguLaluStr[selectedWeekNum]
                              : currentWeek.customTotalMingguLalu !== undefined
                              ? currentWeek.customTotalMingguLalu
                              : totalMingguLalu > 0 ? totalMingguLalu : ''
                          }
                          onChange={(e) => handleCustomTotalMingguLaluChange(e.target.value)}
                          placeholder={decimalPrecision === 3 ? '0,000' : '0,00'}
                          className="w-20 text-right font-mono font-bold text-amber-950 px-1.5 py-0.5 bg-white border border-amber-400 rounded focus:ring-1 focus:ring-amber-500 focus:outline-hidden text-xs"
                        />
                        <span className="text-[10px] text-amber-700 font-bold">%</span>
                      </div>
                    ) : (
                      <span className="font-extrabold">
                        {totalMingguLalu > 0 ? `${formatProg(totalMingguLalu)}%` : '-'}
                      </span>
                    )}
                    {currentWeek.customTotalMingguLalu !== undefined && (
                      <button
                        type="button"
                        onClick={handleResetTotalMingguLalu}
                        title="Kembalikan total Minggu Lalu ke hasil hitung otomatis tabel"
                        className="text-[9px] text-amber-700 hover:text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded cursor-pointer transition font-medium"
                      >
                        Reset Auto ({formatProg(rawTotalMingguLalu)}%)
                      </button>
                    )}
                  </div>
                </td>
                <td className="py-3 px-3 border border-slate-300 text-right font-mono text-blue-900 bg-blue-100/70 font-extrabold">
                  <div className="flex flex-col items-end gap-1">
                    {isEditingTotalFooter ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step={decimalPrecision === 3 ? '0.001' : '0.01'}
                          min="0"
                          max="100"
                          value={
                            customTotalMingguIniStr[selectedWeekNum] !== undefined
                              ? customTotalMingguIniStr[selectedWeekNum]
                              : currentWeek.customTotalMingguIni !== undefined
                              ? currentWeek.customTotalMingguIni
                              : totalMingguIni > 0 ? totalMingguIni : ''
                          }
                          onChange={(e) => handleCustomTotalMingguIniChange(e.target.value)}
                          placeholder={decimalPrecision === 3 ? '0,000' : '0,00'}
                          className="w-20 text-right font-mono font-bold text-blue-950 px-1.5 py-0.5 bg-white border border-blue-400 rounded focus:ring-1 focus:ring-blue-500 focus:outline-hidden text-xs"
                        />
                        <span className="text-[10px] text-blue-700 font-bold">%</span>
                      </div>
                    ) : (
                      <span className="font-extrabold text-blue-950">
                        {totalMingguIni > 0 ? `${formatProg(totalMingguIni)}%` : '-'}
                      </span>
                    )}
                    {currentWeek.customTotalMingguIni !== undefined && (
                      <button
                        type="button"
                        onClick={handleResetTotalMingguIni}
                        title="Kembalikan total Minggu Ini ke hasil hitung otomatis tabel"
                        className="text-[9px] text-blue-700 hover:text-blue-900 bg-blue-200/80 px-1.5 py-0.5 rounded cursor-pointer transition font-medium"
                      >
                        Reset Auto ({formatProg(rawTotalMingguIni)}%)
                      </button>
                    )}
                  </div>
                </td>
                <td className="py-3 px-3 border border-slate-300 text-right font-mono text-slate-950 bg-slate-200/80 font-black">
                  <div className="flex flex-col items-end gap-1">
                    {isEditingTotalFooter ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step={decimalPrecision === 3 ? '0.001' : '0.01'}
                          min="0"
                          max="100"
                          value={totalSdMingguIni > 0 ? totalSdMingguIni : ''}
                          onChange={(e) => handleCustomTotalSdMingguIniChange(e.target.value)}
                          placeholder={decimalPrecision === 3 ? '0,000' : '0,00'}
                          className="w-20 text-right font-mono font-black text-slate-950 px-1.5 py-0.5 bg-white border border-slate-500 rounded focus:ring-1 focus:ring-slate-700 focus:outline-hidden text-xs"
                        />
                        <span className="text-[10px] text-slate-700 font-bold">%</span>
                      </div>
                    ) : (
                      <span className="font-black text-slate-950">
                        {formatProg(totalSdMingguIni)}%
                      </span>
                    )}
                    {currentWeek.customTotalSdMingguIni !== undefined && (
                      <button
                        type="button"
                        onClick={handleResetTotalSdMingguIni}
                        title="Kembalikan total s.d Minggu Ini ke hitungan otomatis (Minggu Lalu + Minggu Ini)"
                        className="text-[9px] text-slate-700 hover:text-slate-900 bg-slate-300 px-1.5 py-0.5 rounded cursor-pointer transition font-medium"
                      >
                        Reset Auto ({formatProg(rawTotalSdMingguIni)}%)
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Bottom Status Table (Exact match to uploaded template bottom info) */}
        <div className="p-6 bg-slate-50 border-t border-slate-300 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Box 1: Keterangan (Prestasi Realisasi, Target & Deviasi) */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                <h5 className="font-bold text-slate-900 uppercase tracking-wide">
                  K E T E R A N G A N :
                </h5>
                <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
                  Realisasi & Target Dapat Disesuaikan Manual
                </span>
              </div>

              <div className="space-y-2.5 pt-0.5">
                {/* PRESTASI PELAKSANAAN (REALISASI) */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 py-1 px-2 rounded-lg bg-slate-50/80 border border-slate-200/60">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-slate-700 font-semibold uppercase text-[11px]">
                      PRESTASI PELAKSANAAN (REALISASI)
                    </span>
                    {Math.abs(activeRealisasi - totalSdMingguIni) > 0.001 && (
                      <button
                        type="button"
                        onClick={handleResetRealisasiToTable}
                        title={`Klik untuk menyamakan kembali dengan hitungan tabel (${formatProg(totalSdMingguIni)}%)`}
                        className="text-[10px] text-amber-700 hover:text-amber-900 bg-amber-100/80 hover:bg-amber-200 px-1.5 py-0.5 rounded cursor-pointer transition font-medium"
                      >
                        Reset ke Tabel ({formatProg(totalSdMingguIni)}%)
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1 self-end sm:self-auto">
                    <span className="font-mono text-slate-500 font-bold">:</span>
                    <div className="relative flex items-center">
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        max="100"
                        value={
                          customRealisasiStr[selectedWeekNum] !== undefined
                            ? customRealisasiStr[selectedWeekNum]
                            : String(activeRealisasi)
                        }
                        onChange={(e) => handleManualRealisasiChange(e.target.value.replace(',', '.'))}
                        title="Ubah manual persentase realisasi minggu ini jika diperlukan"
                        className="w-24 text-right font-mono font-bold text-slate-900 text-xs px-2 py-1 bg-white border border-blue-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-hidden shadow-2xs"
                      />
                      <span className="ml-1 font-mono font-bold text-slate-800 text-xs">%</span>
                    </div>
                  </div>
                </div>

                {/* PRESTASI YANG DIRENCANAKAN (TARGET) */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 py-1 px-2 rounded-lg bg-slate-50/80 border border-slate-200/60">
                  <span className="text-slate-700 font-semibold uppercase text-[11px]">
                    PRESTASI YANG DIRENCANAKAN (TARGET)
                  </span>
                  <div className="flex items-center gap-1 self-end sm:self-auto">
                    <span className="font-mono text-slate-500 font-bold">:</span>
                    <div className="relative flex items-center">
                      <input
                        type="number"
                        step="0.001"
                        min="0"
                        max="100"
                        value={
                          customTargetStr[selectedWeekNum] !== undefined
                            ? customTargetStr[selectedWeekNum]
                            : String(activeTarget)
                        }
                        onChange={(e) => handleManualTargetChange(e.target.value.replace(',', '.'))}
                        title="Ubah manual persentase target rencana minggu ini"
                        className="w-24 text-right font-mono font-bold text-slate-900 text-xs px-2 py-1 bg-white border border-indigo-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:outline-hidden shadow-2xs"
                      />
                      <span className="ml-1 font-mono font-bold text-slate-800 text-xs">%</span>
                    </div>
                  </div>
                </div>

                {/* LEBIH CEPAT DARI RENCANA / TERLAMBAT DARI RENCANA (OTOMATIS) */}
                <div
                  className={`flex items-center justify-between py-1.5 px-2 rounded-lg border transition ${
                    isFaster
                      ? 'bg-emerald-50/90 border-emerald-200 text-emerald-900'
                      : 'bg-rose-50/90 border-rose-200 text-rose-900'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold uppercase text-[11px]">
                      {isFaster ? 'LEBIH CEPAT DARI RENCANA' : 'TERLAMBAT DARI RENCANA'}
                    </span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                        isFaster
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : 'bg-rose-100 text-rose-800 border-rose-300'
                      }`}
                    >
                      Otomatis
                    </span>
                  </div>
                  <div className="flex items-center gap-1 font-mono font-black text-xs">
                    <span>:</span>
                    <span className="w-24 text-right">
                      {isFaster ? `+${formatProg(deviasi)}` : formatProg(deviasi)} %
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-2 text-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                <h5 className="font-bold text-slate-900 uppercase flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-600" />
                  <span>WAKTU PELAKSANAAN PEKERJAAN :</span>
                </h5>
                <button
                  type="button"
                  onClick={() => setIsEditingWaktu(!isEditingWaktu)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition cursor-pointer border ${
                    isEditingWaktu
                      ? 'bg-blue-600 text-white border-blue-700 shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                  }`}
                  title="Klik untuk mengedit Rencana, Waktu Terlaksana, dan Sisa Waktu Pekerjaan secara manual"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>{isEditingWaktu ? 'Tutup Edit' : 'Edit Waktu'}</span>
                </button>
              </div>

              {!isEditingWaktu ? (
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between items-center py-0.5">
                    <span className="text-slate-600">RENCANA WAKTU PELAKSANAAN</span>
                    <span className="font-mono font-bold text-slate-900">
                      : {currentWeek.rencanaWaktuHK ?? progressWeeks.length * 7} HK (
                      {currentWeek.rencanaWaktuMinggu ?? progressWeeks.length} Minggu)
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-0.5">
                    <span className="text-slate-600">WAKTU YANG SUDAH DILAKSANAKAN</span>
                    <span className="font-mono font-semibold text-slate-700">
                      : {currentWeek.waktuTerlaksanaHK ?? currentWeek.mingguKe * 7} HK
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-0.5 border-t border-slate-100 pt-1">
                    <span className="text-slate-600">SISA WAKTU PELAKSANAAN</span>
                    <span className="font-mono font-bold text-slate-900">
                      :{' '}
                      {currentWeek.sisaWaktuHK ??
                        Math.max(
                          0,
                          (currentWeek.rencanaWaktuHK ?? progressWeeks.length * 7) -
                            (currentWeek.waktuTerlaksanaHK ?? currentWeek.mingguKe * 7)
                        )}{' '}
                      HK
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-200 space-y-3 pt-2 animate-fade-in">
                  <p className="text-[11px] text-blue-900 font-medium">
                    Atur durasi hari kerja (HK) dan minggu untuk <strong>Minggu Ke-{currentWeek.mingguKe}</strong>:
                  </p>

                  <div className="space-y-2.5">
                    {/* Rencana Waktu */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center bg-white p-2 rounded-lg border border-slate-200">
                      <label className="text-[11px] font-bold text-slate-700">
                        RENCANA WAKTU:
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={1}
                          value={formRencanaHK}
                          onChange={(e) => setFormRencanaHK(parseInt(e.target.value, 10) || 0)}
                          className="w-20 px-2 py-1 bg-slate-50 border border-slate-300 rounded text-xs font-mono font-bold text-slate-900 focus:bg-white focus:ring-1 focus:ring-blue-500"
                        />
                        <span className="text-[11px] text-slate-600 font-semibold">HK</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={1}
                          value={formRencanaMinggu}
                          onChange={(e) => setFormRencanaMinggu(parseInt(e.target.value, 10) || 0)}
                          className="w-16 px-2 py-1 bg-slate-50 border border-slate-300 rounded text-xs font-mono font-bold text-slate-900 focus:bg-white focus:ring-1 focus:ring-blue-500"
                        />
                        <span className="text-[11px] text-slate-600 font-semibold">Minggu</span>
                      </div>
                    </div>

                    {/* Waktu Terlaksana */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center bg-white p-2 rounded-lg border border-slate-200">
                      <label className="text-[11px] font-bold text-slate-700">
                        SUDAH DILAKSANAKAN:
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          value={formTerlaksanaHK}
                          onChange={(e) => setFormTerlaksanaHK(parseInt(e.target.value, 10) || 0)}
                          className="w-20 px-2 py-1 bg-slate-50 border border-slate-300 rounded text-xs font-mono font-bold text-slate-900 focus:bg-white focus:ring-1 focus:ring-blue-500"
                        />
                        <span className="text-[11px] text-slate-600 font-semibold">HK</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          value={formTerlaksanaMinggu}
                          onChange={(e) => setFormTerlaksanaMinggu(parseInt(e.target.value, 10) || 0)}
                          className="w-16 px-2 py-1 bg-slate-50 border border-slate-300 rounded text-xs font-mono font-bold text-slate-900 focus:bg-white focus:ring-1 focus:ring-blue-500"
                        />
                        <span className="text-[11px] text-slate-600 font-semibold">Minggu</span>
                      </div>
                    </div>

                    {/* Sisa Waktu */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center bg-white p-2 rounded-lg border border-slate-200">
                      <div className="flex items-center justify-between sm:justify-start gap-1">
                        <label className="text-[11px] font-bold text-slate-700">
                          SISA WAKTU:
                        </label>
                        <button
                          type="button"
                          onClick={handleAutoCalcSisaWaktu}
                          className="text-[10px] text-blue-600 hover:text-blue-800 underline font-semibold cursor-pointer"
                          title="Hitung otomatis: Rencana dikurangi Terlaksana"
                        >
                          (⚡ Auto Hitung)
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          value={formSisaHK}
                          onChange={(e) => setFormSisaHK(parseInt(e.target.value, 10) || 0)}
                          className="w-20 px-2 py-1 bg-slate-50 border border-slate-300 rounded text-xs font-mono font-bold text-slate-900 focus:bg-white focus:ring-1 focus:ring-blue-500"
                        />
                        <span className="text-[11px] text-slate-600 font-semibold">HK</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          value={formSisaMinggu}
                          onChange={(e) => setFormSisaMinggu(parseInt(e.target.value, 10) || 0)}
                          className="w-16 px-2 py-1 bg-slate-50 border border-slate-300 rounded text-xs font-mono font-bold text-slate-900 focus:bg-white focus:ring-1 focus:ring-blue-500"
                        />
                        <span className="text-[11px] text-slate-600 font-semibold">Minggu</span>
                      </div>
                    </div>

                    {/* Apply to All Option */}
                    <div className="pt-1">
                      <label className="flex items-center gap-2 text-[11px] text-slate-700 cursor-pointer font-medium">
                        <input
                          type="checkbox"
                          checked={applyRencanaToAll}
                          onChange={(e) => setApplyRencanaToAll(e.target.checked)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>Terapkan target Rencana Waktu ({formRencanaHK} HK / {formRencanaMinggu} Minggu) ke seluruh periode minggu lainnya</span>
                      </label>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-blue-200">
                      <button
                        type="button"
                        onClick={handleResetWaktuToDefault}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-red-700 transition cursor-pointer"
                        title="Kembalikan waktu ke perhitungan otomatis standar 7 HK per minggu"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reset Standar (7 HK/Minggu)</span>
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setIsEditingWaktu(false)}
                          className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 rounded text-xs font-medium cursor-pointer"
                        >
                          Batal
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveWaktuPelaksanaan}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold shadow-xs transition cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Simpan Waktu Pelaksanaan</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Big Trigger & Auto-Sync Card */}
          <div className="p-5 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-xl text-white shadow-lg flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="space-y-1 text-left">
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-blue-500/30 text-blue-200 text-[11px] font-bold">
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                Otomatisasi LPJ Terintegrasi Real-Time
              </div>
              <h4 className="text-sm sm:text-base font-bold text-white">
                Sinkronkan Minggu {currentWeek.mingguKe} ke Semua Dokumen LPJ
              </h4>
              <p className="text-xs text-slate-300">
                Menghasilkan otomatis: Absensi 7 Hari, Kwitansi Upah UK, Kwitansi Bahan Toko, SPB, Bon Toko, BKU, BKT, BKB, dan Pajak.
              </p>
            </div>

            <button
              onClick={handleApplyAndSync}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6 py-3 rounded-xl text-xs sm:text-sm shadow-lg shadow-emerald-600/30 transition flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Terapkan & Buat Dokumen Otomatis</span>
            </button>
          </div>
        </div>

        {/* PENCATATAN OTOMATIS PECAHAN TRANSAKSI DARI BOBOT MINGGUAN (TERINTEGRASI DI DALAM KARTU LAPORAN MINGGUAN & BOBOT) */}
        <div id="rekap-transaksi-mingguan" className="border-t-2 border-slate-300 bg-white space-y-0 scroll-mt-6">
        {/* Anti-Negative Balance Alert Banner */}
        {isExpenditureImbalanced && onCalibrateToRealProgress && (
          <div className="p-4 bg-rose-50 border-b border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-rose-900">
                  ⚠️ Akumulasi Belanja ({formatRupiah(totalKwitansiExpenditure)}) Melebihi Progres Nyata ({currentTotalRealizedBobot.toFixed(1)}%)
                </h4>
                <p className="text-xs text-rose-700 mt-0.5">
                  Terdeteksi kwitansi belanja bahan atau upah yang terakumulasi melebihi bobot fisik nyata saat ini, sehingga berpotensi membuat saldo kas BKU minus. Klik tombol untuk mengalibrasi ulang pengeluaran bertahap dan upah borongan mingguan.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onCalibrateToRealProgress}
              className="shrink-0 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-md transition cursor-pointer flex items-center gap-1.5"
            >
              <Wand2 className="w-4 h-4 text-amber-200" />
              <span>⚡ Kalibrasi Belanja Sekarang</span>
            </button>
          </div>
        )}

        {/* Section Header */}
        <div className="p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                <Receipt className="w-3 h-3" />
                Pencatatan Otomatis & SPJ Kas
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Tgl Mulai: {weekResolved.startDateFormatted}
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[10px] font-bold flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Upah, Perencana, Pengawas & Adm: Akhir Minggu ({weekResolved.endDateFormatted})
              </span>
            </div>
            <h3 className="text-base font-bold flex items-center gap-2 text-white">
              <span>Hasil Pecahan Transaksi Otomatis Minggu Ke-{selectedWeekNum}</span>
              <span className="text-xs font-semibold text-slate-300 font-mono">
                ({weekResolved.startDateFormatted} s.d {weekResolved.endDateFormatted})
              </span>
            </h3>
            <p className="text-xs text-slate-300 max-w-3xl">
              Pencatatan otomatis memecah dari hasil inputan Laporan Mingguan & Bobot menjadi kwitansi pembelian material toko harian, upah kerja fisik, dan kas operasional. Anda juga dapat melakukan <strong>input manual, edit, dan hapus</strong> transaksi secara langsung.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleOpenAddTx}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow-md shadow-blue-600/30 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>+ Input Transaksi Manual</span>
            </button>

            <button
              type="button"
              onClick={handleApplyAndSync}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow-md shadow-emerald-600/30 transition cursor-pointer"
              title="Pecah dan sinkronkan otomatis bobot minggu ini ke kwitansi, SPB, BKU, BKT, dan BKB"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Pecah Otomatis dari Bobot</span>
            </button>

            {onAutoGenerateAllWeeks && (
              <button
                type="button"
                onClick={onAutoGenerateAllWeeks}
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-2 rounded-xl text-xs font-semibold transition cursor-pointer"
                title="Pecah otomatis seluruh minggu yang aktif sekaligus"
              >
                <Layers className="w-3.5 h-3.5 text-blue-400" />
                <span>Pecah Semua Minggu</span>
              </button>
            )}

            {onCalibrateToRealProgress && (
              <button
                type="button"
                onClick={onCalibrateToRealProgress}
                className="flex items-center gap-1.5 bg-gradient-to-r from-teal-600 to-indigo-600 hover:from-teal-700 hover:to-indigo-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold shadow-md shadow-indigo-600/30 transition cursor-pointer"
                title="Kalibrasi belanja bahan & upah borongan mingguan agar sinkron murni dengan progres fisik riil (cegah saldo minus)"
              >
                <Wand2 className="w-4 h-4 text-amber-300" />
                <span>⚡ Kalibrasi Belanja Progres ({formatNumber(currentTotalRealizedBobot || totalSdMingguIni, 1)}%)</span>
              </button>
            )}
          </div>
        </div>

        {/* Metric Highlights */}
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-slate-200 bg-slate-50/70 border-b border-slate-200 text-xs">
          <div className="p-3.5 space-y-0.5">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Prestasi Bobot Minggu Ini
            </span>
            <p className="text-base font-extrabold text-blue-900 font-mono">
              {formatNumber(currentWeek.bobotRealisasi || 0, 2)}%
            </p>
          </div>

          <div className="p-3.5 space-y-0.5">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Total Pengeluaran Minggu Ini
            </span>
            <p className="text-base font-extrabold text-rose-700 font-mono">
              {formatRupiah(totalPengeluaranWeek)}
            </p>
          </div>

          <div className="p-3.5 space-y-0.5">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Penerimaan / Kas Masuk
            </span>
            <p className="text-base font-extrabold text-emerald-700 font-mono">
              {formatRupiah(totalPenerimaanWeek)}
            </p>
          </div>

          <div className="p-3.5 space-y-0.5">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
              Total Transaksi Tercatat
            </span>
            <p className="text-base font-extrabold text-slate-900 font-mono">
              {currentWeekTransactions.length} Transaksi
            </p>
          </div>
        </div>

        {/* Date Invariant Notice Bar */}
        <div className="bg-amber-50/90 border-b border-amber-200 px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-amber-950">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span>
              <strong>Ketentuan Pembayaran & Tanggal:</strong> Tanggal mulai transaksi kas tidak boleh kurang dari <strong>{weekResolved.startDateFormatted}</strong>. Pembayaran <strong>upah tukang, konsultan perencana, pengawas, dan administrasi</strong> dibayarkan setiap <strong>tanggal akhir minggu ({weekResolved.endDateFormatted})</strong>.
            </span>
          </div>
          <span className="text-amber-800 font-semibold text-[10px] bg-amber-100 px-2 py-0.5 rounded border border-amber-300 shrink-0">
            Terproteksi Otomatis
          </span>
        </div>

        {/* Transactions Table */}
        <div className="overflow-x-auto">
          {currentWeekTransactions.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                <Receipt className="w-6 h-6" />
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h4 className="text-sm font-bold text-slate-800">
                  Belum Ada Transaksi Pecahan Untuk Minggu Ke-{selectedWeekNum}
                </h4>
                <p className="text-xs text-slate-500">
                  Gunakan tombol <strong>"Pecah Otomatis dari Bobot"</strong> untuk menghasilkan kwitansi upah & material secara otomatis sesuai input bobot fisik ({formatNumber(currentWeek.bobotRealisasi || 0, 2)}%), atau klik <strong>"+ Input Transaksi Manual"</strong>.
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleApplyAndSync}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Pecah Otomatis dari Bobot Minggu {selectedWeekNum}</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenAddTx}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Input Manual</span>
                </button>
              </div>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 px-3 text-center w-10">No</th>
                  <th className="py-2.5 px-3 w-28">Tanggal</th>
                  <th className="py-2.5 px-3 w-32">No. Bukti</th>
                  <th className="py-2.5 px-3 w-24">Jenis</th>
                  <th className="py-2.5 px-3 w-28">Kategori</th>
                  <th className="py-2.5 px-3">Uraian Transaksi</th>
                  <th className="py-2.5 px-3 text-right w-36">Nominal (Rp)</th>
                  <th className="py-2.5 px-3 text-center w-28">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {currentWeekTransactions.map((tx, idx) => {
                  const isStartDate = tx.tanggal === weekResolved.startDateSlash || tx.tanggalObj === weekResolved.startDate;
                  const isEndDate = tx.tanggal === weekResolved.endDateSlash || tx.tanggalObj === weekResolved.endDate;
                  const isUpahHonorAdm = /upah|tukang|pekerja|perencana|pengawas|administrasi|pengelolaan/i.test(tx.uraian) || /uk\/|kons-|adm\//i.test(tx.noBukti || '');

                  return (
                    <tr key={tx.id || idx} className="hover:bg-slate-50/80 transition group">
                      <td className="py-2.5 px-3 text-center text-slate-500 font-mono">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-mono font-medium text-slate-900 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <span>{tx.tanggal}</span>
                          {isStartDate && (
                            <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1 rounded" title="Tanggal Mulai Minggu Ini">
                              Mulai
                            </span>
                          )}
                          {isEndDate && (
                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                                isUpahHonorAdm
                                  ? 'bg-purple-100 text-purple-900 border-purple-300'
                                  : 'bg-slate-100 text-slate-700 border-slate-300'
                              }`}
                              title={isUpahHonorAdm ? "Dibayarkan pada Tanggal Akhir Minggu Sesuai Aturan" : "Tanggal Akhir Minggu"}
                            >
                              Akhir M{selectedWeekNum}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-blue-900 whitespace-nowrap">
                        {tx.noBukti}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            tx.jenis === 'PENERIMAAN'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-rose-100 text-rose-800 border border-rose-200'
                          }`}
                        >
                          {tx.jenis}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                        <span className="text-[11px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-medium">
                          {tx.kategoriBiaya || (tx.uraian.toLowerCase().includes('upah') ? 'Upah Tukang' : 'Material')}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-800 font-medium leading-relaxed max-w-md">
                        {tx.uraian}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold whitespace-nowrap">
                        <span className={tx.jenis === 'PENERIMAAN' ? 'text-emerald-700' : 'text-slate-900'}>
                          {formatRupiah(tx.pengeluaran || tx.penerimaan)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEditTx(tx)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition cursor-pointer shadow-2xs"
                            title="Edit data transaksi ini"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteTx(tx)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition cursor-pointer shadow-2xs"
                            title="Hapus transaksi ini dari pembukuan"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Hapus</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100/90 border-t-2 border-slate-300 font-bold text-slate-900">
                  <td colSpan={6} className="py-2.5 px-3 text-right">
                    Total Pengeluaran Minggu Ke-{selectedWeekNum}:
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-rose-700">
                    {formatRupiah(totalPengeluaranWeek)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
        </div>
      </div>

      {/* DOKUMENTASI FOTO PROGRES MINGGUAN */}
      <WeeklyPhotoDocumentation
        week={currentWeek}
        school={school}
        onUpdatePhotos={handleUpdatePhotosForCurrentWeek}
        onOpenPrintModal={onOpenPrintModal}
      />

      {/* Modal Input & Edit Transaksi Manual Minggu Ini */}
      {isTxModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in backdrop-blur-2xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-blue-100 text-blue-700 rounded-xl">
                  {editingTx ? <Edit3 className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingTx ? `Edit Transaksi Minggu Ke-${selectedWeekNum}` : `Input Transaksi Manual Minggu Ke-${selectedWeekNum}`}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Tersinkronisasi langsung ke BKU, Kwitansi, SPB, dan Buku Kas
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTxModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {txFormError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <p className="font-semibold">{txFormError}</p>
              </div>
            )}

            <form onSubmit={handleSaveTx} className="space-y-3.5 text-xs">
              {/* Preset Cepat Tanggal & Kategori */}
              <div className="space-y-1 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">
                  Pilih Preset Cepat Transaksi Minggu Ke-{selectedWeekNum}:
                </span>
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setTxFormData({
                        ...txFormData,
                        tanggal: weekResolved.endDate,
                        jenis: 'PENGELUARAN',
                        kategoriBiaya: 'Konstruksi',
                        noBukti: `UK/${selectedWeekNum < 10 ? '0' + selectedWeekNum : selectedWeekNum}/${schoolYear}`,
                        uraian: `Pembayaran Lunas Upah Tukang & Pekerja Minggu Ke-${selectedWeekNum}`,
                      });
                    }}
                    className="px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
                    title="Dibayarkan setiap tanggal akhir minggu"
                  >
                    <span>👷 Upah Tukang (Akhir Minggu)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTxFormData({
                        ...txFormData,
                        tanggal: weekResolved.endDate,
                        jenis: 'PENGELUARAN',
                        kategoriBiaya: 'Perencanaan_Pengelolaan',
                        noBukti: `KONS-P/${selectedWeekNum < 10 ? '0' + selectedWeekNum : selectedWeekNum}/${schoolYear}`,
                        uraian: `Pembayaran Honorarium Jasa Perencana Teknis Minggu Ke-${selectedWeekNum}`,
                      });
                    }}
                    className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
                    title="Dibayarkan setiap tanggal akhir minggu"
                  >
                    <span>📐 Perencana (Akhir Minggu)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTxFormData({
                        ...txFormData,
                        tanggal: weekResolved.endDate,
                        jenis: 'PENGELUARAN',
                        kategoriBiaya: 'Perencanaan_Pengelolaan',
                        noBukti: `KONS-W/${selectedWeekNum < 10 ? '0' + selectedWeekNum : selectedWeekNum}/${schoolYear}`,
                        uraian: `Pembayaran Honorarium Jasa Pengawas Lapangan Minggu Ke-${selectedWeekNum}`,
                      });
                    }}
                    className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
                    title="Dibayarkan setiap tanggal akhir minggu"
                  >
                    <span>🔍 Pengawas (Akhir Minggu)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTxFormData({
                        ...txFormData,
                        tanggal: weekResolved.endDate,
                        jenis: 'PENGELUARAN',
                        kategoriBiaya: 'Perencanaan_Pengelolaan',
                        noBukti: `ADM/${selectedWeekNum < 10 ? '0' + selectedWeekNum : selectedWeekNum}/${schoolYear}`,
                        uraian: `Pembayaran Biaya Pengelolaan Administrasi LPJ Minggu Ke-${selectedWeekNum}`,
                      });
                    }}
                    className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
                    title="Dibayarkan setiap tanggal akhir minggu"
                  >
                    <span>📑 Administrasi (Akhir Minggu)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTxFormData({
                        ...txFormData,
                        tanggal: weekResolved.startDate,
                        jenis: 'PENGELUARAN',
                        kategoriBiaya: 'Konstruksi',
                        noBukti: `M${selectedWeekNum}-01/${schoolYear}`,
                        uraian: `Belanja Material & Bahan Toko Minggu Ke-${selectedWeekNum}`,
                      });
                    }}
                    className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
                    title="Belanja material harian mulai dari awal minggu"
                  >
                    <span>🧱 Belanja Toko (Mulai Minggu)</span>
                  </button>
                </div>
              </div>

              {/* Tanggal with Minimum Date Protection */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-700 block">
                    Tanggal Transaksi <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setTxFormData({ ...txFormData, tanggal: weekResolved.startDate })}
                      className="text-[10px] text-blue-700 hover:underline font-bold cursor-pointer"
                    >
                      Set Awal ({weekResolved.startDateFormatted})
                    </button>
                    <span className="text-slate-300">•</span>
                    <button
                      type="button"
                      onClick={() => setTxFormData({ ...txFormData, tanggal: weekResolved.endDate })}
                      className="text-[10px] text-purple-700 hover:underline font-bold cursor-pointer"
                    >
                      Set Akhir ({weekResolved.endDateFormatted})
                    </button>
                  </div>
                </div>
                <input
                  type="date"
                  min={weekResolved.startDate}
                  value={txFormData.tanggal}
                  onChange={(e) => setTxFormData({ ...txFormData, tanggal: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  required
                />
                <div className="text-[11px] text-slate-700 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 mt-1 space-y-0.5">
                  <p className="flex items-center gap-1 text-amber-800 font-semibold">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>Tanggal minimal: <strong>{weekResolved.startDateFormatted}</strong>.</span>
                  </p>
                  <p className="flex items-center gap-1 text-purple-800 font-semibold">
                    <Calendar className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                    <span>Upah tukang, perencana, pengawas, dan administrasi dibayarkan pada <strong>tanggal akhir minggu ({weekResolved.endDateFormatted})</strong>.</span>
                  </p>
                </div>
              </div>

              {/* Jenis Transaksi */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 block">Jenis Transaksi</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTxFormData({ ...txFormData, jenis: 'PENGELUARAN' })}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      txFormData.jenis === 'PENGELUARAN'
                        ? 'bg-rose-50 border-rose-500 text-rose-800'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span>🔴 Pengeluaran (Belanja / Kas Keluar)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTxFormData({ ...txFormData, jenis: 'PENERIMAAN' })}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      txFormData.jenis === 'PENERIMAAN'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span>🟢 Penerimaan (Kas Masuk / Bank)</span>
                  </button>
                </div>
              </div>

              {/* No Bukti & Kategori */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block">No. Bukti / Kuitansi</label>
                  <input
                    type="text"
                    value={txFormData.noBukti}
                    onChange={(e) => setTxFormData({ ...txFormData, noBukti: e.target.value })}
                    placeholder="misal: M1-01/2026"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block">Kategori Biaya</label>
                  <select
                    value={txFormData.kategoriBiaya}
                    onChange={(e) => setTxFormData({ ...txFormData, kategoriBiaya: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden bg-white"
                  >
                    <option value="Konstruksi">Pekerjaan Fisik Konstruksi</option>
                    <option value="Material">Pembelian Bahan Bangunan</option>
                    <option value="Upah">Upah Tukang & Pekerja</option>
                    <option value="Perabot">Perabot & Mebeler</option>
                    <option value="Operasional">Persiapan & Operasional</option>
                  </select>
                </div>
              </div>

              {/* Uraian */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 block">
                  Uraian Transaksi <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={txFormData.uraian}
                  onChange={(e) => setTxFormData({ ...txFormData, uraian: e.target.value })}
                  placeholder="Keterangan lengkap transaksi..."
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  required
                />
              </div>

              {/* Nominal */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 block">
                  Nominal Transaksi (Rp) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400">Rp</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={txFormData.nominal || ''}
                    onChange={(e) => setTxFormData({ ...txFormData, nominal: parseFloat(e.target.value) || 0 })}
                    placeholder="0"
                    className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-xl font-mono text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    required
                  />
                </div>
                {txFormData.nominal > 0 && (
                  <p className="text-[11px] font-mono font-bold text-blue-700 pt-0.5">
                    Preview: {formatRupiah(txFormData.nominal)}
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsTxModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl font-semibold transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingTx ? 'Simpan Perubahan' : 'Tambahkan Transaksi'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Deleting Transaction */}
      {confirmDeleteTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in backdrop-blur-2xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-100 text-red-600 rounded-full flex-shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Hapus Transaksi Ini?
                </h3>
                <p className="text-xs text-slate-500">
                  Transaksi akan dihapus dari BKU, Buku Pembantu Kas, dan SPJ.
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1.5 font-sans">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">No. Bukti:</span>
                <span className="font-mono font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  {confirmDeleteTx.noBukti}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Tanggal:</span>
                <span className="font-mono font-semibold text-slate-800">{confirmDeleteTx.tanggal}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Nominal:</span>
                <span className="font-mono font-extrabold text-rose-700">
                  {formatRupiah(confirmDeleteTx.pengeluaran || confirmDeleteTx.penerimaan)}
                </span>
              </div>
              <div className="pt-1 border-t border-slate-200">
                <p className="text-slate-700 font-medium line-clamp-2">{confirmDeleteTx.uraian}</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteTx(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteTx}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Ya, Hapus Transaksi</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Deleting Division Item */}
      {confirmDeleteDivision && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in backdrop-blur-2xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-100 text-red-600 rounded-full flex-shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Hapus Uraian Pekerjaan?
                </h3>
                <p className="text-xs text-slate-500">
                  Uraian ini akan dihapus dari seluruh 14 minggu laporan.
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-medium">Uraian Pekerjaan:</span>
                <span className="font-bold text-slate-700 bg-slate-200/70 px-2 py-0.5 rounded text-[11px]">
                  Nomor {confirmDeleteDivision.kode}
                </span>
              </div>
              <p className="font-extrabold text-slate-900 text-sm">
                {confirmDeleteDivision.uraian}
              </p>
              <div className="flex items-center justify-between text-[11px] text-slate-600 pt-1 border-t border-slate-200">
                <span>Kategori: <strong>{confirmDeleteDivision.kategori === 'FISIK' ? 'Pekerjaan Fisik' : 'Rincian Biaya Manajemen'}</strong></span>
                <span>Bobot: <strong>{formatNumber(confirmDeleteDivision.bobotTotal, 2, 2)}%</strong></span>
              </div>
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-900 space-y-1">
              <p className="font-bold flex items-center gap-1.5 text-blue-950">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                Penomoran Romawi Otomatis
              </p>
              <p className="text-blue-800 leading-relaxed">
                Setelah dihapus, seluruh nomor Romawi (I, II, III...) untuk pekerjaan lainnya akan otomatis diurutkan kembali tanpa celah. Total bobot otomatis dihitung ulang.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteDivision(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => handleDeleteDivision(confirmDeleteDivision.id)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Ya, Hapus Sekarang</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Excel Upload Preview & Confirmation Modal */}
      {uploadPreviewData && (
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
                onClick={() => setUploadPreviewData(null)}
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
                onClick={() => setUploadPreviewData(null)}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer transition"
              >
                Batal
              </button>

              <button
                type="button"
                onClick={handleConfirmApplyExcelData}
                className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold shadow-md transition hover:shadow-lg cursor-pointer flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                <span>✓ Terapkan Data Excel ke Seluruh Jadwal</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
