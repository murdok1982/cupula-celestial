import { describe, it, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useIdleLogout } from '@/hooks/useIdleLogout';
import { useAuthStore } from '@/store/authStore';

vi.mock('@/env', () => ({
  env: { VITE_IDLE_TIMEOUT_MS: 50 },
}));

describe('useIdleLogout', () => {
  afterEach(() => {
    useAuthStore.getState().clear();
  });

  it('does nothing when not logged in', () => {
    const onIdle = vi.fn();
    renderHook(() => useIdleLogout(onIdle));
    vi.advanceTimersByTime(100);
  });
});
