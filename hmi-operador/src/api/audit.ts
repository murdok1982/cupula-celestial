import { apiRequest } from './client';
import { env } from '@/env';
import type { AuditEvent, ChainVerifyResult } from '@/types/audit';

export const auditApi = {
  events(params?: { from_seq?: number; limit?: number }): Promise<{ events: AuditEvent[]; total: number }> {
    const q = new URLSearchParams();
    if (params?.from_seq !== undefined) q.set('from_seq', String(params.from_seq));
    if (params?.limit !== undefined) q.set('limit', String(params.limit));
    const qs = q.toString();
    return apiRequest<{ events: AuditEvent[]; total: number }>(
      `/v1/events${qs ? '?' + qs : ''}`,
      { baseUrl: env.VITE_AUDIT_URL },
    );
  },
  verifyChain(): Promise<ChainVerifyResult> {
    return apiRequest<ChainVerifyResult>('/v1/verify_chain', {
      baseUrl: env.VITE_AUDIT_URL,
    });
  },
};
