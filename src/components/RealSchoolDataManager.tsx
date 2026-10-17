import React, { useState, useRef } from 'react';
import { RealSchoolData, RabDivision, RabSubItem, AhspItem, AhspKomponen } from '../types';
import {
  FileSpreadsheet,
  Calculator,
  Plus,
  Trash2,
  Edit2,
  Edit3,
  Sliders,
  Save,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Building,
  CheckCircle,
  FolderSync,
  X,
  Layers,
  Download,
  Upload,
  FileUp,
  AlertTriangle,
  Sparkles,
  CheckCircle2,
  Wand2,
  Eye,
  Tag,
} from 'lucide-react';
import { defaultRealSchoolData } from '../data/realSchoolData';
import { downloadRealDataExcelTemplate, parseRealDataExcelFile } from '../utils/excelHelper';
import { toRoman, formatRupiah } from '../utils/formatters';
import { rebalanceAhspComponents } from '../utils/divisionHelper';
import { SchoolMasterData, StoreVendor, KwitansiDocument } from '../types';
import { RabAhspDocumentPreviewModal } from './RabAhspDocumentPreviewModal';
import { KwitansiTagManager } from './KwitansiTagManager';
import { getItemTags } from '../utils/kwitansiTagHelper';

interface RealSchoolDataManagerProps {
  realData: RealSchoolData;
  school?: SchoolMasterData;
  stores?: StoreVendor[];
  kwitansiList?: KwitansiDocument[];
  onUpdateRealData: (newData: RealSchoolData) => void;
  onApplyToAllModules: (data: RealSchoolData) => void;
}

