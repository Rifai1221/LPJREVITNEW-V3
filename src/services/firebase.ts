import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
  disableNetwork,
  setLogLevel,
  type Firestore,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import firebaseConfigData from '../../firebase-applet-config.json';

// Suppress Firestore verbose SDK warnings when daily write quota is reached
try {
  setLogLevel('silent');
} catch {}

const firebaseConfig = {
  projectId: firebaseConfigData.projectId,
  appId: firebaseConfigData.appId,
  apiKey: firebaseConfigData.apiKey,
  authDomain: firebaseConfigData.authDomain,
  storageBucket: firebaseConfigData.storageBucket,
  messagingSenderId: firebaseConfigData.messagingSenderId,
};

// Initialize Firebase App singleton
export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Initialize Firestore with specific database ID and robust connection handling
export const firestoreDatabaseId = (firebaseConfigData as any).firestoreDatabaseId || '(default)';

let firestoreDb: Firestore;
try {
  firestoreDb = initializeFirestore(
    app,
    {
      experimentalForceLongPolling: true,
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    },
    firestoreDatabaseId
  );
} catch (e) {
  try {
    firestoreDb = initializeFirestore(
      app,
      {
        experimentalForceLongPolling: true,
        localCache: memoryLocalCache(),
      },
      firestoreDatabaseId
    );
  } catch {
    firestoreDb = getFirestore(app, firestoreDatabaseId);
  }
}

export const db = firestoreDb;

// If quota was previously marked as exhausted, disable Firestore network to prevent retry console logs
try {
  const until = localStorage.getItem('FIRESTORE_QUOTA_EXHAUSTED_UNTIL');
  if (until && Date.now() < Number(until)) {
    disableNetwork(db).catch(() => {});
  }
} catch {}

// Global window error listener for Firestore Quota / Resource-Exhausted errors
if (typeof window !== 'undefined') {
  const handleQuotaError = (error: any) => {
    const errMsg = String(error?.message || error?.reason?.message || error || '');
    if (
      errMsg.includes('resource-exhausted') ||
      errMsg.includes('Quota limit exceeded') ||
      errMsg.includes('Quota exceeded')
    ) {
      try {
        localStorage.setItem('FIRESTORE_QUOTA_EXHAUSTED_UNTIL', String(Date.now() + 24 * 60 * 60 * 1000));
        disableNetwork(db).catch(() => {});
      } catch {}
    }
  };

  window.addEventListener('unhandledrejection', (event) => {
    if (
      event?.reason?.message?.includes('resource-exhausted') ||
      event?.reason?.message?.includes('Quota limit exceeded')
    ) {
      handleQuotaError(event.reason);
      event.preventDefault(); // Suppress unhandled error popups in browser console
    }
  });

  window.addEventListener('error', (event) => {
    if (
      event?.message?.includes('resource-exhausted') ||
      event?.message?.includes('Quota limit exceeded')
    ) {
      handleQuotaError(event.error || event.message);
    }
  });
}

// Initialize Firebase Auth
export const auth = getAuth(app);
