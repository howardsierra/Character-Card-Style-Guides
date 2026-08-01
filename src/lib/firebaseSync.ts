import { getFirebase } from './firebase';

/**
 * Thin path-based wrapper over the handful of Firestore operations this app
 * performs, all of which live under `users/{uid}/{collection}/{id}`.
 *
 * Routing them through here keeps `firebase/firestore` out of App.tsx's static
 * import graph -- the SDK is pulled in on first call and shared thereafter.
 */

/** Read every document in `users/{uid}/{collection}`. */
export async function fetchCollection(uid: string, collectionName: string): Promise<any[]> {
  const [{ db }, { collection, getDocs }] = await Promise.all([
    getFirebase(),
    import('firebase/firestore'),
  ]);
  const snap = await getDocs(collection(db, 'users', uid, collectionName));
  return snap.docs.map((d) => d.data());
}

/** Write `users/{uid}/{collection}/{id}`, merging by default. */
export async function writeDoc(
  uid: string,
  collectionName: string,
  id: string,
  data: Record<string, unknown>,
  options: { merge?: boolean } = {}
): Promise<void> {
  const [{ db }, { doc, setDoc }] = await Promise.all([
    getFirebase(),
    import('firebase/firestore'),
  ]);
  await setDoc(doc(db, 'users', uid, collectionName, id), data, { merge: options.merge ?? false });
}

/** Delete `users/{uid}/{collection}/{id}`. */
export async function removeDoc(uid: string, collectionName: string, id: string): Promise<void> {
  const [{ db }, { doc, deleteDoc }] = await Promise.all([
    getFirebase(),
    import('firebase/firestore'),
  ]);
  await deleteDoc(doc(db, 'users', uid, collectionName, id));
}

export async function signInWithGoogle(): Promise<void> {
  const [{ auth }, { signInWithPopup, GoogleAuthProvider }] = await Promise.all([
    getFirebase(),
    import('firebase/auth'),
  ]);
  await signInWithPopup(auth, new GoogleAuthProvider());
}

export async function signOutOfFirebase(): Promise<void> {
  const [{ auth }, { signOut }] = await Promise.all([
    getFirebase(),
    import('firebase/auth'),
  ]);
  await signOut(auth);
}
