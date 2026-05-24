/**
 * Auto-logout por inactividad. Eventos considerados: pointer, key, focus.
 */
import { useEffect } from 'react';
import { env } from '@/env';
import { useAuthStore } from '@/store/authStore';

const EVENTS: (keyof WindowEventMap)[] = ['mousedown', 'keydown', 'wheel', 'touchstart'];

export function useIdleLogout(onIdle?: () => void): void {
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!accessToken) return undefined;
    let timer = window.setTimeout(handleIdle, env.VITE_IDLE_TIMEOUT_MS);

    function reset(): void {
      window.clearTimeout(timer);
      timer = window.setTimeout(handleIdle, env.VITE_IDLE_TIMEOUT_MS);
    }
    function handleIdle(): void {
      useAuthStore.getState().clear();
      onIdle?.();
    }

    for (const ev of EVENTS) window.addEventListener(ev, reset, { passive: true });
    return () => {
      window.clearTimeout(timer);
      for (const ev of EVENTS) window.removeEventListener(ev, reset);
    };
  }, [accessToken, onIdle]);
}
