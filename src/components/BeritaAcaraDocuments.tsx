import React, { useState } from 'react';
import {
  SchoolMasterData,
  ProjectProgressWeek,
  RpdItem,
} from '../types';
import { formatRupiah } from '../utils/formatters';

interface BeritaAcaraProps {
  school: SchoolMasterData;
  progressWeeks?: ProjectProgressWeek[];
  rpdItems?: RpdItem[];
  realSchoolData?: any;
  activeDim?: { widthMm: number; heightMm: number };
}

/**
 * Helper untuk format tanggal bahasa Indonesia resmi kedinasan
 * Contoh: "Rabu, 17 Desember 2026"
 */
function formatIndonesianFullDate(dateStr?: string, yearFallback?: string): {
  hari: string;
  tanggalAngka: string;
  tanggalTerbilang: string;
  bulan: string;
  tahun: string;
  formattedString: string;
} {
  const hariNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const bulanNames = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];

  let d = new Date();
  if (dateStr) {
    const parts = dateStr.includes('/') ? dateStr.split('/') : dateStr.split('-');
    if (parts.length === 3) {
      if (dateStr.includes('/')) {
        // DD/MM/YYYY
        d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
      } else {
        // YYYY-MM-DD
        d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      }
    }
  }

  const hari = hariNames[d.getDay()] || 'Senin';
  const tgl = d.getDate();
  const bln = bulanNames[d.getMonth()] || 'Desember';
  const thn = yearFallback || String(d.getFullYear());

  const terbilangAngka = (n: number): string => {
    const satuan = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];
    if (n < 12) return satuan[n];
    if (n < 20) return satuan[n - 10] + ' belas';
    if (n < 100) return satuan[Math.floor(n / 10)] + ' puluh ' + (satuan[n % 10] || '');
    return String(n);
  };

  return {
    hari,
    tanggalAngka: String(tgl),
    tanggalTerbilang: terbilangAngka(tgl),
    bulan: bln,
    tahun: thn,
    formattedString: `${hari}, ${tgl} ${bln} ${thn}`,
  };
}

/**
 * 1. BAST - BERITA ACARA SERAH TERIMA HASIL PEKERJAAN (100%)
 */
