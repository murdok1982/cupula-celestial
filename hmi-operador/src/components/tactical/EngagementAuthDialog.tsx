/**
 * Dialogo MODAL BLOQUEANTE de autorizacion de engagement.
 * Implementa doble factor: PIN (6 digitos) + WebAuthn (FIDO2).
 * Timeout 30s segun MIL-STD-1472.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { MfaFido2 } from '@/auth/MfaFido2';
import { hashPin, pinSchema, type PinFormValues } from '@/lib/validators';
import { env } from '@/env';
import { formatCountdown } from '@/lib/time';
import { AlertTriangle, Lock } from 'lucide-react';
import type { Fido2CompleteRequest } from '@/types/api';
import type { Recommendation } from '@/types/recommendations';
import { recommendationLabel } from '@/lib/threat';
import { cn } from '@/lib/cn';

export type EngagementDecision = 'AUTHORIZE' | 'REJECT' | 'DEFER';

interface Props {
  open: boolean;
  recommendation: Recommendation | null;
  decision: EngagementDecision | null;
  onClose(): void;
  onConfirm(payload: {
    decision: EngagementDecision;
    pin_hash: string;
    fido2_assertion: Fido2CompleteRequest;
    reason?: string;
  }): Promise<void>;
}

type Step = 'pin' | 'fido2' | 'submitting' | 'error';

export function EngagementAuthDialog({
  open,
  recommendation,
  decision,
  onClose,
  onConfirm,
}: Props): JSX.Element | null {
  const [step, setStep] = useState<Step>('pin');
  const [pinHash, setPinHash] = useState<string | null>(null);
  const [reason, setReason] = useState<string | undefined>(undefined);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(env.VITE_AUTH_DIALOG_TIMEOUT_MS / 1000);

  const form = useForm<PinFormValues>({
    resolver: zodResolver(pinSchema),
    defaultValues: { pin: '', reason: '' },
  });

  // Reset al abrir
  useEffect(() => {
    if (open) {
      setStep('pin');
      setPinHash(null);
      setErrorMsg(null);
      setRemaining(env.VITE_AUTH_DIALOG_TIMEOUT_MS / 1000);
      form.reset({ pin: '', reason: '' });
    }
  }, [open, form]);

  // Countdown 30s
  useEffect(() => {
    if (!open) return undefined;
    const deadline = Date.now() + env.VITE_AUTH_DIALOG_TIMEOUT_MS;
    const id = window.setInterval(() => {
      const r = Math.max(0, (deadline - Date.now()) / 1000);
      setRemaining(r);
      if (r <= 0) {
        window.clearInterval(id);
        onClose();
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [open, onClose]);

  const handlePinSubmit = useCallback(
    async (values: PinFormValues) => {
      const hash = await hashPin(values.pin);
      setPinHash(hash);
      setReason(values.reason);
      setStep('fido2');
    },
    [],
  );

  const handleFido2Complete = useCallback(
    async (assertion: Fido2CompleteRequest) => {
      if (!pinHash || !decision) {
        setStep('error');
        setErrorMsg('Falta hash de PIN o decision');
        return;
      }
      setStep('submitting');
      try {
        await onConfirm({
          decision,
          pin_hash: pinHash,
          fido2_assertion: assertion,
          reason,
        });
        onClose();
      } catch (e) {
        const err = e instanceof Error ? e.message : 'Error al confirmar';
        setErrorMsg(err);
        setStep('error');
      }
    },
    [pinHash, decision, onConfirm, onClose, reason],
  );

  const decisionLabel = useMemo(() => {
    switch (decision) {
      case 'AUTHORIZE':
        return 'AUTORIZAR ENGAGEMENT';
      case 'REJECT':
        return 'RECHAZAR ENGAGEMENT';
      case 'DEFER':
        return 'DIFERIR DECISION';
      default:
        return '';
    }
  }, [decision]);

  if (!recommendation || !decision) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-xl"
        hideClose
        onEscapeKeyDown={(e) => {
          // Permite Esc, cumple WCAG 2.1.2 No Keyboard Trap
          e.preventDefault();
          onClose();
        }}
        aria-describedby="engagement-auth-desc"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-threat-hostile">
            <Lock className="h-5 w-5" aria-hidden />
            {decisionLabel}
          </DialogTitle>
          <DialogDescription id="engagement-auth-desc">
            Confirmacion doble factor obligatoria. Toda accion queda registrada.
          </DialogDescription>
        </DialogHeader>

        {/* Resumen de la accion */}
        <div className="border border-border bg-bg-base rounded-md p-3 font-mono text-tactical-sm space-y-1">
          <div>
            <span className="text-text-muted">Pista:</span>{' '}
            <span className="text-text-primary font-bold">{recommendation.track_id}</span>
          </div>
          <div>
            <span className="text-text-muted">Accion LLM:</span>{' '}
            <span className="text-accent-cyan font-bold">
              {recommendationLabel(recommendation.recommendation)}
            </span>
          </div>
          <div>
            <span className="text-text-muted">Decision:</span>{' '}
            <span
              className={cn(
                'font-bold',
                decision === 'AUTHORIZE' && 'text-threat-neutral',
                decision === 'REJECT' && 'text-threat-hostile',
                decision === 'DEFER' && 'text-accent-amber',
              )}
            >
              {decisionLabel}
            </span>
          </div>
          {decision === 'AUTHORIZE' && (
            <div>
              <span className="text-text-muted">Interceptores:</span>{' '}
              <span className="text-text-primary">
                {recommendation.interceptors_proposed.join(', ')}
              </span>
            </div>
          )}
        </div>

        {/* Countdown */}
        <div
          className="flex items-center justify-between text-tactical-xs font-mono"
          aria-live="polite"
        >
          <span className="text-text-muted uppercase tracking-wider">Tiempo restante</span>
          <span
            className={cn(
              'font-bold tabular-nums',
              remaining < 5 ? 'text-threat-hostile animate-blink-critical' : 'text-accent-cyan',
            )}
            data-testid="auth-countdown"
          >
            {formatCountdown(remaining)}
          </span>
        </div>

        {step === 'pin' && (
          <form onSubmit={form.handleSubmit(handlePinSubmit)} className="space-y-3" noValidate>
            <div className="space-y-1">
              <Label htmlFor="auth-pin">PIN del operador (6 digitos)</Label>
              <Input
                id="auth-pin"
                type="password"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                {...form.register('pin')}
                aria-invalid={Boolean(form.formState.errors.pin)}
                aria-describedby={form.formState.errors.pin ? 'pin-error' : undefined}
                data-testid="auth-pin-input"
                autoFocus
              />
              {form.formState.errors.pin && (
                <p id="pin-error" role="alert" className="text-tactical-xs text-threat-hostile">
                  {form.formState.errors.pin.message}
                </p>
              )}
            </div>

            {decision !== 'AUTHORIZE' && (
              <div className="space-y-1">
                <Label htmlFor="auth-reason">Motivo (obligatorio para rechazo/diferir)</Label>
                <Input
                  id="auth-reason"
                  type="text"
                  maxLength={256}
                  {...form.register('reason')}
                  data-testid="auth-reason-input"
                />
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" variant="tactical" data-testid="auth-pin-submit">
                Continuar a MFA
              </Button>
            </DialogFooter>
          </form>
        )}

        {step === 'fido2' && (
          <div className="space-y-3">
            <Alert variant="info">
              <AlertTitle>Paso 2/2 - Token fisico FIDO2</AlertTitle>
              <AlertDescription>
                Inserte el token, pulse el sensor biometrico o use la llave de seguridad.
              </AlertDescription>
            </Alert>
            <MfaFido2 autoStart onComplete={handleFido2Complete} />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'submitting' && (
          <Alert variant="info" aria-live="assertive">
            <AlertTitle>Procesando...</AlertTitle>
            <AlertDescription>Enviando autorizacion al gateway. No cierre la ventana.</AlertDescription>
          </Alert>
        )}

        {step === 'error' && (
          <Alert variant="critical">
            <AlertTriangle />
            <AlertTitle>Error de autorizacion</AlertTitle>
            <AlertDescription>{errorMsg ?? 'Fallo desconocido'}</AlertDescription>
          </Alert>
        )}
      </DialogContent>
    </Dialog>
  );
}
