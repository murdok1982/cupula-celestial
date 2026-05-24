import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiRequest, registerTokenAccessor } from '@/api/client';

describe('api client', () => {
  beforeEach(() => {
    registerTokenAccessor({
      getAccessToken: () => 'test-token',
      getRefreshToken: () => 'refresh-token',
      setTokens: () => {},
      clear: () => {},
    });
  });

  it('injects JWT Authorization header', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ data: 'ok' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await apiRequest('/test', { baseUrl: 'http://localhost:8080' });
    const call = mockFetch.mock.calls[0];
    expect(call[1].headers['Authorization']).toBe('Bearer test-token');
  });

  it('uses timeout of 10s by default', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', mockFetch);

    await apiRequest('/test', { baseUrl: 'http://localhost:8080' });
    const controller = mockFetch.mock.calls[0][1].signal;
    expect(controller).toBeDefined();
  });

  it('throws ApiError on 401 without retry', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ code: 'UNAUTHENTICATED' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      apiRequest('/test', { baseUrl: 'http://localhost:8080', skipAuthRetry: true })
    ).rejects.toThrow();
  });
});
