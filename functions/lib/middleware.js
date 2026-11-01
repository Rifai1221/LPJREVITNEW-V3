import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
if (getApps().length === 0) {
    initializeApp();
}
export const db = getFirestore();
export const FUNCTION_REGION = 'asia-southeast2';
/**
 * Checks if App Check enforcement is toggled via environment variable
 */
export function isAppCheckEnforced() {
    return process.env.ENFORCE_APPCHECK === 'true';
}
/**
 * Extracts and asserts authenticated user UID from CallableRequest
 */
export function requireAuth(request) {
    if (!request.auth || !request.auth.uid) {
        throw new HttpsError('unauthenticated', 'Pengguna wajib login terlebih dahulu untuk mengakses operasi ini.');
    }
    return {
        uid: request.auth.uid,
        email: request.auth.token.email,
        name: request.auth.token.name,
    };
}
/**
 * Verifies if user has admin privileges defined in ADMIN_UIDS env var
 */
export function requireAdmin(request) {
    const { uid, email } = requireAuth(request);
    const adminUids = (process.env.ADMIN_UIDS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    const isUidAdmin = adminUids.includes(uid);
    const isEmailAdmin = email ? adminUids.includes(email.toLowerCase()) : false;
    if (!isUidAdmin && !isEmailAdmin) {
        throw new HttpsError('permission-denied', 'Akses ditolak: Operasi migrasi sistem hanya dapat dijalankan oleh Administrator (ADMIN_UIDS).');
    }
    return { uid };
}
/**
 * In-memory sliding window rate limiter per UID
 */
const rateLimitMap = new Map();
export function checkRateLimit(uid, maxRequests = 20, windowMs = 60000) {
    const now = Date.now();
    const timestamps = (rateLimitMap.get(uid) || []).filter((t) => now - t < windowMs);
    if (timestamps.length >= maxRequests) {
        throw new HttpsError('resource-exhausted', 'Batas pencarian tercapai. Silakan tunggu beberapa saat sebelum mencoba lagi.');
    }
    timestamps.push(now);
    rateLimitMap.set(uid, timestamps);
}
/**
 * Helper to check if caller is BENDAHARA of a specific school
 */
export async function assertBendahara(schoolId, uid) {
    const memberSnap = await db.doc(`schools/${schoolId}/members/${uid}`).get();
    if (!memberSnap.exists || memberSnap.data()?.role !== 'BENDAHARA') {
        throw new HttpsError('permission-denied', 'Operasi ini hanya diizinkan untuk anggota dengan peran BENDAHARA pada sekolah bersangkutan.');
    }
}
//# sourceMappingURL=middleware.js.map