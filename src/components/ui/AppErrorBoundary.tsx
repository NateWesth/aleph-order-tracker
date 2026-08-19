import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Application render failure", error, info.componentStack);
  }

  private reload = () => window.location.reload();

  private returnHome = () => {
    window.location.assign("/admin-dashboard");
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="grid min-h-[100dvh] place-items-center bg-background p-5 text-foreground safe-area-insets">
        <section className="relative w-full max-w-xl overflow-hidden rounded-[2rem] border border-border/70 bg-card p-6 shadow-2xl sm:p-9">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-500 via-primary to-emerald-500" />
          <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-amber-500/12 text-amber-600 ring-1 ring-amber-500/25 dark:text-amber-300">
            <AlertTriangle className="h-7 w-7" />
          </div>
          <p className="mb-2 text-xs font-black uppercase tracking-[0.2em] text-primary">Safe recovery</p>
          <h1 className="font-display text-2xl font-black tracking-tight sm:text-3xl">This workspace hit an unexpected problem</h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
            Your saved orders are safe. Reload the current workspace, or return to the dashboard and continue working.
          </p>
          {import.meta.env.DEV && (
            <pre className="mt-4 max-h-32 overflow-auto rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
              {this.state.error.message}
            </pre>
          )}
          <div className="mt-7 flex flex-col gap-2 sm:flex-row">
            <button onClick={this.reload} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition hover:-translate-y-0.5">
              <RefreshCw className="h-4 w-4" /> Reload workspace
            </button>
            <button onClick={this.returnHome} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-background px-5 text-sm font-bold transition hover:bg-muted">
              <Home className="h-4 w-4" /> Return to dashboard
            </button>
          </div>
        </section>
      </main>
    );
  }
}
