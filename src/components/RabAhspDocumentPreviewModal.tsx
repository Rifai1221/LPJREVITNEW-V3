import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  FileText,
  ShoppingCart,
  UserCheck,
  Edit3,
  Check,
  Plus,
  Trash2,
  Store,
  Layers,
  Calculator,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Sparkles,
  Link,
  ArrowRight,
  Info,
  Tag,
} from 'lucide-react';
import {
  RabSubItem,
  RabDivision,
  RealSchoolData,
  AhspItem,
  AhspKomponen,
  SchoolMasterData,
  StoreVendor,
  KwitansiDocument,
} from '../types';
import { formatRupiah, formatNumber } from '../utils/formatters';
import { terbilangRupiah } from '../utils/terbilang';
import { rebalanceAhspComponents } from '../utils/divisionHelper';
import { decomposeRealisticBahanAndUpah, isPreservedUnitItem } from '../services/autoGeneratorService';
import { KwitansiTagManager, AhspLaborProtectionBadge } from './KwitansiTagManager';
import { isAhspLaborComponent } from '../utils/kwitansiTagHelper';
import { DEFAULT_MATERIAL_LABOR_RATIO } from '../utils/ahspHelper';

interface RabAhspDocumentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  rabItem: RabSubItem | null;
  division: RabDivision | null;
  realData: RealSchoolData;
  school?: SchoolMasterData;
  stores?: StoreVendor[];
  kwitansiList?: KwitansiDocument[];
  onUpdateRabItem?: (divId: string, itemId: string, updatedFields: Partial<RabSubItem>) => void;
  onUpdateAhsp?: (updatedAhsp: AhspItem) => void;
}

