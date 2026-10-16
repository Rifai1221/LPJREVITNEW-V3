import { WorkerItem, WeeklyAttendance } from '../types';
import { getAhspWageRateForRole } from './divisionHelper';

/**
 * Standard official 7-person Core Borongan Team preset:
 * 1 Mandor / Ketua Kelompok
 * 1 Kepala Tukang (KT)
 * 2 Tukang Batu & Konstruksi (T)
 * 3 Pekerja Lapangan / Laden (P)
 */
export const DEFAULT_BORONGAN_CORE_TEAM: WorkerItem[] = [
  {
    id: 'w-bor-mandor-1',
    nama: 'Budiman',
    jenisKelamin: 'L',
    domisili: 'Dalam Desa',
    peran: 'MANDOR',
    peranLabel: 'Ketua Kelompok / Mandor',
    upahHarian: 199782,
    kategoriPenugasan: 'BORONGAN',
  },
  {
    id: 'w-bor-kt-1',
    nama: 'Sahimi',
    jenisKelamin: 'L',
    domisili: 'Dalam Desa',
    peran: 'KT',
    peranLabel: 'Kepala Tukang',
    upahHarian: 199782,
    kategoriPenugasan: 'BORONGAN',
  },
  {
    id: 'w-bor-t-1',
    nama: 'Abdullah AS',
    jenisKelamin: 'L',
    domisili: 'Dalam Desa',
    peran: 'T',
    peranLabel: 'Tukang Batu & Konstruksi',
    upahHarian: 183834,
    kategoriPenugasan: 'BORONGAN',
  },
  {
    id: 'w-bor-t-2',
    nama: 'Muhammad Diah',
    jenisKelamin: 'L',
    domisili: 'Dalam Desa',
    peran: 'T',
    peranLabel: 'Tukang Kayu & Atap',
    upahHarian: 183834,
    kategoriPenugasan: 'BORONGAN',
  },
  {
    id: 'w-bor-p-1',
    nama: 'Dedi Kurniawan',
    jenisKelamin: 'L',
    domisili: 'Dalam Desa',
    peran: 'P',
    peranLabel: 'Pekerja Lapangan / Laden',
    upahHarian: 146909,
    kategoriPenugasan: 'BORONGAN',
  },
  {
    id: 'w-bor-p-2',
    nama: 'Eko Prasetyo',
    jenisKelamin: 'L',
    domisili: 'Dalam Desa',
    peran: 'P',
    peranLabel: 'Pekerja Lapangan / Laden',
    upahHarian: 146909,
    kategoriPenugasan: 'BORONGAN',
  },
  {
    id: 'w-bor-p-3',
    nama: 'Hadi Saputra',
    jenisKelamin: 'L',
    domisili: 'Dalam Desa',
    peran: 'P',
    peranLabel: 'Pekerja Lapangan / Laden',
    upahHarian: 146909,
    kategoriPenugasan: 'BORONGAN',
  },
];

/**
 * Build a strictly locked, balanced Borongan team attendance:
 * - Locks ONLY workers with `kategoriPenugasan === 'BORONGAN'` (explicitly ignores Mode Harian workers)
 * - Guarantees 1 Mandor, 1 Kepala Tukang, Tukang, and Pekerja are always present
 * - Distributes wages proportionately based on AHSP tariff coefficients
 * - Ensures 100% precision (Selisih Rp 0) with target budget
 */
