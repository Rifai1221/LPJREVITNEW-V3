import React, { useState, useEffect } from 'react';
import {
  Building2,
  ShieldCheck,
  PlusCircle,
  Database,
  CheckCircle2,
  Search,
  School,
  Lock,
  ArrowRight,
  Info,
  X,
  Trash2,
  LogOut,
  Users,
  KeyRound,
  ShieldAlert,
  UserCheck,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { SchoolTenant } from '../data/tenantPresets';
import {
  UserMembershipRecord,
  searchSchoolsCallable,
  joinSchoolCallable,
  createSchoolCallable,
  setMemberRoleCallable,
  removeMemberCallable,
  changeSchoolPinCallable,
  deleteSchoolCallable,
  SearchedSchoolItem,
  isAdminUser,
} from '../services/schoolMembershipService';
import { USER_ROLES, UserRole } from '../utils/authHelper';
import { useToast } from '../context/ToastContext';
import { getSchoolColorTheme, getRoleBadgeConfig } from './SchoolSwitcher';
import { AdminMigrationModal } from './AdminMigrationModal';

interface SchoolTenantPortalModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTenant: SchoolTenant;
  memberships: UserMembershipRecord[];
  onSelectSchool: (tenant: SchoolTenant) => void;
  onRegisterSchool?: (data: {
    namaSekolah: string;
    npsn: string;
    jenjang: 'TK/PAUD' | 'SD' | 'SMP/MTs' | 'SMA/SMK' | string;
    kabKota: string;
    provinsi: string;
    email?: string;
    pin: string;
    templateType: 'full' | 'blank';
  }) => Promise<void>;
  onCreateDemoSchool?: () => Promise<void>;
  cloudDatabaseId?: string;
  onLogout?: () => void;
  initialTab?: 'switch' | 'join' | 'create' | 'members' | 'pin';
  currentRole?: UserRole | null;
}

interface MemberItem {
  uid: string;
  role: UserRole;
  email: string;
  displayName: string;
  joinedAt?: any;
}

