import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Copy, RefreshCw, Bug } from 'lucide-react';
import { useConnectionStore } from '@/store/connectionStore';

export type ErrorSeverity = 'critical' | 'component';

interface Props {
  children: ReactNode;
  severity?: ErrorSeverity;
  fallbackMessage?: string;
}

interface State {
  error: Error | null;
  errorInfo: ErrorInfo | null;
  countdown: number;
}

const AUTO_RECOVERY_DELAY_MS = 30_000;
const COUNTDOWN_TICK_MS = 1_000;

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, errorInfo: null, countdown: AUTO_RECOVERY_DELAY_MS };
  private timer: number | null = null;

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ errorInfo: info });

    // Log structured error to connectionStore
    try {
      useConnectionStore.getState().setSystemStatus({
        defcon: 4,
        ws_health: 'DEGRADED',
        latency_ms: 0,
        sensors_active: 0,
        sensors_total: 0,
        interceptors_ready: 0,
        interceptors_total: 0,
        audit_chain_ok: false,
      });
    } catch {
      // Silently fail if store is not available
    }

    this.startAutoRecovery();
  }

  componentWillUnmount(): void {
    this.stopAutoRecovery();
  }

  private startAutoRecovery(): void {
    this.stopAutoRecovery();
    this.setState({ countdown: AUTO_RECOVERY_DELAY_MS });
    this.timer = window.setInterval(() => {
      this.setState(
        (prev) => ({ countdown: prev.countdown - COUNTDOWN_TICK_MS }),
        () => {
          if (this.state.countdown <= 0) {
            this.stopAutoRecovery();
            this.reset();
          }
        },
      );
    }, COUNTDOWN_TICK_MS);
  }

  private stopAutoRecovery(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  reset = (): void => {
    this.stopAutoRecovery();
    this.setState({ error: null, errorInfo: null, countdown: AUTO_RECOVERY_DELAY_MS });
  };

  handleReportError = (): void => {
    const { error, errorInfo } = this.state;
    if (!error) return;
    const stack = error.stack ?? 'No stack trace available';
    const componentStack = errorInfo?.componentStack ?? '';
    const report = [
      `=== CUPULA CELESTIAL - ERROR REPORT ===`,
      `Time: ${new Date().toISOString()}`,
      `Message: ${error.message}`,
      `Stack:\n${stack}`,
      componentStack ? `Component Stack:\n${componentStack}` : '',
      `=========================================`,
    ].join('\n');
    navigator.clipboard.writeText(report).catch(() => {});
  };

  render(): ReactNode {
    if (this.state.error) {
      const severity = this.props.severity ?? 'critical';
      const sec = Math.ceil(this.state.countdown / 1000);

      if (severity === 'critical') {
        return (
          <div className="min-h-screen flex items-center justify-center bg-bg-base p-6">
            <Alert variant="critical" className="max-w-2xl">
              <AlertTriangle aria-hidden />
              <AlertTitle>Fallo de UI no recuperable</AlertTitle>
              <AlertDescription>
                <p className="mb-2 font-mono text-tactical-sm">{this.state.error.message}</p>
                <div className="flex gap-2 mt-3">
                  <Button variant="tactical" size="sm" onClick={this.reset}>
                    <RefreshCw className="h-3.5 w-3.5 mr-1" aria-hidden />
                    Reintentar ({sec}s)
                  </Button>
                  <Button variant="outline" size="sm" onClick={this.handleReportError}>
                    <Copy className="h-3.5 w-3.5 mr-1" aria-hidden />
                    Reportar error
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          </div>
        );
      }

      // Component-level error boundary: hide just this component
      return (
        <div className="border border-threat-hostile/40 bg-threat-hostile-bg/20 rounded-md p-3 m-2" role="alert">
          <div className="flex items-start gap-2">
            <Bug className="h-4 w-4 text-threat-hostile mt-0.5" aria-hidden />
            <div className="flex-1">
              <p className="text-tactical-xs font-mono text-threat-hostile font-bold uppercase tracking-wider">
                Error de componente
              </p>
              <p className="text-tactical-xs font-mono text-text-secondary mt-1">
                {this.props.fallbackMessage ?? this.state.error.message}
              </p>
              <div className="flex gap-2 mt-2">
                <Button variant="ghost" size="sm" onClick={this.reset}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" aria-hidden />
                  Reintentar
                </Button>
                <Button variant="ghost" size="sm" onClick={this.handleReportError}>
                  <Copy className="h-3.5 w-3.5 mr-1" aria-hidden />
                  Copiar error
                </Button>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
