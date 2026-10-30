import { SchoolMasterData, AppStateData, RealSchoolData } from '../types';
import { initialSchoolData, initialWorkers, initialRpdItems, initialProgressWeeks, initialStores } from './initialData';
import { initialBkbRecords } from './initialData2';
import { getCompleteInitialKwitansiList, generateSampleWeeklyWageReports } from './fullPreset';

export interface SchoolTenant {
  id: string;
  npsn: string;
  namaSekolah: string;
  jenjang: 'TK/PAUD' | 'SD' | 'SMP/MTs' | 'SMA/SMK' | 'SMP' | 'SMA' | 'SMK';
  kabKota: string;
  provinsi: string;
  email: string;
  isDemo?: boolean;
  pinHash?: string;
  pinSalt?: string;
  mustResetPin?: boolean;
  createdAt: string;
  lastLogin: string;
}

// 1. Preset SDN 1 Muara Dua (Default Complete)
export const PRESET_SDN1_MUARA_DUA: SchoolTenant = {
  id: 'sch_10105685',
  npsn: '10105685',
  namaSekolah: 'SD NEGERI 1 MUARA DUA',
  jenjang: 'SD',
  kabKota: 'Kota Lhokseumawe',
  provinsi: 'Prov. Aceh',
  email: 'sdn1muaradua@sekolah.id',
  isDemo: true,
  mustResetPin: true,
  createdAt: '2025-07-01T08:00:00Z',
  lastLogin: new Date().toISOString(),
};

// 2. Preset SMPN 2 Banda Aceh (Distinct second school)
export const PRESET_SMPN2_BANDA_ACEH: SchoolTenant = {
  id: 'sch_10101234',
  npsn: '10101234',
  namaSekolah: 'SMP NEGERI 2 BANDA ACEH',
  jenjang: 'SMP',
  kabKota: 'Kota Banda Aceh',
  provinsi: 'Prov. Aceh',
  email: 'smpn2bandaaceh@sekolah.id',
  isDemo: true,
  mustResetPin: true,
  createdAt: '2025-07-10T09:00:00Z',
  lastLogin: new Date().toISOString(),
};

// 3. Preset SDN 03 Kebon Jeruk (Distinct third school)
export const PRESET_SDN03_KEBON_JERUK: SchoolTenant = {
  id: 'sch_20104567',
  npsn: '20104567',
  namaSekolah: 'SD NEGERI 03 KEBON JERUK',
  jenjang: 'SD',
  kabKota: 'Kota Jakarta Barat',
  provinsi: 'Prov. DKI Jakarta',
  email: 'sdn03kebonjeruk@sekolah.id',
  isDemo: true,
  mustResetPin: true,
  createdAt: '2025-07-15T10:00:00Z',
  lastLogin: new Date().toISOString(),
};

import { defaultRealSchoolData } from './realSchoolData';

export const DEFAULT_PRESET_TENANTS: SchoolTenant[] = [
  PRESET_SDN1_MUARA_DUA,
  PRESET_SMPN2_BANDA_ACEH,
  PRESET_SDN03_KEBON_JERUK,
];