export function getBalancedBoronganAttendance(
  targetBudget: number,
  masterWorkers: WorkerItem[],
  ahspMap: Record<string, number> = {}
): WeeklyAttendance[] {
  const budget = targetBudget > 0 ? targetBudget : 2740737;

  // 1. Ambil HANYA worker dari Master Data yang ber-kategori 'BORONGAN' secara ketat
  const boronganMasterList = (masterWorkers || []).filter(
    (w) => w.kategoriPenugasan === 'BORONGAN'
  );

  // Jika di masterWorkers belum ada pekerja kategori BORONGAN, pakai standardCoreBorongan
  let activeTeam: WorkerItem[] =
    boronganMasterList.length >= 4
      ? [...boronganMasterList]
      : DEFAULT_BORONGAN_CORE_TEAM.map((w) => ({
          ...w,
          upahHarian: getAhspWageRateForRole(w.peran, w.peranLabel, ahspMap, w.upahHarian),
        }));

  // Update tarif AHSP masing-masing worker
  activeTeam = activeTeam.map((w) => ({
    ...w,
    upahHarian: getAhspWageRateForRole(w.peran, w.peranLabel, ahspMap, w.upahHarian),
  }));

  // Pastikan keempat peran (MANDOR, KT, Tukang, Pekerja) selalu ada
  const hasMandor = activeTeam.some(
    (w) => w.peran === 'MANDOR' || (w.peranLabel || '').toLowerCase().includes('mandor')
  );
  const hasKt = activeTeam.some(
    (w) => w.peran === 'KT' || (w.peranLabel || '').toLowerCase().includes('kepala tukang')
  );
  const hasTukang = activeTeam.some(
    (w) =>
      w.peran === 'T' ||
      w.peran.startsWith('T_') ||
      (w.peranLabel || '').toLowerCase().includes('tukang')
  );
  const hasPekerja = activeTeam.some(
    (w) =>
      w.peran === 'P' ||
      (w.peranLabel || '').toLowerCase().includes('pekerja') ||
      (w.peranLabel || '').toLowerCase().includes('laden')
  );

  if (!hasMandor) {
    activeTeam.unshift({
      ...DEFAULT_BORONGAN_CORE_TEAM[0],
      upahHarian: getAhspWageRateForRole('MANDOR', 'Mandor', ahspMap, 199782),
    });
  }

  if (!hasKt) {
    activeTeam.splice(1, 0, {
      ...DEFAULT_BORONGAN_CORE_TEAM[1],
      upahHarian: getAhspWageRateForRole('KT', 'Kepala Tukang', ahspMap, 199782),
    });
  }

  if (!hasTukang) {
    activeTeam.push(
      {
        ...DEFAULT_BORONGAN_CORE_TEAM[2],
        upahHarian: getAhspWageRateForRole('T', 'Tukang', ahspMap, 183834),
      },
      {
        ...DEFAULT_BORONGAN_CORE_TEAM[3],
        upahHarian: getAhspWageRateForRole('T', 'Tukang', ahspMap, 183834),
      }
    );
  }

  if (!hasPekerja) {
    activeTeam.push(
      {
        ...DEFAULT_BORONGAN_CORE_TEAM[4],
        upahHarian: getAhspWageRateForRole('P', 'Pekerja', ahspMap, 146909),
      },
      {
        ...DEFAULT_BORONGAN_CORE_TEAM[5],
        upahHarian: getAhspWageRateForRole('P', 'Pekerja', ahspMap, 146909),
      },
      {
        ...DEFAULT_BORONGAN_CORE_TEAM[6],
        upahHarian: getAhspWageRateForRole('P', 'Pekerja', ahspMap, 146909),
      }
    );
  }

  // Jika pagu sangat besar (> 9 juta / pekerjaan berat), tambahkan pekerja ekstra agar proporsional
  if (budget > 9000000 && activeTeam.length < 9) {
    activeTeam.push({
      id: 'w-bor-p-4',
      nama: 'Zulfikar',
      jenisKelamin: 'L',
      domisili: 'Dalam Desa',
      peran: 'P',
      peranLabel: 'Pekerja Lapangan / Laden',
      upahHarian: getAhspWageRateForRole('P', 'Pekerja', ahspMap, 146909),
      kategoriPenugasan: 'BORONGAN',
    });
  }

  // Urutkan hierarki: Mandor (1) -> KT (2) -> Tukang (3) -> Pekerja (4)
  const getRolePriority = (w: WorkerItem) => {
    const p = (w.peran || '').toUpperCase();
    const l = (w.peranLabel || '').toLowerCase();
    if (p === 'MANDOR' || l.includes('mandor')) return 1;
    if (p === 'KT' || l.includes('kepala tukang')) return 2;
    if (p === 'P' || l.includes('pekerja') || l.includes('laden')) return 4;
    return 3; // Tukang
  };

  activeTeam.sort((a, b) => getRolePriority(a) - getRolePriority(b));

  // Perhitungan pembagian proporsional berdasarkan tarif acuan AHSP
  const totalAhspRateSum = activeTeam.reduce((sum, w) => {
    const rate = getAhspWageRateForRole(w.peran, w.peranLabel, ahspMap, w.upahHarian);
    return sum + rate;
  }, 0);

  let allocatedSum = 0;
  const resultAttendance: WeeklyAttendance[] = activeTeam.map((w, idx) => {
    const exactRate = getAhspWageRateForRole(w.peran, w.peranLabel, ahspMap, w.upahHarian);
    const assignedTotal = Math.round((budget * exactRate) / (totalAhspRateSum || 1));
    allocatedSum += assignedTotal;

    const roleName = idx === 0 ? 'MANDOR' : w.peran;
    const roleLabel =
      idx === 0
        ? 'Ketua Kelompok / Mandor'
        : w.peranLabel ||
          (w.peran === 'P'
            ? 'Pekerja Lapangan / Laden'
            : w.peran === 'KT'
            ? 'Kepala Tukang'
            : 'Tukang');

    return {
      workerId: w.id,
      nama: w.nama,
      jenisKelamin: w.jenisKelamin,
      domisili: w.domisili || 'Dalam Desa',
      peran: roleName,
      peranLabel: roleLabel,
      days: [1, 1, 1, 1, 0, 1, 1],
      hok: 6,
      upahHarian: exactRate,
      totalUpah: assignedTotal,
    };
  });

  // Sesuaikan selisih pembulatan rupiah pada pekerja terakhir agar 100% klop (Selisih Rp 0)
  const diff = budget - allocatedSum;
  if (diff !== 0 && resultAttendance.length > 0) {
    const lastIdx = resultAttendance.length - 1;
    resultAttendance[lastIdx].totalUpah += diff;
  }

  return resultAttendance;
}
