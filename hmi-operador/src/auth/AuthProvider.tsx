/**
 * Provider de autenticacion. Envuelve la app y expone helpers.
 * No persiste tokens en localStorage por diseno (estacion de operador).
 */
import { type ReactNode, useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useIdleLogout } from '@/hooks/useIdleLogout';
import { useNavigate } from 'react-router-dom';

interface Props {
  children: ReactNode;
}

export function AuthProvider({ children }: Props): JSX.Element {
  const navigate = useNavigate();
  const accessToken = useAuthStore((s) => s.accessToken);
  const expiresAt = useAuthStore((s) => s.expiresAt);

  useIdleLogout(() => {
    navigate('/login', { replace: true });
  });

  // Expira si el token caduca
  useEffect(() => {
    if (!expiresAt) return undefined;
    const delta = expiresAt - Date.now();
    if (delta <= 0) {
      useAuthStore.getState().clear();
      return undefined;
    }
    const timer = window.setTimeout(() => {
      useAuthStore.getState().clear();
    }, delta);
    return () => window.clearTimeout(timer);
  }, [expiresAt]);

  // Redirige a login si no hay token (excepto en /login)
  useEffect(() => {
    if (!accessToken && window.location.pathname !== '/login') {
      navigate('/login', { replace: true });
    }
  }, [accessToken, navigate]);

  return <>{children}</>;
}
