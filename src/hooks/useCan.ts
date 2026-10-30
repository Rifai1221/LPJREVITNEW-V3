import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { UserRole } from '../utils/authHelper';
import { getStoredActiveTenantId } from '../services/schoolTenantService';

export type PermissionAction =
  | 'create:transaction'
  | 'edit:transaction'
  | 'delete:transaction'
  | 'import:data'
  | 'edit:progress'
  | 'edit:wages'
  | 'approve:lpj'
  | 'edit:master_data';

export interface UseCanResult {
  can: (action: PermissionAction) => boolean;
  role: UserRole | null;
  loading: boolean;
  isBendahara: boolean;
  isTimTeknis: boolean;
  isKepalaSekolah: boolean;
  isFasilitator: boolean;
}

/**
 * Hook to evaluate permissions strictly based on server-verified role
 * stored in Firestore: schools/{schoolId}/members/{uid}.
 * Never relies on client-side localStorage for authorization!
 */
export function useCan(schoolIdOverride?: string): UseCanResult {
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  const schoolId = schoolIdOverride || getStoredActiveTenantId();
  const currentUser = auth.currentUser;

  useEffect(() => {
    if (!currentUser || !schoolId) {
      setRole(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const memberDocRef = doc(db, 'schools', schoolId, 'members', currentUser.uid);

    const unsubscribe = onSnapshot(
      memberDocRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const serverRole = data?.role as UserRole;
          if (['BENDAHARA', 'KEPALA_SEKOLAH', 'TIM_TEKNIS', 'FASILITATOR'].includes(serverRole)) {
            setRole(serverRole);
          } else {
            setRole(null);
          }
        } else {
          // If no member doc exists yet (e.g. freshly signed in or demo without member doc),
          // fallback role safely to null or FASILITATOR (read-only)
          setRole(null);
        }
        setLoading(false);
      },
      (error) => {
        console.warn('[useCan] Could not listen to member role from server:', error);
        setRole(null);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [schoolId, currentUser?.uid]);

  const can = (action: PermissionAction): boolean => {
    // Zero-Trust: If not verified from server or loading, deny write actions
    if (!role) {
      return false;
    }

    switch (action) {
      case 'create:transaction':
      case 'edit:transaction':
      case 'delete:transaction':
      case 'import:data':
      case 'edit:master_data':
        return role === 'BENDAHARA';

      case 'edit:progress':
      case 'edit:wages':
        return role === 'BENDAHARA' || role === 'TIM_TEKNIS';

      case 'approve:lpj':
        return role === 'KEPALA_SEKOLAH' || role === 'BENDAHARA';

      default:
        return false;
    }
  };

  return {
    can,
    role,
    loading,
    isBendahara: role === 'BENDAHARA',
    isTimTeknis: role === 'TIM_TEKNIS',
    isKepalaSekolah: role === 'KEPALA_SEKOLAH',
    isFasilitator: role === 'FASILITATOR',
  };
}
