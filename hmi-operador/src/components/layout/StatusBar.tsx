import { useEffect, useState } from 'react';
import { useConnectionStore } from '@/store/connectionStore';
import { DefconIndicator } from '@/components/tactical/DefconIndicator';
import { formatZulu, formatZuluTime } from '@/lib/time';
import { cn } from '@/lib/cn';
import { Wifi, WifiOff, Radio, Plane, ShieldCheck, ShieldAlert } from 'lucide-react';

export function StatusBar(): JSX.Element {
  const wsState = useConnectionStore((s) => s.wsState);
  const latency = useConnectionStore((s) => s.latencyMs);
  const status = useConnectionStore((s) => s.systemStatus);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const wsOk = wsState === 'open';
  const wsLabel =
    wsState === 'open'
      ? 'OPERATIVO'
      : wsState === 'connecting'
        ? 'CONECTANDO'
        : wsState === 'error'
          ? 'ERROR'
          : 'DESCONECTADO';

  return (
    <footer
      role="contentinfo"
      aria-label="Barra de estado del sistema"
      className="flex items-center justify-between gap-4 border-t border-border bg-bg-panel px-4 h-9 text-tactical-xs font-mono text-text-secondary"
      data-testid="status-bar"
    >
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5" aria-label={`WebSocket ${wsLabel}`}>
          {wsOk ? (
            <Wifi className="h-3.5 w-3.5 text-threat-neutral" aria-hidden />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-threat-hostile" aria-hidden />
          )}
          <span className={cn(wsOk ? 'text-threat-neutral' : 'text-threat-hostile')}>
            WS {wsLabel}
          </span>
          <span className="text-text-muted">{latency} ms</span>
        </div>
        <span className="text-text-muted">|</span>
        <div className="flex items-center gap-1.5" aria-label={`Sensores ${status.sensors_active} de ${status.sensors_total} activos`}>
          <Radio className="h-3.5 w-3.5 text-accent-cyan" aria-hidden />
          <span>
            SENSORES {status.sensors_active}/{status.sensors_total}
          </span>
        </div>
        <span className="text-text-muted">|</span>
        <div className="flex items-center gap-1.5" aria-label={`${status.interceptors_ready} interceptores listos de ${status.interceptors_total}`}>
          <Plane className="h-3.5 w-3.5 text-accent-cyan" aria-hidden />
          <span>
            INTERCEPTORES {status.interceptors_ready}/{status.interceptors_total}
          </span>
        </div>
        <span className="text-text-muted">|</span>
        <div className="flex items-center gap-1.5" aria-label={`Cadena audit ${status.audit_chain_ok ? 'OK' : 'COMPROMETIDA'}`}>
          {status.audit_chain_ok ? (
            <ShieldCheck className="h-3.5 w-3.5 text-threat-neutral" aria-hidden />
          ) : (
            <ShieldAlert className="h-3.5 w-3.5 text-threat-hostile" aria-hidden />
          )}
          <span className={cn(status.audit_chain_ok ? 'text-threat-neutral' : 'text-threat-hostile')}>
            AUDIT {status.audit_chain_ok ? 'OK' : 'BROKEN'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <DefconIndicator level={status.defcon} />
        <div className="text-right">
          <p className="text-text-primary font-bold text-tactical-sm" data-testid="zulu-clock">
            {formatZuluTime(now)}
          </p>
          <p className="text-tactical-xs text-text-muted">{formatZulu(now)}</p>
        </div>
      </div>
    </footer>
  );
}
