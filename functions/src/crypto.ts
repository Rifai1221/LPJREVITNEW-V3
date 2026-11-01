import crypto from 'node:crypto';
import type { SchoolSecurityRecord } from './types.js';

/**
 * Generates a cryptographically secure random hexadecimal salt
 */
export function generateSalt(byteLength: number = 16): string {
  return crypto.randomBytes(byteLength).toString('hex');
}

/**
 * Computes scrypt hash for PIN with salt (Node.js crypto scrypt)
 */
export function hashPinScrypt(pin: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(pin.trim(), salt, 64, { N: 16384, r: 8, p: 1 }, (err: Error | null, derivedKey: Buffer) => {
      if (err) return reject(err);
      resolve(derivedKey.toString('hex'));
    });
  });
}

/**
 * Computes legacy SHA-256 hash matching frontend cryptoHelper:
 * string: `LPJ_SALT_${salt}:${pin}`
 */
export function hashPinLegacy(pin: string, salt: string): string {
  return crypto.createHash('sha256').update(`LPJ_SALT_${salt}:${pin.trim()}`).digest('hex');
}

/**
 * Constant-time comparison to prevent timing attacks
 */
export function verifyPinConstantTime(aHex: string, bHex: string): boolean {
  try {
    const a = Buffer.from(aHex.toLowerCase(), 'hex');
    const b = Buffer.from(bHex.toLowerCase(), 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Verifies entered PIN against stored security credentials.
 * Returns { isValid: boolean, isLegacy: boolean }
 */
export async function verifySchoolPin(
  enteredPin: string,
  security: SchoolSecurityRecord
): Promise<{ isValid: boolean; isLegacy: boolean }> {
  const isLegacy = !security.algo || security.algo === 'sha256-legacy';

  if (isLegacy) {
    const computedLegacy = hashPinLegacy(enteredPin, security.pinSalt);
    const isValid = verifyPinConstantTime(computedLegacy, security.pinHash);
    return { isValid, isLegacy: true };
  }

  // scrypt
  const computedScrypt = await hashPinScrypt(enteredPin, security.pinSalt);
  const isValid = verifyPinConstantTime(computedScrypt, security.pinHash);
  return { isValid, isLegacy: false };
}
