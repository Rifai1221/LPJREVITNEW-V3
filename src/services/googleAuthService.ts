import {
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
} from 'firebase/auth';
import { auth } from './firebase';
import firebaseConfigData from '../../firebase-applet-config.json';

export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
];

const provider = new GoogleAuthProvider();
WORKSPACE_SCOPES.forEach((scope) => provider.addScope(scope));

// Prompt select account so user can pick the right account
provider.setCustomParameters({
  prompt: 'select_account',
});

// Flag to indicate if we are in the middle of a sign-in flow.
let isSigningIn = false;
// Cache the access token in memory with persistent session fallback
let cachedAccessToken: string | null = null;

export const GOOGLE_AUTH_STORAGE_KEY = 'LPJ_GOOGLE_PERSISTENT_AUTH_SESSION_V1';

export interface PersistentAuthSession {
  accessToken: string;
  expiresAt: number; // timestamp in ms
  user: GoogleUserProfile;
}

export const loadPersistentAuthSession = (): PersistentAuthSession | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(GOOGLE_AUTH_STORAGE_KEY);
    if (!raw) return null;
    const data: PersistentAuthSession = JSON.parse(raw);
    // If not expired (buffer 30 seconds)
    if (data && data.accessToken && data.expiresAt > Date.now() + 30000) {
      return data;
    }
  } catch (err) {
    console.warn('[Google Auth] Gagal membaca sesi login persisten:', err);
  }
  return null;
};

export const savePersistentAuthSession = (
  token: string,
  user: GoogleUserProfile,
  expiresInSeconds: number = 3600
): void => {
  if (typeof window === 'undefined') return;
  try {
    const session: PersistentAuthSession = {
      accessToken: token,
      expiresAt: Date.now() + Math.max(3600, expiresInSeconds) * 1000,
      user,
    };
    localStorage.setItem(GOOGLE_AUTH_STORAGE_KEY, JSON.stringify(session));
    cachedAccessToken = token;
    activeUser = user;
  } catch (err) {
    console.warn('[Google Auth] Gagal menyimpan sesi login persisten:', err);
  }
};

export const clearPersistentAuthSession = (): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(GOOGLE_AUTH_STORAGE_KEY);
  } catch {}
  cachedAccessToken = null;
  activeUser = null;
};

export interface GoogleUserProfile {
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  uid: string;
}

let activeUser: GoogleUserProfile | null = null;

/**
 * Initialize auth listener. Call on app load.
 * Auto-restores persistent Google Drive connection immediately!
 */
export const initAuth = (
  onAuthSuccess?: (user: GoogleUserProfile, token: string) => void,
  onAuthFailure?: () => void
) => {
  // 1. Immediately check persistent session from storage to prevent drop on refresh
  const saved = loadPersistentAuthSession();
  if (saved) {
    cachedAccessToken = saved.accessToken;
    activeUser = saved.user;
    if (onAuthSuccess) {
      onAuthSuccess(saved.user, saved.accessToken);
    }
  }

  // 2. Listen to Firebase Auth state
  return onAuthStateChanged(auth, async (user: User | null) => {
    const currentSaved = loadPersistentAuthSession();
    if (user) {
      activeUser = {
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
        uid: user.uid,
      };
      if (currentSaved) {
        cachedAccessToken = currentSaved.accessToken;
        savePersistentAuthSession(currentSaved.accessToken, activeUser, Math.max(1800, Math.round((currentSaved.expiresAt - Date.now()) / 1000)));
        if (onAuthSuccess) onAuthSuccess(activeUser, cachedAccessToken);
      } else if (cachedAccessToken) {
        savePersistentAuthSession(cachedAccessToken, activeUser, 3600);
        if (onAuthSuccess) onAuthSuccess(activeUser, cachedAccessToken);
      } else if (!isSigningIn) {
        if (onAuthFailure) onAuthFailure();
      }
    } else if (currentSaved) {
      cachedAccessToken = currentSaved.accessToken;
      activeUser = currentSaved.user;
      if (onAuthSuccess) onAuthSuccess(activeUser, cachedAccessToken);
    } else if (activeUser && cachedAccessToken) {
      if (onAuthSuccess) onAuthSuccess(activeUser, cachedAccessToken);
    } else {
      if (!currentSaved) {
        cachedAccessToken = null;
        activeUser = null;
        if (onAuthFailure) onAuthFailure();
      }
    }
  });
};

/**
 * Direct Google Identity Services (GIS) Token Request
 * Does not depend on Firebase Auth authorized domains
 */
