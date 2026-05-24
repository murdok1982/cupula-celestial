/**
 * Variables de entorno tipadas con validacion Zod.
 * Se invoca una sola vez al arranque. Cualquier valor incorrecto detiene la app
 * antes de que se monten paneles tacticos.
 */
import { z } from 'zod';

const envSchema = z.object({
  VITE_API_BASE_URL: z.string().url().default('http://127.0.0.1:8080'),
  VITE_WS_URL: z.string().min(1).default('ws://127.0.0.1:8080/ws'),
  VITE_AUDIT_URL: z.string().url().default('http://127.0.0.1:9300'),
  VITE_SWARM_URL: z.string().url().default('http://127.0.0.1:9200'),
  VITE_DECISION_URL: z.string().url().default('http://127.0.0.1:8002'),
  VITE_CESIUM_ION_TOKEN: z.string().default(''),
  VITE_USE_MOCKS: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  VITE_DEFAULT_LOCALE: z.enum(['es', 'en', 'fr']).default('es'),
  VITE_IDLE_TIMEOUT_MS: z
    .string()
    .default('600000')
    .transform((v) => Number.parseInt(v, 10)),
  VITE_AUTH_DIALOG_TIMEOUT_MS: z
    .string()
    .default('30000')
    .transform((v) => Number.parseInt(v, 10)),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  // Vite expone solo claves VITE_* al cliente. Aceptamos un Record amplio.
  const raw = import.meta.env as unknown as Record<string, string | undefined>;
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('[env] Variables invalidas:', parsed.error.flatten().fieldErrors);
    throw new Error('Configuracion de entorno invalida. Revise .env.local');
  }
  return parsed.data;
}

export const env: Env = loadEnv();
