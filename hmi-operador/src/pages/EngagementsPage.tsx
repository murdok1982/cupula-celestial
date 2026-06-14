import { useTranslation } from 'react-i18next';
import { useRecommendations } from '@/hooks/useRecommendations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { recommendationLabel } from '@/lib/threat';
import { formatAge } from '@/lib/time';
import { useRecommendationStore } from '@/store/recommendationStore';
import { cn } from '@/lib/cn';

export function EngagementsPage(): JSX.Element {
  const { t } = useTranslation();
  const recs = useRecommendations();
  const activeId = useRecommendationStore((s) => s.activeRecommendationId);

  return (
    <div className="flex-1 p-3 overflow-auto">
      <Card>
        <CardHeader>
          <CardTitle>{t('engagements.history')} ({recs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {recs.length === 0 ? (
            <p className="text-text-muted text-tactical-sm font-mono">{t('engagements.noRecommendations')}</p>
          ) : (
            <table className="w-full text-tactical-sm font-mono" role="table">
              <thead className="text-text-muted text-tactical-xs uppercase tracking-wider">
                <tr className="text-left border-b border-border">
                  <th className="p-2">{t('engagements.track')}</th>
                  <th className="p-2">{t('engagements.action')}</th>
                  <th className="p-2">{t('engagements.pk')}</th>
                  <th className="p-2">{t('engagements.collateral')}</th>
                  <th className="p-2">{t('engagements.status')}</th>
                  <th className="p-2">{t('engagements.issued')}</th>
                </tr>
              </thead>
              <tbody>
                {recs.map((r) => {
                  const id = r.recommendation_id ?? r.track_id;
                  return (
                    <tr
                      key={id}
                      onClick={() => useRecommendationStore.getState().setActive(id)}
                      className={cn(
                        'border-b border-border hover:bg-bg-elevated cursor-pointer',
                        activeId === id && 'bg-accent-cyan/10',
                      )}
                    >
                      <td className="p-2 text-text-primary font-bold">{r.track_id}</td>
                      <td className="p-2">
                        <Badge variant={r.recommendation === 'ENGAGE' ? 'hostile' : 'cyan'}>
                          {recommendationLabel(r.recommendation)}
                        </Badge>
                      </td>
                      <td className="p-2">{(r.pk_estimated * 100).toFixed(0)}%</td>
                      <td className="p-2">{r.collateral_risk}</td>
                      <td className="p-2">
                        <Badge
                          variant={
                            r.status === 'AUTHORIZED'
                              ? 'neutral'
                              : r.status === 'REJECTED'
                                ? 'hostile'
                                : r.status === 'DEFERRED'
                                  ? 'unknown'
                                  : 'outline'
                          }
                        >
                          {r.status ?? 'PENDING'}
                        </Badge>
                      </td>
                      <td className="p-2 text-text-secondary">
                        {r.issued_at_ms ? formatAge(r.issued_at_ms) : '--'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
