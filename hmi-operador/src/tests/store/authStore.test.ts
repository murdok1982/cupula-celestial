import { describe, it, expect } from 'vitest';
import { useAuthStore } from '@/store/authStore';

describe('authStore', () => {
  it('stores JWT in memory', () => {
    const store = useAuthStore.getState();
    store.setTokens('access-123', 'refresh-456', 900);
    const state = useAuthStore.getState();
    expect(state.accessToken).toBe('access-123');
    expect(state.refreshToken).toBe('refresh-456');
    expect(state.expiresAt).toBeGreaterThan(Date.now());
  });

  it('clears tokens on logout', () => {
    const store = useAuthStore.getState();
    store.setTokens('access', 'refresh');
    store.clear();
    const state = useAuthStore.getState();
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(state.operator).toBeNull();
  });

  it('sets MFA satisfied', () => {
    useAuthStore.getState().setMfaSatisfied(true);
    expect(useAuthStore.getState().mfaSatisfied).toBe(true);
  });
});
