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
export function getSchoolPin(schoolId: string, npsn?: string, customDefault?: string): string {
  try {
    const cleanId = (schoolId || '').trim();
    const cleanNpsn = (npsn || '').trim();

    // 1. Cek by exact schoolId
    if (cleanId) {
      const savedById = localStorage.getItem(`${SCHOOL_PIN_PREFIX}${cleanId}`);
      if (savedById && savedById.trim()) return savedById.trim();

      // Cek variasi prefix sch_
      const stripped = cleanId.replace(/^sch_/, '');
      const savedByStripped = localStorage.getItem(`${SCHOOL_PIN_PREFIX}${stripped}`);
      if (savedByStripped && savedByStripped.trim()) return savedByStripped.trim();

      const withSch = `sch_${stripped}`;
      const savedByWithSch = localStorage.getItem(`${SCHOOL_PIN_PREFIX}${withSch}`);
      if (savedByWithSch && savedByWithSch.trim()) return savedByWithSch.trim();
    }

    // 2. Cek by npsn
    if (cleanNpsn) {
      const savedByNpsn = localStorage.getItem(`${SCHOOL_PIN_PREFIX}${cleanNpsn}`);
      if (savedByNpsn && savedByNpsn.trim()) return savedByNpsn.trim();

      const savedBySchNpsn = localStorage.getItem(`${SCHOOL_PIN_PREFIX}sch_${cleanNpsn}`);
      if (savedBySchNpsn && savedBySchNpsn.trim()) return savedBySchNpsn.trim();
    }

    // 3. Cek apakah ada di cache tenant Firestore/IndexedDB
    if (cleanId) {
      const tenantCache = localStorage.getItem(`LPJ_TENANT_CACHE_${cleanId}`);
      if (tenantCache) {
        const parsed = JSON.parse(tenantCache);
        if (parsed?.school?.pinAkses && String(parsed.school.pinAkses).trim()) {
          return String(parsed.school.pinAkses).trim();
        }
      }
    }
  } catch {}
  return customDefault || '123456';
}

/**
 * Menyimpan / memperbarui PIN keamanan sekolah ke semua identitas terkait
 */
export function setSchoolPin(schoolId: string, newPin: string, npsn?: string): void {
  try {
    const clean = newPin.trim();
    if (!clean) return;

    const cleanId = (schoolId || '').trim();
    const cleanNpsn = (npsn || '').trim();

    // 1. Simpan ke schoolId dan variasi sch_
    if (cleanId) {
      localStorage.setItem(`${SCHOOL_PIN_PREFIX}${cleanId}`, clean);
      const stripped = cleanId.replace(/^sch_/, '');
      localStorage.setItem(`${SCHOOL_PIN_PREFIX}${stripped}`, clean);
      localStorage.setItem(`${SCHOOL_PIN_PREFIX}sch_${stripped}`, clean);
    }

    // 2. Simpan ke npsn dan variasi sch_
    if (cleanNpsn) {
      localStorage.setItem(`${SCHOOL_PIN_PREFIX}${cleanNpsn}`, clean);
      localStorage.setItem(`${SCHOOL_PIN_PREFIX}sch_${cleanNpsn}`, clean);
    }

    // 3. Simpan ke global active pin
    localStorage.setItem('LPJ_ACTIVE_SCHOOL_PIN', clean);
  } catch (err) {
    console.error('Failed to save school pin:', err);
  }
}

/**
 * Memverifikasi kecocokan PIN yang diinput pengguna.
 * Menerima:
 * 1. PIN kustom tersimpan sekolah (diperbarui dari Data Master)
 * 2. 4 digit terakhir NPSN sekolah (opsi darurat/alternatif)
 * 3. Master fallback PIN: '123456' (jika belum diubah)
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

  const savedPin = getSchoolPin(schoolId, npsn, customDefault);

  // 1. Cek kecocokan dengan PIN kustom yang telah disimpan
  if (trimmed === savedPin) {
    return { isValid: true };
  }

  // 2. Cek apakah cocok dengan PIN kustom di cache tenant
  try {
    const cacheRaw = localStorage.getItem(`LPJ_TENANT_CACHE_${schoolId}`);
    if (cacheRaw) {
      const parsed = JSON.parse(cacheRaw);
      if (parsed?.school?.pinAkses && String(parsed.school.pinAkses).trim() === trimmed) {
        return { isValid: true };
      }
    }
  } catch {}

  // 3. Fallback darurat: 4 digit terakhir NPSN
  if (npsn && npsn.trim().length >= 4) {
    const last4 = npsn.trim().slice(-4);
    if (trimmed === last4) {
      return { isValid: true };
    }
  }

  // 4. Default 123456 (hanya jika pengguna belum mengubah PIN kustom)
  if (trimmed === '123456' && savedPin === '123456') {
    return { isValid: true };
  }

  // Jika pengguna memasukkan 123456 tetapi PIN telah diganti
  if (trimmed === '123456' && savedPin !== '123456') {
    return {
      isValid: false,
      reason: 'PIN bawaan 123456 sudah diubah ke PIN kustom baru. Masukkan PIN baru yang telah disimpan.',
    };
  }

  return {
    isValid: false,
    reason: `PIN tidak cocok. Silakan masukkan PIN baru yang telah diatur di Data Master Sekolah.`,
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
