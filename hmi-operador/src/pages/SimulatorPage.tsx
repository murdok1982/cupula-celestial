/**
 * Panel del simulador. Solo en desarrollo - inyecta escenarios sinteticos
 * en los stores para probar el HMI sin backend.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { env } from '@/env';
import { loadScenario, stopAnimation, type Scenario } from '@/mocks/scenarios';
import { Beaker, Pause } from 'lucide-react';

const SCENARIOS: Array<{ id: Scenario; title: string; desc: string }> = [
  { id: 'idle', title: 'Vigilancia', desc: 'Sistema en reposo. Sin amenazas.' },
  { id: 'single-hostile', title: 'Hostil unitario', desc: 'Un dron HOSTIL. Recomendacion LLM activa.' },
  { id: 'swarm', title: 'Enjambre', desc: 'Ataque por enjambre de 8+ drones convergentes. DEFCON 2.' },
  { id: 'spoofing', title: 'Spoofing GPS', desc: 'Discrepancia ADS-B vs radar primario.' },
  { id: 'fp-bird', title: 'Falso positivo', desc: 'Ave migratoria detectada como pista no clasificada.' },
];

export function SimulatorPage(): JSX.Element {
  const enabled = env.VITE_USE_MOCKS;

  return (
    <div className="flex-1 p-3 overflow-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Beaker className="h-4 w-4 text-accent-cyan" aria-hidden />
            Simulador de escenarios
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!enabled && (
            <Alert variant="warning" className="mb-3">
              <AlertTitle>Mocks desactivados</AlertTitle>
              <AlertDescription>
                VITE_USE_MOCKS=false. El simulador solo funciona en modo desarrollo con mocks habilitados.
              </AlertDescription>
            </Alert>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {SCENARIOS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => loadScenario(s.id)}
                disabled={!enabled}
                data-testid={`scenario-${s.id}`}
                className="text-left border border-border rounded-md p-3 bg-bg-elevated hover:bg-bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <p className="text-text-primary font-semibold mb-1">{s.title}</p>
                <p className="text-tactical-xs text-text-secondary font-mono">{s.desc}</p>
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Button variant="destructive" onClick={stopAnimation} disabled={!enabled}>
              <Pause className="h-4 w-4" aria-hidden />
              Detener animacion
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
