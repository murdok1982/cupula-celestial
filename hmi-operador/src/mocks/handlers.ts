/**
 * Handlers MSW: emula el hmi-gateway, audit-log, swarm-controller, decision-engine.
 */
import { http, HttpResponse } from 'msw';
import { env } from '@/env';
import {
  MOCK_OPERATOR,
  MOCK_TRACKS,
  MOCK_RECOMMENDATION,
  MOCK_INTERCEPTORS,
  MOCK_AUDIT_EVENTS,
  MOCK_CHAIN_VERIFY,
} from './mockData';
import type { LoginResponse, Fido2BeginResponse, Fido2CompleteResponse, EngagementAuthorizeResponse } from '@/types/api';

const API = env.VITE_API_BASE_URL;
const AUDIT = env.VITE_AUDIT_URL;
const SWARM = env.VITE_SWARM_URL;
const DECISION = env.VITE_DECISION_URL;

function token(): string {
  // JWT-shaped dummy
  return 'eyJhbGciOiJIUzI1NiJ9.' + btoa(JSON.stringify({ sub: MOCK_OPERATOR.operator_id, iat: Date.now() })) + '.mock';
}

export const handlers = [
  // ===== AUTH =====
  http.post(`${API}/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { username: string; password: string };
    // Acepta cualquier credencial >= 8 chars en mock
    if (!body.password || body.password.length < 8) {
      return HttpResponse.json({ code: 'INVALID_CREDS', message: 'Credenciales invalidas' }, { status: 401 });
    }
    const resp: LoginResponse = {
      access_token: token(),
      refresh_token: 'mock-refresh-' + crypto.randomUUID(),
      expires_in: 900,
      requires_mfa: true,
      fido2_challenge: btoa('mock-challenge-' + Date.now()),
      operator: MOCK_OPERATOR,
    };
    return HttpResponse.json(resp);
  }),

  http.post(`${API}/auth/fido2/begin`, async () => {
    const resp: Fido2BeginResponse = {
      challenge: btoa('mock-fido2-challenge-' + Date.now()),
      rp_id: 'cupula.defensa.gob.es',
      user_verification: 'required',
      timeout_ms: 30000,
      allow_credentials: [{ id: btoa('mock-credential-id'), type: 'public-key' }],
    };
    return HttpResponse.json(resp);
  }),

  http.post(`${API}/auth/fido2/complete`, async () => {
    const resp: Fido2CompleteResponse = {
      access_token: token(),
      mfa_satisfied: true,
      expires_in: 900,
    };
    return HttpResponse.json(resp);
  }),

  http.post(`${API}/auth/refresh`, async () => {
    return HttpResponse.json({ access_token: token(), refresh_token: 'mock-refresh-rotated' });
  }),

  http.post(`${API}/auth/logout`, async () => HttpResponse.json({ ok: true })),

  // ===== TRACKS =====
  http.get(`${API}/v1/tracks`, () => HttpResponse.json(MOCK_TRACKS)),
  http.get(`${API}/v1/tracks/:id`, ({ params }) => {
    const t = MOCK_TRACKS.find((x) => x.track_id === params.id);
    return t ? HttpResponse.json(t) : HttpResponse.json({ code: 'NOT_FOUND' }, { status: 404 });
  }),

  // ===== RECOMMENDATIONS =====
  http.get(`${API}/v1/recommendations`, () => HttpResponse.json([MOCK_RECOMMENDATION])),

  http.post(`${DECISION}/v1/recommend`, async () => HttpResponse.json(MOCK_RECOMMENDATION)),

  // ===== ENGAGEMENT =====
  http.post(`${API}/engagement/authorize`, async ({ request }) => {
    const body = (await request.json()) as { recommendation_id: string; decision: string };
    const resp: EngagementAuthorizeResponse = {
      authorized: body.decision === 'AUTHORIZE',
      recommendation_id: body.recommendation_id,
      publish_topic: 'cupula.engagement.cmd',
      audit_event_id: 'evt-' + crypto.randomUUID(),
      ts_ms: Date.now(),
    };
    return HttpResponse.json(resp);
  }),

  // ===== AUDIT =====
  http.get(`${AUDIT}/v1/events`, ({ request }) => {
    const url = new URL(request.url);
    const fromSeq = Number.parseInt(url.searchParams.get('from_seq') ?? '0', 10);
    const limit = Number.parseInt(url.searchParams.get('limit') ?? '50', 10);
    const filtered = MOCK_AUDIT_EVENTS.filter((e) => e.seq > fromSeq).slice(0, limit);
    return HttpResponse.json({ events: filtered, total: MOCK_AUDIT_EVENTS.length });
  }),

  http.get(`${AUDIT}/v1/verify_chain`, () => HttpResponse.json(MOCK_CHAIN_VERIFY)),

  // ===== INTERCEPTORS / SWARM =====
  http.get(`${SWARM}/v1/interceptors`, () => HttpResponse.json(MOCK_INTERCEPTORS)),
  http.post(`${SWARM}/v1/wta/assign`, async () => HttpResponse.json({ ok: true })),
  http.post(`${SWARM}/v1/command/engage`, async () => HttpResponse.json({ ok: true })),
];
