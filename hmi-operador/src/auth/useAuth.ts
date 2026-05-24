import { useCallback } from 'react';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@/api/auth';
import type { LoginRequest, LoginResponse, OperatorIdentity } from '@/types/api';

export interface UseAuthApi {
  operator: OperatorIdentity | null;
  isAuthenticated: boolean;
  mfaSatisfied: boolean;
  login: (req: LoginRequest) => Promise<LoginResponse>;
  logout: () => Promise<void>;
}

export function useAuth(): UseAuthApi {
  const operator = useAuthStore((s) => s.operator);
  const isAuthenticated = useAuthStore((s) => Boolean(s.accessToken));
  const mfaSatisfied = useAuthStore((s) => s.mfaSatisfied);

  const login = useCallback(async (req: LoginRequest): Promise<LoginResponse> => {
    const res = await authApi.login(req);
    useAuthStore.getState().setTokens(res.access_token, res.refresh_token, res.expires_in);
    useAuthStore.getState().setOperator(res.operator);
    useAuthStore.getState().setMfaSatisfied(!res.requires_mfa);
    return res;
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await authApi.logout();
    } catch {
      // ignorar fallo de logout, igualmente limpiamos
    }
    useAuthStore.getState().clear();
  }, []);

  return {
    operator,
    isAuthenticated,
    mfaSatisfied,
    login,
    logout,
  };
}
