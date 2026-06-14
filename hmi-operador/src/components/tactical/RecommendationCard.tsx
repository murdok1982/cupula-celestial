import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();

  if (!recommendation) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BrainCircuit className="h-4 w-4 text-accent-cyan" aria-hidden />
            {t('recommendation.tacticalTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-text-muted text-tactical-sm font-mono">
            {t('recommendation.observeMode')}
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
  const { t } = useTranslation();
  const issuedAt = rec.issued_at_ms ?? Date.now();
  const windowSec = rec.engagement_window.end_ms / 1000;
  return (
    <div className="space-y-1.5">
      <p className="text-tactical-xs text-text-muted uppercase tracking-wider flex items-center gap-1">
        <Clock className="h-3 w-3" aria-hidden />
        {t('recommendation.timeline')}
      </p>
      <div className="relative pl-4 border-l-2 border-accent-cyan/30 space-y-2">
        <div className="relative">
          <span className="absolute -left-[17px] top-0 w-3 h-3 rounded-full bg-accent-cyan border-2 border-bg-panel" />
          <p className="text-tactical-xs font-mono text-accent-cyan">
            {formatZuluTime(new Date(issuedAt))} - {t('recommendation.issued')}
          </p>
        </div>
        {rec.operator_action_required && (
          <div className="relative">
            <span className="absolute -left-[17px] top-0 w-3 h-3 rounded-full bg-accent-amber border-2 border-bg-panel" />
            <p className="text-tactical-xs font-mono text-accent-amber">
              {t('recommendation.actionRequired')} ({windowSec.toFixed(0)}s {t('recommendation.window').toLowerCase()})
            </p>
          </div>
        )}
        <div className="relative">
          <span className="absolute -left-[17px] top-0 w-3 h-3 rounded-full bg-text-muted border-2 border-bg-panel" />
          <p className="text-tactical-xs font-mono text-text-muted">
            {formatZuluTime(new Date(issuedAt + rec.engagement_window.end_ms))} - {t('recommendation.deadline')}
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
  const { t } = useTranslation();
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
            {t('recommendation.llmTitle')}
          </CardTitle>
          <div className="flex gap-1">
            {isExpired && (
              <Badge variant="hostile" aria-label={t('recommendation.ariaExpired')}>
                {t('recommendation.expired')}
              </Badge>
            )}
            <Badge variant={isEngage ? 'hostile' : 'cyan'} aria-label={t('recommendation.ariaAction', { action: recommendationLabel(rec.recommendation) })}>
              {recommendationLabel(rec.recommendation)}
            </Badge>
          </div>
        </div>
        <p className="font-mono text-tactical-xs text-text-secondary">{t('recommendation.track')} {rec.track_id}</p>
      </CardHeader>
      <CardContent className="space-y-3 font-mono text-tactical-sm">
        <p className="text-text-primary leading-relaxed" aria-label={t('recommendation.ariaReasoning')}>
          {rec.rationale}
        </p>

        {rec.pk_estimated && (
          <div>
            <p className="text-tactical-xs text-text-muted uppercase tracking-wider mb-1">
              {t('recommendation.confidence')}
            </p>
            <ConfidenceBar value={rec.pk_estimated} />
          </div>
        )}

        <Separator />

        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <Field
            icon={<Crosshair className="h-3.5 w-3.5" aria-hidden />}
            label={t('recommendation.pkEstimated')}
            value={`${(rec.pk_estimated * 100).toFixed(0)}%`}
            valueClassName={
              rec.pk_estimated > 0.8 ? 'text-threat-neutral' : rec.pk_estimated > 0.6 ? 'text-accent-cyan' : 'text-accent-amber'
            }
          />
          <Field
            icon={<AlertTriangle className="h-3.5 w-3.5" aria-hidden />}
            label={t('recommendation.collateral')}
            value={rec.collateral_risk}
            valueClassName=""
            valueStyle={{ color: collateralRiskColor(rec.collateral_risk) }}
          />
          <Field
            icon={<Hourglass className="h-3.5 w-3.5" aria-hidden />}
            label={t('recommendation.window')}
            value={`${(rec.engagement_window.end_ms / 1000).toFixed(1)}s`}
          />
          <Field
            icon={<ShieldCheck className="h-3.5 w-3.5" aria-hidden />}
            label={t('recommendation.authorization')}
            value={rec.authorization_level}
          />
        </div>

        <div>
          <p className="text-tactical-xs text-text-muted uppercase tracking-wider mb-1">
            {t('recommendation.interceptorsProposed')} ({rec.interceptors_proposed.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {rec.interceptors_proposed.map((id) => (
              <Badge key={id} variant="outline" className="font-mono">
                {id}
              </Badge>
            ))}
          </div>
        </div>

        {rec.policies_consulted && rec.policies_consulted.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setRoeExpanded(!roeExpanded)}
              className="flex items-center gap-1 text-tactical-xs text-text-muted uppercase tracking-wider hover:text-text-primary transition-colors w-full text-left"
              aria-expanded={roeExpanded}
              aria-label={t('recommendation.ariaRoeExpand')}
            >
              {roeExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              {t('recommendation.roeConsulted')} ({rec.policies_consulted.length})
            </button>
            {roeExpanded && (
              <div className="mt-2 border border-border rounded-md bg-bg-base p-2 space-y-1">
                <p className="text-tactical-xs text-text-muted mb-1">{t('recommendation.roeVersion')}: {rec.roe_version ?? 'N/A'}</p>
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

        <EngagementTimeline rec={rec} />

        <Button
          variant="outline"
          size="sm"
          onClick={handleViewOnMap}
          className="w-full"
          aria-label={t('recommendation.ariaViewTrack', { trackId: rec.track_id })}
        >
          <MapIcon className="h-3.5 w-3.5 mr-1" aria-hidden />
          {t('recommendation.viewOnMap')}
        </Button>

        {isExpired ? (
          <div
            className="border border-text-muted/40 bg-bg-base rounded-md p-3 text-tactical-xs"
            aria-live="polite"
          >
            <p className="uppercase tracking-wider text-text-muted font-bold mb-1 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" aria-hidden />
              {t('recommendation.expiredTitle')}
            </p>
            <p className="text-text-secondary">
              {t('recommendation.expiredDesc')}
            </p>
          </div>
        ) : isEngage && (
          <div
            className="border border-threat-hostile/40 bg-threat-hostile-bg/40 rounded-md p-3 text-tactical-xs"
            aria-live="polite"
          >
            <p className="uppercase tracking-wider text-threat-hostile font-bold mb-1">
              {t('recommendation.engagementWindow')}
            </p>
            <p className="text-text-primary">
              {t('recommendation.expiresIn')}{' '}
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
              aria-label={t('recommendation.ariaAuthorize')}
            >
              {t('actions.authorize')} (Ctrl+A)
            </Button>
            <Button
              variant="reject"
              onClick={onReject}
              data-testid="btn-reject"
              className="flex-1"
              aria-label={t('recommendation.ariaReject')}
            >
              {t('actions.reject')} (Ctrl+R)
            </Button>
            <Button
              variant="outline"
              onClick={onDefer}
              data-testid="btn-defer"
              aria-label={t('recommendation.ariaDefer')}
            >
              {t('actions.defer')}
            </Button>
          </div>
        )}
        {!canAuthorize && isEngage && !isExpired && (
          <p className="text-tactical-xs text-accent-amber" role="note">
            {t('recommendation.noPrivileges')}
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
