import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOperatorStore, type DisplayMode } from '@/store/operatorStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import i18n from '@/i18n';
import { env } from '@/env';
import {
  Server,
  Download,
  Upload,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/cn';

export type LayoutMode = '3col' | '2col' | 'map-only';

interface PingResult {
  name: string;
  url: string;
  status: 'ok' | 'fail' | 'pending' | 'idle';
  latency?: number;
}

const DISPLAY_MODES: Array<{ id: DisplayMode; labelKey: string }> = [
  { id: 'tactical', labelKey: 'settings.tactical' },
  { id: 'night', labelKey: 'settings.night' },
  { id: 'colorblind', labelKey: 'settings.colorblind' },
];

const LANGS: Array<{ code: string; label: string }> = [
  { code: 'es', label: 'Espanol' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Francais' },
];

const LAYOUT_MODES: Array<{ id: LayoutMode; label: string; desc: string }> = [
  { id: '3col', label: '3 columnas', desc: 'Pistas | Mapa | Detalle' },
  { id: '2col', label: '2 columnas mapa expandido', desc: 'Pistas | Mapa expandido' },
  { id: 'map-only', label: 'Solo mapa', desc: 'Mapa a pantalla completa' },
];

const SERVICES = [
  { name: 'HMI Gateway', url: env.VITE_API_BASE_URL },
  { name: 'Audit Log', url: env.VITE_AUDIT_URL },
  { name: 'Decision Engine', url: env.VITE_DECISION_URL },
];

export function SettingsPage(): JSX.Element {
  const { t } = useTranslation();
  const displayMode = useOperatorStore((s) => s.displayMode);
  const fontScale = useOperatorStore((s) => s.fontScale);
  const audio = useOperatorStore((s) => s.audioAlertsEnabled);
  const storedLayout = useOperatorStore((s) => (s as Record<string, unknown>).layoutMode as LayoutMode | undefined);
  const storedEmergency = useOperatorStore((s) => (s as Record<string, unknown>).emergencyMode as boolean | undefined);

  const [layoutMode, setLayoutMode] = useState<LayoutMode>(storedLayout ?? '3col');
  const [emergencyMode, setEmergencyMode] = useState(storedEmergency ?? false);
  const [pings, setPings] = useState<PingResult[]>(
    SERVICES.map((s) => ({ ...s, status: 'idle' })),
  );
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePing = useCallback(async (idx: number) => {
    const service = SERVICES[idx];
    if (!service) return;
    setPings((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, status: 'pending' as const } : p)),
    );
    const start = Date.now();
    try {
      const res = await fetch(service.url, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
      const latency = Date.now() - start;
      setPings((prev) =>
        prev.map((p, i) =>
          i === idx ? { ...p, status: res.ok ? 'ok' : 'fail', latency } : p,
        ),
      );
    } catch {
      setPings((prev) =>
        prev.map((p, i) => (i === idx ? { ...p, status: 'fail', latency: undefined } : p)),
      );
    }
  }, []);

  const handlePingAll = useCallback(async () => {
    for (let i = 0; i < SERVICES.length; i++) {
      await handlePing(i);
    }
  }, [handlePing]);

  const handleReset = useCallback(() => {
    useOperatorStore.getState().setDisplayMode('tactical');
    useOperatorStore.getState().setFontScale(1.0);
    useOperatorStore.getState().setAudioAlertsEnabled(true);
    setLayoutMode('3col');
    setEmergencyMode(false);
    if (i18n.language !== 'es') void i18n.changeLanguage('es');
    setPings(SERVICES.map((s) => ({ ...s, status: 'idle' })));
  }, []);

  const handleExport = useCallback(() => {
    const config = {
      displayMode,
      fontScale,
      audioAlertsEnabled: audio,
      layoutMode,
      emergencyMode,
      locale: i18n.language,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cupula-config-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [displayMode, fontScale, audio, layoutMode, emergencyMode]);

  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const config = JSON.parse(ev.target?.result as string) as {
            displayMode?: DisplayMode;
            fontScale?: number;
            audioAlertsEnabled?: boolean;
            layoutMode?: LayoutMode;
            emergencyMode?: boolean;
            locale?: string;
          };
          if (config.displayMode) useOperatorStore.getState().setDisplayMode(config.displayMode);
          if (config.fontScale) useOperatorStore.getState().setFontScale(config.fontScale);
          if (config.audioAlertsEnabled !== undefined)
            useOperatorStore.getState().setAudioAlertsEnabled(config.audioAlertsEnabled);
          if (config.layoutMode) setLayoutMode(config.layoutMode);
          if (config.emergencyMode !== undefined) setEmergencyMode(config.emergencyMode);
          if (config.locale) void i18n.changeLanguage(config.locale);
          setImportStatus('OK');
        } catch {
          setImportStatus('ERROR');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    },
    [],
  );

  const handleSetLayoutMode = useCallback((mode: LayoutMode) => {
    setLayoutMode(mode);
  }, []);

  const handleToggleEmergency = useCallback(() => {
    setEmergencyMode((prev) => !prev);
    if (!emergencyMode) {
      // Emergency mode: simplify to map-only, switch to tactical display
      setLayoutMode('map-only');
      useOperatorStore.getState().setDisplayMode('tactical');
    }
  }, [emergencyMode]);

  return (
    <div className="flex-1 p-3 overflow-auto">
      <div className="max-w-2xl space-y-4">
        {/* Emergency mode toggle */}
        <Card
          className={cn(
            'border-2',
            emergencyMode
              ? 'border-threat-hostile/60 shadow-threat'
              : 'border-border',
          )}
        >
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle
                className={cn('h-4 w-4', emergencyMode ? 'text-threat-hostile' : 'text-text-muted')}
                aria-hidden
              />
              Modo emergencia
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <p className="text-tactical-sm font-mono text-text-secondary">
                {emergencyMode
                  ? 'Modo emergencia ACTIVO: UI simplificada al minimo. Se requiere reinicio manual.'
                  : 'Activar para simplificar la interfaz a solo el mapa tactico.'}
              </p>
              <Button
                variant={emergencyMode ? 'destructive' : 'outline'}
                onClick={handleToggleEmergency}
                aria-pressed={emergencyMode}
                data-testid="btn-emergency"
              >
                {emergencyMode ? 'Desactivar emergencia' : 'Activar emergencia'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('settings.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-tactical-sm font-medium uppercase tracking-wider text-text-secondary">
                {t('settings.displayMode')}
              </legend>
              <div className="flex gap-2">
                {DISPLAY_MODES.map((m) => (
                  <Button
                    key={m.id}
                    variant={displayMode === m.id ? 'tactical' : 'outline'}
                    onClick={() => useOperatorStore.getState().setDisplayMode(m.id)}
                    aria-pressed={displayMode === m.id}
                    data-testid={`display-${m.id}`}
                  >
                    {t(m.labelKey)}
                  </Button>
                ))}
              </div>
            </fieldset>

            {/* Layout selector */}
            <fieldset className="space-y-2">
              <legend className="text-tactical-sm font-medium uppercase tracking-wider text-text-secondary">
                Layout
              </legend>
              <div className="grid grid-cols-3 gap-2">
                {LAYOUT_MODES.map((m) => (
                  <Button
                    key={m.id}
                    variant={layoutMode === m.id ? 'tactical' : 'outline'}
                    onClick={() => handleSetLayoutMode(m.id)}
                    aria-pressed={layoutMode === m.id}
                    className="flex-col h-auto py-2 gap-1"
                    data-testid={`layout-${m.id}`}
                  >
                    <span className="text-tactical-sm">{m.label}</span>
                    <span className="text-tactical-xs text-text-muted font-normal">{m.desc}</span>
                  </Button>
                ))}
              </div>
            </fieldset>

            <div>
              <Label htmlFor="font-scale">
                {t('settings.fontScale')} ({Math.round(fontScale * 100)}%)
              </Label>
              <Input
                id="font-scale"
                type="range"
                min="0.85"
                max="1.5"
                step="0.05"
                value={fontScale}
                onChange={(e) => useOperatorStore.getState().setFontScale(Number.parseFloat(e.target.value))}
              />
            </div>

            <div>
              <Label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={audio}
                  onChange={(e) => useOperatorStore.getState().setAudioAlertsEnabled(e.target.checked)}
                  className="h-4 w-4"
                />
                {t('settings.audioAlerts')}
              </Label>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-tactical-sm font-medium uppercase tracking-wider text-text-secondary">
                {t('settings.language')}
              </legend>
              <div className="flex gap-2">
                {LANGS.map((l) => (
                  <Button
                    key={l.code}
                    variant={i18n.language === l.code ? 'tactical' : 'outline'}
                    onClick={() => void i18n.changeLanguage(l.code)}
                    aria-pressed={i18n.language === l.code}
                  >
                    {l.label}
                  </Button>
                ))}
              </div>
            </fieldset>

            <Separator />

            {/* Ping services */}
            <fieldset className="space-y-2">
              <legend className="text-tactical-sm font-medium uppercase tracking-wider text-text-secondary flex items-center gap-2">
                <Server className="h-3.5 w-3.5" aria-hidden />
                Diagnostico de conexion
              </legend>
              <div className="space-y-1">
                {pings.map((p, idx) => (
                  <div key={p.name} className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2">
                      {p.status === 'ok' && <CheckCircle2 className="h-3.5 w-3.5 text-threat-neutral" />}
                      {p.status === 'fail' && <XCircle className="h-3.5 w-3.5 text-threat-hostile" />}
                      {p.status === 'pending' && <Loader2 className="h-3.5 w-3.5 text-accent-cyan animate-spin" />}
                      {p.status === 'idle' && <div className="h-3.5 w-3.5 rounded-full border border-text-muted" />}
                      <span className="text-tactical-sm font-mono">{p.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {p.status === 'ok' && (
                        <Badge variant="cyan">{p.latency}ms</Badge>
                      )}
                      {p.status === 'fail' && <Badge variant="hostile">Sin respuesta</Badge>}
                      <Button variant="ghost" size="sm" onClick={() => handlePing(idx)} disabled={p.status === 'pending'}>
                        Ping
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={handlePingAll} className="w-full">
                Ping todos los servicios
              </Button>
            </fieldset>

            <Separator />

            {/* Export/Import */}
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleExport} className="flex-1" data-testid="btn-export-config">
                <Download className="h-3.5 w-3.5 mr-1" aria-hidden />
                Exportar configuracion
              </Button>
              <Button variant="outline" onClick={handleImport} className="flex-1" data-testid="btn-import-config">
                <Upload className="h-3.5 w-3.5 mr-1" aria-hidden />
                Importar configuracion
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleFileChange}
                data-testid="file-input-config"
                aria-hidden
              />
            </div>
            {importStatus === 'OK' && (
              <Alert variant="success" className="py-2">
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Configuracion importada correctamente</AlertTitle>
              </Alert>
            )}
            {importStatus === 'ERROR' && (
              <Alert variant="critical" className="py-2">
                <XCircle className="h-4 w-4" />
                <AlertTitle>Error al importar. Revise el archivo.</AlertTitle>
              </Alert>
            )}

            <Separator />

            {/* Factory reset */}
            <Button variant="destructive" onClick={handleReset} className="w-full" data-testid="btn-factory-reset">
              <RotateCcw className="h-3.5 w-3.5 mr-1" aria-hidden />
              Restaurar valores de fabrica
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-bg-base">
          <CardHeader>
            <CardTitle className="text-tactical-sm">Atajos de teclado</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-tactical-xs font-mono">
              <dt className="text-text-muted">F1</dt><dd>Ayuda / ajustes</dd>
              <dt className="text-text-muted">F2</dt><dd>Vista de pistas</dd>
              <dt className="text-text-muted">F3</dt><dd>Mapa / dashboard</dd>
              <dt className="text-text-muted">F4</dt><dd>Recomendaciones</dd>
              <dt className="text-text-muted">Ctrl+A</dt><dd>Autorizar engagement</dd>
              <dt className="text-text-muted">Ctrl+R</dt><dd>Rechazar engagement</dd>
              <dt className="text-text-muted">Ctrl+D</dt><dd>Diferir decision</dd>
              <dt className="text-text-muted">Esc</dt><dd>Cerrar modal</dd>
              <dt className="text-text-muted">Ctrl+Shift+L</dt><dd>Logout inmediato</dd>
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
