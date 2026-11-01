import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { db, requireAuth, assertBendahara } from './middleware.js';
import { SetMemberRoleSchema, RemoveMemberSchema } from './types.js';
/**
 * 4a. setMemberRole
 */
export async function setMemberRoleHandler(request) {
    const user = requireAuth(request);
    const data = SetMemberRoleSchema.parse(request.data);
    await assertBendahara(data.schoolId, user.uid);
    const targetMemberRef = db.doc(`schools/${data.schoolId}/members/${data.targetUid}`);
    const targetSnap = await targetMemberRef.get();
    if (!targetSnap.exists) {
        throw new HttpsError('not-found', 'Anggota sekolah target tidak ditemukan.');
    }
    const currentRole = targetSnap.data()?.role;
    // Protect the last BENDAHARA from being demoted
    if (currentRole === 'BENDAHARA' && data.role !== 'BENDAHARA') {
        const bendaharaSnap = await db
            .collection(`schools/${data.schoolId}/members`)
            .where('role', '==', 'BENDAHARA')
            .get();
        if (bendaharaSnap.size <= 1) {
            throw new HttpsError('failed-precondition', 'Tidak dapat menurunkan peran Bendahara terakhir. Sekolah wajib memiliki minimal satu Bendahara aktif.');
        }
    }
    const batch = db.batch();
    batch.update(targetMemberRef, {
        role: data.role,
        updatedAt: FieldValue.serverTimestamp(),
    });
    const membershipRef = db.doc(`users/${data.targetUid}/memberships/${data.schoolId}`);
    batch.set(membershipRef, {
        role: data.role,
        lastUpdated: FieldValue.serverTimestamp(),
    }, { merge: true });
    await batch.commit();
    return {
        success: true,
        schoolId: data.schoolId,
        targetUid: data.targetUid,
        role: data.role,
    };
}
/**
 * 4b. removeMember
 */
export async function removeMemberHandler(request) {
    const user = requireAuth(request);
    const data = RemoveMemberSchema.parse(request.data);
    await assertBendahara(data.schoolId, user.uid);
    const targetMemberRef = db.doc(`schools/${data.schoolId}/members/${data.targetUid}`);
    const targetSnap = await targetMemberRef.get();
    if (!targetSnap.exists) {
        throw new HttpsError('not-found', 'Anggota sekolah target tidak ditemukan.');
    }
    const currentRole = targetSnap.data()?.role;
    // Protect the last BENDAHARA from being removed
    if (currentRole === 'BENDAHARA') {
        const bendaharaSnap = await db
            .collection(`schools/${data.schoolId}/members`)
            .where('role', '==', 'BENDAHARA')
            .get();
        if (bendaharaSnap.size <= 1) {
            throw new HttpsError('failed-precondition', 'Tidak dapat menghapus Bendahara terakhir. Sekolah wajib memiliki minimal satu Bendahara aktif.');
        }
    }
    const batch = db.batch();
    batch.delete(targetMemberRef);
    batch.delete(db.doc(`users/${data.targetUid}/memberships/${data.schoolId}`));
    await batch.commit();
    return {
        success: true,
        schoolId: data.schoolId,
        removedUid: data.targetUid,
    };
}
//# sourceMappingURL=memberService.js.map