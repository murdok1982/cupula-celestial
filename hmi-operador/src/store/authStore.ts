/**
 * Store de autenticacion. JWT VIVE SOLO EN MEMORIA (no localStorage).
 * Cuando el operador refresca la pagina debe re-autenticar. Esto es
 * por diseno: una estacion de operador C-UAS no debe persistir tokens.
 *
 * El refresh_token se guarda en memoria igualmente. En produccion seria
 * httpOnly cookie SameSite=Strict gestionada por el hmi-gateway.
 */
import { create } from 'zustand';
import type { OperatorIdentity } from '@/types/api';
import { registerTokenAccessor } from '@/api/client';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  mfaSatisfied: boolean;
  operator: OperatorIdentity | null;
  expiresAt: number | null;
  setTokens(access: string, refresh?: string, expiresInSec?: number): void;
  setOperator(op: OperatorIdentity): void;
  setMfaSatisfied(v: boolean): void;
  clear(): void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  refreshToken: null,
  mfaSatisfied: false,
  operator: null,
  expiresAt: null,
  setTokens(access, refresh, expiresInSec): void {
    set((s) => ({
      accessToken: access,
      refreshToken: refresh ?? s.refreshToken,
      expiresAt: expiresInSec ? Date.now() + expiresInSec * 1000 : s.expiresAt,
    }));
  },
  setOperator(op): void {
    set({ operator: op });
  },
  setMfaSatisfied(v): void {
    set({ mfaSatisfied: v });
  },
  clear(): void {
    set({
      accessToken: null,
      refreshToken: null,
      mfaSatisfied: false,
      operator: null,
      expiresAt: null,
    });
  },
}));

// Conecta el accessor del cliente API
registerTokenAccessor({
  getAccessToken: () => useAuthStore.getState().accessToken,
  getRefreshToken: () => useAuthStore.getState().refreshToken,
  setTokens: (access, refresh) => useAuthStore.getState().setTokens(access, refresh),
  clear: () => useAuthStore.getState().clear(),
});
