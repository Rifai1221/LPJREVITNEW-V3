/**
 * Auth Helper for LPJ Revitalisasi Sekolah
 * Secure Multi-Role Authentication:
 * 1. Firebase Auth (Email/Password or Google) as Primary Identity
 * 2. School Security PIN as Second Step, stored strictly as salted SHA-256 hash in Firestore school document.
 * 3. NO plain-text localStorage PIN, NO fallback to "123456", NO fallback to "4 digit terakhir NPSN".
 * 4. First-time login requires setting a new secure PIN.
 */

import { hashPin, verifyPinHash, generateSalt } from './cryptoHelper';

export type UserRole = 'BENDAHARA' | 'KEPALA_SEKOLAH' | 'TIM_TEKNIS' | 'FASILITATOR';

export interface LocalUserSession {
  authMode: 'mandiri' | 'google';
  role: UserRole;
  roleLabel: string;
  officerName: string;
  schoolId: string;
  schoolName: string;
  loginAt: string;
  uid?: string;
  email?: string;
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
    desc: 'Monitoring realisasi fisik & keuangan, verifikasi dokumen, serta rekapitulasi laporan (Baca Saja)',
    icon: '📋',
  },
];

const LOCAL_SESSION_STORAGE_KEY = 'LPJ_LOCAL_USER_SESSION';

/**
 * Checks if a school has already configured its secure salted hash PIN.
 * If false, user MUST set a new PIN upon first login.
 */
export function isSchoolPinConfigured(school?: {
  pinHash?: string;
  pinSalt?: string;
  mustResetPin?: boolean;
} | null): boolean {
  if (!school) return false;
  if (school.mustResetPin) return false;
  return Boolean(school.pinHash && school.pinSalt && school.pinHash.length >= 32);
}

/**
 * Verifies entered PIN against the school's cryptographic salted hash.
 * Completely eliminates '123456' and '4-digit NPSN' insecure fallbacks.
 */
export async function verifySchoolPinSecure(
  enteredPin: string,
  school?: {
    pinHash?: string;
    pinSalt?: string;
    mustResetPin?: boolean;
  } | null
): Promise<{ isValid: boolean; mustResetPin?: boolean; reason?: string }> {
  const cleanPin = (enteredPin || '').trim();
  if (!cleanPin) {
    return { isValid: false, reason: 'PIN tidak boleh kosong.' };
  }

  if (cleanPin.length < 6) {
    return { isValid: false, reason: 'PIN minimal harus 6 digit angka.' };
  }

  // If school has not configured a hash yet, enforce PIN change immediately
  if (!isSchoolPinConfigured(school)) {
    return {
      isValid: false,
      mustResetPin: true,
      reason: 'Sekolah belum memiliki PIN aman terdaftar. Wajib membuat PIN baru pada login pertama.',
    };
  }

  const isMatch = await verifyPinHash(cleanPin, school!.pinSalt!, school!.pinHash!);
  if (!isMatch) {
    return {
      isValid: false,
      reason: 'PIN yang dimasukkan salah. Silakan periksa kembali atau hubungi Bendahara/Kepala Sekolah.',
    };
  }

  return { isValid: true };
}

/**
 * Creates salted hash object for storing in Firestore school document
 */
export async function createSaltedPinRecord(newPin: string): Promise<{
  pinHash: string;
  pinSalt: string;
  mustResetPin: boolean;
}> {
  const salt = generateSalt(16);
  const { hash } = await hashPin(newPin.trim(), salt);
  return {
    pinHash: hash,
    pinSalt: salt,
    mustResetPin: false,
  };
}

/**
 * Legacy stub kept for backward compatibility (purges plain text storage)
 */
export function setSchoolPin(schoolId: string, newPin: string, npsn?: string): void {
  // Security Hardening: Never store plain text PINs in localStorage
  try {
    const keysToRemove = [
      `LPJ_SCHOOL_PIN_${schoolId}`,
      `LPJ_SCHOOL_PIN_${npsn}`,
      'LPJ_ACTIVE_SCHOOL_PIN',
    ];
    keysToRemove.forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {}
    });
  } catch {}
}

/**
 * Legacy stub kept for component references (always redirects to secure validation)
 */
export function getSchoolPin(schoolId: string, npsn?: string, customDefault?: string): string {
  return '';
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
