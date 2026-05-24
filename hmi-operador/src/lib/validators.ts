/**
 * Schemas Zod usados por formularios y respuestas WS.
 */
import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().min(2, 'Identificador muy corto').max(64),
  password: z.string().min(8, 'Minimo 8 caracteres').max(128),
});
export type LoginFormValues = z.infer<typeof loginSchema>;

export const pinSchema = z.object({
  pin: z
    .string()
    .regex(/^\d{6}$/, 'PIN debe ser 6 digitos'),
  reason: z.string().max(256).optional(),
});
export type PinFormValues = z.infer<typeof pinSchema>;

export const recommendationActionSchema = z.enum(['OBSERVE', 'TRACK', 'WARN', 'ENGAGE', 'ABORT']);

export const collateralRiskSchema = z.enum(['NEGLIGIBLE', 'LOW', 'MEDIUM', 'HIGH']);

export const authorizationLevelSchema = z.enum(['OPS-OFFICER', 'OFICIAL_TACTICO', 'JEFE_FUEGO']);

export const recommendationSchema = z.object({
  recommendation_id: z.string().optional(),
  track_id: z.string().regex(/^T-[0-9A-Za-z_-]{1,32}$/),
  recommendation: recommendationActionSchema,
  interceptors_proposed: z.array(z.string().regex(/^I-[0-9A-Za-z_-]{1,32}$/)).max(16),
  engagement_window: z.object({
    start_ms: z.number().int().nonnegative(),
    end_ms: z.number().int().nonnegative(),
  }),
  pk_estimated: z.number().min(0).max(1),
  collateral_risk: collateralRiskSchema,
  rationale: z.string().min(10).max(1024),
  operator_action_required: z.boolean(),
  authorization_level: authorizationLevelSchema,
  roe_version: z.string().optional(),
  policies_consulted: z.array(z.string()).optional(),
  issued_at_ms: z.number().int().optional(),
  status: z.enum(['PENDING', 'AUTHORIZED', 'REJECTED', 'DEFERRED', 'EXPIRED']).optional(),
});

/**
 * Hash SHA-256 de un PIN en base64. Evita enviar el PIN en claro al gateway.
 * El gateway re-hashea con sal + iteraciones (argon2 o pbkdf2 server-side).
 */
export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(pin);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}
