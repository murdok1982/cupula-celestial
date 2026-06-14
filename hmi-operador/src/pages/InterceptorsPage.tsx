import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { interceptorsApi } from '@/api/interceptors';
import { InterceptorStatus } from '@/components/tactical/InterceptorStatus';
import { VideoFeed } from '@/components/tactical/VideoFeed';
import { useState } from 'react';
import type { Interceptor } from '@/types/interceptors';

export function InterceptorsPage(): JSX.Element {
  const { t } = useTranslation();
  const { data } = useQuery<Interceptor[]>({
    queryKey: ['interceptors-full'],
    queryFn: () => interceptorsApi.list(),
    refetchInterval: 2000,
  });

  const interceptors = data ?? [];
  const [selected, setSelected] = useState<string | null>(null);
  const selectedInterceptor = interceptors.find((i) => i.interceptor_id === selected) ?? interceptors.find((i) => i.status === 'CRUISE') ?? null;

  return (
    <div className="flex-1 grid grid-cols-[1fr_1fr] gap-3 p-3 overflow-auto">
      <div className="space-y-3">
        <InterceptorStatus interceptors={interceptors} />
        {interceptors.length > 0 && (
          <div role="group" aria-label={t('interceptors.selectFeed')}>
            <p className="text-text-muted text-tactical-xs uppercase tracking-wider mb-2">
              {t('interceptors.selectFeed')}
            </p>
            <div className="flex flex-wrap gap-2">
              {interceptors.map((i) => (
                <button
                  key={i.interceptor_id}
                  type="button"
                  onClick={() => setSelected(i.interceptor_id)}
                  className={`px-2 py-1 rounded-sm border text-tactical-xs font-mono ${
                    selectedInterceptor?.interceptor_id === i.interceptor_id
                      ? 'border-accent-cyan bg-accent-cyan/15 text-accent-cyan'
                      : 'border-border text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {i.interceptor_id}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div>
        <VideoFeed interceptor={selectedInterceptor} />
      </div>
    </div>
  );
}
