import React, { useState, useRef } from 'react';
import {
  Camera,
  Upload,
  Plus,
  Trash2,
  Image as ImageIcon,
  Check,
  Calendar,
  Sparkles,
  Maximize2,
  X,
  Printer,
  ChevronLeft,
  ChevronRight,
  Info,
  Loader2,
} from 'lucide-react';
import { ProjectProgressWeek, ProgressPhotoItem, SchoolMasterData } from '../types';
import { compressImageFile } from '../utils/imageHelper';

interface WeeklyPhotoDocumentationProps {
  week: ProjectProgressWeek;
  school: SchoolMasterData;
  onUpdatePhotos: (photos: ProgressPhotoItem[]) => void;
  onOpenPrintModal: (weekNum: number) => void;
}

export const WeeklyPhotoDocumentation: React.FC<WeeklyPhotoDocumentationProps> = ({
  week,
  school,
  onUpdatePhotos,
  onOpenPrintModal,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingCount, setProcessingCount] = useState(0);
  const [previewModalUrl, setPreviewModalUrl] = useState<string | null>(null);
  const [previewModalCaption, setPreviewModalCaption] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const photos = week.photos || [];

  // Handle file uploads (single or multiple)
  const handleFilesUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    setProcessingCount(files.length);

    const newPhotoItems: ProgressPhotoItem[] = [];
    const defaultDate = week.periode.includes(' - ')
      ? week.periode.split(' - ')[1].trim()
      : 'Oktober 2025';

    // Top active division items for smart default captions
    const activeDivisions = (week.divisions || [])
      .filter((d) => d.prestasiMingguIni > 0 || d.prestasiSdMingguIni > 0)
      .map((d) => d.uraian);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;

      try {
        const compressedBase64 = await compressImageFile(file, 1000, 1000, 0.75);
        const photoNum = photos.length + i + 1;
        const suggestedCaption =
          activeDivisions[i % (activeDivisions.length || 1)] ||
          `Pekerjaan Fisik Revitalisasi Minggu Ke-${week.mingguKe}`;

        newPhotoItems.push({
          id: `photo-w${week.mingguKe}-${Date.now()}-${i}`,
          url: compressedBase64,
          caption: `Dokumentasi ${photoNum}: ${suggestedCaption}`,
          tanggal: defaultDate,
          persentase: week.bobotRealisasi,
        });
      } catch (err) {
        console.error('Failed to compress image:', err);
      }
    }

    setIsProcessing(false);
    setProcessingCount(0);

    if (newPhotoItems.length > 0) {
      onUpdatePhotos([...photos, ...newPhotoItems]);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFilesUpload(e.target.files);
    // Reset input value so re-selecting same file fires event
    if (e.target) e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFilesUpload(e.dataTransfer.files);
  };

  const handleUpdateCaption = (id: string, newCaption: string) => {
    const updated = photos.map((p) => (p.id === id ? { ...p, caption: newCaption } : p));
    onUpdatePhotos(updated);
  };

  const handleUpdateTanggal = (id: string, newTanggal: string) => {
    const updated = photos.map((p) => (p.id === id ? { ...p, tanggal: newTanggal } : p));
    onUpdatePhotos(updated);
  };

  const handleDeletePhoto = (id: string) => {
    if (confirm('Hapus foto dokumentasi ini dari laporan minggu ini?')) {
      onUpdatePhotos(photos.filter((p) => p.id !== id));
    }
  };

  const handleMovePhoto = (index: number, direction: 'left' | 'right') => {
    const targetIdx = direction === 'left' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= photos.length) return;

    const copy = [...photos];
    const temp = copy[index];
    copy[index] = copy[targetIdx];
    copy[targetIdx] = temp;
    onUpdatePhotos(copy);
  };

  // Helper to generate a realistic canvas placeholder if user wants quick sample
  const handleAddSamplePhotos = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 500;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const samples = [
      {
        title: 'Pekerjaan Pemasangan Dinding Bata & Plesteran',
        color1: '#1e3a8a',
        color2: '#0284c7',
        prog: `${week.bobotRealisasi}%`,
      },
      {
        title: 'Pekerjaan Rangka Atap Baja Ringan & Plafon',
        color1: '#0f766e',
        color2: '#0d9488',
        prog: `${week.bobotRealisasi}%`,
      },
    ];

    const defaultDate = week.periode.includes(' - ')
      ? week.periode.split(' - ')[1].trim()
      : 'Oktober 2025';

    const newSamples: ProgressPhotoItem[] = samples.map((s, idx) => {
      // Draw background gradient
      const grad = ctx.createLinearGradient(0, 0, 800, 500);
      grad.addColorStop(0, s.color1);
      grad.addColorStop(1, s.color2);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 800, 500);

      // Draw grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 1;
      for (let x = 0; x < 800; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 500);
        ctx.stroke();
      }
      for (let y = 0; y < 500; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(800, y);
        ctx.stroke();
      }

      // Draw stylized building silhouette
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.fillRect(100, 200, 600, 250);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.beginPath();
      ctx.moveTo(80, 200);
      ctx.lineTo(400, 100);
      ctx.lineTo(720, 200);
      ctx.closePath();
      ctx.fill();

      // Draw Windows
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      for (let w = 0; w < 4; w++) {
        ctx.fillRect(150 + w * 140, 260, 80, 80);
      }

      // Text Overlays
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 24px sans-serif';
      ctx.fillText(school.namaSekolah, 40, 50);

      ctx.font = '16px sans-serif';
      ctx.fillText(`DOKUMENTASI LAPORAN MINGGU KE-${week.mingguKe} (${week.periode})`, 40, 80);

      ctx.font = 'bold 20px sans-serif';
      ctx.fillText(s.title, 40, 420);

      // Yellow Camera Date Stamp at bottom right
      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 18px monospace';
      ctx.fillText(`${defaultDate} [PROG: ${s.prog}]`, 480, 465);

      const base64 = canvas.toDataURL('image/jpeg', 0.8);
      return {
        id: `sample-w${week.mingguKe}-${Date.now()}-${idx}`,
        url: base64,
        caption: `Foto ${photos.length + idx + 1}: ${s.title}`,
        tanggal: defaultDate,
        persentase: week.bobotRealisasi,
      };
    });

    onUpdatePhotos([...photos, ...newSamples]);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-300 shadow-xs overflow-hidden font-sans">
      {/* Header */}
      <div className="p-5 border-b border-slate-200 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/30">
            <Camera className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-bold text-white">
                Dokumentasi Foto Progres Fisik Minggu Ke-{week.mingguKe}
              </h3>
              <span className="text-[11px] bg-blue-500/30 text-blue-200 border border-blue-400/30 px-2 py-0.5 rounded-full font-mono font-semibold">
                {photos.length} Foto
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Unggah 1 atau lebih foto kemajuan fisik bangunan. Foto akan otomatis ikut tercetak pada Lembar Laporan Progres Mingguan.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {photos.length > 0 && (
            <button
              type="button"
              onClick={() => onOpenPrintModal(week.mingguKe)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak Lembar Foto M{week.mingguKe}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Memproses {processingCount} Foto...</span>
              </>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Foto Progres</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        onChange={handleInputChange}
        className="hidden"
      />

      <div className="p-5 space-y-4">
        {/* Drag and Drop Zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-6 text-center transition cursor-pointer flex flex-col items-center justify-center gap-2 ${
            isDragging
              ? 'border-blue-500 bg-blue-50/80 scale-[1.01]'
              : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50/70 bg-slate-50/40'
          }`}
        >
          <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
            {isProcessing ? (
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            ) : (
              <Camera className="w-6 h-6 text-blue-600" />
            )}
          </div>
          <div>
            <p className="text-xs sm:text-sm font-bold text-slate-800">
              {isProcessing
                ? `Mengompres & Menyiapkan ${processingCount} Foto...`
                : 'Klik untuk Pilih Foto dari Perangkat atau Tarik & Lepas Foto ke Sini'}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Mendukung upload banyak foto sekaligus (JPG, PNG, JPEG, WEBP). Foto otomatis dikompresi agar pas & cepat tersimpan di cloud.
            </p>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[11px] bg-white border border-slate-200 px-2 py-0.5 rounded text-slate-600 font-medium">
              Bisa 1 Foto atau Lebih
            </span>
            <span className="text-[11px] bg-white border border-slate-200 px-2 py-0.5 rounded text-slate-600 font-medium">
              Otomatis Masuk Cetak PDF/Print
            </span>
          </div>
        </div>

        {/* Photos Grid or Empty State */}
        {photos.length === 0 ? (
          <div className="py-8 text-center bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
            <ImageIcon className="w-10 h-10 text-slate-300 mx-auto" />
            <div>
              <p className="text-xs font-bold text-slate-700">
                Belum ada foto progres mingguan untuk Minggu ke-{week.mingguKe}
              </p>
              <p className="text-[11px] text-slate-500 max-w-md mx-auto mt-0.5">
                Foto dokumentasi sangat penting sebagai bukti fisik opname mingguan tim perencana, pengawas, dan penanggung jawab sekolah.
              </p>
            </div>
            <div>
              <button
                type="button"
                onClick={handleAddSamplePhotos}
                className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Tambahkan Contoh Foto Dokumentasi Standar</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span className="font-semibold">
                Daftar Foto Dokumentasi ({photos.length} item):
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleAddSamplePhotos}
                  className="text-[11px] text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  Tambah Contoh Foto
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Hapus semua foto untuk minggu ini?')) {
                      onUpdatePhotos([]);
                    }
                  }}
                  className="text-[11px] text-rose-600 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  Kosongkan Foto
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {photos.map((photo, index) => (
                <div
                  key={photo.id}
                  className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-xs hover:shadow-md transition flex flex-col group"
                >
                  {/* Image Frame */}
                  <div className="relative aspect-4/3 bg-slate-900 overflow-hidden">
                    <img
                      src={photo.url}
                      alt={photo.caption}
                      className="w-full h-full object-cover transition duration-200 group-hover:scale-105"
                    />

                    {/* Top Badges */}
                    <div className="absolute top-2 left-2 flex items-center gap-1.5">
                      <span className="bg-slate-900/80 backdrop-blur-xs text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-sm">
                        Foto {index + 1}
                      </span>
                      <span className="bg-blue-600/90 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm">
                        M{week.mingguKe}
                      </span>
                    </div>

                    {/* Quick action buttons on image */}
                    <div className="absolute top-2 right-2 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewModalUrl(photo.url);
                          setPreviewModalCaption(photo.caption);
                        }}
                        title="Perbesar Foto"
                        className="p-1 bg-slate-900/70 hover:bg-slate-900 text-white rounded transition cursor-pointer"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePhoto(photo.id)}
                        title="Hapus Foto"
                        className="p-1 bg-rose-600/80 hover:bg-rose-600 text-white rounded transition cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Reorder controls on bottom of image */}
                    <div className="absolute bottom-2 right-2 flex items-center gap-1">
                      {index > 0 && (
                        <button
                          type="button"
                          onClick={() => handleMovePhoto(index, 'left')}
                          title="Geser ke kiri / urutan sebelumnya"
                          className="p-1 bg-slate-900/80 hover:bg-slate-900 text-white rounded transition cursor-pointer"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {index < photos.length - 1 && (
                        <button
                          type="button"
                          onClick={() => handleMovePhoto(index, 'right')}
                          title="Geser ke kanan / urutan selanjutnya"
                          className="p-1 bg-slate-900/80 hover:bg-slate-900 text-white rounded transition cursor-pointer"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Caption & Metadata Inputs */}
                  <div className="p-3 space-y-2 flex-1 flex flex-col justify-between bg-slate-50/60 text-xs">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">
                        Keterangan / Uraian Foto:
                      </label>
                      <textarea
                        rows={2}
                        value={photo.caption}
                        onChange={(e) => handleUpdateCaption(photo.id, e.target.value)}
                        placeholder="Contoh: Pekerjaan Plesteran Dinding & Pemasangan Kusen"
                        className="w-full text-xs p-1.5 bg-white border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>

                    <div className="flex items-center gap-2 pt-1 border-t border-slate-200">
                      <div className="flex-1">
                        <label className="block text-[10px] font-semibold text-slate-500">
                          Tanggal Pengambilan:
                        </label>
                        <input
                          type="text"
                          value={photo.tanggal || ''}
                          onChange={(e) => handleUpdateTanggal(photo.id, e.target.value)}
                          placeholder="26 Oktober 2025"
                          className="w-full text-[11px] p-1 bg-white border border-slate-300 rounded font-medium"
                        />
                      </div>
                      <div className="text-right">
                        <span className="block text-[10px] font-semibold text-slate-500">
                          Bobot Fisik:
                        </span>
                        <span className="text-[11px] font-bold font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                          {week.bobotRealisasi}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Full Image Zoom Modal */}
      {previewModalUrl && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="relative max-w-3xl w-full bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-700 flex flex-col max-h-[90vh]">
            <div className="p-3 bg-slate-950 text-white flex items-center justify-between border-b border-slate-800">
              <span className="text-xs font-semibold text-slate-200">
                {previewModalCaption || 'Pratinjau Foto Dokumentasi'}
              </span>
              <button
                type="button"
                onClick={() => setPreviewModalUrl(null)}
                className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-auto flex items-center justify-center bg-black">
              <img
                src={previewModalUrl}
                alt="Full Preview"
                className="max-h-[75vh] w-auto object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
