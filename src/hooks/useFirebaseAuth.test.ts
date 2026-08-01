import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getFirebase = vi.fn();
const onAuthStateChanged = vi.fn();

vi.mock('../lib/firebase', () => ({ getFirebase: (...a: any[]) => getFirebase(...a) }));
vi.mock('firebase/auth', () => ({ onAuthStateChanged: (...a: any[]) => onAuthStateChanged(...a) }));

import { useFirebaseAuth } from './useFirebaseAuth';

const HINT = 'st_firebase_session';

describe('useFirebaseAuth', () => {
  beforeEach(() => {
    localStorage.clear();
    getFirebase.mockReset().mockResolvedValue({ auth: {}, db: {} });
    onAuthStateChanged.mockReset().mockReturnValue(() => {});
  });
  afterEach(() => localStorage.clear());

  it('does not load Firebase for a browser that has never signed in', async () => {
    const { result } = renderHook(() => useFirebaseAuth());

    // Settled immediately: there is no session to wait for.
    expect(result.current[1]).toBe(false);
    await new Promise((r) => setTimeout(r, 50));
    expect(getFirebase).not.toHaveBeenCalled();
  });

  it('restores a session when this browser has signed in before', async () => {
    localStorage.setItem(HINT, '1');
    const { result } = renderHook(() => useFirebaseAuth());

    expect(result.current[1]).toBe(true); // loading, since a session may exist
    await waitFor(() => expect(getFirebase).toHaveBeenCalled());

    const user = { uid: 'u1' };
    act(() => onAuthStateChanged.mock.calls[0][1](user));

    await waitFor(() => expect(result.current[0]).toEqual(user));
    expect(result.current[1]).toBe(false);
  });

  it('loads Firebase on demand when the user asks to sign in', async () => {
    const { result } = renderHook(() => useFirebaseAuth());
    expect(getFirebase).not.toHaveBeenCalled();

    act(() => result.current[2]()); // ensureAuth

    await waitFor(() => expect(getFirebase).toHaveBeenCalled());
  });

  it('clears the hint on sign-out so later visits skip the SDK', async () => {
    localStorage.setItem(HINT, '1');
    renderHook(() => useFirebaseAuth());
    await waitFor(() => expect(onAuthStateChanged).toHaveBeenCalled());

    act(() => onAuthStateChanged.mock.calls[0][1](null));

    await waitFor(() => expect(localStorage.getItem(HINT)).toBeNull());
  });

  it('stops loading when the SDK fails to initialise', async () => {
    localStorage.setItem(HINT, '1');
    getFirebase.mockRejectedValue(new Error('offline'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useFirebaseAuth());

    // The app is usable signed out, so it must settle rather than spin.
    await waitFor(() => expect(result.current[1]).toBe(false));
    expect(result.current[0]).toBeNull();
  });
});
