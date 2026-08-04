import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export interface FirebaseInstance {
  auth: Auth;
  db: Firestore;
}

let instancePromise: Promise<FirebaseInstance> | null = null;

/**
 * Cached synchronously once the SDK has loaded, so the error reporter below can
 * read auth.currentUser without being made async.
 */
let cached: FirebaseInstance | null = null;

/**
 * Load and initialise Firebase on first use.
 *
 * The SDK is a large dependency and the app is fully usable signed out --
 * everything persists to IndexedDB locally. Importing it statically put auth
 * and firestore in the initial bundle for every visitor, including the ones who
 * never sign in. These dynamic imports let the bundler split it into its own
 * chunk that is fetched only when something actually touches Firebase.
 */
export function getFirebase(): Promise<FirebaseInstance> {
  if (!instancePromise) {
    instancePromise = (async () => {
      const [{ initializeApp }, { getAuth }, { getFirestore }] = await Promise.all([
        import('firebase/app'),
        import('firebase/auth'),
        import('firebase/firestore'),
      ]);
      const app = initializeApp(firebaseConfig);
      const instance: FirebaseInstance = {
        auth: getAuth(app),
        db: getFirestore(app, firebaseConfig.firestoreDatabaseId),
      };
      cached = instance;
      return instance;
    })().catch((e) => {
      // Allow a later attempt to retry rather than latching onto the rejection.
      instancePromise = null;
      throw e;
    });
  }
  return instancePromise;
}

/** True once the SDK is loaded, without triggering a load. */
export function isFirebaseLoaded(): boolean {
  return cached !== null;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  // Any Firestore error implies the SDK already loaded, so `cached` is set.
  const currentUser = cached?.auth.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid,
      email: currentUser?.email,
      emailVerified: currentUser?.emailVerified,
      isAnonymous: currentUser?.isAnonymous,
      tenantId: currentUser?.tenantId,
      providerInfo:
        currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
