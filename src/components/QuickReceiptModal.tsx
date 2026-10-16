import React, { useState, useMemo, useEffect } from 'react';
import { X, Plus, Trash2, Receipt, Sparkles, Store, Layers, Lock, ShieldCheck, Tag, Calendar } from 'lucide-react';
import { KwitansiDocument, TokoItem, StoreVendor, RealSchoolData, SchoolMasterData, ProjectProgressWeek } from '../types';
import { formatRupiah } from '../utils/formatters';
import { getBulanFromTanggal, formatIndonesianDateLong, getAllMonthOptions, getAvailableMonthsForSchool, getMonthFromPeriodString, sanitizeYear } from '../utils/monthHelper';

interface QuickReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (kwitansi: KwitansiDocument) => void;
  availableStores?: StoreVendor[];
  realSchoolData?: RealSchoolData;
  school?: SchoolMasterData;
  progressWeeks?: ProjectProgressWeek[];
}

export const QuickReceiptModal: React.FC<QuickReceiptModalProps> = ({
  isOpen,
  onClose,
  onSave,
  availableStores = [],
  realSchoolData,
  school,
  progressWeeks = [],
}) => {
  const effYear = useMemo(() => String(sanitizeYear(school?.tahunAnggaran, 2026)), [school?.tahunAnggaran]);
  const monthGroups = useMemo(() => getAllMonthOptions(effYear), [effYear]);
  const activeSchoolMonths = useMemo(() => {
    const mappedWeeks = progressWeeks && progressWeeks.length > 0 ? progressWeeks.map((w) => ({ bulan: getMonthFromPeriodString(w.periode, effYear) })) : undefined;
    return getAvailableMonthsForSchool(school, mappedWeeks ? [mappedWeeks] : undefined).filter(
      (m) => m !== 'ALL'
    );
  }, [school, progressWeeks, effYear]);

  const [tipe, setTipe] = useState<'MATERIAL' | 'PINTU_JENDELA' | 'UPAH' | 'KONSULTAN' | 'PERABOT' | 'OPERASIONAL'>('MATERIAL');
  const [noBukti, setNoBukti] = useState(`KW/${Math.floor(Math.random() * 900 + 100)}/${effYear}`);
  const [noSpb, setNoSpb] = useState(`SPB/${Math.floor(Math.random() * 900 + 100)}/${effYear}`);
  const [tanggal, setTanggal] = useState(`01/08/${effYear}`);
  const [tanggalFormatted, setTanggalFormatted] = useState(`1 Agustus ${effYear}`);
  const [bulan, setBulan] = useState(`Agustus ${effYear}`);
  const [namaToko, setNamaToko] = useState(availableStores[0]?.namaToko || 'TOKO USAHA MAJU');
  const [penerimaNama, setPenerimaNama] = useState(availableStores[0]?.pemilikNama || 'H. Sulaiman');
  const [penerimaPekerjaan, setPenerimaPekerjaan] = useState(availableStores[0]?.pekerjaan || 'Pemilik Toko');
  const [penerimaAlamat, setPenerimaAlamat] = useState(availableStores[0]?.alamat || 'Lhokseumawe');
  const [uraian, setUraian] = useState(
    `Pembayaran Lunas Biaya Pembelian Material Bangunan, Untuk Pekerjaan Revitalisasi ${school?.namaSekolah || 'Sekolah'}, Tahun ${effYear}, Daftar Terlampir.`
  );

  const [items, setItems] = useState<TokoItem[]>([
    { namaBarang: 'Semen PC (40 kg)', volume: 50, satuan: 'Zak', hargaSatuan: 72000, jumlah: 3600000 },
  ]);

  const [isPpn, setIsPpn] = useState(false);
  const [isPph22, setIsPph22] = useState(false);
  const [isPph23, setIsPph23] = useState(false);

  // Solusi 3: Mode Proteksi Kunci (Locked Manual Receipt) aktif secara default
  const [isLocked, setIsLocked] = useState(true);

  // Handler for Tanggal input change with auto-sync to Bulan Buku and formatted date
  const handleTanggalChange = (val: string) => {
    setTanggal(val);
    const detectedBulan = getBulanFromTanggal(val, effYear);
    if (detectedBulan) {
      setBulan(detectedBulan);
    }
    const formatted = formatIndonesianDateLong(val, effYear);
    if (formatted) {
      setTanggalFormatted(formatted);
    }
  };

  // Handler for Bulan Buku change with optional adjustment of Tanggal year/month
  const handleBulanChange = (val: string) => {
    setBulan(val);
  };

  // Extract all RAB SubItems and AHSP components for auto-completion & Solusi 2 (Item Linking)
  const rabAndAhspItems = useMemo(() => {
    const list: { id: string; pekerjaan: string; uraian: string; satuan: string; hargaSatuan: number; volumeRab?: number; source: 'RAB' | 'AHSP' }[] = [];

    // 1. RAB Items
    if (realSchoolData?.divisions) {
      realSchoolData.divisions.forEach((div) => {
        (div.items || []).forEach((it) => {
          list.push({
            id: `rab-${it.id}`,
            pekerjaan: div.uraian,
            uraian: it.uraian,
            satuan: it.satuan || 'unit',
            hargaSatuan: it.hargaSatuan || 0,
            volumeRab: it.volume || 0,
            source: 'RAB',
          });
        });
      });
    }

    // 2. AHSP Components
    if (realSchoolData?.ahspList) {
      realSchoolData.ahspList.forEach((ah) => {
        (ah.komponen || []).forEach((c) => {
          list.push({
            id: c.id || `c-${Math.random()}`,
            pekerjaan: ah.namaPekerjaan,
            uraian: c.uraian,
            satuan: c.satuan || 'unit',
            hargaSatuan: c.hargaSatuan || 0,
            volumeRab: 0,
            source: 'AHSP',
          });
        });
      });
    }
    return list;
  }, [realSchoolData]);

  if (!isOpen) return null;

  const handleSelectPredefinedStore = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const storeId = e.target.value;
    if (!storeId) return;
    const found = availableStores.find((s) => s.id === storeId || s.namaToko === storeId);
    if (found) {
      setNamaToko(found.namaToko);
      setPenerimaNama(found.pemilikNama);
      setPenerimaPekerjaan(found.pekerjaan || 'Pemilik Toko');
      setPenerimaAlamat(found.alamat);
      if (found.kategori === 'PINTU_JENDELA_ALUMINIUM') {
        setTipe('PINTU_JENDELA');
        setNoBukti('Fur/01/2026');
        setNoSpb('SPB-Fur/01/2026');
      } else if (found.kategori === 'PERABOT') {
        setTipe('PERABOT');
      } else if (found.kategori === 'PERENCANA' || found.kategori === 'PENGAWAS' || found.kategori === 'KONSULTAN') {
        setTipe('KONSULTAN');
      } else if (found.kategori === 'OPERASIONAL' || found.kategori === 'K3') {
        setTipe('OPERASIONAL');
      } else {
        setTipe('MATERIAL');
      }
    }
  };

  const handleSelectPredefinedItem = (index: number, itemId: string) => {
    if (!itemId) return;
    const matched = rabAndAhspItems.find((c) => c.id === itemId);
    if (matched) {
      const updated = [...items];
      const item = { ...updated[index] };
      item.namaBarang = matched.uraian;
      item.satuan = matched.satuan;
      item.hargaSatuan = matched.hargaSatuan;
      item.rabItemIdRef = matched.id.replace(/^rab-/, '');
      item.rabItemName = matched.uraian;
      item.rabDivisionKode = matched.pekerjaan;
      if (matched.volumeRab && matched.volumeRab > 0 && (!item.volume || item.volume === 1)) {
        item.volume = matched.volumeRab;
      }
      item.jumlah = Math.round((item.volume || 1) * matched.hargaSatuan);
      updated[index] = item;
      setItems(updated);
    }
  };

  const totalNominal = items.reduce((sum, it) => sum + it.jumlah, 0);

  const handleItemChange = (index: number, field: keyof TokoItem, val: any) => {
    const updated = [...items];
    const item = { ...updated[index], [field]: val };
    if (field === 'volume' || field === 'hargaSatuan') {
      const v = field === 'volume' ? parseFloat(val) || 0 : item.volume;
      const h = field === 'hargaSatuan' ? parseFloat(val) || 0 : item.hargaSatuan;
      item.jumlah = Math.round(v * h);
    }
    updated[index] = item;
    setItems(updated);
  };

  const handleAddItem = () => {
    setItems([...items, { namaBarang: '', volume: 1, satuan: 'unit', hargaSatuan: 0, jumlah: 0 }]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let ppnAmount = 0;
    let pph22Amount = 0;
    let pph23Amount = 0;

    if (isPpn) {
      ppnAmount = Math.round((totalNominal / 1.11) * 0.11 * 100) / 100;
    }
    if (isPph22) {
      pph22Amount = Math.round((totalNominal / 1.11) * 0.015 * 100) / 100;
    }
    if (isPph23) {
      pph23Amount = Math.round(totalNominal * 0.04 * 100) / 100;
    }

    const isMaterialNoBukti = /kwt[\/\-_]?mat|kw[\/\-_]?mat|\bmat\b|mat[\/\-_]|material/i.test(noBukti || '');
    const effectiveTipe = isMaterialNoBukti ? 'MATERIAL' : tipe;

    let finalUraian = uraian;
    if (isMaterialNoBukti && /honorarium|pengawas|perencana/i.test(finalUraian)) {
      finalUraian = namaToko ? `Pembayaran Lunas Pembelian Material/Bahan Dari ${namaToko}` : 'Pembayaran Lunas Pembelian Material/Bahan';
    }

    const linkedItemIds = items.map((it) => it.rabItemIdRef).filter(Boolean) as string[];
    const linkedDivs = Array.from(new Set(items.map((it) => it.rabDivisionKode).filter(Boolean))) as string[];

    const doc: KwitansiDocument = {
      id: `kw-manual-${Date.now()}`,
      noBukti,
      noSpb,
      tipe: effectiveTipe,
      tanggal,
      tanggalFormatted,
      bulan,
      uraian: finalUraian,
      penerimaNama,
      penerimaPekerjaan,
      penerimaAlamat,
      namaToko,
      items,
      nominal: totalNominal,
      isPpn,
      isPph22,
      isPph23,
      ppnAmount,
      pph22Amount,
      pph23Amount,
      kategoriBiayaPajak: effectiveTipe === 'PERABOT' ? 'Perabot' : effectiveTipe === 'KONSULTAN' || effectiveTipe === 'OPERASIONAL' ? 'Perencanaan_Pengelolaan' : 'Konstruksi',
      // Trilogi Solusi: Manual & Locked Status
      isManual: true,
      isLocked,
      linkedRabItemIds: linkedItemIds,
      linkedRabDivisions: linkedDivs,
    };

    onSave(doc);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Buat Kwitansi & Bon Pembelian Instan</h3>
              <p className="text-[11px] text-slate-500">Otomatis membuat kwitansi, faktur toko, SPB dan posting ke BKU</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* TRILOGI SOLUSI (1, 2, 3) PROTECTION BANNER */}
          <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-blue-50 border border-emerald-300 p-3 rounded-xl flex items-start gap-3 shadow-2xs">
            <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg shrink-0 mt-0.5">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="text-xs space-y-1 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="font-extrabold text-emerald-950 flex items-center gap-1.5">
                  <span>🛡️ Mode Proteksi Trilogi: Smart Budget Absorption & Item Linking</span>
                </span>
                <span className="bg-emerald-200 text-emerald-900 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  Anti-Double Spend
                </span>
              </div>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                Kwitansi manual ini otomatis <strong>Terkunci (Locked)</strong>. Saat Auto-Generate dijalankan nanti, sistem akan otomatis membaca kwitansi ini dan <strong>mengurangi kuota belanja RAB</strong>, sehingga tidak ada pembelanjaan ganda di BKU.
              </p>
              <div className="pt-1 flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-amber-300 rounded-md font-bold text-amber-900 cursor-pointer shadow-2xs hover:bg-amber-50 transition text-[11px]">
                  <input
                    type="checkbox"
                    checked={isLocked}
                    onChange={(e) => setIsLocked(e.target.checked)}
                    className="rounded border-amber-400 text-amber-600 focus:ring-amber-500 cursor-pointer"
                  />
                  <Lock className="w-3.5 h-3.5 text-amber-600" />
                  <span>Kunci Kwitansi Ini (Prioritas Utama, Anti-Penimpaan Komputer)</span>
                </label>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">Tipe Transaksi</label>
              <select
                value={tipe}
                onChange={(e) => setTipe(e.target.value as any)}
                className="w-full p-2 border border-slate-300 rounded-lg text-xs"
              >
                <option value="MATERIAL">Bahan Bangunan</option>
                <option value="PINTU_JENDELA">🚪 Pintu & Jendela Aluminium (Fur/xx/xx)</option>
                <option value="UPAH">Upah Tukang</option>
                <option value="KONSULTAN">Jasa Konsultan</option>
                <option value="PERABOT">Perabot</option>
                <option value="OPERASIONAL">Operasional/K3</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">Nomor Kwitansi</label>
              <input
                type="text"
                value={noBukti}
                onChange={(e) => {
                  const val = e.target.value;
                  setNoBukti(val);
                  if (/kwt[\/\-_]?mat|kw[\/\-_]?mat|\bmat\b|mat[\/\-_]|material/i.test(val)) {
                    if (tipe === 'KONSULTAN') setTipe('MATERIAL');
                  }
                }}
                className="w-full p-2 border border-slate-300 rounded-lg text-xs font-mono"
                required
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-semibold text-slate-700">Tanggal (DD/MM/YYYY)</label>
                {tipe === 'MATERIAL' && (
                  <span className="text-[10px] text-blue-600 font-medium bg-blue-50 px-1 rounded">Awal Pekan (Senin/Selasa)</span>
                )}
              </div>
              <input
                type="text"
                value={tanggal}
                onChange={(e) => handleTanggalChange(e.target.value)}
                placeholder="01/08/2026"
                className="w-full p-2 border border-slate-300 rounded-lg text-xs font-mono font-medium focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-semibold text-slate-700">Bulan Buku</label>
                <span className="text-[10px] text-slate-500 font-medium">Buku Kas Umum</span>
              </div>
              <select
                value={bulan}
                onChange={(e) => handleBulanChange(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 bg-white focus:ring-1 focus:ring-blue-500"
              >
                {/* Ensure current custom bulan is present if not already in groups */}
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
          </div>

          {availableStores && availableStores.length > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl flex items-center gap-2">
              <Store className="w-4 h-4 text-emerald-700 shrink-0" />
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-emerald-900 uppercase">
                  Pilih Cepat dari Master Toko & Penyedia SipLah:
                </label>
                <select
                  onChange={handleSelectPredefinedStore}
                  className="w-full text-xs font-semibold text-slate-800 bg-white border border-emerald-300 rounded-lg px-2.5 py-1.5 mt-0.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="">-- Pilih Toko / Penyedia SipLah Terdaftar --</option>
                  {availableStores.map((s) => {
                    const isSiplah = s.kategori === 'SIPLAH' || s.isSiplah;
                    return (
                      <option key={s.id} value={s.id}>
                        {isSiplah ? '🛒 [SIPLAH] ' : '🏢 '}
                        {s.namaToko} - {s.pemilikNama} ({s.kategori})
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] font-semibold text-slate-700">Nama Toko / Rekanan *</label>
                {tipe !== 'UPAH' && namaToko && (() => {
                  const matched = availableStores.find(
                    (s) => s.namaToko.toLowerCase() === namaToko.trim().toLowerCase()
                  );
                  if (matched) {
                    const isSiplah = matched.kategori === 'SIPLAH' || matched.isSiplah;
                    return (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        isSiplah ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {isSiplah ? '🛒 SipLah Terdaftar' : '✅ Terdaftar di Master'}
                      </span>
                    );
                  }
                  return (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 font-bold">
                      ⚠️ Belum di Master
                    </span>
                  );
                })()}
              </div>
              <input
                type="text"
                value={namaToko}
                onChange={(e) => setNamaToko(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-lg text-xs font-semibold uppercase"
                placeholder="Contoh: TOKO USAHA FAMILY"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">Nama Penerima / Pemilik *</label>
              <input
                type="text"
                value={penerimaNama}
                onChange={(e) => setPenerimaNama(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-lg text-xs"
                placeholder="Contoh: H. Sulaiman"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 mb-1">Uraian Keperluan Pembayaran</label>
            <textarea
              rows={2}
              value={uraian}
              onChange={(e) => setUraian(e.target.value)}
              className="w-full p-2 border border-slate-300 rounded-lg text-xs"
              required
            />
          </div>

          {/* Item List */}
          <div className="space-y-2 border-t border-slate-200 pt-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">Daftar Barang / Jasa pada Faktur & Kwitansi:</span>
              <button
                type="button"
                onClick={handleAddItem}
                className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Tambah Baris
              </button>
            </div>

            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-50 p-2 rounded-lg border border-slate-200">
                  <div className="col-span-5 space-y-1">
                    <input
                      type="text"
                      placeholder={tipe === 'UPAH' || tipe === 'KONSULTAN' || (tipe === 'OPERASIONAL' && !namaToko) ? "Jenis Layanan / Uraian" : "Nama Barang / Uraian"}
                      value={item.namaBarang}
                      onChange={(e) => handleItemChange(idx, 'namaBarang', e.target.value)}
                      className="w-full p-1.5 text-xs bg-white border border-slate-200 rounded font-medium"
                      required
                    />
                    {rabAndAhspItems.length > 0 && (
                      <select
                        onChange={(e) => handleSelectPredefinedItem(idx, e.target.value)}
                        className="w-full text-[10px] text-indigo-700 bg-indigo-50/80 border border-indigo-200 rounded px-1.5 py-0.5 cursor-pointer"
                      >
                        <option value="">-- Pilih dari RAB Real Sekolah / AHSP --</option>
                        {rabAndAhspItems.map((c) => (
                          <option key={c.id} value={c.id}>
                            [{c.source}] {c.uraian} ({c.satuan}) - {formatRupiah(c.hargaSatuan)} [{c.pekerjaan}]
                          </option>
                        ))}
                      </select>
                    )}
                    {item.rabItemName && (
                      <div className="flex items-center justify-between text-[10px] bg-emerald-50 border border-emerald-300 text-emerald-900 px-2 py-0.5 rounded">
                        <span className="truncate flex items-center gap-1 font-semibold" title={item.rabItemName}>
                          <Tag className="w-3 h-3 text-emerald-600 shrink-0" />
                          <span className="truncate">Tautan RAB: {item.rabItemName}</span>
                        </span>
                        <label className="inline-flex items-center gap-1 font-bold text-emerald-800 ml-1 shrink-0 cursor-pointer text-[9px]" title="Jika dicentang, item ini dianggap selesai 100% dan akan di-skip oleh Auto-Generate">
                          <input
                            type="checkbox"
                            checked={Boolean(item.isManualDibelanjakan)}
                            onChange={(e) => handleItemChange(idx, 'isManualDibelanjakan', e.target.checked)}
                            className="rounded text-emerald-600 focus:ring-emerald-500"
                          />
                          <span>Selesai Mandiri</span>
                        </label>
                      </div>
                    )}
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Vol"
                      value={item.volume}
                      onChange={(e) => handleItemChange(idx, 'volume', e.target.value)}
                      className="w-full p-1.5 text-xs bg-white border border-slate-200 rounded text-right"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="text"
                      placeholder="Satuan"
                      value={item.satuan}
                      onChange={(e) => handleItemChange(idx, 'satuan', e.target.value)}
                      className="w-full p-1.5 text-xs bg-white border border-slate-200 rounded text-center"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      placeholder="Harga"
                      value={item.hargaSatuan}
                      onChange={(e) => handleItemChange(idx, 'hargaSatuan', e.target.value)}
                      className="w-full p-1.5 text-xs bg-white border border-slate-200 rounded text-right font-mono"
                    />
                  </div>
                  <div className="col-span-1 text-center">
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="text-rose-500 hover:text-rose-700"
                      >
                        <Trash2 className="w-4 h-4 mx-auto" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end p-2 text-xs font-bold text-slate-900">
              <span>Total Kwitansi: {formatRupiah(totalNominal)}</span>
            </div>
          </div>

          {/* Tax Options */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <span className="text-[11px] font-bold text-slate-700">Perlakuan Pajak:</span>
            <div className="flex flex-wrap gap-4 text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPpn}
                  onChange={(e) => setIsPpn(e.target.checked)}
                  className="rounded text-blue-600"
                />
                <span>PPN 11%</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPph22}
                  onChange={(e) => setIsPph22(e.target.checked)}
                  className="rounded text-blue-600"
                />
                <span>PPh Ps 22 (1.5%)</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPph23}
                  onChange={(e) => setIsPph23(e.target.checked)}
                  className="rounded text-blue-600"
                />
                <span>PPh 23 (Konsultan / Jasa)</span>
              </label>
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-200"
            >
              Batal
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 shadow-md cursor-pointer"
            >
              Simpan Kwitansi & Posting ke BKU
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