export const SchoolTenantPortalModal: React.FC<SchoolTenantPortalModalProps> = ({
  isOpen,
  onClose,
  currentTenant,
  memberships,
  onSelectSchool,
  onRegisterSchool,
  onCreateDemoSchool,
  onLogout,
  initialTab = 'switch',
  currentRole,
}) => {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'switch' | 'join' | 'create' | 'members' | 'pin'>(initialTab);
  const currentUser = auth.currentUser;
  const [isAdminMigrationOpen, setIsAdminMigrationOpen] = useState(false);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab, isOpen]);

  // Search & Join state
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchedSchoolItem[]>([]);
  const [selectedTargetSchool, setSelectedTargetSchool] = useState<SearchedSchoolItem | null>(null);
  const [joinPin, setJoinPin] = useState('');
  const [joinRole, setJoinRole] = useState<'KEPALA_SEKOLAH' | 'TIM_TEKNIS' | 'FASILITATOR'>('TIM_TEKNIS');
  const [joinDisplayName, setJoinDisplayName] = useState(currentUser?.displayName || '');
  const [isJoining, setIsJoining] = useState(false);

  // Register New School state
  const [createNamaSekolah, setCreateNamaSekolah] = useState('');
  const [createNpsn, setCreateNpsn] = useState('');
  const [createJenjang, setCreateJenjang] = useState<'TK/PAUD' | 'SD' | 'SMP/MTs' | 'SMA/SMK' | string>('SD');
  const [createKabKota, setCreateKabKota] = useState('');
  const [createProvinsi, setCreateProvinsi] = useState('Prov. Aceh');
  const [createPin, setCreatePin] = useState('');
  const [createConfirmPin, setCreateConfirmPin] = useState('');
  const [createTemplateType, setCreateTemplateType] = useState<'full' | 'blank'>('blank');
  const [isCreating, setIsCreating] = useState(false);

  // Member Management state (Bendahara only)
  const [schoolMembers, setSchoolMembers] = useState<MemberItem[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);

  // Change PIN state (Bendahara only)
  const [oldPinInput, setOldPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmNewPinInput, setConfirmNewPinInput] = useState('');
  const [isChangingPin, setIsChangingPin] = useState(false);

  // Delete School state (Bendahara only)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deletePinInput, setDeletePinInput] = useState('');
  const [isDeletingSchool, setIsDeletingSchool] = useState(false);

  // Realtime school members subscription when members tab is active
  useEffect(() => {
    if (!isOpen || activeTab !== 'members' || !currentTenant.id) return;

    setIsLoadingMembers(true);
    const membersColRef = collection(db, 'schools', currentTenant.id, 'members');
    const unsub = onSnapshot(
      membersColRef,
      (snapshot) => {
        const list: MemberItem[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          if (data && data.uid) {
            list.push({
              uid: data.uid,
              role: data.role as UserRole,
              email: data.email || '-',
              displayName: data.displayName || 'Anggota',
              joinedAt: data.joinedAt,
            });
          }
        });
        setSchoolMembers(list);
        setIsLoadingMembers(false);
      },
      (err) => {
        console.warn('Failed to load members:', err);
        setIsLoadingMembers(false);
      }
    );

    return () => unsub();
  }, [isOpen, activeTab, currentTenant.id]);

  if (!isOpen) return null;

  const isBendahara = currentRole === 'BENDAHARA';

  // Handle Search Schools
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || searchQuery.trim().length < 3) {
      toast.warning('Ketik minimal 3 karakter untuk mencari sekolah.');
      return;
    }
    setIsSearching(true);
    try {
      const results = await searchSchoolsCallable(searchQuery.trim());
      setSearchResults(results);
      if (results.length === 0) {
        toast.info('Tidak ada sekolah yang cocok dengan pencarian.');
      }
    } catch (err: any) {
      toast.error('Gagal mencari sekolah: ' + (err?.message || err));
    } finally {
      setIsSearching(false);
    }
  };

  // Handle Join School
  const handleJoinSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTargetSchool) return;
    if (!joinPin.trim() || joinPin.trim().length < 6) {
      toast.warning('Masukkan PIN sekolah minimal 6 digit.');
      return;
    }

    setIsJoining(true);
    try {
      const joined = await joinSchoolCallable({
        schoolId: selectedTargetSchool.id,
        pin: joinPin.trim(),
        role: joinRole,
        displayName: joinDisplayName.trim() || currentUser?.displayName || 'Anggota',
      });

      toast.success(`Berhasil bergabung ke ${joined.namaSekolah} sebagai ${joined.role}!`);
      // Select the joined school
      onSelectSchool({
        id: joined.schoolId,
        namaSekolah: joined.namaSekolah,
        npsn: selectedTargetSchool.npsn,
        jenjang: (selectedTargetSchool.jenjang || 'SD') as any,
        kabKota: selectedTargetSchool.kabKota || '-',
        provinsi: selectedTargetSchool.provinsi || '-',
        email: '-',
        isDemo: false,
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
      });
      onClose();
    } catch (err: any) {
      toast.error('Gagal bergabung: ' + (err?.message || 'PIN salah atau akses ditolak.'));
    } finally {
      setIsJoining(false);
    }
  };

  // Handle Create School
  const handleCreateSchoolSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createNamaSekolah.trim()) {
      toast.warning('Nama sekolah wajib diisi.');
      return;
    }
    if (!createNpsn.trim() || createNpsn.trim().length < 8) {
      toast.warning('NPSN minimal 8 digit angka.');
      return;
    }
    if (createPin.length < 6 || !/^\d{6,}$/.test(createPin)) {
      toast.warning('PIN harus berupa minimal 6 digit angka.');
      return;
    }
    if (createPin !== createConfirmPin) {
      toast.warning('Konfirmasi PIN tidak cocok.');
      return;
    }

    setIsCreating(true);
    try {
      if (onRegisterSchool) {
        await onRegisterSchool({
          namaSekolah: createNamaSekolah.trim(),
          npsn: createNpsn.trim(),
          jenjang: createJenjang,
          kabKota: createKabKota.trim(),
          provinsi: createProvinsi.trim(),
          pin: createPin.trim(),
          templateType: createTemplateType,
        });
      } else {
        await createSchoolCallable({
          namaSekolah: createNamaSekolah.trim(),
          npsn: createNpsn.trim(),
          jenjang: createJenjang,
          kabKota: createKabKota.trim(),
          provinsi: createProvinsi.trim(),
          pin: createPin.trim(),
        });
      }
      toast.success(`Sekolah ${createNamaSekolah.toUpperCase()} berhasil dibuat!`);
      onClose();
    } catch (err: any) {
      toast.error('Gagal membuat sekolah: ' + (err?.message || err));
    } finally {
      setIsCreating(false);
    }
  };

  // Handle Set Member Role
  const handleSetRole = async (targetUid: string, role: UserRole) => {
    try {
      await setMemberRoleCallable({
        schoolId: currentTenant.id,
        targetUid,
        role,
      });
      toast.success('Peran anggota berhasil diperbarui.');
    } catch (err: any) {
      toast.error('Gagal mengubah peran: ' + (err?.message || err));
    }
  };

  // Handle Remove Member
  const handleRemoveMember = async (targetUid: string, targetName: string) => {
    if (!confirm(`Keluarkan ${targetName} dari keanggotaan sekolah ini?`)) return;
    try {
      await removeMemberCallable({
        schoolId: currentTenant.id,
        targetUid,
      });
      toast.success(`${targetName} berhasil dikeluarkan dari sekolah.`);
    } catch (err: any) {
      toast.error('Gagal mengeluarkan anggota: ' + (err?.message || err));
    }
  };

  // Handle Change PIN
  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPinInput.length < 6 || !/^\d{6,}$/.test(newPinInput)) {
      toast.warning('PIN baru harus berupa angka minimal 6 digit.');
      return;
    }
    if (newPinInput !== confirmNewPinInput) {
      toast.warning('Konfirmasi PIN baru tidak cocok.');
      return;
    }

    setIsChangingPin(true);
    try {
      await changeSchoolPinCallable({
        schoolId: currentTenant.id,
        oldPin: oldPinInput.trim() || undefined,
        newPin: newPinInput.trim(),
      });
      toast.success('PIN sekolah berhasil diubah.');
      setOldPinInput('');
      setNewPinInput('');
      setConfirmNewPinInput('');
    } catch (err: any) {
      toast.error('Gagal mengubah PIN: ' + (err?.message || err));
    } finally {
      setIsChangingPin(false);
    }
  };

  // Handle Delete School (Soft-delete via Cloud Function with 30-day retention)
  const handleDeleteSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (deleteConfirmName.trim().toUpperCase() !== currentTenant.namaSekolah.trim().toUpperCase()) {
      toast.warning('Nama sekolah yang diketikkan tidak sesuai persis.');
      return;
    }
    if (!deletePinInput.trim()) {
      toast.warning('Masukkan PIN sekolah untuk otorisasi penghapusan.');
      return;
    }

    setIsDeletingSchool(true);
    try {
      const res = await deleteSchoolCallable({
        schoolId: currentTenant.id,
        pin: deletePinInput.trim(),
        confirmName: deleteConfirmName.trim(),
      });
      toast.success(
        `Sekolah ${currentTenant.namaSekolah} berhasil dihapus (dapat dipulihkan hingga ${new Date(
          res.purgeAfter
        ).toLocaleDateString('id-ID')}).`
      );
      setIsDeleteDialogOpen(false);
      onClose();
      // Select another membership if available
      const remaining = memberships.filter((m) => m.schoolId !== currentTenant.id);
      if (remaining.length > 0) {
        const next = remaining[0];
        onSelectSchool({
          id: next.schoolId,
          namaSekolah: next.namaSekolah,
          npsn: next.npsn,
          jenjang: (next.jenjang || 'SD') as any,
          kabKota: next.kabKota || '-',
          provinsi: '-',
          email: '-',
          isDemo: false,
          createdAt: new Date().toISOString(),
          lastLogin: new Date().toISOString(),
        });
      }
    } catch (err: any) {
      toast.error('Gagal menghapus sekolah: ' + (err?.message || err));
    } finally {
      setIsDeletingSchool(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/30">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold tracking-tight">Portal Sekolah & Akses Pengguna</h2>
              <p className="text-xs text-slate-300">
                Pindah sekolah, bergabung via PIN, atau kelola keanggotaan tim sekolah
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="bg-slate-100 border-b border-slate-200 px-4 flex gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('switch')}
            className={`px-3.5 py-2.5 text-xs font-bold border-b-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === 'switch'
                ? 'border-blue-600 text-blue-700 bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Sekolah Saya ({memberships.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('join')}
            className={`px-3.5 py-2.5 text-xs font-bold border-b-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === 'join'
                ? 'border-blue-600 text-blue-700 bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            Gabung Sekolah
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('create')}
            className={`px-3.5 py-2.5 text-xs font-bold border-b-2 transition cursor-pointer whitespace-nowrap ${
              activeTab === 'create'
                ? 'border-blue-600 text-blue-700 bg-white'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            + Buat Sekolah Baru
          </button>

          {isBendahara && (
            <>
              <button
                type="button"
                onClick={() => setActiveTab('members')}
                className={`px-3.5 py-2.5 text-xs font-bold border-b-2 transition cursor-pointer whitespace-nowrap ${
                  activeTab === 'members'
                    ? 'border-blue-600 text-blue-700 bg-white'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                Anggota & Role
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('pin')}
                className={`px-3.5 py-2.5 text-xs font-bold border-b-2 transition cursor-pointer whitespace-nowrap ${
                  activeTab === 'pin'
                    ? 'border-blue-600 text-blue-700 bg-white'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                Keamanan & PIN
              </button>
            </>
          )}

          {isAdminUser(currentUser) && (
            <button
              type="button"
              onClick={() => setIsAdminMigrationOpen(true)}
              className="px-3.5 py-2.5 text-xs font-bold border-b-2 border-transparent transition cursor-pointer whitespace-nowrap text-amber-700 hover:text-amber-900 bg-amber-50/80 hover:bg-amber-100/80 ml-auto"
              title="Khusus Administrator: Migrasi format sekolah lama ke arsitektur multi-sekolah baru"
            >
              ⚙️ Migrasi Sekolah Lama
            </button>
          )}
        </div>

        {/* Tab Content */}
        <div className="p-5 max-h-[70vh] overflow-y-auto">
          {/* TAB 1: SEKOLAH SAYA */}
          {activeTab === 'switch' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Pilih Sekolah yang Anda Kelola</h3>
                  <p className="text-xs text-slate-500">
                    Satu akun untuk mengelola beberapa sekolah revitalisasi sekaligus
                  </p>
                </div>
                {onCreateDemoSchool && (
                  <button
                    type="button"
                    onClick={async () => {
                      await onCreateDemoSchool();
                      onClose();
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 transition cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                    <span>Buat Sekolah Contoh</span>
                  </button>
                )}
              </div>

              {memberships.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 border border-dashed border-slate-200 rounded-xl space-y-2">
                  <School className="w-10 h-10 mx-auto text-slate-400" />
                  <p className="text-sm font-bold text-slate-700">Belum Ada Sekolah yang Terdaftar</p>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Anda belum terdaftar di sekolah mana pun. Silakan bergabung ke sekolah yang sudah ada atau buat sekolah baru.
                  </p>
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('join')}
                      className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition cursor-pointer"
                    >
                      Gabung Sekolah
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('create')}
                      className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-bold transition cursor-pointer"
                    >
                      Buat Sekolah Baru
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid gap-2.5">
                  {memberships.map((m) => {
                    const isSelected = m.schoolId === currentTenant.id;
                    const roleBadge = getRoleBadgeConfig(m.role);
                    const theme = getSchoolColorTheme(m.schoolId);

                    return (
                      <div
                        key={m.schoolId}
                        onClick={() => {
                          if (!isSelected) {
                            onSelectSchool({
                              id: m.schoolId,
                              namaSekolah: m.namaSekolah,
                              npsn: m.npsn,
                              jenjang: (m.jenjang || 'SD') as any,
                              kabKota: m.kabKota || '-',
                              provinsi: '-',
                              email: '-',
                              isDemo: false,
                              createdAt: typeof m.lastOpenedAt === 'string' ? m.lastOpenedAt : new Date().toISOString(),
                              lastLogin: typeof m.lastOpenedAt === 'string' ? m.lastOpenedAt : new Date().toISOString(),
                            });
                            onClose();
                          }
                        }}
                        className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition ${
                          isSelected
                            ? 'bg-blue-50/70 border-blue-400 ring-2 ring-blue-500/20 shadow-xs'
                            : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-9 h-9 rounded-lg bg-gradient-to-br ${theme.gradientFrom} ${theme.gradientTo} flex items-center justify-center font-bold text-sm text-white shrink-0`}
                          >
                            <Building2 className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                                {m.namaSekolah}
                              </h4>
                              {isSelected && (
                                <span className="text-[10px] bg-blue-600 text-white px-2 py-0.2 rounded-full font-bold">
                                  Aktif Sekarang
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-500 font-mono mt-0.5">
                              <span>NPSN: {m.npsn}</span>
                              {m.kabKota && <span>• {m.kabKota}</span>}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded font-semibold border ${roleBadge.colorClass}`}
                          >
                            {roleBadge.label}
                          </span>
                          {!isSelected && (
                            <button
                              type="button"
                              className="px-2.5 py-1 text-xs font-bold text-blue-600 hover:bg-blue-50 rounded-lg transition"
                            >
                              Pindah &rarr;
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: GABUNG SEKOLAH */}
          {activeTab === 'join' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Gabung ke Sekolah yang Sudah Ada</h3>
                <p className="text-xs text-slate-500">
                  Cari nama sekolah atau NPSN, lalu masukkan PIN yang diberikan oleh Bendahara/Kepala Sekolah
                </p>
              </div>

              {/* Search input */}
              <form onSubmit={handleSearch} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Ketik nama sekolah atau nomor NPSN..."
                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSearching}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                >
                  {isSearching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  <span>Cari</span>
                </button>
              </form>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-48 overflow-y-auto">
                  {searchResults.map((s) => (
                    <div
                      key={s.id}
                      onClick={() => setSelectedTargetSchool(s)}
                      className={`p-3 text-xs flex items-center justify-between cursor-pointer transition ${
                        selectedTargetSchool?.id === s.id
                          ? 'bg-blue-50/80 border-l-4 border-blue-600'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <div>
                        <p className="font-bold text-slate-900">{s.namaSekolah}</p>
                        <p className="text-[11px] text-slate-500 font-mono">
                          NPSN: {s.npsn} • {s.kabKota || '-'} ({s.jenjang || 'SD'})
                        </p>
                      </div>
                      <span className="text-blue-600 font-semibold text-[11px]">
                        {selectedTargetSchool?.id === s.id ? 'Dipilih' : 'Pilih'}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Join form if school selected */}
              {selectedTargetSchool && (
                <form onSubmit={handleJoinSchool} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <div>
                      <p className="text-xs font-bold text-slate-800">
                        Sekolah Tujuan: {selectedTargetSchool.namaSekolah}
                      </p>
                      <p className="text-[10px] text-slate-500">NPSN: {selectedTargetSchool.npsn}</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Peran Anda di Sekolah Ini:
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'TIM_TEKNIS', label: 'Tim Teknis / Pelaksana' },
                        { id: 'KEPALA_SEKOLAH', label: 'Kepala Sekolah' },
                        { id: 'FASILITATOR', label: 'Fasilitator / Tamu' },
                      ].map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setJoinRole(r.id as any)}
                          className={`p-2 text-left rounded-lg border text-xs font-semibold transition cursor-pointer ${
                            joinRole === r.id
                              ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      *Role Bendahara memiliki kendali penuh dan hanya dapat ditugaskan oleh pembuat awal sekolah atau bendahara aktif.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nama Lengkap Petugas:
                    </label>
                    <input
                      type="text"
                      value={joinDisplayName}
                      onChange={(e) => setJoinDisplayName(e.target.value)}
                      placeholder="Contoh: Budi Santoso, S.Pd"
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      PIN Keamanan Sekolah (6 digit angka):
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="password"
                        value={joinPin}
                        onChange={(e) => setJoinPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                        placeholder="Masukkan 6 digit PIN sekolah..."
                        className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden bg-white tracking-widest font-mono"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isJoining}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    {isJoining ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Memverifikasi PIN di Server...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Verifikasi & Bergabung ke Sekolah</span>
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* TAB 3: BUAT SEKOLAH BARU */}
          {activeTab === 'create' && (
            <form onSubmit={handleCreateSchoolSubmit} className="space-y-3.5">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Pendaftaran Sekolah Revitalisasi Baru</h3>
                <p className="text-xs text-slate-500">
                  Anda akan otomatis terdaftar sebagai <b>Bendahara</b> sekolah ini.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nama Sekolah Lengkap: *
                  </label>
                  <input
                    type="text"
                    required
                    value={createNamaSekolah}
                    onChange={(e) => setCreateNamaSekolah(e.target.value)}
                    placeholder="Contoh: SDN 1 MUARA DUA"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden uppercase"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    NPSN (8 digit): *
                  </label>
                  <input
                    type="text"
                    required
                    value={createNpsn}
                    onChange={(e) => setCreateNpsn(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="10105685"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Jenjang Sekolah:
                  </label>
                  <select
                    value={createJenjang}
                    onChange={(e) => setCreateJenjang(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden bg-white"
                  >
                    <option value="TK/PAUD">TK / PAUD</option>
                    <option value="SD">SD (Sekolah Dasar)</option>
                    <option value="SMP/MTs">SMP / MTs</option>
                    <option value="SMA/SMK">SMA / SMK</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kabupaten / Kota: *
                  </label>
                  <input
                    type="text"
                    required
                    value={createKabKota}
                    onChange={(e) => setCreateKabKota(e.target.value)}
                    placeholder="Contoh: Kota Lhokseumawe"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Provinsi:
                  </label>
                  <input
                    type="text"
                    value={createProvinsi}
                    onChange={(e) => setCreateProvinsi(e.target.value)}
                    placeholder="Contoh: Prov. Aceh"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* PIN Settings */}
              <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                  <KeyRound className="w-4 h-4 text-amber-600" />
                  <span>Buat PIN Keamanan Sekolah (6+ Digit Angka)</span>
                </div>
                <p className="text-[11px] text-amber-800">
                  PIN ini akan dibagikan kepada Kepala Sekolah & Tim Teknis saat mereka ingin bergabung ke sekolah ini.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      PIN Baru:
                    </label>
                    <input
                      type="password"
                      required
                      value={createPin}
                      onChange={(e) => setCreatePin(e.target.value.replace(/\D/g, ''))}
                      placeholder="Minimal 6 angka"
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-hidden bg-white tracking-widest font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Konfirmasi PIN:
                    </label>
                    <input
                      type="password"
                      required
                      value={createConfirmPin}
                      onChange={(e) => setCreateConfirmPin(e.target.value.replace(/\D/g, ''))}
                      placeholder="Ketik ulang PIN"
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-hidden bg-white tracking-widest font-mono"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Template Data Awal:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCreateTemplateType('blank')}
                    className={`p-2.5 text-left rounded-lg border text-xs font-semibold transition cursor-pointer ${
                      createTemplateType === 'blank'
                        ? 'bg-blue-50 border-blue-600 text-blue-900 ring-1 ring-blue-500'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <p className="font-bold">Formulir Kosong Bersih</p>
                    <p className="text-[10px] text-slate-500 font-normal">Mulai isi data dari awal untuk proyek nyata</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateTemplateType('full')}
                    className={`p-2.5 text-left rounded-lg border text-xs font-semibold transition cursor-pointer ${
                      createTemplateType === 'full'
                        ? 'bg-blue-50 border-blue-600 text-blue-900 ring-1 ring-blue-500'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <p className="font-bold">Sertakan Contoh Standar</p>
                    <p className="text-[10px] text-slate-500 font-normal">Pra-isi data contoh untuk panduan penyusunan</p>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isCreating}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer shadow-sm"
              >
                {isCreating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Mendaftarkan Sekolah di Cloud...</span>
                  </>
                ) : (
                  <>
                    <PlusCircle className="w-4 h-4" />
                    <span>Daftarkan & Buka Sekolah Baru</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* TAB 4: KELOLA ANGGOTA & ROLE (BENDAHARA ONLY) */}
          {activeTab === 'members' && isBendahara && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Anggota Terdaftar ({currentTenant.namaSekolah})
                </h3>
                <p className="text-xs text-slate-500">
                  Atur hak akses atau keluarkan pengguna dari sekolah ini
                </p>
              </div>

              {isLoadingMembers ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-600 mb-2" />
                  <span>Memuat daftar anggota...</span>
                </div>
              ) : schoolMembers.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-6">Tidak ada anggota lain.</p>
              ) : (
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
                  {schoolMembers.map((m) => {
                    const isSelf = m.uid === currentUser?.uid;

                    return (
                      <div key={m.uid} className="p-3 text-xs flex items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">{m.displayName}</span>
                            {isSelf && (
                              <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-medium">
                                (Anda)
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500">{m.email}</p>
                        </div>

                        <div className="flex items-center gap-2">
                          <select
                            value={m.role}
                            disabled={isSelf}
                            onChange={(e) => handleSetRole(m.uid, e.target.value as UserRole)}
                            className="px-2 py-1 text-xs border border-slate-300 rounded-lg bg-white disabled:bg-slate-100 font-semibold"
                          >
                            <option value="BENDAHARA">Bendahara</option>
                            <option value="KEPALA_SEKOLAH">Kepala Sekolah</option>
                            <option value="TIM_TEKNIS">Tim Teknis</option>
                            <option value="FASILITATOR">Fasilitator</option>
                          </select>

                          {!isSelf && (
                            <button
                              type="button"
                              onClick={() => handleRemoveMember(m.uid, m.displayName)}
                              title="Keluarkan dari sekolah"
                              className="p-1 text-rose-600 hover:bg-rose-50 rounded-lg transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: KEAMANAN & PIN (BENDAHARA ONLY) */}
          {activeTab === 'pin' && isBendahara && (
            <div className="space-y-6">
              {/* Form Ganti PIN */}
              <form onSubmit={handleChangePin} className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2 text-slate-900 font-bold text-xs pb-2 border-b border-slate-200">
                  <KeyRound className="w-4 h-4 text-blue-600" />
                  <span>Ubah PIN Keamanan Sekolah</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  PIN baru akan disimpan aman dengan algoritma scrypt di server.
                </p>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    PIN Lama (Opsional bila sebelumnya sudah disetel):
                  </label>
                  <input
                    type="password"
                    value={oldPinInput}
                    onChange={(e) => setOldPinInput(e.target.value)}
                    placeholder="Masukkan PIN lama..."
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden bg-white font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      PIN Baru (6+ angka):
                    </label>
                    <input
                      type="password"
                      required
                      value={newPinInput}
                      onChange={(e) => setNewPinInput(e.target.value.replace(/\D/g, ''))}
                      placeholder="6 digit angka"
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Konfirmasi PIN Baru:
                    </label>
                    <input
                      type="password"
                      required
                      value={confirmNewPinInput}
                      onChange={(e) => setConfirmNewPinInput(e.target.value.replace(/\D/g, ''))}
                      placeholder="Ketik ulang PIN"
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden bg-white font-mono"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isChangingPin}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                >
                  {isChangingPin ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                  <span>Simpan PIN Baru</span>
                </button>
              </form>

              {/* Danger Zone: Hapus Sekolah */}
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-rose-700 font-bold text-xs">
                  <ShieldAlert className="w-4 h-4 text-rose-600" />
                  <span>Zona Bahaya: Hapus Sekolah Ini</span>
                </div>
                <p className="text-[11px] text-rose-800">
                  Sekolah akan di-soft-delete dan disembunyikan. Data tersimpan selama <b>30 hari</b> sebelum dihapus permanen oleh sistem, dan dapat dipulihkan oleh Administrator jika terjadi kesalahan.
                </p>

                {!isDeleteDialogOpen ? (
                  <button
                    type="button"
                    onClick={() => setIsDeleteDialogOpen(true)}
                    className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Hapus Sekolah ({currentTenant.namaSekolah})</span>
                  </button>
                ) : (
                  <form onSubmit={handleDeleteSchool} className="space-y-2.5 pt-2 border-t border-rose-200">
                    <p className="text-xs font-bold text-slate-800">
                      Ketikkan persis nama sekolah: <span className="text-rose-700 select-all font-mono">{currentTenant.namaSekolah}</span>
                    </p>
                    <input
                      type="text"
                      required
                      value={deleteConfirmName}
                      onChange={(e) => setDeleteConfirmName(e.target.value)}
                      placeholder="Ketik nama sekolah persis di sini..."
                      className="w-full px-3 py-1.5 text-xs border border-rose-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-hidden bg-white"
                    />

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        PIN Sekolah untuk Otorisasi:
                      </label>
                      <input
                        type="password"
                        required
                        value={deletePinInput}
                        onChange={(e) => setDeletePinInput(e.target.value)}
                        placeholder="PIN sekolah..."
                        className="w-full px-3 py-1.5 text-xs border border-rose-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-hidden bg-white font-mono"
                      />
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setIsDeleteDialogOpen(false)}
                        className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                      >
                        Batal
                      </button>
                      <button
                        type="submit"
                        disabled={isDeletingSchool}
                        className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                      >
                        {isDeletingSchool ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        <span>Konfirmasi Hapus Sekolah</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-5 py-3 flex items-center justify-between text-xs text-slate-500">
          <span>Sistem Multi-Sekolah Terisolasi</span>
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="flex items-center gap-1.5 text-rose-600 hover:text-rose-700 font-semibold cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Keluar dari Akun</span>
            </button>
          )}
        </div>
      </div>

      <AdminMigrationModal
        isOpen={isAdminMigrationOpen}
        onClose={() => setIsAdminMigrationOpen(false)}
        userEmail={currentUser?.email}
      />
    </div>
  );
};
