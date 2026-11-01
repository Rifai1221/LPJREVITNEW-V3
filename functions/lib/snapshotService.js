import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { db, requireAuth, assertBendahara } from './middleware.js';
import { ListSnapshotsSchema, RestoreSnapshotSchema } from './types.js';
/**
 * Daily snapshot scheduled job (runs at 02:00 Asia/Jakarta)
 */
export async function executeDailySnapshots() {
    const activeSchoolsSnap = await db
        .collection('schools')
        .where('status', '==', 'active')
        .get();
    let snapshottedCount = 0;
    const now = new Date();
    // Format YYYYMMDD in Asia/Jakarta timezone
    const formatter = new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    const parts = formatter.formatToParts(now);
    const year = parts.find((p) => p.type === 'year')?.value || '2026';
    const month = parts.find((p) => p.type === 'month')?.value || '01';
    const day = parts.find((p) => p.type === 'day')?.value || '01';
    const snapshotId = `${year}${month}${day}`;
    for (const schoolDoc of activeSchoolsSnap.docs) {
        const schoolId = schoolDoc.id;
        // Check meta document to see if lpj_data was updated
        const metaSnap = await db.doc(`schools/${schoolId}/lpj_data/meta`).get();
        if (!metaSnap.exists)
            continue;
        const metaData = metaSnap.data() || {};
        const metaUpdatedAt = metaData.updatedAt;
        // Check latest existing snapshot
        const lastSnapQuery = await db
            .collection(`schools/${schoolId}/snapshots`)
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get();
        if (!lastSnapQuery.empty && metaUpdatedAt) {
            const lastSnapTime = lastSnapQuery.docs[0].data().createdAt;
            // If no updates since last snapshot, skip
            if (metaUpdatedAt.toMillis() <= lastSnapTime.toMillis()) {
                continue;
            }
        }
        // Perform snapshot
        const lpjDataColl = await db.collection(`schools/${schoolId}/lpj_data`).get();
        if (lpjDataColl.empty)
            continue;
        const snapDocRef = db.doc(`schools/${schoolId}/snapshots/${snapshotId}`);
        await snapDocRef.set({
            snapshotId,
            schoolId,
            createdAt: FieldValue.serverTimestamp(),
            sourceRev: metaData.rev || 1,
            docCount: lpjDataColl.size,
        });
        const batch = db.batch();
        for (const doc of lpjDataColl.docs) {
            const subRef = db.doc(`schools/${schoolId}/snapshots/${snapshotId}/data/${doc.id}`);
            batch.set(subRef, doc.data());
        }
        await batch.commit();
        snapshottedCount += 1;
        // Retain only latest 14 snapshots
        const allSnaps = await db
            .collection(`schools/${schoolId}/snapshots`)
            .orderBy('createdAt', 'desc')
            .get();
        if (allSnaps.size > 14) {
            const toDelete = allSnaps.docs.slice(14);
            for (const delDoc of toDelete) {
                await db.recursiveDelete(delDoc.ref);
            }
        }
    }
    return { processed: activeSchoolsSnap.size, snapshotted: snapshottedCount };
}
/**
 * 8b. listSnapshots (Callable)
 */
export async function listSnapshotsHandler(request) {
    const user = requireAuth(request);
    const data = ListSnapshotsSchema.parse(request.data);
    await assertBendahara(data.schoolId, user.uid);
    const snapQuery = await db
        .collection(`schools/${data.schoolId}/snapshots`)
        .orderBy('createdAt', 'desc')
        .get();
    const snapshots = snapQuery.docs.map((d) => {
        const raw = d.data();
        return {
            snapshotId: d.id,
            createdAt: raw.createdAt ? raw.createdAt.toDate().toISOString() : null,
            sourceRev: raw.sourceRev || 1,
            docCount: raw.docCount || 0,
        };
    });
    return { snapshots };
}
/**
 * 8c. restoreSnapshot (Callable)
 */
export async function restoreSnapshotHandler(request) {
    const user = requireAuth(request);
    const data = RestoreSnapshotSchema.parse(request.data);
    await assertBendahara(data.schoolId, user.uid);
    const snapshotRef = db.doc(`schools/${data.schoolId}/snapshots/${data.snapshotId}`);
    const snapshotSnap = await snapshotRef.get();
    if (!snapshotSnap.exists) {
        throw new HttpsError('not-found', 'Snapshot yang dipilih tidak ditemukan.');
    }
    const snapshotDataColl = await db
        .collection(`schools/${data.schoolId}/snapshots/${data.snapshotId}/data`)
        .get();
    if (snapshotDataColl.empty) {
        throw new HttpsError('failed-precondition', 'Data pada snapshot kosong atau tidak dapat dipulihkan.');
    }
    // 1. Create PRE-RESTORE snapshot as mandatory safety rollback
    const preRestoreId = `pre_restore_${Date.now()}`;
    const currentLpjColl = await db.collection(`schools/${data.schoolId}/lpj_data`).get();
    const preSnapRef = db.doc(`schools/${data.schoolId}/snapshots/${preRestoreId}`);
    await preSnapRef.set({
        snapshotId: preRestoreId,
        schoolId: data.schoolId,
        createdAt: FieldValue.serverTimestamp(),
        isPreRestore: true,
        restoredFromSnapshot: data.snapshotId,
    });
    const preBatch = db.batch();
    for (const doc of currentLpjColl.docs) {
        preBatch.set(db.doc(`schools/${data.schoolId}/snapshots/${preRestoreId}/data/${doc.id}`), doc.data());
    }
    await preBatch.commit();
    // 2. Determine next rev
    const metaSnap = await db.doc(`schools/${data.schoolId}/lpj_data/meta`).get();
    const currentRev = (metaSnap.exists ? metaSnap.data()?.rev : 1) || 1;
    const newRev = currentRev + 1;
    // 3. Restore all documents from snapshot into schools/{schoolId}/lpj_data
    const restoreBatch = db.batch();
    for (const doc of snapshotDataColl.docs) {
        const docData = doc.data();
        // Update rev if doc tracks revision
        if ('rev' in docData) {
            docData.rev = newRev;
            docData.updatedAt = FieldValue.serverTimestamp();
            docData.updatedBy = user.uid;
        }
        restoreBatch.set(db.doc(`schools/${data.schoolId}/lpj_data/${doc.id}`), docData);
    }
    // Ensure meta doc is updated with new rev
    restoreBatch.set(db.doc(`schools/${data.schoolId}/lpj_data/meta`), {
        rev: newRev,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: user.uid,
        lastRestoredFrom: data.snapshotId,
    }, { merge: true });
    await restoreBatch.commit();
    return {
        success: true,
        schoolId: data.schoolId,
        restoredSnapshotId: data.snapshotId,
        preRestoreSnapshotId: preRestoreId,
        newRev,
    };
}
//# sourceMappingURL=snapshotService.js.map