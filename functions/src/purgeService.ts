import { Timestamp } from 'firebase-admin/firestore';
import { db } from './middleware.js';

/**
 * Scheduled job to permanently purge soft-deleted schools whose 30-day retention has expired.
 */
export async function executePurgeDeletedSchools(): Promise<{ purgedCount: number; purgedIds: string[] }> {
  const now = Timestamp.now();

  const expiredSnap = await db
    .collection('schools')
    .where('status', '==', 'deleted')
    .where('purgeAfter', '<=', now)
    .get();

  const purgedIds: string[] = [];

  for (const doc of expiredSnap.docs) {
    const schoolId = doc.id;
    // Recursive delete removes the school document and all subcollections
    // (members, private, lpj_data, snapshots, auditLogs)
    await db.recursiveDelete(doc.ref);
    purgedIds.push(schoolId);
  }

  return {
    purgedCount: purgedIds.length,
    purgedIds,
  };
}
