import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useHistory } from './useHistory';

// A short debounce keeps these deterministic without fake timers, which are
// awkward to combine with React's act() scheduling.
const DEBOUNCE = 10;

/** Apply a value and let the debounced history commit land. */
async function commit<T>(
  result: { current: readonly [T, (v: T | ((p: T) => T)) => void, any] },
  value: T
) {
  act(() => {
    result.current[1](value);
  });
  await waitFor(() => expect(result.current[0]).toEqual(value));
  // Give the debounce window room to push the entry onto the stack.
  await act(async () => {
    await new Promise((r) => setTimeout(r, DEBOUNCE * 3));
  });
}

describe('useHistory', () => {
  it('starts with the initial state and nothing to undo or redo', () => {
    const { result } = renderHook(() => useHistory({ name: '' }, DEBOUNCE));

    expect(result.current[0]).toEqual({ name: '' });
    expect(result.current[2].canUndo).toBe(false);
    expect(result.current[2].canRedo).toBe(false);
  });

  it('steps back and forward through discrete edits', async () => {
    const { result } = renderHook(() => useHistory('', DEBOUNCE));

    for (const value of ['Alpha', 'Beta', 'Gamma']) {
      await commit(result, value);
    }
    expect(result.current[0]).toBe('Gamma');

    act(() => result.current[2].undo());
    await waitFor(() => expect(result.current[0]).toBe('Beta'));

    act(() => result.current[2].undo());
    await waitFor(() => expect(result.current[0]).toBe('Alpha'));

    act(() => result.current[2].redo());
    await waitFor(() => expect(result.current[0]).toBe('Beta'));
  });

  it('collapses edits made inside one debounce window into a single entry', async () => {
    const { result } = renderHook(() => useHistory('', DEBOUNCE));

    await commit(result, 'first');

    // Three rapid keystrokes, no pause between them.
    act(() => {
      result.current[1]('a');
      result.current[1]('ab');
      result.current[1]('abc');
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, DEBOUNCE * 3));
    });
    expect(result.current[0]).toBe('abc');

    // One undo should clear the whole burst, not just the last keystroke.
    act(() => result.current[2].undo());
    await waitFor(() => expect(result.current[0]).toBe('first'));
  });

  it('discards the redo branch once a new edit is made after undoing', async () => {
    const { result } = renderHook(() => useHistory('', DEBOUNCE));

    await commit(result, 'one');
    await commit(result, 'two');

    act(() => result.current[2].undo());
    await waitFor(() => expect(result.current[0]).toBe('one'));
    expect(result.current[2].canRedo).toBe(true);

    await commit(result, 'branched');

    await waitFor(() => expect(result.current[2].canRedo).toBe(false));
    act(() => result.current[2].redo());
    expect(result.current[0]).toBe('branched');
  });

  it('ignores a set() that does not change the value', async () => {
    const { result } = renderHook(() => useHistory('same', DEBOUNCE));

    await act(async () => {
      result.current[1]('same');
      await new Promise((r) => setTimeout(r, DEBOUNCE * 3));
    });

    expect(result.current[2].canUndo).toBe(false);
  });
});