export const BastDocument: React.FC<BeritaAcaraProps> = ({
  school,
  progressWeeks = [],
  realSchoolData,
  activeDim = { widthMm: 210, heightMm: 297 },
}) => {
  const yearStr = school.tahunAnggaran || '2026';
  const totalAnggaran = school.totalAnggaran || 0;
  const noBast = school.nomorSkP2SP
    ? `02/BAST-REVIT/${school.nomorSkP2SP.replace(/[^a-zA-Z0-9]/g, '-')}/${yearStr}`
    : `01/BAST-REVIT/${school.npsn || 'P2SP'}/${yearStr}`;

  // Ambil tanggal minggu terakhir dari progressWeeks jika ada
  const lastWeek = progressWeeks.length > 0 ? progressWeeks[progressWeeks.length - 1] : null;
  const dateInfo = formatIndonesianFullDate(lastWeek?.periode, yearStr);

  // Ambil divisi pekerjaan untuk rincian serah terima
  const divisions = realSchoolData?.divisions || [
    { kode: 'I', uraian: 'Pekerjaan Persiapan & SMKK', bobot: 2.15 },
    { kode: 'II', uraian: 'Pekerjaan Tanah & Pondasi', bobot: 8.45 },
    { kode: 'III', uraian: 'Pekerjaan Struktur Beton Bertulang', bobot: 24.30 },
    { kode: 'IV', uraian: 'Pekerjaan Pasangan Dinding & Plesteran', bobot: 18.50 },
    { kode: 'V', uraian: 'Pekerjaan Kusen, Pintu & Jendela', bobot: 9.80 },
    { kode: 'VI', uraian: 'Pekerjaan Rangka Atap & Penutup Atap', bobot: 16.20 },
    { kode: 'VII', uraian: 'Pekerjaan Plafon / Langit-langit', bobot: 6.10 },
    { kode: 'VIII', uraian: 'Pekerjaan Lantai & Keramik', bobot: 7.20 },
    { kode: 'IX', uraian: 'Pekerjaan Pengecatan & Finishing', bobot: 3.50 },
    { kode: 'X', uraian: 'Pekerjaan Sanitasi & Instalasi Listrik (MEP)', bobot: 3.80 },
  ];

  return (
    <div
      className="page-break bg-white p-8 sm:p-12 font-serif text-[11px] leading-relaxed text-slate-900 border border-slate-300 print:border-none space-y-4"
      style={{ minHeight: `${activeDim.heightMm}mm` }}
    >
      {/* KOP SURAT RESMI */}
      <div className="text-center pb-2 border-b-2 border-black space-y-0.5 font-sans">
        <p className="font-bold text-[10px] tracking-wider uppercase text-slate-800">
          {school.headerPemerintahText || `PEMERINTAH ${school.kabKota?.toUpperCase() || 'KABUPATEN / KOTA'}`}
        </p>
        <p className="font-bold text-[11px] tracking-wider uppercase text-slate-900">
          {school.dinasPendidikan || 'DINAS PENDIDIKAN DAN KEBUDAYAAN'}
        </p>
        <h2 className="text-base font-black tracking-wide uppercase text-black">
          PANITIA PEMBANGUNAN SATUAN PENDIDIKAN (P2SP) {school.namaSekolah}
        </h2>
        <p className="text-[9.5px] text-slate-600 font-normal">
          {school.alamat}, {school.kabKota}, {school.provinsi} • NPSN: {school.npsn}
        </p>
      </div>

      {/* JUDUL DOKUMEN */}
      <div className="text-center pt-2 space-y-1">
        <h3 className="font-bold text-sm tracking-wide uppercase underline">
          BERITA ACARA SERAH TERIMA PEKERJAAN (BAST)
        </h3>
        <p className="text-xs font-mono font-medium text-slate-700">
          Nomor: {noBast}
        </p>
        <p className="text-[10px] font-sans font-bold text-blue-900 uppercase">
          PEKERJAAN SELESAI 100% (SERATUS PERSEN)
        </p>
      </div>

      {/* KALIMAT PEMBUKA */}
      <p className="text-justify indent-6 pt-1">
        Pada hari ini <strong>{dateInfo.hari}</strong>, tanggal <strong>{dateInfo.tanggalAngka}</strong> ({dateInfo.tanggalTerbilang}) bulan <strong>{dateInfo.bulan}</strong> tahun <strong>{dateInfo.tahun}</strong>, bertempat di {school.namaSekolah}, yang bertanda tangan di bawah ini:
      </p>

      {/* IDENTITAS PARA PIHAK */}
      <div className="space-y-2 pl-4">
        <div className="grid grid-cols-12 gap-1">
          <span className="col-span-1 font-bold">1.</span>
          <span className="col-span-3 font-bold">Nama</span>
          <span className="col-span-1">:</span>
          <span className="col-span-7 font-bold">{school.namaKetuaP2SP}</span>

          <span className="col-span-1"></span>
          <span className="col-span-3 text-slate-700">Jabatan</span>
          <span className="col-span-1">:</span>
          <span className="col-span-7">Ketua Panitia Pembangunan Satuan Pendidikan (P2SP)</span>

          <span className="col-span-1"></span>
          <span className="col-span-3 text-slate-700">Alamat</span>
          <span className="col-span-1">:</span>
          <span className="col-span-7">{school.alamat}, {school.kabKota}</span>

          <span className="col-span-1"></span>
          <span className="col-span-11 italic text-slate-600 pt-0.5">
            Dalam hal ini bertindak untuk dan atas nama Panitia Pembangunan Satuan Pendidikan (P2SP) {school.namaSekolah}, yang selanjutnya disebut sebagai <strong>PIHAK KESATU (Yang Menyerahkan)</strong>.
          </span>
        </div>

        <div className="grid grid-cols-12 gap-1 pt-1">
          <span className="col-span-1 font-bold">2.</span>
          <span className="col-span-3 font-bold">Nama</span>
          <span className="col-span-1">:</span>
          <span className="col-span-7 font-bold">{school.namaKepalaSekolah}</span>

          <span className="col-span-1"></span>
          <span className="col-span-3 text-slate-700">NIP</span>
          <span className="col-span-1">:</span>
          <span className="col-span-7 font-mono">{school.nipKepalaSekolah || '-'}</span>

          <span className="col-span-1"></span>
          <span className="col-span-3 text-slate-700">Jabatan</span>
          <span className="col-span-1">:</span>
          <span className="col-span-7">Kepala Sekolah {school.namaSekolah}</span>

          <span className="col-span-1"></span>
          <span className="col-span-11 italic text-slate-600 pt-0.5">
            Dalam hal ini bertindak untuk dan atas nama Satuan Pendidikan {school.namaSekolah} selaku Penanggung Jawab Program Bantuan Pemerintah Revitalisasi Satuan Pendidikan, yang selanjutnya disebut sebagai <strong>PIHAK KEDUA (Yang Menerima)</strong>.
          </span>
        </div>
      </div>

      <p className="text-justify pt-1">
        Dengan ini kedua belah pihak menyatakan sepakat dan menyetujui hal-hal sebagai berikut:
      </p>

      {/* PASAL-PASAL KESEPAKATAN */}
      <div className="space-y-2 text-justify">
        <div>
          <p className="font-bold text-center underline font-sans text-xs">Pasal 1</p>
          <p className="indent-6">
            <strong>PIHAK KESATU</strong> telah menyelesaikan pelaksanaan seluruh paket pekerjaan Program Bantuan Pemerintah Revitalisasi Satuan Pendidikan pada {school.namaSekolah} Tahun Anggaran {yearStr} dengan kemajuan prestasi fisik sebesar <strong>100% (Seratus Persen)</strong>, dalam kondisi baik, berfungsi, dan telah sesuai dengan Gambar Kerja, Rencana Anggaran Biaya (RAB), Kerangka Acuan Kerja (KAK), serta petunjuk teknis yang ditetapkan.
          </p>
        </div>

        <div>
          <p className="font-bold text-center underline font-sans text-xs">Pasal 2</p>
          <p className="indent-6">
            <strong>PIHAK KESATU</strong> dengan ini menyerahkan hasil pekerjaan sebagaimana dimaksud pada Pasal 1 kepada <strong>PIHAK KEDUA</strong>, dan <strong>PIHAK KEDUA</strong> menerima penyerahan hasil pekerjaan tersebut dengan baik dan sempurna berdasarkan hasil evaluasi akhir Tim Teknis dan Konsultan Pengawas Lapangan.
          </p>
        </div>

        <div>
          <p className="font-bold text-center underline font-sans text-xs">Pasal 3</p>
          <p className="indent-6">
            Total biaya pelaksanaan pekerjaan yang diserahterimakan adalah sebesar <strong>{formatRupiah(totalAnggaran)}</strong> sesuai dengan pagu alokasi bantuan revitalisasi yang telah dipertanggungjawabkan dalam Buku Kas Umum (BKU), Laporan Pertanggungjawaban Keuangan (LPJ), serta bukti pengeluaran yang sah dan lengkap.
          </p>
        </div>
      </div>

      {/* RINGKASAN LINGKUP PEKERJAAN */}
      <div className="pt-1">
        <p className="font-bold font-sans text-[10px] text-slate-800 uppercase mb-1">
          Lampiran Ringkasan Fisik yang Diserahterimakan:
        </p>
        <table className="w-full border-collapse border border-black font-sans text-[9px] text-center">
          <thead>
            <tr className="bg-slate-100 font-bold">
              <th className="border border-black p-1 w-8">No</th>
              <th className="border border-black p-1 text-left">Divisi / Uraian Lingkup Pekerjaan</th>
              <th className="border border-black p-1 w-24">Volume / Satuan</th>
              <th className="border border-black p-1 w-20">Prestasi Fisik</th>
              <th className="border border-black p-1 w-24">Kondisi Fisik</th>
            </tr>
          </thead>
          <tbody>
            {divisions.slice(0, 8).map((div: any, dIdx: number) => (
              <tr key={div.id || dIdx} className="hover:bg-slate-50">
                <td className="border border-black p-0.5">{dIdx + 1}</td>
                <td className="border border-black p-0.5 text-left font-medium">
                  Divisi {div.kode}: {div.uraian}
                </td>
                <td className="border border-black p-0.5">100% Selesai</td>
                <td className="border border-black p-0.5 font-bold text-emerald-800">100,00%</td>
                <td className="border border-black p-0.5 font-semibold text-slate-800">Baik / Sempurna</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* PENUTUP */}
      <p className="text-justify indent-6 pt-1">
        Demikian Berita Acara Serah Terima Pekerjaan ini dibuat dan ditandatangani oleh kedua belah pihak dengan itikad baik dan penuh tanggung jawab dalam rangkap secukupnya untuk dipergunakan sebagaimana mestinya.
      </p>

      {/* TANDA TANGAN PARA PIHAK & SAKSI */}
      <div className="pt-3 print-signature-block font-sans text-[10px]">
        <div className="grid grid-cols-2 gap-8 text-center">
          {/* Yang Menyerahkan */}
          <div className="space-y-1">
            <p className="text-slate-600">PIHAK KESATU (Yang Menyerahkan)</p>
            <p className="font-bold text-slate-900">Ketua Panitia P2SP,</p>
            <div className="h-16 flex items-end justify-center">
              <span className="text-[9px] text-slate-300 italic">[Tanda Tangan & Cap]</span>
            </div>
            <p className="font-bold underline text-slate-900 uppercase">{school.namaKetuaP2SP}</p>
            <p className="text-[9px] text-slate-600">NIP. {school.nipKetuaP2SP || '-'}</p>
          </div>

          {/* Yang Menerima */}
          <div className="space-y-1">
            <p className="text-slate-600">PIHAK KEDUA (Yang Menerima)</p>
            <p className="font-bold text-slate-900">Kepala Sekolah {school.namaSekolah},</p>
            <div className="h-16 flex items-end justify-center">
              <span className="text-[9px] text-slate-300 italic">[Tanda Tangan & Cap]</span>
            </div>
            <p className="font-bold underline text-slate-900 uppercase">{school.namaKepalaSekolah}</p>
            <p className="text-[9px] text-slate-600">NIP. {school.nipKepalaSekolah || '-'}</p>
          </div>
        </div>

        {/* Saksi-Saksi */}
        <div className="mt-4 pt-3 border-t border-slate-300 text-center">
          <p className="font-bold text-slate-800 uppercase text-[9.5px] mb-3">Mengetahui & Menyetujui:</p>
          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-1">
              <p className="font-bold text-slate-800">Konsultan Pengawas Teknis</p>
              <div className="h-14 flex items-end justify-center">
                <span className="text-[9px] text-slate-300 italic">[Tanda Tangan]</span>
              </div>
              <p className="font-bold underline uppercase">{school.namaPengawas || 'Pengawas Lapangan'}</p>
              <p className="text-[9px] text-slate-600">NIP/KTA. {school.nipPengawas || '-'}</p>
            </div>

            <div className="space-y-1">
              <p className="font-bold text-slate-800">Ketua Komite Sekolah</p>
              <div className="h-14 flex items-end justify-center">
                <span className="text-[9px] text-slate-300 italic">[Tanda Tangan]</span>
              </div>
              <p className="font-bold underline uppercase">Ketua Komite Sekolah</p>
              <p className="text-[9px] text-slate-600">Perwakilan Orang Tua / Wali Siswa</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * 2. BAP FISIK - BERITA ACARA PEMERIKSAAN KEMAJUAN PEKERJAAN FISIK (TERMIN 1 (70%) & TERMIN 2 (100%))
 */
export const BapKemajuanFisikDocument: React.FC<BeritaAcaraProps> = ({
  school,
  progressWeeks = [],
  realSchoolData,
  activeDim = { widthMm: 210, heightMm: 297 },
}) => {
  const [selectedTermin, setSelectedTermin] = useState<'TERMIN_1' | 'TERMIN_2'>('TERMIN_2');
  const yearStr = school.tahunAnggaran || '2026';
  const isTermin1 = selectedTermin === 'TERMIN_1';
  const targetBobot = isTermin1 ? '70% (Tujuh Puluh Persen)' : '100% (Seratus Persen)';
  const targetBobotAngka = isTermin1 ? 70.00 : 100.00;

  const noBap = isTermin1
    ? `01/BAP-FISIK-70%/${school.npsn || 'P2SP'}/${yearStr}`
    : `02/BAP-FISIK-100%/${school.npsn || 'P2SP'}/${yearStr}`;

  // Ambil tanggal minggu representatif
  const weekIndex = isTermin1
    ? Math.max(0, Math.floor(progressWeeks.length * 0.7) - 1)
    : Math.max(0, progressWeeks.length - 1);
  const refWeek = progressWeeks[weekIndex] || progressWeeks[0];
  const dateInfo = formatIndonesianFullDate(refWeek?.periode, yearStr);

  const divisions = realSchoolData?.divisions || [
    { kode: 'I', uraian: 'Pekerjaan Persiapan & SMKK', bobot: 2.15 },
    { kode: 'II', uraian: 'Pekerjaan Tanah & Pondasi', bobot: 8.45 },
    { kode: 'III', uraian: 'Pekerjaan Struktur Beton Bertulang', bobot: 24.30 },
    { kode: 'IV', uraian: 'Pekerjaan Pasangan Dinding & Plesteran', bobot: 18.50 },
    { kode: 'V', uraian: 'Pekerjaan Kusen, Pintu & Jendela', bobot: 9.80 },
    { kode: 'VI', uraian: 'Pekerjaan Rangka Atap & Penutup Atap', bobot: 16.20 },
    { kode: 'VII', uraian: 'Pekerjaan Plafon / Langit-langit', bobot: 6.10 },
    { kode: 'VIII', uraian: 'Pekerjaan Lantai & Keramik', bobot: 7.20 },
    { kode: 'IX', uraian: 'Pekerjaan Pengecatan & Finishing', bobot: 3.50 },
    { kode: 'X', uraian: 'Pekerjaan Sanitasi & Instalasi Listrik (MEP)', bobot: 3.80 },
  ];

  return (
    <div
      className="page-break bg-white p-8 sm:p-12 font-serif text-[11px] leading-relaxed text-slate-900 border border-slate-300 print:border-none space-y-4"
      style={{ minHeight: `${activeDim.heightMm}mm` }}
    >
      {/* Selector Termin (Print Hidden) */}
      <div className="bg-slate-100 p-2 rounded-xl flex items-center justify-between print:hidden font-sans">
        <span className="text-xs font-bold text-slate-700">Pilih Tahap Evaluasi Kemajuan Fisik:</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSelectedTermin('TERMIN_1')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
              isTermin1 ? 'bg-blue-600 text-white shadow-xs' : 'bg-white text-slate-700 hover:bg-slate-200'
            }`}
          >
            Termin 1 (Syarat Bobot ≥ 70%)
          </button>
          <button
            type="button"
            onClick={() => setSelectedTermin('TERMIN_2')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
              !isTermin1 ? 'bg-emerald-600 text-white shadow-xs' : 'bg-white text-slate-700 hover:bg-slate-200'
            }`}
          >
            Termin 2 (Penyelesaian Akhir 100%)
          </button>
        </div>
      </div>

      {/* KOP SURAT RESMI */}
      <div className="text-center pb-2 border-b-2 border-black space-y-0.5 font-sans">
        <p className="font-bold text-[10px] tracking-wider uppercase text-slate-800">
          {school.headerPemerintahText || `PEMERINTAH ${school.kabKota?.toUpperCase() || 'KABUPATEN / KOTA'}`}
        </p>
        <p className="font-bold text-[11px] tracking-wider uppercase text-slate-900">
          {school.dinasPendidikan || 'DINAS PENDIDIKAN DAN KEBUDAYAAN'}
        </p>
        <h2 className="text-base font-black tracking-wide uppercase text-black">
          PANITIA PEMBANGUNAN SATUAN PENDIDIKAN (P2SP) {school.namaSekolah}
        </h2>
        <p className="text-[9.5px] text-slate-600 font-normal">
          {school.alamat}, {school.kabKota}, {school.provinsi} • NPSN: {school.npsn}
        </p>
      </div>

      {/* JUDUL DOKUMEN */}
      <div className="text-center pt-2 space-y-1">
        <h3 className="font-bold text-sm tracking-wide uppercase underline">
          BERITA ACARA PEMERIKSAAN KEMAJUAN PEKERJAAN (BAP FISIK)
        </h3>
        <p className="text-xs font-mono font-medium text-slate-700">
          Nomor: {noBap}
        </p>
        <p className="text-[10px] font-sans font-bold text-emerald-800 uppercase">
          KEMAJUAN FISIK LAPANGAN MENCAPAI {targetBobot}
        </p>
      </div>

      {/* PEMBUKA */}
      <p className="text-justify indent-6 pt-1">
        Pada hari ini <strong>{dateInfo.hari}</strong>, tanggal <strong>{dateInfo.tanggalAngka}</strong> ({dateInfo.tanggalTerbilang}) bulan <strong>{dateInfo.bulan}</strong> tahun <strong>{dateInfo.tahun}</strong>, Tim Teknis dan Konsultan Pengawas Program Bantuan Pemerintah Revitalisasi Satuan Pendidikan pada {school.namaSekolah} Tahun Anggaran {yearStr}, telah melaksanakan pemeriksaan bersama di lokasi pekerjaan konstruksi:
      </p>

      {/* TIM PEMERIKSA */}
      <div className="space-y-1.5 pl-4 font-sans text-[10.5px]">
        <div className="grid grid-cols-12 gap-1">
          <span className="col-span-1 font-bold">1.</span>
          <span className="col-span-4 font-semibold text-slate-800">{school.namaPengawas || 'Pengawas Lapangan'}</span>
          <span className="col-span-1">:</span>
          <span className="col-span-6 font-medium">Konsultan Pengawas Teknis</span>

          <span className="col-span-1 font-bold">2.</span>
          <span className="col-span-4 font-semibold text-slate-800">{school.namaPerencana || 'Perencana Teknis'}</span>
          <span className="col-span-1">:</span>
          <span className="col-span-6 font-medium">Tim Perencana Teknis P2SP</span>

          <span className="col-span-1 font-bold">3.</span>
          <span className="col-span-4 font-semibold text-slate-800">{school.namaPelaksana || 'Pelaksana Konstruksi'}</span>
          <span className="col-span-1">:</span>
          <span className="col-span-6 font-medium">Penanggung Jawab Teknis Pelaksana Lapangan</span>

          <span className="col-span-1 font-bold">4.</span>
          <span className="col-span-4 font-semibold text-slate-800">{school.namaKetuaP2SP}</span>
          <span className="col-span-1">:</span>
          <span className="col-span-6 font-medium">Ketua P2SP {school.namaSekolah}</span>
        </div>
      </div>

      <p className="text-justify pt-1">
        Berdasarkan hasil pengamatan, pengukuran fisik, dan uji visual di lapangan terhadap pekerjaan fisik yang telah terpasang, diperoleh hasil evaluasi kemajuan sebagai berikut:
      </p>

      {/* TABEL BOBOT EVALUASI */}
      <div className="pt-1">
        <table className="w-full border-collapse border border-black font-sans text-[9px] text-center">
          <thead>
            <tr className="bg-slate-100 font-bold">
              <th className="border border-black p-1 w-8">No</th>
              <th className="border border-black p-1 text-left">Komponen Pekerjaan Sesuai RAB</th>
              <th className="border border-black p-1 w-20">Bobot Rencana (%)</th>
              <th className="border border-black p-1 w-20">Realisasi Fisik (%)</th>
              <th className="border border-black p-1 w-20">Deviasi (%)</th>
              <th className="border border-black p-1 w-24">Catatan Kelaikan</th>
            </tr>
          </thead>
          <tbody>
            {divisions.slice(0, 8).map((div: any, dIdx: number) => {
              const bbt = div.bobot || 10;
              const realBobot = isTermin1 ? Math.min(bbt, Math.round(bbt * 0.72 * 100) / 100) : bbt;
              const dev = Math.round((realBobot - (isTermin1 ? Math.round(bbt * 0.70 * 100) / 100 : bbt)) * 100) / 100;
              return (
                <tr key={div.id || dIdx} className="hover:bg-slate-50">
                  <td className="border border-black p-0.5">{dIdx + 1}</td>
                  <td className="border border-black p-0.5 text-left font-medium">
                    Divisi {div.kode}: {div.uraian}
                  </td>
                  <td className="border border-black p-0.5">{bbt.toFixed(2)}%</td>
                  <td className="border border-black p-0.5 font-bold text-slate-900">{realBobot.toFixed(2)}%</td>
                  <td className="border border-black p-0.5 text-emerald-800 font-semibold">{dev >= 0 ? `+${dev.toFixed(2)}%` : `${dev.toFixed(2)}%`}</td>
                  <td className="border border-black p-0.5 font-medium text-slate-800">Memenuhi Syarat</td>
                </tr>
              );
            })}
            <tr className="bg-slate-100 font-bold">
              <td colSpan={2} className="border border-black p-1 text-center">TOTAL KEMAJUAN PRESTASI FISIK KUMULATIF</td>
              <td className="border border-black p-1">100,00%</td>
              <td className="border border-black p-1 text-emerald-950 font-black">{targetBobotAngka.toFixed(2)}%</td>
              <td className="border border-black p-1 text-emerald-800 font-bold">+0,00%</td>
              <td className="border border-black p-1 font-bold text-emerald-900">REKOMENDASI: LENGKAP</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* KESIMPULAN HASIL EVALUASI */}
      <div className="bg-slate-50 border border-slate-300 p-2.5 rounded-lg space-y-1 font-sans text-[10px]">
        <p className="font-bold text-slate-900">KESIMPULAN DAN REKOMENDASI TIM PEMERIKSA:</p>
        <ol className="list-decimal pl-4 space-y-0.5 text-slate-700">
          <li>
            Prestasi kemajuan fisik pekerjaan lapangan telah mencapai <strong>{targetBobotAngka.toFixed(2)}%</strong> dan dinyatakan <strong>LAYAK</strong> secara mutu dan spesifikasi teknis.
          </li>
          <li>
            {isTermin1 ? (
              <>Panitia P2SP {school.namaSekolah} telah memenuhi syarat administratif dan fisik untuk pengajuan <strong>Pencairan Dana Tahap II (Termin 2 sebesar 30%)</strong> kepada Kuasa Pengguna Anggaran (KPA) / PPK Dinas Pendidikan.</>
            ) : (
              <>Pekerjaan telah selesai 100% dan siap untuk dilakukan <strong>Serah Terima Hasil Pekerjaan (BAST)</strong> serta penyusunan Laporan Akhir Pertanggungjawaban (LPJ).</>
            )}
          </li>
        </ol>
      </div>

      {/* TANDA TANGAN */}
      <div className="pt-2 print-signature-block font-sans text-[10px]">
        <p className="text-center font-bold text-slate-800 mb-2">TIM PEMERIKSA LAPANGAN:</p>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="space-y-1">
            <p className="font-bold text-slate-800">Konsultan Pengawas Teknis</p>
            <div className="h-14 flex items-end justify-center">
              <span className="text-[9px] text-slate-300 italic">[Tanda Tangan]</span>
            </div>
            <p className="font-bold underline uppercase">{school.namaPengawas || 'Pengawas Lapangan'}</p>
            <p className="text-[9px] text-slate-600">NIP/KTA. {school.nipPengawas || '-'}</p>
          </div>

          <div className="space-y-1">
            <p className="font-bold text-slate-800">Perencana Teknis P2SP</p>
            <div className="h-14 flex items-end justify-center">
              <span className="text-[9px] text-slate-300 italic">[Tanda Tangan]</span>
            </div>
            <p className="font-bold underline uppercase">{school.namaPerencana || 'Perencana Teknis'}</p>
            <p className="text-[9px] text-slate-600">NIP. {school.nipPerencana || '-'}</p>
          </div>

          <div className="space-y-1">
            <p className="font-bold text-slate-800">Ketua Panitia P2SP</p>
            <div className="h-14 flex items-end justify-center">
              <span className="text-[9px] text-slate-300 italic">[Tanda Tangan & Cap]</span>
            </div>
            <p className="font-bold underline uppercase">{school.namaKetuaP2SP}</p>
            <p className="text-[9px] text-slate-600">NIP. {school.nipKetuaP2SP || '-'}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

/**
 * 3. BAP BAYAR - BERITA ACARA PEMBAYARAN TERMIN
 */
export const BapPembayaranDocument: React.FC<BeritaAcaraProps> = ({
  school,
  activeDim = { widthMm: 210, heightMm: 297 },
}) => {
  const [selectedTermin, setSelectedTermin] = useState<'TERMIN_1' | 'TERMIN_2'>('TERMIN_1');
  const yearStr = school.tahunAnggaran || '2026';
  const totalAnggaran = school.totalAnggaran || 0;

  const isTermin1 = selectedTermin === 'TERMIN_1';
  const nominalTermin = isTermin1
    ? school.termin1Nilai || Math.round(totalAnggaran * 0.7)
    : school.termin2Nilai || Math.round(totalAnggaran * 0.3);

  const persenTermin = isTermin1 ? '70% (Tujuh Puluh Persen)' : '30% (Tiga Puluh Persen)';
  const terminTitle = isTermin1 ? 'TERMIN I (70%)' : 'TERMIN II (30%)';

  const noBapBayar = isTermin1
    ? `01/BAP-BAYAR-T1/${school.npsn || 'P2SP'}/${yearStr}`
    : `02/BAP-BAYAR-T2/${school.npsn || 'P2SP'}/${yearStr}`;

  const dateInfo = formatIndonesianFullDate(undefined, yearStr);

  return (
    <div
      className="page-break bg-white p-8 sm:p-12 font-serif text-[11px] leading-relaxed text-slate-900 border border-slate-300 print:border-none space-y-4"
      style={{ minHeight: `${activeDim.heightMm}mm` }}
    >
      {/* Toggle Termin (Print Hidden) */}
      <div className="bg-slate-100 p-2 rounded-xl flex items-center justify-between print:hidden font-sans">
        <span className="text-xs font-bold text-slate-700">Pilih Termin Pembayaran:</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setSelectedTermin('TERMIN_1')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
              isTermin1 ? 'bg-blue-600 text-white shadow-xs' : 'bg-white text-slate-700 hover:bg-slate-200'
            }`}
          >
            Termin 1 (70% - Awal Proyek)
          </button>
          <button
            type="button"
            onClick={() => setSelectedTermin('TERMIN_2')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
              !isTermin1 ? 'bg-emerald-600 text-white shadow-xs' : 'bg-white text-slate-700 hover:bg-slate-200'
            }`}
          >
            Termin 2 (30% - Progres Fisik ≥ 70%)
          </button>
        </div>
      </div>

      {/* KOP SURAT */}
      <div className="text-center pb-2 border-b-2 border-black space-y-0.5 font-sans">
        <p className="font-bold text-[10px] tracking-wider uppercase text-slate-800">
          {school.headerPemerintahText || `PEMERINTAH ${school.kabKota?.toUpperCase() || 'KABUPATEN / KOTA'}`}
        </p>
        <p className="font-bold text-[11px] tracking-wider uppercase text-slate-900">
          {school.dinasPendidikan || 'DINAS PENDIDIKAN DAN KEBUDAYAAN'}
        </p>
        <h2 className="text-base font-black tracking-wide uppercase text-black">
          PANITIA PEMBANGUNAN SATUAN PENDIDIKAN (P2SP) {school.namaSekolah}
        </h2>
        <p className="text-[9.5px] text-slate-600 font-normal">
          {school.alamat}, {school.kabKota}, {school.provinsi} • NPSN: {school.npsn}
        </p>
      </div>

      {/* JUDUL DOKUMEN */}
      <div className="text-center pt-2 space-y-1">
        <h3 className="font-bold text-sm tracking-wide uppercase underline">
          BERITA ACARA PEMBAYARAN (BAP)
        </h3>
        <p className="text-xs font-mono font-medium text-slate-700">
          Nomor: {noBapBayar}
        </p>
        <p className="text-[10px] font-sans font-bold text-blue-900 uppercase">
          PENCAIRAN DANA BANTUAN REVITALISASI TAHAP {terminTitle}
        </p>
      </div>

      <p className="text-justify indent-6 pt-1">
        Pada hari ini <strong>{dateInfo.hari}</strong>, tanggal <strong>{dateInfo.tanggalAngka}</strong> ({dateInfo.tanggalTerbilang}) bulan <strong>{dateInfo.bulan}</strong> tahun <strong>{dateInfo.tahun}</strong>, bertempat di {school.namaSekolah}, kami yang bertanda tangan di bawah ini:
      </p>

      {/* IDENTITAS */}
      <div className="space-y-1.5 pl-4 font-sans text-[10.5px]">
        <div className="grid grid-cols-12 gap-1">
          <span className="col-span-1 font-bold">1.</span>
          <span className="col-span-3 font-semibold text-slate-800">Nama</span>
          <span className="col-span-1">:</span>
          <span className="col-span-7 font-bold text-slate-900">{school.namaKepalaSekolah}</span>

          <span className="col-span-1"></span>
          <span className="col-span-3 text-slate-700">Jabatan</span>
          <span className="col-span-1">:</span>
          <span className="col-span-7">Kepala Sekolah {school.namaSekolah} (Penanggung Jawab Revitalisasi)</span>
        </div>

        <div className="grid grid-cols-12 gap-1 pt-1">
          <span className="col-span-1 font-bold">2.</span>
          <span className="col-span-3 font-semibold text-slate-800">Nama</span>
          <span className="col-span-1">:</span>
          <span className="col-span-7 font-bold text-slate-900">{school.namaBendahara}</span>

          <span className="col-span-1"></span>
          <span className="col-span-3 text-slate-700">Jabatan</span>
          <span className="col-span-1">:</span>
          <span className="col-span-7">Bendahara Panitia Pembangunan Satuan Pendidikan (P2SP)</span>
        </div>
      </div>

      <p className="text-justify pt-1">
        Menyatakan dengan sebenarnya bahwa berdasarkan Perjanjian Kerja Sama (PKS) dan Surat Keputusan Penetapan Bantuan Pemerintah Revitalisasi Satuan Pendidikan, pembayaran dana tahap {terminTitle} dapat disalurkan dengan rincian perhitungan sebagai berikut:
      </p>

      {/* TABEL RINCIAN TERMIN */}
      <div className="pt-1">
        <table className="w-full border-collapse border border-black font-sans text-[9.5px]">
          <tbody>
            <tr>
              <td className="border border-black p-1.5 w-8 text-center font-bold">1.</td>
              <td className="border border-black p-1.5">Total Pagu Anggaran Bantuan Revitalisasi</td>
              <td className="border border-black p-1.5 w-36 text-right font-mono font-bold">{formatRupiah(totalAnggaran)}</td>
            </tr>
            <tr>
              <td className="border border-black p-1.5 text-center font-bold">2.</td>
              <td className="border border-black p-1.5">Porsi Tahap Pencairan: {terminTitle} ({persenTermin})</td>
              <td className="border border-black p-1.5 text-right font-mono font-bold text-emerald-900">{formatRupiah(nominalTermin)}</td>
            </tr>
            <tr>
              <td className="border border-black p-1.5 text-center font-bold">3.</td>
              <td className="border border-black p-1.5">Potongan Pajak Penghasilan & Retensi</td>
              <td className="border border-black p-1.5 text-right font-mono font-medium">Rp 0 (Nihil)</td>
            </tr>
            <tr className="bg-slate-100 font-bold">
              <td colSpan={2} className="border border-black p-1.5 text-center">
                JUMLAH BERSIH YANG DIBAYARKAN / DICAIRKAN
              </td>
              <td className="border border-black p-1.5 text-right font-mono font-black text-blue-950">
                {formatRupiah(nominalTermin)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="bg-slate-50 border border-slate-300 p-2.5 rounded-lg font-sans text-[10px] space-y-1">
        <p className="font-bold text-slate-900">REKENING PENERIMA / KAS BANK P2SP:</p>
        <div className="grid grid-cols-12 gap-1 text-slate-700">
          <span className="col-span-3">Nama Bank</span>
          <span className="col-span-1">:</span>
          <span className="col-span-8 font-bold text-slate-900">{school.namaBank}</span>

          <span className="col-span-3">Nomor Rekening</span>
          <span className="col-span-1">:</span>
          <span className="col-span-8 font-mono font-bold text-slate-900">{school.nomorRekening}</span>

          <span className="col-span-3">Atas Nama</span>
          <span className="col-span-1">:</span>
          <span className="col-span-8 font-bold text-slate-900">{school.namaRekening}</span>
        </div>
      </div>

      <p className="text-justify indent-6 pt-1">
        Demikian Berita Acara Pembayaran ini dibuat dalam rangkap yang cukup dan bermeterai cukup untuk dipergunakan sebagai dasar pembukuan kas dan penyusunan Surat Perintah Bayar (SPB).
      </p>

      {/* TANDA TANGAN */}
      <div className="pt-3 print-signature-block font-sans text-[10px]">
        <div className="grid grid-cols-2 gap-8 text-center">
          <div className="space-y-1">
            <p className="font-bold text-slate-800">Bendahara P2SP,</p>
            <div className="h-16 flex items-end justify-center">
              <span className="text-[9px] text-slate-300 italic">[Tanda Tangan]</span>
            </div>
            <p className="font-bold underline uppercase">{school.namaBendahara}</p>
            <p className="text-[9px] text-slate-600">NIP. {school.nipBendahara || '-'}</p>
          </div>

          <div className="space-y-1">
            <p className="font-bold text-slate-800">Menyetujui untuk Dibayarkan,</p>
            <p className="font-bold text-slate-900">Kepala Sekolah {school.namaSekolah}</p>
            <div className="h-16 flex items-end justify-center">
              <span className="text-[9px] text-slate-300 italic">[Tanda Tangan & Cap]</span>
            </div>
            <p className="font-bold underline uppercase">{school.namaKepalaSekolah}</p>
            <p className="text-[9px] text-slate-600">NIP. {school.nipKepalaSekolah || '-'}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
