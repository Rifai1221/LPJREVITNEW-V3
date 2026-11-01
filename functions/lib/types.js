import { z } from 'zod';
export const USER_ROLES = [
    'BENDAHARA',
    'KEPALA_SEKOLAH',
    'TIM_TEKNIS',
    'FASILITATOR',
];
export const JOINABLE_ROLES = [
    'KEPALA_SEKOLAH',
    'TIM_TEKNIS',
    'FASILITATOR',
];
// Zod Input Schemas
export const CreateSchoolSchema = z.object({
    namaSekolah: z.string().trim().min(3).max(200),
    npsn: z.string().trim().min(4).max(32),
    jenjang: z.string().trim().max(32).optional(),
    kabKota: z.string().trim().max(100).optional(),
    provinsi: z.string().trim().max(100).optional(),
    pin: z.string().regex(/^\d{6,}$/, 'PIN harus berupa angka minimal 6 digit'),
});
export const SearchSchoolsSchema = z.object({
    query: z.string().trim().min(3, 'Query pencarian minimal 3 karakter').max(100),
});
export const JoinSchoolSchema = z.object({
    schoolId: z.string().trim().min(1),
    pin: z.string().trim().min(1, 'PIN tidak boleh kosong'),
    role: z.enum(JOINABLE_ROLES, {
        errorMap: () => ({
            message: 'Role yang diminta harus KEPALA_SEKOLAH, TIM_TEKNIS, atau FASILITATOR (bukan BENDAHARA)',
        }),
    }),
    displayName: z.string().trim().max(100).optional(),
});
export const SetMemberRoleSchema = z.object({
    schoolId: z.string().trim().min(1),
    targetUid: z.string().trim().min(1),
    role: z.enum(USER_ROLES),
});
export const RemoveMemberSchema = z.object({
    schoolId: z.string().trim().min(1),
    targetUid: z.string().trim().min(1),
});
export const ChangeSchoolPinSchema = z.object({
    schoolId: z.string().trim().min(1),
    oldPin: z.string().trim().optional(),
    newPin: z.string().regex(/^\d{6,}$/, 'PIN baru harus berupa angka minimal 6 digit'),
});
export const DeleteSchoolSchema = z.object({
    schoolId: z.string().trim().min(1),
    pin: z.string().trim().min(1),
    confirmName: z.string().trim().min(1),
});
export const RestoreSchoolSchema = z.object({
    schoolId: z.string().trim().min(1),
});
export const ListSnapshotsSchema = z.object({
    schoolId: z.string().trim().min(1),
});
export const RestoreSnapshotSchema = z.object({
    schoolId: z.string().trim().min(1),
    snapshotId: z.string().trim().min(1),
});
export const MigrateLegacySchoolsSchema = z.object({
    dryRun: z.boolean().optional().default(false),
});
//# sourceMappingURL=types.js.map