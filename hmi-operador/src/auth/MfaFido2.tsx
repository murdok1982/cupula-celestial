/**
 * Componente de MFA FIDO2/WebAuthn.
 * En entorno de desarrollo (sin authenticator), simula la assertion.
 * En produccion usa navigator.credentials.get().
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { authApi } from '@/api/auth';
import { env } from '@/env';
import type { Fido2CompleteRequest } from '@/types/api';
import { KeyRound, Loader2, ShieldCheck, ShieldAlert } from 'lucide-react';

interface Props {
  onComplete: (assertion: Fido2CompleteRequest) => void;
  onError?: (err: Error) => void;
  /** Si true, se autoarranca al montar. */
  autoStart?: boolean;
}

type Phase = 'idle' | 'requesting' | 'waiting' | 'completing' | 'done' | 'error';

function bufToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function b64ToBuf(b64: string): ArrayBuffer {
  // base64url -> base64
  const norm = b64.replace(/-/g, '+').replace(/_/g, '/');
  const padded = norm.padEnd(norm.length + ((4 - (norm.length % 4)) % 4), '=');
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export function MfaFido2({ onComplete, onError, autoStart = false }: Props): JSX.Element {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);

  const startAuth = useCallback(async () => {
    setError(null);
    setPhase('requesting');
    try {
      const begin = await authApi.fido2Begin();
      setPhase('waiting');

      let assertion: Fido2CompleteRequest;

      // Si estamos en mocks o no hay PublicKeyCredential, generamos stub
      const hasWebAuthn = typeof window.PublicKeyCredential !== 'undefined';
      if (env.VITE_USE_MOCKS || !hasWebAuthn) {
        // Stub deterministic - el backend mock lo aceptara
        await new Promise((r) => setTimeout(r, 800));
        assertion = {
          challenge: begin.challenge,
          credential_id: 'mock-credential-id',
          signature: 'mock-signature',
          authenticator_data: 'mock-auth-data',
          client_data_json: btoa(JSON.stringify({ type: 'webauthn.get', challenge: begin.challenge })),
        };
      } else {
        const publicKey: PublicKeyCredentialRequestOptions = {
          challenge: new Uint8Array(b64ToBuf(begin.challenge)) as BufferSource,
          rpId: begin.rp_id,
          timeout: begin.timeout_ms,
          userVerification: begin.user_verification,
          allowCredentials: begin.allow_credentials.map((c) => ({
            id: new Uint8Array(b64ToBuf(c.id)) as BufferSource,
            type: 'public-key',
          })),
        };
        const credential = (await navigator.credentials.get({ publicKey })) as
          | PublicKeyCredential
          | null;

        if (!credential) throw new Error('No se obtuvo assertion del authenticator');
        const resp = credential.response as AuthenticatorAssertionResponse;
        assertion = {
          challenge: begin.challenge,
          credential_id: bufToB64(credential.rawId),
          signature: bufToB64(resp.signature),
          authenticator_data: bufToB64(resp.authenticatorData),
          client_data_json: bufToB64(resp.clientDataJSON),
        };
      }

      setPhase('completing');
      onComplete(assertion);
      setPhase('done');
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err.message);
      setPhase('error');
      onError?.(err);
    }
  }, [onComplete, onError]);

  // autoStart en efecto, no en render
  const startedRef = useRef(false);
  useEffect(() => {
    if (autoStart && !startedRef.current) {
      startedRef.current = true;
      void startAuth();
    }
  }, [autoStart, startAuth]);

  return (
    <div className="flex flex-col gap-3" role="region" aria-label="Autenticacion FIDO2">
      <div className="flex items-center gap-3 text-text-secondary">
        {phase === 'requesting' || phase === 'completing' ? (
          <Loader2 className="h-5 w-5 animate-spin text-accent-cyan" aria-hidden />
        ) : phase === 'error' ? (
          <ShieldAlert className="h-5 w-5 text-threat-hostile" aria-hidden />
        ) : phase === 'done' ? (
          <ShieldCheck className="h-5 w-5 text-threat-neutral" aria-hidden />
        ) : (
          <KeyRound className="h-5 w-5 text-accent-cyan" aria-hidden />
        )}
        <span className="font-mono text-tactical-sm">
          {phase === 'idle' && 'Pulse el token fisico o use la huella biometrica.'}
          {phase === 'requesting' && 'Solicitando challenge al gateway...'}
          {phase === 'waiting' && 'Esperando confirmacion del authenticator...'}
          {phase === 'completing' && 'Validando firma...'}
          {phase === 'done' && 'Authenticator validado correctamente.'}
          {phase === 'error' && (error ?? 'Error en MFA')}
        </span>
      </div>

      {phase !== 'done' && (
        <Button
          type="button"
          variant="tactical"
          onClick={startAuth}
          disabled={phase === 'requesting' || phase === 'waiting' || phase === 'completing'}
          data-testid="mfa-start"
        >
          {phase === 'error' ? 'Reintentar MFA' : 'Iniciar MFA'}
        </Button>
      )}
    </div>
  );
}
