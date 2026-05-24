import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  AlertTriangle,
  BrainCircuit,
  Crosshair,
  Hourglass,
  ShieldCheck,
  Map as MapIcon,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { collateralRiskColor, recommendationLabel } from '@/lib/threat';
import { formatCountdown, formatZuluTime } from '@/lib/time';
import type { Recommendation } from '@/types/recommendations';
import { cn } from '@/lib/cn';
import { useMapStore } from '@/components/map/useMapStore';

interface Props {
  recommendation: Recommendation | null;
  canAuthorize: boolean;
  onAuthorize(): void;
  onReject(): void;
  onDefer(): void;
}

export function RecommendationCard({
  recommendation,
  canAuthorize,
  onAuthorize,
  onReject,
  onDefer,
}: Props): JSX.Element {
  if (!recommendation) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BrainCircuit className="h-4 w-4 text-accent-cyan" aria-hidden />
            Recomendacion LLM tactico
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-text-muted text-tactical-sm font-mono">
            Sin recomendaciones activas. El sistema esta en modo OBSERVAR.
          </p>
        </CardContent>
      </Card>
    );
  }

  return <ActiveRecommendation rec={recommendation} canAuthorize={canAuthorize} onAuthorize={onAuthorize} onReject={onReject} onDefer={onDefer} />;
}

