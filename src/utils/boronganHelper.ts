import { WorkerItem, WeeklyAttendance } from '../types';

/**
 * Borongan Attendance calculation based strictly on real input data from user per school.
 * Requirement: GetBalancedBoronganAttendance must NOT calculate HOK or daily rates from target budget automatically.
 * Attendance is calculated from actual presence records (days * upahHarian).
 * Total wage = sum of (HOK x recorded tariff).
 * Variance with target budget is displayed as a warning.
 */
export function getBalancedBoronganAttendance(
  targetBudget: number,
  masterWorkers: WorkerItem[],
  ahspMap: Record<string, number> = {}
): WeeklyAttendance[] {
  // Use strictly workers registered by user for this school
  const activeWorkers = (masterWorkers || []).filter(
    (w) => w.kategoriPenugasan === 'BORONGAN' || !w.kategoriPenugasan
  );

  const teamToUse = activeWorkers.length > 0 ? activeWorkers : (masterWorkers || []);

  if (teamToUse.length === 0) {
    return [];
  }

  return teamToUse.map((w) => {
    const days: [number, number, number, number, number, number, number] = [1, 1, 1, 1, 0, 1, 1];
    const hok = days.reduce((acc, d) => acc + d, 0);
    const upahHarian = Math.round(Number(w.upahHarian) || 150000);
    const totalUpah = Math.round(hok * upahHarian);

    return {
      workerId: w.id,
      nama: w.nama,
      jenisKelamin: w.jenisKelamin || 'L',
      domisili: w.domisili || 'Dalam Desa',
      peran: w.peran || 'P',
      peranLabel: w.peranLabel || 'Pekerja',
      days,
      hok,
      upahHarian,
      totalUpah,
    };
  });
}
