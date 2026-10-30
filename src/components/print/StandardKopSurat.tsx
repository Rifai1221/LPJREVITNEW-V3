import React from 'react';
import { SchoolMasterData } from '../../types';

interface StandardKopSuratProps {
  school: SchoolMasterData;
}

export const StandardKopSurat: React.FC<StandardKopSuratProps> = ({ school }) => {
  const logoH = `${school.logoHeightPx || 65}px`;

  // Composed address line
  const addressLine =
    school.kopAlamatText ||
    [
      school.alamat,
      school.desa ? `Desa/Kel. ${school.desa}` : '',
      school.kecamatan ? `Kec. ${school.kecamatan}` : '',
      school.kabKota,
      school.provinsi,
      school.kodePos ? `Kode Pos ${school.kodePos}` : '',
    ]
      .filter(Boolean)
      .join(', ') + (school.npsn ? ` • NPSN: ${school.npsn}` : '');

  // Composed contact line
  const contactParts = [
    school.teleponSekolah ? `Telp: ${school.teleponSekolah}` : '',
    school.emailSekolah ? `Pos-el: ${school.emailSekolah}` : '',
    school.websiteSekolah ? `Laman: ${school.websiteSekolah}` : '',
  ].filter(Boolean);
  const contactLine =
    school.kopKontakText || (contactParts.length > 0 ? contactParts.join(' | ') : '');

  return (
    <div className="pb-2 mb-4 font-sans print-avoid-break print-kop-surat">
      <div className="flex items-center justify-between gap-4">
        {/* Left Logo */}
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

        {/* Center Kop Text */}
        <div className="flex-1 text-center space-y-0.5">
          <p className="font-bold text-[11px] uppercase tracking-wider text-slate-900 leading-tight">
            {school.headerPemerintahText ||
              `PEMERINTAH ${school.kabKota?.toUpperCase() || 'KABUPATEN / KOTA'}`}
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
          <p className="text-[9.5px] text-slate-700 leading-normal">{addressLine}</p>
          {contactLine && (
            <p className="text-[9px] text-slate-600 leading-normal">{contactLine}</p>
          )}
        </div>

        {/* Right Logo */}
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
  );
};