export const signInWithGis = async (): Promise<{ user: GoogleUserProfile; accessToken: string }> => {
  const clientId = (firebaseConfigData as any).oAuthClientId || '';
  if (!clientId) {
    throw new Error('OAuth Client ID belum dikonfigurasi di firebase-applet-config.json');
  }

  // Ensure GIS script is ready
  if (typeof window !== 'undefined' && !(window as any).google?.accounts?.oauth2) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Gagal memuat Google Identity Services script'));
      document.head.appendChild(script);
    });
  }

  return new Promise((resolve, reject) => {
    try {
      const googleObj = (window as any).google;
      if (!googleObj?.accounts?.oauth2) {
        throw new Error('Google Identity Services tidak tersedia di browser.');
      }

      const client = googleObj.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: WORKSPACE_SCOPES.join(' '),
        callback: async (response: any) => {
          if (response.error) {
            reject(new Error(response.error_description || response.error));
            return;
          }

          const token = response.access_token;
          if (!token) {
            reject(new Error('Gagal menerima token dari Google.'));
            return;
          }

          cachedAccessToken = token;

          // Fetch user profile from Google userinfo API
          let profile: GoogleUserProfile = {
            displayName: 'Pengguna Google',
            email: 'Google Drive Terhubung',
            photoURL: null,
            uid: `gis-${Date.now()}`,
          };

          try {
            const uRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (uRes.ok) {
              const uData = await uRes.json();
              profile = {
                displayName: uData.name || uData.email,
                email: uData.email,
                photoURL: uData.picture || null,
                uid: uData.sub || profile.uid,
              };
            }
          } catch {}

          activeUser = profile;
          savePersistentAuthSession(token, profile, 3600);
          resolve({ user: profile, accessToken: token });
        },
      });

      client.requestAccessToken({ prompt: 'select_account' });
    } catch (err: any) {
      reject(err);
    }
  });
};

/**
 * Trigger Google Sign In popup with Google Sheets & Drive scopes.
 * Tries Firebase Auth popup first; automatically falls back to Google Identity Services (GIS)
 * if unauthorized-domain or domain configuration occurs.
 */
export const googleSignIn = async (): Promise<{ user: GoogleUserProfile; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    try {
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.accessToken) {
        throw new Error('Gagal mendapatkan token akses dari Google.');
      }
      cachedAccessToken = credential.accessToken;
      activeUser = {
        displayName: result.user.displayName,
        email: result.user.email,
        photoURL: result.user.photoURL,
        uid: result.user.uid,
      };
      savePersistentAuthSession(cachedAccessToken, activeUser, 3600);
      return { user: activeUser, accessToken: cachedAccessToken };
    } catch (firebaseErr: any) {
      const errMsg = String(firebaseErr?.message || firebaseErr || '');
      const errCode = String(firebaseErr?.code || '');

      // If Firebase Auth fails due to unauthorized-domain or popup restrictions,
      // fallback smoothly to Google Identity Services (GIS)
      if (
        errCode === 'auth/unauthorized-domain' ||
        errMsg.includes('unauthorized-domain') ||
        errCode === 'auth/operation-not-allowed'
      ) {
        console.info('[Google Auth] Menggunakan Google Identity Services sebagai alternatif terverifikasi...');
        return await signInWithGis();
      }

      throw firebaseErr;
    }
  } catch (error: any) {
    console.error('Google Sign In error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

/**
 * Get current in-memory access token (auto-restored from persistent session).
 */
export const getAccessToken = async (): Promise<string | null> => {
  if (cachedAccessToken) return cachedAccessToken;
  const saved = loadPersistentAuthSession();
  if (saved) {
    cachedAccessToken = saved.accessToken;
    activeUser = saved.user;
    return cachedAccessToken;
  }
  return null;
};

/**
 * Set in-memory access token.
 */
export const setCachedAccessToken = (token: string | null) => {
  cachedAccessToken = token;
};

/**
 * Sign out and clear cached token and persistent session.
 */
export const logoutGoogle = async (): Promise<void> => {
  try {
    await signOut(auth);
  } finally {
    clearPersistentAuthSession();
  }
};

/**
 * Get current active user.
 */
export const getCurrentUser = (): GoogleUserProfile | null => {
  if (activeUser) return activeUser;
  if (auth.currentUser) {
    return {
      displayName: auth.currentUser.displayName,
      email: auth.currentUser.email,
      photoURL: auth.currentUser.photoURL,
      uid: auth.currentUser.uid,
    };
  }
  return null;
};
