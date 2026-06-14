import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      subtle: {
        digest: async (_alg: AlgorithmIdentifier, data: Uint8Array): Promise<ArrayBuffer> => {
          const buf = new Uint8Array(32);
          for (let i = 0; i < data.length; i++) buf[i % 32] = (buf[i % 32] ?? 0) ^ (data[i] ?? 0);
          return buf.buffer;
        },
      },
      getRandomValues: <T extends ArrayBufferView>(arr: T): T => {
        const u8 = new Uint8Array(arr.buffer);
        for (let i = 0; i < u8.length; i++) u8[i] = Math.floor(Math.random() * 256);
        return arr;
      },
      randomUUID: (): `${string}-${string}-${string}-${string}-${string}` => {
        return `test-uuid-${Math.random().toString(36).slice(2, 10)}-0000-0000-000000000000` as `${string}-${string}-${string}-${string}-${string}`;
      },
    },
    writable: true,
    configurable: true,
  });
}

globalThis.ResizeObserver =
  globalThis.ResizeObserver ??
  vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