function ConfidenceBar({ value }: { value: number }): JSX.Element {
  const pct = Math.round(value * 100);
  const color =
    value > 0.85
      ? 'bg-threat-neutral'
      : value > 0.7
        ? 'bg-accent-amber'
        : 'bg-threat-hostile';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-bg-base rounded-full overflow-hidden border border-border">
        <div
          className={cn('h-full rounded-full transition-all duration-500', color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-tactical-xs font-mono tabular-nums text-text-secondary">{pct}%</span>
    </div>
  );
}

function EngagementTimeline({ rec }: { rec: Recommendation }): JSX.Element {
  const issuedAt = rec.issued_at_ms ?? Date.now();
  const windowSec = rec.engagement_window.end_ms / 1000;
  return (
    <div className="space-y-1.5">
      <p className="text-tactical-xs text-text-muted uppercase tracking-wider flex items-center gap-1">
        <Clock className="h-3 w-3" aria-hidden />
        Timeline
      </p>
      <div className="relative pl-4 border-l-2 border-accent-cyan/30 space-y-2">
        <div className="relative">
          <span className="absolute -left-[17px] top-0 w-3 h-3 rounded-full bg-accent-cyan border-2 border-bg-panel" />
          <p className="text-tactical-xs font-mono text-accent-cyan">
            {formatZuluTime(new Date(issuedAt))} - Recomendacion emitida
          </p>
        </div>
        {rec.operator_action_required && (
          <div className="relative">
            <span className="absolute -left-[17px] top-0 w-3 h-3 rounded-full bg-accent-amber border-2 border-bg-panel" />
            <p className="text-tactical-xs font-mono text-accent-amber">
              Accion requerida ({windowSec.toFixed(0)}s ventana)
            </p>
          </div>
        )}
        <div className="relative">
          <span className="absolute -left-[17px] top-0 w-3 h-3 rounded-full bg-text-muted border-2 border-bg-panel" />
          <p className="text-tactical-xs font-mono text-text-muted">
            {formatZuluTime(new Date(issuedAt + rec.engagement_window.end_ms))} - Limite
          </p>
        </div>
      </div>
    </div>
  );
}

function ActiveRecommendation({
  rec,
  canAuthorize,
  onAuthorize,
  onReject,
  onDefer,
}: {
  rec: Recommendation;
  canAuthorize: boolean;
  onAuthorize(): void;
  onReject(): void;
  onDefer(): void;
}): JSX.Element {
  const isEngage = rec.recommendation === 'ENGAGE';
  const isExpired = rec.status === 'EXPIRED';
  const expiresAt = useMemo(
    () => (rec.issued_at_ms ?? Date.now()) + rec.engagement_window.end_ms,
    [rec],
  );
  const [remaining, setRemaining] = useState(() => Math.max(0, (expiresAt - Date.now()) / 1000));
  const [roeExpanded, setRoeExpanded] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => {
      setRemaining(Math.max(0, (expiresAt - Date.now()) / 1000));
    }, 250);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  const handleViewOnMap = useCallback(() => {
    useMapStore.getState().slewTo(rec.track_id);
  }, [rec.track_id]);

  return (
    <Card
      className={cn(
        'border-2',
        isExpired
          ? 'border-text-muted/40'
          : isEngage
            ? 'border-threat-hostile/60 shadow-threat'
            : 'border-accent-cyan/40',
      )}
      data-testid="recommendation-card"
      data-action={isExpired ? 'EXPIRED' : rec.recommendation}
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <BrainCircuit className="h-4 w-4 text-accent-cyan" aria-hidden />
            Recomendacion LLM
          </CardTitle>
          <div className="flex gap-1">
            {isExpired && (
              <Badge variant="hostile" aria-label="Recomendacion expirada">
                EXPIRADA
              </Badge>
            )}
            <Badge variant={isEngage ? 'hostile' : 'cyan'} aria-label={`Accion: ${recommendationLabel(rec.recommendation)}`}>
              {recommendationLabel(rec.recommendation)}
            </Badge>
          </div>
        </div>
        <p className="font-mono text-tactical-xs text-text-secondary">Pista {rec.track_id}</p>
      </CardHeader>
      <CardContent className="space-y-3 font-mono text-tactical-sm">
        <p className="text-text-primary leading-relaxed" aria-label="Razonamiento del modelo">
          {rec.rationale}
        </p>

        {/* Confianza del LLM */}
        {rec.pk_estimated && (
          <div>
            <p className="text-tactical-xs text-text-muted uppercase tracking-wider mb-1">
              Confianza del modelo
            </p>
            <ConfidenceBar value={rec.pk_estimated} />
          </div>
        )}

        <Separator />

        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <Field
            icon={<Crosshair className="h-3.5 w-3.5" aria-hidden />}
            label="Pk estimada"
            value={`${(rec.pk_estimated * 100).toFixed(0)}%`}
            valueClassName={
              rec.pk_estimated > 0.8 ? 'text-threat-neutral' : rec.pk_estimated > 0.6 ? 'text-accent-cyan' : 'text-accent-amber'
            }
          />
          <Field
            icon={<AlertTriangle className="h-3.5 w-3.5" aria-hidden />}
            label="Colateral"
            value={rec.collateral_risk}
            valueClassName=""
            valueStyle={{ color: collateralRiskColor(rec.collateral_risk) }}
          />
          <Field
            icon={<Hourglass className="h-3.5 w-3.5" aria-hidden />}
            label="Ventana"
            value={`${(rec.engagement_window.end_ms / 1000).toFixed(1)}s`}
          />
          <Field
            icon={<ShieldCheck className="h-3.5 w-3.5" aria-hidden />}
            label="Autorizacion"
            value={rec.authorization_level}
          />
        </div>

        <div>
          <p className="text-tactical-xs text-text-muted uppercase tracking-wider mb-1">
            Interceptores propuestos ({rec.interceptors_proposed.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {rec.interceptors_proposed.map((id) => (
              <Badge key={id} variant="outline" className="font-mono">
                {id}
              </Badge>
            ))}
          </div>
        </div>

        {/* ROE expandible */}
        {rec.policies_consulted && rec.policies_consulted.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setRoeExpanded(!roeExpanded)}
              className="flex items-center gap-1 text-tactical-xs text-text-muted uppercase tracking-wider hover:text-text-primary transition-colors w-full text-left"
              aria-expanded={roeExpanded}
              aria-label="ROE consultadas, expandir para detalle"
            >
              {roeExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              ROE consultadas ({rec.policies_consulted.length})
            </button>
            {roeExpanded && (
              <div className="mt-2 border border-border rounded-md bg-bg-base p-2 space-y-1">
                <p className="text-tactical-xs text-text-muted mb-1">Version ROE: {rec.roe_version ?? 'N/A'}</p>
                {rec.policies_consulted.map((p) => (
                  <div key={p} className="flex items-center gap-2 text-tactical-xs font-mono text-text-secondary">
                    <CheckCircle2 className="h-3 w-3 text-threat-neutral" aria-hidden />
                    {p}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Timeline */}
        <EngagementTimeline rec={rec} />

        {/* Boton "Ver en mapa" */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleViewOnMap}
          className="w-full"
          aria-label={`Ver pista ${rec.track_id} en el mapa`}
        >
          <MapIcon className="h-3.5 w-3.5 mr-1" aria-hidden />
          Ver en mapa
        </Button>

        {/* Expired state */}
        {isExpired ? (
          <div
            className="border border-text-muted/40 bg-bg-base rounded-md p-3 text-tactical-xs"
            aria-live="polite"
          >
            <p className="uppercase tracking-wider text-text-muted font-bold mb-1 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" aria-hidden />
              Recomendacion expirada
            </p>
            <p className="text-text-secondary">
              La ventana de oportunidad para esta recomendacion ha caducado.
            </p>
          </div>
        ) : isEngage && (
          <div
            className="border border-threat-hostile/40 bg-threat-hostile-bg/40 rounded-md p-3 text-tactical-xs"
            aria-live="polite"
          >
            <p className="uppercase tracking-wider text-threat-hostile font-bold mb-1">
              Ventana de engagement
            </p>
            <p className="text-text-primary">
              Caduca en{' '}
              <span className="font-bold text-threat-hostile tabular-nums" data-testid="rec-countdown">
                {formatCountdown(remaining)}
              </span>
            </p>
          </div>
        )}

        {isEngage && rec.operator_action_required && !isExpired && (
          <div className="flex gap-2 pt-2">
            <Button
              variant="authorize"
              onClick={onAuthorize}
              disabled={!canAuthorize}
              data-testid="btn-authorize"
              className="flex-1"
              aria-label="Autorizar engagement (Ctrl+A)"
            >
              Autorizar (Ctrl+A)
            </Button>
            <Button
              variant="reject"
              onClick={onReject}
              data-testid="btn-reject"
              className="flex-1"
              aria-label="Rechazar engagement (Ctrl+R)"
            >
              Rechazar (Ctrl+R)
            </Button>
            <Button
              variant="outline"
              onClick={onDefer}
              data-testid="btn-defer"
              aria-label="Diferir decision (Ctrl+D)"
            >
              Diferir
            </Button>
          </div>
        )}
        {!canAuthorize && isEngage && !isExpired && (
          <p className="text-tactical-xs text-accent-amber" role="note">
            Su rol no tiene privilegios de autorizacion para este nivel.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Field({
  icon,
  label,
  value,
  valueClassName,
  valueStyle,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  valueClassName?: string;
  valueStyle?: CSSProperties;
}): JSX.Element {
  return (
    <div>
      <dt className="text-tactical-xs text-text-muted uppercase tracking-wider flex items-center gap-1">
        {icon}
        {label}
      </dt>
      <dd className={cn('text-text-primary font-bold', valueClassName)} style={valueStyle}>
        {value}
      </dd>
    </div>
  );
}
