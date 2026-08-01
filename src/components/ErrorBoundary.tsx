import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Without a boundary, any throw during render unmounts the whole tree and
 * leaves a blank white page with the user's unsaved work still in memory but
 * unreachable. Their guides, cards and drafts are persisted separately, so a
 * reload recovers them -- this screen exists to say so rather than to retry.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled render error:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-8 shadow-lg">
          <h1 className="mb-3 font-serif text-3xl font-light tracking-tight text-slate-900">
            Something broke
          </h1>
          <p className="mb-6 text-sm leading-relaxed text-slate-500">
            An unexpected error interrupted the page. Your saved guides, cards and templates are
            stored separately and should still be intact after reloading.
          </p>

          <pre className="mb-6 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl border border-border bg-background p-4 font-mono text-xs text-slate-600">
            {error.message || String(error)}
          </pre>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => window.location.reload()}
              className="rounded-xl bg-primary-solid px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:brightness-110 active:scale-[0.98]"
            >
              Reload the page
            </button>
            <button
              onClick={() => this.setState({ error: null })}
              className="rounded-xl border border-border px-5 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-background"
            >
              Try to continue
            </button>
          </div>
        </div>
      </div>
    );
  }
}
