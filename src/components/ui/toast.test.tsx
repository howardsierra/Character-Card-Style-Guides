import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastViewport, inferVariant, useToasts } from './toast';

describe('inferVariant', () => {
  it.each([
    ['Failed to import data.', 'error'],
    ['Could not read fields from this template', 'error'],
    ['Please select a style guide first.', 'error'],
    ['Imported 3 character card(s)!', 'success'],
    ['Image saved to character card!', 'success'],
  ])('classifies %j as %s', (message, expected) => {
    expect(inferVariant(message)).toBe(expected);
  });

  it('falls back to info for neutral copy', () => {
    expect(inferVariant('Synthesis started.')).toBe('info');
  });
});

describe('useToasts', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('queues multiple toasts and keeps their order', () => {
    const { result } = renderHook(() => useToasts());

    act(() => {
      result.current.notify('first');
      result.current.notify('second');
    });

    expect(result.current.toasts.map((t) => t.message)).toEqual(['first', 'second']);
  });

  it('ignores an empty message', () => {
    const { result } = renderHook(() => useToasts());

    act(() => {
      result.current.notify('');
    });

    expect(result.current.toasts).toHaveLength(0);
  });

  it('auto-dismisses, and keeps errors on screen longer than successes', () => {
    const { result } = renderHook(() => useToasts());

    act(() => {
      result.current.notify('Saved successfully');
      result.current.notify('Failed to save');
    });
    expect(result.current.toasts).toHaveLength(2);

    // Past the standard lifetime: the success is gone, the error remains.
    act(() => void vi.advanceTimersByTime(6500));
    expect(result.current.toasts.map((t) => t.message)).toEqual(['Failed to save']);

    act(() => void vi.advanceTimersByTime(3000));
    expect(result.current.toasts).toHaveLength(0);
  });

  it('dismisses on demand without disturbing the others', () => {
    const { result } = renderHook(() => useToasts());

    let firstId: number | undefined;
    act(() => {
      firstId = result.current.notify('first') as number;
      result.current.notify('second');
    });

    act(() => result.current.dismiss(firstId!));

    expect(result.current.toasts.map((t) => t.message)).toEqual(['second']);
  });

  it('honours an explicit variant over the inferred one', () => {
    const { result } = renderHook(() => useToasts());

    act(() => {
      // Copy reads like an error but the caller knows it is a success.
      result.current.notify('No longer failing', 'success');
    });

    expect(result.current.toasts[0].variant).toBe('success');
  });
});

describe('ToastViewport', () => {
  it('renders messages in a polite live region so they are announced', async () => {
    render(
      <ToastViewport
        toasts={[{ id: 1, message: 'Could not reach the provider', variant: 'error' }]}
        onDismiss={() => {}}
      />
    );

    const region = document.querySelector('[aria-live="polite"]');
    expect(region).not.toBeNull();
    await waitFor(() => expect(screen.getByText('Could not reach the provider')).toBeTruthy());
  });

  it('exposes a labelled dismiss control', async () => {
    const onDismiss = vi.fn();
    render(
      <ToastViewport toasts={[{ id: 7, message: 'hi', variant: 'info' }]} onDismiss={onDismiss} />
    );

    const btn = await screen.findByRole('button', { name: /dismiss notification/i });
    act(() => btn.click());

    expect(onDismiss).toHaveBeenCalledWith(7);
  });
});
