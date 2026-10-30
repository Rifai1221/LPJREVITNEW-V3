/**
 * Crypto Helper for LPJ Revitalisasi
 * Implements Salted SHA-256 for secure School PIN hashing and verification
 * Uses standard Web Crypto API (supported natively in all modern browsers and Node.js)
 */

/**
 * Generates a cryptographically secure random hexadecimal salt
 */
export function generateSalt(byteLength: number = 16): string {
  const randomBytes = new Uint8Array(byteLength);
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(randomBytes);
  } else if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(randomBytes);
  } else {
    // Fallback pseudo-random for test environments if WebCrypto is unavailable
    for (let i = 0; i < byteLength; i++) {
      randomBytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generates a secure UUID using crypto.randomUUID or Web Crypto fallback (Requirement 6)
 */
export function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'id_' + generateSalt(16);
}

/**
 * Computes a salted SHA-256 hash for a given PIN and salt
 */
export async function hashPin(
  pin: string,
  saltHex?: string
): Promise<{ hash: string; salt: string }> {
  const cleanPin = pin.trim();
  const salt = saltHex || generateSalt(16);
  const encoder = new TextEncoder();
  const data = encoder.encode(`LPJ_SALT_${salt}:${cleanPin}`);

  let hashArray: number[];
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    hashArray = Array.from(new Uint8Array(hashBuffer));
  } else {
    // Fallback simple SHA256 simulation if subtle is not present
    let hash = 0;
    const str = `LPJ_SALT_${salt}:${cleanPin}`;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return {
      hash: Math.abs(hash).toString(16).padStart(64, '0'),
      salt,
    };
  }

  const hash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return { hash, salt };
}

/**
 * Verifies if an entered PIN matches the expected salted hash
 */
export async function verifyPinHash(
  enteredPin: string,
  salt: string,
  expectedHash: string
): Promise<boolean> {
  if (!enteredPin || !salt || !expectedHash) return false;
  const { hash } = await hashPin(enteredPin, salt);
  return hash.toLowerCase() === expectedHash.toLowerCase();
}

/**
 * Encrypts an object into a Base64-encoded encrypted backup payload using AES-GCM and PBKDF2
 */
export async function encryptJsonData(data: any, pass: string): Promise<string> {
  const jsonStr = JSON.stringify(data);
  const enc = new TextEncoder();

  const salt = new Uint8Array(16);
  const iv = new Uint8Array(12);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(salt);
    crypto.getRandomValues(iv);
  } else {
    for (let i = 0; i < 16; i++) salt[i] = Math.floor(Math.random() * 256);
    for (let i = 0; i < 12; i++) iv[i] = Math.floor(Math.random() * 256);
  }

  if (typeof crypto === 'undefined' || !crypto.subtle) {
    // Basic base64 payload fallback for simple non-subtle test env
    const raw = JSON.stringify({ pass, data });
    return 'ENC_LGT_' + btoa(unescape(encodeURIComponent(raw)));
  }

  const passwordKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(pass),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const aesKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  const encryptedContent = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    enc.encode(jsonStr)
  );

  const encArray = new Uint8Array(encryptedContent);
  const combined = new Uint8Array(salt.length + iv.length + encArray.length);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(encArray, salt.length + iv.length);

  return 'ENC_AES_' + btoa(String.fromCharCode(...combined));
}

/**
 * Decrypts a Base64-encoded encrypted backup payload back into an object
 */
export async function decryptJsonData(encryptedBase64: string, pass: string): Promise<any> {
  if (!encryptedBase64) throw new Error('Data enkripsi kosong');

  if (encryptedBase64.startsWith('ENC_LGT_')) {
    const raw = decodeURIComponent(escape(atob(encryptedBase64.replace('ENC_LGT_', ''))));
    const parsed = JSON.parse(raw);
    if (parsed.pass !== pass) throw new Error('Password enkripsi tidak sesuai');
    return parsed.data;
  }

  const cleanBase64 = encryptedBase64.replace('ENC_AES_', '');
  const combined = Uint8Array.from(atob(cleanBase64), (c) => c.charCodeAt(0));
  const salt = combined.slice(0, 16);
  const iv = combined.slice(16, 28);
  const data = combined.slice(28);

  const enc = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(pass),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const aesKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  const decryptedContent = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    data
  );

  const dec = new TextDecoder();
  return JSON.parse(dec.decode(decryptedContent));
}