// Helper to create tailored initial state for a new or preset school
export function createSchoolStateForTenant(tenant: SchoolTenant, baseType: 'full' | 'blank' = 'full'): AppStateData {
  if (tenant.id === PRESET_SDN1_MUARA_DUA.id) {
    const workers = initialWorkers;
    return {
      school: initialSchoolData,
      rpdItems: initialRpdItems,
      workers: workers,
      stores: initialStores,
      progressWeeks: initialProgressWeeks,
      kwitansiList: [],
      wageReports: [],
      bkbRecords: [],
      manualBkuTransactions: [],
      realSchoolData: defaultRealSchoolData,
    };
  }

  if (tenant.id === PRESET_SMPN2_BANDA_ACEH.id) {
    const smpSchool: SchoolMasterData = {
      ...initialSchoolData,
      namaSekolah: 'SMP NEGERI 2 BANDA ACEH',
      npsn: '10101234',
      alamat: 'Jl. Prof. A. Majid Ibrahim No. 12',
      desa: 'Lampriek',
      kecamatan: 'Kec. Kuta Alam',
      kabKota: 'Kota Banda Aceh',
      provinsi: 'Prov. Aceh',
      dinasPendidikan: 'Dinas Pendidikan dan Kebudayaan Kota Banda Aceh',
      totalAnggaran: 845000000,
      termin1Persen: 70,
      termin2Persen: 30,
      termin1Nilai: 591500000,
      termin2Nilai: 253500000,
      namaKepalaSekolah: 'Dra. Hj. Maryani, M.Pd',
      nipKepalaSekolah: '196805141994122001',
      nomorSkP2SP: '421.3/042/SK-P2SP/2026',
      tanggalSkP2SP: '20 Juli 2026',
      tentangSkP2SP: 'Pembentukan Panitia Pembangunan Satuan Pendidikan (P2SP) SMP Negeri 2 Banda Aceh TA 2026',
      namaKetuaP2SP: 'Drs. H. M. Husen',
      jabatanKetuaP2SP: 'Ketua Komite Sekolah SMPN 2',
      namaSekretaris: 'Cut Mutia, S.Pd',
      nipSekretaris: '198703152011012014',
      jabatanSekretaris: 'Guru Penggerak / Staf Kurikulum',
      namaBendahara: 'M. Faisal, S.E.',
      nipBendahara: '198207192008011009',
      jabatanBendahara: 'Bendahara Keuangan Sekolah',
      namaBank: 'Bank BSI (Bank Syariah Indonesia)',
      nomorRekening: '711.234.5678',
      namaRekening: 'P2SP SMPN 2 BANDA ACEH',
      kotaTempatBintek: 'Banda Aceh',
    };

    return {
      school: smpSchool,
      rpdItems: initialRpdItems.map((item) => ({
        ...item,
        id: `smp-${item.id}`,
        hargaSatuan: Math.round(item.hargaSatuan * 1.05),
      })),
      workers: initialWorkers.map((w, idx) => ({
        ...w,
        id: `smp-${w.id}`,
        nama: idx === 0 ? 'Kamaruddin (Mandor)' : idx === 1 ? 'Sulaiman' : w.nama,
      })),
      progressWeeks: initialProgressWeeks,
      kwitansiList: [],
      wageReports: [],
      bkbRecords: [],
      manualBkuTransactions: [],
      realSchoolData: defaultRealSchoolData,
    };
  }

  // Generic or custom real school
  const isRealSchool = !tenant.isDemo;

  const customSchool: SchoolMasterData = {
    ...initialSchoolData,
    namaSekolah: tenant.namaSekolah || 'NAMA SEKOLAH',
    npsn: tenant.npsn || '',
    alamat: tenant.kabKota ? `Jl. Pendidikan, ${tenant.kabKota}` : '',
    desa: '',
    kecamatan: '',
    kabKota: tenant.kabKota || '',
    provinsi: tenant.provinsi || '',
    dinasPendidikan: tenant.kabKota ? `Dinas Pendidikan dan Kebudayaan ${tenant.kabKota}` : '',
    totalAnggaran: isRealSchool ? 0 : 750000000,
    termin1Persen: 70,
    termin2Persen: 30,
    termin1Nilai: 0,
    termin2Nilai: 0,
    namaKepalaSekolah: '',
    nipKepalaSekolah: '',
    nomorSkP2SP: '',
    tanggalSkP2SP: '',
    tentangSkP2SP: tenant.namaSekolah ? `Pembentukan Panitia Pembangunan Satuan Pendidikan (P2SP) ${tenant.namaSekolah}` : '',
    namaKetuaP2SP: '',
    jabatanKetuaP2SP: 'Ketua Komite Sekolah',
    namaSekretaris: '',
    nipSekretaris: '',
    jabatanSekretaris: 'Sekretaris P2SP',
    namaBendahara: '',
    nipBendahara: '',
    jabatanBendahara: 'Bendahara P2SP',
    namaBank: '',
    nomorRekening: '',
    namaRekening: tenant.namaSekolah ? `P2SP ${tenant.namaSekolah}` : '',
    kotaTempatBintek: (tenant.kabKota || '').replace('Kota ', '').replace('Kab. ', ''),
  };

  const cleanProgressWeeks = initialProgressWeeks.map((pw) => ({
    ...pw,
    bobotRealisasi: 0,
    deviasi: 0,
    divisions: (pw.divisions || []).map((d) => ({
      ...d,
      prestasiMingguLalu: 0,
      prestasiMingguIni: 0,
      prestasiSdMingguIni: 0,
    })),
  }));

  const schoolRealData: RealSchoolData = {
    ...defaultRealSchoolData,
    namaSekolah: customSchool.namaSekolah,
    kabKota: customSchool.kabKota,
    provinsi: customSchool.provinsi,
    lokasi: customSchool.lokasi,
  };

  if (baseType === 'blank') {
    return {
      school: customSchool,
      rpdItems: [],
      workers: initialWorkers,
      stores: initialStores,
      progressWeeks: cleanProgressWeeks,
      kwitansiList: [],
      wageReports: [],
      bkbRecords: [],
      manualBkuTransactions: [],
      deletedBkuIds: [],
      realSchoolData: schoolRealData,
    };
  }

  // Pre-seed with revitalisasi standard template for easy customization
  return {
    school: customSchool,
    rpdItems: initialRpdItems,
    workers: initialWorkers,
    stores: initialStores,
    progressWeeks: cleanProgressWeeks,
    kwitansiList: [],
    wageReports: [],
    bkbRecords: [],
    manualBkuTransactions: [],
    realSchoolData: schoolRealData,
  };
}
