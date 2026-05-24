import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

// Mock crypto.subtle.digest si no esta disponible en happy-dom
if (!globalThis.crypto?.subtle) {
  // @ts-expect-error - test environment polyfill
  globalThis.crypto = {
    subtle: {
      digest: async (_alg: string, data: Uint8Array): Promise<ArrayBuffer> => {
        const buf = new Uint8Array(32);
        for (let i = 0; i < data.length; i++) buf[i % 32] ^= data[i] ?? 0;
        return buf.buffer;
      },
    },
    getRandomValues: <T extends ArrayBufferView>(arr: T): T => {
      const u8 = new Uint8Array(arr.buffer);
      for (let i = 0; i < u8.length; i++) u8[i] = Math.floor(Math.random() * 256);
      return arr;
    },
    randomUUID: () => 'test-uuid-' + Math.random().toString(36).slice(2),
  };
}

// Mock ResizeObserver (Cesium)
globalThis.ResizeObserver =
  globalThis.ResizeObserver ??
  vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
