import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { FUNCTION_REGION, isAppCheckEnforced } from './middleware.js';
import { createSchoolHandler, searchSchoolsHandler, joinSchoolHandler, changeSchoolPinHandler, deleteSchoolHandler, restoreSchoolHandler, } from './schoolService.js';
import { setMemberRoleHandler, removeMemberHandler, } from './memberService.js';
import { executeDailySnapshots, listSnapshotsHandler, restoreSnapshotHandler, } from './snapshotService.js';
import { executePurgeDeletedSchools } from './purgeService.js';
import { migrateLegacySchoolsHandler } from './migrationService.js';
const callableConfig = {
    region: FUNCTION_REGION,
    enforceAppCheck: isAppCheckEnforced(),
};
// 1. School Management Callables
export const createSchool = onCall(callableConfig, createSchoolHandler);
export const searchSchools = onCall(callableConfig, searchSchoolsHandler);
export const joinSchool = onCall(callableConfig, joinSchoolHandler);
export const changeSchoolPin = onCall(callableConfig, changeSchoolPinHandler);
export const deleteSchool = onCall(callableConfig, deleteSchoolHandler);
export const restoreSchool = onCall(callableConfig, restoreSchoolHandler);
// 2. Member & Role Management Callables
export const setMemberRole = onCall(callableConfig, setMemberRoleHandler);
export const removeMember = onCall(callableConfig, removeMemberHandler);
// 3. Snapshot Management Callables
export const listSnapshots = onCall(callableConfig, listSnapshotsHandler);
export const restoreSnapshot = onCall(callableConfig, restoreSnapshotHandler);
// 4. Migration Callable (Admin only)
export const migrateLegacySchools = onCall(callableConfig, migrateLegacySchoolsHandler);
// 5. Scheduled Functions
export const dailySnapshot = onSchedule({
    region: FUNCTION_REGION,
    schedule: '0 2 * * *', // Daily at 02:00
    timeZone: 'Asia/Jakarta',
}, async () => {
    const res = await executeDailySnapshots();
    console.log(`[dailySnapshot] Completed: ${res.snapshotted} of ${res.processed} schools snapshotted.`);
});
export const purgeDeletedSchools = onSchedule({
    region: FUNCTION_REGION,
    schedule: '0 3 * * *', // Daily at 03:00
    timeZone: 'Asia/Jakarta',
}, async () => {
    const res = await executePurgeDeletedSchools();
    console.log(`[purgeDeletedSchools] Purged ${res.purgedCount} expired deleted schools.`);
});
//# sourceMappingURL=index.js.map