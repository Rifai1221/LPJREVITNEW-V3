import { KwitansiDocument, BkuTransaction } from '../types';

/**
 * Generates sequential, unique voucher/noBukti numbers per school and per year (Requirement 6)
 */
export function generateNextVoucherNumber(
  existingKwitansi: KwitansiDocument[] = [],
  existingBku: BkuTransaction[] = [],
  prefix: 'KWT' | 'UK' | 'SIPLAH' | 'BKU' = 'KWT',
  yearStr = '2026'
): string {
  const allNoBukti = [
    ...(existingKwitansi || []).map((k) => k.noBukti || ''),
    ...(existingBku || []).map((b) => b.noBukti || ''),
  ];

  let maxSeq = 0;
  allNoBukti.forEach((nb) => {
    const parts = nb.split('/');
    if (parts.length >= 3 && parts[parts.length - 1] === yearStr) {
      const seqNum = parseInt(parts[0], 10);
      if (!isNaN(seqNum) && seqNum > maxSeq) {
        maxSeq = seqNum;
      }
    } else if (parts.length >= 2) {
      const seqNum = parseInt(parts[0], 10);
      if (!isNaN(seqNum) && seqNum > maxSeq) {
        maxSeq = seqNum;
      }
    }
  });

  const nextSeq = maxSeq + 1;
  const paddedSeq = String(nextSeq).padStart(2, '0');
  return `${paddedSeq}/${prefix}/${yearStr}`;
}

/**
 * Checks if a voucher number is already unique within school records
 */
export function isVoucherNumberUnique(
  noBukti: string,
  existingKwitansi: KwitansiDocument[] = [],
  existingBku: BkuTransaction[] = [],
  excludeId?: string
): boolean {
  const clean = noBukti.trim().toLowerCase();
  const duplicateInKw = (existingKwitansi || []).some(
    (k) => k.id !== excludeId && (k.noBukti || '').trim().toLowerCase() === clean
  );
  const duplicateInBku = (existingBku || []).some(
    (b) => b.id !== excludeId && (b.noBukti || '').trim().toLowerCase() === clean
  );
  return !duplicateInKw && !duplicateInBku;
}
