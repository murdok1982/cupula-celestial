import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { auditApi } from '@/api/audit';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ShieldCheck, ShieldAlert, RefreshCw } from 'lucide-react';
import { formatZulu } from '@/lib/time';
import type { AuditEvent, ChainVerifyResult } from '@/types/audit';

const PAGE_SIZE = 50;

export function AuditLogPage(): JSX.Element {
  const { t } = useTranslation();
  const [verifyResult, setVerifyResult] = useState<ChainVerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);

  const { data, refetch, isFetching } = useQuery<{ events: AuditEvent[]; total: number }>({
    queryKey: ['audit-events'],
    queryFn: () => auditApi.events({ from_seq: 0, limit: PAGE_SIZE }),
    refetchInterval: 10_000,
  });

  async function verifyChain(): Promise<void> {
    setVerifying(true);
    try {
      const result = await auditApi.verifyChain();
      setVerifyResult(result);
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="flex-1 p-3 overflow-hidden flex flex-col gap-3">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t('audit.title')}</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="tactical"
                size="sm"
                onClick={() => void verifyChain()}
                disabled={verifying}
                data-testid="verify-chain-btn"
              >
                <ShieldCheck className="h-4 w-4" aria-hidden />
                {t('audit.verifyChain')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
                <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} aria-hidden />
                Refrescar
              </Button>
            </div>
          </div>
        </CardHeader>
        {verifyResult && (
          <CardContent>
            <Alert variant={verifyResult.ok ? 'success' : 'critical'}>
              {verifyResult.ok ? <ShieldCheck aria-hidden /> : <ShieldAlert aria-hidden />}
              <AlertTitle>
                {verifyResult.ok ? t('audit.chainOk') : t('audit.chainBroken', { seq: verifyResult.broken_at_seq })}
              </AlertTitle>
              <AlertDescription>
                {verifyResult.message} ({verifyResult.total_events} eventos)
              </AlertDescription>
            </Alert>
          </CardContent>
        )}
      </Card>

      <Card className="flex-1 overflow-hidden flex flex-col">
        <CardHeader>
          <CardTitle>Eventos ({data?.total ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden p-0">
          <ScrollArea className="h-full">
            <table className="w-full text-tactical-xs font-mono" role="table">
              <thead className="text-text-muted uppercase tracking-wider sticky top-0 bg-bg-panel">
                <tr className="text-left border-b border-border">
                  <th className="p-2">Seq</th>
                  <th className="p-2">Hora Zulu</th>
                  <th className="p-2">Evento</th>
                  <th className="p-2">Actor</th>
                  <th className="p-2">Rol</th>
                  <th className="p-2">Hash</th>
                </tr>
              </thead>
              <tbody>
                {(data?.events ?? []).map((e) => (
                  <tr key={e.event_id} className="border-b border-border/40 hover:bg-bg-elevated">
                    <td className="p-2 text-accent-cyan">{e.seq}</td>
                    <td className="p-2 text-text-secondary">{formatZulu(new Date(e.ts_ms))}</td>
                    <td className="p-2">
                      <Badge variant="outline">{e.kind}</Badge>
                    </td>
                    <td className="p-2 text-text-primary">{e.actor}</td>
                    <td className="p-2 text-text-secondary">{e.actor_role}</td>
                    <td className="p-2 text-text-muted truncate max-w-[160px]" title={e.hash}>
                      {e.hash.slice(0, 12)}...
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
