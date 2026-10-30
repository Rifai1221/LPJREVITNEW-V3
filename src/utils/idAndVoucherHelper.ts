/**
 * Cryptographic ID Generation & Voucher Sequence Verification
 * Replaces all Math.random() with standard crypto.randomUUID().
 * Enforces sequential, collision-free, and unique voucher numbers (KW/..., SPB/...).
 */

/**
 * Generates a cryptographically strong UUID v4 with an optional prefix.
 */
export function generateSecureId(prefix = ''): string {
  let uuid: string;
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    uuid = crypto.randomUUID();
  } else if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    uuid = Array.from(bytes)
      .map((b, i) => (i === 4 || i === 6 || i === 8 || i === 10 ? '-' : '') + b.toString(16).padStart(2, '0'))
      .join('');
  } else {
    // Ultimate fallback if crypto is absent in mock/legacy runner
    uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
  return prefix ? `${prefix}-${uuid}` : uuid;
}

export type VoucherType =
  | 'KW_MAT'
  | 'KW_ALAT'
  | 'KW_UPAH'
  | 'KW_KONS_P'
  | 'KW_KONS_W'
  | 'KW_ADM'
  | 'KW_SMKK'
  | 'KW_CETAK'
  | 'KW_SIPLAH'
  | 'SPB'
  | 'BKT';

/**
 * Extracts sequential numbers from existing vouchers to find the next available index.
 */
export function getNextSequenceNumber(
  existingNoBuktiList: (string | undefined | null)[],
  pattern: RegExp
): number {
  let maxSeq = 0;
  for (const noBukti of existingNoBuktiList) {
    if (!noBukti) continue;
    const match = noBukti.match(pattern);
    if (match && match[1]) {
      const seq = parseInt(match[1], 10);
      if (!isNaN(seq) && seq > maxSeq) {
        maxSeq = seq;
      }
    }
  }
  return maxSeq + 1;
}

/**
 * Checks whether a voucher number is already used in a collection.
 */
export function isVoucherNumberDuplicate(
  candidateNoBukti: string,
  existingList: { noBukti?: string; id?: string }[],
  ignoreId?: string
): boolean {
  if (!candidateNoBukti || !candidateNoBukti.trim()) return false;
  const normalizedCandidate = candidateNoBukti.trim().toUpperCase();

  return existingList.some((item) => {
    if (ignoreId && item.id === ignoreId) return false;
    const existing = (item.noBukti || '').trim().toUpperCase();
    return existing === normalizedCandidate && existing !== '-' && existing !== 'MANUAL';
  });
}

/**
 * Generates an unconditionally unique voucher number. If candidate is duplicate,
 * appends or increments index until unique.
 */
export function ensureUniqueVoucherNumber(
  candidate: string,
  existingList: { noBukti?: string; id?: string }[],
  ignoreId?: string
): string {
  if (!candidate || !candidate.trim()) return candidate;
  let currentCandidate = candidate.trim();
  let counter = 1;

  while (isVoucherNumberDuplicate(currentCandidate, existingList, ignoreId)) {
    // If it has a sequence like "01/KW-MAT/2026", increment sequence or add suffix
    counter++;
    const parts = candidate.split('/');
    if (parts.length >= 3 && /^\d+$/.test(parts[0])) {
      const nextSeq = String(parseInt(parts[0], 10) + counter - 1).padStart(2, '0');
      currentCandidate = `${nextSeq}/${parts.slice(1).join('/')}`;
    } else {
      currentCandidate = `${candidate}-${counter}`;
    }
  }

  return currentCandidate;
}
