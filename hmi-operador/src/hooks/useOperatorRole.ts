/**
 * Hooks de permisos del operador.
 *
 * El sistema soporta 4 roles con jerarquia ascendente. Cada recomendacion
 * del decision-engine incluye `authorization_level`, que indica el nivel
 * MINIMO requerido para autorizar (OPS-OFFICER | OFICIAL_TACTICO | JEFE_FUEGO).
 *
 * Mapeo nivel-de-recomendacion -> rol-minimo:
 *   OPS-OFFICER     -> OPERADOR (rank >= 2)
 *   OFICIAL_TACTICO -> OFICIAL_TACTICO (rank >= 3)
 *   JEFE_FUEGO      -> JEFE_FUEGO (rank >= 4)
 *
 * VIGILANTE es read-only en todo momento.
 */
import { useAuthStore } from '@/store/authStore';
import type { OperatorRole } from '@/types/api';
import type { AuthorizationLevel } from '@/types/recommendations';

const ROLE_RANK: Record<OperatorRole, number> = {
  VIGILANTE: 1,
  OPERADOR: 2,
  OFICIAL_TACTICO: 3,
  JEFE_FUEGO: 4,
};

const LEVEL_MIN_RANK: Record<AuthorizationLevel, number> = {
  'OPS-OFFICER': ROLE_RANK.OPERADOR,
  OFICIAL_TACTICO: ROLE_RANK.OFICIAL_TACTICO,
  JEFE_FUEGO: ROLE_RANK.JEFE_FUEGO,
};

/**
 * True si el operador tiene permisos generales de autorizacion (>= OPERADOR)
 * y ya supero el MFA en la sesion actual.
 */
export function useCanAuthorize(): boolean {
  const role = useAuthStore((s) => s.operator?.role);
  const mfa = useAuthStore((s) => s.mfaSatisfied);
  if (!role || !mfa) return false;
  return ROLE_RANK[role] >= ROLE_RANK.OPERADOR;
}

/**
 * True si el operador puede autorizar el nivel de recomendacion concreto.
 */
export function useCanAuthorizeLevel(level: AuthorizationLevel | null | undefined): boolean {
  const role = useAuthStore((s) => s.operator?.role);
  const mfa = useAuthStore((s) => s.mfaSatisfied);
  if (!role || !mfa || !level) return false;
  return ROLE_RANK[role] >= LEVEL_MIN_RANK[level];
}

export function useIsCommander(): boolean {
  const role = useAuthStore((s) => s.operator?.role);
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK.JEFE_FUEGO;
}

export function useOperatorRole(): OperatorRole | null {
  return useAuthStore((s) => s.operator?.role ?? null);
}
