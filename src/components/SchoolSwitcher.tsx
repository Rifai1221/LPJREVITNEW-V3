import React, { useState, useRef, useEffect } from 'react';
import {
  Building2,
  ChevronDown,
  Plus,
  UserCheck,
  Check,
  Sparkles,
  School,
  LogOut,
  ExternalLink,
  Shield,
  Layers,
  Search,
} from 'lucide-react';
import { SchoolTenant } from '../data/tenantPresets';
import { UserMembershipRecord } from '../services/schoolMembershipService';
import { UserRole } from '../utils/authHelper';

// Deterministic School Theme Hash (Requirement 8)
export interface SchoolColorTheme {
  name: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  dotColor: string;
  gradientFrom: string;
  gradientTo: string;
}

const THEMES: SchoolColorTheme[] = [
  {
    name: 'emerald',
    badgeBg: 'bg-emerald-950/80',
    badgeBorder: 'border-emerald-500/50',
    badgeText: 'text-emerald-300',
    dotColor: 'bg-emerald-400',
    gradientFrom: 'from-emerald-600',
    gradientTo: 'to-teal-700',
  },
  {
    name: 'indigo',
    badgeBg: 'bg-indigo-950/80',
    badgeBorder: 'border-indigo-500/50',
    badgeText: 'text-indigo-300',
    dotColor: 'bg-indigo-400',
    gradientFrom: 'from-indigo-600',
    gradientTo: 'to-blue-700',
  },
  {
    name: 'amber',
    badgeBg: 'bg-amber-950/80',
    badgeBorder: 'border-amber-500/50',
    badgeText: 'text-amber-300',
    dotColor: 'bg-amber-400',
    gradientFrom: 'from-amber-600',
    gradientTo: 'to-orange-700',
  },
  {
    name: 'cyan',
    badgeBg: 'bg-cyan-950/80',
    badgeBorder: 'border-cyan-500/50',
    badgeText: 'text-cyan-300',
    dotColor: 'bg-cyan-400',
    gradientFrom: 'from-cyan-600',
    gradientTo: 'to-sky-700',
  },
  {
    name: 'violet',
    badgeBg: 'bg-violet-950/80',
    badgeBorder: 'border-violet-500/50',
    badgeText: 'text-violet-300',
    dotColor: 'bg-violet-400',
    gradientFrom: 'from-violet-600',
    gradientTo: 'to-purple-700',
  },
  {
    name: 'rose',
    badgeBg: 'bg-rose-950/80',
    badgeBorder: 'border-rose-500/50',
    badgeText: 'text-rose-300',
    dotColor: 'bg-rose-400',
    gradientFrom: 'from-rose-600',
    gradientTo: 'to-pink-700',
  },
];