export const RabAhspDocumentPreviewModal: React.FC<RabAhspDocumentPreviewModalProps> = ({
  isOpen,
  onClose,
  rabItem,
  division,
  realData,
  school,
  stores = [],
  kwitansiList = [],
  onUpdateRabItem,
  onUpdateAhsp,
}) => {
  const [activeTab, setActiveTab] = useState<'AHSP' | 'BON_SPB' | 'UPAH' | 'EDIT'>('AHSP');
  const [selectedAhspId, setSelectedAhspId] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);
  const [editableComponents, setEditableComponents] = useState<AhspKomponen[]>([]);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState(false);

  // Determine standard fiscal year
  const yearStr = school?.tahunAnggaran?.trim() || realData?.tahunAnggaran || '2026';

  // Find actual Kwitansi documents matching this RAB item from the Kwitansi Bon & SPB / Upah list
  const matchedMaterialKw = useMemo(() => {
    if (!rabItem || !kwitansiList || kwitansiList.length === 0) return null;
    const lowerRab = rabItem.uraian.toLowerCase().trim();
    const lowerDiv = division?.uraian.toLowerCase().trim() || '';

    // 1. Direct item match or uraian match in MATERIAL kwitansi
    const direct = kwitansiList.find((k) => {
      if (k.tipe !== 'MATERIAL') return false;
      const kUraian = (k.uraian || '').toLowerCase();
      if (kUraian.includes(lowerRab) || (lowerDiv && kUraian.includes(lowerDiv))) return true;
      return (k.items || []).some((it) => {
        const itName = (it.namaBarang || '').toLowerCase();
        return itName.includes(lowerRab) || lowerRab.includes(itName);
      });
    });
    if (direct) return direct;

    // 2. Division match
    const divMatch = kwitansiList.find(
      (k) => k.tipe === 'MATERIAL' && lowerDiv && (k.uraian || '').toLowerCase().includes(lowerDiv)
    );
    if (divMatch) return divMatch;

    // 3. Fallback to first material kwitansi
    return kwitansiList.find((k) => k.tipe === 'MATERIAL') || null;
  }, [rabItem, division, kwitansiList]);

  const matchedUpahKw = useMemo(() => {
    if (!rabItem || !kwitansiList || kwitansiList.length === 0) return null;
    const lowerRab = rabItem.uraian.toLowerCase().trim();
    const lowerDiv = division?.uraian.toLowerCase().trim() || '';

    // 1. Direct match in UPAH kwitansi
    const direct = kwitansiList.find((k) => {
      if (k.tipe !== 'UPAH') return false;
      const kUraian = (k.uraian || '').toLowerCase();
      return kUraian.includes(lowerRab) || (lowerDiv && kUraian.includes(lowerDiv));
    });
    if (direct) return direct;

    // 2. Fallback to first upah kwitansi
    return kwitansiList.find((k) => k.tipe === 'UPAH') || null;
  }, [rabItem, division, kwitansiList]);

  // Exact receipt and SPB numbers matching Kwitansi Bon & SPB menu
  const materialNoBukti = matchedMaterialKw?.noBukti || `01/KW-MAT/${yearStr}`;
  const materialNoSpb = matchedMaterialKw?.noSpb || `SPB-01/MAT/${yearStr}`;
  const materialTanggal =
    matchedMaterialKw?.tanggalFormatted ||
    matchedMaterialKw?.tanggal ||
    `${school?.kabKota || 'Kota'}, T.A ${yearStr}`;

  const upahNoBukti = matchedUpahKw?.noBukti || `01/UK/${yearStr}`;
  const upahNoSpb = matchedUpahKw?.noSpb || `SPB-01/UK/${yearStr}`;
  const upahTanggal =
    matchedUpahKw?.tanggalFormatted ||
    matchedUpahKw?.tanggal ||
    `${school?.kabKota || 'Kota'}, T.A ${yearStr}`;

  // Find automatic match if no specific ahspIdRef
  const matchedAhsp = useMemo(() => {
    if (!rabItem) return null;
    const list = realData.ahspList || [];
    if (selectedAhspId) {
      return list.find((a) => a.id === selectedAhspId) || null;
    }
    if (rabItem.ahspIdRef) {
      const explicit = list.find((a) => a.id === rabItem.ahspIdRef);
      if (explicit) return explicit;
    }

    const lowerRab = rabItem.uraian.toLowerCase().trim();
    // 1. Direct contains match
    const directMatch = list.find((a) => {
      const lowerAh = (a.namaPekerjaan || '').toLowerCase().trim();
      return lowerAh === lowerRab || lowerAh.includes(lowerRab) || lowerRab.includes(lowerAh);
    });
    if (directMatch) return directMatch;

    // 2. Keyword heuristic match
    const keywords = lowerRab
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !/pekerjaan|pasang|pemasangan|pengadaan/i.test(w));

    if (keywords.length > 0) {
      const keywordMatch = list.find((a) => {
        const lowerAh = (a.namaPekerjaan || '').toLowerCase();
        return keywords.some((kw) => lowerAh.includes(kw));
      });
      if (keywordMatch) return keywordMatch;
    }

    return null;
  }, [rabItem, selectedAhspId, realData.ahspList]);

  // Sync state whenever modal opens or rabItem changes
  useEffect(() => {
    if (!isOpen || !rabItem) return;
    if (rabItem.ahspIdRef) {
      setSelectedAhspId(rabItem.ahspIdRef);
    } else {
      setSelectedAhspId('');
    }
    setActiveTab('AHSP');
    setIsEditing(false);
    setSaveSuccessNotice(false);
  }, [isOpen, rabItem]);

  // Sync editable components with matched AHSP
  useEffect(() => {
    if (matchedAhsp && matchedAhsp.komponen) {
      setEditableComponents(matchedAhsp.komponen.map((k) => ({ ...k })));
    } else {
      // Fallback synthetic components if no AHSP is bound
      if (rabItem) {
        const isUpahBahan = rabItem.kategoriBiaya === 'UPAH_BAHAN';
        const isUpahOnly = rabItem.kategoriBiaya === 'UPAH';
        if (isUpahOnly) {
          const decomposed = decomposeRealisticBahanAndUpah(rabItem.uraian, 0, rabItem.hargaSatuan);
          if (decomposed.upahComponents.length > 0) {
            setEditableComponents(
              decomposed.upahComponents.map((ui, i) => ({
                id: `comp-syn-upah-${i}`,
                kategori: 'UPAH' as const,
                uraian: ui.namaBarang,
                koefisien: ui.volume,
                satuan: ui.satuan,
                hargaSatuan: ui.hargaSatuan,
                totalHarga: ui.jumlah,
              }))
            );
          } else {
            setEditableComponents([
              {
                id: 'comp-syn-upah',
                kategori: 'UPAH',
                uraian: `Upah Tukang & Pekerja (${rabItem.uraian})`,
                koefisien: 1,
                satuan: rabItem.satuan || 'ls',
                hargaSatuan: rabItem.hargaSatuan,
                totalHarga: rabItem.hargaSatuan,
              },
            ]);
          }
        } else if (isUpahBahan) {
          const bNominal = Math.round(rabItem.hargaSatuan * DEFAULT_MATERIAL_LABOR_RATIO.material);
          const uNominal = rabItem.hargaSatuan - bNominal;
          const decomposed = decomposeRealisticBahanAndUpah(rabItem.uraian, bNominal, uNominal);
          const comps: AhspKomponen[] = [
            ...decomposed.bahanItems.map((bi, i) => ({
              id: `comp-syn-mat-${i}`,
              kategori: 'BAHAN' as const,
              uraian: bi.namaBarang,
              koefisien: bi.volume,
              satuan: bi.satuan,
              hargaSatuan: bi.hargaSatuan,
              totalHarga: bi.jumlah,
            })),
            ...decomposed.upahComponents.map((ui, i) => ({
              id: `comp-syn-upah-${i}`,
              kategori: 'UPAH' as const,
              uraian: ui.namaBarang,
              koefisien: ui.volume,
              satuan: ui.satuan,
              hargaSatuan: ui.hargaSatuan,
              totalHarga: ui.jumlah,
            })),
          ];
          setEditableComponents(comps);
        } else {
          const isPabrikasi = rabItem.isBarangPabrikasi || isPreservedUnitItem(rabItem.uraian, rabItem.satuan, rabItem.isBarangPabrikasi);
          if (isPabrikasi) {
            setEditableComponents([
              {
                id: 'comp-syn-mat-pabrikasi',
                kategori: 'BAHAN',
                uraian: rabItem.uraian,
                koefisien: 1,
                satuan: rabItem.satuan || 'unit',
                hargaSatuan: rabItem.hargaSatuan,
                totalHarga: rabItem.hargaSatuan,
              },
            ]);
          } else {
            // If composite job in BAHAN, decompose into realistic materials
            const isCompositeJob = /pekerjaan|pasang|pemasangan|pengadaan|pembuatan|perbaikan|rehab|renovasi|bongkar/i.test(rabItem.uraian);
            if (isCompositeJob) {
              const decomposed = decomposeRealisticBahanAndUpah(rabItem.uraian, rabItem.hargaSatuan, 0);
              const comps: AhspKomponen[] = decomposed.bahanItems.map((bi, i) => ({
                id: `comp-syn-mat-${i}`,
                kategori: 'BAHAN' as const,
                uraian: bi.namaBarang,
                koefisien: bi.volume,
                satuan: bi.satuan,
                hargaSatuan: bi.hargaSatuan,
                totalHarga: bi.jumlah,
              }));
              setEditableComponents(comps);
            } else {
              setEditableComponents([
                {
                  id: 'comp-syn-mat',
                  kategori: 'BAHAN',
                  uraian: rabItem.uraian,
                  koefisien: 1,
                  satuan: rabItem.satuan || 'unit',
                  hargaSatuan: rabItem.hargaSatuan,
                  totalHarga: rabItem.hargaSatuan,
                },
              ]);
            }
          }
        }
      }
    }
  }, [matchedAhsp, rabItem]);

  // Vendor selection for store/preview
  const selectedVendor = useMemo(() => {
    if (!stores || stores.length === 0) return null;
    if (rabItem?.kategoriBiaya === 'CETAK' || /papan nama/i.test(rabItem?.uraian || '')) {
      const found = stores.find((s) => s.kategori === 'PERCETAKAN' || /percetakan|cetak/i.test(`${s.namaToko} ${s.pekerjaan || ''}`));
      if (found) return found;
    }
    if (rabItem?.kategoriBiaya === 'PENGELOLA') {
      const found = stores.find((s) => s.kategori === 'PENGELOLA_SPJ' || /pengelola/i.test(`${s.namaToko} ${s.pekerjaan || ''}`));
      if (found) return found;
    }
    if (rabItem?.kategoriBiaya === 'SIPLAH') {
      const found = stores.find((s) => s.kategori === 'SIPLAH' || s.isSiplah);
      if (found) return found;
    }
    if (rabItem?.kategoriBiaya === 'PERENCANA') {
      const found = stores.find((s) => s.kategori === 'PERENCANA');
      if (found) return found;
    }
    if (rabItem?.kategoriBiaya === 'PENGAWAS') {
      const found = stores.find((s) => s.kategori === 'PENGAWAS');
      if (found) return found;
    }
    return stores[0];
  }, [stores, rabItem]);

  if (!isOpen || !rabItem || !division) return null;

  const rabVolume = rabItem.volume || 1;
  const currentKomponen = editableComponents;
  const isItemPabrikasi =
    !!rabItem.isBarangPabrikasi ||
    isPreservedUnitItem(rabItem.uraian, rabItem.satuan, rabItem.isBarangPabrikasi);

  // Breakdown Calculations
  const bahanItems = currentKomponen.filter(
    (k) => k.kategori === 'BAHAN' || (!/tukang|pekerja|mandor/i.test(k.uraian) && !/alat|sewa/i.test(k.uraian))
  );
  const upahItems = currentKomponen.filter(
    (k) => k.kategori === 'UPAH' || /tukang|pekerja|mandor/i.test(k.uraian)
  );
  const alatItems = currentKomponen.filter((k) => k.kategori === 'ALAT');

  const totalBahanSatuan = bahanItems.reduce((sum, it) => sum + (it.totalHarga || (it.koefisien * it.hargaSatuan)), 0);
  const totalUpahSatuan = upahItems.reduce((sum, it) => sum + (it.totalHarga || (it.koefisien * it.hargaSatuan)), 0);
  const totalAlatSatuan = alatItems.reduce((sum, it) => sum + (it.totalHarga || (it.koefisien * it.hargaSatuan)), 0);

  const totalBahanProyek = Math.round(totalBahanSatuan * rabVolume);
  const totalUpahProyek = Math.round(totalUpahSatuan * rabVolume);
  const totalAlatProyek = Math.round(totalAlatSatuan * rabVolume);

  // Link selected AHSP explicitly to this item
  const handleSaveAhspBinding = (newAhspId: string) => {
    setSelectedAhspId(newAhspId);
    if (onUpdateRabItem) {
      onUpdateRabItem(division.id, rabItem.id, { ahspIdRef: newAhspId || undefined });
    }
    setSaveSuccessNotice(true);
    setTimeout(() => setSaveSuccessNotice(false), 2000);
  };

  // Component manipulation in Edit Mode
  const handleComponentChange = (index: number, field: keyof AhspKomponen, value: any) => {
    const updated = [...editableComponents];
    const item = { ...updated[index], [field]: value };
    if (field === 'koefisien' || field === 'hargaSatuan') {
      const koef = parseFloat(item.koefisien as any) || 0;
      const hrg = parseFloat(item.hargaSatuan as any) || 0;
      item.totalHarga = Math.round(koef * hrg);
    }
    updated[index] = item;
    setEditableComponents(updated);
  };

  const handleAddComponent = (kategori: 'BAHAN' | 'UPAH' | 'ALAT' | 'PINTU_JENDELA' | 'CETAK' | 'SMKK' | 'SIPLAH') => {
    let defUraian = 'Bahan Material Tambahan';
    let defSatuan = 'unit';
    let defHarga = 50000;
    if (kategori === 'UPAH') {
      defUraian = 'Tukang Tambahan';
      defSatuan = 'Hr';
      defHarga = 180000;
    } else if (kategori === 'PINTU_JENDELA') {
      defUraian = 'Pengadaan Pintu & Jendela Aluminium Complete Unit';
      defSatuan = 'unit';
      defHarga = 850000;
    } else if (kategori === 'CETAK') {
      defUraian = 'Cetak Papan Nama / Spanduk Proyek';
      defSatuan = 'unit';
      defHarga = 150000;
    } else if (kategori === 'SMKK') {
      defUraian = 'Perlengkapan APD / Keselamatan Kerja';
      defSatuan = 'set';
      defHarga = 250000;
    } else if (kategori === 'SIPLAH') {
      defUraian = 'Pengadaan Barang via SIPLah';
      defSatuan = 'unit';
      defHarga = 100000;
    }

    setEditableComponents([
      ...editableComponents,
      {
        id: `comp-${Date.now()}`,
        kategori,
        uraian: defUraian,
        koefisien: 1,
        satuan: defSatuan,
        hargaSatuan: defHarga,
        totalHarga: defHarga,
      },
    ]);
  };

  const handleRemoveComponent = (index: number) => {
    const targetTotal = rabItem?.hargaSatuan || matchedAhsp?.totalHargaSatuan || 0;
    const newComps = editableComponents.filter((_, i) => i !== index);
    if (targetTotal > 0 && newComps.length > 0) {
      const rebalanced = rebalanceAhspComponents(newComps, targetTotal, 'BAHAN_PRIMARY');
      setEditableComponents(rebalanced);
    } else {
      setEditableComponents(newComps);
    }
  };

  const handleSaveEditedAhsp = (e: React.FormEvent) => {
    e.preventDefault();
    if (matchedAhsp && onUpdateAhsp) {
      const newTotalSatuan = editableComponents.reduce((acc, it) => acc + (it.totalHarga || 0), 0);
      const updatedAhsp: AhspItem = {
        ...matchedAhsp,
        totalHargaSatuan: newTotalSatuan,
        komponen: editableComponents,
      };
      onUpdateAhsp(updatedAhsp);
    }
    setSaveSuccessNotice(true);
    setTimeout(() => {
      setSaveSuccessNotice(false);
      setIsEditing(false);
      setActiveTab('AHSP');
    }, 1200);
  };

  const defaultStoreName = selectedVendor ? selectedVendor.namaToko : (stores && stores.length > 0 ? stores[0].namaToko : 'TB. REKANAN MATERIAL UTAMA');
  const defaultStoreAddress = selectedVendor ? selectedVendor.alamat : (stores && stores.length > 0 ? stores[0].alamat : school?.kabKota || 'Kabupaten/Kota');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-fade-in font-sans">
      <div className="bg-white w-full max-w-4xl max-h-[92vh] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between gap-3 border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-blue-600 shadow-xs shrink-0">
              <Calculator className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider bg-blue-900/80 text-blue-200 border border-blue-700">
                  {division.kode} • {division.uraian}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  rabItem.kategoriBiaya === 'UPAH_BAHAN'
                    ? 'bg-amber-100 text-amber-900 border border-amber-300'
                    : rabItem.kategoriBiaya === 'UPAH'
                    ? 'bg-purple-100 text-purple-900 border border-purple-300'
                    : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                }`}>
                  {rabItem.kategoriBiaya || 'BAHAN'}
                </span>
              </div>
              <h3 className="font-bold text-sm truncate text-white mt-0.5" title={rabItem.uraian}>
                {rabItem.uraian}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsEditing(!isEditing)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer ${
                isEditing
                  ? 'bg-amber-500 hover:bg-amber-600 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{isEditing ? 'Batal Edit' : 'Edit Koefisien / Komponen'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
              title="Tutup"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Success Notice Notification */}
        {saveSuccessNotice && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2 flex items-center justify-center gap-2 text-emerald-800 text-xs font-bold animate-fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Perubahan data AHSP berhasil disimpan dan disinkronkan ke dokumen LPJ!</span>
          </div>
        )}

        {/* AHSP Mapping & Selector Bar */}
        <div className="bg-slate-100 px-4 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 shrink-0">
              <Link className="w-3.5 h-3.5 text-blue-600" />
              <span>Sumber Data AHSP:</span>
            </div>
            <select
              value={matchedAhsp ? matchedAhsp.id : ''}
              onChange={(e) => handleSaveAhspBinding(e.target.value)}
              className="flex-1 max-w-md px-2.5 py-1 text-xs bg-white border border-slate-300 rounded-lg font-medium text-slate-800 focus:ring-2 focus:ring-blue-500 truncate"
            >
              <option value="">-- [Item Langsung / Tanpa Rumus AHSP] --</option>
              {(realData.ahspList || []).map((ah) => (
                <option key={ah.id} value={ah.id}>
                  {ah.kodePekerjaan} - {ah.namaPekerjaan} ({ah.satuan}) [{ah.komponen?.length || 0} komponen]
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2.5 text-xs shrink-0">
            {/* Interactive Kwitansi Tag Manager */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Tag Kwitansi:</span>
              <KwitansiTagManager
                tags={rabItem.tags}
                itemHint={rabItem}
                stores={stores}
                onChangeTags={(newTags) => {
                  if (onUpdateRabItem) {
                    const isFur = newTags.some((t) => t.toUpperCase() === 'FUR');
                    onUpdateRabItem(division.id, rabItem.id, {
                      tags: newTags,
                      isBarangPabrikasi: isFur || rabItem.isBarangPabrikasi,
                    });
                  }
                }}
              />
            </div>

            <div className="bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg">
              <span className="text-[10px] text-blue-700 block">Volume RAB Proyek:</span>
              <span className="font-mono font-bold text-blue-900">
                {rabVolume} {rabItem.satuan}
              </span>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
              <span className="text-[10px] text-emerald-700 block">Total Anggaran Item:</span>
              <span className="font-mono font-bold text-emerald-900">
                {formatRupiah(rabItem.jumlah || rabVolume * rabItem.hargaSatuan)}
              </span>
            </div>
          </div>
        </div>

        {/* Tab Selector */}
        {!isEditing && (
          <div className="bg-white px-4 py-2 border-b border-slate-200 flex items-center justify-between gap-2 overflow-x-auto">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('AHSP')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                  activeTab === 'AHSP'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Calculator className="w-3.5 h-3.5" />
                <span>1. Analisis AHSP & Ekstraksi ({currentKomponen.length} Komponen)</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('BON_SPB')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                  activeTab === 'BON_SPB'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>2. Tercetak di Bon Toko & SPB ({bahanItems.length} Bahan)</span>
                <span className={`ml-1 text-[10px] font-mono px-1.5 py-0.2 rounded font-bold ${
                  activeTab === 'BON_SPB' ? 'bg-black/25 text-white' : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {materialNoBukti}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('UPAH')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                  activeTab === 'UPAH'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>3. Tercetak di Kwitansi Upah ({upahItems.length} Tenaga)</span>
                <span className={`ml-1 text-[10px] font-mono px-1.5 py-0.2 rounded font-bold ${
                  activeTab === 'UPAH' ? 'bg-black/25 text-white' : 'bg-purple-100 text-purple-800'
                }`}>
                  {upahNoBukti}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/50">
          {isEditing ? (
            /* ================= MODE EDIT AHSP KOMPONEN ================= */
            <form onSubmit={handleSaveEditedAhsp} className="space-y-4 max-w-3xl mx-auto">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 flex items-start gap-2">
                <Edit3 className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Edit Koefisien & Harga Satuan AHSP</p>
                  <p className="text-[11px] text-amber-800">
                    Perubahan koefisien atau harga di sini akan otomatis memperbarui perhitungan kebutuhan belanja material di bon toko dan kwitansi upah.
                  </p>
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-blue-600" />
                    <span>Daftar Komponen ({editableComponents.length} Rincian)</span>
                  </h4>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleAddComponent('BAHAN')}
                      className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded text-[11px] font-bold cursor-pointer"
                    >
                      + Tambah Bahan
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddComponent('UPAH')}
                      className="px-2 py-1 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-300 rounded text-[11px] font-bold cursor-pointer"
                    >
                      + Tambah Upah
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-700 text-[10px] uppercase font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-2 w-10 text-center">No</th>
                        <th className="p-2 w-20 text-center">Kategori</th>
                        <th className="p-2">Uraian Komponen / Barang</th>
                        <th className="p-2 w-20 text-center">Koefisien</th>
                        <th className="p-2 w-16 text-center">Satuan</th>
                        <th className="p-2 w-28 text-right">Harga Satuan (Rp)</th>
                        <th className="p-2 w-28 text-right">Subtotal (Rp)</th>
                        <th className="p-2 w-10 text-center" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {editableComponents.map((comp, idx) => (
                        <tr key={comp.id || idx} className="hover:bg-slate-50">
                          <td className="p-2 text-center font-mono font-bold text-slate-400">{idx + 1}</td>
                          <td className="p-1.5">
                            <select
                              value={comp.kategori}
                              onChange={(e) => handleComponentChange(idx, 'kategori', e.target.value)}
                              className="w-full text-[10px] font-bold p-1 border rounded"
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
                          <td className="p-1.5">
                            <input
                              type="text"
                              required
                              value={comp.uraian}
                              onChange={(e) => handleComponentChange(idx, 'uraian', e.target.value)}
                              className="w-full px-2 py-1 text-xs border border-slate-200 rounded"
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              type="number"
                              step="any"
                              required
                              value={comp.koefisien}
                              onChange={(e) => handleComponentChange(idx, 'koefisien', e.target.value)}
                              className="w-full px-2 py-1 text-xs text-center border border-slate-200 rounded font-mono"
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              type="text"
                              value={comp.satuan}
                              onChange={(e) => handleComponentChange(idx, 'satuan', e.target.value)}
                              className="w-full px-2 py-1 text-xs text-center border border-slate-200 rounded font-mono"
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              type="number"
                              required
                              value={comp.hargaSatuan}
                              onChange={(e) => handleComponentChange(idx, 'hargaSatuan', e.target.value)}
                              className="w-full px-2 py-1 text-xs text-right border border-slate-200 rounded font-mono"
                            />
                          </td>
                          <td className="p-2 text-right font-mono font-bold text-slate-900">
                            {formatRupiah(comp.totalHarga || (comp.koefisien * comp.hargaSatuan), false)}
                          </td>
                          <td className="p-1.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveComponent(idx)}
                              className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
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

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Simpan Perubahan AHSP</span>
                </button>
              </div>
            </form>
          ) : (
            /* ================= MODE PREVIEW ================= */
            <div className="space-y-6 max-w-3xl mx-auto">
              {/* TAB 1: ANALISIS AHSP & EKSTRAKSI VOLUME */}
              {activeTab === 'AHSP' && (
                <div className="space-y-4">
                  {/* Status Banner Barang Pabrikasi / Jadi */}
                  {isItemPabrikasi && (
                    <div className="bg-gradient-to-r from-indigo-50 via-blue-50 to-slate-50 border border-indigo-200 p-3.5 rounded-xl flex items-start gap-2.5 text-xs text-indigo-950 shadow-2xs">
                      <Tag className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold block">Status: Barang Pabrikasi / Jadi Utuh (Prefabricated Unit)</span>
                        <span className="text-indigo-800 text-[11px]">
                          Item ini ditandai sebagai produk pabrikan/bengkel jadi. Nilai belanja material otomatis dibukukan utuh per <strong>{rabItem.satuan}</strong> pada Bon Toko, SPB, dan Kwitansi (tidak dipecah menjadi baut, sekrup, semen, profil, atau material eceran terpisah).
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block">
                        Porsi Bahan (Material)
                      </span>
                      <p className="text-base font-extrabold text-emerald-950 font-mono mt-0.5">
                        {formatRupiah(totalBahanProyek)}
                      </p>
                      <span className="text-[10px] text-slate-500">
                        {bahanItems.length} item barang ke Bon Toko & SPB
                      </span>
                    </div>

                    <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 block">
                        Porsi Upah (Tenaga Kerja)
                      </span>
                      <p className="text-base font-extrabold text-purple-950 font-mono mt-0.5">
                        {formatRupiah(totalUpahProyek)}
                      </p>
                      <span className="text-[10px] text-slate-500">
                        {upahItems.length} peran tenaga ke Kwitansi Upah
                      </span>
                    </div>

                    <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 block">
                        Total Nilai AHSP × Volume
                      </span>
                      <p className="text-base font-extrabold text-blue-950 font-mono mt-0.5">
                        {formatRupiah(totalBahanProyek + totalUpahProyek + totalAlatProyek)}
                      </p>
                      <span className="text-[10px] text-slate-500">
                        Total kebutuhan riil pekerjaan
                      </span>
                    </div>
                  </div>

                  {/* Table: Bahan Components */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
                    <div className="bg-emerald-50 px-4 py-2.5 border-b border-emerald-100 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-xs text-emerald-900 flex items-center gap-1.5">
                          <ShoppingCart className="w-3.5 h-3.5 text-emerald-600" />
                          <span>A. Komponen Bahan (Material) $\rightarrow$ Tercetak di Bon Toko & SPB</span>
                        </span>
                        <span className="font-mono text-[10px] bg-white border border-emerald-300 text-emerald-900 px-2 py-0.5 rounded font-bold shadow-2xs">
                          No. Kwitansi: {materialNoBukti}
                        </span>
                      </div>
                      <span className="font-mono text-xs font-bold text-emerald-900">
                        Subtotal: {formatRupiah(totalBahanProyek)}
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 text-slate-700 text-[10px] uppercase font-bold border-b border-slate-200">
                          <tr>
                            <th className="p-2 w-10 text-center">No</th>
                            <th className="p-2">Nama Barang / Material</th>
                            <th className="p-2 w-24 text-center">Koefisien Satuan</th>
                            <th className="p-2 w-28 text-center bg-emerald-50/50">Total Vol Proyek</th>
                            <th className="p-2 w-28 text-right">Harga Satuan (Rp)</th>
                            <th className="p-2 w-32 text-right">Jumlah Total (Rp)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {bahanItems.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="p-4 text-center text-slate-400 italic">
                                Tidak ada komponen bahan terpisah untuk pekerjaan ini.
                              </td>
                            </tr>
                          ) : (
                            bahanItems.map((b, idx) => {
                              const totalVol = Math.round((b.koefisien * rabVolume) * 100) / 100;
                              const totalHrg = Math.round(totalVol * b.hargaSatuan);
                              return (
                                <tr key={b.id || idx} className="hover:bg-slate-50">
                                  <td className="p-2 text-center font-mono text-slate-400 font-bold">{idx + 1}</td>
                                  <td className="p-2 font-medium text-slate-900">{b.uraian}</td>
                                  <td className="p-2 text-center font-mono text-slate-600">
                                    {b.koefisien} {b.satuan}
                                  </td>
                                  <td className="p-2 text-center font-mono font-bold text-emerald-800 bg-emerald-50/30">
                                    {totalVol} {b.satuan}
                                  </td>
                                  <td className="p-2 text-right font-mono text-slate-600">
                                    {formatRupiah(b.hargaSatuan, false)}
                                  </td>
                                  <td className="p-2 text-right font-mono font-bold text-slate-900">
                                    {formatRupiah(totalHrg, false)}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Table: Upah Components */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
                    <div className="bg-purple-50 px-4 py-2.5 border-b border-purple-100 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-xs text-purple-900 flex items-center gap-1.5">
                          <UserCheck className="w-3.5 h-3.5 text-purple-600" />
                          <span>B. Komponen Tenaga Kerja (Upah) $\rightarrow$ Tercetak di Kwitansi Upah & Absensi</span>
                        </span>
                        <span className="font-mono text-[10px] bg-white border border-purple-300 text-purple-900 px-2 py-0.5 rounded font-bold shadow-2xs">
                          No. Kwitansi: {upahNoBukti}
                        </span>
                        <AhspLaborProtectionBadge uraian="Tukang" kategori="UPAH" />
                      </div>
                      <span className="font-mono text-xs font-bold text-purple-900">
                        Subtotal: {formatRupiah(totalUpahProyek)}
                      </span>
                    </div>

                    <div className="bg-amber-50/70 px-4 py-2 border-b border-amber-200/60 text-[11px] text-amber-900 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>
                        <strong>Proteksi Upah Tukang:</strong> Komponen Upah di AHSP dilindungi penuh dan tidak ditag ke kwitansi belanja toko. Seluruh porsi upah dibayarkan sesuai Daftar Upah Mingguan (HOK / Borongan) agar hak tukang tetap terbayar utuh sesuai koefisien AHSP.
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 text-slate-700 text-[10px] uppercase font-bold border-b border-slate-200">
                          <tr>
                            <th className="p-2 w-10 text-center">No</th>
                            <th className="p-2">Peran Pekerja / Tukang</th>
                            <th className="p-2 w-24 text-center">Koefisien Satuan</th>
                            <th className="p-2 w-28 text-center bg-purple-50/50">Total Kebutuhan (HOK)</th>
                            <th className="p-2 w-28 text-right">Upah Standar (Rp)</th>
                            <th className="p-2 w-32 text-right">Jumlah Total (Rp)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {upahItems.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="p-4 text-center text-slate-400 italic">
                                Tidak ada komponen upah terpisah untuk pekerjaan ini.
                              </td>
                            </tr>
                          ) : (
                            upahItems.map((u, idx) => {
                              const totalHok = Math.round((u.koefisien * rabVolume) * 100) / 100;
                              const totalUpah = Math.round(totalHok * u.hargaSatuan);
                              return (
                                <tr key={u.id || idx} className="hover:bg-slate-50">
                                  <td className="p-2 text-center font-mono text-slate-400 font-bold">{idx + 1}</td>
                                  <td className="p-2 font-medium text-slate-900">{u.uraian}</td>
                                  <td className="p-2 text-center font-mono text-slate-600">
                                    {u.koefisien} {u.satuan}
                                  </td>
                                  <td className="p-2 text-center font-mono font-bold text-purple-800 bg-purple-50/30">
                                    {totalHok} HOK
                                  </td>
                                  <td className="p-2 text-right font-mono text-slate-600">
                                    {formatRupiah(u.hargaSatuan, false)}
                                  </td>
                                  <td className="p-2 text-right font-mono font-bold text-slate-900">
                                    {formatRupiah(totalUpah, false)}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: SIMULASI BON TOKO & SPB */}
              {activeTab === 'BON_SPB' && (
                <div className="space-y-4">
                  {/* Synchronized Document Number Banner */}
                  <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-2xs">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-emerald-700 text-white rounded-lg shadow-xs">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-wider block">
                          Nomor Dokumen Sesuai Menu Kwitansi Bon & SPB
                        </span>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <span className="text-slate-700 font-semibold">
                            No. Kwitansi / Bukti: <strong className="font-mono text-emerald-950 bg-white px-2 py-0.5 rounded border border-emerald-300 shadow-2xs">{materialNoBukti}</strong>
                          </span>
                          <span className="text-slate-300">|</span>
                          <span className="text-slate-700 font-semibold">
                            No. SPB: <strong className="font-mono text-emerald-950 bg-white px-2 py-0.5 rounded border border-emerald-300 shadow-2xs">{materialNoSpb}</strong>
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 self-start sm:self-center">
                      {matchedMaterialKw?.mingguKeRef ? (
                        <span className="px-2.5 py-1 bg-emerald-200/90 text-emerald-950 font-extrabold rounded-lg text-[11px] border border-emerald-400">
                          Terdaftar di Minggu Ke-{matchedMaterialKw.mingguKeRef}
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 font-bold rounded-lg text-[11px] border border-emerald-200">
                          Tersinkronisasi Otomatis
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="bg-white p-6 sm:p-8 rounded-xl border border-slate-300 shadow-sm font-sans text-xs space-y-5">
                    <div className="flex justify-between items-start border-b-2 border-black pb-3">
                      <div>
                        <h3 className="font-extrabold text-base uppercase tracking-wider text-slate-900">
                          {defaultStoreName}
                        </h3>
                        <p className="text-[11px] text-slate-600">Penyedia Bahan Bangunan & Alat Konstruksi</p>
                        <p className="text-[11px] text-slate-600">{defaultStoreAddress}</p>
                      </div>
                      <div className="text-right text-xs">
                        <p className="font-medium">{school?.kabKota || 'Kota'}, {school?.tahunAnggaran ? `T.A ${school.tahunAnggaran}` : ''}</p>
                        <p className="text-slate-600">Kepada Yth: Ketua P2SP</p>
                        <p className="font-bold text-slate-900">{school?.namaSekolah || realData.namaSekolah}</p>
                        <p className="text-slate-600">Keperluan: {rabItem.uraian}</p>
                      </div>
                    </div>

                    {/* Official Document Numbers Box */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border border-black p-2.5 bg-slate-50 font-mono text-[11px]">
                      <div className="space-y-0.5">
                        <p>NO. FAKTUR / KWITANSI : <strong className="text-emerald-950 font-bold">{materialNoBukti}</strong></p>
                        <p>NO. SURAT PESANAN (SPB): <strong className="text-emerald-950 font-bold">{materialNoSpb}</strong></p>
                      </div>
                      <div className="sm:text-right space-y-0.5">
                        <p>TANGGAL BUKTI : <strong className="text-slate-900 font-bold">{materialTanggal}</strong></p>
                        <p>SUMBER ANGGARAN : <strong className="text-slate-900 font-bold">DANA REVITALISASI</strong></p>
                      </div>
                    </div>

                    <div className="text-center py-1">
                      <h4 className="font-extrabold text-sm uppercase tracking-widest underline">
                        SIMULASI FAKTUR / BON TOKO & SURAT PESANAN BARANG (SPB)
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        (Daftar barang ini yang otomatis tercetak pada Faktur & SPB untuk pekerjaan: <strong>{rabItem.uraian}</strong>)
                      </p>
                    </div>

                    {isItemPabrikasi && (
                      <div className="bg-indigo-50 border border-indigo-200 p-2.5 rounded-lg text-xs text-indigo-900 flex items-center gap-2">
                        <Tag className="w-4 h-4 text-indigo-600 shrink-0" />
                        <span>
                          <strong>Proteksi Barang Pabrikasi Aktif:</strong> Barang ini dibelanjakan utuh sebanyak <strong>{rabVolume} {rabItem.satuan || 'unit'}</strong> dan tidak dipecah menjadi material eceran pada Bon Toko & SPB.
                        </span>
                      </div>
                    )}

                    <table className="w-full border-collapse border border-black text-xs">
                      <thead>
                        <tr className="bg-slate-100 text-center font-bold">
                          <th className="border border-black p-2 w-10">No</th>
                          <th className="border border-black p-2 w-28">Banyaknya</th>
                          <th className="border border-black p-2 text-left">Nama Barang / Spesifikasi Material</th>
                          <th className="border border-black p-2 text-right w-32">Harga Satuan</th>
                          <th className="border border-black p-2 text-right w-36">Jumlah</th>
                        </tr>
                      </thead>
                      <tbody>
                        {isItemPabrikasi ? (
                          <tr>
                            <td className="border border-black p-2 text-center font-mono font-bold">1</td>
                            <td className="border border-black p-2 text-center font-mono font-bold bg-indigo-50/40">
                              {rabVolume} {rabItem.satuan || 'unit'}
                            </td>
                            <td className="border border-black p-2 font-medium">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-900">{rabItem.uraian}</span>
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-indigo-100 text-indigo-800 border border-indigo-300">
                                  🏷️ Produk Pabrikasi / Jadi Utuh
                                </span>
                              </div>
                            </td>
                            <td className="border border-black p-2 text-right font-mono">
                              {formatRupiah(totalBahanSatuan > 0 ? totalBahanSatuan : rabItem.hargaSatuan, false)}
                            </td>
                            <td className="border border-black p-2 text-right font-mono font-bold text-slate-900">
                              {formatRupiah(totalBahanProyek > 0 ? totalBahanProyek : Math.round(rabVolume * rabItem.hargaSatuan), false)}
                            </td>
                          </tr>
                        ) : bahanItems.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="border border-black p-4 text-center text-slate-400 italic">
                              Tidak ada pengeluaran bahan toko terdaftar untuk pekerjaan ini.
                            </td>
                          </tr>
                        ) : (
                          bahanItems.map((b, idx) => {
                            const totalVol = Math.round((b.koefisien * rabVolume) * 100) / 100;
                            const totalHrg = Math.round(totalVol * b.hargaSatuan);
                            return (
                              <tr key={idx}>
                                <td className="border border-black p-2 text-center font-mono">{idx + 1}</td>
                                <td className="border border-black p-2 text-center font-mono font-bold">
                                  {totalVol} {b.satuan}
                                </td>
                                <td className="border border-black p-2 font-medium">{b.uraian}</td>
                                <td className="border border-black p-2 text-right font-mono">
                                  {formatRupiah(b.hargaSatuan, false)}
                                </td>
                                <td className="border border-black p-2 text-right font-mono font-bold">
                                  {formatRupiah(totalHrg, false)}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                      <tfoot>
                        <tr className="font-bold bg-slate-50">
                          <td colSpan={4} className="border border-black p-2 text-right uppercase">
                            Total Belanja Bahan Toko :
                          </td>
                          <td className="border border-black p-2 text-right font-mono font-bold text-slate-900 text-sm">
                            {formatRupiah(totalBahanProyek, false)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>

                    <div className="flex justify-between items-end pt-4 border-t border-slate-200">
                      <p className="italic text-[11px] text-slate-500">
                        * Data di atas otomatis ditransfer ke Kwitansi Bon & SPB saat laporan mingguan dibuat.
                      </p>
                      <div className="text-center w-52 space-y-0.5">
                        <p>Hormat Kami,</p>
                        <p className="font-bold uppercase">{defaultStoreName}</p>
                        <div className="h-12" />
                        <p className="font-bold underline uppercase">Pemilik Toko</p>
                        <p className="text-[10px] text-slate-500">Cap & Tanda Tangan</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: SIMULASI KWITANSI UPAH */}
              {activeTab === 'UPAH' && (
                <div className="space-y-4">
                  {/* Synchronized Document Number Banner */}
                  <div className="bg-purple-50 border border-purple-300 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-2xs">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-purple-700 text-white rounded-lg shadow-xs">
                        <UserCheck className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="text-[10px] font-extrabold text-purple-800 uppercase tracking-wider block">
                          Nomor Dokumen Sesuai Menu Kwitansi Upah & Absensi
                        </span>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <span className="text-slate-700 font-semibold">
                            No. Kwitansi Upah: <strong className="font-mono text-purple-950 bg-white px-2 py-0.5 rounded border border-purple-300 shadow-2xs">{upahNoBukti}</strong>
                          </span>
                          <span className="text-slate-300">|</span>
                          <span className="text-slate-700 font-semibold">
                            No. SPB Upah: <strong className="font-mono text-purple-950 bg-white px-2 py-0.5 rounded border border-purple-300 shadow-2xs">{upahNoSpb}</strong>
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 self-start sm:self-center">
                      {matchedUpahKw?.mingguKeRef ? (
                        <span className="px-2.5 py-1 bg-purple-200/90 text-purple-950 font-extrabold rounded-lg text-[11px] border border-purple-400">
                          Terdaftar di Minggu Ke-{matchedUpahKw.mingguKeRef}
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 bg-purple-100 text-purple-800 font-bold rounded-lg text-[11px] border border-purple-200">
                          Tersinkronisasi Otomatis
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="bg-white p-6 sm:p-8 rounded-xl border border-slate-300 shadow-sm font-sans text-xs space-y-5">
                    <div className="flex justify-between items-start border-b border-black pb-2">
                      <div className="font-mono text-xs space-y-0.5">
                        <p>Tahun Anggaran : <strong>{school?.tahunAnggaran || realData.tahunAnggaran}</strong></p>
                        <p>Kegiatan : <strong>{realData.kegiatan || 'Revitalisasi Satuan Pendidikan'}</strong></p>
                      </div>
                      <div className="text-right">
                        <h2 className="text-lg font-bold tracking-widest uppercase underline font-serif">
                          KWITANSI PEMBAYARAN UPAH
                        </h2>
                      </div>
                    </div>

                    {/* Official Document Numbers Box */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border border-black p-2.5 bg-slate-50 font-mono text-[11px]">
                      <div className="space-y-0.5">
                        <p>NO. BUKTI KAS / KWITANSI : <strong className="text-purple-950 font-bold">{upahNoBukti}</strong></p>
                        <p>NO. SURAT PERINTAH BAYAR : <strong className="text-purple-950 font-bold">{upahNoSpb}</strong></p>
                      </div>
                      <div className="sm:text-right space-y-0.5">
                        <p>TANGGAL PEMBAYARAN : <strong className="text-slate-900 font-bold">{upahTanggal}</strong></p>
                        <p>KODE MATA ANGGARAN : <strong className="text-slate-900 font-bold">UPAH TENAGA KERJA REVITALISASI</strong></p>
                      </div>
                    </div>

                    <div className="space-y-3 py-2 text-xs">
                      <div className="grid grid-cols-12 gap-2">
                        <span className="col-span-3 font-medium">Sudah terima dari</span>
                        <span className="col-span-1">:</span>
                        <span className="col-span-8 font-bold text-slate-900">
                          Bendahara {school?.namaSekolah || realData.namaSekolah}
                        </span>
                      </div>

                      <div className="grid grid-cols-12 gap-2">
                        <span className="col-span-3 font-medium">Uang Banyaknya</span>
                        <span className="col-span-1">:</span>
                        <span className="col-span-8 font-bold italic underline bg-slate-50 p-2.5 rounded border border-slate-200 text-purple-900 font-serif text-sm">
                          {terbilangRupiah(totalUpahProyek)}
                        </span>
                      </div>

                      <div className="grid grid-cols-12 gap-2">
                        <span className="col-span-3 font-medium">Y a i t u</span>
                        <span className="col-span-1">:</span>
                        <span className="col-span-8 leading-relaxed font-semibold text-slate-800">
                          Pembayaran Ongkos Tenaga Kerja Pelaksanaan {rabItem.uraian} Volume {rabVolume} {rabItem.satuan}
                        </span>
                      </div>
                    </div>

                  <table className="w-full border-collapse border border-black text-xs font-sans">
                    <thead>
                      <tr className="bg-slate-100 text-center font-bold">
                        <th className="border border-black p-2 w-10">No</th>
                        <th className="border border-black p-2 text-left">Tenaga Kerja / Tukang</th>
                        <th className="border border-black p-2 w-28 text-center">Alokasi HOK</th>
                        <th className="border border-black p-2 text-right w-32">Upah Harian</th>
                        <th className="border border-black p-2 text-right w-36">Total Pembayaran</th>
                      </tr>
                    </thead>
                    <tbody>
                      {upahItems.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="border border-black p-4 text-center text-slate-400 italic">
                            Pekerjaan ini tidak menggunakan tenaga kerja terpisah.
                          </td>
                        </tr>
                      ) : (
                        upahItems.map((u, idx) => {
                          const totalHok = Math.round((u.koefisien * rabVolume) * 100) / 100;
                          const totalUpah = Math.round(totalHok * u.hargaSatuan);
                          return (
                            <tr key={idx}>
                              <td className="border border-black p-2 text-center font-mono">{idx + 1}</td>
                              <td className="border border-black p-2 font-medium">{u.uraian}</td>
                              <td className="border border-black p-2 text-center font-mono font-bold">
                                {totalHok} HOK
                              </td>
                              <td className="border border-black p-2 text-right font-mono">
                                {formatRupiah(u.hargaSatuan, false)}
                              </td>
                              <td className="border border-black p-2 text-right font-mono font-bold">
                                {formatRupiah(totalUpah, false)}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="font-bold bg-slate-50">
                        <td colSpan={4} className="border border-black p-2 text-right uppercase">
                          Total Upah Tenaga :
                        </td>
                        <td className="border border-black p-2 text-right font-mono font-bold text-purple-900 text-sm">
                          {formatRupiah(totalUpahProyek, false)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>

                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-200">
                    <div className="text-center">
                      <p>Setuju Dibayar,</p>
                      <p className="font-bold">Ketua P2SP</p>
                      <div className="h-12" />
                      <p className="font-bold underline uppercase">{school?.namaKetuaP2SP || 'Ketua P2SP'}</p>
                    </div>

                    <div className="text-center">
                      <p>Lunas Dibayar,</p>
                      <p className="font-bold">Bendahara P2SP</p>
                      <div className="h-12" />
                      <p className="font-bold underline uppercase">{school?.namaBendahara || 'Bendahara'}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-100 p-3 px-6 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              Perubahan rumus AHSP atau koefisien belanja langsung tersimpan dan otomatis menyinkronkan dokumen LPJ.
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg font-bold transition cursor-pointer"
          >
            Tutup Preview
          </button>
        </div>
      </div>
    </div>
  );
};
