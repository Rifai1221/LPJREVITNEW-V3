import {
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
} from 'firebase/auth';
import { auth } from './firebase';
import firebaseConfigData from '../../firebase-applet-config.json';

/**
 * Minimal Scopes strictly necessary for LPJ Spreadsheet & Drive Document Synchronization
 * - spreadsheets: read/write project spreadsheets
 * - drive.file: strictly restricted to files created or opened by this app (least privilege)
 */
export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
];

const provider = new GoogleAuthProvider();
WORKSPACE_SCOPES.forEach((scope) => provider.addScope(scope));
provider.setCustomParameters({
  prompt: 'select_account',
});

// IN-MEMORY TOKEN STORAGE ONLY (NEVER PERSISTED TO LOCALSTORAGE)
let inMemoryAccessToken: string | null = null;
let tokenExpiresAt: number = 0;
let isSigningIn = false;

// Legacy key cleanup to ensure no old access tokens linger on client disk
export const GOOGLE_AUTH_STORAGE_KEY = 'LPJ_GOOGLE_PERSISTENT_AUTH_SESSION_V1';
if (typeof window !== 'undefined') {
  try {
    localStorage.removeItem(GOOGLE_AUTH_STORAGE_KEY);
    localStorage.removeItem('LPJ_GOOGLE_ACCESS_TOKEN');
  } catch {}
}

export interface GoogleUserProfile {
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  uid: string;
}

let activeUser: GoogleUserProfile | null = null;

/**
 * Save access token strictly in RAM with expiration tracking
 */
export const setInMemoryAccessToken = (token: string | null, expiresInSeconds: number = 3500): void => {
  inMemoryAccessToken = token;
  tokenExpiresAt = token ? Date.now() + Math.max(300, expiresInSeconds - 60) * 1000 : 0;
};

/**
 * Check if the in-memory access token is present and still valid
 */
export const isTokenValid = (): boolean => {
  return Boolean(inMemoryAccessToken && Date.now() < tokenExpiresAt);
};

/**
 * Clear in-memory token on logout
 */
export const clearPersistentAuthSession = (): void => {
  inMemoryAccessToken = null;
  tokenExpiresAt = 0;
  activeUser = null;
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(GOOGLE_AUTH_STORAGE_KEY);
    } catch {}
  }
};

/**
 * Compatibility stub that ensures no token is returned from localStorage
 */
export const loadPersistentAuthSession = async (): Promise<GoogleUserProfile | null> => null;
export const savePersistentAuthSession = (token: string, user: GoogleUserProfile, expiresInSeconds: number = 3600) => {
  setInMemoryAccessToken(token, expiresInSeconds);
  activeUser = user;
};

/**
 * Initialize auth listener. Call on app load.
 */
export const initAuth = (
  onAuthSuccess?: (user: GoogleUserProfile, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      activeUser = {
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
        uid: user.uid,
      };

      if (isTokenValid() && inMemoryAccessToken) {
        if (onAuthSuccess) onAuthSuccess(activeUser, inMemoryAccessToken);
      } else {
        // Token in memory is not present or expired
        if (onAuthSuccess && inMemoryAccessToken) {
          onAuthSuccess(activeUser, inMemoryAccessToken);
        } else if (!isSigningIn && onAuthFailure) {
          onAuthFailure();
        }
      }
    } else {
      inMemoryAccessToken = null;
      tokenExpiresAt = 0;
      activeUser = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

/**
 * Direct Google Identity Services (GIS) Token Request
 * Keeps token strictly in RAM
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

          const expiresIn = response.expires_in ? Number(response.expires_in) : 3600;
          setInMemoryAccessToken(token, expiresIn);

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
 * Saves access token in memory only.
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

      const token = credential.accessToken;
      setInMemoryAccessToken(token, 3600);
      activeUser = {
        displayName: result.user.displayName,
        email: result.user.email,
        photoURL: result.user.photoURL,
        uid: result.user.uid,
      };
      return { user: activeUser, accessToken: token };
    } catch (firebaseErr: any) {
      const errMsg = String(firebaseErr?.message || firebaseErr || '');
      const errCode = String(firebaseErr?.code || '');

      // Fallback to GIS if Firebase Auth domain restrictions apply
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
 * Get current in-memory access token. If expired or missing, requests a renewal.
 */
export const getAccessToken = async (): Promise<string | null> => {
  if (isTokenValid() && inMemoryAccessToken) {
    return inMemoryAccessToken;
  }

  // If token expired but user is authenticated, attempt GIS renewal
  if (activeUser) {
    try {
      const res = await signInWithGis();
      return res.accessToken;
    } catch (err) {
      console.warn('[Google Auth] Token kadaluwarsa dan gagal diperbarui otomatis:', err);
    }
  }

  return inMemoryAccessToken;
};

/**
 * Sign out and clear in-memory token.
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
