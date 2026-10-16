import React, { useState, useEffect } from 'react';
import {
  X,
  Printer,
  Edit3,
  Check,
  Plus,
  Trash2,
  Store,
  FileText,
  ShoppingCart,
  Calendar,
  DollarSign,
  UserCheck,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import { BkuTransaction, KwitansiDocument, SchoolMasterData, StoreVendor, TokoItem } from '../types';
import { formatRupiah } from '../utils/formatters';
import { terbilangRupiah } from '../utils/terbilang';
import {
  getAutoHealedKwitansiItems,
  getHarmonizedKwitansiNoBukti,
  getHarmonizedKwitansiUraian,
} from '../services/autoGeneratorService';
import { synthesizeKwitansiFromTransaction } from '../services/cashLedgerIntegrationService';

interface BkuDocumentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: BkuTransaction | null;
  kwitansi: KwitansiDocument | null;
  school: SchoolMasterData;
  stores?: StoreVendor[];
  onSaveKwitansi?: (updatedKw: KwitansiDocument, updatedTx?: Partial<BkuTransaction>) => void;
  onPrintDocument?: (docType: 'KWITANSI' | 'FAKTUR' | 'SPB' | 'ALL', kwId?: string) => void;
}

export const BkuDocumentPreviewModal: React.FC<BkuDocumentPreviewModalProps> = ({
  isOpen,
  onClose,
  transaction,
  kwitansi,
  school,
  stores = [],
  onSaveKwitansi,
  onPrintDocument,
}) => {
  const [activeTab, setActiveTab] = useState<'KWITANSI' | 'FAKTUR' | 'SPB' | 'EDIT'>('KWITANSI');
  const [isEditing, setIsEditing] = useState(false);

  // Editable Form State
  const [formNoBukti, setFormNoBukti] = useState('');
  const [formNoSpb, setFormNoSpb] = useState('');
  const [formTanggal, setFormTanggal] = useState('');
  const [formUraian, setFormUraian] = useState('');
  const [formNamaToko, setFormNamaToko] = useState('');
  const [formPenerimaNama, setFormPenerimaNama] = useState('');
  const [formPenerimaPekerjaan, setFormPenerimaPekerjaan] = useState('');
  const [formPenerimaAlamat, setFormPenerimaAlamat] = useState('');
  const [formItems, setFormItems] = useState<TokoItem[]>([]);
  const [formIsPpn, setFormIsPpn] = useState(false);
  const [formIsPph22, setFormIsPph22] = useState(false);
  const [saveSuccessNotice, setSaveSuccessNotice] = useState(false);

  // Sync state whenever transaction or kwitansi changes
  useEffect(() => {
    if (!isOpen) return;

    const effectiveKw =
      kwitansi ||
      (transaction ? synthesizeKwitansiFromTransaction(transaction, school, stores) : null);

    if (effectiveKw) {
      const isMat =
        /kwt[\/\-_]?mat|kw[\/\-_]?mat|\bmat\b|mat[\/\-_]|material/i.test(effectiveKw.noBukti || transaction?.noBukti || '') ||
        /bahan|material|toko|tb\./i.test(transaction?.uraian || '');
      const hasFalseHonor = /honorarium|pengawas|perencana/i.test(effectiveKw.uraian || '');

      let displayUraian = effectiveKw.uraian || transaction?.uraian || '';
      let displayToko = effectiveKw.namaToko || '';
      let displayPenerima = effectiveKw.penerimaNama || '';
      let displayPekerjaan = effectiveKw.penerimaPekerjaan || 'Penyedia Barang';

      if (isMat && hasFalseHonor) {
        displayToko = displayToko && !/erwin|dzikri|pengawas|perencana/i.test(displayToko) ? displayToko : 'TB. REKANAN MATERIAL';
        displayPenerima = displayToko;
        displayPekerjaan = 'Penyedia Bahan Bangunan';
        displayUraian = `Pembayaran Lunas Pembelian Material/Bahan Dari ${displayToko}`;
      }

      setFormNoBukti(effectiveKw.noBukti || transaction?.noBukti || '');
      setFormNoSpb(effectiveKw.noSpb || `SPB-${effectiveKw.noBukti || '01'}`);
      setFormTanggal(effectiveKw.tanggal || transaction?.tanggal || '');
      setFormUraian(displayUraian);
      setFormNamaToko(displayToko);
      setFormPenerimaNama(displayPenerima);
      setFormPenerimaPekerjaan(displayPekerjaan);
      setFormPenerimaAlamat(effectiveKw.penerimaAlamat || school.kabKota);
      const healedItems = getAutoHealedKwitansiItems({
        ...effectiveKw,
        tipe: isMat ? 'MATERIAL' : effectiveKw.tipe,
        uraian: displayUraian,
      });
      setFormItems(
        healedItems && healedItems.length > 0
          ? healedItems.map((it) => ({ ...it }))
          : [
              {
                namaBarang: effectiveKw.uraian || transaction?.uraian || 'Pengadaan Material/Barang',
                volume: 1,
                satuan: 'ls',
                hargaSatuan: effectiveKw.nominal || transaction?.pengeluaran || 0,
                jumlah: effectiveKw.nominal || transaction?.pengeluaran || 0,
              },
            ]
      );
      setFormIsPpn(Boolean(effectiveKw.isPpn));
      setFormIsPph22(Boolean(effectiveKw.isPph22));
    }
    setActiveTab('KWITANSI');
    setIsEditing(false);
    setSaveSuccessNotice(false);
  }, [isOpen, kwitansi, transaction, school, stores]);

  if (!isOpen || (!transaction && !kwitansi)) return null;

  const currentNominal = formItems.reduce((sum, item) => sum + (item.jumlah || 0), 0);
  const displayNominal = currentNominal > 0 ? currentNominal : (transaction?.pengeluaran || transaction?.penerimaan || 0);

  const isUpah =
    kwitansi?.tipe === 'UPAH' ||
    /upah|tukang|pekerja|mandor/i.test(transaction?.uraian || '') ||
    /upah|tukang|pekerja|mandor/i.test(formUraian);

  const isBank =
    /penarikan.*bank|tarik tunai|setoran bank/i.test(transaction?.uraian || '') ||
    transaction?.noBukti?.startsWith('BKT-01') ||
    transaction?.jenis === 'PENERIMAAN';

  const isPajak = /setor.*pajak|ppn|pph/i.test(transaction?.uraian || '');

  // Handle Items manipulation in Edit Mode
  const handleItemChange = (index: number, field: keyof TokoItem, value: any) => {
    const updated = [...formItems];
    const current = { ...updated[index], [field]: value };
    if (field === 'volume' || field === 'hargaSatuan') {
      const vol = parseFloat(current.volume as any) || 0;
      const hrg = parseFloat(current.hargaSatuan as any) || 0;
      current.jumlah = Math.round(vol * hrg);
    }
    updated[index] = current;
    setFormItems(updated);
  };

  const handleAddItem = () => {
    setFormItems([
      ...formItems,
      {
        namaBarang: 'Material / Barang Baru',
        volume: 1,
        satuan: 'buah',
        hargaSatuan: 50000,
        jumlah: 50000,
      },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (formItems.length <= 1) return;
    setFormItems(formItems.filter((_, i) => i !== index));
  };

  const handleSelectStore = (storeId: string) => {
    const found = stores.find((s) => s.id === storeId || s.namaToko === storeId);
    if (found) {
      setFormNamaToko(found.namaToko);
      setFormPenerimaNama(found.pemilikNama);
      setFormPenerimaPekerjaan(found.pekerjaan || 'Pemilik Toko');
      setFormPenerimaAlamat(found.alamat);
    }
  };

  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    const updatedNominal = formItems.reduce((acc, it) => acc + (it.jumlah || 0), 0);

    const updatedKw: KwitansiDocument = {
      id: kwitansi ? kwitansi.id : `kw-sync-${transaction?.id || Date.now()}`,
      noBukti: formNoBukti,
      tipe: kwitansi?.tipe || (isUpah ? 'UPAH' : 'MATERIAL'),
      tanggal: formTanggal,
      tanggalFormatted: formTanggal,
      bulan: kwitansi?.bulan || transaction?.bulan || 'Juli 2026',
      uraian: formUraian,
      penerimaNama: formPenerimaNama,
      penerimaPekerjaan: formPenerimaPekerjaan,
      penerimaAlamat: formPenerimaAlamat,
      namaToko: formNamaToko || undefined,
      items: formItems,
      nominal: updatedNominal,
      isPpn: formIsPpn,
      isPph22: formIsPph22,
      isPph23: false,
      ppnAmount: formIsPpn ? Math.round(updatedNominal * 0.11) : 0,
      pph22Amount: formIsPph22 ? Math.round(updatedNominal * 0.015) : 0,
      pph23Amount: 0,
      noSpb: formNoSpb,
      keteranganSpb: `Surat Perintah Bayar ${formNoSpb} - ${school.namaSekolah}`,
      mingguKeRef: kwitansi?.mingguKeRef,
    };

    const updatedTx: Partial<BkuTransaction> = {
      uraian: formUraian,
      noBukti: formNoBukti,
      pengeluaran: transaction?.pengeluaran ? updatedNominal : 0,
      penerimaan: transaction?.penerimaan ? updatedNominal : 0,
    };

    if (onSaveKwitansi) {
      onSaveKwitansi(updatedKw, updatedTx);
    }

    setSaveSuccessNotice(true);
    setTimeout(() => {
      setSaveSuccessNotice(false);
      setIsEditing(false);
      setActiveTab('KWITANSI');
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs animate-fade-in font-sans">
      <div className="bg-white w-full max-w-4xl max-h-[92vh] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between gap-3 border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`p-2.5 rounded-xl shadow-xs ${
              isUpah
                ? 'bg-purple-600'
                : isBank
                ? 'bg-emerald-600'
                : isPajak
                ? 'bg-amber-600'
                : 'bg-blue-600'
            }`}>
              {isUpah ? (
                <UserCheck className="w-5 h-5 text-white" />
              ) : isBank ? (
                <DollarSign className="w-5 h-5 text-white" />
              ) : isPajak ? (
                <ShieldCheck className="w-5 h-5 text-white" />
              ) : (
                <FileText className="w-5 h-5 text-white" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  isUpah
                    ? 'bg-purple-900/80 text-purple-200 border border-purple-700'
                    : isBank
                    ? 'bg-emerald-900/80 text-emerald-200 border border-emerald-700'
                    : 'bg-blue-900/80 text-blue-200 border border-blue-700'
                }`}>
                  {isUpah ? 'Dokumen Upah Tukang' : isBank ? 'Dokumen Kas Bank' : 'Dokumen Belanja Rekanan'}
                </span>
                <span className="font-mono text-xs font-bold text-amber-300">
                  {formNoBukti || transaction?.noBukti || '-'}
                </span>
              </div>
              <h3 className="font-bold text-sm truncate text-white mt-0.5" title={formUraian}>
                {formUraian}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (onPrintDocument && (kwitansi?.id || transaction?.id)) {
                  onPrintDocument(activeTab === 'FAKTUR' ? 'FAKTUR' : activeTab === 'SPB' ? 'SPB' : 'KWITANSI', kwitansi?.id);
                } else {
                  window.print();
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer"
              title="Cetak Dokumen Ini"
            >
              <Printer className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Cetak Dokumen</span>
            </button>

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
              <span>{isEditing ? 'Mode Preview' : 'Edit Dokumen'}</span>
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
            <span>Perubahan berhasil disimpan dan telah disinkronkan ke BKU, BKT & Pajak!</span>
          </div>
        )}

        {/* Tab Selector */}
        {!isEditing && (
          <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 flex items-center justify-between gap-2 overflow-x-auto">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('KWITANSI')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                  activeTab === 'KWITANSI'
                    ? 'bg-white text-blue-800 shadow-xs border border-blue-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                }`}
              >
                <FileText className="w-3.5 h-3.5 text-blue-600" />
                <span>Kwitansi Resmi (LPJ)</span>
              </button>

              {!isBank && !isUpah && (
                <>
                  <button
                    type="button"
                    onClick={() => setActiveTab('FAKTUR')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                      activeTab === 'FAKTUR'
                        ? 'bg-white text-emerald-800 shadow-xs border border-emerald-200'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                    }`}
                  >
                    <ShoppingCart className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Faktur / Bon Toko</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('SPB')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                      activeTab === 'SPB'
                        ? 'bg-white text-purple-800 shadow-xs border border-purple-200'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                    }`}
                  >
                    <Store className="w-3.5 h-3.5 text-purple-600" />
                    <span>Surat Pesanan Barang (SPB)</span>
                  </button>
                </>
              )}
            </div>

            <div className="text-right">
              <span className="text-[11px] font-bold text-slate-500 mr-1.5">Nominal:</span>
              <span className="text-sm font-extrabold text-blue-700 font-mono">
                {formatRupiah(displayNominal)}
              </span>
            </div>
          </div>
        )}

        {/* Modal Body: Either Preview Document OR Edit Form */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/50">
          {isEditing ? (
            /* ================= MODE EDIT DOKUMEN ================= */
            <form onSubmit={handleSaveForm} className="space-y-4 max-w-3xl mx-auto">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 flex items-start gap-2">
                <Edit3 className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Mode Edit Cepat Dokumen & Transaksi BKU</p>
                  <p className="text-[11px] text-amber-800">
                    Perubahan nama toko, rincian barang, harga, dan volume di bawah ini akan otomatis memperbarui kwitansi fisik, bon belanja, SPB, serta Buku Kas Umum secara sinkron.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">No. Bukti Kwitansi *</label>
                  <input
                    type="text"
                    required
                    value={formNoBukti}
                    onChange={(e) => setFormNoBukti(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">No. SPB Toko</label>
                  <input
                    type="text"
                    value={formNoSpb}
                    onChange={(e) => setFormNoSpb(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Tanggal Transaksi *</label>
                  <input
                    type="text"
                    required
                    value={formTanggal}
                    onChange={(e) => setFormTanggal(e.target.value)}
                    placeholder="DD/MM/YYYY"
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white font-mono"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Uraian Transaksi *</label>
                  <input
                    type="text"
                    required
                    value={formUraian}
                    onChange={(e) => setFormUraian(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white font-medium"
                  />
                </div>
              </div>

              {/* Data Toko Rekanan / Penerima */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Store className="w-3.5 h-3.5 text-blue-600" />
                    <span>Identitas Rekanan / Penerima Uang</span>
                  </h4>

                  {stores.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-500 font-semibold">Pilih Master Toko:</span>
                      <select
                        onChange={(e) => handleSelectStore(e.target.value)}
                        className="px-2 py-1 text-[11px] bg-slate-50 border border-slate-300 rounded-md font-medium text-slate-800"
                        defaultValue=""
                      >
                        <option value="" disabled>-- Pilih Toko Terdaftar --</option>
                        {stores.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.namaToko} ({s.pemilikNama})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Nama Toko / Instansi</label>
                    <input
                      type="text"
                      value={formNamaToko}
                      onChange={(e) => setFormNamaToko(e.target.value)}
                      placeholder="Contoh: TB. USAHA BARU"
                      className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white font-bold uppercase"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Nama Pemilik / Penerima *</label>
                    <input
                      type="text"
                      required
                      value={formPenerimaNama}
                      onChange={(e) => setFormPenerimaNama(e.target.value)}
                      placeholder="Contoh: H. Ahmad Subandi"
                      className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Jabatan / Pekerjaan Penerima</label>
                    <input
                      type="text"
                      value={formPenerimaPekerjaan}
                      onChange={(e) => setFormPenerimaPekerjaan(e.target.value)}
                      placeholder="Contoh: Pemilik Toko / Mandor"
                      className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Alamat Penerima / Domisili</label>
                    <input
                      type="text"
                      value={formPenerimaAlamat}
                      onChange={(e) => setFormPenerimaAlamat(e.target.value)}
                      placeholder="Contoh: Jl. Merdeka No. 12"
                      className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Rincian Item Belanja */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <ShoppingCart className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Daftar Rincian Barang / Layanan ({formItems.length} Item)</span>
                  </h4>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Tambah Baris Barang</span>
                  </button>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-700 text-[10px] uppercase font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-2 w-10 text-center">No</th>
                        <th className="p-2">Nama Barang / Uraian</th>
                        <th className="p-2 w-20 text-center">Vol</th>
                        <th className="p-2 w-20 text-center">Satuan</th>
                        <th className="p-2 w-28 text-right">Harga (Rp)</th>
                        <th className="p-2 w-28 text-right">Total (Rp)</th>
                        <th className="p-2 w-12 text-center">Hapus</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {formItems.map((it, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2 text-center font-mono font-bold text-slate-400">{idx + 1}</td>
                          <td className="p-1.5">
                            <input
                              type="text"
                              required
                              value={it.namaBarang}
                              onChange={(e) => handleItemChange(idx, 'namaBarang', e.target.value)}
                              className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:border-blue-400"
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              type="number"
                              step="any"
                              required
                              value={it.volume}
                              onChange={(e) => handleItemChange(idx, 'volume', e.target.value)}
                              className="w-full px-2 py-1 text-xs text-center border border-slate-200 rounded font-mono"
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              type="text"
                              value={it.satuan}
                              onChange={(e) => handleItemChange(idx, 'satuan', e.target.value)}
                              className="w-full px-2 py-1 text-xs text-center border border-slate-200 rounded font-mono"
                            />
                          </td>
                          <td className="p-1.5">
                            <input
                              type="number"
                              required
                              value={it.hargaSatuan}
                              onChange={(e) => handleItemChange(idx, 'hargaSatuan', e.target.value)}
                              className="w-full px-2 py-1 text-xs text-right border border-slate-200 rounded font-mono"
                            />
                          </td>
                          <td className="p-2 text-right font-mono font-bold text-slate-900">
                            {formatRupiah(it.jumlah, false)}
                          </td>
                          <td className="p-1.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              disabled={formItems.length <= 1}
                              className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-30 cursor-pointer"
                              title="Hapus baris"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 font-bold border-t border-slate-200">
                      <tr>
                        <td colSpan={5} className="p-2 text-right uppercase text-[11px]">Total Belanja :</td>
                        <td className="p-2 text-right font-mono text-blue-700 text-sm">{formatRupiah(currentNominal, false)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Tombol Simpan */}
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
                  <span>Simpan Perubahan Dokumen</span>
                </button>
              </div>
            </form>
          ) : (
            /* ================= MODE PREVIEW DOKUMEN ================= */
            <div className="space-y-6 max-w-3xl mx-auto">
              {/* TAB 1: KWITANSI RESMI */}
              {activeTab === 'KWITANSI' && (
                <div className="bg-white p-6 sm:p-8 rounded-xl border border-slate-300 shadow-sm font-serif text-xs space-y-6">
                  {/* Header Kwitansi Resmi */}
                  <div className="flex justify-between items-start border-b border-black pb-2">
                    <div className="font-mono text-xs space-y-0.5 font-sans">
                      <p>
                        No. :{' '}
                        <strong>
                          {getHarmonizedKwitansiNoBukti(
                            kwitansi || { noBukti: formNoBukti, tanggal: formTanggal },
                            school.tahunAnggaran
                          ) || formNoBukti || transaction?.noBukti || '-'}
                        </strong>
                      </p>
                      <p>Tahun : <strong>{school.tahunAnggaran}</strong></p>
                    </div>
                    <div className="text-right">
                      <h2 className="text-xl font-bold tracking-widest uppercase underline font-serif">KWITANSI</h2>
                    </div>
                  </div>

                  {/* Isi Pokok Kwitansi */}
                  <div className="space-y-3 py-2 text-xs font-sans">
                    <div className="grid grid-cols-12 gap-2">
                      <span className="col-span-3 font-medium">Sudah terima dari</span>
                      <span className="col-span-1">:</span>
                      <span className="col-span-8 font-bold text-slate-900">
                        Bendahara {school.namaSekolah}
                      </span>
                    </div>

                    <div className="grid grid-cols-12 gap-2">
                      <span className="col-span-3 font-medium">Uang Banyaknya</span>
                      <span className="col-span-1">:</span>
                      <span className="col-span-8 font-bold italic underline bg-slate-50 p-2.5 rounded border border-slate-200 text-blue-900 font-serif text-sm">
                        {terbilangRupiah(displayNominal)}
                      </span>
                    </div>

                    <div className="grid grid-cols-12 gap-2">
                      <span className="col-span-3 font-medium">Y a i t u</span>
                      <span className="col-span-1">:</span>
                      <span className="col-span-8 leading-relaxed font-semibold text-slate-800">
                        {getHarmonizedKwitansiUraian(
                          kwitansi || { tipe: isUpah ? 'UPAH' : 'MATERIAL', uraian: formUraian, items: formItems }
                        ) || formUraian}
                      </span>
                    </div>
                  </div>

                  {/* Rincian Barang / Layanan Terlampir Sesuai Format Cetak Resmi */}
                  {(() => {
                    const printItems = formItems && formItems.length > 0 ? formItems : (kwitansi ? getAutoHealedKwitansiItems(kwitansi) : []);
                    if (!printItems || printItems.length === 0) return null;

                    let itemColHeader = 'Rincian Barang';
                    let sectionHeader = 'Rincian Barang Terlampir:';

                    const isMatBukti =
                      formNoBukti &&
                      /kwt[\/\-_]?mat|kw[\/\-_]?mat|\bmat\b|mat[\/\-_]|material/i.test(formNoBukti);

                    const kwTipe = isMatBukti ? 'MATERIAL' : kwitansi?.tipe;
                    if (!isMatBukti) {
                      if (kwTipe === 'UPAH' || /upah|harian|borongan|mandor|tukang/i.test(formUraian)) {
                        itemColHeader = 'Daftar Upah / Posisi Tenaga Kerja';
                        sectionHeader = 'Rincian Tenaga Kerja & Upah Terlampir:';
                      } else if (kwTipe === 'KONSULTAN' || /perencana|pengawas/i.test(formUraian)) {
                        itemColHeader = 'Uraian Jasa Konsultansi Teknis';
                        sectionHeader = 'Jenis Layanan / Jasa Terlampir:';
                      } else if (kwTipe === 'OPERASIONAL' || /administrasi|pengelola/i.test(formUraian)) {
                        itemColHeader = 'Uraian Pengelolaan Administrasi & Honorarium';
                        sectionHeader = 'Jenis Layanan / Honorarium Terlampir:';
                      } else if (kwTipe === 'SMKK' || /smkk|k3/i.test(formUraian)) {
                        itemColHeader = 'Rincian Perlengkapan K3 & APD (SMKK)';
                        sectionHeader = 'Rincian Perlengkapan Keselamatan Konstruksi:';
                      }
                    }

                    return (
                      <div className="pt-2 border-t border-slate-300 font-sans">
                        <p className="font-bold text-[11px] text-slate-800 mb-1.5">
                          {sectionHeader}
                        </p>
                        <table className="w-full border-collapse border border-black text-xs font-sans">
                          <thead>
                            <tr className="bg-slate-100 text-center font-bold">
                              <th className="border border-black p-1.5 w-24">Banyaknya</th>
                              <th className="border border-black p-1.5 text-left">{itemColHeader}</th>
                              <th className="border border-black p-1.5 text-right w-32">Harga Satuan</th>
                              <th className="border border-black p-1.5 text-right w-36">Jumlah</th>
                            </tr>
                          </thead>
                          <tbody>
                            {printItems.map((it, idx) => {
                              const displayVol =
                                kwTipe === 'UPAH' || it.satuan === 'HOK' || it.satuan === 'Hari' || it.satuan === 'Hr'
                                  ? Math.round(it.volume)
                                  : it.volume;
                              return (
                                <tr key={idx}>
                                  <td className="border border-black p-1.5 text-center font-mono font-bold">
                                    {displayVol} {it.satuan}
                                  </td>
                                  <td className="border border-black p-1.5 font-medium">{it.namaBarang}</td>
                                  <td className="border border-black p-1.5 text-right font-mono">
                                    {formatRupiah(it.hargaSatuan, false)}
                                  </td>
                                  <td className="border border-black p-1.5 text-right font-mono font-bold">
                                    {formatRupiah(it.jumlah, false)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="font-bold bg-slate-100">
                              <td colSpan={3} className="border border-black p-1.5 text-right uppercase">
                                Total:
                              </td>
                              <td className="border border-black p-1.5 text-right font-mono font-bold text-blue-900">
                                {formatRupiah(displayNominal, false)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    );
                  })()}

                  {/* Kotak Jumlah Nominal Angka */}
                  <div className="pt-2 font-sans">
                    <div className="inline-block border-2 border-black px-4 py-2 font-mono font-bold text-sm">
                      Jumlah Rp. {formatRupiah(displayNominal, false)}
                    </div>
                  </div>

                  {/* Signatures Kwitansi Resmi: Kepala Sekolah (kiri), Yang Menerima (kanan), Bendahara (tengah bawah) */}
                  <div className="grid grid-cols-2 gap-8 text-center text-xs font-sans pt-6 border-t border-slate-300">
                    <div>
                      <p>Setuju dibayar</p>
                      <p className="font-bold">Kepala Sekolah</p>
                      <p>{school.namaSekolah}</p>
                      <div className="h-16" />
                      <p className="font-bold underline uppercase">{school.namaKepalaSekolah}</p>
                      <p className="text-[11px]">NIP. {school.nipKepalaSekolah}</p>
                    </div>
                    <div>
                      <p>{school.kabKota}, {formTanggal || kwitansi?.tanggalFormatted || transaction?.tanggal}</p>
                      <p className="font-bold">Yang Menerima</p>
                      <div className="h-16" />
                      <p className="font-bold underline uppercase">{formPenerimaNama}</p>
                      <p className="text-[11px]">{formPenerimaPekerjaan}</p>
                      <p className="text-[10px] text-slate-600">{formPenerimaAlamat}</p>
                    </div>
                  </div>

                  <div className="text-center font-sans text-xs pt-4 border-t border-slate-300">
                    <p>Lunas dibayar</p>
                    <p className="font-bold">Bendahara</p>
                    <div className="h-12" />
                    <p className="font-bold underline uppercase">{school.namaBendahara}</p>
                    <p className="text-[11px]">NIP. {school.nipBendahara}</p>
                  </div>
                </div>
              )}

              {/* TAB 2: BON / FAKTUR TOKO */}
              {activeTab === 'FAKTUR' && (
                <div className="bg-white p-6 sm:p-8 rounded-xl border border-slate-300 shadow-sm font-sans text-xs space-y-6">
                  <div className="flex justify-between items-start border-b-2 border-black pb-2">
                    <div>
                      <h3 className="font-bold text-base uppercase tracking-wider text-slate-900">
                        {formNamaToko || 'TB. REKANAN MATERIAL'}
                      </h3>
                      <p className="text-[11px] text-slate-600">Penyedia Bahan Bangunan & Perlengkapan</p>
                      <p className="text-[11px] text-slate-600">{formPenerimaAlamat || school.kabKota}</p>
                    </div>
                    <div className="text-right text-xs">
                      <p>{school.kabKota}, {formTanggal || transaction?.tanggal}</p>
                      <p>Kepada Yth: Ketua P2SP</p>
                      <p className="font-semibold text-slate-900">{school.namaSekolah}</p>
                      <p>di {school.kabKota}</p>
                    </div>
                  </div>

                  <div className="text-center">
                    <h4 className="font-bold text-sm uppercase tracking-wider underline">
                      BON / FAKTUR
                    </h4>
                  </div>

                  <table className="w-full border-collapse border border-black text-xs font-sans">
                    <thead>
                      <tr className="bg-slate-100 text-center font-bold">
                        <th className="border border-black p-2 w-28">Banyaknya</th>
                        <th className="border border-black p-2 text-left">Nama Barang</th>
                        <th className="border border-black p-2 text-right w-32">Harga satuan</th>
                        <th className="border border-black p-2 text-right w-36">Jumlah</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formItems.map((it, idx) => (
                        <tr key={idx}>
                          <td className="border border-black p-2 text-center font-mono font-bold">
                            {it.volume} {it.satuan}
                          </td>
                          <td className="border border-black p-2 font-medium">{it.namaBarang}</td>
                          <td className="border border-black p-2 text-right font-mono">
                            {formatRupiah(it.hargaSatuan, false)}
                          </td>
                          <td className="border border-black p-2 text-right font-mono font-bold">
                            {formatRupiah(it.jumlah, false)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-bold bg-slate-100">
                        <td colSpan={3} className="border border-black p-2 text-right uppercase">
                          Jumlah Rp
                        </td>
                        <td className="border border-black p-2 text-right font-mono font-bold text-slate-900 text-sm">
                          {formatRupiah(displayNominal, false)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>

                  <div className="flex justify-end pt-8">
                    <div className="text-center w-60">
                      <p>Hormat kami,</p>
                      <div className="h-16" />
                      <p className="font-bold underline uppercase tracking-wider">
                        {formNamaToko || 'TB. REKANAN MATERIAL'}
                      </p>
                      <p className="text-[10px] text-slate-500">Cap & Tanda Tangan Toko</p>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: SURAT PESANAN BARANG (SPB) */}
              {activeTab === 'SPB' && (
                <div className="bg-white p-6 sm:p-8 rounded-xl border border-slate-300 shadow-sm font-sans text-xs space-y-6">
                  {/* Kop Pemda & Sekolah Resmi Sesuai Juknis */}
                  <div className="text-center border-b-2 border-black pb-2 space-y-0.5">
                    <p className="font-bold uppercase text-xs">PEMERINTAH {school.kabKota.toUpperCase()}</p>
                    <p className="font-bold uppercase text-xs">{school.dinasPendidikan.toUpperCase()}</p>
                    <h3 className="font-extrabold uppercase text-sm">{school.namaSekolah}</h3>
                    <p className="text-[10px] text-slate-600">{school.alamat} {school.kabKota}</p>
                  </div>

                  <div className="flex justify-between items-start text-xs pt-1">
                    <div>
                      <p className="font-mono">
                        Nomor :{' '}
                        <strong>
                          {getHarmonizedKwitansiNoBukti(
                            {
                              noBukti: formNoSpb || kwitansi?.noSpb || `SPB-${formNoBukti || '01'}`,
                              tanggal: formTanggal,
                            },
                            school.tahunAnggaran
                          )}
                        </strong>
                      </p>
                    </div>
                    <div className="text-right">
                      <p>{school.kabKota}, {formTanggal || transaction?.tanggal}</p>
                      <p>Kepada Yth :</p>
                      <p className="font-semibold">{formNamaToko || 'Pimpinan Toko Rekanan'}</p>
                      <p className="text-slate-600">di - {school.kabKota}</p>
                    </div>
                  </div>

                  <div className="text-center py-1">
                    <h4 className="font-bold text-sm uppercase tracking-wider underline">
                      PESANAN BARANG
                    </h4>
                  </div>

                  <table className="w-full border-collapse border border-black text-xs font-sans">
                    <thead>
                      <tr className="bg-slate-100 text-center font-bold">
                        <th className="border border-black p-2 w-10">No.</th>
                        <th className="border border-black p-2 w-28">Banyaknya</th>
                        <th className="border border-black p-2 text-left">Uraian</th>
                        <th className="border border-black p-2 text-center w-36">Keterangan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {formItems.map((it, idx) => (
                        <tr key={idx}>
                          <td className="border border-black p-2 text-center font-mono font-bold">{idx + 1}</td>
                          <td className="border border-black p-2 text-center font-mono font-bold">
                            {it.volume} {it.satuan}
                          </td>
                          <td className="border border-black p-2 font-medium">{it.namaBarang}</td>
                          <td className="border border-black p-2 text-center text-slate-600">
                            {kwitansi?.keteranganSpb || `Untuk Keperluan ${school.namaSekolah}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* SPB Signatures: Menyetujui Kepala Sekolah (kiri), Ketua P2SP (kanan) */}
                  <div className="grid grid-cols-2 gap-8 text-center text-xs font-sans pt-8">
                    <div>
                      <p>Menyetujui,</p>
                      <p className="font-bold">Kepala Sekolah</p>
                      <p>{school.namaSekolah}</p>
                      <div className="h-16" />
                      <p className="font-bold underline">{school.namaKepalaSekolah}</p>
                      <p>NIP. {school.nipKepalaSekolah}</p>
                    </div>
                    <div>
                      <p>{school.kabKota}, {formTanggal || transaction?.tanggal}</p>
                      <p className="font-bold">Ketua P2SP</p>
                      <p>{school.namaSekolah}</p>
                      <div className="h-16" />
                      <p className="font-bold underline">{school.namaKetuaP2SP}</p>
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
            <span className="font-bold text-slate-700">Tips:</span>
            <span>Klik tombol <strong>Edit Dokumen</strong> di kanan atas untuk menyesuaikan rincian barang, toko, atau harga.</span>
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