export function getSchoolColorTheme(schoolId?: string): SchoolColorTheme {
  if (!schoolId) return THEMES[0];
  let hash = 0;
  for (let i = 0; i < schoolId.length; i++) {
    hash = (hash << 5) - hash + schoolId.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % THEMES.length;
  return THEMES[index];
}

export function getRoleBadgeConfig(role?: UserRole | string): { label: string; colorClass: string } {
  switch (role) {
    case 'BENDAHARA':
      return { label: 'Bendahara', colorClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40' };
    case 'KEPALA_SEKOLAH':
      return { label: 'Kepala Sekolah', colorClass: 'bg-amber-500/20 text-amber-300 border-amber-400/40' };
    case 'TIM_TEKNIS':
      return { label: 'Tim Teknis', colorClass: 'bg-indigo-500/20 text-indigo-300 border-indigo-400/40' };
    case 'FASILITATOR':
      return { label: 'Fasilitator', colorClass: 'bg-slate-500/20 text-slate-300 border-slate-400/40' };
    default:
      return { label: 'Anggota', colorClass: 'bg-slate-500/20 text-slate-300 border-slate-400/40' };
  }
}

interface SchoolSwitcherProps {
  currentTenant: SchoolTenant;
  memberships: UserMembershipRecord[];
  onSelectSchool: (tenant: SchoolTenant) => void;
  onOpenJoinOrCreate: (initialTab?: 'join' | 'create' | 'members') => void;
  onCreateDemoSchool?: () => void;
  isCreatingDemo?: boolean;
  currentRole?: UserRole | null;
}

export const SchoolSwitcher: React.FC<SchoolSwitcherProps> = ({
  currentTenant,
  memberships,
  onSelectSchool,
  onOpenJoinOrCreate,
  onCreateDemoSchool,
  isCreatingDemo = false,
  currentRole,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const theme = getSchoolColorTheme(currentTenant.id);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentMembership = memberships.find((m) => m.schoolId === currentTenant.id);
  const effectiveRole = currentRole || currentMembership?.role;
  const roleBadge = getRoleBadgeConfig(effectiveRole);

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      {/* Trigger Button: Prominent School Identity & NPSN (Requirement 8) */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl border transition-all cursor-pointer text-left shadow-xs ${theme.badgeBg} ${theme.badgeBorder} hover:brightness-110`}
        title="Klik untuk memilih sekolah lain, bergabung, atau mengelola keanggotaan"
      >
        <div
          className={`w-7 h-7 rounded-lg bg-gradient-to-br ${theme.gradientFrom} ${theme.gradientTo} flex items-center justify-center font-bold text-xs text-white shrink-0 shadow-xs`}
        >
          <Building2 className="w-4 h-4" />
        </div>

        <div className="min-w-0 pr-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-white truncate max-w-[170px] sm:max-w-[220px]">
              {currentTenant.namaSekolah}
            </span>
            {effectiveRole && (
              <span
                className={`text-[9px] px-1.5 py-0.2 rounded font-semibold border ${roleBadge.colorClass}`}
              >
                {roleBadge.label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-300 font-mono">
            <span>NPSN: {currentTenant.npsn || '-'}</span>
            <span>•</span>
            <span className="font-sans text-slate-400 truncate max-w-[90px]">{currentTenant.kabKota || '-'}</span>
          </div>
        </div>

        <ChevronDown
          className={`w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0 ${
            isOpen ? 'rotate-180 text-white' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 mt-2 w-80 sm:w-96 rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl py-2 z-50 text-slate-200 backdrop-blur-md animate-in fade-in zoom-in-95 duration-150">
          {/* Header section */}
          <div className="px-3.5 py-2 border-b border-slate-800 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-white">Sekolah Saya</p>
              <p className="text-[10px] text-slate-400">
                {memberships.length} sekolah terdaftar di akun Anda
              </p>
            </div>
            <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full border border-blue-400/30">
              1 Akun Multi-Sekolah
            </span>
          </div>

          {/* School list */}
          <div className="max-h-64 overflow-y-auto py-1 scrollbar-thin">
            {memberships.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-slate-400 space-y-1">
                <School className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                <p className="font-semibold text-slate-300">Belum ada sekolah terdaftar</p>
                <p className="text-[11px] text-slate-500">
                  Gunakan tombol di bawah untuk bergabung atau membuat sekolah baru.
                </p>
              </div>
            ) : (
              memberships.map((m) => {
                const isSelected = m.schoolId === currentTenant.id;
                const mTheme = getSchoolColorTheme(m.schoolId);
                const mRoleBadge = getRoleBadgeConfig(m.role);

                return (
                  <button
                    key={m.schoolId}
                    type="button"
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
                      }
                      setIsOpen(false);
                    }}
                    className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-800/80 transition cursor-pointer ${
                      isSelected ? 'bg-slate-800/90 border-l-4 border-blue-500' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-7 h-7 rounded-lg bg-gradient-to-br ${mTheme.gradientFrom} ${mTheme.gradientTo} flex items-center justify-center font-bold text-xs text-white shrink-0`}
                      >
                        <Building2 className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate max-w-[190px] sm:max-w-[230px]">
                          {m.namaSekolah}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                          <span>NPSN: {m.npsn || '-'}</span>
                          {m.kabKota && (
                            <>
                              <span>•</span>
                              <span className="font-sans truncate max-w-[100px]">{m.kabKota}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold border ${mRoleBadge.colorClass}`}>
                        {mRoleBadge.label}
                      </span>
                      {isSelected && <Check className="w-4 h-4 text-blue-400" />}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Action buttons footer */}
          <div className="border-t border-slate-800 p-2 space-y-1">
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenJoinOrCreate('join');
                }}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-300 border border-slate-700 transition cursor-pointer"
              >
                <Search className="w-3.5 h-3.5" />
                <span>Gabung Sekolah</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenJoinOrCreate('create');
                }}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Buat Sekolah Baru</span>
              </button>
            </div>

            {onCreateDemoSchool && (
              <button
                type="button"
                disabled={isCreatingDemo}
                onClick={() => {
                  setIsOpen(false);
                  onCreateDemoSchool();
                }}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-lg bg-slate-800/60 hover:bg-slate-800 text-amber-300 border border-amber-500/30 transition cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>{isCreatingDemo ? 'Membuat Data Contoh...' : 'Buat Sekolah Contoh (Template Lengkap)'}</span>
              </button>
            )}

            {effectiveRole === 'BENDAHARA' && (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpenJoinOrCreate('members');
                }}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-lg bg-slate-800/40 hover:bg-slate-800 text-emerald-300 border border-emerald-500/20 transition cursor-pointer"
              >
                <Shield className="w-3.5 h-3.5 text-emerald-400" />
                <span>Kelola Anggota & Role ({currentTenant.namaSekolah})</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
