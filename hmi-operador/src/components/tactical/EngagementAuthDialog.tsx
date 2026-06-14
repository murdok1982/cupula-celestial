import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>('pin');
  const [pinHash, setPinHash] = useState<string | null>(null);
  const [reason, setReason] = useState<string | undefined>(undefined);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(env.VITE_AUTH_DIALOG_TIMEOUT_MS / 1000);

  const form = useForm<PinFormValues>({
    resolver: zodResolver(pinSchema),
    defaultValues: { pin: '', reason: '' },
  });

  useEffect(() => {
    if (open) {
      setStep('pin');
      setPinHash(null);
      setErrorMsg(null);
      setRemaining(env.VITE_AUTH_DIALOG_TIMEOUT_MS / 1000);
      form.reset({ pin: '', reason: '' });
    }
  }, [open, form]);

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
        setErrorMsg(t('engagement.missingPinOrDecision'));
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
        const err = e instanceof Error ? e.message : t('engagement.confirmError');
        setErrorMsg(err);
        setStep('error');
      }
    },
    [pinHash, decision, onConfirm, onClose, reason, t],
  );

  const decisionLabel = useMemo(() => {
    switch (decision) {
      case 'AUTHORIZE':
        return t('engagement.authorizeTitle');
      case 'REJECT':
        return t('engagement.rejectTitle');
      case 'DEFER':
        return t('engagement.deferTitle');
      default:
        return '';
    }
  }, [decision, t]);

  if (!recommendation || !decision) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-xl"
        hideClose
        onEscapeKeyDown={(e) => {
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
            {t('engagement.dualFactorDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="border border-border bg-bg-base rounded-md p-3 font-mono text-tactical-sm space-y-1">
          <div>
            <span className="text-text-muted">{t('engagement.track')}</span>{' '}
            <span className="text-text-primary font-bold">{recommendation.track_id}</span>
          </div>
          <div>
            <span className="text-text-muted">{t('engagement.llmAction')}</span>{' '}
            <span className="text-accent-cyan font-bold">
              {recommendationLabel(recommendation.recommendation)}
            </span>
          </div>
          <div>
            <span className="text-text-muted">{t('engagement.decision')}</span>{' '}
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
              <span className="text-text-muted">{t('engagement.interceptors')}</span>{' '}
              <span className="text-text-primary">
                {recommendation.interceptors_proposed.join(', ')}
              </span>
            </div>
          )}
        </div>

        <div
          className="flex items-center justify-between text-tactical-xs font-mono"
          aria-live="polite"
        >
          <span className="text-text-muted uppercase tracking-wider">{t('engagement.timeRemaining')}</span>
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
              <Label htmlFor="auth-pin">{t('engagement.pinLabel')}</Label>
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
                <Label htmlFor="auth-reason">{t('engagement.reasonLabel')}</Label>
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
                {t('actions.cancel')}
              </Button>
              <Button type="submit" variant="tactical" data-testid="auth-pin-submit">
                {t('engagement.continueMfa')}
              </Button>
            </DialogFooter>
          </form>
        )}

        {step === 'fido2' && (
          <div className="space-y-3">
            <Alert variant="info">
              <AlertTitle>{t('engagement.fido2Title')}</AlertTitle>
              <AlertDescription>
                {t('engagement.fido2Desc')}
              </AlertDescription>
            </Alert>
            <MfaFido2 autoStart onComplete={handleFido2Complete} />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>
                {t('actions.cancel')}
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'submitting' && (
          <Alert variant="info" aria-live="assertive">
            <AlertTitle>{t('engagement.processing')}</AlertTitle>
            <AlertDescription>{t('engagement.processingDesc')}</AlertDescription>
          </Alert>
        )}

        {step === 'error' && (
          <Alert variant="critical">
            <AlertTriangle />
            <AlertTitle>{t('engagement.authError')}</AlertTitle>
            <AlertDescription>{errorMsg ?? t('engagement.unknownError')}</AlertDescription>
          </Alert>
        )}
      </DialogContent>
    </Dialog>
  );
}