export const RealSchoolDataManager: React.FC<RealSchoolDataManagerProps> = ({
  realData = defaultRealSchoolData,
  school,
  stores = [],
  kwitansiList = [],
  onUpdateRealData,
  onApplyToAllModules,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'rekap' | 'rab' | 'ahsp'>('rekap');
  const [isAhspRebalanceLocked, setIsAhspRebalanceLocked] = useState(true);
  const [expandedDivisions, setExpandedDivisions] = useState<Record<string, boolean>>({
    'div-1': true,
    'div-2': true,
    'div-3': true,
    'div-4': true,
  });

  // RAB Item AHSP & Document Preview Modal
  const [selectedPreviewItem, setSelectedPreviewItem] = useState<RabSubItem | null>(null);
  const [selectedPreviewDivision, setSelectedPreviewDivision] = useState<RabDivision | null>(null);
  const [isRabAhspModalOpen, setIsRabAhspModalOpen] = useState(false);

  const handleOpenRabAhspPreview = (div: RabDivision, item: RabSubItem) => {
    setSelectedPreviewDivision(div);
    setSelectedPreviewItem(item);
    setIsRabAhspModalOpen(true);
  };

  const handleUpdateRabItem = (divId: string, itemId: string, updatedFields: Partial<RabSubItem>) => {
    const updatedDivs = realData.divisions.map((d) => {
      if (d.id !== divId) return d;
      const updatedItems = d.items.map((it) => (it.id === itemId ? { ...it, ...updatedFields } : it));
      const subTotal = updatedItems.reduce((acc, it) => acc + (it.jumlah || 0), 0);
      return { ...d, items: updatedItems, subTotal };
    });
    const totalNilaiRab = updatedDivs.reduce((acc, d) => acc + d.subTotal, 0);
    const divsWithBobot = updatedDivs.map((d) => ({
      ...d,
      bobotPersen: totalNilaiRab > 0 ? (d.subTotal / totalNilaiRab) * 100 : 0,
    }));
    onUpdateRealData({
      ...realData,
      divisions: divsWithBobot,
      totalNilaiRab,
    });
    if (selectedPreviewItem && selectedPreviewItem.id === itemId) {
      setSelectedPreviewItem({ ...selectedPreviewItem, ...updatedFields });
    }
  };

  const handleUpdateAhspItem = (updatedAhsp: AhspItem) => {
    const currentList = realData.ahspList || [];
    const exists = currentList.some((a) => a.id === updatedAhsp.id);
    const updatedList = exists
      ? currentList.map((a) => (a.id === updatedAhsp.id ? updatedAhsp : a))
      : [...currentList, updatedAhsp];
    onUpdateRealData({
      ...realData,
      ahspList: updatedList,
    });
  };

  // Division Modal / Form state
  const [editingDivision, setEditingDivision] = useState<RabDivision | null>(null);
  const [isAddingDivision, setIsAddingDivision] = useState(false);
  const [newDivForm, setNewDivForm] = useState({ kode: '', uraian: '', subTotal: 0, bobotPersen: 0 });

  // Rekap Table Quick Edit mode (Edit Jumlah Harga RP & Bobot % langsung di tabel)
  const [isEditingRekapTable, setIsEditingRekapTable] = useState(false);

  // AHSP Modal / Form state
  const [editingAhsp, setEditingAhsp] = useState<AhspItem | null>(null);
  const [isAddingAhsp, setIsAddingAhsp] = useState(false);
  const [newAhspForm, setNewAhspForm] = useState({ kodePekerjaan: '', namaPekerjaan: '', satuan: 'm³' });

  const [showSyncSuccess, setShowSyncSuccess] = useState(false);

  // Excel Import / Export State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isParsingExcel, setIsParsingExcel] = useState(false);
  const [importedExcelResult, setImportedExcelResult] = useState<{
    data: Partial<RealSchoolData>;
    summary: { divisionsCount: number; rabItemsCount: number; ahspCount: number };
  } | null>(null);
  const [excelImportMode, setExcelImportMode] = useState<'REPLACE' | 'MERGE'>('REPLACE');
  const [excelSuccessMsg, setExcelSuccessMsg] = useState<string | null>(null);

  const handleDownloadTemplate = () => {
    downloadRealDataExcelTemplate(realData);
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsingExcel(true);
    const res = await parseRealDataExcelFile(file);
    setIsParsingExcel(false);

    if (e.target) e.target.value = '';

    if (!res.success || !res.data) {
      alert(`Gagal membaca file Excel: ${res.message}`);
      return;
    }

    setImportedExcelResult({
      data: res.data,
      summary: res.summary || { divisionsCount: 0, rabItemsCount: 0, ahspCount: 0 },
    });
  };

  const handleApplyImportedExcel = () => {
    if (!importedExcelResult) return;
    const { data } = importedExcelResult;

    if (excelImportMode === 'REPLACE') {
      const merged: RealSchoolData = {
        ...realData,
        ...data,
        divisions: data.divisions || realData.divisions,
        ahspList: data.ahspList || realData.ahspList,
        totalNilaiRab: data.totalNilaiRab || realData.totalNilaiRab,
      };
      onUpdateRealData(merged);
      setExcelSuccessMsg(
        `Berhasil mengimpor data real sekolah dari file Excel! (${data.divisions?.length || 0} Divisi, ${
          data.ahspList?.length || 0
        } AHSP)`
      );
    } else {
      // MERGE mode
      const existingDivs = [...realData.divisions];
      if (data.divisions) {
        data.divisions.forEach((newDiv) => {
          const idx = existingDivs.findIndex((d) => d.kode.toUpperCase() === newDiv.kode.toUpperCase());
          if (idx >= 0) {
            existingDivs[idx] = newDiv;
          } else {
            existingDivs.push(newDiv);
          }
        });
      }

      const existingAhsp = [...(realData.ahspList || [])];
      if (data.ahspList) {
        data.ahspList.forEach((newAh) => {
          const idx = existingAhsp.findIndex(
            (a) => a.kodePekerjaan.toLowerCase() === newAh.kodePekerjaan.toLowerCase()
          );
          if (idx >= 0) {
            existingAhsp[idx] = newAh;
          } else {
            existingAhsp.push(newAh);
          }
        });
      }

      const tot = existingDivs.reduce((s, d) => s + d.subTotal, 0);

      const merged: RealSchoolData = {
        ...realData,
        ...data,
        divisions: existingDivs,
        ahspList: existingAhsp,
        totalNilaiRab: tot,
      };
      onUpdateRealData(merged);
      setExcelSuccessMsg(`Berhasil menggabungkan (merge) data dari file Excel ke proyek!`);
    }

    setImportedExcelResult(null);
    setTimeout(() => setExcelSuccessMsg(null), 5000);
  };

  const toggleDivision = (id: string) => {
    setExpandedDivisions((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const formatRupiah = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val || 0);
  };

  // Recalculate totals & Pagu reference
  const currentTotalRab = realData.divisions.reduce((sum, d) => sum + (d.subTotal || 0), 0);
  const activePagu = realData.paguAnggaran !== undefined && realData.paguAnggaran > 0 
    ? realData.paguAnggaran 
    : school?.totalAnggaran && school.totalAnggaran > 0
      ? school.totalAnggaran
      : currentTotalRab > 0 
        ? currentTotalRab 
        : 552457000;
  const sisaPagu = activePagu - currentTotalRab;
  const biayaPerM2 = realData.luasBangunanM2 > 0 ? currentTotalRab / realData.luasBangunanM2 : 0;
  const totalBobotTerkini = realData.divisions.reduce((s, d) => s + (d.bobotPersen || 0), 0);

  // Check if current divisions reflect 2-decimal rounded percentages rather than exact Excel values
  const hasRoundingDifference = React.useMemo(() => {
    return realData.divisions.some(
      (d) => Math.abs(d.subTotal - 14695356.2) < 50 || Math.abs(d.subTotal - 82647567.2) < 50 || Math.abs(d.subTotal - 75465626.2) < 50
    );
  }, [realData.divisions]);

  // Handle header field change
  const handleHeaderChange = (field: keyof RealSchoolData, value: any) => {
    const updated = { ...realData, [field]: value };
    if (field === 'luasBangunanM2') {
      const luas = parseFloat(value) || 1;
      updated.biayaPerM2 = updated.totalNilaiRab / luas;
    }
    if (field === 'paguAnggaran') {
      const pagu = parseFloat(value) || 0;
      updated.paguAnggaran = pagu;
    }
    onUpdateRealData(updated);
  };

  // Set Pagu Anggaran sama dengan Total RAB saat ini
  const handleSetPaguFromTotalRab = () => {
    onUpdateRealData({
      ...realData,
      paguAnggaran: currentTotalRab,
    });
  };

  // --- DIVISION CRUD ---
  const handleAddDivision = () => {
    if (!newDivForm.kode.trim() || !newDivForm.uraian.trim()) {
      alert('Mohon isi Kode Divisi dan Uraian Pekerjaan');
      return;
    }
    const newDivId = `div-${Date.now()}`;
    let initialSubTotal = Number(newDivForm.subTotal) || 0;
    let initialBobot = Number(newDivForm.bobotPersen) || 0;

    // Jika user menginput bobot tapi tidak mengisi subTotal, hitung dari Pagu
    if (initialBobot > 0 && initialSubTotal === 0 && activePagu > 0) {
      initialSubTotal = Math.round(((initialBobot / 100) * activePagu) * 100) / 100;
    } else if (initialSubTotal > 0 && initialBobot === 0 && activePagu > 0) {
      initialBobot = parseFloat(((initialSubTotal / activePagu) * 100).toFixed(2));
    }

    const newDivision: RabDivision = {
      id: newDivId,
      kode: newDivForm.kode.toUpperCase().trim(),
      uraian: newDivForm.uraian.toUpperCase().trim(),
      subTotal: initialSubTotal,
      bobotPersen: initialBobot,
      items: [],
    };

    const updatedDivs = [...realData.divisions, newDivision];
    const newTotal = updatedDivs.reduce((s, d) => s + (d.subTotal || 0), 0);

    onUpdateRealData({
      ...realData,
      divisions: updatedDivs,
      totalNilaiRab: newTotal,
      biayaPerM2: realData.luasBangunanM2 > 0 ? newTotal / realData.luasBangunanM2 : 0,
    });

    setExpandedDivisions((prev) => ({ ...prev, [newDivId]: true }));
    setNewDivForm({ kode: '', uraian: '', subTotal: 0, bobotPersen: 0 });
    setIsAddingDivision(false);
  };

  const handleSaveEditDivision = () => {
    if (!editingDivision) return;
    const updatedDivs = realData.divisions.map((d) => (d.id === editingDivision.id ? editingDivision : d));
    const newTotal = updatedDivs.reduce((sum, d) => sum + (d.subTotal || 0), 0);
    onUpdateRealData({
      ...realData,
      divisions: updatedDivs,
      totalNilaiRab: newTotal,
      biayaPerM2: realData.luasBangunanM2 > 0 ? newTotal / realData.luasBangunanM2 : 0,
    });
    setEditingDivision(null);
  };

  // Auto-absorb 100% Pagu to all divisions proportionally, eliminating any rounding errors down to Rp 0.00
  const handleScaleAllToPagu = () => {
    if (!activePagu || activePagu <= 0) {
      alert('Pagu anggaran harus lebih besar dari 0.');
      return;
    }

    if (realData.divisions.length === 0) return;

    // Check if sum of bobot is > 0 or if we use subTotals
    const sumBobot = realData.divisions.reduce((s, d) => s + (d.bobotPersen || 0), 0);
    const sumSubTotal = realData.divisions.reduce((s, d) => s + (d.subTotal || 0), 0);

    let scaledDivisions = [];
    let allocatedTotalRp = 0;

    if (sumBobot > 0) {
      // Scale by existing bobot ratios
      scaledDivisions = realData.divisions.map((d) => {
        const normalizedBobot = parseFloat(((d.bobotPersen / sumBobot) * 100).toFixed(2));
        const subTotalRp = Math.round(((d.bobotPersen / sumBobot) * activePagu) * 100) / 100;
        allocatedTotalRp += subTotalRp;
        return {
          ...d,
          bobotPersen: normalizedBobot,
          subTotal: subTotalRp,
        };
      });
    } else if (sumSubTotal > 0) {
      // Scale by existing subTotals
      scaledDivisions = realData.divisions.map((d) => {
        const ratio = d.subTotal / sumSubTotal;
        const normalizedBobot = parseFloat((ratio * 100).toFixed(2));
        const subTotalRp = Math.round((ratio * activePagu) * 100) / 100;
        allocatedTotalRp += subTotalRp;
        return {
          ...d,
          bobotPersen: normalizedBobot,
          subTotal: subTotalRp,
        };
      });
    } else {
      // Equal distribution if all 0
      const count = realData.divisions.length;
      const equalBobot = parseFloat((100 / count).toFixed(2));
      const equalRp = Math.round((activePagu / count) * 100) / 100;
      scaledDivisions = realData.divisions.map((d) => {
        allocatedTotalRp += equalRp;
        return {
          ...d,
          bobotPersen: equalBobot,
          subTotal: equalRp,
        };
      });
    }

    // Precise rounding reconciliation (selisih desimal diserap ke divisi dengan nominal terbesar)
    let maxIdx = 0;
    let maxVal = 0;
    scaledDivisions.forEach((d, idx) => {
      if (d.subTotal > maxVal) {
        maxVal = d.subTotal;
        maxIdx = idx;
      }
    });

    const diffRp = Math.round((activePagu - allocatedTotalRp) * 100) / 100;
    if (Math.abs(diffRp) > 0 && Math.abs(diffRp) <= 500) {
      scaledDivisions[maxIdx].subTotal = Math.round((scaledDivisions[maxIdx].subTotal + diffRp) * 100) / 100;
    }

    // Exact 100.00% bobot reconciliation
    const finalBobotSum = scaledDivisions.reduce((s, d) => s + d.bobotPersen, 0);
    const diffBobot = Math.round((100 - finalBobotSum) * 100) / 100;
    if (Math.abs(diffBobot) > 0 && Math.abs(diffBobot) <= 0.05) {
      scaledDivisions[maxIdx].bobotPersen = Math.round((scaledDivisions[maxIdx].bobotPersen + diffBobot) * 100) / 100;
    }

    const finalTotal = scaledDivisions.reduce((s, d) => s + d.subTotal, 0);

    onUpdateRealData({
      ...realData,
      divisions: scaledDivisions,
      totalNilaiRab: finalTotal,
      paguAnggaran: activePagu,
      biayaPerM2: realData.luasBangunanM2 > 0 ? finalTotal / realData.luasBangunanM2 : 0,
    });
  };

  // Apply exact Excel-matching subTotals and bobot (Total: Rp 552.457.000,00)
  const handleApplyExcelPrecise552M = () => {
    const excelValues: Record<string, { subTotal: number; bobot: number }> = {
      'I': { subTotal: 14670041.65, bobot: 2.66 },
      'II': { subTotal: 9874439.92, bobot: 1.79 },
      'III': { subTotal: 82649811.26, bobot: 14.96 },
      'IV': { subTotal: 75440354.37, bobot: 13.66 },
      'V': { subTotal: 46162983.19, bobot: 8.36 },
      'VI': { subTotal: 97338293.68, bobot: 17.62 },
      'VII': { subTotal: 54913112.64, bobot: 9.94 },
      'VIII': { subTotal: 55495660.89, bobot: 10.05 },
      'IX': { subTotal: 0, bobot: 0.00 },
      'X': { subTotal: 29380080.49, bobot: 5.32 },
      'XI': { subTotal: 8821316.03, bobot: 1.60 },
      'XII': { subTotal: 42104948.47, bobot: 7.62 },
      'XIII': { subTotal: 10207041.51, bobot: 1.85 },
      'XIV': { subTotal: 12106025.18, bobot: 2.19 },
      'XV': { subTotal: 13292890.73, bobot: 2.41 },
    };

    const keywordMap: { match: RegExp; subTotal: number; bobot: number }[] = [
      { match: /persiapan/i, subTotal: 14670041.65, bobot: 2.66 },
      { match: /galian|urugan/i, subTotal: 9874439.92, bobot: 1.79 },
      { match: /pasangan|bata/i, subTotal: 82649811.26, bobot: 14.96 },
      { match: /beton/i, subTotal: 75440354.37, bobot: 13.66 },
      { match: /kayu|kaca|besi/i, subTotal: 46162983.19, bobot: 8.36 },
      { match: /atap/i, subTotal: 97338293.68, bobot: 17.62 },
      { match: /langit/i, subTotal: 54913112.64, bobot: 9.94 },
      { match: /lantai/i, subTotal: 55495660.89, bobot: 10.05 },
      { match: /pengunci/i, subTotal: 0, bobot: 0.00 },
      { match: /cat/i, subTotal: 29380080.49, bobot: 5.32 },
      { match: /listrik/i, subTotal: 8821316.03, bobot: 1.60 },
      { match: /mebeler|perabot/i, subTotal: 42104948.47, bobot: 7.62 },
      { match: /perencanaan/i, subTotal: 10207041.51, bobot: 1.85 },
      { match: /pengawasan/i, subTotal: 12106025.18, bobot: 2.19 },
      { match: /pengelolaan/i, subTotal: 13292890.73, bobot: 2.41 },
    ];

    const updatedDivisions = realData.divisions.map((div) => {
      let exact = excelValues[div.kode?.toUpperCase()];
      if (!exact) {
        const found = keywordMap.find((km) => km.match.test(div.uraian));
        if (found) exact = { subTotal: found.subTotal, bobot: found.bobot };
      }
      if (exact) {
        return {
          ...div,
          subTotal: exact.subTotal,
          bobotPersen: exact.bobot,
        };
      }
      return div;
    });

    const newTotal = updatedDivisions.reduce((s, d) => s + (d.subTotal || 0), 0);

    onUpdateRealData({
      ...realData,
      divisions: updatedDivisions,
      totalNilaiRab: newTotal,
      paguAnggaran: 552457000,
      biayaPerM2: realData.luasBangunanM2 > 0 ? newTotal / realData.luasBangunanM2 : 0,
    });

    setExcelSuccessMsg(
      '✅ Seluruh 14/15 Divisi berhasil diselaraskan presisi dengan nominal Excel! (Total: Rp 552.457.000,00)'
    );
    setTimeout(() => setExcelSuccessMsg(null), 6000);
  };

  // Direct table edit: Edit Jumlah Harga (Rp) of a division -> AUTO CALCULATE BOBOT (%) DARI PAGU ANGGARAN
  const handleDivisionSubTotalChange = (divId: string, valStr: string) => {
    const val = parseFloat(valStr) || 0;
    const paguRef = activePagu > 0 ? activePagu : currentTotalRab;

    const updatedDivs = realData.divisions.map((d) => {
      if (d.id === divId) {
        const subTotalVal = Math.max(0, val);
        const calcBobot = paguRef > 0 ? parseFloat(((subTotalVal / paguRef) * 100).toFixed(2)) : d.bobotPersen;
        return { 
          ...d, 
          subTotal: subTotalVal,
          bobotPersen: calcBobot,
        };
      }
      return d;
    });

    const newTotal = updatedDivs.reduce((sum, d) => sum + (d.subTotal || 0), 0);

    onUpdateRealData({
      ...realData,
      divisions: updatedDivs,
      totalNilaiRab: newTotal,
      biayaPerM2: realData.luasBangunanM2 > 0 ? newTotal / realData.luasBangunanM2 : 0,
    });
  };

  // Direct table edit: Edit Bobot (%) of a division -> AUTO CALCULATE JUMLAH HARGA (RP) DARI PAGU ANGGARAN
  const handleDivisionBobotChange = (divId: string, valStr: string) => {
    const bobotVal = parseFloat(valStr) || 0;
    const paguRef = activePagu > 0 ? activePagu : 516851675.10;

    const updatedDivs = realData.divisions.map((d) => {
      if (d.id === divId) {
        const safeBobot = Math.max(0, bobotVal);
        // Otomatis hitung Jumlah Harga (Rp) = (Bobot / 100) * Pagu Anggaran
        const calculatedSubTotal = Math.round(((safeBobot / 100) * paguRef) * 100) / 100;
        return { 
          ...d, 
          bobotPersen: safeBobot,
          subTotal: calculatedSubTotal,
        };
      }
      return d;
    });

    const newTotal = updatedDivs.reduce((sum, d) => sum + (d.subTotal || 0), 0);

    onUpdateRealData({
      ...realData,
      divisions: updatedDivs,
      totalNilaiRab: newTotal,
      biayaPerM2: realData.luasBangunanM2 > 0 ? newTotal / realData.luasBangunanM2 : 0,
    });
  };

  // Auto-balance Bobot % to 100.00% based on Pagu Anggaran / subTotals
  const handleAutoBalanceBobotFromSubTotals = () => {
    const targetTotal = activePagu > 0 ? activePagu : currentTotalRab;
    if (targetTotal <= 0) {
      alert('Pagu anggaran atau total RAB harus lebih dari 0 untuk menghitung bobot otomatis.');
      return;
    }
    const rebalanced = realData.divisions.map((d) => ({
      ...d,
      bobotPersen: parseFloat(((d.subTotal / targetTotal) * 100).toFixed(2)),
    }));

    // Fix 0.01 rounding difference on largest item if needed
    let maxIdx = 0;
    let maxVal = 0;
    rebalanced.forEach((d, idx) => {
      if (d.subTotal > maxVal) {
        maxVal = d.subTotal;
        maxIdx = idx;
      }
    });

    const sumBobot = rebalanced.reduce((s, d) => s + d.bobotPersen, 0);
    const diff = Math.round((100 - sumBobot) * 100) / 100;
    if (Math.abs(diff) > 0 && Math.abs(diff) <= 0.05 && rebalanced.length > 0) {
      rebalanced[maxIdx].bobotPersen = Math.round((rebalanced[maxIdx].bobotPersen + diff) * 100) / 100;
    }

    onUpdateRealData({
      ...realData,
      divisions: rebalanced,
      totalNilaiRab: currentTotalRab,
      biayaPerM2: realData.luasBangunanM2 > 0 ? currentTotalRab / realData.luasBangunanM2 : 0,
    });
  };

  const handleDeleteDivision = (divId: string, kode: string) => {
    if (!confirm(`Hapus Divisi ${kode} beserta seluruh item pekerjaannya?`)) return;
    const updatedDivs = realData.divisions.filter((d) => d.id !== divId);
    const newTotal = updatedDivs.reduce((sum, d) => sum + (d.subTotal || 0), 0);
    const rebalancedDivs = updatedDivs.map((d) => ({
      ...d,
      bobotPersen: newTotal > 0 ? parseFloat(((d.subTotal / newTotal) * 100).toFixed(2)) : 0,
    }));

    onUpdateRealData({
      ...realData,
      divisions: rebalancedDivs,
      totalNilaiRab: newTotal,
      biayaPerM2: realData.luasBangunanM2 > 0 ? newTotal / realData.luasBangunanM2 : 0,
    });
  };

  // --- SUB-ITEM CRUD ---
  const handleItemChange = (divId: string, itemId: string, field: keyof RabSubItem, val: any) => {
    const updatedDivs = realData.divisions.map((d) => {
      if (d.id === divId) {
        const newItems = d.items.map((it) => {
          if (it.id === itemId) {
            const updatedIt = { ...it, [field]: val };
            if (field === 'volume' || field === 'hargaSatuan') {
              const v = field === 'volume' ? parseFloat(val) || 0 : it.volume;
              const h = field === 'hargaSatuan' ? parseFloat(val) || 0 : it.hargaSatuan;
              updatedIt.jumlah = Math.round(v * h * 100) / 100;
            }
            return updatedIt;
          }
          return it;
        });
        const newSubTotal = newItems.reduce((acc, it) => acc + (it.jumlah || 0), 0);
        return {
          ...d,
          items: newItems,
          subTotal: newSubTotal,
        };
      }
      return d;
    });

    const newTotal = updatedDivs.reduce((sum, d) => sum + d.subTotal, 0);
    const rebalancedDivs = updatedDivs.map((d) => ({
      ...d,
      bobotPersen: newTotal > 0 ? parseFloat(((d.subTotal / newTotal) * 100).toFixed(2)) : 0,
    }));

    onUpdateRealData({
      ...realData,
      divisions: rebalancedDivs,
      totalNilaiRab: newTotal,
      biayaPerM2: realData.luasBangunanM2 > 0 ? newTotal / realData.luasBangunanM2 : 0,
    });
  };

  const handleItemBatchChange = (divId: string, itemId: string, updates: Partial<RabSubItem>) => {
    const updatedDivs = realData.divisions.map((d) => {
      if (d.id === divId) {
        const newItems = d.items.map((it) => {
          if (it.id === itemId) {
            const updatedIt = { ...it, ...updates };
            if ('volume' in updates || 'hargaSatuan' in updates) {
              const v = updatedIt.volume || 0;
              const h = updatedIt.hargaSatuan || 0;
              updatedIt.jumlah = Math.round(v * h * 100) / 100;
            }
            return updatedIt;
          }
          return it;
        });
        const newSubTotal = newItems.reduce((acc, it) => acc + (it.jumlah || 0), 0);
        return {
          ...d,
          items: newItems,
          subTotal: newSubTotal,
        };
      }
      return d;
    });

    const newTotal = updatedDivs.reduce((sum, d) => sum + d.subTotal, 0);
    const rebalancedDivs = updatedDivs.map((d) => ({
      ...d,
      bobotPersen: newTotal > 0 ? parseFloat(((d.subTotal / newTotal) * 100).toFixed(2)) : 0,
    }));

    onUpdateRealData({
      ...realData,
      divisions: rebalancedDivs,
      totalNilaiRab: newTotal,
      biayaPerM2: realData.luasBangunanM2 > 0 ? newTotal / realData.luasBangunanM2 : 0,
    });
  };

  const handleAddItem = (divId: string) => {
    const newItem: RabSubItem = {
      id: `item-${Date.now()}`,
      kode: '',
      uraian: 'Pekerjaan Baru',
      volume: 1,
      satuan: 'ls',
      hargaSatuan: 100000,
      jumlah: 100000,
      kategoriBiaya: 'BAHAN',
    };

    const updatedDivs = realData.divisions.map((d) => {
      if (d.id === divId) {
        const newItems = [...d.items, newItem];
        const newSub = newItems.reduce((acc, it) => acc + (it.jumlah || 0), 0);
        return { ...d, items: newItems, subTotal: newSub };
      }
      return d;
    });

    const newTotal = updatedDivs.reduce((sum, d) => sum + d.subTotal, 0);
    const rebalancedDivs = updatedDivs.map((d) => ({
      ...d,
      bobotPersen: newTotal > 0 ? parseFloat(((d.subTotal / newTotal) * 100).toFixed(2)) : 0,
    }));

    onUpdateRealData({
      ...realData,
      divisions: rebalancedDivs,
      totalNilaiRab: newTotal,
      biayaPerM2: realData.luasBangunanM2 > 0 ? newTotal / realData.luasBangunanM2 : 0,
    });
  };

  const handleDeleteItem = (divId: string, itemId: string) => {
    if (!confirm('Hapus rincian item pekerjaan ini?')) return;
    const updatedDivs = realData.divisions.map((d) => {
      if (d.id === divId) {
        const newItems = d.items.filter((it) => it.id !== itemId);
        const newSub = newItems.reduce((acc, it) => acc + (it.jumlah || 0), 0);
        return { ...d, items: newItems, subTotal: newSub };
      }
      return d;
    });
    const newTotal = updatedDivs.reduce((sum, d) => sum + d.subTotal, 0);
    const rebalancedDivs = updatedDivs.map((d) => ({
      ...d,
      bobotPersen: newTotal > 0 ? parseFloat(((d.subTotal / newTotal) * 100).toFixed(2)) : 0,
    }));

    onUpdateRealData({
      ...realData,
      divisions: rebalancedDivs,
      totalNilaiRab: newTotal,
      biayaPerM2: realData.luasBangunanM2 > 0 ? newTotal / realData.luasBangunanM2 : 0,
    });
  };

  // --- AHSP CRUD ---
  const handleAddAhsp = () => {
    if (!newAhspForm.kodePekerjaan.trim() || !newAhspForm.namaPekerjaan.trim()) {
      alert('Mohon isi Kode Pekerjaan dan Nama Pekerjaan');
      return;
    }
    const newAhsp: AhspItem = {
      id: `ahsp-${Date.now()}`,
      kodePekerjaan: newAhspForm.kodePekerjaan.trim(),
      namaPekerjaan: newAhspForm.namaPekerjaan.trim(),
      satuan: newAhspForm.satuan.trim() || 'm³',
      totalHargaSatuan: 0,
      komponen: [],
    };

    const updatedAhsp = [...(realData.ahspList || []), newAhsp];
    onUpdateRealData({
      ...realData,
      ahspList: updatedAhsp,
    });

    setNewAhspForm({ kodePekerjaan: '', namaPekerjaan: '', satuan: 'm³' });
    setIsAddingAhsp(false);
  };

  const handleSaveEditAhsp = () => {
    if (!editingAhsp) return;
    const updatedAhsp = (realData.ahspList || []).map((a) => (a.id === editingAhsp.id ? editingAhsp : a));
    onUpdateRealData({
      ...realData,
      ahspList: updatedAhsp,
    });
    setEditingAhsp(null);
  };

  const handleDeleteAhsp = (ahspId: string, kode: string) => {
    if (!confirm(`Hapus Analisa Pekerjaan ${kode}?`)) return;
    const updatedAhsp = (realData.ahspList || []).filter((a) => a.id !== ahspId);
    onUpdateRealData({
      ...realData,
      ahspList: updatedAhsp,
    });
  };

  const handleAddAhspKomponen = (ahspId: string) => {
    const newKomp: AhspKomponen = {
      id: `c-${Date.now()}`,
      kategori: 'BAHAN',
      uraian: 'Bahan/Upah Baru',
      koefisien: 1.0,
      satuan: 'kg',
      hargaSatuan: 10000,
      totalHarga: 10000,
    };

    const updatedAhspList = (realData.ahspList || []).map((a) => {
      if (a.id === ahspId) {
        const originalTotal = a.totalHargaSatuan;
        const newKomps = [...a.komponen, newKomp];

        if (isAhspRebalanceLocked && originalTotal > 0) {
          const existingKomps = a.komponen;
          const remainingTarget = originalTotal - newKomp.totalHarga;
          if (existingKomps.length > 0 && remainingTarget > 0) {
            const rebalancedExisting = rebalanceAhspComponents(existingKomps, remainingTarget, 'BAHAN_PRIMARY');
            return { ...a, komponen: [...rebalancedExisting, newKomp], totalHargaSatuan: originalTotal };
          }
        }

        const newTotal = newKomps.reduce((s, k) => s + (k.totalHarga || 0), 0);
        return { ...a, komponen: newKomps, totalHargaSatuan: newTotal };
      }
      return a;
    });

    onUpdateRealData({
      ...realData,
      ahspList: updatedAhspList,
    });
  };

  const handleAhspKomponenChange = (
    ahspId: string,
    kompId: string,
    field: keyof AhspKomponen,
    val: any
  ) => {
    const updatedAhspList = (realData.ahspList || []).map((a) => {
      if (a.id === ahspId) {
        const originalTotal = a.totalHargaSatuan;
        const newKomps = a.komponen.map((k) => {
          if (k.id === kompId) {
            const updatedK = { ...k, [field]: val };
            if (field === 'koefisien' || field === 'hargaSatuan') {
              const coef = field === 'koefisien' ? parseFloat(val) || 0 : k.koefisien;
              const hg = field === 'hargaSatuan' ? parseFloat(val) || 0 : k.hargaSatuan;
              updatedK.totalHarga = Math.round(coef * hg * 100) / 100;
            }
            return updatedK;
          }
          return k;
        });

        if (isAhspRebalanceLocked && originalTotal > 0 && (field === 'koefisien' || field === 'hargaSatuan')) {
          const editedKomp = newKomps.find((k) => k.id === kompId)!;
          const otherKomps = newKomps.filter((k) => k.id !== kompId);
          const remainingTarget = originalTotal - editedKomp.totalHarga;

          if (otherKomps.length > 0 && remainingTarget > 0) {
            const rebalancedOthers = rebalanceAhspComponents(otherKomps, remainingTarget, 'BAHAN_PRIMARY');
            const finalKomps = newKomps.map((k) => (k.id === kompId ? editedKomp : rebalancedOthers.find((o) => o.id === k.id) || k));
            return { ...a, komponen: finalKomps, totalHargaSatuan: originalTotal };
          }
        }

        const newTotal = newKomps.reduce((s, k) => s + (k.totalHarga || 0), 0);
        return { ...a, komponen: newKomps, totalHargaSatuan: newTotal };
      }
      return a;
    });

    onUpdateRealData({
      ...realData,
      ahspList: updatedAhspList,
    });
  };

  const handleDeleteAhspKomponen = (ahspId: string, kompId: string) => {
    const updatedAhspList = (realData.ahspList || []).map((a) => {
      if (a.id === ahspId) {
        const originalTotal = a.totalHargaSatuan;
        const newKomps = a.komponen.filter((k) => k.id !== kompId);

        if (isAhspRebalanceLocked && originalTotal > 0 && newKomps.length > 0) {
          const rebalancedKomps = rebalanceAhspComponents(newKomps, originalTotal, 'BAHAN_PRIMARY');
          return { ...a, komponen: rebalancedKomps, totalHargaSatuan: originalTotal };
        } else {
          const newTotal = newKomps.reduce((s, k) => s + (k.totalHarga || 0), 0);
          return { ...a, komponen: newKomps, totalHargaSatuan: newTotal };
        }
      }
      return a;
    });

    onUpdateRealData({
      ...realData,
      ahspList: updatedAhspList,
    });
  };

  // Reset to default
  const handleResetToPreset = () => {
    if (confirm('Kembalikan data ke format standar TK NURIADEEN CENDEKIA (Rp 516.851.675,11)?')) {
      onUpdateRealData(defaultRealSchoolData);
    }
  };

  // Apply to all
  const handleExecuteSync = () => {
    onApplyToAllModules(realData);
    setShowSyncSuccess(true);
    setTimeout(() => setShowSyncSuccess(false), 5000);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-6 rounded-2xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/20 text-blue-300 border border-blue-400/30 uppercase tracking-wider">
              Sumber Data Utama (Master Proyek)
            </span>
            <span className="text-xs text-slate-300">Sesuai Dokumen Fisik RAB & AHSP</span>
          </div>
          <h2 className="text-2xl font-black tracking-tight mt-1 flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-blue-400" />
            <span>Data Real Sekolah (RAB & AHSP)</span>
          </h2>
          <p className="text-xs text-slate-300 mt-1 max-w-2xl">
            Kelola penuh tahapan (Divisi), rincian item, dan analisa AHSP. Anda dapat <strong>menambah, mengedit, dan menghapus</strong> divisi maupun item pekerjaan kapan saja untuk disinkronkan otomatis ke seluruh dokumen LPJ.
          </p>
        </div>

        {/* Global Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
            title="Unduh template Excel resmi untuk pengisian massal Rekap, RAB, dan AHSP"
          >
            <Download className="w-4 h-4 text-emerald-200" />
            <span>Unduh Template Excel</span>
          </button>

          <label className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer">
            <Upload className="w-4 h-4 text-indigo-200" />
            <span>{isParsingExcel ? 'Membaca Excel...' : 'Unggah File Excel'}</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleExcelUpload}
              disabled={isParsingExcel}
              className="hidden"
            />
          </label>

          <button
            type="button"
            onClick={handleResetToPreset}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-3.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>

          <button
            type="button"
            onClick={handleExecuteSync}
            className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/30 transition transform hover:-translate-y-0.5 cursor-pointer"
          >
            <FolderSync className="w-4 h-4 text-emerald-200" />
            <span>Sinkronkan ke Seluruh Menu LPJ</span>
          </button>
        </div>
      </div>

      {/* Excel Success Banner */}
      {excelSuccessMsg && (
        <div className="bg-indigo-50 border border-indigo-300 text-indigo-900 px-5 py-3.5 rounded-xl flex items-center justify-between shadow-xs animate-in fade-in">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-indigo-600 shrink-0" />
            <p className="text-xs font-bold">{excelSuccessMsg}</p>
          </div>
          <button
            type="button"
            onClick={() => setExcelSuccessMsg(null)}
            className="text-xs text-indigo-800 font-semibold underline cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Imported Excel Confirmation Modal */}
      {importedExcelResult && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-5">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-100 rounded-lg text-indigo-700">
                  <FileUp className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900">
                    Konfirmasi Impor Data Excel
                  </h3>
                  <p className="text-xs text-slate-500">
                    File Excel berhasil dibaca. Silakan periksa ringkasan data di bawah.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setImportedExcelResult(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Extracted Summary */}
            <div className="space-y-3 text-xs">
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-2">
                <span className="font-bold text-slate-800 block text-xs border-b border-slate-200 pb-1">
                  Ringkasan Ekstraksi Excel:
                </span>
                <div className="grid grid-cols-2 gap-2 text-slate-700 pt-1">
                  <div>
                    <span className="text-slate-500 block text-[11px]">Nama Sekolah:</span>
                    <strong className="text-slate-900">{importedExcelResult.data.namaSekolah || realData.namaSekolah}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Tahun Anggaran:</span>
                    <strong className="text-slate-900">{importedExcelResult.data.tahunAnggaran || realData.tahunAnggaran}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Jumlah Divisi RAB:</span>
                    <strong className="text-indigo-600 text-sm">{importedExcelResult.summary.divisionsCount} Divisi</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">Jumlah Item Pekerjaan:</span>
                    <strong className="text-indigo-600 text-sm">{importedExcelResult.summary.rabItemsCount} Item</strong>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-500 block text-[11px]">Jumlah Analisa AHSP:</span>
                    <strong className="text-purple-600 text-sm">{importedExcelResult.summary.ahspCount} Pekerjaan AHSP</strong>
                  </div>
                  {importedExcelResult.data.totalNilaiRab !== undefined && (
                    <div className="col-span-2 bg-emerald-50 p-2.5 rounded-lg border border-emerald-200 mt-1">
                      <span className="text-emerald-800 font-medium block text-[11px]">Total Nilai RAB Excel:</span>
                      <strong className="text-emerald-900 text-base font-mono font-bold">
                        {formatRupiah(importedExcelResult.data.totalNilaiRab)}
                      </strong>
                    </div>
                  )}
                </div>
              </div>

              {/* Import Mode selection */}
              <div className="space-y-2">
                <span className="font-bold text-slate-800 block">Pilih Metode Impor:</span>
                <div className="space-y-2">
                  <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/80 cursor-pointer transition">
                    <input
                      type="radio"
                      name="importMode"
                      value="REPLACE"
                      checked={excelImportMode === 'REPLACE'}
                      onChange={() => setExcelImportMode('REPLACE')}
                      className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <strong className="text-xs text-slate-900 block">Ganti Seluruh Data (Replace)</strong>
                      <p className="text-[11px] text-slate-500">
                        Menimpa dan mengganti seluruh Divisi RAB & AHSP dengan isi file Excel baru secara lengkap.
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/80 cursor-pointer transition">
                    <input
                      type="radio"
                      name="importMode"
                      value="MERGE"
                      checked={excelImportMode === 'MERGE'}
                      onChange={() => setExcelImportMode('MERGE')}
                      className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <strong className="text-xs text-slate-900 block">Gabungkan Data (Merge)</strong>
                      <p className="text-[11px] text-slate-500">
                        Memperbarui divisi/item yang kodenya sama dan menambahkan divisi/AHSP baru tanpa menghapus data lain.
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                type="button"
                onClick={() => setImportedExcelResult(null)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold hover:bg-slate-100"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleApplyImportedExcel}
                className="flex items-center gap-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-md cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-purple-200" />
                <span>Terapkan Data Excel</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sync Success Alert */}
      {showSyncSuccess && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 px-5 py-4 rounded-xl flex items-center justify-between shadow-sm animate-in fade-in duration-300">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-emerald-600 shrink-0" />
            <div>
              <h4 className="font-bold text-sm">Sinkronisasi Berhasil Diterapkan ke Seluruh Menu!</h4>
              <p className="text-xs text-emerald-700 mt-0.5">
                Nilai RAB (<strong>{formatRupiah(currentTotalRab)}</strong>), {realData.divisions.length} Divisi Pekerjaan, serta Analisa AHSP telah diperbarui ke RPD, Kwitansi Bahan, Daftar Upah, dan Buku Kas (BKU/BKT/BKB). Tabel Laporan Mingguan & Bobot tetap terlindungi aman.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowSyncSuccess(false)}
            className="text-xs font-semibold text-emerald-800 underline cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-1.5 flex gap-1 overflow-x-auto justify-between items-center">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setActiveSubTab('rekap')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              activeSubTab === 'rekap'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Building className="w-4 h-4" />
            <span>1. Rekapitulasi Biaya ({realData.divisions.length} Divisi)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('rab')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              activeSubTab === 'rab'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>2. Rincian RAB Lengkap</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('ahsp')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              activeSubTab === 'ahsp'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Calculator className="w-4 h-4" />
            <span>3. Analisa Harga Satuan (AHSP)</span>
          </button>
        </div>

        {/* Global Add Division Button */}
        {(activeSubTab === 'rekap' || activeSubTab === 'rab') && (
          <button
            type="button"
            onClick={() => setIsAddingDivision(true)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>+ Tambah Divisi Pekerjaan</span>
          </button>
        )}

        {activeSubTab === 'ahsp' && (
          <button
            type="button"
            onClick={() => setIsAddingAhsp(true)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-lg text-xs font-bold transition cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>+ Tambah AHSP Pekerjaan</span>
          </button>
        )}
      </div>

      {/* Modal Add Division */}
      {isAddingDivision && (
        <div className="bg-blue-50 border border-blue-300 p-4 rounded-xl space-y-3 animate-in fade-in">
          <div className="flex justify-between items-center">
            <h4 className="font-extrabold text-sm text-blue-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600" />
              <span>Tambah Divisi / Tahapan Pekerjaan Baru</span>
            </h4>
            <button
              type="button"
              onClick={() => setIsAddingDivision(false)}
              className="text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Kode Divisi (misal: XIII)</label>
              <input
                type="text"
                placeholder="XIII"
                value={newDivForm.kode}
                onChange={(e) => setNewDivForm({ ...newDivForm, kode: e.target.value })}
                className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs font-bold uppercase"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-xs font-bold text-slate-700 mb-1">Nama Uraian Pekerjaan Divisi</label>
              <input
                type="text"
                placeholder="PEKERJAAN OUTDOOR & TAMAN Halaman"
                value={newDivForm.uraian}
                onChange={(e) => setNewDivForm({ ...newDivForm, uraian: e.target.value })}
                className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs font-bold uppercase"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">Jumlah Harga (Rp)</label>
              <input
                type="number"
                min="0"
                step="any"
                placeholder="0"
                value={newDivForm.subTotal || ''}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  const autoBobot = activePagu > 0 ? parseFloat(((val / activePagu) * 100).toFixed(2)) : newDivForm.bobotPersen;
                  setNewDivForm({ ...newDivForm, subTotal: val, bobotPersen: autoBobot });
                }}
                className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono font-bold text-slate-800"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Bobot (%) <span className="text-[10px] text-blue-600 font-normal">(Hitung Rp otomatis)</span>
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                placeholder="0.00"
                value={newDivForm.bobotPersen || ''}
                onChange={(e) => {
                  const bVal = parseFloat(e.target.value) || 0;
                  const autoRp = activePagu > 0 ? Math.round(((bVal / 100) * activePagu) * 100) / 100 : newDivForm.subTotal;
                  setNewDivForm({ ...newDivForm, bobotPersen: bVal, subTotal: autoRp });
                }}
                className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono font-bold text-blue-700"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsAddingDivision(false)}
              className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-100 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleAddDivision}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold cursor-pointer"
            >
              Simpan Divisi Baru
            </button>
          </div>
        </div>
      )}

      {/* Modal Edit Division */}
      {editingDivision && (
        <div className="bg-amber-50 border border-amber-300 p-4 rounded-xl space-y-3 animate-in fade-in">
          <div className="flex justify-between items-center">
            <h4 className="font-extrabold text-sm text-amber-900 flex items-center gap-2">
              <Edit2 className="w-4 h-4 text-amber-600" />
              <span>Edit Data Divisi, Jumlah Harga (Rp) & Bobot (%)</span>
            </h4>
            <button
              type="button"
              onClick={() => setEditingDivision(null)}
              className="text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Kode Divisi</label>
              <input
                type="text"
                value={editingDivision.kode}
                onChange={(e) => setEditingDivision({ ...editingDivision, kode: e.target.value })}
                className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs font-bold uppercase"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-xs font-bold text-slate-700 mb-1">Nama Uraian Pekerjaan Divisi</label>
              <input
                type="text"
                value={editingDivision.uraian}
                onChange={(e) => setEditingDivision({ ...editingDivision, uraian: e.target.value })}
                className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs font-bold uppercase"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">Jumlah Harga (Rp)</label>
              <input
                type="number"
                min="0"
                step="any"
                value={editingDivision.subTotal ?? ''}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  const autoBobot = activePagu > 0 ? parseFloat(((val / activePagu) * 100).toFixed(2)) : (editingDivision.bobotPersen || 0);
                  setEditingDivision({ 
                    ...editingDivision, 
                    subTotal: val,
                    bobotPersen: autoBobot 
                  });
                }}
                className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono font-bold text-slate-800"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Bobot (%) <span className="text-[10px] text-blue-600 font-normal">(Hitung Rp otomatis)</span>
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={editingDivision.bobotPersen ?? ''}
                onChange={(e) => {
                  const bVal = parseFloat(e.target.value) || 0;
                  const autoRp = activePagu > 0 ? Math.round(((bVal / 100) * activePagu) * 100) / 100 : (editingDivision.subTotal || 0);
                  setEditingDivision({ 
                    ...editingDivision, 
                    bobotPersen: bVal,
                    subTotal: autoRp 
                  });
                }}
                className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs font-mono font-bold text-blue-700"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setEditingDivision(null)}
              className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-100 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSaveEditDivision}
              className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-bold cursor-pointer"
            >
              Simpan Perubahan
            </button>
          </div>
        </div>
      )}

      {/* Modal Add AHSP Pekerjaan */}
      {isAddingAhsp && (
        <div className="bg-purple-50 border border-purple-300 p-4 rounded-xl space-y-3 animate-in fade-in">
          <div className="flex justify-between items-center">
            <h4 className="font-extrabold text-sm text-purple-900 flex items-center gap-2">
              <Calculator className="w-4 h-4 text-purple-600" />
              <span>Tambah Analisa AHSP Pekerjaan Baru</span>
            </h4>
            <button
              type="button"
              onClick={() => setIsAddingAhsp(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Kode Pekerjaan</label>
              <input
                type="text"
                placeholder="XIII.1"
                value={newAhspForm.kodePekerjaan}
                onChange={(e) => setNewAhspForm({ ...newAhspForm, kodePekerjaan: e.target.value })}
                className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs font-bold"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">Nama Pekerjaan</label>
              <input
                type="text"
                placeholder="1 m³ Pekerjaan Taman & Rumput"
                value={newAhspForm.namaPekerjaan}
                onChange={(e) => setNewAhspForm({ ...newAhspForm, namaPekerjaan: e.target.value })}
                className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Satuan AHSP</label>
              <input
                type="text"
                placeholder="m³ / m²"
                value={newAhspForm.satuan}
                onChange={(e) => setNewAhspForm({ ...newAhspForm, satuan: e.target.value })}
                className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs font-bold text-center"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsAddingAhsp(false)}
              className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-100"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleAddAhsp}
              className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs font-bold"
            >
              Simpan AHSP Baru
            </button>
          </div>
        </div>
      )}

      {/* Modal Edit AHSP Pekerjaan */}
      {editingAhsp && (
        <div className="bg-purple-50 border border-purple-300 p-4 rounded-xl space-y-3 animate-in fade-in">
          <div className="flex justify-between items-center">
            <h4 className="font-extrabold text-sm text-purple-900 flex items-center gap-2">
              <Edit2 className="w-4 h-4 text-purple-600" />
              <span>Edit Head Analisa AHSP Pekerjaan</span>
            </h4>
            <button
              type="button"
              onClick={() => setEditingAhsp(null)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Kode Pekerjaan</label>
              <input
                type="text"
                value={editingAhsp.kodePekerjaan}
                onChange={(e) => setEditingAhsp({ ...editingAhsp, kodePekerjaan: e.target.value })}
                className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs font-bold"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">Nama Pekerjaan</label>
              <input
                type="text"
                value={editingAhsp.namaPekerjaan}
                onChange={(e) => setEditingAhsp({ ...editingAhsp, namaPekerjaan: e.target.value })}
                className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Satuan AHSP</label>
              <input
                type="text"
                value={editingAhsp.satuan}
                onChange={(e) => setEditingAhsp({ ...editingAhsp, satuan: e.target.value })}
                className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-xs font-bold text-center"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setEditingAhsp(null)}
              className="px-3 py-1.5 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-100"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSaveEditAhsp}
              className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs font-bold"
            >
              Simpan AHSP
            </button>
          </div>
        </div>
      )}

      {/* Sub-tab 1: Rekapitulasi (Matching image.png page 1) */}
      {activeSubTab === 'rekap' && (
        <div className="bg-white rounded-2xl border border-slate-300 shadow-md p-6 space-y-6">
          <div className="text-center border-b pb-4 space-y-1">
            <h3 className="text-lg font-black text-slate-900 tracking-wider">REKAPITULASI BIAYA</h3>
            <p className="text-xs font-bold text-slate-700 uppercase">{realData.satuanPendidikan}</p>
            <p className="text-xs font-bold text-slate-700 uppercase">{realData.kegiatan}</p>
            <p className="text-xs font-extrabold text-blue-700 uppercase">{realData.namaSekolah}</p>
            <p className="text-[11px] text-slate-500 uppercase">{realData.lokasi}</p>
          </div>

          {/* School Header Information Editable Inputs */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
            <div>
              <label className="block font-semibold text-slate-600 mb-1">Nama Satuan Sekolah</label>
              <input
                type="text"
                value={realData.namaSekolah}
                onChange={(e) => handleHeaderChange('namaSekolah', e.target.value)}
                className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 font-bold text-slate-800"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-600 mb-1">Kegiatan / Ruang</label>
              <input
                type="text"
                value={realData.kegiatan}
                onChange={(e) => handleHeaderChange('kegiatan', e.target.value)}
                className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 font-medium text-slate-800"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-600 mb-1">Kabupaten / Kota & Propinsi</label>
              <input
                type="text"
                value={realData.lokasi}
                onChange={(e) => handleHeaderChange('lokasi', e.target.value)}
                className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 font-medium text-slate-800"
              />
            </div>
            <div className="bg-indigo-50/80 p-2.5 rounded-lg border border-indigo-200">
              <div className="flex items-center justify-between mb-1">
                <label className="block font-bold text-indigo-950">Pagu Anggaran (Rp)</label>
                <button
                  type="button"
                  onClick={handleSetPaguFromTotalRab}
                  className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold underline cursor-pointer"
                  title="Samakan Pagu dengan Total RAB saat ini"
                >
                  Set dari RAB
                </button>
              </div>
              <input
                type="number"
                min="0"
                step="any"
                value={realData.paguAnggaran ?? (currentTotalRab || 516851675.10)}
                onChange={(e) => handleHeaderChange('paguAnggaran', e.target.value)}
                className="w-full bg-white border border-indigo-300 rounded px-2.5 py-1.5 font-mono font-black text-indigo-900 focus:ring-2 focus:ring-indigo-500"
                placeholder="0"
              />
              <span className="block text-[10px] text-indigo-700 font-medium mt-0.5">
                {formatRupiah(activePagu)}
              </span>
            </div>
          </div>

          {/* Budget Allocation Monitor Card */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-gradient-to-r from-slate-900 to-indigo-950 p-4 rounded-xl text-white shadow-sm text-xs">
            <div>
              <span className="text-slate-400 font-semibold text-[11px] block">TOTAL PAGU ANGGARAN (ACUAN 100%):</span>
              <span className="text-base font-mono font-black text-amber-300">
                {formatRupiah(activePagu)}
              </span>
            </div>
            <div>
              <span className="text-slate-400 font-semibold text-[11px] block">TOTAL RAB TERKINI (HASIL DIVISI):</span>
              <span className="text-base font-mono font-black text-emerald-300">
                {formatRupiah(currentTotalRab)}
              </span>
              <span className="text-[10px] text-slate-300 ml-1">
                ({totalBobotTerkini.toFixed(2)}%)
              </span>
            </div>
            <div>
              <span className="text-slate-400 font-semibold text-[11px] block">STATUS ALOKASI / SISA PAGU:</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                {Math.abs(sisaPagu) <= 10 || Math.abs(currentTotalRab - activePagu) <= 10 ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    <CheckCircle className="w-3 h-3 text-emerald-400" />
                    Pas Sesuai Pagu (100.00% Terserap)
                  </span>
                ) : sisaPagu > 10 ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    Sisa Pagu: {formatRupiah(sisaPagu)} ({((sisaPagu / activePagu) * 100).toFixed(2)}%)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                    Melebihi Pagu: {formatRupiah(Math.abs(sisaPagu))}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Toolbar Actions for Rekap Table */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">Tabel Rekapitulasi:</span>
              <span className="text-[11px] text-slate-500">
                {realData.divisions.length} Divisi Pekerjaan
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleApplyExcelPrecise552M}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-600 hover:to-indigo-600 text-white shadow-sm transition cursor-pointer"
                title="Sesuaikan seluruh nominal divisi agar presisi sama persis dengan tabel Excel RAB Anda (Total Rp 552.457.000,00)"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-amber-300" />
                <span>⚡ Presisi Excel (Rp 552 Jt)</span>
              </button>

              <button
                type="button"
                onClick={handleScaleAllToPagu}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-sm transition cursor-pointer"
                title="Serap penuh 100% Pagu Anggaran ke seluruh divisi secara proporsional tanpa sisa selisih desimal"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Serap Penuh Pagu (100%)</span>
              </button>

              <button
                type="button"
                onClick={() => setIsEditingRekapTable(!isEditingRekapTable)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold shadow-xs transition cursor-pointer ${
                  isEditingRekapTable
                    ? 'bg-amber-600 hover:bg-amber-700 text-white'
                    : 'bg-white hover:bg-slate-100 text-amber-800 border border-amber-300'
                }`}
                title="Aktifkan mode edit cepat Jumlah Harga (Rp) dan Bobot (%) langsung di tabel"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>{isEditingRekapTable ? 'Kunci Edit Nilai' : 'Edit Nilai Cepat (Rp & %)'}</span>
              </button>

              <button
                type="button"
                onClick={handleAutoBalanceBobotFromSubTotals}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 shadow-xs transition cursor-pointer"
                title="Hitung ulang otomatis Bobot (%) dari seluruh Jumlah Harga agar pas 100.00%"
              >
                <Wand2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Hitung Ulang Bobot (100%)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setNewDivForm({ kode: '', uraian: '', subTotal: 0, bobotPersen: 0 });
                  setIsAddingDivision(true);
                }}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-xs transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Divisi</span>
              </button>
            </div>
          </div>

          {/* Alert Banner for Rounding Difference */}
          {hasRoundingDifference && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300 text-blue-950 p-4 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-xs animate-in fade-in">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-blue-100 rounded-xl text-blue-700 shrink-0 mt-0.5 md:mt-0">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-extrabold text-sm text-blue-900">
                    💡 Terdeteksi Selisih Pembulatan Bobot 2 Desimal vs Excel
                  </h4>
                  <p className="text-xs text-blue-700 mt-0.5">
                    Tabel saat ini menghitung dari pembulatan bobot 2 desimal (Persiapan: Rp 14.695.356,20). Klik tombol di samping untuk langsung menyamakan setiap divisi dengan angka nominal riil Excel Anda (Persiapan: Rp 14.670.041,65) hingga ke nilai sen (Total: Rp 552.457.000,00).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleApplyExcelPrecise552M}
                className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold px-4 py-2.5 rounded-xl shadow-md transition cursor-pointer flex items-center gap-1.5"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>⚡ Samakan dengan Excel Sekarang</span>
              </button>
            </div>
          )}

          {/* Rekap Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-slate-400 text-xs text-slate-800">
              <thead>
                <tr className="bg-slate-200 font-extrabold text-slate-800 uppercase text-center">
                  <th className="border border-slate-400 py-2.5 px-3 w-16">NO.</th>
                  <th className="border border-slate-400 py-2.5 px-4 text-left">URAIAN PEKERJAAN (DIVISI / TAHAPAN)</th>
                  <th className="border border-slate-400 py-2.5 px-4 text-right w-56">JUMLAH HARGA (RP)</th>
                  <th className="border border-slate-400 py-2.5 px-3 text-center w-32">BOBOT (%)</th>
                  <th className="border border-slate-400 py-2.5 px-3 text-center w-24">AKSI</th>
                </tr>
              </thead>
              <tbody>
                {realData.divisions.map((div, divIdx) => (
                  <tr key={div.id} className="hover:bg-blue-50/50">
                    <td className="border border-slate-300 py-2 px-3 text-center font-extrabold text-blue-900 bg-slate-50 font-mono">
                      {div.kode || toRoman(divIdx + 1)}
                    </td>
                    <td className="border border-slate-300 py-2 px-4 font-semibold text-slate-800">
                      {div.uraian}
                    </td>
                    <td className="border border-slate-300 py-2 px-3 text-right font-mono font-medium">
                      {isEditingRekapTable ? (
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-[10px] text-slate-500 font-bold">Rp</span>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={div.subTotal || ''}
                            onChange={(e) => handleDivisionSubTotalChange(div.id, e.target.value)}
                            placeholder="0"
                            className="w-36 text-right font-mono font-bold text-slate-900 px-2 py-1 bg-amber-50/60 border border-amber-400 rounded focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden text-xs"
                          />
                        </div>
                      ) : (
                        <div className="flex items-center justify-end group cursor-pointer" onClick={() => setEditingDivision(div)}>
                          <span className="font-semibold">{formatRupiah(div.subTotal)}</span>
                          <Edit3 className="w-3 h-3 ml-1 text-slate-400 opacity-0 group-hover:opacity-100 transition" />
                        </div>
                      )}
                    </td>
                    <td className="border border-slate-300 py-2 px-3 text-center font-mono font-bold text-blue-700">
                      {isEditingRekapTable ? (
                        <div className="flex items-center justify-center gap-1">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={div.bobotPersen || ''}
                            onChange={(e) => handleDivisionBobotChange(div.id, e.target.value)}
                            placeholder="0.00"
                            className="w-20 text-center font-mono font-bold text-blue-900 px-1.5 py-1 bg-blue-50 border border-blue-400 rounded focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden text-xs"
                          />
                          <span className="text-[10px] text-blue-800 font-bold">%</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center group cursor-pointer" onClick={() => setEditingDivision(div)}>
                          <span>{div.bobotPersen.toFixed(2)}%</span>
                          <Edit3 className="w-3 h-3 ml-1 text-blue-400 opacity-0 group-hover:opacity-100 transition" />
                        </div>
                      )}
                    </td>
                    <td className="border border-slate-300 py-2 px-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => setEditingDivision(div)}
                          className="p-1.5 text-slate-600 hover:text-amber-700 hover:bg-amber-100 rounded transition cursor-pointer"
                          title="Edit lengkap divisi, jumlah harga & bobot"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteDivision(div.id, div.kode)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                          title="Hapus divisi ini"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-500">
                  <td colSpan={2} className="border border-slate-400 py-3 px-4 text-right tracking-wider uppercase">
                    SUB TOTAL RINCIAN PEKERJAAN
                  </td>
                  <td className="border border-slate-400 py-3 px-4 text-right font-mono text-sm text-blue-900">
                    {formatRupiah(currentTotalRab)}
                  </td>
                  <td className="border border-slate-400 py-3 px-3 text-center font-mono text-sm text-blue-900">
                    {realData.divisions.reduce((s, d) => s + (d.bobotPersen || 0), 0).toFixed(2)}%
                  </td>
                  <td className="border border-slate-400"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Notes Bottom Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-300 text-xs">
            <div className="flex items-center justify-between border-b sm:border-b-0 sm:border-r border-slate-300 pb-2 sm:pb-0 sm:pr-4">
              <span className="font-bold text-slate-700 uppercase">LUAS BANGUNAN :</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={realData.luasBangunanM2}
                  onChange={(e) => handleHeaderChange('luasBangunanM2', e.target.value)}
                  className="w-20 bg-white border border-slate-300 rounded px-2 py-1 font-bold text-right text-slate-800"
                />
                <span className="font-bold text-slate-600">M²</span>
              </div>
            </div>

            <div className="flex items-center justify-between sm:pl-4">
              <span className="font-bold text-slate-700 uppercase">BIAYA PERSATUAN LUAS/M2 :</span>
              <span className="font-mono font-extrabold text-blue-800 text-sm">
                {formatRupiah(biayaPerM2)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Sub-tab 2: Rincian RAB Lengkap (Divisi I s/d XII) */}
      {activeSubTab === 'rab' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200">
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">RAB RINCIAN ITEM PER DIVISI / TAHAPAN</h3>
              <p className="text-xs text-slate-500">
                Ubah volume, harga satuan, kategori, atau tambah/hapus divisi dan item pekerjaan secara bebas.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-xs text-slate-500 block">Total Proyek:</span>
                <span className="font-mono font-bold text-blue-700 text-sm">
                  {formatRupiah(currentTotalRab)}
                </span>
              </div>
              <button
                type="button"
                onClick={handleApplyExcelPrecise552M}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black bg-gradient-to-r from-blue-700 to-indigo-700 hover:from-blue-600 hover:to-indigo-600 text-white shadow-sm transition cursor-pointer"
                title="Sesuaikan seluruh nominal divisi agar presisi sama persis dengan tabel Excel RAB Anda (Total Rp 552.457.000,00)"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-amber-300" />
                <span>⚡ Presisi Excel (Rp 552 Jt)</span>
              </button>
              <button
                type="button"
                onClick={handleExecuteSync}
                className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold shadow-md shadow-emerald-600/20 transition cursor-pointer"
                title="Terapkan seluruh perubahan RAB dan AHSP ke Kwitansi, Bon Toko, SPB, dan BKU secara langsung"
              >
                <FolderSync className="w-3.5 h-3.5" />
                <span>⚡ Sinkronkan ke Kwitansi & Bon</span>
              </button>
              <button
                type="button"
                onClick={() => setIsAddingDivision(true)}
                className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Divisi Baru</span>
              </button>
            </div>
          </div>

          {/* Budget Absorption & Status Belanja Information Banner */}
          <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-slate-50 border border-emerald-200/80 p-3.5 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-700 shadow-2xs">
            <div className="flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-emerald-950 block">
                  Fitur Penyerapan Anggaran & Status Belanja Swakelola (Budget Absorption Engine)
                </span>
                <span className="text-slate-600 text-[11px]">
                  Jika terdapat pos anggaran yang dilarang dibelanjakan langsung (seperti Air Kerja/Listrik Sementara), ubah statusnya menjadi <strong>🔄 Dialihkan/Diserap</strong>. Anggarannya otomatis dialihkan 100% ke belanja bahan konstruksi atau upah fisik agar bebas dari temuan audit dan pagu tetap terserap habis tanpa sisa.
                </span>
              </div>
            </div>
          </div>

          {/* Tag Barang Pabrikasi / Jadi Protection Banner */}
          <div className="bg-gradient-to-r from-indigo-50 via-blue-50 to-slate-50 border border-indigo-200 p-3.5 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-700 shadow-2xs">
            <div className="flex items-start gap-2.5">
              <Tag className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-indigo-950 block">
                  Fitur Proteksi Barang Pabrikasi / Jadi (Prefab & Assembled Unit Engine)
                </span>
                <span className="text-slate-600 text-[11px]">
                  Tandai item unit utuh (seperti Pintu Utama PJ1, Jendela Alumunium J1, Kusen, Meja & Kursi) dengan tag <strong>🏷️ Pabrikasi (Utuh)</strong>. Item yang ditandai dijamin <strong>TIDAK AKAN DIPECAH</strong> menjadi material eceran (seperti pasir, semen, baut, profil) oleh simulasi AHSP maupun saat Auto Generate Kwitansi & Bon Toko, melainkan dibelanjakan utuh per unit/set sesuai standar SPJ BPK/Inspektorat.
                </span>
              </div>
            </div>
          </div>

          {/* Alert Banner for Rounding Difference in Sub-tab 2 */}
          {hasRoundingDifference && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300 text-blue-950 p-4 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-xs animate-in fade-in">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-blue-100 rounded-xl text-blue-700 shrink-0 mt-0.5 md:mt-0">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-extrabold text-sm text-blue-900">
                    💡 Terdeteksi Selisih Pembulatan Bobot 2 Desimal vs Excel
                  </h4>
                  <p className="text-xs text-blue-700 mt-0.5">
                    Divisi di bawah saat ini menghitung dari pembulatan bobot 2 desimal (Persiapan: Rp 14.695.356,20). Klik tombol di samping untuk langsung menyamakan setiap divisi dengan angka nominal riil Excel Anda (Persiapan: Rp 14.670.041,65) hingga ke nilai sen (Total: Rp 552.457.000,00).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleApplyExcelPrecise552M}
                className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold px-4 py-2.5 rounded-xl shadow-md transition cursor-pointer flex items-center gap-1.5"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>⚡ Samakan dengan Excel Sekarang</span>
              </button>
            </div>
          )}

          {realData.divisions.map((div, divIdx) => {
            const isExpanded = !!expandedDivisions[div.id];
            return (
              <div key={div.id} className="bg-white rounded-xl border border-slate-300 shadow-xs overflow-hidden">
                {/* Division Header */}
                <div
                  onClick={() => toggleDivision(div.id)}
                  className="bg-slate-100 hover:bg-slate-200/80 px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3 cursor-pointer select-none transition"
                >
                  <div className="flex items-center gap-2.5">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-slate-600" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-600" />
                    )}
                    <span className="font-black text-xs text-blue-900 bg-blue-100 px-2 py-0.5 rounded font-mono shadow-xs">
                      {toRoman(divIdx + 1)}
                    </span>
                    <span className="font-bold text-xs text-slate-900 uppercase tracking-tight">{div.uraian}</span>
                  </div>

                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-slate-500 font-mono text-[11px]">
                      Bobot: <strong className="text-blue-700">{div.bobotPersen.toFixed(2)}%</strong>
                    </span>
                    <span className="font-mono font-bold text-slate-900 text-xs">
                      {formatRupiah(div.subTotal)}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingDivision(div);
                      }}
                      className="p-1 text-slate-500 hover:text-amber-600 rounded"
                      title="Edit Nama Divisi"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteDivision(div.id, div.kode);
                      }}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded"
                      title="Hapus Divisi"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddItem(div.id);
                      }}
                      className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-[11px] font-semibold transition ml-2"
                      title="Tambah rincian item pekerjaan ke divisi ini"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Item</span>
                    </button>
                  </div>
                </div>

                {/* Division Items Table */}
                {isExpanded && (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-xs text-slate-800">
                      <thead>
                        <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 text-center text-[11px]">
                          <th className="py-2 px-2 w-10 border-r border-slate-200">NO</th>
                          <th className="py-2 px-3 text-left border-r border-slate-200">URAIAN PEKERJAAN</th>
                          <th className="py-2 px-2 w-24 border-r border-slate-200">KATEGORI</th>
                          <th className="py-2 px-2 w-48 border-r border-slate-200 text-center">TAG KWITANSI</th>
                          <th className="py-2 px-2 w-36 border-r border-slate-200">STATUS BELANJA</th>
                          <th className="py-2 px-2 w-20 border-r border-slate-200">VOLUME</th>
                          <th className="py-2 px-2 w-16 border-r border-slate-200">SATUAN</th>
                          <th className="py-2 px-3 w-28 border-r border-slate-200 text-right">HARGA (RP)</th>
                          <th className="py-2 px-3 w-32 border-r border-slate-200 text-right">JUMLAH (RP)</th>
                          <th className="py-2 px-2 w-12 text-center">AKSI</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {div.items.map((it, idx) => {
                          const isDialihkan = it.statusBelanja === 'DIALIHKAN';
                          return (
                            <tr key={it.id} className={`hover:bg-slate-50/80 ${isDialihkan ? 'bg-amber-50/40' : ''}`}>
                              <td className="py-2 px-2 text-center text-slate-500 font-mono text-[11px] border-r border-slate-200">
                                {it.kode || idx + 1}
                              </td>
                              <td className="py-2 px-3 border-r border-slate-200">
                                <div className="flex items-center gap-1.5 group/item">
                                  <input
                                    type="text"
                                    value={it.uraian}
                                    onChange={(e) => handleItemChange(div.id, it.id, 'uraian', e.target.value)}
                                    className="w-full bg-transparent hover:bg-white focus:bg-white border border-transparent focus:border-blue-400 rounded px-1.5 py-0.5 font-medium text-slate-800"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleOpenRabAhspPreview(div, it)}
                                    className="shrink-0 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 shadow-2xs flex items-center gap-1 transition cursor-pointer"
                                    title="Lihat Pratinjau AHSP & Tercetak di Bon/SPB"
                                  >
                                    <Eye className="w-3 h-3 text-blue-600" />
                                    <span>AHSP & Bon</span>
                                  </button>
                                </div>
                              </td>
                              <td className="py-2 px-2 border-r border-slate-200 text-center">
                                <select
                                  value={it.kategoriBiaya || 'BAHAN'}
                                  onChange={(e) => handleItemChange(div.id, it.id, 'kategoriBiaya', e.target.value)}
                                  className={`border rounded px-1.5 py-0.5 text-[10px] font-bold cursor-pointer transition ${
                                    it.kategoriBiaya === 'PINTU_JENDELA'
                                      ? 'bg-sky-100 text-sky-900 border-sky-400 font-extrabold'
                                      : it.kategoriBiaya === 'CETAK'
                                      ? 'bg-cyan-100 text-cyan-900 border-cyan-400 font-extrabold'
                                      : it.kategoriBiaya === 'SIPLAH'
                                      ? 'bg-orange-100 text-orange-900 border-orange-400 font-extrabold'
                                      : it.kategoriBiaya === 'PERENCANA'
                                      ? 'bg-indigo-100 text-indigo-900 border-indigo-400 font-extrabold'
                                      : it.kategoriBiaya === 'PENGAWAS'
                                      ? 'bg-violet-100 text-violet-900 border-violet-400 font-extrabold'
                                      : it.kategoriBiaya === 'PENGELOLA'
                                      ? 'bg-amber-100 text-amber-900 border-amber-400 font-extrabold'
                                      : it.kategoriBiaya === 'UPAH_BAHAN'
                                      ? 'bg-amber-100 text-amber-900 border-amber-400 font-extrabold shadow-2xs'
                                      : it.kategoriBiaya === 'UPAH'
                                      ? 'bg-purple-100 text-purple-900 border-purple-300'
                                      : it.kategoriBiaya === 'ALAT'
                                      ? 'bg-blue-100 text-blue-900 border-blue-300'
                                      : it.kategoriBiaya === 'SMKK'
                                      ? 'bg-rose-100 text-rose-900 border-rose-300'
                                      : it.kategoriBiaya === 'LAINNYA'
                                      ? 'bg-slate-100 text-slate-700 border-slate-300'
                                      : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  }`}
                                >
                                  <option value="BAHAN">BAHAN</option>
                                  <option value="UPAH">UPAH</option>
                                  <option value="ALAT">ALAT</option>
                                  <option value="PINTU_JENDELA">🚪 PINTU & JENDELA</option>
                                  <option value="SMKK">SMKK</option>
                                  <option value="UPAH_BAHAN">UPAH & BAHAN</option>
                                  <option value="CETAK">CETAK</option>
                                  <option value="SIPLAH">SIPLAH</option>
                                  <option value="PERENCANA">PERENCANA</option>
                                  <option value="PENGAWAS">PENGAWAS</option>
                                  <option value="PENGELOLA">PENGELOLA</option>
                                  <option value="LAINNYA">LAINNYA</option>
                                </select>
                              </td>
                              {/* Tag Kwitansi Column with Direct Add/Remove */}
                              <td className="py-2 px-2 border-r border-slate-200 text-center">
                                <div className="flex items-center justify-center">
                                  <KwitansiTagManager
                                    tags={it.tags}
                                    itemHint={it}
                                    stores={stores}
                                    onChangeTags={(newTags) => {
                                      const isFur = newTags.some((t) => t.toUpperCase() === 'FUR');
                                      const isSmkk = newTags.some((t) => t.toUpperCase() === 'SMKK');
                                      const isCtk = newTags.some((t) => t.toUpperCase() === 'CTK');
                                      const isSiplah = newTags.some((t) => t.toUpperCase() === 'SIPLAH');
                                      const isKonsP = newTags.some((t) => t.toUpperCase() === 'KONS-P');
                                      const isKonsW = newTags.some((t) => t.toUpperCase() === 'KONS-W');
                                      const isSpj = newTags.some((t) => t.toUpperCase() === 'SPJ');
                                      const isMat = newTags.some((t) => t.toUpperCase() === 'MAT');

                                      let newKategori = it.kategoriBiaya;
                                      if (isFur) newKategori = 'PINTU_JENDELA';
                                      else if (isSmkk) newKategori = 'SMKK';
                                      else if (isCtk) newKategori = 'CETAK';
                                      else if (isSiplah) newKategori = 'SIPLAH';
                                      else if (isKonsP) newKategori = 'PERENCANA';
                                      else if (isKonsW) newKategori = 'PENGAWAS';
                                      else if (isSpj) newKategori = 'PENGELOLA';
                                      else if (isMat && !it.kategoriBiaya) newKategori = 'BAHAN';

                                      handleItemBatchChange(div.id, it.id, {
                                        tags: newTags,
                                        isBarangPabrikasi: isFur || it.isBarangPabrikasi,
                                        kategoriBiaya: newKategori,
                                      });
                                    }}
                                  />
                                </div>
                              </td>
                              <td className="py-2 px-2 border-r border-slate-200 text-center">
                                <div className="flex flex-col items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleItemChange(
                                        div.id,
                                        it.id,
                                        'statusBelanja',
                                        isDialihkan ? 'DIBELANJAKAN' : 'DIALIHKAN'
                                      )
                                    }
                                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition flex items-center gap-1 cursor-pointer ${
                                      isDialihkan
                                        ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                                        : 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200'
                                    }`}
                                    title={
                                      isDialihkan
                                        ? 'Item ini TIDAK dibelanjakan langsung, melainkan anggarannya diserap 100% ke belanja fisik lainnya agar pagu tetap seimbang tanpa temuan audit. Klik untuk mengaktifkan belanja langsung.'
                                        : 'Item ini dibelanjakan langsung sesuai AHSP. Klik jika ingin mengalihkan/menyerap anggarannya ke belanja material/upah lain.'
                                    }
                                  >
                                    <span>{isDialihkan ? '🔄 Dialihkan/Diserap' : '🟢 Dibelanjakan'}</span>
                                  </button>
                                  {isDialihkan && (
                                    <select
                                      value={it.targetReallokasi || 'PROPORSIONAL_BAHAN'}
                                      onChange={(e) =>
                                        handleItemChange(div.id, it.id, 'targetReallokasi', e.target.value)
                                      }
                                      className="text-[9px] bg-white border border-amber-300 rounded px-1 py-0.5 text-amber-900 font-semibold cursor-pointer"
                                      title="Pilih ke pos mana anggaran item ini diserap"
                                    >
                                      <option value="PROPORSIONAL_BAHAN">Ke Bahan Fisik</option>
                                      <option value="UPAH">Ke Upah Tukang</option>
                                    </select>
                                  )}
                                </div>
                              </td>
                              <td className="py-2 px-2 border-r border-slate-200 text-right">
                                <input
                                  type="number"
                                  step="any"
                                  value={it.volume}
                                  onChange={(e) => handleItemChange(div.id, it.id, 'volume', e.target.value)}
                                  className="w-full bg-transparent hover:bg-white focus:bg-white border border-transparent focus:border-blue-400 rounded px-1.5 py-0.5 text-right font-mono"
                                />
                              </td>
                              <td className="py-2 px-2 border-r border-slate-200 text-center">
                                <input
                                  type="text"
                                  value={it.satuan}
                                  onChange={(e) => handleItemChange(div.id, it.id, 'satuan', e.target.value)}
                                  className="w-full bg-transparent hover:bg-white focus:bg-white border border-transparent focus:border-blue-400 rounded px-1.5 py-0.5 text-center font-mono text-slate-600"
                                />
                              </td>
                              <td className="py-2 px-3 border-r border-slate-200 text-right">
                                <input
                                  type="number"
                                  step="any"
                                  value={it.hargaSatuan}
                                  onChange={(e) => handleItemChange(div.id, it.id, 'hargaSatuan', e.target.value)}
                                  className="w-full bg-transparent hover:bg-white focus:bg-white border border-transparent focus:border-blue-400 rounded px-1.5 py-0.5 text-right font-mono"
                                />
                              </td>
                              <td className="py-2 px-3 border-r border-slate-200 text-right font-mono font-semibold text-slate-900">
                                {formatRupiah(it.jumlah)}
                              </td>
                              <td className="py-2 px-2 text-center">
                                <div className="flex items-center justify-center gap-0.5">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenRabAhspPreview(div, it)}
                                    className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 transition rounded cursor-pointer"
                                    title="Pratinjau AHSP & Dokumen Bon/SPB"
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteItem(div.id, it.id)}
                                    className="p-1 text-slate-400 hover:text-rose-600 transition rounded cursor-pointer"
                                    title="Hapus baris item ini"
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
                        <tr className="bg-slate-100 font-bold text-slate-900 border-t border-slate-300">
                          <td colSpan={8} className="py-2 px-4 text-right uppercase tracking-wider text-[11px]">
                            Sub Total {div.kode} ({div.uraian}) :
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-blue-900">
                            {formatRupiah(div.subTotal)}
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Sub-tab 3: Analisa Harga Satuan Pekerjaan (AHSP) */}
      {activeSubTab === 'ahsp' && (
        <div className="bg-white rounded-2xl border border-slate-300 shadow-md p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b pb-4 gap-3">
            <div>
              <h3 className="text-base font-black text-slate-900 uppercase">
                ANALISA HARGA SATUAN PEKERJAAN (AHSP)
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Rincian koefisien bahan dan upah per satuan pekerjaan. Tambah, edit, atau hapus item & komponen pendukung.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (confirm('Reset seluruh Analisa AHSP ke data standar resmi sesuai AHSP.pdf?')) {
                    onUpdateRealData({
                      ...realData,
                      ahspList: defaultRealSchoolData.ahspList,
                    });
                  }
                }}
                className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 px-3 py-2 rounded-lg text-xs font-bold transition cursor-pointer"
                title="Muat Ulang Data Standar AHSP.pdf"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-600" />
                <span>Reset Data AHSP.pdf</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const nextRoman = toRoman((realData.ahspList || []).length + 1);
                  setNewAhspForm({
                    kodePekerjaan: `AHSP-${nextRoman}`,
                    namaPekerjaan: '',
                    satuan: 'm³',
                  });
                  setIsAddingAhsp(true);
                }}
                className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white px-3.5 py-2 rounded-lg text-xs font-bold transition shrink-0 cursor-pointer shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>+ AHSP Pekerjaan Baru</span>
              </button>
            </div>
          </div>

          {/* Smart AHSP Rebalance Banner & Toggle */}
          <div className="bg-gradient-to-r from-purple-50 via-indigo-50 to-blue-50 border border-purple-200 p-4 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-purple-100 text-purple-700 rounded-xl shrink-0 mt-0.5">
                <Sparkles className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h4 className="font-extrabold text-sm text-purple-950 flex items-center gap-2">
                  <span>🔒 Smart AHSP Rebalance Engine (Skema A: Proporsional ke Bahan Utama)</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                    isAhspRebalanceLocked
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-amber-100 text-amber-800 border border-amber-300'
                  }`}>
                    {isAhspRebalanceLocked ? '● Otomatis Aktif' : '○ Non-Aktif'}
                  </span>
                </h4>
                <p className="text-xs text-purple-800 mt-1 leading-relaxed">
                  Ketika <strong>Kunci Total AHSP</strong> aktif, jika Anda menghapus rincian komponen (misal: Air/Listrik Kerja) atau menambah rincian baru, nominalnya secara otomatis diserap/didistribusikan ke komponen bahan utama lainnya sehingga <strong>Total Nilai AHSP Tetap 100% Presisi</strong>.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsAhspRebalanceLocked(!isAhspRebalanceLocked)}
              className={`shrink-0 px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-xs cursor-pointer ${
                isAhspRebalanceLocked
                  ? 'bg-purple-700 hover:bg-purple-800 text-white shadow-purple-700/20'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-300'
              }`}
            >
              <span>{isAhspRebalanceLocked ? '🔒 Kunci Total AHSP: ON' : '🔓 Kunci Total AHSP: OFF'}</span>
            </button>
          </div>

          <div className="space-y-6">
            {(realData.ahspList || []).map((ahsp, ahspIdx) => {
              const romanNo = toRoman(ahspIdx + 1);
              return (
                <div key={ahsp.id} className="border border-slate-300 rounded-xl overflow-hidden shadow-xs">
                  {/* AHSP Card Header */}
                  <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="px-2.5 py-1 bg-purple-700 text-white rounded font-black text-xs shadow-xs font-mono">
                        {romanNo}
                      </span>
                      <div>
                        <span className="text-[10px] font-mono font-bold text-purple-700 block uppercase leading-none mb-0.5">
                          AHSP {romanNo} ({ahsp.kodePekerjaan})
                        </span>
                        <h4 className="font-bold text-xs text-slate-900">{ahsp.namaPekerjaan}</h4>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <div className="font-mono text-xs font-extrabold text-blue-800 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded">
                        Total: {formatRupiah(ahsp.totalHargaSatuan)} / {ahsp.satuan}
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditingAhsp(ahsp)}
                        className="flex items-center gap-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 px-2 py-1 rounded text-xs font-bold transition cursor-pointer"
                        title="Edit Head AHSP"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-amber-600" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteAhsp(ahsp.id, ahsp.namaPekerjaan || ahsp.kodePekerjaan)}
                        className="flex items-center gap-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 px-2.5 py-1 rounded text-xs font-bold transition cursor-pointer"
                        title="Hapus Analisa AHSP Pekerjaan ini"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                        <span>Hapus AHSP</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddAhspKomponen(ahsp.id)}
                        className="flex items-center gap-1 bg-purple-600 hover:bg-purple-700 text-white px-2.5 py-1 rounded text-xs font-bold transition cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Komponen</span>
                      </button>
                    </div>
                  </div>

                {/* AHSP Components Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-slate-700 border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-[11px] font-bold border-b border-slate-200 text-center">
                        <th className="py-1.5 px-3 w-20 border-r border-slate-200">KATEGORI</th>
                        <th className="py-1.5 px-3 text-left border-r border-slate-200">URAIAN KOMPONEN</th>
                        <th className="py-1.5 px-2 w-24 border-r border-slate-200">KOEFISIEN</th>
                        <th className="py-1.5 px-2 w-20 border-r border-slate-200">SATUAN</th>
                        <th className="py-1.5 px-3 w-32 border-r border-slate-200 text-right">HARGA SATUAN (RP)</th>
                        <th className="py-1.5 px-3 w-36 border-r border-slate-200 text-right">TOTAL (RP)</th>
                        <th className="py-1.5 px-2 w-12 text-center">AKSI</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {ahsp.komponen.map((komp) => (
                        <tr key={komp.id} className="hover:bg-slate-50">
                          <td className="py-1.5 px-2 text-center border-r border-slate-100">
                            <select
                              value={komp.kategori}
                              onChange={(e) =>
                                handleAhspKomponenChange(ahsp.id, komp.id, 'kategori', e.target.value)
                              }
                              className="bg-white border border-slate-200 rounded px-1 py-0.5 text-[10px] font-bold text-slate-700"
                            >
                              <option value="BAHAN">BAHAN</option>
                              <option value="UPAH">UPAH</option>
                              <option value="ALAT">ALAT</option>
                              <option value="PINTU_JENDELA">🚪 PINTU & JENDELA</option>
                              <option value="CETAK">CETAK</option>
                              <option value="SMKK">SMKK</option>
                              <option value="SIPLAH">SIPLAH</option>
                            </select>
                          </td>
                          <td className="py-1.5 px-3 border-r border-slate-100">
                            <input
                              type="text"
                              value={komp.uraian}
                              onChange={(e) =>
                                handleAhspKomponenChange(ahsp.id, komp.id, 'uraian', e.target.value)
                              }
                              className="w-full bg-transparent hover:bg-white focus:bg-white border border-transparent focus:border-purple-400 rounded px-1 py-0.5 font-medium text-slate-800"
                            />
                          </td>
                          <td className="py-1.5 px-2 text-center border-r border-slate-100">
                            <input
                              type="number"
                              step="any"
                              value={komp.koefisien}
                              onChange={(e) =>
                                handleAhspKomponenChange(ahsp.id, komp.id, 'koefisien', e.target.value)
                              }
                              className="w-full bg-transparent hover:bg-white focus:bg-white border border-transparent focus:border-purple-400 rounded px-1 py-0.5 text-center font-mono"
                            />
                          </td>
                          <td className="py-1.5 px-2 text-center border-r border-slate-100">
                            <input
                              type="text"
                              value={komp.satuan}
                              onChange={(e) =>
                                handleAhspKomponenChange(ahsp.id, komp.id, 'satuan', e.target.value)
                              }
                              className="w-full bg-transparent hover:bg-white focus:bg-white border border-transparent focus:border-purple-400 rounded px-1 py-0.5 text-center text-slate-500 font-mono"
                            />
                          </td>
                          <td className="py-1.5 px-3 text-right border-r border-slate-100">
                            <input
                              type="number"
                              step="any"
                              value={komp.hargaSatuan}
                              onChange={(e) =>
                                handleAhspKomponenChange(ahsp.id, komp.id, 'hargaSatuan', e.target.value)
                              }
                              className="w-full bg-transparent hover:bg-white focus:bg-white border border-transparent focus:border-purple-400 rounded px-1 py-0.5 text-right font-mono"
                            />
                          </td>
                          <td className="py-1.5 px-3 text-right font-mono font-semibold text-slate-900 border-r border-slate-100">
                            {formatRupiah(komp.totalHarga)}
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteAhspKomponen(ahsp.id, komp.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 transition rounded"
                              title="Hapus komponen ini"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    )}

      {/* RAB to AHSP & Document (Bon/SPB/Upah) Live Preview Modal */}
      <RabAhspDocumentPreviewModal
        isOpen={isRabAhspModalOpen}
        onClose={() => setIsRabAhspModalOpen(false)}
        rabItem={selectedPreviewItem}
        division={selectedPreviewDivision}
        realData={realData}
        school={school}
        stores={stores}
        kwitansiList={kwitansiList}
        onUpdateRabItem={handleUpdateRabItem}
        onUpdateAhsp={handleUpdateAhspItem}
      />
    </div>
  );
};
