import { collection, addDoc, serverTimestamp, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db, auth } from './firebase';
import { logger } from '../utils/logger';

export interface AuditLogItem {
  id?: string;
  tenantId: string;
  userId: string;
  userEmail: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  targetType: 'KWITANSI' | 'BKU' | 'WAGE' | 'MASTER' | 'RPD';
  targetId: string;
  description: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  timestamp?: any;
}

/**
 * Record an audit log entry in schools/{tenantId}/auditLogs
 * Requirement 4: siapa, kapan, field apa, nilai lama dan baru
 */
export async function recordAuditLog(
  tenantId: string,
  action: 'CREATE' | 'UPDATE' | 'DELETE',
  targetType: 'KWITANSI' | 'BKU' | 'WAGE' | 'MASTER' | 'RPD',
  targetId: string,
  description: string,
  oldValues?: Record<string, any>,
  newValues?: Record<string, any>
): Promise<void> {
  const currentUser = auth.currentUser;
  const userId = currentUser?.uid || 'anonymous';
  const userEmail = currentUser?.email || currentUser?.displayName || 'system';

  const logPayload: AuditLogItem = {
    tenantId,
    userId,
    userEmail,
    action,
    targetType,
    targetId,
    description,
    oldValues: oldValues || {},
    newValues: newValues || {},
    timestamp: serverTimestamp(),
  };

  try {
    const logsCol = collection(db, 'schools', tenantId, 'auditLogs');
    await addDoc(logsCol, logPayload);
  } catch (err) {
    logger.warn('AuditLogService', 'Failed to record audit log to Firestore', undefined, err);
  }
}

/**
 * Fetch recent audit logs for a school
 */
export async function fetchSchoolAuditLogs(tenantId: string, maxResults = 50): Promise<AuditLogItem[]> {
  try {
    const logsCol = collection(db, 'schools', tenantId, 'auditLogs');
    const q = query(logsCol, orderBy('timestamp', 'desc'), limit(maxResults));
    const snapshot = await getDocs(q);
    const logs: AuditLogItem[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      logs.push({
        id: docSnap.id,
        tenantId: data.tenantId,
        userId: data.userId,
        userEmail: data.userEmail,
        action: data.action,
        targetType: data.targetType,
        targetId: data.targetId,
        description: data.description,
        oldValues: data.oldValues,
        newValues: data.newValues,
        timestamp: data.timestamp?.toDate ? data.timestamp.toDate().toISOString() : data.timestamp,
      });
    });
    return logs;
  } catch (err) {
    logger.warn('AuditLogService', 'Failed to fetch audit logs', undefined, err);
    return [];
  }
}
