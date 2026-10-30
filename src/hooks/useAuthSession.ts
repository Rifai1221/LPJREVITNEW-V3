import { useState, useEffect } from 'react';
import {
  initAuth,
  googleSignIn,
  logoutGoogle,
  GoogleUserProfile,
  getCurrentUser,
  loadPersistentAuthSession,
} from '../services/googleAuthService';
import {
  LocalUserSession,
  getLocalUserSession,
  clearLocalUserSession,
  setLocalUserSession,
} from '../utils/authHelper';
import { useToast } from '../context/ToastContext';

export function useAuthSession() {
  const toast = useToast();
  const [localSession, setLocalSession] = useState<LocalUserSession | null>(() => getLocalUserSession());
  const [currentUser, setCurrentUser] = useState<GoogleUserProfile | null>(() => getCurrentUser() || null);
  const [isSigningInGoogle, setIsSigningInGoogle] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    try {
      const active = localStorage.getItem('LPJ_USER_SESSION_ACTIVE');
      return active === 'true' || !!getLocalUserSession();
    } catch {
      return false;
    }
  });

  useEffect(() => {
    initAuth();
    loadPersistentAuthSession().then((u) => {
      if (u) {
        setCurrentUser(u);
        setIsLoggedIn(true);
        try {
          localStorage.setItem('LPJ_USER_SESSION_ACTIVE', 'true');
        } catch {}
      }
    });
  }, []);

  const handleGoogleLogin = async () => {
    setIsSigningInGoogle(true);
    try {
      const res = await googleSignIn();
      if (res && res.user) {
        setCurrentUser(res.user);
        setIsLoggedIn(true);
        try {
          localStorage.setItem('LPJ_USER_SESSION_ACTIVE', 'true');
        } catch {}
        toast.success(`Selamat datang, ${res.user.displayName || res.user.email || 'Pengguna'}! Login Google berhasil.`);
      }
    } catch (err: any) {
      console.error('Google Sign-In failed:', err);
      toast.error('Gagal login Google: ' + (err?.message || 'Akses ditolak atau pop-up dibatalkan.'));
    } finally {
      setIsSigningInGoogle(false);
    }
  };

  const handleLocalLogin = (session: LocalUserSession) => {
    setLocalUserSession(session);
    setLocalSession(session);
    setIsLoggedIn(true);
    try {
      localStorage.setItem('LPJ_USER_SESSION_ACTIVE', 'true');
    } catch {}
    toast.success(`Selamat datang! Anda masuk sebagai ${session.roleLabel}.`);
  };

  const handleLogout = () => {
    clearLocalUserSession();
    logoutGoogle();
    setLocalSession(null);
    setCurrentUser(null);
    setIsLoggedIn(false);
    try {
      localStorage.removeItem('LPJ_USER_SESSION_ACTIVE');
    } catch {}
    toast.info('Anda telah keluar dari aplikasi.');
  };

  return {
    localSession,
    currentUser,
    isSigningInGoogle,
    isLoggedIn,
    handleGoogleLogin,
    handleLocalLogin,
    handleLogout,
  };
}
