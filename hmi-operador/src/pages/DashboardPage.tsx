/**
 * Dashboard principal: mapa central + sidebar pistas + sidebar recomendacion + status.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CesiumMap } from '@/components/map/CesiumMap';
import { MapControls } from '@/components/map/MapControls';
import { Sidebar } from '@/components/layout/Sidebar';
import { TrackRow } from '@/components/tactical/TrackRow';
import { TrackDetailsPanel } from '@/components/tactical/TrackDetailsPanel';
import { RecommendationCard } from '@/components/tactical/RecommendationCard';
import { AlertBanner } from '@/components/tactical/AlertBanner';
import { InterceptorStatus } from '@/components/tactical/InterceptorStatus';
import {
  EngagementAuthDialog,
  type EngagementDecision,
} from '@/components/tactical/EngagementAuthDialog';
import { useTracks } from '@/hooks/useTracks';
import { usePendingRecommendation, useRecommendations } from '@/hooks/useRecommendations';
import { useTrackStore } from '@/store/trackStore';
import { useSelectedTrack } from '@/hooks/useTracks';
import { useCanAuthorizeLevel } from '@/hooks/useOperatorRole';
import { useRecommendationStore } from '@/store/recommendationStore';
import { useOperatorStore } from '@/store/operatorStore';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useTranslation } from 'react-i18next';
import { tracksApi } from '@/api/tracks';
import { recommendationsApi } from '@/api/recommendations';
import { interceptorsApi } from '@/api/interceptors';
import { engagementApi } from '@/api/engagement';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAlertStore } from '@/store/alertStore';
import { useAuthStore } from '@/store/authStore';
import type { Interceptor } from '@/types/interceptors';

export function DashboardPage(): JSX.Element {
  const { t } = useTranslation();
  const tracks = useTracks();
  const selectedTrack = useSelectedTrack();
  const recommendations = useRecommendations();
  const pending = usePendingRecommendation();
  const activeRecLevel = pending?.authorization_level ?? recommendations[0]?.authorization_level ?? null;
  const canAuthorize = useCanAuthorizeLevel(activeRecLevel);
  const layoutMode = useOperatorStore((s) => s.layoutMode);

  const [dialogDecision, setDialogDecision] = useState<EngagementDecision | null>(null);

  // Bootstrap inicial via REST (luego WS toma el relevo)
  useQuery({
    queryKey: ['tracks-bootstrap'],
    queryFn: async () => {
      const data = await tracksApi.list();
      useTrackStore.getState().upsertMany(data);
      return data;
    },
    staleTime: 30_000,
    enabled: Boolean(useAuthStore.getState().accessToken),
  });

  useQuery({
    queryKey: ['recs-bootstrap'],
    queryFn: async () => {
      const data = await recommendationsApi.list();
      useRecommendationStore.getState().upsertMany(data);
      return data;
    },
    staleTime: 30_000,
    enabled: Boolean(useAuthStore.getState().accessToken),
  });

  const interceptorsQuery = useQuery<Interceptor[]>({
    queryKey: ['interceptors'],
    queryFn: () => interceptorsApi.list(),
    refetchInterval: 5000,
    enabled: Boolean(useAuthStore.getState().accessToken),
  });

  const activeRec = useMemo(() => pending ?? recommendations[0] ?? null, [pending, recommendations]);

  const openDialog = useCallback(
    (decision: EngagementDecision) => {
      if (!activeRec) return;
      useRecommendationStore.getState().setActive(activeRec.recommendation_id ?? activeRec.track_id);
      setDialogDecision(decision);
    },
    [activeRec],
  );

  // Hotkeys de decision
  useHotkeys([
    { combo: 'Ctrl+A', handler: () => activeRec && openDialog('AUTHORIZE') },
    { combo: 'Ctrl+R', handler: () => activeRec && openDialog('REJECT') },
    { combo: 'Ctrl+D', handler: () => activeRec && openDialog('DEFER') },
  ]);

  const handleConfirm = useCallback(
    async (payload: {
      decision: EngagementDecision;
      pin_hash: string;
      fido2_assertion: import('@/types/api').Fido2CompleteRequest;
      reason?: string;
    }) => {
      if (!activeRec) return;
      const recId = activeRec.recommendation_id ?? activeRec.track_id;
      await engagementApi.authorize({
        recommendation_id: recId,
        track_id: activeRec.track_id,
        pin_hash: payload.pin_hash,
        fido2_assertion: payload.fido2_assertion,
        decision: payload.decision,
        reason: payload.reason,
      });
      useRecommendationStore.getState().setStatus(
        recId,
        payload.decision === 'AUTHORIZE'
          ? 'AUTHORIZED'
          : payload.decision === 'REJECT'
            ? 'REJECTED'
            : 'DEFERRED',
      );
      useAlertStore.getState().push({
        alert_id: crypto.randomUUID(),
        severity: payload.decision === 'AUTHORIZE' ? 'CRITICAL' : 'INFO',
        title:
          payload.decision === 'AUTHORIZE'
            ? t('dashboard.engagementAuthorized')
            : payload.decision === 'REJECT'
              ? t('dashboard.engagementRejected')
              : t('dashboard.decisionDeferred'),
        message: t('dashboard.engagementAuditMsg', { trackId: activeRec.track_id }),
        ts_ms: Date.now(),
        ack_required: false,
      });
    },
    [activeRec, t],
  );

  // Selecciona la primera pista al cargar si no hay seleccion
  useEffect(() => {
    if (!useTrackStore.getState().selectedTrackId && tracks.length > 0) {
      const firstTrack = tracks[0];
      if (firstTrack) useTrackStore.getState().selectTrack(firstTrack.track_id);
    }
  }, [tracks]);

  return (
    <div className="flex w-full h-full">
      {layoutMode !== 'map-only' && (
      <Sidebar side="left" ariaLabel="Lista de pistas">
        <Card className="flex-1 flex flex-col overflow-hidden">
          <CardHeader>
            <CardTitle>
              {t('dashboard.tracksTitle')} ({tracks.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 flex-1 overflow-hidden">
            {tracks.length === 0 ? (
              <p className="p-3 text-text-muted text-tactical-sm font-mono">
                {t('dashboard.noTracks')}
              </p>
            ) : (
              <ScrollArea className="h-full max-h-[calc(100vh-200px)]">
                <ul aria-label="Pistas ordenadas por prioridad" className="divide-y divide-border">
                  {tracks.map((track) => (
                    <li key={track.track_id}>
                      <TrackRow
                        track={track}
                        selected={selectedTrack?.track_id === track.track_id}
                        onSelect={(id) => useTrackStore.getState().selectTrack(id)}
                        hasRecommendation={recommendations.some((r) => r.track_id === track.track_id && r.status === 'PENDING')}
                      />
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </Sidebar>
      )}

      {/* Centro: mapa */}
      <div className="flex-1 relative">
        <CesiumMap />
        <MapControls />
        <div className="absolute top-3 left-3 z-10 max-w-md">
          <AlertBanner />
        </div>
      </div>

      {layoutMode === '3col' && (
      <Sidebar side="right" width="w-[400px]" ariaLabel="Panel de decision">
        <RecommendationCard
          recommendation={activeRec}
          canAuthorize={canAuthorize}
          onAuthorize={() => openDialog('AUTHORIZE')}
          onReject={() => openDialog('REJECT')}
          onDefer={() => openDialog('DEFER')}
        />
        <TrackDetailsPanel track={selectedTrack} />
        <InterceptorStatus interceptors={interceptorsQuery.data ?? []} />
      </Sidebar>
      )}

      <EngagementAuthDialog
        open={dialogDecision !== null}
        recommendation={activeRec}
        decision={dialogDecision}
        onClose={() => setDialogDecision(null)}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
