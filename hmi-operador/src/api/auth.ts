import { apiRequest } from './client';
import type {
  LoginRequest,
  LoginResponse,
  Fido2BeginResponse,
  Fido2CompleteRequest,
  Fido2CompleteResponse,
} from '@/types/api';

export const authApi = {
  login(req: LoginRequest): Promise<LoginResponse> {
    return apiRequest<LoginResponse>('/auth/login', {
      method: 'POST',
      body: req,
      skipAuthRetry: true,
    });
  },

  fido2Begin(): Promise<Fido2BeginResponse> {
    return apiRequest<Fido2BeginResponse>('/auth/fido2/begin', { method: 'POST' });
  },

  fido2Complete(req: Fido2CompleteRequest): Promise<Fido2CompleteResponse> {
    return apiRequest<Fido2CompleteResponse>('/auth/fido2/complete', {
      method: 'POST',
      body: req,
    });
  },

  logout(): Promise<void> {
    return apiRequest<void>('/auth/logout', { method: 'POST' });
  },
};
