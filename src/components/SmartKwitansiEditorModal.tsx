import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Plus,
  Trash2,
  Sparkles,
  Scale,
  Receipt,
  Calendar,
  Store,
  User,
  AlertCircle,
  CheckCircle2,
  Lock,
  Unlock,
  RefreshCw,
  FileText,
} from 'lucide-react';
import { KwitansiDocument, StoreVendor, SchoolMasterData } from '../types';
import { formatRupiah } from '../utils/formatters';
import { normalizeMaterialItems, getHarmonizedKwitansiUraian, isReceiptLocked as checkIsReceiptLocked } from '../services/autoGeneratorService';
import { getBulanFromTanggal, formatIndonesianDateLong, getAllMonthOptions, getAvailableMonthsForSchool, sanitizeYear } from '../utils/monthHelper';

interface SmartKwitansiEditorModalProps {
  isOpen: boolean;
  kwitansi: KwitansiDocument | null;
  stores?: StoreVendor[];
  school?: SchoolMasterData;
  onClose: () => void;
  onSave: (updatedKwitansi: KwitansiDocument) => void;
}

interface ItemRow {
  id: string;
  namaBarang: string;
  volume: number;
  satuan: string;
  hargaSatuan: number;
  jumlah: number;
}

export const SmartKwitansiEditorModal: React.FC<SmartKwitansiEditorModalProps> = ({
  isOpen,
  kwitansi,
  stores = [],
  school,
  onClose,
  onSave,
}) => {
  if (!isOpen || !kwitansi) return null;

  const effYear = useMemo(() => String(sanitizeYear(school?.tahunAnggaran, 2026)), [school?.tahunAnggaran]);
  const monthGroups = useMemo(() => getAllMonthOptions(effYear), [effYear]);
  const activeSchoolMonths = useMemo(() => {
    return getAvailableMonthsForSchool(school).filter((m) => m !== 'ALL');
  }, [school]);

  // Header State
  const [noBukti, setNoBukti] = useState(kwitansi.noBukti || '');
  const [noSpb, setNoSpb] = useState(kwitansi.noSpb || '');
  const [tanggal, setTanggal] = useState(kwitansi.tanggal || '');
  const [bulan, setBulan] = useState(kwitansi.bulan || getBulanFromTanggal(kwitansi.tanggal, effYear));
  const [namaToko, setNamaToko] = useState(kwitansi.namaToko || '');
  const [penerimaNama, setPenerimaNama] = useState(kwitansi.penerimaNama || '');
  const [penerimaPekerjaan, setPenerimaPekerjaan] = useState(kwitansi.penerimaPekerjaan || 'Pemilik Toko');
  const [penerimaAlamat, setPenerimaAlamat] = useState(kwitansi.penerimaAlamat || school?.kabKota || '');
  const [uraian, setUraian] = useState(kwitansi.uraian || '');

  // Items State
  const [items, setItems] = useState<ItemRow[]>(() => {
    const rawItems = kwitansi.items && kwitansi.items.length > 0
      ? kwitansi.items
      : [
          {
            namaBarang: kwitansi.uraian || 'Material Bangunan',
            volume: 1,
            satuan: 'ls',
            hargaSatuan: kwitansi.nominal || 0,
            jumlah: kwitansi.nominal || 0,
          },
        ];
    return rawItems.map((it, idx) => ({
      id: `it-${Date.now()}-${idx}`,
      namaBarang: it.namaBarang || '',
      volume: it.volume || 1,
      satuan: it.satuan || 'unit',
      hargaSatuan: it.hargaSatuan || 0,
      jumlah: it.jumlah || Math.round((it.volume || 1) * (it.hargaSatuan || 0)),
    }));
  });

  // Target Budget Lock State
  const [isTargetLocked, setIsTargetLocked] = useState(false);
  const [targetNominal, setTargetNominal] = useState<number>(kwitansi.nominal || 0);

  // Mode Proteksi Kunci (Locked Manual Receipt)
  const [isLockedStatus, setIsLockedStatus] = useState<boolean>(checkIsReceiptLocked(kwitansi));

  // Sync state whenever kwitansi or isOpen changes
  useEffect(() => {
    if (kwitansi) {
      setNoBukti(kwitansi.noBukti || '');
      setNoSpb(kwitansi.noSpb || '');
      setTanggal(kwitansi.tanggal || '');
      setBulan(kwitansi.bulan || getBulanFromTanggal(kwitansi.tanggal, effYear));
      setNamaToko(kwitansi.namaToko || '');
      setPenerimaNama(kwitansi.penerimaNama || '');
      setPenerimaPekerjaan(kwitansi.penerimaPekerjaan || 'Pemilik Toko');
      setPenerimaAlamat(kwitansi.penerimaAlamat || school?.kabKota || '');
      setUraian(kwitansi.uraian || '');
      setTargetNominal(kwitansi.nominal || 0);
      setIsLockedStatus(checkIsReceiptLocked(kwitansi));

      const rawItems = kwitansi.items && kwitansi.items.length > 0
        ? kwitansi.items
        : [
            {
              namaBarang: kwitansi.uraian || 'Material Bangunan',
              volume: 1,
              satuan: 'ls',
              hargaSatuan: kwitansi.nominal || 0,
              jumlah: kwitansi.nominal || 0,
            },
          ];
      setItems(rawItems.map((it, idx) => ({
        id: `it-${Date.now()}-${idx}`,
        namaBarang: it.namaBarang || '',
        volume: it.volume || 1,
        satuan: it.satuan || 'unit',
        hargaSatuan: it.hargaSatuan || 0,
        jumlah: it.jumlah || Math.round((it.volume || 1) * (it.hargaSatuan || 0)),
      })));
    }
  }, [kwitansi, isOpen, effYear, school?.kabKota]);

  // Handler for Tanggal change with automatic Bulan Buku detection
  const handleTanggalChange = (val: string) => {
    setTanggal(val);
    const detected = getBulanFromTanggal(val, effYear);
    if (detected) {
      setBulan(detected);
    }
  };

  // Status calculation
  const totalItemsNominal = useMemo(() => {
    return items.reduce((s, it) => s + (it.jumlah || 0), 0);
  }, [items]);

  const selisih = totalItemsNominal - targetNominal;
  const isExactMatch = selisih === 0;

  // Handlers for Items
  const handleItemChange = (id: string, field: keyof ItemRow, val: any) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const updated = { ...it, [field]: val };
        if (field === 'volume' || field === 'hargaSatuan') {
          const v = field === 'volume' ? Number(val) || 0 : it.volume;
          const h = field === 'hargaSatuan' ? Number(val) || 0 : it.hargaSatuan;
          updated.jumlah = Math.round(v * h);
        } else if (field === 'jumlah') {
          const j = Number(val) || 0;
          updated.hargaSatuan = updated.volume > 0 ? Math.round((j / updated.volume) * 100) / 100 : 0;
        }
        return updated;
      })
    );
  };

  const handleAddItem = () => {
    const newItem: ItemRow = {
      id: `it-${Date.now()}-${Math.random()}`,
      namaBarang: '',
      volume: 1,
      satuan: 'bh',
      hargaSatuan: 0,
      jumlah: 0,
    };
    setItems((prev) => [...prev, newItem]);
  };

  const handleDeleteItem = (id: string) => {
    if (items.length <= 1) {
      alert('Minimal harus ada 1 baris item barang pada kwitansi.');
      return;
    }
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  // Smart Feature 1: Seimbangkan Rincian ke Target Anggaran / BKU
  const handleSmartRebalanceToBudget = () => {
    if (targetNominal <= 0) {
      alert('Tentukan target anggaran / nominal kwitansi yang valid terlebih dahulu.');
      return;
    }

    if (items.length === 0) return;

    if (totalItemsNominal <= 0) {
      // If all items have 0 amount, distribute equally or assign to first item
      const equalShare = Math.round(targetNominal / items.length);
      let runSum = 0;
      setItems((prev) =>
        prev.map((it, idx) => {
          const isLast = idx === prev.length - 1;
          const jml = isLast ? targetNominal - runSum : equalShare;
          runSum += jml;
          const vol = it.volume > 0 ? it.volume : 1;
          return {
            ...it,
            volume: vol,
            hargaSatuan: Math.round(jml / vol),
            jumlah: jml,
          };
        })
      );
      return;
    }

    // Scale items proportionally so total === targetNominal 100% exact
    const scale = targetNominal / totalItemsNominal;
    let runningSum = 0;
    const rebalanced = items.map((it, idx) => {
      const isLast = idx === items.length - 1;
      const targetJml = isLast ? Math.max(0, targetNominal - runningSum) : Math.round(it.jumlah * scale);
      runningSum += targetJml;
      const vol = it.volume > 0 ? it.volume : 1;
      const unitP = Math.round((targetJml / vol) * 100) / 100;
      return {
        ...it,
        volume: vol,
        hargaSatuan: unitP,
        jumlah: targetJml,
      };
    });

    setItems(rebalanced);
  };

  // Smart Feature 2: Auto-Fix Satuan & Standarisasi Harga Pasar (m3 Bata ringan -> bh, Kerikil -> realistic m3)
  const handleSmartAutoFixUnitsAndPrices = () => {
    const rawForNorm = items.map((it) => ({
      namaBarang: it.namaBarang,
      volume: it.volume,
      satuan: it.satuan,
      hargaSatuan: it.hargaSatuan,
      jumlah: it.jumlah,
    }));

    const normalized = normalizeMaterialItems(rawForNorm);

    // If target is locked and has total, rescale to match targetNominal exactly
    let finalNormalized = normalized;
    if (isTargetLocked && targetNominal > 0) {
      const normTotal = normalized.reduce((s, it) => s + it.jumlah, 0);
      if (normTotal > 0 && normTotal !== targetNominal) {
        const scale = targetNominal / normTotal;
        let rSum = 0;
        finalNormalized = normalized.map((it, idx) => {
          const isLast = idx === normalized.length - 1;
          const nJml = isLast ? Math.max(0, targetNominal - rSum) : Math.round(it.jumlah * scale);
          rSum += nJml;
          const nVol = it.volume > 0 ? it.volume : 1;
          return {
            ...it,
            volume: nVol,
            hargaSatuan: Math.round((nJml / nVol) * 100) / 100,
            jumlah: nJml,
          };
        });
      }
    }

    setItems(
      finalNormalized.map((it, idx) => ({
        id: `it-${Date.now()}-${idx}`,
        namaBarang: it.namaBarang,
        volume: it.volume,
        satuan: it.satuan,
        hargaSatuan: it.hargaSatuan,
        jumlah: it.jumlah,
      }))
    );
  };

  // Smart Feature 3: Auto-Generate Uraian from Top Material Names
  const handleAutoGenerateUraian = () => {
    const validNames = items
      .map((it) => it.namaBarang.trim())
      .filter((n) => n.length > 0);
    const topNames = validNames.slice(0, 3).join(', ');
    const schoolName = school?.namaSekolah || 'Sekolah';
    const yearStr = school?.tahunAnggaran || '2026';
    const newUraian = `Pembayaran Lunas Biaya Pembelian Material/Bahan (${topNames || 'Material Bangunan'}), Untuk Pekerjaan Revitalisasi ${schoolName}, Tahun ${yearStr}, Daftar Terlampir.`;
    setUraian(newUraian);
  };

  // Final Save Handler
  const handleSaveKwitansi = () => {
    // If totalItemsNominal is > 0, always prioritize the items sum that the user edited
    const finalNominal = totalItemsNominal > 0 ? totalItemsNominal : targetNominal;

    const cleanItems = items.map((it) => ({
      namaBarang: it.namaBarang.trim() || 'Material Bangunan',
      volume: it.volume,
      satuan: it.satuan,
      hargaSatuan: it.hargaSatuan,
      jumlah: it.jumlah,
    }));

    const isTaxable = finalNominal >= 2000000 && kwitansi.tipe !== 'UPAH';
    const isPpn = isTaxable ? true : Boolean(kwitansi.isPpn);
    const isPph22 = isTaxable ? true : Boolean(kwitansi.isPph22);
    const ppnAmount = isPpn ? Math.round((finalNominal / 1.11) * 0.11 * 100) / 100 : 0;
    const pph22Amount = isPph22 ? Math.round((finalNominal / 1.11) * 0.015 * 100) / 100 : 0;

    const effectiveTanggalFormatted = formatIndonesianDateLong(tanggal.trim(), effYear);

    const updatedDoc: KwitansiDocument = {
      ...kwitansi,
      noBukti: noBukti.trim(),
      noSpb: noSpb.trim() || undefined,
      tanggal: tanggal.trim(),
      tanggalFormatted: effectiveTanggalFormatted || kwitansi.tanggalFormatted,
      bulan: bulan || getBulanFromTanggal(tanggal.trim(), effYear),
      namaToko: namaToko.trim() || undefined,
      penerimaNama: penerimaNama.trim() || kwitansi.penerimaNama,
      penerimaPekerjaan: penerimaPekerjaan.trim() || kwitansi.penerimaPekerjaan,
      penerimaAlamat: penerimaAlamat.trim() || kwitansi.penerimaAlamat,
      uraian: uraian.trim() || kwitansi.uraian,
      nominal: finalNominal,
      items: cleanItems,
      isPpn,
      isPph22,
      ppnAmount,
      pph22Amount,
      isLocked: isLockedStatus,
      isManual: true, // EXPLICITLY MARK AS MANUALLY EDITED/CUSTOM!
    };

    onSave(updatedDoc);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 z-50 animate-in fade-in overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-indigo-800/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/30 border border-blue-400/40 rounded-xl text-amber-300 shadow-inner">
              <Receipt className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-400 text-slate-950 uppercase">
                  Smart Editor & Budget Balancer
                </span>
                <span className="text-xs text-indigo-200 font-mono">No. {kwitansi.noBukti}</span>
              </div>
              <h3 className="text-base font-bold text-white mt-0.5">
                Pengedit Pintar Kwitansi, Bon Toko & Rincian Barang
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsLockedStatus(!isLockedStatus)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer border ${
                isLockedStatus
                  ? 'bg-amber-400 text-slate-950 border-amber-500 shadow-xs'
                  : 'bg-white/10 text-white border-white/20 hover:bg-white/20'
              }`}
              title="Kunci kwitansi ini agar tidak dapat diubah atau ditimpa oleh mesin auto-generator"
            >
              {isLockedStatus ? <Lock className="w-3.5 h-3.5 text-slate-950" /> : <Unlock className="w-3.5 h-3.5" />}
              <span>{isLockedStatus ? '🔒 Kwitansi Terkunci' : '🔓 Belum Terkunci'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Smart Budget Status Bar */}
        <div className="bg-indigo-50/80 border-b border-indigo-100 p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700 flex items-center gap-1">
                {isTargetLocked ? <Lock className="w-3.5 h-3.5 text-blue-600" /> : <Unlock className="w-3.5 h-3.5 text-slate-400" />}
                Target Anggaran / BKU:
              </span>
              <button
                type="button"
                onClick={() => setIsTargetLocked(!isTargetLocked)}
                className="text-[10px] font-semibold text-blue-600 hover:underline cursor-pointer"
              >
                {isTargetLocked ? 'Buka Kunci' : 'Kunci Target'}
              </button>
            </div>
            <div className="relative">
              <input
                type="number"
                disabled={isTargetLocked}
                value={targetNominal}
                onChange={(e) => setTargetNominal(Number(e.target.value) || 0)}
                className={`w-full px-3 py-1.5 font-mono text-sm font-extrabold rounded-lg border ${
                  isTargetLocked
                    ? 'bg-slate-100 text-slate-800 border-slate-300 cursor-not-allowed'
                    : 'bg-white text-blue-900 border-blue-400 focus:ring-2 focus:ring-blue-500'
                }`}
              />
            </div>
          </div>

          <div className="space-y-1">
            <span className="font-bold text-slate-700 text-xs block">Total Rincian Barang:</span>
            <div className="px-3 py-1.5 bg-white font-mono text-sm font-extrabold text-slate-900 rounded-lg border border-slate-300 shadow-2xs">
              {formatRupiah(totalItemsNominal)}
            </div>
          </div>

          <div className="space-y-1 sm:text-right">
            <span className="font-bold text-slate-700 text-xs block">Status Penyeimbangan:</span>
            {isExactMatch ? (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-900 font-extrabold text-xs border border-emerald-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>100% Klop Sesuai Anggaran</span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-100 text-amber-900 font-extrabold text-xs border border-amber-300">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <span>Selisih: {selisih > 0 ? `+${formatRupiah(selisih)}` : `-${formatRupiah(Math.abs(selisih))}`}</span>
              </div>
            )}
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Header Metadata Form */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-blue-600" />
              <span>Informasi Kwitansi & Toko Rekanan</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-slate-700">No. Bukti Kwitansi:</label>
                <input
                  type="text"
                  value={noBukti}
                  onChange={(e) => setNoBukti(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono text-xs font-bold"
                  placeholder="01/KW-MAT/2026"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">No. Surat Pesanan (SPB):</label>
                <input
                  type="text"
                  value={noSpb}
                  onChange={(e) => setNoSpb(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono text-xs"
                  placeholder="SPB-01/MAT/2026"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-700">Tanggal Transaksi:</label>
                  {kwitansi.tipe === 'MATERIAL' && (
                    <span className="text-[10px] text-blue-600 font-medium bg-blue-50 px-1 rounded">Awal Pekan (Senin/Selasa)</span>
                  )}
                </div>
                <input
                  type="text"
                  value={tanggal}
                  onChange={(e) => handleTanggalChange(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                  placeholder="02/09/2026 atau 2 September 2026"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-700">Bulan Buku (BKU):</label>
                  <span className="text-[10px] text-slate-500">Periode</span>
                </div>
                <select
                  value={bulan}
                  onChange={(e) => setBulan(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:ring-1 focus:ring-blue-500"
                >
                  {bulan && !monthGroups.some((g) => g.months.includes(bulan)) && !activeSchoolMonths.includes(bulan) && (
                    <option value={bulan}>{bulan} (Kustom)</option>
                  )}
                  {activeSchoolMonths.length > 0 && (
                    <optgroup label="📅 Bulan Pelaksanaan (Aktif Sekolah)">
                      {activeSchoolMonths.map((m) => (
                        <option key={`active-${m}`} value={m}>
                          {m}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {monthGroups.map((group) => (
                    <optgroup key={group.year} label={`Tahun Anggaran ${group.year}`}>
                      {group.months.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Nama Toko / Rekanan:</label>
                <input
                  type="text"
                  value={namaToko}
                  onChange={(e) => {
                    setNamaToko(e.target.value);
                    const matched = stores.find((s) => s.namaToko.toLowerCase() === e.target.value.toLowerCase());
                    if (matched) {
                      setPenerimaNama(matched.pemilikNama);
                      setPenerimaPekerjaan(matched.pekerjaan || 'Pemilik Toko');
                      setPenerimaAlamat(matched.alamat || school?.kabKota || '');
                    }
                  }}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900"
                  placeholder="TB. Berkah Jaya"
                  list="store-list-suggestions"
                />
                <datalist id="store-list-suggestions">
                  {stores.map((st) => (
                    <option key={st.id} value={st.namaToko}>
                      {st.pemilikNama} ({st.kategori || 'Toko Material'})
                    </option>
                  ))}
                </datalist>
              </div>

              <div className="sm:col-span-2 space-y-1">
                <label className="font-semibold text-slate-700">Nama Penerima / Pemilik:</label>
                <input
                  type="text"
                  value={penerimaNama}
                  onChange={(e) => setPenerimaNama(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold"
                  placeholder="H. Achmad"
                />
              </div>

              <div className="sm:col-span-2 space-y-1">
                <label className="font-semibold text-slate-700">Jabatan / Pekerjaan Penerima:</label>
                <input
                  type="text"
                  value={penerimaPekerjaan}
                  onChange={(e) => setPenerimaPekerjaan(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                  placeholder="Pemilik Toko / Rekanan Bangunan"
                />
              </div>

              <div className="col-span-full space-y-1">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-700">Uraian Transaksi (Yaitu untuk pembayaran):</label>
                  <button
                    type="button"
                    onClick={handleAutoGenerateUraian}
                    className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Auto-Generate dari Rincian Barang</span>
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={uraian}
                  onChange={(e) => setUraian(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500"
                  placeholder="Pembayaran Lunas Biaya Pembelian Material/Bahan (Semen, Pasir, Bata Ringan), Untuk Pekerjaan Revitalisasi..."
                />
              </div>
            </div>
          </div>

          {/* Smart Action Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-extrabold text-blue-950 flex items-center gap-1">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>Fitur Cerdas Otomatis:</span>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSmartAutoFixUnitsAndPrices}
                className="flex items-center gap-1.5 bg-white hover:bg-amber-50 text-slate-800 border border-amber-300 px-3 py-1.5 rounded-lg text-xs font-bold shadow-2xs transition cursor-pointer"
                title="Konversi otomatis Bata Ringan m3 -> bh, Kerikil/Pasir -> m3 harga pasar wajar"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>✨ Auto-Fix Satuan & Harga Pasar</span>
              </button>

              <button
                type="button"
                onClick={handleSmartRebalanceToBudget}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold shadow-2xs transition cursor-pointer"
                title="Seimbangkan rincian barang agar total persis sama dengan target anggaran"
              >
                <Scale className="w-3.5 h-3.5 text-amber-300" />
                <span>⚖️ Seimbangkan ke Target Anggaran</span>
              </button>

              <button
                type="button"
                onClick={handleAddItem}
                className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-2xs transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Tambah Baris</span>
              </button>
            </div>
          </div>

          {/* Item Breakdown Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">Tabel Rincian Pembelian Barang / Jasa</span>
              <span className="text-[11px] text-slate-500">{items.length} Macam Barang Terdaftar</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold">
                    <th className="py-2.5 px-3 w-10 text-center">No</th>
                    <th className="py-2.5 px-3 min-w-[220px]">Nama Barang / Material</th>
                    <th className="py-2.5 px-3 w-24">Banyaknya (Vol)</th>
                    <th className="py-2.5 px-3 w-24">Satuan</th>
                    <th className="py-2.5 px-3 w-32 text-right">Harga Satuan (Rp)</th>
                    <th className="py-2.5 px-3 w-36 text-right">Total (Rp)</th>
                    <th className="py-2.5 px-3 w-12 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((it, idx) => (
                    <tr key={it.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-2 px-3 text-center font-bold text-slate-500">{idx + 1}</td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={it.namaBarang}
                          onChange={(e) => handleItemChange(it.id, 'namaBarang', e.target.value)}
                          className="w-full px-2 py-1 bg-white border border-slate-200 rounded font-medium focus:ring-1 focus:ring-blue-500"
                          placeholder="Nama Material (cth: Bata Ringan Hebel)"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="number"
                          step="any"
                          value={it.volume}
                          onChange={(e) => handleItemChange(it.id, 'volume', e.target.value)}
                          className="w-full px-2 py-1 bg-white border border-slate-200 rounded font-mono font-bold text-center focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={it.satuan}
                          onChange={(e) => handleItemChange(it.id, 'satuan', e.target.value)}
                          className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-center focus:ring-1 focus:ring-blue-500"
                          placeholder="bh / m³ / Zak"
                          list="satuan-options"
                        />
                        <datalist id="satuan-options">
                          <option value="bh" />
                          <option value="m³" />
                          <option value="Zak" />
                          <option value="btg" />
                          <option value="lbr" />
                          <option value="kg" />
                          <option value="klg" />
                          <option value="dus" />
                          <option value="roll" />
                          <option value="set" />
                          <option value="unit" />
                        </datalist>
                      </td>
                      <td className="py-2 px-3 text-right">
                        <input
                          type="number"
                          step="any"
                          value={it.hargaSatuan}
                          onChange={(e) => handleItemChange(it.id, 'hargaSatuan', e.target.value)}
                          className="w-full px-2 py-1 bg-white border border-slate-200 rounded font-mono text-right focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                      <td className="py-2 px-3 text-right">
                        <input
                          type="number"
                          value={it.jumlah}
                          onChange={(e) => handleItemChange(it.id, 'jumlah', e.target.value)}
                          className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded font-mono font-extrabold text-right text-blue-900 focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                      <td className="py-2 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteItem(it.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 cursor-pointer"
                          title="Hapus baris"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 border-t-2 border-slate-300 font-extrabold text-xs">
                    <td colSpan={5} className="py-3 px-4 text-right text-slate-800">
                      Total Nilai Kwitansi:
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-sm text-blue-700">
                      {formatRupiah(totalItemsNominal)}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            💡 Perubahan pada kwitansi ini akan otomatis memperbarui SPB, Bon Toko, dan Buku Kas Umum (BKU).
          </p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSaveKwitansi}
              className="px-5 py-2 rounded-xl text-xs font-extrabold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-500/20 cursor-pointer"
            >
              💾 Simpan & Perbarui Kwitansi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
