import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  JoinSchoolSchema,
  CreateSchoolSchema,
  DeleteSchoolSchema,
  RestoreSchoolSchema,
  RemoveMemberSchema,
  SetMemberRoleSchema,
  RestoreSnapshotSchema,
} from '../functions/src/types.js';
import {
  generateSalt,
  hashPinScrypt,
  hashPinLegacy,
  verifySchoolPin,
  verifyPinConstantTime,
} from '../functions/src/crypto.js';
import { db } from '../functions/src/middleware.js';
import {
  createSchoolHandler,
  joinSchoolHandler,
  deleteSchoolHandler,
  restoreSchoolHandler,
} from '../functions/src/schoolService.js';
import {
  removeMemberHandler,
} from '../functions/src/memberService.js';
import {
  restoreSnapshotHandler,
} from '../functions/src/snapshotService.js';

describe('Requirement 3: Cloud Functions Unit Tests (Emulator & Logic)', () => {
  const isEmulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

  describe('1. PIN Security & Crypto Verification', () => {
    it('should generate distinct cryptographically secure salts', () => {
      const salt1 = generateSalt(16);
      const salt2 = generateSalt(16);
      assert.strictEqual(salt1.length, 32); // 16 bytes = 32 hex chars
      assert.notStrictEqual(salt1, salt2);
    });

    it('should accurately hash and verify PIN using scrypt', async () => {
      const pin = '123456';
      const salt = generateSalt(16);
      const hash = await hashPinScrypt(pin, salt);

      const verification = await verifySchoolPin(pin, {
        pinHash: hash,
        pinSalt: salt,
        algo: 'scrypt',
        failedAttempts: 0,
      });

      assert.strictEqual(verification.isValid, true);
      assert.strictEqual(verification.isLegacy, false);

      const wrongVerification = await verifySchoolPin('654321', {
        pinHash: hash,
        pinSalt: salt,
        algo: 'scrypt',
        failedAttempts: 0,
      });
      assert.strictEqual(wrongVerification.isValid, false);
    });

    it('should detect legacy SHA-256 hash and flag for scrypt upgrade', async () => {
      const pin = '888999';
      const salt = 'legacy_salt_xyz';
      const legacyHash = hashPinLegacy(pin, salt);

      const verification = await verifySchoolPin(pin, {
        pinHash: legacyHash,
        pinSalt: salt,
        algo: 'sha256-legacy',
        failedAttempts: 0,
      });

      assert.strictEqual(verification.isValid, true, 'Legacy PIN should match');
      assert.strictEqual(verification.isLegacy, true, 'Must be flagged as isLegacy: true for upgrade');
    });

    it('should prevent timing attacks using constant-time comparison', () => {
      const hexA = 'abcdef1234567890';
      const hexB = 'abcdef1234567890';
      const hexC = 'abcdef1234567891';

      assert.strictEqual(verifyPinConstantTime(hexA, hexB), true);
      assert.strictEqual(verifyPinConstantTime(hexA, hexC), false);
      assert.strictEqual(verifyPinConstantTime(hexA, 'short'), false);
    });
  });

  describe('2. joinSchool Security Validations', () => {
    it('should reject joining with role BENDAHARA via JoinSchoolSchema', () => {
      assert.throws(
        () => {
          JoinSchoolSchema.parse({
            schoolId: 'sch_10105685',
            pin: '123456',
            role: 'BENDAHARA', // FORBIDDEN: Bendahara cannot be joined via PIN
          });
        },
        /BENDAHARA/i,
        'Must reject BENDAHARA role from joinSchool'
      );
    });

    it('should accept valid non-bendahara roles (KEPALA_SEKOLAH, TIM_TEKNIS, FASILITATOR)', () => {
      const validRoles = ['KEPALA_SEKOLAH', 'TIM_TEKNIS', 'FASILITATOR'] as const;
      for (const role of validRoles) {
        const parsed = JoinSchoolSchema.parse({
          schoolId: 'sch_10105685',
          pin: '123456',
          role,
        });
        assert.strictEqual(parsed.role, role);
      }
    });

    it('should reject PIN shorter than 6 digits during school creation', () => {
      assert.throws(
        () => {
          CreateSchoolSchema.parse({
            namaSekolah: 'SDN Contoh',
            npsn: '12345678',
            pin: '12345', // only 5 digits
          });
        },
        /minimal 6 digit/i
      );
    });
  });

  describe('3. Cloud Functions Handlers Execution (Emulator Required)', () => {
    const schoolId = 'sch_fn_test_01';
    const bendaharaUid = 'bendahara_fn_user';
    const teknisUid = 'teknis_fn_user';
    const strangerUid = 'stranger_fn_user';
    const testPin = '654321';

    beforeEach(async () => {
      if (!isEmulatorAvailable) {
        return;
      }

      // Seed baseline school
      const salt = generateSalt(16);
      const pinHash = await hashPinScrypt(testPin, salt);

      await db.doc(`schools/${schoolId}`).set({
        id: schoolId,
        namaSekolah: 'SDN TESTING CLOUD FUNCTIONS',
        npsn: '99887766',
        status: 'active',
        createdAt: new Date(),
      });

      await db.doc(`schools/${schoolId}/private/security`).set({
        pinHash,
        pinSalt: salt,
        algo: 'scrypt',
        failedAttempts: 0,
        lockedUntil: null,
      });

      await db.doc(`schools/${schoolId}/members/${bendaharaUid}`).set({
        uid: bendaharaUid,
        role: 'BENDAHARA',
        email: 'bendahara@test.id',
        displayName: 'Bendahara Utama',
        joinedAt: new Date(),
      });

      await db.doc(`schools/${schoolId}/lpj_data/meta`).set({
        rev: 1,
        updatedAt: '2026-10-31',
      });
      await db.doc(`schools/${schoolId}/lpj_data/master`).set({
        rev: 1,
        budget: 50000000,
      });
    });

    it('joinSchool: should succeed with correct PIN and register membership', async (t) => {
      if (!isEmulatorAvailable) {
        t.skip('Emulator not running');
        return;
      }

      const req: any = {
        auth: { uid: teknisUid, token: { email: 'teknis@test.id', name: 'Tim Teknis' } },
        data: {
          schoolId,
          pin: testPin,
          role: 'TIM_TEKNIS',
        },
      };

      const res = await joinSchoolHandler(req);
      assert.strictEqual(res.schoolId, schoolId);
      assert.strictEqual(res.role, 'TIM_TEKNIS');

      // Verify member record created
      const memberDoc = await db.doc(`schools/${schoolId}/members/${teknisUid}`).get();
      assert.strictEqual(memberDoc.exists, true);
      assert.strictEqual(memberDoc.data()?.role, 'TIM_TEKNIS');

      // Verify user membership record created
      const membershipDoc = await db.doc(`users/${teknisUid}/memberships/${schoolId}`).get();
      assert.strictEqual(membershipDoc.exists, true);
      assert.strictEqual(membershipDoc.data()?.role, 'TIM_TEKNIS');
    });

    it('joinSchool: should reject wrong PIN and record failed attempts', async (t) => {
      if (!isEmulatorAvailable) {
        t.skip('Emulator not running');
        return;
      }

      const req: any = {
        auth: { uid: strangerUid, token: { email: 'stranger@test.id' } },
        data: {
          schoolId,
          pin: '000000', // wrong pin
          role: 'TIM_TEKNIS',
        },
      };

      await assert.rejects(
        () => joinSchoolHandler(req),
        /PIN yang dimasukkan salah/i
      );

      const secDoc = await db.doc(`schools/${schoolId}/private/security`).get();
      assert.strictEqual(secDoc.data()?.failedAttempts, 1);
    });

    it('joinSchool: should lock after 5 failed attempts (throttling 15 minutes)', async (t) => {
      if (!isEmulatorAvailable) {
        t.skip('Emulator not running');
        return;
      }

      const req: any = {
        auth: { uid: 'brute_force_user', token: { email: 'brute@test.id' } },
        data: {
          schoolId,
          pin: '000000',
          role: 'TIM_TEKNIS',
        },
      };

      // 4 failures
      for (let i = 0; i < 4; i++) {
        await assert.rejects(() => joinSchoolHandler(req));
      }

      // 5th failure should trigger lockout
      await assert.rejects(
        () => joinSchoolHandler(req),
        /15 menit|terkunci/i
      );

      // 6th attempt should immediately throw resource-exhausted due to active lockout
      await assert.rejects(
        () => joinSchoolHandler(req),
        /terkunci/i
      );
    });

    it('joinSchool: should transparently upgrade legacy SHA-256 PIN to scrypt on first successful login', async (t) => {
      if (!isEmulatorAvailable) {
        t.skip('Emulator not running');
        return;
      }

      const legacySchoolId = 'sch_legacy_upgrade_01';
      const legacyPin = '777888';
      const legacySalt = 'legacy_salt_abc';
      const legacyHash = hashPinLegacy(legacyPin, legacySalt);

      await db.doc(`schools/${legacySchoolId}`).set({
        id: legacySchoolId,
        namaSekolah: 'SDN UPGRADE LEGACY',
        status: 'active',
      });
      await db.doc(`schools/${legacySchoolId}/private/security`).set({
        pinHash: legacyHash,
        pinSalt: legacySalt,
        algo: 'sha256-legacy',
        failedAttempts: 0,
      });

      const req: any = {
        auth: { uid: 'upgrade_user_01', token: { email: 'upgrader@test.id' } },
        data: {
          schoolId: legacySchoolId,
          pin: legacyPin,
          role: 'FASILITATOR',
        },
      };

      const res = await joinSchoolHandler(req);
      assert.strictEqual(res.role, 'FASILITATOR');

      // Check security document was upgraded to scrypt
      const secSnap = await db.doc(`schools/${legacySchoolId}/private/security`).get();
      const secData = secSnap.data();
      assert.strictEqual(secData?.algo, 'scrypt', 'Algorithm must be upgraded to scrypt');
      assert.notStrictEqual(secData?.pinHash, legacyHash, 'Hash must be recomputed');
    });

    it('deleteSchool & restoreSchool: should soft-delete with 30-day purge and restore properly', async (t) => {
      if (!isEmulatorAvailable) {
        t.skip('Emulator not running');
        return;
      }

      const delReq: any = {
        auth: { uid: bendaharaUid },
        data: {
          schoolId,
          pin: testPin,
          confirmName: 'SDN TESTING CLOUD FUNCTIONS',
        },
      };

      // Soft delete
      const delRes = await deleteSchoolHandler(delReq);
      assert.strictEqual(delRes.success, true);

      const schoolSnap = await db.doc(`schools/${schoolId}`).get();
      assert.strictEqual(schoolSnap.data()?.status, 'deleted');
      assert.ok(schoolSnap.data()?.deletedAt);
      assert.ok(schoolSnap.data()?.purgeAfter);

      // Restore
      const restoreReq: any = {
        auth: { uid: bendaharaUid },
        data: { schoolId },
      };
      const restRes = await restoreSchoolHandler(restoreReq);
      assert.strictEqual(restRes.success, true);

      const restoredSnap = await db.doc(`schools/${schoolId}`).get();
      assert.strictEqual(restoredSnap.data()?.status, 'active');
      assert.strictEqual(restoredSnap.data()?.deletedAt, null);
    });

    it('restoreSnapshot: should create pre-restore safety snapshot before restoring target snapshot', async (t) => {
      if (!isEmulatorAvailable) {
        t.skip('Emulator not running');
        return;
      }

      // Seed snapshot_01
      await db.doc(`schools/${schoolId}/snapshots/snapshot_01`).set({
        snapshotId: 'snapshot_01',
        createdAt: new Date(),
        rev: 1,
      });
      await db.doc(`schools/${schoolId}/snapshots/snapshot_01/data/master`).set({
        budget: 99000000,
        namaSekolah: 'RESTORED DATA',
        rev: 1,
      });

      const req: any = {
        auth: { uid: bendaharaUid },
        data: {
          schoolId,
          snapshotId: 'snapshot_01',
        },
      };

      const res = await restoreSnapshotHandler(req);
      assert.strictEqual(res.success, true);

      // Verify that a pre-restore snapshot was created
      const allSnaps = await db.collection(`schools/${schoolId}/snapshots`).get();
      const preRestoreSnap = allSnaps.docs.find((d) => d.id.startsWith('pre_restore_'));
      assert.ok(preRestoreSnap, 'Pre-restore safety snapshot must be generated');
      assert.strictEqual(preRestoreSnap.data()?.isPreRestore, true);
    });

    it('removeMember: should forbid deleting the last BENDAHARA', async (t) => {
      if (!isEmulatorAvailable) {
        t.skip('Emulator not running');
        return;
      }

      // bendaharaUid is the ONLY bendahara in schoolId
      const req: any = {
        auth: { uid: bendaharaUid },
        data: {
          schoolId,
          targetUid: bendaharaUid,
        },
      };

      await assert.rejects(
        () => removeMemberHandler(req),
        /Tidak dapat menghapus Bendahara terakhir/i,
        'Must reject removing the last Bendahara'
      );
    });
  });
});
