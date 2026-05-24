import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Shield, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { MfaFido2 } from '@/auth/MfaFido2';
import { useAuth } from '@/auth/useAuth';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/store/authStore';
import { loginSchema, type LoginFormValues } from '@/lib/validators';
import { formatZulu } from '@/lib/time';
import type { Fido2CompleteRequest } from '@/types/api';

export function LoginPage(): JSX.Element {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { login } = useAuth();
  const [step, setStep] = useState<'creds' | 'mfa'>('creds');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  });

  async function onSubmit(values: LoginFormValues): Promise<void> {
    setError(null);
    setSubmitting(true);
    try {
      const res = await login(values);
      if (res.requires_mfa) {
        setStep('mfa');
      } else {
        navigate('/dashboard', { replace: true });
      }
    } catch (e) {
      setError(t('login.error'));
      // eslint-disable-next-line no-console
      console.warn('Login fallido', e);
    } finally {
      setSubmitting(false);
    }
  }

  async function onMfaComplete(assertion: Fido2CompleteRequest): Promise<void> {
    setError(null);
    try {
      const res = await authApi.fido2Complete(assertion);
      useAuthStore.getState().setTokens(res.access_token, undefined, res.expires_in);
      useAuthStore.getState().setMfaSatisfied(true);
      navigate('/dashboard', { replace: true });
    } catch (e) {
      setError(t('login.error'));
      // eslint-disable-next-line no-console
      console.warn('MFA fallido', e);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-base p-6 relative overflow-hidden">
      {/* Patron scan line decorativo */}
      <div
        className="absolute inset-0 pointer-events-none opacity-10"
        aria-hidden
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, #00d4ff 2px, #00d4ff 3px)',
        }}
      />
      <Card className="w-full max-w-md relative">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Shield className="h-8 w-8 text-accent-cyan" aria-hidden />
          </div>
          <CardTitle className="text-lg">{t('login.title')}</CardTitle>
          <p className="text-tactical-xs text-text-muted font-mono">{t('login.subtitle')}</p>
          <p className="text-tactical-xs text-text-muted font-mono">{formatZulu()}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="critical" data-testid="login-error">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {step === 'creds' && (
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3" noValidate>
              <div className="space-y-1">
                <Label htmlFor="username">{t('login.username')}</Label>
                <Input
                  id="username"
                  type="text"
                  autoComplete="username"
                  data-testid="login-username"
                  {...form.register('username')}
                  aria-invalid={Boolean(form.formState.errors.username)}
                  autoFocus
                />
                {form.formState.errors.username && (
                  <p className="text-tactical-xs text-threat-hostile" role="alert">
                    {form.formState.errors.username.message}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="password">{t('login.password')}</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  data-testid="login-password"
                  {...form.register('password')}
                  aria-invalid={Boolean(form.formState.errors.password)}
                />
                {form.formState.errors.password && (
                  <p className="text-tactical-xs text-threat-hostile" role="alert">
                    {form.formState.errors.password.message}
                  </p>
                )}
              </div>
              <Button
                type="submit"
                variant="tactical"
                className="w-full"
                disabled={submitting}
                data-testid="login-submit"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    {t('login.submitting')}
                  </>
                ) : (
                  t('login.submit')
                )}
              </Button>
              <p className="text-tactical-xs text-text-muted text-center mt-2">{t('login.forgot')}</p>
            </form>
          )}

          {step === 'mfa' && (
            <div className="space-y-3">
              <Alert variant="info">
                <AlertTitle>{t('login.mfaTitle')}</AlertTitle>
                <AlertDescription>{t('login.mfaSubtitle')}</AlertDescription>
              </Alert>
              <MfaFido2 autoStart onComplete={(a) => void onMfaComplete(a)} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
