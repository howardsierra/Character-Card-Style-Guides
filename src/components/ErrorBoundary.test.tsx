import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorBoundary } from './ErrorBoundary';

function Boom({ shouldThrow }: { shouldThrow: boolean }): React.ReactElement {
  if (shouldThrow) throw new Error('universeData.nodes is undefined');
  return <p>rendered fine</p>;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // React logs the caught error; keep the test output readable.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <Boom shouldThrow={false} />
      </ErrorBoundary>
    );

    expect(screen.getByText('rendered fine')).toBeTruthy();
  });

  it('catches a render throw instead of unmounting the tree', () => {
    render(
      <ErrorBoundary>
        <Boom shouldThrow />
      </ErrorBoundary>
    );

    expect(screen.getByText(/something broke/i)).toBeTruthy();
  });

  it('shows the underlying message so the failure is diagnosable', () => {
    render(
      <ErrorBoundary>
        <Boom shouldThrow />
      </ErrorBoundary>
    );

    expect(screen.getByText(/universeData\.nodes is undefined/)).toBeTruthy();
  });

  it('reassures the user that saved work survives a reload', () => {
    render(
      <ErrorBoundary>
        <Boom shouldThrow />
      </ErrorBoundary>
    );

    expect(screen.getByRole('button', { name: /reload the page/i })).toBeTruthy();
    expect(screen.getByText(/should still be intact/i)).toBeTruthy();
  });
});
