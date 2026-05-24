import { useAlertStore } from '@/store/alertStore';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Info, X } from 'lucide-react';
import type { AlertMessage } from '@/types/api';

export function AlertBanner(): JSX.Element | null {
  const alerts = useAlertStore((s) => s.alerts);
  const ack = useAlertStore((s) => s.ack);
  const top = alerts[0];
  if (!top) return null;
  return (
    <div role="region" aria-label="Alertas del sistema" className="space-y-2">
      <SingleAlert a={top} onAck={() => ack(top.alert_id)} />
    </div>
  );
}

function SingleAlert({ a, onAck }: { a: AlertMessage; onAck(): void }): JSX.Element {
  const variant = a.severity === 'CRITICAL' ? 'critical' : a.severity === 'WARNING' ? 'warning' : 'info';
  return (
    <Alert variant={variant} className="flex items-start gap-3 pr-3">
      {a.severity === 'CRITICAL' ? <AlertTriangle aria-hidden /> : <Info aria-hidden />}
      <div className="flex-1">
        <AlertTitle>{a.title}</AlertTitle>
        <AlertDescription>{a.message}</AlertDescription>
      </div>
      <Button
        size="icon"
        variant="ghost"
        onClick={onAck}
        aria-label={`Reconocer alerta ${a.title}`}
        data-testid={`alert-ack-${a.alert_id}`}
      >
        <X className="h-4 w-4" aria-hidden />
      </Button>
    </Alert>
  );
}
