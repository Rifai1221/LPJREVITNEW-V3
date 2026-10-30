import React, { useState, useMemo, useCallback } from 'react';
import {
  Users,
  Printer,
  Calendar,
  Plus,
  Trash2,
  CheckCircle2,
  UserPlus,
  DollarSign,
  X,
  Sparkles,
  Edit2,
  Search,
  HardHat,
  UserCheck,
  Building2,
  SlidersHorizontal,
  Scale,
  Zap,
  RefreshCw,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { WeeklyWageReport, WorkerItem, SchoolMasterData } from '../types';
import { formatRupiah, formatNumber } from '../utils/formatters';
import { getAhspWageRatesMap, getAhspWageRateForRole } from '../utils/divisionHelper';
import { getBalancedBoronganAttendance } from '../utils/boronganHelper';
import { useCan } from '../hooks/useCan';

interface WageManagerProps {
  wageReports: WeeklyWageReport[];
  workers: WorkerItem[];
  school: SchoolMasterData;
  realSchoolData?: any;
  divisions?: any[];
  progressWeeks?: any[];
  kwitansiList?: any[];
  onUpdateWageReports: (reports: WeeklyWageReport[]) => void;
  onUpdateWorkers: (workers: WorkerItem[]) => void;
  onUpdateKwitansiList?: (list: any[]) => void;
  onOpenPrintModal: (weekNum?: number, mode?: string) => void;
}

export const WageManager: React.FC<WageManagerProps> = ({
  wageReports,
  workers,
  school,
  realSchoolData,
  divisions,
  progressWeeks,
  kwitansiList,
  onUpdateWageReports,
  onUpdateWorkers,
  onUpdateKwitansiList,
  onOpenPrintModal,
}) => {
  const { can } = useCan();
  const canEditWages = can('edit:wages');
  const [selectedWeekNum, setSelectedWeekNum] = useState<number>(1);
  const [activeTab, setActiveTab] = useState<'absensi' | 'borongan' | 'master'>('absensi');
  const [masterFilter, setMasterFilter] = useState<'ALL' | 'HARIAN' | 'BORONGAN'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddingWorker, setIsAddingWorker] = useState(false);
  const [editingWorker, setEditingWorker] = useState<WorkerItem | null>(null);

  // Borongan form states
  const [boronganType, setBoronganType] = useState<'MINGGUAN' | 'BULANAN' | 'RENTANG_WAKTU'>('MINGGUAN');
  const [boronganUraian, setBoronganUraian] = useState<string>('');
  const [boronganPenerima, setBoronganPenerima] = useState<string>('Budiman');
  const [boronganJabatan, setBoronganJabatan] = useState<string>('Kepala Pelaksana / Mandor');

  // Form states for adding worker
  const [roleOption, setRoleOption] = useState<string>('P');
  const [customRoleName, setCustomRoleName] = useState('');
  const [autoGenMsg, setAutoGenMsg] = useState<string | null>(null);

  // Dynamic AHSP wage map from RealSchoolData (Menu Data Real Sekolah Bagian 3: AHSP)
  const ahspWageMap = useMemo(() => {
    return getAhspWageRatesMap(realSchoolData?.ahspList);
  }, [realSchoolData]);

  // Standard construction roles bound dynamically to AHSP rates
  const STANDARD_AHSP_ROLES = useMemo(
    () => [
      { code: 'KT', label: 'Kepala Tukang', upah: getAhspWageRateForRole('KT', 'Kepala Tukang', ahspWageMap, 200000) },
      { code: 'T_BATU', label: 'Tukang Batu', upah: getAhspWageRateForRole('T_BATU', 'Tukang Batu', ahspWageMap, 150000) },
      { code: 'T_KAYU', label: 'Tukang Kayu', upah: getAhspWageRateForRole('T_KAYU', 'Tukang Kayu', ahspWageMap, 183834) },
      { code: 'T_CAT', label: 'Tukang Cat', upah: getAhspWageRateForRole('T_CAT', 'Tukang Cat', ahspWageMap, 183834) },
      { code: 'T_BESI', label: 'Tukang Besi / Baja', upah: getAhspWageRateForRole('T_BESI', 'Tukang Besi', ahspWageMap, 160000) },
      { code: 'T_PIPA', label: 'Tukang Pipa / Plambing', upah: getAhspWageRateForRole('T_PIPA', 'Tukang Pipa', ahspWageMap, 150000) },
      { code: 'T_LISTRIK', label: 'Tukang Listrik', upah: getAhspWageRateForRole('T_LISTRIK', 'Tukang Listrik', ahspWageMap, 160000) },
      { code: 'T_GALI', label: 'Tukang Gali', upah: getAhspWageRateForRole('T_GALI', 'Tukang Gali', ahspWageMap, 150000) },
      { code: 'MANDOR', label: 'Mandor Proyek', upah: getAhspWageRateForRole('MANDOR', 'Mandor', ahspWageMap, 180000) },
      { code: 'P', label: 'Pekerja Lapangan', upah: getAhspWageRateForRole('P', 'Pekerja', ahspWageMap, 174748) },
    ],
    [ahspWageMap]
  );

  const [newWorker, setNewWorker] = useState<Partial<WorkerItem>>({
    nama: '',
    jenisKelamin: 'L',
    domisili: 'Dalam Desa',
    peran: 'P',
    peranLabel: 'Pekerja',
    upahHarian: getAhspWageRateForRole('P', 'Pekerja', ahspWageMap, 174748),
  });

  // Edit form state
  const [editRoleOption, setEditRoleOption] = useState<string>('P');
  const [editCustomRoleName, setEditCustomRoleName] = useState('');

  // Helper to auto-generate missing specialized worker roles
  const handleAutoGenerateMissingRoles = () => {
    const existingLabels = new Set(workers.map((w) => (w.peranLabel || w.peran).toLowerCase()));
    const missingToAdd: WorkerItem[] = [];

    STANDARD_AHSP_ROLES.forEach((role, idx) => {
      if (!existingLabels.has(role.label.toLowerCase()) && !existingLabels.has(role.code.toLowerCase())) {
        const exactRate = getAhspWageRateForRole(role.code, role.label, ahspWageMap, role.upah);
        missingToAdd.push({
          id: `w-auto-${Date.now()}-${idx}`,
          nama: `${role.label} (Reguler)`,
          jenisKelamin: 'L',
          domisili: 'Dalam Desa',
          peran: role.code,
          peranLabel: role.label,
          upahHarian: exactRate,
        });
      }
    });

    if (missingToAdd.length === 0) {
      setAutoGenMsg('Semua jenis tenaga kerja AHSP (Tukang Kayu, Cat, Batu, Listrik, Pipa, Gali, Pekerja) sudah tersedia lengkap!');
      setTimeout(() => setAutoGenMsg(null), 4000);
      return;
    }

    const updatedWorkerList = [...workers, ...missingToAdd];
    onUpdateWorkers(updatedWorkerList);

    // Sync to all weekly wage reports
    const updatedReports = wageReports.map((rep) => ({
      ...rep,
      attendance: [
        ...rep.attendance,
        ...missingToAdd.map((createdWorker) => ({
          workerId: createdWorker.id,
          nama: createdWorker.nama,
          jenisKelamin: createdWorker.jenisKelamin,
          domisili: createdWorker.domisili,
          peran: createdWorker.peran,
          peranLabel: createdWorker.peranLabel,
          days: [1, 1, 1, 1, 0, 1, 1] as [number, number, number, number, number, number, number],
          hok: 6,
          upahHarian: createdWorker.upahHarian,
          totalUpah: 6 * createdWorker.upahHarian,
        })),
      ],
    }));

    onUpdateWageReports(updatedReports);
    setAutoGenMsg(`Berhasil menambahkan ${missingToAdd.length} jenis tenaga kerja sesuai Master AHSP.`);
    setTimeout(() => setAutoGenMsg(null), 4500);
  };

  const activeReport =
    wageReports.find((r) => r.mingguKe === selectedWeekNum) || wageReports[0];

  // Find matching Kwitansi for this week
  const matchingKwitansi = useMemo(() => {
    if (!kwitansiList || !activeReport) return null;
    return kwitansiList.find(
      (k: any) =>
        k.tipe === 'UPAH' &&
        (k.mingguKeRef === selectedWeekNum ||
          k.noBukti === activeReport.noBuktiKwitansi ||
          k.id === activeReport.id ||
          (k.uraian && k.uraian.toLowerCase().includes(`minggu ke-${selectedWeekNum}`)) ||
          (k.uraian && k.uraian.toLowerCase().includes(`minggu ${selectedWeekNum}`)))
    );
  }, [kwitansiList, activeReport, selectedWeekNum]);

  // Helper function to calculate RAB target wage for ANY week based on weekly progress weight & UPAH_BAHAN tags
  const calcWageForWeek = useCallback(
    (targetWeekNum: number): number => {
      if (!divisions || !progressWeeks) return 0;
      const currentWeekProgress = progressWeeks.find((w: any) => w.mingguKe === targetWeekNum);
      if (!currentWeekProgress) return 0;

      const totalRab = divisions.reduce((s: number, d: any) => s + (d.subTotal || 0), 0);
      if (totalRab <= 0) return 0;

      // Helper to calculate labor nominal for a single item (supports UPAH and UPAH_BAHAN)
      const getItemLaborAmount = (it: any) => {
        const cat = String(it.kategoriBiaya || '').toUpperCase().trim();
        const j = Number(it.jumlah) || Math.round((Number(it.volume) || 1) * (Number(it.hargaSatuan) || 0));
        if (cat === 'UPAH' || (/upah|tukang|pekerja|mandor|hok/i.test(it.uraian || '') && !/upah.*bahan|bahan.*upah/i.test(it.uraian || ''))) {
          return j;
        }
        if (cat === 'UPAH_BAHAN' || cat === 'UPAH & BAHAN' || cat.includes('UPAH') || /upah.*bahan|bahan.*upah/i.test(it.uraian || '')) {
          return Math.round(j * 0.35); // 35% labor portion for UPAH & BAHAN items!
        }
        return 0;
      };

      // Calculate total labor subtotal across RAB divisions (including UPAH_BAHAN)
      const totalLaborRab = divisions.reduce((sum: number, div: any) => {
        const divLaborSub = (div.items || []).reduce((s: number, it: any) => s + getItemLaborAmount(it), 0);
        return sum + (divLaborSub > 0 ? divLaborSub : Math.round((div.subTotal || 0) * 0.3));
      }, 0);

      let calculatedWage = 0;

      // 1. First Priority: Division-level weekly progress (prestasiMingguIni)
      divisions.forEach((div: any) => {
        const pDiv = currentWeekProgress.divisions?.find((pd: any) => pd.kode === div.kode);
        const bobotMingguIni = pDiv ? (Number(pDiv.prestasiMingguIni) || 0) : 0;
        if (bobotMingguIni > 0) {
          const divLaborSubtotal = (div.items || []).reduce((s: number, it: any) => s + getItemLaborAmount(it), 0);
          const laborRatio = div.subTotal > 0 && divLaborSubtotal > 0 ? divLaborSubtotal / div.subTotal : 0.3;
          const divNominalProgress = (bobotMingguIni / 100) * totalRab;
          calculatedWage += Math.round(divNominalProgress * laborRatio);
        }
      });

      if (calculatedWage > 0) return calculatedWage;

      // 2. Second Priority: Weekly progress weight (% bobot minggu ini = bobotRealisasi - prevBobot)
      const prevWeekProgress = progressWeeks.find((w: any) => w.mingguKe === targetWeekNum - 1);
      const prevBobot = prevWeekProgress ? (Number(prevWeekProgress.bobotRealisasi) || 0) : 0;
      const currentBobot = Number(currentWeekProgress.bobotRealisasi) || 0;
      const weeklyBobot = Math.max(0, currentBobot - prevBobot);

      if (weeklyBobot > 0) {
        return Math.round((weeklyBobot / 100) * (totalLaborRab || (totalRab * 0.3)));
      }

      // 3. Fallback: If weekly progress % is not filled, divide total labor RAB by total project weeks
      const totalWeeks = Math.max(1, progressWeeks.length);
      return Math.round((totalLaborRab || (totalRab * 0.3)) / totalWeeks);
    },
    [divisions, progressWeeks]
  );

  // Calculate RAB wage estimate for this active week based on weekly progress weight
  const rabEstimatedWage = useMemo(() => {
    return calcWageForWeek(selectedWeekNum);
  }, [calcWageForWeek, selectedWeekNum]);

  // Target Nominal (prioritize Rab Progress Estimate for active week, then Kwitansi if manual/valid, else current activeReport.totalUpah)
  const targetWageBudget = useMemo(() => {
    if (rabEstimatedWage > 0) return rabEstimatedWage;
    if (matchingKwitansi && matchingKwitansi.nominal > 0) return matchingKwitansi.nominal;
    return activeReport?.totalUpah || 0;
  }, [matchingKwitansi, rabEstimatedWage, activeReport]);

  const currentWageTotal = activeReport?.totalUpah || 0;
  const wageDifference = currentWageTotal - targetWageBudget;
  const isWageBalanced = targetWageBudget > 0 && Math.abs(wageDifference) === 0;

  // Handler: Apply AHSP Standard Rates to Active Week & Balance Immediately
  const handleApplyAhspRatesToWeek = () => {
    if (!activeReport) return;
    const target = targetWageBudget > 0 ? targetWageBudget : activeReport.totalUpah || 2740737;
    handleSyncWithRabAndKwitansi(target);
    setAutoGenMsg(`✅ Tarif AHSP resmi diterapkan & disinkronkan 100% pada Minggu Ke-${selectedWeekNum}.`);
    setTimeout(() => setAutoGenMsg(null), 4000);
  };

  // Handler: Apply AHSP Standard Rates to Master Workers & Sync All Weeks
  const handleApplyAhspRatesToAll = () => {
    const updatedWorkers = workers.map((w) => {
      const rate = getAhspWageRateForRole(w.peran, w.peranLabel || w.peran, ahspWageMap, w.upahHarian);
      return {
        ...w,
        upahHarian: rate,
      };
    });
    onUpdateWorkers(updatedWorkers);
    handleSyncAllWeeksToFullCapacity();
  };

  // Pastikan Master Data Tenaga Kerja memiliki pemisahan tegas antara HARIAN dan BORONGAN
  React.useEffect(() => {
    let hasChanges = false;
    const updated = workers.map((w) => {
      if (!w.kategoriPenugasan) {
        hasChanges = true;
        return {
          ...w,
          kategoriPenugasan: 'HARIAN' as const,
        };
      }
      return w;
    });

    const hasBorongan = updated.some((w: any) => w.kategoriPenugasan === 'BORONGAN');
    if (!hasBorongan && updated.length > 0) {
      hasChanges = true;
      const firstWorker = updated[0];
      updated.push({
        ...firstWorker,
        id: crypto.randomUUID(),
        peran: 'MANDOR',
        peranLabel: 'Ketua Kelompok / Mandor',
        kategoriPenugasan: 'BORONGAN',
      });
    }

    if (hasChanges) {
      onUpdateWorkers(updated);
    }
  }, []);

  // Dedicated memoized list for Borongan mode (strictly locked to Borongan personnel)
  const masterMandorWorker = useMemo(() => {
    return (
      (workers || []).find(
        (w) =>
          (w.kategoriPenugasan === 'BORONGAN' || !w.kategoriPenugasan || w.kategoriPenugasan === 'SEMUA') &&
          (w.peran === 'MANDOR' || /mandor/i.test(w.peran) || /mandor/i.test(w.peranLabel || '') || /mandor/i.test(w.nama))
      ) ||
      (workers || []).find(
        (w) => w.peran === 'MANDOR' || /mandor/i.test(w.peran) || /mandor/i.test(w.peranLabel || '') || /mandor/i.test(w.nama) || w.peran === 'KT'
      ) ||
      null
    );
  }, [workers]);

  const defaultMasterMandorNama = masterMandorWorker?.nama || school.namaMandor || 'Budiman (Mandor)';

  const currentBoronganList = useMemo(() => {
    if (activeReport?.boronganAttendance && activeReport.boronganAttendance.length > 0) {
      const hasP = activeReport.boronganAttendance.some(
        (w) =>
          w.peran === 'P' ||
          (w.peranLabel || '').toLowerCase().includes('pekerja') ||
          (w.peranLabel || '').toLowerCase().includes('laden')
      );
      if (hasP) return activeReport.boronganAttendance;
    }
    return getBalancedBoronganAttendance(
      targetWageBudget || activeReport?.boronganTotalUpah || activeReport?.totalUpah || 0,
      workers,
      ahspWageMap
    );
  }, [activeReport, targetWageBudget, workers, ahspWageMap]);

  // Handler: Balance Attendance & Sync with RAB/Kwitansi
  const handleSyncWithRabAndKwitansi = (customTarget?: number) => {
    const target =
      customTarget !== undefined
        ? customTarget
        : targetWageBudget > 0
        ? targetWageBudget
        : activeReport?.totalUpah || 0;

    if (!activeReport || target <= 0) {
      setAutoGenMsg('Target pagu upah harus lebih besar dari Rp 0 untuk disinkronkan.');
      setTimeout(() => setAutoGenMsg(null), 3000);
      return;
    }

    if (activeTab === 'borongan') {
      // Use balanced Borongan team structure (strictly locked to 1 Mandor, 1 KT, 2 Tukang, 3 Pekerja + extra if overflow)
      const balancedAttendance = getBalancedBoronganAttendance(target, workers, ahspWageMap);
      const finalTotalUpah = balancedAttendance.reduce((s, a) => s + a.totalUpah, 0);

      // Pastikan personil borongan tersimpan di master workers jika belum lengkap
      const existingBorongan = workers.filter((w) => w.kategoriPenugasan === 'BORONGAN');
      if (existingBorongan.length < 4) {
        const toAdd: WorkerItem[] = balancedAttendance
          .filter(
            (att) =>
              !workers.some(
                (w) =>
                  w.nama.toLowerCase() === att.nama.toLowerCase() &&
                  w.kategoriPenugasan === 'BORONGAN'
              )
          )
          .map((att) => ({
            id: att.workerId,
            nama: att.nama,
            jenisKelamin: att.jenisKelamin,
            domisili: att.domisili,
            peran: att.peran,
            peranLabel: att.peranLabel,
            upahHarian: att.upahHarian,
            kategoriPenugasan: 'BORONGAN',
          }));
        if (toAdd.length > 0) {
          onUpdateWorkers([...workers, ...toAdd]);
        }
      }

      // Update Weekly Wage Report: SIMPAN KHUSUS KE boronganAttendance & boronganTotalUpah (Harian tetap utuh!)
      const updatedWageReports = wageReports.map((rep) => {
        if (rep.mingguKe === selectedWeekNum) {
          return {
            ...rep,
            boronganAttendance: balancedAttendance,
            boronganTotalUpah: finalTotalUpah,
            totalUpah: finalTotalUpah,
          };
        }
        return rep;
      });

      onUpdateWageReports(updatedWageReports);

      // Update Kwitansi
      if (onUpdateKwitansiList && kwitansiList) {
        const itemsForKwitansi = balancedAttendance.map((a) => ({
          namaBarang: `Upah Borongan ${a.peranLabel || a.peran} (${a.nama})`,
          volume: a.hok,
          satuan: 'HOK',
          hargaSatuan: a.upahHarian,
          jumlah: a.totalUpah,
        }));

        let kwUpdated = false;
        const updatedKwList = kwitansiList.map((kw: any) => {
          if (
            kw.tipe === 'UPAH' &&
            (kw.mingguKeRef === selectedWeekNum ||
              kw.noBukti === activeReport.noBuktiKwitansi ||
              kw.id === activeReport.id ||
              (kw.uraian && kw.uraian.toLowerCase().includes(`minggu ke-${selectedWeekNum}`)) ||
              (kw.uraian && kw.uraian.toLowerCase().includes(`minggu ${selectedWeekNum}`)))
          ) {
            kwUpdated = true;
            return {
              ...kw,
              nominal: finalTotalUpah,
              items: itemsForKwitansi,
            };
          }
          return kw;
        });

        if (!kwUpdated) {
          const newKw: any = {
            id: `kw-upah-w${selectedWeekNum}-${Date.now()}`,
            noBukti: activeReport.noBuktiKwitansi || `UK/${String(selectedWeekNum).padStart(2, '0')}/2025`,
            tipe: 'UPAH',
            tanggal: activeReport.tanggalKwitansi || `${20 + selectedWeekNum}/10/2025`,
            tanggalFormatted: activeReport.tanggalKwitansi || `${20 + selectedWeekNum} Oktober 2025`,
            bulan: activeReport.bulan || 'Oktober 2025',
            uraian: `Pembayaran Upah Borongan Fisik Minggu Ke-${selectedWeekNum}`,
            penerimaNama: activeReport.penerimaNama || 'Budiman',
            penerimaPekerjaan: activeReport.penerimaJabatan || 'Mandor / Ketua Kelompok',
            penerimaAlamat: school.desa || school.lokasi || 'Lokasi Pekerjaan',
            items: itemsForKwitansi,
            nominal: finalTotalUpah,
            isPpn: false,
            isPph22: false,
            isPph23: false,
            ppnAmount: 0,
            pph22Amount: 0,
            pph23Amount: 0,
            mingguKeRef: selectedWeekNum,
          };
          updatedKwList.push(newKw);
        }

        onUpdateKwitansiList(updatedKwList);
      }

      setAutoGenMsg(
        `✅ Berhasil menyeimbangkan & mengunci Tim Borongan Minggu Ke-${selectedWeekNum} ke pagu Rp ${formatNumber(
          finalTotalUpah
        )} (100% Klop tanpa selisih).`
      );
      setTimeout(() => setAutoGenMsg(null), 5000);
      return;
    }

    // MODE HARIAN (HOK)
    let currentAttendance =
      activeReport.attendance.length > 0
        ? [...activeReport.attendance]
        : workers.map((w) => ({
            workerId: w.id,
            nama: w.nama,
            jenisKelamin: w.jenisKelamin,
            domisili: w.domisili,
            peran: w.peran,
            peranLabel: w.peranLabel,
            days: [1, 1, 1, 1, 0, 1, 1] as [number, number, number, number, number, number, number],
            hok: 6,
            upahHarian: w.upahHarian,
            totalUpah: 6 * w.upahHarian,
          }));

    currentAttendance = currentAttendance.map((att) => {
      const standardRate = getAhspWageRateForRole(att.peran, att.peranLabel || att.peran, ahspWageMap, att.upahHarian);
      return {
        ...att,
        upahHarian: standardRate,
      };
    });

    const numWorkers = currentAttendance.length;
    if (numWorkers === 0) return;

    let remainingBudget = target;
    const balancedAttendance: typeof currentAttendance = [];

    for (let i = 0; i < currentAttendance.length; i++) {
      if (remainingBudget <= 0) break;

      const att = currentAttendance[i];
      const workerRate = att.upahHarian || 120000;
      const isLastAvailable = i === currentAttendance.length - 1;

      const maxPossibleHok = Math.min(7, Math.max(1, Math.floor(remainingBudget / workerRate)));

      let assignedHok = 0;
      let assignedTotal = 0;
      let assignedDailyRate = workerRate;

      if (isLastAvailable || remainingBudget < workerRate * 2) {
        assignedTotal = remainingBudget;
        let calculatedHok = Math.round(assignedTotal / workerRate);
        assignedHok = Math.min(7, Math.max(1, calculatedHok));
        assignedDailyRate = Math.round((assignedTotal / assignedHok) * 100) / 100;
        remainingBudget = 0;
      } else {
        assignedHok = Math.min(7, Math.max(1, maxPossibleHok));
        assignedTotal = Math.round(assignedHok * workerRate);
        remainingBudget -= assignedTotal;
      }

      const assignedDays: [number, number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0, 0];
      for (let d = 0; d < Math.min(7, assignedHok); d++) {
        assignedDays[d] = 1;
      }

      balancedAttendance.push({
        ...att,
        days: assignedDays,
        hok: assignedHok,
        upahHarian: assignedDailyRate,
        totalUpah: assignedTotal,
      });
    }

    if (remainingBudget > 0 && balancedAttendance.length > 0) {
      const lastIdx = balancedAttendance.length - 1;
      balancedAttendance[lastIdx].totalUpah += remainingBudget;
      balancedAttendance[lastIdx].upahHarian = Math.round((balancedAttendance[lastIdx].totalUpah / (balancedAttendance[lastIdx].hok || 1)) * 100) / 100;
    }

    const finalTotalUpah = balancedAttendance.reduce((s, a) => s + a.totalUpah, 0);

    const updatedWageReports = wageReports.map((rep) => {
      if (rep.mingguKe === selectedWeekNum) {
        return {
          ...rep,
          attendance: balancedAttendance,
          totalUpah: finalTotalUpah,
        };
      }
      return rep;
    });

    onUpdateWageReports(updatedWageReports);


    // 4. Update or Create Synchronized Kwitansi for this Week
    if (onUpdateKwitansiList && kwitansiList) {
      const itemsForKwitansi = balancedAttendance
        .filter((a) => a.hok > 0 && a.totalUpah > 0)
        .map((a) => ({
          namaBarang: `Upah ${a.peranLabel || a.peran} (${a.nama})`,
          volume: a.hok,
          satuan: 'HOK',
          hargaSatuan: a.upahHarian,
          jumlah: a.totalUpah,
        }));

      let kwUpdated = false;
      const updatedKwList = kwitansiList.map((kw: any) => {
        if (
          kw.tipe === 'UPAH' &&
          (kw.mingguKeRef === selectedWeekNum ||
            kw.noBukti === activeReport.noBuktiKwitansi ||
            kw.id === activeReport.id ||
            (kw.uraian && kw.uraian.toLowerCase().includes(`minggu ke-${selectedWeekNum}`)) ||
            (kw.uraian && kw.uraian.toLowerCase().includes(`minggu ${selectedWeekNum}`)))
        ) {
          kwUpdated = true;
          return {
            ...kw,
            nominal: finalTotalUpah,
            items: itemsForKwitansi,
          };
        }
        return kw;
      });

      if (!kwUpdated) {
        const newKw: any = {
          id: `kw-upah-w${selectedWeekNum}-${Date.now()}`,
          noBukti: activeReport.noBuktiKwitansi || `UK/${String(selectedWeekNum).padStart(2, '0')}/2025`,
          tipe: 'UPAH',
          tanggal: activeReport.tanggalKwitansi || `${20 + selectedWeekNum}/10/2025`,
          tanggalFormatted: activeReport.tanggalKwitansi || `${20 + selectedWeekNum} Oktober 2025`,
          bulan: activeReport.bulan || 'Oktober 2025',
          uraian: `Pembayaran Upah Tenaga Kerja Mingguan Minggu Ke-${selectedWeekNum}`,
          penerimaNama: activeReport.penerimaNama || 'Budiman',
          penerimaPekerjaan: activeReport.penerimaJabatan || 'Kepala Tukang',
          penerimaAlamat: school.desa || school.lokasi || 'Lokasi Pekerjaan',
          items: itemsForKwitansi,
          nominal: finalTotalUpah,
          isPpn: false,
          isPph22: false,
          isPph23: false,
          ppnAmount: 0,
          pph22Amount: 0,
          pph23Amount: 0,
          mingguKeRef: selectedWeekNum,
        };
        updatedKwList.push(newKw);
      }

      onUpdateKwitansiList(updatedKwList);
    }

    setAutoGenMsg(
      `✅ Berhasil menyinkronkan Absensi HOK dan Kwitansi Upah Minggu Ke-${selectedWeekNum} ke pagu Rp ${formatNumber(
        finalTotalUpah
      )} (100% Balance & Klop).`
    );
    setTimeout(() => setAutoGenMsg(null), 5000);
  };

  // Handler: Sinkronkan seluruh minggu (Minggu 1 s/d selesai) dengan model pekerja konsisten penuh
  const handleSyncAllWeeksToFullCapacity = () => {
    let updatedKwList = kwitansiList ? [...kwitansiList] : [];
    let processedWeeksCount = 0;

    const updatedReports = wageReports.map((rep) => {
      // Hitung target upah resmi dari bobot Laporan Mingguan & tag UPAH_BAHAN (30%)
      const targetFromProgress = calcWageForWeek(rep.mingguKe);

      const matchedKw = updatedKwList.find(
        (k: any) =>
          k.tipe === 'UPAH' &&
          (k.mingguKeRef === rep.mingguKe ||
            k.noBukti === rep.noBuktiKwitansi ||
            (k.uraian && k.uraian.toLowerCase().includes(`minggu ke-${rep.mingguKe}`)) ||
            (k.uraian && k.uraian.toLowerCase().includes(`minggu ${rep.mingguKe}`)))
      );

      const targetNominal =
        targetFromProgress > 0
          ? targetFromProgress
          : rep.totalUpah > 0
          ? rep.totalUpah
          : matchedKw && matchedKw.nominal > 0
          ? matchedKw.nominal
          : 2740737;

      let balancedAttendance: any[] = [];

      if (activeTab === 'borongan') {
        balancedAttendance = getBalancedBoronganAttendance(targetNominal, workers, ahspWageMap);
      } else {
        let remaining = targetNominal;

        for (let i = 0; i < workers.length; i++) {
          if (remaining <= 0) break;
          const w = workers[i];
          const exactRate = getAhspWageRateForRole(w.peran, w.peranLabel, ahspWageMap, w.upahHarian);
          const isLastWorker = i === workers.length - 1;

          let assignedHok = 0;
          let assignedTotal = 0;
          let assignedDailyRate = exactRate;

          if (isLastWorker || remaining < exactRate * 2) {
            assignedTotal = remaining;
            let calculatedHok = Math.round(assignedTotal / exactRate);
            assignedHok = Math.min(7, Math.max(1, calculatedHok));
            assignedDailyRate = Math.round((assignedTotal / assignedHok) * 100) / 100;
            remaining = 0;
          } else {
            const maxHokPossible = Math.min(7, Math.max(1, Math.floor(remaining / exactRate)));
            assignedHok = maxHokPossible;
            assignedTotal = Math.round(assignedHok * exactRate);
            remaining -= assignedTotal;
          }

          const days: [number, number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0, 0];
          for (let d = 0; d < Math.min(7, assignedHok); d++) {
            days[d] = 1;
          }

          balancedAttendance.push({
            workerId: w.id,
            nama: w.nama,
            jenisKelamin: w.jenisKelamin,
            domisili: w.domisili === 'Luar Desa' ? 'Luar Desa' : 'Dalam Desa',
            peran: w.peran,
            peranLabel: w.peranLabel,
            days,
            hok: assignedHok,
            upahHarian: assignedDailyRate,
            totalUpah: assignedTotal,
          });
        }

        if (remaining > 0 && balancedAttendance.length > 0) {
          const lastIdx = balancedAttendance.length - 1;
          balancedAttendance[lastIdx].totalUpah += remaining;
          balancedAttendance[lastIdx].upahHarian = Math.round((balancedAttendance[lastIdx].totalUpah / (balancedAttendance[lastIdx].hok || 1)) * 100) / 100;
        }
      }

      const finalTotal = balancedAttendance.reduce((s, a) => s + a.totalUpah, 0);

      processedWeeksCount++;

      // Update Kwitansi
      if (onUpdateKwitansiList && updatedKwList) {
        const itemsForKwitansi = balancedAttendance.map((a) => ({
          namaBarang: `Upah ${a.peranLabel || a.peran} (${a.nama})`,
          volume: a.hok,
          satuan: 'HOK',
          hargaSatuan: a.upahHarian,
          jumlah: a.totalUpah,
        }));

        let kwFound = false;
        updatedKwList = updatedKwList.map((kw: any) => {
          if (
            kw.tipe === 'UPAH' &&
            (kw.mingguKeRef === rep.mingguKe ||
              kw.noBukti === rep.noBuktiKwitansi ||
              (kw.uraian && kw.uraian.toLowerCase().includes(`minggu ke-${rep.mingguKe}`)) ||
              (kw.uraian && kw.uraian.toLowerCase().includes(`minggu ${rep.mingguKe}`)))
          ) {
            kwFound = true;
            return {
              ...kw,
              nominal: finalTotal,
              items: itemsForKwitansi,
            };
          }
          return kw;
        });

        if (!kwFound) {
          updatedKwList.push({
            id: `kw-upah-w${rep.mingguKe}-${Date.now()}`,
            noBukti: rep.noBuktiKwitansi || `UK/${String(rep.mingguKe).padStart(2, '0')}/2025`,
            tipe: 'UPAH',
            tanggal: rep.tanggalKwitansi || `${20 + rep.mingguKe}/10/2025`,
            tanggalFormatted: rep.tanggalKwitansi || `${20 + rep.mingguKe} Oktober 2025`,
            bulan: rep.bulan || 'Oktober 2025',
            uraian: `Pembayaran Upah Tenaga Kerja Mingguan Minggu Ke-${rep.mingguKe}`,
            penerimaNama: rep.penerimaNama || 'Budiman',
            penerimaPekerjaan: rep.penerimaJabatan || 'Kepala Tukang',
            penerimaAlamat: school.desa || school.lokasi || 'Lokasi Pekerjaan',
            items: itemsForKwitansi,
            nominal: finalTotal,
            isPpn: false,
            isPph22: false,
            isPph23: false,
            ppnAmount: 0,
            pph22Amount: 0,
            pph23Amount: 0,
            mingguKeRef: rep.mingguKe,
          });
        }
      }

      return {
        ...rep,
        attendance: balancedAttendance,
        totalUpah: finalTotal,
      };
    });

    onUpdateWageReports(updatedReports);
    if (onUpdateKwitansiList) {
      onUpdateKwitansiList(updatedKwList);
    }

    setAutoGenMsg(`✅ Berhasil merapikan & menyinkronkan seluruh ${processedWeeksCount} minggu dengan sistem tim pekerja tetap kapasitas penuh (7 hari).`);
    setTimeout(() => setAutoGenMsg(null), 5000);
  };

  // Filtered workers list for Master table
  const filteredWorkers = useMemo(() => {
    let list = workers;
    if (masterFilter === 'HARIAN') {
      list = list.filter((w) => !w.kategoriPenugasan || w.kategoriPenugasan === 'HARIAN' || w.kategoriPenugasan === 'SEMUA');
    } else if (masterFilter === 'BORONGAN') {
      list = list.filter((w) => w.kategoriPenugasan === 'BORONGAN' || w.kategoriPenugasan === 'SEMUA');
    }

    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (w) =>
        w.nama.toLowerCase().includes(q) ||
        (w.peranLabel || w.peran).toLowerCase().includes(q) ||
        w.domisili.toLowerCase().includes(q)
    );
  }, [workers, masterFilter, searchQuery]);

  // Handler to generate standard Borongan Core Team (1 Mandor, 1 KT, 2 Tukang, 3 Pekerja)
  const handleSetupStandardBoronganTeam = () => {
    const boronganPreset: WorkerItem[] = [
      {
        id: `w-bor-mandor-${Date.now()}`,
        nama: 'Budiman (Mandor)',
        jenisKelamin: 'L',
        domisili: 'Dalam Desa',
        peran: 'MANDOR',
        peranLabel: 'Ketua Kelompok / Mandor',
        upahHarian: getAhspWageRateForRole('MANDOR', 'Mandor', ahspWageMap, 200000),
        kategoriPenugasan: 'BORONGAN',
      },
      {
        id: `w-bor-kt-${Date.now()}`,
        nama: 'Suparman (Kepala Tukang)',
        jenisKelamin: 'L',
        domisili: 'Dalam Desa',
        peran: 'KT',
        peranLabel: 'Kepala Tukang',
        upahHarian: getAhspWageRateForRole('KT', 'Kepala Tukang', ahspWageMap, 199782),
        kategoriPenugasan: 'BORONGAN',
      },
      {
        id: `w-bor-t1-${Date.now()}`,
        nama: 'Agus Santoso (Tukang 1)',
        jenisKelamin: 'L',
        domisili: 'Dalam Desa',
        peran: 'T',
        peranLabel: 'Tukang Batu & Konstruksi',
        upahHarian: getAhspWageRateForRole('T', 'Tukang', ahspWageMap, 183834),
        kategoriPenugasan: 'BORONGAN',
      },
      {
        id: `w-bor-t2-${Date.now()}`,
        nama: 'Bambang Irawan (Tukang 2)',
        jenisKelamin: 'L',
        domisili: 'Dalam Desa',
        peran: 'T',
        peranLabel: 'Tukang Kayu & Rangka',
        upahHarian: getAhspWageRateForRole('T', 'Tukang', ahspWageMap, 183834),
        kategoriPenugasan: 'BORONGAN',
      },
      {
        id: `w-bor-p1-${Date.now()}`,
        nama: 'Dedi Kurniawan (Pekerja 1)',
        jenisKelamin: 'L',
        domisili: 'Dalam Desa',
        peran: 'P',
        peranLabel: 'Pekerja Lapangan / Laden',
        upahHarian: getAhspWageRateForRole('P', 'Pekerja', ahspWageMap, 174748),
        kategoriPenugasan: 'BORONGAN',
      },
      {
        id: `w-bor-p2-${Date.now()}`,
        nama: 'Eko Prasetyo (Pekerja 2)',
        jenisKelamin: 'L',
        domisili: 'Dalam Desa',
        peran: 'P',
        peranLabel: 'Pekerja Lapangan / Laden',
        upahHarian: getAhspWageRateForRole('P', 'Pekerja', ahspWageMap, 174748),
        kategoriPenugasan: 'BORONGAN',
      },
      {
        id: `w-bor-p3-${Date.now()}`,
        nama: 'Hadi Saputra (Pekerja 3)',
        jenisKelamin: 'L',
        domisili: 'Dalam Desa',
        peran: 'P',
        peranLabel: 'Pekerja Lapangan / Laden',
        upahHarian: getAhspWageRateForRole('P', 'Pekerja', ahspWageMap, 174748),
        kategoriPenugasan: 'BORONGAN',
      },
    ];

    // Merge or replace borongan team
    const nonBorongan = workers.filter((w) => w.kategoriPenugasan !== 'BORONGAN');
    const updated = [...nonBorongan, ...boronganPreset];
    onUpdateWorkers(updated);
    setAutoGenMsg('✅ Tim Inti Borongan (1 Mandor, 1 KT, 2 Tukang, 3 Pekerja) berhasil dibuat sesuai standar tarif AHSP.');
    setTimeout(() => setAutoGenMsg(null), 5000);
  };

  const handleToggleDay = (workerId: string, dayIndex: number) => {
    const updatedReports = wageReports.map((rep) => {
      if (rep.mingguKe === selectedWeekNum) {
        const updatedAttendance = rep.attendance.map((att) => {
          if (att.workerId === workerId) {
            const newDays = [...att.days] as [number, number, number, number, number, number, number];
            newDays[dayIndex] = newDays[dayIndex] === 1 ? 0 : 1;
            const newHok = newDays.reduce((a, b) => a + b, 0);
            return {
              ...att,
              days: newDays,
              hok: newHok,
              totalUpah: newHok * att.upahHarian,
            };
          }
          return att;
        });

        const total = updatedAttendance.reduce((sum, a) => sum + a.totalUpah, 0);
        return {
          ...rep,
          attendance: updatedAttendance,
          totalUpah: total,
        };
      }
      return rep;
    });

    onUpdateWageReports(updatedReports);
  };

  const handleDeleteWorker = (workerId: string, workerName: string) => {
    if (confirm(`Hapus pekerja "${workerName}" dari daftar master dan seluruh laporan absensi mingguan?`)) {
      onUpdateWorkers(workers.filter((w) => w.id !== workerId));
      const updatedReports = wageReports.map((rep) => {
        const filteredAtt = rep.attendance.filter((a) => a.workerId !== workerId);
        return {
          ...rep,
          attendance: filteredAtt,
          totalUpah: filteredAtt.reduce((sum, a) => sum + a.totalUpah, 0),
        };
      });
      onUpdateWageReports(updatedReports);
    }
  };

  const handleAddWorker = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorker.nama?.trim()) return;

    let roleCode = roleOption;
    let roleLabel = 'Pekerja';

    const matchedStd = STANDARD_AHSP_ROLES.find((r) => r.code === roleOption);
    if (matchedStd) {
      roleCode = matchedStd.code;
      roleLabel = matchedStd.label;
    } else if (roleOption === 'KT') {
      roleLabel = 'Kepala Tukang';
    } else if (roleOption === 'T') {
      roleLabel = 'Tukang';
    } else if (roleOption === 'P') {
      roleLabel = 'Pekerja';
    } else {
      roleCode = (customRoleName.trim().toUpperCase() || 'CUSTOM') as any;
      roleLabel = customRoleName.trim() || 'Tenaga Ahli/Khusus';
    }

    const createdWorker: WorkerItem = {
      id: `w-${Date.now()}`,
      nama: newWorker.nama.trim(),
      jenisKelamin: newWorker.jenisKelamin || 'L',
      domisili: newWorker.domisili || 'Dalam Desa',
      peran: roleCode,
      peranLabel: roleLabel,
      upahHarian: Number(newWorker.upahHarian) || 120000,
      kategoriPenugasan: newWorker.kategoriPenugasan || 'SEMUA',
    };

    const newWorkerList = [...workers, createdWorker];
    onUpdateWorkers(newWorkerList);

    // Add to all wage reports
    const updatedReports = wageReports.map((rep) => ({
      ...rep,
      attendance: [
        ...rep.attendance,
        {
          workerId: createdWorker.id,
          nama: createdWorker.nama,
          jenisKelamin: createdWorker.jenisKelamin,
          domisili: createdWorker.domisili,
          peran: createdWorker.peran,
          peranLabel: createdWorker.peranLabel,
          days: [1, 1, 1, 1, 0, 1, 1] as [number, number, number, number, number, number, number],
          hok: 6,
          upahHarian: createdWorker.upahHarian,
          totalUpah: 6 * createdWorker.upahHarian,
        },
      ],
    }));

    onUpdateWageReports(updatedReports);
    setIsAddingWorker(false);
    setRoleOption('P');
    setCustomRoleName('');
    setNewWorker({
      nama: '',
      jenisKelamin: 'L',
      domisili: 'Dalam Desa',
      peran: 'P',
      peranLabel: 'Pekerja',
      upahHarian: 120000,
    });
  };

  const handleStartEditWorker = (worker: WorkerItem) => {
    setEditingWorker(worker);
    const matchedStd = STANDARD_AHSP_ROLES.find((r) => r.code === worker.peran || r.label.toLowerCase() === (worker.peranLabel || '').toLowerCase());
    if (matchedStd) {
      setEditRoleOption(matchedStd.code);
      setEditCustomRoleName('');
    } else if (worker.peran === 'KT' || worker.peran === 'T' || worker.peran === 'P') {
      setEditRoleOption(worker.peran);
      setEditCustomRoleName('');
    } else {
      setEditRoleOption('CUSTOM');
      setEditCustomRoleName(worker.peranLabel || worker.peran);
    }
  };

  const handleSaveEditWorker = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWorker || !editingWorker.nama.trim()) return;

    let roleCode = editRoleOption;
    let roleLabel = 'Pekerja';

    const matchedStd = STANDARD_AHSP_ROLES.find((r) => r.code === editRoleOption);
    if (matchedStd) {
      roleCode = matchedStd.code;
      roleLabel = matchedStd.label;
    } else if (editRoleOption === 'KT') {
      roleLabel = 'Kepala Tukang';
    } else if (editRoleOption === 'T') {
      roleLabel = 'Tukang';
    } else if (editRoleOption === 'P') {
      roleLabel = 'Pekerja';
    } else {
      roleCode = (editCustomRoleName.trim().toUpperCase() || 'CUSTOM') as any;
      roleLabel = editCustomRoleName.trim() || 'Tenaga Ahli/Khusus';
    }

    const updatedWorker: WorkerItem = {
      ...editingWorker,
      nama: editingWorker.nama.trim(),
      peran: roleCode,
      peranLabel: roleLabel,
      upahHarian: Number(editingWorker.upahHarian) || 120000,
    };

    // 1. Update master workers
    const updatedWorkersList = workers.map((w) => (w.id === updatedWorker.id ? updatedWorker : w));
    onUpdateWorkers(updatedWorkersList);

    // 2. Synchronize across all weekly wage reports
    const updatedReports = wageReports.map((rep) => {
      const updatedAttendance = rep.attendance.map((att) => {
        if (att.workerId === updatedWorker.id) {
          const hok = att.hok || att.days.reduce((a, b) => a + b, 0);
          return {
            ...att,
            nama: updatedWorker.nama,
            jenisKelamin: updatedWorker.jenisKelamin,
            domisili: updatedWorker.domisili,
            peran: updatedWorker.peran,
            peranLabel: updatedWorker.peranLabel,
            upahHarian: updatedWorker.upahHarian,
            totalUpah: hok * updatedWorker.upahHarian,
          };
        }
        return att;
      });

      return {
        ...rep,
        attendance: updatedAttendance,
        totalUpah: updatedAttendance.reduce((sum, a) => sum + a.totalUpah, 0),
      };
    });

    onUpdateWageReports(updatedReports);
    setEditingWorker(null);
  };

  const totalAllWages = wageReports.reduce((s, r) => s + r.totalUpah, 0);

  return (
    <div className="space-y-6">
      {/* Auto Gen Notification Banner */}
      {autoGenMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl text-xs font-bold text-emerald-900 flex items-center justify-between shadow-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{autoGenMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setAutoGenMsg(null)}
            className="text-emerald-700 hover:text-emerald-950 font-bold ml-2 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-600" />
            Daftar Pembayaran Upah Harian Tenaga Kerja (HOK)
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Pengelolaan data master tukang & pekerja, absensi harian 7 hari kerja (bilangan bulat), serta rekapitulasi upah terintegrasi RAB/AHSP.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSyncAllWeeksToFullCapacity}
            className="flex items-center gap-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white px-3.5 py-2 rounded-lg text-xs font-bold shadow-sm transition cursor-pointer"
            title="Optimalkan seluruh minggu: Pekerja konsisten, hari kerja dimaksimalkan 7 hari, dan 100% klop dengan target pagu"
          >
            <Zap className="w-4 h-4 text-amber-300" />
            <span>⚡ Rapikan Seluruh Minggu (Penuh 7 Hari)</span>
          </button>
          <button
            type="button"
            onClick={handleAutoGenerateMissingRoles}
            className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 px-3.5 py-2 rounded-lg text-xs font-bold shadow-xs transition cursor-pointer"
            title="Lengkapi otomatis jenis tukang (Tukang Kayu, Cat, Batu, Listrik, Pipa, Gali, dll.) sesuai AHSP/RAB"
          >
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <span>+ Lengkapi Jenis Tukang AHSP</span>
          </button>
          <button
            onClick={() => setIsAddingWorker(true)}
            className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white px-3.5 py-2 rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Tambah Pekerja</span>
          </button>
          <button
            onClick={() => onOpenPrintModal(selectedWeekNum)}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white px-3.5 py-2 rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
          >
            <Printer className="w-4 h-4 text-emerald-400" />
            <span>Cetak Upah Minggu {selectedWeekNum}</span>
          </button>
        </div>
      </div>

      {/* Main Section Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('absensi')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'absensi'
                ? 'border-purple-600 text-purple-900 bg-purple-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Mode Harian: Daftar Upah & Absensi (HOK)</span>
          </button>

          <button
            onClick={() => setActiveTab('borongan')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'borongan'
                ? 'border-indigo-600 text-indigo-900 bg-indigo-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            <Building2 className="w-4 h-4 text-indigo-600" />
            <span>Mode Borongan: Opname Fisik & SPK Tenaga Kerja</span>
          </button>

          <button
            onClick={() => setActiveTab('master')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'master'
                ? 'border-purple-600 text-purple-900 bg-purple-50/50'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
            }`}
          >
            <HardHat className="w-4 h-4 text-amber-600" />
            <span>Master Data Tenaga Kerja ({workers.length} Orang)</span>
          </button>
        </div>

        <div className="hidden sm:block text-xs font-semibold text-slate-500 font-mono">
          Total Alokasi Upah: <span className="text-purple-900 font-bold">{formatRupiah(totalAllWages)}</span>
        </div>
      </div>

      {/* Add Worker Form Modal/Inline */}
      {isAddingWorker && (
        <form onSubmit={handleAddWorker} className="bg-purple-50 p-5 rounded-xl border border-purple-200 shadow-xs space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between border-b border-purple-200 pb-2">
            <h3 className="text-xs font-bold text-purple-900 uppercase flex items-center gap-1.5">
              <UserPlus className="w-4 h-4 text-purple-700" />
              <span>Input Data Pekerja / Tukang Baru</span>
            </h3>
            <button
              type="button"
              onClick={() => setIsAddingWorker(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">Nama Lengkap *</label>
              <input
                type="text"
                value={newWorker.nama}
                onChange={(e) => setNewWorker({ ...newWorker, nama: e.target.value })}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 font-semibold"
                placeholder="Nama pekerja / tukang"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">Jenis / Kategori Pekerja</label>
              <select
                value={roleOption}
                onChange={(e: any) => {
                  const val = e.target.value;
                  setRoleOption(val);
                  const matched = STANDARD_AHSP_ROLES.find((r) => r.code === val);
                  if (matched) {
                    setNewWorker((prev) => ({ ...prev, upahHarian: matched.upah }));
                  } else if (val === 'CUSTOM') {
                    setNewWorker((prev) => ({ ...prev, upahHarian: 135000 }));
                  }
                }}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
              >
                <optgroup label="Standar AHSP / RAB">
                  {STANDARD_AHSP_ROLES.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.label} ({r.code}) - Rp {formatNumber(r.upah)}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Kustom">
                  <option value="CUSTOM">+ Jenis / Spesialisasi Lain (Kustom)</option>
                </optgroup>
              </select>
            </div>

            {roleOption === 'CUSTOM' && (
              <div>
                <label className="block text-[11px] font-semibold text-purple-800 mb-1">
                  Nama Kategori / Spesialisasi *
                </label>
                <input
                  type="text"
                  required
                  value={customRoleName}
                  onChange={(e) => setCustomRoleName(e.target.value)}
                  placeholder="Misal: Tukang Las / Mandor / Supir"
                  className="w-full px-2.5 py-1.5 text-xs border border-purple-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 font-medium"
                />
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">Jenis Kelamin</label>
              <select
                value={newWorker.jenisKelamin}
                onChange={(e) => setNewWorker({ ...newWorker, jenisKelamin: e.target.value as any })}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="L">Laki-Laki (L)</option>
                <option value="P">Perempuan (P)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">Tempat Tinggal</label>
              <select
                value={newWorker.domisili}
                onChange={(e) => setNewWorker({ ...newWorker, domisili: e.target.value as any })}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="Dalam Desa">Dalam Desa</option>
                <option value="Luar Desa">Luar Desa</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">Upah Harian (Rp)</label>
              <input
                type="number"
                value={newWorker.upahHarian}
                onChange={(e) => setNewWorker({ ...newWorker, upahHarian: parseFloat(e.target.value) || 0 })}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">Mode Penugasan</label>
              <select
                value={newWorker.kategoriPenugasan || 'SEMUA'}
                onChange={(e) => setNewWorker({ ...newWorker, kategoriPenugasan: e.target.value as any })}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 font-bold"
              >
                <option value="SEMUA">Semua Mode (Harian & Borongan)</option>
                <option value="HARIAN">Mode Harian (HOK)</option>
                <option value="BORONGAN">Mode Borongan (SPK)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-purple-200">
            <button
              type="button"
              onClick={() => setIsAddingWorker(false)}
              className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg text-xs hover:bg-slate-300 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-1.5 px-4 rounded-lg text-xs cursor-pointer shadow-xs"
            >
              Simpan Pekerja
            </button>
          </div>
        </form>
      )}

      {/* Edit Worker Modal */}
      {editingWorker && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveEditWorker}
            className="bg-white rounded-2xl border border-slate-300 shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95"
          >
            <div className="bg-purple-900 text-white p-4 flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-purple-300" />
                <span>Edit Data Pekerja: {editingWorker.nama}</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingWorker(null)}
                className="text-purple-200 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">Nama Lengkap Pekerja *</label>
                <input
                  type="text"
                  required
                  value={editingWorker.nama}
                  onChange={(e) => setEditingWorker({ ...editingWorker, nama: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 font-bold text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Jenis Pekerja / Jabatan</label>
                  <select
                    value={editRoleOption}
                    onChange={(e: any) => {
                      const val = e.target.value;
                      setEditRoleOption(val);
                      const matched = STANDARD_AHSP_ROLES.find((r) => r.code === val);
                      if (matched) {
                        setEditingWorker((prev) => (prev ? { ...prev, upahHarian: matched.upah, peran: matched.code, peranLabel: matched.label } : null));
                      }
                    }}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 font-medium"
                  >
                    <optgroup label="Standar AHSP / RAB">
                      {STANDARD_AHSP_ROLES.map((r) => (
                        <option key={r.code} value={r.code}>
                          {r.label} ({r.code}) - Rp {formatNumber(r.upah)}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Kustom">
                      <option value="CUSTOM">Kustom / Spesialisasi Lain</option>
                    </optgroup>
                  </select>
                </div>

                {editRoleOption === 'CUSTOM' && (
                  <div>
                    <label className="block text-[11px] font-semibold text-purple-800 mb-1">Nama Kategori *</label>
                    <input
                      type="text"
                      required
                      value={editCustomRoleName}
                      onChange={(e) => setEditCustomRoleName(e.target.value)}
                      placeholder="Misal: Mandor / Tukang Las"
                      className="w-full px-3 py-2 text-xs border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 font-medium"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Jenis Kelamin</label>
                  <select
                    value={editingWorker.jenisKelamin}
                    onChange={(e) => setEditingWorker({ ...editingWorker, jenisKelamin: e.target.value as any })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="L">Laki-Laki (L)</option>
                    <option value="P">Perempuan (P)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Domisili</label>
                  <select
                    value={editingWorker.domisili}
                    onChange={(e) => setEditingWorker({ ...editingWorker, domisili: e.target.value as any })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="Dalam Desa">Dalam Desa</option>
                    <option value="Luar Desa">Luar Desa</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Upah Harian (Rp)</label>
                  <input
                    type="number"
                    value={editingWorker.upahHarian}
                    onChange={(e) => setEditingWorker({ ...editingWorker, upahHarian: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono focus:ring-2 focus:ring-purple-500 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">Mode Penugasan</label>
                  <select
                    value={editingWorker.kategoriPenugasan || 'SEMUA'}
                    onChange={(e) => setEditingWorker({ ...editingWorker, kategoriPenugasan: e.target.value as any })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 font-bold"
                  >
                    <option value="SEMUA">Semua Mode (Harian & Borongan)</option>
                    <option value="HARIAN">Mode Harian (HOK)</option>
                    <option value="BORONGAN">Mode Borongan (SPK)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingWorker(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-lg text-xs"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg text-xs shadow-xs"
              >
                Simpan Perubahan
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 1: ABSENSI & UPAH MINGGUAN */}
      {activeTab === 'absensi' && (
        <div className="space-y-6">
          {/* Week Selector Tabs */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Pilih Minggu Kerja:</span>
            <div className="flex flex-wrap gap-1.5">
              {wageReports.map((w) => (
                <button
                  key={w.mingguKe}
                  onClick={() => setSelectedWeekNum(w.mingguKe)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                    selectedWeekNum === w.mingguKe
                      ? 'bg-purple-600 text-white shadow-xs font-semibold'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Minggu {w.mingguKe}
                </button>
              ))}
            </div>
          </div>

          {/* Week Summary Banner */}
          {activeReport && (
            <div className="bg-gradient-to-r from-purple-900 to-indigo-900 text-white p-5 rounded-xl shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs text-purple-200">
                  <Calendar className="w-4 h-4" />
                  <span>Periode: {activeReport.periodeStart} s/d {activeReport.periodeEnd}</span>
                  <span>•</span>
                  <span className="font-mono bg-purple-800/80 px-2 py-0.5 rounded">No. Kwitansi: {activeReport.noBuktiKwitansi}</span>
                </div>
                <h3 className="text-xl font-bold mt-1">Daftar Upah Kerja Minggu Ke-{activeReport.mingguKe}</h3>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-purple-200 uppercase font-semibold">Total Upah Terbayar Minggu Ini</span>
                <p className="text-2xl font-black text-amber-300 font-mono">{formatRupiah(activeReport.totalUpah)}</p>
              </div>
            </div>
          )}

          {/* Sync & Balance Control Bar */}
          {activeReport && (
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-4 text-xs">
                {/* Pagu Target Info */}
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-[10px] text-slate-500 font-semibold uppercase flex items-center gap-1">
                    <Scale className="w-3 h-3 text-indigo-600" />
                    <span>Pagu Target RAB / Kwitansi:</span>
                  </div>
                  <div className="font-mono font-bold text-slate-900 text-sm mt-0.5">
                    {formatRupiah(targetWageBudget)}
                  </div>
                </div>

                {/* Realisasi Absen Info */}
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-[10px] text-slate-500 font-semibold uppercase flex items-center gap-1">
                    <Users className="w-3 h-3 text-purple-600" />
                    <span>Total Realisasi Absensi HOK:</span>
                  </div>
                  <div className="font-mono font-bold text-purple-900 text-sm mt-0.5">
                    {formatRupiah(currentWageTotal)}
                  </div>
                </div>

                {/* Balance Status Badge */}
                <div className="flex items-center">
                  {isWageBalanced ? (
                    <div className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-lg font-bold text-xs shadow-2xs">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>100% SINKRON & BALANCE (Selisih: Rp 0)</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 border border-amber-300 text-amber-800 rounded-lg font-bold text-xs shadow-2xs">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>
                        Selisih: {formatRupiah(Math.abs(wageDifference))} ({wageDifference > 0 ? 'Absen > Kwitansi' : 'Absen < Kwitansi'})
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSyncWithRabAndKwitansi()}
                  className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-lg text-xs font-bold shadow-xs transition cursor-pointer"
                  title="Sinkronkan kehadiran, tarif AHSP, dan kwitansi minggu ini agar total klop 100% tanpa selisih rupiah"
                >
                  <Zap className="w-4 h-4 text-amber-300" />
                  <span>⚡ Sinkronkan Minggu Ini</span>
                </button>

                <button
                  type="button"
                  onClick={handleSyncAllWeeksToFullCapacity}
                  className="flex items-center gap-1.5 bg-purple-700 hover:bg-purple-800 text-white px-3.5 py-2 rounded-lg text-xs font-bold shadow-xs transition cursor-pointer"
                  title="Sinkronkan seluruh minggu (Minggu 1 s/d selesai) secara otomatis ke Kwitansi, Absensi HOK, dan BKU Kas"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-purple-200" />
                  <span>⚡ Sinkronkan Semua Minggu ke BKU</span>
                </button>

                <button
                  type="button"
                  onClick={handleApplyAhspRatesToAll}
                  className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 px-3 py-2 rounded-lg text-xs font-semibold transition cursor-pointer"
                  title="Terapkan standar tarif upah resmi AHSP ke semua tenaga kerja"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
                  <span>Set Tarif AHSP</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const inputVal = prompt(
                      `Masukkan target pagu upah (Rp) untuk Minggu Ke-${selectedWeekNum}:`,
                      String(targetWageBudget || activeReport.totalUpah || 0)
                    );
                    if (inputVal !== null) {
                      const num = parseInt(inputVal.replace(/\D/g, ''), 10);
                      if (!isNaN(num) && num > 0) {
                        handleSyncWithRabAndKwitansi(num);
                      }
                    }
                  }}
                  className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs transition cursor-pointer"
                  title="Kustom pagu upah secara manual"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Attendance & Wage Table */}
          {activeReport && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-800 text-white uppercase text-[10px] tracking-wider border-b border-slate-700 text-center">
                      <th rowSpan={2} className="py-2.5 px-2 w-8">No</th>
                      <th rowSpan={2} className="py-2.5 px-3 text-left">Nama Tenaga Kerja</th>
                      <th rowSpan={2} className="py-2.5 px-2 w-8">L/P</th>
                      <th rowSpan={2} className="py-2.5 px-2">Domisili</th>
                      <th rowSpan={2} className="py-2.5 px-2">Jabatan</th>
                      <th colSpan={7} className="py-1.5 px-2 border-b border-slate-700">Hari Kerja (Klik angka untuk ubah)</th>
                      <th rowSpan={2} className="py-2.5 px-3 text-right">Jumlah HOK</th>
                      <th rowSpan={2} className="py-2.5 px-3 text-right">Harga Upah (Rp)</th>
                      <th rowSpan={2} className="py-2.5 px-4 text-right bg-purple-900/50">Total Upah (Rp)</th>
                      <th rowSpan={2} className="py-2.5 px-3 text-center">Tanda Tangan</th>
                      <th rowSpan={2} className="py-2.5 px-2 text-center w-20">Aksi</th>
                    </tr>
                    <tr className="bg-slate-700 text-slate-200 text-[10px] border-b border-slate-600">
                      {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((day, dIdx) => (
                        <th key={dIdx} className="py-1 px-2 w-8 text-center">{day}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activeReport.attendance.map((att, idx) => {
                      const workerObj = workers.find((w) => w.id === att.workerId) || {
                        id: att.workerId,
                        nama: att.nama,
                        jenisKelamin: att.jenisKelamin,
                        domisili: att.domisili,
                        peran: att.peran,
                        peranLabel: att.peranLabel,
                        upahHarian: att.upahHarian,
                      };

                      return (
                        <tr key={att.workerId} className="hover:bg-purple-50/40 transition">
                          <td className="py-2 px-2 text-center text-slate-500 font-mono">{idx + 1}</td>
                          <td className="py-2 px-3 font-semibold text-slate-900">
                            <div>{att.nama}</div>
                            {att.peranLabel && att.peranLabel !== att.peran && (
                              <div className="text-[10px] text-purple-700 font-normal">{att.peranLabel}</div>
                            )}
                          </td>
                          <td className="py-2 px-2 text-center text-slate-500">{att.jenisKelamin}</td>
                          <td className="py-2 px-2 text-center text-slate-600 text-[10px]">{att.domisili}</td>
                          <td className="py-2 px-2 text-center">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              att.peran === 'KT' ? 'bg-rose-100 text-rose-800' :
                              att.peran === 'T' ? 'bg-amber-100 text-amber-800' :
                              att.peran === 'P' ? 'bg-blue-100 text-blue-800' :
                              'bg-purple-100 text-purple-800'
                            }`}>
                              {att.peran}
                            </span>
                          </td>

                          {/* 7 Days Attendance Checkboxes */}
                          {att.days.map((isPresent, dIdx) => (
                            <td key={dIdx} className="py-2 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => handleToggleDay(att.workerId, dIdx)}
                                className={`w-6 h-6 rounded text-xs font-bold transition flex items-center justify-center mx-auto cursor-pointer ${
                                  isPresent === 1
                                    ? 'bg-emerald-600 text-white shadow-2xs'
                                    : 'bg-slate-100 text-slate-300 hover:bg-slate-200'
                                }`}
                              >
                                {isPresent === 1 ? '1' : '0'}
                              </button>
                            </td>
                          ))}

                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-800">
                            {formatNumber(att.hok)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-slate-600">
                            {formatRupiah(att.upahHarian, false)}
                          </td>
                          <td className="py-2 px-4 text-right font-mono font-bold text-purple-900 bg-purple-50/40">
                            {formatRupiah(att.totalUpah, false)}
                          </td>
                          <td className="py-2 px-3 text-center text-[10px] text-slate-400 italic">
                            [ {att.nama} ]
                          </td>
                          <td className="py-2 px-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleStartEditWorker(workerObj)}
                                title={`Edit ${att.nama}`}
                                className="p-1 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded transition cursor-pointer"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteWorker(att.workerId, att.nama)}
                                title={`Hapus ${att.nama}`}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                      <td colSpan={5} className="py-3 px-4 text-right uppercase text-xs">Total Upah Minggu {activeReport.mingguKe}:</td>
                      <td colSpan={7} className="py-3 px-2 text-center text-slate-500 text-xs">
                        {activeReport.attendance.reduce((s, a) => s + a.hok, 0)} Total HOK
                      </td>
                      <td colSpan={2}></td>
                      <td className="py-3 px-4 text-right font-mono text-purple-950 font-extrabold text-sm bg-purple-100/60">
                        {formatRupiah(activeReport.totalUpah)}
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MODE BORONGAN TENAGA KERJA (OPNAME PRESTASI FISIK RAB & AHSP) */}
      {activeTab === 'borongan' && (
        <div className="space-y-6 animate-in fade-in">
          {/* Week / Period Selector for Borongan */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider">
                  Pilih Periode Pembayaran Borongan:
                </span>
                <p className="text-xs text-slate-500">
                  Pembayaran upah didasarkan pada Berita Acara Opname Prestasi Fisik (Output Kerja), tanpa perlu absensi harian orang per orang.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-600">Model Borongan:</span>
                <select
                  value={boronganType}
                  onChange={(e) => setBoronganType(e.target.value as any)}
                  className="px-3 py-1.5 text-xs font-bold bg-indigo-50 border border-indigo-300 text-indigo-900 rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="MINGGUAN">Borongan Mingguan (Sesuai Progres Fisik)</option>
                  <option value="BULANAN">Borongan Bulanan (Opname Akhir Bulan)</option>
                  <option value="RENTANG_WAKTU">Borongan Termin / Rentang Waktu (SPK Sub-Pekerjaan)</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100">
              {wageReports.map((w) => (
                <button
                  key={w.mingguKe}
                  onClick={() => setSelectedWeekNum(w.mingguKe)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                    selectedWeekNum === w.mingguKe
                      ? 'bg-indigo-600 text-white shadow-xs font-semibold'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Minggu {w.mingguKe} {w.boronganUraian ? `(${w.boronganUraian.slice(0, 12)}...)` : ''}
                </button>
              ))}
            </div>
          </div>

          {/* Borongan Summary Card */}
          {activeReport && (
            <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-purple-950 text-white p-6 rounded-xl shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-indigo-800/60 pb-4">
                <div>
                  <div className="flex items-center gap-2 text-xs text-indigo-200">
                    <Building2 className="w-4 h-4 text-amber-400" />
                    <span>SPK & Berita Acara Pembayaran Upah Borongan</span>
                    <span>•</span>
                    <span className="font-mono bg-indigo-800/80 px-2 py-0.5 rounded">
                      No. Kwitansi: {activeReport.noBuktiKwitansi || `UK/${String(activeReport.mingguKe).padStart(2, '0')}/2026`}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold mt-1 text-white">
                    Upah Borongan Tenaga Kerja Minggu Ke-{activeReport.mingguKe}
                  </h3>
                  <p className="text-xs text-indigo-200">
                    Periode: {activeReport.periodeStart} s/d {activeReport.periodeEnd} ({activeReport.bulan})
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-indigo-200 uppercase font-semibold">Total Nilai Borongan Fisik</span>
                  <p className="text-2xl font-black text-amber-300 font-mono">
                    {formatRupiah(activeReport.totalUpah || targetWageBudget)}
                  </p>
                </div>
              </div>

              {/* Form Input Detail Borongan */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs pt-2">
                <div className="space-y-1">
                  <label className="text-indigo-200 font-semibold block text-[11px]">Uraian Pekerjaan yang Diborongkan:</label>
                  <input
                    type="text"
                    value={activeReport.boronganUraian || `Pekerjaan Konstruksi Fisik & Pasangan Minggu Ke-${activeReport.mingguKe}`}
                    onChange={(e) => {
                      const val = e.target.value;
                      const updated = wageReports.map((r) => (r.mingguKe === selectedWeekNum ? { ...r, boronganUraian: val } : r));
                      onUpdateWageReports(updated);
                    }}
                    className="w-full px-3 py-2 bg-white text-slate-900 font-semibold rounded-lg border border-indigo-300 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    placeholder="Contoh: Borongan Pekerjaan Dinding & Atap"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-indigo-200 font-semibold block text-[11px]">Nama Mandor / Ketua Kelompok Penerima:</label>
                    {activeReport.penerimaNama && activeReport.penerimaNama !== defaultMasterMandorNama && (
                      <button
                        type="button"
                        onClick={() => {
                          const updated = wageReports.map((r) =>
                            r.mingguKe === selectedWeekNum ? { ...r, penerimaNama: defaultMasterMandorNama } : r
                          );
                          onUpdateWageReports(updated);
                          if (onUpdateKwitansiList && kwitansiList) {
                            const updatedKw = kwitansiList.map((k) => {
                              if (k.tipe === 'UPAH' && k.mingguKeRef === selectedWeekNum) {
                                return { ...k, penerimaNama: defaultMasterMandorNama };
                              }
                              return k;
                            });
                            onUpdateKwitansiList(updatedKw);
                          }
                        }}
                        className="text-[10px] text-amber-300 hover:text-amber-200 underline font-medium cursor-pointer"
                        title="Reset & Kunci ke Mandor Master Tenaga Kerja"
                      >
                        🔒 Kunci ke Master ({defaultMasterMandorNama})
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={activeReport.penerimaNama || defaultMasterMandorNama}
                    onChange={(e) => {
                      const val = e.target.value;
                      const updated = wageReports.map((r) => (r.mingguKe === selectedWeekNum ? { ...r, penerimaNama: val } : r));
                      onUpdateWageReports(updated);

                      // Also synchronize with Kwitansi Upah for this week
                      if (onUpdateKwitansiList && kwitansiList) {
                        const updatedKw = kwitansiList.map((k) => {
                          if (k.tipe === 'UPAH' && k.mingguKeRef === selectedWeekNum) {
                            return { ...k, penerimaNama: val };
                          }
                          return k;
                        });
                        onUpdateKwitansiList(updatedKw);
                      }
                    }}
                    className="w-full px-3 py-2 bg-white text-slate-900 font-bold rounded-lg border border-indigo-300 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    placeholder="Nama Mandor / Kepala Tukang"
                  />
                  <p className="text-[10px] text-indigo-300">
                    💡 Otomatis terkunci dari Master Tenaga Kerja (Tim Borongan), tetap bisa diedit manual.
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-indigo-200 font-semibold block text-[11px]">No. SPK / Dasar Opname Fisik:</label>
                  <input
                    type="text"
                    value={activeReport.boronganNoSpk || `SPK-BOR/${String(activeReport.mingguKe).padStart(2, '0')}/${school.tahunAnggaran || '2026'}`}
                    onChange={(e) => {
                      const val = e.target.value;
                      const updated = wageReports.map((r) => (r.mingguKe === selectedWeekNum ? { ...r, boronganNoSpk: val } : r));
                      onUpdateWageReports(updated);
                    }}
                    className="w-full px-3 py-2 bg-white text-slate-900 font-mono rounded-lg border border-indigo-300 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    placeholder="Nomor Surat Perjanjian Kerja Borongan"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Borongan Breakdown Table & Member List */}
          {activeReport && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
              {/* Fitur Balance & Kontrol Kesesuaian Upah Borongan */}
              <div className="p-4 bg-indigo-50/80 border border-indigo-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                <div className="space-y-0.5">
                  <h5 className="font-bold text-indigo-950 flex items-center gap-1.5 text-xs">
                    <Zap className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>Kontrol Kesesuaian & Balance Upah Borongan Minggu Ke-{activeReport.mingguKe}</span>
                  </h5>
                  <p className="text-slate-600 text-[11px]">
                    Target Pagu RAB/Kwitansi: <strong className="font-mono text-indigo-900">{formatRupiah(targetWageBudget || activeReport.boronganTotalUpah || activeReport.totalUpah || 0)}</strong> • Terdistribusi ke Kelompok: <strong className="font-mono text-indigo-900">{formatRupiah(currentBoronganList.reduce((s, a) => s + (a.totalUpah || 0), 0))}</strong>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {Math.abs((targetWageBudget || activeReport.boronganTotalUpah || activeReport.totalUpah || 0) - currentBoronganList.reduce((s, a) => s + (a.totalUpah || 0), 0)) === 0 ? (
                    <span className="px-3 py-1.5 bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold rounded-lg text-[11px] flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>100% Klop (Selisih Rp 0)</span>
                    </span>
                  ) : (
                    <span className="px-3 py-1.5 bg-amber-100 text-amber-900 border border-amber-300 font-bold rounded-lg text-[11px] flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      <span>Selisih: {formatRupiah(Math.abs((targetWageBudget || activeReport.boronganTotalUpah || activeReport.totalUpah || 0) - currentBoronganList.reduce((s, a) => s + (a.totalUpah || 0), 0)))}</span>
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => handleSyncWithRabAndKwitansi()}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-300" />
                    <span>⚡ Balance Nilai Borongan Sekarang</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenPrintModal(selectedWeekNum, 'BORONGAN')}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Cetak Lembar SPJ Borongan</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <div>
                  <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Daftar Kelompok Tukang & Tenaga Kerja Borongan ({currentBoronganList.length} Orang)</span>
                  </h4>
                  <p className="text-xs text-slate-500">
                    Nama-nama tenaga kerja di bawah ini tercantum resmi sebagai anggota kelompok penerima upah borongan (1 Mandor, 1 KT, 2 Tukang, 3 Pekerja + Tambahan jika over-capacity).
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-white uppercase text-[10px] tracking-wider">
                      <th className="py-2.5 px-3 w-10 text-center">No</th>
                      <th className="py-2.5 px-4">Nama Tenaga Kerja</th>
                      <th className="py-2.5 px-3 text-center">Peran / Kategori</th>
                      <th className="py-2.5 px-3 text-center">Domisili</th>
                      <th className="py-2.5 px-4 text-right">Dasar Tarif AHSP (Ref)</th>
                      <th className="py-2.5 px-4 text-right">Jumlah Diterima (Rp)</th>
                      <th className="py-2.5 px-4 text-center">Tanda Terima</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {currentBoronganList.map((w: any, idx: number) => (
                      <tr key={w.workerId || w.id || idx} className="hover:bg-indigo-50/40 transition">
                        <td className="py-2.5 px-3 text-center font-mono text-slate-500">{idx + 1}</td>
                        <td className="py-2.5 px-4 font-bold text-slate-900">{w.nama}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            idx === 0 ? 'bg-amber-100 text-amber-800 font-black' :
                            w.peran === 'KT' ? 'bg-rose-100 text-rose-800' :
                            w.peran === 'P' ? 'bg-blue-100 text-blue-800' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {idx === 0 ? 'Ketua Kelompok / Mandor' : w.peranLabel || w.peran}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-600">{w.domisili || 'Dalam Desa'}</td>
                        <td className="py-2.5 px-4 text-right font-mono text-slate-500">
                          {formatRupiah(w.upahHarian)}/hari
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold text-indigo-950">
                          {formatRupiah(w.totalUpah || w.upahHarian * 6)}
                        </td>
                        <td className="py-2.5 px-4 text-center font-mono text-[10px] text-slate-400 italic">
                          [ {w.nama} ]
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-indigo-50/70 font-bold text-indigo-950 border-t-2 border-indigo-200">
                      <td colSpan={5} className="py-3 px-4 text-right uppercase text-xs">
                        Total Nilai Pembayaran Upah Borongan Minggu Ke-{activeReport.mingguKe}:
                      </td>
                      <td colSpan={2} className="py-3 px-4 text-right font-mono text-base text-indigo-950 font-black">
                        {formatRupiah(activeReport.boronganTotalUpah || activeReport.totalUpah || targetWageBudget)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: MASTER DATA TENAGA KERJA */}
      {activeTab === 'master' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <HardHat className="w-4 h-4 text-amber-600" />
                Daftar Master Tenaga Kerja Terdaftar ({workers.length} Orang)
              </h3>
              <p className="text-xs text-slate-500">
                Data pekerja di bawah ini terhubung langsung dengan absensi mingguan, perhitungan HOK, dan kwitansi upah.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari nama, jabatan, domisili..."
                  className="pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 w-60"
                />
              </div>

              <button
                onClick={() => setIsAddingWorker(true)}
                className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-xs transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Pekerja</span>
              </button>
            </div>
          </div>

          {/* Sub-Tabs Navigasi Pemisahan Master Data Pekerja */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-slate-100 rounded-xl border border-slate-200">
            <div className="flex items-center gap-1.5 overflow-x-auto">
              <button
                type="button"
                onClick={() => setMasterFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  masterFilter === 'ALL'
                    ? 'bg-purple-700 text-white shadow-xs'
                    : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
                }`}
              >
                <span>📋 Semua Tenaga Kerja</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 font-mono">
                  {workers.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setMasterFilter('HARIAN')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  masterFilter === 'HARIAN'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
                }`}
              >
                <span>⏱️ Tim Mode Harian (HOK)</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 font-mono">
                  {workers.filter((w) => !w.kategoriPenugasan || w.kategoriPenugasan === 'HARIAN' || w.kategoriPenugasan === 'SEMUA').length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setMasterFilter('BORONGAN')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  masterFilter === 'BORONGAN'
                    ? 'bg-indigo-700 text-white shadow-xs'
                    : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
                }`}
              >
                <span>🏗️ Tim Mode Borongan (SPK)</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 font-mono">
                  {workers.filter((w) => w.kategoriPenugasan === 'BORONGAN' || w.kategoriPenugasan === 'SEMUA').length}
                </span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleSetupStandardBoronganTeam}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-lg text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Buat Tim Inti Borongan (1 Mandor, 1 KT, 2 Tukang, 3 Pekerja)</span>
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-900 text-white uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-3 w-10 text-center">No</th>
                  <th className="py-3 px-4">Nama Lengkap Pekerja</th>
                  <th className="py-3 px-3 text-center">Jabatan / Kategori</th>
                  <th className="py-3 px-3 text-center">Penugasan Mode</th>
                  <th className="py-3 px-3 text-center">L/P</th>
                  <th className="py-3 px-3 text-center">Domisili</th>
                  <th className="py-3 px-4 text-right">Tarif Upah Harian (Rp)</th>
                  <th className="py-3 px-3 text-center w-28">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredWorkers.map((w, idx) => (
                  <tr key={w.id} className="hover:bg-purple-50/30 transition">
                    <td className="py-2.5 px-3 text-center font-mono text-slate-500">{idx + 1}</td>
                    <td className="py-2.5 px-4 font-bold text-slate-900">
                      <div>{w.nama}</div>
                      {w.peranLabel && w.peranLabel !== w.peran && (
                        <div className="text-[10px] text-purple-700 font-normal">{w.peranLabel}</div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold ${
                        w.peran === 'KT' ? 'bg-rose-100 text-rose-800' :
                        w.peran === 'T' ? 'bg-amber-100 text-amber-800' :
                        w.peran === 'P' ? 'bg-blue-100 text-blue-800' :
                        'bg-purple-100 text-purple-800'
                      }`}>
                        {w.peranLabel || w.peran} ({w.peran})
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        w.kategoriPenugasan === 'BORONGAN'
                          ? 'bg-amber-100 text-amber-900 border border-amber-300'
                          : w.kategoriPenugasan === 'HARIAN'
                          ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                          : 'bg-purple-100 text-purple-900 border border-purple-300'
                      }`}>
                        {w.kategoriPenugasan || 'SEMUA'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center text-slate-600 font-medium">{w.jenisKelamin}</td>
                    <td className="py-2.5 px-3 text-center text-slate-600">{w.domisili}</td>
                    <td className="py-2.5 px-4 text-right font-mono font-bold text-purple-900">
                      {formatRupiah(w.upahHarian)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleStartEditWorker(w)}
                          className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-md font-bold text-[11px] transition flex items-center gap-1 cursor-pointer"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteWorker(w.id, w.nama)}
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition cursor-pointer"
                          title="Hapus Pekerja"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
};
