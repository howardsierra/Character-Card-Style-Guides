import type { User } from 'firebase/auth';
import { useCallback, useEffect, useState } from 'react';

import { getFirebase } from '../lib/firebase';

/**
 * Our own record of "this browser has signed in before". Firebase keeps its
 * session in IndexedDB, but reading that would mean loading the SDK -- the very
 * thing we are trying to avoid -- so we track the hint ourselves.
 */
const AUTH_HINT_KEY = 'st_firebase_session';

function readHint(): boolean {
  try {
    return localStorage.getItem(AUTH_HINT_KEY) === '1';
  } catch {
    return false;
  }
}

function writeHint(signedIn: boolean) {
  try {
    if (signedIn) localStorage.setItem(AUTH_HINT_KEY, '1');
    else localStorage.removeItem(AUTH_HINT_KEY);
  } catch {
    /* storage unavailable; the hint is only an optimisation */
  }
}

/** Run once the browser is idle, falling back where unsupported. */
function onIdle(fn: () => void, timeout = 2000): () => void {
  const ric = (window as any).requestIdleCallback as
    | ((cb: () => void, opts?: { timeout: number }) => number)
    | undefined;
  if (ric) {
    const handle = ric(fn, { timeout });
    return () => (window as any).cancelIdleCallback?.(handle);
  }
  const handle = setTimeout(fn, 1);
  return () => clearTimeout(handle);
}

/**
 * Replacement for react-firebase-hooks' useAuthState that keeps the SDK out of
 * the initial bundle.
 *
 * Firebase is only fetched when it can actually do something: either this
 * browser has signed in before (so there is a session worth restoring), or the
 * user explicitly asks to sign in via `ensureAuth`. A first-time visitor never
 * downloads it -- the app is fully functional signed out, persisting everything
 * locally. When a session does exist, the load is deferred to idle so it never
 * competes with first paint.
 *
 * @returns [user, loading, ensureAuth]
 */
export function useFirebaseAuth(): readonly [User | null, boolean, () => void] {
  const [user, setUser] = useState<User | null>(null);
  // Only claim to be loading when there is in fact something to restore.
  const [enabled, setEnabled] = useState<boolean>(readHint);
  const [loading, setLoading] = useState<boolean>(readHint);

  const ensureAuth = useCallback(() => setEnabled(true), []);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    const cancelIdle = onIdle(() => {
      (async () => {
        const [{ auth }, { onAuthStateChanged }] = await Promise.all([
          getFirebase(),
          import('firebase/auth'),
        ]);
        if (cancelled) return;
        unsubscribe = onAuthStateChanged(
          auth,
          (u) => {
            setUser(u);
            setLoading(false);
            // Keep the hint honest so a signed-out browser stops paying for the
            // SDK on subsequent visits.
            writeHint(!!u);
          },
          (err) => {
            console.error('Auth state subscription failed', err);
            setLoading(false);
          }
        );
      })().catch((err) => {
        // Offline, blocked or misconfigured: the app works signed out, so
        // settle rather than spinning forever.
        console.error('Failed to initialise Firebase auth', err);
        if (!cancelled) setLoading(false);
      });
    });

    return () => {
      cancelled = true;
      cancelIdle();
      unsubscribe?.();
    };
  }, [enabled]);

  return [user, loading, ensureAuth] as const;
}
