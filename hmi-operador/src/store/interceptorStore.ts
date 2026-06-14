import { create } from 'zustand';
import type { Interceptor } from '@/types/interceptors';

interface InterceptorState {
  interceptors: Record<string, Interceptor>;
  upsertInterceptor(interceptor: Interceptor): void;
  upsertMany(interceptors: Interceptor[]): void;
  removeInterceptor(interceptorId: string): void;
  clear(): void;
}

export const useInterceptorStore = create<InterceptorState>((set) => ({
  interceptors: {},
  upsertInterceptor(interceptor): void {
    set((s) => ({
      interceptors: { ...s.interceptors, [interceptor.interceptor_id]: interceptor },
    }));
  },
  upsertMany(interceptors): void {
    set((s) => {
      const next = { ...s.interceptors };
      for (const i of interceptors) next[i.interceptor_id] = i;
      return { interceptors: next };
    });
  },
  removeInterceptor(interceptorId): void {
    set((s) => {
      const next = { ...s.interceptors };
      delete next[interceptorId];
      return { interceptors: next };
    });
  },
  clear(): void {
    set({ interceptors: {} });
  },
}));

export const selectAllInterceptors = (s: InterceptorState): Interceptor[] =>
  Object.values(s.interceptors);

export const selectActiveInterceptors = (s: InterceptorState): Interceptor[] =>
  Object.values(s.interceptors).filter(
    (i) => i.status !== 'IDLE' && i.status !== 'DESTROYED' && i.status !== 'LOST',
  );
