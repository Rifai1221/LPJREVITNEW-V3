import React from 'react';
import {
  UserCheck,
  ShieldCheck,
  Compass,
  ClipboardCheck,
  HardHat,
  Users,
  Award,
  FileText,
  Printer,
  Calendar,
  Building,
} from 'lucide-react';
import { SchoolMasterData } from '../types';

interface P2spProps {
  school: SchoolMasterData;
  onPrint?: (doc: 'BAGAN_STRUKTUR' | 'SK_P2SP') => void;
}

/**
 * Visual Organizational Chart (Bagan Struktur Organisasi Tim P2SP)
 * Sesuai format standar DAK Fisik / Revitalisasi Satuan Pendidikan Kemendikbudristek
 */
export const P2spOrgChart: React.FC<P2spProps> = ({ school, onPrint }) => {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Top Banner & Action */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-blue-500/30 text-blue-200 rounded text-[10px] font-bold uppercase tracking-wider border border-blue-400/30">
              Bagan Resmi Swakelola P2SP
            </span>
            <span className="text-xs text-slate-300">T.A. {school.tahunAnggaran || '2025'}</span>
          </div>
          <h3 className="text-base sm:text-lg font-black tracking-tight mt-1">
            STRUKTUR ORGANISASI PANITIA PEMBANGUNAN SATUAN PENDIDIKAN (P2SP)
          </h3>
          <p className="text-xs text-slate-300">
            {school.namaSekolah} • SK No: {school.nomorSkP2SP || '421.2/028/SK-P2SP/2025'}
          </p>
        </div>

        {onPrint && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onPrint('BAGAN_STRUKTUR')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-lg border border-white/20 transition cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak Bagan (PDF)</span>
            </button>
          </div>
        )}
      </div>

      {/* Organizational Flow Chart Canvas */}
      <div className="p-6 bg-slate-50/60 overflow-x-auto">
        <div className="min-w-[760px] flex flex-col items-center">

          {/* Level 1: PENANGGUNG JAWAB (Kepala Sekolah) */}
          <div className="relative flex flex-col items-center">
            <div className="w-80 bg-white border-2 border-blue-600 rounded-xl shadow-md p-4 text-center hover:shadow-lg transition">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-blue-100 text-blue-800 rounded-full text-[11px] font-bold uppercase tracking-wide mb-2">
                <ShieldCheck className="w-3.5 h-3.5 text-blue-700" />
                PENANGGUNG JAWAB
              </div>
              <h4 className="text-sm font-black text-slate-900 uppercase">
                {school.namaKepalaSekolah || 'NAMA KEPALA SEKOLAH'}
              </h4>
              <p className="text-[11px] font-mono text-slate-600 mt-0.5">
                NIP. {school.nipKepalaSekolah || '-'}
              </p>
              <div className="text-[10px] text-blue-700 font-semibold mt-1 bg-blue-50 py-0.5 rounded">
                Kepala Satuan Pendidikan {school.namaSekolah}
              </div>
            </div>

            {/* Vertical connector line */}
            <div className="w-0.5 h-8 bg-blue-600"></div>
          </div>

          {/* Level 2: KETUA PANITIA P2SP & WINGS (Sekretaris & Bendahara) */}
          <div className="relative w-full max-w-4xl flex items-center justify-center">
            
            {/* Wing Kiri: SEKRETARIS */}
            <div className="w-64 bg-white border-2 border-emerald-500 rounded-xl shadow-xs p-3 text-center z-10">
              <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-800 rounded-md text-[10px] font-bold uppercase tracking-wide mb-1">
                <FileText className="w-3 h-3 text-emerald-600" />
                SEKRETARIS
              </div>
              <h5 className="text-xs font-bold text-slate-900 uppercase">
                {school.namaSekretaris || 'NURUL AINI, S.Pd'}
              </h5>
              <p className="text-[10px] text-slate-500 font-mono">
                {school.nipSekretaris ? `NIP. ${school.nipSekretaris}` : 'Unsur Tenaga Administrasi/Guru'}
              </p>
              <div className="text-[9px] text-emerald-700 font-medium mt-1 bg-emerald-50/60 py-0.5 rounded">
                Administrasi, Notulensi & SPB
              </div>
            </div>

            {/* Horizontal connecting arm to Sekretaris */}
            <div className="w-12 h-0.5 bg-slate-400 border-t border-dashed border-slate-500"></div>

            {/* Center Node: KETUA PANITIA P2SP */}
            <div className="w-72 bg-white border-2 border-indigo-600 rounded-xl shadow-md p-4 text-center z-10 hover:shadow-lg transition">
              <div className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-indigo-100 text-indigo-800 rounded-full text-[11px] font-bold uppercase tracking-wide mb-1.5">
                <Award className="w-3.5 h-3.5 text-indigo-700" />
                KETUA PANITIA (P2SP)
              </div>
              <h4 className="text-sm font-black text-slate-900 uppercase">
                {school.namaKetuaP2SP || 'IRWAN YUSUF'}
              </h4>
              <p className="text-[11px] text-indigo-700 font-semibold mt-0.5">
                {school.jabatanKetuaP2SP || 'Ketua Komite Sekolah'}
              </p>
              <div className="text-[10px] text-slate-500 mt-1 bg-slate-50 py-0.5 rounded">
                Unsur: {school.unsurKetuaP2SP || 'Komite Sekolah / Tokoh Masyarakat'}
              </div>
            </div>

            {/* Horizontal connecting arm to Bendahara */}
            <div className="w-12 h-0.5 bg-slate-400 border-t border-dashed border-slate-500"></div>

            {/* Wing Kanan: BENDAHARA */}
            <div className="w-64 bg-white border-2 border-purple-500 rounded-xl shadow-xs p-3 text-center z-10">
              <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-800 rounded-md text-[10px] font-bold uppercase tracking-wide mb-1">
                <UserCheck className="w-3 h-3 text-purple-600" />
                BENDAHARA
              </div>
              <h5 className="text-xs font-bold text-slate-900 uppercase">
                {school.namaBendahara || 'ZAYYANI, S.Pd'}
              </h5>
              <p className="text-[10px] text-slate-500 font-mono">
                {school.nipBendahara ? `NIP. ${school.nipBendahara}` : 'Unsur Bendahara Bantuan'}
              </p>
              <div className="text-[9px] text-purple-700 font-medium mt-1 bg-purple-50/60 py-0.5 rounded">
                Keuangan, BKU, BKT & Kwitansi
              </div>
            </div>
          </div>

          {/* Central Vertical Connector Line down to 3 functional teams */}
          <div className="w-0.5 h-8 bg-indigo-600"></div>

          {/* Horizontal Distribution Beam */}
          <div className="w-[78%] h-0.5 bg-indigo-600 relative">
            {/* Left drop pin */}
            <div className="absolute left-0 top-0 w-0.5 h-6 bg-indigo-600"></div>
            {/* Center drop pin */}
            <div className="absolute left-1/2 -translate-x-1/2 top-0 w-0.5 h-6 bg-indigo-600"></div>
            {/* Right drop pin */}
            <div className="absolute right-0 top-0 w-0.5 h-6 bg-indigo-600"></div>
          </div>

          {/* Level 3: TIGA PILAR PELAKSANA OPERASIONAL + FASILITATOR TEKNIS */}
          <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-3 gap-5 pt-6">

            {/* 1. TIM TEKNIS PERENCANA */}
            <div className="bg-white border-2 border-sky-500 rounded-xl shadow-xs p-4 flex flex-col justify-between hover:shadow-md transition">
              <div>
                <div className="flex items-center justify-between border-b border-sky-100 pb-2 mb-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-black text-sky-900 uppercase">
                    <Compass className="w-4 h-4 text-sky-600" />
                    TIM TEKNIS PERENCANA
                  </div>
                  <span className="text-[9px] bg-sky-100 text-sky-800 font-bold px-1.5 py-0.5 rounded">
                    Teknis RAB
                  </span>
                </div>

                <div className="space-y-1.5 text-left">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">Penanggung Jawab:</span>
                    <p className="text-xs font-bold text-slate-900 uppercase">
                      {school.namaPerencana || 'Zulfahmi, ST'}
                    </p>
                    <p className="text-[10px] text-sky-700 font-medium">
                      {school.jabatanPerencana || 'Arsitek / Tenaga Ahli Perencana Teknis'}
                    </p>
                  </div>

                  <div className="pt-1 border-t border-slate-100">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">Anggota Tim:</span>
                    <p className="text-[11px] font-semibold text-slate-700">
                      {school.anggotaPerencana || 'Rahmat Hidayat, A.Md (Asisten Teknis)'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-100 text-[10px] text-slate-500 space-y-0.5 bg-sky-50/40 p-2 rounded">
                <p className="font-semibold text-sky-900">Uraian Tugas Pokok:</p>
                <p>• Menyusun Gambar Rencana Teknis & Denah</p>
                <p>• Menyusun Rencana Anggaran Biaya (RPD & RAB)</p>
                <p>• Menyusun Jadwal Kurva S & Spesifikasi Bahan</p>
              </div>
            </div>

            {/* 2. TIM TEKNIS PENGAWAS */}
            <div className="bg-white border-2 border-teal-500 rounded-xl shadow-xs p-4 flex flex-col justify-between hover:shadow-md transition">
              <div>
                <div className="flex items-center justify-between border-b border-teal-100 pb-2 mb-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-black text-teal-900 uppercase">
                    <ClipboardCheck className="w-4 h-4 text-teal-600" />
                    TIM TEKNIS PENGAWAS
                  </div>
                  <span className="text-[9px] bg-teal-100 text-teal-800 font-bold px-1.5 py-0.5 rounded">
                    Mutu & Opname
                  </span>
                </div>

                <div className="space-y-1.5 text-left">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">Penanggung Jawab:</span>
                    <p className="text-xs font-bold text-slate-900 uppercase">
                      {school.namaPengawas || 'M. Aris Syahputra, ST'}
                    </p>
                    <p className="text-[10px] text-teal-700 font-medium">
                      {school.jabatanPengawas || 'Tenaga Ahli Pengawas Lapangan'}
                    </p>
                  </div>

                  <div className="pt-1 border-t border-slate-100">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">Anggota Tim:</span>
                    <p className="text-[11px] font-semibold text-slate-700">
                      {school.anggotaPengawas || 'H. Mansyur (Unsur Masyarakat / Komite)'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-100 text-[10px] text-slate-500 space-y-0.5 bg-teal-50/40 p-2 rounded">
                <p className="font-semibold text-teal-900">Uraian Tugas Pokok:</p>
                <p>• Memeriksa Kualitas Bahan & Kesesuaian Gambar</p>
                <p>• Mengukur Prestasi Fisik Mingguan (Opname Lapangan)</p>
                <p>• Menerbitkan Lembar Pengawasan & Catatan Teknis</p>
              </div>
            </div>

            {/* 3. TIM PELAKSANA KEGIATAN & FASILITATOR */}
            <div className="bg-white border-2 border-amber-500 rounded-xl shadow-xs p-4 flex flex-col justify-between hover:shadow-md transition">
              <div>
                <div className="flex items-center justify-between border-b border-amber-100 pb-2 mb-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-black text-amber-900 uppercase">
                    <HardHat className="w-4 h-4 text-amber-600" />
                    TIM PELAKSANA KEGIATAN
                  </div>
                  <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded">
                    Fisik, Logistik & Keamanan
                  </span>
                </div>

                <div className="space-y-1.5 text-left">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">Kepala / Ketua Pelaksana:</span>
                    <p className="text-xs font-bold text-slate-900 uppercase">
                      {school.namaKepalaPelaksana || school.namaPelaksana || 'T. Jeffri Lazharu'}
                    </p>
                    <p className="text-[10px] text-amber-700 font-medium">
                      {school.jabatanPelaksana || 'Kepala Pelaksana / Mandor Konstruksi'}
                    </p>
                  </div>

                  <div className="pt-1 border-t border-slate-100 grid grid-cols-3 gap-1.5 text-left">
                    <div>
                      <span className="text-[9px] text-slate-400 uppercase font-semibold">Keamanan:</span>
                      <p className="text-[10px] font-semibold text-slate-800 truncate" title={school.namaKeamanan || 'Keamanan'}>
                        {school.namaKeamanan || 'Keamanan'}
                      </p>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 uppercase font-semibold">Logistik:</span>
                      <p className="text-[10px] font-semibold text-slate-800 truncate" title={school.namaLogistik || 'Kamaruddin'}>
                        {school.namaLogistik || 'Kamaruddin'}
                      </p>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-400 uppercase font-semibold">Mandor / KT:</span>
                      <p className="text-[10px] font-semibold text-slate-800 truncate" title={school.namaMandor || 'Budiman'}>
                        {school.namaMandor || 'Budiman'}
                      </p>
                    </div>
                  </div>

                  {school.namaFasilitator && (
                    <div className="mt-2 pt-1.5 border-t border-amber-200 bg-amber-50/80 p-1.5 rounded">
                      <span className="text-[9px] text-amber-800 uppercase font-bold block">Fasilitator Teknis / Pendamping:</span>
                      <p className="text-[10px] font-bold text-slate-900">{school.namaFasilitator}</p>
                      <p className="text-[9px] text-slate-600">{school.jabatanFasilitator || 'Fasilitator Teknis / Pendamping Dinas'}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-100 text-[10px] text-slate-500 space-y-0.5 bg-amber-50/40 p-2 rounded">
                <p className="font-semibold text-amber-900">Uraian Tugas Pokok:</p>
                <p>• Mengkoordinir Tukang & Pekerja Harian Lapangan</p>
                <p>• Penerimaan, Distribusi & Pengamanan Material</p>
                <p>• Keamanan, Ketertiban & Buku Harian Proyek</p>
              </div>
            </div>

          </div>

          {/* Legenda & Garis Komando/Koordinasi */}
          <div className="mt-6 pt-4 border-t border-slate-200 w-full flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-500 gap-3">
            <div className="flex items-center gap-4">
              <span className="font-bold text-slate-700">Keterangan Garis:</span>
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-0.5 bg-indigo-600"></div>
                <span>Garis Komando / Instruksi</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-0.5 border-t-2 border-dashed border-slate-500"></div>
                <span>Garis Koordinasi / Pelaporan</span>
              </div>
            </div>

            <div className="text-right text-[10px] font-medium text-slate-600">
              Ditetapkan di {school.kabKota || 'Kota Lhokseumawe'}, Tanggal {school.tanggalSkP2SP || '15 Juli 2025'}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

/**
 * Naskah Dokumen Surat Keputusan (SK) Tim P2SP Lengkap & Resmi
 */
export const P2spSkDocument: React.FC<P2spProps> = ({ school, onPrint }) => {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Top Banner */}
      <div className="bg-slate-900 text-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 bg-emerald-500/30 text-emerald-200 rounded text-[10px] font-bold uppercase tracking-wider border border-emerald-400/30">
              Dokumen Hukum & Legalitas
            </span>
            <span className="text-xs text-slate-300">Format Resmi Satuan Pendidikan</span>
          </div>
          <h3 className="text-base font-bold text-white mt-1">
            Surat Keputusan (SK) Kepala Satuan Pendidikan tentang Pembentukan Panitia P2SP
          </h3>
          <p className="text-xs text-slate-400">
            Nomor: {school.nomorSkP2SP || '421.2/028/SK-P2SP/2025'} • Tanggal: {school.tanggalSkP2SP || '15 Juli 2025'}
          </p>
        </div>

        {onPrint && (
          <button
            type="button"
            onClick={() => onPrint('SK_P2SP')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow transition cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Cetak Dokumen SK (PDF)</span>
          </button>
        )}
      </div>

      {/* SK Official Letter Sheet */}
      <div className="p-8 sm:p-12 max-w-4xl mx-auto font-serif text-slate-900 text-xs sm:text-sm leading-relaxed space-y-6">

        {/* Kop Surat Sekolah */}
        <div className="text-center border-b-4 border-double border-slate-900 pb-3">
          <p className="font-bold text-xs uppercase tracking-wider">{school.dinasPendidikan || 'DINAS PENDIDIKAN DAN KEBUDAYAAN'}</p>
          <p className="font-bold text-xs uppercase tracking-wider">{school.kabKota || 'PEMERINTAH KABUPATEN / KOTA'}</p>
          <h2 className="text-lg sm:text-xl font-black uppercase tracking-normal my-0.5 text-slate-900">
            {school.namaSekolah || 'SD NEGERI 1 MUARA DUA'}
          </h2>
          <p className="text-[11px] font-sans text-slate-600">
            Alamat: {school.alamat || 'Jalan Pendidikan'}, {school.kabKota} • NPSN: {school.npsn || '10105685'}
          </p>
        </div>

        {/* Judul & Nomor SK */}
        <div className="text-center space-y-1 pt-2">
          <h3 className="font-bold uppercase tracking-wider text-sm sm:text-base underline">
            SURAT KEPUTUSAN KEPALA {school.namaSekolah}
          </h3>
          <p className="font-sans text-xs font-semibold">
            NOMOR : {school.nomorSkP2SP || '421.2/028/SK-P2SP/2025'}
          </p>
          <p className="font-bold uppercase text-xs pt-1">
            TENTANG
          </p>
          <p className="font-bold uppercase text-xs max-w-xl mx-auto leading-normal">
            {school.tentangSkP2SP || 'PEMBENTUKAN PANITIA PEMBANGUNAN SATUAN PENDIDIKAN (P2SP) PELAKSANA BANTUAN PEMERINTAH / DAK FISIK TAHUN ANGGARAN ' + (school.tahunAnggaran || '2025')}
          </p>
        </div>

        {/* Kepala Sekolah Menimbang, Mengingat */}
        <div className="text-center font-bold uppercase text-xs pt-2">
          KEPALA {school.namaSekolah},
        </div>

        <div className="space-y-3 font-sans text-xs leading-normal">
          {/* Menimbang */}
          <div className="grid grid-cols-12 gap-2">
            <span className="col-span-2 font-bold">Menimbang</span>
            <span className="col-span-1 text-center">:</span>
            <div className="col-span-9 space-y-1.5">
              <p>a. bahwa dalam rangka peningkatan mutu sarana dan prasarana pendidikan melalui program {school.program || 'Revitalisasi Sekolah'} Pekerjaan {school.pekerjaan || 'Rehabilitasi dan Pembangunan Ruang Kelas Baru'};</p>
              <p>b. bahwa agar pelaksanaan pekerjaan fisik dan pertanggungjawaban keuangan berjalan tertib, tepat waktu, transparan, akuntabel, dan sesuai Petunjuk Teknis, perlu dibentuk Panitia Pembangunan Satuan Pendidikan (P2SP);</p>
              <p>c. bahwa nama-nama yang tercantum dalam Lampiran Surat Keputusan ini dipandang cakap, mampu, dan memenuhi syarat untuk ditetapkan sebagai Panitia P2SP.</p>
            </div>
          </div>

          {/* Mengingat */}
          <div className="grid grid-cols-12 gap-2">
            <span className="col-span-2 font-bold">Mengingat</span>
            <span className="col-span-1 text-center">:</span>
            <div className="col-span-9 space-y-1 text-[11px]">
              <p>1. Undang-Undang Nomor 20 Tahun 2003 tentang Sistem Pendidikan Nasional;</p>
              <p>2. Peraturan Presiden Nomor 16 Tahun 2018 tentang Pengadaan Barang/Jasa Pemerintah jo. Perpres No. 12 Tahun 2021 (Pelaksanaan Swakelola Tipe I / Tipe IV);</p>
              <p>3. Peraturan Menteri Pendidikan, Kebudayaan, Riset, dan Teknologi tentang Petunjuk Operasional Bantuan DAK Fisik Bidang Pendidikan Tahun {school.tahunAnggaran || '2025'};</p>
              <p>4. Peraturan Menteri Keuangan tentang Tata Cara Pengelolaan Bantuan Pemerintah pada Kementerian Negara / Lembaga.</p>
            </div>
          </div>

          {/* Memutuskan */}
          <div className="text-center font-bold uppercase pt-2 tracking-wide">
            MEMUTUSKAN :
          </div>

          <div className="grid grid-cols-12 gap-2">
            <span className="col-span-2 font-bold">Menetapkan</span>
            <span className="col-span-1 text-center">:</span>
            <div className="col-span-9 space-y-2.5">
              <div>
                <span className="font-bold">KESATU : </span>
                Membentuk Panitia Pembangunan Satuan Pendidikan (P2SP) pada {school.namaSekolah} Tahun Anggaran {school.tahunAnggaran || '2025'} dengan susunan personalia sebagaimana tercantum dalam Lampiran I Keputusan ini.
              </div>
              <div>
                <span className="font-bold">KEDUA : </span>
                Panitia sebagaimana dimaksud Diktum KESATU bertugas merencanakan, melaksanakan, mengawasi, serta mempertanggungjawabkan seluruh pelaksanaan kegiatan dan keuangan secara swakelola sesuai ketentuan yang berlaku.
              </div>
              <div>
                <span className="font-bold">KETIGA : </span>
                Segala biaya yang timbul akibat diterbitkannya Keputusan ini dibebankan pada Anggaran Bantuan Pemerintah DAK Fisik Bidang Pendidikan Tahun Anggaran {school.tahunAnggaran || '2025'}.
              </div>
              <div>
                <span className="font-bold">KEEMPAT : </span>
                Keputusan ini mulai berlaku sejak tanggal ditetapkan, dan apabila di kemudian hari terdapat kekeliruan akan diadakan perbaikan sebagaimana mestinya.
              </div>
            </div>
          </div>
        </div>

        {/* Tanda Tangan Pengesahan */}
        <div className="pt-6 font-sans text-xs flex justify-end">
          <div className="text-center w-72 space-y-1">
            <p>Ditetapkan di : {school.kabKota || 'Kota Lhokseumawe'}</p>
            <p>Pada tanggal : {school.tanggalSkP2SP || '15 Juli 2025'}</p>
            <p className="font-bold uppercase pt-2">
              Kepala {school.namaSekolah}
            </p>
            <div className="h-16 flex items-center justify-center text-slate-400 text-[10px] italic">
              [Tanda Tangan & Cap Satuan Pendidikan]
            </div>
            <p className="font-bold uppercase underline">
              {school.namaKepalaSekolah || 'Fakhrurrazi, S.Pd, M.Pd'}
            </p>
            <p className="font-mono text-[11px]">
              NIP. {school.nipKepalaSekolah || '197012311996061002'}
            </p>
          </div>
        </div>

        {/* Lampiran I : Tabel Susunan Personalia */}
        <div className="pt-8 border-t-2 border-dashed border-slate-300 font-sans space-y-3">
          <div className="text-left">
            <p className="text-[11px] font-bold text-slate-500">LAMPIRAN I : SURAT KEPUTUSAN KEPALA {school.namaSekolah}</p>
            <p className="text-[11px] text-slate-500">NOMOR : {school.nomorSkP2SP || '421.2/028/SK-P2SP/2025'}</p>
            <h4 className="text-xs font-bold uppercase mt-1 text-slate-900">
              SUSUNAN PERSONALIA PANITIA PEMBANGUNAN SATUAN PENDIDIKAN (P2SP)
            </h4>
          </div>

          <table className="w-full border-collapse border border-black text-[11px]">
            <thead>
              <tr className="bg-slate-100 text-center font-bold">
                <th className="border border-black p-1.5 w-10">NO</th>
                <th className="border border-black p-1.5 text-left w-56">JABATAN DALAM PANITIA</th>
                <th className="border border-black p-1.5 text-left">NAMA LENGKAP</th>
                <th className="border border-black p-1.5 text-left">UNSUR / KETERANGAN</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-black p-2 text-center font-mono font-bold">1</td>
                <td className="border border-black p-2 font-bold">Penanggung Jawab</td>
                <td className="border border-black p-2 uppercase font-bold">{school.namaKepalaSekolah}</td>
                <td className="border border-black p-2">Kepala Satuan Pendidikan (NIP. {school.nipKepalaSekolah || '-'})</td>
              </tr>
              <tr>
                <td className="border border-black p-2 text-center font-mono font-bold">2</td>
                <td className="border border-black p-2 font-bold">Ketua Panitia (P2SP)</td>
                <td className="border border-black p-2 uppercase font-bold">{school.namaKetuaP2SP}</td>
                <td className="border border-black p-2">{school.unsurKetuaP2SP || 'Komite Sekolah'}</td>
              </tr>
              <tr>
                <td className="border border-black p-2 text-center font-mono font-bold">3</td>
                <td className="border border-black p-2 font-bold">Sekretaris</td>
                <td className="border border-black p-2 uppercase font-semibold">{school.namaSekretaris || 'SEKRETARIS'}</td>
                <td className="border border-black p-2">{school.jabatanSekretaris || 'Sekretaris P2SP'}</td>
              </tr>
              <tr>
                <td className="border border-black p-2 text-center font-mono font-bold">4</td>
                <td className="border border-black p-2 font-bold">Bendahara</td>
                <td className="border border-black p-2 uppercase font-semibold">{school.namaBendahara || 'BENDAHARA'}</td>
                <td className="border border-black p-2">Bendahara P2SP (NIP. {school.nipBendahara || '-'})</td>
              </tr>
              <tr>
                <td className="border border-black p-2 text-center font-mono font-bold">5</td>
                <td className="border border-black p-2 font-bold">Kepala Pelaksana</td>
                <td className="border border-black p-2 uppercase font-semibold">{school.namaKepalaPelaksana || school.namaPelaksana || 'KEPALA PELAKSANA'}</td>
                <td className="border border-black p-2">{school.jabatanPelaksana || 'Kepala Pelaksana Lapangan / Mandor Konstruksi'}</td>
              </tr>
              <tr>
                <td className="border border-black p-2 text-center font-mono font-bold">6</td>
                <td className="border border-black p-2 font-bold">Petugas Keamanan</td>
                <td className="border border-black p-2 uppercase font-semibold">{school.namaKeamanan || 'PETUGAS KEAMANAN'}</td>
                <td className="border border-black p-2">{school.jabatanKeamanan || 'Petugas Keamanan'}</td>
              </tr>
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
};
