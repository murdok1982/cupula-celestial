/**
 * Cliente HTTP central. JWT en memoria (NUNCA localStorage para datos sensibles).
 * Maneja:
 *  - Inyeccion automatica de Authorization: Bearer
 *  - Reintento unico tras 401 via refresh token
 *  - Timeouts y AbortController
 *  - Cabeceras de seguridad (X-Requested-With, traza ID)
 */
import { env } from '@/env';

type TokenAccessor = {
  getAccessToken(): string | null;
  getRefreshToken(): string | null;
  setTokens(access: string, refresh?: string): void;
  clear(): void;
};

let accessor: TokenAccessor | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export function registerTokenAccessor(a: TokenAccessor): void {
  accessor = a;
}

function buildTraceId(): string {
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface RequestOptions {
  baseUrl?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Si true, no intenta refrescar token tras 401 (e.g. el propio refresh). */
  skipAuthRetry?: boolean;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function refreshToken(): Promise<string | null> {
  if (!accessor) return null;
  const refresh = accessor.getRefreshToken();
  if (!refresh) return null;
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${env.VITE_API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      if (!res.ok) {
        accessor?.clear();
        return null;
      }
      const json = (await res.json()) as { access_token: string; refresh_token?: string };
      accessor?.setTokens(json.access_token, json.refresh_token);
      return json.access_token;
    } catch {
      accessor?.clear();
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const base = options.baseUrl ?? env.VITE_API_BASE_URL;
  const url = `${base}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Requested-With': 'cupula-hmi',
    'X-Trace-Id': buildTraceId(),
    ...options.headers,
  };

  const token = accessor?.getAccessToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 10_000;
  const timeoutHandle = window.setTimeout(() => controller.abort(), timeoutMs);

  const signal = mergeSignals(controller.signal, options.signal);

  try {
    const res = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : null,
      credentials: 'omit',
      mode: 'cors',
      signal,
    });

    if (res.status === 401 && !options.skipAuthRetry) {
      const newToken = await refreshToken();
      if (newToken) {
        return apiRequest<T>(path, { ...options, skipAuthRetry: true });
      }
      accessor?.clear();
      throw new ApiError(401, 'UNAUTHENTICATED', 'Sesion expirada');
    }

    if (!res.ok) {
      let errBody: { code?: string; message?: string; details?: unknown } = {};
      try {
        errBody = await res.json();
      } catch {
        // ignore
      }
      throw new ApiError(
        res.status,
        errBody.code ?? `HTTP_${res.status}`,
        errBody.message ?? res.statusText,
        errBody.details,
      );
    }

    if (res.status === 204) return undefined as T;

    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      return (await res.json()) as T;
    }
    return (await res.text()) as unknown as T;
  } finally {
    window.clearTimeout(timeoutHandle);
  }
}

function mergeSignals(a: AbortSignal, b?: AbortSignal): AbortSignal {
  if (!b) return a;
  const controller = new AbortController();
  const onAbort = (): void => controller.abort();
  a.addEventListener('abort', onAbort, { once: true });
  b.addEventListener('abort', onAbort, { once: true });
  if (a.aborted || b.aborted) controller.abort();
  return controller.signal;
}
