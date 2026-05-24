import { apiRequest } from './client';
import type {
  EngagementAuthorizeRequest,
  EngagementAuthorizeResponse,
} from '@/types/api';

export const engagementApi = {
  authorize(req: EngagementAuthorizeRequest): Promise<EngagementAuthorizeResponse> {
    return apiRequest<EngagementAuthorizeResponse>('/engagement/authorize', {
      method: 'POST',
      body: req,
      timeoutMs: 8000,
    });
  },
};
