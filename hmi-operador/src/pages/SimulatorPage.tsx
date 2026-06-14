import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { env } from '@/env';
import { loadScenario, stopAnimation, type Scenario } from '@/mocks/scenarios';
import { Beaker, Pause } from 'lucide-react';

const SCENARIO_IDS: Scenario[] = ['idle', 'single-hostile', 'swarm', 'spoofing', 'fp-bird'];

export function SimulatorPage(): JSX.Element {
  const { t } = useTranslation();
  const enabled = env.VITE_USE_MOCKS;

  return (
    <div className="flex-1 p-3 overflow-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Beaker className="h-4 w-4 text-accent-cyan" aria-hidden />
            {t('simulator.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!enabled && (
            <Alert variant="warning" className="mb-3">
              <AlertTitle>{t('simulator.mocksDisabled')}</AlertTitle>
              <AlertDescription>{t('simulator.mocksDisabledDesc')}</AlertDescription>
            </Alert>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {SCENARIO_IDS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => loadScenario(id)}
                disabled={!enabled}
                data-testid={`scenario-${id}`}
                className="text-left border border-border rounded-md p-3 bg-bg-elevated hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <p className="text-text-primary font-semibold mb-1">{t(`simulator.scenarios.${id}.title`)}</p>
                <p className="text-tactical-xs text-text-secondary font-mono">{t(`simulator.scenarios.${id}.desc`)}</p>
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Button variant="destructive" onClick={stopAnimation} disabled={!enabled}>
              <Pause className="h-4 w-4" aria-hidden />
              {t('simulator.stopAnimation')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
