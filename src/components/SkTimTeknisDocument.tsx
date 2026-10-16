import React from 'react';
import { SchoolMasterData } from '../types';

interface SkTimTeknisDocumentProps {
  school: SchoolMasterData;
}

export const SkTimTeknisDocument: React.FC<SkTimTeknisDocumentProps> = ({ school }) => {
  const logoH = `${school.logoHeightPx || 65}px`;

  return (
    <div className="space-y-8 font-serif text-[11px] leading-relaxed text-slate-900">
      {/* ========================================================
          HALAMAN 1: NASKAH UTAMA SURAT KEPUTUSAN (SK TIM TEKNIS)
         ======================================================== */}
      <div className="page-break bg-white p-10 sm:p-12 min-h-[297mm] shadow-xs border border-slate-200 print:border-none print:shadow-none space-y-4">
        {/* Kop Surat Sekolah */}
        <div className="pb-2 mb-4 font-sans">
          <div className="flex items-center justify-between gap-4">
            <div className="w-20 flex justify-center items-center shrink-0">
              {school.logoLeftUrl && (
                <img
                  src={school.logoLeftUrl}
                  alt="Logo Kiri"
                  style={{ height: logoH }}
                  className="w-auto max-w-[80px] object-contain"
                />
              )}
            </div>
            <div className="flex-1 text-center space-y-0.5">
              <p className="font-bold text-[11px] uppercase tracking-wider text-slate-900 leading-tight">
                {school.headerPemerintahText || `PEMERINTAH ${school.kabKota?.toUpperCase() || 'KABUPATEN / KOTA'}`}
              </p>
              <p className="font-bold text-[11px] uppercase tracking-wider text-slate-900 leading-tight">
                {school.dinasPendidikan || 'DINAS PENDIDIKAN DAN KEBUDAYAAN'}
              </p>
              {school.cabangDinas && (
                <p className="font-bold text-[10px] uppercase tracking-wider text-slate-800 leading-tight">
                  {school.cabangDinas}
                </p>
              )}
              <h2 className="text-base font-black uppercase tracking-wide my-0.5 text-black leading-snug">
                {school.namaSekolah}
              </h2>
              <p className="text-[9.5px] text-slate-700 leading-normal">
                {school.kopAlamatText || (
                  [
                    school.alamat,
                    school.desa ? `Desa/Kel. ${school.desa}` : '',
                    school.kecamatan ? `Kec. ${school.kecamatan}` : '',
                    school.kabKota,
                    school.provinsi,
                    school.kodePos ? `Kode Pos ${school.kodePos}` : '',
                  ].filter(Boolean).join(', ') + (school.npsn ? ` • NPSN: ${school.npsn}` : '')
                )}
              </p>
              {(school.kopKontakText || school.teleponSekolah || school.emailSekolah || school.websiteSekolah) && (
                <p className="text-[9px] text-slate-600 leading-normal">
                  {school.kopKontakText || [
                    school.teleponSekolah ? `Telp: ${school.teleponSekolah}` : '',
                    school.emailSekolah ? `Pos-el: ${school.emailSekolah}` : '',
                    school.websiteSekolah ? `Laman: ${school.websiteSekolah}` : '',
                  ].filter(Boolean).join(' | ')}
                </p>
              )}
            </div>
            <div className="w-20 flex justify-center items-center shrink-0">
              {school.logoRightUrl && (
                <img
                  src={school.logoRightUrl}
                  alt="Logo Kanan"
                  style={{ height: logoH }}
                  className="w-auto max-w-[80px] object-contain"
                />
              )}
            </div>
          </div>
          {/* Garis Ganda Resmi Kedinasan */}
          <div className="pt-2">
            <div className="border-b-[2.5px] border-slate-900" />
            <div className="border-b-[0.75px] border-slate-900 mt-[2px]" />
          </div>
        </div>

        {/* Header Judul SK */}
        <div className="text-center space-y-1 font-sans">
          <h3 className="font-bold uppercase tracking-wider text-xs font-sans">
            KEPUTUSAN KEPALA {school.namaSekolah.toUpperCase()}
          </h3>
          <p className="font-bold uppercase text-xs">
            {school.kabKota ? school.kabKota.toUpperCase() : 'KABUPATEN / KOTA'}
          </p>
          <p className="font-semibold text-[11px]">
            Nomor : {school.nomorSkTimTeknis || '421.2/029/SK-TIM-TEKNIS/2026'}
          </p>
          <p className="font-bold uppercase text-[11px] pt-1">
            TENTANG
          </p>
          <p className="font-extrabold uppercase text-xs max-w-xl mx-auto leading-tight pt-0.5">
            PENETAPAN TIM TEKNIS PELAKSANAAN BANTUAN PEMERINTAH PROGRAM REVITALISASI SATUAN PENDIDIKAN {school.namaSekolah.toUpperCase()} TAHUN ANGGARAN {school.tahunAnggaran || '2026'}
          </p>
        </div>

        {/* Menimbang & Mengingat */}
        <div className="space-y-3 pt-2 text-[11px]">
          <div className="grid grid-cols-12 gap-1">
            <span className="col-span-2 font-bold font-sans">Menimbang :</span>
            <div className="col-span-10 space-y-1.5">
              <div className="flex items-start gap-2">
                <span>a.</span>
                <p>
                  Bahwa dalam rangka perbaikan dan pemenuhan kebutuhan sarana prasarana satuan pendidikan, Pemerintah telah melaksanakan Program Revitalisasi Satuan Pendidikan;
                </p>
              </div>
              <div className="flex items-start gap-2">
                <span>b.</span>
                <p>
                  Bahwa untuk menunjang kelancaran, transparansi, dan akuntabilitas pelaksanaan program pembangunan di tingkat satuan pendidikan perlu dibentuk Panitia Pembangunan Satuan Pendidikan dan Tim Teknis Pelaksana.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-1 pt-1">
            <span className="col-span-2 font-bold font-sans">Mengingat :</span>
            <div className="col-span-10 space-y-1 text-[10.5px]">
              <div className="flex items-start gap-2">
                <span>a.</span>
                <p>Undang-Undang Nomor 20 Tahun 2003 tentang Sistem Pendidikan Nasional;</p>
              </div>
              <div className="flex items-start gap-2">
                <span>b.</span>
                <p>Undang-Undang Nomor 32 Tahun 2004 tentang Pemerintahan Daerah;</p>
              </div>
              <div className="flex items-start gap-2">
                <span>c.</span>
                <p>
                  Instruksi Presiden Republik Indonesia Nomor 7 Tahun 2025 tentang Percepatan Pelaksanaan Program Pembangunan dan Revitalisasi Satuan Pendidikan Anak Usia Dini, Pendidikan Dasar dan Pendidikan Menengah, Pembangunan dan Pengelolaan Sekolah Menengah Atas Unggul Garuda, dan Digitalisasi Pembelajaran;
                </p>
              </div>
              <div className="flex items-start gap-2">
                <span>d.</span>
                <p>
                  Petunjuk Teknis Pelaksanaan Bantuan Pemerintah Program Revitalisasi Satuan Pendidikan Tahun Anggaran {school.tahunAnggaran || '2026'};
                </p>
              </div>
              <div className="flex items-start gap-2">
                <span>e.</span>
                <p>
                  Panduan Pelaksanaan dan Laporan Bantuan Pemerintah Program Revitalisasi Satuan Pendidikan Tahun Anggaran {school.tahunAnggaran || '2026'};
                </p>
              </div>
            </div>
          </div>

          <div className="text-center font-bold uppercase font-sans text-xs pt-2 tracking-widest">
            MEMUTUSKAN :
          </div>

          <div className="space-y-2 pt-1 text-[11px]">
            <div className="grid grid-cols-12 gap-1">
              <span className="col-span-2 font-bold font-sans">Menetapkan :</span>
              <div className="col-span-10"></div>
            </div>

            <div className="grid grid-cols-12 gap-1">
              <span className="col-span-2 font-bold font-sans">Pertama :</span>
              <p className="col-span-10">
                Menetapkan Tim Teknis Pelaksanaan Bantuan Pemerintah Program Revitalisasi Satuan Pendidikan <strong>{school.namaSekolah}</strong> Tahun Anggaran {school.tahunAnggaran || '2026'} sebagaimana tertuang pada lampiran Keputusan ini.
              </p>
            </div>

            <div className="grid grid-cols-12 gap-1">
              <span className="col-span-2 font-bold font-sans">Kedua :</span>
              <p className="col-span-10">
                Tim Teknis sebagaimana diktum pertama bertugas sebagai pembuat dokumen perencanaan dan melaksanakan pengawasan dalam pelaksanaan Bantuan Pemerintah Program Revitalisasi Satuan Pendidikan {school.namaSekolah} Tahun Anggaran {school.tahunAnggaran || '2026'} dengan tugas dan peran sebagaimana dituangkan dalam Lampiran Surat Keputusan ini.
              </p>
            </div>

            <div className="grid grid-cols-12 gap-1">
              <span className="col-span-2 font-bold font-sans">Ketiga :</span>
              <p className="col-span-10">
                Semua biaya yang timbul akibat dikeluarkannya Surat Keputusan ini dibebankan kepada Satuan Pendidikan dan Panitia Pembangunan Satuan Pendidikan {school.namaSekolah} selaku pengelola dana bantuan Program Revitalisasi Satuan Pendidikan Tahun Anggaran {school.tahunAnggaran || '2026'}.
              </p>
            </div>

            <div className="grid grid-cols-12 gap-1">
              <span className="col-span-2 font-bold font-sans">Keempat :</span>
              <p className="col-span-10">
                Surat Keputusan ini berlaku sejak tanggal ditetapkan, dan apabila dikemudian hari terdapat kekeliruan, maka akan diperbaiki sebagaimana mestinya.
              </p>
            </div>
          </div>
        </div>

        {/* Tanda Tangan */}
        <div className="pt-6 flex justify-end font-sans text-[11px] print-avoid-break print-signature-block">
          <div className="w-64 space-y-1">
            <p>Ditetapkan di : {school.kabKota || 'Lhokseumawe'}</p>
            <p>Pada tanggal : {school.tanggalSkTimTeknis || school.tanggalSkP2SP || '16 Juli 2025'}</p>
            <p className="font-bold pt-1">Kepala {school.namaSekolah}</p>
            <div className="h-16"></div>
            <p className="font-bold underline">{school.namaKepalaSekolah || 'FAKHRURRAZI, S.Pd, M.Pd'}</p>
            <p>NIP. {school.nipKepalaSekolah || '-'}</p>
          </div>
        </div>
      </div>

      {/* ========================================================
          HALAMAN 2: LAMPIRAN 1 - SUSUNAN TIM TEKNIS
         ======================================================== */}
      <div className="page-break bg-white p-10 sm:p-12 min-h-[297mm] shadow-xs border border-slate-200 print:border-none print:shadow-none space-y-5">
        <div className="space-y-1 text-[10.5px] font-sans border-b border-slate-300 pb-3">
          <p className="font-bold">Lampiran 1</p>
          <p className="font-bold">Surat Keputusan Kepala {school.namaSekolah}</p>
          <div className="grid grid-cols-12 gap-1 text-[10px]">
            <span className="col-span-2">Nomor</span>
            <span className="col-span-10">: {school.nomorSkTimTeknis || '421.2/029/SK-TIM-TEKNIS/2026'}</span>
            <span className="col-span-2">Tanggal</span>
            <span className="col-span-10">: {school.tanggalSkTimTeknis || school.tanggalSkP2SP || '16 Juli 2025'}</span>
            <span className="col-span-2">Tentang</span>
            <span className="col-span-10 font-bold">: Penetapan Tim Teknis Pelaksanaan Bantuan Pemerintah Program Revitalisasi Satuan Pendidikan {school.namaSekolah} Tahun Anggaran {school.tahunAnggaran || '2026'}</span>
          </div>
        </div>

        <div className="text-center font-bold text-xs uppercase font-sans tracking-wide">
          SUSUNAN TIM TEKNIS PELAKSANAAN BANTUAN PEMERINTAH PROGRAM REVITALISASI SATUAN PENDIDIKAN
        </div>

        {/* Tabel Tim Teknis */}
        <table className="w-full border-collapse border border-slate-900 text-[10.5px] font-sans">
          <thead>
            <tr className="bg-slate-100 text-center font-bold">
              <th className="border border-slate-900 p-2 w-10">No.</th>
              <th className="border border-slate-900 p-2 w-44">Nama dan Alamat sesuai KTP</th>
              <th className="border border-slate-900 p-2 w-28">Jabatan</th>
              <th className="border border-slate-900 p-2">Kriteria</th>
              <th className="border border-slate-900 p-2 w-32">Pendidikan</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-slate-900 p-2 text-center align-top font-bold">1.</td>
              <td className="border border-slate-900 p-2 align-top">
                <p className="font-bold text-slate-900">{school.namaPerencana || 'Zulfahmi, ST'}</p>
                <p className="text-[10px] text-slate-700 mt-1">{school.alamatPerencana || school.alamat || 'Jl. Merdeka No. 12, Lhokseumawe'}</p>
              </td>
              <td className="border border-slate-900 p-2 text-center align-top font-bold">
                Perencana
              </td>
              <td className="border border-slate-900 p-2 align-top leading-snug text-[10px]">
                {school.kriteriaPerencana || 'Unsur anggota masyarakat/unsur Perguruan Tinggi/Unsur Dinas Pekerjaan Umum Provinsi/Kabupaten/Kota*, berpengalaman dalam bidang perencanaan pembangunan, pendidikan Teknik Arsitektur/Sipil/Keguruan dan Ilmu Pendidikan Bangunan.'}
              </td>
              <td className="border border-slate-900 p-2 align-top text-center font-semibold">
                {school.pendidikanPerencana || 'S1 Teknik Sipil / Arsitektur'}
              </td>
            </tr>

            <tr>
              <td className="border border-slate-900 p-2 text-center align-top font-bold">2.</td>
              <td className="border border-slate-900 p-2 align-top">
                <p className="font-bold text-slate-900">{school.namaPengawas || 'M. Aris Syahputra, ST'}</p>
                <p className="text-[10px] text-slate-700 mt-1">{school.alamatPengawas || school.alamat || 'Jl. Samudera No. 45, Lhokseumawe'}</p>
              </td>
              <td className="border border-slate-900 p-2 text-center align-top font-bold">
                Pengawas
              </td>
              <td className="border border-slate-900 p-2 align-top leading-snug text-[10px]">
                {school.kriteriaPengawas || 'Unsur anggota masyarakat/unsur Perguruan Tinggi/Unsur Dinas Pekerjaan Umum Provinsi/Kabupaten/Kota*, berpengalaman dalam bidang pengawasan pembangunan, pendidikan Teknik Arsitektur/Sipil/Keguruan dan Ilmu Pendidikan Bangunan.'}
              </td>
              <td className="border border-slate-900 p-2 align-top text-center font-semibold">
                {school.pendidikanPengawas || 'S1 Teknik Sipil / Pengawasan'}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Tanda Tangan Lampiran 1 */}
        <div className="pt-8 flex justify-end font-sans text-[11px] print-avoid-break print-signature-block">
          <div className="w-64 space-y-1">
            <p>{school.kabKota || 'Lhokseumawe'}, {school.tanggalSkTimTeknis || school.tanggalSkP2SP || '16 Juli 2025'}</p>
            <p className="font-bold">Kepala Sekolah {school.namaSekolah}</p>
            <div className="h-16"></div>
            <p className="font-bold underline">{school.namaKepalaSekolah || 'FAKHRURRAZI, S.Pd, M.Pd'}</p>
            <p>NIP. {school.nipKepalaSekolah || '-'}</p>
          </div>
        </div>
      </div>

      {/* ========================================================
          HALAMAN 3: LAMPIRAN 2 - TUGAS DAN PERAN TIM TEKNIS
         ======================================================== */}
      <div className="page-break bg-white p-10 sm:p-12 min-h-[297mm] shadow-xs border border-slate-200 print:border-none print:shadow-none space-y-5">
        <div className="space-y-1 text-[10.5px] font-sans border-b border-slate-300 pb-3">
          <p className="font-bold">Lampiran 2</p>
          <p className="font-bold">Surat Keputusan Kepala {school.namaSekolah}</p>
          <div className="grid grid-cols-12 gap-1 text-[10px]">
            <span className="col-span-2">Nomor</span>
            <span className="col-span-10">: {school.nomorSkTimTeknis || '421.2/029/SK-TIM-TEKNIS/2026'}</span>
            <span className="col-span-2">Tanggal</span>
            <span className="col-span-10">: {school.tanggalSkTimTeknis || school.tanggalSkP2SP || '16 Juli 2025'}</span>
            <span className="col-span-2">Tentang</span>
            <span className="col-span-10 font-bold">: Rincian Tugas dan Peran Tim Teknis Pelaksanaan Bantuan Pemerintah Program Revitalisasi Satuan Pendidikan {school.namaSekolah} Tahun Anggaran {school.tahunAnggaran || '2026'}</span>
          </div>
        </div>

        <div className="text-center font-bold text-xs uppercase font-sans tracking-wide underline">
          TUGAS DAN PERAN TIM TEKNIS
        </div>

        <div className="space-y-4 text-[11px] leading-relaxed font-sans">
          {/* Perencana */}
          <div className="space-y-1.5">
            <h4 className="font-bold text-xs underline">a. Perencana:</h4>
            <ol className="list-decimal list-inside space-y-1 pl-2">
              <li>Melakukan survei lahan, harga bahan, dan upah kerja;</li>
              <li>
                Membuat dokumen perencanaan teknis lengkap:
                <ul className="list-disc list-inside pl-6 space-y-0.5 text-[10.5px] pt-0.5 text-slate-800">
                  <li>Gambar Rencana Kerja / Site Plan;</li>
                  <li>Rencana Anggaran Biaya (RAB) / RPD;</li>
                  <li>Rencana Kerja dan Syarat-Syarat (RKS);</li>
                  <li>Jadwal Pelaksanaan Pekerjaan (Kurva S);</li>
                  <li>Rencana Penggunaan Dana.</li>
                </ul>
              </li>
              <li>Membantu P2SP dalam menyiapkan data administrasi pembangunan;</li>
              <li>Membuat dokumen gambar terlaksana (<em>As Built Drawing</em>);</li>
              <li>Membantu P2SP dalam melakukan estimasi teknis dan biaya serta membuat Berita Acara Perubahannya jika terdapat revisi/perubahan pekerjaan;</li>
              <li>Menandatangani dokumen perencanaan dan dokumen teknis revisi/perubahan pekerjaan.</li>
            </ol>
          </div>

          {/* Pengawas */}
          <div className="space-y-1.5 pt-2">
            <h4 className="font-bold text-xs underline">b. Pengawas:</h4>
            <ol className="list-decimal list-inside space-y-1 pl-2">
              <li>Memberikan bantuan teknis dan administrasi secara berkala kepada P2SP;</li>
              <li>Mengawasi, memeriksa kesesuaian kualitas dan kuantitas pekerjaan dengan dokumen perencanaan, termasuk bahan bangunan yang digunakan;</li>
              <li>Membuat, memeriksa, dan mengevaluasi perhitungan progres fisik dan bobot pekerjaan secara berkala;</li>
              <li>Membantu memecahkan masalah teknis, manajemen, administrasi, keuangan, dan masalah lain yang timbul dalam masa pelaksanaan bantuan revitalisasi;</li>
              <li>Membantu menyiapkan berkas pencairan dan pembayaran dana termin;</li>
              <li>Membantu P2SP dalam menyusun laporan pelaksanaan pekerjaan dan Laporan Pertanggungjawaban (LPJ) Akhir;</li>
              <li>Memeriksa laporan P2SP sebelum pelaksanaan serah terima pekerjaan pembangunan (STP);</li>
              <li>Membantu P2SP dalam melakukan estimasi teknis dan biaya serta membuat Berita Acara Perubahannya jika terdapat revisi pekerjaan;</li>
              <li>Menandatangani dokumen perencanaan, laporan pengawasan, dan dokumen teknis revisi/perubahan pekerjaan.</li>
            </ol>
          </div>
        </div>

        {/* Tanda Tangan Lampiran 2 */}
        <div className="pt-8 flex justify-end font-sans text-[11px]">
          <div className="w-64 space-y-1">
            <p>{school.kabKota || 'Lhokseumawe'}, {school.tanggalSkTimTeknis || school.tanggalSkP2SP || '16 Juli 2025'}</p>
            <p className="font-bold">Kepala Sekolah {school.namaSekolah}</p>
            <div className="h-16"></div>
            <p className="font-bold underline">{school.namaKepalaSekolah || 'FAKHRURRAZI, S.Pd, M.Pd'}</p>
            <p>NIP. {school.nipKepalaSekolah || '-'}</p>
          </div>
        </div>
      </div>

      {/* ========================================================
          HALAMAN 4: LAMPIRAN 3 - BERKAS KELENGKAPAN PERSONIL
         ======================================================== */}
      <div className="page-break bg-white p-10 sm:p-12 min-h-[297mm] shadow-xs border border-slate-200 print:border-none print:shadow-none space-y-6">
        <div className="space-y-1 text-[10.5px] font-sans border-b border-slate-300 pb-3">
          <p className="font-bold">Lampiran 3</p>
          <p className="font-bold">Surat Keputusan Kepala {school.namaSekolah}</p>
          <div className="grid grid-cols-12 gap-1 text-[10px]">
            <span className="col-span-2">Nomor</span>
            <span className="col-span-10">: {school.nomorSkTimTeknis || '421.2/029/SK-TIM-TEKNIS/2026'}</span>
            <span className="col-span-2">Tanggal</span>
            <span className="col-span-10">: {school.tanggalSkTimTeknis || school.tanggalSkP2SP || '16 Juli 2025'}</span>
            <span className="col-span-2">Tentang</span>
            <span className="col-span-10 font-bold">: Berkas Dokumen Kelengkapan Personil Tim Teknis Pelaksanaan Bantuan Pemerintah Program Revitalisasi Satuan Pendidikan {school.namaSekolah}</span>
          </div>
        </div>

        <div className="text-center font-bold text-xs uppercase font-sans tracking-wide underline">
          DAFTAR LAMPIRAN BERKAS PERSONIL TIM TEKNIS
        </div>

        <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl space-y-4 font-sans text-xs">
          <p className="font-bold text-slate-800">
            Berikut dokumen portofolio dan verifikasi keabsahan personil Tim Teknis (Perencana maupun Pengawas) yang terlampir pada Surat Keputusan ini:
          </p>

          <ul className="space-y-2.5 text-slate-800 pl-4">
            <li className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block"></span>
              <span className="font-bold">Ijazah Pendidikan Terakhir (Perencana & Pengawas)</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block"></span>
              <span className="font-bold">Kartu Tanda Penduduk / KTP (Perencana & Pengawas)</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block"></span>
              <span className="font-bold">Nomor Pokok Wajib Pajak / NPWP (Perencana & Pengawas)</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-600 inline-block"></span>
              <span className="font-semibold">Sertifikat Kompetensi / Keahlian Konstruksi (Jika Ada)</span>
            </li>
          </ul>

          <p className="text-[11px] text-slate-500 italic pt-2">
            (Seluruh salinan dokumen autentik di atas telah diverifikasi dan disimpan sebagai bagian dari berkas pertanggungjawaban fisik dan administrasi bantuan pemerintah).
          </p>
        </div>

        {/* Tanda Tangan Lampiran 3 */}
        <div className="pt-12 flex justify-end font-sans text-[11px]">
          <div className="w-64 space-y-1">
            <p>{school.kabKota || 'Lhokseumawe'}, {school.tanggalSkTimTeknis || school.tanggalSkP2SP || '16 Juli 2025'}</p>
            <p className="font-bold">Kepala Sekolah {school.namaSekolah}</p>
            <div className="h-16"></div>
            <p className="font-bold underline">{school.namaKepalaSekolah || 'FAKHRURRAZI, S.Pd, M.Pd'}</p>
            <p>NIP. {school.nipKepalaSekolah || '-'}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
