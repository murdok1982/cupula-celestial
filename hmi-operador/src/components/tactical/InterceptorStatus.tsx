import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plane, Battery, Wifi } from 'lucide-react';
import type { Interceptor, InterceptorStatus as Status } from '@/types/interceptors';

const STATUS_LABEL: Record<Status, string> = {
  IDLE: 'En base',
  READY: 'Listo',
  LAUNCH: 'Despegue',
  CRUISE: 'En ruta',
  TERMINAL: 'Terminal',
  RTB: 'RTB',
  LOST: 'Perdido',
  DESTROYED: 'Destruido',
};

const STATUS_VARIANT: Record<Status, 'cyan' | 'friend' | 'neutral' | 'unknown' | 'hostile' | 'outline'> = {
  IDLE: 'outline',
  READY: 'cyan',
  LAUNCH: 'unknown',
  CRUISE: 'friend',
  TERMINAL: 'hostile',
  RTB: 'cyan',
  LOST: 'hostile',
  DESTROYED: 'hostile',
};

interface Props {
  interceptors: Interceptor[];
}

export function InterceptorStatus({ interceptors }: Props): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plane className="h-4 w-4 text-accent-cyan" aria-hidden />
          Interceptores ({interceptors.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {interceptors.length === 0 ? (
          <p className="text-text-muted text-tactical-sm font-mono">Sin interceptores activos.</p>
        ) : (
          <ul className="space-y-2" aria-label="Lista de interceptores">
            {interceptors.map((i) => (
              <li
                key={i.interceptor_id}
                className="flex items-center justify-between gap-2 px-2 py-1 rounded-sm bg-bg-elevated font-mono text-tactical-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-text-primary font-bold">{i.interceptor_id}</span>
                  <Badge variant={STATUS_VARIANT[i.status]}>{STATUS_LABEL[i.status]}</Badge>
                </div>
                <div className="flex items-center gap-3 text-tactical-xs text-text-secondary">
                  <span className="flex items-center gap-1" title="Bateria">
                    <Battery className="h-3 w-3" aria-hidden />
                    {i.telemetry.battery_pct.toFixed(0)}%
                  </span>
                  <span className="flex items-center gap-1" title="Calidad de enlace">
                    <Wifi className="h-3 w-3" aria-hidden />
                    {(i.telemetry.link_quality * 100).toFixed(0)}%
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
