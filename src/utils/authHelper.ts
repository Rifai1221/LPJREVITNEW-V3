/**
 * Auth Helper for LPJ Revitalisasi Sekolah
 * Dual Login Support:
 * 1. Mode Mandiri (PIN Keamanan Sekolah + Peran Tim Revitalisasi) - 100% Bebas Error OAuth & Tanpa Hambatan
 * 2. Mode Google OAuth (Sinkronisasi Cloud Spreadsheet ke Google Drive Pribadi)
 */

export type UserRole = 'BENDAHARA' | 'KEPALA_SEKOLAH' | 'TIM_TEKNIS' | 'FASILITATOR';

export interface LocalUserSession {
  authMode: 'mandiri' | 'google';
  role: UserRole;
  roleLabel: string;
  officerName: string;
  schoolId: string;
  schoolName: string;
  loginAt: string;
}

export const USER_ROLES: { id: UserRole; title: string; desc: string; icon: string }[] = [
  {
    id: 'BENDAHARA',
    title: 'Bendahara Revitalisasi',
    desc: 'Pengelolaan penuh pembukuan BKU, BKT, BKB, Kwitansi, Bon Toko, Faktur, Pajak & Upah',
    icon: '💼',
  },
  {
    id: 'KEPALA_SEKOLAH',
    title: 'Kepala Sekolah (Penanggung Jawab)',
    desc: 'Otorisasi dokumen, pemantauan realisasi anggaran, dan pengesahan laporan resmi LPJ',
    icon: '👑',
  },
  {
    id: 'TIM_TEKNIS',
    title: 'Ketua Tim Teknis / Pelaksana',
    desc: 'Opname fisik mingguan, absensi & rekapitulasi upah tukang, dan pemesanan material',
    icon: '🛠️',
  },
  {
    id: 'FASILITATOR',
    title: 'Fasilitator / Pengawas / Tamu',
    desc: 'Monitoring realisasi fisik & keuangan, verifikasi dokumen, serta rekapitulasi laporan',
    icon: '📋',
  },
];

const LOCAL_SESSION_STORAGE_KEY = 'LPJ_LOCAL_USER_SESSION';
const SCHOOL_PIN_PREFIX = 'LPJ_SCHOOL_PIN_';

/**
 * Mendapatkan PIN sekolah yang tersimpan di memori lokal atau fallback default
 * Default universal: '123456'
 */
export function getSchoolPin(schoolId: string, customDefault?: string): string {
  try {
    const saved = localStorage.getItem(`${SCHOOL_PIN_PREFIX}${schoolId}`);
    if (saved && saved.trim()) return saved.trim();
  } catch {}
  return customDefault || '123456';
}

/**
 * Menyimpan / memperbarui PIN keamanan sekolah
 */
export function setSchoolPin(schoolId: string, newPin: string): void {
  try {
    const clean = newPin.trim();
    if (clean) {
      localStorage.setItem(`${SCHOOL_PIN_PREFIX}${schoolId}`, clean);
    }
  } catch (err) {
    console.error('Failed to save school pin:', err);
  }
}

/**
 * Memverifikasi kecocokan PIN yang diinput pengguna.
 * Menerima:
 * 1. PIN tersimpan sekolah
 * 2. Master fallback PIN: '123456'
 * 3. 4 digit terakhir NPSN sekolah (opsi darurat/alternatif)
 */
export function verifySchoolPin(
  schoolId: string,
  enteredPin: string,
  npsn?: string,
  customDefault?: string
): { isValid: boolean; reason?: string } {
  const trimmed = (enteredPin || '').trim();
  if (!trimmed) {
    return { isValid: false, reason: 'PIN tidak boleh kosong' };
  }

  const savedPin = getSchoolPin(schoolId, customDefault);

  // 1. Cek PIN tersimpan
  if (trimmed === savedPin) {
    return { isValid: true };
  }

  // 2. Master Universal Fallback '123456'
  if (trimmed === '123456') {
    return { isValid: true };
  }

  // 3. Fallback 4 digit terakhir NPSN
  if (npsn && npsn.trim().length >= 4) {
    const last4 = npsn.trim().slice(-4);
    if (trimmed === last4) {
      return { isValid: true };
    }
  }

  return {
    isValid: false,
    reason: `PIN tidak cocok. Gunakan PIN default 123456 atau 4 digit terakhir NPSN (${npsn ? npsn.slice(-4) : '...'}).`,
  };
}

/**
 * Ambil sesi pengguna lokal aktif
 */
export function getLocalUserSession(): LocalUserSession | null {
  try {
    const raw = localStorage.getItem(LOCAL_SESSION_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {}
  return null;
}

/**
 * Simpan sesi login lokal aktif
 */
export function setLocalUserSession(session: LocalUserSession): void {
  try {
    localStorage.setItem(LOCAL_SESSION_STORAGE_KEY, JSON.stringify(session));
    localStorage.setItem('LPJ_USER_SESSION_ACTIVE', 'true');
    localStorage.setItem('LPJ_AUTH_MODE', session.authMode);
    localStorage.setItem('LPJ_OFFICER_ROLE', session.role);
    localStorage.setItem('LPJ_OFFICER_NAME', session.officerName);
  } catch (err) {
    console.error('Failed to save local user session:', err);
  }
}

/**
 * Hapus sesi login lokal
 */
export function clearLocalUserSession(): void {
  try {
    localStorage.removeItem(LOCAL_SESSION_STORAGE_KEY);
    localStorage.removeItem('LPJ_USER_SESSION_ACTIVE');
    localStorage.removeItem('LPJ_AUTH_MODE');
    localStorage.removeItem('LPJ_OFFICER_ROLE');
    localStorage.removeItem('LPJ_OFFICER_NAME');
  } catch (err) {
    console.error('Failed to clear local user session:', err);
  }
}
